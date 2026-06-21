"""Runnable self-check: `python -m quantcode.compaction`. Offline, deterministic.

Builds a trace with KNOWN duplicates and a couple of critical (failed/critic) events, runs
`ResearchTraceCompiler.compile`, and asserts the measured metrics. Proves the numbers are
MEASURED + reproducible before any of them go in the pitch (HITL gate). Real tokenizer if
the BAAI/bge-small cache is warm, else a clearly-labeled estimate — never flakes offline.
"""

from __future__ import annotations

from quantcode.compaction import ResearchTraceCompiler
from quantcode.schemas import ContextPack, TraceEvent


def _sample_trace() -> list[TraceEvent]:
    """8 events; 3 are exact near-duplicates of earlier ones (-> 3 removed). Two are
    critical: one failed step + one ResearchCriticAgent step."""
    return [
        TraceEvent(
            run_id="run_001",
            step=1,
            agent_name="ResearchDirectorAgent",
            status="success",
            output_summary="Narrowed objective to short-horizon equity underreaction.",
        ),
        TraceEvent(
            run_id="run_001",
            step=2,
            agent_name="PriorArtDiscoveryAgent",
            status="success",
            output_summary="Found 3 prior-art themes on post-earnings drift.",
        ),
        # duplicate of step 2 (retried + re-logged) -> removed
        TraceEvent(
            run_id="run_001",
            step=3,
            agent_name="PriorArtDiscoveryAgent",
            status="success",
            output_summary="Found 3 prior-art themes on post-earnings drift.",
        ),
        TraceEvent(
            run_id="run_001",
            step=4,
            agent_name="DataFeasibilityAgent",
            status="failed",
            output_summary="Earnings-surprise proxy is unlagged.",
            error="Leakage risk: earnings surprise feature is not point-in-time lagged.",
        ),
        # duplicate of the failed feasibility step -> removed
        TraceEvent(
            run_id="run_001",
            step=5,
            agent_name="DataFeasibilityAgent",
            status="failed",
            output_summary="Earnings-surprise proxy is unlagged.",
            error="Leakage risk: earnings surprise feature is not point-in-time lagged.",
        ),
        TraceEvent(
            run_id="run_001",
            step=6,
            agent_name="ResearchCriticAgent",
            status="success",
            output_summary="Transaction-cost assumptions too optimistic for weekly rebalance.",
        ),
        # pure-noise successful step with empty output -> not a candidate lesson
        TraceEvent(
            run_id="run_001", step=7, agent_name="ExperimentRunnerStub", status="skipped"
        ),
        # duplicate of the critic step -> removed
        TraceEvent(
            run_id="run_001",
            step=8,
            agent_name="ResearchCriticAgent",
            status="success",
            output_summary="Transaction-cost assumptions too optimistic for weekly rebalance.",
        ),
    ]


def main() -> None:
    events = _sample_trace()
    compiler = ResearchTraceCompiler()
    # tight budget so compression is real, the cap is exercised, yet both criticals fit
    result = compiler.compile(run_id="run_001", events=events, budget=80)
    pack = result.pack

    # the ContextPack must validate as the frozen schema
    assert isinstance(pack, ContextPack)
    ContextPack.model_validate(pack.model_dump())

    # dedup: exactly the 3 near-duplicate events were removed
    assert pack.duplicate_events_removed == 3, pack.duplicate_events_removed

    # measured compression actually happened
    assert pack.tokens_after < pack.tokens_before, (pack.tokens_after, pack.tokens_before)
    assert pack.compression_ratio > 1, pack.compression_ratio

    # critical-lesson oracle: 2 criticals (failed feasibility + critic), kept first -> both fit
    assert pack.total_critical_lessons == 2, pack.total_critical_lessons
    assert pack.critical_lessons_retained == 2, pack.critical_lessons_retained

    # budget respected and candidates proposed (NOT promoted)
    assert pack.tokens_after <= pack.budget, (pack.tokens_after, pack.budget)
    assert result.candidate_lessons, "compiler must propose candidate lessons"

    flag = "ESTIMATED (tokenizer cold cache)" if pack.tokens_estimated else "MEASURED (bge-small)"
    print(f"{compiler.name} OK — token counts {flag}")
    print(
        f"  {pack.tokens_before} -> {pack.tokens_after} tokens "
        f"({pack.compression_ratio}x) | budget {pack.budget}"
    )
    print(
        f"  critical lessons retained: "
        f"{pack.critical_lessons_retained}/{pack.total_critical_lessons} | "
        f"duplicate events removed: {pack.duplicate_events_removed} | "
        f"candidates proposed: {len(result.candidate_lessons)}"
    )


if __name__ == "__main__":
    main()
