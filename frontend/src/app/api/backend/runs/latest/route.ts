import { NextResponse } from "next/server";

import { DashboardDataError, readRun } from "@/lib/server/dashboardData";

export async function GET() {
  try {
    return NextResponse.json(await readRun("latest"));
  } catch (error) {
    if (error instanceof DashboardDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
