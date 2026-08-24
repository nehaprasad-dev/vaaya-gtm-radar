"use client";

import { FormEvent, useState } from "react";

import type {
  CompanyBrief,
  MarketIntelligence,
  RelevantPerson,
} from "@/lib/company";

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  requested_url?: string;
  company?: CompanyBrief;
  market?: MarketIntelligence;
  market_error?: string | null;
  people?: RelevantPerson[];
  people_error?: string | null;
  evidence?: unknown;
  charged_cents?: number;
  balance_remaining_cents?: number | null;
  cached?: boolean;
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

export default function Home() {
  const [url, setUrl] = useState("https://www.anthropic.com");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !payload.ok || !payload.company) {
        setError(payload.error ?? "Could not analyze this company.");
        setResult(payload);
        return;
      }

      setResult(payload);
    } catch {
      setError("Could not reach the analysis route. Is the dev server running?");
    } finally {
      setIsLoading(false);
    }
  }

  const company = result?.company;

  return (
    <main className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.15),transparent_35%),radial-gradient(circle_at_90%_30%,rgba(129,140,248,0.12),transparent_30%)]" />

      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-300 font-black text-[#07111f]">
              V
            </div>
            <div>
              <p className="font-semibold">Founder/GTM Radar</p>
              <p className="text-xs text-slate-400">Powered by Vaaya</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
            Live research
          </span>
        </nav>

        <section className="pb-10 pt-16 text-center sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            From URL to GTM intelligence
          </p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            Understand any company before you reach out.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Enter a company website. Vaaya turns public information into a
            concise company profile and practical GTM takeaways.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-9 flex max-w-3xl flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:flex-row"
          >
            <label className="sr-only" htmlFor="company-url">
              Company URL
            </label>
            <input
              id="company-url"
              className="min-h-13 flex-1 rounded-xl border border-white/10 bg-[#0b1728] px-5 text-base text-white outline-none ring-cyan-300/40 placeholder:text-slate-500 focus:ring-4"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://company.com"
              required
            />
            <button
              className="min-h-13 rounded-xl bg-cyan-300 px-7 font-semibold text-[#07111f] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Researching..." : "Analyze company"}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Cached for 12 hours to prevent duplicate paid calls.
          </p>
        </section>

        {error ? (
          <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-center text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {isLoading ? <LoadingStory /> : null}
        {!isLoading && !company ? <EmptyState /> : null}
        {company ? <CompanyReport company={company} result={result} /> : null}
      </div>
    </main>
  );
}

function LoadingStory() {
  return (
    <section
      className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-7"
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <span className="size-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        <div>
          <h2 className="font-semibold">Building your company brief</h2>
          <p className="mt-1 text-sm text-slate-400">
            Vaaya is reading and structuring public company information.
          </p>
        </div>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-5">
        <LoadingStep number="01" label="Reading website" active />
        <LoadingStep number="02" label="Extracting company profile" />
        <LoadingStep number="03" label="Finding market signals" />
        <LoadingStep number="04" label="Mapping competitors" />
        <LoadingStep number="05" label="Finding people" />
      </div>
    </section>
  );
}

function LoadingStep({
  number,
  label,
  active = false,
}: {
  number: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-left ${
        active
          ? "border-cyan-300/30 bg-cyan-300/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-xs font-semibold text-cyan-300">{number}</p>
      <p className="mt-2 text-sm text-slate-200">{label}</p>
    </div>
  );
}

function EmptyState() {
  const outcomes = [
    ["Company profile", "What they do, sell, and how they position."],
    ["Market signals", "Recent launches, funding, hiring, and news."],
    ["People to contact", "Relevant leaders, contact details, and angles."],
  ];

  return (
    <section className="grid gap-4 pb-12 sm:grid-cols-3">
      {outcomes.map(([title, description], index) => (
        <div
          key={title}
          className="rounded-3xl border border-white/10 bg-white/[0.035] p-6"
        >
          <span className="text-xs font-semibold text-cyan-300">
            0{index + 1}
          </span>
          <h2 className="mt-5 text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
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
  return (
    <section className="space-y-5 pb-16">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white text-[#0b1728]">
        <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#ecfeff,#eef2ff)] p-7 sm:p-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {company.industry ? <Tag>{company.industry}</Tag> : null}
                {company.business_model ? (
                  <Tag>{company.business_model}</Tag>
                ) : null}
                {result.cached ? <Tag>Cached result</Tag> : <Tag>Fresh research</Tag>}
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">
                Company intelligence brief
              </p>
              <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                {company.company_name}
              </h2>
              {company.tagline ? (
                <p className="mt-3 max-w-2xl text-lg text-slate-600">
                  {company.tagline}
                </p>
              ) : null}
            </div>
            <a
              href={result.requested_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-sm font-semibold text-cyan-800 hover:text-cyan-600"
            >
              Visit website ↗
            </a>
          </div>
        </div>

        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.4fr_0.6fr]">
          <article>
            <SectionLabel>Company overview</SectionLabel>
            <p className="mt-3 text-base leading-7 text-slate-700">
              {company.description ?? "No supported description was found."}
            </p>
          </article>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Fact label="Industry" value={company.industry} />
            <Fact label="Business model" value={company.business_model} />
            <Fact label="Headquarters" value={company.headquarters} />
          </dl>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard
          eyebrow="What they sell"
          title="Products & offerings"
          items={company.products}
          empty="No clear products were found."
        />
        <ListCard
          eyebrow="Who they serve"
          title="Target customers"
          items={company.target_customers}
          empty="No clear target customers were found."
        />
      </div>

      <MarketSection
        market={result.market}
        error={result.market_error ?? null}
      />

      <PeopleSection people={result.people} error={result.people_error ?? null} />

      <GtmMap company={company} market={result.market} people={result.people} />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.08] p-7 sm:p-8">
          <SectionLabel light>GTM intelligence</SectionLabel>
          <h3 className="mt-2 text-2xl font-semibold">What stands out</h3>
          <div className="mt-6 space-y-4">
            {company.gtm_takeaways.length ? (
              company.gtm_takeaways.map((takeaway, index) => (
                <div key={takeaway} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-300 text-sm font-bold text-[#07111f]">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-sm leading-6 text-slate-200">
                    {takeaway}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">
                No evidence-backed GTM takeaway was found.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 sm:p-8">
          <SectionLabel light>Research trail</SectionLabel>
          <h3 className="mt-2 text-2xl font-semibold">Key links</h3>
          <div className="mt-5 space-y-2">
            {company.key_links.length ? (
              company.key_links.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                >
                  <span>{link.label}</span>
                  <span className="text-cyan-300">↗</span>
                </a>
              ))
            ) : (
              <p className="text-sm text-slate-400">No key links were returned.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-xs text-slate-400 sm:flex-row sm:items-center">
        <p>
          {result.cached
            ? "Served from the 12-hour cache · No new Vaaya charge"
            : `Vaaya charged ${result.charged_cents ?? 0} cents for this analysis`}
          {typeof result.balance_remaining_cents === "number"
            ? ` · ${result.balance_remaining_cents} cents remaining`
            : ""}
        </p>
        <details>
          <summary className="cursor-pointer font-medium text-slate-300">
            Evidence & debug
          </summary>
          <pre className="mt-3 max-h-72 max-w-2xl overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[11px] leading-5">
            {JSON.stringify(
              {
                provider: result.provider,
                market_provider: result.market_provider,
                people_provider: result.people_provider,
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
    </section>
  );
}

function MarketSection({
  market,
  error,
}: {
  market?: MarketIntelligence;
  error: string | null;
}) {
  const signals = market?.signals ?? [];
  const competitors = market?.competitors ?? [];

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 p-7 sm:p-8">
        <SectionLabel light>Market radar</SectionLabel>
        <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <h3 className="text-2xl font-semibold">What is happening around them</h3>
          <p className="text-xs text-slate-500">Current web research · cited sources</p>
        </div>
        {error ? (
          <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
        <div className="border-b border-white/10 p-7 sm:p-8 lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-slate-200">Recent signals</p>
          <div className="mt-5 space-y-3">
            {signals.length ? (
              signals.map((signal) => (
                <a
                  key={`${signal.title}-${signal.url}`}
                  href={signal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/10 bg-[#0b1728]/70 p-5 transition hover:border-cyan-300/30"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-cyan-300">
                    {signal.type ? <span>{signal.type}</span> : null}
                    {signal.date ? (
                      <>
                        <span className="text-slate-600">·</span>
                        <span>{formatSignalDate(signal.date)}</span>
                      </>
                    ) : null}
                  </div>
                  <h4 className="mt-2 font-semibold leading-6 text-white">
                    {signal.title}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {signal.summary}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {signal.source} ↗
                  </p>
                </a>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No cited recent signals were found.
              </p>
            )}
          </div>
        </div>

        <div className="p-7 sm:p-8">
          <p className="text-sm font-semibold text-slate-200">Competitive set</p>
          <div className="mt-5 space-y-3">
            {competitors.length ? (
              competitors.map((competitor, index) => (
                <a
                  key={`${competitor.name}-${competitor.url}`}
                  href={competitor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/30"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-semibold text-cyan-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4 className="font-semibold text-white">
                      {competitor.name}
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {competitor.reason}
                    </p>
                  </div>
                </a>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No cited competitors were returned.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PeopleSection({
  people,
  error,
}: {
  people?: RelevantPerson[];
  error: string | null;
}) {
  const contacts = people ?? [];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 sm:p-8">
      <SectionLabel light>People radar</SectionLabel>
      <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <h3 className="text-2xl font-semibold">Who to reach out to and why</h3>
        <p className="text-xs text-slate-500">
          Top candidates only · manual review before outreach
        </p>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4">
        {contacts.length ? (
          contacts.map((person) => (
            <div
              key={`${person.name}-${person.company}-${person.linkedin ?? ""}`}
              className="rounded-2xl border border-white/10 bg-[#0b1728]/80 p-5"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold">{person.name}</h4>
                    {person.enriched ? (
                      <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                        Enriched
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                        Candidate
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {person.title} · {person.company}
                  </p>
                  {person.location ? (
                    <p className="mt-1 text-xs text-slate-500">{person.location}</p>
                  ) : null}
                </div>

                <div className="min-w-56 text-sm">
                  {person.work_emails.length ? (
                    person.work_emails.map((email) => (
                      <a
                        key={email}
                        href={`mailto:${email}`}
                        className="block text-cyan-300 hover:text-cyan-200"
                      >
                        {email}
                      </a>
                    ))
                  ) : (
                    <p className="text-slate-500">No work email returned</p>
                  )}
                  {person.linkedin ? (
                    <a
                      href={person.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-slate-300 hover:text-white"
                    >
                      LinkedIn profile ↗
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <ReasonBlock title="Why them" text={person.why_this_person} />
                <ReasonBlock title="Why now" text={person.why_now} />
                <ReasonBlock title="Suggested angle" text={person.outreach_angle} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            No people candidates are available yet.
          </p>
        )}
      </div>
    </div>
  );
}

function ReasonBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">
        {title}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-300">{text}</p>
    </div>
  );
}

function GtmMap({
  company,
  market,
  people,
}: {
  company: CompanyBrief;
  market?: MarketIntelligence;
  people?: RelevantPerson[];
}) {
  const signals = market?.signals.slice(0, 3) ?? [];
  const competitors = market?.competitors.slice(0, 3) ?? [];
  const contacts = people?.slice(0, 3) ?? [];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 sm:p-8">
      <SectionLabel light>GTM map</SectionLabel>
      <h3 className="mt-2 text-2xl font-semibold">From company to action</h3>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid place-items-center rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Company
          </p>
          <p className="mt-3 text-3xl font-semibold">{company.company_name}</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
            {company.description ?? company.tagline ?? "Company profile generated."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <MapColumn
            title="Market"
            items={[
              ...signals.map((signal) => signal.title),
              ...competitors.map((competitor) => competitor.name),
            ].slice(0, 5)}
            empty="No market context yet"
          />
          <MapColumn
            title="People"
            items={contacts.map((person) => `${person.name} · ${person.title}`)}
            empty="No contacts yet"
          />
          <MapColumn
            title="Action"
            items={[
              contacts[0] ? `Contact ${contacts[0].name}` : null,
              signals[0] ? `Reference: ${signals[0].type ?? "signal"}` : null,
              competitors[0] ? `Monitor ${competitors[0].name}` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No action yet"
          />
        </div>
      </div>
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
    <div className="rounded-2xl border border-white/10 bg-[#0b1728]/70 p-4">
      <p className="text-sm font-semibold text-cyan-300">{title}</p>
      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="rounded-xl bg-white/[0.06] p-3 text-xs leading-5">
              {item}
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">{empty}</p>
        )}
      </div>
    </div>
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

function SectionLabel({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-[0.2em] ${
        light ? "text-cyan-300" : "text-cyan-700"
      }`}
    >
      {children}
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-cyan-700/10 bg-white/70 px-3 py-1 text-xs font-medium text-cyan-900">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-slate-800">
        {value ?? "Not evidenced"}
      </dd>
    </div>
  );
}

function ListCard({
  eyebrow,
  title,
  items,
  empty,
}: {
  eyebrow: string;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 sm:p-8">
      <SectionLabel light>{eyebrow}</SectionLabel>
      <h3 className="mt-2 text-2xl font-semibold">{title}</h3>
      <div className="mt-5 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span
              key={item}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200"
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm text-slate-400">{empty}</p>
        )}
      </div>
    </div>
  );
}
