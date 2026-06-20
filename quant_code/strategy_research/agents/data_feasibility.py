"""Data feasibility agent."""

from __future__ import annotations

from quant_code.models.base import LLMClient
from quant_code.strategy_research.agents.base import AgentResult, BaseAgent
from quant_code.strategy_research.schemas import (
    CandidateHypothesis,
    DataFeasibilityReport,
    DataFeasibilityVerdict,
)
from quant_code.strategy_research.tools.feasibility import (
    DataRequirementMapperTool,
    ProxyFeatureSuggesterTool,
)


class DataFeasibilityAgent(BaseAgent):
    """Gate hypotheses according to available data and explicitly approved proxies."""

    name = "data_feasibility"

    def __init__(
        self,
        llm: LLMClient,
        mapper: DataRequirementMapperTool | None = None,
        proxy_suggester: ProxyFeatureSuggesterTool | None = None,
    ) -> None:
        super().__init__(llm)
        self.mapper = mapper or DataRequirementMapperTool()
        self.proxy_suggester = proxy_suggester or ProxyFeatureSuggesterTool()

    def run(
        self, hypotheses: list[CandidateHypothesis]
    ) -> AgentResult[list[DataFeasibilityReport]]:
        return self._execute(
            input_summary=f"{len(hypotheses)} candidate hypotheses",
            output_summary="Classified every hypothesis against the current data catalog.",
            schema_used="list[DataFeasibilityReport]",
            operation=lambda: [self._assess(hypothesis) for hypothesis in hypotheses],
        )

    def _assess(self, hypothesis: CandidateHypothesis) -> DataFeasibilityReport:
        available_now: list[str] = []
        available_with_adapter: list[str] = []
        missing: list[str] = []
        unresolved_missing: list[str] = []
        proxy_features: list[str] = []
        proxy_descriptions: list[str] = []
        proxy_strengths: list[str] = []
        categories: dict[str, str] = {}

        for requirement in hypothesis.required_data:
            category = self.mapper.classify(requirement)
            categories[requirement] = category
            if category == "available_now":
                available_now.append(requirement)
                continue
            if category == "available_with_existing_adapter":
                available_with_adapter.append(requirement)
                continue

            missing.append(requirement)
            suggestion = self.proxy_suggester.suggest(requirement)
            approved_features = set(hypothesis.possible_proxy_data)
            if suggestion and set(suggestion.features).issubset(approved_features):
                proxy_features.extend(suggestion.features)
                proxy_descriptions.append(suggestion.description)
                proxy_strengths.append(suggestion.strength)
            else:
                unresolved_missing.append(requirement)

        if unresolved_missing:
            verdict = (
                DataFeasibilityVerdict.REQUIRES_NEW_DATA_SOURCE
                if any(categories[item] == "desired_future_data" for item in unresolved_missing)
                else DataFeasibilityVerdict.NOT_TESTABLE
            )
        elif proxy_features:
            verdict = DataFeasibilityVerdict.TESTABLE_WITH_PROXY
        else:
            verdict = DataFeasibilityVerdict.TESTABLE_NOW

        risks: list[str] = []
        if available_with_adapter:
            risks.append("Adapter-backed data must be validated for point-in-time timestamps.")
        if proxy_features:
            risks.append(
                "Proxy features may not isolate the intended signal; "
                f"strengths: {', '.join(proxy_strengths)}."
            )
        if missing and unresolved_missing:
            risks.append("Required data is not currently available.")

        return DataFeasibilityReport(
            hypothesis_name=hypothesis.hypothesis_name,
            verdict=verdict,
            required_data=hypothesis.required_data,
            available_now=available_now,
            available_with_existing_adapter=available_with_adapter,
            missing_data=missing,
            proxy_available=bool(proxy_features),
            proxy_description=" ".join(proxy_descriptions) or None,
            proxy_features=list(dict.fromkeys(proxy_features)),
            data_quality_risks=risks,
        )
