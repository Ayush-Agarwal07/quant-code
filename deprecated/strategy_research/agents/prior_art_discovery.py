"""Prior-art discovery agent."""

from __future__ import annotations

from quant_code.models.base import LLMClient
from quant_code.strategy_research.agents.base import AgentResult, BaseAgent
from quant_code.strategy_research.schemas import PriorArtTheme, ResearchAgenda
from quant_code.strategy_research.tools.research_catalog import ResearchCorpusSearchStub


class PriorArtDiscoveryAgent(BaseAgent):
    """Search a deterministic offline research catalog."""

    name = "prior_art_discovery"

    def __init__(self, llm: LLMClient, search_tool: ResearchCorpusSearchStub | None = None) -> None:
        super().__init__(llm)
        self.search_tool = search_tool or ResearchCorpusSearchStub()

    def run(self, agenda: ResearchAgenda) -> AgentResult[list[PriorArtTheme]]:
        return self._execute(
            input_summary=f"Agenda domain: {agenda.research_domain}",
            output_summary="Selected relevant offline prior-art themes.",
            schema_used="list[PriorArtTheme]",
            operation=lambda: self.search_tool.search(agenda.research_objective, limit=4),
        )
