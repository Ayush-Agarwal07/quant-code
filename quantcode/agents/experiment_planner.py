"""Agent 9 — ExperimentPlannerAgent: planned metrics + experiment design.

Input: list[StrategySpec] + list[StrategyCritique]. Output: list[ExperimentPlanStub], one
per spec. Plans train/test windows, benchmark, costs, robustness tests, and failure
criteria. The runner is always a stub (status=stub_not_executed) — no backtest is run.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import ExperimentPlanStub, StrategyCritique, StrategySpec

PROMPT = (
    "Design an honest experiment for each strategy: pick train/test windows that avoid overlap, a "
    "benchmark, the universes, realistic cost assumptions, robustness tests, and explicit failure "
    "criteria. Fold in the critic's concerns (especially proxy and leakage risks) as robustness "
    "checks. Do NOT run or claim results — the plan is a stub."
)


class ExperimentPlannerAgent(Agent):
    def run(
        self, specs: list[StrategySpec], critiques: list[StrategyCritique]
    ) -> list[ExperimentPlanStub]:
        by_name = {c.strategy_name: c for c in critiques}
        # ponytail: one model per call; loop specs to assemble the plan list.
        plans: list[ExperimentPlanStub] = []
        for spec in specs:
            critique = by_name.get(spec.strategy_name)
            ctx = {
                "spec": spec.model_dump(mode="json"),
                "critique": critique.model_dump(mode="json") if critique else None,
                "mock": self._mock(spec, critique),
            }
            out = self.llm.generate_structured(PROMPT, ExperimentPlanStub, ctx)
            assert isinstance(out, ExperimentPlanStub)
            plans.append(out)
        return plans

    def _mock(
        self, spec: StrategySpec, critique: StrategyCritique | None
    ) -> dict[str, object]:
        robustness = ["walk-forward windows", "transaction-cost sensitivity sweep"]
        if critique and critique.economic_rationale_strength == "weak":
            robustness.append("proxy-vs-clean-signal ablation")
        return {
            "strategy_name": spec.strategy_name,
            "train_period": ["2010-01-01", "2018-12-31"],
            "test_period": ["2019-01-01", "2023-12-31"],
            "benchmark": "SPY",
            "universes": [spec.universe],
            "cost_assumptions": {"commission_bps": 1.0, "slippage_bps": 5.0},
            "robustness_tests": robustness,
            "failure_criteria": [
                "Sharpe below 0.5 net of costs",
                "max_drawdown worse than benchmark",
                "edge disappears out of sample",
            ],
            "status": "stub_not_executed",
        }
