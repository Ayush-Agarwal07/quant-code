import type { BacktestResult, StrategySpec } from "@/types";

export interface IterationDraft {
  runId: string;
  strategyName: string;
  spec: StrategySpec;
  backtest: BacktestResult | null;
  savedAt: number;
}

function key(runId: string, strategyName: string): string {
  return `iteration-draft::${runId}::${strategyName}`;
}

export function readIterationDraft(runId: string, strategyName: string): IterationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(runId, strategyName));
    return raw ? (JSON.parse(raw) as IterationDraft) : null;
  } catch {
    return null;
  }
}

export function writeIterationDraft(draft: IterationDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(draft.runId, draft.strategyName), JSON.stringify(draft));
}

export function clearIterationDraft(runId: string, strategyName: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(runId, strategyName));
}
