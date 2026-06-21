"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, Play } from "lucide-react";

import { api } from "@/lib/api";
import type { AgentCommandJob, AgentCommandRequest } from "@/types";

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
}: {
  request: AgentCommandRequest;
  title: string;
  detail: string;
  runLabel?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "done" | "error">("idle");
  const [job, setJob] = useState<AgentCommandJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState(request.objective ?? "");
  const isStrategy = request.command === "strategy";

  const launch = async () => {
    setPhase("running");
    setError(null);
    try {
      const payload = isStrategy ? { ...request, objective: objective.trim() || request.objective } : request;
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
            onClick={launch}
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
                      {o.side} {o.shares} {o.ticker} @ ${o.price} (${o.notional})
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
