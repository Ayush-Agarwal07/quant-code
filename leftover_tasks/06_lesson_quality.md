# 06 — Tier-3 lesson quality

**Status:** DONE (2026-06-20, option 1 — verified live on Redis). **Priority:** ★ high. **Effort:** L–M.

**What shipped:** a Tier-3 confidence floor (`_TIER3_MIN_CONFIDENCE = 0.5`) in
`MemoryCurator.promote()` — the single chokepoint every Tier-3 write funnels through
(the pipeline calls `promote()` directly, bypassing `curate()`/`_valid`). The compiler
already tags critic/feasibility/failed lessons 0.6 and generic step lessons 0.4, so the
floor promotes only high-signal lessons. Left the compiler "propose, don't judge" and the
compaction metrics/self-check untouched. Self-check added in `quantcode/memory/__main__.py`.
Verified live: `memory search` + the run-2 recall panel now show only `warning`/`data_constraint`
lessons — zero `"N item(s)"` noise. Promoted lessons/run dropped 9 → 2.

**Still open (option 3, optional):** cross-run dedup — the same lesson re-learned each run
appears once per run in the explorer (e.g. run_005 + run_006 identical critic lesson). Not
required for acceptance; collapse near-dups in the curator if the explorer looks cluttered.

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
