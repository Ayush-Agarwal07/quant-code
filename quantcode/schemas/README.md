# schemas/

**Status:** scaffold — not implemented.

## Purpose

The typed contracts every other module passes around. Pydantic v2 models (already
a dep). Schemas are the boundaries that keep the pipeline honest — e.g. browser
output becomes a `PriorArtTheme`, never a raw hypothesis.

## What to implement

Models implied by `docs/` (confirm exact fields with human before locking):

- `StrategySpec` — the YAML strategy contract (entry/exit/risk rules, features, ops).
- `QuantResearchPacket` — the full run record written to `research_runs/run_N.json`.
- `PriorArtTheme` — prior-art / mechanism evidence (also the browser output type).
- `FeasibilityReport` — DataFeasibilityAgent verdict (`testable_now` | `testable_with_proxy`
  | `requires_new_data_source` | `not_testable`).
- `Critique` — ResearchCriticAgent output.
- `ExperimentPlan` + `ExperimentRunResult` (`status="not_executed"`).
- `Lesson` (Tier 3) and `ContextPack` (compacted retrieval object).

## How it connects

Imported by `agents/`, `tools/`, `pipeline/`, `memory/`, `workspace/`. Changing a
schema ripples everywhere — treat field changes as a HITL checkpoint.

## Implementation instructions

1. Pydantic v2, `model_config = ConfigDict(extra="forbid")` so typos fail loudly.
2. `StrategySpec` must serialize cleanly to/from YAML (round-trip test).
3. Keep validation *rules* (supported features/operators, leakage) in `tools/`
   `StrategyValidatorTool` — schemas define shape, the tool enforces policy.

## ❓ Open questions (ask human)

- [ ] Exact `StrategySpec` field set + the supported features/operators allowlist
      (docs describe the gate, not the concrete list).
- [ ] Versioning: do artifacts carry a `schema_version` for replay across runs?
- [ ] Port the old `deprecated/quant_code/strategy_research/schemas.py` or write fresh?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before locking any schema that gets written to disk or Redis (artifacts become
      backwards-compat constraints): confirm field set with human.
