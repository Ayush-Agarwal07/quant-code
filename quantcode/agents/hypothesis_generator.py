"""Agent 4 — HypothesisGeneratorAgent: testable research claims (not strategies yet).

Input: ResearchAgenda + themes + mechanisms. Output: list[CandidateHypothesis], a mix
of cleanly-testable ideas and proxy-based ones.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import (
    CandidateHypothesis,
    MarketMechanism,
    PriorArtTheme,
    ResearchAgenda,
)

PROMPT = (
    "Turn the mechanisms into specific, falsifiable hypotheses. Each states the claim, the "
    "mechanism it rests on, the predicted effect, universe, horizon, the data it needs, any usable "
    "proxy data, expected failure modes, and concrete falsification tests. These are research "
    "claims to be tested — not strategies and not performance promises."
)


class HypothesisGeneratorAgent(Agent):
    def run(
        self,
        agenda: ResearchAgenda,
        themes: list[PriorArtTheme],
        mechanisms: list[MarketMechanism],
    ) -> list[CandidateHypothesis]:
        ctx_base = {
            "agenda": agenda.model_dump(mode="json"),
            "themes": [t.model_dump(mode="json") for t in themes],
            "mechanisms": [m.model_dump(mode="json") for m in mechanisms],
        }
        # ponytail: one model per call; loop the fixtures to build the list.
        hypotheses: list[CandidateHypothesis] = []
        for fixture in self._mock():
            out = self.llm.generate_structured(
                PROMPT, CandidateHypothesis, {**ctx_base, "mock": fixture}
            )
            assert isinstance(out, CandidateHypothesis)
            hypotheses.append(out)
        return hypotheses

    def _mock(self) -> list[dict[str, object]]:
        return [
            {
                "hypothesis_name": "short_horizon_price_momentum",
                "hypothesis": "Stocks with high 20-day returns outperform over the next 5 days.",
                "mechanism": "gradual_information_diffusion",
                "predicted_effect": "Top-decile 20d-return names earn positive forward 5d alpha.",
                "asset_universe": "US liquid equities",
                "horizon": "5d",
                "required_data": ["close", "return_20d", "return_5d"],
                "possible_proxy_data": [],
                "expected_failure_modes": ["momentum crash", "cost erosion"],
                "falsification_tests": [
                    "no positive forward return spread across deciles",
                    "spread vanishes after costs",
                ],
                "confidence": 0.7,
            },
            {
                "hypothesis_name": "volume_confirmed_momentum",
                "hypothesis": "Momentum on abnormally high volume drifts more than on normal "
                "volume.",
                "mechanism": "gradual_information_diffusion",
                "predicted_effect": "High volume_zscore winners outperform low-volume winners.",
                "asset_universe": "US liquid equities",
                "horizon": "20d",
                "required_data": ["close", "return_20d", "volume", "volume_zscore"],
                "possible_proxy_data": [],
                "expected_failure_modes": ["volume regime shifts"],
                "falsification_tests": ["no interaction between volume_zscore and forward return"],
                "confidence": 0.6,
            },
            {
                "hypothesis_name": "post_earnings_drift_proxy",
                "hypothesis": "Stocks drift after large earnings surprises; absent clean earnings "
                "data, large gap_1d moves proxy the surprise.",
                "mechanism": "earnings_surprise_underreaction",
                "predicted_effect": "Large positive gap_1d names drift up over 20 days.",
                "asset_universe": "US liquid equities",
                "horizon": "20d",
                "required_data": ["earnings_surprise", "close", "return_20d"],
                "possible_proxy_data": ["gap_1d", "volume_zscore"],
                "expected_failure_modes": [
                    "gap is a noisy proxy for the surprise",
                    "gaps from non-earnings news",
                ],
                "falsification_tests": ["gap-sorted drift indistinguishable from noise"],
                "confidence": 0.5,
            },
            {
                "hypothesis_name": "analyst_revision_underreaction",
                "hypothesis": "Prices underreact to analyst estimate revisions and drift toward "
                "them.",
                "mechanism": "earnings_surprise_underreaction",
                "predicted_effect": "Upward-revised names earn positive forward returns.",
                "asset_universe": "US liquid equities",
                "horizon": "20d",
                "required_data": ["analyst_estimate_revisions", "close"],
                "possible_proxy_data": [],
                "expected_failure_modes": ["no revisions feed available"],
                "falsification_tests": ["no forward return spread by revision direction"],
                "confidence": 0.45,
            },
        ]
