# dashboard/

**Status:** scaffold — not implemented.

## Purpose

A **read-only**, judge-facing viewer over the workspace artifacts and Redis memory.
The CLI + workspace are the product; this exists so judges *get it* fast. It must
not mutate state. It should **replay** a run, not just show final output.

## What to implement

A read-only app that loads `workspace/` artifacts + Redis, with `panels/` (see
`panels/README.md`). Two panels carry the pitch: the **Redis memory explorer** and
the **compaction before/after** — prioritize those.

## How it connects

Reads `workspace/research_runs`, `reports`, `memory/` and Redis Tier 2/3 via the
`memory/` module. No writes. No agent calls.

## Implementation instructions

1. Read-only by construction — no endpoint/handler that writes Redis or files.
2. Drive it off the same `schemas/` artifacts the CLI produces (no separate format).
3. Keep it minimal — "minimal read-only dashboard" is build-priority #6, after the
   second-run memory demo. Don't gold-plate.

## ❓ Open questions (ask human)

- [ ] **Stack** — web (which framework) vs a `rich`/TUI viewer vs static HTML export?
      Nothing chosen; this is the biggest decision here.
- [ ] Live updates during a run, or load-after-the-fact only?
- [ ] Does it read Redis directly or only the workspace artifact files?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before adding a frontend framework / new heavy deps: confirm with human
      (docs warn against a "complex frontend" — it's a cut candidate if time is tight).
