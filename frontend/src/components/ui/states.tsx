import * as React from "react";
import { AlertTriangle, Loader2, ServerCrash } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered loading state for a page or panel. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <p className="font-mono text-[10px] uppercase tracking-widest">{label}</p>
    </div>
  );
}

/** Friendly "no data / start the API" state — never a crash. */
export function EmptyState({
  title,
  detail,
  variant = "empty",
  className,
}: {
  title: string;
  detail?: React.ReactNode;
  variant?: "empty" | "error";
  className?: string;
}) {
  const Icon = variant === "error" ? ServerCrash : AlertTriangle;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded border border-dashed border-border bg-card/40 p-12 text-center",
        className
      )}
    >
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
        {title}
      </p>
      {detail && (
        <p className="max-w-md text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

/** Standard "API is down or no runs exist yet" message used across pages. */
export function ApiDownState({
  status,
  what = "data",
}: {
  status?: number;
  what?: string;
}) {
  return (
    <EmptyState
      variant="error"
      title={`No ${what} available`}
      detail={
        <>
          {status === 404
            ? "The API responded but has no runs yet. "
            : "Could not reach the QuantCode dashboard API. "}
          Start it with{" "}
          <span className="text-foreground">quantcode dashboard</span> (port 8000), then
          reload. Override the origin with{" "}
          <span className="text-foreground">NEXT_PUBLIC_API_URL</span>.
        </>
      }
    />
  );
}
