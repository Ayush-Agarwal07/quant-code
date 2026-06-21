import { NextResponse } from "next/server";

import { runSummaries } from "@/lib/server/dashboardData";

export async function GET() {
  return NextResponse.json(await runSummaries());
}

