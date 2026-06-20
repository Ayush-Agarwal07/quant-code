# Agent Flow

Each agent has one focused responsibility and returns a validated output plus an
`AgentTrace`. Agents do not print or perform live trading operations.

| Agent | Inputs | Output | Deterministic tools |
|---|---|---|---|
| Research Director | `QuantResearchRequest` | `ResearchAgenda` | Structured model client |
| Prior-Art Discovery | `ResearchAgenda` | `list[PriorArtTheme]` | Offline anomaly catalog/search |
| Market Mechanism | Agenda and themes | `list[MarketMechanism]` | Structured model client |
| Hypothesis Generation | Agenda, themes, mechanisms | `list[CandidateHypothesis]` | Structured model client |
| Data Feasibility | Hypotheses | `list[DataFeasibilityReport]` | Data mapper and proxy suggester |
| Strategy Formalizer | Hypotheses and reports | `list[StrategySpec]` | Feature catalog and DSL validator |
| Research Critic | Strategy specs | `list[StrategyCritique]` | DSL, leakage, complexity, and cost checks |
| Experiment Planner | Specs and critiques | `list[ExperimentPlanStub]` | Deterministic planning defaults |
| Backtest Runner Stub | Experiment plan | `BacktestResultStub` | No backtest execution |
| Memory Proposal | Partial packet | `list[MemoryWriteProposalStub]` | No persistence |

## Feasibility Gate

Only hypotheses classified `testable_now` or `testable_with_proxy` can become
`StrategySpec` objects. Proxies must be named in the hypothesis and supported by the
feature catalog. Hypotheses requiring unavailable data remain research artifacts.

## Agent Traces

Traces summarize input, output, schema, and validation status. They make the one-shot
workflow inspectable without coupling agents to CLI output or a persistent logging system.

