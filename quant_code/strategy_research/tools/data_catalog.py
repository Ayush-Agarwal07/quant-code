"""Available and desired data categories."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DataCatalogSnapshot:
    available_now: list[str]
    available_with_existing_adapter: list[str]
    desired_future_data: list[str]


class AvailableDataCatalogTool:
    """Describe data access without fetching any live data."""

    def get_catalog(self) -> DataCatalogSnapshot:
        return DataCatalogSnapshot(
            available_now=[
                "OHLCV",
                "derived_price_features",
                "derived_volume_features",
                "derived_volatility_features",
                "static_universe_files",
            ],
            available_with_existing_adapter=[
                "earnings_dates",
                "SEC_filings",
                "basic_fundamentals",
                "benchmark_prices",
                "sector_labels",
            ],
            desired_future_data=[
                "analyst_revisions",
                "options_implied_volatility",
                "short_interest",
                "institutional_ownership",
                "order_book_data",
                "alternative_data",
            ],
        )
