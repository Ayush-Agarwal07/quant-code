# 08 — Benchmarks

**Status:** DONE (2026-06-21 — benchmarks 1 + 2, no new deps). **Priority:** low. **Effort:** M. **🧑‍⚖️ HITL:** any new dep (e.g. RAGAS).

**What shipped:** `quantcode/benchmarks.py` (`python -m quantcode.benchmarks` or `quantcode
benchmarks`) — deterministic, offline, **no new dependency** (RAGAS avoided: ROUGE-L is a
~10-line stdlib LCS; retrieval uses the existing semantic search), so no HITL dep approval needed.
- **B1 Compaction quality:** 60 synthetic traces with LABELED must-retain decisions →
  **slot-fill recall 100%** (every decision survives, budget-independent), **ROUGE-L recall
  0.876** (oracle coverage), **6.08x compression @ budget 150** (measured bge tokenizer).
- **B2 Memory retrieval:** seed 5 known lessons, query with paraphrases → **recall@1 80%,
  recall@3 100%, MRR 0.900** on real bge embeddings (ranking is backend-independent — same
  cosine on RediSearch or in-memory; warm caches via `quantcode warmup` for the real figure).
Self-check asserts recall thresholds (compaction always; retrieval only on the real model).

**Bonus fix:** `tests/test_selfchecks.py` now pins `QC_LLM_PROVIDER=mock` (alongside the existing
`QC_MEMORY_BACKEND=memory`) so the offline self-checks stay deterministic regardless of a real
provider configured in `.env`.

**Not built (optional, acceptance was 1+2):** B3 hallucination/critic-pass-rate, B4 pipeline
token-efficiency. RAGAS faithfulness (LLM-judge) intentionally skipped to stay dep-free + offline.

## Why it matters
`docs/benchmarks.md` lays out evals that would back the pitch with numbers (compaction quality,
memory recall, hallucination rate, pipeline efficiency). None are implemented. Measured metrics
are differentiating, especially for the Token Company and Redis tracks.

## Candidates (priority order from docs/benchmarks.md)
1. **Compaction ROUGE-L + slot-fill rate** — build ~50–100 synthetic traces with labeled
   must-retain decisions; compress; measure ROUGE-L vs oracle + slot-fill. (Medium)
2. **Memory retrieval recall (RAGAS + failure-avoidance F1)** — seed known failed strategies in
   Tier 2/3; run similar objectives; measure recall/faithfulness/false-positive. RAGAS is
   pip-installable → 🧑‍⚖️ dep approval. (Low)
3. **Hallucination via critic pass rate** — seed ~100 flawed specs; use `ResearchCriticAgent`
   as grader; track accept/revise/reject distribution. (Low–Med)
4. **Pipeline token efficiency** — token/time per agent step from `trace_events`. (Low)

## Current state
- Trace events are typed (`TraceEvent`) and carry the seam for token/time metrics.
- No benchmark harness, datasets, or RAGAS dep.

## Acceptance
At least benchmarks 1 + 2 produce measured, reproducible numbers usable in the pitch, with any
new dependency approved first.

## Refs
`docs/benchmarks.md`, `quantcode/compaction/`, `quantcode/memory/`, `quantcode/agents/research_critic.py`.
