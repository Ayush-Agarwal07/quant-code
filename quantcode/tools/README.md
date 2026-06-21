# tools/

**Status:** scaffold — not implemented.

## Purpose

The **deterministic** half of the pipeline. No LLM. Tools enforce policy and produce
honest, repeatable results — the counterweight to the agents.

## What to implement

- `StrategyValidatorTool` — the validation gate. A formalized `StrategySpec` is safe
  to write as YAML only if: supported features only, supported operators only, entry
  rules exist, exit rules exist, risk rules exist, no future-return (leakage)
  features, no vague natural-language rules, no unsupported ranking feature.
- `ExperimentRunnerStub` — intentionally does NOT run a backtest. Returns:
  ```json
  {"status": "not_executed",
   "reason": "Backtesting is intentionally stubbed in this hackathon version.",
   "planned_metrics": ["Sharpe","max_drawdown","turnover","alpha_vs_benchmark"]}
  ```
  This honesty is an ethics asset — keep it explicit.

## How it connects

`pipeline/` calls `StrategyValidatorTool` after `StrategyFormalizerAgent` (gate
before `StrategyWriterAgent`) and `ExperimentRunnerStub` after `ExperimentPlannerAgent`.
Validation is separate from `DataFeasibilityAgent`: feasibility = is there data;
validation = is it deterministically executable.

## Implementation instructions

1. Pure functions / no I/O. Same input → same output, always.
2. `StrategyValidatorTool` returns structured pass/fail with reasons (a `schemas/`
   type), not a bare bool — the critic and dashboard need the reasons.
3. The supported-features/operators allowlist is the crux — see open question.
4. Self-check: a leaky spec (future-return feature) must fail; a clean spec must pass.

## ❓ Open questions (ask human)

- [ ] The concrete **supported features + operators allowlist** (docs describe the
      gate, not the list). The validator is meaningless without it.
- [ ] Reuse the old `deprecated/.../tools/` (validation, catalogs, mutation,
      templates) or rebuild? Which catalogs are in scope for the hackathon?
- [ ] Exact `planned_metrics` list for the stub.

## 🧑‍⚖️ HITL checkpoints

- [ ] Before finalizing the allowlist (it defines what strategies can ever exist):
      confirm with human.
- [ ] Do NOT let `ExperimentRunnerStub` ever imply real results — if anyone asks to
      make it "actually backtest," stop and confirm scope (it's a non-goal).
