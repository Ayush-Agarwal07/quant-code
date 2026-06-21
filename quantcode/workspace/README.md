# workspace/ (module)

**Status:** scaffold — not implemented.

> Not to be confused with the runtime `../../workspace/` artifact directory. This
> module *writes to* that directory.

## Purpose

`WorkspaceManager` — the single owner of all file I/O. This is what makes QuantCode
feel like a local coding agent over files, not a chat pipeline. Nothing else in the
codebase should open files in the workspace directly.

## What to implement

`WorkspaceManager` with exactly these methods (from `docs/architecture.md`):

- `write_strategy_yaml` → `workspace/strategies/*.yaml`
- `write_run_json` → `workspace/research_runs/run_N.json`
- `write_markdown_report` → `workspace/reports/run_N.md`
- `write_context_pack` → `workspace/memory/context_pack_N.json`
- `read_existing_strategies` → load prior `StrategySpec`s
- `list_workspace` → inventory for the CLI / dashboard

## How it connects

`cli/` and `pipeline/` call it. Reads `config.workspace_dir`. Serializes
`schemas/` models. Run numbering (`run_N`) is owned here — be consistent with how
`cli inspect runs/latest` resolves "latest".

## Implementation instructions

1. Resolve all paths under `config.workspace_dir`; never hard-code `workspace/`.
2. Atomic writes (temp file + rename) so a crash never leaves half a run JSON.
3. YAML via a real lib (see open question on dependency).
4. One self-check: write→read round-trip a `StrategySpec` and assert equality.

## ❓ Open questions (ask human)

- [ ] Run numbering scheme: zero-padded `run_001`? monotonic counter where stored?
      collision behavior if a number exists?
- [ ] Overwrite policy: refuse, version, or replace existing artifacts?
- [ ] YAML library choice (`pyyaml` vs `ruamel.yaml`) — neither is a current dep.
- [ ] Is `workspace/` git-tracked output or gitignored runtime data? (Affects whether
      to add it to `.gitignore`.)

## 🧑‍⚖️ HITL checkpoints

- [ ] Before overwriting or deleting any existing artifact: confirm with human.
