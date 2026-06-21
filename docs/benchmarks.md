# Benchmarks

## Overview

This document catalogues benchmarks for evaluating QuantCode's key capabilities: context
compaction, hallucination rate, memory retrieval quality, research pipeline quality, and
end-to-end strategy validity.

> Note: references to components as "already built" / "existing" (e.g. `ResearchCriticAgent`,
> `AgentTrace` schemas) point at the `deprecated/` baseline being rebuilt in `quantcode/`.
> Observability is out of scope — Arize/Sentry are not used; instrument from the in-process
> pipeline trace instead.

---

## 1. Compaction Quality

**Approach: CCF / ROUGE-L + slot-fill rate**

Build ~50–100 synthetic research traces with labeled "must-retain" decisions (failed
hypotheses, data constraints, critique verdicts). Compress with `CompactorAgent`, then
measure:

- **ROUGE-L** against oracle key points extracted from the full trace
- **Slot-fill rate**: did each context-pack slot (failures, patterns, constraints, critic
  instructions) get populated with a meaningful entry?

The existing `AgentTrace` Pydantic schemas make it straightforward to label ground truth.

**Effort: Medium** — requires building a labeled trace dataset (~50–100 runs).

**References**
- [CCF: A Context Compression Framework](https://arxiv.org/pdf/2509.09199)
- [LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding](https://aclanthology.org/2024.acl-long.172/)
- [Prompt Compression in the Wild](https://arxiv.org/pdf/2604.02985)

---

## 2. Hallucination in Strategy Specs

**Approach: Custom "FinQuant" eval with LLM-as-judge**

Seed ~100 strategy specs with known flaws:
- Impossible or unavailable data requirements
- Look-ahead bias in feature construction
- Circular logic (signal derived from the target itself)
- Features absent from the feature catalog

Use `ResearchCriticAgent` (already built) as the grader. Track verdict distribution:
accept / revise / reject. Baseline: HaluBench reports ~17% hallucination rate in financial
contexts with general LLMs — the critic should push this significantly lower.

**Effort: Low–Medium** — domain expertise needed to seed realistic bad specs; the critic
is already the grader.

**References**
- [HaluBench / HaluEval](https://www.emergentmind.com/topics/halueval-and-truthfulqa)
- [HalluLens: LLM Hallucination Benchmark](https://arxiv.org/pdf/2504.17550)
- [Deficiency of Large Language Models in Finance](https://arxiv.org/pdf/2311.15548)

---

## 3. Memory Retrieval Quality

**Approach: RAGAS off-the-shelf + custom failure-avoidance F1**

1. Inject known failed strategies into Redis Tier 2/3 episodic memory.
2. Run new research on semantically similar objectives.
3. Measure:
   - **Retrieval recall**: did the system surface the relevant failure before hypothesis
     generation?
   - **Faithfulness**: is the retrieved lesson accurately represented in the context pack?
   - **False-positive rate**: how often does the system surface irrelevant lessons?

RAGAS works out of the box for faithfulness and relevance; add a simple F1 scorer for
failure-avoidance recall using a seeded failure registry.

**Effort: Low** — RAGAS is pip-installable; just needs seeded failure data in Redis.

**References**
- [Complete Guide to RAG Evaluation](https://www.getmaxim.ai/articles/complete-guide-to-rag-evaluation-metrics-methods-and-best-practices-for-2025/)
- [RAGPerf: An End-to-End Benchmarking Framework](https://arxiv.org/html/2603.10765v1)
- [A Systematic Review of Key RAG Systems](https://arxiv.org/pdf/2507.18910/)

---

## 4. End-to-End Strategy Quality

**Approach: AlphaForgeBench backtesting harness**

AlphaForgeBench (arxiv 2602.18481) evaluates LLM-generated strategies via actual
backtesting — 903 strategies across crypto and equity — using Sharpe ratio, max drawdown,
and hit rate as primary metrics.

Adapt their harness to consume `StrategySpec` YAML once Milestone 3 (real backtester) is
complete. Key metrics:
- **Compilation success rate**: does the strategy parse and execute without errors?
- **Sharpe ratio distribution** across generated strategies
- **Cost efficiency**: computational cost per alpha factor

**Effort: Medium** — blocked on Milestone 3 backtester; not a hackathon target.

**References**
- [AlphaForgeBench: Benchmarking End-to-End Trading Strategy Design](https://arxiv.org/pdf/2602.18481)
- [Automate Strategy Finding with LLM in Quant Investment](https://arxiv.org/html/2409.06289v4)
- [QuantEval: A Benchmark for Financial Quantitative Tasks](https://arxiv.org/pdf/2601.08689)

---

## 5. Pipeline Instrumentation

**Approach: Stage-exit metrics (in-process)**

Instrument each agent with:
- **Token count** in / out
- **Wall time** per agent step
- **Output validity**: does the output parse as a valid Pydantic model? (`extra="forbid"`)
- **Critic pass rate**: what fraction of `StrategySpec` outputs survive `ResearchCriticAgent`
  with verdict `accept`?

Emit these from the pipeline's Tier 1 trace events — no external observability vendor
(Arize/Sentry are out of scope). The token/time metrics still feed the Token Company
compaction story.

> Seam (ponytail): keep trace events **structured/typed** (one record per agent step,
> not free-text logs) and put export behind a `QC_TRACE_EXPORTER` config (`none` default).
> Today the only sink is Redis Tier 1; adding Arize/OTel later is then a single exporter
> reading the same records — no agent or pipeline changes. The only thing that makes this
> expensive later is logging unstructured strings now, so don't.

**Effort: Low** — instrumentation only; no new dataset required.

**References**
- [A Unified Framework for LLM Agentic Capabilities](https://arxiv.org/html/2605.27898v1)
- [Methodology for Quality Assurance Testing of LLM-based Multi-Agent Systems](https://dl.acm.org/doi/full/10.1145/3703412.3703439)
- [A Multi-Agent Framework for Dynamic LLM Evaluation](https://aclanthology.org/2025.coling-main.223.pdf)

---

## Recommended Priority

| Priority | Benchmark | Effort | Why |
|---|---|---|---|
| **1** | Compaction ROUGE-L + slot-fill rate | Medium | Direct demo of ResearchTrace Compiler — visual and differentiating |
| **2** | Memory retrieval recall (RAGAS) | Low | Shows Redis memory avoids repeated failures |
| **3** | Hallucination rate via critic pass rate | Low–Medium | Critic already built; measure verdict distribution |
| **4** | Pipeline token efficiency (in-process trace) | Low | Easy to instrument; shows cost discipline |
| **5** | AlphaForgeBench strategy quality | Medium | Long-term target; blocked on Milestone 3 backtester |
