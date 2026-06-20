# System Design Diagram

This design shows the target project flow after the package mismatch is fixed. The
recommended repair is to rename `quant_forge/` back to `quant_forge/`, because the
project name, CLI entry point, docs, tests, and existing imports already use that identity.

## Presentation Architecture

This version avoids renderer-fragile Mermaid syntax: no HTML line breaks, no links directly
to subgraphs, no schema labels with square brackets, and no text embedded inside dotted
edges.

```mermaid
flowchart LR
    A["Judge or user"] --> B["qf demo"]
    A --> C["qf run objective"]
    B --> D["Mock model provider"]
    C --> D
    D --> E["Agentic research workflow"]
    E --> F["Feasibility gate"]
    F --> G["Strategy specs"]
    F --> H["Rejected or deferred hypotheses"]
    G --> I["Research critiques"]
    I --> J["Experiment plan stubs"]
    J --> K["Backtest stub not executed"]
    K --> L["Research packet"]
    H --> L
    L --> M["Terminal demo"]
    L --> N["Markdown Devpost summary"]
    L --> O["JSONL trace export"]
    L --> P["Memory write proposals"]
    P --> Q["Future Redis memory stub"]

    style F fill:#fff4cc,stroke:#946200,stroke-width:2px
    style K fill:#ffe1e1,stroke:#9b1c1c,stroke-width:2px
    style Q fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
```

## Core Agent Flow

```mermaid
flowchart TD
    R["Research objective"] --> A1["Research Director"]
    A1 --> A2["Prior Art Discovery"]
    A2 --> A3["Market Mechanism Agent"]
    A3 --> A4["Hypothesis Agent"]
    A4 --> A5{"Data Feasibility Gate"}
    A5 -->|Feasible with current or proxy data| A6["Strategy Formalizer"]
    A5 -->|Missing data or unsafe proxy| A7["Deferred hypothesis"]
    A6 --> A8["Research Critic"]
    A8 --> A9["Experiment Planner"]
    A9 --> A10["Backtest Runner Stub"]
    A10 --> A11["Memory Proposal Agent"]
    A7 --> A12["Structured Research Packet"]
    A11 --> A12

    style A5 fill:#fff4cc,stroke:#946200,stroke-width:2px
    style A7 fill:#f1f1f1,stroke:#666666,stroke-width:1px
    style A10 fill:#ffe1e1,stroke:#9b1c1c,stroke-width:2px
```

## Integrations We Can Incorporate Safely

```mermaid
flowchart TD
    P["QuantResearchPacket"] --> D1["Hackathon demo view"]
    P --> D2["Markdown summary export"]
    P --> D3["Trace JSONL export"]
    P --> D4["Decision summaries"]
    P --> D5["Memory write proposals"]

    D1 --> J["Judges see agent collaboration"]
    D2 --> K["Devpost submission"]
    D3 --> L["Arize or Sentry style observability"]
    D4 --> M["Why accepted or rejected"]
    D5 --> N["Future Redis vector memory"]

    O["Prior art themes"] --> W["Future web research collector"]
    W --> X["Browserbase ready but off by default"]

    Y["Experiment plan stubs"] --> Z["Future deterministic backtester"]
    Z --> AA["No live trading in hackathon"]

    style N fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style L fill:#e8ffe8,stroke:#247a24,stroke-width:2px
    style AA fill:#ffe1e1,stroke:#9b1c1c,stroke-width:2px
```

## Demo Runtime Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as qf CLI
    participant Router as ModelRouter
    participant WF as run_quant_research
    participant Agents as Research Agents
    participant Tools as Deterministic Tools
    participant Gate as Feasibility Gate
    participant Obs as Observability
    participant Report as Reporting

    User->>CLI: qf demo with summary and trace export
    CLI->>Router: provider = mock
    Router-->>CLI: MockLLMClient
    CLI->>WF: canonical underreaction objective
    WF->>Agents: ResearchDirectorAgent
    Agents-->>WF: ResearchAgenda
    WF->>Agents: PriorArtDiscoveryAgent
    Agents->>Tools: offline anomaly catalog search
    Tools-->>Agents: prior art themes
    WF->>Agents: MarketMechanismAgent
    Agents-->>WF: market mechanisms
    WF->>Agents: HypothesisGenerationAgent
    Agents-->>WF: candidate hypotheses
    WF->>Gate: assess required data and proxies
    Gate->>Tools: data catalog + proxy suggester
    Tools-->>Gate: availability and proxy result
    Gate-->>WF: data feasibility reports
    WF->>Agents: StrategyFormalizerAgent for feasible hypotheses only
    Agents->>Tools: DSL and feature validation
    Tools-->>Agents: validation result
    Agents-->>WF: strategy specs
    WF->>Agents: ResearchCriticAgent
    Agents->>Tools: leakage, complexity, cost, mutation checks
    Agents-->>WF: critiques
    WF->>Agents: ExperimentPlannerAgent
    Agents-->>WF: experiment plan stubs
    WF-->>WF: BacktestRunnerStub returns not_executed
    WF->>Agents: MemoryProposalAgent
    Agents-->>WF: memory write proposals
    WF-->>CLI: QuantResearchPacket
    CLI->>Obs: build AgentRunMetrics and decision summaries
    CLI->>Report: render judge-ready Markdown
    Obs-->>User: trace JSONL file
    Report-->>User: Markdown summary file
    CLI-->>User: terminal demo summary
```

## Hackathon Direction

Build the presentation around one sentence:

> Quant Forge turns broad quant research questions into strict, data-aware strategy
> specifications while refusing to run unsafe execution or unproven backtests.

The demo should show four things clearly:

1. **Multi-agent collaboration**: each agent has one job, from research agenda to memory
   proposal.
2. **Feasibility gate**: hypotheses are narrowed before they can become strategy specs.
3. **Observability**: traces and decision summaries explain why ideas passed or failed.
4. **Safe boundaries**: backtesting, Redis memory, web research, data connectors, and broker
   integrations are explicit stubs unless future milestones implement them.

## What To Incorporate Now

| Area | Add Now | Keep Stubbed |
|---|---|---|
| Package identity | Fix import/package mismatch before features | None |
| Demo experience | `qf demo` with polished terminal output | No live provider requirement |
| Devpost output | `--summary-md` / `--devpost-summary` Markdown export | No generated performance claims |
| Observability | JSONL trace export, validation counts, decision summaries | External SaaS integrations |
| Redis fit | `RedisMemoryStoreStub` interface and docs | No Redis dependency or network |
| Multi-agent framing | `docs/hackathon_pitch.md` and visible agent collaboration diagram | No unnecessary agent orchestration platform |
| Browserbase fit | `WebResearchCollectorStub` future interface | No live scraping in default mode |
| Backtesting | Preserve `BacktestRunnerStub(status="not_executed")` | Real backtester |
| Broker/data | Keep explicit stubs | Broker integration, live market data |

## Proposed File Additions

```text
quant_forge/
  demo.py
  reporting/
    __init__.py
    demo_summary.py
    markdown.py
  observability/
    __init__.py
    schemas.py
    trace_export.py
    summaries.py
  future/
    redis_memory.py
    web_research.py

docs/
  system_design_diagram.md
  hackathon_pitch.md
  redis_memory_design.md
  observability.md
```

If the project chooses `quant_forge` as the final package name instead, use the same structure
under `quant_forge/` and update `pyproject.toml`, tests, imports, docs, and CLI entrypoints in
one mechanical pass.

## Acceptance Path

1. Fix the package mismatch and reinstall editable mode.
2. Verify the existing workflow still passes.
3. Add demo and reporting modules.
4. Add observability models and JSONL export.
5. Add Redis and web-research stubs.
6. Add hackathon pitch docs.
7. Run:

```bash
pytest
ruff check .
mypy quant_forge
qf demo
qf demo --summary-md demo.md --trace-jsonl traces.jsonl
```

The final pitch remains: a safe agentic research layer that reasons broadly, narrows ideas
through feasibility gates, emits strict strategy specifications, and refuses to imply live
execution or proven profitability.
