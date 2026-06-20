from __future__ import annotations

import pytest
from pydantic import ValidationError

from quant_forge.strategy_research.schemas import (
    AgentTrace,
    BacktestResultStub,
    CandidateHypothesis,
    DataFeasibilityReport,
    ExperimentPlanStub,
    MarketMechanism,
    MemoryWriteProposalStub,
    PriorArtTheme,
    QuantResearchPacket,
    RankingRule,
    ResearchAgenda,
    StrategyCritique,
    StrategyRule,
    StrategySpec,
)
from quant_forge.strategy_research.workflow import run_quant_research


def test_workflow_artifacts_validate_and_round_trip() -> None:
    packet = run_quant_research("Find robust short-horizon equity underreaction strategies.")
    assert isinstance(packet.agenda, ResearchAgenda)
    assert all(isinstance(item, PriorArtTheme) for item in packet.prior_art_themes)
    assert all(isinstance(item, MarketMechanism) for item in packet.market_mechanisms)
    assert all(isinstance(item, CandidateHypothesis) for item in packet.candidate_hypotheses)
    assert all(isinstance(item, DataFeasibilityReport) for item in packet.data_feasibility_reports)
    assert all(isinstance(item, StrategySpec) for item in packet.strategy_specs)
    assert all(isinstance(item, StrategyCritique) for item in packet.critiques)
    assert all(isinstance(item, ExperimentPlanStub) for item in packet.experiment_plans)
    assert all(isinstance(item, BacktestResultStub) for item in packet.backtest_results)
    assert all(isinstance(item, MemoryWriteProposalStub) for item in packet.memory_proposals)
    assert all(isinstance(item, AgentTrace) for item in packet.agent_traces)
    assert QuantResearchPacket.model_validate(packet.model_dump()) == packet


@pytest.mark.parametrize("confidence", [-0.01, 1.01])
def test_confidence_bounds(confidence: float) -> None:
    with pytest.raises(ValidationError):
        PriorArtTheme(
            theme="test",
            summary="test",
            mechanism_type="test",
            required_data=["OHLCV"],
            known_risks=[],
            source_type="test",
            confidence=confidence,
        )


def test_strategy_rule_rejects_invalid_operator() -> None:
    with pytest.raises(ValidationError):
        StrategyRule(feature="return_20d", operator="contains", value=1)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("field", "value"),
    [("entry_rules", []), ("exit_rules", [])],
)
def test_strategy_requires_entry_and_exit_rules(
    valid_strategy: StrategySpec, field: str, value: list[StrategyRule]
) -> None:
    data = valid_strategy.model_dump()
    data[field] = value
    with pytest.raises(ValidationError):
        StrategySpec.model_validate(data)


def test_ranking_rule_requires_top_or_bottom_n() -> None:
    with pytest.raises(ValidationError):
        RankingRule(feature="return_20d", order="descending")


def test_ready_strategy_requires_data(valid_strategy: StrategySpec) -> None:
    data = valid_strategy.model_dump()
    data["required_data"] = []
    with pytest.raises(ValidationError):
        StrategySpec.model_validate(data)
