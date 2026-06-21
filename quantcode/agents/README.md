# agents/

**Status:** scaffold — not implemented.

## Purpose

The reasoning steps of the pipeline. Each agent is one focused LLM-backed step with
a typed input and a typed `schemas/` output. Agents do not call Redis, files, or the
network directly — `pipeline/` wires them and `tools/` does the deterministic work.

## What to implement (one module per agent)

In pipeline order:

1. `ResearchDirectorAgent` — frames the objective, sets sub-questions.
2. `PriorArtDiscoveryAgent` — known effects/literature → `PriorArtTheme`s.
3. `MarketMechanismAgent` — *why* an effect could exist (economic mechanism).
4. `HypothesisGeneratorAgent` — testable hypotheses.
5. `DataFeasibilityAgent` — feasibility gate → `FeasibilityReport`.
6. `StrategyFormalizerAgent` — hypothesis → draft `StrategySpec`.
7. `StrategyWriterAgent` — finalize the validated spec for writing.
8. `ResearchCriticAgent` — critique feasibility/leakage/weak proxies.
9. `ExperimentPlannerAgent` — planned metrics + experiment design.
10. `MemoryCuratorAgent` — validate + promote candidate lessons (Tier 2/3).

`BrowserResearcherAgent` lives in `../browser/`. The `CompactorAgent` lives in
`../compaction/`.

## How it connects

`pipeline/` calls agents in order, passing `schemas/` objects. Every agent needs an
LLM client — **which one is undecided** (see below). The agent base/LLM-call shape
cannot be written until that's resolved.

## Implementation instructions

1. Each agent: a small class/function `run(input: <Schema>) -> <Schema>`. No side
   effects beyond returning its typed output.
2. Prompts live next to agents (or in a shared `prompts.py` — confirm with human).
3. Deterministic-friendly: support a mock/seeded mode for the `demo` command.
4. One self-check per agent using the mock LLM: assert output validates against its
   schema.

## ❓ Open questions (ask human) — BLOCKING

- [ ] **LLM backend.** Provider (Anthropic Claude / old multi-backend router /
      mock-only), SDK, model id, and **where the client lives** (no `models/` dir
      exists). No agent can be written without this. This is "the question from
      earlier" — do not assume.
- [ ] Is `MemoryCuratorAgent` an agent here, or part of `../memory/`? (It validates
      + promotes lessons — straddles both.)
- [ ] Old code had `strategy_formalizer` + `memory_proposal` but docs name
      `StrategyWriterAgent` + `MemoryCuratorAgent`. Confirm the canonical set.
- [ ] Prompts: per-agent files vs one shared `prompts.py`?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before the first real (non-mock) LLM call: confirm provider/model + that costs
      are acceptable.
- [ ] `MemoryCuratorAgent` must show candidate lessons to the human for approval
      before promoting any to Tier 3 (see `../memory/tier3_semantic/README.md`).
