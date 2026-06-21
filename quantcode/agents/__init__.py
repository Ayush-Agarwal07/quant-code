"""The 9 LLM research agents — the reasoning steps of the pipeline.

Each agent is one focused, PURE step: a typed `schemas/` input → a typed `schemas/`
output, via one LLM client. Agents never touch Redis, files, tools, or the network —
`pipeline/` wires them and `tools/` does the deterministic work. The MemoryCuratorAgent
lives in `memory/` (D6), not here.

Order (docs/agent_flow.md Agent Table):
ResearchDirector → PriorArtDiscovery → MarketMechanism → HypothesisGenerator →
DataFeasibility → StrategyFormalizer → StrategyWriter → ResearchCritic → ExperimentPlanner.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.agents.data_feasibility import DataFeasibilityAgent
from quantcode.agents.experiment_planner import ExperimentPlannerAgent
from quantcode.agents.hypothesis_generator import HypothesisGeneratorAgent
from quantcode.agents.market_mechanism import MarketMechanismAgent
from quantcode.agents.prior_art_discovery import PriorArtDiscoveryAgent
from quantcode.agents.research_critic import ResearchCriticAgent
from quantcode.agents.research_director import ResearchDirectorAgent
from quantcode.agents.strategy_formalizer import StrategyFormalizerAgent
from quantcode.agents.strategy_writer import StrategyWriterAgent

__all__ = [
    "Agent",
    "ResearchDirectorAgent",
    "PriorArtDiscoveryAgent",
    "MarketMechanismAgent",
    "HypothesisGeneratorAgent",
    "DataFeasibilityAgent",
    "StrategyFormalizerAgent",
    "StrategyWriterAgent",
    "ResearchCriticAgent",
    "ExperimentPlannerAgent",
]
