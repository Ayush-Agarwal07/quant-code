# memory/tier1_working/

**Status:** scaffold — not implemented. (Redis Tier 1 — Working Trace)

## Purpose

Short-lived working memory for a single run/session: raw agent events, tool calls,
intermediate outputs, trace chunks. It is noisy and **expires**. Durable memory is
never promoted directly from here — it goes through `../../compaction/` first.

## What to implement

- Write trace events under `qc:run:{run_id}:trace` with a TTL.
- Read a run's trace back (for the compiler and the dashboard timeline).
- Set TTL from `config.tier1_ttl_seconds`.

## How it connects

`pipeline/` writes events here during a run. `../../compaction/` reads the full
trace to extract candidate lessons. After TTL, it's gone — that's intended.

## Implementation instructions

1. Append-friendly structure (Redis list or stream) keyed by `run_id`.
2. Apply TTL on first write; refresh only if a run legitimately runs long.
3. Store references/ids to large artifacts (which live in `workspace/`), not copies.

## ❓ Open questions (ask human)

- [ ] TTL value: `config` defaults to 3600s — docs only say "should expire." Confirm.
- [ ] Storage type: Redis list vs stream vs hash-per-event?
- [ ] Event schema — shared with `pipeline/` trace events; where defined?

## 🧑‍⚖️ HITL checkpoints

- [ ] None expected (ephemeral data). If anyone proposes making Tier 1 durable,
      stop — that breaks the cache-vs-memory story.
