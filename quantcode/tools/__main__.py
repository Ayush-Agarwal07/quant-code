"""Runnable self-check: `python -m quantcode.tools`. Offline, no I/O, no LLM."""

from __future__ import annotations

from quantcode.schemas import (
    RiskRules,
    StrategyRule,
    StrategySpec,
    sample_strategy_spec,
)
from quantcode.tools import (
    DataCatalog,
    ExperimentRunnerStub,
    FeatureCatalog,
    StrategyValidatorTool,
)


def _spec_with_entry(rule: StrategyRule) -> StrategySpec:
    """A valid sample_strategy_spec with its first entry rule swapped — used to build
    the leaky / unsupported-feature cases without tripping the schema's min_length=1."""
    base = sample_strategy_spec()
    return base.model_copy(update={"entry_rules": [rule]})


# --- FeatureCatalog: the D8 allowlist --------------------------------------------------
fc = FeatureCatalog()
features = fc.list_features()
assert len(features) == 18, f"expected 18 D8 features, got {len(features)}"
assert fc.is_supported("return_20d")
assert not fc.is_supported("bogus_feature")

# --- DataCatalog: classify consistent with the demo hypotheses -------------------------
buckets = DataCatalog().classify(
    ["OHLCV", "return_20d", "earnings_surprise", "analyst_revision_drift", "alpha_centauri_feed"]
)
assert buckets["available_now"] == ["OHLCV", "return_20d"], buckets
assert buckets["available_with_existing_adapter"] == [
    "earnings_surprise",
    "analyst_revision_drift",
], buckets
assert buckets["missing"] == ["alpha_centauri_feed"], buckets

validator = StrategyValidatorTool()

# --- 1) clean spec passes --------------------------------------------------------------
clean = validator.validate(sample_strategy_spec())
assert clean.valid is True, clean.errors
assert clean.errors == [], clean.errors

# --- 2) leaky spec (future_return feature) fails with a leakage/unsupported error -------
leaky = validator.validate(
    _spec_with_entry(StrategyRule(feature="future_return", operator=">", value=0.0))
)
assert leaky.valid is False
assert any("leakage" in e.lower() or "unsupported" in e.lower() for e in leaky.errors), leaky.errors

# --- 3) unsupported feature ("bogus_feature") fails ------------------------------------
# (empty exit_rules can't be constructed — schema min_length=1 — so we test this instead.)
bogus = validator.validate(
    _spec_with_entry(StrategyRule(feature="bogus_feature", operator=">", value=0.0))
)
assert bogus.valid is False
assert any("unsupported" in e.lower() and "bogus_feature" in e for e in bogus.errors), bogus.errors

# --- 4) no risk rule set -> a WARNING (not an error) -----------------------------------
no_risk = sample_strategy_spec().model_copy(update={"risk_rules": RiskRules()})
report = validator.validate(no_risk)
assert report.valid is True, report.errors
assert any("risk rule" in w.lower() for w in report.warnings), report.warnings

# --- 5) ExperimentRunnerStub: never executes, exactly the 4 planned metrics ------------
result = ExperimentRunnerStub().run(sample_strategy_spec())
assert result.status == "not_executed"
assert result.reason == "Backtesting is intentionally stubbed in this hackathon version."
assert result.planned_metrics == ["Sharpe", "max_drawdown", "turnover", "alpha_vs_benchmark"]

print("tools OK — D8 allowlist enforced, leakage blocked, runner stub honest (not_executed)")
