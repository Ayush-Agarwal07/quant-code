# 06 — Tier-3 lesson quality

**Status:** OPEN. **Priority:** ★ high. **Effort:** L–M.

## Why it matters
The Redis memory-explorer / `memory search` demo is only as good as the lessons it shows. Today
the critic-derived lesson is excellent (e.g. the `gap_1d` look-ahead / weak-proxy warning), but
some promoted lessons are generic (`"[StrategyWriterAgent] 3 item(s)"`) because they're
extracted from generic trace-step summaries. Junk lessons weaken the headline and (per the
Tier-3 README) "poison every future run."

## Current state
- `pipeline/_summarize` already produces rich text for the critic + feasibility steps; other
  steps fall back to `"N item(s)"`.
- The compiler extracts candidate lessons from "meaningful" events (failed/critic/feasibility)
  and promotes valid ones.

## Options
1. **Tighten extraction (recommended):** only treat critic + feasibility (and any failed) events
   as candidate lessons; drop generic step summaries. Fewer, higher-signal lessons. Touch:
   the compiler's `_is_meaningful_event` / candidate filter (and/or `MemoryCurator._valid`).
2. **Richer summaries for more steps:** give formalizer/writer/hypothesis steps lesson-worthy
   `output_summary` text (e.g. spec name + key rule + rationale) so their lessons are meaningful
   too. Touch: `pipeline/_summarize`.
3. **Lesson dedup/merge:** the curator currently has no dedup (noted ponytail). Add near-dup
   collapse so the explorer isn't cluttered (open question in tier3 README).

## Acceptance
`quantcode memory search "<query>"` and the dashboard memory-explorer show distinct,
human-readable, provenance-carrying lessons — no `"N item(s)"` noise.

## Refs
`quantcode/compaction/compiler.py`, `quantcode/memory/curator.py`,
`quantcode/pipeline/__init__.py` (`_summarize`), `quantcode/memory/tier3_semantic/README.md`.
