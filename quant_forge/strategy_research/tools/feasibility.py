"""Map research data requirements to available data and proxies."""

from __future__ import annotations

from dataclasses import dataclass

from quant_forge.strategy_research.tools.data_catalog import (
    AvailableDataCatalogTool,
    DataCatalogSnapshot,
)
from quant_forge.strategy_research.tools.feature_catalog import FeatureCatalogTool


@dataclass(frozen=True)
class ProxySuggestion:
    requirement: str
    description: str
    features: list[str]
    strength: str


class DataRequirementMapperTool:
    """Classify high-level requirements against the current catalog."""

    def __init__(
        self,
        data_catalog: AvailableDataCatalogTool | None = None,
        feature_catalog: FeatureCatalogTool | None = None,
    ) -> None:
        self.data_catalog = data_catalog or AvailableDataCatalogTool()
        self.feature_catalog = feature_catalog or FeatureCatalogTool()

    def classify(self, requirement: str) -> str:
        catalog = self.data_catalog.get_catalog()
        if (
            requirement in catalog.available_now
            or requirement in self.feature_catalog.list_features()
        ):
            return "available_now"
        if requirement in catalog.available_with_existing_adapter:
            return "available_with_existing_adapter"
        aliases = {
            "analyst_revision_drift": "analyst_revisions",
            "institutional_flow": "institutional_ownership",
            "sentiment": "alternative_data",
        }
        normalized = aliases.get(requirement, requirement)
        if normalized in catalog.desired_future_data:
            return "desired_future_data"
        return "missing"

    def catalog(self) -> DataCatalogSnapshot:
        return self.data_catalog.get_catalog()


class ProxyFeatureSuggesterTool:
    """Suggest explicitly labeled, imperfect proxies for missing requirements."""

    def suggest(self, requirement: str) -> ProxySuggestion | None:
        suggestions = {
            "earnings_surprise": ProxySuggestion(
                requirement="earnings_surprise",
                description="Use event-day gap and abnormal volume as an imperfect surprise proxy.",
                features=["gap_1d", "volume_zscore"],
                strength="moderate",
            ),
            "analyst_revision_drift": ProxySuggestion(
                requirement="analyst_revision_drift",
                description="Use price momentum as a weak proxy for analyst revision drift.",
                features=["return_20d", "sector_relative_return_20d"],
                strength="weak",
            ),
            "analyst_revisions": ProxySuggestion(
                requirement="analyst_revisions",
                description="Use price momentum as a weak proxy for analyst revisions.",
                features=["return_20d", "sector_relative_return_20d"],
                strength="weak",
            ),
            "sentiment": ProxySuggestion(
                requirement="sentiment",
                description="Use abnormal volume and gaps as a weak attention proxy.",
                features=["volume_zscore", "gap_1d"],
                strength="weak",
            ),
            "institutional_flow": ProxySuggestion(
                requirement="institutional_flow",
                description="Use abnormal volume as a weak institutional flow proxy.",
                features=["volume_zscore"],
                strength="weak",
            ),
        }
        return suggestions.get(requirement)
