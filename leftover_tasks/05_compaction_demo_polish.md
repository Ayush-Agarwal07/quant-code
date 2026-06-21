# 05 — Compaction ratio demo (make the Token Company headline land, honestly)

**Status:** OPEN. **Priority:** ★ high. **Effort:** L–M.

## Why it matters
The Token Company track is judged on *measured* compression. A real 9-step run fits under the
1000-token budget, so the live ratio is ~1.0x — unimpressive, even though the compiler is
correct. We must show a compelling ratio WITHOUT faking numbers (inflated metrics sink
credibility on the track that's literally about tokens).

## Current state
- `ResearchTraceCompiler` is correct and measured (`tokens_estimated=False` via the bge
  tokenizer). Its own self-check shows real compression on a duplicate-heavy trace (~2.5x).
- The live pipeline trace is small → ratio ~1.0x.

## Options (pick one or combine — all honest)
1. **Live `--budget` knob (recommended, interactive):** `quantcode compact runs/latest --budget 50`
   — a judge picks a small budget and watches the real trace compress with measured metrics.
   Zero code; already works. Frame the demo around this.
2. **Realistic trace volume:** record each agent's full intermediate output in the trace
   (it IS the context an uncompacted agent would carry forward), so `tokens_before` reflects
   the real bloat the compiler removes. Honest framing of what compaction saves. Touch:
   `pipeline/_Stepper` summaries + the compiler's `_lesson_text`/token basis. Keep lessons
   readable (see task 06).
3. **Seeded representative trace:** ship a labeled long synthetic trace for the pitch number,
   CLEARLY marked as representative (not a live run). Lowest effort, weakest credibility.

## Integrity rules (do not break)
- Never inflate. Keep `tokens_estimated` honest (true tokenizer vs fallback estimate).
- Any number used in the pitch must be reproducible from a command on stage.

## Acceptance
A reproducible, MEASURED compression ratio > 1 shown live (via `--budget` and/or a realistic
trace), with the metric matching what `compact` prints.

## Refs
`quantcode/compaction/`, `quantcode/cli/__init__.py` (`compact`), `DECISIONS.md` D7,
`docs/architecture.md` (ResearchTrace Compiler).
