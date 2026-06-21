import { NextResponse } from "next/server";

import { DashboardDataError, readContextPack } from "@/lib/server/dashboardData";

export async function GET(_request: Request, { params }: { params: { run_id: string } }) {
  try {
    return NextResponse.json(await readContextPack(params.run_id));
  } catch (error) {
    if (error instanceof DashboardDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

