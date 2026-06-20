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
