# 08 — Benchmarks

**Status:** OPEN (none built). **Priority:** low. **Effort:** M. **🧑‍⚖️ HITL:** any new dep (e.g. RAGAS).

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
