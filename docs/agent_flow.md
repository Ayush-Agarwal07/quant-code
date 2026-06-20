# Agent Flow

Each agent has one focused responsibility and returns structured output plus trace metadata.
Agents do not execute trades and should not claim performance evidence. Persistence goes through
workspace tools and Redis memory interfaces.

## CLI → Workspace → Redis Flow

```text
quantcode research "objective"
  │
  ├── retrieve Tier 3 semantic lessons from Redis
  │
  ├── run research pipeline
  │
  ├── StrategyFormalizerAgent creates StrategySpec objects
  ├── StrategyValidatorTool blocks invalid or vague specs
  ├── StrategyWriterAgent writes YAML to workspace/strategies/
  │
  ├── ResearchCriticAgent critiques leakage, costs, complexity, data quality
  ├── ExperimentPlannerAgent creates experiment stubs
  ├── ExperimentRunnerStub returns status=not_executed
  │
  ├── write QuantResearchPacket to workspace/research_runs/run_N.json
  ├── write Markdown report to workspace/reports/run_N.md
  │
  ├── write raw trace to Redis Tier 1 with TTL
  ├── ResearchTrace Compiler creates context candidates
  ├── MemoryCuratorAgent promotes Tier 2/Tier 3 memory
  │
  └── write workspace/memory/context_pack_N.json
```

## Agent Table

| # | Component | Inputs | Output | Notes |
|---|---|---|---|---|
| 1 | `ResearchDirectorAgent` | `QuantResearchRequest` + Tier 3 lessons | `ResearchAgenda` | Narrows the objective. |
| 2 | `PriorArtDiscoveryAgent` | Agenda | `list[PriorArtTheme]` | Offline catalog by default. |
| 3 | `MarketMechanismAgent` | Agenda + themes | `list[MarketMechanism]` | Explains why an edge may exist or disappear. |
| 4 | `HypothesisGeneratorAgent` | Agenda + themes + mechanisms | `list[CandidateHypothesis]` | Research claims, not strategies. |
| 5 | `DataFeasibilityAgent` | Hypotheses + data catalog | `list[DataFeasibilityReport]` | Feasibility gate. |
| 6 | `StrategyFormalizerAgent` | Feasible hypotheses | `list[StrategySpec]` | Only formalizes testable ideas. |
| 7 | `StrategyValidatorTool` | `StrategySpec` | validation report | Blocks unsupported features, leakage, vague rules. |
| 8 | `StrategyWriterAgent` | validated specs | YAML artifacts | Writes through `WorkspaceManager`. |
| 9 | `ResearchCriticAgent` | specs | `list[StrategyCritique]` | Does not claim the strategy works. |
| 10 | `ExperimentPlannerAgent` | specs + critiques | `list[ExperimentPlanStub]` | Plans train/test windows and metrics. |
| 11 | `ExperimentRunnerStub` | plans | `ExperimentResultStub` | Always `not_executed`. |
| 12 | `ResearchTrace Compiler` | raw trace | context candidates + metrics | Compacts trace before durable memory promotion. |
| 13 | `MemoryCuratorAgent` | compacted candidates | Redis Tier 2/3 writes | Promotes reusable lessons. |

## Browserbase Path

`research-url` should produce prior-art evidence, not bypass the normal pipeline:

```text
quantcode research-url <url>
→ BrowserResearcherAgent
→ PriorArtTheme / MarketMechanism evidence
→ normal pipeline before HypothesisGeneratorAgent
```

This keeps schemas clean and prevents scraped text from becoming an unvalidated strategy directly.

## Feasibility Gate

Only these verdicts advance:

- `testable_now`
- `testable_with_proxy`

These remain in the packet but do not become strategy YAML:

- `requires_new_data_source`
- `not_testable`

## Strategy Validation Gate

The validator runs after formalization and before file writing. It checks:

- supported features only
- valid operators only
- entry rules exist
- exit rules exist
- risk rules exist
- no future-looking features such as `future_return` or `next_return`
- no vague natural-language rules that a deterministic runner could not execute

## Memory Flow

```text
raw trace → Redis Tier 1
raw trace → ResearchTrace Compiler → candidate lessons
candidate lessons → MemoryCuratorAgent → Redis Tier 2/Tier 3
context pack → workspace/memory/context_pack_N.json
```

Tier 1 is working memory and should expire. The context pack is a durable compressed artifact;
do not describe Tier 1 as “context pack storage.”

## Demo Claim Language

Use this:

```text
The agent avoids repeating previously critiqued feasibility and validation mistakes.
```

Avoid any wording that implies empirical backtest failures until real backtesting exists.

