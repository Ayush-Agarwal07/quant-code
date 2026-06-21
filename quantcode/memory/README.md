# memory/

**Status:** scaffold — not implemented. **★ Primary sponsor track: Redis (ALL IN).**

## Purpose

> Library docs + the "adopt Redis Agent Memory Server vs hand-roll" decision:
> [`../../docs/sponsor_tech_references.md`](../../docs/sponsor_tech_references.md).

The Redis-backed agent memory substrate — **not a cache**. This is QuantCode's
strongest pitch. The Redis bounty rewards "beyond caching: agent memory, vector
search, context retrieval." This module is exactly that, in three tiers.

## What to implement

A Redis client wrapper + three tier submodules:

- `tier1_working/` — raw run trace, TTL'd. (working memory)
- `tier2_episodic/` — one record per run. (episodic memory)
- `tier3_semantic/` — durable lessons + **vector search**. (semantic memory)

Key schema (`docs`, namespaced by `config.redis_namespace`):

```
qc:run:{run_id}:trace     # Tier 1, TTL
qc:episode:{run_id}       # Tier 2
qc:lesson:{lesson_id}     # Tier 3
qc:context_pack:{pack_id} # compacted retrieval object
qc:index:lessons          # vector / search index over Tier 3
```

## How it connects

`pipeline/` writes Tier 1 during a run and (via `MemoryCurator`) Tier 2/3 after
compaction. New runs **retrieve Tier 3 only** by default — never replay full Tier 1.
`cli memory search` and the dashboard memory-explorer panel read here.

The **second-run demo is the proof of learning** and the centerpiece of the Redis
pitch: Run 1 gets a critique → lesson promoted to Tier 3 → Run 2 retrieves it and
changes behavior. Build for that demo.

## Implementation instructions

1. One connection from `config.redis_url`; pass it down to the tiers.
2. Don't reinvent storage in each tier — share the client + key-builder here.
3. Vector search is what makes this "beyond caching" — see `tier3_semantic/`.

## ❓ Open questions (ask human) — these decide the whole track

- [ ] **Redis client lib + vector engine.** The bounty name-drops "Redis Iris";
      RediSearch/`redis-py` is the common path. Which one? Managed Redis Cloud or
      local? (Not a current dependency.)
- [ ] Embedding model for the vector index (who generates vectors — the LLM provider?
      a separate embedder?). Ties to the undecided LLM backend.
- [ ] Does `MemoryCurator` live in `agents/` or here?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before first connecting to a **non-local / Redis Cloud** instance (credits,
      shared state): confirm with human.
- [ ] Before any operation that flushes or bulk-deletes keys: confirm.
