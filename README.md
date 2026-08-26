# GTM Radar

Paste a company URL. Get a GTM brief — overview, org structure, market signals, people to reach, and outreach angles.

Built with one [Vaaya](https://vaaya.ai) API key instead of separate Firecrawl, Exa, and Akta accounts.

**Live:** [vaaya-gtm-radar.vercel.app](https://vaaya-gtm-radar.vercel.app)  
**Repo:** [github.com/nehaprasad-dev/vaaya-gtm-radar](https://github.com/nehaprasad-dev/vaaya-gtm-radar)

## Sharing insights

After a successful run, use **Share insights**, **Copy link**, or **Copy summary**.

- Share links look like `/?s=...&url=https://company.com`
- Opening a share link loads the saved brief instantly (no re-run, no extra charge)
- `/?url=https://company.com` alone prefills and auto-analyzes that company

## What it returns

| Section | Contents |
| --- | --- |
| **Overview** | Description, industry, size, location, website |
| **Structure** | Departments, heads, key decision-makers |
| **Market** | Competitors, recent signals, positioning |
| **People** | Relevant contacts, roles, LinkedIn / email when available |
| **Outreach** | Why reach out, why now, suggested angle |

Every run is cost-capped. Outreach is manual only — contacts are never auto-sent.

## How it works

One analyze request stitches providers through Vaaya:

1. **CRW / Firecrawl** — scrape and extract a company brief from the site  
2. **Exa** — recent news and public web evidence  
3. **OpenFunnel** — competitor lookalikes  
4. **Akta.pro** — firmographics, departments, leadership  
5. **OneFind** — people discovery and contact enrichment  

Results are cached for 12 hours per URL.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Vaaya REST API (`https://vaaya.ai/api/run/{service}/{action}`)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/nehaprasad-dev/vaaya-gtm-radar.git
cd vaaya-gtm-radar
npm install
```

### 2. Add your Vaaya API key

Create `.env.local`:

```bash
VAAYA_API_KEY=vaaya_sk_your_key_here
```

Get a key from [vaaya.ai](https://vaaya.ai). Never commit `.env` or `.env.local`.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a company URL (e.g. `https://dub.co`), and click **Analyze company**.

### 4. Production (Vercel)

Set `VAAYA_API_KEY` in the Vercel project environment variables, then deploy.

The analyze route can take up to a couple of minutes on a live run. Prefer a plan that allows longer serverless timeouts (`maxDuration` is set to 300s on `/api/analyze`).

## API

### `POST /api/analyze`

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://dub.co"}'
```

Success response includes `company`, `market`, `people`, `vendors`, `charged_cents`, and `balance_remaining_cents`.

## Project layout

```
app/
  page.tsx              # UI
  api/analyze/route.ts  # Full GTM radar pipeline
  api/scrape/route.ts   # Lightweight scrape helper
lib/
  vaaya.ts              # Vaaya client (Bearer auth, flattened body)
  company.ts            # Types, schemas, parsers, merges
```

## Scripts

```bash
npm run dev      # local development
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
```

## Notes

- Prefer real **company** websites over publisher homepages (e.g. news feeds).
- Missing fields stay “not evidenced” — the app does not invent contacts or facts.
- Cost and provider usage for each run are shown in the UI audit footer.
