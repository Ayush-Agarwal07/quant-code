// Pure derivations over a QuantResearchPacket — no fetching, no mutation. Shared by the
// Dashboard and Agent tabs so the "matching" logic (spec <-> critique/feasibility/hypothesis)
// lives in one place. Everything here is read-only and deterministic.

import { humanize } from "@/lib/utils";
import type {
  CandidateHypothesis,
  DataFeasibilityReport,
  ExperimentPlanStub,
  ExperimentResultStub,
  MarketMechanism,
  QuantResearchPacket,
  StrategyCritique,
  StrategySpec,
  StrategyValidationReport,
} from "@/types";

// --- spec <-> sibling-artifact matching (the join keys the pipeline uses) ---
// strategy_name joins critique / validation / experiments; source_hypothesis joins
// the feasibility report + candidate hypothesis.

export function findCritique(p: QuantResearchPacket, name: string): StrategyCritique | null {
  return p.critiques.find((c) => c.strategy_name === name) ?? null;
}

export function findFeasibility(
  p: QuantResearchPacket,
  spec: StrategySpec
): DataFeasibilityReport | null {
  return (
    p.data_feasibility_reports.find((r) => r.hypothesis_name === spec.source_hypothesis) ?? null
  );
}

export function findHypothesis(
  p: QuantResearchPacket,
  spec: StrategySpec
): CandidateHypothesis | null {
  return (
    (p.candidate_hypotheses ?? []).find((h) => h.hypothesis_name === spec.source_hypothesis) ?? null
  );
}

export function findValidation(
  p: QuantResearchPacket,
  name: string
): StrategyValidationReport | null {
  return (p.strategy_validation_reports ?? []).find((v) => v.strategy_name === name) ?? null;
}

export function findExperimentPlan(
  p: QuantResearchPacket,
  name: string
): ExperimentPlanStub | null {
  return (p.experiment_plans ?? []).find((e) => e.strategy_name === name) ?? null;
}

export function findExperimentResult(
  p: QuantResearchPacket,
  name: string
): ExperimentResultStub | null {
  return p.experiment_results.find((e) => e.strategy_name === name) ?? null;
}

// The mechanism a strategy leans on (via its candidate hypothesis).
export function findMechanism(
  p: QuantResearchPacket,
  spec: StrategySpec
): MarketMechanism | null {
  const hyp = findHypothesis(p, spec);
  if (!hyp) return null;
  return (p.market_mechanisms ?? []).find((m) => m.name === hyp.mechanism) ?? null;
}

// --------------------------------------------------------------------------- //
// Relevant Research & News feed — derived from prior art, memory, mechanisms,
// the critique, and the feasibility gate. No network: PAPER/DATA/LESSON come
// straight from the packet; NEWS items are clearly-labelled simulated context.
// --------------------------------------------------------------------------- //
export type ResearchItemType = "PAPER" | "NEWS" | "LESSON" | "DATA";

export interface ResearchItem {
  id: string;
  type: ResearchItemType;
  title: string;
  source: string;
  summary: string;
  /** Always tied to the selected strategy. */
  whyMatters: string;
  sourceUrl?: string | null;
  /** True when the item is fabricated from packet data rather than a real source. */
  simulated?: boolean;
}

export function buildResearchFeed(p: QuantResearchPacket, spec: StrategySpec): ResearchItem[] {
  const items: ResearchItem[] = [];
  const name = spec.strategy_name;
  const mech = findMechanism(p, spec);
  const relatedThemes = new Set(mech?.related_themes ?? []);
  const specData = new Set(spec.required_data);

  // PAPER — prior art themes, the strategy's own first.
  const themes = [...(p.prior_art_themes ?? [])];
  themes.sort((a, b) => Number(relatedThemes.has(b.theme)) - Number(relatedThemes.has(a.theme)));
  for (const t of themes) {
    const dataOverlap = t.required_data.filter((d) => specData.has(d));
    const related = relatedThemes.has(t.theme) || dataOverlap.length > 0;
    items.push({
      id: `paper:${t.theme}`,
      type: "PAPER",
      title: humanize(t.theme),
      source: humanize(t.source_type),
      summary: t.summary,
      whyMatters: related
        ? `Underpins the economic rationale for ${name} — same ${humanize(t.mechanism_type)} mechanism${dataOverlap.length ? `, shares ${dataOverlap.join(", ")}` : ""}.`
        : `Adjacent prior art in the research domain; context for where ${name} sits.`,
      sourceUrl: t.source_url ?? null,
    });
  }

  // NEWS — simulated edge-durability context from the strategy's mechanism.
  if (mech) {
    items.push({
      id: `news:mech:${mech.name}`,
      type: "NEWS",
      title: `Edge-durability watch — ${humanize(mech.name)}`,
      source: "Derived from market mechanism",
      summary: `This edge could fade if: ${mech.why_edge_might_disappear.join("; ")}.`,
      whyMatters: `${name} relies on this mechanism; these are the conditions that would erode it.`,
      simulated: true,
    });
  }
  // NEWS — simulated flag from the critique's top risk.
  const crit = findCritique(p, name);
  const topRisk =
    crit && (crit.leakage_risks[0] ?? crit.major_issues[0] ?? crit.overfitting_risks[0]);
  if (crit && topRisk) {
    items.push({
      id: `news:risk:${name}`,
      type: "NEWS",
      title: `Risk flag — ${name}`,
      source: "Adversarial critique (this run)",
      summary: topRisk,
      whyMatters: `The reviewer's headline reason ${name} could fail in practice.`,
      simulated: true,
    });
  }

  // DATA — the feasibility gate for this strategy's hypothesis.
  const feas = findFeasibility(p, spec);
  if (feas) {
    const have = [...feas.available_now, ...feas.available_with_existing_adapter];
    items.push({
      id: `data:${feas.hypothesis_name}`,
      type: "DATA",
      title: `Data check — ${humanize(feas.hypothesis_name)}`,
      source: "Feasibility gate",
      summary: `Available: ${have.length ? have.join(", ") : "none"}. Missing: ${
        feas.missing_data.length ? feas.missing_data.join(", ") : "none"
      }.`,
      whyMatters:
        feas.verdict === "testable_now"
          ? `Every input ${name} needs is in hand.`
          : feas.verdict === "testable_with_proxy"
            ? `${name} is testable via proxy: ${feas.proxy_description ?? "see feasibility report"}.`
            : `${name} is blocked until missing data is sourced.`,
    });
  }

  // LESSON — memory carried in / produced (only those naming this strategy or generic).
  for (const l of p.retrieved_lessons) {
    items.push({
      id: `lesson:in:${l.lesson_id}`,
      type: "LESSON",
      title: humanize(l.kind),
      source: `Memory · carried from ${l.source_run_id}`,
      summary: l.text,
      whyMatters: `Prior-run lesson that shaped how ${name} was proposed.`,
    });
  }
  for (const l of p.produced_lessons) {
    items.push({
      id: `lesson:out:${l.lesson_id}`,
      type: "LESSON",
      title: humanize(l.kind),
      source: `Memory · produced this run`,
      summary: l.text,
      whyMatters: `New lesson this run banks for future strategies like ${name}.`,
    });
  }

  return items;
}

// --------------------------------------------------------------------------- //
// Deterministic illustrative equity curve. NOT a backtest — a fixed-seed walk
// keyed off the strategy name so the same strategy always draws the same line.
// ponytail: pure + deterministic; visual placeholder, no market data involved.
// --------------------------------------------------------------------------- //
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulatedCurve(seed: string, n = 48): { t: number; equity: number }[] {
  const rnd = mulberry32(hashStr(seed));
  const drift = 0.0006 + rnd() * 0.0018; // small seeded positive-ish drift
  let v = 100;
  const out = [{ t: 0, equity: 100 }];
  for (let i = 1; i < n; i++) {
    const shock = (rnd() - 0.5) * 0.03;
    v = v * (1 + drift + shock);
    out.push({ t: i, equity: Math.round(v * 100) / 100 });
  }
  return out;
}
