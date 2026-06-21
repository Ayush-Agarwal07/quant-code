"""Agent 1 — ResearchDirectorAgent: frame the objective into a ResearchAgenda.

Input: QuantResearchRequest (+ optional Tier 3 lessons retrieved from memory).
Output: one ResearchAgenda that narrows the objective into research questions.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import Lesson, QuantResearchRequest, ResearchAgenda

PROMPT = (
    "You are the research director for a systematic-strategy lab. Turn the user's objective "
    "into a focused research agenda: pick the research domain, asset universe, target horizons, "
    "candidate strategy styles, and 3-5 sharp research questions. Honor any constraints. If prior "
    "lessons are supplied, let them steer what to investigate and what to avoid."
)


class ResearchDirectorAgent(Agent):
    def run(
        self, req: QuantResearchRequest, lessons: list[Lesson] | None = None
    ) -> ResearchAgenda:
        ctx = {
            "request": req.model_dump(mode="json"),
            "lessons": [lsn.text for lsn in (lessons or [])],
            "mock": self._mock(req),
        }
        out = self.llm.generate_structured(PROMPT, ResearchAgenda, ctx)
        assert isinstance(out, ResearchAgenda)
        return out

    def _mock(self, req: QuantResearchRequest) -> dict[str, object]:
        return {
            "research_objective": req.objective,
            "research_domain": "behavioral_underreaction",
            "asset_universe": req.asset_universe or "US liquid equities",
            "target_horizons": ["1d", "5d", "20d"],
            "strategy_styles": ["momentum_continuation", "post_earnings_drift"],
            "constraints": req.constraints,
            "research_questions": [
                "Do recent short-horizon winners continue to outperform over 5-20 days?",
                "Does price drift in the direction of an earnings surprise after the event?",
                "How much of the effect survives realistic transaction costs?",
                "Which underreaction signals are cleanly available vs only via a proxy?",
            ],
        }
