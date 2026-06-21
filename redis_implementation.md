# Redis Stack — live setup for QuantCode

QuantCode runs fully offline on an in-memory fallback (`QC_MEMORY_BACKEND=memory`), but the
Redis sponsor track is the headline. To demo it for real — visible `qc:*` keys, a real
RediSearch vector index, TTL'd working memory — you need **Redis Stack**, then just point
QuantCode at it and run the demo.

## Why Redis Stack (not plain `redis-server`)

QuantCode's Tier 3 semantic memory uses **vector search** (`FT.CREATE … VECTOR … KNN`).
That's the RediSearch module, which vanilla `redis-server` does **not** ship. Redis Stack
(and Redis Cloud) bundle it. Without the search module the client falls back to in-memory.

## Option A — Docker (recommended)

```bash
# Server + RedisInsight GUI (great for showing judges the keys + vector index visually)
docker run -d --name quantcode-redis -p 6379:6379 -p 8001:8001 redis/redis-stack:latest

# …or server only (no GUI):
# docker run -d --name quantcode-redis -p 6379:6379 redis/redis-stack-server:latest

docker ps                      # confirm it's up
redis-cli ping                 # -> PONG   (install redis-cli, or use `docker exec -it quantcode-redis redis-cli`)
```

RedisInsight GUI: open <http://localhost:8001> — browse keys and the vector index live.

Stop / remove when done:

```bash
docker stop quantcode-redis && docker rm quantcode-redis
```

## Option B — Homebrew (macOS)

```bash
brew tap redis-stack/redis-stack
brew install redis-stack
redis-stack-server            # runs in the foreground on :6379
```

## Option C — Redis Cloud (the "Iris" platform; prize includes Cloud credits) — 🧑‍⚖️ HITL-gated

Connecting to a non-local Redis is gated (credits + shared state). QuantCode refuses a
non-local `REDIS_URL` unless you explicitly opt in.

1. Create a free database at <https://redis.io/cloud/> (enable the **Search and Query**
   capability so vector search works).
2. Set the connection string and the opt-in flag in `.env`:

   ```bash
   REDIS_URL=rediss://default:<password>@<host>:<port>
   QC_ALLOW_REMOTE_REDIS=1        # required — otherwise QuantCode falls back to in-memory
   ```

## Configure QuantCode

Defaults already target local Redis — there's nothing to set for Option A/B beyond having
the server up. The relevant env vars (see `.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | connection string |
| `REDIS_NAMESPACE` | `qc` | key prefix → `qc:run:…`, `qc:lesson:…` |
| `QC_TIER1_TTL` | `3600` | Tier 1 working-trace TTL (seconds) |
| `QC_ALLOW_REMOTE_REDIS` | _(unset)_ | must be `1` to connect to a non-local URL |
| `QC_MEMORY_BACKEND` | _(unset)_ | set to `memory` to force the offline fallback |

**To use real Redis, make sure `QC_MEMORY_BACKEND` is NOT set to `memory`.**

## Run the demo on real Redis

```bash
# from the repo root, with the venv active or via .venv/bin/quantcode
.venv/bin/quantcode demo
```

The demo panel prints the backend it chose:

```
QuantCode demo — memory backend: redis        # <- proves it connected (not "memory")
```

It runs twice and promotes lessons to Tier 3 (the `demo` command is the explicit human
approval for the 🧑‍⚖️ Tier-3 promotion gate), so run 2 retrieves what run 1 learned.

Then query the vector index directly:

```bash
.venv/bin/quantcode memory search "earnings proxy weakness"
# table title shows  (backend: redis)  and ranks Tier 3 lessons by cosine score
```

## Inspect what QuantCode wrote (the bounty surface)

```bash
redis-cli KEYS 'qc:*'                       # qc:run:*:trace, qc:episode:*, qc:lesson:*
redis-cli FT._LIST                          # -> "qc:index:lessons"  (the vector index)
redis-cli FT.INFO qc:index:lessons          # dims=384, COSINE, doc count
redis-cli TTL qc:run:run_001:trace          # Tier 1 expires; Tier 2/3 do not (-1)
```

Or browse it all visually in RedisInsight (<http://localhost:8001>).

## How QuantCode uses Redis (key schema)

| Key | Tier | Written by | Notes |
|---|---|---|---|
| `qc:run:{run_id}:trace` | 1 — working trace | `pipeline` per agent step | Redis list, **TTL'd** |
| `qc:episode:{run_id}` | 2 — episodic | `MemoryCurator` | durable, one per run |
| `qc:lesson:{lesson_id}` | 3 — semantic | `MemoryCurator.promote` (gated) | carries a 384-d embedding |
| `qc:index:lessons` | 3 — index | `SemanticMemory` | RediSearch vector index (KNN) |

Context packs are written as **file artifacts** under `workspace/memory/` (the `qc:context_pack:*`
key is reserved for a future Redis copy). Embeddings come from `fastembed`
(BAAI/bge-small-en, 384-d), with a deterministic hash fallback offline.

## Fallback & safety

- **No server / unreachable / wrong URL** → QuantCode auto-falls back to the in-memory
  backend and keeps working (the demo just shows `backend: memory`).
- **Force offline** (stage-safe, no Redis needed): `QC_MEMORY_BACKEND=memory quantcode demo`.
- 🧑‍⚖️ Gated: connecting to a non-local URL (`QC_ALLOW_REMOTE_REDIS=1`), and Tier-3 lesson
  promotion (`--promote` / `QC_AUTO_PROMOTE=1`). QuantCode never flushes or bulk-deletes keys.

## Troubleshooting

- `backend: memory` when you expected `redis` → server not up, `REDIS_URL` wrong, or a
  non-local URL without `QC_ALLOW_REMOTE_REDIS=1`. Check `redis-cli ping`.
- `FT._LIST` empty / search errors → you're on plain `redis-server`, not Redis Stack; the
  search module is missing. Use a `redis/redis-stack*` image or Redis Cloud with Search enabled.
- `memory search` returns nothing → no lessons promoted yet; run `quantcode demo` (it promotes).
- `redis-cli` not installed → use `docker exec -it quantcode-redis redis-cli …`.
