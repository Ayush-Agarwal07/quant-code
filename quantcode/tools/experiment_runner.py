"""ExperimentRunnerStub — the honest non-backtester.

It NEVER runs a backtest. It ALWAYS returns status="not_executed" with the fixed D8
planned-metrics list. This honesty is an ethics asset and an explicit non-goal to
"actually backtest" (docs/architecture.md "Experiment Runner Naming") — do not change
it to imply real results.

ponytail: one constant + one constructor call. There is no work to do here, on purpose.
"""

from __future__ import annotations

from quantcode.schemas import ExperimentPlanStub, ExperimentResultStub, StrategySpec

# D8 — the metrics a real backtest WOULD report (it does not run). Fixed, not computed.
PLANNED_METRICS: tuple[str, ...] = ("Sharpe", "max_drawdown", "turnover", "alpha_vs_benchmark")

_NOT_EXECUTED_REASON = "Backtesting is intentionally stubbed in this hackathon version."


class ExperimentRunnerStub:
    """Returns a not_executed result for any plan or spec. Never backtests."""

    def run(self, target: ExperimentPlanStub | StrategySpec) -> ExperimentResultStub:
        return ExperimentResultStub(
            strategy_name=target.strategy_name,
            status="not_executed",
            reason=_NOT_EXECUTED_REASON,
            planned_metrics=list(PLANNED_METRICS),
        )
