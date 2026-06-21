"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, LineChart } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Disclaimer, Label, MetaItem, Pill, Prose } from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { ReadinessPill, VerdictHeadline, critiqueTone } from "@/components/ui/tags";
import type { CritiqueVerdict, StrategyCatalogItem } from "@/types";

type Filter = "all" | "accept" | "revise" | "reject";

const FILTERS: { id: Filter; label: string; match: (v: CritiqueVerdict | null) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "accept", label: "Worth testing", match: (v) => v === "accept_for_backtest" },
  { id: "revise", label: "Needs work", match: (v) => v === "revise_before_backtest" },
  { id: "reject", label: "Rejected", match: (v) => v === "reject" },
];

export default function StrategiesPage() {
  const strategies = useApi((s) => api.strategies(s), []);
  const [filter, setFilter] = useState<Filter>("all");

  const items = useMemo(() => strategies.data ?? [], [strategies.data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, accept: 0, revise: 0, reject: 0 };
    for (const it of items) {
      if (it.verdict === "accept_for_backtest") c.accept += 1;
      else if (it.verdict === "revise_before_backtest") c.revise += 1;
      else if (it.verdict === "reject") c.reject += 1;
    }
    return c;
  }, [items]);

  const active = FILTERS.find((f) => f.id === filter)!;
  const visible = items.filter((it) => active.match(it.verdict));

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Strategies</Label>
          <Pill tone="muted">
            <LineChart className="h-3 w-3" /> catalog
          </Pill>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          What the research found.
        </h1>
        <Prose className="max-w-2xl">
          Every strategy the pipeline proposed, with an adversarial reviewer&apos;s verdict on
          each one. Start with &ldquo;Worth testing,&rdquo; read the plain-English idea, and
          mind the top risk.
        </Prose>
      </div>

      <Disclaimer />

      {strategies.loading ? (
        <LoadingState label="Loading strategies" />
      ) : strategies.error ? (
        <ApiDownState status={strategies.error.status} what="strategies" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No strategies yet"
          detail="Run the pipeline to propose strategies, then they appear here with their verdicts."
        />
      ) : (
        <>
          {/* Verdict filter */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const isActive = f.id === filter;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={
                    "flex items-center gap-2 rounded border px-3 py-1.5 text-[12px] transition-colors " +
                    (isActive
                      ? "border-foreground/40 bg-foreground/[0.06] text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground")
                  }
                >
                  {f.label}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {counts[f.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="None in this group"
              detail="No strategies match this verdict. Try another filter."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visible.map((it) => (
                <StrategyCard
                  key={`${it.run_id}-${it.strategy_name}`}
                  item={it}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StrategyCard({ item }: { item: StrategyCatalogItem }) {
  const tone = critiqueTone(item.verdict);
  const accent =
    tone === "good"
      ? "border-l-foreground/50"
      : tone === "warn"
        ? "border-l-yellow-500/60"
        : tone === "bad"
          ? "border-l-destructive/60"
          : "border-l-border";

  return (
    <Card className={`flex flex-col border-l-2 ${accent} p-5`}>
      {/* Verdict-forward header */}
      <div className="flex items-start justify-between gap-3">
        <VerdictHeadline verdict={item.verdict} />
        <div className="flex flex-col items-end gap-1.5">
          <Pill tone="muted">{item.strategy_family.replace(/_/g, " ")}</Pill>
          <Pill tone="muted">not executed</Pill>
        </div>
      </div>

      {/* Name + hypothesis */}
      <div className="mt-4 space-y-1.5">
        <p className="font-mono text-[13px] font-semibold text-foreground">
          {item.strategy_name}
        </p>
        <Prose className="text-foreground/85">{item.hypothesis}</Prose>
      </div>

      {/* Top risk */}
      {item.top_risk && (
        <div className="mt-4 rounded border border-border bg-background/60 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Pill tone={tone === "bad" ? "bad" : "warn"}>top risk</Pill>
            {item.risk_count > 1 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                +{item.risk_count - 1} more
              </span>
            )}
          </div>
          <p className="text-[12.5px] leading-relaxed text-foreground/85">{item.top_risk}</p>
        </div>
      )}

      {/* Meta footer */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <MetaItem label="Universe">{item.universe}</MetaItem>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            Readiness
          </span>
          <ReadinessPill readiness={item.readiness} />
        </div>
        <MetaItem label="Confidence">{item.confidence.toFixed(2)}</MetaItem>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <Link
          href={`/runs/${item.run_id}`}
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Full review in {item.run_id}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Card>
  );
}
