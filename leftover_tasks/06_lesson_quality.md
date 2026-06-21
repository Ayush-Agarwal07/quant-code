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

## ⚠️ REVIEW REQUESTED (2026-06-20)
Flagged by SS — option-1 shipped but likely has improvements. For a reviewer to weigh:
1. **Magic-number coupling.** The `0.5` floor only works because the compiler hardcodes
   `0.6`/`0.4` (`compaction/compiler.py:130`). Two unrelated files silently agree on a
   number. Consider a shared constant or an explicit `is_critical`/signal flag on `Lesson`
   instead of inferring signal from `confidence`.
2. **Silent drop / accounting leak.** `promote()` discards low-signal lessons without
   recording them anywhere; `curate()`'s `rejected` list won't include them (it only sees
   `_valid` text/provenance failures). A reviewer may want dropped-as-low-signal surfaced.
3. **Drop vs enrich (option 2).** We *dropped* generic steps rather than giving
   formalizer/writer/hypothesis steps lesson-worthy summaries. Enriching could turn them
   into real lessons instead of nothing — more signal, more work. Ties into task 05.
4. **`_valid` is now partly dead for the pipeline path** (pipeline calls `promote()`
   directly, never `curate()`). Worth reconciling the two promotion entry points.

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
