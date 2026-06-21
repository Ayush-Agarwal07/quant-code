"""Agent 5 — DataFeasibilityAgent: the feasibility gate.

Input: list[CandidateHypothesis]. Output: list[DataFeasibilityReport], one per
hypothesis. Only `testable_now` / `testable_with_proxy` advance; the others stay in the
packet but do not become strategies (see docs/agent_flow.md Feasibility Gate).
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import CandidateHypothesis, DataFeasibilityReport

PROMPT = (
    "Assess whether each hypothesis can actually be tested with available data. Classify the "
    "verdict (testable_now / testable_with_proxy / requires_new_data_source / not_testable), list "
    "what data is available now, what needs an existing adapter, what is missing, whether a proxy "
    "exists and which proxy features, plus data-quality risks. Be honest: a weak proxy is "
    "testable_with_proxy, not testable_now."
)

# ponytail: the demo chain maps each hypothesis_name to one canned report; lookup keeps
# the verdict mix deterministic (2 advance clean, 1 advances via proxy, 1 deferred).
_REPORTS: dict[str, dict[str, object]] = {
    "short_horizon_price_momentum": {
        "hypothesis_name": "short_horizon_price_momentum",
        "verdict": "testable_now",
        "required_data": ["close", "return_20d", "return_5d"],
        "available_now": ["close", "return_20d", "return_5d"],
        "available_with_existing_adapter": [],
        "missing_data": [],
        "proxy_available": False,
        "proxy_description": None,
        "proxy_features": [],
        "data_quality_risks": ["survivorship bias in the universe"],
    },
    "volume_confirmed_momentum": {
        "hypothesis_name": "volume_confirmed_momentum",
        "verdict": "testable_now",
        "required_data": ["close", "return_20d", "volume", "volume_zscore"],
        "available_now": ["close", "return_20d", "volume", "volume_zscore"],
        "available_with_existing_adapter": [],
        "missing_data": [],
        "proxy_available": False,
        "proxy_description": None,
        "proxy_features": [],
        "data_quality_risks": ["volume spikes around index rebalances"],
    },
    "post_earnings_drift_proxy": {
        "hypothesis_name": "post_earnings_drift_proxy",
        "verdict": "testable_with_proxy",
        "required_data": ["earnings_surprise", "close", "return_20d"],
        "available_now": ["close", "return_20d", "gap_1d", "volume_zscore"],
        "available_with_existing_adapter": [],
        "missing_data": ["earnings_surprise"],
        "proxy_available": True,
        "proxy_description": "Use large gap_1d (with volume_zscore confirmation) as a noisy "
        "stand-in for the earnings surprise.",
        "proxy_features": ["gap_1d", "volume_zscore"],
        "data_quality_risks": [
            "gap_1d conflates earnings with other news",
            "proxy weakens the economic link",
        ],
    },
    "analyst_revision_underreaction": {
        "hypothesis_name": "analyst_revision_underreaction",
        "verdict": "requires_new_data_source",
        "required_data": ["analyst_estimate_revisions", "close"],
        "available_now": ["close"],
        "available_with_existing_adapter": [],
        "missing_data": ["analyst_estimate_revisions"],
        "proxy_available": False,
        "proxy_description": None,
        "proxy_features": [],
        "data_quality_risks": ["no revisions feed integrated yet"],
    },
}


class DataFeasibilityAgent(Agent):
    def run(self, hypotheses: list[CandidateHypothesis]) -> list[DataFeasibilityReport]:
        # ponytail: one model per call; loop hypotheses to assemble the report list.
        reports: list[DataFeasibilityReport] = []
        for hyp in hypotheses:
            ctx = {"hypothesis": hyp.model_dump(mode="json"), "mock": self._mock(hyp)}
            out = self.llm.generate_structured(PROMPT, DataFeasibilityReport, ctx)
            assert isinstance(out, DataFeasibilityReport)
            reports.append(out)
        return reports

    def _mock(self, hyp: CandidateHypothesis) -> dict[str, object]:
        return _REPORTS.get(
            hyp.hypothesis_name,
            {
                "hypothesis_name": hyp.hypothesis_name,
                "verdict": "not_testable",
                "required_data": hyp.required_data,
                "available_now": [],
                "available_with_existing_adapter": [],
                "missing_data": hyp.required_data,
                "proxy_available": False,
                "proxy_description": None,
                "proxy_features": [],
                "data_quality_risks": ["no data path identified"],
            },
        )
