"""Experiment planning agent."""

from __future__ import annotations

from quant_forge.models.base import LLMClient
from quant_forge.strategy_research.agents.base import AgentResult, BaseAgent
from quant_forge.strategy_research.schemas import (
    ExperimentPlanStub,
    StrategyCritique,
    StrategySpec,
)


class ExperimentPlannerAgent(BaseAgent):
    """Create deterministic experiment plans without running backtests."""

    name = "experiment_planner"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    def run(
        self,
        strategies: list[StrategySpec],
        critiques: list[StrategyCritique],
    ) -> AgentResult[list[ExperimentPlanStub]]:
        critique_by_name = {critique.strategy_name: critique for critique in critiques}

        def operation() -> list[ExperimentPlanStub]:
            return [
                ExperimentPlanStub(
                    strategy_name=strategy.strategy_name,
                    train_period=("2010-01-01", "2018-12-31"),
                    test_period=("2019-01-01", "2024-12-31"),
                    benchmark="SPY total return",
                    universes=[
                        strategy.universe,
                        "US liquid large-cap equities",
                        "US liquid mid-cap equities",
                    ],
                    cost_assumptions={
                        "commission_bps": 0.5,
                        "slippage_bps": 5.0,
                        "market_impact_bps": 2.0,
                    },
                    robustness_tests=[
                        "walk-forward evaluation",
                        "parameter sensitivity",
                        "subperiod and regime analysis",
                        "sector-neutral comparison",
                        "cost stress test",
                        "address critic verdict: "
                        f"{critique_by_name[strategy.strategy_name].verdict}",
                    ],
                    failure_criteria=[
                        "Out-of-sample return spread is not distinguishable from zero.",
                        "Results depend on one narrow parameter choice.",
                        "Estimated costs consume the gross effect.",
                    ],
                    status="stub_not_executed",
                )
                for strategy in strategies
            ]

        return self._execute(
            input_summary=f"{len(strategies)} strategies and {len(critiques)} critiques",
            output_summary="Created experiment-plan stubs; no backtest was run.",
            schema_used="list[ExperimentPlanStub]",
            operation=operation,
        )
