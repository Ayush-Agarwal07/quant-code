import { NextResponse } from "next/server";

import { scoredLessons } from "@/lib/server/dashboardData";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const k = Number.parseInt(url.searchParams.get("k") ?? "8", 10);
  const limit = Number.isFinite(k) && k > 0 ? k : 8;
  return NextResponse.json(await scoredLessons(url.searchParams.get("q"), limit));
}

