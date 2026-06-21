# pipeline/

**Status:** scaffold — not implemented.

## Purpose

The orchestrator. Owns the spine: retrieve memory → run agents in order through the
two gates → assemble the `QuantResearchPacket` → persist → trace → compact → curate.
This is the only place that knows the full order; `cli/` just calls into it.

## What to implement

A `run_research(objective: str) -> QuantResearchPacket` entrypoint that:

1. Retrieves Tier 3 lessons (`memory/tier3_semantic`) and injects them as context.
2. Runs agents in order (see `../README.md` spine).
3. Applies the **feasibility gate** (only `testable_now` / `testable_with_proxy`
   advance; rejected/deferred hypotheses are kept in the packet, not dropped).
4. Applies the **validation gate** (`StrategyValidatorTool`) before writing YAML.
5. Runs `ExperimentPlanner` → `ExperimentRunnerStub`.
6. Assembles `QuantResearchPacket`; persists via `workspace/`.
7. Writes raw trace → Redis Tier 1; triggers `compaction/` → `MemoryCurator` →
   Tier 2 + Tier 3 + context pack.

Plus a `run_from_url(url)` variant that injects `browser/` `PriorArtTheme`s first.

## How it connects

The hub: imports `agents/`, `tools/`, `memory/`, `compaction/`, `workspace/`,
`browser/`, `schemas/`. Keep orchestration logic here and nowhere else.

## Implementation instructions

1. Record a trace event per step (id, inputs ref, output ref, timing) for Tier 1 and
   the dashboard timeline. Keep events **structured/typed** (a `schemas/` type), not
   free-text logs — and route export through a `QC_TRACE_EXPORTER` config (`none`
   default; only sink today is Redis Tier 1). This keeps the seam open to bolt on
   Arize/OTel later as a single exporter, with no pipeline changes. Don't flatten
   events to log strings — that's the one thing that makes observability expensive later.
2. Memory is compacted **before** promotion — never promote raw Tier 1 to Tier 2/3.
3. Make agent steps swappable with mocks so `demo` runs offline.
4. Handle failure at **one clean error boundary** (CLI / pipeline top level); don't
   swallow exceptions mid-pipeline (`except: pass`). This keeps error monitoring a
   later one-liner — Sentry auto-captures unhandled exceptions, so the only seam to
   preserve is "let errors reach the boundary." Off by default (e.g. `QC_SENTRY_DSN`
   unset); no per-step wiring needed.

## ❓ Open questions (ask human)

- [ ] Failure policy: if one agent fails mid-run, abort or write a partial packet?
- [ ] Is the run synchronous (CLI blocks) or does the dashboard stream live events?
- [ ] Trace event schema + where it's defined (`schemas/`?).
- [ ] How many strategies per run (single best vs all that pass the gates)?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before writing artifacts + promoting memory at the end of a run: this is the
      moment results become durable — surface a summary for human review on real runs.
- [ ] Before the `run_from_url` browser step (live fetch + credits): confirm URL.
