"""Typed contracts for QuantCode — the boundaries that keep the pipeline honest.

Ported from `deprecated/strategy_research/schemas.py` (decision D4: port schemas only),
with the stub memory/compaction models replaced by real Redis-era schemas
(`Lesson`, `ContextPack`, `EpisodeRecord`, `TraceEvent`) and `schema_version` added to
every artifact that gets written to disk or Redis (decision D6).

ponytail: one module until it actually grows. Pydantic v2, `extra="forbid"` so typos
fail loudly. Validation *policy* (supported features/operators, leakage) lives in
`tools/`, not here — schemas define shape, the tool enforces rules.

⚠️ NOT FROZEN until human sign-off (schemas/ HITL checkpoint). Phase 2 agents build
against this; changing a persisted field afterwards is a backwards-compat break.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "1"

Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class ResearchArtifact(BaseModel):
    """Strict base for all artifacts."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)


# --------------------------------------------------------------------------- #
# Request / agenda / prior art / mechanisms / hypotheses
# --------------------------------------------------------------------------- #
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
    """Prior-art / mechanism evidence. Also the `browser/` output type — a scraped
    page becomes a PriorArtTheme, never a raw hypothesis."""

    theme: str
    summary: str
    mechanism_type: str
    required_data: list[str]
    known_risks: list[str]
    source_type: str
    confidence: Confidence
    source_url: str | None = None  # set when produced via research-url (Browserbase)


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


# --------------------------------------------------------------------------- #
# Feasibility gate
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
# Strategy DSL
# --------------------------------------------------------------------------- #
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
    """The YAML strategy contract (written to workspace/strategies/*.yaml)."""

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
    schema_version: str = SCHEMA_VERSION  # persisted to YAML — versioned for replay

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
    """Output of `tools/StrategyValidatorTool` — structured pass/fail with reasons."""

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


# --------------------------------------------------------------------------- #
# Experiment plan / runner stub (intentionally not_executed)
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
# Memory + compaction (NEW — replaces deprecated stub schemas; Redis-backed)
# --------------------------------------------------------------------------- #
LessonKind = Literal["warning", "pattern", "data_constraint", "mutation_rule"]


class Lesson(ResearchArtifact):
    """Tier 3 semantic lesson. Durable, reusable, vector-searchable. Carries
    provenance so the demo can show *why* a warning exists."""

    lesson_id: str
    text: str
    kind: LessonKind
    source_run_id: str
    source_critique: str | None = None
    confidence: Confidence = 0.5
    embedding: list[float] | None = None  # set by memory/tier3 at write time
    schema_version: str = SCHEMA_VERSION
    created_at: str | None = None


class ContextPack(ResearchArtifact):
    """Compacted retrieval object produced by the ResearchTrace Compiler. Metrics
    must be MEASURED (Token Company track); `tokens_estimated` flags estimates."""

    pack_id: str
    run_id: str
    lessons: list[str]
    tokens_before: int
    tokens_after: int
    compression_ratio: float
    critical_lessons_retained: int
    total_critical_lessons: int
    duplicate_events_removed: int
    budget: int
    tokens_estimated: bool = False
    schema_version: str = SCHEMA_VERSION
    created_at: str | None = None


class EpisodeRecord(ResearchArtifact):
    """Tier 2 episodic memory — one durable record per run. A queryable projection
    of QuantResearchPacket (not the whole thing). Includes retrieval provenance."""

    run_id: str
    objective: str
    strategy_names: list[str]
    critique_summaries: list[str]
    failed_feasibility: list[str]
    retrieved_lesson_ids: list[str]
    produced_lesson_ids: list[str]
    schema_version: str = SCHEMA_VERSION
    created_at: str | None = None


class TraceEvent(ResearchArtifact):
    """Typed Tier 1 / pipeline trace event (NOT free-text logs — keeps the
    QC_TRACE_EXPORTER seam cheap). One record per agent step."""

    run_id: str
    step: int
    agent_name: str
    status: Literal["success", "failed", "skipped"]
    input_summary: str = ""
    output_summary: str = ""
    # Full serialized output — the context an uncompacted agent would carry forward. This is
    # the honest `tokens_before` basis for compaction (D7); `output_summary` is the one-line
    # UI/lesson form. Empty for failed/skipped steps.
    output_detail: str = ""
    duration_ms: float | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    error: str | None = None


class AgentTrace(ResearchArtifact):
    """Per-agent validation summary kept inside the packet (human-readable)."""

    agent_name: str
    input_summary: str
    output_summary: str
    schema_used: str
    validation_status: Literal["success", "failed", "repaired"]
    errors: list[str]


# --------------------------------------------------------------------------- #
# The full run record
# --------------------------------------------------------------------------- #
class QuantResearchPacket(ResearchArtifact):
    """The complete, honest run record → workspace/research_runs/run_N.json."""

    run_id: str
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
    retrieved_lessons: list[Lesson] = Field(default_factory=list)
    produced_lessons: list[Lesson] = Field(default_factory=list)
    context_pack: ContextPack | None = None
    episode: EpisodeRecord | None = None
    trace_events: list[TraceEvent] = Field(default_factory=list)
    agent_traces: list[AgentTrace] = Field(default_factory=list)
    schema_version: str = SCHEMA_VERSION


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
    "Lesson",
    "ContextPack",
    "EpisodeRecord",
    "TraceEvent",
    "AgentTrace",
    "QuantResearchPacket",
]


def sample_strategy_spec() -> StrategySpec:
    """A minimal valid StrategySpec — used by the self-check and reusable by tests."""
    return StrategySpec(
        strategy_name="demo_momentum",
        source_hypothesis="price_volume_continuation",
        strategy_family="momentum",
        hypothesis="Recent winners with high volume continue.",
        economic_rationale="Gradual information diffusion.",
        universe="US liquid equities",
        entry_rules=[StrategyRule(feature="return_20d", operator=">", value=0.0)],
        exit_rules=[StrategyRule(feature="holding_days", operator=">=", value=5)],
        ranking_rule=RankingRule(feature="return_20d", order="descending", top_n=10),
        portfolio_rules=PortfolioRules(weighting="equal_weight", rebalance_frequency="weekly"),
        risk_rules=RiskRules(max_holding_days=10),
        required_data=["OHLCV"],
        expected_failure_modes=["momentum crash"],
        backtest_readiness="ready",
        confidence=0.6,
    )
