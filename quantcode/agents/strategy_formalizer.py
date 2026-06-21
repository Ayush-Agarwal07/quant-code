"""Agent 6 — StrategyFormalizerAgent: feasible hypothesis → draft StrategySpec.

Input: list[CandidateHypothesis] already filtered to feasible verdicts by the pipeline.
Output: list[StrategySpec]. Every rule uses ONLY the D8 allowlist (18 features, 7
operators) so StrategyValidatorTool passes it; no leakage features anywhere.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import CandidateHypothesis, StrategySpec

PROMPT = (
    "Formalize each feasible hypothesis into a concrete, deterministic StrategySpec: entry rules, "
    "exit rules, an optional ranking rule, portfolio rules, and risk rules. Use ONLY supported "
    "features and operators; never reference future-looking data. A proxy-based hypothesis must "
    "set backtest_readiness to 'ready_with_proxy_limitations'. Keep the economic rationale tied to "
    "the hypothesis's mechanism."
)

# ponytail: deterministic spec per feasible hypothesis_name; only the keys present here
# formalize (the pipeline only passes feasible hypotheses, so this stays small).
_SPECS: dict[str, dict[str, object]] = {
    "short_horizon_price_momentum": {
        "strategy_name": "short_horizon_momentum",
        "source_hypothesis": "short_horizon_price_momentum",
        "strategy_family": "momentum",
        "hypothesis": "Stocks with high 20-day returns outperform over the next 5 days.",
        "economic_rationale": "Gradual information diffusion leaves short-horizon continuation.",
        "universe": "US liquid equities",
        "entry_rules": [
            {"feature": "return_20d", "operator": ">", "value": 0.0},
            {"feature": "return_5d", "operator": ">", "value": 0.0},
        ],
        "exit_rules": [{"feature": "holding_days", "operator": ">=", "value": 5}],
        "ranking_rule": {"feature": "return_20d", "order": "descending", "top_n": 20},
        "portfolio_rules": {
            "weighting": "equal_weight",
            "max_position": 0.05,
            "rebalance_frequency": "weekly",
        },
        "risk_rules": {"max_holding_days": 10, "max_turnover": 2.0},
        "required_data": ["close", "return_20d", "return_5d"],
        "expected_failure_modes": ["momentum crash", "cost erosion"],
        "backtest_readiness": "ready",
        "confidence": 0.65,
    },
    "volume_confirmed_momentum": {
        "strategy_name": "volume_confirmed_momentum",
        "source_hypothesis": "volume_confirmed_momentum",
        "strategy_family": "momentum",
        "hypothesis": "Momentum on abnormally high volume drifts more than on normal volume.",
        "economic_rationale": "High-volume moves carry more information, so underreaction is "
        "stronger.",
        "universe": "US liquid equities",
        "entry_rules": [
            {"feature": "return_20d", "operator": ">", "value": 0.0},
            {"feature": "volume_zscore", "operator": ">=", "value": 1.0},
        ],
        "exit_rules": [{"feature": "holding_days", "operator": ">=", "value": 20}],
        "ranking_rule": {"feature": "volume_zscore", "order": "descending", "top_n": 20},
        "portfolio_rules": {
            "weighting": "rank_weighted",
            "max_position": 0.05,
            "rebalance_frequency": "monthly",
        },
        "risk_rules": {"max_holding_days": 30, "max_turnover": 1.5},
        "required_data": ["close", "return_20d", "volume", "volume_zscore"],
        "expected_failure_modes": ["volume regime shifts"],
        "backtest_readiness": "ready",
        "confidence": 0.55,
    },
    "post_earnings_drift_proxy": {
        "strategy_name": "gap_drift_proxy",
        "source_hypothesis": "post_earnings_drift_proxy",
        "strategy_family": "drift",
        "hypothesis": "Large positive gap_1d moves drift up over 20 days (gap proxies the "
        "earnings surprise).",
        "economic_rationale": "Underreaction to surprise news; gap_1d stands in for the surprise "
        "when clean earnings data is unavailable.",
        "universe": "US liquid equities",
        "entry_rules": [
            {"feature": "gap_1d", "operator": ">", "value": 0.03},
            {"feature": "volume_zscore", "operator": ">=", "value": 1.0},
        ],
        "exit_rules": [{"feature": "holding_days", "operator": ">=", "value": 20}],
        "ranking_rule": {"feature": "gap_1d", "order": "descending", "top_n": 15},
        "portfolio_rules": {
            "weighting": "equal_weight",
            "max_position": 0.05,
            "rebalance_frequency": "weekly",
        },
        "risk_rules": {"stop_loss": 0.08, "max_holding_days": 25, "max_turnover": 2.0},
        "required_data": ["close", "return_20d", "gap_1d", "volume_zscore"],
        "expected_failure_modes": [
            "gap_1d is a noisy proxy for the earnings surprise",
            "gaps from non-earnings news",
        ],
        "backtest_readiness": "ready_with_proxy_limitations",
        "confidence": 0.45,
    },
}


class StrategyFormalizerAgent(Agent):
    def run(self, feasible: list[CandidateHypothesis]) -> list[StrategySpec]:
        # ponytail: one model per call; loop feasible hypotheses to build the spec list.
        specs: list[StrategySpec] = []
        for hyp in feasible:
            fixture = _SPECS.get(hyp.hypothesis_name)
            if fixture is None:  # ponytail: skip anything we have no formalization for
                continue
            ctx = {"hypothesis": hyp.model_dump(mode="json"), "mock": fixture}
            out = self.llm.generate_structured(PROMPT, StrategySpec, ctx)
            assert isinstance(out, StrategySpec)
            specs.append(out)
        return specs
