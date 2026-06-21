# QuantCode

QuantCode is a prototype of **Claude Code for systematic strategy research**: a local agent that
reads a quant workspace, researches market hypotheses, writes strategy specs, critiques feasibility
and leakage, stores research memory in Redis, and compacts long traces into reusable context.

The core philosophy is:

> **Broad research, narrow execution.**

Agents may reason broadly about market anomalies and mechanisms. Only ideas that pass explicit
feasibility and validation gates can become structured strategy specifications.

## What It Is

- A CLI-first agentic research workflow
- A workspace-oriented tool that writes strategy YAML, run JSON, reports, and context packs
- A strict schema layer for research artifacts and strategy specs
- A feasibility gate before strategy formalization
- A validation gate before YAML writing
- A Redis-ready memory architecture with working traces, episodes, and semantic lessons
- A compaction layer, the ResearchTrace Compiler, for turning long traces into reusable context
- A terminal-first backtest-learning loop and local paper portfolio snapshots

## What It Is Not

- Not a trading bot or live trading system
- Not financial advice or a source of trade recommendations
- Not a broker integration
- Not proof that any strategy works
- Not a full backtesting platform yet

## Setup & Run

Everything runs **fully offline by default** (mock LLM + in-memory memory backend) — Redis,
real embeddings, live web research, and a live LLM are all **opt-in**. Nothing below is
required to see the core demo.

### Prerequisites
- Python **3.11+**
- (optional) **Docker** — only for real Redis Stack
- (optional) Browserbase + LLM API keys — only for the live paths

### 1. Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt   # installs the package (-e .) + deps
```

`requirements.txt` just installs the project editable, so deps stay defined in `pyproject.toml`.
The `quantcode` CLI is then on `.venv/bin/quantcode`.

### 2. Run the offline demo (no setup, no server)

```bash
.venv/bin/quantcode demo
```

Two scripted runs proving the learning loop: run 2 retrieves a lesson learned in run 1 and
changes behavior. The panel prints `memory backend: memory` (offline fallback).

### 2b. CLI workflow: create and check strategies

```bash
.venv/bin/quantcode strategy
.venv/bin/quantcode check
.venv/bin/quantcode check --learn
.venv/bin/quantcode live runs/latest --paper --strategy short_horizon_momentum
```

`strategy` runs the full research pipeline and writes strategy YAML + run artifacts.
`check` runs the keyless EOD backtest for the latest run and pulls relevant arXiv papers
plus recent Google News. `check --learn` adds one automatic backtest-learning round and one
explicitly approved rerun. `live --paper` writes a local paper portfolio from the latest EOD
signal snapshot. To check one strategy from a specific run:

```bash
.venv/bin/quantcode check run_025 --strategy "Post-Earnings Announcement Drift Momentum"
```

## CLI Reference

QuantCode is meant to be usable from the terminal end to end. The high-level flow is:

```bash
.venv/bin/quantcode strategy "Find short-horizon underreaction strategies"
.venv/bin/quantcode check runs/latest
.venv/bin/quantcode check runs/latest --learn
```

| Command | Purpose |
|---|---|
| `quantcode init` | Create workspace dirs and a starter `.env` without overwriting an existing one. |
| `quantcode strategy [objective]` | Create strategy specs from an objective using the full agent pipeline. Writes run JSON, Markdown report, context pack, and strategy YAML. |
| `quantcode check [run_id] [--learn]` | Backtest strategy specs from a run, pull relevant arXiv papers + Google News, and optionally derive backtest lessons. Defaults to `runs/latest`. |
| `quantcode iterate [run_id] --strategy NAME` | Run one explicit human-approved backtest iteration for a strategy, optionally after parameter edits. |
| `quantcode live [run_id] --paper --strategy NAME` | Build and persist a local paper portfolio from the latest EOD signal snapshot for one strategy. |
| `quantcode research "<objective>"` | Lower-level pipeline command used by `strategy`; writes the same run artifacts. |
| `quantcode inspect [runs/latest]` | Print a compact summary of a saved run. |
| `quantcode compact [runs/latest] --budget 1000` | Re-run the ResearchTrace Compiler over a run trace at a token budget. |
| `quantcode memory search "<query>"` | Search promoted Tier 3 lessons through Redis or the in-memory fallback. |
| `quantcode research-url <url> --confirm` | Browserbase live-fetch path: scrape a URL into prior-art themes, then run the pipeline. |
| `quantcode demo` | Offline two-run demo showing memory retrieval and behavior change. |
| `quantcode warmup` | Download/cache tokenizer + embedding model for measured compaction and real semantic search. |
| `quantcode benchmarks` | Run reproducible offline compaction/retrieval benchmarks. |

Useful examples:

```bash
# Create strategies with the default objective.
.venv/bin/quantcode strategy

# Create strategies from a custom objective and promote lessons to Tier 3 memory.
.venv/bin/quantcode strategy "Find earnings-underreaction strategies using OHLCV only" --promote

# Backtest every strategy in the latest run and fetch papers/news.
.venv/bin/quantcode check

# Add one automatic backtest-learning round, then choose stop/iterate/adjust.
.venv/bin/quantcode check runs/latest --learn

# Check one strategy from one run.
.venv/bin/quantcode check run_025 --strategy "Post-Earnings Announcement Drift Momentum"

# Limit source fetches for a faster check.
.venv/bin/quantcode check runs/latest --papers 1 --news 1

# Run one explicit approved re-test round.
.venv/bin/quantcode iterate runs/latest --strategy "Post-Earnings Announcement Drift Momentum"

# Generate paper orders and persist a local paper book.
.venv/bin/quantcode live runs/latest --paper --strategy short_horizon_momentum

# Inspect and compact saved artifacts.
.venv/bin/quantcode inspect runs/latest
.venv/bin/quantcode compact runs/latest --budget 500
```

`check` is an evaluation aid, not deployment. It uses keyless EOD prices when reachable and
prints a labelled simulated fallback if live price data is unavailable. `live --paper` uses the
same EOD/simulated boundary and never submits real orders.

### 3. Real Redis memory + vector search (Docker)

Tier 3 semantic memory uses RediSearch vector KNN, which needs **Redis Stack** (not vanilla
`redis-server`). Full walkthrough: [`redis_implementation.md`](redis_implementation.md).

```bash
docker run -d --name quantcode-redis -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
.venv/bin/quantcode demo            # panel now reads  memory backend: redis
```

Inspect what it wrote (or browse visually in RedisInsight at <http://localhost:8001>):

```bash
docker exec quantcode-redis redis-cli KEYS 'qc:*'              # trace / episode / lesson keys
docker exec quantcode-redis redis-cli FT._LIST                 # qc:index:lessons (vector index)
docker exec quantcode-redis redis-cli TTL qc:run:run_001:trace # Tier 1 expires; Tier 2/3 = -1
```

Stop/remove when done: `docker stop quantcode-redis && docker rm quantcode-redis`.

### 4. Real embeddings + MEASURED token counts (one-time, online)

```bash
.venv/bin/quantcode warmup     # pre-pulls the bge model + tokenizer into the local cache
```

Without this the demo silently uses a hash-embedding fallback + a labeled token *estimate*.
After warming, compaction reports `(measured)` and semantic search ranks paraphrases properly.

### 5. Explore the pitch surfaces

```bash
.venv/bin/quantcode compact runs/latest --budget 1000     # ResearchTrace Compiler (Token Company)
.venv/bin/quantcode memory search "earnings proxy weakness"  # Redis Tier 3 semantic search
.venv/bin/quantcode benchmarks                            # measured compaction + retrieval metrics
```

Compaction is extractive (deletion-based, verbatim) and the budget is a hard ceiling — sweep
`--budget 60` to watch it trade off honestly.

### 6. Live web research via Browserbase (optional · 🧑‍⚖️ spends credits)

```bash
.venv/bin/python -m pip install -e ".[browser]"
.venv/bin/playwright install chromium
```

Put your keys in `.env` (see below), then run a HITL-gated live fetch:

```bash
.venv/bin/quantcode research-url https://arxiv.org/abs/2105.13727 --confirm
```

It opens a real Browserbase session (Playwright over CDP), extracts a `PriorArtTheme`, and runs
the normal pipeline. Without `--confirm` it refuses; it never falls back to plain HTTP.

### 7. Live LLM (optional · 🧑‍⚖️ first real call costs)

Default is a deterministic **mock** provider (stage-safe, reproducible). To use a real provider,
set `QC_LLM_PROVIDER` + the matching key in `.env`. The first non-mock call is HITL-gated.

### Configuration (`.env`)

Copy `.env.example` to `.env` (it's gitignored) and fill in only what you need:

| Var | Purpose |
|---|---|
| `REDIS_URL` | Redis connection (default `redis://localhost:6379/0`) |
| `QC_MEMORY_BACKEND=memory` | force the offline in-memory backend |
| `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` | live `research-url` (project id is required) |
| `QC_LLM_PROVIDER` + provider key | switch off the mock LLM |

### Tests & checks

```bash
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/ruff check quantcode/ && .venv/bin/mypy quantcode/ && .venv/bin/python -m pytest -q
```

Each module also ships a runnable self-check, e.g. `python -m quantcode.compaction`.

## Hackathon Architecture Direction

```text
research objective
→ retrieve Tier 3 semantic lessons
→ research agents
→ feasibility gate
→ strategy formalizer
→ strategy validator
→ strategy writer
→ critic
→ experiment planner
→ ExperimentRunnerStub(status="not_executed")
→ ResearchTrace Compiler
→ MemoryCuratorAgent
→ Redis Tier 2/Tier 3
→ workspace artifacts
```

The demo should emphasize that QuantCode avoids repeating previously critiqued feasibility and
validation mistakes. Do not call those “backtest failures” until real backtesting exists.

## Workspace Artifacts

```text
workspace/
  strategies/
    earnings_gap_volume_drift.yaml
  research_runs/
    run_001.json
  memory/
    context_pack_001.json
  paper/
    short_horizon_momentum.json
  reports/
    run_001.md
```

## Docs

- [Architecture](docs/architecture.md)
- [Agent flow](docs/agent_flow.md)
- [System design diagram](docs/system_design_diagram.md)
- [Future milestones](docs/future_milestones.md)

## Disclaimer

This project is for research and educational purposes only. It does not provide financial advice,
trade recommendations, or real execution. Backtests can be misleading and do not guarantee future
performance. The current architecture intentionally keeps broker integration out of scope; the
paper portfolio surface is local simulation only.
