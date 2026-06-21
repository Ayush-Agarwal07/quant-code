# Architecture

> **Note:** The original implementation now lives in `deprecated/` (formerly `quant_code/`) and is
> kept for reference only. New work lives in `quantcode/`, structured per this document.

## Product Identity

**QuantCode** is Claude Code for systematic strategy research: a local agent that reads a quant
workspace, researches market hypotheses, writes strategy specs, critiques feasibility and leakage,
stores research memory in Redis, and compacts long traces into reusable context.

The product is **CLI-first**. The local dashboard is a read-only presentation and inspection layer.

## Non-Goals

QuantCode is not a trading bot, broker integration, financial advisor, or live execution system.
The hackathon version does not claim that any strategy works. It produces structured research
artifacts, validation reports, critiques, and experiment plans. `ExperimentRunnerStub` explicitly
returns `status="not_executed"`.

## CLI Surface

```bash
quantcode init
quantcode research "Find short-horizon underreaction strategies"
quantcode demo
quantcode inspect runs/latest
quantcode compact runs/latest --budget 1000
quantcode memory search "earnings proxy weakness"
quantcode research-url <url>              # optional Browserbase path
```

Avoid `quantcode backtest` in the main hackathon demo unless a real or toy backtest exists.

## Workspace Layout

```text
workspace/
  strategies/          # YAML StrategySpec files
  research_runs/       # full QuantResearchPacket JSON files
  reports/             # Markdown judge/devpost summaries
  memory/              # compacted context packs with provenance
```

`WorkspaceManager` should own all file operations:

- `write_strategy_yaml`
- `write_run_json`
- `write_markdown_report`
- `write_context_pack`
- `read_existing_strategies`
- `list_workspace`

This is central to the “Claude Code for quant research” metaphor.

## Core Pipeline

```text
Research objective
→ retrieve Tier 3 semantic lessons from Redis
→ ResearchDirectorAgent
→ PriorArtDiscoveryAgent
→ MarketMechanismAgent
→ HypothesisGeneratorAgent
→ DataFeasibilityAgent
→ StrategyFormalizerAgent
→ StrategyValidatorTool
→ StrategyWriterAgent
→ ResearchCriticAgent
→ ExperimentPlannerAgent
→ ExperimentRunnerStub
→ raw trace to Redis Tier 1
→ ResearchTrace Compiler / CompactorAgent
→ MemoryCuratorAgent
→ Redis Tier 2 episode + Tier 3 semantic lessons
→ QuantResearchPacket
→ workspace/research_runs/run_N.json
```

`research-url <url>` should route Browserbase output into `PriorArtTheme`, not directly into
hypotheses. That keeps the schema boundary clean:

```text
research-url URL
→ BrowserResearcherAgent
→ PriorArtTheme / mechanism evidence
→ normal pipeline
```

## Feasibility vs Validation

The system has two separate gates.

**DataFeasibilityAgent** decides whether a hypothesis has enough data to become a candidate
strategy:

- `testable_now`
- `testable_with_proxy`
- `requires_new_data_source`
- `not_testable`

Only `testable_now` and `testable_with_proxy` advance.

**StrategyValidatorTool** decides whether a formalized strategy is safe to write as YAML:

- supported features only
- supported operators only
- entry rules exist
- exit rules exist
- risk rules exist
- no future-return features
- no vague natural-language rules
- no unsupported ranking feature

This separation matters: feasibility is about data availability; validation is about deterministic
execution readiness.

## Experiment Runner Naming

Use `ExperimentRunnerStub`, not `BacktestRunnerStub`, in the hackathon architecture. It should
return:

```json
{
  "status": "not_executed",
  "reason": "Backtesting is intentionally stubbed in this hackathon version.",
  "planned_metrics": ["Sharpe", "max_drawdown", "turnover", "alpha_vs_benchmark"]
}
```

This is more honest and avoids implying quantitative evidence that does not exist yet.

## Redis Memory Design

Redis is the primary sponsor-track fit. Use it as the agent memory substrate, not merely a cache.

### Tier 1: Working Trace

Short-lived run/session data. Stores raw agent events, tool calls, intermediate outputs, and trace
chunks. It should have a TTL.

### Tier 2: Episodic Memory

One record per research run or strategy episode. Stores objective, generated strategies, critiques,
failed assumptions, and provenance.

### Tier 3: Semantic Lessons

Compact durable lessons. Stores reusable warnings, successful patterns, data constraints, and
mutation rules. New runs retrieve Tier 3 by default, not full Tier 1 traces.

Suggested keys:

```text
qc:run:{run_id}:trace
qc:episode:{run_id}
qc:lesson:{lesson_id}
qc:context_pack:{pack_id}
qc:index:lessons
```

## Memory and Compaction Order

Raw trace can be written to Tier 1 immediately, but durable memory must be compacted first:

```text
Agent pipeline
→ raw trace to Redis Tier 1
→ ResearchTrace Compiler extracts candidate lessons
→ MemoryCuratorAgent validates and promotes candidates
→ Redis Tier 2 episode + Tier 3 semantic lessons
→ workspace/memory/context_pack_N.json
```

The memory curator should not promote directly from noisy raw traces.

## ResearchTrace Compiler

The compaction module should have a named identity because it is a strong demo point.

Demo metrics:

```text
18,400 tokens → 1,050 tokens
17.5x compression
critical lessons retained: 9/10
duplicate trace events removed: 42
context pack budget: 1,000 tokens
```

Approximate token counts are acceptable for the prototype if clearly labeled as estimates.

## Dashboard Scope

The dashboard is read-only and judge-facing. It should replay the run rather than just showing
final outputs.

Minimum panels:

- Agent timeline
- Strategy YAML viewer
- Critique view
- Redis memory explorer
- Compaction before/after
- Follow-up run comparison

The follow-up comparison is the proof of learning:

```text
Run 1: weak proxy or validation issue is critiqued
Memory: warning is compacted and promoted
Run 2: warning is retrieved and changes behavior
```

## Sponsor Strategy

Primary:

- **Redis** — memory substrate: traces, episodes, semantic lessons, context packs.
- **Token Company** — ResearchTrace Compiler with compression metrics.
- **Anthropic** — “Claude Code for quant research” product framing and workspace-first agent loop.

Secondary:

- **Browserbase** — `research-url <url>` extracts prior-art themes from pages.
- **Arize/Sentry** — observability and reliability if quick to add.

Cut:

- broker/paper trading
- real market data ingestion
- full backtester
- complex frontend
- unrelated sponsor integrations

