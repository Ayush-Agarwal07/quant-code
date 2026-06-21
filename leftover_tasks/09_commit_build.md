# 09 — Commit the build

**Status:** OPEN (nothing committed). **Priority:** low. **Effort:** XS.

## Why it matters
The entire QuantCode build is uncommitted in the working tree. Judges browsing the repo (and
your own safety) want a clean commit history.

## Current state (uncommitted)
- **New:** the whole `quantcode/` package (48 .py files), `DECISIONS.md`,
  `redis_implementation.md`, `leftover_tasks/`.
- **Modified:** `pyproject.toml`, `.gitignore`, `.env.example`.
- `deprecated/` untouched; `workspace/` generated output is gitignored (only READMEs tracked).

## Steps
1. Branch off `main` (don't commit straight to main): `git checkout -b build/quantcode`.
2. Sanity: `.venv/bin/ruff check quantcode/ tests/ && .venv/bin/mypy quantcode/ && .venv/bin/pytest -q`.
3. Stage + commit with a clear message (end with the required `Co-Authored-By` trailer).
4. Optionally open a PR via `gh`.

## Notes
- Only commit when you ask — this task documents it; I won't push without a go.
- Consider whether to commit a sample `workspace/` demo run for judges (currently gitignored,
  D6) — optional.

## Acceptance
The build lives on a branch with a clean commit (and optionally a PR), checks green.
