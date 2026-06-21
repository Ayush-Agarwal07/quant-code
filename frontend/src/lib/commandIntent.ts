import type { AgentCommandRequest, StrategySpec } from "@/types";

export interface CommandContext {
  runId?: string | null;
  strategy?: StrategySpec | null;
}

export interface ProposedCommand {
  title: string;
  detail: string;
  request: AgentCommandRequest;
}

function req(command: AgentCommandRequest["command"], extra: Partial<AgentCommandRequest>): AgentCommandRequest {
  return { command, ...extra };
}

export function inferCommand(message: string, ctx: CommandContext): ProposedCommand | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  const run_id = ctx.runId ?? undefined;
  const strategy_name = ctx.strategy?.strategy_name;

  if (/(paper|live).*(trade|trading|portfolio)|paper trade|live trade/.test(lower)) {
    if (!strategy_name) return null;
    return {
      title: "Paper live",
      detail: `Paper-trade ${strategy_name} using the current saved strategy.`,
      request: req("live", { run_id, strategy_name, starting_cash: 100000 }),
    };
  }

  if (/\b(iterate|rerun|re-run|run again|retest|re-test)\b/.test(lower)) {
    if (!strategy_name) return null;
    return {
      title: "Iterate backtest",
      detail: `Run one approved follow-up backtest round for ${strategy_name}.`,
      request: req("iterate", { run_id, strategy_name, papers: 3, news: 4 }),
    };
  }

  if (/\b(backtest|check)\b/.test(lower) || (/\b(papers|news)\b/.test(lower) && !!strategy_name)) {
    if (!strategy_name) return null;
    return {
      title: "Check strategy",
      detail: `Backtest ${strategy_name} and pull the referenced papers and news.`,
      request: req("check", { run_id, strategy_name, papers: 3, news: 4 }),
    };
  }

  if (
    /\b(strategy|strategies)\b/.test(lower) &&
    /\b(create|generate|draft|brainstorm|build|find|make|run)\b/.test(lower)
  ) {
    return {
      title: "Create strategy",
      detail: `Launch the full strategy pipeline using this objective: ${text}`,
      request: req("strategy", { objective: text, promote: false }),
    };
  }

  return null;
}

export function commandPresets(ctx: CommandContext): ProposedCommand[] {
  const run_id = ctx.runId ?? undefined;
  const strategy = ctx.strategy;
  return [
    {
      title: "Strategy",
      detail: "Run the full research pipeline. Type an objective to customize, or use the default.",
      request: req("strategy", {
        objective: strategy
          ? `Find variants of ${strategy.strategy_name}: ${strategy.hypothesis}`
          // mirrors cli DEFAULT_STRATEGY_OBJECTIVE so the preset matches `quantcode strategy`
          : "Find short-horizon underreaction strategies in US liquid equities using only OHLCV and earnings calendar data",
      }),
    },
    ...(strategy
      ? [
          {
            title: "Check",
            detail: `Backtest ${strategy.strategy_name} and fetch papers/news.`,
            request: req("check", { run_id, strategy_name: strategy.strategy_name, papers: 3, news: 4 }),
          },
          {
            title: "Iterate",
            detail: `Run one approved follow-up backtest round for ${strategy.strategy_name}.`,
            request: req("iterate", { run_id, strategy_name: strategy.strategy_name, papers: 3, news: 4 }),
          },
          {
            title: "Paper live",
            detail: `Paper-trade ${strategy.strategy_name} with the saved portfolio state.`,
            request: req("live", { run_id, strategy_name: strategy.strategy_name, starting_cash: 100000 }),
          },
        ]
      : []),
  ];
}
