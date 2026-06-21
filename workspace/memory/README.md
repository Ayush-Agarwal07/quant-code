# workspace/memory/

**Status:** scaffold — empty (generated output).

## Holds

Compacted **context packs** as JSON (`context_pack_N.json`) — the file-side mirror of
what `compaction/` produces and what's stored at `qc:context_pack:{id}` in Redis.
Each carries provenance (which run/trace it came from) and the compression metrics.

> This is the *artifact* copy. The live retrieval memory (Tier 1/2/3 lessons) lives
> in **Redis** via `quantcode/memory/`, not here.

## Format

`quantcode/schemas/` `ContextPack`: compacted lessons/context + metrics
(tokens_before/after, ratio, lessons retained, duplicates removed, budget). Metrics
must be **measured** (Token Company track).

## ❓ Open questions (ask human)

- [ ] Redundancy: keep context packs both here and in Redis, or is one canonical?
- [ ] Naming alignment with `context_pack_id` used for the Redis key.

## 🧑‍⚖️ HITL checkpoints

- [ ] Before publishing the metrics in a pack as demo numbers: confirm they're
      measured + reproducible.
