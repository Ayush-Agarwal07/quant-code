import { NextResponse } from "next/server";

import { DashboardDataError, saveStrategy } from "@/lib/server/dashboardData";
import type { StrategySpec } from "@/types";

interface SaveStrategyRequest {
  run_id?: string;
  strategy_name?: string;
  spec?: StrategySpec;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SaveStrategyRequest;
    if (!body.run_id || !body.strategy_name || !body.spec) {
      return NextResponse.json({ error: "run_id, strategy_name, and spec are required" }, { status: 400 });
    }
    return NextResponse.json(await saveStrategy(body.run_id, body.strategy_name, body.spec));
  } catch (error) {
    if (error instanceof DashboardDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
