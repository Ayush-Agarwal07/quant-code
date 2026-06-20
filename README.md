# QuantCode

QuantCode is a prototype of **Claude Code for systematic strategy research**: a local agent that
reads a quant workspace, researches market hypotheses, writes strategy specs, critiques feasibility
and leakage, stores research memory in Redis, and compacts long traces into reusable context.

The core philosophy is:

> **Broad research, narrow execution.**

Agents may reason broadly about market anomalies and mechanisms. Only ideas that pass explicit
feasibility and validation gates can become structured strategy specifications.

## What It Is

- A CLI-first agentic research workflow
- A workspace-oriented tool that writes strategy YAML, run JSON, reports, and context packs
- A strict schema layer for research artifacts and strategy specs
- A feasibility gate before strategy formalization
- A validation gate before YAML writing
- A Redis-ready memory architecture with working traces, episodes, and semantic lessons
- A compaction layer, the ResearchTrace Compiler, for turning long traces into reusable context

## What It Is Not

- Not a trading bot or live trading system
- Not financial advice or a source of trade recommendations
- Not a broker or paper-trading integration
- Not proof that any strategy works
- Not a full backtesting platform yet

## Hackathon Architecture Direction

```text
research objective
→ retrieve Tier 3 semantic lessons
→ research agents
→ feasibility gate
→ strategy formalizer
→ strategy validator
→ strategy writer
→ critic
→ experiment planner
→ ExperimentRunnerStub(status="not_executed")
→ ResearchTrace Compiler
→ MemoryCuratorAgent
→ Redis Tier 2/Tier 3
→ workspace artifacts
```

The demo should emphasize that QuantCode avoids repeating previously critiqued feasibility and
validation mistakes. Do not call those “backtest failures” until real backtesting exists.

## Workspace Artifacts

```text
workspace/
  strategies/
    earnings_gap_volume_drift.yaml
  research_runs/
    run_001.json
  memory/
    context_pack_001.json
  reports/
    run_001.md
```

## Docs

- [Architecture](docs/architecture.md)
- [Agent flow](docs/agent_flow.md)
- [System design diagram](docs/system_design_diagram.md)
- [Future milestones](docs/future_milestones.md)

## Disclaimer

This project is for research and educational purposes only. It does not provide financial advice,
trade recommendations, or live execution. Backtests can be misleading and do not guarantee future
performance. The current architecture intentionally keeps execution and brokerage out of scope.

