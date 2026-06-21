"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  ExternalLink,
  FileText,
  FlaskConical,
  Lightbulb,
  Newspaper,
  ScrollText,
  Sigma,
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
import { Card, Disclaimer, Label, Pill } from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { CritiquePill, ReadinessPill, TraceStatusPill, VerdictPill } from "@/components/ui/tags";
import { humanize } from "@/lib/utils";
import {
  backtestStats,
  derivedReading,
  findCritique,
  findFeasibility,
  findHypothesis,
  simulatedCurve,
} from "@/lib/research";
import type {
  BacktestResult,
  CuratedReading,
  MarketAlert,
  QuantResearchPacket,
  ReadingItem,
  ReadingType,
  StrategyCritique,
  StrategySpec,
  TraceEvent,
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

// Cache reading + backtest per (run, strategy) so re-selecting doesn't re-fetch (or re-bill).
const READING_CACHE = new Map<string, { reading: CuratedReading; provider: string }>();
const BACKTEST_CACHE = new Map<string, BacktestResult>();

function useStrategyData(packet: QuantResearchPacket, spec: StrategySpec) {
  const key = `${packet.run_id}::${spec.strategy_name}`;
  const [reading, setReading] = useState<{ reading: CuratedReading; provider: string } | null>(null);
  const [readingLoading, setReadingLoading] = useState(true);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const body = { run_id: packet.run_id, strategy_name: spec.strategy_name };

    const cachedR = READING_CACHE.get(key);
    if (cachedR) {
      setReading(cachedR);
      setReadingLoading(false);
    } else {
      setReading(null);
      setReadingLoading(true);
      api
        .reading(body, ctrl.signal)
        .then((res) => {
          const v = { reading: res.reading, provider: res.provider };
          READING_CACHE.set(key, v);
          if (!ctrl.signal.aborted) setReading(v);
        })
        .catch(() => {
          if (!ctrl.signal.aborted)
            setReading({ reading: derivedReading(packet, spec), provider: "offline" });
        })
        .finally(() => !ctrl.signal.aborted && setReadingLoading(false));
    }

    const cachedB = BACKTEST_CACHE.get(key);
    if (cachedB) {
      setBacktest(cachedB);
      setBacktestLoading(false);
    } else {
      setBacktest(null);
      setBacktestLoading(true);
      api
        .backtest(body, ctrl.signal)
        .then((res) => {
          BACKTEST_CACHE.set(key, res.backtest);
          if (!ctrl.signal.aborted) setBacktest(res.backtest);
        })
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setBacktestLoading(false));
    }
    return () => ctrl.abort();
  }, [key, packet, spec]);

  return { reading, readingLoading, backtest, backtestLoading };
}

function Dashboard({ packet }: { packet: QuantResearchPacket }) {
  const specs = packet.strategy_specs;
  const [selected, setSelected] = useState(specs[0]?.strategy_name ?? "");

  useEffect(() => {
    if (specs.length && !specs.some((s) => s.strategy_name === selected)) {
      setSelected(specs[0].strategy_name);
    }
  }, [specs, selected]);

  const spec = useMemo(
    () => specs.find((s) => s.strategy_name === selected) ?? specs[0] ?? null,
    [specs, selected]
  );

  if (!spec) {
    return (
      <div className="p-6">
        <EmptyState
          title="No strategies in the latest run"
          detail="The latest research packet proposed no strategy specs. Inspect the run to see what gated them."
        />
      </div>
    );
  }
  return <DashboardBody packet={packet} spec={spec} specs={specs} onSelect={setSelected} selected={selected} />;
}

function DashboardBody({
  packet,
  spec,
  specs,
  selected,
  onSelect,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  const { reading, readingLoading, backtest, backtestLoading } = useStrategyData(packet, spec);

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)_330px]">
        <LeftColumn packet={packet} selected={selected} onSelect={onSelect} />
        <CenterColumn
          packet={packet}
          spec={spec}
          specs={specs}
          onSelect={onSelect}
          backtest={backtest}
          backtestLoading={backtestLoading}
          readingItems={reading?.reading.items ?? null}
          readingLoading={readingLoading}
          readingProvider={reading?.provider ?? null}
        />
        <RightColumn packet={packet} spec={spec} alerts={reading?.reading.alerts ?? null} />
      </div>
      <Disclaimer>
        Research only — no live trading. The backtest is a small-basket, long-only cross-section
        on keyless EOD data (or a labelled simulation if prices are unreachable); curated reading
        mixes real arXiv/news with AI-written notes — verify before citing. Not financial advice.
      </Disclaimer>
    </div>
  );
}

/* ------------------------------------------------------------------ shared panel chrome */
function Panel({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Label>{title}</Label>
        {right}
      </div>
      {children}
    </Card>
  );
}

function fmtPct(x: number, signed = true): string {
  const s = (x * 100).toFixed(2);
  return `${signed && x > 0 ? "+" : ""}${s}%`;
}

/* ----------------------------------------------------------------------------- left col */
function LeftColumn({
  packet,
  selected,
  onSelect,
}: {
  packet: QuantResearchPacket;
  selected: string;
  onSelect: (name: string) => void;
}) {
  const flagged = packet.critiques.filter((c) => c.verdict !== "accept_for_backtest");
  return (
    <div className="space-y-4">
      <Panel title="Research run" right={<Pill tone="muted">read-only</Pill>}>
        <div className="space-y-3 p-4">
          <div>
            <p className="font-mono text-xl font-semibold text-foreground">{packet.run_id}</p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-foreground/80">
              {packet.request.objective}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
            <span>
              <span className="text-foreground">{packet.strategy_specs.length}</span> strategies
            </span>
            <span>·</span>
            <span>
              <span className="text-foreground">{packet.critiques.length}</span> critiques
            </span>
            <span>·</span>
            <span>
              <span className="text-foreground">{packet.produced_lessons.length}</span> lessons
            </span>
          </div>
        </div>
      </Panel>

      <Panel
        title="Strategies"
        right={
          <span className="font-mono text-[10px] text-muted-foreground">
            {packet.strategy_specs.length}
          </span>
        }
      >
        <ul className="divide-y divide-border">
          {packet.strategy_specs.map((s) => {
            const active = s.strategy_name === selected;
            const crit = findCritique(packet, s.strategy_name);
            return (
              <li key={s.strategy_name}>
                <button
                  type="button"
                  onClick={() => onSelect(s.strategy_name)}
                  className={`block w-full px-4 py-3 text-left transition-colors ${
                    active ? "bg-accent/50" : "hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate font-mono text-[12px] ${
                        active ? "font-semibold text-foreground" : "text-foreground/85"
                      }`}
                    >
                      {s.strategy_name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full ${active ? "bg-foreground" : "bg-foreground/40"}`}
                      style={{ width: `${Math.round(s.confidence * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      {humanize(s.strategy_family)}
                    </span>
                    {crit && (
                      <span className="ml-auto shrink-0">
                        <CritiquePill verdict={crit.verdict} />
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Needs review"
        right={
          <span className="font-mono text-[10px] text-muted-foreground">{flagged.length}</span>
        }
      >
        {flagged.length === 0 ? (
          <p className="p-4 text-[12.5px] text-muted-foreground">
            Every strategy cleared the critic. Nothing flagged for revision.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {flagged.map((c) => {
              const issue = c.major_issues[0] ?? c.leakage_risks[0] ?? c.suggested_mutations[0];
              return (
                <li key={c.strategy_name} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(c.strategy_name)}
                      className="truncate font-mono text-[12px] text-foreground hover:underline"
                    >
                      {c.strategy_name}
                    </button>
                    <CritiquePill verdict={c.verdict} />
                  </div>
                  {issue && (
                    <p className="line-clamp-2 text-[12px] leading-snug text-foreground/75">
                      {issue}
                    </p>
                  )}
                  <Link
                    href={`/runs/${packet.run_id}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Review <ChevronRight className="h-3 w-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------------------- center col */
function CenterColumn({
  packet,
  spec,
  specs,
  onSelect,
  backtest,
  backtestLoading,
  readingItems,
  readingLoading,
  readingProvider,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  onSelect: (name: string) => void;
  backtest: BacktestResult | null;
  backtestLoading: boolean;
  readingItems: ReadingItem[] | null;
  readingLoading: boolean;
  readingProvider: string | null;
}) {
  const critique = findCritique(packet, spec.strategy_name);
  const feasibility = findFeasibility(packet, spec);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <select
          value={spec.strategy_name}
          onChange={(e) => onSelect(e.target.value)}
          className="min-w-0 max-w-[220px] rounded border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] font-semibold text-foreground outline-none focus:border-foreground/40"
        >
          {specs.map((s) => (
            <option key={s.strategy_name} value={s.strategy_name}>
              {s.strategy_name}
            </option>
          ))}
        </select>
        <ReadinessPill readiness={spec.backtest_readiness} />
        {critique && <CritiquePill verdict={critique.verdict} />}
        {feasibility && <VerdictPill verdict={feasibility.verdict} />}
        <Link
          href={`/runs/${packet.run_id}`}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          Open <ChevronRight className="h-3 w-3" />
        </Link>
      </Card>

      <BacktestPanel name={spec.strategy_name} result={backtest} loading={backtestLoading} />

      <ReadingPanel
        name={spec.strategy_name}
        items={readingItems}
        loading={readingLoading}
        provider={readingProvider}
      />
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex flex-col gap-1.5 bg-background p-3.5">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-mono text-lg font-semibold ${tone === "bad" ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function BacktestPanel({
  name,
  result,
  loading,
}: {
  name: string;
  result: BacktestResult | null;
  loading: boolean;
}) {
  // result null after a failed call → labelled simulation so the panel always renders.
  const sim = useMemo(() => simulatedCurve(name, 60), [name]);
  const curve = result
    ? result.equity.map((p) => ({ t: p.t, equity: p.equity, label: p.date }))
    : sim.map((p) => ({ t: p.t, equity: p.equity, label: `step ${p.t}` }));
  const stats = result
    ? {
        totalReturn: result.total_return,
        sharpe: result.sharpe,
        maxDD: result.max_drawdown,
        winRate: result.win_rate,
      }
    : backtestStats(sim);
  const real = !!result?.executed;

  return (
    <Panel
      title="Backtest"
      right={
        loading ? (
          <Pill tone="muted">running…</Pill>
        ) : real ? (
          <Pill tone="good">
            <Activity className="h-3 w-3" /> real · {result?.source}
          </Pill>
        ) : (
          <Pill tone="warn">
            <Activity className="h-3 w-3" /> simulated
          </Pill>
        )
      }
    >
      {loading ? (
        <div className="p-6">
          <LoadingState label="Backtesting on EOD prices" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-border bg-border sm:grid-cols-4">
            <StatTile label="Total return" value={fmtPct(stats.totalReturn)} />
            <StatTile label="Sharpe*" value={stats.sharpe.toFixed(2)} />
            <StatTile label="Max DD" value={fmtPct(stats.maxDD, false)} tone="bad" />
            <StatTile label="Win rate" value={fmtPct(stats.winRate, false)} />
          </div>
          <div className="p-3">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0 0% 96%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(0 0% 96%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis
                    width={46}
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
                    labelFormatter={(_, payload) =>
                      payload && payload[0]
                        ? String(
                            (payload[0] as { payload?: { label?: string } }).payload?.label ?? ""
                          )
                        : ""
                    }
                    formatter={(v: number | string) => Number(v).toFixed(1)}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="hsl(0 0% 92%)"
                    strokeWidth={1.5}
                    fill="url(#eq)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 px-1 font-mono text-[10px] text-muted-foreground">
              <Sigma className="h-3 w-3" />
              {result
                ? `${result.signal} · ${result.periods} periods${result.start ? ` · ${result.start}→${result.end}` : ""}`
                : "fixed-seed simulation — backtest unavailable"}
            </p>
            {result && (
              <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
                {result.note}
              </p>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- suggested reading panel */
const TYPE_META: Record<
  ReadingType,
  { tone: "good" | "warn" | "muted" | "default"; icon: React.ReactNode }
> = {
  PAPER: { tone: "default", icon: <FileText className="h-3 w-3" /> },
  NEWS: { tone: "warn", icon: <Newspaper className="h-3 w-3" /> },
  NOTE: { tone: "good", icon: <Lightbulb className="h-3 w-3" /> },
  DATA: { tone: "muted", icon: <FlaskConical className="h-3 w-3" /> },
};

function ReadingPanel({
  name,
  items,
  loading,
  provider,
}: {
  name: string;
  items: ReadingItem[] | null;
  loading: boolean;
  provider: string | null;
}) {
  const live = provider !== null && provider !== "mock" && provider !== "offline";
  return (
    <Panel
      title={`Suggested reading · ${name}`}
      right={
        provider ? (
          <Pill tone={live ? "good" : "muted"}>{live ? `AI · ${provider}` : provider}</Pill>
        ) : undefined
      }
    >
      {loading ? (
        <div className="p-4">
          <LoadingState label="Curating reading" />
        </div>
      ) : !items || items.length === 0 ? (
        <p className="p-4 text-[12.5px] text-muted-foreground">
          No reading context attached to this strategy.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <ReadingRow key={`${it.title}-${i}`} item={it} />
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
            Papers from arXiv (real links); whys are AI-written — verify before citing.
          </p>
        </>
      )}
    </Panel>
  );
}

function ReadingRow({ item }: { item: ReadingItem }) {
  const meta = TYPE_META[item.type];
  return (
    <li className="space-y-1.5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>
          {meta.icon}
          {item.type}
        </Pill>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.source}
          {item.year ? ` · ${item.year}` : ""}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="text-[14px] font-semibold leading-snug text-foreground">{item.title}</p>
      {item.summary && (
        <p className="text-[13px] leading-relaxed text-foreground/85">{item.summary}</p>
      )}
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-foreground/70">
          Why{" "}
        </span>
        {item.why}
      </p>
    </li>
  );
}

/* ---------------------------------------------------------------------------- right col */
function RightColumn({
  packet,
  spec,
  alerts,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  alerts: MarketAlert[] | null;
}) {
  const critique = findCritique(packet, spec.strategy_name);
  const events = [...packet.trace_events].sort((a, b) => a.step - b.step);
  return (
    <div className="space-y-4">
      <AgentActivity events={events} />
      <MarketAlertsPanel alerts={alerts} />
      <StrategyDetailPanel packet={packet} spec={spec} critique={critique} />
    </div>
  );
}

function AgentActivity({ events }: { events: TraceEvent[] }) {
  return (
    <Panel
      title="Agent activity"
      right={
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <ScrollText className="h-3 w-3" /> {events.length} steps
        </span>
      }
    >
      {events.length === 0 ? (
        <p className="p-4 text-[12.5px] text-muted-foreground">No trace events.</p>
      ) : (
        <ul className="max-h-[300px] divide-y divide-border overflow-y-auto">
          {events.map((ev) => (
            <li key={`${ev.step}-${ev.agent_name}`} className="space-y-1 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(ev.step).padStart(2, "0")}
                </span>
                <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                  {ev.agent_name}
                </span>
                <span className="ml-auto shrink-0">
                  <TraceStatusPill status={ev.status} />
                </span>
              </div>
              {ev.output_summary && (
                <p className="line-clamp-2 text-[12px] leading-snug text-foreground/70">
                  {ev.output_summary}
                </p>
              )}
              {ev.duration_ms != null && (
                <p className="font-mono text-[9px] text-muted-foreground">
                  {ev.duration_ms.toFixed(0)} ms
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const ALERT_TONE: Record<string, "warn" | "muted" | "default"> = {
  FOMC: "warn",
  RATES: "warn",
  FX: "default",
  CRYPTO: "default",
  EQUITY: "muted",
  MACRO: "muted",
};

function MarketAlertsPanel({ alerts }: { alerts: MarketAlert[] | null }) {
  return (
    <Panel title="Market alerts" right={<Pill tone="muted">Google News</Pill>}>
      {alerts === null ? (
        <div className="p-4">
          <LoadingState label="Fetching headlines" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="p-4 text-[12.5px] text-muted-foreground">No strategy-relevant headlines.</p>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AlertRow({ alert }: { alert: MarketAlert }) {
  return (
    <li className="space-y-1.5 p-4">
      <div className="flex items-center gap-2">
        <Pill tone={ALERT_TONE[alert.tag] ?? "muted"}>{alert.tag}</Pill>
        <span className="ml-auto truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {alert.strategy_tag}
        </span>
      </div>
      <p className="text-[13px] leading-snug text-foreground/90">{alert.headline}</p>
    </li>
  );
}

function StrategyDetailPanel({
  packet,
  spec,
  critique,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  critique: StrategyCritique | null;
}) {
  const hyp = findHypothesis(packet, spec);
  const signal =
    spec.ranking_rule != null
      ? `${spec.ranking_rule.feature} · ${spec.ranking_rule.order}`
      : spec.entry_rules[0]
        ? `${spec.entry_rules[0].feature} ${spec.entry_rules[0].operator} ${spec.entry_rules[0].feature_ref ?? spec.entry_rules[0].value ?? ""}`
        : "—";
  return (
    <Panel title={`Strategy detail · ${spec.strategy_name}`}>
      <div className="divide-y divide-border">
        <DetailRow label="Universe" value={spec.universe} />
        <DetailRow label="Horizon" value={hyp?.horizon ?? "—"} />
        <DetailRow label="Signal" value={signal} mono />
        <DetailRow label="Rebalance" value={humanize(spec.portfolio_rules.rebalance_frequency)} />
        <DetailRow label="Weighting" value={humanize(spec.portfolio_rules.weighting)} />
        <DetailRow
          label="Max position"
          value={spec.portfolio_rules.max_position != null ? `${spec.portfolio_rules.max_position}` : "—"}
          mono
        />
        <DetailRow label="Required data" value={spec.required_data.join(", ") || "—"} />
        <DetailRow
          label="Rationale"
          value={critique ? humanize(critique.economic_rationale_strength) : "—"}
        />
      </div>
    </Panel>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={`min-w-0 break-words text-right text-[12px] ${mono ? "font-mono" : ""} text-foreground/90`}
      >
        {value}
      </span>
    </div>
  );
}
