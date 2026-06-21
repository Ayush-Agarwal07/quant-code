"""Deterministic strategy validation and critique heuristics."""

from __future__ import annotations

import json
from dataclasses import dataclass

from quant_code.strategy_research.schemas import StrategySpec
from quant_code.strategy_research.tools.feature_catalog import FeatureCatalogTool

SUPPORTED_OPERATORS = {">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"}


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    errors: list[str]


@dataclass(frozen=True)
class HeuristicResult:
    issues: list[str]


@dataclass(frozen=True)
class RuleComplexityResult:
    entry_rule_count: int
    exit_rule_count: int
    threshold_count: int
    lookback_count: int
    issues: list[str]


class DSLValidationTool:
    """Validate a StrategySpec against the supported deterministic DSL."""

    def __init__(self, feature_catalog: FeatureCatalogTool | None = None) -> None:
        self.feature_catalog = feature_catalog or FeatureCatalogTool()

    def validate(self, strategy: StrategySpec) -> ValidationResult:
        errors: list[str] = []
        supported_features = set(self.feature_catalog.list_features())
        if not strategy.entry_rules:
            errors.append("At least one entry rule is required.")
        if not strategy.exit_rules:
            errors.append("At least one exit rule is required.")
        for rule in [*strategy.entry_rules, *strategy.exit_rules]:
            if rule.feature not in supported_features:
                errors.append(f"Unsupported feature: {rule.feature}")
            if rule.feature_ref and rule.feature_ref not in supported_features:
                errors.append(f"Unsupported feature reference: {rule.feature_ref}")
            if rule.operator not in SUPPORTED_OPERATORS:
                errors.append(f"Unsupported operator: {rule.operator}")
        if strategy.ranking_rule and strategy.ranking_rule.feature not in supported_features:
            errors.append(f"Unsupported ranking feature: {strategy.ranking_rule.feature}")
        if strategy.backtest_readiness != "not_ready" and not strategy.required_data:
            errors.append("Backtest-ready strategy requires data.")
        return ValidationResult(valid=not errors, errors=errors)


class LeakageCheckTool:
    """Heuristically flag common future-looking research terms."""

    TERMS = {
        "future_return": "future return feature",
        "next_return": "next-period return feature",
        "future winner": "future winner label",
        "post-event label used before event": "post-event label used before event",
        "earnings surprise without timestamp": "untimestamped earnings surprise",
        "future index constituent": "future index constituent membership",
        "unlagged fundamental": "unlagged fundamental data",
    }

    def check(self, artifact: StrategySpec | str) -> HeuristicResult:
        text = (
            artifact
            if isinstance(artifact, str)
            else json.dumps(artifact.model_dump(mode="json"), sort_keys=True)
        ).lower()
        issues = [
            f"Potential leakage: {label}." for term, label in self.TERMS.items() if term in text
        ]
        return HeuristicResult(issues=issues)


class RuleComplexityTool:
    """Measure rule complexity and flag overly parameterized specifications."""

    def assess(self, strategy: StrategySpec) -> RuleComplexityResult:
        rules = [*strategy.entry_rules, *strategy.exit_rules]
        threshold_count = sum(rule.value is not None for rule in rules)
        lookback_count = sum(rule.lookback_days is not None for rule in rules)
        issues: list[str] = []
        if len(strategy.entry_rules) > 5:
            issues.append("More than five entry rules may indicate overfitting.")
        if len(strategy.exit_rules) > 3:
            issues.append("More than three exit rules may indicate overfitting.")
        if strategy.risk_rules.max_holding_days is None:
            issues.append("No maximum holding period is defined.")
        if threshold_count > 6:
            issues.append("Excessive numeric thresholds may indicate overfitting.")
        return RuleComplexityResult(
            entry_rule_count=len(strategy.entry_rules),
            exit_rule_count=len(strategy.exit_rules),
            threshold_count=threshold_count,
            lookback_count=lookback_count,
            issues=issues,
        )


class CostRiskHeuristicTool:
    """Flag obvious transaction-cost and turnover risks."""

    def assess(self, strategy: StrategySpec) -> HeuristicResult:
        issues: list[str] = []
        short_lookback = any(
            (rule.lookback_days is not None and rule.lookback_days <= 5)
            or rule.feature in {"return_1d", "return_5d", "gap_1d"}
            for rule in strategy.entry_rules
        )
        if strategy.portfolio_rules.rebalance_frequency == "daily" and short_lookback:
            issues.append("Daily rebalancing with short-horizon signals may create high turnover.")
        if strategy.risk_rules.max_holding_days is None:
            issues.append("Missing maximum holding period makes turnover difficult to bound.")
        if (
            strategy.strategy_family == "event_driven_momentum"
            and strategy.risk_rules.stop_loss is None
        ):
            issues.append("Event-driven strategy has no stop-loss assumption.")
        if strategy.risk_rules.max_turnover is None:
            issues.append("No maximum turnover constraint is specified.")
        return HeuristicResult(issues=issues)
