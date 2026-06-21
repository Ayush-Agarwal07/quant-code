# Leftover tasks

Everything still open after the core QuantCode build (Phases 0–3 complete, all green: ruff +
mypy + 11 self-checks + `quantcode demo` offline). One file per task. Status as of 2026-06-20.

The core product is done and demoable offline. These are deferrals, live-path smoke tests,
demo polish, and housekeeping — none block the offline CLI demo.

| # | Task | Priority | Effort | Why it matters |
|---|------|----------|--------|----------------|
| [01](01_dashboard.md) | Dashboard / front end (D5) | ★ high | M–L | Your 2 pitch panels are CLI-only today |
| [05](05_compaction_demo_polish.md) | Compaction ratio demo (honest) | ★ high | L–M | Token Company headline shows ~1.0x on a small run |
| [06](06_lesson_quality.md) | Tier-3 lesson quality | ★ high | L–M | Some lessons are generic; weakens the Redis memory demo |
| [02](02_live_redis.md) | Live Redis smoke-test (Docker/brew/Cloud) | high | L | Headline track path unexercised live |
| [03](03_live_llm_claude.md) | Live LLM (Claude) path | med | L–M | Real provider never called; first-call is HITL |
| [04](04_live_browserbase.md) | Live Browserbase `research-url` | med | M | Live fetch never run; needs deps + keys |
| [07](07_fastembed_offline_readiness.md) | fastembed/tokenizer pre-warm | low | XS | Stage offline-readiness for real embeddings |
| [08](08_benchmarks.md) | Benchmarks (compaction/memory/critic) | low | M | Metrics strengthen the pitch |
| [09](09_commit_build.md) | Commit the build | low | XS | Nothing committed yet |

**Out of scope (not "leftover" — explicitly deferred milestones):** real backtester (M4),
data connectors (M5), paper trading (M6), continuous watcher (M7). See
[`../docs/future_milestones.md`](../docs/future_milestones.md). `ExperimentRunnerStub` stays
`not_executed` until M4.

**Suggested order for judging impact:** 01 → 05 → 06 → 02 → 03 → 04.
