"""Strategy research critic agent."""

from __future__ import annotations

from typing import Literal

from quant_code.models.base import LLMClient
from quant_code.strategy_research.agents.base import AgentResult, BaseAgent
from quant_code.strategy_research.schemas import StrategyCritique, StrategySpec
from quant_code.strategy_research.tools.mutation import AllowedMutationTool
from quant_code.strategy_research.tools.validation import (
    CostRiskHeuristicTool,
    DSLValidationTool,
    LeakageCheckTool,
    RuleComplexityTool,
)


class ResearchCriticAgent(BaseAgent):
    """Critique specifications without making performance claims."""

    name = "research_critic"

    def __init__(
        self,
        llm: LLMClient,
        validator: DSLValidationTool | None = None,
        leakage_checker: LeakageCheckTool | None = None,
        complexity_tool: RuleComplexityTool | None = None,
        cost_tool: CostRiskHeuristicTool | None = None,
        mutation_tool: AllowedMutationTool | None = None,
    ) -> None:
        super().__init__(llm)
        self.validator = validator or DSLValidationTool()
        self.leakage_checker = leakage_checker or LeakageCheckTool()
        self.complexity_tool = complexity_tool or RuleComplexityTool()
        self.cost_tool = cost_tool or CostRiskHeuristicTool()
        self.mutation_tool = mutation_tool or AllowedMutationTool()

    def run(self, strategies: list[StrategySpec]) -> AgentResult[list[StrategyCritique]]:
        return self._execute(
            input_summary=f"{len(strategies)} formalized strategy specifications",
            output_summary="Critiqued each specification before any backtest.",
            schema_used="list[StrategyCritique]",
            operation=lambda: [self._critique(strategy) for strategy in strategies],
        )

    def _critique(self, strategy: StrategySpec) -> StrategyCritique:
        validation = self.validator.validate(strategy)
        leakage = self.leakage_checker.check(strategy).issues
        complexity = self.complexity_tool.assess(strategy).issues
        costs = self.cost_tool.assess(strategy).issues
        data_quality = (
            ["Proxy data may not isolate the source hypothesis."]
            if strategy.backtest_readiness == "ready_with_proxy_limitations"
            else ["Point-in-time construction and survivorship controls require verification."]
        )
        verdict: Literal["accept_for_backtest", "revise_before_backtest", "reject"]
        if not validation.valid or leakage:
            verdict = "reject"
        elif complexity or costs or strategy.backtest_readiness == "ready_with_proxy_limitations":
            verdict = "revise_before_backtest"
        else:
            verdict = "accept_for_backtest"
        mutations = self.mutation_tool.list_mutations()
        return StrategyCritique(
            strategy_name=strategy.strategy_name,
            verdict=verdict,
            major_issues=[*validation.errors, *complexity, *costs, *data_quality],
            leakage_risks=leakage
            or ["No obvious leakage term found; event timestamps still require verification."],
            overfitting_risks=complexity
            or ["Threshold and lookback choices must be tested across broad parameter ranges."],
            transaction_cost_risks=costs
            or ["Costs and market impact can invalidate a short-horizon gross effect."],
            data_quality_risks=data_quality,
            economic_rationale_strength="moderate",
            suggested_mutations=mutations[:3],
            confidence=0.76,
        )
