# 04 — Live Browserbase `research-url`

**Status:** DONE (2026-06-21 — verified live on 3 real Browserbase sessions). **Priority:** med. **Effort:** M. **🧑‍⚖️ HITL:** live fetch (credits + scraping a real site).

**Verified live:** installed `[browser]` extra + `playwright install chromium`; ran
`research-url --confirm` against `arxiv.org/abs/2105.13727` (run_021, then run_023 after the
extractor fix) and `finance.yahoo.com/quote/AAPL` (run_022). All three were real Browserbase
sessions (COMPLETED, us-west-2), provenance `source_url` set, pipeline ran to a packet — bounty
requirement (genuinely Browserbase-powered, no HTTP fallback) met. SDK API confirmed current
(`sessions.create → SessionCreateResponse.connect_url`, browserbase 1.13.0 / playwright 1.60.0).

**Extractor fix (the first run grabbed nav/footer chrome):** `_TextExtractor` now collects
`<blockquote>` (captures the arXiv abstract) and skips layout chrome (`header`/`nav`/`footer`/
`aside`). arXiv now yields the real title + abstract with `mechanism=momentum`. Also: `_fetch_html`
guards a missing `BROWSERBASE_PROJECT_ID` with a clear error; mypy now type-checks the live SDK
calls (browserbase/playwright added to the optional-dep overrides). Full gate green.

**Honest caveats:** (1) Yahoo Finance hit bot-detection (served an error page) and has no strategy
prose — keep arXiv as the demo target; (2) extractor is deterministic/heuristic (skips ALL
`<header>`, so an `<article><header><h1>` title could be missed on other sites) — fine for v1,
a real-LLM enrich is the future option. Keys live in `.env` (gitignored); project id auto-resolved
from the API key via `bb.projects.list()`.

## Why it matters
Browserbase is a committed track. The deterministic offline extraction (`extract_from_html`)
is tested, but the live `run_url` path (Browserbase SDK + Playwright `connect_over_cdp`) has
never run. The bounty requires the agent be genuinely powered by Browserbase — a plain HTTP
fetch would void it (the code already refuses to fall back to HTTP).

## Current state
- `quantcode/browser/agent.py`: `run_url(url, *, confirm=False)` lazy-imports `browserbase` +
  `playwright`; raises clearly if `confirm` is False or the API key is unset.
- `browserbase` + `playwright` declared in the `[browser]` extra but NOT installed.

## Steps
1. Install deps: `.venv/bin/python -m pip install -e ".[browser]"` then
   `.venv/bin/playwright install chromium`.
2. Configure env: `BROWSERBASE_API_KEY=…`, `BROWSERBASE_PROJECT_ID=…`.
3. Confirm robots/ToS for the target URL (human call), pick an allowed prior-art page.
4. Live run (explicit gate): `.venv/bin/quantcode research-url <url> --confirm`.
5. Verify it returns ≥1 `PriorArtTheme` with `source_url` set and the pipeline runs to a packet.

## Risks (live-only)
- `connect_over_cdp` / Browserbase session lifecycle untested in this codebase.
- Browserbase SDK API drift vs the pinned `>=1.0,<2`.
- Extraction is deterministic (stdlib `html.parser`) — fine, but a real-LLM enrich step is a
  future option, not built.

## Acceptance
`quantcode research-url <url> --confirm` performs a real Browserbase fetch, yields ≥1
`PriorArtTheme` with provenance, and the normal pipeline produces a packet.

## Refs
`quantcode/browser/agent.py`, `docs/sponsor_tech_references.md`, `DECISIONS.md` (browser track).
