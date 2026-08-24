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

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}
