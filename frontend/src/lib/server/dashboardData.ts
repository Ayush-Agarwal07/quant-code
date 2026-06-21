import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type {
  ContextPack,
  CritiqueVerdict,
  EpisodeRecord,
  Lesson,
  Overview,
  QuantResearchPacket,
  RationaleStrength,
  RunSummary,
  ScoredLesson,
  StrategyCatalogItem,
  StrategySpec,
} from "@/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../");
const WORKSPACE_ROOT = path.join(REPO_ROOT, "workspace");
const RUNS_DIR = path.join(WORKSPACE_ROOT, "research_runs");
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");
const STRATEGIES_DIR = path.join(WORKSPACE_ROOT, "strategies");

const DISCLAIMER =
  "Research-only demo. Experiments are not executed, no strategy performance is claimed, " +
  "and this is not financial advice.";

export class DashboardDataError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DashboardDataError";
    this.status = status;
  }
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, filePath);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "strategy";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlScalar(value: string | number | boolean | null | undefined): string {
  if (value == null) return "null";
  if (typeof value === "string") return yamlString(value);
  return String(value);
}

function yamlStringList(name: string, values: string[]): string[] {
  return values.length
    ? [ `${name}:`, ...values.map((value) => `- ${yamlString(value)}`) ]
    : [ `${name}: []` ];
}

function strategyYaml(spec: StrategySpec): string {
  const lines = [
    `strategy_name: ${yamlString(spec.strategy_name)}`,
    `source_hypothesis: ${yamlString(spec.source_hypothesis)}`,
    `strategy_family: ${yamlString(spec.strategy_family)}`,
    `hypothesis: ${yamlString(spec.hypothesis)}`,
    `economic_rationale: ${yamlString(spec.economic_rationale)}`,
    `universe: ${yamlString(spec.universe)}`,
    "entry_rules:",
    ...spec.entry_rules.flatMap((rule) => [
      `- feature: ${yamlString(rule.feature)}`,
      `  operator: ${yamlString(rule.operator)}`,
      `  value: ${yamlScalar(rule.value)}`,
      `  feature_ref: ${yamlScalar(rule.feature_ref)}`,
      `  lookback_days: ${yamlScalar(rule.lookback_days)}`,
      `  description: ${yamlScalar(rule.description)}`,
    ]),
    "exit_rules:",
    ...spec.exit_rules.flatMap((rule) => [
      `- feature: ${yamlString(rule.feature)}`,
      `  operator: ${yamlString(rule.operator)}`,
      `  value: ${yamlScalar(rule.value)}`,
      `  feature_ref: ${yamlScalar(rule.feature_ref)}`,
      `  lookback_days: ${yamlScalar(rule.lookback_days)}`,
      `  description: ${yamlScalar(rule.description)}`,
    ]),
    spec.ranking_rule
      ? [
          "ranking_rule:",
          `  feature: ${yamlString(spec.ranking_rule.feature)}`,
          `  order: ${yamlString(spec.ranking_rule.order)}`,
          `  top_n: ${yamlScalar(spec.ranking_rule.top_n)}`,
          `  bottom_n: ${yamlScalar(spec.ranking_rule.bottom_n)}`,
        ].join("\n")
      : "ranking_rule: null",
    "portfolio_rules:",
    `  weighting: ${yamlString(spec.portfolio_rules.weighting)}`,
    `  max_position: ${yamlScalar(spec.portfolio_rules.max_position)}`,
    `  max_sector_weight: ${yamlScalar(spec.portfolio_rules.max_sector_weight)}`,
    `  rebalance_frequency: ${yamlString(spec.portfolio_rules.rebalance_frequency)}`,
    "risk_rules:",
    `  stop_loss: ${yamlScalar(spec.risk_rules.stop_loss)}`,
    `  take_profit: ${yamlScalar(spec.risk_rules.take_profit)}`,
    `  max_holding_days: ${yamlScalar(spec.risk_rules.max_holding_days)}`,
    `  max_turnover: ${yamlScalar(spec.risk_rules.max_turnover)}`,
    ...yamlStringList("required_data", spec.required_data),
    ...yamlStringList("expected_failure_modes", spec.expected_failure_modes),
    `backtest_readiness: ${yamlString(spec.backtest_readiness)}`,
    `confidence: ${yamlScalar(spec.confidence)}`,
    `schema_version: "1"`,
    "",
  ];
  return lines.join("\n");
}

function artifactPathFor(packet: QuantResearchPacket, strategyName: string): string | null {
  const artifact = packet.workspace_artifacts?.find(
    (item) => item.artifact_type === "strategy_yaml" && item.description === strategyName
  );
  if (!artifact) return null;
  return path.isAbsolute(artifact.path) ? artifact.path : path.resolve(REPO_ROOT, artifact.path);
}

export async function listRunIds(): Promise<string[]> {
  const files = await jsonFiles(RUNS_DIR);
  return files.map((name) => name.replace(/\.json$/, ""));
}

export async function readRuns(): Promise<QuantResearchPacket[]> {
  const ids = await listRunIds();
  return Promise.all(ids.map((id) => readRun(id)));
}

export async function readRun(runId: string): Promise<QuantResearchPacket> {
  const id = runId === "latest" ? await latestRunId() : runId;
  if (!id) throw new DashboardDataError(404, "No runs found");
  const filePath = path.join(RUNS_DIR, `${id}.json`);
  try {
    return await readJson<QuantResearchPacket>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DashboardDataError(404, `Run not found: ${id}`);
    }
    throw error;
  }
}

export async function saveStrategy(
  runId: string,
  strategyName: string,
  spec: StrategySpec
): Promise<{ run_id: string; strategy_name: string; strategy_path: string }> {
  if (spec.strategy_name !== strategyName) {
    throw new DashboardDataError(400, "Renaming strategies from the dashboard is not supported");
  }

  const packet = await readRun(runId);
  const idx = packet.strategy_specs.findIndex((item) => item.strategy_name === strategyName);
  if (idx === -1) throw new DashboardDataError(404, `Strategy not found: ${strategyName}`);

  const nextPacket: QuantResearchPacket = {
    ...packet,
    strategy_specs: packet.strategy_specs.map((item, i) => (i === idx ? spec : item)),
  };

  const runPath = path.join(RUNS_DIR, `${packet.run_id}.json`);
  const strategyPath =
    artifactPathFor(packet, strategyName) ?? path.join(STRATEGIES_DIR, `${slug(spec.strategy_name)}.yaml`);

  await Promise.all([
    atomicWrite(runPath, `${JSON.stringify(nextPacket, null, 2)}\n`),
    atomicWrite(strategyPath, strategyYaml(spec)),
  ]);

  return { run_id: packet.run_id, strategy_name: spec.strategy_name, strategy_path: strategyPath };
}

export async function latestRunId(): Promise<string | null> {
  const ids = await listRunIds();
  return ids.at(-1) ?? null;
}

export async function overview(): Promise<Overview> {
  const [ids, lessons, episodes] = await Promise.all([
    listRunIds(),
    allLessons(),
    allEpisodes(),
  ]);
  return {
    backend: "next-local-workspace",
    llm_provider: process.env.QC_MODEL_PROVIDER || "mock",
    run_ids: ids,
    run_count: ids.length,
    lesson_count: lessons.length,
    episode_count: episodes.length,
    latest_run_id: ids.at(-1) ?? null,
    disclaimer: DISCLAIMER,
  };
}

export function summarizeRun(packet: QuantResearchPacket): RunSummary {
  const advanced = packet.data_feasibility_reports.filter(
    (report) => report.verdict === "testable_now" || report.verdict === "testable_with_proxy"
  ).length;
  const deferred = packet.data_feasibility_reports.length - advanced;

  return {
    run_id: packet.run_id,
    objective: packet.request.objective,
    strategies: packet.strategy_specs.length,
    critiques: packet.critiques.length,
    advanced,
    deferred,
    compression_ratio: packet.context_pack?.compression_ratio ?? null,
    retrieved_lessons: packet.retrieved_lessons.length,
    produced_lessons: packet.produced_lessons.length,
  };
}

export async function runSummaries(): Promise<RunSummary[]> {
  const runs = await readRuns();
  return runs.map(summarizeRun).reverse();
}

export async function strategyCatalog(): Promise<StrategyCatalogItem[]> {
  const runs = await readRuns();
  return runs.flatMap((run) =>
    run.strategy_specs.map((strategy) => {
      const critique = run.critiques.find((item) => item.strategy_name === strategy.strategy_name);
      const risks = critique
        ? [
            ...critique.major_issues,
            ...critique.leakage_risks,
            ...critique.overfitting_risks,
            ...critique.transaction_cost_risks,
            ...critique.data_quality_risks,
          ]
        : [];

      return {
        run_id: run.run_id,
        strategy_name: strategy.strategy_name,
        strategy_family: strategy.strategy_family,
        universe: strategy.universe,
        hypothesis: strategy.hypothesis,
        readiness: strategy.backtest_readiness,
        confidence: strategy.confidence,
        verdict: (critique?.verdict ?? null) as CritiqueVerdict | null,
        rationale_strength: (critique?.economic_rationale_strength ?? null) as
          | RationaleStrength
          | null,
        top_risk: risks[0] ?? null,
        risk_count: risks.length,
      };
    })
  );
}

export async function readContextPack(runId: string): Promise<ContextPack> {
  const run = await readRun(runId);
  if (run.context_pack) return run.context_pack;

  const filePath = path.join(MEMORY_DIR, `${run.run_id}_pack.json`);
  try {
    return await readJson<ContextPack>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DashboardDataError(404, `Context pack not found: ${run.run_id}`);
    }
    throw error;
  }
}

export async function allEpisodes(): Promise<EpisodeRecord[]> {
  const runs = await readRuns();
  return runs.flatMap((run) => (run.episode ? [run.episode] : []));
}

export async function allLessons(): Promise<Lesson[]> {
  const runs = await readRuns();
  const byId = new Map<string, Lesson>();
  for (const run of runs) {
    for (const lesson of [...run.retrieved_lessons, ...run.produced_lessons]) {
      byId.set(lesson.lesson_id, lesson);
    }
  }
  return Array.from(byId.values());
}

export async function scoredLessons(query: string | null, k: number): Promise<ScoredLesson[]> {
  const lessons = await allLessons();
  const q = query?.trim().toLowerCase();
  const scored = lessons.map((lesson) => ({
    lesson,
    score: q ? lexicalScore(lesson.text, q) : null,
  }));

  if (!q) return scored.slice(0, k);
  return scored
    .filter((item) => (item.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, k);
}

function lexicalScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  if (haystack.includes(query)) return 1;
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return hits / terms.length;
}
