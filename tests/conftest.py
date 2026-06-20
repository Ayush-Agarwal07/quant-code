from __future__ import annotations

import pytest

from quant_forge.strategy_research.schemas import (
    PortfolioRules,
    RankingRule,
    RiskRules,
    StrategyRule,
    StrategySpec,
)


@pytest.fixture
def valid_strategy() -> StrategySpec:
    return StrategySpec(
        strategy_name="fixture_momentum",
        source_hypothesis="fixture_hypothesis",
        strategy_family="momentum",
        hypothesis="Recent relative strength may continue over a short horizon.",
        economic_rationale="Gradual information diffusion may cause underreaction.",
        universe="US liquid equities",
        entry_rules=[
            StrategyRule(feature="return_20d", operator=">=", value=0.05, lookback_days=20)
        ],
        exit_rules=[StrategyRule(feature="holding_days", operator=">=", value=10)],
        ranking_rule=RankingRule(feature="return_20d", order="descending", top_n=50),
        portfolio_rules=PortfolioRules(
            weighting="equal_weight",
            max_position=0.03,
            max_sector_weight=0.2,
            rebalance_frequency="weekly",
        ),
        risk_rules=RiskRules(max_holding_days=10, max_turnover=0.5),
        required_data=["OHLCV", "derived_price_features"],
        expected_failure_modes=["Momentum reversal", "Transaction costs"],
        backtest_readiness="ready",
        confidence=0.7,
    )
