# Leftover tasks

Current audit as of 2026-06-21. Core CLI, Redis, Browserbase, compaction, benchmark, and
frontend tracks are built enough for demo; this folder now tracks only what still needs a
human or small cleanup.

## Still open

| # | Task | Priority | What remains |
|---|------|----------|--------------|
| [01](01_dashboard.md) | Dashboard polish/docs | P2 | Frontend exists; leftover docs and launch path still need cleanup. |
| [09](09_commit_build.md) | Commit current work | P3 | Recent commits exist, but current P0/P1 edits are uncommitted. |

## Optional only

| # | Task | What remains |
|---|------|--------------|
| [06](06_lesson_quality.md) | Cross-run dedup if repeated lessons clutter the explorer. |
| [08](08_benchmarks.md) | Extra critic/hallucination/token-efficiency benchmarks if needed for pitch. |

## Done

| # | Task |
|---|------|
| [02](02_live_redis.md) | Live Redis smoke-test. |
| [04](04_live_browserbase.md) | Live Browserbase `research-url`. |
| [05](05_compaction_demo_polish.md) | Honest compaction ratio demo. |
| [07](07_fastembed_offline_readiness.md) | fastembed/tokenizer pre-warm. |
| [03](03_live_llm_claude.md) | Live OpenAI-compatible LLM smoke. |

**Out of scope:** real backtester (M4), data connectors (M5), paper trading (M6),
continuous watcher (M7). See [`../docs/future_milestones.md`](../docs/future_milestones.md).
