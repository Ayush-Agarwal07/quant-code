"""ResearchTrace Compiler — the Token-Company centerpiece.

Turns a long, noisy Tier 1 trace (`list[TraceEvent]`) into a compact `ContextPack` within
a token budget, and PROPOSES candidate lessons. It never promotes them — `MemoryCurator`
alone promotes (architecture: "the memory curator should not promote directly from noisy
raw traces"). This module deliberately does not import or call memory.

Pipeline (deterministic first, honest, cheap):

1. dedupe near-duplicate trace events            -> `duplicate_events_removed`
2. extract candidate lessons from meaningful events
3. mark which candidates are CRITICAL            -> `total_critical_lessons`
4. compress lesson texts to the token `budget`   -> `tokens_after`, `critical_lessons_retained`

All `ContextPack` metrics are MEASURED with the D7 tokenizer (real subword counts offline;
labeled estimate only as a clearly-flagged fallback).

Critical lesson — EXPLICIT, deterministic definition (ponytail oracle for the X/N metric):
a candidate lesson is CRITICAL iff it was derived from a meaningful *failure/critique*
event, i.e. an event with `status == "failed"` OR an `agent_name` that contains "critic" or
"feasibility" (case-insensitive). `critical_lessons_retained` = how many of those critical
candidates survived into the pack within budget. Critical candidates are kept FIRST so the
metric measures real prioritisation, not luck.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from quantcode.compaction.tokenizer import TokenCounter, get_token_counter
from quantcode.schemas import ContextPack, Lesson, TraceEvent

# agent_name substrings that mark an event as a critical decision point (D-oracle above).
_CRITICAL_AGENT_MARKERS = ("critic", "feasibility")


def _is_critical_event(event: TraceEvent) -> bool:
    name = event.agent_name.lower()
    return event.status == "failed" or any(m in name for m in _CRITICAL_AGENT_MARKERS)


def _is_meaningful_event(event: TraceEvent) -> bool:
    """A trace event worth turning into a candidate lesson: it either failed/critiqued, or
    it actually said something (non-empty output). Pure successful no-output steps are noise.
    """
    return _is_critical_event(event) or bool(event.output_summary.strip())


def _event_signature(event: TraceEvent) -> tuple[str, str, str, str]:
    """Identity used for near-duplicate detection. Two events collapse when the same agent
    reports the same status with the same (whitespace-normalised, lowercased) summaries —
    e.g. a retried step logged twice. The `step` index is intentionally ignored.
    """
    return (
        event.agent_name.strip().lower(),
        event.status,
        " ".join(event.output_summary.lower().split()),
        " ".join((event.error or "").lower().split()),
    )


def _lesson_kind(event: TraceEvent) -> str:
    if event.status == "failed":
        return "warning"
    if "feasibility" in event.agent_name.lower():
        return "data_constraint"
    if "critic" in event.agent_name.lower():
        return "warning"
    return "pattern"


def _lesson_text(event: TraceEvent) -> str:
    body = (event.error or event.output_summary or event.input_summary).strip()
    return f"[{event.agent_name}] {body}" if body else f"[{event.agent_name}] (no detail)"


@dataclass(frozen=True)
class CompactionResult:
    """What `compile` returns: the durable `ContextPack` plus the PROPOSED candidate lessons
    (full `Lesson` objects, so `MemoryCurator` can validate/promote them downstream). The
    pack's `lessons` field is the compacted *text* that fit the budget; `candidate_lessons`
    is every lesson the compiler proposed (including any dropped for budget).
    """

    pack: ContextPack
    candidate_lessons: list[Lesson] = field(default_factory=list)


class ResearchTraceCompiler:
    """Deterministic trace -> ContextPack compiler. Stateless; one tokenizer per instance."""

    name = "ResearchTrace Compiler"

    def __init__(self, counter: TokenCounter | None = None) -> None:
        self._counter = counter or get_token_counter()

    def _count(self, texts: list[str]) -> int:
        return sum(self._counter.count(t) for t in texts)

    def compile(
        self, run_id: str, events: list[TraceEvent], budget: int = 1000
    ) -> CompactionResult:
        # tokens_before: the full raw trace as the agent would otherwise carry it forward.
        raw_texts = [_lesson_text(e) for e in events]
        tokens_before = self._count(raw_texts)

        # 1. dedupe near-duplicate events (keep first occurrence, stable order).
        seen: set[tuple[str, str, str, str]] = set()
        deduped: list[TraceEvent] = []
        for event in events:
            sig = _event_signature(event)
            if sig in seen:
                continue
            seen.add(sig)
            deduped.append(event)
        duplicate_events_removed = len(events) - len(deduped)

        # 2. extract candidate lessons from meaningful events.
        candidates: list[Lesson] = []
        critical_flags: list[bool] = []
        for i, event in enumerate(e for e in deduped if _is_meaningful_event(e)):
            critical = _is_critical_event(event)
            candidates.append(
                Lesson(
                    lesson_id=f"{run_id}:cand:{i}",
                    text=_lesson_text(event),
                    kind=_lesson_kind(event),  # type: ignore[arg-type]  # values match LessonKind
                    source_run_id=run_id,
                    source_critique=event.error if event.status == "failed" else None,
                    confidence=0.6 if critical else 0.4,
                )
            )
            critical_flags.append(critical)
        total_critical_lessons = sum(critical_flags)

        # 3. compress to budget: critical lessons first, then the rest, greedily by token cost
        #    until the budget is hit. This makes `critical_lessons_retained` a real measure of
        #    prioritisation under pressure.
        order = sorted(
            range(len(candidates)),
            key=lambda i: (not critical_flags[i], i),  # criticals (False sorts first), stable
        )
        kept_texts: list[str] = []
        kept_indices: list[int] = []
        used = 0
        for i in order:
            cost = self._counter.count(candidates[i].text)
            if used + cost > budget and kept_texts:  # always keep at least one if any exist
                continue
            used += cost
            kept_texts.append(candidates[i].text)
            kept_indices.append(i)

        critical_lessons_retained = sum(critical_flags[i] for i in kept_indices)
        tokens_after = self._count(kept_texts)
        # compression_ratio: guard the empty-pack edge (no candidates -> ratio 1.0, no win).
        compression_ratio = (tokens_before / tokens_after) if tokens_after else 1.0

        pack = ContextPack(
            pack_id=f"{run_id}:pack",
            run_id=run_id,
            lessons=kept_texts,
            tokens_before=tokens_before,
            tokens_after=tokens_after,
            compression_ratio=round(compression_ratio, 4),
            critical_lessons_retained=critical_lessons_retained,
            total_critical_lessons=total_critical_lessons,
            duplicate_events_removed=duplicate_events_removed,
            budget=budget,
            tokens_estimated=self._counter.estimated,
        )
        return CompactionResult(pack=pack, candidate_lessons=candidates)
