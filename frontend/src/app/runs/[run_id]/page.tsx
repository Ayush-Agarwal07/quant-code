"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  Card,
  Disclaimer,
  Label,
  MetaItem,
  Pill,
  Prose,
  RiskGroup,
  SectionHeader,
} from "@/components/ui/primitives";
import { ApiDownState, LoadingState } from "@/components/ui/states";
import {
  CritiquePill,
  KindPill,
  ReadinessPill,
  TraceStatusPill,
  VerdictPill,
} from "@/components/ui/tags";
import { ADVANCING_VERDICTS } from "@/types";
import type {
  DataFeasibilityReport,
  Lesson,
  PortfolioRules,
  QuantResearchPacket,
  RankingRule,
  RiskRules,
  StrategyCritique,
  StrategyRule,
  StrategySpec,
} from "@/types";

export default function RunDetailPage() {
  const params = useParams<{ run_id: string }>();
  const runId = params?.run_id ?? "";
  const run = useApi((s) => api.run(runId, s), [runId]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All runs
      </Link>

      {run.loading ? (
        <LoadingState label="Loading run" />
      ) : run.error || !run.data ? (
        <ApiDownState status={run.error?.status} what={`run ${runId}`} />
      ) : (
        <RunDetail packet={run.data} />
      )}
    </div>
  );
}

function ruleText(r: StrategyRule): string {
  const target = r.feature_ref ?? (r.value ?? "");
  const lb = r.lookback_days ? ` (${r.lookback_days}d)` : "";
  return `${r.feature} ${r.operator} ${target}${lb}`;
}

function RunDetail({ packet: p }: { packet: QuantResearchPacket }) {
  const events = [...p.trace_events].sort((a, b) => a.step - b.step);

  const accepted = p.critiques.filter((c) => c.verdict === "accept_for_backtest").length;
  const revise = p.critiques.filter((c) => c.verdict === "revise_before_backtest").length;
  const rejected = p.critiques.filter((c) => c.verdict === "reject").length;
  const advanced = p.data_feasibility_reports.filter((r) =>
    ADVANCING_VERDICTS.has(r.verdict)
  ).length;
  const deferred = p.data_feasibility_reports.length - advanced;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Label>Run {p.run_id}</Label>
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
          {p.request.objective}
        </h1>
        {p.request.asset_universe && (
          <Prose className="text-muted-foreground">
            Universe: {p.request.asset_universe}
          </Prose>
        )}
        {p.context_pack && (
          <Link
            href="/compaction"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <FlaskConical className="h-3 w-3" /> Compaction metrics for this run
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Verdict summary strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <SummaryStat label="Worth testing" value={accepted} tone="good" />
        <SummaryStat label="Needs work" value={revise} tone="warn" />
        <SummaryStat label="Rejected" value={rejected} tone="bad" />
        <SummaryStat label="Advanced" value={advanced} sub="passed feasibility" />
        <SummaryStat label="Deferred" value={deferred} sub="missing data" />
      </div>

      {/* Feasibility gate — why deferred is the centerpiece */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader
            title="Feasibility gate"
            hint="Which hypotheses are testable now / with a proxy (advanced) vs deferred — and exactly what data is missing."
          />
        </div>
        {p.data_feasibility_reports.length === 0 ? (
          <Empty>No feasibility reports.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {p.data_feasibility_reports.map((r) => (
              <FeasibilityRow key={r.hypothesis_name} report={r} />
            ))}
          </ul>
        )}
      </Card>

      {/* Strategies — full spec */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader
            title="Strategies"
            hint="The full spec proposed by the pipeline — idea, economic rationale, and every rule."
          />
        </div>
        {p.strategy_specs.length === 0 ? (
          <Empty>No strategies proposed.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {p.strategy_specs.map((s) => (
              <StrategyDetail key={s.strategy_name} spec={s} />
            ))}
          </ul>
        )}
      </Card>

      {/* Critiques — the visual centerpiece, all categories */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader
            title="Adversarial critique"
            hint="The reviewer hunts for every way this could be wrong — leakage, overfitting, costs, data quality."
          />
        </div>
        {p.critiques.length === 0 ? (
          <Empty>No critiques.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {p.critiques.map((c) => (
              <CritiqueDetail key={c.strategy_name} critique={c} />
            ))}
          </ul>
        )}
      </Card>

      {/* Experiment status — claim nothing */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader
            title="Experiments"
            hint="Backtests are not executed — only planned metrics are listed. No performance is claimed."
          />
        </div>
        {p.experiment_results.length === 0 ? (
          <Empty>No experiment plans.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {p.experiment_results.map((e) => (
              <li key={e.strategy_name} className="space-y-2 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[12px] font-semibold text-foreground">
                    {e.strategy_name}
                  </span>
                  <Pill tone="warn">{e.status.replace(/_/g, " ")}</Pill>
                </div>
                {e.reason && <Prose className="text-muted-foreground">{e.reason}</Prose>}
                {e.planned_metrics.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {e.planned_metrics.map((m) => (
                      <Pill key={m} tone="muted">
                        {m}
                      </Pill>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Learning delta — what memory carried in vs what this run banked */}
      <LearningDelta retrieved={p.retrieved_lessons} produced={p.produced_lessons} />

      {/* Agent timeline */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader title="Agent timeline" hint="Per-step trace of the pipeline." />
        </div>
        {events.length === 0 ? (
          <Empty>No trace events.</Empty>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((ev) => (
              <li key={`${ev.step}-${ev.agent_name}`} className="flex gap-4 p-5">
                <span className="w-8 shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">
                  {String(ev.step).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {ev.agent_name}
                    </span>
                    <TraceStatusPill status={ev.status} />
                    {ev.duration_ms != null && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {ev.duration_ms.toFixed(0)} ms
                      </span>
                    )}
                  </div>
                  {ev.output_summary && (
                    <Prose className="text-[12px] text-muted-foreground">
                      {ev.output_summary}
                    </Prose>
                  )}
                  {ev.error && (
                    <p className="text-[12px] leading-relaxed text-destructive">{ev.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Disclaimer>
        Research only — experiments are not_executed; no performance is claimed.
      </Disclaimer>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const valueColor =
    tone === "good"
      ? "text-foreground"
      : tone === "warn"
        ? "text-yellow-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="flex flex-col gap-2 bg-background p-4">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono text-2xl font-semibold ${valueColor}`}>{value}</span>
      {sub && <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function FeasibilityRow({ report: r }: { report: DataFeasibilityReport }) {
  const advanced = ADVANCING_VERDICTS.has(r.verdict);
  const blocked = r.missing_data.length > 0 || r.data_quality_risks.length > 0;
  return (
    <li className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {r.hypothesis_name}
        </span>
        <VerdictPill verdict={r.verdict} />
        <Pill tone={advanced ? "good" : "muted"}>{advanced ? "advanced" : "deferred"}</Pill>
        {r.proxy_available && <Pill tone="warn">proxy available</Pill>}
      </div>

      {r.proxy_available && r.proxy_description && (
        <Prose className="text-muted-foreground">
          <span className="text-foreground/90">Proxy: </span>
          {r.proxy_description}
        </Prose>
      )}

      {/* Why deferred — prominent */}
      {!advanced && blocked && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/[0.05] p-3">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-400">
            Why deferred
          </p>
          {r.missing_data.length > 0 && (
            <p className="text-[12.5px] leading-relaxed text-foreground/85">
              <span className="text-muted-foreground">Missing data: </span>
              {r.missing_data.join(", ")}
            </p>
          )}
          {r.data_quality_risks.length > 0 && (
            <RiskGroup
              title="data quality"
              items={r.data_quality_risks}
              tone="warn"
              count={false}
            />
          )}
        </div>
      )}
    </li>
  );
}

function StrategyDetail({ spec: s }: { spec: StrategySpec }) {
  return (
    <li className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px] font-semibold text-foreground">
          {s.strategy_name}
        </span>
        <Pill tone="muted">{s.strategy_family.replace(/_/g, " ")}</Pill>
        <ReadinessPill readiness={s.backtest_readiness} />
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          conf {s.confidence.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        <SpecLabel>Hypothesis</SpecLabel>
        <Prose>{s.hypothesis}</Prose>
      </div>

      {s.economic_rationale && (
        <div className="space-y-2">
          <SpecLabel>Economic rationale</SpecLabel>
          <Prose className="text-foreground/85">{s.economic_rationale}</Prose>
        </div>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <MetaItem label="Universe">{s.universe}</MetaItem>
        {s.required_data.length > 0 && (
          <MetaItem label="Required data">{s.required_data.join(", ")}</MetaItem>
        )}
      </div>

      {/* Rules grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RuleList title="Entry rules" rules={s.entry_rules} />
        <RuleList title="Exit rules" rules={s.exit_rules} />
        {s.ranking_rule && <RankingBlock rule={s.ranking_rule} />}
        <PortfolioBlock rules={s.portfolio_rules} />
        <RiskRulesBlock rules={s.risk_rules} />
      </div>

      {s.expected_failure_modes.length > 0 && (
        <RiskGroup
          title="Expected failure modes"
          items={s.expected_failure_modes}
          tone="muted"
        />
      )}
    </li>
  );
}

function CritiqueDetail({ critique: c }: { critique: StrategyCritique }) {
  const rationaleTone =
    c.economic_rationale_strength === "strong"
      ? "good"
      : c.economic_rationale_strength === "weak"
        ? "bad"
        : "warn";
  const hasRisks =
    c.leakage_risks.length +
      c.major_issues.length +
      c.overfitting_risks.length +
      c.transaction_cost_risks.length +
      c.data_quality_risks.length >
    0;
  return (
    <li className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px] font-semibold text-foreground">
          {c.strategy_name}
        </span>
        <CritiquePill verdict={c.verdict} />
        <Pill tone={rationaleTone}>rationale {c.economic_rationale_strength}</Pill>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          conf {c.confidence.toFixed(2)}
        </span>
      </div>

      {hasRisks ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
          <RiskGroup title="Leakage risks" items={c.leakage_risks} tone="bad" />
          <RiskGroup title="Major issues" items={c.major_issues} tone="bad" />
          <RiskGroup title="Overfitting risks" items={c.overfitting_risks} tone="warn" />
          <RiskGroup
            title="Transaction cost risks"
            items={c.transaction_cost_risks}
            tone="warn"
          />
          <RiskGroup
            title="Data quality risks"
            items={c.data_quality_risks}
            tone="warn"
          />
        </div>
      ) : (
        <Prose className="text-muted-foreground">No risks flagged in any category.</Prose>
      )}

      {c.suggested_mutations.length > 0 && (
        <RiskGroup
          title="Suggested mutations"
          items={c.suggested_mutations}
          tone="good"
        />
      )}
    </li>
  );
}

function SpecLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function RuleBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <Label>{title}</Label>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function RuleList({ title, rules }: { title: string; rules: StrategyRule[] }) {
  return (
    <RuleBox title={title}>
      {rules.map((r, i) => (
        <p key={i} className="font-mono text-[11px] text-foreground">
          {ruleText(r)}
        </p>
      ))}
    </RuleBox>
  );
}

function RankingBlock({ rule }: { rule: RankingRule }) {
  const size =
    rule.top_n != null ? `top ${rule.top_n}` : rule.bottom_n != null ? `bottom ${rule.bottom_n}` : "";
  return (
    <RuleBox title="Ranking">
      <p className="font-mono text-[11px] text-foreground">
        {rule.feature} · {rule.order}
        {size ? ` · ${size}` : ""}
      </p>
    </RuleBox>
  );
}

function PortfolioBlock({ rules }: { rules: PortfolioRules }) {
  return (
    <RuleBox title="Portfolio">
      <p className="font-mono text-[11px] text-foreground">
        {rules.weighting.replace(/_/g, " ")} · rebalance {rules.rebalance_frequency}
      </p>
      {(rules.max_position != null || rules.max_sector_weight != null) && (
        <p className="font-mono text-[10px] text-muted-foreground">
          {rules.max_position != null && `max position ${rules.max_position}`}
          {rules.max_position != null && rules.max_sector_weight != null && " · "}
          {rules.max_sector_weight != null && `max sector ${rules.max_sector_weight}`}
        </p>
      )}
    </RuleBox>
  );
}

function RiskRulesBlock({ rules }: { rules: RiskRules }) {
  const parts: string[] = [];
  if (rules.stop_loss != null) parts.push(`stop ${rules.stop_loss}`);
  if (rules.take_profit != null) parts.push(`take profit ${rules.take_profit}`);
  if (rules.max_holding_days != null) parts.push(`max hold ${rules.max_holding_days}d`);
  if (rules.max_turnover != null) parts.push(`max turnover ${rules.max_turnover}`);
  return (
    <RuleBox title="Risk controls">
      {parts.length > 0 ? (
        <p className="font-mono text-[11px] text-foreground">{parts.join(" · ")}</p>
      ) : (
        <p className="font-mono text-[10px] text-muted-foreground">none specified</p>
      )}
    </RuleBox>
  );
}

function LearningDelta({
  retrieved,
  produced,
}: {
  retrieved: Lesson[];
  produced: Lesson[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5">
        <SectionHeader
          title="Learning delta"
          hint="What this run pulled from memory before proposing, and the lessons it banked for the next one."
        />
      </div>
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
        <LessonColumn
          label="Retrieved (carried in)"
          empty="No prior lessons retrieved — this was a cold start."
          lessons={retrieved}
        />
        <LessonColumn
          label="Produced (banked)"
          empty="No new lessons produced this run."
          lessons={produced}
        />
      </div>
    </Card>
  );
}

function LessonColumn({
  label,
  empty,
  lessons,
}: {
  label: string;
  empty: string;
  lessons: Lesson[];
}) {
  return (
    <div className="space-y-3 bg-card p-5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-[10px] text-muted-foreground">{lessons.length}</span>
      </div>
      {lessons.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => (
            <li
              key={l.lesson_id}
              className="flex gap-2.5 rounded border border-border bg-background p-3"
            >
              <KindPill kind={l.kind} />
              <p className="flex-1 text-[12.5px] leading-relaxed text-foreground/85">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-[12px] text-muted-foreground">{children}</p>;
}
