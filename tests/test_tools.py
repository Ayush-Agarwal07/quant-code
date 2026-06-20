from __future__ import annotations

from quant_forge.strategy_research.schemas import (
    PortfolioRules,
    StrategyRule,
    StrategySpec,
)
from quant_forge.strategy_research.tools.data_catalog import AvailableDataCatalogTool
from quant_forge.strategy_research.tools.feasibility import (
    DataRequirementMapperTool,
    ProxyFeatureSuggesterTool,
)
from quant_forge.strategy_research.tools.feature_catalog import FeatureCatalogTool
from quant_forge.strategy_research.tools.research_catalog import KnownAnomalyCatalogTool
from quant_forge.strategy_research.tools.validation import (
    CostRiskHeuristicTool,
    DSLValidationTool,
    LeakageCheckTool,
    RuleComplexityTool,
)


def test_known_anomaly_catalog_returns_expected_themes() -> None:
    themes = KnownAnomalyCatalogTool().list_themes()
    names = {theme.theme for theme in themes}
    assert "post_earnings_announcement_drift" in names
    assert "momentum_continuation" in names
    assert len(themes) == 6


def test_available_data_catalog_returns_expected_categories() -> None:
    catalog = AvailableDataCatalogTool().get_catalog()
    assert "OHLCV" in catalog.available_now
    assert "earnings_dates" in catalog.available_with_existing_adapter
    assert "analyst_revisions" in catalog.desired_future_data


def test_feature_catalog_returns_expected_features() -> None:
    features = FeatureCatalogTool().list_features()
    assert {"return_20d", "volume_zscore", "holding_days"}.issubset(features)


def test_data_requirement_mapper_classifies_requirements() -> None:
    mapper = DataRequirementMapperTool()
    assert mapper.classify("OHLCV") == "available_now"
    assert mapper.classify("earnings_dates") == "available_with_existing_adapter"
    assert mapper.classify("analyst_revisions") == "desired_future_data"
    assert mapper.classify("earnings_surprise") == "missing"


def test_proxy_suggester_returns_explicit_proxy() -> None:
    suggestion = ProxyFeatureSuggesterTool().suggest("earnings_surprise")
    assert suggestion is not None
    assert suggestion.features == ["gap_1d", "volume_zscore"]


def test_dsl_validation_accepts_valid_strategy(valid_strategy: StrategySpec) -> None:
    result = DSLValidationTool().validate(valid_strategy)
    assert result.valid
    assert result.errors == []


def test_dsl_validation_rejects_unsupported_feature(valid_strategy: StrategySpec) -> None:
    bad_rule = StrategyRule(feature="future_return", operator=">", value=0)
    strategy = valid_strategy.model_copy(update={"entry_rules": [bad_rule]})
    result = DSLValidationTool().validate(strategy)
    assert not result.valid
    assert any("Unsupported feature" in error for error in result.errors)


def test_leakage_check_flags_future_looking_terms() -> None:
    result = LeakageCheckTool().check("Select each future winner using next_return.")
    assert len(result.issues) == 2


def test_rule_complexity_flags_overly_complex_strategy(valid_strategy: StrategySpec) -> None:
    rules = [StrategyRule(feature="return_20d", operator=">=", value=value) for value in range(6)]
    strategy = valid_strategy.model_copy(update={"entry_rules": rules})
    result = RuleComplexityTool().assess(strategy)
    assert any("five entry rules" in issue for issue in result.issues)


def test_cost_risk_flags_daily_short_horizon_setup(valid_strategy: StrategySpec) -> None:
    strategy = valid_strategy.model_copy(
        update={
            "entry_rules": [StrategyRule(feature="return_1d", operator=">", value=0.01)],
            "portfolio_rules": PortfolioRules(
                weighting="equal_weight",
                max_position=0.03,
                max_sector_weight=0.2,
                rebalance_frequency="daily",
            ),
        }
    )
    result = CostRiskHeuristicTool().assess(strategy)
    assert any("Daily rebalancing" in issue for issue in result.issues)
