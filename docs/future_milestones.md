# Milestones

## Milestone 1 — Agentic Research Layer (`deprecated/` baseline, being rebuilt)

Produce structured, data-aware research packets with deterministic mock behavior, critiques,
experiment plans, experiment-runner stubs, and memory-write proposals.

> This milestone describes the original implementation now in `deprecated/`. It is the
> reference baseline being rebuilt fresh in `quantcode/` (see `architecture.md`). "What
> exists" below means *exists in `deprecated/`*, not in the new package.

**What exists (in `deprecated/`):** 9-agent pipeline, strict Pydantic schemas, feasibility
gate, offline anomaly catalog, `MockLLMClient`, CLI (`quantcode research` / `quantcode demo`),
full test suite.

**What is stubbed:** experiment execution, memory persistence, broker, live data.

> LLM backend for the rebuild is **undecided** — the new `quantcode/config.py` leaves it
> unset; do not assume `MockLLMClient` carries over.

---

## Milestone 2 — Workspace + Redis Memory + Compaction + Demo (build now)

Transform the CLI research engine into a Claude Code-style workspace agent.

**Build:**
- `WorkspaceManager` — writes strategy YAML, run JSON, Markdown reports, and context packs
- `StrategyValidatorTool` — strict validation between formalization and YAML writing
- `StrategyWriterAgent` — writes validated specs to `workspace/strategies/`
- `ExperimentRunnerStub` — returns `status="not_executed"` and planned metrics only
- `ResearchTrace Compiler` / `CompactorAgent` — measurable compression ratio and retained lessons
- `MemoryCuratorAgent` — promotes compacted candidates to Redis Tier 2/3
- `redis_memory` tool — 3-tier interface (working trace, episodic memory, semantic lessons),
  with vector search; adopt Redis Agent Memory Server vs hand-roll is an open decision
  (see `sponsor_tech_references.md`)
- New CLI commands: `quantcode init`, `quantcode demo`, `quantcode inspect`,
  `quantcode memory search`, `quantcode compact`
- Second-run memory demo showing the agent avoids previously critiqued feasibility and validation mistakes
- Minimal local dashboard: run timeline, YAML viewer, memory explorer, compaction view,
  critique view, follow-up run comparison

**Non-scope:** real broker, live market data, real backtesting, authentication, production deployment.

---

## Milestone 3 — Browserbase Research URL (committed)

Add narrow external research ingestion without changing the core schema path.

**Build:**
- `BrowserResearcherAgent` — **Browserbase Python SDK + Playwright** URL ingestion →
  `list[PriorArtTheme]` (not Stagehand; see `sponsor_tech_references.md`)
- `quantcode research-url <url>` — routes extracted themes into the normal pipeline

**Non-scope:** general web scraping, automated source discovery, live data ingestion,
observability (Arize/Sentry dropped from scope).

---

## Milestone 4 — Lightweight Backtester (planned)

Execute validated `StrategySpec` rules against point-in-time OHLCV data. Produce reproducible
result artifacts linked to the research packet that generated the strategy.

**Build:**
- OHLCV CSV loader or lightweight market data source
- Feature computation matching the feature catalog
- Point-in-time rule evaluation engine with no look-ahead
- Transaction cost model
- `ExperimentResultArtifact` schema replacing `ExperimentResultStub`
- Integration into memory only after real empirical outcomes exist

**Non-scope:** live execution, broker integration, portfolio-level optimization.

---

## Milestone 5 — Richer Data Connectors (planned)

Add versioned connectors for market, event, fundamental, analyst, options, and alternative
data with explicit timestamp and quality guarantees. Connectors expand the `DataFeasibilityVerdict`
space: more hypotheses become `testable_now` instead of `requires_new_data_source`.

---

## Milestone 6 — Paper Trading and Broker Adapter (deferred)

Introduce a separately reviewed execution boundary only after deterministic research, data,
and backtesting are mature. `BrokerAdapterStub` raises `NotImplementedError` until this milestone.

---

## Milestone 7 — Continuous Research / Evidence-Pushed Watcher (planned)

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
benefits from Milestone 4 (real experiment results sharpen the triage's view of which
strategies are worth defending).

**Non-scope:**
- Auto-revision of strategy specs without human approval (annotate-only in v1)
- Webhook-driven ingest (polling only)
- Cross-strategy ensemble reasoning ("this paper invalidates the whole family")
- Source discovery — feeds are user-registered, not auto-found
