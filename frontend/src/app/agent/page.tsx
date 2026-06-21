"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, Send, Sparkles, User, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Disclaimer, Label, Pill, Prose } from "@/components/ui/primitives";
import { LoadingState } from "@/components/ui/states";
import { humanize } from "@/lib/utils";
import { findCritique, findFeasibility } from "@/lib/research";
import type { QuantResearchPacket, StrategySpec } from "@/types";

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

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; reply: Reply };

export default function AgentPage() {
  const latest = useApi((s) => api.latestRun(s), []);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-5 md:p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label>Agent</Label>
          <Pill tone="muted">
            <Sparkles className="h-3 w-3" /> mock
          </Pill>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Strategy research chat
        </h1>
        <Prose className="max-w-2xl text-muted-foreground">
          A scratchpad for shaping ideas against the latest run. Responses are deterministic and
          generated locally from existing research artifacts — no LLM is called and nothing is
          written back.
        </Prose>
      </div>

      {latest.loading ? (
        <LoadingState label="Loading research context" />
      ) : (
        <Chat packet={latest.error ? null : latest.data} />
      )}
    </div>
  );
}

function Chat({ packet }: { packet: QuantResearchPacket | null }) {
  const spec = packet?.strategy_specs[0] ?? null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const idRef = useRef(0);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const userMsg: Message = { id: idRef.current++, role: "user", text };
    const reply: Message = {
      id: idRef.current++,
      role: "assistant",
      reply: mockReply(text, packet, spec),
    };
    setMessages((m) => [...m, userMsg, reply]);
    setDraft("");
  };

  return (
    <>
      {/* Context chip */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          Context
        </span>
        {packet && spec ? (
          <>
            <Pill tone="muted">run {packet.run_id}</Pill>
            <Pill tone="muted">{spec.strategy_name}</Pill>
            <span className="text-[12px] text-muted-foreground">
              grounded in the latest run&apos;s first strategy
            </span>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">
            no run loaded — replies use generic research framing
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
                    onClick={() => send(s)}
                    className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2.5 text-left text-[12.5px] text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground"
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
              ) : (
                <AssistantBubble key={m.id} reply={m.reply} />
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
              disabled={!draft.trim()}
              className="flex h-10 items-center gap-1.5 rounded border border-border bg-foreground/[0.06] px-3 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </form>
        </div>
      </Card>

      <Disclaimer>
        Mock agent — deterministic local responses derived from existing artifacts. No model is
        called, no run is created, no strategy is written. Not financial advice.
      </Disclaimer>
    </>
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

function AssistantBubble({ reply }: { reply: Reply }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-foreground/[0.06] text-foreground">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <Prose>{reply.lead}</Prose>
        <ReplySection title="Required data" items={reply.requiredData} />
        <ReplySection title="Feasibility concerns" items={reply.feasibility} />
        <ReplySection title="Risks" items={reply.risks} />
        <div className="space-y-1">
          <ReplyLabel>Suggested next run</ReplyLabel>
          <p className="rounded border border-border bg-background px-3 py-2 font-mono text-[11.5px] text-foreground/90">
            {reply.nextRun}
          </p>
        </div>
        {/* Affordances — intentionally not wired */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <DisabledAction icon={<Send className="h-3 w-3" />} label="Send to run" />
          <DisabledAction icon={<Wand2 className="h-3 w-3" />} label="Draft strategy" />
          <span className="font-mono text-[10px] text-muted-foreground">not wired yet</span>
        </div>
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

function DisabledAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Not wired yet — this mock agent never mutates research artifacts."
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

// --------------------------------------------------------------------------- //
// Deterministic mock responder. Keyed off message intent + the latest packet so
// replies feel connected to QuantCode without any model call.
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
