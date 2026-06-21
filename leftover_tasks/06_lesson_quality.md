# 06 — Tier-3 lesson quality

**Status:** DONE (2026-06-21, hardened). **Priority:** optional. **Effort:** XS if dedup is needed.

**What shipped:** shared lesson-quality constants in `quantcode/lesson_quality.py`, a Tier-3
signal floor in `MemoryCurator.promote()`, and explicit `dropped` accounting for low-signal
lessons. The compiler still proposes; the curator still disposes. Self-checks now cover both
`curate()` and direct `promote()` so generic `"N item(s)"` lessons stay out of Tier 3.

## Optional leftover

Cross-run dedup only: the same lesson re-learned each run can appear once per run in the
explorer. Leave it alone unless the demo view looks cluttered.

## Acceptance
No action unless repeated cross-run lessons visibly clutter the explorer.

## Refs
`quantcode/compaction/compiler.py`, `quantcode/memory/curator.py`,
`quantcode/pipeline/__init__.py` (`_summarize`), `quantcode/memory/tier3_semantic/README.md`.
