"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import katex from "katex";
import { ArrowUp, Bot, Check, Loader2, Play, Send, Sigma, Sparkles, User, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Disclaimer, Label, Pill, Prose } from "@/components/ui/primitives";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { CritiquePill, ReadinessPill } from "@/components/ui/tags";
import { humanize } from "@/lib/utils";
import { findCritique, findFeasibility } from "@/lib/research";
import { strategyToLatex } from "@/lib/strategyLatex";
import type {
  AgentChatReply,
  QuantResearchPacket,
  StrategyRule,
  StrategySpec,
} from "@/types";

const SUGGESTED = [
  "Brainstorm short-horizon underreaction strategies.",
  "Critique this strategy for leakage and overfitting.",
  "What data would I need to test this?",
  "Turn this idea into a structured strategy spec.",
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
  | { id: number; role: "assistant"; spec: StrategySpec; provider: string };

export default function AgentPage() {
  const latest = useApi((s) => api.latestRun(s), []);
  const overview = useApi((s) => api.overview(s), []);

  if (overview.loading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading research context" />
      </div>
    );
  }
  return (
    <StrategyWorkspace
      packet={latest.error ? null : latest.data}
      provider={overview.data?.llm_provider ?? "mock"}
    />
  );
}

function StrategyWorkspace({
  packet,
  provider,
}: {
  packet: QuantResearchPacket | null;
  provider: string;
}) {
  const specs = useMemo(() => packet?.strategy_specs ?? [], [packet]);
  const [selected, setSelected] = useState(specs[0]?.strategy_name ?? "");

  useEffect(() => {
    if (specs.length && !specs.some((s) => s.strategy_name === selected)) {
      setSelected(specs[0].strategy_name);
    }
  }, [specs, selected]);

  const spec = specs.find((s) => s.strategy_name === selected) ?? specs[0] ?? null;
  const live = provider !== "mock" && provider !== "unavailable" && provider !== "";

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-4">
      {/* Header + strategy selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label>Strategy</Label>
            <Pill tone={live ? "good" : "muted"}>
              <Sparkles className="h-3 w-3" /> {live ? `live · ${provider}` : "mock"}
            </Pill>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Strategy workspace
          </h1>
        </div>
        {specs.length > 0 && (
          <label className="flex shrink-0 flex-col gap-1">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Strategy{packet ? ` · run ${packet.run_id}` : ""}
            </span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full min-w-0 rounded border border-border bg-card px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40 sm:w-64"
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

      {/* Two panes: chat | LaTeX strategy view */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Chat packet={packet} provider={provider} spec={spec} />
        <StrategyVizPanel spec={spec} packet={packet} />
      </div>
    </div>
  );
}

function Chat({
  packet,
  provider,
  spec,
}: {
  packet: QuantResearchPacket | null;
  provider: string;
  spec: StrategySpec | null;
}) {
  const live = provider !== "mock" && provider !== "unavailable" && provider !== "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const lastUserRef = useRef("");

  const replacePending = (id: number, msg: Message) =>
    setMessages((m) => m.map((x) => (x.id === id ? msg : x)));

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    lastUserRef.current = text;
    const userId = idRef.current++;
    const replyId = idRef.current++;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      { id: replyId, role: "assistant", pending: true },
    ]);
    setDraft("");

    // Mock provider: stay fully offline — deterministic local reply, no network.
    if (!live) {
      replacePending(replyId, {
        id: replyId,
        role: "assistant",
        reply: mockReply(text, packet, spec),
        provider: "mock",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await api.agentChat({
        message: text,
        run_id: packet?.run_id,
        strategy_name: spec?.strategy_name,
      });
      replacePending(replyId, {
        id: replyId,
        role: "assistant",
        reply: fromApi(res.reply),
        provider: res.provider,
      });
    } catch {
      // Backend down / LLM error → fall back to the deterministic local reply.
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

  const draftStrategy = async () => {
    if (!live || busy) return;
    const idea = lastUserRef.current || draft.trim();
    if (!idea) return;
    const id = idRef.current++;
    setMessages((m) => [...m, { id, role: "assistant", pending: true }]);
    setBusy(true);
    try {
      const res = await api.draftStrategy({ idea, run_id: packet?.run_id });
      replacePending(id, { id, role: "assistant", spec: res.spec, provider: res.provider });
    } catch {
      replacePending(id, {
        id,
        role: "assistant",
        reply: {
          lead: "Couldn't draft a valid spec from that idea — try describing the signal and horizon more concretely.",
          requiredData: [],
          feasibility: [],
          risks: [],
          nextRun: "—",
        },
        provider: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Context chip */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          Context
        </span>
        {spec ? (
          <>
            <Pill tone="muted">{spec.strategy_name}</Pill>
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              chat is grounded in this strategy
            </span>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">
            no strategy loaded — replies use generic research framing
          </span>
        )}
      </div>

      {/* Transcript */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Ask about the latest run, or start from a suggestion:
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => send(s)}
                    className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2.5 text-left text-[12.5px] text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
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
                <PendingBubble key={m.id} live={live} />
              ) : "spec" in m ? (
                <DraftedSpecBubble key={m.id} spec={m.spec} provider={m.provider} />
              ) : (
                <AssistantBubble
                  key={m.id}
                  reply={m.reply}
                  provider={m.provider}
                  canDraft={live && !busy}
                  onDraft={draftStrategy}
                />
              )
            )
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder="Ask about a strategy, data, or risks…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
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
        </div>
      </Card>

      <Disclaimer>
        Grounded in existing artifacts. {live ? `Live via ${provider}; ` : "Mock by default; "}
        nothing is written back. Not financial advice.
      </Disclaimer>
    </div>
  );
}

/* --------------------------------------------------------------- LaTeX strategy view */
function Katex({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      return tex;
    }
  }, [tex, display]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function StrategyVizPanel({
  spec,
  packet,
}: {
  spec: StrategySpec | null;
  packet: QuantResearchPacket | null;
}) {
  const blocks = useMemo(() => (spec ? strategyToLatex(spec) : []), [spec]);
  const critique = spec && packet ? findCritique(packet, spec.strategy_name) : null;

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sigma className="h-3.5 w-3.5 text-muted-foreground" />
          <Label>Formal specification</Label>
        </div>
        {spec && <ReadinessPill readiness={spec.backtest_readiness} />}
      </div>

      {!spec ? (
        <div className="p-6">
          <EmptyState title="No strategy" detail="Select a strategy to render its formal spec." />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-foreground">
              {spec.strategy_name}
            </span>
            <Pill tone="muted">{humanize(spec.strategy_family)}</Pill>
            {critique && <CritiquePill verdict={critique.verdict} />}
          </div>

          <div className="space-y-1.5">
            <VizLabel>Hypothesis</VizLabel>
            <Prose>{spec.hypothesis}</Prose>
          </div>

          {spec.economic_rationale && (
            <div className="space-y-1.5">
              <VizLabel>Economic rationale</VizLabel>
              <Prose className="text-foreground/85">{spec.economic_rationale}</Prose>
            </div>
          )}

          <div className="space-y-3">
            <VizLabel>Formal definition</VizLabel>
            <div className="space-y-3">
              {blocks.map((b) => (
                <div key={b.title} className="rounded border border-border bg-background p-3">
                  <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {b.title}
                  </p>
                  <div className="overflow-x-auto text-[13px] text-foreground">
                    <Katex tex={b.tex} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            Rendered from the strategy DSL via KaTeX. Notation is illustrative — the executable
            rules live in the spec and the run detail.
          </p>
        </div>
      )}
    </Card>
  );
}

function VizLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[80%] rounded border border-border bg-accent/40 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground">
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

function PendingBubble({ live }: { live: boolean }) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="flex items-center gap-2 pt-1.5 font-mono text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {live ? "calling model…" : "thinking…"}
      </div>
    </div>
  );
}

function ProviderTag({ provider }: { provider: string }) {
  const live = provider !== "mock" && provider !== "offline mock" && provider !== "error";
  return <Pill tone={live ? "good" : "muted"}>{provider}</Pill>;
}

function AssistantBubble({
  reply,
  provider,
  canDraft,
  onDraft,
}: {
  reply: Reply;
  provider: string;
  canDraft: boolean;
  onDraft: () => void;
}) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <ProviderTag provider={provider} />
        </div>
        <Prose>{reply.lead}</Prose>
        <ReplySection title="Required data" items={reply.requiredData} />
        <ReplySection title="Feasibility concerns" items={reply.feasibility} />
        <ReplySection title="Risks" items={reply.risks} />
        {reply.nextRun !== "—" && (
          <div className="space-y-1">
            <ReplyLabel>Suggested next run</ReplyLabel>
            <p className="break-words rounded border border-border bg-background px-3 py-2 font-mono text-[11.5px] text-foreground/90">
              {reply.nextRun}
            </p>
          </div>
        )}
        {/* Affordances */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {reply.nextRun !== "—" && <RunTrigger objective={objectiveFrom(reply.nextRun)} />}
          {canDraft ? (
            <button
              type="button"
              onClick={onDraft}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10"
            >
              <Wand2 className="h-3 w-3" /> Draft strategy
            </button>
          ) : (
            <DisabledAction icon={<Wand2 className="h-3 w-3" />} label="Draft strategy" />
          )}
          {!canDraft && (
            <span className="font-mono text-[10px] text-muted-foreground">
              draft needs a live provider
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftedSpecBubble({ spec, provider }: { spec: StrategySpec; provider: string }) {
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProviderTag provider={provider} />
          <Pill tone="warn">drafted · not saved</Pill>
        </div>
        <div className="space-y-3 rounded border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-foreground">
              {spec.strategy_name}
            </span>
            <Pill tone="muted">{humanize(spec.strategy_family)}</Pill>
            <ReadinessPill readiness={spec.backtest_readiness} />
          </div>
          <Prose>{spec.hypothesis}</Prose>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SpecRules title="Entry rules" rules={spec.entry_rules} />
            <SpecRules title="Exit rules" rules={spec.exit_rules} />
          </div>
          {spec.required_data.length > 0 && (
            <p className="font-mono text-[10px] text-muted-foreground">
              data: {spec.required_data.join(", ")} · universe: {spec.universe}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RunTrigger objective={`Test "${spec.strategy_name}": ${spec.hypothesis}`} />
          <span className="font-mono text-[10px] text-muted-foreground">
            draft not saved — Send to run launches a fresh pipeline
          </span>
        </div>
      </div>
    </div>
  );
}

function SpecRules({ title, rules }: { title: string; rules: StrategyRule[] }) {
  return (
    <div className="rounded border border-border bg-card p-2.5">
      <ReplyLabel>{title}</ReplyLabel>
      <div className="mt-1.5 space-y-1">
        {rules.map((r, i) => (
          <p key={i} className="break-words font-mono text-[11px] text-foreground">
            {r.feature} {r.operator} {r.feature_ref ?? r.value ?? ""}
            {r.lookback_days ? ` (${r.lookback_days}d)` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

function ReplySection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <ReplyLabel>{title}</ReplyLabel>
      <ul className="space-y-1 pl-0.5">
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

function ReplyLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function objectiveFrom(nextRun: string): string {
  const m = nextRun.match(/objective:\s*"([^"]+)"/i);
  return m ? m[1] : nextRun;
}

/** Launches the REAL pipeline (write path). Two-step to avoid accidental token spend, then
 * polls the job to completion. ponytail: recursive poll, no unmount guard — a stale setState
 * after unmount is a harmless no-op. */
function RunTrigger({ objective }: { objective: string }) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "done" | "error">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const launch = async () => {
    setPhase("running");
    setErr(null);
    try {
      const { job_id } = await api.createRun({ objective });
      for (let n = 0; n < 150; n++) {
        const job = await api.runJob(job_id);
        if (job.status === "done") {
          setRunId(job.run_id ?? null);
          setPhase("done");
          return;
        }
        if (job.status === "error") {
          setErr(job.error ?? "pipeline failed");
          setPhase("error");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setErr("timed out after ~5 min");
      setPhase("error");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
      setPhase("error");
    }
  };

  if (phase === "done") {
    return (
      <Link
        href={runId ? `/runs/${runId}` : "/runs"}
        className="inline-flex items-center gap-1.5 rounded border border-foreground/40 bg-foreground/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10"
      >
        <Check className="h-3 w-3" /> {runId ?? "run"} — open
      </Link>
    );
  }
  if (phase === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> launching pipeline…
      </span>
    );
  }
  if (phase === "error") {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[10px] text-destructive">
        run failed: {err}
        <button type="button" onClick={() => setPhase("idle")} className="underline">
          retry
        </button>
      </span>
    );
  }
  if (phase === "confirm") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        launch full pipeline?
        <button
          type="button"
          onClick={launch}
          className="rounded border border-foreground/40 bg-foreground/[0.06] px-2 py-0.5 text-foreground hover:bg-foreground/10"
        >
          confirm
        </button>
        <button type="button" onClick={() => setPhase("idle")} className="underline">
          cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPhase("confirm")}
      title="Launches the real research pipeline (writes a new run). With a live provider this makes ~9 model calls."
      className="inline-flex items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10"
    >
      <Play className="h-3 w-3" /> Send to run
    </button>
  );
}

function DisabledAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Not wired yet — running the pipeline from the dashboard is a separate (write) feature."
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

// --------------------------------------------------------------------------- //
// Deterministic offline responder — used in mock mode and as the fallback when
// the backend is unreachable. Mirrors the backend's _chat_fixture intent.
// --------------------------------------------------------------------------- //
function mockReply(
  message: string,
  packet: QuantResearchPacket | null,
  spec: StrategySpec | null
): Reply {
  const m = message.toLowerCase();
  const name = spec?.strategy_name ?? "this idea";
  const crit = packet && spec ? findCritique(packet, spec.strategy_name) : null;
  const feas = packet && spec ? findFeasibility(packet, spec) : null;

  const requiredData = spec
    ? [...spec.required_data, ...(feas?.missing_data ?? []).map((d) => `${d} (currently missing)`)]
    : ["price/return series", "the specific signal inputs your hypothesis names"];

  const feasibility: string[] = [];
  if (feas) {
    feasibility.push(`Feasibility verdict on record: ${humanize(feas.verdict)}.`);
    if (feas.missing_data.length) feasibility.push(`Missing data: ${feas.missing_data.join(", ")}.`);
    if (feas.proxy_available && feas.proxy_description)
      feasibility.push(`A proxy exists: ${feas.proxy_description}.`);
  } else {
    feasibility.push("Confirm every input is available now, with a documented adapter, or via a proxy before proposing.");
  }

  const risks =
    crit && (crit.leakage_risks.length || crit.major_issues.length || crit.overfitting_risks.length)
      ? [...crit.leakage_risks, ...crit.major_issues, ...crit.overfitting_risks].slice(0, 4)
      : spec?.expected_failure_modes.length
        ? spec.expected_failure_modes
        : ["look-ahead / leakage in signal construction", "overfitting to a single regime", "edge erodes after transaction costs"];

  let lead: string;
  if (m.includes("data")) {
    lead = `For ${name}, the data question comes down to what the signal actually reads each rebalance and whether you can source it point-in-time. Here's what this run already pinned down.`;
  } else if (m.includes("leak") || m.includes("overfit") || m.includes("critique")) {
    lead = `Reviewing ${name} adversarially: the goal is to find the way it's already wrong. The critique on file flags the items below — treat leakage and regime-overfit as disqualifying until ruled out.`;
  } else if (m.includes("spec") || m.includes("structure") || m.includes("turn this")) {
    lead = `To turn this into a structured spec like ${name}: state the hypothesis and economic rationale, then pin entry/exit/ranking rules, a portfolio weighting + rebalance cadence, and risk controls — every rule referencing a named, available feature.`;
  } else if (m.includes("brainstorm") || m.includes("underreaction") || m.includes("horizon") || m.includes("idea")) {
    lead = `Short-horizon underreaction ideas live where information diffuses slowly: post-event drift, volume-confirmed continuation, analyst-revision lag. Each needs a clean economic story for why the edge exists and why it hasn't been arbitraged away — ${name} is one such shape in this run.`;
  } else {
    lead = `Looking at ${name} from the latest run, here's how I'd frame the next step — grounded in the spec, its feasibility report, and the critique.`;
  }

  const nextRun = spec
    ? `objective: "Re-test ${name} after addressing ${risks[0] ?? "the top critique"}" · universe: ${spec.universe}`
    : `objective: "Test a short-horizon underreaction hypothesis with a clean point-in-time dataset"`;

  return { lead, requiredData, feasibility, risks, nextRun };
}
