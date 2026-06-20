# Architecture

## Product Identity

**QuantCode** is Claude Code for systematic strategy research: a local agent that reads a quant
workspace, researches market hypotheses, writes strategy specs, critiques them, stores
outcome-grounded memory in Redis, and compacts long research traces into reusable context.

```
CLI-first (quantcode <command>) + local web dashboard for judging / inspection
```

---

## CLI Commands

```bash
quantcode init                                    # scaffold workspace directories
quantcode research "objective"                   # full agent research loop
quantcode research-url <url>                     # Browserbase hypothesis extraction from URL
quantcode inspect runs/latest                    # human-readable run summary
quantcode memory search "momentum failed"        # semantic query against Redis memory
quantcode compact runs/latest --budget 1000      # run ResearchTrace Compiler
quantcode backtest strategies/my_strategy.yaml   # stub or lightweight OHLCV backtest
```

---

## Workspace Layout

The agent reads from and writes to a local strategy workspace, mirroring how Claude Code
operates over a local project:

```
workspace/
  strategies/          # generated YAML strategy specs (StrategyWriterAgent output)
  research_runs/       # run_001.json, run_002.json ... (full QuantResearchPacket)
  reports/             # run_001.md, run_001_critique.md (human-readable summaries)
  memory/              # context_pack_001.json (compacted memory blobs, provenance links)
```

---

## Module Responsibilities

- `models/` — `LLMClient` protocol, deterministic mock, OpenAI-compatible and Ollama clients,
  provider router. Default is `MockLLMClient`; no API keys required for development.
- `strategy_research/schemas.py` — contract layer. Every workflow artifact is a validated Pydantic
  model with explicit confidence bounds and DSL validation. `extra="forbid"` on all models.
- `strategy_research/tools/` — deterministic, network-free catalogs and validators. Tools are
  injected into agents; agents do not import tools directly.
- `strategy_research/agents/` — small focused transformations. Each run returns an output plus an
  `AgentTrace`. Agents do not print, persist, or execute trades.
- `strategy_research/workflow.py` — dependency construction and sequential orchestration.
- `tools/` — I/O and integration tools available to agents and CLI: `file_reader`, `file_writer`,
  `command_runner`, `strategy_validator`, `browserbase_fetch`, `lightweight_backtester_or_stub`,
  `redis_memory`, `arize_tracer`, `sentry_logger`.
- `dashboard/` — local web dashboard. Reads workspace files and Redis; never writes back.
- `future/` — intentionally non-operational stubs for capabilities not yet implemented.

---

## 8-Agent Pipeline

Agents run sequentially. Each receives only the outputs of prior agents that it needs.

| # | Agent | Role | Key tools |
|---|---|---|---|
| 1 | `ResearchDirectorAgent` | Converts objective → bounded `ResearchAgenda` | LLM |
| 2 | `BrowserResearcherAgent` | Fetches URL via Browserbase/Stagehand → extracts anomaly, mechanism, data requirements | `browserbase_fetch` |
| 3 | `PriorArtDiscoveryAgent` | Offline anomaly catalog search → `list[PriorArtTheme]` | `KnownAnomalyCatalogTool`, `ResearchCorpusSearchStub` |
| 4 | `HypothesisGeneratorAgent` | Creates falsifiable claims → `list[CandidateHypothesis]` | LLM |
| 5 | `DataFeasibilityAgent` | Gates by data availability; suggests proxies → `list[DataFeasibilityReport]` | `DataRequirementMapperTool`, `ProxyFeatureSuggesterTool` |
| 6 | `StrategyWriterAgent` | Formalizes feasible hypotheses → `list[StrategySpec]`; writes YAML files | `DSLValidationTool`, `file_writer` |
| 7 | `ResearchCriticAgent` | DSL, leakage, complexity, cost critique → `list[StrategyCritique]` | `DSLValidationTool`, `LeakageCheckTool`, `CostRiskHeuristicTool` |
| 8 | `MemoryCuratorAgent` | Scores candidates, deduplicates, promotes durable lessons → Redis Tier 2/3 | `redis_memory` |
| 9 | `CompactorAgent` | Runs ResearchTrace Compiler → context pack under token budget | `file_writer`, `redis_memory` |

`ExperimentPlannerAgent` and `BacktestRunnerStub` remain as lightweight stubs between
`StrategyWriterAgent` and `MemoryCuratorAgent`.

Reused base classes:
- `BaseAgent` + `AgentTrace` — `strategy_research/agents/base.py`
- `QuantResearchPacket` — `strategy_research/schemas.py`

---

## Why Research Is Separate From Execution

Research agents handle ambiguity: they survey themes, state mechanisms, form falsifiable
hypotheses, and identify data limitations. A future backtester must handle none of that
ambiguity — it consumes a validated `StrategySpec` and executes deterministic rules against
point-in-time data.

Keeping layers separate prevents an agent from inventing unavailable features during execution,
changing rules after seeing outcomes, or confusing a qualitative research claim with empirical
evidence.

---

## 3-Tier Redis Memory

Memory persists across research runs. The agent retrieves Tier 3 lessons before generating
new hypotheses, so it does not repeat known failures.

### Tier 1 — Working Memory (session-scoped)

RedisJSON or Streams. Cleared at the start of each run, or expired by TTL.

```json
{
  "run_id": "run_001",
  "objective": "...",
  "agent_messages": [],
  "hypotheses": [],
  "strategy_specs": [],
  "critiques": []
}
```

### Tier 2 — Episodic Memory (persisted, vector search)

One document per completed strategy episode. Searchable by embedding.

```json
{
  "type": "strategy_episode",
  "strategy_name": "earnings_gap_volume_drift",
  "family": "event_driven_momentum",
  "result": "failed",
  "failure_modes": ["high_turnover", "proxy_data_weakness"],
  "lessons": ["Do not use gap proxy without event-date filter."],
  "embedding_text": "event driven momentum earnings gap volume drift high turnover weak proxy"
}
```

### Tier 3 — Semantic Lesson Memory (distilled, retrieved pre-research)

Durable lessons promoted from Tier 2. Retrieved by semantic search on the next run's objective.

```json
{
  "type": "research_lesson",
  "lesson": "Gap-and-volume strategies are weak proxies for earnings underreaction unless event dates are available.",
  "applies_to": ["earnings", "event_driven", "underreaction"],
  "confidence": 0.72,
  "source_runs": ["run_001", "run_004"]
}
```

---

## Token Compaction Algorithm (ResearchTrace Compiler)

Converts a full agent trace (~18k tokens) into a context pack (~1k tokens) stored in
`workspace/memory/` and Redis Tier 1.

### Scoring Formula

```
score =
  0.25 × relevance_to_current_objective
+ 0.20 × empirical_value
+ 0.15 × novelty
+ 0.15 × failure_severity
+ 0.10 × recency
+ 0.10 × reuse_frequency
+ 0.05 × provenance_quality
```

### Context Pack Budget (~1,100 tokens)

| Slot | Tokens | Content |
|---|---|---|
| Current objective | 150 | Verbatim research question |
| Relevant past failures | 250 | Top-scored failure lessons |
| Successful patterns | 250 | Accepted strategy families |
| Data constraints | 200 | Known feasibility limits |
| Critic instructions | 150 | Recurring critique themes |
| Provenance references | 100 | Run IDs linking to full traces |

### Pipeline

1. Segment trace into typed events: objective, source, hypothesis, data requirement,
   strategy spec, critique, validation result, backtest result, lesson.
2. Convert each event to a structured memory candidate.
3. Score each candidate with the formula above.
4. Deduplicate semantically similar candidates.
5. Promote only durable items: failed strategy lessons, useful mutations, data feasibility
   constraints, recurring risk warnings, strategy-family-specific rules.
6. Emit context pack under budget; store full trace and pack in Redis with provenance links.

### Compaction Quality Metrics (shown in demo)

```
Original trace:    18,400 tokens
Compacted pack:     1,050 tokens
Compression ratio:  17.5×
Retained:
  4 strategy lessons
  2 failed-pattern warnings
  3 data constraints
  2 mutation rules
```

---

## Local Web Dashboard

Read-only. Reads from `workspace/` files and Redis. Never writes back.

| Page | Content |
|---|---|
| Run timeline | Agent steps, token usage, durations per run |
| Strategy graph | Hypothesis → feasibility → spec → critique flow |
| Memory explorer | Tier 2/3 entries, retrieval history, provenance links |
| Compaction view | Before/after token diff, retained lessons |
| Critique view | Accept/revise/reject verdicts, leakage and cost flags |

---

## Sponsor-Track Integration Map

| Track | Integration | Explicit non-scope |
|---|---|---|
| **Redis** | 3-tier memory; vector search on Tier 2/3; working-memory TTL | No real-time pub/sub |
| **Token Company** | ResearchTrace Compiler with measurable compression ratio and quality metrics | No external token-counting API required |
| **Anthropic** | Claude Agent SDK drives the entire agent loop; workspace file I/O mimics Claude Code | No Claude Code CLI dependency |
| **Browserbase** | `quantcode research-url <url>` uses Stagehand for hypothesis extraction from one URL | No general scraping pipeline |
| **Arize** | Span per agent step: prompt size, tool call, memory retrieval, compaction result, critic verdict | No A/B evaluation runs |
| **Sentry** | Error capture on failed tool calls, schema validation errors, Redis unavailable, Browserbase failures | No performance monitoring |
| **UI/UX** | Local web dashboard for run / memory / compaction / critique inspection | No auth, no deployment |
| **Deepgram** | Optional voice command → TTS summary ("avoid the mistake from the last run") | Only if time permits; must feel essential |

---

## Stubs and Explicit Non-Scope

| Capability | Status | Rationale |
|---|---|---|
| Real broker integration | `BrokerAdapterStub` — labelled "planned" | Distraction from research demo; legally awkward |
| Live market data | Protocol stubs only | Full data pipeline is a separate milestone |
| Full production backtester | `BacktestRunnerStub` (status=`not_executed`) or lightweight OHLCV | Research loop is the differentiator |
| Authentication / payments | None | Out of scope for hackathon |
| Desktop packaging | None | CLI + browser is sufficient |

`BacktestRunnerStub` always returns `status="not_executed"`. `MemoryStoreStub` in `future/memory.py`
is superseded by the real `redis_memory` tool. `BrokerAdapterStub` raises `NotImplementedError`.
Data provider protocols do not fetch live data.

---

## Acceptance Criteria

```bash
quantcode research "Find short-horizon equity strategies based on market underreaction."
# → generates strategy YAML in workspace/strategies/
# → writes run JSON to workspace/research_runs/
# → writes markdown report to workspace/reports/

quantcode compact runs/latest --budget 1000
# → prints compression ratio and retained-lesson count
# → writes context pack to workspace/memory/

quantcode research "Find another earnings drift strategy."
# → agent retrieves Tier 3 lesson:
#    "Prior gap-volume proxy failed without event dates."
# → generates strategy with event-date requirement or explicit proxy warning
```
