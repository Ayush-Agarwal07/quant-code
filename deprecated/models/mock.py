"""Deterministic structured model provider used by tests and demos."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from quant_code.core.exceptions import ModelProviderError
from quant_code.strategy_research.schemas import (
    CandidateHypothesis,
    MarketMechanism,
    PriorArtTheme,
    ResearchAgenda,
)


class MockLLMClient:
    """Return coherent, deterministic artifacts without network access."""

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        del prompt
        values = context or {}
        if schema is ResearchAgenda:
            return self._research_agenda(values)
        if schema is PriorArtTheme:
            return self._prior_art_theme(values)
        if schema is MarketMechanism:
            return self._market_mechanism(values)
        if schema is CandidateHypothesis:
            return self._candidate_hypothesis(values)
        if "data" in values:
            return schema.model_validate(values["data"])
        fixture = self._workflow_artifact_fixture(schema)
        if fixture is not None:
            return fixture
        raise ModelProviderError(
            f"MockLLMClient has no deterministic fixture for {schema.__name__}"
        )

    @staticmethod
    def _workflow_artifact_fixture(schema: type[BaseModel]) -> BaseModel | None:
        """Return fixtures for schemas produced deterministically by the full workflow."""

        from quant_code.strategy_research.workflow import run_quant_research

        packet = run_quant_research(
            "Find robust short-horizon equity strategies based on market underreaction."
        )
        strategy = packet.strategy_specs[0]
        ranking_rule = strategy.ranking_rule
        if ranking_rule is None:
            raise ModelProviderError("Mock workflow strategy unexpectedly has no ranking rule")
        fixtures: dict[str, BaseModel] = {
            "QuantResearchRequest": packet.request,
            "DataFeasibilityReport": packet.data_feasibility_reports[0],
            "StrategyRule": strategy.entry_rules[0],
            "RankingRule": ranking_rule,
            "PortfolioRules": strategy.portfolio_rules,
            "RiskRules": strategy.risk_rules,
            "StrategySpec": strategy,
            "StrategyCritique": packet.critiques[0],
            "ExperimentPlanStub": packet.experiment_plans[0],
            "ExperimentResultStub": packet.experiment_results[0],
            "MemoryWriteProposalStub": packet.memory_proposals[0],
            "AgentTrace": packet.agent_traces[0],
            "QuantResearchPacket": packet,
        }
        return fixtures.get(schema.__name__)

    @staticmethod
    def _research_agenda(context: dict[str, Any]) -> ResearchAgenda:
        objective = str(
            context.get(
                "objective",
                "Find robust short-horizon equity strategies based on market underreaction.",
            )
        )
        return ResearchAgenda(
            research_objective=objective,
            research_domain="short-horizon equity anomalies and market underreaction",
            asset_universe=str(context.get("asset_universe") or "US liquid equities"),
            target_horizons=["1-5 trading days", "1-4 trading weeks"],
            strategy_styles=["event_driven_momentum", "momentum", "sector_relative"],
            constraints={
                "research_only": True,
                "no_live_execution": True,
                "prefer_available_or_proxy_data": True,
                **dict(context.get("constraints", {})),
            },
            research_questions=[
                "Which underreaction mechanisms remain observable with available data?",
                "Which proxies preserve event timing without introducing leakage?",
                "How sensitive are candidate effects to costs, universe, and market regime?",
            ],
        )

    @staticmethod
    def _prior_art_theme(context: dict[str, Any]) -> PriorArtTheme:
        return PriorArtTheme(
            theme=str(context.get("theme", "momentum_continuation")),
            summary=str(
                context.get(
                    "summary",
                    "Prices may adjust gradually when information diffuses across investors.",
                )
            ),
            mechanism_type=str(context.get("mechanism_type", "behavioral_underreaction")),
            required_data=list(context.get("required_data", ["OHLCV"])),
            known_risks=list(
                context.get(
                    "known_risks",
                    ["crowding", "transaction costs", "regime dependence"],
                )
            ),
            source_type=str(context.get("source_type", "mock_research_catalog")),
            confidence=float(context.get("confidence", 0.7)),
        )

    @staticmethod
    def _market_mechanism(context: dict[str, Any]) -> MarketMechanism:
        theme = str(context.get("theme", "momentum_continuation"))
        mechanism_type = str(context.get("mechanism_type", "behavioral_underreaction"))
        return MarketMechanism(
            name=f"{theme}_mechanism",
            description=(
                f"{theme.replace('_', ' ')} may reflect {mechanism_type.replace('_', ' ')} "
                "that causes information to enter prices gradually."
            ),
            why_edge_might_exist=[
                "Investor attention and mandate constraints can slow information diffusion.",
                "Different investor groups process the same signal at different speeds.",
            ],
            why_edge_might_disappear=[
                "Crowding can accelerate price adjustment.",
                "Trading costs and adverse selection can absorb the gross effect.",
            ],
            observable_implications=[
                "Initial price moves should be followed by same-direction returns.",
                "The effect should weaken when liquidity is poor or volatility is extreme.",
            ],
            related_themes=[theme],
        )

    @staticmethod
    def _candidate_hypothesis(context: dict[str, Any]) -> CandidateHypothesis:
        variant = str(context.get("variant", "price_volume_continuation"))
        universe = str(context.get("asset_universe", "US liquid equities"))
        fixtures: dict[str, dict[str, Any]] = {
            "pead_proxy": {
                "hypothesis_name": "post_earnings_drift_price_volume_proxy",
                "hypothesis": (
                    "Large earnings-date gaps accompanied by abnormal volume are followed by "
                    "same-direction returns over the next five trading days."
                ),
                "mechanism": "Slow interpretation of event information creates delayed repricing.",
                "predicted_effect": (
                    "Positive gaps continue upward and negative gaps continue downward."
                ),
                "horizon": "1-5 trading days",
                "required_data": ["OHLCV", "earnings_dates", "earnings_surprise"],
                "possible_proxy_data": ["gap_1d", "volume_zscore"],
                "expected_failure_modes": [
                    "The price-volume proxy may capture non-earnings events.",
                    "Opening gaps may reverse in high-volatility regimes.",
                ],
                "falsification_tests": [
                    "Effect is absent after excluding the largest gaps.",
                    "Effect does not survive realistic event-day costs.",
                ],
                "confidence": 0.66,
            },
            "price_volume_continuation": {
                "hypothesis_name": "liquid_equity_price_volume_continuation",
                "hypothesis": (
                    "Strong 20-day returns with above-normal volume continue over the next "
                    "five to ten trading days in liquid equities."
                ),
                "mechanism": "Gradual information diffusion and slow-moving capital underreact.",
                "predicted_effect": "High-ranked recent winners outperform low-ranked peers.",
                "horizon": "5-10 trading days",
                "required_data": [
                    "OHLCV",
                    "derived_price_features",
                    "derived_volume_features",
                ],
                "possible_proxy_data": [],
                "expected_failure_modes": [
                    "Momentum crashes during sharp market reversals.",
                    "High turnover consumes the gross effect.",
                ],
                "falsification_tests": [
                    "Return spread is indistinguishable from zero out of sample.",
                    "Effect disappears after sector-neutral ranking.",
                ],
                "confidence": 0.72,
            },
            "analyst_revision_proxy": {
                "hypothesis_name": "analyst_revision_drift_momentum_proxy",
                "hypothesis": (
                    "Sector-relative price strength can weakly proxy for unobserved analyst "
                    "revision drift over a two-to-four-week horizon."
                ),
                "mechanism": "Analyst information is incorporated gradually across investors.",
                "predicted_effect": "Sector-relative leaders continue outperforming sector peers.",
                "horizon": "2-4 trading weeks",
                "required_data": ["analyst_revision_drift", "sector_labels", "OHLCV"],
                "possible_proxy_data": [
                    "return_20d",
                    "sector_relative_return_20d",
                ],
                "expected_failure_modes": [
                    "Price momentum is a weak proxy for actual revisions.",
                    "Sector trends dominate stock-specific information.",
                ],
                "falsification_tests": [
                    "Proxy has no relationship to revisions when revision data becomes available.",
                    "Sector-relative spread fails across multiple universe definitions.",
                ],
                "confidence": 0.48,
            },
            "options_volatility": {
                "hypothesis_name": "options_implied_volatility_underreaction",
                "hypothesis": (
                    "Changes in option-implied volatility contain information that is incorporated "
                    "into equity prices over the following week."
                ),
                "mechanism": (
                    "Options markets may aggregate informed risk views before cash equities."
                ),
                "predicted_effect": (
                    "Stocks with unusual implied-volatility changes exhibit directional drift."
                ),
                "horizon": "1-5 trading days",
                "required_data": ["options_implied_volatility", "OHLCV"],
                "possible_proxy_data": [],
                "expected_failure_modes": [
                    "Options signals may reflect risk premia rather than directional information.",
                    "Options liquidity and spreads may make the signal unreliable.",
                ],
                "falsification_tests": [
                    "Effect is absent outside the most liquid options universe.",
                    "Effect does not survive point-in-time options filtering.",
                ],
                "confidence": 0.4,
            },
        }
        fixture = fixtures.get(variant)
        if fixture is None:
            raise ModelProviderError(f"Unknown mock hypothesis variant: {variant}")
        return CandidateHypothesis(asset_universe=universe, **fixture)
