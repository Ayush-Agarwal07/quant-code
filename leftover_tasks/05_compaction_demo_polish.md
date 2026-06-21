# 05 — Compaction ratio demo (make the Token Company headline land, honestly)

**Status:** DONE (2026-06-20, options 1+2 — verified live & MEASURED). **Priority:** ★ high. **Effort:** L–M.

**What shipped — EXTRACTIVE compaction (defensible, matches The Token Company's definition):**
1. Each agent step records its FULL output as a valid JSON array (`TraceEvent.output_detail`,
   `pipeline/_detail`) — the real context an uncompacted agent carries forward.
2. The compiler measures `tokens_before` against that verbose basis (`compiler._raw_text`).
3. Each lesson is now EXTRACTED from `output_detail` at compile time (`compiler._extract_lesson`
   / `_salient_spans`): it DELETES low-signal tokens (JSON keys/braces, boilerplate+provenance
   fields, duplicates) and keeps the decision-bearing spans VERBATIM (lossless on content — no
   per-lesson truncation). Short scalar values keep their field name for context
   (`verdict: accept_for_backtest`, `economic_rationale_strength: strong`); long free-text stays
   bare. Every content token is a source token — deletion-based, no generated text.

This matches The Token Company (thetokencompany.ai, YC): *LLM input compression via a fast
deterministic pass that removes low-signal tokens and keeps the salient slice verbatim — not
an abstractive/generative summary*. Compression now happens at two extractive levels: within an
event (verbose output → salient verbatim spans) and across events (dedup + budgeted selection,
criticals first).

**Meaning preservation (the part that matters):** extraction is LOSSLESS on content — it
deletes scaffolding/noise/dupes but never truncates decision content. An earlier version had a
64-tok/lesson cap that dropped high-signal spans (measured: only **38–50% recall** of must-retain
points — it was dropping the headline gap_1d leakage-risk lesson). Cap removed; pack size is now
bounded by across-event budgeting (drops whole low-priority lessons, criticals last). Re-measured:
**100% recall** (8/8) of verdicts + leakage risks + major issues on the live critic/feasibility
lessons. Self-check asserts must-retain decision points survive compaction.

Live demo: **184→184 (1.00x) → 6453→998 (6.47x), MEASURED** (real bge-small tokenizer, after
`warm_tokenizer_cache()` — task 07), criticals **2/2 kept whole** (full meaning recall at the
default budget). The ratio is lower than earlier truncating/abstractive versions (11.84x / ~25x)
ON PURPOSE — those lost meaning. 6.47x with verified 100% recall is the honest, defensible number.

**Budget is a HARD ceiling** (`compiler._fit_to_budget`): `tokens_after` never exceeds `budget`
at any level, and the budget knob varies continuously (no flatline). Under pressure it drops
whole low-priority lessons first; the single boundary lesson that can't fit whole is kept as a
verbatim, **ellipsis-flagged** head — never overflowed, never silently dropped. Criticals
retained degrades honestly (2/2 → 1/2 → 0/2 as budget tightens). Self-check asserts the ceiling
holds and truncation is flagged at a tight budget.

**Integrity / defensibility:** verbatim fidelity AND meaning recall asserted in the self-check;
deterministic, no LLM; every number reproducible from `quantcode compact runs/latest --budget N`;
estimate-vs-measured flagged. **Track note:** the official Token Company criteria is "Depth of
research, ingenuity, creativity" — not a hard ratio — so a defensible, meaning-preserving
algorithm matters more than a big number.

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
