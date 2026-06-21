import { NextResponse } from "next/server";

import { overview } from "@/lib/server/dashboardData";

export async function GET() {
  return NextResponse.json(await overview());
}

