export type CompanyLink = {
  label: string;
  url: string;
};

export type CompanyBrief = {
  company_name: string;
  tagline: string | null;
  description: string | null;
  products: string[];
  target_customers: string[];
  industry: string | null;
  business_model: string | null;
  headquarters: string | null;
  key_links: CompanyLink[];
  gtm_takeaways: string[];
};

export type MarketSignal = {
  title: string;
  summary: string;
  date: string | null;
  type: string | null;
  source: string;
  url: string;
};

export type Competitor = {
  name: string;
  reason: string;
  url: string;
};

export type MarketIntelligence = {
  signals: MarketSignal[];
  competitors: Competitor[];
};

export const companyBriefSchema = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    tagline: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    products: {
      type: "array",
      items: { type: "string" },
    },
    target_customers: {
      type: "array",
      items: { type: "string" },
    },
    industry: { type: ["string", "null"] },
    business_model: { type: ["string", "null"] },
    headquarters: { type: ["string", "null"] },
    key_links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          url: { type: "string", format: "uri" },
        },
        required: ["label", "url"],
        additionalProperties: false,
      },
    },
    gtm_takeaways: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "company_name",
    "tagline",
    "description",
    "products",
    "target_customers",
    "industry",
    "business_model",
    "headquarters",
    "key_links",
    "gtm_takeaways",
  ],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function linksArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string") {
      return [];
    }

    try {
      const url = new URL(item.url).toString();
      const label =
        typeof item.label === "string" && item.label.trim()
          ? item.label.trim()
          : new URL(url).hostname;

      return [{ label, url }];
    } catch {
      return [];
    }
  }).slice(0, 8);
}

export function parseCompanyBrief(value: unknown): CompanyBrief | null {
  if (!isRecord(value)) {
    return null;
  }

  const companyName = nullableString(value.company_name);

  if (!companyName) {
    return null;
  }

  return {
    company_name: companyName,
    tagline: nullableString(value.tagline),
    description: nullableString(value.description),
    products: stringArray(value.products),
    target_customers: stringArray(value.target_customers),
    industry: nullableString(value.industry),
    business_model: nullableString(value.business_model),
    headquarters: nullableString(value.headquarters),
    key_links: linksArray(value.key_links),
    gtm_takeaways: stringArray(value.gtm_takeaways),
  };
}

function validUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function normalizeKind(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function summarizeContent(value: unknown) {
  const content = nullableString(value);

  if (!content) {
    return null;
  }

  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 260
    ? `${normalized.slice(0, 257).trimEnd()}...`
    : normalized;
}

function classifySignal(value: string) {
  const text = value.toLowerCase();

  if (/\b(fund|funding|raised|valuation|ipo|revenue)\b/.test(text)) {
    return "Funding";
  }
  if (/\b(launch|release|introduc|unveil|product|model)\b/.test(text)) {
    return "Product";
  }
  if (/\b(hir|appoint|executive|leadership|layoff)\b/.test(text)) {
    return "People";
  }
  if (/\b(partner|partnership|collaborat|deal)\b/.test(text)) {
    return "Partnership";
  }
  if (/\b(regulat|policy|law|legal|risk)\b/.test(text)) {
    return "Regulatory";
  }

  return "News";
}

export function parseMarketResults(value: unknown): MarketIntelligence {
  const signals: MarketSignal[] = [];
  const competitors: Competitor[] = [];
  const seenSignalUrls = new Set<string>();
  const seenCompetitorDomains = new Set<string>();

  function visit(node: unknown, depth = 0) {
    if (depth > 5 || (signals.length >= 5 && competitors.length >= 5)) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const kind = normalizeKind(node.kind ?? node.type ?? node.category);
    const domain = nullableString(node.domain);
    const url = validUrl(
      node.url ??
        node.website ??
        node.source_url ??
        node.link ??
        (domain ? `https://${domain}` : null),
    );
    const title = nullableString(node.title);
    const summary = nullableString(
      node.summary ?? node.description ?? node.snippet,
    ) ?? summarizeContent(node.content);
    const name = nullableString(node.name ?? node.company_name);
    const reason = nullableString(
      node.reason ??
        node.match_reason ??
        node.notes ??
        node.summary ??
        node.description,
    );
    const isCompetitor =
      kind.includes("competitor") ||
      kind === "company" ||
      kind === "organization" ||
      Boolean(domain && name);
    const isSignal =
      kind.includes("news") ||
      kind.includes("signal") ||
      kind.includes("funding") ||
      kind.includes("launch") ||
      kind.includes("hiring") ||
      kind.includes("partnership") ||
      kind.includes("regulatory") ||
      ((kind === "doc" || kind === "link") &&
        Boolean(node.published_at ?? node.published_date ?? node.publishedDate));

    const competitorDomain = url ? new URL(url).hostname.replace(/^www\./, "") : null;

    if (
      url &&
      competitorDomain &&
      !seenCompetitorDomains.has(competitorDomain) &&
      isCompetitor &&
      competitors.length < 5 &&
      (name || title)
    ) {
      seenCompetitorDomains.add(competitorDomain);
      competitors.push({
        name: name ?? title ?? new URL(url).hostname,
        reason: reason ?? "Overlaps with this company or market.",
        url,
      });
      return;
    }

    if (
      url &&
      !seenSignalUrls.has(url) &&
      isSignal &&
      signals.length < 5 &&
      title
    ) {
      seenSignalUrls.add(url);
      const source = new URL(url).hostname.replace(/^www\./, "");
      const signalType = nullableString(
        node.signal_type ?? node.category,
      ) ?? classifySignal(`${title} ${summary ?? ""}`);

      signals.push({
        title,
        summary: summary ?? "Open the source for more details.",
        date: nullableString(
          node.date ?? node.published_date ?? node.publishedDate,
        ),
        type: signalType,
        source,
        url,
      });
      return;
    }

    for (const key of [
      "results",
      "evidence",
      "data",
      "items",
      "output",
      "answer",
    ]) {
      if (key in node) {
        visit(node[key], depth + 1);
      }
    }
  }

  visit(value);

  return {
    signals,
    competitors,
  };
}

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
