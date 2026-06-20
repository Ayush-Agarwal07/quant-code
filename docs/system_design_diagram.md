# System Design Diagram

## Presentation Architecture

```mermaid
flowchart LR
    A["User or judge"] --> B["quantcode research objective"]
    A --> C["quantcode research-url url"]
    A --> D["quantcode compact runs/latest"]
    A --> E["quantcode memory search query"]

    B --> F["Agent pipeline"]
    C --> G["BrowserResearcherAgent\nBrowserbase / Stagehand"]
    G --> F

    F --> H["Feasibility gate"]
    H --> I["StrategyWriterAgent\nwrites YAML files"]
    H --> J["Deferred hypotheses"]

    I --> K["ResearchCriticAgent"]
    K --> L["MemoryCuratorAgent\nwrites to Redis"]
    L --> M["CompactorAgent\nResearchTrace Compiler"]

    M --> N["workspace/memory/\ncontext pack"]
    L --> O["Redis\nTier 2 episodes\nTier 3 lessons"]
    I --> P["workspace/strategies/\nYAML specs"]
    F --> Q["workspace/research_runs/\nrun JSON"]

    Q --> R["Local web dashboard"]
    O --> R
    N --> R

    R --> S["Run timeline"]
    R --> T["Strategy graph"]
    R --> U["Memory explorer"]
    R --> V["Compaction view"]
    R --> W["Critique view"]

    style H fill:#fff4cc,stroke:#946200,stroke-width:2px
    style O fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style R fill:#e8ffe8,stroke:#247a24,stroke-width:2px
```

---

## Core Agent Flow

```mermaid
flowchart TD
    R["Research objective"] --> PRE["Retrieve Tier 3 lessons\nfrom Redis"]
    PRE --> A1["ResearchDirectorAgent"]
    A1 --> A2["PriorArtDiscoveryAgent\noffline catalog"]
    A2 --> A3["HypothesisGeneratorAgent"]
    A3 --> A4{"DataFeasibilityAgent\nFeasibility gate"}

    URL["research-url command"] --> BB["BrowserResearcherAgent\nBrowserbase / Stagehand"]
    BB --> A3

    A4 -->|testable_now or testable_with_proxy| A5["StrategyWriterAgent\nDSL + YAML file write"]
    A4 -->|missing data or unsafe proxy| A6["Deferred hypothesis\nstored in packet"]

    A5 --> A7["ResearchCriticAgent\nleakage + cost + complexity"]
    A7 --> A8["ExperimentPlannerAgent stub"]
    A8 --> A9["BacktestRunnerStub\nstatus = not_executed"]
    A9 --> A10["MemoryCuratorAgent\nTier 2 + 3 Redis writes"]
    A10 --> A11["CompactorAgent\nResearchTrace Compiler"]
    A6 --> A12["QuantResearchPacket"]
    A11 --> A12
    A12 --> A13["workspace/research_runs/run_N.json"]

    style A4 fill:#fff4cc,stroke:#946200,stroke-width:2px
    style A6 fill:#f1f1f1,stroke:#666666,stroke-width:1px
    style A9 fill:#ffe1e1,stroke:#9b1c1c,stroke-width:2px
    style PRE fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
```

---

## Watcher Flow (Milestone 6)

Evidence-pushed mode. Runs parallel to the objective-pulled `quantcode research` flow.
The 9-agent pipeline above is unchanged; the watcher wraps it.

```mermaid
flowchart TD
    CRON["quantcode watch\nor cron tick"] --> SW["SourceWatcherAgent\npoll feeds.yaml"]
    SW --> SL["seen.jsonl\ndedup ledger"]
    SL --> ID["IngestedDocument\nURL shells (no body)"]
    ID --> BR["BrowserResearcherAgent.run_document\nBrowserbase hydrate"]
    BR --> EA["ExtractedAnomaly\n+ source_doc_id"]

    EA --> S1["Triage Stage 1\nvector sim vs strategy embeddings\n(no LLM)"]
    S1 -->|sim below floor| IGN["IGNORE\nlog ingest-but-discarded"]
    S1 -->|top-K candidates| S2["Triage Stage 2\nLLM call per candidate\n+ Tier 3 lessons"]
    S2 --> EV["EvidenceReview\n(ungrounded)"]
    EV --> VG["Grounding validator\nverbatim-quote guards\nsource-quality ceiling\nrevise-needs-reason"]
    VG --> ER["EvidenceReview\n(validated)"]

    ER --> RQ["workspace/review_queue/\npending_*.md"]
    RQ --> DASH["Dashboard\nReview page"]
    DASH --> HV{"Human verdict"}
    HV -->|accept| MC["MemoryCuratorAgent\nrecord lesson"]
    HV -->|revise| SW2["StrategyWriterAgent\nrespec (v1: manual trigger)"]
    HV -->|reject| DROP["drop\nlog rationale"]

    style S1 fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style VG fill:#fff4cc,stroke:#946200,stroke-width:2px
    style RQ fill:#e8ffe8,stroke:#247a24,stroke-width:2px
    style IGN fill:#f1f1f1,stroke:#666666,stroke-width:1px
```

---

## Integrations

```mermaid
flowchart TD
    P["QuantResearchPacket"] --> D1["Local web dashboard\nrun timeline + strategy graph"]
    P --> D2["workspace/reports/run_N.md\nMarkdown summary"]
    P --> D3["Arize\nspan per agent step"]
    P --> D4["Decision summaries\naccept / revise / reject"]

    MC["MemoryCuratorAgent"] --> R2["Redis Tier 2\nstrategy episodes"]
    MC --> R3["Redis Tier 3\nsemantic lessons"]
    CA["CompactorAgent"] --> R1["Redis Tier 1\nworking memory"]
    CA --> WM["workspace/memory/\ncontext pack JSON"]

    TF["Failed tool call\nSchema error\nRedis unavailable"] --> SE["Sentry\nerror capture"]

    URL["research-url command"] --> BBF["browserbase_fetch tool\nStagehand extraction"]
    BBF --> HYP["Hypothesis extraction\n→ PriorArtTheme list"]

    STUB["BacktestRunnerStub"] --> NS["not_executed\nno live trading"]

    style R2 fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style R3 fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style D3 fill:#e8ffe8,stroke:#247a24,stroke-width:2px
    style SE fill:#fff0e7,stroke:#b85000,stroke-width:2px
    style NS fill:#ffe1e1,stroke:#9b1c1c,stroke-width:2px
```

---

## Demo Runtime Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as quantcode CLI
    participant Redis as Redis (3-tier)
    participant Agents as Agent pipeline
    participant BB as Browserbase / Stagehand
    participant Tools as Deterministic tools
    participant Arize as Arize tracer
    participant WS as workspace/

    User->>CLI: quantcode research "Find underreaction strategies"
    CLI->>Redis: retrieve Tier 3 semantic lessons
    Redis-->>CLI: prior failure lessons
    CLI->>Agents: ResearchDirectorAgent with lesson context
    Agents-->>CLI: ResearchAgenda
    CLI->>Agents: PriorArtDiscoveryAgent
    Agents->>Tools: offline anomaly catalog
    Tools-->>Agents: prior art themes
    CLI->>Agents: HypothesisGeneratorAgent
    Agents-->>CLI: candidate hypotheses
    CLI->>Agents: DataFeasibilityAgent
    Agents->>Tools: data catalog + proxy suggester
    Tools-->>Agents: feasibility reports
    CLI->>Agents: StrategyWriterAgent
    Agents->>WS: write workspace/strategies/strategy_N.yaml
    Agents-->>CLI: strategy specs
    CLI->>Agents: ResearchCriticAgent
    Agents->>Tools: leakage + complexity + cost checks
    Agents-->>CLI: critiques
    CLI->>Agents: MemoryCuratorAgent
    Agents->>Redis: write Tier 2 episode
    Agents->>Redis: promote Tier 3 lesson
    CLI->>Agents: CompactorAgent
    Agents->>Arize: emit spans for all agent steps
    Agents->>WS: write workspace/memory/context_pack_N.json
    Agents->>Redis: store context pack in Tier 1
    CLI->>WS: write workspace/research_runs/run_N.json
    CLI-->>User: summary + compression ratio

    User->>CLI: quantcode research "Find another earnings drift strategy"
    CLI->>Redis: retrieve Tier 3 lesson
    Redis-->>CLI: "Prior gap-volume proxy failed without event dates"
    CLI->>Agents: ResearchDirectorAgent with retrieved lesson
    Agents-->>CLI: ResearchAgenda that requires event-date filter or marks proxy as weak
```

---

## Compaction Before/After

```mermaid
flowchart LR
    T["Full agent trace\n18,400 tokens"] --> C["ResearchTrace Compiler\nCompactorAgent"]
    C --> P["Context pack\n1,050 tokens\n17.5× compression"]
    P --> L["Retained:\n4 strategy lessons\n2 failed-pattern warnings\n3 data constraints\n2 mutation rules"]
    P --> PR["Provenance links\nto run_N.json"]

    style T fill:#ffe1e1,stroke:#9b1c1c,stroke-width:1px
    style P fill:#e7f0ff,stroke:#2455a6,stroke-width:2px
    style C fill:#fff4cc,stroke:#946200,stroke-width:1px
```

---

## Hackathon Pitch

Build the demo around one sentence:

> QuantCode is Claude Code for systematic strategy research: a local agent that reads a quant
> workspace, researches market hypotheses, writes strategy specs, critiques them, stores
> outcome-grounded memory in Redis, and compacts long research traces into reusable context.

Four things to show clearly:

1. **Workspace I/O** — agent reads and writes files like a developer tool.
2. **Redis memory across runs** — the agent avoids repeating past failures because it retrieves
   lessons from Tier 3 before generating new hypotheses.
3. **Measurable compaction** — print compression ratio and retained-lesson count after every run.
4. **Safe boundaries** — backtesting is stubbed, broker is disabled, no financial advice is implied.

## What To Show in the 3-Minute Demo

```
1. "This is QuantCode, Claude Code for strategy research."

2. CLI: quantcode research "Find short-horizon equity strategies based on market underreaction."

3. Agent generates:
   - research themes, hypotheses, feasibility reports
   - strategy YAML in workspace/strategies/
   - markdown report in workspace/reports/

4. Dashboard: strategy graph, critique view, memory writes.

5. CLI: quantcode compact runs/latest --budget 1000
   - prints: 18,400 tokens → 1,050 tokens (17.5×)
   - shows Redis Tier 2/3 entries and provenance links

6. CLI: quantcode research "Find another earnings drift strategy."
   - agent retrieves Tier 3 lesson:
     "Prior gap-volume proxy failed without event dates."
   - generates strategy with event-date requirement or explicit proxy warning

7. Close: "The backtester is stubbed today, but the research loop, Redis memory,
           and token compaction layer are implemented."
```
