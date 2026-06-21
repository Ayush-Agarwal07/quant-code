# 09 — Commit the build

**Status:** OPEN. **Priority:** P3. **Effort:** XS.

## Why it matters
Recent commits exist on `main`, but the current P0/P1 cleanup is still uncommitted.

## Current state
- Recent commits exist (`feat: benchmarks`, frontend work, README update).
- Current working tree has focused P0/P1 code/doc edits; commit when ready.

## Steps
1. Sanity: `.venv/bin/ruff check quantcode/ tests/ && .venv/bin/mypy quantcode/ && .venv/bin/pytest -q`.
2. Stage + commit with a clear message.
3. Optionally open a PR via `gh`.

## Notes
- Only commit when you ask — this task documents it; I won't push without a go.
- Consider whether to commit a sample `workspace/` demo run for judges (currently gitignored,
  D6) — optional.

## Acceptance
The current working tree is clean and checks pass.
