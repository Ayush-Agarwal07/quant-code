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

## Agent Traces

Every agent returns an `AgentTrace` (defined in `strategy_research/agents/base.py`) containing:
- agent name
- input and output summaries
- schema used
- validation status
- token counts (prompt + completion)

Traces are aggregated into the `QuantResearchPacket`, exported to `workspace/research_runs/`,
and forwarded to Arize via `arize_tracer` for span-level observability.
