const VAAYA_API_BASE_URL = "https://vaaya.ai/api/run";

export type VaayaRunResponse<TData = unknown> = {
  ok: boolean;
  data?: TData;
  error?: unknown;
  charged_cents?: number;
  balance_remaining_cents?: number;
  transaction_id?: string;
};

export class VaayaApiError extends Error {
  status: number;
  response?: unknown;

  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.name = "VaayaApiError";
    this.status = status;
    this.response = response;
  }
}

export async function vaayaRun<TData = unknown>(
  service: string,
  action: string,
  params: Record<string, unknown>,
  options: { maxCostCents?: number } = {},
): Promise<VaayaRunResponse<TData>> {
  const apiKey = process.env.VAAYA_API_KEY;

  if (!apiKey || apiKey === "vaaya_sk_........") {
    throw new VaayaApiError(
      "Missing VAAYA_API_KEY. Add your real key to .env.local before running a scrape.",
      401,
    );
  }

  const response = await fetch(`${VAAYA_API_BASE_URL}/${service}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...params,
      max_cost_cents: options.maxCostCents,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | VaayaRunResponse<TData>
    | null;

  if (!response.ok) {
    throw new VaayaApiError(
      `Vaaya request failed with status ${response.status}.`,
      response.status,
      payload,
    );
  }

  if (!payload) {
    throw new VaayaApiError("Vaaya returned an empty response.", 502);
  }

  return payload;
}
