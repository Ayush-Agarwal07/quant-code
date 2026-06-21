# workspace/research_runs/

**Status:** scaffold — empty (generated output).

## Holds

The full `QuantResearchPacket` per run as **JSON** (`run_N.json`) — the complete,
honest record: objective, prior art, hypotheses, feasibility verdicts (including
rejected/deferred), strategies, critiques, experiment plan, and the
`ExperimentRunnerStub` result (`status="not_executed"`).

## Format

Defined by `quantcode/schemas/` `QuantResearchPacket`. This is the source of truth a
Tier 2 episode is projected from — keep it complete even when Tier 2 stores a subset.

## ❓ Open questions (ask human)

- [ ] `run_N` numbering + `latest` resolution (shared with `cli inspect`).
- [ ] Include a `schema_version` for cross-run replay?
- [ ] Tracked in git or runtime-only?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before overwriting/deleting a prior run JSON (it's the record cross-run
      comparison depends on): confirm.
