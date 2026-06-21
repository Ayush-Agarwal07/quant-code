"""Experiment execution boundary for hackathon-safe research runs."""

from __future__ import annotations

from quant_code.strategy_research.schemas import ExperimentPlanStub, ExperimentResultStub


class ExperimentRunnerStub:
    """Return planned metrics without executing a real backtest."""

    def run(self, plan: ExperimentPlanStub) -> ExperimentResultStub:
        return ExperimentResultStub(
            strategy_name=plan.strategy_name,
            status="not_executed",
            reason="Backtesting is intentionally stubbed in this hackathon version.",
            planned_metrics=["Sharpe", "max_drawdown", "turnover", "alpha_vs_benchmark"],
        )
