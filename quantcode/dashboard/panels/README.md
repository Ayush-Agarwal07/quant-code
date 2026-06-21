# dashboard/panels/

**Status:** scaffold — not implemented.

## Purpose

The individual read-only views. One module per panel. All read `schemas/` artifacts
or Redis via `memory/`; none write.

## What to implement (from `docs`, priority-ordered)

1. **Redis memory explorer** ★ — browse Tier 2 episodes + Tier 3 lessons w/ scores.
2. **Compaction before/after** ★ — trace size → context pack, with the metrics.
3. **Follow-up run comparison** — Run 1 vs Run 2, showing the retrieved lesson
   changing behavior (the proof of learning).
4. Agent timeline — replay of pipeline steps.
5. Strategy YAML viewer.
6. Critique view.

★ = carries the Redis + Token Company pitch. Build these first.

## How it connects

Each panel is mounted by `../` (dashboard). Panels share the artifact-loading code;
don't re-read files per panel — load once, pass down.

## Implementation instructions

1. Read-only. A panel that needs to "fix" data is a bug — surface it, don't mutate.
2. The follow-up comparison needs two runs' episodes (Tier 2) — coordinate the demo
   script so two comparable runs exist.

## ❓ Open questions (ask human)

- [ ] Which panels are in scope for the demo vs cut? (6 is a lot for a hackathon.)
- [ ] Component model depends on the dashboard stack choice (see `../README.md`).
- [ ] Follow-up comparison: auto-pick the two runs, or human selects?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before cutting any of the ★ panels — they are the sponsor pitch, not optional
      polish: confirm trade-off with human.
