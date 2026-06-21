"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Overview } from "@/types";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/agent", label: "Agent" },
  { href: "/runs", label: "Runs" },
];

export function TopNav() {
  const pathname = usePathname();
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
  }, [pathname]);

  return (
    <nav className="flex h-10 shrink-0 items-center border-b border-border bg-card px-5">
      <Link href="/" className="mr-10 text-sm font-bold tracking-tight text-foreground">
        QuantCode
      </Link>

      <div className="flex h-full flex-1 items-end">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex h-full items-center px-4 text-xs transition-colors",
                isActive
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Status pills — sourced from /overview */}
      <div className="mr-5 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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

      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          Research-Only
        </span>
      </div>
    </nav>
  );
}
