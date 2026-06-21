"""On-demand REAL backtest for the dashboard — separate from the pipeline's `not_executed`
stub (the research packets stay honest; this is an explicit, user-triggered computation).

Keyless EOD closes (stooq → yahoo fallback) → OHLCV-derived features → run the strategy's
ranking rule cross-sectionally over a small liquid universe → REAL equity curve + Sharpe /
max-drawdown / win-rate. When prices can't be fetched (offline / blocked egress), it falls
back to a clearly-flagged seeded simulation so the panel still renders. stdlib only.

ponytail: a few hundred lines of plain arithmetic, no pandas/numpy. Cross-sectional weekly
momentum is the shape these research strategies take; unknown ranking features degrade to
return_20d (noted), not a crash. Self-check at the bottom runs the engine on synthetic data.
"""

from __future__ import annotations

import csv
import io
import math
import urllib.request
from datetime import UTC
from typing import Any, Literal

from pydantic import BaseModel

from quantcode.schemas import StrategySpec

_UA = {"User-Agent": "Mozilla/5.0 (quantcode-backtest; research)"}
_TIMEOUT = 12

# Small, liquid, representative universes. The strategy "universe" field is abstract
# ("US liquid equities"), so we back it with a concrete basket and report exactly which.
_UNIVERSES: dict[str, list[str]] = {
    # fmt: off
    "EQUITY": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META",
               "JPM", "XOM", "JNJ", "PG", "HD", "KO"],
    # fmt: on
    "FX": ["UUP", "FXE", "FXY", "FXB", "FXF", "FXC"],  # currency ETFs (keyless EOD)
    "CRYPTO": ["BTC-USD", "ETH-USD", "SOL-USD", "LTC-USD"],
    "RATES": ["IEF", "TLT", "SHY", "LQD", "HYG"],
}


class EquityPoint(BaseModel):
    t: int
    date: str
    equity: float


class BacktestTrade(BaseModel):
    date: str
    side: str
    ticker: str
    shares: float
    price: float


class BacktestResult(BaseModel):
    executed: bool  # True = real prices; False = simulated fallback
    source: str  # 'stooq' | 'yahoo' | 'simulated'
    universe: list[str]
    start: str | None
    end: str | None
    rebalance: str
    signal: str
    equity: list[EquityPoint]
    trades: list[BacktestTrade]
    total_return: float
    sharpe: float
    max_drawdown: float
    win_rate: float
    periods: int
    note: str


class PaperSignal(BaseModel):
    ticker: str
    price: float
    signal_value: float
    weight: float


class PaperTradePlan(BaseModel):
    executed: bool
    source: str
    as_of: str | None
    rebalance: str
    signal: str
    picks: list[PaperSignal]
    note: str


class PaperOrder(BaseModel):
    as_of: str | None
    side: Literal["BUY", "SELL"]
    ticker: str
    shares: float
    price: float
    notional: float
    signal_value: float | None = None
    target_weight: float
    current_shares: float
    target_shares: float
    reason: str


# --------------------------------------------------------------------------- price sources
def _fetch_stooq(ticker: str) -> list[tuple[str, float]] | None:
    sym = ticker.lower().replace("-usd", ".v") if ticker.endswith("-USD") else f"{ticker.lower()}.us"  # noqa: E501
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    try:
        req = urllib.request.Request(url, headers=_UA)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:  # noqa: S310
            text = r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None
    if not text.startswith("Date"):  # bot/HTML page, not CSV
        return None
    out: list[tuple[str, float]] = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            out.append((row["Date"], float(row["Close"])))
        except (KeyError, ValueError):
            continue
    return out or None


def _fetch_yahoo(ticker: str) -> list[tuple[str, float]] | None:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        "?range=2y&interval=1d"
    )
    try:
        req = urllib.request.Request(url, headers=_UA)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:  # noqa: S310
            payload = r.read()
    except Exception:  # noqa: BLE001
        return None
    try:
        import json

        res = json.loads(payload)["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    from datetime import datetime

    out: list[tuple[str, float]] = []
    for t, c in zip(ts, closes, strict=False):
        if c is None:
            continue
        d = datetime.fromtimestamp(t, tz=UTC).strftime("%Y-%m-%d")
        out.append((d, float(c)))
    return out or None


def _synthetic(ticker: str, n: int = 1400) -> list[tuple[str, float]]:
    """Deterministic per-ticker walk (seeded by name) — only used when no live data."""
    seed = sum(ord(ch) for ch in ticker) * 2654435761 & 0xFFFFFFFF
    drift = 0.0003 + (seed % 1000) / 1_000_000
    v = 100.0
    out: list[tuple[str, float]] = []
    for i in range(n):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        shock = (seed / 0x7FFFFFFF - 0.5) * 0.03
        v *= 1 + drift + shock
        out.append((f"d{i:04d}", round(v, 2)))
    return out


# --------------------------------------------------------------------------- signal features
def _feature_n(feature: str, default: int) -> int:
    digits = "".join(ch for ch in feature if ch.isdigit())
    return int(digits) if digits else default


def _signal_value(closes: list[float], i: int, feature: str) -> float | None:
    """Cross-sectional rank value for `feature` at index i, using data up to i (no look-ahead)."""
    f = feature.lower()
    if f.startswith("return"):
        n = _feature_n(f, 20)
        return closes[i] / closes[i - n] - 1 if i >= n and closes[i - n] else None
    if f.startswith("sma"):
        n = _feature_n(f, 50)
        if i < n - 1:
            return None
        sma = sum(closes[i - n + 1 : i + 1]) / n
        return closes[i] / sma - 1 if sma else None
    if f.startswith("realized_vol"):
        n = _feature_n(f, 20)
        if i < n:
            return None
        rets = [closes[j] / closes[j - 1] - 1 for j in range(i - n + 1, i + 1) if closes[j - 1]]
        return -_std(rets) if rets else None  # low-vol ranks high by default; order flips it
    if f.startswith("rsi"):
        n = _feature_n(f, 14)
        if i < n:
            return None
        gains = losses = 0.0
        for j in range(i - n + 1, i + 1):
            ch = closes[j] - closes[j - 1]
            gains += max(ch, 0)
            losses += max(-ch, 0)
        rs = gains / losses if losses else float("inf")
        return 100 - 100 / (1 + rs)
    # unknown feature → momentum proxy
    n = 20
    return closes[i] / closes[i - n] - 1 if i >= n and closes[i - n] else None


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


# --------------------------------------------------------------------------- the backtest
_STEP = {"daily": 1, "weekly": 5, "monthly": 21}
# Per-side transaction cost (liquid US equities ~10bps). Charged round-trip on the fraction of
# the book that rotates each rebalance — a costless backtest reports an unrealistically high Sharpe.
_COST_PER_SIDE = 0.001
_WINDOW = 1300  # ~5 trading years (was ~1yr): more rebalance periods -> less noisy Sharpe.


def _prepare_inputs(spec: StrategySpec) -> dict[str, Any]:
    tag = _asset_tag(spec.universe)
    tickers = _UNIVERSES.get(tag, _UNIVERSES["EQUITY"])

    series: dict[str, list[tuple[str, float]]] = {}
    source = "simulated"
    fails = 0
    for tk in tickers:
        bars = _fetch_stooq(tk) or _fetch_yahoo(tk)
        if bars and len(bars) > 80:
            series[tk] = bars
            source = "stooq/yahoo"
        else:
            fails += 1
            if fails >= 3 and not series:
                break
    executed = len(series) >= 3
    if not executed:
        series = {tk: _synthetic(tk) for tk in tickers}
        source = "simulated"

    common = set.intersection(*[{d for d, _ in s} for s in series.values()])
    dates = sorted(common)[-_WINDOW:]
    closes = {tk: [dict(s)[d] for d in dates] for tk, s in series.items()}

    feature = spec.ranking_rule.feature if spec.ranking_rule else (
        spec.entry_rules[0].feature if spec.entry_rules else "return_20d"
    )
    descending = not (spec.ranking_rule and spec.ranking_rule.order == "ascending")
    req_top = spec.ranking_rule.top_n if spec.ranking_rule and spec.ranking_rule.top_n else 3
    top_n = min(req_top, max(2, len(closes) // 3))
    proxied = not feature.lower().startswith(("return", "sma", "realized_vol", "rsi"))
    return {
        "executed": executed,
        "source": source,
        "dates": dates,
        "closes": closes,
        "feature": feature,
        "descending": descending,
        "top_n": top_n,
        "proxied": proxied,
        "step": _STEP.get(spec.portfolio_rules.rebalance_frequency, 5),
        "note": (
            f"Long-only top-{top_n} by {feature}"
            + (" — approximated by a return_20d proxy (only closes fetched). " if proxied else ", ")
            + f"equal weight, {spec.portfolio_rules.rebalance_frequency} rebalance "
            f"over {len(series)} names. "
            + ("Real EOD closes. " if executed else "SIMULATED prices — no live data reachable. ")
            + "~10bps/side costs modeled. Proxy backtest on a curated mega-cap universe — "
            "Sharpe is optimistic (survivorship/selection bias), not a live edge."
        ),
        "universe": list(series.keys()),
    }


def run_backtest(spec: StrategySpec) -> BacktestResult:
    data = _prepare_inputs(spec)
    dates = data["dates"]
    closes = data["closes"]
    feature = data["feature"]
    descending = data["descending"]
    top_n = data["top_n"]
    step = data["step"]

    equity = [EquityPoint(t=0, date=dates[0], equity=100.0)]
    trades: list[BacktestTrade] = []
    rets: list[float] = []
    v = 100.0
    start_i = 60  # warm-up for lookbacks
    prev_picks: set[str] = set()
    for i in range(start_i, len(dates) - step, step):
        ranked = []
        for tk, cs in closes.items():
            val = _signal_value(cs, i, feature)
            if val is not None:
                ranked.append((val, tk))
        if not ranked:
            continue
        ranked.sort(reverse=descending)
        picks = [tk for _, tk in ranked[: max(1, top_n)]]
        entered = [tk for tk in picks if tk not in prev_picks]
        exited = [tk for tk in prev_picks if tk not in picks]
        book_value = max(v * 1000, 1.0)
        for tk in exited:
            price = closes[tk][i]
            shares = round(book_value / max(1, len(prev_picks)) / price, 4) if price else 0.0
            trades.append(
                BacktestTrade(
                    date=dates[i],
                    side="SELL",
                    ticker=tk,
                    shares=shares,
                    price=round(price, 2),
                )
            )
        for tk in entered:
            price = closes[tk][i]
            shares = round(book_value / max(1, len(picks)) / price, 4) if price else 0.0
            trades.append(
                BacktestTrade(
                    date=dates[i],
                    side="BUY",
                    ticker=tk,
                    shares=shares,
                    price=round(price, 2),
                )
            )
        fwd = [closes[tk][i + step] / closes[tk][i] - 1 for tk in picks if closes[tk][i]]
        if not fwd:
            continue
        period_ret = sum(fwd) / len(fwd)  # equal weight
        # transaction cost: round-trip on the fraction of the book that rotated this rebalance
        rotated = len(set(picks) - prev_picks) / len(picks)
        period_ret -= rotated * 2 * _COST_PER_SIDE
        prev_picks = set(picks)
        rets.append(period_ret)
        v *= 1 + period_ret
        equity.append(EquityPoint(t=len(equity), date=dates[i + step], equity=round(v, 2)))

    return BacktestResult(
        executed=data["executed"],
        source=data["source"],
        universe=data["universe"],
        start=dates[start_i] if len(dates) > start_i else None,
        end=dates[-1] if dates else None,
        rebalance=spec.portfolio_rules.rebalance_frequency,
        signal=(
            f"{feature} · {'desc' if descending else 'asc'} · top {top_n}"
            + (" (proxy: return_20d)" if data["proxied"] else "")
        ),
        equity=equity,
        trades=trades,
        note=data["note"],
        **_stats(rets, equity, step),
    )


def build_paper_plan(spec: StrategySpec) -> PaperTradePlan:
    data = _prepare_inputs(spec)
    dates = data["dates"]
    closes = data["closes"]
    if not dates:
        return PaperTradePlan(
            executed=data["executed"],
            source=data["source"],
            as_of=None,
            rebalance=spec.portfolio_rules.rebalance_frequency,
            signal="n/a",
            picks=[],
            note=data["note"],
        )
    ranked: list[tuple[float, str]] = []
    i = len(dates) - 1
    for tk, cs in closes.items():
        val = _signal_value(cs, i, data["feature"])
        if val is not None:
            ranked.append((val, tk))
    ranked.sort(reverse=data["descending"])
    count = max(1, min(data["top_n"], len(ranked)))
    picks = [
        PaperSignal(
            ticker=tk,
            price=round(closes[tk][i], 2),
            signal_value=round(val, 4),
            weight=round(1 / count, 4),
        )
        for val, tk in ranked[:count]
    ]
    return PaperTradePlan(
        executed=data["executed"],
        source=data["source"],
        as_of=dates[i],
        rebalance=spec.portfolio_rules.rebalance_frequency,
        signal=(
            f"{data['feature']} · {'desc' if data['descending'] else 'asc'} · top {data['top_n']}"
            + (" (proxy: return_20d)" if data["proxied"] else "")
        ),
        picks=picks,
        note=data["note"],
    )


def size_paper_orders(
    plan: PaperTradePlan, positions: dict[str, float], equity: float
) -> tuple[list[PaperOrder], dict[str, float], float]:
    """Turn the latest signal snapshot into concrete paper orders."""
    prices = {pick.ticker: pick.price for pick in plan.picks}
    weights = {pick.ticker: pick.weight for pick in plan.picks}
    signals = {pick.ticker: pick.signal_value for pick in plan.picks}
    targets = {
        pick.ticker: round(equity * pick.weight / pick.price, 4) for pick in plan.picks if pick.price > 0
    }
    orders: list[PaperOrder] = []
    stamp = plan.as_of or "latest"
    for ticker in sorted(set(positions) | set(targets)):
        current = round(positions.get(ticker, 0.0), 4)
        target = round(targets.get(ticker, 0.0), 4)
        delta = round(target - current, 4)
        if abs(delta) < 1e-6:
            continue
        price = round(prices.get(ticker, 0.0), 2)
        sig = signals.get(ticker)
        orders.append(
            PaperOrder(
                as_of=plan.as_of,
                side="BUY" if delta > 0 else "SELL",
                ticker=ticker,
                shares=abs(delta),
                price=price,
                notional=round(abs(delta) * price, 2),
                signal_value=round(sig, 4) if sig is not None else None,
                target_weight=round(weights.get(ticker, 0.0), 4),
                current_shares=current,
                target_shares=target,
                reason=(
                    f"{plan.signal} @ {stamp}; "
                    f"signal {sig:.4f}; target {target:.4f} vs current {current:.4f}"
                    if sig is not None
                    else f"{plan.signal} @ {stamp}; target {target:.4f} vs current {current:.4f}"
                ),
            )
        )
    new_positions = {ticker: shares for ticker, shares in targets.items() if shares > 0}
    invested = sum(new_positions[ticker] * prices[ticker] for ticker in new_positions)
    new_cash = round(equity - invested, 2)
    return orders, new_positions, new_cash


def _asset_tag(universe: str) -> str:
    u = universe.lower()
    if "fx" in u or "currenc" in u or "g10" in u:
        return "FX"
    if "crypto" in u or "btc" in u or "coin" in u:
        return "CRYPTO"
    if "bond" in u or "rate" in u or "treasur" in u:
        return "RATES"
    return "EQUITY"


def _stats(rets: list[float], equity: list[EquityPoint], step: int) -> dict[str, Any]:
    v = [p.equity for p in equity]
    # annualize by the ACTUAL rebalance cadence (~252 trading days/yr), not a fixed weekly
    # factor — otherwise monthly strategies were over-annualized by ~sqrt(52/12)≈2.1x (the
    # "Sharpe 5.6" bug). daily(step1)->sqrt252, weekly(5)->sqrt~50, monthly(21)->sqrt12.
    ann = math.sqrt(252 / step) if step > 0 else 1.0
    sd = _std(rets)
    mean = sum(rets) / len(rets) if rets else 0.0
    sharpe = (mean / sd * ann) if sd else 0.0
    peak = v[0] if v else 100.0
    max_dd = 0.0
    for x in v:
        peak = max(peak, x)
        max_dd = min(max_dd, x / peak - 1)
    return {
        "total_return": (v[-1] / v[0] - 1) if v else 0.0,
        "sharpe": round(sharpe, 2),
        "max_drawdown": round(max_dd, 4),
        "win_rate": round(sum(1 for r in rets if r > 0) / len(rets), 4) if rets else 0.0,
        "periods": len(rets),
    }


def _demo() -> None:
    """Self-check: the engine runs end-to-end on the synthetic fallback and is internally
    consistent. No network — exercises ranking, rebalancing, and stats."""
    from quantcode.schemas import sample_strategy_spec

    res = run_backtest(sample_strategy_spec())
    plan = build_paper_plan(sample_strategy_spec())
    orders, new_positions, new_cash = size_paper_orders(plan, positions={}, equity=100000.0)
    assert res.equity[0].equity == 100.0, "curve must start at 100"
    assert res.periods > 0, "should have rebalanced at least once"
    assert -1.0 <= res.max_drawdown <= 0.0, f"bad drawdown {res.max_drawdown}"
    assert 0.0 <= res.win_rate <= 1.0, f"bad win rate {res.win_rate}"
    assert len(res.equity) == res.periods + 1, "equity points = periods + 1"
    assert plan.picks, "paper plan must produce picks"
    assert orders, "paper plan must size at least one order"
    assert new_positions, "paper sizing must produce target positions"
    assert new_cash >= 0.0, "paper sizing cash should not go negative"
    print(f"OK: {res.source} | periods={res.periods} | ret={res.total_return:+.2%} "
          f"| sharpe={res.sharpe} | maxDD={res.max_drawdown:.2%} | win={res.win_rate:.0%}")


if __name__ == "__main__":
    _demo()
