// Turns a StrategySpec into LaTeX blocks — a formal mathematical view of the strategy DSL.
// Pure string building; rendered by KaTeX in the Strategy tab.

import type { PortfolioRules, RiskRules, StrategyRule, StrategySpec } from "@/types";

export interface LatexBlock {
  title: string;
  tex: string;
}

const FEAT: Record<string, string> = {
  close: "C",
  volume: "V",
  gap_1d: "\\text{gap}_{1\\text{d}}",
  rsi_14: "\\text{RSI}_{14}",
  atr_14: "\\text{ATR}_{14}",
  volume_zscore: "z_{V}",
  holding_days: "h",
  sector_relative_return_20d: "r^{\\text{sec}}_{20\\text{d}}",
  spy_relative_return_20d: "r^{\\text{spy}}_{20\\text{d}}",
};

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\backslash ").replace(/_/g, "\\_").replace(/([%&#${}])/g, "\\$1");
}

/** A feature token → its math symbol. */
export function featTex(f: string): string {
  if (FEAT[f]) return FEAT[f];
  let m: RegExpMatchArray | null;
  if ((m = f.match(/^return_(\d+)d$/))) return `r_{${m[1]}\\text{d}}`;
  if ((m = f.match(/^sma_(\d+)$/))) return `\\text{SMA}_{${m[1]}}`;
  if ((m = f.match(/^realized_vol_(\d+)d$/))) return `\\sigma_{${m[1]}\\text{d}}`;
  return `\\text{${escapeText(f)}}`;
}

const OP: Record<string, string> = {
  ">": ">",
  "<": "<",
  ">=": "\\ge",
  "<=": "\\le",
  "==": "=",
  crosses_above: "\\nearrow",
  crosses_below: "\\searrow",
};

function targetTex(r: StrategyRule): string {
  if (r.feature_ref) return featTex(r.feature_ref);
  if (typeof r.value === "number") return String(r.value);
  if (typeof r.value === "boolean") return r.value ? "\\text{true}" : "\\text{false}";
  if (r.value != null) return `\\text{${escapeText(String(r.value))}}`;
  return "";
}

function ruleTex(r: StrategyRule): string {
  const lb = r.lookback_days ? `\\,[${r.lookback_days}\\text{d}]` : "";
  return `${featTex(r.feature)}${lb} \\; ${OP[r.operator] ?? "\\,?\\,"} \\; ${targetTex(r)}`;
}

function weightingTex(p: PortfolioRules): string {
  switch (p.weighting) {
    case "equal_weight":
      return "w_i = \\frac{1}{N}";
    case "rank_weighted":
      return "w_i \\propto \\text{rank}(i)";
    case "inverse_vol_weighted":
      return "w_i \\propto \\dfrac{1}{\\sigma_i}";
    case "volatility_targeted":
      return "w_i \\;\\text{s.t.}\\; \\sigma_p = \\sigma_{\\text{target}}";
    default:
      return `w_i = \\text{${escapeText(p.weighting)}}`;
  }
}

function riskTex(r: RiskRules): string {
  const parts: string[] = [];
  if (r.stop_loss != null) parts.push(`R_i \\le -${r.stop_loss}`);
  if (r.take_profit != null) parts.push(`R_i \\ge ${r.take_profit}`);
  if (r.max_holding_days != null) parts.push(`h_i \\ge ${r.max_holding_days}`);
  if (r.max_turnover != null) parts.push(`\\tau \\le ${r.max_turnover}`);
  if (parts.length === 0) return "\\text{no explicit risk controls}";
  return `\\text{exit if}\\quad ${parts.join(" \\;\\lor\\; ")}`;
}

export function strategyToLatex(spec: StrategySpec): LatexBlock[] {
  const blocks: LatexBlock[] = [];

  blocks.push({
    title: "Universe",
    tex: `\\mathcal{U} = \\text{${escapeText(spec.universe)}}`,
  });

  if (spec.entry_rules.length) {
    const conj = spec.entry_rules.map(ruleTex).join(" \\;\\land\\; ");
    blocks.push({ title: "Entry signal", tex: `\\text{enter}_i \\iff ${conj}` });
  }

  if (spec.exit_rules.length) {
    const disj = spec.exit_rules.map(ruleTex).join(" \\;\\lor\\; ");
    blocks.push({ title: "Exit signal", tex: `\\text{exit}_i \\iff ${disj}` });
  }

  if (spec.ranking_rule) {
    const rr = spec.ranking_rule;
    const set =
      rr.top_n != null
        ? `\\text{Top}_{${rr.top_n}}`
        : rr.bottom_n != null
          ? `\\text{Bottom}_{${rr.bottom_n}}`
          : "\\text{Select}";
    const dir = rr.order === "ascending" ? "\\uparrow" : "\\downarrow";
    blocks.push({
      title: "Ranking & selection",
      tex: `i \\in ${set}\\big( ${featTex(rr.feature)} \\big)^{${dir}}`,
    });
  }

  blocks.push({ title: "Weighting", tex: weightingTex(spec.portfolio_rules) });

  const pr = spec.portfolio_rules;
  const constraints: string[] = [`\\Delta t = \\text{${pr.rebalance_frequency}}`];
  if (pr.max_position != null) constraints.push(`w_i \\le ${pr.max_position}`);
  if (pr.max_sector_weight != null) constraints.push(`\\textstyle\\sum_{i \\in s} w_i \\le ${pr.max_sector_weight}`);
  blocks.push({ title: "Rebalance & limits", tex: constraints.join(", \\quad ") });

  blocks.push({ title: "Risk controls", tex: riskTex(spec.risk_rules) });

  return blocks;
}
