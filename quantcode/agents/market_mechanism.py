"""Agent 3 — MarketMechanismAgent: WHY an effect could exist (economic mechanism).

Input: ResearchAgenda + list[PriorArtTheme]. Output: list[MarketMechanism] explaining
why an edge may exist and why it may disappear.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import MarketMechanism, PriorArtTheme, ResearchAgenda

PROMPT = (
    "For the prior-art themes, articulate the underlying economic mechanism: why a real edge could "
    "exist (information frictions, behavioral bias, structural constraint), why it could decay or "
    "vanish (arbitrage, regime change, costs), and the observable implications that make it "
    "testable. Tie each mechanism back to the themes it explains."
)


class MarketMechanismAgent(Agent):
    def run(
        self, agenda: ResearchAgenda, themes: list[PriorArtTheme]
    ) -> list[MarketMechanism]:
        ctx_base = {
            "agenda": agenda.model_dump(mode="json"),
            "themes": [t.model_dump(mode="json") for t in themes],
        }
        # ponytail: one model per call; loop the fixtures to assemble the list.
        mechanisms: list[MarketMechanism] = []
        for fixture in self._mock(themes):
            out = self.llm.generate_structured(
                PROMPT, MarketMechanism, {**ctx_base, "mock": fixture}
            )
            assert isinstance(out, MarketMechanism)
            mechanisms.append(out)
        return mechanisms

    def _mock(self, themes: list[PriorArtTheme]) -> list[dict[str, object]]:
        del themes
        return [
            {
                "name": "gradual_information_diffusion",
                "description": "Investors digest news slowly, so prices adjust over days not "
                "instantly, leaving short-horizon continuation.",
                "why_edge_might_exist": [
                    "limited attention",
                    "staggered analyst updates",
                    "anchoring on stale prices",
                ],
                "why_edge_might_disappear": [
                    "faster information distribution",
                    "crowding by quant funds",
                    "transaction costs erode thin edges",
                ],
                "observable_implications": [
                    "positive autocorrelation of 5-20d returns",
                    "stronger drift on high-volume moves",
                ],
                "related_themes": ["momentum_continuation", "volume_confirmed_continuation"],
            },
            {
                "name": "earnings_surprise_underreaction",
                "description": "Markets underreact to earnings surprises, producing drift toward "
                "the surprise direction for weeks.",
                "why_edge_might_exist": [
                    "conservatism bias in updating beliefs",
                    "delayed institutional rebalancing",
                ],
                "why_edge_might_disappear": [
                    "earnings data widely arbitraged",
                    "increased pre-announcement positioning",
                ],
                "observable_implications": [
                    "post-event cumulative abnormal returns aligned with surprise sign",
                ],
                "related_themes": ["post_earnings_drift"],
            },
        ]
