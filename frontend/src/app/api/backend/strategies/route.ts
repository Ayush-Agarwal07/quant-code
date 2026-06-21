import { NextResponse } from "next/server";

import { strategyCatalog } from "@/lib/server/dashboardData";

export async function GET() {
  return NextResponse.json(await strategyCatalog());
}

