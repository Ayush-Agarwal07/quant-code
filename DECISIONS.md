# DECISIONS.md — QuantCode build

Single source of resolved answers for the orchestrated build (see `MASTER_PROMPT.md`).
Sub-agents read this; if an answer isn't here, it isn't decided. Started 2026-06-20.

## Locked decisions

### D1 — LLM backend + where the client lives  (2026-06-20)
Port the `deprecated/models/` `ModelRouter` into a **new `quantcode/llm/`** module, and
**add the Anthropic Claude SDK as a new provider option** in the router (alongside the
ported `mock` / `openai_compatible` / `ollama`).
- Keep the `LLMClient` protocol (`generate_structured(prompt, schema, context)`).
- `demo` default provider = **mock** (deterministic fixtures, offline, stage-safe).
- Real Claude/openai/ollama calls live behind `config` (`QC_LLM_PROVIDER` / `QC_LLM_MODEL`).
- 🧑‍⚖️ HITL: the **first real (non-mock) LLM call** is gated — confirm provider/model + cost.
- DEP (pending install approval): `anthropic` SDK (only needed for the real Claude path).

### D2 — Redis storage approach  (2026-06-20)
**Option A: hand-roll on `redis-py` + RediSearch** (NOT the Agent Memory Server).
- Implement the exact `qc:` 3-tier key schema + a real `FT.CREATE` vector index over Tier 3.
- Real path **targets Redis Cloud** (the "Iris" platform; prize includes Redis Cloud credits)
  — captures the "leveraging Redis AI tools" + sophisticated-engineering rubric signals.
- **In-memory fallback** (dict + brute-force cosine) so `demo` runs with **no server**.
- 🧑‍⚖️ HITL: connecting to **Redis Cloud / any non-local instance** is gated (credits, shared
  state); any flush/bulk-delete is gated.
- We keep our **own ResearchTrace Compiler** regardless (Token Company differentiator).
- DEP (pending install approval): `redis`.
- Rationale: per the Hacker Guide Redis rubric, hand-rolling scores higher on "Technical
  Implementation (sophistication, correctness, architecture)"; "like Redis Iris" is an
  example not a requirement; Redis Cloud target captures the branded-platform signal.

### D3 — Embedding model for Tier 3 vector search  (2026-06-20)
**`fastembed` (BAAI/bge-small-en, 384-dim)** to generate lesson vectors, with a
**deterministic hash-embedding fallback** if the model isn't present (so `demo` never breaks).
- We generate vectors; Redis Search just stores/indexes them (`FT.CREATE … VECTOR … DIM 384`).
- Offline after a one-time model download; works for both `demo` and the Redis Cloud path.
- Self-check (tier3): store two lessons, query a paraphrase of one, assert it ranks first.
- DEP (pending install approval): `fastembed`.

### D4 — Reuse vs rebuild from `deprecated/`  (2026-06-20)
**Port schemas only; rebuild tools + agents fresh.**
- ✅ Approved to copy: `deprecated/strategy_research/schemas.py` → `quantcode/schemas/`,
  adapting imports/naming. (This is the granted HITL approval to copy from `deprecated/`.)
- ❌ NOT copied (rebuild fresh, may *read* deprecated as reference only): the validator +
  leakage tools, the feature/data catalogs, all agents, and the **mock fixtures** (the
  ported `MockLLMClient` class from D1 stays, but its returned fixture *content* is rebuilt
  to match the fresh agents/schemas).
- Phase 1 reconciles deprecated schema names with `docs/` names and ADDS the missing
  schemas: `Lesson` (Tier 3), `ContextPack`, and the typed `TraceEvent`. Field set still
  gets human sign-off before freeze (schemas/ HITL).

### D5 — Dashboard stack  (DEFERRED, 2026-06-20)
Decision postponed until the rest of the stack is built (it's build-priority #6, cut-if-tight).
Re-ask after Phase 3. Until then, agents do NOT build `dashboard/` and add no dashboard deps.

### D6 — Minor knobs (ponytail defaults, human-delegated 2026-06-20)
Human authorized me to pick sensible defaults and record them here; override any at will.
- **schema_version**: YES — every artifact written to disk/Redis carries `schema_version` (start `"1"`).
- **workspace/ git-tracking**: gitignore generated output (`workspace/**` except `README.md`s);
  keep the dir skeleton + READMEs tracked. `demo` regenerates artifacts.
- **run numbering**: zero-padded `run_NNN` (e.g. `run_001`); monotonic, owned by `WorkspaceManager`.
- **Tier1 TTL**: 3600s (from `config.tier1_ttl_seconds`).
- **retrieval k**: 5 lessons injected per run (no hard relevance threshold for v1).
- **overwrite policy**: refuse-then-version — never silently overwrite an existing artifact;
  any true overwrite/delete is HITL-gated.
- **strategies per run**: write ALL specs that pass both gates (not just a single best).
- **failure policy**: on mid-run agent failure, write a PARTIAL packet (record the failed
  step in the trace) rather than abort — one clean error boundary at the pipeline/CLI top.
- **`latest` resolution**: newest-by-mtime (no symlink/pointer file).
- **prompts location**: per-agent (prompt lives next to its agent), not one shared `prompts.py`.
- **MemoryCurator placement**: lives in `memory/` (it validates + promotes Tier 2/3); the
  `agents/` pipeline calls into it. (Resolves the agents/ vs memory/ straddle.)
- **trace events**: typed `TraceEvent` schema (not free-text); export behind `QC_TRACE_EXPORTER`
  (default `none`, only sink = Redis Tier 1). Don't swallow exceptions mid-pipeline.
- **YAML lib**: `pyyaml` (round-trips a StrategySpec dict cleanly; `ruamel` not needed).

### D7 — Compaction token counting  (2026-06-20)
Use a **real subword tokenizer** via the `tokenizers` lib (the BAAI/bge-small tokenizer
already installed transitively by `fastembed`) for reproducible **offline** measured
counts; set `ContextPack.tokens_estimated = False`. NEVER a bare word count for the
Token-Company headline metric. On the anthropic real path, may optionally cross-check
with Anthropic token counting. No new dep (tokenizers already present).

### D8 — StrategyValidator allowlist  (signed off 2026-06-20)
Locked, used by BOTH `tools/` (validator + feature catalog) and `agents/` (fixtures must
use only these so the demo passes the gate):
- **Features (18):** close, volume, return_1d, return_5d, return_20d, return_60d, gap_1d,
  sma_20, sma_50, sma_200, rsi_14, realized_vol_20d, realized_vol_60d, atr_14,
  volume_zscore, sector_relative_return_20d, spy_relative_return_20d, holding_days
- **Operators (7):** `>  <  >=  <=  ==  crosses_above  crosses_below`
- **Leakage blocklist:** future_return, next_return, future winner labels, untimestamped
  earnings surprise, future index constituent, unlagged fundamentals.
- **ExperimentRunnerStub.planned_metrics:** `["Sharpe","max_drawdown","turnover","alpha_vs_benchmark"]`.

### LLM contract — reserved `mock` context key  (2026-06-20)
Agents pass their deterministic fixture as `context["mock"]`. `MockLLMClient` validates it
against the schema; real providers STRIP the `mock` key before sending (see
`quantcode/llm/providers.py:_send_context`). This gives one call path for mock and real.

### Phase 1 — Schemas FROZEN at schema_version "1"  (signed off 2026-06-20)
18 models in `quantcode/schemas/__init__.py`, approved as-is. Ported deprecated names
kept (DataFeasibilityReport, StrategyCritique, ExperimentPlanStub, ExperimentResultStub,
AgentTrace). New real schemas: Lesson, ContextPack, EpisodeRecord, TraceEvent. Added
`run_id` + `schema_version` to the packet; PriorArtTheme gained `source_url`. Self-check:
`python -m quantcode.schemas` (JSON+YAML round-trip, extra='forbid'). **Phase 2 builds
against this; persisted-field changes are now backwards-compat breaks.**

### Phase 2 — COMPLETE (2026-06-20)
5 modules built by parallel sub-agents, all green (ruff + mypy + `python -m` self-check),
zero blockers: `agents/` (9 LLM agents, coherent mock demo chain), `tools/` (validator on
D8 + ExperimentRunnerStub + catalogs), `memory/` (Redis 3-tier + RediSearch HNSW + in-mem
fallback + MemoryCurator), `compaction/` (ResearchTrace Compiler, measured tokens), `browser/`
(Browserbase, live fetch HITL-gated, lazy-imported).

### Phase 3 — COMPLETE (2026-06-20)
- `pipeline/run_research()` wires the spine: retrieve Tier3 → 9 agents → feasibility gate →
  validation gate → write YAML → packet → persist → Tier1 trace → compact → curate. Plus
  `run_from_url()` (Browserbase). Failure boundary at the CLI (D6); Tier-3 promote gated by
  `promote=` (demo/`--promote` = the explicit approval).
- `cli/`: `init, research [--promote], demo, inspect, compact [--budget], memory search,
  research-url [--confirm]`. Thin over pipeline/workspace/memory; rich rendering.
- ✅ DONE-CRITERIA MET: `python -m quantcode.config` runs; `quantcode demo` runs end-to-end
  offline (mock + in-memory), proving the 2-run learning loop with a meaningful recalled
  lesson; all 11 module self-checks pass; ruff + mypy clean (48 files).
- WorkspaceManager honors a live `QC_WORKSPACE` override (config is frozen at import).
- Context-pack filenames sanitize `:` → `_` (filesystem-portable).

### D5 — Dashboard: SKIPPED (2026-06-20)
Re-asked after Phase 3; decision = skip for now. The CLI `demo` already proves the full
story (gates, compaction metrics, 2-run learning). Revisit only if time allows before
judging. No `dashboard/` code, no dashboard deps.

### Tests — legacy suite replaced (2026-06-20)
Deleted the old `tests/` (they imported the deprecated `quant_code` package and couldn't
collect). Added `tests/test_selfchecks.py`: parametrized, runs each module's
`python -m quantcode.<mod>` self-check in isolation (temp workspace + in-memory backend).
`pytest -q` → 11 passed.

## Environment  (set up 2026-06-20, approved)
- Interpreter: `/opt/homebrew/bin/python3.11` (3.11.15). System `python3` is 3.9.6 (too old).
- Venv: `.venv/` (gitignored). Install: `.venv/bin/python -m pip install -e ".[dev]"`.
- Installed core: redis 6.4.0, fastembed 0.8.0, pyyaml 6.0.3 + pydantic/dotenv/rich/typer + dev.
- ✅ `python -m quantcode.config` runs (first done-criterion met).
- Created `quantcode/__init__.py` (flit requires it; trivial scaffolding, not a design choice).

## Dependency list (NOTHING installed without explicit approval — HITL)
Phase 1/2 core: `redis`, `fastembed`, `pyyaml`, `anthropic` (real Claude path only).
Phase 2 Browserbase track: `browserbase`, `playwright`.
Deferred: dashboard stack (D5) — no dep yet.
Note: the ported `openai_compatible`/`ollama` clients' HTTP dep is verified in Phase 1; if
they need a new package (vs stdlib/httpx already present), it's flagged before install.
Versions pinned when added to `pyproject.toml`; the install itself is the gated action.
