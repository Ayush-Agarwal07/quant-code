# quantcode/

Active source package for **QuantCode** — "Claude Code for systematic strategy
research." CLI-first; the dashboard is a read-only viewer. The old implementation
is in `deprecated/` (reference only). Design source of truth: `../docs/`.

> **Status:** scaffold. Nothing here is implemented yet. These READMEs are the
> build spec.

## Sponsor priorities (decided)

- **Redis — ALL IN.** Memory substrate, not a cache. 3-tier memory + real vector
  search. This is the strongest track; `memory/` is the headline.
- **The Token Company — ALL IN.** `compaction/` (ResearchTrace Compiler) with
  **measured** token metrics.
- **Browserbase — CONFIGURED.** `browser/` must genuinely run on their platform.
- **Anthropic / Arize / Sentry — NOT targeted.** Do not add `observability/`. Do
  not bake Anthropic social-impact framing into the product.

## Pipeline (the spine everything plugs into)

```
objective
 → retrieve Tier 3 lessons (memory/tier3_semantic)
 → ResearchDirector → PriorArtDiscovery → MarketMechanism → HypothesisGenerator
 → DataFeasibility  (gate: only testable_now / testable_with_proxy advance)
 → StrategyFormalizer → StrategyValidatorTool (gate) → StrategyWriter (YAML)
 → ResearchCritic → ExperimentPlanner → ExperimentRunnerStub (status=not_executed)
 → QuantResearchPacket → workspace/research_runs + reports
 → raw trace → Redis Tier 1
 → ResearchTrace Compiler → MemoryCurator → Redis Tier 2 + Tier 3 + context pack
```

`research-url <url>` is a side entry: `browser/` → `PriorArtTheme` → normal pipeline.

## Directory map

| Dir | Owns |
|---|---|
| `cli/` | `quantcode` commands (init, research, demo, inspect, compact, memory, research-url) |
| `schemas/` | Pydantic models: StrategySpec, QuantResearchPacket, PriorArtTheme, … |
| `config.py` | Redis + Browserbase settings; LLM **undecided** |
| `workspace/` | `WorkspaceManager` — all file I/O |
| `agents/` | the research agents |
| `tools/` | StrategyValidatorTool, ExperimentRunnerStub |
| `pipeline/` | orchestration of the spine above |
| `memory/` | Redis substrate (`tier1_working`, `tier2_episodic`, `tier3_semantic`) |
| `compaction/` | ResearchTrace Compiler + CompactorAgent |
| `browser/` | BrowserResearcherAgent (Browserbase) |
| `dashboard/` | read-only judge viewer (`panels/`) |

## How to read these READMEs

Every dir's README ends with two required sections:

- **❓ Open questions** — decisions NOT yet made. **Do not assume an answer. Stop
  and ask the human before writing code that depends on one.**
- **🧑‍⚖️ HITL checkpoints** — points where an implementing agent must pause and get
  human sign-off (irreversible actions, cost/credit spend, schema commits, memory
  promotion).

If a README doesn't answer something you need, that's a question for the human,
not a gap to fill with a guess.

## ❓ Open questions (global)

- [ ] **LLM backend (the big one).** Provider (Anthropic / old multi-backend
      router / mock-only), which SDK, which model id, and **where the client
      lives** (no `models/` dir was created — does it go in a new module, in
      `agents/`, or driven from `config.py`?). Blocks every agent.
- [ ] CLI entrypoint name: `quantcode` vs the old `qf`, and repointing
      `pyproject.toml` (still aimed at `quant_code`/`qf`).
- [ ] Reuse vs rebuild: which pieces (if any) port from `deprecated/` vs written fresh?
- [ ] New deps + versions: Redis client lib, Browserbase SDK, LLM SDK — none chosen.

## 🧑‍⚖️ HITL checkpoints (global)

- [ ] Before the **first LLM call** anywhere: confirm provider/model with human.
- [ ] Before adding any **new dependency** to `pyproject.toml`: confirm.
- [ ] Before deleting or repurposing anything in `deprecated/`: confirm.
