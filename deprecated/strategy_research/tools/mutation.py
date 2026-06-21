"""Allowed future strategy mutations."""

from __future__ import annotations


class AllowedMutationTool:
    """List bounded mutation operations for a future experiment loop."""

    def list_mutations(self) -> list[str]:
        return [
            "add_filter",
            "remove_filter",
            "change_threshold",
            "change_lookback",
            "change_ranking_feature",
            "change_rebalance_frequency",
            "add_volatility_filter",
            "add_sector_relative_ranking",
            "add_stop_loss",
            "reduce_position_size",
            "simplify_rules",
        ]
