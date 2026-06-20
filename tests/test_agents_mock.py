from __future__ import annotations

from quant_forge.models.mock import MockLLMClient
from quant_forge.strategy_research.agents import (
    DataFeasibilityAgent,
    ExperimentPlannerAgent,
    HypothesisGenerationAgent,
    MarketMechanismAgent,
    MemoryProposalAgent,
    PriorArtDiscoveryAgent,
    ResearchCriticAgent,
    ResearchDirectorAgent,
    StrategyFormalizerAgent,
)
from quant_forge.strategy_research.schemas import (
    DataFeasibilityVerdict,
    QuantResearchPacket,
    QuantResearchRequest,
    ResearchAgenda,
    StrategySpec,
)


def test_mock_agents_produce_expected_artifacts() -> None:
    llm = MockLLMClient()
    agenda_result = ResearchDirectorAgent(llm).run(
        QuantResearchRequest(
            objective="Find robust short-horizon equity strategies based on market underreaction."
        )
    )
    assert isinstance(agenda_result.output, ResearchAgenda)

    prior_art_result = PriorArtDiscoveryAgent(llm).run(agenda_result.output)
    assert len(prior_art_result.output) >= 2

    mechanism_result = MarketMechanismAgent(llm).run(agenda_result.output, prior_art_result.output)
    assert len(mechanism_result.output) >= 2

    hypothesis_result = HypothesisGenerationAgent(llm).run(
        agenda_result.output,
        prior_art_result.output,
        mechanism_result.output,
    )
    assert len(hypothesis_result.output) >= 3

    feasibility_result = DataFeasibilityAgent(llm).run(hypothesis_result.output)
    assert len(feasibility_result.output) == len(hypothesis_result.output)

    formalizer_result = StrategyFormalizerAgent(llm).run(
        hypothesis_result.output, feasibility_result.output
    )
    feasible_names = {
        report.hypothesis_name
        for report in feasibility_result.output
        if report.verdict
        in {
            DataFeasibilityVerdict.TESTABLE_NOW,
            DataFeasibilityVerdict.TESTABLE_WITH_PROXY,
        }
    }
    unavailable_names = {
        report.hypothesis_name
        for report in feasibility_result.output
        if report.verdict == DataFeasibilityVerdict.REQUIRES_NEW_DATA_SOURCE
    }
    assert formalizer_result.output
    assert {strategy.source_hypothesis for strategy in formalizer_result.output} <= feasible_names
    assert unavailable_names
    assert (
        not {strategy.source_hypothesis for strategy in formalizer_result.output}
        & unavailable_names
    )

    critic_result = ResearchCriticAgent(llm).run(formalizer_result.output)
    assert len(critic_result.output) == len(formalizer_result.output)
    assert all(critique.major_issues for critique in critic_result.output)

    planner_result = ExperimentPlannerAgent(llm).run(formalizer_result.output, critic_result.output)
    assert len(planner_result.output) == len(formalizer_result.output)
    assert all(plan.status == "stub_not_executed" for plan in planner_result.output)

    memory_result = MemoryProposalAgent(llm).run(
        {
            "strategy_specs": formalizer_result.output,
            "critiques": critic_result.output,
            "experiment_plans": planner_result.output,
        }
    )
    assert memory_result.output
    assert all(proposal.status == "proposed_not_written" for proposal in memory_result.output)


def test_mock_client_has_fixtures_for_workflow_artifacts() -> None:
    llm = MockLLMClient()
    assert isinstance(llm.generate_structured("fixture", StrategySpec), StrategySpec)
    assert isinstance(llm.generate_structured("fixture", QuantResearchPacket), QuantResearchPacket)
