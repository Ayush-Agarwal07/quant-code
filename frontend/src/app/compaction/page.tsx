"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { FlaskConical, Info } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Label, Pill, Prose, SectionHeader, StatCard } from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { formatInt, formatRatio } from "@/lib/utils";
import type { ContextPack } from "@/types";

export default function CompactionPage() {
  const overview = useApi((s) => api.overview(s), []);
  const runs = useApi((s) => api.runs(s), []);

  const [selected, setSelected] = useState<string | null>(null);
  const [pack, setPack] = useState<ContextPack | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState<ApiError | null>(null);

  // Default to the latest run once overview lands.
  useEffect(() => {
    if (selected == null && overview.data?.latest_run_id) {
      setSelected(overview.data.latest_run_id);
    }
  }, [overview.data, selected]);

  // Load the context pack for the selected run.
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setPackLoading(true);
    setPackError(null);
    setPack(null);
    api
      .compaction(selected, controller.signal)
      .then((p) => {
        if (!controller.signal.aborted) {
          setPack(p);
          setPackLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setPackError(e instanceof ApiError ? e : new ApiError(0, "load failed"));
        setPackLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  if (overview.loading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading compaction" />
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return (
      <div className="p-6">
        <ApiDownState status={overview.error?.status} what="compaction data" />
      </div>
    );
  }

  const runIds = overview.data.run_ids;

  if (runIds.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Header />
        <div className="mt-6">
          <EmptyState
            title="No runs to compact"
            detail="Run the pipeline to produce a context pack."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <Header
        right={
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Run
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-foreground outline-none transition-colors hover:bg-accent"
            >
              {runIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {packLoading ? (
        <LoadingState label="Loading context pack" />
      ) : packError ? (
        <EmptyState
          variant={packError.status === 404 ? "empty" : "error"}
          title={
            packError.status === 404 ? "No context pack" : "Could not load context pack"
          }
          detail={
            packError.status === 404
              ? `Run ${selected} has no context pack — the compaction step did not produce one.`
              : "Start the API with quantcode dashboard (port 8000), then reload."
          }
        />
      ) : pack ? (
        <CompactionDetail pack={pack} />
      ) : null}
    </div>
  );
}

function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label>Compaction</Label>
          <Pill tone="good">
            <FlaskConical className="h-3 w-3" /> Tokens
          </Pill>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Context, compressed without losing what matters.
        </h1>
        <Prose className="max-w-2xl">
          The ResearchTrace Compiler dedupes events and prunes non-critical context into a
          tight pack — while retaining every critical lesson.
        </Prose>
      </div>
      {right}
    </div>
  );
}

function CompactionDetail({ pack }: { pack: ContextPack }) {
  const saved = pack.tokens_before - pack.tokens_after;
  const savedPct =
    pack.tokens_before > 0 ? (saved / pack.tokens_before) * 100 : 0;
  const chartData = [
    { name: "Before", tokens: pack.tokens_before },
    { name: "After", tokens: pack.tokens_after },
  ];

  return (
    <div className="space-y-6">
      {/* Big ratio + key stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between p-6 md:col-span-1">
          <Label>Compression ratio</Label>
          <div className="mt-4">
            <p className="font-mono text-5xl font-bold leading-none text-foreground">
              {formatRatio(pack.compression_ratio)}
            </p>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              {formatInt(saved)} tokens removed ({savedPct.toFixed(1)}%)
            </p>
          </div>
          <div className="mt-4">
            {pack.tokens_estimated ? (
              <Pill tone="warn">
                <Info className="h-3 w-3" /> tokens estimated
              </Pill>
            ) : (
              <Pill tone="good">tokens measured</Pill>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border md:col-span-2">
          <StatCard label="Tokens before" value={formatInt(pack.tokens_before)} sub="raw context" />
          <StatCard label="Tokens after" value={formatInt(pack.tokens_after)} sub="compacted pack" />
          <StatCard
            label="Criticals retained"
            value={`${pack.critical_lessons_retained}/${pack.total_critical_lessons}`}
            sub="no critical lesson dropped"
          />
          <StatCard
            label="Duplicates removed"
            value={formatInt(pack.duplicate_events_removed)}
            sub="dedup of trace events"
          />
        </div>
      </div>

      {/* Bar chart */}
      <Card className="p-5">
        <SectionHeader
          title="Before vs after"
          hint={`Budget: ${formatInt(pack.budget)} tokens · pack ${pack.pack_id}`}
        />
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 24, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: "hsl(0 0% 45%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(0 0% 14%)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(0 0% 35%)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Bar dataKey="tokens" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                <Cell fill="hsl(0 0% 30%)" />
                <Cell fill="hsl(0 0% 90%)" />
                <LabelList
                  dataKey="tokens"
                  position="top"
                  fill="hsl(0 0% 85%)"
                  fontSize={11}
                  formatter={(v) => formatInt(typeof v === 'number' ? v : Number(String(v)))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Retained lessons */}
      {pack.lessons.length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title="Lessons in the pack"
            hint={`${pack.lessons.length} lesson id${pack.lessons.length === 1 ? "" : "s"} retained.`}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {pack.lessons.map((id) => (
              <Pill key={id} tone="muted">
                {id}
              </Pill>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
