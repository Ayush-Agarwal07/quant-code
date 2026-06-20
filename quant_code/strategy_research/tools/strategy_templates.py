"""Small templates used when formalizing feasible hypotheses."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StrategyTemplate:
    family: str
    typical_entry_features: tuple[str, ...]
    typical_exit_features: tuple[str, ...]


class StrategyTemplateTool:
    """Return supported formalization templates."""

    def get_templates(self) -> dict[str, StrategyTemplate]:
        return {
            "event_driven_momentum": StrategyTemplate(
                "event_driven_momentum", ("gap_1d", "volume_zscore"), ("holding_days",)
            ),
            "momentum": StrategyTemplate("momentum", ("return_20d",), ("holding_days",)),
            "mean_reversion": StrategyTemplate("mean_reversion", ("return_5d",), ("holding_days",)),
            "breakout": StrategyTemplate("breakout", ("close", "sma_50"), ("holding_days",)),
            "volatility_filter": StrategyTemplate(
                "volatility_filter", ("realized_vol_20d",), ("holding_days",)
            ),
            "sector_relative": StrategyTemplate(
                "sector_relative", ("sector_relative_return_20d",), ("holding_days",)
            ),
        }
