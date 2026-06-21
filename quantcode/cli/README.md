# cli/

**Status:** implemented.

## Purpose

The product surface. QuantCode is CLI-first; everything a judge does, they do
here. Thin layer: parse args, call `pipeline/` and `workspace/`, render with `rich`.

## What to implement

Core commands:

- `init` — create the `workspace/` artifact dirs, write a starter `.env`.
- `strategy [objective]` — run the full agent pipeline and write strategy YAML.
- `check [run_id] [--strategy NAME] [--learn]` — backtest strategy specs, fetch papers/news, and optionally derive backtest lessons.
- `iterate [run_id] --strategy NAME` — one explicit human-approved re-test round, optionally after parameter edits.
- `live [run_id] --paper --strategy NAME` — generate and persist a local paper portfolio from the latest EOD signal snapshot.
- `gui` — launch the FastAPI backend and Next.js frontend together for the local dashboard.
- `research "<objective>"` — run the full pipeline; write run + report.
- `demo` — canned end-to-end run for judges.
- `inspect runs/latest` — print a run's artifacts.
- `compact runs/latest --budget 1000` — run the ResearchTrace Compiler on a trace.
- `memory search "<query>"` — query Tier 3 lessons (vector search).
- `research-url <url>` — Browserbase path into `PriorArtTheme`.

## How it connects

`cli/` → `pipeline/` (orchestration) and `workspace/` (I/O). It should hold **no**
business logic — if logic creeps in here, it belongs in `pipeline/`.

## Common workflow

```bash
quantcode strategy
quantcode check
quantcode check --learn
quantcode iterate run_025 --strategy "Post-Earnings Announcement Drift Momentum"
quantcode check run_025 --strategy "Post-Earnings Announcement Drift Momentum"
quantcode gui
```

`strategy` is the terminal-first alias for creating strategies from an objective. `check`
is the terminal-first review step: it runs the keyless EOD backtest and pulls relevant
arXiv papers plus Google News headlines. `check --learn` adds one automatic backtest-learning
round plus one approved re-test round. None of these commands deploy or trade.

## ❓ Open questions (ask human)

- [ ] Does `demo` require live Redis + LLM, or a recorded/offline mode for stage safety?
- [ ] `inspect runs/latest` — is `latest` a symlink, a pointer file, or newest-by-mtime?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before `init` writes/overwrites `.env` or non-empty workspace dirs: confirm.
- [ ] Before `research-url` hits a live page (Browserbase credits + scraping a real
      site): confirm the URL with the human.
