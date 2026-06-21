"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ExternalLink,
  FileText,
  FlaskConical,
  Lightbulb,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  Card,
  Disclaimer,
  Label,
  Pill,
  Prose,
  RiskGroup,
  SectionHeader,
} from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { CritiquePill, ReadinessPill, VerdictPill } from "@/components/ui/tags";
import { humanize } from "@/lib/utils";
import {
  buildResearchFeed,
  findCritique,
  findExperimentPlan,
  findFeasibility,
  findHypothesis,
  findValidation,
  simulatedCurve,
  type ResearchItem,
  type ResearchItemType,
} from "@/lib/research";
import type {
  PortfolioRules,
  QuantResearchPacket,
  RankingRule,
  RiskRules,
  StrategyRule,
  StrategySpec,
} from "@/types";

export default function DashboardPage() {
  const latest = useApi((s) => api.latestRun(s), []);

  if (latest.loading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading latest run" />
      </div>
    );
  }
  if (latest.error || !latest.data) {
    return (
      <div className="p-6">
        <ApiDownState status={latest.error?.status} what="strategy data" />
      </div>
    );
  }
  return <Dashboard packet={latest.data} />;
}

function Dashboard({ packet }: { packet: QuantResearchPacket }) {
  const specs = packet.strategy_specs;
  const [selected, setSelected] = useState(specs[0]?.strategy_name ?? "");

  // Keep selection valid if the packet changes underneath us.
  useEffect(() => {
    if (specs.length && !specs.some((s) => s.strategy_name === selected)) {
      setSelected(specs[0].strategy_name);
    }
  }, [specs, selected]);

  const spec = useMemo(
    () => specs.find((s) => s.strategy_name === selected) ?? specs[0] ?? null,
    [specs, selected]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-6">
      {/* Header + strategy selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label>Dashboard</Label>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Strategy research cockpit
          </h1>
          <Prose className="max-w-xl text-muted-foreground">
            Everything the pipeline produced for one strategy — its spec, the critique, what
            data it needs, and the research behind it. Read-only; nothing here is backtested.
          </Prose>
        </div>
        {specs.length > 0 && (
          <label className="flex shrink-0 flex-col gap-1">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Strategy · run {packet.run_id}
            </span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full min-w-0 max-w-xs rounded border border-border bg-card px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 sm:w-64"
            >
              {specs.map((s) => (
                <option key={s.strategy_name} value={s.strategy_name}>
                  {s.strategy_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!spec ? (
        <EmptyState
          title="No strategies in the latest run"
          detail="The latest research packet proposed no strategy specs. Inspect the run for what gated them, or execute the pipeline again."
        />
      ) : (
        <StrategyView packet={packet} spec={spec} />
      )}
    </div>
  );
}

function StrategyView({ packet, spec }: { packet: QuantResearchPacket; spec: StrategySpec }) {
  const critique = findCritique(packet, spec.strategy_name);
  const feasibility = findFeasibility(packet, spec);
  const hypothesis = findHypothesis(packet, spec);
  const validation = findValidation(packet, spec.strategy_name);
  const plan = findExperimentPlan(packet, spec.strategy_name);
  const feed = useMemo(() => buildResearchFeed(packet, spec), [packet, spec]);

  const riskCount = critique
    ? critique.leakage_risks.length +
      critique.major_issues.length +
      critique.overfitting_risks.length +
      critique.transaction_cost_risks.length +
      critique.data_quality_risks.length
    : 0;

  return (
    <div className="space-y-5">
      {/* Selected strategy header + status pills */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[15px] font-semibold text-foreground">
            {spec.strategy_name}
          </span>
          <Pill tone="muted">{humanize(spec.strategy_family)}</Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReadinessPill readiness={spec.backtest_readiness} />
          {critique && <CritiquePill verdict={critique.verdict} />}
          {feasibility && <VerdictPill verdict={feasibility.verdict} />}
          {validation && (
            <Pill tone={validation.valid ? "good" : "bad"}>
              {validation.valid ? "spec valid" : `spec ${validation.errors.length} errors`}
            </Pill>
          )}
          <Pill tone="muted">not executed</Pill>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Confidence" value={spec.confidence.toFixed(2)} />
        <Metric
          label="Rationale"
          value={critique ? humanize(critique.economic_rationale_strength) : "—"}
        />
        <Metric label="Flagged risks" value={riskCount} />
        <Metric label="Horizon" value={hypothesis?.horizon ?? "—"} />
        <Metric label="Rebalance" value={humanize(spec.portfolio_rules.rebalance_frequency)} />
        <Metric label="Rules" value={spec.entry_rules.length + spec.exit_rules.length} />
      </div>

      {/* Simulated performance */}
      <PerformancePanel name={spec.strategy_name} plan={plan ? plan.benchmark : null} />

      {/* Research/news (prominent) + risk side-by-side */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ResearchPanel items={feed} />
        </div>
        <RiskPanel
          critique={critique}
          expectedFailureModes={spec.expected_failure_modes}
          riskCount={riskCount}
        />
      </div>

      {/* Strategy detail */}
      <StrategyDetailPanel spec={spec} hypothesis={hypothesis?.hypothesis ?? null} />

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/runs/${packet.run_id}`}
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Full audit trail in {packet.run_id}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <Disclaimer />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 bg-background p-3.5">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="break-words font-mono text-[15px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function PerformancePanel({ name, plan }: { name: string; plan: string | null }) {
  const data = useMemo(() => simulatedCurve(name), [name]);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <SectionHeader
          title="Simulated research performance"
          hint="Illustrative curve from a fixed seed — not a backtest, not market data, not executed."
        />
        <Pill tone="warn">
          <Activity className="h-3 w-3" /> simulated
        </Pill>
      </div>
      <div className="p-4">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="equity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 0% 96%)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(0 0% 96%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis
                width={48}
                tick={{ fontSize: 10, fill: "hsl(0 0% 56%)", fontFamily: "var(--font-mono)" }}
                domain={["dataMin - 2", "dataMax + 2"]}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "hsl(0 0% 30%)" }}
                contentStyle={{
                  background: "hsl(0 0% 6%)",
                  border: "1px solid hsl(0 0% 14%)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
                labelFormatter={(t) => `step ${t}`}
                formatter={(v) => [Number(v).toFixed(1), "index (sim)"]}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="hsl(0 0% 92%)"
                strokeWidth={1.5}
                fill="url(#equity)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          Placeholder index seeded by strategy name
          {plan ? ` · planned benchmark ${plan}` : ""} · no performance is claimed.
        </p>
      </div>
    </Card>
  );
}

const TYPE_META: Record<ResearchItemType, { tone: "good" | "warn" | "muted" | "default"; icon: React.ReactNode }> = {
  PAPER: { tone: "default", icon: <FileText className="h-3 w-3" /> },
  NEWS: { tone: "warn", icon: <Newspaper className="h-3 w-3" /> },
  LESSON: { tone: "good", icon: <Lightbulb className="h-3 w-3" /> },
  DATA: { tone: "muted", icon: <FlaskConical className="h-3 w-3" /> },
};

function ResearchPanel({ items }: { items: ResearchItem[] }) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <SectionHeader
          title="Relevant research & news"
          hint="Prior art, lessons from memory, data availability, and simulated context — each tied to this strategy."
        />
        <Pill tone="muted">
          <Newspaper className="h-3 w-3" /> {items.length}
        </Pill>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-[12.5px] text-muted-foreground">
          No prior art, lessons, or feasibility context attached to this strategy yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <ResearchRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ResearchRow({ item }: { item: ResearchItem }) {
  const meta = TYPE_META[item.type];
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>
          {meta.icon}
          {item.type}
        </Pill>
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {item.title}
        </span>
        {item.simulated && <Pill tone="warn">simulated</Pill>}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            source <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-foreground/85">{item.summary}</p>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-foreground/70">
          Why this matters{" "}
        </span>
        {item.whyMatters}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">{item.source}</p>
    </li>
  );
}

function RiskPanel({
  critique,
  expectedFailureModes,
  riskCount,
}: {
  critique: ReturnType<typeof findCritique>;
  expectedFailureModes: string[];
  riskCount: number;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <SectionHeader title="Risk & critique" hint="Where the reviewer says this could break." />
        <Pill tone={riskCount > 0 ? "warn" : "good"}>{riskCount} flags</Pill>
      </div>
      <div className="space-y-5 p-5">
        {critique ? (
          <>
            <RiskGroup title="Leakage" items={critique.leakage_risks} tone="bad" />
            <RiskGroup title="Major issues" items={critique.major_issues} tone="bad" />
            <RiskGroup title="Overfitting" items={critique.overfitting_risks} tone="warn" />
            <RiskGroup title="Transaction cost" items={critique.transaction_cost_risks} tone="warn" />
            <RiskGroup title="Data quality" items={critique.data_quality_risks} tone="warn" />
            <RiskGroup title="Suggested mutations" items={critique.suggested_mutations} tone="good" />
            {riskCount === 0 && (
              <Prose className="text-muted-foreground">No risks flagged in any category.</Prose>
            )}
          </>
        ) : (
          <RiskGroup
            title="Expected failure modes"
            items={expectedFailureModes}
            tone="muted"
          />
        )}
        {!critique && expectedFailureModes.length === 0 && (
          <Prose className="text-muted-foreground">No critique on record for this strategy.</Prose>
        )}
      </div>
    </Card>
  );
}

function ruleText(r: StrategyRule): string {
  const target = r.feature_ref ?? (r.value ?? "");
  const lb = r.lookback_days ? ` (${r.lookback_days}d)` : "";
  return `${r.feature} ${r.operator} ${target}${lb}`;
}

function StrategyDetailPanel({
  spec,
  hypothesis,
}: {
  spec: StrategySpec;
  hypothesis: string | null;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5">
        <SectionHeader title="Strategy detail" hint="The full spec — idea, rationale, and every rule." />
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <DetailLabel>Hypothesis</DetailLabel>
          <Prose>{hypothesis ?? spec.hypothesis}</Prose>
        </div>
        {spec.economic_rationale && (
          <div className="space-y-2">
            <DetailLabel>Economic rationale</DetailLabel>
            <Prose className="text-foreground/85">{spec.economic_rationale}</Prose>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RuleBox title="Entry rules">
            {spec.entry_rules.map((r, i) => (
              <RuleLine key={i}>{ruleText(r)}</RuleLine>
            ))}
          </RuleBox>
          <RuleBox title="Exit rules">
            {spec.exit_rules.map((r, i) => (
              <RuleLine key={i}>{ruleText(r)}</RuleLine>
            ))}
          </RuleBox>
          {spec.ranking_rule && <RankingBox rule={spec.ranking_rule} />}
          <PortfolioBox rules={spec.portfolio_rules} />
          <RiskRulesBox rules={spec.risk_rules} />
          <RuleBox title="Universe / data">
            <RuleLine>{spec.universe}</RuleLine>
            {spec.required_data.length > 0 && (
              <RuleLine muted>{spec.required_data.join(", ")}</RuleLine>
            )}
          </RuleBox>
        </div>
      </div>
    </Card>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
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

function RuleLine({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      className={`break-words font-mono text-[11px] ${muted ? "text-muted-foreground" : "text-foreground"}`}
    >
      {children}
    </p>
  );
}

function RankingBox({ rule }: { rule: RankingRule }) {
  const size =
    rule.top_n != null ? `top ${rule.top_n}` : rule.bottom_n != null ? `bottom ${rule.bottom_n}` : "";
  return (
    <RuleBox title="Ranking">
      <RuleLine>
        {rule.feature} · {rule.order}
        {size ? ` · ${size}` : ""}
      </RuleLine>
    </RuleBox>
  );
}

function PortfolioBox({ rules }: { rules: PortfolioRules }) {
  return (
    <RuleBox title="Portfolio">
      <RuleLine>
        {humanize(rules.weighting)} · rebalance {rules.rebalance_frequency}
      </RuleLine>
      {(rules.max_position != null || rules.max_sector_weight != null) && (
        <RuleLine muted>
          {rules.max_position != null && `max position ${rules.max_position}`}
          {rules.max_position != null && rules.max_sector_weight != null && " · "}
          {rules.max_sector_weight != null && `max sector ${rules.max_sector_weight}`}
        </RuleLine>
      )}
    </RuleBox>
  );
}

function RiskRulesBox({ rules }: { rules: RiskRules }) {
  const parts: string[] = [];
  if (rules.stop_loss != null) parts.push(`stop ${rules.stop_loss}`);
  if (rules.take_profit != null) parts.push(`take profit ${rules.take_profit}`);
  if (rules.max_holding_days != null) parts.push(`max hold ${rules.max_holding_days}d`);
  if (rules.max_turnover != null) parts.push(`max turnover ${rules.max_turnover}`);
  return (
    <RuleBox title="Risk controls">
      {parts.length > 0 ? <RuleLine>{parts.join(" · ")}</RuleLine> : <RuleLine muted>none specified</RuleLine>}
    </RuleBox>
  );
}
