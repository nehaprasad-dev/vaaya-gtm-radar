export type CompanyLink = {
  label: string;
  url: string;
};

export type Department = {
  name: string;
  head: string | null;
  head_title: string | null;
  size: number | null;
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
  location: string | null;
  employee_count: number | null;
  website: string;
  departments: Department[];
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
  positioning: string | null;
  recent_activity: string[];
};

export type VendorUsed = {
  name: string;
  used_for: string;
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

  const headquarters = nullableString(value.headquarters);

  return {
    company_name: companyName,
    tagline: nullableString(value.tagline),
    description: readableCompanyCopy(nullableString(value.description))
      ?? nullableString(value.description),
    products: stringArray(value.products),
    target_customers: stringArray(value.target_customers),
    industry: nullableString(value.industry),
    business_model: nullableString(value.business_model),
    headquarters,
    location: nullableString(value.location) ?? headquarters,
    employee_count: numberish(value.employee_count ?? value.headcount),
    website: nullableString(value.website) ?? "",
    departments: [],
    key_links: linksArray(value.key_links),
    gtm_takeaways: stringArray(value.gtm_takeaways),
  };
}

function numberish(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (digits) {
      return Number(digits);
    }
  }

  return null;
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
      ((kind === "doc" || kind === "link" || !kind) &&
        Boolean(
          node.published_at ??
            node.published_date ??
            node.publishedDate ??
            node.published ??
            node.snippet,
        ));

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
          node.date ??
            node.published_at ??
            node.published_date ??
            node.publishedDate ??
            node.published,
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
    positioning: null,
    recent_activity: signals.map((signal) => signal.title).slice(0, 5),
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

export function personBelongsToCompany(
  person: RelevantPerson,
  company: CompanyBrief,
  companyUrl: string,
) {
  const domain = new URL(companyUrl).hostname.replace(/^www\./, "").toLowerCase();
  const host = domain.split(".")[0];
  const companyToken = company.company_name
    .toLowerCase()
    .replace(/\.(com|co|io|ai|dev|so)$/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const personToken = person.company
    .toLowerCase()
    .replace(/\.(com|co|io|ai|dev|so)$/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const emailDomains = person.work_emails.map((email) =>
    email.split("@")[1]?.toLowerCase(),
  );

  if (emailDomains.some((item) => item === domain || item?.endsWith(`.${domain}`))) {
    return true;
  }

  if (
    emailDomains.some(
      (item) => item && item !== domain && !item.includes(host),
    )
  ) {
    return false;
  }

  return (
    personToken === companyToken ||
    personToken === host ||
    personToken === domain.replace(/\./g, "") ||
    person.company.toLowerCase() === domain
  );
}

const DEPARTMENT_TITLE_MAP: Array<[RegExp, string]> = [
  [/\b(engineer|cto|technology|dev)\b/, "Engineering"],
  [/\b(product|cpo)\b/, "Product"],
  [/\b(sales|account executive|revenue|cro)\b/, "Sales"],
  [/\b(growth|gtm|go-to-market)\b/, "Growth"],
  [/\b(market)\b/, "Marketing"],
  [/\b(people|talent|hr|human)\b/, "People"],
  [/\b(financ|cfo)\b/, "Finance"],
  [/\b(operat|coo)\b/, "Operations"],
  [/\b(success|support|customer)\b/, "Customer"],
  [/\b(design|designer|brand)\b/, "Design"],
  [/\b(founder|ceo)\b/, "Leadership"],
];

function walkAktaFallback(value: unknown) {
  const firmographic: Record<string, unknown> = {};
  const executives: Record<string, unknown>[] = [];
  const departments: Department[] = [];

  function visit(node: unknown, depth = 0) {
    if (depth > 8 || !node) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.headcount || node.employee_count || node.hq || node.industry) {
      Object.assign(firmographic, node);
    }

    const title = nullableString(node.title ?? node.role ?? node.job_title);
    const name = nullableString(node.name ?? node.full_name);
    if (
      name &&
      title &&
      (node.linkedin || /ceo|founder|head|vp|chief|director/i.test(title))
    ) {
      executives.push(node);
    }

    const deptName = nullableString(
      node.department ?? (node.head ? node.name : null),
    );
    const head = nullableString(node.head ?? node.head_name ?? node.leader);
    if (deptName && (head || typeof node.size === "number")) {
      departments.push({
        name: deptName,
        head,
        head_title: nullableString(node.head_title),
        size: numberish(node.size ?? node.headcount),
      });
    }

    for (const key of [
      "sections",
      "firmographic",
      "management_profile",
      "company_hierarchy",
      "executives",
      "departments",
      "data",
      "results",
    ]) {
      if (key in node) {
        visit(node[key], depth + 1);
      }
    }
  }

  visit(value);

  return { firmographic, executives, departments: departments.slice(0, 12) };
}

function unwrapAktaSections(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.sections)) {
    return value.sections;
  }

  if (isRecord(value.data) && isRecord(value.data.sections)) {
    return value.data.sections;
  }

  return value;
}

export function parseAktaCompany(value: unknown) {
  const sections = unwrapAktaSections(value);
  const firmographic = isRecord(sections?.firmographic)
    ? sections.firmographic
    : {};
  const management = isRecord(sections?.management_profile)
    ? sections.management_profile
    : {};
  const hierarchy = isRecord(sections?.company_hierarchy)
    ? sections.company_hierarchy
    : {};

  const executives = (
    Array.isArray(management.executives) ? management.executives : []
  ).filter(isRecord);

  const walked = walkAktaFallback(value);
  if (!executives.length) {
    executives.push(...walked.executives);
  }

  const departments: Department[] = (
    Array.isArray(hierarchy.departments) ? hierarchy.departments : []
  )
    .flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }

      const name = nullableString(item.name ?? item.department);
      const head = nullableString(item.head ?? item.head_name ?? item.leader);

      if (!name) {
        return [];
      }

      const matchedExec = executives.find((executive) => {
        const execName = nullableString(executive.name ?? executive.full_name);
        return Boolean(
          execName && head && execName.toLowerCase() === head.toLowerCase(),
        );
      });

      return [
        {
          name,
          head,
          head_title:
            nullableString(item.head_title) ??
            nullableString(matchedExec?.title ?? matchedExec?.role),
          size: numberish(item.size ?? item.headcount),
        },
      ];
    })
    .slice(0, 12);

  if (!departments.length) {
    departments.push(...walked.departments);
  }
  if (!firmographic.industry && walked.firmographic.industry) {
    Object.assign(firmographic, walked.firmographic);
  }

  return {
    name: nullableString(firmographic.name),
    industry: nullableString(firmographic.industry),
    employee_count: numberish(
      firmographic.headcount ?? firmographic.employee_count,
    ),
    location: nullableString(
      firmographic.hq ?? firmographic.headquarters ?? firmographic.location,
    ),
    executives,
    departments,
  };
}

export function mergeAktaIntoCompany(
  company: CompanyBrief,
  akta: ReturnType<typeof parseAktaCompany>,
  website: string,
): CompanyBrief {
  return {
    ...company,
    industry: company.industry ?? akta.industry,
    employee_count: company.employee_count ?? akta.employee_count,
    location: company.location ?? akta.location ?? company.headquarters,
    headquarters: company.headquarters ?? akta.location,
    website: company.website ?? website,
    departments: akta.departments.length
      ? akta.departments
      : company.departments,
  };
}

export function inferDepartmentsFromPeople(people: RelevantPerson[]): Department[] {
  const byDept = new Map<string, Department>();

  for (const person of people) {
    const match = DEPARTMENT_TITLE_MAP.find(([pattern]) =>
      pattern.test(person.title.toLowerCase()),
    );
    const name = match?.[1] ?? "Other";
    const existing = byDept.get(name);

    if (!existing) {
      byDept.set(name, {
        name,
        head: person.name,
        head_title: person.title,
        size: null,
      });
    }
  }

  return Array.from(byDept.values()).slice(0, 10);
}

export function mergeAktaPeople(
  people: RelevantPerson[],
  akta: ReturnType<typeof parseAktaCompany>,
  company: CompanyBrief,
  market: MarketIntelligence,
): RelevantPerson[] {
  const extra = akta.executives.flatMap((executive) => {
    const candidate = parsePersonCandidate({
      ...executive,
      company: company.company_name,
    });

    if (!candidate) {
      return [];
    }

    return [
      {
        ...candidate,
        sources: Array.from(new Set([...candidate.sources, "akta"])),
        ...makePersonRationale(candidate, company, market),
      },
    ];
  });

  const merged = [...people];
  const seen = new Set(
    people.map((person) => `${person.name.toLowerCase()}-${person.company.toLowerCase()}`),
  );

  for (const person of extra) {
    const key = `${person.name.toLowerCase()}-${person.company.toLowerCase()}`;
    if (!seen.has(key) && merged.length < 8) {
      seen.add(key);
      merged.push(person);
    }
  }

  return merged;
}

export function enrichMarketIntelligence(
  market: MarketIntelligence,
  company: CompanyBrief,
): MarketIntelligence {
  const competitorNames = market.competitors
    .map((item) => item.name)
    .slice(0, 3)
    .join(", ");

  return {
    ...market,
    recent_activity: market.signals.map((signal) => signal.title).slice(0, 5),
    positioning:
      market.positioning ??
      (company.industry
        ? `${company.company_name} operates in ${company.industry}${
            competitorNames ? `, with overlap against ${competitorNames}` : ""
          }.`
        : null),
  };
}

export function findScrapeHtml(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 80) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findScrapeHtml(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const nested = isRecord(value.formats) ? value.formats.html : value.html;
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }

  for (const key of ["data", "result", "output", "formats"]) {
    if (key in value) {
      const found = findScrapeHtml(value[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function findScrapeMarkdown(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 80) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findScrapeMarkdown(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const nested = isRecord(value.formats) ? value.formats.markdown : value.markdown;
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }

  for (const key of ["data", "result", "output", "formats"]) {
    if (key in value) {
      const found = findScrapeMarkdown(value[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

const NAV_COPY =
  /\b(log in|login|sign up|signup|sign in|get started|start for free|book a demo|read more|learn more|cookie|privacy|terms|subscribe|menu|pricing)\b/i;

export function readableCompanyCopy(value: string | null) {
  if (!value) {
    return null;
  }

  const withoutLinks = value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = withoutLinks
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => {
      if (sentence.length < 28 || sentence.length > 220) {
        return false;
      }
      if (NAV_COPY.test(sentence) && sentence.length < 80) {
        return false;
      }
      const wordCount = sentence.split(" ").length;
      return wordCount >= 6;
    });

  const unique = Array.from(new Set(sentences));
  const picked = unique.slice(0, 2).join(" ");

  return picked || null;
}

export function companyBriefFromScrape(
  companyUrl: string,
  markdown: string | null,
): CompanyBrief {
  const hostname = new URL(companyUrl).hostname.replace(/^www\./, "");
  const name = hostname
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const description = readableCompanyCopy(markdown);

  return {
    company_name: name,
    tagline: null,
    description,
    products: [],
    target_customers: [],
    industry: null,
    business_model: null,
    headquarters: null,
    location: null,
    employee_count: null,
    website: companyUrl,
    departments: [],
    key_links: [{ label: "Website", url: companyUrl }],
    gtm_takeaways: [
      "Brief built from the live homepage after structured extraction failed.",
    ],
  };
}

export function fillCompanyFromScrape(
  company: CompanyBrief,
  markdown: string | null,
  website: string,
): CompanyBrief {
  if (!markdown) {
    return { ...company, website: company.website || website };
  }

  const scrapeCopy = readableCompanyCopy(markdown);
  const existingCopy = readableCompanyCopy(company.description);

  return {
    ...company,
    website: company.website || website,
    description: existingCopy ?? scrapeCopy ?? company.description,
  };
}

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
