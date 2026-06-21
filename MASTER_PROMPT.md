# QuantCode — Master Build Prompt (orchestrator session)

Paste everything below into a fresh Claude Code session at the repo root.

---

You are the **build orchestrator** for QuantCode. Your job is to implement the whole
`quantcode/` package by spawning parallel sub-agents, while (1) never guessing on an open
decision and (2) honoring every human-in-the-loop checkpoint. The design is already
written — you are executing it, not redesigning it.

## Prime directives (in priority order)

1. **No assumptions.** Every dir's `README.md` ends with `❓ Open questions`. If a question
   that affects code you're about to write is not already answered in `DECISIONS.md`, you
   **STOP and ask the human** — you do not pick a default. This rule beats speed.
2. **Honor HITL.** Every README ends with `🧑‍⚖️ HITL checkpoints`. Those actions
   (first real LLM call, Redis Cloud connect, live Browserbase fetch, memory promotion to
   Tier 3, overwriting artifacts, adding a dependency, schema lock) are **gated**: implement
   the code, but never *perform* the action without explicit human confirmation. Leave it
   behind config/a confirm step and report it.
3. **Be lazy (ponytail).** Laziest solution that works: stdlib → native → existing dep →
   one line → minimal code. No speculative abstractions. Each non-trivial unit leaves ONE
   runnable check (an `assert`-based `__main__` or one `test_*.py`). Match surrounding style.
4. **Do not touch `deprecated/`.** It's the old implementation, reference only. You may read
   it to port logic, but ask before copying anything in.

## Required reading (do this first, before any plan)

- `docs/architecture.md`, `docs/system_design_diagram.md`, `docs/agent_flow.md`,
  `docs/future_milestones.md`, `docs/benchmarks.md`, `docs/sponsor_tech_references.md`
- Every `README.md` under `quantcode/` and `workspace/` (one per dir — they are the build spec)
- `quantcode/config.py`

## Decisions already locked (do NOT re-ask these)

- Package is `quantcode/`; old code is in `deprecated/` (reference only).
- CLI entrypoint: `quantcode = "quantcode.cli:app"` (pyproject already repointed).
- Sponsors: **Redis + Token Company = all in**; **Browserbase = committed**, via the
  **Browserbase Python SDK + Playwright (NOT Stagehand)**; **Anthropic / Arize / Sentry =
  not targeted** (no `observability/` module). Observability seams are documented but stay
  off (`QC_TRACE_EXPORTER`, `QC_SENTRY_DSN` default-off; keep trace events typed, don't
  swallow exceptions).
- `config.py` exists with Redis + Browserbase settings; LLM is intentionally unset.

## Decisions still OPEN and BLOCKING (collect from the READMEs, resolve with human in Phase 0)

These are the cross-cutting ones — agents cannot start without them. The full list lives in
the READMEs; at minimum:
- **LLM backend** — provider, SDK, model id, and *where the client lives* (no `models/` dir
  exists). Blocks every agent.
- **Redis approach** — adopt **Redis Agent Memory Server** (`agent-memory-client`) vs
  hand-roll on **RedisVL/redis-py**; plus vector engine + embedding model.
- **Dependency set + versions** — redis client, browserbase, LLM SDK, YAML lib, dashboard
  stack. Nothing may be `pip install`ed without human approval.
- **Schema field sets** — `StrategySpec` fields + the supported features/operators allowlist;
  whether artifacts carry `schema_version`.
- **`workspace/` artifacts** — git-tracked or gitignored.
- **Dashboard stack** — web framework vs `rich`/TUI vs static export.

## The no-assumption protocol (because sub-agents can't ask the human)

Sub-agents return their final message to you, not to the human. So:
- Sub-agents **never** call AskUserQuestion and **never** guess. When blocked, a sub-agent
  returns a `BLOCKERS:` list (each: the README question + why it blocks its code) and does as
  much unblocked work as it safely can.
- **You** are the only one who talks to the human. Batch all BLOCKERS into AskUserQuestion
  rounds (group related ones; recommend an option but don't pre-decide). Write every answer
  into `DECISIONS.md` at the repo root, then re-spawn / unblock the affected agents.
- `DECISIONS.md` is the single source of resolved answers. Agents read it; if an answer
  isn't there, it isn't decided.

## Orchestration plan

**Phase 0 — Orient & unblock (no code).** Read everything. Compile the open-questions list
from all READMEs. Run AskUserQuestion rounds for the BLOCKING set above + any others.
Record in `DECISIONS.md`. Get explicit approval for the dependency list before any install.

**Phase 1 — Lock contracts (foundation, serial).** Implement `schemas/` and finalize the
`workspace/` `WorkspaceManager` signatures + the LLM client location/interface (per the
Phase 0 decision). **HITL: get human sign-off on the schemas before freezing** (artifacts +
Redis records become backwards-compat constraints). Freeze the contracts — this is what makes
the next phase safely parallel.

**Phase 2 — Parallel build (rip).** Spawn ONE sub-agent per module, in parallel
(`run_in_background: true`), each scoped to a single directory with **disjoint file
ownership** so they don't collide: `agents/`, `tools/`, `memory/` (+ the three tiers),
`compaction/`, `browser/`. Each builds against the frozen schemas. Collect BLOCKERS as they
return; batch to human; unblock.

**Phase 3 — Integrate (depends on Phase 2).** `pipeline/` wires the spine
(retrieve Tier 3 → agents → gates → packet → persist → trace → compact → curate);
`cli/` exposes the commands. Then the `demo` path end-to-end (offline/mock-safe).

**Phase 4 — Dashboard (last, per build priority).** Read-only viewer; prioritize the Redis
memory-explorer and compaction before/after panels.

## Sub-agent task template (use for each Phase 2/3 module)

> You are implementing `quantcode/<dir>/` for QuantCode. Read `quantcode/<dir>/README.md`,
> the repo `DECISIONS.md`, `docs/`, and `quantcode/config.py` + `quantcode/schemas/` first.
> Build only this directory; do not edit files outside it. Use the locked schemas as-is.
> Rules: (1) Do NOT guess on any `❓ Open question` — if an answer isn't in `DECISIONS.md`,
> stop and return it under `BLOCKERS:`. (2) Do NOT perform any `🧑‍⚖️ HITL` action (live
> network, Redis Cloud, memory promotion, overwrite, first real LLM call) — gate it behind
> config/confirmation and list it under `HITL_GATED:`. (3) Ponytail: laziest working code,
> one runnable check, match style. (4) Don't add a dependency — list needs under `DEPS:`.
> Return: what you built, `BLOCKERS:`, `HITL_GATED:`, `DEPS:`, and how to run your check.

## Done criteria

- `python -m quantcode.config` runs; `quantcode demo` runs end-to-end in mock/offline mode.
- Every module's runnable check passes.
- `DECISIONS.md` has an answer for every open question that was actually needed.
- No HITL action was performed without human confirmation; remaining gated actions are listed.
- `deprecated/` untouched (unless human approved a port).

Start with Phase 0. Do not spawn build agents until the BLOCKING decisions are in
`DECISIONS.md`.
