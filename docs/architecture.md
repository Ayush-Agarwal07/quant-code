# Architecture

Quant Forge separates broad research reasoning from narrow deterministic execution.
The current milestone ends at structured specifications and non-executed experiment plans.

## Modules

- `models/` defines the `LLMClient` protocol, deterministic mock implementation, optional
  provider clients, and provider routing.
- `strategy_research/schemas.py` is the contract layer. Every workflow artifact is a
  validated Pydantic model with explicit confidence bounds and DSL validation.
- `strategy_research/tools/` contains deterministic, network-free catalogs and validators.
- `strategy_research/agents/` contains small focused transformations. Each run returns an
  output and an `AgentTrace`.
- `strategy_research/workflow.py` performs dependency construction and orchestration.
- `future/` defines intentionally non-operational boundaries for backtesting, memory,
  market data, features, universes, and brokers.

## Why Research Is Separate From Backtesting

Research agents handle ambiguity: they survey themes, state mechanisms, form falsifiable
hypotheses, and identify data limitations. A future backtester must handle none of that
ambiguity. It should consume a validated `StrategySpec` and execute deterministic rules
against point-in-time data.

Keeping the layers separate prevents an agent from inventing unavailable features during
execution, changing rules after seeing outcomes, or confusing a qualitative research claim
with empirical evidence.

## Stubs

`BacktestRunnerStub` always returns `status="not_executed"`. `MemoryStoreStub` does not
persist. Data provider protocols do not fetch data. `BrokerAdapterStub` raises
`NotImplementedError`. These explicit boundaries keep the first milestone useful without
implying later capabilities exist.

