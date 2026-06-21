# Sponsor Tech References — Redis & Browserbase

Official documentation for the integrations we're committing to. Decided priorities:
**Redis (all in)**, **Browserbase (configured)**. See `architecture.md` "Sponsor
Strategy" for why. This page is the implementation starting point and feeds the open
questions in `../quantcode/memory/` and `../quantcode/browser/`.

## Redis (all in — memory substrate)

| Resource | What it gives us | Link |
|---|---|---|
| **Redis Iris** (the platform the bounty name-drops) | Context + memory layer: two-tier memory (session + long-term), long-term backed by **vector search + TTL** | [redis.io/iris](https://redis.io/iris/) · [getting started](https://redis.io/tutorials/getting-started-with-redis-iris/) |
| **Redis Agent Memory Server** (OSS, **Python SDK**) | `pip install agent-memory-client` — working vs long-term memory, semantic/hybrid search, promotion, dedup, **and compaction**; REST + MCP | [github](https://github.com/redis/agent-memory-server) · [docs](https://redis.github.io/agent-memory-server/) · [long-term memory](https://redis.github.io/agent-memory-server/long-term-memory/) · [quick start](https://redis.github.io/agent-memory-server/quick-start/) |
| **RedisVL** (AI-native Python client) | If we hand-roll tiers: schema, index, vector ops | [github](https://github.com/redis/redis-vl-python) |
| **redis-py vector search / RediSearch** | Raw path: `VectorField` FLAT/HNSW, `DIM` / `DISTANCE_METRIC` | [concepts](https://redis.io/docs/latest/develop/ai/search-and-query/vectors/) · [vector queries](https://redis.io/docs/latest/develop/ai/search-and-query/query/vector-search/) · [redis-py example](https://redis.readthedocs.io/en/stable/examples/search_vector_similarity_examples.html) |
| Redis for AI (hub) | Entry point for all of the above | [redis.io/docs/latest/develop/ai](https://redis.io/docs/latest/develop/ai/) |

## Browserbase (configured — `research-url`)

| Resource | Fit | Link |
|---|---|---|
| **Browserbase Python SDK** | `pip install browserbase`, Python 3.9+, sync+async, sessions via Playwright `connect_over_cdp` — natural fit for our Python codebase | [docs](https://docs.browserbase.com/reference/sdk/python) · [github](https://github.com/browserbase/sdk-python) · [PyPI](https://pypi.org/project/browserbase/) · [playwright quickstart](https://github.com/browserbase/quickstart-playwright-python) |
| **Stagehand** | act/extract/observe/agent; routes LLM through your Browserbase key (no separate model account) — but **TS/npm-first** | [docs](https://docs.browserbase.com/introduction/stagehand) · [github](https://github.com/browserbase/stagehand) |

## What this resolves (don't build what's already built)

1. **`browser/` SDK question → answered.** Use the **Browserbase Python SDK +
   Playwright**, not Stagehand (Stagehand is TS-first; we're Python). Stagehand only
   earns its place if we add a JS surface.

2. **`memory/` + `compaction/` → a real decision, not a default.** The **Redis Agent
   Memory Server** already implements two-tier memory + vector search + TTL +
   promotion + compaction with a Python SDK — roughly 80% of our hand-rolled
   `memory/` design. Adopting it could delete a lot of code.
   - Caveat 1: it imposes its own model, which may fight our exact
     `qc:run / qc:episode / qc:lesson` 3-tier key schema.
   - Caveat 2: our **ResearchTrace Compiler is a deliberate Token Company
     differentiator** with custom, measured token metrics — keep our own compaction
     layer even if AMS handles storage.
   - **Open decision (human):** adopt AMS for storage vs hand-roll on
     RedisVL/redis-py. Tracked in `../quantcode/memory/README.md`.

## Sources

- Redis Iris — https://redis.io/iris/
- Redis for AI docs — https://redis.io/docs/latest/develop/ai/
- Redis Agent Memory Server — https://github.com/redis/agent-memory-server
- RedisVL — https://github.com/redis/redis-vl-python
- redis-py vector search — https://redis.io/docs/latest/develop/ai/search-and-query/vectors/
- Browserbase Python SDK — https://docs.browserbase.com/reference/sdk/python
- Stagehand — https://docs.browserbase.com/introduction/stagehand
- Compaction algos : https://devpost.com/software/solace-an-agentic-ai-platform-for-end-to-end-clinical-care
- Compation algo 2: http://devpost.com/software/distill