"""Agent 8 — ResearchCriticAgent: critique feasibility/leakage/weak proxies/costs.

Input: list[StrategySpec]. Output: list[StrategyCritique], one per spec. The critic never
claims a strategy works — it surfaces risks the backtest must clear. At least one critique
flags a weak proxy so the second-run memory demo has a lesson to learn.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import StrategyCritique, StrategySpec

PROMPT = (
    "Critique each strategy as a skeptical reviewer. Flag look-ahead/leakage risks, overfitting, "
    "transaction-cost sensitivity, data-quality issues, and weak economic rationale (especially "
    "proxy-based logic). Give a verdict (accept_for_backtest / revise_before_backtest / reject) "
    "and concrete suggested mutations. Do not claim the strategy works."
)

# ponytail: deterministic critique per strategy_name; the proxy strategy gets a weak-proxy
# flag + revise verdict so the memory layer has a real lesson to promote on run 2.
_CRITIQUES: dict[str, dict[str, object]] = {
    "short_horizon_momentum": {
        "strategy_name": "short_horizon_momentum",
        "verdict": "accept_for_backtest",
        "major_issues": [],
        "leakage_risks": [],
        "overfitting_risks": ["thresholds at 0.0 are arbitrary; test sensitivity"],
        "transaction_cost_risks": ["weekly rebalance turnover may erode a thin edge"],
        "data_quality_risks": ["survivorship bias in the universe"],
        "economic_rationale_strength": "strong",
        "suggested_mutations": ["sweep ranking top_n", "add a volatility filter"],
        "confidence": 0.7,
    },
    "volume_confirmed_momentum": {
        "strategy_name": "volume_confirmed_momentum",
        "verdict": "accept_for_backtest",
        "major_issues": [],
        "leakage_risks": [],
        "overfitting_risks": ["volume_zscore cutoff of 1.0 needs robustness checks"],
        "transaction_cost_risks": ["monthly rebalance keeps turnover moderate"],
        "data_quality_risks": ["volume spikes around index rebalances"],
        "economic_rationale_strength": "moderate",
        "suggested_mutations": ["test alternative volume windows"],
        "confidence": 0.6,
    },
    "gap_drift_proxy": {
        "strategy_name": "gap_drift_proxy",
        "verdict": "revise_before_backtest",
        "major_issues": ["gap_1d is a weak, noisy proxy for the earnings surprise"],
        "leakage_risks": [
            "ensure gap_1d is computed only from already-closed bars (no same-day look-ahead)",
        ],
        "overfitting_risks": ["the 0.03 gap threshold is hand-picked"],
        "transaction_cost_risks": ["weekly rebalance on gap events raises turnover"],
        "data_quality_risks": ["gaps conflate earnings with unrelated news"],
        "economic_rationale_strength": "weak",
        "suggested_mutations": [
            "replace the gap proxy with a real earnings_surprise feed once available",
            "confirm the gap with volume_zscore to reduce noise",
        ],
        "confidence": 0.45,
    },
}


class ResearchCriticAgent(Agent):
    def run(self, specs: list[StrategySpec]) -> list[StrategyCritique]:
        # ponytail: one model per call; loop specs to assemble the critique list.
        critiques: list[StrategyCritique] = []
        for spec in specs:
            ctx = {"spec": spec.model_dump(mode="json"), "mock": self._mock(spec)}
            out = self.llm.generate_structured(PROMPT, StrategyCritique, ctx)
            assert isinstance(out, StrategyCritique)
            critiques.append(out)
        return critiques

    def _mock(self, spec: StrategySpec) -> dict[str, object]:
        return _CRITIQUES.get(
            spec.strategy_name,
            {
                "strategy_name": spec.strategy_name,
                "verdict": "revise_before_backtest",
                "major_issues": ["uncatalogued strategy — review manually"],
                "leakage_risks": [],
                "overfitting_risks": [],
                "transaction_cost_risks": [],
                "data_quality_risks": [],
                "economic_rationale_strength": "moderate",
                "suggested_mutations": [],
                "confidence": 0.4,
            },
        )
