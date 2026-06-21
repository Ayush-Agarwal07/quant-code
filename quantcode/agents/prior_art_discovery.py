"""Agent 2 — PriorArtDiscoveryAgent: known effects/literature → PriorArtThemes.

Input: ResearchAgenda. Output: list[PriorArtTheme] (offline catalog by default; the
browser/ path also produces PriorArtThemes, with source_url set).
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import PriorArtTheme, ResearchAgenda

PROMPT = (
    "You catalog documented market effects relevant to the agenda. For each known effect, give "
    "the theme name, a one-line summary, its mechanism type, the data it needs, its known risks, "
    "the source type, and your confidence. Stick to well-established prior art; do not invent "
    "strategies — these are research themes, not trades."
)


class PriorArtDiscoveryAgent(Agent):
    def run(self, agenda: ResearchAgenda) -> list[PriorArtTheme]:
        ctx_base = {"agenda": agenda.model_dump(mode="json")}
        # ponytail: generate_structured returns ONE model; loop per fixture for a list output.
        themes: list[PriorArtTheme] = []
        for fixture in self._mock(agenda):
            out = self.llm.generate_structured(PROMPT, PriorArtTheme, {**ctx_base, "mock": fixture})
            assert isinstance(out, PriorArtTheme)
            themes.append(out)
        return themes

    def _mock(self, agenda: ResearchAgenda) -> list[dict[str, object]]:
        del agenda
        return [
            {
                "theme": "momentum_continuation",
                "summary": "Recent winners keep outperforming as information diffuses gradually.",
                "mechanism_type": "behavioral_underreaction",
                "required_data": ["OHLCV"],
                "known_risks": ["momentum crashes", "crowding"],
                "source_type": "mock_catalog",
                "confidence": 0.75,
            },
            {
                "theme": "post_earnings_drift",
                "summary": "Prices drift toward an earnings surprise for weeks after the report.",
                "mechanism_type": "behavioral_underreaction",
                "required_data": ["OHLCV", "earnings_surprise"],
                "known_risks": ["timestamp/leakage on earnings dates", "thin coverage"],
                "source_type": "mock_catalog",
                "confidence": 0.7,
            },
            {
                "theme": "volume_confirmed_continuation",
                "summary": "Moves on abnormally high volume underreact more strongly.",
                "mechanism_type": "behavioral_underreaction",
                "required_data": ["OHLCV", "volume"],
                "known_risks": ["volume regime shifts"],
                "source_type": "mock_catalog",
                "confidence": 0.6,
            },
        ]
