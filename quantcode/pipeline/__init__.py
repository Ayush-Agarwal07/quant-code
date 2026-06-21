"""pipeline/ — the orchestrator. The ONLY place that knows the full spine order.

retrieve Tier 3 lessons → run the 9 agents → feasibility gate → validation gate →
write YAML → assemble QuantResearchPacket → persist (workspace) → Tier 1 trace →
compact (ResearchTrace Compiler) → curate (Tier 2 episode + HITL-gated Tier 3 promote).

`cli/` just calls in here; it holds no business logic.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

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
from quantcode.browser import BrowserResearcherAgent
from quantcode.compaction import CompactionResult, ResearchTraceCompiler
from quantcode.memory import Memory
from quantcode.schemas import (
    DataFeasibilityReport,
    DataFeasibilityVerdict,
    EpisodeRecord,
    Lesson,
    PriorArtTheme,
    QuantResearchPacket,
    QuantResearchRequest,
    StrategyCritique,
    TraceEvent,
    WorkspaceArtifact,
)
from quantcode.tools import ExperimentRunnerStub, StrategyValidatorTool
from quantcode.workspace import WorkspaceManager

ADVANCING = {DataFeasibilityVerdict.TESTABLE_NOW, DataFeasibilityVerdict.TESTABLE_WITH_PROXY}


class _Stepper:
    """Times each agent step, records a typed TraceEvent to Tier 1 + the packet trace.
    On failure it records the failed step (no silent swallow) then raises — the CLI is the
    one clean error boundary (D6)."""

    def __init__(self, mem: Memory, trace: list[TraceEvent], run_id: str) -> None:
        self._mem = mem
        self._trace = trace
        self._run_id = run_id

    def run(self, name: str, fn: Callable[[], Any]) -> Any:
        t0 = time.perf_counter()
        try:
            out = fn()
        except Exception as exc:
            self._record(name, "failed", "", str(exc), t0)
            raise
        self._record(name, "success", _summarize(out), None, t0)
        return out

    def _record(self, name: str, status: str, summary: str, error: str | None, t0: float) -> None:
        ev = TraceEvent(
            run_id=self._run_id,
            step=len(self._trace) + 1,
            agent_name=name,
            status=status,  # type: ignore[arg-type]  # "success"|"failed" match the Literal
            output_summary=summary,
            duration_ms=(time.perf_counter() - t0) * 1000,
            error=error,
        )
        self._trace.append(ev)
        self._mem.working.append(ev)


def _summarize(out: Any) -> str:
    # Richer summaries for the gate steps so compaction extracts MEANINGFUL Tier 3 lessons
    # (the run-2 learning demo depends on the critique/feasibility text surviving here).
    if isinstance(out, list):
        if out and isinstance(out[0], StrategyCritique):
            return " | ".join(_critique_summary(c) for c in out)
        if out and isinstance(out[0], DataFeasibilityReport):
            return " | ".join(f"{r.hypothesis_name}: {r.verdict.value}" for r in out)
        return f"{len(out)} item(s)"
    return type(out).__name__


def _critique_summary(c: StrategyCritique) -> str:
    risks = "; ".join(c.leakage_risks + c.major_issues)
    return f"{c.strategy_name}: {c.verdict}" + (f" — {risks}" if risks else "")


def run_research(
    objective: str,
    *,
    promote: bool = False,
    workspace: WorkspaceManager | None = None,
    memory: Memory | None = None,
    extra_themes: list[PriorArtTheme] | None = None,
) -> QuantResearchPacket:
    """Run the full research pipeline for one objective and persist all artifacts.

    `promote=True` writes promoted lessons to Tier 3 (🧑‍⚖️ HITL — the demo / `--promote`
    flag is the explicit human approval). Default False leaves them pending.
    """
    wm = workspace or WorkspaceManager()
    wm.ensure_dirs()
    mem = memory or Memory.connect()
    run_id = wm.next_run_id()
    trace: list[TraceEvent] = []
    step = _Stepper(mem, trace, run_id)

    req = QuantResearchRequest(objective=objective)
    # 1. retrieve Tier 3 lessons (empty on the first run; drives the second-run learning demo)
    retrieved: list[Lesson] = [lesson for lesson, _ in mem.semantic.search(objective, k=5)]

    # 2. agents in order
    agenda = step.run("ResearchDirectorAgent", lambda: ResearchDirectorAgent().run(req, retrieved))
    themes = step.run("PriorArtDiscoveryAgent", lambda: PriorArtDiscoveryAgent().run(agenda))
    if extra_themes:  # research-url injects Browserbase themes where discovery output goes
        themes = [*extra_themes, *themes]
    mechanisms = step.run(
        "MarketMechanismAgent", lambda: MarketMechanismAgent().run(agenda, themes)
    )
    hypotheses = step.run(
        "HypothesisGeneratorAgent",
        lambda: HypothesisGeneratorAgent().run(agenda, themes, mechanisms),
    )
    reports = step.run("DataFeasibilityAgent", lambda: DataFeasibilityAgent().run(hypotheses))

    # 3. feasibility gate — only testable_now / testable_with_proxy advance (rest kept in packet)
    advancing = {r.hypothesis_name for r in reports if r.verdict in ADVANCING}
    feasible = [h for h in hypotheses if h.hypothesis_name in advancing]

    specs = step.run("StrategyFormalizerAgent", lambda: StrategyFormalizerAgent().run(feasible))

    # 4. validation gate — only valid specs become YAML (reports kept either way)
    validator = StrategyValidatorTool()
    validation_reports = [validator.validate(s) for s in specs]
    valid_specs = [s for s, rep in zip(specs, validation_reports, strict=True) if rep.valid]

    finalized = step.run("StrategyWriterAgent", lambda: StrategyWriterAgent().run(valid_specs))

    artifacts: list[WorkspaceArtifact] = []
    for spec in finalized:
        path = wm.write_strategy_yaml(spec)
        artifacts.append(
            WorkspaceArtifact(
                artifact_type="strategy_yaml", path=str(path), description=spec.strategy_name
            )
        )

    critiques = step.run("ResearchCriticAgent", lambda: ResearchCriticAgent().run(finalized))
    plans = step.run(
        "ExperimentPlannerAgent", lambda: ExperimentPlannerAgent().run(finalized, critiques)
    )
    runner = ExperimentRunnerStub()
    results = [runner.run(plan) for plan in plans]

    # 5. compaction (Token Company) — measured metrics; proposes candidate lessons only
    comp: CompactionResult = ResearchTraceCompiler().compile(run_id, trace, budget=1000)
    pack_path = wm.write_context_pack(comp.pack)
    artifacts.append(
        WorkspaceArtifact(
            artifact_type="context_pack",
            path=str(pack_path),
            description=f"compaction {comp.pack.compression_ratio:.2f}x",
        )
    )

    # 6. curate — Tier 3 promotion is HITL-gated (default off); always write the Tier 2 episode
    promo = mem.curator.promote(comp.candidate_lessons, approved=promote)
    produced = promo["promoted"]
    episode = EpisodeRecord(
        run_id=run_id,
        objective=objective,
        strategy_names=[s.strategy_name for s in finalized],
        critique_summaries=[f"{c.strategy_name}: {c.verdict}" for c in critiques],
        failed_feasibility=[r.hypothesis_name for r in reports if r.verdict not in ADVANCING],
        retrieved_lesson_ids=[lesson.lesson_id for lesson in retrieved],
        produced_lesson_ids=[lesson.lesson_id for lesson in produced],
    )
    mem.episodic.write_episode(episode)

    packet = QuantResearchPacket(
        run_id=run_id,
        request=req,
        agenda=agenda,
        prior_art_themes=themes,
        market_mechanisms=mechanisms,
        candidate_hypotheses=hypotheses,
        data_feasibility_reports=reports,
        strategy_specs=finalized,
        strategy_validation_reports=validation_reports,
        workspace_artifacts=artifacts,
        critiques=critiques,
        experiment_plans=plans,
        experiment_results=results,
        retrieved_lessons=retrieved,
        produced_lessons=produced,
        context_pack=comp.pack,
        episode=episode,
        trace_events=trace,
    )
    wm.write_run_json(packet)
    wm.write_markdown_report(run_id, render_report(packet))
    return packet


def run_from_url(
    url: str,
    objective: str | None = None,
    *,
    confirm: bool = False,
    promote: bool = False,
    workspace: WorkspaceManager | None = None,
    memory: Memory | None = None,
) -> QuantResearchPacket:
    """research-url: Browserbase themes → normal pipeline. Live fetch is HITL-gated (confirm)."""
    themes = BrowserResearcherAgent().run_url(url, confirm=confirm)  # raises if not confirmed
    obj = objective or f"Research prior art from {url}"
    return run_research(
        obj, promote=promote, workspace=workspace, memory=memory, extra_themes=themes
    )


def render_report(packet: QuantResearchPacket) -> str:
    """Markdown run summary (judge/devpost projection). Honest: experiments not_executed."""
    p = packet
    lines = [
        f"# QuantCode run `{p.run_id}`",
        "",
        f"**Objective:** {p.request.objective}",
        "",
    ]
    if p.retrieved_lessons:
        lines += ["## Retrieved memory (Tier 3)", ""]
        lines += [f"- ⚠️ {lesson.text}" for lesson in p.retrieved_lessons]
        lines += ["", "_The agent applied prior lessons before generating new strategies._", ""]
    lines += ["## Feasibility gate", ""]
    for r in p.data_feasibility_reports:
        mark = "✅" if r.verdict in ADVANCING else "⛔"
        lines.append(f"- {mark} `{r.hypothesis_name}` → **{r.verdict.value}**")
    lines += ["", "## Strategies written", ""]
    for s in p.strategy_specs:
        lines.append(f"- `{s.strategy_name}` ({s.strategy_family}) — {s.backtest_readiness}")
    if not p.strategy_specs:
        lines.append("- _(none passed both gates)_")
    lines += ["", "## Critiques", ""]
    for c in p.critiques:
        flags = "; ".join(c.leakage_risks + c.major_issues) or "no blocking issues"
        lines.append(f"- `{c.strategy_name}` → **{c.verdict}** ({flags})")
    if p.context_pack:
        cp = p.context_pack
        est = " (estimated)" if cp.tokens_estimated else ""
        ratio = f"{cp.compression_ratio:.2f}x"
        retained = f"{cp.critical_lessons_retained}/{cp.total_critical_lessons}"
        lines += [
            "",
            "## Compaction (ResearchTrace Compiler)",
            "",
            f"- {cp.tokens_before} → {cp.tokens_after} tokens, **{ratio}**{est}",
            f"- criticals retained: {retained}",
            f"- duplicate events removed: {cp.duplicate_events_removed}",
        ]
    lines += [
        "",
        "## Experiments",
        "",
        "Status: **not_executed** — backtesting is intentionally stubbed in this hackathon "
        "version. Planned metrics only; no performance is claimed.",
        "",
    ]
    return "\n".join(lines)
