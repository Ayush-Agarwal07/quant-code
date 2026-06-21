# workspace/strategies/

**Status:** scaffold — empty (generated output).

## Holds

Validated `StrategySpec` files as **YAML**, one per strategy
(e.g. `earnings_gap_volume_drift.yaml`). Written by `StrategyWriterAgent` via
`WorkspaceManager.write_strategy_yaml`, only after `StrategyValidatorTool` passes.

## Format

Defined by `quantcode/schemas/` `StrategySpec` — entry/exit/risk rules, features,
operators. Must round-trip YAML↔model. No leakage (future-return) features; no
vague natural-language rules (the validator enforces this).

## ❓ Open questions (ask human)

- [ ] Filename scheme (slug from objective? `run_N_strategy_M`?).
- [ ] Overwrite vs version when a similar strategy already exists.

## 🧑‍⚖️ HITL checkpoints

- [ ] Before overwriting an existing strategy file: confirm.
