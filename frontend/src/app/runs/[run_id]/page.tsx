"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { formatDate, formatInt, humanize } from "@/lib/utils";
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
  BacktestResult,
  BacktestTrade,
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
  const [selectedStrategy, setSelectedStrategy] = useState(p.strategy_specs[0]?.strategy_name ?? "");
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const accepted = p.critiques.filter((c) => c.verdict === "accept_for_backtest").length;
  const revise = p.critiques.filter((c) => c.verdict === "revise_before_backtest").length;
  const rejected = p.critiques.filter((c) => c.verdict === "reject").length;
  const advanced = p.data_feasibility_reports.filter((r) =>
    ADVANCING_VERDICTS.has(r.verdict)
  ).length;
  const deferred = p.data_feasibility_reports.length - advanced;
  const selectedSpec =
    p.strategy_specs.find((s) => s.strategy_name === selectedStrategy) ?? p.strategy_specs[0] ?? null;
  const selectedCritique =
    p.critiques.find((c) => c.strategy_name === selectedSpec?.strategy_name) ?? null;

  useEffect(() => {
    if (!p.strategy_specs.length) {
      setSelectedStrategy("");
      return;
    }
    setSelectedStrategy((current) =>
      p.strategy_specs.some((spec) => spec.strategy_name === current)
        ? current
        : p.strategy_specs[0].strategy_name
    );
  }, [p.strategy_specs]);

  useEffect(() => {
    if (!selectedSpec) {
      setBacktest(null);
      return;
    }
    const controller = new AbortController();
    setBacktestLoading(true);
    setBacktestError(null);
    api
      .backtest({ run_id: p.run_id, strategy_name: selectedSpec.strategy_name }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setBacktest(res.backtest);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setBacktest(null);
        setBacktestError(err instanceof Error ? err.message : "backtest failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBacktestLoading(false);
      });
    return () => controller.abort();
  }, [p.run_id, selectedSpec]);

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

      {selectedSpec && (
        <BacktestReport
          runId={p.run_id}
          strategy={selectedSpec}
          strategies={p.strategy_specs}
          selectedStrategy={selectedStrategy}
          onSelectStrategy={setSelectedStrategy}
          critique={selectedCritique}
          result={backtest}
          loading={backtestLoading}
          error={backtestError}
        />
      )}

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
            {p.strategy_specs.map((s, index) => (
              <StrategyDetail key={`${index}::${s.strategy_name}`} spec={s} />
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
            {p.critiques.map((c, index) => (
              <CritiqueDetail key={`${index}::${c.strategy_name}`} critique={c} />
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
        Research only — this page may include an on-demand backtest preview, but nothing here is a live trading system or financial advice.
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
  value: React.ReactNode;
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

type ReportPoint = {
  x: number;
  label: string;
  equity: number;
  pnl: number;
};

function BacktestReport({
  runId,
  strategy,
  strategies,
  selectedStrategy,
  onSelectStrategy,
  critique,
  result,
  loading,
  error,
}: {
  runId: string;
  strategy: StrategySpec;
  strategies: StrategySpec[];
  selectedStrategy: string;
  onSelectStrategy: (value: string) => void;
  critique: StrategyCritique | null;
  result: BacktestResult | null;
  loading: boolean;
  error: string | null;
}) {
  const curve = useMemo(() => buildReportCurve(result), [result]);
  const stats = useMemo(() => summarizeBacktest(result, curve), [result, curve]);
  const recentTrades = result?.trades?.slice(-14).reverse() ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5">
        <SectionHeader
          title="Run report"
          hint="PnL over the last two years, executed rebalance activity, and a plain-English read on the strategy."
          right={
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Strategy
              <select
                value={selectedStrategy}
                onChange={(e) => onSelectStrategy(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-foreground outline-none transition-colors hover:bg-accent"
              >
                {strategies.map((spec) => (
                  <option key={spec.strategy_name} value={spec.strategy_name}>
                    {spec.strategy_name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      </div>

      {loading ? (
        <div className="p-6">
          <LoadingState label="Loading two-year performance" />
        </div>
      ) : error || !result ? (
        <Empty>{error ?? `No backtest available for ${runId}.`}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="border-b border-border lg:border-b-0 lg:border-r">
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label>PnL Curve</Label>
                    <Pill tone="muted">{humanize(strategy.strategy_name)}</Pill>
                    <Pill tone={result.executed ? "good" : "warn"}>{result.source}</Pill>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {stats.startLabel} - {stats.endLabel}
                  </div>
                </div>

                <div className="h-[420px] w-full">
                  <ReportChart data={curve} />
                </div>

                <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-3 xl:grid-cols-6">
                  <SummaryStat label="Earnings" value={stats.earningsLabel} tone={stats.totalReturn >= 0 ? "good" : "bad"} />
                  <SummaryStat label="Total return" value={stats.totalReturnLabel} tone={stats.totalReturn >= 0 ? "good" : "bad"} />
                  <SummaryStat label="Annual return" value={stats.annualReturnLabel} tone={stats.annualReturn >= 0 ? "good" : "bad"} />
                  <SummaryStat label="Max drawdown" value={stats.maxDrawdownLabel} tone="bad" />
                  <SummaryStat label="Sharpe" value={stats.sharpeLabel} tone={stats.sharpe >= 0.75 ? "good" : stats.sharpe >= 0.25 ? "warn" : "bad"} />
                  <SummaryStat label="Trades" value={stats.tradeCountLabel} sub={`win ${stats.winRateLabel}`} />
                </div>

                <Prose className="text-[12px] text-muted-foreground">{result.note}</Prose>
              </div>
            </section>

            <aside className="min-h-0">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Executed trades</Label>
                  <Pill tone="muted">{result.rebalance}</Pill>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_0.8fr_0.9fr_1fr_1fr] border-b border-border px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Time</span>
                <span>Rule</span>
                <span>Ticker</span>
                <span className="text-right">Size</span>
                <span className="text-right">Price</span>
              </div>
              {recentTrades.length === 0 ? (
                <Empty>No trades were emitted for this backtest window.</Empty>
              ) : (
                <div className="max-h-[620px] overflow-y-auto">
                  {recentTrades.map((trade, index) => (
                    <TradeRow key={`${trade.date}-${trade.side}-${trade.ticker}-${index}`} trade={trade} />
                  ))}
                </div>
              )}
            </aside>
          </div>

          <div className="border-t border-border p-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Performance</Label>
                <Prose>{performanceSummary(strategy, result, stats)}</Prose>
              </div>
              <div className="space-y-2">
                <Label>Improvements / Shortcomings</Label>
                <Prose>{improvementSummary(strategy, critique, result)}</Prose>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ReportChart({ data }: { data: ReportPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 18, bottom: 12, left: 0 }}>
        <defs>
          <linearGradient id="runReportPnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity={0.28} />
            <stop offset="55%" stopColor="rgb(34 197 94)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(0 0% 12%)" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, Math.max(0, data.length - 1)]}
          ticks={chartTicks(data)}
          tick={{ fontSize: 11, fill: "hsl(0 0% 62%)", fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => data[Math.round(Number(v))]?.label ?? ""}
        />
        <YAxis
          orientation="right"
          width={68}
          tick={{ fontSize: 11, fill: "hsl(0 0% 72%)", fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${Number(v).toFixed(2)}%`}
        />
        <ReferenceLine y={0} stroke="hsl(0 0% 24%)" />
        <Tooltip
          cursor={{ stroke: "hsl(0 0% 32%)" }}
          contentStyle={{
            background: "hsl(0 0% 6%)",
            border: "1px solid hsl(0 0% 14%)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
          }}
          labelFormatter={(_, payload) =>
            payload && payload[0]
              ? String((payload[0] as { payload?: { label?: string } }).payload?.label ?? "")
              : ""
          }
          formatter={(v) => `${Number(v).toFixed(2)}%`}
        />
        <Area
          type="stepAfter"
          dataKey="pnl"
          stroke="rgb(34 197 94)"
          strokeWidth={2}
          fill="url(#runReportPnlFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const tone = trade.side === "BUY" ? "text-emerald-400" : "text-red-400";
  return (
    <div className="grid grid-cols-[1fr_0.8fr_0.9fr_1fr_1fr] items-center border-b border-border px-4 py-3 font-mono text-[12px]">
      <span className="text-muted-foreground">{formatDate(trade.date)}</span>
      <span className={`font-semibold ${tone}`}>{trade.side}</span>
      <span className="text-foreground">{trade.ticker}</span>
      <span className="text-right text-muted-foreground">{trade.shares.toFixed(4)}</span>
      <span className="text-right font-semibold text-foreground">{trade.price.toFixed(2)}</span>
    </div>
  );
}

function buildReportCurve(result: BacktestResult | null): ReportPoint[] {
  const points = result?.equity ?? [];
  const trimmed = lastTwoYears(points);
  const first = trimmed[0]?.equity ?? 100;
  return trimmed.map((point, index) => ({
    x: index,
    label: labelDate(point.date),
    equity: point.equity,
    pnl: first ? (point.equity / first - 1) * 100 : 0,
  }));
}

function lastTwoYears(points: BacktestResult["equity"]): BacktestResult["equity"] {
  if (points.length < 2) return points;
  const lastTs = Date.parse(points[points.length - 1].date);
  if (Number.isNaN(lastTs)) return points;
  const cutoff = lastTs - 730 * 24 * 60 * 60 * 1000;
  const filtered = points.filter((point) => {
    const ts = Date.parse(point.date);
    return !Number.isNaN(ts) && ts >= cutoff;
  });
  return filtered.length > 1 ? filtered : points;
}

function chartTicks(data: ReportPoint[]): number[] {
  if (data.length <= 1) return [0];
  const count = Math.min(6, data.length);
  const last = data.length - 1;
  return Array.from({ length: count }, (_, i) => Math.round((last * i) / Math.max(1, count - 1)));
}

function labelDate(value: string): string {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function pct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function summarizeBacktest(result: BacktestResult | null, curve: ReportPoint[]) {
  const totalReturn = result?.total_return ?? 0;
  const start = result?.start ?? result?.equity[0]?.date ?? null;
  const end = result?.end ?? result?.equity[result.equity.length - 1]?.date ?? null;
  const startTs = start ? Date.parse(start) : Number.NaN;
  const endTs = end ? Date.parse(end) : Number.NaN;
  const years =
    !Number.isNaN(startTs) && !Number.isNaN(endTs) && endTs > startTs
      ? (endTs - startTs) / (365.25 * 24 * 60 * 60 * 1000)
      : 2;
  const first = curve[0]?.equity ?? 100;
  const last = curve[curve.length - 1]?.equity ?? first;
  const annualReturn = years > 0 && first > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;
  return {
    totalReturn,
    annualReturn,
    sharpe: result?.sharpe ?? 0,
    earningsLabel: `$${formatInt(Math.round(totalReturn * 100000))}`,
    totalReturnLabel: pct(totalReturn),
    annualReturnLabel: pct(annualReturn),
    maxDrawdownLabel: pct(result?.max_drawdown ?? 0),
    winRateLabel: pct(result?.win_rate ?? 0),
    sharpeLabel: (result?.sharpe ?? 0).toFixed(2),
    tradeCountLabel: formatInt(result?.trades?.length ?? 0),
    startLabel: formatDate(start),
    endLabel: formatDate(end),
  };
}

function performanceSummary(
  strategy: StrategySpec,
  result: BacktestResult,
  stats: ReturnType<typeof summarizeBacktest>
): string {
  const base = `${humanize(strategy.strategy_name)} returned ${stats.totalReturnLabel} over the displayed two-year window, with an annualized pace of ${stats.annualReturnLabel}, a Sharpe of ${stats.sharpeLabel}, and a max drawdown of ${stats.maxDrawdownLabel}.`;
  const execution = result.executed
    ? ` The curve comes from the live EOD cross-sectional backtest across ${result.universe.length} names with ${result.rebalance} rebalancing.`
    : " The curve is still on the fallback preview path, so use it as directional context rather than evidence of an edge.";
  const win = ` Win rate landed at ${stats.winRateLabel} across ${stats.tradeCountLabel} recorded trade events.`;
  return `${base}${execution}${win}`;
}

function improvementSummary(
  strategy: StrategySpec,
  critique: StrategyCritique | null,
  result: BacktestResult
): string {
  const flagged = critique
    ? [
        ...critique.major_issues,
        ...critique.leakage_risks,
        ...critique.transaction_cost_risks,
        ...critique.data_quality_risks,
      ]
    : strategy.expected_failure_modes;
  const top = flagged.slice(0, 3);
  const risks = top.length > 0 ? top.join("; ") : "no specific issues were flagged in the critique";
  const mutations = critique?.suggested_mutations?.slice(0, 2) ?? [];
  const next = mutations.length > 0
    ? ` Next iterations should ${mutations.join(" and ").toLowerCase()}.`
    : " Next iterations should tighten the signal definition, verify every input is point-in-time clean, and pressure-test the rebalance cadence.";
  const proxy = strategy.backtest_readiness === "ready_with_proxy_limitations"
    ? " Because this strategy is proxy-based, the largest improvement would be replacing the proxy with the direct event data feed it stands in for."
    : "";
  return `Current shortcomings are ${risks}. ${result.note}${next}${proxy}`;
}
