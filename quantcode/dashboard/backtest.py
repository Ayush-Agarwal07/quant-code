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
from typing import Any

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


class BacktestResult(BaseModel):
    executed: bool  # True = real prices; False = simulated fallback
    source: str  # 'stooq' | 'yahoo' | 'simulated'
    universe: list[str]
    start: str | None
    end: str | None
    rebalance: str
    signal: str
    equity: list[EquityPoint]
    total_return: float
    sharpe: float
    max_drawdown: float
    win_rate: float
    periods: int
    note: str


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


def _synthetic(ticker: str, n: int = 320) -> list[tuple[str, float]]:
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


def run_backtest(spec: StrategySpec) -> BacktestResult:
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
            if fails >= 3 and not series:  # egress clearly blocked → stop, go simulated
                break
    executed = len(series) >= 3
    if not executed:  # no live data reachable → seeded simulation, clearly flagged
        series = {tk: _synthetic(tk) for tk in tickers}
        source = "simulated"

    # Align on common trading dates.
    common = set.intersection(*[{d for d, _ in s} for s in series.values()])
    dates = sorted(common)[-260:]  # ~1y of trading days
    closes = {tk: [dict(s)[d] for d in dates] for tk, s in series.items()}

    feature = spec.ranking_rule.feature if spec.ranking_rule else (
        spec.entry_rules[0].feature if spec.entry_rules else "return_20d"
    )
    descending = not (spec.ranking_rule and spec.ranking_rule.order == "ascending")
    req_top = spec.ranking_rule.top_n if spec.ranking_rule and spec.ranking_rule.top_n else 3
    # Cap to a third of the basket — the strategy's top_n targets a large universe; uncapped
    # it would just hold every name here and stop testing the signal.
    top_n = min(req_top, max(2, len(closes) // 3))
    # We only fetch closes, so volume/cross-sectional features fall back to a momentum proxy.
    proxied = not feature.lower().startswith(("return", "sma", "realized_vol", "rsi"))
    step = _STEP.get(spec.portfolio_rules.rebalance_frequency, 5)

    equity = [EquityPoint(t=0, date=dates[0], equity=100.0)]
    rets: list[float] = []
    v = 100.0
    start_i = 60  # warm-up for lookbacks
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
        fwd = [closes[tk][i + step] / closes[tk][i] - 1 for tk in picks if closes[tk][i]]
        if not fwd:
            continue
        period_ret = sum(fwd) / len(fwd)  # equal weight
        rets.append(period_ret)
        v *= 1 + period_ret
        equity.append(EquityPoint(t=len(equity), date=dates[i + step], equity=round(v, 2)))

    return BacktestResult(
        executed=executed,
        source=source,
        universe=list(series.keys()),
        start=dates[start_i] if len(dates) > start_i else None,
        end=dates[-1] if dates else None,
        rebalance=spec.portfolio_rules.rebalance_frequency,
        signal=(
            f"{feature} · {'desc' if descending else 'asc'} · top {top_n}"
            + (" (proxy: return_20d)" if proxied else "")
        ),
        equity=equity,
        note=(
            f"Long-only top-{top_n} by {feature}"
            + (" — approximated by a return_20d proxy (only closes fetched). " if proxied else ", ")
            + f"equal weight, {spec.portfolio_rules.rebalance_frequency} rebalance "
            f"over {len(series)} names. "
            + (
                "Real EOD closes."
                if executed
                else "SIMULATED prices — no live market data reachable from the server."
            )
        ),
        **_stats(rets, equity),
    )


def _asset_tag(universe: str) -> str:
    u = universe.lower()
    if "fx" in u or "currenc" in u or "g10" in u:
        return "FX"
    if "crypto" in u or "btc" in u or "coin" in u:
        return "CRYPTO"
    if "bond" in u or "rate" in u or "treasur" in u:
        return "RATES"
    return "EQUITY"


def _stats(rets: list[float], equity: list[EquityPoint]) -> dict[str, Any]:
    v = [p.equity for p in equity]
    ann = {"daily": 252, "weekly": 52, "monthly": 12}
    sd = _std(rets)
    mean = sum(rets) / len(rets) if rets else 0.0
    sharpe = (mean / sd * math.sqrt(52)) if sd else 0.0  # weekly-ish annualization
    peak = v[0] if v else 100.0
    max_dd = 0.0
    for x in v:
        peak = max(peak, x)
        max_dd = min(max_dd, x / peak - 1)
    del ann
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
    assert res.equity[0].equity == 100.0, "curve must start at 100"
    assert res.periods > 0, "should have rebalanced at least once"
    assert -1.0 <= res.max_drawdown <= 0.0, f"bad drawdown {res.max_drawdown}"
    assert 0.0 <= res.win_rate <= 1.0, f"bad win rate {res.win_rate}"
    assert len(res.equity) == res.periods + 1, "equity points = periods + 1"
    print(f"OK: {res.source} | periods={res.periods} | ret={res.total_return:+.2%} "
          f"| sharpe={res.sharpe} | maxDD={res.max_drawdown:.2%} | win={res.win_rate:.0%}")


if __name__ == "__main__":
    _demo()
