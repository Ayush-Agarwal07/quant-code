// Client for the QuantCode dashboard API. Calls go through the
// Next.js rewrite at /api/backend/* (see next.config.js), so they work from the
// browser without CORS config. Most calls are reads; explicit WRITE methods say so.

import type {
  AgentChatResponse,
  AgentCommandCreateResponse,
  AgentCommandJob,
  AgentCommandRequest,
  BacktestResponse,
  ContextPack,
  CreateRunResponse,
  CuratedReadingResponse,
  DraftStrategyResponse,
  EpisodeRecord,
  Overview,
  QuantResearchPacket,
  RunJob,
  RunSummary,
  SaveStrategyResponse,
  ScoredLesson,
  StrategyCatalogItem,
  StrategySpec,
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

/** POST helper for agent/write endpoints. */
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
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
  /** Grounded mock/LLM chat over a run's first (or named) strategy. Read-only. */
  agentChat: (
    body: { message: string; run_id?: string; strategy_name?: string },
    signal?: AbortSignal
  ) => post<AgentChatResponse>("/agent/chat", body, signal),
  /** Draft (not persist) a StrategySpec from a free-text idea. Read-only. */
  draftStrategy: (body: { idea: string; run_id?: string }, signal?: AbortSignal) =>
    post<DraftStrategyResponse>("/agent/draft-strategy", body, signal),
  /** Curated reading list + market alerts for a strategy (LLM when live, derived when mock). */
  reading: (body: { run_id?: string; strategy_name?: string }, signal?: AbortSignal) =>
    post<CuratedReadingResponse>("/agent/reading", body, signal),
  /** Real keyless EOD backtest of a strategy (simulated fallback when prices unreachable). */
  backtest: (body: { run_id?: string; strategy_name?: string }, signal?: AbortSignal) =>
    post<BacktestResponse>("/agent/backtest", body, signal),
  /** WRITE: persist an edited strategy into the run JSON + workspace strategy YAML. */
  saveStrategy: (
    body: { run_id: string; strategy_name: string; spec: StrategySpec },
    signal?: AbortSignal
  ) => post<SaveStrategyResponse>("/strategies/save", body, signal),
  /** WRITE: launch the real research pipeline in the background; returns a job to poll.
   * Under /agent/* so it doesn't collide with the Next GET route handler at /api/backend/runs. */
  createRun: (body: { objective: string; promote?: boolean }, signal?: AbortSignal) =>
    post<CreateRunResponse>("/agent/run", body, signal),
  runJob: (jobId: string, signal?: AbortSignal) =>
    get<RunJob>(`/agent/run/${encodeURIComponent(jobId)}`, signal),
  command: (body: AgentCommandRequest, signal?: AbortSignal) =>
    post<AgentCommandCreateResponse>("/agent/command", body, signal),
  commandJob: (jobId: string, signal?: AbortSignal) =>
    get<AgentCommandJob>(`/agent/command/${encodeURIComponent(jobId)}`, signal),
};
