"""DataCatalog — classify required-data tokens by availability.

Feeds `agents/DataFeasibilityAgent` so its verdicts are realistic and consistent with
the demo hypotheses (per the build spec). Three buckets:

  available_now                    — OHLCV + everything derivable from price/volume.
  available_with_existing_adapter  — exists behind an adapter we'd plug in (earnings,
                                     sector labels, analyst revisions, options IV).
  missing                          — neither; needs a brand-new data source.

ponytail: data, not logic. Two sets + a normalising lookup. Unknown tokens fall to
`missing` (the honest default — never silently assume we have data we don't).
"""

from __future__ import annotations

# Everything derivable from raw OHLCV — these are the D8 features plus the raw bars and
# the few generic aliases an agent might emit. Available with zero new data plumbing.
_AVAILABLE_NOW: frozenset[str] = frozenset(
    {
        "ohlcv",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "gap_1d",
        "volume_zscore",
        "return_1d",
        "return_5d",
        "return_20d",
        "return_60d",
        "sector_relative_return_20d",
        "spy_relative_return_20d",
        "sma_20",
        "sma_50",
        "sma_200",
        "rsi_14",
        "realized_vol_20d",
        "realized_vol_60d",
        "atr_14",
        "holding_days",
        # generic groupings an agent may name instead of a concrete feature
        "derived_price_features",
        "derived_volume_features",
        "derived_volatility_features",
        "benchmark_prices",
    }
)

# Real data we don't compute from bars, but a known adapter could supply. NOT available
# until that adapter is wired — feasibility, not validation, decides if that's enough.
_AVAILABLE_WITH_ADAPTER: frozenset[str] = frozenset(
    {
        "earnings_dates",
        "earnings_surprise",
        "analyst_revision_drift",
        "analyst_revisions",
        "sector_labels",
        "options_implied_volatility",
    }
)


def _norm(token: str) -> str:
    return token.strip().lower()


class DataCatalog:
    """Classify required-data tokens into availability buckets. Pure + deterministic."""

    def classify(self, required_data: list[str]) -> dict[str, list[str]]:
        available_now: list[str] = []
        available_with_existing_adapter: list[str] = []
        missing: list[str] = []
        for token in required_data:
            key = _norm(token)
            if key in _AVAILABLE_NOW:
                available_now.append(token)
            elif key in _AVAILABLE_WITH_ADAPTER:
                available_with_existing_adapter.append(token)
            else:
                missing.append(token)
        return {
            "available_now": available_now,
            "available_with_existing_adapter": available_with_existing_adapter,
            "missing": missing,
        }
