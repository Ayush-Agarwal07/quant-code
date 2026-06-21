import { NextResponse } from "next/server";

import { derivedReading } from "@/lib/research";
import { DashboardDataError, readRun } from "@/lib/server/dashboardData";

interface ReadingRequest {
  run_id?: string;
  strategy_name?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ReadingRequest;
    const run = await readRun(body.run_id ?? "latest");
    const strategy =
      run.strategy_specs.find((spec) => spec.strategy_name === body.strategy_name) ??
      run.strategy_specs[0];

    if (!strategy) {
      return NextResponse.json(
        { error: "No strategies available for curated reading" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      reading: derivedReading(run, strategy),
      provider: "workspace",
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
