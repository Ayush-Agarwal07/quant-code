# 04 — Live Browserbase `research-url`

**Status:** OPEN. **Priority:** med. **Effort:** M. **🧑‍⚖️ HITL:** live fetch (credits + scraping a real site).

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
