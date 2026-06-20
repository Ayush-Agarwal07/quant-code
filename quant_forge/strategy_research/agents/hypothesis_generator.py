"""Candidate hypothesis generation agent."""

from __future__ import annotations

from quant_forge.models.base import LLMClient
from quant_forge.strategy_research.agents.base import AgentResult, BaseAgent
from quant_forge.strategy_research.prompts import HYPOTHESIS_PROMPT
from quant_forge.strategy_research.schemas import (
    CandidateHypothesis,
    MarketMechanism,
    PriorArtTheme,
    ResearchAgenda,
)


class HypothesisGenerationAgent(BaseAgent):
    """Generate falsifiable claims rather than final strategy rules."""

    name = "hypothesis_generation"
    variants = (
        "pead_proxy",
        "price_volume_continuation",
        "analyst_revision_proxy",
        "options_volatility",
    )

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    def run(
        self,
        agenda: ResearchAgenda,
        prior_art_themes: list[PriorArtTheme],
        mechanisms: list[MarketMechanism],
    ) -> AgentResult[list[CandidateHypothesis]]:
        def operation() -> list[CandidateHypothesis]:
            hypotheses: list[CandidateHypothesis] = []
            for variant in self.variants:
                generated = self.llm.generate_structured(
                    HYPOTHESIS_PROMPT,
                    CandidateHypothesis,
                    {
                        "variant": variant,
                        "asset_universe": agenda.asset_universe,
                        "themes": [theme.theme for theme in prior_art_themes],
                        "mechanisms": [mechanism.name for mechanism in mechanisms],
                    },
                )
                hypotheses.append(CandidateHypothesis.model_validate(generated.model_dump()))
            return hypotheses

        return self._execute(
            input_summary=(
                f"{len(prior_art_themes)} themes and {len(mechanisms)} mechanisms "
                f"for {agenda.asset_universe}"
            ),
            output_summary="Generated falsifiable candidate hypotheses.",
            schema_used="list[CandidateHypothesis]",
            operation=operation,
        )
