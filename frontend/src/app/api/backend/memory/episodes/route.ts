import { NextResponse } from "next/server";

import { allEpisodes } from "@/lib/server/dashboardData";

export async function GET() {
  return NextResponse.json(await allEpisodes());
}
