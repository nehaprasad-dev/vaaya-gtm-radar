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

export type RelevantPerson = {
  name: string;
  title: string;
  company: string;
  location: string | null;
  linkedin: string | null;
  work_emails: string[];
  phones: string[];
  enriched: boolean;
  why_this_person: string;
  why_now: string;
  outreach_angle: string;
  sources: string[];
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

function normalizeLinkedIn(value: unknown) {
  const url = validUrl(value);

  if (!url || !new URL(url).hostname.includes("linkedin.com")) {
    return null;
  }

  return url;
}

function emailArray(value: unknown) {
  if (typeof value === "string") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? [value.trim()]
      : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    .slice(0, 3);
}

function phoneArray(value: unknown) {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function scorePersonTitle(title: string) {
  const normalized = title.toLowerCase();

  if (/\b(founder|co-founder|ceo)\b/.test(normalized)) {
    return 5;
  }
  if (/\b(growth|revenue|sales|gtm|go-to-market|commercial)\b/.test(normalized)) {
    return 4;
  }
  if (/\b(marketing|demand|business development|partnership)\b/.test(normalized)) {
    return 3;
  }
  if (/\b(product|operations|strategy)\b/.test(normalized)) {
    return 2;
  }

  return 1;
}

function makePersonRationale(
  person: Pick<RelevantPerson, "title" | "company">,
  company: CompanyBrief,
  market: MarketIntelligence,
) {
  const title = person.title.toLowerCase();
  const signal = market.signals[0]?.title;
  const competitor = market.competitors[0]?.name;
  const ownsGrowth =
    /\b(growth|sales|revenue|gtm|go-to-market|business development)\b/.test(title);
  const isFounder = /\b(founder|co-founder|ceo)\b/.test(title);

  return {
    why_this_person: isFounder
      ? "Founder-level role can sponsor tooling that improves market research and outbound decisions."
      : ownsGrowth
        ? "Owns growth, revenue, or GTM work where better account research directly affects pipeline quality."
        : `Role appears relevant to ${company.company_name}'s GTM or strategic planning.`,
    why_now: signal
      ? `Recent signal to reference: ${signal}.`
      : competitor
        ? `Competitive pressure is visible from similar companies such as ${competitor}.`
        : `The company operates in ${company.industry ?? "a competitive market"} where timely account intelligence matters.`,
    outreach_angle: ownsGrowth
      ? "Show how Vaaya can automate company research, signals, and contact prep before the team adds more manual outbound work."
      : "Lead with a concise GTM radar example for their market and ask if manual research is slowing prioritization.",
  };
}

function parsePersonCandidate(value: unknown): Omit<
  RelevantPerson,
  "why_this_person" | "why_now" | "outreach_angle"
> | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = nullableString(value.name ?? value.full_name);
  const title = nullableString(value.title ?? value.headline ?? value.role);
  const company = nullableString(value.company ?? value.company_name);

  if (!name || !title || !company) {
    return null;
  }

  return {
    name,
    title,
    company,
    location: nullableString(value.location),
    linkedin: normalizeLinkedIn(value.linkedin ?? value.linkedin_url ?? value.url),
    work_emails: emailArray(value.work_emails ?? value.emails),
    phones: phoneArray(value.phones),
    enriched: value.enriched === true,
    sources: stringArray(value.sources).slice(0, 4),
  };
}

export function parsePeopleCandidates(
  value: unknown,
  company: CompanyBrief,
  market: MarketIntelligence,
): RelevantPerson[] {
  const people: RelevantPerson[] = [];
  const seen = new Set<string>();

  function visit(node: unknown, depth = 0) {
    if (depth > 5 || people.length >= 5) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    const candidate = parsePersonCandidate(node);

    if (candidate) {
      const key = `${candidate.linkedin ?? candidate.name}-${candidate.company}`;

      if (!seen.has(key)) {
        seen.add(key);
        people.push({
          ...candidate,
          ...makePersonRationale(candidate, company, market),
        });
      }

      return;
    }

    if (!isRecord(node)) {
      return;
    }

    for (const key of ["rows", "results", "data", "items", "people"]) {
      if (key in node) {
        visit(node[key], depth + 1);
      }
    }
  }

  visit(value);

  return people
    .sort((a, b) => scorePersonTitle(b.title) - scorePersonTitle(a.title))
    .slice(0, 5);
}

export function mergeEnrichedPeople(
  candidates: RelevantPerson[],
  value: unknown,
): RelevantPerson[] {
  const enrichments: Array<{
    key: string;
    emails: string[];
    phones: string[];
    sources: string[];
  }> = [];

  function visit(node: unknown, depth = 0) {
    if (depth > 6) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const data = isRecord(node.data) ? node.data : node;
    const contact = isRecord(data.profile) ? data.profile : data;
    const key = nullableString(node.input) ??
      normalizeLinkedIn(contact.linkedin ?? contact.linkedin_url) ??
      nullableString(contact.name);
    const emails = emailArray(
      contact.work_emails ??
        contact.work_email ??
        contact.email ??
        contact.emails ??
        contact.personal_email,
    );
    const phones = phoneArray(contact.phones ?? contact.phone);

    if (key && (emails.length || phones.length)) {
      enrichments.push({
        key,
        emails,
        phones,
        sources: stringArray(node.sources ?? data.sources).slice(0, 4),
      });
    }

    for (const childKey of ["results", "data", "items", "output"]) {
      if (childKey in node && node[childKey] !== data) {
        visit(node[childKey], depth + 1);
      }
    }
  }

  visit(value);

  return candidates.map((candidate) => {
    const match = enrichments.find((enrichment) => {
      const key = enrichment.key.toLowerCase();
      return (
        (candidate.linkedin && key.includes(candidate.linkedin.toLowerCase())) ||
        key.includes(candidate.name.toLowerCase())
      );
    });

    if (!match) {
      return candidate;
    }

    return {
      ...candidate,
      work_emails: match.emails.length ? match.emails : candidate.work_emails,
      phones: match.phones.length ? match.phones : candidate.phones,
      enriched: true,
      sources: Array.from(new Set([...candidate.sources, ...match.sources])),
    };
  });
}

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
