# memory/tier2_episodic/

**Status:** scaffold — not implemented. (Redis Tier 2 — Episodic Memory)

## Purpose

One durable record per research run/episode: objective, generated strategies,
critiques, failed feasibility assumptions, and provenance. The "what happened in
run N" record — richer than a lesson, narrower than the raw trace.

## What to implement

- Write an episode under `qc:episode:{run_id}` (no TTL — durable).
- Read an episode by `run_id`; list recent episodes (for the dashboard).

## How it connects

`MemoryCurator` writes here after compaction. The dashboard's follow-up comparison
panel reads two episodes to show learning between runs. Sits between the QuantResearchPacket
(full, in `workspace/`) and Tier 3 lessons (compact, reusable).

## Implementation instructions

1. Store a `schemas/`-typed episode (a projection of `QuantResearchPacket`, not the
   whole thing — keep it queryable).
2. Include provenance: which Tier 3 lessons were retrieved into this run, and which
   new lessons it produced.

## ❓ Open questions (ask human)

- [ ] Episode schema: what subset of the packet is stored here vs left in `workspace/`?
- [ ] Retention: keep all episodes forever, or cap/rotate?
- [ ] Is the episode `run_id` the same id as the workspace `run_N`?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before changing the episode schema once episodes exist (cross-run comparison
      depends on stable shape): confirm with human.
