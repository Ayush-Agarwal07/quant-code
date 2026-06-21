"""Runnable self-check: `python -m quantcode.agents`. Mock-only, offline.

Runs the full 9-agent chain agent-by-agent in mock mode, asserts every output validates
against its schema and the chain is non-empty (>=1 advancing feasibility verdict, >=1
StrategySpec, >=1 critique), then prints a one-line summary with counts.
"""

from __future__ import annotations

from quantcode.agents import (
    DataFeasibilityAgent,
    ExperimentPlannerAgent,
    HypothesisGeneratorAgent,
    MarketMechanismAgent,
    PriorArtDiscoveryAgent,
    ResearchCriticAgent,
    ResearchDirectorAgent,
    StrategyFormalizerAgent,
    StrategyWriterAgent,
)
from quantcode.schemas import (
    CandidateHypothesis,
    DataFeasibilityReport,
    DataFeasibilityVerdict,
    ExperimentPlanStub,
    MarketMechanism,
    PriorArtTheme,
    QuantResearchRequest,
    ResearchAgenda,
    StrategyCritique,
    StrategySpec,
)

# Feasibility gate (docs/agent_flow.md): only these verdicts advance to formalization.
_ADVANCING = {DataFeasibilityVerdict.TESTABLE_NOW, DataFeasibilityVerdict.TESTABLE_WITH_PROXY}


def main() -> None:
    req = QuantResearchRequest(objective="Find short-horizon underreaction strategies")

    agenda = ResearchDirectorAgent().run(req)
    assert isinstance(agenda, ResearchAgenda)

    themes = PriorArtDiscoveryAgent().run(agenda)
    assert themes and all(isinstance(t, PriorArtTheme) for t in themes)

    mechanisms = MarketMechanismAgent().run(agenda, themes)
    assert mechanisms and all(isinstance(m, MarketMechanism) for m in mechanisms)

    hypotheses = HypothesisGeneratorAgent().run(agenda, themes, mechanisms)
    assert hypotheses and all(isinstance(h, CandidateHypothesis) for h in hypotheses)

    reports = DataFeasibilityAgent().run(hypotheses)
    assert len(reports) == len(hypotheses)
    assert all(isinstance(r, DataFeasibilityReport) for r in reports)

    advancing = {r.hypothesis_name for r in reports if r.verdict in _ADVANCING}
    deferred = [r for r in reports if r.verdict not in _ADVANCING]
    assert advancing, "chain must have >=1 advancing feasibility verdict"
    assert deferred, "demo expects a realistic mix: >=1 deferred verdict"

    feasible = [h for h in hypotheses if h.hypothesis_name in advancing]
    specs = StrategyFormalizerAgent().run(feasible)
    assert specs and all(isinstance(s, StrategySpec) for s in specs)

    finalized = StrategyWriterAgent().run(specs)
    assert len(finalized) == len(specs)
    assert all(isinstance(s, StrategySpec) for s in finalized)

    critiques = ResearchCriticAgent().run(finalized)
    assert critiques and all(isinstance(c, StrategyCritique) for c in critiques)
    assert any(
        c.economic_rationale_strength == "weak" or c.leakage_risks for c in critiques
    ), "demo expects >=1 critique flagging a weak proxy or leakage risk (a lesson to learn)"

    plans = ExperimentPlannerAgent().run(finalized, critiques)
    assert plans and all(isinstance(p, ExperimentPlanStub) for p in plans)

    print(
        f"agents OK (mock) — themes={len(themes)} mechanisms={len(mechanisms)} "
        f"hypotheses={len(hypotheses)} advancing={len(advancing)} deferred={len(deferred)} "
        f"specs={len(finalized)} critiques={len(critiques)} plans={len(plans)}"
    )


if __name__ == "__main__":
    main()
