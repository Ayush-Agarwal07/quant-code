"""Top-level agentic quant research workflow."""

from __future__ import annotations

from quant_forge.future.backtesting import BacktestRunnerStub
from quant_forge.models.router import ModelRouter
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
    AgentTrace,
    QuantResearchPacket,
    QuantResearchRequest,
)


def run_quant_research(objective: str, model_provider: str = "mock") -> QuantResearchPacket:
    """Run the one-shot research workflow and return a validated packet."""

    request = QuantResearchRequest(objective=objective)
    llm = ModelRouter().get_client(model_provider)
    traces: list[AgentTrace] = []

    director_result = ResearchDirectorAgent(llm).run(request)
    agenda = director_result.output
    traces.append(director_result.trace)

    prior_art_result = PriorArtDiscoveryAgent(llm).run(agenda)
    prior_art = prior_art_result.output
    traces.append(prior_art_result.trace)

    mechanism_result = MarketMechanismAgent(llm).run(agenda, prior_art)
    mechanisms = mechanism_result.output
    traces.append(mechanism_result.trace)

    hypothesis_result = HypothesisGenerationAgent(llm).run(agenda, prior_art, mechanisms)
    hypotheses = hypothesis_result.output
    traces.append(hypothesis_result.trace)

    feasibility_result = DataFeasibilityAgent(llm).run(hypotheses)
    feasibility = feasibility_result.output
    traces.append(feasibility_result.trace)

    formalizer_result = StrategyFormalizerAgent(llm).run(hypotheses, feasibility)
    strategies = formalizer_result.output
    traces.append(formalizer_result.trace)

    critic_result = ResearchCriticAgent(llm).run(strategies)
    critiques = critic_result.output
    traces.append(critic_result.trace)

    planner_result = ExperimentPlannerAgent(llm).run(strategies, critiques)
    plans = planner_result.output
    traces.append(planner_result.trace)

    backtest_runner = BacktestRunnerStub()
    backtest_results = [backtest_runner.run(plan) for plan in plans]

    memory_result = MemoryProposalAgent(llm).run(
        {
            "request": request,
            "agenda": agenda,
            "prior_art_themes": prior_art,
            "market_mechanisms": mechanisms,
            "candidate_hypotheses": hypotheses,
            "data_feasibility_reports": feasibility,
            "strategy_specs": strategies,
            "critiques": critiques,
            "experiment_plans": plans,
            "backtest_results": backtest_results,
        }
    )
    traces.append(memory_result.trace)

    return QuantResearchPacket(
        request=request,
        agenda=agenda,
        prior_art_themes=prior_art,
        market_mechanisms=mechanisms,
        candidate_hypotheses=hypotheses,
        data_feasibility_reports=feasibility,
        strategy_specs=strategies,
        critiques=critiques,
        experiment_plans=plans,
        backtest_results=backtest_results,
        memory_proposals=memory_result.output,
        agent_traces=traces,
    )
