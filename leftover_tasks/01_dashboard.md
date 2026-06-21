# 01 — Dashboard / front end (D5)

**Status:** PARTIAL. **Priority:** P2. **Effort:** S.

## Why it matters
The frontend exists and covers the pitch surfaces, but repo docs and launch instructions are
still split between old scaffolding notes and the newer Next.js app.

## Current state
- `frontend/` has a read-only Next.js dashboard with `/memory`, `/compaction`, `/runs`, etc.
- `quantcode/dashboard/api.py` exists for the external API path.
- `quantcode/dashboard/README.md` and `panels/README.md` still describe a scaffold.
- No obvious `quantcode dashboard` command.
- Default local Next API reads workspace files; Redis semantic search is available through the
  external API/proxy path.

## Remaining steps
1. Update `quantcode/dashboard/README.md` and `panels/README.md` to point at `frontend/`.
2. Document the Redis-backed dashboard path clearly (`NEXT_PUBLIC_API_URL` / API server).
3. Optional: add a tiny `quantcode dashboard` launcher or print-only helper.

## Data sources (read-only — never mutate)
- `workspace/research_runs/run_*.json` → `QuantResearchPacket`
- `workspace/memory/*_pack.json` → `ContextPack` (compaction metrics)
- `workspace/reports/run_*.md`
- Redis Tier 2/3 via `quantcode.memory.Memory.connect()` (`episodic.list_episodes()`,
  `semantic.search()`), or the in-memory fallback.

## Panels (priority order, from dashboard/panels/README)
1. ★ Redis memory-explorer — Tier 2 episodes + Tier 3 lessons with scores/provenance
2. ★ Compaction before/after — tokens_before→after, ratio, criticals retained, dups removed
3. Follow-up run comparison — run 1 vs run 2, showing the retrieved lesson changing behavior
4. Agent timeline (from `packet.trace_events`)
5. Strategy YAML viewer
6. Critique view

## Acceptance
- Docs clearly explain the dashboard demo path, including how to see Redis-backed memory search.
- Optional CLI launch command exists if useful.

## Refs
`quantcode/dashboard/README.md`, `quantcode/dashboard/panels/README.md`,
`docs/system_design_diagram.md` (Dashboard Panels), `DECISIONS.md` D5.
