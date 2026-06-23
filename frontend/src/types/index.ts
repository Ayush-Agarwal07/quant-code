// Typed mirrors of the QuantCode dashboard API.
// Field names track quantcode/schemas/__init__.py exactly. Render only what the API returns.

export type LessonKind = "warning" | "pattern" | "data_constraint" | "mutation_rule";

export type DataFeasibilityVerdict =
  | "testable_now"
  | "testable_with_proxy"
  | "requires_new_data_source"
  | "not_testable";

export type CritiqueVerdict = "accept_for_backtest" | "revise_before_backtest" | "reject";

export type BacktestReadiness = "ready" | "ready_with_proxy_limitations" | "not_ready";

export type TraceStatus = "success" | "failed" | "skipped";

export type RationaleStrength = "weak" | "moderate" | "strong";

// --- GET /overview ---
export interface Overview {
  backend: string;
  llm_provider: string;
  run_ids: string[];
  run_count: number;
  lesson_count: number;
  episode_count: number;
  latest_run_id: string | null;
  disclaimer: string;
}

// --- GET /runs (summary rows) ---
export interface RunSummary {
  run_id: string;
  objective: string;
  strategies: number;
  critiques: number;
  advanced: number;
  deferred: number;
  compression_ratio: number | null;
  retrieved_lessons: number;
  produced_lessons: number;
}

// --- Lesson ---
export interface Lesson {
  lesson_id: string;
  text: string;
  kind: LessonKind;
  source_run_id: string;
  source_critique?: string | null;
  confidence: number;
  embedding?: number[] | null;
  schema_version?: string;
  created_at?: string | null;
}

// --- GET /memory/lessons ---
export interface ScoredLesson {
  lesson: Lesson;
  score: number | null;
}

// --- GET /memory/episodes ---
export interface EpisodeRecord {
  run_id: string;
  objective: string;
  strategy_names: string[];
  critique_summaries: string[];
  failed_feasibility: string[];
  retrieved_lesson_ids: string[];
  produced_lesson_ids: string[];
  schema_version?: string;
  created_at?: string | null;
}

// --- GET /compaction/{run_id} (ContextPack) ---
export interface ContextPack {
  pack_id: string;
  run_id: string;
  lessons: string[];
  tokens_before: number;
  tokens_after: number;
  compression_ratio: number;
  critical_lessons_retained: number;
  total_critical_lessons: number;
  duplicate_events_removed: number;
  budget: number;
  tokens_estimated: boolean;
  schema_version?: string;
  created_at?: string | null;
}

// --- Run detail sub-shapes (a subset of QuantResearchPacket we render) ---
export interface DataFeasibilityReport {
  hypothesis_name: string;
  verdict: DataFeasibilityVerdict;
  required_data: string[];
  available_now: string[];
  available_with_existing_adapter: string[];
  missing_data: string[];
  proxy_available: boolean;
  proxy_description?: string | null;
  proxy_features: string[];
  data_quality_risks: string[];
}

export interface StrategyRule {
  feature: string;
  operator: string;
  value?: number | string | boolean | null;
  feature_ref?: string | null;
  lookback_days?: number | null;
  description?: string | null;
}

export interface RankingRule {
  feature: string;
  order: "ascending" | "descending";
  top_n?: number | null;
  bottom_n?: number | null;
}

export interface PortfolioRules {
  weighting:
    | "equal_weight"
    | "rank_weighted"
    | "inverse_vol_weighted"
    | "volatility_targeted";
  max_position?: number | null;
  max_sector_weight?: number | null;
  rebalance_frequency: "daily" | "weekly" | "monthly";
}

export interface RiskRules {
  stop_loss?: number | null;
  take_profit?: number | null;
  max_holding_days?: number | null;
  max_turnover?: number | null;
}

export interface StrategySpec {
  strategy_name: string;
  source_hypothesis: string;
  strategy_family: string;
  hypothesis: string;
  economic_rationale: string;
  universe: string;
  entry_rules: StrategyRule[];
  exit_rules: StrategyRule[];
  ranking_rule?: RankingRule | null;
  portfolio_rules: PortfolioRules;
  risk_rules: RiskRules;
  required_data: string[];
  expected_failure_modes: string[];
  backtest_readiness: BacktestReadiness;
  confidence: number;
}

export interface StrategyCritique {
  strategy_name: string;
  verdict: CritiqueVerdict;
  major_issues: string[];
  leakage_risks: string[];
  overfitting_risks: string[];
  transaction_cost_risks: string[];
  data_quality_risks: string[];
  economic_rationale_strength: RationaleStrength;
  suggested_mutations: string[];
  confidence: number;
}

// --- GET /strategies (flat, trader-facing catalog joined with critique verdict) ---
export interface StrategyCatalogItem {
  run_id: string;
  strategy_name: string;
  strategy_family: string;
  universe: string;
  hypothesis: string;
  readiness: BacktestReadiness;
  confidence: number;
  verdict: CritiqueVerdict | null;
  rationale_strength: RationaleStrength | null;
  top_risk: string | null;
  risk_count: number;
}

export interface SaveStrategyResponse {
  run_id: string;
  strategy_name: string;
  strategy_path: string;
}

export interface ExperimentResultStub {
  strategy_name: string;
  status: "not_executed";
  reason: string;
  planned_metrics: string[];
}

// --- Upstream packet fields the dashboard now renders (all already on the wire via
//     /runs/latest + /runs/{id}; these just type them). Names track schemas/__init__.py. ---
export interface ResearchAgenda {
  research_objective: string;
  research_domain: string;
  asset_universe: string;
  target_horizons: string[];
  strategy_styles: string[];
  constraints: Record<string, unknown>;
  research_questions: string[];
}

export interface PriorArtTheme {
  theme: string;
  summary: string;
  mechanism_type: string;
  required_data: string[];
  known_risks: string[];
  source_type: string;
  confidence: number;
  source_url?: string | null;
}

export interface MarketMechanism {
  name: string;
  description: string;
  why_edge_might_exist: string[];
  why_edge_might_disappear: string[];
  observable_implications: string[];
  related_themes: string[];
}

export interface CandidateHypothesis {
  hypothesis_name: string;
  hypothesis: string;
  mechanism: string;
  predicted_effect: string;
  asset_universe: string;
  horizon: string;
  required_data: string[];
  possible_proxy_data: string[];
  expected_failure_modes: string[];
  falsification_tests: string[];
  confidence: number;
}

export interface StrategyValidationReport {
  strategy_name: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WorkspaceArtifact {
  artifact_type: "strategy_yaml" | "run_json" | "markdown_report" | "context_pack";
  path: string;
  description: string;
}

export interface ExperimentPlanStub {
  strategy_name: string;
  train_period: [string, string];
  test_period: [string, string];
  benchmark: string;
  universes: string[];
  cost_assumptions: Record<string, number>;
  robustness_tests: string[];
  failure_criteria: string[];
  status: "stub_not_executed";
}

export interface AgentTrace {
  agent_name: string;
  input_summary: string;
  output_summary: string;
  schema_used: string;
  validation_status: "success" | "failed" | "repaired";
  errors: string[];
}

// --- POST /agent/chat + /agent/draft-strategy (Tier 1: one grounded LLM call, no writes).
//     provider is "mock" until QC_LLM_PROVIDER is set on the backend. ---
export interface AgentChatReply {
  lead: string;
  required_data: string[];
  feasibility: string[];
  risks: string[];
  next_run: string;
}

export interface AgentChatResponse {
  reply: AgentChatReply;
  provider: string;
  run_id: string;
  strategy_name: string;
}

export interface DraftStrategyResponse {
  spec: StrategySpec;
  provider: string;
  drafted: boolean;
}

// --- POST /agent/reading (curated reading + market alerts for a strategy) ---
export type ReadingType = "PAPER" | "NEWS" | "NOTE" | "DATA";

export interface ReadingItem {
  type: ReadingType;
  title: string;
  source: string;
  year?: string | null;
  summary: string;
  /** Why it matters for the selected strategy. */
  why: string;
  url?: string | null;
}

export type AlertTag = "FOMC" | "FX" | "CRYPTO" | "EQUITY" | "RATES" | "MACRO";

export interface MarketAlert {
  tag: AlertTag;
  headline: string;
  strategy_tag: string;
  url?: string | null;
}

export interface CuratedReading {
  items: ReadingItem[];
  alerts: MarketAlert[];
}

export interface CuratedReadingResponse {
  reading: CuratedReading;
  provider: string;
  run_id: string;
  strategy_name: string;
}

// --- POST /agent/backtest (real keyless EOD backtest; simulated fallback) ---
export interface BacktestPoint {
  t: number;
  date: string;
  equity: number;
}

export interface BacktestTrade {
  date: string;
  side: string;
  ticker: string;
  shares: number;
  price: number;
}

export interface BacktestResult {
  executed: boolean; // true = real prices, false = simulated fallback
  source: string; // 'stooq/yahoo' | 'simulated'
  universe: string[];
  start: string | null;
  end: string | null;
  rebalance: string;
  signal: string;
  equity: BacktestPoint[];
  trades: BacktestTrade[];
  total_return: number;
  sharpe: number;
  max_drawdown: number;
  win_rate: number;
  periods: number;
  note: string;
}

export interface BacktestResponse {
  backtest: BacktestResult;
  run_id: string;
  strategy_name: string;
}

// --- POST /runs + GET /runs/jobs/{id} (the write path: launch the real pipeline) ---
export interface CreateRunResponse {
  job_id: string;
  status: string;
  provider: string;
}

export interface RunJob {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  objective?: string;
  run_id?: string | null;
  error?: string | null;
}

export type AgentCommandKind = "strategy" | "check" | "iterate" | "live";

export interface StrategyAdjustments {
  max_holding_days?: number | null;
  rebalance_frequency?: "daily" | "weekly" | "monthly" | null;
  ranking_feature?: string | null;
  ranking_order?: "ascending" | "descending" | null;
  top_n?: number | null;
}

export interface AgentCommandRequest {
  command: AgentCommandKind;
  objective?: string;
  run_id?: string;
  strategy_name?: string;
  promote?: boolean;
  papers?: number;
  news?: number;
  adjustments?: StrategyAdjustments;
  starting_cash?: number;
  reset?: boolean;
  source_url?: string | null;
}

export interface PaperSignal {
  ticker: string;
  price: number;
  signal_value: number;
  weight: number;
}

export interface PaperTradePlan {
  executed: boolean;
  source: string;
  as_of: string | null;
  rebalance: string;
  signal: string;
  picks: PaperSignal[];
  note: string;
}

export interface PaperOrder {
  side: "BUY" | "SELL";
  ticker: string;
  as_of: string | null;
  shares: number;
  price: number;
  notional: number;
  signal_value: number | null;
  target_weight: number;
  current_shares: number;
  target_shares: number;
  reason: string;
}

export interface PaperPortfolioState {
  run_id: string;
  strategy_name: string;
  cash: number;
  equity: number;
  source: string;
  signal: string;
  state_path: string;
  history: Array<{ as_of: string | null; equity: number }>;
}

export interface PaperTradeResult {
  plan: PaperTradePlan;
  orders: PaperOrder[];
  portfolio: PaperPortfolioState;
}

export interface AgentCommandResult {
  command: AgentCommandKind;
  objective?: string;
  run_id?: string;
  strategy_name?: string;
  strategy_count?: number;
  strategies?: StrategySpec[];
  summary?: RunSummary;
  backtest?: BacktestResult;
  papers?: ReadingItem[];
  news?: ReadingItem[];
  lessons?: Lesson[];
  ascii_pnl?: string;
  adjusted_spec?: StrategySpec | null;
  iteration_note?: string | null;
  promoted_lessons?: number;
  paper_trade?: PaperTradeResult;
}

export interface AgentCommandCreateResponse {
  job_id: string;
  status: "queued";
  command: AgentCommandKind;
  provider: string;
}

export interface AgentCommandJob {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  command: AgentCommandKind;
  run_id?: string | null;
  strategy_name?: string | null;
  error?: string | null;
  result?: AgentCommandResult | null;
}

export interface TraceEvent {
  run_id: string;
  step: number;
  agent_name: string;
  status: TraceStatus;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  error?: string | null;
}

export interface QuantResearchRequest {
  objective: string;
  asset_universe?: string | null;
  constraints?: Record<string, unknown>;
}

// --- GET /runs/{run_id} or /runs/latest (full packet; only the fields we render are typed) ---
export interface QuantResearchPacket {
  run_id: string;
  request: QuantResearchRequest;
  agenda?: ResearchAgenda | null;
  prior_art_themes?: PriorArtTheme[];
  market_mechanisms?: MarketMechanism[];
  candidate_hypotheses?: CandidateHypothesis[];
  data_feasibility_reports: DataFeasibilityReport[];
  strategy_specs: StrategySpec[];
  strategy_validation_reports?: StrategyValidationReport[];
  workspace_artifacts?: WorkspaceArtifact[];
  critiques: StrategyCritique[];
  experiment_plans?: ExperimentPlanStub[];
  experiment_results: ExperimentResultStub[];
  context_pack: ContextPack | null;
  retrieved_lessons: Lesson[];
  produced_lessons: Lesson[];
  trace_events: TraceEvent[];
  agent_traces?: AgentTrace[];
  episode: EpisodeRecord | null;
}

export const ADVANCING_VERDICTS: ReadonlySet<DataFeasibilityVerdict> =
  new Set<DataFeasibilityVerdict>(["testable_now", "testable_with_proxy"]);
