"""Market mechanism agent."""

from __future__ import annotations

from quant_forge.models.base import LLMClient
from quant_forge.strategy_research.agents.base import AgentResult, BaseAgent
from quant_forge.strategy_research.prompts import MARKET_MECHANISM_PROMPT
from quant_forge.strategy_research.schemas import (
    MarketMechanism,
    PriorArtTheme,
    ResearchAgenda,
)


class MarketMechanismAgent(BaseAgent):
    """Translate prior art into explicit mechanisms and observable implications."""

    name = "market_mechanism"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    def run(
        self,
        agenda: ResearchAgenda,
        prior_art_themes: list[PriorArtTheme],
    ) -> AgentResult[list[MarketMechanism]]:
        def operation() -> list[MarketMechanism]:
            mechanisms: list[MarketMechanism] = []
            for theme in prior_art_themes:
                generated = self.llm.generate_structured(
                    MARKET_MECHANISM_PROMPT,
                    MarketMechanism,
                    {
                        "objective": agenda.research_objective,
                        "theme": theme.theme,
                        "mechanism_type": theme.mechanism_type,
                    },
                )
                mechanisms.append(MarketMechanism.model_validate(generated.model_dump()))
            return mechanisms

        return self._execute(
            input_summary=f"{len(prior_art_themes)} prior-art themes",
            output_summary="Mapped themes to explicit market mechanisms.",
            schema_used="list[MarketMechanism]",
            operation=operation,
        )
