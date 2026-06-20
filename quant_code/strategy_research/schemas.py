"""Structured artifacts produced by the research workflow."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class ResearchArtifact(BaseModel):
    """Strict base model for research artifacts."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class QuantResearchRequest(ResearchArtifact):
    objective: str = Field(min_length=1)
    asset_universe: str | None = None
    constraints: dict[str, Any] = Field(default_factory=dict)


class ResearchAgenda(ResearchArtifact):
    research_objective: str
    research_domain: str
    asset_universe: str
    target_horizons: list[str]
    strategy_styles: list[str]
    constraints: dict[str, Any]
    research_questions: list[str]


class PriorArtTheme(ResearchArtifact):
    theme: str
    summary: str
    mechanism_type: str
    required_data: list[str]
    known_risks: list[str]
    source_type: str
    confidence: Confidence


class MarketMechanism(ResearchArtifact):
    name: str
    description: str
    why_edge_might_exist: list[str]
    why_edge_might_disappear: list[str]
    observable_implications: list[str]
    related_themes: list[str]


class CandidateHypothesis(ResearchArtifact):
    hypothesis_name: str
    hypothesis: str
    mechanism: str
    predicted_effect: str
    asset_universe: str
    horizon: str
    required_data: list[str]
    possible_proxy_data: list[str]
    expected_failure_modes: list[str]
    falsification_tests: list[str]
    confidence: Confidence


class DataFeasibilityVerdict(StrEnum):
    TESTABLE_NOW = "testable_now"
    TESTABLE_WITH_PROXY = "testable_with_proxy"
    REQUIRES_NEW_DATA_SOURCE = "requires_new_data_source"
    NOT_TESTABLE = "not_testable"


class DataFeasibilityReport(ResearchArtifact):
    hypothesis_name: str
    verdict: DataFeasibilityVerdict
    required_data: list[str]
    available_now: list[str]
    available_with_existing_adapter: list[str]
    missing_data: list[str]
    proxy_available: bool
    proxy_description: str | None
    proxy_features: list[str]
    data_quality_risks: list[str]


RuleOperator = Literal[">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]


class StrategyRule(ResearchArtifact):
    feature: str
    operator: RuleOperator
    value: float | int | str | bool | None = None
    feature_ref: str | None = None
    lookback_days: int | None = Field(default=None, gt=0)
    description: str | None = None

    @model_validator(mode="after")
    def validate_comparison_target(self) -> StrategyRule:
        if self.value is None and self.feature_ref is None:
            raise ValueError("a strategy rule requires value or feature_ref")
        return self


class RankingRule(ResearchArtifact):
    feature: str
    order: Literal["ascending", "descending"]
    top_n: int | None = Field(default=None, gt=0)
    bottom_n: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_selection_size(self) -> RankingRule:
        if self.top_n is None and self.bottom_n is None:
            raise ValueError("ranking rule requires top_n or bottom_n")
        if self.top_n is not None and self.bottom_n is not None:
            raise ValueError("ranking rule cannot set both top_n and bottom_n")
        return self


class PortfolioRules(ResearchArtifact):
    weighting: Literal[
        "equal_weight", "rank_weighted", "inverse_vol_weighted", "volatility_targeted"
    ]
    max_position: float | None = Field(default=None, gt=0.0, le=1.0)
    max_sector_weight: float | None = Field(default=None, gt=0.0, le=1.0)
    rebalance_frequency: Literal["daily", "weekly", "monthly"]


class RiskRules(ResearchArtifact):
    stop_loss: float | None = Field(default=None, gt=0.0)
    take_profit: float | None = Field(default=None, gt=0.0)
    max_holding_days: int | None = Field(default=None, gt=0)
    max_turnover: float | None = Field(default=None, gt=0.0)


class StrategySpec(ResearchArtifact):
    strategy_name: str
    source_hypothesis: str
    strategy_family: str
    hypothesis: str
    economic_rationale: str
    universe: str
    entry_rules: list[StrategyRule] = Field(min_length=1)
    exit_rules: list[StrategyRule] = Field(min_length=1)
    ranking_rule: RankingRule | None
    portfolio_rules: PortfolioRules
    risk_rules: RiskRules
    required_data: list[str]
    expected_failure_modes: list[str]
    backtest_readiness: Literal["ready", "ready_with_proxy_limitations", "not_ready"]
    confidence: Confidence

    @model_validator(mode="after")
    def validate_required_data(self) -> StrategySpec:
        if self.backtest_readiness != "not_ready" and not self.required_data:
            raise ValueError("backtest-ready strategies require data")
        return self


class StrategyCritique(ResearchArtifact):
    strategy_name: str
    verdict: Literal["accept_for_backtest", "revise_before_backtest", "reject"]
    major_issues: list[str]
    leakage_risks: list[str]
    overfitting_risks: list[str]
    transaction_cost_risks: list[str]
    data_quality_risks: list[str]
    economic_rationale_strength: Literal["weak", "moderate", "strong"]
    suggested_mutations: list[str]
    confidence: Confidence


class StrategyValidationReport(ResearchArtifact):
    strategy_name: str
    valid: bool
    errors: list[str]
    warnings: list[str]


class WorkspaceArtifact(ResearchArtifact):
    artifact_type: Literal[
        "strategy_yaml",
        "run_json",
        "markdown_report",
        "context_pack",
    ]
    path: str
    description: str


class ExperimentPlanStub(ResearchArtifact):
    strategy_name: str
    train_period: tuple[str, str]
    test_period: tuple[str, str]
    benchmark: str
    universes: list[str]
    cost_assumptions: dict[str, float]
    robustness_tests: list[str]
    failure_criteria: list[str]
    status: Literal["stub_not_executed"]


class ExperimentResultStub(ResearchArtifact):
    strategy_name: str
    status: Literal["not_executed"]
    reason: str
    planned_metrics: list[str]


class ResearchTraceCompilationStub(ResearchArtifact):
    run_id: str
    source_event_count: int
    source_token_estimate: int
    compacted_token_estimate: int
    compression_ratio: float
    candidate_lessons: list[str]
    retained_critical_lessons: int
    duplicate_events_removed: int
    status: Literal["compiled_not_persisted", "compiled_and_written"]


class MemoryTierRecordStub(ResearchArtifact):
    tier: Literal["tier_1_working_trace", "tier_2_episode", "tier_3_semantic_lesson"]
    key: str
    content_summary: str
    ttl_seconds: int | None
    status: Literal["proposed_not_written", "written_to_stub"]


class MemoryWriteProposalStub(ResearchArtifact):
    memory_type: Literal[
        "strategy_memory",
        "failure_memory",
        "research_lesson_memory",
        "mutation_memory",
        "agent_calibration_memory",
    ]
    content: str
    evidence_strategy_names: list[str]
    confidence: Confidence
    status: Literal["proposed_not_written"]


class AgentTrace(ResearchArtifact):
    agent_name: str
    input_summary: str
    output_summary: str
    schema_used: str
    validation_status: Literal["success", "failed", "repaired"]
    errors: list[str]


class QuantResearchPacket(ResearchArtifact):
    request: QuantResearchRequest
    agenda: ResearchAgenda
    prior_art_themes: list[PriorArtTheme]
    market_mechanisms: list[MarketMechanism]
    candidate_hypotheses: list[CandidateHypothesis]
    data_feasibility_reports: list[DataFeasibilityReport]
    strategy_specs: list[StrategySpec]
    strategy_validation_reports: list[StrategyValidationReport] = Field(default_factory=list)
    workspace_artifacts: list[WorkspaceArtifact] = Field(default_factory=list)
    critiques: list[StrategyCritique]
    experiment_plans: list[ExperimentPlanStub]
    experiment_results: list[ExperimentResultStub]
    memory_proposals: list[MemoryWriteProposalStub]
    trace_compilation: ResearchTraceCompilationStub | None = None
    memory_records: list[MemoryTierRecordStub] = Field(default_factory=list)
    agent_traces: list[AgentTrace]


MAIN_SCHEMA_NAMES = [
    "QuantResearchRequest",
    "ResearchAgenda",
    "PriorArtTheme",
    "MarketMechanism",
    "CandidateHypothesis",
    "DataFeasibilityReport",
    "StrategySpec",
    "StrategyValidationReport",
    "WorkspaceArtifact",
    "StrategyCritique",
    "ExperimentPlanStub",
    "ExperimentResultStub",
    "ResearchTraceCompilationStub",
    "MemoryTierRecordStub",
    "MemoryWriteProposalStub",
    "AgentTrace",
    "QuantResearchPacket",
]
