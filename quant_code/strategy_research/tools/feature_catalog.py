"""Allowed deterministic strategy DSL features."""

from __future__ import annotations


class FeatureCatalogTool:
    """Return the supported feature vocabulary."""

    def list_features(self) -> list[str]:
        return [
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
        ]
