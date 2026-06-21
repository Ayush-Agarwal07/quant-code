"""Runnable self-check: `python -m quantcode.compaction`. Offline, deterministic.

Builds a trace with KNOWN duplicates and a couple of critical (failed/critic) events, runs
`ResearchTraceCompiler.compile`, and asserts the measured metrics. Proves the numbers are
MEASURED + reproducible before any of them go in the pitch (HITL gate). Real tokenizer if
the BAAI/bge-small cache is warm, else a clearly-labeled estimate — never flakes offline.
"""

from __future__ import annotations

import json

from quantcode.compaction import ResearchTraceCompiler
from quantcode.compaction.compiler import _extract_lesson, _salient_spans
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

    # --- extractive compaction (The Token Company's definition): delete low-signal tokens,
    #     keep the decision-bearing slice VERBATIM. ------------------------------------------
    detail = json.dumps(
        {
            "schema_version": "v9",  # boilerplate -> deleted
            "created_at": "2026-01-01T00:00:00",  # boilerplate -> deleted
            "strategy_name": "gap_drift_proxy",  # signal -> kept verbatim
            "verdict": "revise_before_backtest",  # signal -> kept verbatim
            "leakage_risks": ["gap_1d uses same-day close, a look-ahead leak"],  # signal
        }
    )
    ev = TraceEvent(
        run_id="r", step=1, agent_name="ResearchCriticAgent", status="success",
        output_summary="gap_drift_proxy: revise", output_detail=detail,
    )

    # the verbose output_detail drives tokens_before, and extraction makes after < before
    pack2 = compiler.compile("r", [ev]).pack
    assert pack2.tokens_before > pack2.tokens_after, (pack2.tokens_before, pack2.tokens_after)

    # VERBATIM fidelity: every extracted span's content comes from the source — either a
    # literal substring, or a `field: value` label whose field and value are both in source
    # (the ': ' is presentational). No text is generated -> defensible deletion-based compaction.
    def _verbatim(span: str, src: str) -> bool:
        if span in src:
            return True
        field, _, value = span.partition(": ")
        return bool(value) and field in src and value in src

    assert all(_verbatim(s, detail) for s in _salient_spans(detail)), "extraction must be verbatim"

    lesson = _extract_lesson(ev)
    # scaffolding/boilerplate deleted
    assert "v9" not in lesson and "2026-01-01" not in lesson, "boilerplate must be deleted"
    # MEANING PRESERVED: every must-retain decision point survives compaction (recall = 100%).
    # Extraction is lossless on content — it deletes structure/noise, never decision content.
    must_retain = [
        "gap_drift_proxy",  # which strategy
        "revise_before_backtest",  # the verdict
        "gap_1d uses same-day close, a look-ahead leak",  # the actual risk, verbatim
    ]
    lost = [m for m in must_retain if m not in lesson]
    assert not lost, f"compaction dropped decision content (meaning loss): {lost}"

    # budget is a HARD ceiling: below one lesson's size, tokens_after never overshoots and the
    # boundary lesson is flagged lossy with an ellipsis (no silent overflow, no flatline).
    tight = compiler.compile("run_001", events, budget=8).pack
    assert tight.tokens_after <= 8, tight.tokens_after
    assert any("…" in t for t in tight.lessons), "tight budget must flag truncation"

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
