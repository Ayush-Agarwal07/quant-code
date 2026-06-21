// Read-only client for the QuantCode dashboard API. All calls go through the
// Next.js rewrite at /api/backend/* (see next.config.js), so they work from the
// browser without CORS config. GETs only — this dashboard never mutates anything.

import type {
  ContextPack,
  EpisodeRecord,
  Overview,
  QuantResearchPacket,
  RunSummary,
  ScoredLesson,
  StrategyCatalogItem,
} from "@/types";

const BASE = "/api/backend";

/** Thrown when the API responds non-2xx. Callers surface a friendly empty state. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : "network error");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  overview: (signal?: AbortSignal) => get<Overview>("/overview", signal),
  runs: (signal?: AbortSignal) => get<RunSummary[]>("/runs", signal),
  /** Flat trader-facing catalog: every strategy across runs, joined with its critique verdict. */
  strategies: (signal?: AbortSignal) => get<StrategyCatalogItem[]>("/strategies", signal),
  latestRun: (signal?: AbortSignal) => get<QuantResearchPacket>("/runs/latest", signal),
  run: (runId: string, signal?: AbortSignal) =>
    get<QuantResearchPacket>(`/runs/${encodeURIComponent(runId)}`, signal),
  compaction: (runId: string, signal?: AbortSignal) =>
    get<ContextPack>(`/compaction/${encodeURIComponent(runId)}`, signal),
  /** With `q`: live Redis vector search. Without: list all produced lessons (score null). */
  lessons: (q?: string, k = 8, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("k", String(k));
    return get<ScoredLesson[]>(`/memory/lessons?${params.toString()}`, signal);
  },
  episodes: (signal?: AbortSignal) => get<EpisodeRecord[]>("/memory/episodes", signal),
};
