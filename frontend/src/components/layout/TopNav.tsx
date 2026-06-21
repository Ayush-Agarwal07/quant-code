"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Overview } from "@/types";

export function TopNav() {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .overview(controller.signal)
      .then((o) => {
        if (!controller.signal.aborted) setOverview(o);
      })
      .catch(() => {
        /* TopNav degrades to dashes when the API is down — never crash the chrome */
      });
    return () => controller.abort();
  }, []);

  return (
    <nav className="flex min-h-10 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-5">
      <Link href="/" className="mr-2 shrink-0 text-sm font-bold tracking-tight text-foreground sm:mr-7">
        QuantCode
      </Link>

      <div className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-widest sm:flex">
        <Link
          href="/compaction"
          className="rounded border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Compaction
        </Link>
      </div>

      <div className="flex-1" />

      {/* Status pills — sourced from /overview */}
      <div className="mr-3 hidden items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:flex">
        <span>
          Backend <span className="text-foreground">{overview?.backend ?? "—"}</span>
        </span>
        <span>
          LLM <span className="text-foreground">{overview?.llm_provider ?? "—"}</span>
        </span>
        <span>
          Lessons{" "}
          <span className="text-foreground">{overview?.lesson_count ?? "—"}</span>
        </span>
      </div>

      <div className="hidden items-center gap-2 font-mono text-xs sm:flex">
        <span className="flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          Research-Only
        </span>
      </div>
    </nav>
  );
}
