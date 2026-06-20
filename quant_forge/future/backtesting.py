"""Backtesting boundary for a future deterministic engine."""

from __future__ import annotations

from quant_forge.strategy_research.schemas import BacktestResultStub, ExperimentPlanStub


class BacktestRunnerStub:
    """Return a non-executed result until deterministic backtesting is implemented."""

    def run(self, plan: ExperimentPlanStub) -> BacktestResultStub:
        return BacktestResultStub(
            strategy_name=plan.strategy_name,
            status="not_executed",
            reason="Deterministic backtesting is a future milestone and was not executed.",
            expected_future_metrics=[
                "annualized_return",
                "annualized_volatility",
                "sharpe_ratio",
                "maximum_drawdown",
                "turnover",
                "cost_adjusted_return",
            ],
        )
