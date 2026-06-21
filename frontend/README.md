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

From the repo root, the simplest path is:

```bash
.venv/bin/quantcode gui
```

That starts the FastAPI backend and the Next.js frontend together, and points the frontend at
the live Python API via `NEXT_PUBLIC_API_URL`.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

By default, the dashboard serves a read-only local API from the Next.js app itself.
Those routes read `../workspace/research_runs/*.json` and `../workspace/memory/*_pack.json`,
so the local demo does not need a separate backend process.

If no runs exist yet, generate demo data from the repo root:

```bash
.venv/bin/quantcode demo
```

### Configuration

Set `NEXT_PUBLIC_API_URL` only if you want `/api/backend/*` to proxy to an external
API origin instead of the built-in local workspace API:

```bash
cp .env.example .env.local
# edit NEXT_PUBLIC_API_URL=...
```

## Build

```bash
npm run build        # type-checks (strict) + builds all routes
```
