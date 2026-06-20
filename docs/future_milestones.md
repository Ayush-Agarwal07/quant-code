# Milestones

## Milestone 1 — Agentic Research Layer (complete)

Produce structured, data-aware research packets with deterministic mock behavior, critiques,
experiment plans, backtest stubs, and memory-write proposals.

**What exists:** 9-agent pipeline, strict Pydantic schemas, feasibility gate, offline anomaly
catalog, `MockLLMClient`, CLI (`qf run`), full test suite.

**What is stubbed:** backtesting, memory persistence, broker, live data.

---

## Milestone 2 — Redis Memory + Compaction + Workspace + Browserbase + Dashboard (build now)

Transform the CLI research engine into a Claude Code-style workspace agent.

**Build:**
- `MemoryCuratorAgent` — replaces `MemoryProposalAgent`; writes real Tier 2/3 entries to Redis
- `CompactorAgent` — ResearchTrace Compiler with measurable compression ratio and quality metrics
- `StrategyWriterAgent` — extends `StrategyFormalizerAgent` to write YAML files to `workspace/strategies/`
- `BrowserResearcherAgent` — Browserbase/Stagehand URL ingestion → `list[PriorArtTheme]`
- `redis_memory` tool — 3-tier interface (working memory, episodic, semantic lesson)
- `file_reader` / `file_writer` tools — workspace I/O
- `arize_tracer` tool — span per agent step
- `sentry_logger` tool — error capture on tool failures, schema errors, Redis unavailable
- New CLI commands: `quantcode init`, `quantcode research-url`, `quantcode inspect`,
  `quantcode memory search`, `quantcode compact`
- Local web dashboard: run timeline, strategy graph, memory explorer, compaction view,
  critique view

**Non-scope:** real broker, live market data, authentication, production deployment.

---

## Milestone 3 — Lightweight Backtester (stub → real)

Execute validated `StrategySpec` rules against point-in-time OHLCV data. Produce reproducible
result artifacts linked to the research packet that generated the strategy.

**Build:**
- OHLCV data loader (CSV or lightweight market data source)
- Feature computation matching the feature catalog
- Point-in-time rule evaluation engine (no look-ahead)
- Transaction cost model (fixed and proportional)
- `BacktestResultArtifact` schema replacing `BacktestResultStub`
- Integration into `MemoryCuratorAgent`: strategies with real backtest results are promoted
  to Tier 2 episodic memory with empirical evidence

**Non-scope:** live execution, portfolio-level optimization, multi-asset correlation.

---

## Milestone 4 — Richer Data Connectors (planned)

Add versioned connectors for market, event, fundamental, analyst, options, and alternative
data with explicit timestamp and quality guarantees.

Connectors expand the `DataFeasibilityVerdict` space: more hypotheses become `testable_now`
instead of `requires_new_data_source`.

---

## Milestone 5 — Paper Trading and Broker Adapter (planned)

Introduce a separately reviewed execution boundary only after deterministic research and
backtesting are mature. No broker behavior is implemented before Milestone 3 is complete.

`BrokerAdapterStub` raises `NotImplementedError` and remains labelled "planned" until this
milestone begins.

---

## Milestone 6 — Continuous Research / Evidence-Pushed Watcher (planned)

Shift the agent from purely objective-pulled (`quantcode research "..."`) to also
evidence-pushed: registered feeds tick → new doc → triage against existing strategies →
either ignored, annotated, or queued for human-reviewed revision. The existing 9-agent
pipeline stays unchanged; the watcher loop wraps it.

**Build:**
- `SourceWatcherAgent` — polls registered RSS/arxiv/URL feeds, dedupes by content hash,
  emits `IngestedDocument` shells (no body) for the browser agent to hydrate
- `EvidenceTriageAgent` — two-stage gate. Stage 1: cheap vector similarity between the
  new anomaly and active strategy embeddings. Stage 2: LLM call on surviving candidates
  to produce a grounded `EvidenceReview` per affected strategy
- `BrowserResearcherAgent` extension — second entry point `run_document(IngestedDocument)`
  in addition to `run_url(str)`; emits `ExtractedAnomaly` with `source_doc_id` for
  provenance through the watcher pipeline
- `StrategyReviserAgent` (deferred, v2 of this milestone) — diff-proposer for `revise`
  verdicts; v1 of the milestone annotates only, human pulls the trigger
- New schemas: `SourceFeed`, `IngestedDocument`, `ExtractedAnomaly`, `EvidenceReview`,
  `MechanismOverlap`, `ConflictSignal`, `SourceQuality`, `TriageAction`
- New workspace dirs: `sources/` (feeds.yaml, seen.jsonl), `ingest/` (raw and extracted
  docs), `review_queue/` (pending EvidenceReviews)
- New CLI commands: `quantcode sources add|list`, `quantcode watch`, `quantcode review`
- Dashboard additions: Review queue page (pending evidence by relevance, one-click
  accept/reject/revise), Sources page (per-feed ingestion rate and signal/noise ratio)

**Why now (sequencing):** depends on Milestone 2 (Browserbase + Redis Tier 2/3) and
benefits from Milestone 3 (real backtest results sharpen the triage's view of which
strategies are worth defending).

**Non-scope:**
- Auto-revision of strategy specs without human approval (annotate-only in v1)
- Webhook-driven ingest (polling only)
- Cross-strategy ensemble reasoning ("this paper invalidates the whole family")
- Source discovery — feeds are user-registered, not auto-found
