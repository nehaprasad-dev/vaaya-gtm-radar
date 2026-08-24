import { NextResponse } from "next/server";

import {
  companyBriefSchema,
  isRecordValue,
  parseCompanyBrief,
  parseMarketResults,
  type CompanyBrief,
  type MarketIntelligence,
} from "@/lib/company";
import { VaayaApiError, vaayaRun, type VaayaRunResponse } from "@/lib/vaaya";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 5;
const MAX_CRW_EXTRACTION_COST_CENTS = 10;
const MAX_FIRECRAWL_EXTRACTION_COST_CENTS = 8;
const MAX_MARKET_RESEARCH_COST_CENTS = 10;
const MAX_COMPETITOR_RESEARCH_COST_CENTS = 6;
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 20;
const MARKET_MAX_POLL_ATTEMPTS = 6;
const PARTIAL_CACHE_TTL_MS = 15 * 60 * 1000;

type AnalyzeRequest = {
  url?: unknown;
};

type CacheEntry = {
  expiresAt: number;
  response: AnalyzeSuccessResponse;
};

type AnalyzeSuccessResponse = {
  ok: true;
  requested_url: string;
  company: CompanyBrief;
  market: MarketIntelligence;
  market_error: string | null;
  evidence: unknown;
  charged_cents: number;
  balance_remaining_cents: number | null;
  cached: boolean;
  provider: {
    service: "crw" | "firecrawl";
    action: "extract";
  };
  market_provider: {
    service: "vaaya";
    action: "supersearch";
  };
};

const analysisCache = new Map<string, CacheEntry>();
const rateLimitBuckets = new Map<string, number[]>();

function parseCompanyUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getClientId(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function isRateLimited(clientId: string) {
  const now = Date.now();
  const recentRequests = (rateLimitBuckets.get(clientId) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_REQUESTS) {
    rateLimitBuckets.set(clientId, recentRequests);
    return true;
  }

  recentRequests.push(now);
  rateLimitBuckets.set(clientId, recentRequests);
  return false;
}

function getCached(url: string) {
  const entry = analysisCache.get(url);

  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    analysisCache.delete(url);
    return null;
  }

  return {
    ...entry.response,
    cached: true,
    charged_cents: 0,
  };
}

function findCompanyBrief(value: unknown, depth = 0): CompanyBrief | null {
  if (depth > 5) {
    return null;
  }

  const direct = parseCompanyBrief(value);

  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCompanyBrief(item, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isRecordValue(value)) {
    return null;
  }

  for (const key of ["results", "data", "result", "output", "extracted"]) {
    const found = findCompanyBrief(value[key], depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function findEvidence(value: unknown, depth = 0): unknown {
  if (depth > 5 || !value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEvidence(item, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isRecordValue(value)) {
    return null;
  }

  if (value.evidence) {
    return value.evidence;
  }

  for (const key of ["results", "data", "result", "output"]) {
    const found = findEvidence(value[key], depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function findJobId(value: unknown): string | null {
  if (!isRecordValue(value)) {
    return null;
  }

  const directId =
    typeof value.job_id === "string"
      ? value.job_id
      : typeof value.id === "string"
        ? value.id
        : null;

  if (directId && (value.async === true || value.status === "processing")) {
    return directId;
  }

  return isRecordValue(value.data) ? findJobId(value.data) : null;
}

function isFailedJob(value: unknown): boolean {
  if (!isRecordValue(value)) {
    return false;
  }

  if (value.status === "failed" || value.status === "cancelled") {
    return true;
  }

  return isRecordValue(value.data) ? isFailedJob(value.data) : false;
}

async function waitForExtraction(
  initial: VaayaRunResponse,
  service: "crw" | "firecrawl",
): Promise<{
  response: VaayaRunResponse;
  chargedCents: number;
  balanceRemainingCents: number | null;
}> {
  const jobId = findJobId(initial.data);
  let chargedCents = initial.charged_cents ?? 0;
  let balanceRemainingCents = initial.balance_remaining_cents ?? null;

  if (!jobId || findCompanyBrief(initial.data)) {
    return {
      response: initial,
      chargedCents,
      balanceRemainingCents,
    };
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await vaayaRun(service, "extract_status", {
      id: jobId,
    });
    chargedCents += statusResponse.charged_cents ?? 0;
    balanceRemainingCents =
      statusResponse.balance_remaining_cents ?? balanceRemainingCents;

    if (isFailedJob(statusResponse.data)) {
      throw new VaayaApiError("Company extraction job failed.", 502, statusResponse);
    }

    if (findCompanyBrief(statusResponse.data)) {
      return {
        response: statusResponse,
        chargedCents,
        balanceRemainingCents,
      };
    }
  }

  throw new VaayaApiError("Company extraction timed out.", 504);
}

async function runExtractionProvider(
  service: "crw" | "firecrawl",
  companyUrl: string,
) {
  const maxCostCents =
    service === "crw"
      ? MAX_CRW_EXTRACTION_COST_CENTS
      : MAX_FIRECRAWL_EXTRACTION_COST_CENTS;
  const initial = await vaayaRun(service, "extract", {
    urls: [companyUrl],
    schema: companyBriefSchema,
    basis: true,
    max_context_chars: 12000,
  }, {
    maxCostCents,
  });
  const settled = await waitForExtraction(initial, service);
  const company = findCompanyBrief(settled.response.data);

  if (!company) {
    throw new VaayaApiError(
      `${service} completed but returned no structured company brief.`,
      502,
      settled.response,
    );
  }

  return {
    company,
    settled,
    provider: service,
  };
}

async function analyzeWithFallback(companyUrl: string) {
  try {
    return await runExtractionProvider("crw", companyUrl);
  } catch (error) {
    if (
      !(error instanceof VaayaApiError) ||
      (error.status !== 502 && error.status !== 504)
    ) {
      throw error;
    }

    console.warn(
      "CRW extraction failed; trying Firecrawl fallback",
      JSON.stringify(
        { status: error.status, response: error.response },
        null,
        2,
      ),
    );

    return runExtractionProvider("firecrawl", companyUrl);
  }
}

function findJobStatus(value: unknown): string | null {
  if (!isRecordValue(value)) {
    return null;
  }

  if (typeof value.status === "string") {
    return value.status.toLowerCase();
  }

  return isRecordValue(value.data) ? findJobStatus(value.data) : null;
}

async function runSignalResearch(company: CompanyBrief) {
  const industry = company.industry ?? "its market";
  const query = [
    `${company.company_name} industry: "${industry}".`,
    "Find up to 5 recent material company or market signals, including",
    "funding, launches, hiring, partnerships, regulation, or major news.",
    "Do not invent facts or URLs.",
  ].join(" ");
  let response = await vaayaRun("vaaya", "supersearch", {
    query,
    facets: ["news", "web"],
    timeCritical: false,
    fidelityRequired: true,
    recencyDays: 30,
    maxResults: 10,
  }, {
    maxCostCents: MAX_MARKET_RESEARCH_COST_CENTS,
  });
  let chargedCents = response.charged_cents ?? 0;
  let balanceRemainingCents = response.balance_remaining_cents ?? null;
  const jobId = findJobId(response.data);

  if (jobId) {
    for (let attempt = 0; attempt < MARKET_MAX_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      response = await vaayaRun("vaaya", "result", { job_id: jobId });
      chargedCents += response.charged_cents ?? 0;
      balanceRemainingCents =
        response.balance_remaining_cents ?? balanceRemainingCents;

      const status = findJobStatus(response.data);

      if (status === "failed" || status === "cancelled") {
        throw new VaayaApiError("Market research job failed.", 502, response);
      }

      if (status === "completed" || status === "succeeded") {
        break;
      }
    }
  }

  return {
    market: parseMarketResults(response.data),
    chargedCents,
    balanceRemainingCents,
    raw: response.data,
  };
}

async function runCompetitorResearch(
  company: CompanyBrief,
  companyUrl: string,
) {
  const domain = new URL(companyUrl).hostname.replace(/^www\./, "");
  const response = await vaayaRun("openfunnel", "lookalikes", {
    seed_domains: [domain],
    query: `Companies like ${company.company_name} in ${company.industry ?? "its industry"}`,
    limit: 5,
  }, {
    maxCostCents: MAX_COMPETITOR_RESEARCH_COST_CENTS,
  });

  return {
    market: parseMarketResults(response.data),
    chargedCents: response.charged_cents ?? 0,
    balanceRemainingCents: response.balance_remaining_cents ?? null,
    raw: response.data,
  };
}

async function runMarketResearch(
  company: CompanyBrief,
  companyUrl: string,
) {
  const [signalResult, competitorResult] = await Promise.allSettled([
    runSignalResearch(company),
    runCompetitorResearch(company, companyUrl),
  ]);
  const market: MarketIntelligence = {
    signals: [],
    competitors: [],
  };
  const errors: string[] = [];
  let chargedCents = 0;
  let balanceRemainingCents: number | null = null;
  const raw: Record<string, unknown> = {};

  if (signalResult.status === "fulfilled") {
    market.signals = signalResult.value.market.signals;
    chargedCents += signalResult.value.chargedCents;
    balanceRemainingCents = signalResult.value.balanceRemainingCents;
    raw.signals = signalResult.value.raw;
  } else {
    errors.push("Recent signals are temporarily unavailable.");
    raw.signal_error =
      signalResult.reason instanceof VaayaApiError
        ? signalResult.reason.response
        : String(signalResult.reason);
  }

  if (competitorResult.status === "fulfilled") {
    market.competitors = competitorResult.value.market.competitors;
    chargedCents += competitorResult.value.chargedCents;
    balanceRemainingCents =
      competitorResult.value.balanceRemainingCents ?? balanceRemainingCents;
    raw.competitors = competitorResult.value.raw;
  } else {
    errors.push("Competitor discovery is temporarily unavailable.");
    raw.competitor_error =
      competitorResult.reason instanceof VaayaApiError
        ? competitorResult.reason.response
        : String(competitorResult.reason);
  }

  return {
    market,
    errors,
    chargedCents,
    balanceRemainingCents,
    raw,
  };
}

export async function POST(request: Request) {
  let body: AnalyzeRequest;

  try {
    body = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Send JSON with a company URL." },
      { status: 400 },
    );
  }

  const companyUrl = parseCompanyUrl(body.url);

  if (!companyUrl) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid public company URL." },
      { status: 400 },
    );
  }

  const cachedResponse = getCached(companyUrl);

  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
  }

  if (isRateLimited(getClientId(request))) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many analyses. Wait one minute before trying again.",
      },
      { status: 429 },
    );
  }

  try {
    const analysis = await analyzeWithFallback(companyUrl);
    const { company, settled } = analysis;
    let market: MarketIntelligence = {
      signals: [],
      competitors: [],
    };
    let marketError: string | null = null;
    let marketChargedCents = 0;
    let balanceRemainingCents = settled.balanceRemainingCents;

    try {
      const marketResearch = await runMarketResearch(company, companyUrl);
      market = marketResearch.market;
      marketChargedCents = marketResearch.chargedCents;
      balanceRemainingCents =
        marketResearch.balanceRemainingCents ?? balanceRemainingCents;

      if (marketResearch.errors.length) {
        marketError = marketResearch.errors.join(" ");
        console.warn(
          "Vaaya market research completed partially",
          JSON.stringify(marketResearch.raw, null, 2),
        );
      } else if (!market.signals.length && !market.competitors.length) {
        marketError = "No cited market results were returned.";
        console.warn(
          "Vaaya market research returned no normalized results",
          JSON.stringify(marketResearch.raw, null, 2),
        );
      }
    } catch (marketResearchError) {
      marketError = "Live market research is temporarily unavailable.";
      console.error(
        "Vaaya market research failed",
        marketResearchError instanceof VaayaApiError
          ? JSON.stringify(
              {
                status: marketResearchError.status,
                response: marketResearchError.response,
              },
              null,
              2,
            )
          : marketResearchError,
      );
    }

    const response: AnalyzeSuccessResponse = {
      ok: true,
      requested_url: companyUrl,
      company,
      market,
      market_error: marketError,
      evidence: findEvidence(settled.response.data),
      charged_cents: settled.chargedCents + marketChargedCents,
      balance_remaining_cents: balanceRemainingCents,
      cached: false,
      provider: {
        service: analysis.provider,
        action: "extract",
      },
      market_provider: {
        service: "vaaya",
        action: "supersearch",
      },
    };

    analysisCache.set(companyUrl, {
      expiresAt:
        Date.now() + (marketError ? PARTIAL_CACHE_TTL_MS : CACHE_TTL_MS),
      response,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof VaayaApiError) {
      console.error(
        "Vaaya company analysis failed",
        JSON.stringify(
          { status: error.status, response: error.response },
          null,
          2,
        ),
      );

      const message =
        error.status === 401
          ? "The Vaaya API key is missing or invalid."
          : error.status === 504
            ? "Company research took too long. Please try again."
            : "Could not build a company brief from this website.";

      return NextResponse.json(
        {
          ok: false,
          error: message,
          status: error.status,
          details:
            process.env.NODE_ENV === "development" ? error.response ?? null : null,
        },
        { status: error.status === 401 ? 401 : 502 },
      );
    }

    console.error("Unexpected company analysis failure", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong while analyzing the company." },
      { status: 500 },
    );
  }
}
