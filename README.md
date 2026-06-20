# Quant Forge

Quant Forge is a clean, deterministic prototype of an **agentic quant research
layer**. It models the workflow of a human quant researcher: a broad objective becomes a
research agenda, prior-art themes, mechanisms, falsifiable hypotheses, data-feasibility
checks, narrow strategy specifications, critiques, and experiment-plan stubs.

The core philosophy is:

> **Broad research, narrow execution.**

Agents may reason broadly about market anomalies and mechanisms. Only ideas that pass an
explicit data-feasibility gate can become structured `StrategySpec` objects suitable for a
future deterministic backtester.

## What It Is

- A modular research workflow with focused, traceable agents
- A strict Pydantic v2 schema layer for all research artifacts
- An offline research/data/feature catalog and deterministic validation tools
- A no-network `MockLLMClient` and deterministic demo mode
- A production-oriented boundary around future backtesting, memory, data, and broker work

## What It Is Not

- Not a trading bot or live trading system
- Not financial advice or a source of trade recommendations
- Not a full backtesting platform
- Not a broker or paper-trading integration
- Not a live data collection system
- Not a full persistent memory system
- Not evidence that any proposed strategy works or is profitable

## Current Milestone

Milestone 1 implements the agentic research layer. The workflow produces experiment plans
and `BacktestResultStub` objects, but it deliberately does not execute a backtest.

## Quickstart

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
qf run "Find robust short-horizon equity strategies based on market underreaction."
```

The default provider is deterministic and requires no credentials or internet access.

```bash
qf run "Research objective" --provider mock
qf run "Research objective" --output research_packet.json
qf schemas
qf version
```

On macOS, if a Python environment reports that it skipped a hidden editable-install
`.pth` file, clear the inherited filesystem flag with `chflags -R nohidden .venv`.

Optional live-provider stubs read configuration from environment variables documented in
`.env.example`. Live providers are not required or exercised by tests.

## Architecture Overview

```text
objective
  -> ResearchDirectorAgent
  -> PriorArtDiscoveryAgent
  -> MarketMechanismAgent
  -> HypothesisGenerationAgent
  -> DataFeasibilityAgent
  -> StrategyFormalizerAgent
  -> ResearchCriticAgent
  -> ExperimentPlannerAgent
  -> BacktestRunnerStub
  -> MemoryProposalAgent
  -> QuantResearchPacket
```

- `strategy_research/schemas.py`: structured contracts and validation
- `strategy_research/agents/`: focused agent steps and traces
- `strategy_research/tools/`: deterministic catalogs, feasibility, validation, and heuristics
- `models/`: provider protocol, mock client, and optional live-provider clients
- `future/`: explicit non-operational interfaces for later milestones

See [architecture](docs/architecture.md), [system design](docs/system_design_diagram.md),
[agent flow](docs/agent_flow.md), and [future milestones](docs/future_milestones.md) for
more detail.

## Development

```bash
pytest
ruff check .
mypy quant_forge
```

The project targets Python 3.11+ and uses moderate mypy strictness. Tests never require
live APIs, API keys, or network access.

## Disclaimer

This project is for research and educational purposes only. It does not provide financial
advice, trade recommendations, or live execution. Backtests can be misleading and do not
guarantee future performance.
