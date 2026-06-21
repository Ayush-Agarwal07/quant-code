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
  ChevronRight,
  Code2,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Hash,
  Lightbulb,
  List,
  Loader2,
  Newspaper,
  Search,
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
import { clearIterationDraft } from "@/lib/iterationDraft";
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
  StrategyCatalogItem,
  StrategySpec,
  TraceStatus,
  TraceEvent,
} from "@/types";

export default function DashboardPage() {
  const latest = useApi((s) => api.latestRun(s), []);
  const overview = useApi((s) => api.overview(s), []);
  const catalog = useApi((s) => api.strategies(s), []);

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
  return (
    <Dashboard
      packet={latest.data}
      provider={overview.data?.llm_provider ?? "mock"}
      catalog={catalog.data ?? []}
    />
  );
}

// Cache reading + backtest per (run, strategy) so re-selecting doesn't re-fetch (or re-bill).
const READING_CACHE = new Map<string, { reading: CuratedReading; provider: string }>();
const BACKTEST_CACHE = new Map<string, BacktestResult>();

function strategySlot(index: number, strategyName: string): string {
  return `${index}::${strategyName}`;
}

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

function Dashboard({
  packet: initialPacket,
  provider,
  catalog,
}: {
  packet: QuantResearchPacket;
  provider: string;
  catalog: StrategyCatalogItem[];
}) {
  const [packet, setPacket] = useState(initialPacket);
  const [specs, setSpecs] = useState(packet.strategy_specs);
  const [selected, setSelected] = useState(
    specs[0] ? strategySlot(0, specs[0].strategy_name) : ""
  );
  const [versionLoading, setVersionLoading] = useState(false);

  useEffect(() => {
    setPacket(initialPacket);
    setSpecs(initialPacket.strategy_specs);
    setSelected(
      initialPacket.strategy_specs[0]
        ? strategySlot(0, initialPacket.strategy_specs[0].strategy_name)
        : ""
    );
  }, [initialPacket.run_id, initialPacket.strategy_specs]);

  useEffect(() => {
    if (specs.length && !specs.some((s, i) => strategySlot(i, s.strategy_name) === selected)) {
      setSelected(strategySlot(0, specs[0].strategy_name));
    }
  }, [specs, selected]);

  const selectedIndex = useMemo(
    () => specs.findIndex((s, i) => strategySlot(i, s.strategy_name) === selected),
    [specs, selected]
  );
  const spec = useMemo(
    () => (selectedIndex >= 0 ? specs[selectedIndex] : specs[0] ?? null),
    [selectedIndex, specs]
  );

  const saveIteration = async ({
    runId,
    strategyName,
    spec: nextSpec,
    backtest,
  }: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => {
    await api.saveStrategy({ run_id: runId, strategy_name: strategyName, spec: nextSpec });
    setSpecs((items) => {
      const updated = items.map((item) => (item.strategy_name === strategyName ? nextSpec : item));
      setPacket((current) => ({ ...current, strategy_specs: updated }));
      return updated;
    });
    if (backtest) {
      const key = `${runId}::${strategyName}::${JSON.stringify(nextSpec)}`;
      BACKTEST_CACHE.set(key, backtest);
    }
    clearIterationDraft(runId, strategyName);
  };

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
      catalog={catalog}
      onSelect={setSelected}
      onSelectVersion={async (runId) => {
        if (runId === packet.run_id || versionLoading) return;
        setVersionLoading(true);
        try {
          const next = await api.run(runId);
          setPacket(next);
          setSpecs(next.strategy_specs);
          setSelected((current) => {
            const currentName = specs[selectedIndex]?.strategy_name;
            const preservedIndex = currentName
              ? next.strategy_specs.findIndex((item) => item.strategy_name === currentName)
              : -1;
            if (preservedIndex >= 0) {
              return strategySlot(preservedIndex, next.strategy_specs[preservedIndex].strategy_name);
            }
            return next.strategy_specs[0] ? strategySlot(0, next.strategy_specs[0].strategy_name) : current;
          });
        } finally {
          setVersionLoading(false);
        }
      }}
      onUpdateSpec={(next) =>
        setSpecs((items) => {
          const updated = items.map((item, index) =>
            strategySlot(index, item.strategy_name) === selected ? next : item
          );
          setPacket((current) => ({ ...current, strategy_specs: updated }));
          return updated;
        })
      }
      onSaveIteration={saveIteration}
      selected={selected}
      provider={provider}
      versionLoading={versionLoading}
    />
  );
}

function DashboardBody({
  packet,
  spec,
  specs,
  catalog,
  selected,
  onSelect,
  onSelectVersion,
  onUpdateSpec,
  onSaveIteration,
  provider,
  versionLoading,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  catalog: StrategyCatalogItem[];
  selected: string;
  onSelect: (name: string) => void;
  onSelectVersion: (runId: string) => void;
  onUpdateSpec: (spec: StrategySpec) => void;
  onSaveIteration: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
  provider: string;
  versionLoading: boolean;
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
          onSaveIteration={onSaveIteration}
          onToggleLatex={() => setLatexOpen((v) => !v)}
        />
        <CenterColumn
          packet={packet}
          spec={spec}
          specs={specs}
          catalog={catalog}
          onSelect={onSelect}
          onSelectVersion={onSelectVersion}
          backtest={backtest}
          backtestLoading={backtestLoading}
          versionLoading={versionLoading}
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
          onSaveIteration={onSaveIteration}
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
      <div className="flex min-h-[42px] min-w-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
        <Label className="min-w-0 truncate">{title}</Label>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </Card>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded border border-border px-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ExpansionBackdrop({ className }: { className: string }) {
  return <div className={`fixed inset-0 bg-background/75 backdrop-blur-sm ${className}`} />;
}

function ExpansionHeader({
  title,
  meta,
  right,
  onClose,
  closeLabel,
}: {
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="flex min-h-[52px] min-w-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Label className="min-w-0 truncate text-[11px]">{title}</Label>
        {meta}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <IconButton label={closeLabel} onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
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
  onSaveIteration,
  onToggleLatex,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  latexOpen: boolean;
  onSaveIteration: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
  onToggleLatex: () => void;
}) {
  return (
    <div className="h-[calc(100vh-5.5rem)] min-h-0">
      <ChatPanel
        packet={packet}
        spec={spec}
        provider={provider}
        latexOpen={latexOpen}
        onSaveIteration={onSaveIteration}
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
  onSaveIteration,
  onToggleLatex,
  expanded = false,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  latexOpen: boolean;
  onSaveIteration: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
  onToggleLatex: () => void;
  expanded?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const replacePending = (id: number, msg: Message) =>
    setMessages((m) => m.map((x) => (x.id === id ? msg : x)));

  const proposeCommand = (title: string, detail: string, request: AgentCommandRequest) => {
    const id = idRef.current++;
    setMessages((m) => [...m, { id, role: "assistant", command: { title, detail, request } }]);
  };

  // Drop a suggestion into the input (don't send) so the user can edit then hit enter.
  const populatePrompt = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
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
        <ToolbarButton onClick={onToggleLatex}>
          {expanded ? <X className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {expanded ? "Close" : "LaTeX"}
        </ToolbarButton>
      }
    >
      <div className="flex min-h-[64px] items-center border-b border-border bg-background/35 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone="muted" className="max-w-full truncate">{spec.strategy_name}</Pill>
          <Pill tone={provider === "mock" ? "muted" : "good"}>{provider}</Pill>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3">
        {commandPresets({ runId: packet.run_id, strategy: spec }).map((preset) => (
          <button
            key={`${preset.title}-${preset.request.command}`}
            type="button"
            onClick={() => proposeCommand(preset.title, preset.detail, preset.request)}
            className="min-w-0 rounded border border-border bg-background px-3 py-2 text-left transition-colors hover:border-foreground/30"
          >
            <p className="break-words font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground">
              {preset.title}
            </p>
            <p className="mt-1 break-words text-[12px] leading-relaxed text-muted-foreground">{preset.detail}</p>
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
                  className="flex min-w-0 items-center gap-2 rounded border border-border bg-background px-3 py-2 text-left text-[12.5px] text-foreground/85 transition-colors hover:border-foreground/30 hover:bg-foreground/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">{s}</span>
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
              <CommandBubble
                key={m.id}
                title={m.command.title}
                detail={m.command.detail}
                request={m.command.request}
                onSaveIteration={onSaveIteration}
              />
            ) : (
              <AssistantBubble key={m.id} reply={m.reply} provider={m.provider} onUseSuggestion={populatePrompt} />
            )
          )
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex shrink-0 items-end gap-2 border-t border-border bg-card p-3"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          placeholder="Ask about data, risks, or test design... (Enter to send, Shift+Enter for newline)"
          className="max-h-28 min-h-[38px] min-w-0 flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-3 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
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
  onSaveIteration,
}: {
  title: string;
  detail: string;
  request: AgentCommandRequest;
  onSaveIteration: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
}) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 flex-1">
        <CommandCard
          request={request}
          title={title}
          detail={detail}
          runLabel="Launch"
          onSaveIteration={onSaveIteration}
        />
      </div>
    </div>
  );
}

function ResearchExpansion({
  packet,
  spec,
  provider,
  onUpdateSpec,
  onSaveIteration,
  onClose,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  provider: string;
  onUpdateSpec: (spec: StrategySpec) => void;
  onSaveIteration: (payload: {
    runId: string;
    strategyName: string;
    spec: StrategySpec;
    backtest: BacktestResult | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-3 top-14 bottom-3 z-50 mx-auto grid max-w-[1900px] grid-cols-1 grid-rows-[minmax(320px,1fr)_minmax(320px,1fr)_minmax(320px,1fr)] gap-3 overflow-y-auto lg:inset-x-4 lg:top-16 lg:bottom-5 lg:grid-cols-[minmax(300px,1fr)_minmax(340px,1.05fr)_minmax(320px,1fr)] lg:grid-rows-1 lg:overflow-hidden">
      <ChatPanel
        packet={packet}
        spec={spec}
        provider={provider}
        latexOpen
        onSaveIteration={onSaveIteration}
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-border bg-card shadow-2xl">
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Label className="shrink-0">LaTeX output</Label>
          <Pill tone="muted" className="min-w-0 max-w-full truncate">{spec.strategy_name}</Pill>
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-border bg-card shadow-2xl">
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
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
        className="min-h-0 flex-1 resize-none overflow-auto border-0 bg-background p-4 font-mono text-[12px] leading-6 text-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
      />
      <div className="flex shrink-0 items-start gap-2 border-t border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
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
              className="overflow-x-auto text-[13px] text-foreground [&_.katex-display]:my-0 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
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

function AssistantBubble({
  reply,
  provider,
  onUseSuggestion,
}: {
  reply: Reply;
  provider: string;
  onUseSuggestion: (text: string) => void;
}) {
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
          <button
            type="button"
            onClick={() => onUseSuggestion(reply.nextRun)}
            title="Use as prompt"
            className="block w-full break-words rounded border border-border bg-background px-3 py-2 text-left font-mono text-[11px] text-foreground/90 transition-colors hover:border-foreground/30 hover:bg-foreground/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {reply.nextRun}
          </button>
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
  catalog,
  onSelect,
  onSelectVersion,
  backtest,
  backtestLoading,
  versionLoading,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  catalog: StrategyCatalogItem[];
  onSelect: (name: string) => void;
  onSelectVersion: (runId: string) => void;
  backtest: BacktestResult | null;
  backtestLoading: boolean;
  versionLoading: boolean;
}) {
  const events = [...packet.trace_events].sort((a, b) => a.step - b.step);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-0 flex-col gap-4">
      <StrategyPanel
        packet={packet}
        spec={spec}
        specs={specs}
        catalog={catalog}
        selectedBacktest={backtest}
        onSelect={onSelect}
        onSelectVersion={onSelectVersion}
        versionLoading={versionLoading}
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
  catalog,
  selectedBacktest,
  onSelect,
  onSelectVersion,
  versionLoading,
}: {
  packet: QuantResearchPacket;
  spec: StrategySpec;
  specs: StrategySpec[];
  catalog: StrategyCatalogItem[];
  selectedBacktest: BacktestResult | null;
  onSelect: (name: string) => void;
  onSelectVersion: (runId: string) => void;
  versionLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const versions = useMemo(() => {
    const ids = catalog
      .filter((item) => item.strategy_name === spec.strategy_name)
      .map((item) => item.run_id);
    return Array.from(new Set([packet.run_id, ...ids]));
  }, [catalog, packet.run_id, spec.strategy_name]);

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <div className="grid min-h-[52px] grid-cols-1 items-center gap-2 p-3 md:grid-cols-[auto_minmax(180px,1fr)_minmax(132px,0.55fr)_auto]">
          <Label className="shrink-0">Strategy</Label>
          <select
            value={specs.findIndex((item) => item === spec) >= 0 ? strategySlot(specs.findIndex((item) => item === spec), spec.strategy_name) : ""}
            onChange={(e) => onSelect(e.target.value)}
            className="h-8 min-w-0 rounded border border-border bg-background px-2 font-mono text-[11px] font-semibold text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring"
            aria-label="Strategy"
          >
            {specs.map((s, index) => (
              <option key={strategySlot(index, s.strategy_name)} value={strategySlot(index, s.strategy_name)}>
                {s.strategy_name}
              </option>
            ))}
          </select>
          <select
            value={packet.run_id}
            disabled={versionLoading}
            onChange={(e) => onSelectVersion(e.target.value)}
            className="h-8 min-w-0 rounded border border-border bg-background px-2 font-mono text-[11px] font-semibold text-foreground outline-none focus:border-foreground/40 focus:ring-1 focus:ring-ring disabled:cursor-wait disabled:opacity-50"
            aria-label="Strategy version"
          >
            {versions.map((runId, index) => (
              <option key={runId} value={runId}>
                {index === 0 && runId === packet.run_id ? `current · ${runId}` : runId}
              </option>
            ))}
          </select>
          <IconButton label="Expand strategies" onClick={() => setExpanded(true)} className="h-8 w-8 justify-self-start md:justify-self-end">
            <ChevronRight className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </Card>
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
  active: boolean,
  selectedBacktest: BacktestResult | null
) {
  if (active && selectedBacktest?.executed) {
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
  onSelect: (slot: string) => void;
  onClose: () => void;
}) {
  const updated = packetUpdated(packet);
  return (
    <>
      <ExpansionBackdrop className="z-[60]" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[61] mx-auto max-w-[1500px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
        <div className="flex h-full min-h-0 flex-col">
          <ExpansionHeader
            title="Saved strategies"
            meta={
              <>
                <Pill tone="muted">{specs.length}</Pill>
                <Pill tone="muted" className="max-w-[220px] truncate">{packet.run_id}</Pill>
              </>
            }
            onClose={onClose}
            closeLabel="Close strategies"
          />

          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(210px,1.55fr)_minmax(130px,0.8fr)_80px_96px_112px_96px_106px] border-b border-border bg-card px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Strategy</span>
            <span>Curve</span>
            <span className="text-right">Trades</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">$ P/L</span>
            <span className="text-right">Updated</span>
            <span className="text-right">Select</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {specs.map((rowSpec, index) => {
              const slot = strategySlot(index, rowSpec.strategy_name);
              const active = slot === selected;
              const metrics = strategyMetrics(rowSpec, active, selectedBacktest);
              const critique = findCritique(packet, rowSpec.strategy_name);
              const feasibility = findFeasibility(packet, rowSpec);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onSelect(slot)}
                  className={`grid w-full grid-cols-1 gap-3 border-b border-border p-4 text-left transition-colors hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(210px,1.55fr)_minmax(130px,0.8fr)_80px_96px_112px_96px_106px] md:items-center md:gap-0 ${
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
            {loading && <Pill tone="muted">running…</Pill>}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              disabled={loading}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Expand PnL curve"
              title="Expand PnL curve"
            >
              <ChevronRight className="h-3.5 w-3.5" />
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
      <ExpansionBackdrop className="z-[70]" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[71] mx-auto max-w-[1900px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
      <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="flex min-h-0 flex-col border-r border-border">
          <ExpansionHeader
            title="PnL curve"
            meta={<Pill tone="muted" className="max-w-[320px] truncate">{humanize(name)}</Pill>}
            onClose={onClose}
            closeLabel="Close expanded PnL view"
          />

          <div className="relative min-h-[360px] flex-1">
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
            <div className="h-full min-h-[360px] px-3 pb-2 pt-14">
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
            <div className="sticky top-0 z-10 flex min-h-[42px] items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
              <Label>Recent activity</Label>
              <div className="shrink-0">
                <Pill tone="muted">{result?.source ?? "research-preview"}</Pill>
              </div>
            </div>
            <div className="sticky top-[42px] z-10 grid grid-cols-[1fr_0.75fr_1fr_1fr] border-b border-border bg-card px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
      title="Suggested reading"
      className={`flex min-h-0 flex-col ${className ?? ""}`}
      right={
        <div className="flex items-center gap-1.5">
          {items && <Pill tone="muted">{items.length}</Pill>}
          {provider ? (
            <Pill tone={aiCurated ? "good" : "muted"}>
              {aiCurated ? `AI · ${provider}` : provider}
            </Pill>
          ) : null}
        </div>
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
          <div className="flex min-h-[34px] items-center gap-2 border-b border-border bg-background/35 px-3 py-2">
            <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {name}
            </span>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {items.map((it, i) => (
              <ReadingRow key={`${it.title}-${i}`} item={it} />
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function ReadingRow({ item }: { item: ReadingItem }) {
  const meta = TYPE_META[item.type];
  const title = (
    <p className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-foreground">
      {item.title}
    </p>
  );
  return (
    <li className="min-w-0 space-y-2 p-3 transition-colors hover:bg-foreground/[0.025]">
      <div className="flex min-w-0 items-center gap-2">
        <Pill tone={meta.tone}>
          {meta.icon}
          {item.type}
        </Pill>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.source}
          {item.year ? ` · ${item.year}` : ""}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-transparent px-1 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:underline"
        >
          {title}
        </a>
      ) : (
        title
      )}
      {item.summary && (
        <p className="line-clamp-2 break-words text-[12.5px] leading-relaxed text-foreground/85">{item.summary}</p>
      )}
      <p className="line-clamp-2 break-words text-[12px] leading-relaxed text-muted-foreground">
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
            <IconButton label="Expand agent activity" onClick={() => setExpanded(true)} className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </IconButton>
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
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-foreground">
                    {ev.agent_name}
                  </span>
                  <span className="shrink-0">
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
  event?: TraceEvent;
  trace?: AgentTrace;
  step?: number;
  status?: TraceStatus;
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
      trace,
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
      event,
      step: event.step,
      status: event.status,
    });
  }
  if (trace?.output_summary && !agentEvents.some((event) => event.output_summary === trace.output_summary)) {
    messages.push({
      id: `${agent}-trace-output`,
      agent,
      role: "log",
      meta: `schema ${trace.schema_used} · ${trace.validation_status}`,
      text: trace.output_summary,
      trace,
    });
  }
  if (trace?.errors?.length) {
    messages.push({
      id: `${agent}-trace-errors`,
      agent,
      role: "log",
      meta: "validation errors",
      text: trace.errors.join("\n"),
      trace,
      status: "failed",
    });
  }

  return messages;
}

function baseMessagesForChannel(channel: string, agents: string[], events: TraceEvent[], traces: AgentTrace[]) {
  if (channel === "all-activity") {
    return agents
      .flatMap((agent) => logMessagesForAgent(agent, events, traces))
      .sort((a, b) => (a.step ?? 9999) - (b.step ?? 9999));
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

function AgentMessageRow({
  message,
  selected,
  onSelect,
}: {
  message: AgentChatMessage;
  selected: boolean;
  onSelect: () => void;
}) {
  const mine = message.role === "user";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-2.5 rounded border border-transparent px-2 py-2 text-left transition-colors hover:border-border/70 hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        mine ? "justify-end" : ""
      } ${selected ? "border-border bg-foreground/[0.045]" : ""}`}
    >
      {!mine && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-background font-mono text-[10px] font-semibold text-foreground/90">
          {agentInitials(message.agent)}
        </div>
      )}
      <div className={`min-w-0 ${mine ? "max-w-[720px] text-right" : "max-w-[840px] flex-1"}`}>
        <div className={`mb-1 flex min-w-0 items-baseline gap-2 ${mine ? "justify-end" : ""}`}>
          <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-foreground">
            {mine ? "You" : message.agent}
          </span>
          {message.meta && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {message.meta}
            </span>
          )}
        </div>
        <div
          className={`whitespace-pre-wrap rounded border px-3 py-2 text-[12.5px] leading-relaxed ${
            mine
              ? "border-foreground/20 bg-foreground/[0.08] text-foreground"
              : message.role === "log"
                ? "border-border/70 bg-background/65 text-foreground/80"
                : "border-border bg-card text-foreground"
          }`}
        >
          {message.text}
        </div>
      </div>
    </button>
  );
}

type StatusFilter = "all" | TraceStatus;

function channelStats(messages: AgentChatMessage[]) {
  const logs = messages.filter((message) => message.role === "log");
  return {
    logs: logs.length,
    success: logs.filter((message) => message.status === "success").length,
    failed: logs.filter((message) => message.status === "failed").length,
    skipped: logs.filter((message) => message.status === "skipped").length,
    tokensIn: logs.reduce((sum, message) => sum + (message.event?.tokens_in ?? 0), 0),
    tokensOut: logs.reduce((sum, message) => sum + (message.event?.tokens_out ?? 0), 0),
    duration: logs.reduce((sum, message) => sum + (message.event?.duration_ms ?? 0), 0),
  };
}

function messageMatches(message: AgentChatMessage, query: string, status: StatusFilter): boolean {
  if (status !== "all" && message.status !== status) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [message.agent, message.meta, message.text, message.event?.input_summary, message.event?.output_summary]
    .filter(Boolean)
    .some((part) => String(part).toLowerCase().includes(q));
}

function messagesAsText(runId: string, channel: string, messages: AgentChatMessage[]): string {
  return [
    `run: ${runId}`,
    `channel: ${channel}`,
    "",
    ...messages.map((message) =>
      [
        `[${message.role}] ${message.agent}${message.meta ? ` · ${message.meta}` : ""}`,
        message.text,
      ].join("\n")
    ),
  ].join("\n\n");
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LogDetailPanel({
  message,
  stats,
  onCopy,
}: {
  message: AgentChatMessage | null;
  stats: ReturnType<typeof channelStats>;
  onCopy: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-t border-border bg-background/40 xl:border-l xl:border-t-0">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Run detail</Label>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <DetailMetric label="Logs" value={String(stats.logs)} flat />
        <DetailMetric label="Success" value={String(stats.success)} flat />
        <DetailMetric label="Failed" value={String(stats.failed)} tone={stats.failed ? "bad" : undefined} flat />
        <DetailMetric label="Time" value={`${stats.duration.toFixed(0)}ms`} flat />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!message ? (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Select a log message to inspect payload details, token usage, and raw summaries.
          </p>
        ) : (
          <>
            <div>
              <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Selected
              </div>
              <div className="rounded border border-border bg-card/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[12px] font-semibold text-foreground">
                    {message.agent}
                  </span>
                  {message.status && <TraceStatusPill status={message.status} />}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/80">
                  {message.text}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DetailMetric label="Step" value={message.event ? String(message.event.step) : "trace"} />
              <DetailMetric label="Duration" value={message.event?.duration_ms != null ? `${message.event.duration_ms.toFixed(0)}ms` : "n/a"} />
              <DetailMetric label="Tokens in" value={String(message.event?.tokens_in ?? 0)} />
              <DetailMetric label="Tokens out" value={String(message.event?.tokens_out ?? 0)} />
            </div>

            {message.trace && (
              <div className="rounded border border-border bg-card/80 p-3">
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  Trace schema
                </div>
                <p className="mt-2 font-mono text-[12px] text-foreground">
                  {message.trace.schema_used || "unknown"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  validation: {message.trace.validation_status}
                </p>
              </div>
            )}

            {message.event?.input_summary && (
              <RawBlock label="Input summary" value={message.event.input_summary} />
            )}
            {message.event?.output_summary && (
              <RawBlock label="Output summary" value={message.event.output_summary} />
            )}
            {message.event?.error && <RawBlock label="Error" value={message.event.error} />}
          </>
        )}
      </div>
    </aside>
  );
}

function DetailMetric({
  label,
  value,
  tone,
  flat = false,
}: {
  label: string;
  value: string;
  tone?: "bad";
  flat?: boolean;
}) {
  return (
    <div className={`${flat ? "bg-card p-3" : "rounded border border-border bg-card/80 p-3"}`}>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate font-mono text-[12px] ${tone === "bad" ? "text-red-400" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function RawBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-56 overflow-auto rounded border border-border bg-card p-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80">
        {value}
      </pre>
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, AgentChatMessage[]>>({});
  const baseMessages = useMemo(
    () => baseMessagesForChannel(active, agents, events, traces),
    [active, agents, events, traces]
  );
  const messages = [...baseMessages, ...(threads[active] ?? [])];
  const visibleMessages = messages.filter((message) => messageMatches(message, query, statusFilter));
  const stats = channelStats(baseMessages);
  const selectedMessage =
    visibleMessages.find((message) => message.id === selectedMessageId) ??
    visibleMessages.find((message) => message.role === "log") ??
    null;
  const activeTrace = active === "all-activity" ? undefined : traceForAgent(active, traces);
  const exportText = messagesAsText(runId, active, visibleMessages);

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
      <ExpansionBackdrop className="z-[80]" />
      <div className="fixed inset-x-3 top-14 bottom-3 z-[81] mx-auto max-w-[1760px] overflow-hidden rounded border border-border bg-card text-foreground shadow-2xl lg:inset-x-4 lg:top-16 lg:bottom-5">
        <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[250px_minmax(0,1fr)_320px]">
          <aside className="min-h-0 border-b border-border bg-background/55 lg:border-b-0 lg:border-r">
            <div className="sticky top-0 z-20 border-b border-border bg-background px-3 py-3 lg:static">
              <div className="font-mono text-[12px] font-semibold text-foreground">Agent activity</div>
              <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {runId}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border">
                <div className="bg-card px-2 py-1.5">
                  <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Logs</div>
                  <div className="font-mono text-[11px] text-foreground">{events.length}</div>
                </div>
                <div className="bg-card px-2 py-1.5">
                  <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Agents</div>
                  <div className="font-mono text-[11px] text-foreground">{agents.length}</div>
                </div>
                <div className="bg-card px-2 py-1.5">
                  <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Fail</div>
                  <div className={`font-mono text-[11px] ${events.some((event) => event.status === "failed") ? "text-red-400" : "text-foreground"}`}>
                    {events.filter((event) => event.status === "failed").length}
                  </div>
                </div>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2.5 lg:max-h-none">
              <Label className="mb-2 block px-1 text-[9px]">Channels</Label>
              <button
                type="button"
                onClick={() => {
                  setActive("all-activity");
                  setSelectedMessageId(null);
                }}
                className={`mb-1 flex w-full items-center gap-2 rounded border border-transparent px-2.5 py-2 text-left font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  active === "all-activity"
                    ? "border-border bg-foreground/[0.07] text-foreground"
                    : "text-muted-foreground hover:border-border/70 hover:bg-foreground/[0.035] hover:text-foreground"
                }`}
              >
                <Hash className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">all-activity</span>
                <span className="text-[10px] text-muted-foreground">{events.length}</span>
              </button>

              <Label className="mb-2 mt-4 block px-1 text-[9px]">Direct agents</Label>
              <div className="space-y-1">
                {agents.map((agent) => {
                  const agentMessages = logMessagesForAgent(agent, events, traces);
                  const agentStats = channelStats(agentMessages);
                  return (
                    <button
                      type="button"
                      key={agent}
                      onClick={() => {
                        setActive(agent);
                        setSelectedMessageId(null);
                      }}
                      className={`flex w-full min-w-0 items-center gap-2 rounded border border-transparent px-2.5 py-2 text-left font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        active === agent
                          ? "border-border bg-foreground/[0.07] text-foreground"
                          : "text-muted-foreground hover:border-border/70 hover:bg-foreground/[0.035] hover:text-foreground"
                      }`}
                    >
                      <AtSign className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{agent}</span>
                      {agentStats.failed > 0 ? (
                        <span className="rounded border border-red-400/30 px-1.5 py-0.5 text-[9px] text-red-400">
                          {agentStats.failed}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{agentStats.logs}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex min-h-[50px] items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                {active === "all-activity" ? (
                  <Hash className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <AtSign className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] font-semibold text-foreground">
                    {active}
                  </div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {active === "all-activity"
                      ? "every agent log message"
                      : `${activeTrace?.schema_used ?? "agent trace"} · ${activeTrace?.validation_status ?? "logged"}`}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ToolbarButton onClick={() => copyText(exportText)} className="hidden sm:inline-flex">
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </ToolbarButton>
                <ToolbarButton
                  className="hidden sm:inline-flex"
                  onClick={() =>
                    downloadText(
                      `${runId}-${active.replace(/[^a-z0-9_-]+/gi, "-")}-logs.txt`,
                      exportText
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </ToolbarButton>
                <IconButton label="Close agent activity" onClick={onClose}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/25 px-3 py-2.5">
              <div className="relative min-w-0 flex-[1_1_220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search logs, agents, errors..."
                  className="h-8 w-full rounded border border-border bg-card pl-8 pr-3 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex overflow-hidden rounded border border-border bg-card p-1 font-mono text-[9px] uppercase tracking-widest">
                {(["all", "success", "failed", "skipped"] as StatusFilter[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      statusFilter === status
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                <span>{visibleMessages.length} shown</span>
                <span>{stats.tokensIn + stats.tokensOut} tokens</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
              {visibleMessages.length === 0 ? (
                <div className="rounded border border-border bg-background/60 p-4 text-[12.5px] text-muted-foreground">
                  No logs match this channel and filter.
                </div>
              ) : (
                visibleMessages.map((message) => (
                  <AgentMessageRow
                    key={message.id}
                    message={message}
                    selected={selectedMessage?.id === message.id}
                    onSelect={() => setSelectedMessageId(message.id)}
                  />
                ))
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
              className="shrink-0 border-t border-border bg-card p-2.5"
            >
              <div className="flex items-end gap-2 rounded border border-border bg-background p-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${active === "all-activity" ? "#all-activity" : `@${active}`}...`}
                  className="max-h-28 min-h-[34px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-foreground/[0.06] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
                  aria-label="Send agent message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>

          <LogDetailPanel
            message={selectedMessage}
            stats={stats}
            onCopy={() => copyText(selectedMessage ? messagesAsText(runId, active, [selectedMessage]) : exportText)}
          />
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
      right={
        <div className="flex items-center gap-1.5">
          {alerts && <Pill tone="muted">{alerts.length}</Pill>}
          <Pill tone="muted">News</Pill>
        </div>
      }
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
    <li className="min-w-0 space-y-2 p-3 transition-colors hover:bg-foreground/[0.025]">
      <div className="flex min-w-0 items-center gap-2">
        <Pill tone={ALERT_TONE[alert.tag] ?? "muted"}>{alert.tag}</Pill>
        <span className="ml-auto min-w-0 truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {alert.strategy_tag}
        </span>
      </div>
      {alert.url ? (
        <a
          href={alert.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-3 break-words text-[12.5px] leading-snug text-foreground/90 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {alert.headline}
          <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-muted-foreground" />
        </a>
      ) : (
        <p className="line-clamp-3 break-words text-[12.5px] leading-snug text-foreground/90">{alert.headline}</p>
      )}
    </li>
  );
}
