"""StrategyValidatorTool — the deterministic validation gate.

Runs after `StrategyFormalizerAgent`, before `StrategyWriterAgent` writes YAML. It is
SEPARATE from data feasibility: feasibility asks "is there data?", validation asks "is
this deterministically executable and leakage-free?" (docs/architecture.md).

Returns a structured `StrategyValidationReport` (errors + warnings), never a bare bool —
the critic and dashboard need the reasons.

Checks (D8):
  ERRORS  (-> valid=False)
    - every rule.feature / rule.feature_ref / ranking_rule.feature in the allowlist
    - every operator in the D8 operator set
    - >=1 entry rule and >=1 exit rule (schema already enforces min_length=1; we
      re-state it so the report is self-describing if the schema ever relaxes)
    - leakage blocklist hit anywhere in the serialised spec
    - required_data present when backtest_readiness != "not_ready"
  WARNINGS (advisory; do not fail the gate)
    - no risk rule field set (docs: "risk rules exist")
    - rule-complexity / transaction-cost heuristics for the critic

ponytail: one pass over the rules; the leakage scan is substring matching over the
serialised spec — no NLP, no LLM. Pure function, same input -> same output.
"""

from __future__ import annotations

import json

from quantcode.schemas import StrategySpec, StrategyValidationReport
from quantcode.tools.feature_catalog import SUPPORTED_OPERATORS, FeatureCatalog

# D8 leakage blocklist: (substring-to-match, human label). Matched against the lowercased
# JSON dump of the spec, so it catches a leaky feature name OR leaky prose in a rule
# description / rationale. Keep entries lowercase.
_LEAKAGE_BLOCKLIST: tuple[tuple[str, str], ...] = (
    ("future_return", "future return feature"),
    ("next_return", "next-period return feature"),
    ("future winner", "future winner label"),
    ("untimestamped earnings surprise", "untimestamped earnings surprise"),
    ("earnings surprise without timestamp", "untimestamped earnings surprise"),
    ("future index constituent", "future index constituent membership"),
    ("unlagged fundamental", "unlagged fundamental data"),
)


class StrategyValidatorTool:
    """Validate a StrategySpec against the D8 allowlist + leakage blocklist."""

    def __init__(self, feature_catalog: FeatureCatalog | None = None) -> None:
        self.features = feature_catalog or FeatureCatalog()

    def validate(self, spec: StrategySpec) -> StrategyValidationReport:
        errors: list[str] = []
        warnings: list[str] = []

        self._check_rules(spec, errors)
        self._check_ranking(spec, errors)
        self._check_leakage(spec, errors)
        self._check_required_data(spec, errors)
        self._check_risk_rules(spec, warnings)
        self._heuristics(spec, warnings)

        return StrategyValidationReport(
            strategy_name=spec.strategy_name,
            valid=not errors,
            errors=errors,
            warnings=warnings,
        )

    # --- ERROR checks --------------------------------------------------------
    def _check_rules(self, spec: StrategySpec, errors: list[str]) -> None:
        # schema guarantees >=1 each, but re-stating keeps the report self-describing.
        if not spec.entry_rules:
            errors.append("At least one entry rule is required.")
        if not spec.exit_rules:
            errors.append("At least one exit rule is required.")
        for kind, rules in (("entry", spec.entry_rules), ("exit", spec.exit_rules)):
            for rule in rules:
                if not self.features.is_supported(rule.feature):
                    errors.append(f"Unsupported {kind} feature: {rule.feature!r}")
                if rule.feature_ref and not self.features.is_supported(rule.feature_ref):
                    errors.append(f"Unsupported {kind} feature reference: {rule.feature_ref!r}")
                if rule.operator not in SUPPORTED_OPERATORS:
                    errors.append(f"Unsupported {kind} operator: {rule.operator!r}")

    def _check_ranking(self, spec: StrategySpec, errors: list[str]) -> None:
        rule = spec.ranking_rule
        if rule and not self.features.is_supported(rule.feature):
            errors.append(f"Unsupported ranking feature: {rule.feature!r}")

    def _check_leakage(self, spec: StrategySpec, errors: list[str]) -> None:
        text = json.dumps(spec.model_dump(mode="json"), sort_keys=True).lower()
        seen: set[str] = set()
        for needle, label in _LEAKAGE_BLOCKLIST:
            if needle in text and label not in seen:
                errors.append(f"Potential look-ahead leakage: {label}.")
                seen.add(label)

    @staticmethod
    def _check_required_data(spec: StrategySpec, errors: list[str]) -> None:
        if spec.backtest_readiness != "not_ready" and not spec.required_data:
            errors.append("Backtest-ready strategy must declare required_data.")

    # --- WARNING checks ------------------------------------------------------
    @staticmethod
    def _check_risk_rules(spec: StrategySpec, warnings: list[str]) -> None:
        r = spec.risk_rules
        if not any(
            v is not None
            for v in (r.stop_loss, r.take_profit, r.max_holding_days, r.max_turnover)
        ):
            warnings.append(
                "No risk rule is set "
                "(stop_loss / take_profit / max_holding_days / max_turnover)."
            )

    @staticmethod
    def _heuristics(spec: StrategySpec, warnings: list[str]) -> None:
        # rule-complexity: too many rules / thresholds smell like overfitting.
        if len(spec.entry_rules) > 5:
            warnings.append("More than five entry rules may indicate overfitting.")
        if len(spec.exit_rules) > 3:
            warnings.append("More than three exit rules may indicate overfitting.")
        thresholds = sum(rule.value is not None for rule in (*spec.entry_rules, *spec.exit_rules))
        if thresholds > 6:
            warnings.append("Excessive numeric thresholds may indicate overfitting.")

        # transaction-cost: daily rebalance on short-horizon signals => high turnover.
        short_horizon = any(
            (rule.lookback_days is not None and rule.lookback_days <= 5)
            or rule.feature in {"return_1d", "return_5d", "gap_1d"}
            for rule in spec.entry_rules
        )
        if spec.portfolio_rules.rebalance_frequency == "daily" and short_horizon:
            warnings.append(
                "Daily rebalancing with short-horizon signals may create high turnover."
            )
        if spec.risk_rules.max_turnover is None:
            warnings.append("No maximum turnover constraint; turnover is unbounded.")
