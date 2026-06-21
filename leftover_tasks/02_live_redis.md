# 02 — Live Redis smoke-test (Docker / Homebrew / Redis Cloud)

**Status:** OPEN (deferred — Docker not installed). **Priority:** high. **Effort:** L (~15 min once a server is up).

## Why it matters
Redis is the headline sponsor track. The offline in-memory fallback is CI-tested, but the
real `RedisBackend` path (`FT.CREATE` vector index + server-side KNN, TTL'd Tier 1) has never
run against a live server. Static review passed (no obvious bugs), but a live run is the proof.

## Current state
- `RedisBackend` implemented in `quantcode/memory/client.py` (HNSW, DIM 384, COSINE).
- No Redis/Docker on the machine; Homebrew is available.
- Full setup walkthrough already written: [`../redis_implementation.md`](../redis_implementation.md).

## Steps (pick a server, then smoke-test)
1. **Server** — Docker: `docker run -d -p 6379:6379 -p 8001:8001 redis/redis-stack:latest`
   · or Homebrew: `brew tap redis-stack/redis-stack && brew install redis-stack && redis-stack-server`.
2. **Run on real Redis** (do NOT set `QC_MEMORY_BACKEND`):
   `.venv/bin/quantcode demo` → panel must read `memory backend: redis`.
3. **Verify the bounty surface:**
   - `redis-cli KEYS 'qc:*'` (trace/episode/lesson keys)
   - `redis-cli FT._LIST` → `qc:index:lessons`; `redis-cli FT.INFO qc:index:lessons`
   - `redis-cli TTL qc:run:run_001:trace` (Tier 1 expires; Tier 2/3 = -1)
   - `.venv/bin/quantcode memory search "earnings proxy weakness"` → ranked lessons, `(backend: redis)`

## Redis Cloud variant (🧑‍⚖️ HITL — prize credits)
Set `REDIS_URL=rediss://…` + `QC_ALLOW_REMOTE_REDIS=1` (required; QuantCode refuses non-local
URLs otherwise). Enable the Search & Query capability on the Cloud DB.

## Risks to watch (only a live run surfaces these)
- Float32 byte order — `struct.pack("{n}f")` is native; fine on macOS/Linux (LE). Switch to
  `"<f"` if you ever target a BE platform.
- `FT.SEARCH` return shape across redis-py patch versions (stable in 5.x/6.x).

## Acceptance
`quantcode demo` runs with `backend: redis`, the vector index exists, and `memory search`
returns cosine-ranked lessons — all against a real Redis Stack.

## Refs
`../redis_implementation.md`, `quantcode/memory/client.py`, `DECISIONS.md` D2.
