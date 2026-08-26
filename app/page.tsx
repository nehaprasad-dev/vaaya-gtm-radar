"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

import type {
  CompanyBrief,
  MarketIntelligence,
  RelevantPerson,
  VendorUsed,
} from "@/lib/company";
import {
  buildDurableShareUrl,
  buildShareSnapshot,
  copyTextToClipboard,
  decodeShareHash,
  decodeShareSnapshot,
  formatShareText,
  isShortShareId,
  type ShareSnapshot,
} from "@/lib/share";

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  requested_url?: string;
  company?: CompanyBrief;
  market?: MarketIntelligence;
  market_error?: string | null;
  people?: RelevantPerson[];
  people_error?: string | null;
  akta_error?: string | null;
  vendors?: VendorUsed[];
  evidence?: unknown;
  charged_cents?: number;
  balance_remaining_cents?: number | null;
  cached?: boolean;
  shared?: boolean;
  provider?: {
    service: string;
    action: string;
  };
  market_provider?: {
    service: string;
    action: string;
  };
  people_provider?: {
    discovery: string;
    enrichment: string;
  };
  details?: unknown;
};

function snapshotToResult(snapshot: ShareSnapshot): AnalyzeResponse {
  return {
    ok: true,
    requested_url: snapshot.requested_url,
    company: snapshot.company,
    market: snapshot.market,
    market_error: snapshot.market_error,
    people: snapshot.people,
    people_error: snapshot.people_error,
    akta_error: snapshot.akta_error,
    vendors: snapshot.vendors,
    charged_cents: 0,
    balance_remaining_cents: null,
    cached: true,
    shared: true,
  };
}

function readInitialUrl() {
  if (typeof window === "undefined") {
    return "https://dub.co";
  }

  return new URLSearchParams(window.location.search).get("url") ?? "https://dub.co";
}

export default function Home() {
  const [url, setUrl] = useState(readInitialUrl);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const autoStarted = useRef(false);

  async function runAnalyze(targetUrl: string) {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: targetUrl }),
      });
      const payload = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !payload.ok || !payload.company) {
        setError(payload.error ?? "Could not analyze this company.");
        setResult(payload);
        return;
      }

      setResult(payload);

      if (typeof window !== "undefined") {
        const next = new URL(window.location.href);
        next.searchParams.set("url", targetUrl);
        next.searchParams.delete("s");
        window.history.replaceState({}, "", next.toString());
      }
    } catch {
      setError("Could not reach the analysis route. Is the dev server running?");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (autoStarted.current || typeof window === "undefined") {
      return;
    }

    autoStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get("s");
    const sharedUrl = params.get("url");
    const hashToken = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash,
    ).get("i");

    if (hashToken) {
      queueMicrotask(() => {
        void (async () => {
          const snapshot = await decodeShareHash(hashToken);
          if (snapshot) {
            setResult(snapshotToResult(snapshot));
            if (snapshot.requested_url) {
              setUrl(snapshot.requested_url);
            }
            return;
          }
          setError("This share link is invalid or too old to open.");
        })();
      });
      return;
    }

    if (sharedToken) {
      queueMicrotask(() => {
        void (async () => {
          if (isShortShareId(sharedToken)) {
            try {
              const response = await fetch(`/api/share?id=${encodeURIComponent(sharedToken)}`);
              const payload = (await response.json()) as {
                ok?: boolean;
                snapshot?: ShareSnapshot;
                error?: string;
              };

              if (response.ok && payload.ok && payload.snapshot) {
                setResult(snapshotToResult(payload.snapshot));
                if (payload.snapshot.requested_url) {
                  setUrl(payload.snapshot.requested_url);
                }
                return;
              }

              setError(payload.error ?? "This share link expired or was not found.");
              return;
            } catch {
              setError("Could not open this share link.");
              return;
            }
          }

          const snapshot = decodeShareSnapshot(sharedToken);
          if (snapshot) {
            setResult(snapshotToResult(snapshot));
            if (snapshot.requested_url) {
              setUrl(snapshot.requested_url);
            }
            return;
          }

          setError("This share link is invalid or too old to open.");
        })();
      });
      return;
    }

    if (sharedUrl) {
      queueMicrotask(() => {
        void runAnalyze(sharedUrl);
      });
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAnalyze(url);
  }

  const company = result?.company;

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#111]">
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-[#d9d4c8] pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center border border-[#111] text-sm font-semibold">
              G
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">GTM Radar</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#6b665c]">
                Powered by Vaaya
              </p>
            </div>
          </div>
          <p className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b665c] sm:block">
            Research · Signals · People · Action
          </p>
        </header>

        <section className="grid gap-10 border-b border-dashed border-[#d9d4c8] py-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#6b665c]">
              From one company URL
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              Understand any company before you reach out.
            </h1>
          </div>
          <p className="max-w-md font-mono text-xs uppercase leading-6 tracking-[0.12em] text-[#6b665c]">
            Context, relevant people, and a simple GTM map — via one Vaaya key
            instead of separate Firecrawl, Exa, and Akta accounts.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="blueprint relative mt-10 border border-[#d9d4c8] bg-white p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-[#6b665c]">
            <span>Describe the company once</span>
            <span>Cached 12h</span>
          </div>
          <label htmlFor="company-url" className="sr-only">
            Company URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              id="company-url"
              className="min-h-14 flex-1 border border-[#d9d4c8] bg-[#f7f4ee] px-4 text-base outline-none focus:border-[#111]"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://company.com"
              required
            />
            <button
              className="min-h-14 rounded-full bg-[#111] px-8 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#8a857b]"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Building radar" : "Analyze company"}
            </button>
          </div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
            Cost-capped · Manual outreach only · No invented contacts
          </p>
        </form>

        {error ? (
          <p className="mt-6 border border-[#d9b4b0] bg-[#f8ece9] px-4 py-3 text-sm text-[#7a2e24]">
            {error}
          </p>
        ) : null}

        {isLoading ? <LoadingPanel /> : null}
        {!isLoading && !company ? <LandingPreview /> : null}
        {company ? <CompanyReport company={company} result={result} /> : null}

        <footer className="mt-16 border-t border-[#d9d4c8] pt-6">
          <a
            href="https://github.com/nehaprasad-dev/vaaya-gtm-radar"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b665c] underline-offset-4 hover:text-[#111] hover:underline"
          >
            View on GitHub
          </a>
        </footer>
      </div>
    </main>
  );
}

function LoadingPanel() {
  const steps = [
    "Read website",
    "Extract brief",
    "Find signals",
    "Map org chart",
    "Find people",
  ];

  return (
    <section className="mt-12 border border-dashed border-[#d9d4c8] p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6b665c]">
        Workflow in progress
      </p>
      <h2 className="mt-3 font-serif text-3xl">Building the GTM radar</h2>
      <div className="mt-8 grid gap-px bg-[#d9d4c8] sm:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step} className="bg-[#f7f4ee] p-4">
            <p className="font-mono text-[11px] text-[#6b665c]">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-3 text-sm">{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LandingPreview() {
  const items = [
    ["01 Overview", "Description, industry, size, location, website."],
    ["02 Structure", "Departments, heads, and decision-makers."],
    ["03 Market", "Competitors, signals, and positioning."],
    ["04 Outreach", "Who to contact, why now, and the angle."],
  ];

  return (
    <section className="mt-14 grid gap-px bg-[#d9d4c8] sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([title, copy]) => (
        <div key={title} className="min-h-44 bg-[#f7f4ee] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6b665c]">
            {title}
          </p>
          <p className="mt-8 text-sm leading-6">{copy}</p>
        </div>
      ))}
    </section>
  );
}

function CompanyReport({
  company,
  result,
}: {
  company: CompanyBrief;
  result: AnalyzeResponse;
}) {
  const market = result.market ?? {
    signals: [],
    competitors: [],
    positioning: null,
    recent_activity: [],
  };
  const people = result.people ?? [];
  const vendors = result.vendors ?? [];

  return (
    <section className="mt-14 space-y-10">
      <div className="grid gap-10 border-b border-[#d9d4c8] pb-10 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6b665c]">
            Company brief{" "}
            {result.shared ? "· shared" : result.cached ? "· cached" : "· live"}
          </p>
          <h2 className="mt-4 font-serif text-5xl leading-[1.05] tracking-[-0.03em]">
            {company.company_name}
          </h2>
          {company.tagline ? (
            <p className="mt-5 max-w-2xl font-serif text-2xl leading-8 text-[#3f3b34]">
              {company.tagline.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")}
            </p>
          ) : null}
          <CompanyCopy
            text={company.description}
            empty="No supported description was found."
          />
          <ShareBar company={company} result={result} />
        </div>
        <aside className="grid grid-cols-2 gap-px self-start bg-[#d9d4c8]">
          <Stat label="Departments" value={company.departments.length} />
          <Stat label="People" value={people.length} />
          <Stat label="Signals" value={market.signals.length} />
          <Stat
            label="Cost"
            value={result.shared ? "shared" : `${result.charged_cents ?? 0}c`}
          />
        </aside>
      </div>

      <div className="grid gap-px bg-[#d9d4c8] sm:grid-cols-2 lg:grid-cols-5">
        <Fact label="Industry" value={company.industry} />
        <Fact
          label="Size"
          value={
            company.employee_count
              ? `${company.employee_count} employees`
              : null
          }
        />
        <Fact label="Location" value={company.location ?? company.headquarters} />
        <Fact label="Website" value={company.website} />
        <Fact label="Model" value={company.business_model} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <TagList title="Products" items={company.products} empty="None found." />
        <TagList
          title="Target customers"
          items={company.target_customers}
          empty="None found."
        />
      </div>

      <StructureSection
        company={company}
        people={people}
        error={result.akta_error ?? null}
      />

      <GtmMap company={company} market={market} people={people} />

      <MarketSection market={market} error={result.market_error ?? null} />
      <PeopleSection people={people} error={result.people_error ?? null} />

      <OutreachSection people={people} market={market} />

      {vendors.length ? <VendorsUsed vendors={vendors} /> : null}

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <Eyebrow>Outreach intelligence</Eyebrow>
          <h3 className="mt-3 font-serif text-3xl">What stands out</h3>
          <div className="mt-6 divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
            {company.gtm_takeaways.length ? (
              company.gtm_takeaways.map((item, index) => (
                <div key={item} className="flex gap-4 py-4">
                  <span className="font-mono text-xs text-[#6b665c]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-6">{item}</p>
                </div>
              ))
            ) : (
              <p className="py-4 text-sm text-[#6b665c]">No takeaway returned.</p>
            )}
          </div>
        </div>
        <div>
          <Eyebrow>Research trail</Eyebrow>
          <h3 className="mt-3 font-serif text-3xl">Important links</h3>
          <div className="mt-6 divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
            {company.key_links.length ? (
              company.key_links.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between py-4 text-sm hover:underline"
                >
                  <span>{link.label}</span>
                  <span className="font-mono text-[11px] text-[#6b665c]">
                    {new URL(link.url).hostname.replace(/^www\./, "")}
                  </span>
                </a>
              ))
            ) : (
              <p className="py-4 text-sm text-[#6b665c]">No key links.</p>
            )}
          </div>
        </div>
      </div>

      <AuditFooter result={result} />
    </section>
  );
}

function CompanyCopy({
  text,
  empty,
}: {
  text: string | null;
  empty: string;
}) {
  const cleaned = (text ?? "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const paragraphs = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((item) => item.trim())
    .filter((item) => {
      if (item.length < 24) {
        return false;
      }
      return !/^(log in|sign up|sign in|get started|start for free)/i.test(item);
    })
    .slice(0, 3);

  if (!paragraphs.length) {
    return <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b665c]">{empty}</p>;
  }

  return (
    <div className="mt-5 max-w-3xl space-y-4">
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-base leading-8 text-[#3f3b34]">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function ShareBar({
  company,
  result,
}: {
  company: CompanyBrief;
  result: AnalyzeResponse;
}) {
  const [status, setStatus] = useState<string | null>(null);

  function makeSnapshot() {
    return buildShareSnapshot({
      requested_url: result.requested_url ?? company.website ?? "",
      company,
      market: result.market,
      people: result.people,
      vendors: result.vendors,
      market_error: result.market_error,
      people_error: result.people_error,
      akta_error: result.akta_error,
    });
  }

  async function createShareUrl() {
    const snapshot = makeSnapshot();
    const shareUrl = await buildDurableShareUrl(
      window.location.origin,
      snapshot,
    );

    // Best-effort short id for same-server opens; durable hash is the real share.
    void fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    }).catch(() => undefined);

    return shareUrl;
  }

  async function copyShareLink() {
    setStatus("Creating link…");
    const shareUrl = await createShareUrl();
    await copyTextToClipboard(shareUrl);
    window.history.replaceState({}, "", shareUrl);
    setStatus("Share link copied");
  }

  async function copySummary() {
    const text = formatShareText(makeSnapshot());
    await copyTextToClipboard(text);
    setStatus("Summary copied");
  }

  async function nativeShare() {
    setStatus("Creating link…");
    const snapshot = makeSnapshot();
    const shareUrl = await createShareUrl();
    const text = formatShareText(snapshot);

    if (navigator.share) {
      await navigator.share({
        title: `GTM Radar — ${company.company_name}`,
        text: text.slice(0, 500),
        url: shareUrl,
      });
      setStatus("Shared");
      return;
    }

    await copyTextToClipboard(shareUrl);
    window.history.replaceState({}, "", shareUrl);
    setStatus("Share link copied");
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void nativeShare().catch(() => setStatus("Share cancelled"))}
        className="rounded-full bg-[#111] px-5 py-2.5 text-sm font-medium text-white"
      >
        Share insights
      </button>
      <button
        type="button"
        onClick={() =>
          void copyShareLink().catch(() => setStatus("Could not copy link"))
        }
        className="rounded-full border border-[#111] px-5 py-2.5 text-sm"
      >
        Copy link
      </button>
      <button
        type="button"
        onClick={() =>
          void copySummary().catch(() => setStatus("Could not copy summary"))
        }
        className="rounded-full border border-[#d9d4c8] bg-white px-5 py-2.5 text-sm"
      >
        Copy summary
      </button>
      {status ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
          {status}
        </span>
      ) : null}
    </div>
  );
}

function MarketSection({
  market,
  error,
}: {
  market: MarketIntelligence;
  error: string | null;
}) {
  return (
    <section>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>Market radar</Eyebrow>
          <h3 className="mt-3 font-serif text-3xl">Signals, competitors, positioning</h3>
        </div>
        {error ? <Warning>{error}</Warning> : null}
      </div>
      {market.positioning ? (
        <p className="mt-6 max-w-3xl text-sm leading-7 text-[#3f3b34]">
          {market.positioning}
        </p>
      ) : null}
      {market.recent_activity.length ? (
        <div className="mt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
            Recent activity
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {market.recent_activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
          {market.signals.length ? (
            market.signals.map((signal) => (
              <a
                key={`${signal.title}-${signal.url}`}
                href={signal.url}
                target="_blank"
                rel="noreferrer"
                className="block py-5 hover:bg-white/50"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
                  {[signal.type, signal.date ? formatSignalDate(signal.date) : null, signal.source]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <h4 className="mt-2 font-medium leading-6">{signal.title}</h4>
                <p className="mt-2 text-sm leading-6 text-[#3f3b34]">
                  {signal.summary}
                </p>
              </a>
            ))
          ) : (
            <p className="py-5 text-sm text-[#6b665c]">No cited signals found.</p>
          )}
        </div>
        <div className="divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
          {market.competitors.length ? (
            market.competitors.map((competitor, index) => (
              <a
                key={`${competitor.name}-${competitor.url}`}
                href={competitor.url}
                target="_blank"
                rel="noreferrer"
                className="flex gap-4 py-5 hover:bg-white/50"
              >
                <span className="font-mono text-xs text-[#6b665c]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block font-medium">{competitor.name}</span>
                  <span className="mt-1 block text-sm leading-6 text-[#3f3b34]">
                    {competitor.reason}
                  </span>
                </span>
              </a>
            ))
          ) : (
            <p className="py-5 text-sm text-[#6b665c]">No competitors returned.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function StructureSection({
  company,
  people,
  error,
}: {
  company: CompanyBrief;
  people: RelevantPerson[];
  error: string | null;
}) {
  const decisionMakers = people.filter((person) =>
    /\b(founder|ceo|chief|head|vp|director)\b/i.test(person.title),
  );

  return (
    <section>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>Company structure</Eyebrow>
          <h3 className="mt-3 font-serif text-3xl">
            {company.departments.length
              ? `${company.departments.length} departments`
              : "Departments and heads"}
          </h3>
        </div>
        {error ? <Warning>{error}</Warning> : null}
      </div>
      <div className="mt-8 divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
        {company.departments.length ? (
          company.departments.map((department) => (
            <div
              key={department.name}
              className="grid gap-2 py-4 sm:grid-cols-[1fr_1.4fr_auto]"
            >
              <p className="font-medium">{department.name}</p>
              <p className="text-sm text-[#3f3b34]">
                {department.head
                  ? `${department.head}${department.head_title ? ` · ${department.head_title}` : ""}`
                  : "Head not listed"}
              </p>
              <p className="font-mono text-xs text-[#6b665c]">
                {department.size ? `${department.size} people` : "—"}
              </p>
            </div>
          ))
        ) : (
          <p className="py-4 text-sm text-[#6b665c]">
            No department map returned yet.
          </p>
        )}
      </div>
      {decisionMakers.length ? (
        <p className="mt-4 text-sm text-[#3f3b34]">
          Key decision-makers:{" "}
          {decisionMakers
            .slice(0, 6)
            .map((person) => `${person.name} (${person.title})`)
            .join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function OutreachSection({
  people,
  market,
}: {
  people: RelevantPerson[];
  market: MarketIntelligence;
}) {
  const primary = people[0];

  return (
    <section>
      <Eyebrow>Outreach</Eyebrow>
      <h3 className="mt-3 font-serif text-3xl">Why reach out, why now</h3>
      {primary ? (
        <div className="mt-6 grid gap-px bg-[#d9d4c8] lg:grid-cols-3">
          <Reason title="Why reach out" text={primary.why_this_person} />
          <Reason title="Why now" text={primary.why_now} />
          <Reason title="Suggested message" text={primary.outreach_angle} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#6b665c]">No outreach angle yet.</p>
      )}
      {market.signals[0] ? (
        <p className="mt-4 text-sm text-[#6b665c]">
          Lead with: {market.signals[0].title}
        </p>
      ) : null}
    </section>
  );
}

function VendorsUsed({ vendors }: { vendors: VendorUsed[] }) {
  return (
    <section>
      <Eyebrow>One Vaaya API key</Eyebrow>
      <h3 className="mt-3 font-serif text-3xl">Providers used in this run</h3>
      <div className="mt-6 divide-y divide-[#d9d4c8] border-y border-[#d9d4c8]">
        {vendors.map((vendor) => (
          <div
            key={`${vendor.name}-${vendor.used_for}`}
            className="grid gap-2 py-4 sm:grid-cols-[160px_1fr]"
          >
            <p className="font-medium">{vendor.name}</p>
            <p className="text-sm text-[#3f3b34]">{vendor.used_for}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeopleSection({
  people,
  error,
}: {
  people: RelevantPerson[];
  error: string | null;
}) {
  return (
    <section>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>People radar</Eyebrow>
          <h3 className="mt-3 font-serif text-3xl">Who to reach and why</h3>
        </div>
        {error ? <Warning>{error}</Warning> : null}
      </div>
      <div className="mt-8 space-y-6">
        {people.length ? (
          people.map((person) => (
            <article
              key={`${person.name}-${person.company}-${person.linkedin ?? ""}`}
              className="border border-[#d9d4c8] bg-white p-6"
            >
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
                    {person.enriched ? "Enriched" : "Candidate"}
                  </p>
                  <h4 className="mt-2 font-serif text-3xl">{person.name}</h4>
                  <p className="mt-2 text-sm">
                    {person.title} · {person.company}
                  </p>
                  {person.location ? (
                    <p className="mt-1 text-xs text-[#6b665c]">{person.location}</p>
                  ) : null}
                </div>
                <div className="border-t border-[#d9d4c8] pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
                    Contact
                  </p>
                  <div className="mt-3 space-y-2">
                    {person.work_emails.length ? (
                      person.work_emails.map((email) => (
                        <a key={email} href={`mailto:${email}`} className="block underline">
                          {email}
                        </a>
                      ))
                    ) : (
                      <p className="text-[#6b665c]">No work email returned</p>
                    )}
                    {person.linkedin ? (
                      <a
                        href={person.linkedin}
            target="_blank"
                        rel="noreferrer"
                        className="block underline"
                      >
                        LinkedIn profile
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-px bg-[#d9d4c8] lg:grid-cols-3">
                <Reason title="Why them" text={person.why_this_person} />
                <Reason title="Why now" text={person.why_now} />
                <Reason title="Angle" text={person.outreach_angle} />
              </div>
            </article>
          ))
        ) : (
          <p className="text-sm text-[#6b665c]">No people candidates yet.</p>
        )}
      </div>
    </section>
  );
}

function GtmMap({
  company,
  market,
  people,
}: {
  company: CompanyBrief;
  market: MarketIntelligence;
  people: RelevantPerson[];
}) {
  const contacts = people.slice(0, 3);

  return (
    <section className="blueprint border border-[#d9d4c8] p-6">
      <Eyebrow>GTM map</Eyebrow>
      <h3 className="mt-3 font-serif text-3xl">Company → market → action</h3>
      <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-[#111] bg-[#111] p-6 text-white">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
            Company
          </p>
          <p className="mt-4 font-serif text-3xl">{company.company_name}</p>
          <p className="mt-4 text-sm leading-6 text-white/70">
            {company.tagline ?? company.description ?? "Company profile generated."}
          </p>
        </div>
        <div className="grid gap-px bg-[#d9d4c8] sm:grid-cols-3">
          <MapColumn
            title="Market"
            items={[
              ...market.signals.slice(0, 2).map((item) => item.title),
              ...market.competitors.slice(0, 2).map((item) => item.name),
            ].slice(0, 4)}
            empty="No market context"
          />
          <MapColumn
            title="People"
            items={contacts.map((person) => person.name)}
            empty="No people yet"
          />
          <MapColumn
            title="Action"
            items={[
              contacts[0] ? `Contact ${contacts[0].name}` : null,
              market.signals[0]
                ? `Reference ${market.signals[0].type ?? "signal"}`
                : null,
              market.competitors[0]
                ? `Monitor ${market.competitors[0].name}`
                : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No action yet"
          />
        </div>
      </div>
    </section>
  );
}

function AuditFooter({ result }: { result: AnalyzeResponse }) {
  return (
    <div className="flex flex-col justify-between gap-4 border-t border-[#d9d4c8] pt-6 text-sm text-[#6b665c] sm:flex-row sm:items-start">
      <p>
        {result.shared
          ? "Opened from a shared insights link. No new Vaaya charge."
          : result.cached
            ? "Served from cache. No new Vaaya charge."
            : `Vaaya charged ${result.charged_cents ?? 0} cents for this run.`}
        {typeof result.balance_remaining_cents === "number"
          ? ` ${result.balance_remaining_cents} cents remaining.`
          : ""}
      </p>
      <details>
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.16em] text-[#111]">
          Audit details
        </summary>
        <pre className="mt-3 max-h-72 max-w-2xl overflow-auto whitespace-pre-wrap bg-[#111] p-4 font-mono text-[11px] leading-5 text-white">
          {JSON.stringify(
            {
              provider: result.provider,
              market_provider: result.market_provider,
              people_provider: result.people_provider,
              vendors: result.vendors,
              requested_url: result.requested_url,
              evidence: result.evidence,
              details: result.details,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6b665c]">
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#f7f4ee] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
        {label}
      </p>
      <p className="mt-3 font-serif text-3xl">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-[#f7f4ee] p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
        {label}
      </p>
      <p className="mt-3 text-sm font-medium">{value ?? "Not evidenced"}</p>
    </div>
  );
}

function TagList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span
              key={item}
              className="border border-[#d9d4c8] bg-white px-3 py-1.5 text-xs"
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm text-[#6b665c]">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Reason({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-[#f7f4ee] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
        {title}
      </p>
      <p className="mt-2 text-xs leading-5 text-[#3f3b34]">{text}</p>
    </div>
  );
}

function MapColumn({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="bg-white p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6b665c]">
        {title}
      </p>
      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => (
            <p key={item} className="text-xs leading-5">
              {item}
            </p>
          ))
        ) : (
          <p className="text-xs text-[#6b665c]">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="border border-[#ead3a6] bg-[#f8f1df] px-3 py-1.5 text-xs text-[#7a5a12]">
      {children}
    </p>
  );
}

function formatSignalDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
