# workspace/ (runtime artifacts)

**Status:** scaffold — empty. This is generated output, not source code.

## Purpose

The artifact root — the "files" QuantCode reads and writes, the thing that makes it
feel like a local coding agent. All writes go through `quantcode/workspace/`
`WorkspaceManager`; nothing else should touch these dirs directly.

## Layout

| Dir | Holds | Format |
|---|---|---|
| `strategies/` | `StrategySpec` files | YAML |
| `research_runs/` | full `QuantResearchPacket` per run | JSON (`run_N.json`) |
| `reports/` | judge/devpost summaries | Markdown (`run_N.md`) |
| `memory/` | compacted context packs w/ provenance | JSON (`context_pack_N.json`) |

## How it connects

Written by `pipeline/` via `WorkspaceManager`; read by `cli inspect` and the
read-only `dashboard/`. Redis holds the *memory* tiers; this holds the *artifacts*.

## ❓ Open questions (ask human)

- [ ] **Git-tracked or gitignored?** These are runtime outputs — do generated
      `run_N.json` / YAML belong in version control, or should `workspace/*` (except
      these READMEs) go in `.gitignore`? Not decided.
- [ ] Run-numbering scheme + how `inspect runs/latest` resolves "latest".

## 🧑‍⚖️ HITL checkpoints

- [ ] Before committing generated artifacts to git, or before bulk-deleting the
      workspace: confirm with human.
