# Agent Flow

Each agent has one focused responsibility and returns a validated output plus an `AgentTrace`.
Agents do not print, persist data directly, or execute trades. All persistence goes through
the `redis_memory` and `file_writer` tools.

---

## CLI → Workspace → Redis Flow

```
quantcode research "objective"
  │
  ├── retrieves Tier 3 semantic lessons from Redis (pre-research context)
  │
  ├── runs agent pipeline (see table below)
  │
  ├── StrategyWriterAgent writes YAML to workspace/strategies/
  ├── CompactorAgent writes context pack to workspace/memory/
  ├── MemoryCuratorAgent writes Tier 2/3 entries to Redis
  │
  └── writes full QuantResearchPacket to workspace/research_runs/run_N.json
```

## Watcher Flow (Milestone 6)

Parallel entry point. Evidence-pushed instead of objective-pulled. The 9-agent pipeline
above is unchanged.

```
quantcode watch  (or cron)
  │
  ├── SourceWatcherAgent polls registered feeds (workspace/sources/feeds.yaml)
  │     - dedup via workspace/sources/seen.jsonl (content_hash ledger)
  │     - emits IngestedDocument shells (url only, no body)
  │
  ├── for each new doc:
  │     BrowserResearcherAgent.run_document(doc) → ExtractedAnomaly
  │       (writes hydrated body to workspace/ingest/)
  │
  ├── for each anomaly:
  │     EvidenceTriageAgent.run(anomaly, doc) → list[EvidenceReview]
  │       Stage 1: vector sim vs active strategy embeddings (free)
  │       Stage 2: LLM call on surviving candidates (capped, top-K)
  │       Validator strips ungrounded claims, downgrades unsupported REVISE verdicts
  │
  └── writes EvidenceReviews to workspace/review_queue/
      surfaced in dashboard Review page → human verdict
      accepted REVISE verdicts feed MemoryCuratorAgent (records lesson + may re-run
      StrategyWriterAgent on the affected spec)
```

---

## Agent Table

| # | Agent | Inputs | Output | Key tools |
|---|---|---|---|---|
| 1 | `ResearchDirectorAgent` | `QuantResearchRequest` | `ResearchAgenda` | LLM, Tier 3 Redis lesson retrieval |
| 2 | `BrowserResearcherAgent` | URL (optional; only if `research-url` command) | `list[PriorArtTheme]` from live source | `browserbase_fetch` (Stagehand) |
| 3 | `PriorArtDiscoveryAgent` | `ResearchAgenda` | `list[PriorArtTheme]` | `KnownAnomalyCatalogTool`, `ResearchCorpusSearchStub` |
| 4 | `HypothesisGeneratorAgent` | Agenda, themes, mechanisms | `list[CandidateHypothesis]` | LLM |
| 5 | `DataFeasibilityAgent` | Hypotheses | `list[DataFeasibilityReport]` | `DataRequirementMapperTool`, `ProxyFeatureSuggesterTool` |
| 6 | `StrategyWriterAgent` | Feasible hypotheses + reports | `list[StrategySpec]`; YAML files | `DSLValidationTool`, `file_writer` |
| 7 | `ResearchCriticAgent` | Strategy specs | `list[StrategyCritique]` | `DSLValidationTool`, `LeakageCheckTool`, `RuleComplexityTool`, `CostRiskHeuristicTool` |
| — | `ExperimentPlannerAgent` (stub) | Specs + critiques | `list[ExperimentPlanStub]` | Deterministic planning defaults |
| — | `BacktestRunnerStub` | Experiment plan | `BacktestResultStub` (`status="not_executed"`) | None |
| 8 | `MemoryCuratorAgent` | Partial packet | Tier 2/3 Redis writes | `redis_memory` |
| 9 | `CompactorAgent` | Full `QuantResearchPacket` | Context pack JSON under token budget | `file_writer`, `redis_memory` |
| W1 | `SourceWatcherAgent` (M6) | Registered feeds + seen ledger | `list[IngestedDocument]` (URL shells) | `FeedRegistry`, `SeenLedger`, type-specific fetchers |
| W2 | `BrowserResearcherAgent.run_document` (M6) | `IngestedDocument` | `ExtractedAnomaly` with `source_doc_id` | `browserbase_fetch` |
| W3 | `EvidenceTriageAgent` (M6) | `ExtractedAnomaly` + active `StrategySpec`s + Tier 3 | `list[EvidenceReview]` | `StrategyRegistry`, `redis_memory`, embedding fn |

---

## Feasibility Gate

Only hypotheses classified `testable_now` or `testable_with_proxy` advance to
`StrategyWriterAgent`. Proxy features must be named in the hypothesis and listed in the
feature catalog. Hypotheses requiring unavailable data remain as research artifacts in the
packet but do not become `StrategySpec` objects.

`DataFeasibilityVerdict` enum values:
- `testable_now` — all required data available in the current catalog
- `testable_with_proxy` — a named proxy from the feature catalog can substitute
- `requires_new_data_source` — blocked; remains a research artifact
- `not_testable` — structurally untestable; rejected from the packet

---

## New Agents (Milestone 2)

### BrowserResearcherAgent

Invoked only by `quantcode research-url <url>`. Uses Browserbase/Stagehand to open the page
and extract:
- anomaly name and summary
- market mechanism
- required data
- testable hypothesis
- identified risks

Output is a `list[PriorArtTheme]` that feeds into `HypothesisGeneratorAgent` alongside the
offline catalog results.

### MemoryCuratorAgent

Replaces `MemoryProposalAgent`. Instead of producing non-persistent write proposals, it
executes writes to Redis:
- Scores each memory candidate using the ResearchTrace Compiler scoring formula.
- Deduplicates against existing Tier 2 episodes using semantic similarity.
- Promotes durable lessons (failed strategies, data constraints, mutation rules) to Tier 3.
- Attaches provenance links to the source run ID.

### CompactorAgent

Invoked at the end of each run (and directly via `quantcode compact`):
1. Segments the full `AgentTrace` sequence into typed events.
2. Scores each event as a memory candidate.
3. Selects events within the configured token budget (~1,100 tokens default).
4. Writes a context pack to `workspace/memory/context_pack_N.json`.
5. Stores the pack in Redis Tier 1 for fast retrieval on the next run.

---

## New Agents (Milestone 6)

### SourceWatcherAgent

Pure I/O. The only agent that polls the outside world on a schedule.

1. `FeedRegistry.due_feeds()` — feeds where `now - last_polled_at >= poll_interval`.
2. For each: `fetcher.list_entries(feed.url, limit=max_per_feed)` (RSS / arxiv / direct URL).
3. Drop entries whose `content_hash` is already in `SeenLedger`.
4. Emit `IngestedDocument` shells with `body=""` — `BrowserResearcherAgent` hydrates.
   *Why deferred:* keeps the polling loop cheap and lets Browserbase handle JS-rendered pages.
5. Record `content_hash` and update `last_polled_at` **after** successful handoff (idempotency).

No LLM call. Inherits `BaseAgent` for trace symmetry only.

### BrowserResearcherAgent (extension)

Generalized from Milestone 2 to support two entry points sharing one extractor core:

- `run_url(url: str)` — on-demand path used by `quantcode research-url`.
- `run_document(doc: IngestedDocument)` — watcher path; preserves `source_doc_id`
  in the emitted `ExtractedAnomaly` for downstream provenance.

Both emit `ExtractedAnomaly`. The on-demand flow uses a thin shim to derive a
`PriorArtTheme` for `HypothesisGeneratorAgent` so the existing 9-agent loop is
unaffected. Agents stay pure — `workflow.py` persists the hydrated document body.

### EvidenceTriageAgent

The load-bearing gate. Two stages plus a deterministic validator.

**Stage 1 — vector filter (no LLM):**
- Embed `anomaly.mechanism_summary + anomaly.anomaly_name`.
- Cosine-sim against every active strategy embedding (precomputed by `StrategyWriterAgent`).
- Keep candidates above `annotate_threshold` (default 0.45), cap at top-K (default 5).
- Per-strategy `triage_sensitivity` override lives on `StrategySpec`.

**Stage 2 — LLM rationale per surviving candidate:**
- Retrieve top-3 Tier 3 lessons by `(strategy.family + anomaly.mechanism)`.
- One structured-output LLM call → `EvidenceReview`.
- Action selection rules:
  - `conflict_signals` non-empty AND `sim >= revise_threshold` (default 0.75) → `REVISE`
  - else `sim >= annotate_threshold` → `ANNOTATE`
  - else `IGNORE`

**Validator (post-LLM, deterministic):**
- `ConflictSignal.source_quote` must be a substring of `anomaly.cited_evidence`;
  ungrounded conflicts dropped.
- `MechanismOverlap` evidence strings must be substrings of the spec and anomaly.
- `SourceQuality` caps `suggested_action`. `peer_reviewed` / `reputable_news` may
  `REVISE`; `preprint` requires strong conflict; `blog_or_forum` / `social_post` max
  `ANNOTATE`; `unknown` max `IGNORE` without strong verbatim support.
- `REVISE` requires a grounded conflict or `direction="opposite"` overlap; otherwise
  downgraded to `ANNOTATE`.

Validator edits surface in the `AgentTrace` — visible in the Arize spans and dashboard
so the demo can show how often the model needs patching up.

If Stage 1 returns no candidates, one `EvidenceReview` with `strategy_name=None,
action=IGNORE` is emitted (kept so the Sources page can show ingest-but-discarded rate).

### StrategyReviserAgent (deferred — v2 of Milestone 6)

Diff-proposer for `REVISE` verdicts. Not built in v1 — annotate-only keeps a human
in the loop and avoids spec churn. Auto-revise will be gated behind a per-strategy
opt-in flag when it lands.

---

## Agent Traces

Every agent returns an `AgentTrace` (defined in `strategy_research/agents/base.py`) containing:
- agent name
- input and output summaries
- schema used
- validation status
- token counts (prompt + completion)

Traces are aggregated into the `QuantResearchPacket`, exported to `workspace/research_runs/`,
and forwarded to Arize via `arize_tracer` for span-level observability.
