import { NextResponse } from "next/server";

import {
  companyBriefFromScrape,
  companyBriefSchema,
  enrichMarketIntelligence,
  fillCompanyFromScrape,
  findScrapeHtml,
  findScrapeMarkdown,
  inferDepartmentsFromPeople,
  isRecordValue,
  parseAktaCompany,
  parseCompanyBrief,
  parseMarketResults,
  mergeAktaIntoCompany,
  mergeAktaPeople,
  mergeEnrichedPeople,
  parsePeopleCandidates,
  personBelongsToCompany,
  type CompanyBrief,
  type MarketIntelligence,
  type RelevantPerson,
  type VendorUsed,
} from "@/lib/company";
import { VaayaApiError, vaayaRun, type VaayaRunResponse } from "@/lib/vaaya";

export const maxDuration = 300;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 5;
const MAX_CRW_EXTRACTION_COST_CENTS = 12;
const MAX_MARKET_RESEARCH_COST_CENTS = 10;
const MAX_COMPETITOR_RESEARCH_COST_CENTS = 6;
const MAX_PEOPLE_DISCOVERY_COST_CENTS = 2;
const MAX_PEOPLE_ENRICHMENT_COST_CENTS = 60;
const MAX_CONTACT_FALLBACK_COST_CENTS = 10;
const MAX_AKTA_COST_CENTS = 150;
const MAX_EXA_SEARCH_COST_CENTS = 3;
const MAX_FIRECRAWL_SCRAPE_COST_CENTS = 6;
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 20;
const MARKET_MAX_POLL_ATTEMPTS = 6;
const PEOPLE_MAX_POLL_ATTEMPTS = 24;
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
  people: RelevantPerson[];
  people_error: string | null;
  akta_error: string | null;
  vendors: VendorUsed[];
  evidence: unknown;
  charged_cents: number;
  balance_remaining_cents: number | null;
  cached: boolean;
  provider: {
    service: "crw" | "firecrawl";
    action: "extract";
  };
  market_provider: {
    service: "exa";
    action: "search";
  };
  people_provider: {
    discovery: "vaaya/onefind";
    enrichment: "vaaya/onefind-deep";
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

async function runCrwUrlExtract(companyUrl: string) {
  const initial = await vaayaRun(
    "crw",
    "extract",
    {
      urls: [companyUrl],
      schema: companyBriefSchema,
      basis: true,
      max_context_chars: 12000,
      timeout_ms: 45000,
    },
    {
      maxCostCents: MAX_CRW_EXTRACTION_COST_CENTS,
    },
  );
  const settled = await waitForExtraction(initial, "crw");
  const company = findCompanyBrief(settled.response.data);

  if (!company) {
    throw new VaayaApiError(
      "crw completed but returned no structured company brief.",
      502,
      settled.response,
    );
  }

  return {
    company,
    settled,
    provider: "crw" as const,
    scrapeMarkdown: null as string | null,
  };
}

async function runScrapeThenExtract(companyUrl: string) {
  const scrape = await vaayaRun(
    "firecrawl",
    "scrape",
    {
      url: companyUrl,
      formats: ["markdown", "html"],
      onlyMainContent: true,
      waitFor: 2000,
    },
    {
      maxCostCents: MAX_FIRECRAWL_SCRAPE_COST_CENTS,
    },
  );

  const markdown = findScrapeMarkdown(scrape.data);
  const html = findScrapeHtml(scrape.data);
  let chargedCents = scrape.charged_cents ?? 0;
  let balanceRemainingCents = scrape.balance_remaining_cents ?? null;

  if (html && html.length >= 500) {
    try {
      const initial = await vaayaRun(
        "crw",
        "extract",
        {
          htmls: [html.slice(0, 120000)],
          schema: companyBriefSchema,
          basis: true,
          max_context_chars: 12000,
          timeout_ms: 45000,
        },
        {
          maxCostCents: MAX_CRW_EXTRACTION_COST_CENTS,
        },
      );
      const settled = await waitForExtraction(initial, "crw");
      chargedCents += settled.chargedCents;
      balanceRemainingCents =
        settled.balanceRemainingCents ?? balanceRemainingCents;
      const company = findCompanyBrief(settled.response.data);

      if (company) {
        return {
          company: fillCompanyFromScrape(company, markdown, companyUrl),
          settled: {
            response: settled.response,
            chargedCents,
            balanceRemainingCents,
          },
          provider: "firecrawl" as const,
          scrapeMarkdown: markdown,
        };
      }
    } catch (error) {
      console.warn(
        "CRW extract-from-html failed; using scrape brief",
        error instanceof VaayaApiError
          ? JSON.stringify(
              { status: error.status, response: error.response },
              null,
              2,
            )
          : error,
      );
    }
  }

  if (!markdown || markdown.length < 120) {
    throw new VaayaApiError(
      "Could not scrape enough page content for a company brief.",
      502,
      scrape,
    );
  }

  return {
    company: companyBriefFromScrape(companyUrl, markdown),
    settled: {
      response: scrape,
      chargedCents,
      balanceRemainingCents,
    },
    provider: "firecrawl" as const,
    scrapeMarkdown: markdown,
  };
}

async function analyzeWithFallback(companyUrl: string) {
  try {
    return await runCrwUrlExtract(companyUrl);
  } catch (error) {
    console.warn(
      "CRW URL extract failed; trying Firecrawl scrape + CRW html extract",
      error instanceof VaayaApiError
        ? JSON.stringify(
            { status: error.status, response: error.response },
            null,
            2,
          )
        : error,
    );

    return runScrapeThenExtract(companyUrl);
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

async function runExaSearch(company: CompanyBrief) {
  const query = `${company.company_name} recent news OR funding OR hiring OR launch`;
  const response = await vaayaRun("exa", "search", {
    query,
    type: "auto",
    numResults: 8,
    contents: { text: false },
  }, {
    maxCostCents: MAX_EXA_SEARCH_COST_CENTS,
  });

  return {
    market: parseMarketResults(response.data),
    chargedCents: response.charged_cents ?? 0,
    balanceRemainingCents: response.balance_remaining_cents ?? null,
    raw: response.data,
  };
}

async function runHomepageScrape(companyUrl: string) {
  const response = await vaayaRun("firecrawl", "scrape", {
    url: companyUrl,
    formats: ["markdown"],
    onlyMainContent: true,
    waitFor: 1500,
  }, {
    maxCostCents: MAX_FIRECRAWL_SCRAPE_COST_CENTS,
  });

  return {
    markdown: findScrapeMarkdown(response.data),
    chargedCents: response.charged_cents ?? 0,
    balanceRemainingCents: response.balance_remaining_cents ?? null,
  };
}

async function runMarketResearch(
  company: CompanyBrief,
  companyUrl: string,
) {
  const [signalResult, competitorResult, exaResult] = await Promise.allSettled([
    runSignalResearch(company),
    runCompetitorResearch(company, companyUrl),
    runExaSearch(company),
  ]);
  const market: MarketIntelligence = {
    signals: [],
    competitors: [],
    positioning: null,
    recent_activity: [],
  };
  const errors: string[] = [];
  let chargedCents = 0;
  let balanceRemainingCents: number | null = null;
  const raw: Record<string, unknown> = {};
  const usedExa = exaResult.status === "fulfilled";

  if (signalResult.status === "fulfilled") {
    market.signals = signalResult.value.market.signals;
    chargedCents += signalResult.value.chargedCents;
    balanceRemainingCents = signalResult.value.balanceRemainingCents;
    raw.signals = signalResult.value.raw;
  } else {
    errors.push("Recent SuperSearch signals are temporarily unavailable.");
    raw.signal_error =
      signalResult.reason instanceof VaayaApiError
        ? signalResult.reason.response
        : String(signalResult.reason);
  }

  if (exaResult.status === "fulfilled") {
    const seen = new Set(market.signals.map((signal) => signal.url));
    for (const signal of exaResult.value.market.signals) {
      if (!seen.has(signal.url) && market.signals.length < 6) {
        seen.add(signal.url);
        market.signals.push(signal);
      }
    }
    chargedCents += exaResult.value.chargedCents;
    balanceRemainingCents =
      exaResult.value.balanceRemainingCents ?? balanceRemainingCents;
    raw.exa = exaResult.value.raw;
  } else {
    errors.push("Exa search is temporarily unavailable.");
    raw.exa_error =
      exaResult.reason instanceof VaayaApiError
        ? exaResult.reason.response
        : String(exaResult.reason);
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
    usedExa,
  };
}

async function runAktaResearch(company: CompanyBrief, companyUrl: string) {
  const domain = new URL(companyUrl).hostname.replace(/^www\./, "");
  const response = await vaayaRun("akta", "company-enrich", {
    company: domain,
    sections: ["firmographic", "management_profile", "company_hierarchy"],
  }, {
    maxCostCents: MAX_AKTA_COST_CENTS,
  });

  const parsed = parseAktaCompany(response.data);
  console.info("Akta company-enrich", {
    chargedCents: response.charged_cents ?? 0,
    departments: parsed.departments.length,
    executives: parsed.executives.length,
    employeeCount: parsed.employee_count,
    location: parsed.location,
  });

  return {
    parsed,
    chargedCents: response.charged_cents ?? 0,
    balanceRemainingCents: response.balance_remaining_cents ?? null,
    raw: response.data,
  };
}

async function runPeopleEnrichment(
  candidates: RelevantPerson[],
): Promise<{
  people: RelevantPerson[];
  chargedCents: number;
  balanceRemainingCents: number | null;
}> {
  const rows = candidates.slice(0, 3).map((candidate) =>
    candidate.linkedin ??
    `${candidate.name} ${candidate.title} ${candidate.company}`,
  );

  if (!rows.length) {
    return {
      people: candidates,
      chargedCents: 0,
      balanceRemainingCents: null,
    };
  }

  let response = await vaayaRun("vaaya", "onefind-deep", {
    rows,
    budgetCents: MAX_PEOPLE_ENRICHMENT_COST_CENTS,
  }, {
    maxCostCents: MAX_PEOPLE_ENRICHMENT_COST_CENTS,
  });
  let chargedCents = response.charged_cents ?? 0;
  let balanceRemainingCents = response.balance_remaining_cents ?? null;
  const jobId = findJobId(response.data);

  if (jobId) {
    for (let attempt = 0; attempt < PEOPLE_MAX_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      response = await vaayaRun("vaaya", "result", { job_id: jobId });
      chargedCents += response.charged_cents ?? 0;
      balanceRemainingCents =
        response.balance_remaining_cents ?? balanceRemainingCents;

      const status = findJobStatus(response.data);

      if (status === "failed" || status === "cancelled") {
        throw new VaayaApiError("People enrichment job failed.", 502, response);
      }

      if (
        status === "completed" ||
        status === "succeeded" ||
        mergeEnrichedPeople(candidates, response.data).some(
          (person) => person.enriched,
        )
      ) {
        break;
      }
    }
  }

  let people = mergeEnrichedPeople(candidates, response.data);
  const directFallbackTargets = people
    .filter(
      (person) =>
        person.linkedin &&
        !person.work_emails.length &&
        !person.phones.length,
    )
    .slice(0, 2);

  for (const target of directFallbackTargets) {
    if (!target.linkedin) {
      continue;
    }

    try {
      const contactResponse = await vaayaRun(
        "contactout",
        "linkedin-contacts",
        {
          profile: target.linkedin,
          include_phone: false,
        },
        {
          maxCostCents: MAX_CONTACT_FALLBACK_COST_CENTS,
        },
      );
      chargedCents += contactResponse.charged_cents ?? 0;
      balanceRemainingCents =
        contactResponse.balance_remaining_cents ?? balanceRemainingCents;
      people = mergeEnrichedPeople(people, {
        results: [
          {
            input: target.linkedin,
            data: contactResponse.data,
            sources: ["contactout"],
          },
        ],
      });
    } catch (error) {
      console.warn(
        "Contact fallback failed",
        error instanceof VaayaApiError
          ? JSON.stringify({ status: error.status, response: error.response }, null, 2)
          : error,
      );
    }
  }

  return {
    people,
    chargedCents,
    balanceRemainingCents,
  };
}

async function runPeopleResearch(
  company: CompanyBrief,
  market: MarketIntelligence,
) {
  const query = [
    `Find founders, heads of growth, VP sales, revenue, and GTM leaders`,
    `for ${company.company_name} or companies like it in ${company.industry ?? "its market"}.`,
    "Return LinkedIn profiles only when available.",
  ].join(" ");
  const discovery = await vaayaRun("vaaya", "onefind", {
    query,
    limit: 5,
  }, {
    maxCostCents: MAX_PEOPLE_DISCOVERY_COST_CENTS,
  });
  const candidates = parsePeopleCandidates(discovery.data, company, market);

  if (!candidates.length) {
    return {
      people: [],
      chargedCents: discovery.charged_cents ?? 0,
      balanceRemainingCents: discovery.balance_remaining_cents ?? null,
    };
  }

  try {
    const enrichment = await runPeopleEnrichment(candidates);

    return {
      people: enrichment.people,
      chargedCents:
        (discovery.charged_cents ?? 0) + enrichment.chargedCents,
      balanceRemainingCents:
        enrichment.balanceRemainingCents ??
        discovery.balance_remaining_cents ??
        null,
    };
  } catch (error) {
    console.warn(
      "Vaaya people enrichment failed; returning discovered people only",
      error instanceof VaayaApiError
        ? JSON.stringify({ status: error.status, response: error.response }, null, 2)
        : error,
    );

    return {
      people: candidates,
      chargedCents: discovery.charged_cents ?? 0,
      balanceRemainingCents: discovery.balance_remaining_cents ?? null,
    };
  }
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
    let company = {
      ...analysis.company,
      website: analysis.company.website || companyUrl,
    };
    const { settled } = analysis;
    let market: MarketIntelligence = {
      signals: [],
      competitors: [],
      positioning: null,
      recent_activity: [],
    };
    let marketError: string | null = null;
    let marketChargedCents = 0;
    let people: RelevantPerson[] = [];
    let peopleError: string | null = null;
    let peopleChargedCents = 0;
    let aktaError: string | null = null;
    let aktaChargedCents = 0;
    let balanceRemainingCents = settled.balanceRemainingCents;
    let scrapeChargedCents = 0;
    const vendors: VendorUsed[] = [
      {
        name: analysis.provider === "firecrawl" ? "Firecrawl + CRW" : "CRW extract",
        used_for:
          analysis.provider === "firecrawl"
            ? "Homepage scrape and company brief extraction"
            : "Structured company brief from the website",
      },
    ];

    const scrapePromise = analysis.scrapeMarkdown
      ? Promise.resolve({
          markdown: analysis.scrapeMarkdown,
          chargedCents: 0,
          balanceRemainingCents: null as number | null,
          reused: true,
        })
      : runHomepageScrape(companyUrl).then((scrape) => ({
          ...scrape,
          reused: false,
        }));

    const [marketOutcome, aktaOutcome, scrapeOutcome] = await Promise.allSettled([
      runMarketResearch(company, companyUrl),
      runAktaResearch(company, companyUrl),
      scrapePromise,
    ]);

    if (scrapeOutcome.status === "fulfilled") {
      const scrape = scrapeOutcome.value;
      company = fillCompanyFromScrape(company, scrape.markdown, companyUrl);
      scrapeChargedCents = scrape.chargedCents;
      balanceRemainingCents =
        scrape.balanceRemainingCents ?? balanceRemainingCents;
      if (!scrape.reused && analysis.provider !== "firecrawl") {
        vendors.push({
          name: "Firecrawl",
          used_for: "Homepage scrape for smaller-company site content",
        });
      }
    }

    if (marketOutcome.status === "fulfilled") {
      const marketResearch = marketOutcome.value;
      market = enrichMarketIntelligence(marketResearch.market, company);
      marketChargedCents = marketResearch.chargedCents;
      balanceRemainingCents =
        marketResearch.balanceRemainingCents ?? balanceRemainingCents;
      if (marketResearch.usedExa) {
        vendors.push({
          name: "Exa",
          used_for: "Recent news and public web discovery",
        });
      }
      vendors.push({ name: "OpenFunnel", used_for: "Competitor lookalikes" });

      if (marketResearch.errors.length) {
        marketError = marketResearch.errors.join(" ");
      } else if (!market.signals.length && !market.competitors.length) {
        marketError = "No cited market results were returned.";
      }
    } else {
      marketError = "Live market research is temporarily unavailable.";
      console.error("Vaaya market research failed", marketOutcome.reason);
    }

    if (aktaOutcome.status === "fulfilled") {
      const aktaResearch = aktaOutcome.value;
      company = mergeAktaIntoCompany(company, aktaResearch.parsed, companyUrl);
      aktaChargedCents = aktaResearch.chargedCents;
      balanceRemainingCents =
        aktaResearch.balanceRemainingCents ?? balanceRemainingCents;
      vendors.push({
        name: "Akta.pro",
        used_for: "Firmographics, departments, and leadership",
      });
    } else {
      aktaError = "Company structure data is temporarily unavailable.";
      console.warn(
        "Akta enrichment failed",
        aktaOutcome.reason instanceof VaayaApiError
          ? JSON.stringify(
              {
                status: aktaOutcome.reason.status,
                response: aktaOutcome.reason.response,
              },
              null,
              2,
            )
          : aktaOutcome.reason,
      );
    }

    try {
      const peopleResearch = await runPeopleResearch(company, market);
      people = peopleResearch.people;
      peopleChargedCents = peopleResearch.chargedCents;
      balanceRemainingCents =
        peopleResearch.balanceRemainingCents ?? balanceRemainingCents;
      vendors.push(
        { name: "OneFind", used_for: "People discovery and contact enrichment" },
      );

      if (aktaOutcome.status === "fulfilled") {
        people = mergeAktaPeople(
          people,
          aktaOutcome.value.parsed,
          company,
          market,
        );
      }

      people = people.filter((person) =>
        personBelongsToCompany(person, company, companyUrl),
      );

      if (!company.departments.length) {
        company = {
          ...company,
          departments: inferDepartmentsFromPeople(people),
        };
      }

      if (!people.length) {
        peopleError = "No relevant people were found for this company yet.";
      }
    } catch (peopleResearchError) {
      peopleError = "People discovery is temporarily unavailable.";
      console.error(
        "Vaaya people research failed",
        peopleResearchError instanceof VaayaApiError
          ? JSON.stringify(
              {
                status: peopleResearchError.status,
                response: peopleResearchError.response,
              },
              null,
              2,
            )
          : peopleResearchError,
      );
    }

    market = enrichMarketIntelligence(market, company);

    const response: AnalyzeSuccessResponse = {
      ok: true,
      requested_url: companyUrl,
      company,
      market,
      market_error: marketError,
      people,
      people_error: peopleError,
      akta_error: aktaError,
      vendors,
      evidence: findEvidence(settled.response.data),
      charged_cents:
        settled.chargedCents +
        marketChargedCents +
        peopleChargedCents +
        aktaChargedCents +
        scrapeChargedCents,
      balance_remaining_cents: balanceRemainingCents,
      cached: false,
      provider: {
        service: analysis.provider,
        action: "extract",
      },
      market_provider: {
        service: "exa",
        action: "search",
      },
      people_provider: {
        discovery: "vaaya/onefind",
        enrichment: "vaaya/onefind-deep",
      },
    };

    analysisCache.set(companyUrl, {
      expiresAt:
        Date.now() +
        (marketError || peopleError || aktaError
          ? PARTIAL_CACHE_TTL_MS
          : CACHE_TTL_MS),
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
