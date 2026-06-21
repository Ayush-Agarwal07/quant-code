# Handoff — Iterate auto-revise fix & backend state (2026-06-21)

## TL;DR
The GUI **Iterate** action used to rerun the *identical* strategy → identical Sharpe / return /
PnL / papers / news. Fixed: `iterate` with no explicit adjustments now **auto-revises from a
baseline backtest** and produces different, explainable results. Backend-only change in
`quantcode/dashboard/api.py`; no frontend change required for differing results to appear.

## The fix (uncommitted — `quantcode/dashboard/api.py`)
- New `_auto_adjust(spec, baseline_result) -> (StrategyAdjustments, why)`: deterministic,
  explainable revision **grounded in a baseline backtest**. Weak Sharpe (<0.5) / deep drawdown
  (≤ −20%) → tighten (shorter holding + faster cadence); decent edge → give it room.
- Steps `rebalance_frequency` to a **guaranteed-different** cadence (`_FASTER_REBAL` /
  `_SLOWER_REBAL` maps), so the backtest result always changes.
- Iterate path: if `request.adjustments is None` → run `run_backtest(spec)` baseline, auto-adjust,
  apply. **Explicit `request.adjustments` still take precedence** (ready for a UI form later).
- Response now always carries `adjusted_spec` + a new `iteration_note`
  (e.g. `"baseline Sharpe 2.95 ok — more room: 25d / weekly"`) for iterate.

### Verified
`CHECK monthly +2.95 → ITERATE weekly +1.51` (DIFFERENT=True). My added lines are ruff- and
mypy-clean. Repro:
```python
from quantcode.dashboard.api import _auto_adjust, _apply_adjustments
from quantcode.dashboard.backtest import run_backtest
base = run_backtest(spec); adj, why = _auto_adjust(spec, base)
itr = run_backtest(_apply_adjustments(spec, adj))   # different metrics
```

## ⚠️ Key finding — `max_holding_days` is INERT in the backtest
`run_backtest` only reacts to `rebalance_frequency` (via `_STEP`), `top_n`, and `feature/order`.
`StrategyAdjustments` exposes `max_holding_days`, but changing it does **not** move backtest
metrics (it's still meaningful for live/paper trading). The cadence is what moves results today.
→ If you want holding-period or `top_n` to affect backtests, wire them into `run_backtest`
(`quantcode/dashboard/backtest.py`) **and** add `top_n` to `StrategyAdjustments`.

## 🔴 Blocking gate issues — PRE-EXISTING (not from the iterate fix)
These were already red in the newly-added dashboard/cli code; left untouched (mid-dev):
- **pytest**: `cli` self-check (`python -m quantcode.cli`) hits an interactive `typer.prompt`
  ("next action [stop|iterate|adjust]") and aborts headless → CI red until that flow guards
  non-interactive stdin (or the self-check stops running the interactive learn path).
- **mypy**: `quantcode/dashboard/api.py:486/487/516` — `object`-typed values in the papers/news
  handling (`float(object)`, `.items()` on `object`, `list(object)`).
- **ruff**: ~10 `E501` long f-strings in `api.py`.

## Follow-ups (from the product plan)
1. **Frontend HITL form** — let the user edit `max_holding_days` / `rebalance_frequency` (and
   ideally `top_n`) before rerun; the backend already accepts these via `request.adjustments`.
   Render `iteration_note` + before/after metrics so the change is visible.
2. **Make holding/top_n actually affect the backtest** (see Key finding) so user edits move results.
3. **Fix the pre-existing gate issues** above so CI is green.

## Repo state
- Last commit: `f5bf554 Polish dashboard widgets`.
- Uncommitted: `quantcode/dashboard/api.py` (this fix) + frontend pages + `quantcode/llm/providers.py`
  (the latter two not part of this fix).
- Backend tasks done & verified this session: 02 Redis · 04 Browserbase · 05 compaction ·
  06 lesson-quality · 07 prewarm · 08 benchmarks (see `leftover_tasks/`). 03 live-Claude is the
  only remaining backend leftover (HITL/cost).
- Full setup/run instructions: root `README.md` → "Setup & Run".
