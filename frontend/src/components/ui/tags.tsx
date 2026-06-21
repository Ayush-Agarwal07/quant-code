import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/primitives";
import { ADVANCING_VERDICTS } from "@/types";
import type {
  BacktestReadiness,
  CritiqueVerdict,
  DataFeasibilityVerdict,
  LessonKind,
  TraceStatus,
} from "@/types";

export function VerdictPill({ verdict }: { verdict: DataFeasibilityVerdict }) {
  const advancing = ADVANCING_VERDICTS.has(verdict);
  return <Pill tone={advancing ? "good" : "muted"}>{verdict.replace(/_/g, " ")}</Pill>;
}

type PillTone = "default" | "muted" | "good" | "warn" | "bad";

/** Maps a critique verdict to its tone + a plain-English trader label. */
export function critiqueTone(verdict: CritiqueVerdict | null): PillTone {
  if (verdict === "accept_for_backtest") return "good";
  if (verdict === "reject") return "bad";
  if (verdict === "revise_before_backtest") return "warn";
  return "muted";
}

/** Plain-language gloss for the verdict — the trader-facing headline word. */
export function verdictLabel(verdict: CritiqueVerdict | null): string {
  switch (verdict) {
    case "accept_for_backtest":
      return "Worth testing";
    case "revise_before_backtest":
      return "Needs work";
    case "reject":
      return "Rejected";
    default:
      return "Not reviewed";
  }
}

export function CritiquePill({ verdict }: { verdict: CritiqueVerdict }) {
  return <Pill tone={critiqueTone(verdict)}>{verdict.replace(/_/g, " ")}</Pill>;
}

const VERDICT_HEADLINE: Record<PillTone, string> = {
  good: "border-foreground/30 bg-foreground/[0.06] text-foreground",
  warn: "border-yellow-500/40 bg-yellow-500/[0.07] text-yellow-400",
  bad: "border-destructive/40 bg-destructive/[0.08] text-destructive",
  muted: "border-border bg-muted/40 text-muted-foreground",
  default: "border-border text-foreground",
};

/** Prominent verdict block — the most important thing on a strategy card. Shows the plain
 * label big, with the raw verdict token underneath for the researcher. */
export function VerdictHeadline({
  verdict,
  className,
}: {
  verdict: CritiqueVerdict | null;
  className?: string;
}) {
  const tone = critiqueTone(verdict);
  return (
    <div
      className={cn(
        "inline-flex flex-col rounded border px-2.5 py-1.5 leading-tight",
        VERDICT_HEADLINE[tone],
        className
      )}
    >
      <span className="text-sm font-semibold">{verdictLabel(verdict)}</span>
      <span className="font-mono text-[9px] uppercase tracking-widest opacity-70">
        {verdict ? verdict.replace(/_/g, " ") : "no critique"}
      </span>
    </div>
  );
}

export function ReadinessPill({ readiness }: { readiness: BacktestReadiness }) {
  const tone =
    readiness === "ready" ? "good" : readiness === "not_ready" ? "muted" : "warn";
  return <Pill tone={tone}>{readiness.replace(/_/g, " ")}</Pill>;
}

export function KindPill({ kind }: { kind: LessonKind }) {
  const tone = kind === "warning" ? "warn" : "default";
  return <Pill tone={tone}>{kind.replace(/_/g, " ")}</Pill>;
}

export function TraceStatusPill({ status }: { status: TraceStatus }) {
  const tone = status === "success" ? "good" : status === "failed" ? "bad" : "muted";
  return <Pill tone={tone}>{status}</Pill>;
}
