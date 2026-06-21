import { NextResponse } from "next/server";

import { backtestStats, simulatedCurve } from "@/lib/research";
import { DashboardDataError, readRun } from "@/lib/server/dashboardData";

interface BacktestRequest {
  run_id?: string;
  strategy_name?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as BacktestRequest;
    const upstream = process.env.NEXT_PUBLIC_API_URL;
    if (upstream) {
      const response = await fetch(`${upstream}/agent/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({ error: "invalid upstream response" }));
      return NextResponse.json(payload, { status: response.status });
    }

    const run = await readRun(body.run_id ?? "latest");
    const strategy =
      run.strategy_specs.find((spec) => spec.strategy_name === body.strategy_name) ??
      run.strategy_specs[0];

    if (!strategy) {
      return NextResponse.json(
        { error: "No strategies available for backtest preview" },
        { status: 404 }
      );
    }

    const curve = simulatedCurve(`${run.run_id}:${strategy.strategy_name}`, 60);
    const stats = backtestStats(curve);
    const trades = curve
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index > 0 && index % Math.max(1, Math.floor(curve.length / 12)) === 0)
      .map(({ point, index }) => ({
        date: `step ${point.t}`,
        side: point.equity >= (curve[index - 1]?.equity ?? point.equity) ? "BUY" : "SELL",
        ticker: strategy.strategy_family.toUpperCase(),
        shares: Number((50 + (point.equity % 35)).toFixed(4)),
        price: Number(point.equity.toFixed(2)),
      }))
      .reverse();

    return NextResponse.json({
      backtest: {
        executed: false,
        source: "research-preview",
        universe: [strategy.universe],
        start: null,
        end: null,
        rebalance: strategy.portfolio_rules.rebalance_frequency,
        signal: strategy.strategy_family,
        equity: curve.map((point) => ({
          t: point.t,
          date: `step ${point.t}`,
          equity: point.equity,
        })),
        trades,
        total_return: stats.totalReturn,
        sharpe: stats.sharpe,
        max_drawdown: stats.maxDD,
        win_rate: stats.winRate,
        periods: curve.length,
        note:
          "Preview only. This is a deterministic placeholder curve until the real market-data backtester is wired.",
      },
      run_id: run.run_id,
      strategy_name: strategy.strategy_name,
    });
  } catch (error) {
    if (error instanceof DashboardDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
