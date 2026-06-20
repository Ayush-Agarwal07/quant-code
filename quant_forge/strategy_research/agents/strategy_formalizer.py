"""Strategy formalization agent."""

from __future__ import annotations

from typing import Literal

from quant_forge.models.base import LLMClient
from quant_forge.strategy_research.agents.base import AgentResult, BaseAgent
from quant_forge.strategy_research.schemas import (
    CandidateHypothesis,
    DataFeasibilityReport,
    DataFeasibilityVerdict,
    PortfolioRules,
    RankingRule,
    RiskRules,
    StrategyRule,
    StrategySpec,
)
from quant_forge.strategy_research.tools.validation import DSLValidationTool


class StrategyFormalizerAgent(BaseAgent):
    """Convert only feasible hypotheses into deterministic strategy DSL specifications."""

    name = "strategy_formalizer"

    def __init__(self, llm: LLMClient, validator: DSLValidationTool | None = None) -> None:
        super().__init__(llm)
        self.validator = validator or DSLValidationTool()

    def run(
        self,
        hypotheses: list[CandidateHypothesis],
        reports: list[DataFeasibilityReport],
    ) -> AgentResult[list[StrategySpec]]:
        def operation() -> list[StrategySpec]:
            by_name = {report.hypothesis_name: report for report in reports}
            strategies: list[StrategySpec] = []
            for hypothesis in hypotheses:
                report = by_name[hypothesis.hypothesis_name]
                if report.verdict not in {
                    DataFeasibilityVerdict.TESTABLE_NOW,
                    DataFeasibilityVerdict.TESTABLE_WITH_PROXY,
                }:
                    continue
                strategy = self._formalize(hypothesis, report)
                validation = self.validator.validate(strategy)
                if not validation.valid:
                    raise ValueError("; ".join(validation.errors))
                strategies.append(strategy)
            return strategies

        return self._execute(
            input_summary=f"{len(hypotheses)} hypotheses and {len(reports)} feasibility reports",
            output_summary="Formalized only hypotheses that passed the data feasibility gate.",
            schema_used="list[StrategySpec]",
            operation=operation,
        )

    def _formalize(
        self, hypothesis: CandidateHypothesis, report: DataFeasibilityReport
    ) -> StrategySpec:
        readiness: Literal["ready", "ready_with_proxy_limitations"] = (
            "ready"
            if report.verdict == DataFeasibilityVerdict.TESTABLE_NOW
            else "ready_with_proxy_limitations"
        )
        required_data = list(
            dict.fromkeys(
                [
                    *report.available_now,
                    *report.available_with_existing_adapter,
                    *report.proxy_features,
                ]
            )
        )
        if hypothesis.hypothesis_name == "post_earnings_drift_price_volume_proxy":
            return StrategySpec(
                strategy_name="earnings_gap_volume_underreaction_proxy",
                source_hypothesis=hypothesis.hypothesis_name,
                strategy_family="event_driven_momentum",
                hypothesis=hypothesis.hypothesis,
                economic_rationale=hypothesis.mechanism,
                universe=hypothesis.asset_universe,
                entry_rules=[
                    StrategyRule(
                        feature="gap_1d",
                        operator=">=",
                        value=0.02,
                        description="Positive event-day gap proxy.",
                    ),
                    StrategyRule(
                        feature="volume_zscore",
                        operator=">=",
                        value=2.0,
                        lookback_days=20,
                    ),
                ],
                exit_rules=[StrategyRule(feature="holding_days", operator=">=", value=5)],
                ranking_rule=RankingRule(feature="gap_1d", order="descending", top_n=30),
                portfolio_rules=PortfolioRules(
                    weighting="equal_weight",
                    max_position=0.04,
                    max_sector_weight=0.25,
                    rebalance_frequency="daily",
                ),
                risk_rules=RiskRules(stop_loss=0.05, max_holding_days=5, max_turnover=1.0),
                required_data=required_data,
                expected_failure_modes=hypothesis.expected_failure_modes,
                backtest_readiness=readiness,
                confidence=hypothesis.confidence,
            )
        if hypothesis.hypothesis_name == "liquid_equity_price_volume_continuation":
            return StrategySpec(
                strategy_name="price_volume_continuation_rank",
                source_hypothesis=hypothesis.hypothesis_name,
                strategy_family="momentum",
                hypothesis=hypothesis.hypothesis,
                economic_rationale=hypothesis.mechanism,
                universe=hypothesis.asset_universe,
                entry_rules=[
                    StrategyRule(feature="return_20d", operator=">=", value=0.05, lookback_days=20),
                    StrategyRule(
                        feature="volume_zscore", operator=">=", value=0.0, lookback_days=20
                    ),
                ],
                exit_rules=[StrategyRule(feature="holding_days", operator=">=", value=10)],
                ranking_rule=RankingRule(feature="return_20d", order="descending", top_n=50),
                portfolio_rules=PortfolioRules(
                    weighting="inverse_vol_weighted",
                    max_position=0.03,
                    max_sector_weight=0.2,
                    rebalance_frequency="weekly",
                ),
                risk_rules=RiskRules(max_holding_days=10, max_turnover=0.5),
                required_data=required_data,
                expected_failure_modes=hypothesis.expected_failure_modes,
                backtest_readiness=readiness,
                confidence=hypothesis.confidence,
            )
        return StrategySpec(
            strategy_name="sector_relative_revision_drift_proxy",
            source_hypothesis=hypothesis.hypothesis_name,
            strategy_family="sector_relative",
            hypothesis=hypothesis.hypothesis,
            economic_rationale=hypothesis.mechanism,
            universe=hypothesis.asset_universe,
            entry_rules=[
                StrategyRule(
                    feature="sector_relative_return_20d",
                    operator=">=",
                    value=0.03,
                    lookback_days=20,
                )
            ],
            exit_rules=[StrategyRule(feature="holding_days", operator=">=", value=20)],
            ranking_rule=RankingRule(
                feature="sector_relative_return_20d", order="descending", top_n=40
            ),
            portfolio_rules=PortfolioRules(
                weighting="equal_weight",
                max_position=0.03,
                max_sector_weight=0.2,
                rebalance_frequency="weekly",
            ),
            risk_rules=RiskRules(max_holding_days=20, max_turnover=0.5),
            required_data=required_data,
            expected_failure_modes=hypothesis.expected_failure_modes,
            backtest_readiness=readiness,
            confidence=hypothesis.confidence,
        )
