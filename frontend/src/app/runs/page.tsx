"use client";

import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Label, Pill, Prose } from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { formatRatio } from "@/lib/utils";

export default function RunsPage() {
  const runs = useApi((s) => api.runs(s), []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label>Runs</Label>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Research runs</h1>
          <Prose className="max-w-2xl">
            The audit trail. Each run is a full research packet: feasibility gate, strategies,
            critiques, and the agent timeline. Select a run to inspect it.
          </Prose>
        </div>
        <Link
          href="/memory"
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Database className="h-3 w-3" /> Memory store
        </Link>
      </div>

      {runs.loading ? (
        <LoadingState label="Loading runs" />
      ) : runs.error ? (
        <ApiDownState status={runs.error.status} what="runs" />
      ) : !runs.data || runs.data.length === 0 ? (
        <EmptyState
          title="No runs yet"
          detail="Execute the pipeline to produce research packets, then they appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th className="w-24">Run</Th>
                  <Th>Objective</Th>
                  <Th className="w-28 text-center">Status</Th>
                  <Th className="w-20 text-center">Strat</Th>
                  <Th className="w-20 text-center">Crit</Th>
                  <Th className="w-24 text-center">Adv / Def</Th>
                  <Th className="w-24 text-center">Lessons</Th>
                  <Th className="w-24 text-center">Compress</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {[...runs.data].reverse().map((r) => (
                  <tr
                    key={r.run_id}
                    className="group border-b border-border/60 transition-colors hover:bg-accent/30"
                  >
                    <Td>
                      <Link
                        href={`/runs/${r.run_id}`}
                        className="font-mono text-[11px] font-semibold text-foreground"
                      >
                        {r.run_id}
                      </Link>
                    </Td>
                    <Td className="max-w-0">
                      <Link
                        href={`/runs/${r.run_id}`}
                        className="block truncate text-[12.5px] text-foreground/85 transition-colors group-hover:text-foreground"
                      >
                        {r.objective}
                      </Link>
                    </Td>
                    <Td className="text-center">
                      {r.advanced > 0 ? (
                        <Pill tone="good">advancing</Pill>
                      ) : (
                        <Pill tone="muted">deferred</Pill>
                      )}
                    </Td>
                    <Td className="text-center font-mono text-[11px] text-foreground">
                      {r.strategies}
                    </Td>
                    <Td className="text-center font-mono text-[11px] text-foreground">
                      {r.critiques}
                    </Td>
                    <Td className="text-center">
                      <span className="font-mono text-[11px] text-foreground">
                        {r.advanced}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {" "}
                        / {r.deferred}
                      </span>
                    </Td>
                    <Td className="text-center font-mono text-[10px] text-muted-foreground">
                      <span className="text-foreground">{r.retrieved_lessons}</span> in ·{" "}
                      <span className="text-foreground">{r.produced_lessons}</span> out
                    </Td>
                    <Td className="text-center">
                      <Pill tone="muted">{formatRatio(r.compression_ratio)}</Pill>
                    </Td>
                    <Td className="text-center">
                      <Link href={`/runs/${r.run_id}`}>
                        <ArrowRight className="mx-auto h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
