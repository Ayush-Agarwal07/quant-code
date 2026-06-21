# browser/

**Status:** scaffold — not implemented. **Sponsor track: Browserbase (CONFIGURED).**

## Purpose

`BrowserResearcherAgent` — the `research-url <url>` path. Fetches a web page and
turns it into prior-art / mechanism evidence. The bounty requires the agent be
**genuinely powered by the Browserbase platform** — a plain `requests.get` does not
qualify.

## What to implement

- A Browserbase-powered fetch/browse of a given URL.
- Extraction of content into one or more `PriorArtTheme` (`schemas/`), **not** raw
  hypotheses — keep the schema boundary clean: URL → `PriorArtTheme` → normal pipeline.

## How it connects

`cli research-url` → this agent → `PriorArtTheme`s → `pipeline.run_from_url`, which
injects them where `PriorArtDiscoveryAgent` output normally goes. Uses
`config.browserbase_api_key` / `config.browserbase_project_id`.

## Implementation instructions

1. Use a Browserbase entrypoint that counts for the bounty: browsers, search, fetch,
   Stagehand, or Browse CLI. Pick one and use it for real.
2. Fail clearly if the API key is unset (don't silently fall back to plain HTTP —
   that would void the track).
3. Keep extraction → `PriorArtTheme` mapping in `schemas/`-typed code.

## ❓ Open questions (ask human)

- [ ] **Which Browserbase product/SDK** (Stagehand vs Browse CLI vs fetch/search)?
      Not a current dependency.
- [ ] Does extraction need the LLM (parse page → themes), tying it to the undecided
      LLM backend, or can it be deterministic scraping?
- [ ] Allow-list of URLs/domains for the demo, or arbitrary user URLs?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before any **live fetch** — it spends Browserbase credits and scrapes a real
      site: confirm the URL with the human first.
- [ ] Confirm robots/ToS posture for demo target sites before scraping.
