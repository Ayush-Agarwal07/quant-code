"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Loader2, Play } from "lucide-react";

import { api } from "@/lib/api";
import { writeIterationDraft } from "@/lib/iterationDraft";
import type { AgentCommandJob, AgentCommandRequest, BacktestResult, StrategyAdjustments, StrategySpec } from "@/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultSummary(job: AgentCommandJob): string {
  const result = job.result;
  if (!result) return "Completed.";
  if (result.command === "strategy") {
    return `${result.strategy_count ?? 0} strategy spec(s) created in ${result.run_id ?? "the new run"}.`;
  }
  if (result.command === "check" || result.command === "iterate") {
    const backtest = result.backtest;
    if (!backtest) return "Backtest complete.";
    return `Sharpe ${(backtest.sharpe ?? 0).toFixed(2)} · return ${((backtest.total_return ?? 0) * 100).toFixed(1)}% · ${result.papers?.length ?? 0} papers · ${result.news?.length ?? 0} news.`;
  }
  const portfolio = result.paper_trade?.portfolio;
  if (!portfolio) return "Paper trade updated.";
  return `Equity $${(portfolio.equity ?? 0).toLocaleString()} · cash $${(portfolio.cash ?? 0).toLocaleString()} · ${result.paper_trade?.orders?.length ?? 0} order(s).`;
}

/** Minimal inline equity curve — no chart lib. green if up over the window, red if down. */
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const W = 240;
  const H = 40;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / span) * H).toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full rounded border border-border bg-card">
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function runLink(job: AgentCommandJob): string | null {
  if (!job.run_id) return null;
  return `/runs/${job.run_id}`;
}

export function CommandCard({
  request,
  title,
  detail,
  runLabel = "Run",
  onSaveIteration,
}: {
  request: AgentCommandRequest;
  title: string;
  detail: string;
  runLabel?: string;
  onSaveIteration?: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "done" | "error">("idle");
  const [job, setJob] = useState<AgentCommandJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState(request.objective ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manualAdjustments, setManualAdjustments] = useState<StrategyAdjustments>({});
  const isStrategy = request.command === "strategy";

  useEffect(() => {
    if (job?.status !== "done") return;
    const result = job.result;
    if (
      result?.command === "iterate" &&
      result.adjusted_spec &&
      result.run_id &&
      result.strategy_name
    ) {
      writeIterationDraft({
        runId: result.run_id,
        strategyName: result.strategy_name,
        spec: result.adjusted_spec,
        backtest: result.backtest ?? null,
        savedAt: Date.now(),
      });
    }
  }, [job]);

  const launch = async (adjustments?: StrategyAdjustments) => {
    setPhase("running");
    setError(null);
    setSaveState("idle");
    setSaveError(null);
    try {
      const payload = isStrategy
        ? { ...request, objective: objective.trim() || request.objective }
        : adjustments
          ? { ...request, adjustments }
          : request;
      const { job_id } = await api.command(payload);
      for (let n = 0; n < 180; n++) {
        const next = await api.commandJob(job_id);
        setJob(next);
        if (next.status === "done") {
          setPhase("done");
          return;
        }
        if (next.status === "error") {
          setError(next.error ?? "command failed");
          setPhase("error");
          return;
        }
        await sleep(1500);
      }
      setError("timed out after ~4.5 min");
      setPhase("error");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (job?.result?.command !== "iterate") return;
    setSaveState("idle");
    setSaveError(null);
    setManualAdjustments({
      rebalance_frequency: job.result.adjusted_spec?.portfolio_rules?.rebalance_frequency ?? null,
      ranking_feature: job.result.adjusted_spec?.ranking_rule?.feature ?? null,
      ranking_order: job.result.adjusted_spec?.ranking_rule?.order ?? null,
      top_n: job.result.adjusted_spec?.ranking_rule?.top_n ?? null,
    });
  }, [job?.result?.command, job?.result?.backtest, job?.result?.adjusted_spec]);

  const saveIteration = async () => {
    const result = job?.result;
    if (
      !onSaveIteration ||
      result?.command !== "iterate" ||
      !result.adjusted_spec ||
      !result.run_id ||
      !result.strategy_name
    ) {
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      await onSaveIteration({
        runId: result.run_id,
        strategyName: result.strategy_name,
        spec: result.adjusted_spec,
        backtest: result.backtest ?? null,
      });
      setSaveState("done");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "save failed");
    }
  };

  return (
    <div className="rounded border border-border bg-background px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground">
          {title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {request.command}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/85">{detail}</p>

      {isStrategy && (phase === "idle" || phase === "confirm") && (
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          placeholder="Research objective… (leave blank for the default)"
          className="mt-2 w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
      )}

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("confirm")}
          className="mt-3 inline-flex items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10"
        >
          <Play className="h-3 w-3" /> {runLabel}
        </button>
      )}

      {phase === "confirm" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          run this command?
          <button
            type="button"
            onClick={() => launch()}
            className="rounded border border-foreground/40 bg-foreground/[0.06] px-2 py-0.5 text-foreground hover:bg-foreground/10"
          >
            confirm
          </button>
          <button type="button" onClick={() => setPhase("idle")} className="underline">
            cancel
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> running {request.command}...
        </div>
      )}

      {phase === "done" && job && (
        <div className="mt-3 space-y-2">
          <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
            <Check className="h-3 w-3" /> done
          </div>
          <p className="text-[12px] leading-relaxed text-foreground/85">{resultSummary(job)}</p>
          {/* HITL iterate: what the auto/explicit revision changed */}
          {job.result?.iteration_note && (
            <p className="font-mono text-[11px] text-amber-400">↻ {job.result.iteration_note}</p>
          )}
          {/* real PnL curve from the backtest equity series */}
          {job.result?.backtest?.equity && job.result.backtest.equity.length > 1 && (
            <Sparkline values={job.result.backtest.equity.map((p) => p.equity)} />
          )}
          {/* paper-trade: portfolio equity history + orders */}
          {job.result?.paper_trade && (
            <div className="space-y-1">
              <Sparkline values={(job.result.paper_trade.portfolio.history ?? []).map((h) => h.equity)} />
              {job.result.paper_trade.orders.length === 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground">no rebalancing orders — already at target.</p>
              ) : (
                <ul className="font-mono text-[10px] text-foreground/85">
                  {job.result.paper_trade.orders.map((o) => (
                    <li key={`${o.side}-${o.ticker}`}>
                      {o.side} {o.shares} {o.ticker} @ ${o.price} (${o.notional}){o.reason ? ` · ${o.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {job.result?.command === "iterate" && job.result.adjusted_spec && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Top N
                </span>
                <input
                  type="number"
                  min={1}
                  value={manualAdjustments.top_n ?? ""}
                  onChange={(e) =>
                    setManualAdjustments((current) => ({
                      ...current,
                      top_n: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring"
                />
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Rebalance
                </span>
                <select
                  value={manualAdjustments.rebalance_frequency ?? ""}
                  onChange={(e) =>
                    setManualAdjustments((current) => ({
                      ...current,
                      rebalance_frequency: (e.target.value || null) as StrategyAdjustments["rebalance_frequency"],
                    }))
                  }
                  className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring"
                >
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Rank order
                </span>
                <select
                  value={manualAdjustments.ranking_order ?? ""}
                  onChange={(e) =>
                    setManualAdjustments((current) => ({
                      ...current,
                      ranking_order: (e.target.value || null) as StrategyAdjustments["ranking_order"],
                    }))
                  }
                  className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring"
                >
                  <option value="descending">descending</option>
                  <option value="ascending">ascending</option>
                </select>
              </label>
              <label className="col-span-2 space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Ranking feature
                </span>
                <input
                  type="text"
                  value={manualAdjustments.ranking_feature ?? ""}
                  onChange={(e) =>
                    setManualAdjustments((current) => ({
                      ...current,
                      ranking_feature: e.target.value || null,
                    }))
                  }
                  className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring"
                />
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {job.result?.command === "iterate" && job.result.adjusted_spec && (
              <button
                type="button"
                onClick={() => launch(manualAdjustments)}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10"
              >
                ↻ Iterate again
              </button>
            )}
            {job.result?.command === "iterate" && job.result.adjusted_spec && onSaveIteration && (
              <button
                type="button"
                onClick={() => void saveIteration()}
                disabled={saveState === "saving" || saveState === "done"}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {saveState === "done" ? "Saved iteration" : "Save iteration"}
              </button>
            )}
            {runLink(job) && (
              <Link
                href={runLink(job)!}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/[0.04]"
              >
                Open run
              </Link>
            )}
          </div>
          {saveState === "error" && saveError && (
            <p className="font-mono text-[10px] text-destructive">save iteration failed: {saveError}</p>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[10px] text-destructive">command failed: {error}</p>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground underline"
          >
            retry
          </button>
        </div>
      )}
    </div>
  );
}
