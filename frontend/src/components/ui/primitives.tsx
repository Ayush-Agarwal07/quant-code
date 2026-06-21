import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tiny uppercase mono label — the recurring AgentQR section/label treatment. */
export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

/** Readable body prose — sans, comfortable size + leading, high-ish contrast. Use this for
 * sentences (hypotheses, critiques, lessons); keep `font-mono` for data/labels/rules. */
export function Prose({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-[13px] leading-relaxed text-foreground/90", className)}>{children}</p>
  );
}

/** Bordered card container matching the dark-token surface. */
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-border bg-card", className)}>{children}</div>
  );
}

/** A stat card: tiny label, a thin accent rule, and a big mono value. */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-background p-4">
      <Label>{label}</Label>
      <div className="mt-3 h-px w-12 bg-foreground" />
      <p className="mt-3 break-words font-mono text-2xl font-semibold text-foreground">
        {value}
      </p>
      {sub != null && (
        <p className="mt-auto pt-2 font-mono text-[10px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

type PillTone = "default" | "muted" | "good" | "warn" | "bad";

const PILL_TONES: Record<PillTone, string> = {
  default: "border-border text-foreground",
  muted: "border-border text-muted-foreground",
  good: "border-foreground/40 bg-foreground/5 text-foreground",
  warn: "border-yellow-500/40 bg-yellow-500/5 text-yellow-500",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Small mono uppercase pill / badge. */
export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Page section header: an uppercase title with an optional right-aligned slot. */
export function SectionHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {hint && (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
        )}
      </div>
      {right}
    </div>
  );
}

/** The recurring honest-framing banner. Default copy is the "research only" line. */
export function Disclaimer({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded border border-yellow-500/30 bg-yellow-500/[0.06] p-3.5",
        className
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
      <p className="text-[12px] leading-relaxed text-yellow-200/90">
        {children ??
          "Research only — these strategies are not backtested and not executed. No performance is claimed. Nothing here is financial advice."}
      </p>
    </div>
  );
}

/** A compact labelled meta item (mono value next to a tiny uppercase label). */
export function MetaItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[12px] text-foreground">{children}</span>
    </div>
  );
}

type RiskTone = "bad" | "warn" | "muted" | "good";

/** A titled group of risk/issue bullets — the critique building block. Renders nothing when
 * empty so callers can list every category unconditionally. Prose bullets (sans, readable). */
export function RiskGroup({
  title,
  items,
  tone,
  count = true,
}: {
  title: string;
  items: string[];
  tone: RiskTone;
  count?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Pill tone={tone}>{title}</Pill>
        {count && (
          <span className="font-mono text-[10px] text-muted-foreground">{items.length}</span>
        )}
      </div>
      <ul className="space-y-1.5 pl-0.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85"
          >
            <span
              className={cn(
                "mt-[7px] h-1 w-1 shrink-0 rounded-full",
                tone === "bad"
                  ? "bg-destructive"
                  : tone === "warn"
                    ? "bg-yellow-500"
                    : tone === "good"
                      ? "bg-foreground/60"
                      : "bg-muted-foreground"
              )}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
