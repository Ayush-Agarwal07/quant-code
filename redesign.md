# QuantCode Redesign — De-sponsoring for Open Source

The hackathon is over. This redesign strips the required paid/vendor services so
`pip install quant-code` works with **zero servers, zero API keys, fully offline**.
Sponsor tech stays available as opt-in extras.

## What changed

### 1. BrowserBase → stdlib HTTP GET (+ optional Playwright)
- `quantcode/browser/agent.py`: `_fetch_html()` is now a stdlib `urllib` GET by default.
  Set `QC_BROWSER_RENDER=1` (+ `[browser]` extra) to render JS pages with **local**
  Playwright. No BrowserBase SDK, no credits, no project ID.
- Live fetch is still HITL-gated on `confirm=True`. Pipeline fetching is off by default
  (`QC_BROWSER_FETCH=1` to opt in), so `quantcode strategy` stays offline/deterministic.
- `source_type` renamed `browserbase_url` → `web_url` (free string, no schema break).

### 2. Redis → local SQLite default (Redis opt-in)
- `quantcode/memory/client.py`: new `SQLiteBackend` (default) persists Tier 2/3 to a
  single local file. KNN = brute-force cosine in Python (fine for hundreds of lessons).
- `RedisMemory` class renamed → `MemoryClient` (it's no longer Redis-specific).
- Backend selection via `QC_MEMORY_BACKEND`: `sqlite` (default) | `memory` | `redis`.
  Redis falls back to SQLite if unreachable. Removed the `QC_ALLOW_REMOTE_REDIS` gate.
- Three tiers unchanged conceptually; only the backing store changed.

### 3. fastembed → optional `[embeddings]` extra
- The deterministic hash embedding is now the **documented default** (no model download).
- Install `[embeddings]` for real semantic ranking (BAAI/bge-small) — used automatically
  when present. Same extra brings `tokenizers` for measured compaction token counts;
  without it, counts fall back to a clearly-labeled estimate.

### 4. Compaction stays deterministic
Kept the extractive (deletion-based) compactor. It's offline, free, predictable, and
needs no API key — the right default for open source. An LLM compactor would force the
`[llm]` extra on everyone; not worth it.

## New dependency shape (`pyproject.toml`)

**Core (all free/local):** `pydantic`, `python-dotenv`, `rich`, `typer`, `pyyaml`.

**Extras:**
- `[embeddings]` → `fastembed` (real semantic vectors + measured tokens)
- `[browser]` → `playwright` (JS rendering; no BrowserBase)
- `[redis]` → `redis` (optional Redis + RediSearch backend)
- `[llm]` → `anthropic` (real Claude path)
- `[dev]` → mypy, pytest, ruff, types-PyYAML

No new core deps added (reused stdlib `urllib`, `sqlite3`, and the existing pure-Python
`cosine()` — no `httpx`/`numpy` needed).

## Config / env (`quantcode/config.py`, `.env.example`)
- Added: `QC_DB_PATH` (default `<workspace>/memory/quantcode.db`), `QC_NAMESPACE`,
  `QC_BROWSER_FETCH`, `QC_BROWSER_RENDER`.
- Removed: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `QC_ALLOW_REMOTE_REDIS`,
  `REDIS_NAMESPACE` (→ `QC_NAMESPACE`).
- `REDIS_URL` / `QC_TIER1_TTL` kept but used only by the opt-in Redis backend.

## Verified
- `python -m quantcode.config` / `.browser` / `.memory` self-checks pass.
- SQLite default persists lessons + episodes across reconnects; search works.
- `quantcode.cli`, `.pipeline`, `.benchmarks`, `.agents.prior_art_discovery` import clean.

## Remaining (docs-only, non-blocking)
Cosmetic "Redis"/"Browserbase" mentions still in: `README.md`, `redis_implementation.md`,
`docs/*.md`, `leftover_tasks/*.md`, and a few in-code help strings
(`cli/__init__.py` memory-app help, `pipeline/__init__.py` comments). Update or delete
when polishing docs; none affect runtime. Optional: vendor `tokenizer.json` into
`quantcode/data/` to get measured token counts without the `[embeddings]` extra.
