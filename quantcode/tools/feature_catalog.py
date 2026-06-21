"""FeatureCatalog — the D8 allowlist as the single source of truth.

The 18 supported features and 7 operators are LOCKED in DECISIONS.md D8 (signed off
2026-06-20). Both this module (the validator + catalog) and `agents/` (fixtures must
only use these so the demo passes the gate) read from here — do NOT redefine the list
anywhere else.

ponytail: a frozenset + a list literal. The allowlist is data, not behaviour.
"""

from __future__ import annotations

# D8 — the 18 features, in catalog order (mirrors RuleOperator in schemas for the ops).
_FEATURES: tuple[str, ...] = (
    "close",
    "volume",
    "return_1d",
    "return_5d",
    "return_20d",
    "return_60d",
    "gap_1d",
    "sma_20",
    "sma_50",
    "sma_200",
    "rsi_14",
    "realized_vol_20d",
    "realized_vol_60d",
    "atr_14",
    "volume_zscore",
    "sector_relative_return_20d",
    "spy_relative_return_20d",
    "holding_days",
)

# D8 — the 7 operators (must match schemas.RuleOperator). A constant set per the spec.
SUPPORTED_OPERATORS: frozenset[str] = frozenset(
    {">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"}
)


class FeatureCatalog:
    """The D8 feature allowlist. Pure, stateless lookups."""

    def list_features(self) -> list[str]:
        return list(_FEATURES)

    def is_supported(self, feature: str) -> bool:
        return feature in _FEATURES
