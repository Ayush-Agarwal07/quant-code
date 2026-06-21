"""ResearchTrace Compiler — the Token-Company centerpiece.

Turns a long, noisy Tier 1 trace (`list[TraceEvent]`) into a compact `ContextPack` within
a token budget, and PROPOSES candidate lessons. It never promotes them — `MemoryCurator`
alone promotes (architecture: "the memory curator should not promote directly from noisy
raw traces"). This module deliberately does not import or call memory.

Compaction is EXTRACTIVE / deletion-based, matching The Token Company's definition of
compaction (fast deterministic pass that removes low-signal tokens and keeps the salient
slice VERBATIM — not a generative summary). Every token in a compacted lesson is a literal
substring of the source step output; nothing is rewritten or invented.

Pipeline (deterministic first, honest, cheap):

1. dedupe near-duplicate trace events            -> `duplicate_events_removed`
2. EXTRACT each meaningful event's verbose output (`output_detail`) into a lesson by
   DELETING low-signal tokens (JSON scaffolding/keys, boilerplate+provenance fields,
   duplicates) and keeping EVERY decision-bearing span verbatim — LOSSLESS on content
3. mark which candidates are CRITICAL            -> `total_critical_lessons`
4. select lessons to the token `budget` (a HARD ceiling), criticals first; the one boundary
   lesson that doesn't fit is kept as a verbatim, ellipsis-flagged head -> `tokens_after`
   (always <= budget), `critical_lessons_retained` (criticals kept WHOLE)

So compression happens at two extractive levels: within an event (delete scaffolding/noise,
keep content verbatim — meaning preserved, nothing truncated) and across events (dedup +
budgeted selection that drops whole low-priority lessons, never the inside of a kept one).
`tokens_before` measures the full uncompacted outputs; `tokens_after` the kept lessons — both
with the D7 subword tokenizer (real counts offline; labeled estimate only as a fallback).

Critical lesson — EXPLICIT, deterministic definition (ponytail oracle for the X/N metric):
a candidate lesson is CRITICAL iff it was derived from a meaningful *failure/critique*
event, i.e. an event with `status == "failed"` OR an `agent_name` that contains "critic" or
"feasibility" (case-insensitive). `critical_lessons_retained` = how many of those critical
candidates survived into the pack within budget. Critical candidates are kept FIRST so the
metric measures real prioritisation, not luck.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from quantcode.compaction.tokenizer import TokenCounter, get_token_counter
from quantcode.schemas import ContextPack, Lesson, TraceEvent

# agent_name substrings that mark an event as a critical decision point (D-oracle above).
_CRITICAL_AGENT_MARKERS = ("critic", "feasibility")

# JSON keys that are structural scaffolding / provenance, not decision content -> deleted
# during extraction. We keep the VALUES of everything else (verdicts, risks, constraints…).
_BOILERPLATE_KEYS = frozenset(
    {
        "schema_version", "created_at", "id", "pack_id", "run_id", "lesson_id",
        "source_run_id", "source_critique", "step", "status", "confidence", "kind",
    }
)

# Scalar values at/under this length keep their field name for context (e.g. "verdict: revise"),
# so a bare token isn't ambiguous; longer values are self-contained free text, kept as-is.
_SHORT_SCALAR_CHARS = 32


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


def _walk_pairs(obj: Any, key: str | None = None) -> list[tuple[str | None, str]]:
    """Collect (field_name, value) leaf pairs from parsed JSON output, VERBATIM, depth-first.
    Drops dict keys as structure but remembers them so short scalars can keep their context;
    skips boilerplate/provenance fields, booleans and nulls. List items inherit their key."""
    out: list[tuple[str | None, str]] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k not in _BOILERPLATE_KEYS:
                out.extend(_walk_pairs(v, k))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_walk_pairs(v, key))
    elif isinstance(obj, str):
        out.append((key, obj))
    elif isinstance(obj, int | float) and not isinstance(obj, bool):
        out.append((key, str(obj)))
    return out


def _label(key: str | None, value: str) -> str:
    """Keep the field name on SHORT scalar values so a bare token isn't ambiguous
    (`edge_strength: strong`); long free-text values are self-contained, kept as-is. Both
    key and value are verbatim source tokens; ': ' is only a presentational separator."""
    if key and len(value) <= _SHORT_SCALAR_CHARS:
        return f"{key}: {value}"
    return value


def _salient_spans(raw: str) -> list[str]:
    """Extractive selection: the high-signal spans of a step output, VERBATIM. Parses JSON
    output and keeps its content-bearing values (scaffolding deleted; short scalars labeled
    with their field name); for plain text, keeps non-trivial clauses. Deduplicated, source
    order preserved. No text is generated — only source tokens selected and joined."""
    try:
        spans = [_label(k, v) for k, v in _walk_pairs(json.loads(raw))]
    except (json.JSONDecodeError, TypeError):
        spans = re.split(r"[.;\n|]+", raw)
    seen: set[str] = set()
    out: list[str] = []
    for s in spans:
        s = s.strip()
        if len(s) > 2 and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _extract_lesson(event: TraceEvent) -> str:
    """Compact the FULL step output into a lesson by EXTRACTION (deletion-based, verbatim) —
    The Token Company's definition of compaction: delete low-signal tokens (JSON scaffolding,
    boilerplate fields, duplicates) and keep EVERY decision-bearing span exactly as written.
    LOSSLESS on content — meaning is preserved (no truncation); only structure/noise is
    removed. Pack size is bounded by across-event budgeting, not by truncating a lesson."""
    raw = (
        event.error or event.output_detail or event.output_summary or event.input_summary
    ).strip()
    spans = _salient_spans(raw)
    body = " · ".join(spans) if spans else "(no detail)"
    return f"[{event.agent_name}] {body}"


def _fit_to_budget(text: str, max_tokens: int, counter: TokenCounter) -> str:
    """Trim trailing words until `text` fits `max_tokens`, flagging the loss with an ellipsis.
    The kept word-prefix is still verbatim. Only used for the ONE boundary lesson that exceeds
    the remaining budget (i.e. the caller asked for fewer tokens than the lesson holds) — so the
    `budget` stays a hard ceiling instead of being silently overshot, without truncating the
    lessons that DO fit. ponytail: word-granular trim, no token-slicing API needed."""
    if counter.count(text) <= max_tokens:
        return text
    words = text.split()
    while words:
        head = " ".join(words).rstrip(" ·")
        if counter.count(f"{head} …") <= max_tokens:
            return f"{head} …"
        words.pop()
    return "…"


def _raw_text(event: TraceEvent) -> str:
    """The uncompacted context an agent would carry forward: the FULL step output
    (`output_detail`), falling back to the one-line summary when no detail was recorded.
    This is the honest `tokens_before` basis — what compaction actually distills away."""
    body = (
        event.error or event.output_detail or event.output_summary or event.input_summary
    ).strip()
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
        # tokens_before: the full raw trace (verbose step outputs) as the agent would
        # otherwise carry it forward — the real cost compaction removes.
        raw_texts = [_raw_text(e) for e in events]
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

        # 2. EXTRACT a verbatim, scaffolding-stripped lesson from each meaningful event's
        #    full output (deletion-based compaction), capped per lesson.
        candidates: list[Lesson] = []
        critical_flags: list[bool] = []
        for i, event in enumerate(e for e in deduped if _is_meaningful_event(e)):
            critical = _is_critical_event(event)
            candidates.append(
                Lesson(
                    lesson_id=f"{run_id}:cand:{i}",
                    text=_extract_lesson(event),
                    kind=_lesson_kind(event),  # type: ignore[arg-type]  # values match LessonKind
                    source_run_id=run_id,
                    source_critique=event.error if event.status == "failed" else None,
                    confidence=0.6 if critical else 0.4,
                )
            )
            critical_flags.append(critical)
        total_critical_lessons = sum(critical_flags)

        # 3. select to budget (a HARD ceiling): critical lessons first, whole, greedily by token
        #    cost. The one boundary lesson that doesn't fit is kept as a verbatim, ellipsis-
        #    flagged head (never overflows, never silently dropped). `critical_lessons_retained`
        #    counts criticals kept WHOLE, so it's a real measure of prioritisation under pressure.
        order = sorted(
            range(len(candidates)),
            key=lambda i: (not critical_flags[i], i),  # criticals (False sorts first), stable
        )
        kept_texts: list[str] = []
        kept_indices: list[int] = []
        used = 0
        for i in order:
            remaining = budget - used
            if remaining <= 0:
                break
            text = candidates[i].text
            cost = self._counter.count(text)
            if cost <= remaining:
                kept_texts.append(text)
                kept_indices.append(i)  # kept WHOLE -> counts toward criticals retained
                used += cost
            else:
                # budget < lesson: keep a verbatim, ellipsis-flagged head and stop. A truncated
                # lesson is intentionally NOT added to kept_indices (not retained whole).
                head = _fit_to_budget(text, remaining, self._counter)
                kept_texts.append(head)
                used += self._counter.count(head)
                break

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
