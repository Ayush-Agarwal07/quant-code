import { NextResponse } from "next/server";

import { DashboardDataError, readContextPack } from "@/lib/server/dashboardData";

export async function GET(_request: Request, { params }: { params: Promise<{ run_id: string }> }) {
  const { run_id } = await params;
  try {
    return NextResponse.json(await readContextPack(run_id));
  } catch (error) {
    if (error instanceof DashboardDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

