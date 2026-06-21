# 01 — Dashboard / front end (D5)

**Status:** OPEN (deferred by decision D5). **Priority:** ★ high. **Effort:** M–L.

## Why it matters
The CLI `demo` already proves everything, but the two sponsor pitch surfaces — the Redis
memory-explorer and the compaction before/after — are currently text-only. A read-only
visual viewer is build-priority #6 in the docs and the fastest way to make VC/founder judges
"get it." `dashboard/` and `dashboard/panels/` are scaffolded (READMEs only).

## Current state
- No `dashboard/` code. D5 was deliberately skipped to ship the core.
- All data the dashboard needs already exists as artifacts + Redis.

## Decide first
Stack (re-open D5): **static HTML export** (recommended — zero-server, stage-safe, no/low new
deps) vs `rich` TUI (zero deps, less visual) vs Streamlit (heavy dep + live server; the
"complex frontend" the docs warn against). Adding any frontend dep is a 🧑‍⚖️ HITL checkpoint
(dashboard/README).

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

## Steps
1. Re-confirm the stack (D5).
2. Build a loader that reads the artifacts once and passes data to panels (don't re-read per panel).
3. Implement panels 1 & 2 first (the pitch), then 3.
4. Expose as `quantcode dashboard` (renders/export) — keep it read-only by construction.
5. Drive it off a `quantcode demo` run (two comparable runs for panel 3).

## Acceptance
- A read-only view (HTML file or TUI) showing panels 1–3 from a real demo run, with no path
  that writes Redis or files. No new heavy deps without sign-off.

## Refs
`quantcode/dashboard/README.md`, `quantcode/dashboard/panels/README.md`,
`docs/system_design_diagram.md` (Dashboard Panels), `DECISIONS.md` D5.
