import { NextResponse } from "next/server";

import { VaayaApiError, vaayaRun } from "@/lib/vaaya";

const SCRAPE_SERVICE = "firecrawl";
const SCRAPE_ACTION = "scrape";
const MAX_COST_CENTS = 5;

type ScrapeRequest = {
  url?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function getScrapePayload(data: unknown) {
  if (!isRecord(data)) {
    return {};
  }

  return isRecord(data.data) ? data.data : data;
}

function getExtractedScrapeFields(data: unknown) {
  const payload = getScrapePayload(data);
  const formats = isRecord(payload.formats) ? payload.formats : {};
  const status = typeof payload.status === "number" ? payload.status : undefined;

  return {
    url: optionalString(payload.url),
    title: optionalString(payload.title),
    status,
    markdown:
      optionalString(formats.markdown) ?? optionalString(payload.markdown) ?? null,
    html: optionalString(formats.html) ?? optionalString(payload.html) ?? null,
    meta: isRecord(payload.meta) ? payload.meta : null,
    warnings: optionalStringArray(payload.warnings) ?? [],
  };
}

function parseCompanyUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: ScrapeRequest;

  try {
    body = (await request.json()) as ScrapeRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Send JSON with a company URL." },
      { status: 400 },
    );
  }

  const companyUrl = parseCompanyUrl(body.url);

  if (!companyUrl) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid http or https company URL." },
      { status: 400 },
    );
  }

  try {
    const vaaya = await vaayaRun(SCRAPE_SERVICE, SCRAPE_ACTION, {
      url: companyUrl,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 1000,
    }, {
      maxCostCents: MAX_COST_CENTS,
    });

    return NextResponse.json({
      ok: vaaya.ok,
      service: SCRAPE_SERVICE,
      action: SCRAPE_ACTION,
      requested_url: companyUrl,
      charged_cents: vaaya.charged_cents ?? null,
      balance_remaining_cents: vaaya.balance_remaining_cents ?? null,
      data: vaaya.data ?? null,
      extracted: getExtractedScrapeFields(vaaya.data),
    });
  } catch (error) {
    if (error instanceof VaayaApiError) {
      console.error("Vaaya scrape failed", {
        status: error.status,
        response: error.response,
      });

      const message =
        error.status === 401
          ? "Invalid or missing Vaaya API key. Add a real VAAYA_API_KEY in .env.local."
          : "Could not fetch this site. Try another company URL.";

      return NextResponse.json(
        {
          ok: false,
          error: message,
          status: error.status,
          details: error.response ?? null,
        },
        { status: error.status === 401 ? 401 : 502 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Something went wrong while scraping the site." },
      { status: 500 },
    );
  }
}
