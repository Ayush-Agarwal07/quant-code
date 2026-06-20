from __future__ import annotations

from quant_forge.strategy_research.schemas import QuantResearchPacket
from quant_forge.strategy_research.workflow import run_quant_research


def test_quant_research_workflow_returns_complete_packet_without_live_apis() -> None:
    packet = run_quant_research(
        "Find robust short-horizon equity strategies based on market underreaction."
    )
    assert isinstance(packet, QuantResearchPacket)
    assert len(packet.prior_art_themes) >= 2
    assert len(packet.market_mechanisms) >= 2
    assert len(packet.candidate_hypotheses) >= 3
    assert len(packet.data_feasibility_reports) == len(packet.candidate_hypotheses)
    assert len(packet.strategy_specs) >= 1
    assert len(packet.critiques) == len(packet.strategy_specs)
    assert len(packet.experiment_plans) == len(packet.strategy_specs)
    assert len(packet.backtest_results) == len(packet.experiment_plans)
    assert all(result.status == "not_executed" for result in packet.backtest_results)
    assert len(packet.memory_proposals) >= 1
    assert all(proposal.status == "proposed_not_written" for proposal in packet.memory_proposals)
    assert len(packet.agent_traces) == 9


def test_mock_workflow_is_deterministic() -> None:
    objective = "Research short-horizon market underreaction."
    first = run_quant_research(objective)
    second = run_quant_research(objective)
    assert first == second
