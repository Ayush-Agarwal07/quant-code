# memory/tier3_semantic/

**Status:** scaffold — not implemented. **★ The Redis pitch lives here (vector search).**

## Purpose

Compact, durable, reusable lessons: warnings, successful patterns, data constraints,
mutation rules. New runs retrieve these **by default** (not raw traces). The
**vector search over lessons** is what makes the Redis track "beyond caching" — this
submodule is the headline of the headline.

## What to implement

- Write a lesson under `qc:lesson:{lesson_id}` with its embedding.
- Maintain the vector index `qc:index:lessons`.
- `search(query, k)` — semantic retrieval of the top-k relevant lessons (powers both
  `cli memory search` and the pre-run retrieval in `pipeline/`).

## How it connects

`MemoryCurator` promotes validated candidate lessons here. `pipeline/` queries
`search()` at the **start** of every run and injects results as context — this is
the mechanism behind the second-run learning demo. The dashboard memory-explorer
reads lessons + their scores.

## Implementation instructions

1. Use Redis vector search (RediSearch / Redis Iris — see open question), not a
   manual scan. The point is to show real vector retrieval.
2. Each lesson carries provenance (which run/critique produced it) so the demo can
   show *why* a warning exists.
3. Self-check: store two lessons, query a paraphrase of one, assert it ranks first.

## ❓ Open questions (ask human) — track-defining

- [ ] **Vector engine + embedding model.** RediSearch HNSW vs Redis Iris? Which
      embedder generates lesson vectors (LLM provider's? a dedicated model)? Both
      tie to the undecided LLM backend and the Redis client choice in `../README.md`.
- [ ] Lesson dedup/merge: how to avoid near-duplicate lessons accumulating?
- [ ] Retrieval count `k` and any relevance threshold for injection into a run.

## 🧑‍⚖️ HITL checkpoints

- [ ] **Promotion gate:** before any candidate lesson is written here, `MemoryCurator`
      must surface it for human approval. Tier 3 is the agent's long-term belief set —
      junk here poisons every future run.
