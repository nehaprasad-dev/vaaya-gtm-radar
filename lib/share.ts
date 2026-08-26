import type {
  CompanyBrief,
  MarketIntelligence,
  RelevantPerson,
  VendorUsed,
} from "@/lib/company";

export type ShareSnapshot = {
  v: 1;
  created_at: string;
  requested_url: string;
  company: CompanyBrief;
  market: MarketIntelligence;
  people: RelevantPerson[];
  vendors: VendorUsed[];
  market_error: string | null;
  people_error: string | null;
  akta_error: string | null;
};

function trimText(value: string | null, max = 500) {
  if (!value) {
    return value;
  }

  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function buildShareSnapshot(input: {
  requested_url: string;
  company: CompanyBrief;
  market?: MarketIntelligence | null;
  people?: RelevantPerson[] | null;
  vendors?: VendorUsed[] | null;
  market_error?: string | null;
  people_error?: string | null;
  akta_error?: string | null;
}): ShareSnapshot {
  const market = input.market ?? {
    signals: [],
    competitors: [],
    positioning: null,
    recent_activity: [],
  };

  return {
    v: 1,
    created_at: new Date().toISOString(),
    requested_url: input.requested_url,
    company: {
      ...input.company,
      tagline: trimText(input.company.tagline, 180),
      description: trimText(input.company.description, 600),
      products: input.company.products.slice(0, 8),
      target_customers: input.company.target_customers.slice(0, 8),
      departments: input.company.departments.slice(0, 10),
      key_links: input.company.key_links.slice(0, 8),
      gtm_takeaways: input.company.gtm_takeaways.slice(0, 6),
    },
    market: {
      positioning: trimText(market.positioning, 320),
      recent_activity: market.recent_activity.slice(0, 5),
      signals: market.signals.slice(0, 5).map((signal) => ({
        ...signal,
        summary: trimText(signal.summary, 220) ?? signal.summary,
      })),
      competitors: market.competitors.slice(0, 5),
    },
    people: (input.people ?? []).slice(0, 6).map((person) => ({
      ...person,
      why_this_person: trimText(person.why_this_person, 220) ?? person.why_this_person,
      why_now: trimText(person.why_now, 220) ?? person.why_now,
      outreach_angle: trimText(person.outreach_angle, 220) ?? person.outreach_angle,
      work_emails: person.work_emails.slice(0, 2),
      phones: person.phones.slice(0, 2),
      sources: person.sources.slice(0, 3),
    })),
    vendors: (input.vendors ?? []).slice(0, 8),
    market_error: input.market_error ?? null,
    people_error: input.people_error ?? null,
    akta_error: input.akta_error ?? null,
  };
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareSnapshot(snapshot: ShareSnapshot) {
  return toBase64Url(JSON.stringify(snapshot));
}

export function decodeShareSnapshot(value: string): ShareSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as ShareSnapshot;

    if (parsed?.v !== 1 || !parsed.company?.company_name) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function formatShareText(snapshot: ShareSnapshot) {
  const { company, market, people } = snapshot;
  const lines = [
    `GTM Radar — ${company.company_name}`,
    company.tagline ? company.tagline : null,
    company.description ? company.description : null,
    "",
    `Industry: ${company.industry ?? "—"}`,
    `Location: ${company.location ?? company.headquarters ?? "—"}`,
    `Website: ${company.website ?? snapshot.requested_url}`,
    "",
  ];

  if (company.departments.length) {
    lines.push("Departments");
    company.departments.forEach((department) => {
      lines.push(
        `- ${department.name}${department.head ? ` · ${department.head}` : ""}${
          department.head_title ? ` (${department.head_title})` : ""
        }`,
      );
    });
    lines.push("");
  }

  if (market.signals.length) {
    lines.push("Signals");
    market.signals.forEach((signal) => {
      lines.push(`- ${signal.title}${signal.url ? ` — ${signal.url}` : ""}`);
    });
    lines.push("");
  }

  if (market.competitors.length) {
    lines.push("Competitors");
    market.competitors.forEach((competitor) => {
      lines.push(`- ${competitor.name}`);
    });
    lines.push("");
  }

  if (people.length) {
    lines.push("People to reach");
    people.forEach((person) => {
      lines.push(`- ${person.name} · ${person.title}`);
      if (person.why_this_person) {
        lines.push(`  Why: ${person.why_this_person}`);
      }
    });
    lines.push("");
  }

  if (people[0]) {
    lines.push("Outreach");
    lines.push(`Why now: ${people[0].why_now}`);
    lines.push(`Angle: ${people[0].outreach_angle}`);
  }

  return lines.filter((line) => line !== null).join("\n");
}

export function buildSharePageUrl(origin: string, token: string, companyUrl: string) {
  const page = new URL(origin);
  page.searchParams.set("s", token);
  page.searchParams.set("url", companyUrl);
  return page.toString();
}
