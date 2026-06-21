# QuantCode Dashboard

A read-only Next.js dashboard over the QuantCode quant-research pipeline. It visualises
feasibility gating, strategy critiques, durable lessons in Redis (with live vector search),
and measured context compaction. Nothing here mutates state and nothing is a trading
recommendation — experiments are `not_executed` and no performance is claimed.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS 3.4 ·
`lucide-react` · `recharts`. Aesthetic and chrome mirror the AgentQR terminal
(IBM Plex Mono, monochrome near-black dark theme, forced `dark` mode).

## Pages

| Route             | What it shows                                                                 |
| ----------------- | ----------------------------------------------------------------------------- |
| `/`               | Overview: stat cards, "proof of learning" callout, recent runs, disclaimer.   |
| `/memory`         | Redis: semantic lesson search, all lessons, and episodic run records.         |
| `/compaction`     | Token compaction: before/after, ratio, criticals retained, recharts bar.      |
| `/runs`           | All research runs (links to detail).                                          |
| `/runs/[run_id]`  | Run detail: feasibility gate, strategies, critiques, experiments, timeline.   |

## Running it

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

The dashboard needs the QuantCode read-only API running on **port 8000**:

```bash
quantcode dashboard   # serves the FastAPI dashboard backend on :8000
```

The frontend proxies all data calls through `/api/backend/*` → the API (see
`next.config.js`), so there is no CORS setup. If the API is down or has no runs yet,
every page degrades to a friendly "start the API" state instead of crashing. The
memory search also handles Redis being absent (it returns an empty result set).

### Configuration

Set `NEXT_PUBLIC_API_URL` to point at a non-default API origin (defaults to
`http://localhost:8000`):

```bash
cp .env.example .env.local
# edit NEXT_PUBLIC_API_URL=...
```

## Build

```bash
npm run build        # type-checks (strict) + builds all routes
```
