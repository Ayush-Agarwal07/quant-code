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
