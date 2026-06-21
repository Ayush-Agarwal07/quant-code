# cli/

**Status:** scaffold — not implemented.

## Purpose

The product surface. QuantCode is CLI-first; everything a judge does, they do
here. Thin layer: parse args, call `pipeline/` and `workspace/`, render with `rich`.

## What to implement

Commands (from `docs/architecture.md` "CLI Surface"):

- `init` — create the `workspace/` artifact dirs, write a starter `.env`.
- `research "<objective>"` — run the full pipeline; write run + report.
- `demo` — canned end-to-end run for judges.
- `inspect runs/latest` — print a run's artifacts.
- `compact runs/latest --budget 1000` — run the ResearchTrace Compiler on a trace.
- `memory search "<query>"` — query Tier 3 lessons (vector search).
- `research-url <url>` — Browserbase path into `PriorArtTheme`.

## How it connects

`cli/` → `pipeline/` (orchestration) and `workspace/` (I/O). It should hold **no**
business logic — if logic creeps in here, it belongs in `pipeline/`.

## Implementation instructions

1. Use `typer` (already a dep). One command per pipeline entrypoint.
2. Rendering only via `rich`. No agent/Redis calls directly from command bodies —
   go through `pipeline/` / `memory/`.
3. `demo` must be deterministic enough to run on stage without network surprises.

## ❓ Open questions (ask human)

- [ ] Entrypoint name: `quantcode` vs `qf`? Repoint `pyproject.toml [project.scripts]`.
- [ ] Does `demo` require live Redis + LLM, or a recorded/offline mode for stage safety?
- [ ] `inspect runs/latest` — is `latest` a symlink, a pointer file, or newest-by-mtime?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before `init` writes/overwrites `.env` or non-empty workspace dirs: confirm.
- [ ] Before `research-url` hits a live page (Browserbase credits + scraping a real
      site): confirm the URL with the human.
