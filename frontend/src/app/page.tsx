"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import {
  Activity,
  AtSign,
  AlertTriangle,
  ArrowUp,
  Bot,
  CalendarDays,
  CheckCircle2,
  Code2,
  DollarSign,
  ExternalLink,
  FileText,
  FlaskConical,
  Hash,
  Lightbulb,
  List,
  Loader2,
  Maximize2,
  Newspaper,
  ScrollText,
  Send,
  Sigma,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";
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
import { useApi } from "@/lib/useApi";
import { CommandCard } from "@/components/agent/CommandCard";
import { Card, Label, Pill, Prose } from "@/components/ui/primitives";
import { ApiDownState, EmptyState, LoadingState } from "@/components/ui/states";
import { CritiquePill, ReadinessPill, TraceStatusPill, VerdictPill } from "@/components/ui/tags";
import { commandPresets, inferCommand } from "@/lib/commandIntent";
import { humanize } from "@/lib/utils";
import {
  backtestStats,
  derivedReading,
  findCritique,
  findFeasibility,
  simulatedCurve,
} from "@/lib/research";
import { strategyToLatex } from "@/lib/strategyLatex";
import type {
  AgentChatReply,
  AgentCommandRequest,
  AgentTrace,
  BacktestResult,
  CuratedReading,
  MarketAlert,
  QuantResearchPacket,
  ReadingItem,
  ReadingType,
  StrategyRule,
  StrategySpec,
  TraceEvent,
} from "@/types";

export default function DashboardPage() {
  const latest = useApi((s) => api.latestRun(s), []);
  const overview = useApi((s) => api.overview(s), []);

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
  return <Dashboard packet={latest.data} provider={overview.data?.llm_provider ?? "mock"} />;
}

// Cache reading + backtest per (run, strategy) so re-selecting doesn't re-fetch (or re-bill).
const READING_CACHE = new Map<string, { reading: CuratedReading; provider: string }>();
const BACKTEST_CACHE = new Map<string, BacktestResult>();

function useStrategyData(packet: QuantResearchPacket, spec: StrategySpec) {
  const specVersion = useMemo(() => JSON.stringify(spec), [spec]);
  const key = `${packet.run_id}::${spec.strategy_name}::${specVersion}`;
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

function Dashboard({ packet, provider }: { packet: QuantResearchPacket; provider: string }) {
  const [specs, setSpecs] = useState(packet.strategy_specs);
  const [selected, setSelected] = useState(specs[0]?.strategy_name ?? "");

  useEffect(() => {
    setSpecs(packet.strategy_specs);
    setSelected(packet.strategy_specs[0]?.strategy_name ?? "");
  }, [packet.run_id, packet.strategy_specs]);

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
  return (
    <DashboardBody
      packet={packet}
      spec={spec}
      specs={specs}
      onSelect={setSelected}
      onUpdateSpec={(next) =>
        setSpecs((items) =>
          items.map((item) => (item.strategy_name === next.strategy_name ? next : item))
        )
      }
      selected={selected}
      provider={provider}
    />
  );
}

function DashboardBody({
  packet,
  spec,
  specs,
  selected,
  onSelect,
  onUpdateSpec,
  provider,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  selected: string;
  onSelect: (name: string) => void;
  onUpdateSpec: (spec: StrategySpec) => void;
  provider: string;
}) {
  const { reading, readingLoading, backtest, backtestLoading } = useStrategyData(packet, spec);
  const [latexOpen, setLatexOpen] = useState(false);

  return (
    <div className="mx-auto max-w-[1720px] p-3 sm:p-4">
      <div
        className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)_minmax(280px,320px)] xl:grid-cols-[360px_minmax(0,1fr)_320px]"
      >
        <ChatColumn
          packet={packet}
          spec={spec}
          provider={provider}
          latexOpen={latexOpen}
          onToggleLatex={() => setLatexOpen((v) => !v)}
        />
        <CenterColumn
          packet={packet}
          spec={spec}
          specs={specs}
          onSelect={onSelect}
          backtest={backtest}
          backtestLoading={backtestLoading}
        />
        <RightColumn
          spec={spec}
          alerts={reading?.reading.alerts ?? null}
          readingItems={reading?.reading.items ?? null}
          readingLoading={readingLoading}
          readingProvider={reading?.provider ?? null}
        />
      </div>
      {latexOpen && <div className="fixed inset-0 z-40 bg-background/75 backdrop-blur-sm" />}
      {latexOpen && (
        <ResearchExpansion
          packet={packet}
          spec={spec}
          provider={provider}
          onUpdateSpec={onUpdateSpec}
          onClose={() => setLatexOpen(false)}
        />
      )}
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
    <Card className={`min-w-0 overflow-hidden ${className ?? ""}`}>
      <div className="flex min-h-[42px] min-w-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Label className="min-w-0 truncate">{title}</Label>
        {right && <div className="shrink-0">{right}</div>}
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
const SUGGESTED = [
  "Critique this strategy for leakage and overfitting.",
  "What data would I need to test this?",
  "How should I size the first backtest?",
  "Turn this idea into a tighter strategy spec.",
];

interface Reply {
  lead: string;
  requiredData: string[];
  feasibility: string[];
  risks: string[];
  nextRun: string;
}

function fromApi(r: AgentChatReply): Reply {
  return {
    lead: r.lead,
    requiredData: r.required_data,
    feasibility: r.feasibility,
    risks: r.risks,
    nextRun: r.next_run,
  };
}

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; pending: true }
  | { id: number; role: "assistant"; reply: Reply; provider: string }
  | { id: number; role: "assistant"; command: { title: string; detail: string; request: AgentCommandRequest } };

function ChatColumn({
  packet,
  spec,
  provider,
  latexOpen,
  onToggleLatex,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  latexOpen: boolean;
  onToggleLatex: () => void;
}) {
  return (
    <div className="h-[calc(100vh-5.5rem)] min-h-0">
      <ChatPanel
        packet={packet}
        spec={spec}
        provider={provider}
        latexOpen={latexOpen}
        onToggleLatex={onToggleLatex}
      />
    </div>
  );
}

function ChatPanel({
  packet,
  spec,
  provider,
  latexOpen,
  onToggleLatex,
  expanded = false,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  latexOpen: boolean;
  onToggleLatex: () => void;
  expanded?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);

  const replacePending = (id: number, msg: Message) =>
    setMessages((m) => m.map((x) => (x.id === id ? msg : x)));

  const proposeCommand = (title: string, detail: string, request: AgentCommandRequest) => {
    const id = idRef.current++;
    setMessages((m) => [...m, { id, role: "assistant", command: { title, detail, request } }]);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const userId = idRef.current++;
    const replyId = idRef.current++;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      { id: replyId, role: "assistant", pending: true },
    ]);
    setDraft("");

    const inferred = inferCommand(text, { runId: packet.run_id, strategy: spec });
    if (inferred) {
      replacePending(replyId, { id: replyId, role: "assistant", command: inferred });
      return;
    }

    setBusy(true);
    try {
      const res = await api.agentChat({
        message: text,
        run_id: packet.run_id,
        strategy_name: spec.strategy_name,
      });
      replacePending(replyId, {
        id: replyId,
        role: "assistant",
        reply: fromApi(res.reply),
        provider: res.provider,
      });
    } catch {
      replacePending(replyId, {
        id: replyId,
        role: "assistant",
        reply: mockReply(text, packet, spec),
        provider: "offline mock",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Research chat"
      className={`flex flex-col ${expanded ? "h-full min-h-0 shadow-2xl" : "h-full min-h-0"}`}
      right={
        <button
          type="button"
          onClick={onToggleLatex}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? <X className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {expanded ? "Close" : "LaTeX"}
        </button>
      }
    >
      <div className="flex min-h-[96px] items-center border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="muted">{spec.strategy_name}</Pill>
          <Pill tone={provider === "mock" ? "muted" : "good"}>{provider}</Pill>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3 lg:grid-cols-4">
        {commandPresets({ runId: packet.run_id, strategy: spec }).map((preset) => (
          <button
            key={`${preset.title}-${preset.request.command}`}
            type="button"
            onClick={() => proposeCommand(preset.title, preset.detail, preset.request)}
            className="rounded border border-border bg-background px-3 py-2 text-left transition-colors hover:border-foreground/30"
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground">
              {preset.title}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{preset.detail}</p>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Ask about the selected strategy, or start from a prompt.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => send(s)}
                  className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-left text-[12.5px] text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                >
                  <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.text} />
            ) : "pending" in m ? (
              <PendingBubble key={m.id} />
            ) : "command" in m ? (
              <CommandBubble key={m.id} title={m.command.title} detail={m.command.detail} request={m.command.request} />
            ) : (
              <AssistantBubble key={m.id} reply={m.reply} provider={m.provider} />
            )
          )
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          placeholder="Ask about data, risks, or test design..."
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className="flex h-10 items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-3 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </button>
      </form>
    </Panel>
  );
}

function CommandBubble({
  title,
  detail,
  request,
}: {
  title: string;
  detail: string;
  request: AgentCommandRequest;
}) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 flex-1">
        <CommandCard request={request} title={title} detail={detail} runLabel="Launch" />
      </div>
    </div>
  );
}

function ResearchExpansion({
  packet,
  spec,
  provider,
  onUpdateSpec,
  onClose,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  onUpdateSpec: (spec: StrategySpec) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-3 top-14 bottom-3 z-50 mx-auto grid max-w-[1900px] grid-cols-1 grid-rows-[minmax(360px,1fr)_minmax(360px,1fr)_minmax(360px,1fr)] gap-3 overflow-y-auto lg:inset-x-4 lg:top-16 lg:bottom-5 lg:grid-cols-[minmax(320px,1fr)_minmax(360px,1.1fr)_minmax(340px,1fr)] lg:grid-rows-1 lg:overflow-hidden">
      <ChatPanel
        packet={packet}
        spec={spec}
        provider={provider}
        latexOpen
        expanded
        onToggleLatex={onClose}
      />
      <LatexPane spec={spec} />
      <StrategyLineEditor
        key={spec.strategy_name}
        runId={packet.run_id}
        spec={spec}
        onChange={onUpdateSpec}
      />
    </div>
  );
}

function LatexPane({ spec }: { spec: StrategySpec }) {
  const source = useMemo(
    () => strategyToLatex(spec).map((b) => `% ${b.title}\n${b.tex}`).join("\n\n"),
    [spec]
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Label>LaTeX output</Label>
          <Pill tone="muted">{spec.strategy_name}</Pill>
        </div>
        <Sigma className="h-4 w-4 text-muted-foreground" />
      </div>
      <LatexPreview source={source} spec={spec} />
    </div>
  );
}

const RULE_OPERATORS = new Set([">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]);
const WEIGHTINGS = new Set(["equal_weight", "rank_weighted", "inverse_vol_weighted", "volatility_targeted"]);
const REBALANCE = new Set(["daily", "weekly", "monthly"]);
const READINESS = new Set(["ready", "ready_with_proxy_limitations", "not_ready"]);

function specToLines(spec: StrategySpec): string {
  const lines = [
    `hypothesis ${spec.hypothesis}`,
    `rationale ${spec.economic_rationale}`,
    `universe ${spec.universe}`,
    `family ${spec.strategy_family}`,
  ];
  for (const r of spec.entry_rules) lines.push(`entry ${ruleToLine(r)}`);
  for (const r of spec.exit_rules) lines.push(`exit ${ruleToLine(r)}`);
  if (spec.ranking_rule) {
    const r = spec.ranking_rule;
    lines.push(
      `rank ${r.feature} ${r.order === "ascending" ? "asc" : "desc"} ${
        r.top_n != null ? `top ${r.top_n}` : `bottom ${r.bottom_n ?? 1}`
      }`
    );
  }
  lines.push(`weight ${spec.portfolio_rules.weighting}`);
  if (spec.portfolio_rules.max_position != null) lines.push(`max_position ${spec.portfolio_rules.max_position}`);
  if (spec.portfolio_rules.max_sector_weight != null) lines.push(`max_sector_weight ${spec.portfolio_rules.max_sector_weight}`);
  lines.push(`rebalance ${spec.portfolio_rules.rebalance_frequency}`);
  if (spec.risk_rules.stop_loss != null) lines.push(`risk stop_loss ${spec.risk_rules.stop_loss}`);
  if (spec.risk_rules.take_profit != null) lines.push(`risk take_profit ${spec.risk_rules.take_profit}`);
  if (spec.risk_rules.max_holding_days != null) lines.push(`risk max_holding_days ${spec.risk_rules.max_holding_days}`);
  if (spec.risk_rules.max_turnover != null) lines.push(`risk max_turnover ${spec.risk_rules.max_turnover}`);
  lines.push(`data ${spec.required_data.join(", ")}`);
  lines.push(`fail ${spec.expected_failure_modes.join("; ")}`);
  lines.push(`readiness ${spec.backtest_readiness}`);
  lines.push(`confidence ${spec.confidence}`);
  return lines.join("\n");
}

function ruleToLine(rule: StrategyRule): string {
  const target = rule.feature_ref ?? String(rule.value ?? "");
  const lb = rule.lookback_days ? ` lookback ${rule.lookback_days}` : "";
  return `${rule.feature} ${rule.operator} ${target}${lb}`;
}

function parseAtom(raw: string): number | string | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  return Number.isFinite(n) && raw.trim() !== "" ? n : raw;
}

function parseRule(parts: string[]): StrategyRule {
  if (parts.length < 3) throw new Error("rule needs feature, operator, and target");
  const [feature, operator, target, maybeLookback, lookbackValue] = parts;
  if (!RULE_OPERATORS.has(operator)) throw new Error(`unsupported operator: ${operator}`);
  const rule: StrategyRule = {
    feature,
    operator,
    value: parseAtom(target),
    feature_ref: null,
    lookback_days: null,
    description: null,
  };
  if (maybeLookback === "lookback") {
    const n = Number(lookbackValue);
    if (!Number.isInteger(n) || n <= 0) throw new Error("lookback must be a positive integer");
    rule.lookback_days = n;
  }
  return rule;
}

function parseList(raw: string, sep: RegExp): string[] {
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function compileStrategyLines(source: string, base: StrategySpec): StrategySpec {
  const next: StrategySpec = {
    ...base,
    entry_rules: [],
    exit_rules: [],
    ranking_rule: null,
    portfolio_rules: { ...base.portfolio_rules, max_position: null, max_sector_weight: null },
    risk_rules: {
      stop_loss: null,
      take_profit: null,
      max_holding_days: null,
      max_turnover: null,
    },
    required_data: [...base.required_data],
    expected_failure_modes: [...base.expected_failure_modes],
  };

  const rows = source.split("\n");
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const firstSpace = line.search(/\s/);
    const key = firstSpace === -1 ? line : line.slice(0, firstSpace);
    const rest = firstSpace === -1 ? "" : line.slice(firstSpace + 1).trim();
    try {
      if (key === "hypothesis") next.hypothesis = rest;
      else if (key === "rationale") next.economic_rationale = rest;
      else if (key === "universe") next.universe = rest;
      else if (key === "family") next.strategy_family = rest;
      else if (key === "entry") next.entry_rules.push(parseRule(rest.split(/\s+/)));
      else if (key === "exit") next.exit_rules.push(parseRule(rest.split(/\s+/)));
      else if (key === "rank") {
        const [feature, orderRaw, side, countRaw] = rest.split(/\s+/);
        const order = orderRaw === "asc" || orderRaw === "ascending" ? "ascending" : "descending";
        const count = Number(countRaw);
        if (!feature || !side || !Number.isInteger(count) || count <= 0) throw new Error("rank needs feature, order, side, and count");
        next.ranking_rule = {
          feature,
          order,
          top_n: side === "top" ? count : null,
          bottom_n: side === "bottom" ? count : null,
        };
      } else if (key === "weight") {
        if (!WEIGHTINGS.has(rest)) throw new Error(`unsupported weighting: ${rest}`);
        next.portfolio_rules.weighting = rest as StrategySpec["portfolio_rules"]["weighting"];
      } else if (key === "max_position") {
        const n = Number(rest);
        if (!(n > 0 && n <= 1)) throw new Error("max_position must be between 0 and 1");
        next.portfolio_rules.max_position = n;
      } else if (key === "max_sector_weight") {
        const n = Number(rest);
        if (!(n > 0 && n <= 1)) throw new Error("max_sector_weight must be between 0 and 1");
        next.portfolio_rules.max_sector_weight = n;
      } else if (key === "rebalance") {
        if (!REBALANCE.has(rest)) throw new Error(`unsupported rebalance: ${rest}`);
        next.portfolio_rules.rebalance_frequency = rest as StrategySpec["portfolio_rules"]["rebalance_frequency"];
      } else if (key === "risk") {
        const [field, valueRaw] = rest.split(/\s+/);
        const n = Number(valueRaw);
        if (!["stop_loss", "take_profit", "max_holding_days", "max_turnover"].includes(field) || !(n > 0)) {
          throw new Error("risk needs a supported field and positive value");
        }
        if (field === "max_holding_days" && !Number.isInteger(n)) throw new Error("max_holding_days must be an integer");
        next.risk_rules[field as keyof StrategySpec["risk_rules"]] = n;
      } else if (key === "data") next.required_data = parseList(rest, /,/);
      else if (key === "fail") next.expected_failure_modes = parseList(rest, /;/);
      else if (key === "readiness") {
        if (!READINESS.has(rest)) throw new Error(`unsupported readiness: ${rest}`);
        next.backtest_readiness = rest as StrategySpec["backtest_readiness"];
      } else if (key === "confidence") {
        const n = Number(rest);
        if (!(n >= 0 && n <= 1)) throw new Error("confidence must be between 0 and 1");
        next.confidence = n;
      } else {
        throw new Error(`unknown key: ${key}`);
      }
    } catch (err) {
      throw new Error(`line ${i + 1}: ${err instanceof Error ? err.message : "invalid line"}`);
    }
  }

  if (!next.hypothesis.trim()) throw new Error("hypothesis is required");
  if (!next.universe.trim()) throw new Error("universe is required");
  if (next.entry_rules.length === 0) throw new Error("at least one entry rule is required");
  if (next.exit_rules.length === 0) throw new Error("at least one exit rule is required");
  if (next.backtest_readiness !== "not_ready" && next.required_data.length === 0) {
    throw new Error("ready strategies require data");
  }
  return next;
}

function StrategyLineEditor({
  runId,
  spec,
  onChange,
}: {
  runId: string;
  spec: StrategySpec;
  onChange: (spec: StrategySpec) => void;
}) {
  const [source, setSource] = useState(() => specToLines(spec));
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: true, text: "Compiled" });
  const specRef = useRef(spec);
  const onChangeRef = useRef(onChange);
  const saveSeq = useRef(0);

  useEffect(() => {
    specRef.current = spec;
  }, [spec]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const base = specRef.current;
        const next = compileStrategyLines(source, base);
        if (JSON.stringify(next) === JSON.stringify(base)) {
          setStatus({ ok: true, text: "Synced to workspace" });
          return;
        }

        const seq = saveSeq.current + 1;
        saveSeq.current = seq;
        setStatus({ ok: true, text: "Saving to workspace..." });
        onChangeRef.current(next);
        api
          .saveStrategy({ run_id: runId, strategy_name: base.strategy_name, spec: next })
          .then(() => {
            if (saveSeq.current === seq) setStatus({ ok: true, text: "Saved to workspace" });
          })
          .catch((err) => {
            if (saveSeq.current === seq) {
              const msg = err instanceof Error ? err.message : "save failed";
              setStatus({ ok: false, text: `Valid locally, save failed: ${msg}` });
            }
          });
      } catch (err) {
        setStatus({ ok: false, text: err instanceof Error ? err.message : "Invalid strategy" });
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [runId, source]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Label>Line editor</Label>
          <Pill tone={status.ok ? "good" : "bad"}>{status.ok ? "valid" : "blocked"}</Pill>
        </div>
        {status.ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        )}
      </div>
      <textarea
        value={source}
        spellCheck={false}
        onChange={(e) => setSource(e.target.value)}
        className="min-h-0 flex-1 resize-none overflow-auto border-0 bg-background p-4 font-mono text-[12px] leading-6 text-foreground outline-none"
      />
      <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
        <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{status.text}</span>
      </div>
    </div>
  );
}

function LatexPreview({ source, spec }: { source: string; spec: StrategySpec }) {
  const blocks = useMemo(() => {
    return source
      .split(/\n\s*\n/)
      .map((raw) => {
        const lines = raw.split("\n");
        const title = lines[0]?.startsWith("%") ? lines[0].replace(/^%\s*/, "") : "Preview";
        const tex = (lines[0]?.startsWith("%") ? lines.slice(1) : lines).join("\n").trim();
        if (!tex) return null;
        let html = "";
        try {
          html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
        } catch {
          html = tex;
        }
        return { title, html };
      })
      .filter((block): block is { title: string; html: string } => block !== null);
  }, [source]);

  return (
    <div className="min-h-0 overflow-y-auto bg-card p-4">
      <div className="space-y-4">
        <div className="rounded border border-border bg-background p-4">
          <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            Summary
          </p>
          <p className="text-[13px] leading-relaxed text-foreground/90">{spec.hypothesis}</p>
          {spec.economic_rationale && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {spec.economic_rationale}
            </p>
          )}
        </div>
        {blocks.map((block, i) => (
          <div key={`${block.title}-${i}`} className="rounded border border-border bg-background p-4">
            <p className="mb-3 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              {block.title}
            </p>
            <div
              className="overflow-x-auto text-[13px] text-foreground"
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[82%] rounded border border-border bg-accent/40 px-3 py-2 text-[13px] leading-relaxed text-foreground">
        {text}
      </div>
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted-foreground">
        <User className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function BotAvatar() {
  return (
    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-foreground/[0.06] text-foreground">
      <Bot className="h-3.5 w-3.5" />
    </span>
  );
}

function PendingBubble() {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="flex items-center gap-2 pt-1.5 font-mono text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        thinking...
      </div>
    </div>
  );
}

function AssistantBubble({ reply, provider }: { reply: Reply; provider: string }) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <Pill tone={provider === "mock" || provider === "offline mock" ? "muted" : "good"}>
          {provider}
        </Pill>
        <Prose>{reply.lead}</Prose>
        <ReplySection title="Required data" items={reply.requiredData} />
        <ReplySection title="Feasibility" items={reply.feasibility} />
        <ReplySection title="Risks" items={reply.risks} />
        {reply.nextRun !== "—" && (
          <p className="break-words rounded border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground/90">
            {reply.nextRun}
          </p>
        )}
      </div>
    </div>
  );
}

function ReplySection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function mockReply(message: string, packet: QuantResearchPacket, spec: StrategySpec): Reply {
  const m = message.toLowerCase();
  const crit = findCritique(packet, spec.strategy_name);
  const feas = findFeasibility(packet, spec);
  const requiredData = [
    ...spec.required_data,
    ...(feas?.missing_data ?? []).map((d) => `${d} (missing)`),
  ];
  const feasibility = feas
    ? [
        `Verdict: ${humanize(feas.verdict)}.`,
        ...(feas.proxy_description ? [`Proxy: ${feas.proxy_description}.`] : []),
      ]
    : ["Confirm every signal input is available point-in-time before backtesting."];
  const risks =
    crit && (crit.leakage_risks.length || crit.major_issues.length || crit.overfitting_risks.length)
      ? [...crit.leakage_risks, ...crit.major_issues, ...crit.overfitting_risks].slice(0, 4)
      : spec.expected_failure_modes.slice(0, 4);
  const lead = m.includes("data")
    ? `For ${spec.strategy_name}, focus on the point-in-time inputs behind each rule.`
    : m.includes("leak") || m.includes("overfit") || m.includes("critique")
      ? `Adversarial read on ${spec.strategy_name}: rule out leakage and regime fit before spending more backtest time.`
      : `For ${spec.strategy_name}, the next useful step is a small controlled test with the caveats below.`;
  return {
    lead,
    requiredData,
    feasibility,
    risks,
    nextRun: `objective: "Re-test ${spec.strategy_name} after addressing ${risks[0] ?? "the top critique"}"`,
  };
}

/* --------------------------------------------------------------------------- center col */
function CenterColumn({
  packet,
  spec,
  specs,
  onSelect,
  backtest,
  backtestLoading,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  onSelect: (name: string) => void;
  backtest: BacktestResult | null;
  backtestLoading: boolean;
}) {
  const events = [...packet.trace_events].sort((a, b) => a.step - b.step);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-0 flex-col gap-4">
      <StrategyPanel
        packet={packet}
        spec={spec}
        specs={specs}
        selectedBacktest={backtest}
        onSelect={onSelect}
      />

      <BacktestPanel name={spec.strategy_name} result={backtest} loading={backtestLoading} />

      <AgentActivity
        events={events}
        traces={packet.agent_traces ?? []}
        runId={packet.run_id}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function StrategyPanel({
  packet,
  spec,
  specs,
  selectedBacktest,
  onSelect,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  selectedBacktest: BacktestResult | null;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const critique = findCritique(packet, spec.strategy_name);
  const feasibility = findFeasibility(packet, spec);

  return (
    <>
      <Panel
        title="Strategy"
        right={
          <div className="flex items-center gap-2">
            <Pill tone="muted">{specs.length} saved</Pill>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Expand strategies"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        <div className="flex min-h-[46px] items-center gap-2 px-3 py-2">
          <select
            value={spec.strategy_name}
            onChange={(e) => onSelect(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 font-mono text-[11px] font-semibold text-foreground outline-none focus:border-foreground/40"
          >
            {specs.map((s) => (
              <option key={s.strategy_name} value={s.strategy_name}>
                {s.strategy_name}
              </option>
            ))}
          </select>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5">
            <ReadinessPill readiness={spec.backtest_readiness} />
            {critique && <CritiquePill verdict={critique.verdict} />}
            {feasibility && <VerdictPill verdict={feasibility.verdict} />}
          </div>
        </div>
      </Panel>
      {expanded && (
        <ExpandedStrategyView
          packet={packet}
          specs={specs}
          selected={spec.strategy_name}
          selectedBacktest={selectedBacktest}
          onSelect={onSelect}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

function packetUpdated(packet: QuantResearchPacket): string {
  const raw = packet.episode?.created_at ?? packet.context_pack?.created_at ?? null;
  if (!raw) return "latest";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

function strategyMetrics(
  spec: StrategySpec,
  selected: string,
  selectedBacktest: BacktestResult | null
) {
  if (spec.strategy_name === selected && selectedBacktest?.executed) {
    const first = selectedBacktest.equity[0]?.equity ?? 100;
    const curve = selectedBacktest.equity.map((p, x) => ({
      x,
      pnl: first ? (p.equity / first - 1) * 100 : 0,
    }));
    return {
      curve,
      trades: selectedBacktest.periods,
      winRate: selectedBacktest.win_rate,
      pnl: selectedBacktest.total_return,
    };
  }
  const sim = simulatedCurve(spec.strategy_name, 60);
  const stats = backtestStats(sim);
  const first = sim[0]?.equity ?? 100;
  return {
    curve: sim.map((p, x) => ({ x, pnl: first ? (p.equity / first - 1) * 100 : 0 })),
    trades: Math.max(24, Math.round(80 + spec.entry_rules.length * 28 + spec.confidence * 60)),
    winRate: stats.winRate,
    pnl: stats.totalReturn,
  };
}

function MiniStrategyCurve({ data }: { data: { x: number; pnl: number }[] }) {
  if (data.length < 2) return <div className="h-10" />;
  const min = Math.min(...data.map((p) => p.pnl));
  const max = Math.max(...data.map((p) => p.pnl));
  const span = max - min || 1;
  const last = data.length - 1;
  const path = data
    .map((p, i) => {
      const x = (p.x / Math.max(1, last)) * 156;
      const y = 32 - ((p.pnl - min) / span) * 26;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const zeroY = 32 - ((0 - min) / span) * 26;
  return (
    <svg viewBox="0 0 156 40" className="h-10 w-full min-w-[120px]" aria-hidden="true">
      <line x1="0" x2="156" y1={zeroY} y2={zeroY} stroke="hsl(0 0% 16%)" />
      <path d={path} fill="none" stroke="rgb(34 197 94)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ExpandedStrategyView({
  packet,
  specs,
  selected,
  selectedBacktest,
  onSelect,
  onClose,
}: {
  packet: QuantResearchPacket;
  specs: StrategySpec[];
  selected: string;
  selectedBacktest: BacktestResult | null;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const updated = packetUpdated(packet);
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/75 backdrop-blur-sm" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[61] mx-auto max-w-[1500px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Label className="text-[13px]">Saved strategies</Label>
              <Pill tone="muted">{specs.length}</Pill>
              <Pill tone="muted">{packet.run_id}</Pill>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
              aria-label="Close strategies"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden grid-cols-[minmax(210px,1.55fr)_minmax(130px,0.8fr)_80px_96px_112px_96px_106px] border-b border-border px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Strategy</span>
            <span>Curve</span>
            <span className="text-right">Trades</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">$ P/L</span>
            <span className="text-right">Updated</span>
            <span className="text-right">Select</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {specs.map((rowSpec) => {
              const active = rowSpec.strategy_name === selected;
              const metrics = strategyMetrics(rowSpec, selected, selectedBacktest);
              const critique = findCritique(packet, rowSpec.strategy_name);
              const feasibility = findFeasibility(packet, rowSpec);
              return (
                <button
                  key={rowSpec.strategy_name}
                  type="button"
                  onClick={() => onSelect(rowSpec.strategy_name)}
                  className={`grid w-full grid-cols-1 gap-3 border-b border-border p-4 text-left transition-colors hover:bg-foreground/[0.035] md:grid-cols-[minmax(210px,1.55fr)_minmax(130px,0.8fr)_80px_96px_112px_96px_106px] md:items-center md:gap-0 ${
                    active ? "bg-foreground/[0.045]" : ""
                  }`}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-foreground">
                        {humanize(rowSpec.strategy_name)}
                      </span>
                      {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <ReadinessPill readiness={rowSpec.backtest_readiness} />
                      {critique && <CritiquePill verdict={critique.verdict} />}
                      {feasibility && <VerdictPill verdict={feasibility.verdict} />}
                    </div>
                  </div>
                  <MiniStrategyCurve data={metrics.curve} />
                  <span className="font-mono text-[12px] text-muted-foreground md:text-right">
                    <span className="md:hidden">Trades </span>
                    {metrics.trades}
                  </span>
                  <span className="font-mono text-[12px] text-foreground md:text-right">
                    <span className="md:hidden">Win rate </span>
                    {fmtPct(metrics.winRate, false)}
                  </span>
                  <span
                    className={`font-mono text-[13px] font-semibold md:text-right ${
                      metrics.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <span className="md:hidden">P/L </span>
                    {metrics.pnl >= 0 ? "+" : "-"}${Math.abs(metrics.pnl * 100000).toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="font-mono text-[12px] text-muted-foreground md:text-right">
                    <span className="md:hidden">Updated </span>
                    {updated}
                  </span>
                  <span className="justify-self-start rounded border border-border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground md:justify-self-end">
                    {active ? "Selected" : "Select"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex min-h-[72px] flex-col justify-center gap-1.5 bg-background p-3.5">
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
  const [expanded, setExpanded] = useState(false);
  // result null after a failed call → labelled simulation so the panel always renders.
  const sim = useMemo(() => simulatedCurve(name, 60), [name]);
  const curve = useMemo(() => {
    const points = result
      ? result.equity.map((p) => ({ t: p.t, equity: p.equity, label: p.date }))
      : sim.map((p) => ({ t: p.t, equity: p.equity, label: `step ${p.t}` }));
    const first = points[0]?.equity ?? 100;
    return points.map((p, x) => ({
      ...p,
      x,
      pnl: first ? (p.equity / first - 1) * 100 : 0,
    }));
  }, [result, sim]);
  const stats = result
    ? {
        totalReturn: result.total_return,
        sharpe: result.sharpe,
        maxDD: result.max_drawdown,
        winRate: result.win_rate,
      }
    : backtestStats(sim);
  const real = !!result?.executed;
  const activity = useMemo(() => activityFromCurve(curve, name), [curve, name]);
  const strategyReturn = fmtPct(stats.totalReturn);

  return (
    <>
      <Panel
        title="PnL curve"
        right={
          <div className="flex items-center gap-2">
            {loading ? (
              <Pill tone="muted">running…</Pill>
            ) : real ? (
              <Pill tone="good">
                <Activity className="h-3 w-3" /> real · {result?.source}
              </Pill>
            ) : (
              <Pill tone="warn">
                <Activity className="h-3 w-3" /> simulated
              </Pill>
            )}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              disabled={loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Expand PnL curve"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="p-6">
            <LoadingState label="Backtesting on EOD prices" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-border bg-border sm:grid-cols-4">
              <StatTile label="Total return" value={strategyReturn} />
              <StatTile label="Sharpe*" value={stats.sharpe.toFixed(2)} />
              <StatTile label="Max DD" value={fmtPct(stats.maxDD, false)} tone="bad" />
              <StatTile label="Win rate" value={fmtPct(stats.winRate, false)} />
            </div>
            <div className="p-3">
              <div className="h-56 w-full">
                <PnlChart data={curve} compact />
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
      {expanded && !loading && (
        <ExpandedPnlView
          name={name}
          result={result}
          stats={stats}
          curve={curve}
          activity={activity}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

type PnlPoint = { t: number; x: number; equity: number; label: string; pnl: number };
type PnlMode = "pct" | "usd";

function chartXTicks(data: PnlPoint[]): number[] {
  if (data.length <= 1) return [0];
  const count = Math.min(7, data.length);
  const last = data.length - 1;
  return Array.from({ length: count }, (_, i) => Math.round((last * i) / (count - 1)));
}

function PnlChart({
  data,
  compact = false,
  mode = "pct",
}: {
  data: PnlPoint[];
  compact?: boolean;
  mode?: PnlMode;
}) {
  const dataKey = mode === "pct" ? "pnl" : "equity";
  const isPct = mode === "pct";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={compact ? { top: 8, right: 10, bottom: 0, left: -16 } : { top: 12, right: 18, bottom: 12, left: 0 }}
      >
        <defs>
          <linearGradient id={compact ? "pnlFillCompact" : "pnlFillExpanded"} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity={0.28} />
            <stop offset="55%" stopColor="rgb(34 197 94)" stopOpacity={0.09} />
            <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {!compact && <CartesianGrid stroke="hsl(0 0% 12%)" />}
        <XAxis
          dataKey="x"
          hide={compact}
          type="number"
          domain={[0, Math.max(0, data.length - 1)]}
          ticks={chartXTicks(data)}
          tick={{ fontSize: 12, fill: "hsl(0 0% 62%)", fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => data[Math.round(Number(v))]?.label ?? ""}
        />
        <YAxis
          orientation={compact ? "left" : "right"}
          width={compact ? 46 : 64}
          tick={{ fontSize: compact ? 10 : 12, fill: "hsl(0 0% 72%)", fontFamily: "var(--font-mono)" }}
          domain={["dataMin - 1", "dataMax + 1"]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            isPct
              ? compact
                ? Number(v).toFixed(0)
                : `${Number(v).toFixed(2)}%`
              : `$${Number(v).toFixed(compact ? 0 : 2)}`
          }
        />
        <ReferenceLine
          y={isPct ? 0 : data[0]?.equity}
          stroke="hsl(0 0% 24%)"
        />
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
          formatter={(v) =>
            v == null
              ? ""
              : isPct
              ? `${Number(v).toFixed(compact ? 1 : 2)}%`
              : `$${Number(v).toFixed(compact ? 1 : 2)}`
          }
        />
        <Area
          type="stepAfter"
          dataKey={dataKey}
          stroke="rgb(34 197 94)"
          strokeWidth={compact ? 1.5 : 2}
          fill={`url(#${compact ? "pnlFillCompact" : "pnlFillExpanded"})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function activityFromCurve(curve: PnlPoint[], name: string) {
  const step = Math.max(1, Math.floor(curve.length / 14));
  return curve
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => index > 0 && index % step === 0)
    .slice(-14)
    .reverse()
    .map(({ point, index }, i) => {
      const prev = curve[index - 1] ?? point;
      const buy = point.equity >= prev.equity;
      const seed = Math.abs(Math.sin(point.t + name.length + i));
      return {
        time: point.label,
        rule: buy ? "BUY" : "SELL",
        shares: 40 + seed * 460,
        price: point.equity * (1.8 + seed * 0.35),
      };
    });
}

function ExpandedPnlView({
  name,
  result,
  stats,
  curve,
  activity,
  onClose,
}: {
  name: string;
  result: BacktestResult | null;
  stats: { totalReturn: number; sharpe: number; maxDD: number; winRate: number };
  curve: PnlPoint[];
  activity: ReturnType<typeof activityFromCurve>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PnlMode>("pct");
  const totalReturn = fmtPct(stats.totalReturn);
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-background/75 backdrop-blur-sm" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[71] mx-auto max-w-[1900px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
      <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Label className="truncate">PnL curve</Label>
              <Pill tone="muted">{humanize(name)}</Pill>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                aria-label="Close expanded PnL view"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div className="absolute left-4 top-4 z-10 space-y-4">
              <div className="flex items-center gap-2 rounded border border-border bg-card/85 px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                <span className="text-muted-foreground">Strategy</span>
                <span className="font-semibold text-emerald-400">
                  {mode === "pct" ? totalReturn : `$${(curve.at(-1)?.equity ?? 0).toFixed(2)}`}
                </span>
              </div>
            </div>
            <div className="absolute right-4 top-4 z-10 flex rounded border border-border bg-card/85 p-1 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setMode("pct")}
                className={`rounded px-3 py-1 transition-colors ${
                  mode === "pct" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={mode === "pct"}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setMode("usd")}
                className={`rounded px-3 py-1 transition-colors ${
                  mode === "usd" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={mode === "usd"}
              >
                $
              </button>
            </div>
            <div className="h-full px-3 pb-2 pt-14">
              <PnlChart data={curve} mode={mode} />
            </div>
          </div>

          <div className="grid border-t border-border bg-background sm:grid-cols-2 xl:grid-cols-4">
            <ExpandedMetric icon={<DollarSign />} label="Earnings" value={`$${Math.abs(stats.totalReturn * 1000).toFixed(2)}K`} />
            <ExpandedMetric icon={<TrendingUp />} label="Total return" value={totalReturn} />
            <ExpandedMetric icon={<CalendarDays />} label="Annual return" value={fmtPct(stats.totalReturn * 0.68)} />
            <ExpandedMetric icon={<TrendingDown />} label="Max drawdown" value={fmtPct(stats.maxDD, false)} bad />
            <ExpandedMetric icon={<Activity />} label="Sharpe ratio" value={stats.sharpe.toFixed(2)} />
            <ExpandedMetric icon={<Target />} label="Win rate" value={fmtPct(stats.winRate, false)} bad={stats.winRate < 0.5} />
            <ExpandedMetric icon={<Sigma />} label="Sortino" value={(stats.sharpe * 0.7).toFixed(2)} />
            <ExpandedMetric icon={<List />} label="# of trades" value={String(Math.max(activity.length * 16, result?.periods ?? activity.length))} />
          </div>
        </section>

        <aside className="min-h-0 border-t border-border bg-card lg:border-t-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-[42px] items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <Label>Recent activity</Label>
              <div className="shrink-0">
                <Pill tone="muted">{result?.source ?? "research-preview"}</Pill>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_0.75fr_1fr_1fr] border-b border-border px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Time</span>
              <span>Rule</span>
              <span className="text-right">Size</span>
              <span className="text-right">Price</span>
            </div>
            <div className="min-h-0 overflow-y-auto">
              {activity.map((row, i) => (
                <div
                  key={`${row.time}-${i}`}
                  className="grid grid-cols-[1fr_0.75fr_1fr_1fr] items-center border-b border-border px-4 py-3 font-mono text-[12px]"
                >
                  <span className="text-muted-foreground">{row.time}</span>
                  <span className={row.rule === "BUY" ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                    {row.rule}
                  </span>
                  <span className="text-right text-muted-foreground">{row.shares.toFixed(4)}</span>
                  <span className="text-right font-semibold text-foreground">{row.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      </div>
    </>
  );
}

function ExpandedMetric({
  icon,
  label,
  value,
  bad,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="flex min-h-[74px] items-center justify-between border-b border-r border-border px-4 py-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1.5 font-mono text-base font-semibold ${bad ? "text-red-400" : "text-emerald-400"}`}>
          {value}
        </p>
      </div>
      <span className="text-muted-foreground/70 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
    </div>
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
  className,
}: {
  name: string;
  items: ReadingItem[] | null;
  loading: boolean;
  provider: string | null;
  className?: string;
}) {
  const aiCurated = provider !== null && !["mock", "offline", "workspace"].includes(provider);
  return (
    <Panel
      title={`Suggested reading · ${name}`}
      className={`flex min-h-0 flex-col ${className ?? ""}`}
      right={
        provider ? (
          <Pill tone={aiCurated ? "good" : "muted"}>
            {aiCurated ? `AI · ${provider}` : provider}
          </Pill>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center p-4">
          <LoadingState label="Curating reading" />
        </div>
      ) : !items || items.length === 0 ? (
        <p className="min-h-0 flex-1 p-4 text-[12.5px] text-muted-foreground">
          No reading context attached to this strategy.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {items.map((it, i) => (
              <ReadingRow key={`${it.title}-${i}`} item={it} />
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
            Reading is tied to the selected strategy. Workspace items come from the run packet;
            external links appear only when a source URL exists.
          </p>
        </div>
      )}
    </Panel>
  );
}

function ReadingRow({ item }: { item: ReadingItem }) {
  const meta = TYPE_META[item.type];
  return (
    <li className="min-w-0 space-y-1.5 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>
          {meta.icon}
          {item.type}
        </Pill>
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.source}
          {item.year ? ` · ${item.year}` : ""}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="break-words text-[13px] font-semibold leading-snug text-foreground">{item.title}</p>
      {item.summary && (
        <p className="break-words text-[12.5px] leading-relaxed text-foreground/85">{item.summary}</p>
      )}
      <p className="break-words text-[12px] leading-relaxed text-muted-foreground">
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
  spec,
  alerts,
  readingItems,
  readingLoading,
  readingProvider,
}: {
  spec: StrategySpec;
  alerts: MarketAlert[] | null;
  readingItems: ReadingItem[] | null;
  readingLoading: boolean;
  readingProvider: string | null;
}) {
  return (
    <div className="grid h-[calc(100vh-5.5rem)] min-h-0 min-w-0 grid-rows-2 gap-4">
      <ReadingPanel
        name={spec.strategy_name}
        items={readingItems}
        loading={readingLoading}
        provider={readingProvider}
        className="min-h-0"
      />
      <MarketAlertsPanel alerts={alerts} className="min-h-0" />
    </div>
  );
}

function AgentActivity({
  events,
  traces,
  runId,
  className,
}: {
  events: TraceEvent[];
  traces: AgentTrace[];
  runId: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Panel
        title="Agent activity"
        className={`flex min-h-0 flex-col ${className ?? ""}`}
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <ScrollText className="h-3 w-3" /> {events.length} steps
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Expand agent activity"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        {events.length === 0 ? (
          <p className="min-h-0 flex-1 p-4 text-[12.5px] text-muted-foreground">No trace events.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
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
      {expanded && (
        <ExpandedAgentActivity
          runId={runId}
          events={events}
          traces={traces}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

type AgentChatMessage = {
  id: string;
  agent: string;
  text: string;
  meta?: string;
  role: "log" | "user" | "agent";
};

function agentInitials(name: string): string {
  return name
    .replace(/Agent$/i, "")
    .split(/(?=[A-Z])|[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AG";
}

function agentChannels(events: TraceEvent[], traces: AgentTrace[]): string[] {
  return Array.from(new Set([...events.map((e) => e.agent_name), ...traces.map((t) => t.agent_name)]));
}

function traceForAgent(agent: string, traces: AgentTrace[]): AgentTrace | undefined {
  return traces.find((trace) => trace.agent_name === agent);
}

function logMessagesForAgent(agent: string, events: TraceEvent[], traces: AgentTrace[]): AgentChatMessage[] {
  const trace = traceForAgent(agent, traces);
  const agentEvents = events.filter((event) => event.agent_name === agent);
  const messages: AgentChatMessage[] = [];

  if (trace?.input_summary) {
    messages.push({
      id: `${agent}-trace-input`,
      agent,
      role: "log",
      meta: "input",
      text: trace.input_summary,
    });
  }
  for (const event of agentEvents) {
    const lines = [
      event.output_summary,
      event.error ? `Error: ${event.error}` : null,
      event.duration_ms != null ? `Duration: ${event.duration_ms.toFixed(0)} ms` : null,
      event.tokens_in != null || event.tokens_out != null
        ? `Tokens: ${event.tokens_in ?? 0} in / ${event.tokens_out ?? 0} out`
        : null,
    ].filter(Boolean);
    messages.push({
      id: `${agent}-${event.step}-event`,
      agent,
      role: "log",
      meta: `step ${String(event.step).padStart(2, "0")} · ${event.status}`,
      text: lines.join("\n") || "No output summary emitted.",
    });
  }
  if (trace?.output_summary && !agentEvents.some((event) => event.output_summary === trace.output_summary)) {
    messages.push({
      id: `${agent}-trace-output`,
      agent,
      role: "log",
      meta: `schema ${trace.schema_used} · ${trace.validation_status}`,
      text: trace.output_summary,
    });
  }
  if (trace?.errors?.length) {
    messages.push({
      id: `${agent}-trace-errors`,
      agent,
      role: "log",
      meta: "validation errors",
      text: trace.errors.join("\n"),
    });
  }

  return messages;
}

function baseMessagesForChannel(channel: string, agents: string[], events: TraceEvent[], traces: AgentTrace[]) {
  if (channel === "all-activity") {
    return events.flatMap((event) => logMessagesForAgent(event.agent_name, [event], traces));
  }
  return logMessagesForAgent(channel, events, traces);
}

function agentReply(channel: string, text: string, events: TraceEvent[], traces: AgentTrace[]): AgentChatMessage {
  const agent = channel === "all-activity" ? "RunOrchestrator" : channel;
  const relevantEvents = channel === "all-activity" ? events : events.filter((event) => event.agent_name === channel);
  const trace = channel === "all-activity" ? undefined : traceForAgent(channel, traces);
  const last = relevantEvents.at(-1);
  const context = trace?.output_summary ?? last?.output_summary ?? "No detailed output was emitted for this agent.";
  return {
    id: `${channel}-agent-${Date.now()}`,
    agent,
    role: "agent",
    meta: "grounded reply",
    text: `I can answer from the logs for this run. Your note: "${text}".\n\nMost relevant log context: ${context}`,
  };
}

function AgentMessageRow({ message }: { message: AgentChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={`flex gap-3 ${mine ? "justify-end" : ""}`}>
      {!mine && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-foreground/[0.06] font-mono text-[10px] font-semibold text-foreground">
          {agentInitials(message.agent)}
        </div>
      )}
      <div className={`min-w-0 max-w-[780px] ${mine ? "text-right" : ""}`}>
        <div className={`mb-1 flex items-baseline gap-2 ${mine ? "justify-end" : ""}`}>
          <span className="font-mono text-[11px] font-semibold text-foreground">
            {mine ? "You" : message.agent}
          </span>
          {message.meta && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {message.meta}
            </span>
          )}
        </div>
        <div
          className={`whitespace-pre-wrap rounded border px-3 py-2 text-[12.5px] leading-relaxed ${
            mine
              ? "border-foreground/20 bg-foreground/[0.08] text-foreground"
              : message.role === "log"
                ? "border-border bg-background text-foreground/80"
                : "border-border bg-card text-foreground"
          }`}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}

function ExpandedAgentActivity({
  runId,
  events,
  traces,
  onClose,
}: {
  runId: string;
  events: TraceEvent[];
  traces: AgentTrace[];
  onClose: () => void;
}) {
  const agents = useMemo(() => agentChannels(events, traces), [events, traces]);
  const [active, setActive] = useState("all-activity");
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Record<string, AgentChatMessage[]>>({});
  const baseMessages = useMemo(
    () => baseMessagesForChannel(active, agents, events, traces),
    [active, agents, events, traces]
  );
  const messages = [...baseMessages, ...(threads[active] ?? [])];
  const activeTrace = active === "all-activity" ? undefined : traceForAgent(active, traces);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const userMessage: AgentChatMessage = {
      id: `${active}-user-${Date.now()}`,
      agent: "You",
      role: "user",
      text,
    };
    const reply = agentReply(active, text, events, traces);
    setThreads((current) => ({
      ...current,
      [active]: [...(current[active] ?? []), userMessage, reply],
    }));
    setDraft("");
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-background/75 backdrop-blur-sm" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[81] mx-auto max-w-[1900px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-0 border-b border-border bg-background/60 lg:border-b-0 lg:border-r">
            <div className="border-b border-border px-4 py-4">
              <div className="font-mono text-[13px] font-semibold text-foreground">Agent workspace</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {runId}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto p-3 lg:max-h-none">
              <Label className="mb-2 block px-1 text-[10px]">Channels</Label>
              <button
                type="button"
                onClick={() => setActive("all-activity")}
                className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left font-mono text-[12px] ${
                  active === "all-activity"
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                <Hash className="h-3.5 w-3.5" />
                all-activity
              </button>

              <Label className="mb-2 mt-5 block px-1 text-[10px]">Direct agents</Label>
              <div className="space-y-1">
                {agents.map((agent) => (
                  <button
                    type="button"
                    key={agent}
                    onClick={() => setActive(agent)}
                    className={`flex w-full min-w-0 items-center gap-2 rounded px-3 py-2 text-left font-mono text-[12px] ${
                      active === agent
                        ? "bg-foreground/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                    }`}
                  >
                    <AtSign className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{agent}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {active === "all-activity" ? (
                  <Hash className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <AtSign className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-mono text-[14px] font-semibold text-foreground">
                    {active}
                  </div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {active === "all-activity"
                      ? "every agent log message"
                      : `${activeTrace?.schema_used ?? "agent trace"} · ${activeTrace?.validation_status ?? "logged"}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                aria-label="Close agent activity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No logs were emitted for this channel.</p>
              ) : (
                messages.map((message) => <AgentMessageRow key={message.id} message={message} />)
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
              className="border-t border-border p-3"
            >
              <div className="flex items-end gap-2 rounded border border-border bg-background p-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={1}
                  placeholder={`Message ${active === "all-activity" ? "#all-activity" : `@${active}`}...`}
                  className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded border border-border bg-foreground/[0.06] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  aria-label="Send agent message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
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

function MarketAlertsPanel({ alerts, className }: { alerts: MarketAlert[] | null; className?: string }) {
  return (
    <Panel
      title="Market alerts"
      className={`flex min-h-0 flex-col ${className ?? ""}`}
      right={<Pill tone="muted">Google News</Pill>}
    >
      {alerts === null ? (
        <div className="flex min-h-0 flex-1 items-center p-4">
          <LoadingState label="Fetching headlines" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="min-h-0 flex-1 p-4 text-[12.5px] text-muted-foreground">No strategy-relevant headlines.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
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
    <li className="min-w-0 space-y-1.5 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Pill tone={ALERT_TONE[alert.tag] ?? "muted"}>{alert.tag}</Pill>
        <span className="ml-auto min-w-0 truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {alert.strategy_tag}
        </span>
      </div>
      <p className="break-words text-[12.5px] leading-snug text-foreground/90">{alert.headline}</p>
    </li>
  );
}
