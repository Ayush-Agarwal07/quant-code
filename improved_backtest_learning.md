# Improved Backtest Learning

This note captures the intended upgrade to QuantCode's learning loop.

## Problem

Today the main pipeline learns mostly from:

- feasibility reports
- validation failures
- strategy critiques
- compacted trace lessons

It does **not** learn directly from measured backtest outcomes in the main research loop.

That means the system can improve its research hygiene across runs, but it does not yet
explicitly internalize lessons like:

- low Sharpe under this signal family
- high drawdown under these risk rules
- daily rebalance is too costly
- proxy-based signals underperform cleaner signals

## Goal

Add explicit learning from backtest metrics while preserving the current honesty boundary:

- first backtest round runs automatically
- every later iteration is human-approved
- memory should primarily come from measured backtest outcomes
- papers/news used during evaluation should be visible in the terminal
- no real trading, only paper/simulated evaluation

## Target Workflow

The intended terminal flow is:

```bash
quantcode strategy "Find short-horizon underreaction strategies"
quantcode check --learn
```

Then, after the first automatic backtest round:

1. QuantCode prints metrics for each surviving strategy.
2. QuantCode prints referenced papers and recent news.
3. QuantCode derives structured lessons from the backtest.
4. QuantCode asks the human:
   - continue iterating
   - adjust parameters first
   - stop and keep current outputs
5. Only after human approval does the next backtest/revision round run.

## HITL Policy

Human-in-the-loop is the correct default here.

- Round 1 backtest: automatic
- Round 2+: explicit human approval required
- Parameter edits before another round: explicit human action
- Promotion of backtest-derived long-term lessons: explicit human approval, or existing
  promotion gate if we reuse that path

This prevents the system from blindly hill-climbing noise and keeps the demo honest.

## CLI Shape

Existing commands already cover most of the surface:

- `quantcode strategy`:
  generate strategies from the full research pipeline
- `quantcode check`:
  run keyless EOD backtests and pull relevant papers/news

Recommended extensions:

- `quantcode check --learn`
  Run one automatic backtest round and derive backtest lessons.

- `quantcode iterate [run_id] --strategy <name>`
  Re-run one strategy after explicit human approval, optionally with parameter changes.

- `quantcode live --paper`
  Future paper-trading / fresh-signal surface. Not required for the first learning upgrade.

## What "Learning" Should Mean

The system should not optimize directly for "good Sharpe at any cost."

It should learn bounded, interpretable lessons such as:

- `daily rebalance + weak Sharpe -> turnover likely too high`
- `high return + high drawdown -> tighten risk rules`
- `proxy signal underperformed -> deprioritize proxy variants`
- `volume-confirmed variant outperformed pure momentum -> prefer confirmation features`
- `signal worked only in one regime -> require robustness warning`

These lessons should be:

- structured enough to retrieve later
- attached to strategy family / signal type / risk pattern
- grounded in actual measured outcomes

## Memory Policy

Preferred lesson priority:

1. backtest-derived lessons
2. critique-derived lessons
3. feasibility / validation lessons

Backtest memory is stronger because it comes from measured outcomes rather than only
spec inspection.

Examples of durable memory entries:

- `warning`: daily-rebalance PEAD variants showed weak Sharpe net of the current construction
- `pattern`: short-horizon earnings-drift variants with return_5d ranking outperformed volume-ranked variants
- `data_constraint`: proxy-based earnings surprise signals produced unstable results; prefer direct earnings surprise data
- `mutation_rule`: when drawdown exceeds threshold, tighten stop-loss or reduce holding days before re-testing

## Why Not Fully Automatic Optimization

An unconstrained loop such as:

`generate -> backtest -> mutate -> backtest -> repeat until Sharpe is high`

is risky because it can:

- optimize noise
- overfit tiny universes / simplified data sources
- hide the difference between research and robust validation
- weaken the hackathon story if the loop looks clever but is statistically flimsy

The better compromise is:

`generate -> one automatic backtest -> human review -> approved next iteration`

## Backtest Output in the Terminal

The CLI should show metrics and a simple ASCII equity curve.

Example:

```text
Strategy: Post-Earnings Announcement Drift Momentum
Source: stooq/yahoo
Period: 2025-09-02 -> 2026-06-17
Return: +21.06%
Sharpe: 0.67
MaxDD: -8.77%
Win rate: 55.78%

Equity:
100 |##
105 |#####
110 |########
115 |###########
120 |##############
121 |###############
```

Or a wider sparkline-style rendering:

```text
Pnl curve:
100.0 ▁▂▂▃▃▄▅▅▆▆▇▇█ 121.1
```

The exact renderer can stay simple. The point is to make direction, smoothness, and
drawdown visible in the terminal without opening the dashboard.

## Papers and News

Each backtest review should print:

- papers used for strategy context
- recent news used for market context

This is already aligned with the current `quantcode check` path. The upgrade is mainly to
tie those references to the learning decision:

- what the strategy was based on
- what measured well or badly
- what should be changed before the next approved iteration

## Practical First Implementation

The smallest implementation that still counts as the right feature is:

1. keep `quantcode strategy` as the generation step
2. extend `quantcode check` with `--learn`
3. backtest each written strategy automatically once
4. derive simple structured lessons from metrics
5. print ASCII PnL curves, papers, and news
6. ask whether to iterate, change parameters, or stop
7. require human approval before any additional backtest round
8. store approved backtest-derived lessons into memory for later runs

## Implementation Plan

Phase 1 should be terminal-first and should not rewrite the core research pipeline.

1. Keep `quantcode strategy` as the strategy-generation command.
2. Extend `quantcode check` with a `--learn` mode.
3. In `--learn` mode, automatically run one backtest round on the selected strategies.
4. Print metrics, papers/news, and ASCII PnL curves.
5. Derive backtest lessons from the measured results.
6. Ask the human whether to stop, iterate once more, or adjust parameters first.
7. If the user approves another round, run one additional backtest/revision cycle.
8. After approval, promote the backtest-derived lessons through the existing memory path.

Phase 1 should remain bounded. No open-ended optimization loop.

## Exact File Touches

The intended ownership split is:

- `quantcode/cli/__init__.py`
  Own the `check --learn` flow, user prompt, parameter edits, ASCII rendering, and round
  control.

- `quantcode/dashboard/backtest.py`
  Stay the backtest engine. Reuse it as-is for measured metrics instead of creating a second
  evaluator.

- `quantcode/memory/curator.py`
  Reuse the existing promotion gate for approved lessons.

- `quantcode/schemas/__init__.py`
  Add the minimum structured type(s) needed for backtest-derived lesson generation if the
  existing `Lesson` schema is not enough.

- `quantcode/workspace/__init__.py`
  Reuse versioned YAML writes for revised strategies. Each approved iteration should write a
  new versioned strategy file rather than mutating the existing one in place.

- `improved_backtest_learning.md`
  This document is the source of truth for the intended behavior until implementation is
  complete.

Files that should stay unchanged in Phase 1:

- `quantcode/pipeline/__init__.py`
  Keep the current main research pipeline intact.

- `quantcode/tools/experiment_runner.py`
  Keep the stub honest and unchanged.

## Data Model Changes

Phase 1 should avoid a big schema expansion.

Preferred approach:

- Keep using the existing `Lesson` model for backtest-derived memory.
- Generate `Lesson.kind` values from the existing enum:
  - `warning`
  - `pattern`
  - `data_constraint`
  - `mutation_rule`

Suggested lesson text patterns:

- `warning`: `daily rebalance + Sharpe 0.28 + maxDD -18% -> likely turnover/cost pressure`
- `pattern`: `return_5d PEAD variants outperformed volume-ranked PEAD variants in this run`
- `data_constraint`: `proxy-based earnings signal underperformed cleaner signals`
- `mutation_rule`: `when Sharpe < 0.5 and maxDD < -0.1, reduce holding period or tighten risk rules before re-test`

Do not introduce a separate long-lived backtest-memory subsystem in Phase 1.

## Prompt / Approval Flow

The CLI approval flow should be deterministic and explicit.

Round 1:

- `quantcode check --learn` runs backtests automatically.
- It prints metrics, references, and ASCII curves.
- It prints the derived lessons.

Then the CLI asks:

```text
Next step?
1. Stop and keep current outputs
2. Iterate once more with current parameters
3. Edit parameters, then iterate once more
```

If the user picks `1`:

- no second backtest round
- approved lessons can still be promoted if the command is in learn mode

If the user picks `2`:

- run one more round
- write revised strategy YAML as a new version
- require explicit confirmation before starting the round

If the user picks `3`:

- allow a small fixed parameter edit surface
- show the changed values before running
- require explicit confirmation before starting the round

No additional rounds should run without another explicit approval.

## Parameter Changes

Phase 1 should keep parameter editing narrow and predictable.

Allow only:

- `ranking_rule.top_n`
- `risk_rules.max_holding_days`
- `portfolio_rules.rebalance_frequency`
- `risk_rules.stop_loss`

Do not allow free-form edits to:

- feature names
- strategy-family labels
- arbitrary entry/exit rule rewriting
- universe changes

Those belong to a later, more deliberate mutation path.

## Strategy Revision Policy

Iteration should create new versioned strategies, not overwrite the original.

Rules:

- start from the saved `StrategySpec`
- apply approved parameter changes
- optionally apply one small automatic mutation rule derived from the backtest lesson
- validate the revised spec with the existing validator
- if valid, write a new versioned YAML
- backtest that revised version

If validation fails, stop and report the failure instead of silently repairing it.

## Memory Write Policy

Backtest-derived lessons should only become durable memory after explicit approval.

Phase 1 policy:

- automatic first backtest: yes
- automatic memory promotion from that backtest: no
- promote only after the user approves the lessons or the next iteration path

Reuse the existing `MemoryCurator.promote(..., approved=...)` gate where possible.

## Definition Of Done

This feature is done when all of the following are true:

1. `quantcode check --learn` exists and runs one automatic backtest round.
2. The terminal output includes:
   - strategy metrics
   - ASCII PnL curve
   - relevant papers
   - recent news
   - derived backtest lessons
3. The command asks for explicit human approval before any second round.
4. Parameter changes are supported through the fixed allowlist only.
5. Approved second-round iterations write versioned strategy YAML files.
6. Approved backtest-derived lessons are stored through the existing memory gate.
7. A later `quantcode strategy` run can retrieve those lessons and use them as context.
8. The existing pipeline still reports the planned experiment path honestly; no silent change
   to `ExperimentRunnerStub`.

## Non-Goals

Not part of this first upgrade:

- broker execution
- auto-trading
- unconstrained optimizer loops
- claiming production-grade backtesting rigor
- replacing the existing honesty around planned vs executed experiments without making
  that transition explicit in the product

## Summary

The right learning loop is:

`generate -> automatic first backtest -> show metrics + papers/news + ASCII curve -> human decides next step -> approved iteration -> store backtest-derived lessons`

That is stronger than the current system, still honest for the hackathon, and more useful
than a purely critique-driven memory loop.
