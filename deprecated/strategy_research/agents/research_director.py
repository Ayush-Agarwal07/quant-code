"""Research director agent."""

from __future__ import annotations

from quant_code.models.base import LLMClient
from quant_code.strategy_research.agents.base import AgentResult, BaseAgent
from quant_code.strategy_research.prompts import RESEARCH_DIRECTOR_PROMPT
from quant_code.strategy_research.schemas import QuantResearchRequest, ResearchAgenda


class ResearchDirectorAgent(BaseAgent):
    """Convert a broad objective into a bounded research agenda."""

    name = "research_director"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    def run(self, request: QuantResearchRequest | str) -> AgentResult[ResearchAgenda]:
        normalized = (
            request
            if isinstance(request, QuantResearchRequest)
            else QuantResearchRequest(objective=request)
        )

        def operation() -> ResearchAgenda:
            generated = self.llm.generate_structured(
                RESEARCH_DIRECTOR_PROMPT,
                ResearchAgenda,
                {
                    "objective": normalized.objective,
                    "asset_universe": normalized.asset_universe,
                    "constraints": normalized.constraints,
                },
            )
            return ResearchAgenda.model_validate(generated.model_dump())

        return self._execute(
            input_summary=f"Objective: {normalized.objective}",
            output_summary="Created a bounded research agenda.",
            schema_used=ResearchAgenda.__name__,
            operation=operation,
        )
