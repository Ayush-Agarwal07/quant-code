"""Future data provider interfaces without live fetching."""

from __future__ import annotations

from typing import Protocol


class MarketDataProviderStub(Protocol):
    def get_bars(self, symbols: list[str], start: str, end: str) -> object:
        """Return future point-in-time market bars."""
        ...


class UniverseProviderStub(Protocol):
    def get_universe(self, name: str, as_of: str) -> list[str]:
        """Return future point-in-time universe membership."""
        ...


class FeatureProviderStub(Protocol):
    def compute_features(self, feature_names: list[str], data: object) -> object:
        """Return future deterministic feature values."""
        ...
