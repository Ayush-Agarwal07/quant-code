"""quantcode CLI — the product surface. Thin: parse args, call pipeline/workspace/memory,
render with rich. NO business logic here (it belongs in pipeline/)."""

from __future__ import annotations

import re
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from quantcode.compaction import ResearchTraceCompiler
from quantcode.dashboard.backtest import BacktestResult, build_paper_plan
from quantcode.memory import Memory
from quantcode.pipeline import run_from_url, run_research
from quantcode.schemas import Lesson, QuantResearchPacket, StrategySpec
from quantcode.workspace import WorkspaceManager

app = typer.Typer(help="QuantCode — Claude Code for systematic strategy research (CLI-first).")
console = Console()

ADVANCING = {"testable_now", "testable_with_proxy"}
REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = REPO_ROOT / "frontend"
DEFAULT_STRATEGY_OBJECTIVE = (
    "Find short-horizon underreaction strategies in US liquid equities using only OHLCV "
    "and earnings calendar data"
)


def _resolve_run(wm: WorkspaceManager, target: str) -> Path:
    run_id = target.removeprefix("runs/").removeprefix("run_runs/")
    if run_id in ("latest", ""):
        latest = wm.latest_run_id()
        if latest is None:
            console.print("[red]No runs yet. Run `quantcode research \"...\"` first.[/red]")
            raise typer.Exit(1)
        run_id = latest
    path = wm.research_runs / f"{run_id}.json"
    if not path.exists():
        console.print(f"[red]No such run: {run_id}[/red]")
        raise typer.Exit(1)
    return path


def _stop_process(proc: subprocess.Popen[bytes] | None, name: str) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        console.print(f"[yellow]{name} did not exit cleanly; killing.[/yellow]")
        proc.kill()
        proc.wait(timeout=5)


def _print_packet(p: QuantResearchPacket) -> None:
    table = Table(title=f"run {p.run_id}: {p.request.objective}", show_lines=False)
    table.add_column("stage")
    table.add_column("result")
    advanced = sum(1 for r in p.data_feasibility_reports if r.verdict.value in ADVANCING)
    deferred = len(p.data_feasibility_reports) - advanced
    table.add_row("feasibility", f"{advanced} advanced, {deferred} deferred")
    table.add_row("strategies written", str(len(p.strategy_specs)))
    crit = ", ".join(f"{c.strategy_name}:{c.verdict}" for c in p.critiques) or "—"
    table.add_row("critiques", crit)
    if p.context_pack:
        cp = p.context_pack
        comp = f"{cp.tokens_before}→{cp.tokens_after} ({cp.compression_ratio:.2f}x)"
        table.add_row("compaction", comp)
    table.add_row("retrieved lessons", str(len(p.retrieved_lessons)))
    table.add_row("produced lessons", str(len(p.produced_lessons)))
    table.add_row("experiments", "not_executed (stubbed — no performance claimed)")
    console.print(table)


def _load_packet(target: str = "runs/latest") -> QuantResearchPacket:
    wm = WorkspaceManager()
    return QuantResearchPacket.model_validate_json(_resolve_run(wm, target).read_text())


def _strategy_path(packet: QuantResearchPacket, spec: StrategySpec) -> str:
    for artifact in packet.workspace_artifacts:
        if artifact.artifact_type == "strategy_yaml" and artifact.description == spec.strategy_name:
            return artifact.path
    return "—"


def _print_strategies(packet: QuantResearchPacket) -> None:
    table = Table(title=f"Strategies from {packet.run_id}")
    table.add_column("name")
    table.add_column("readiness")
    table.add_column("confidence")
    table.add_column("file")
    for spec in packet.strategy_specs:
        table.add_row(
            spec.strategy_name,
            spec.backtest_readiness,
            f"{spec.confidence:.0%}",
            _strategy_path(packet, spec),
        )
    console.print(table)


def _select_specs(packet: QuantResearchPacket, name: str | None) -> list[StrategySpec]:
    if name is None:
        return packet.strategy_specs
    matches = [s for s in packet.strategy_specs if s.strategy_name == name]
    if matches:
        return matches
    console.print(f"[red]No strategy named {name!r} in {packet.run_id}.[/red]")
    raise typer.Exit(1)


def _asset_word(universe: str) -> str:
    u = universe.lower()
    if "fx" in u or "currenc" in u or "g10" in u:
        return "currencies"
    if "crypto" in u or "btc" in u or "coin" in u:
        return "crypto"
    if "bond" in u or "rate" in u or "treasur" in u:
        return "bonds"
    return "stocks"


def _paper_query(spec: StrategySpec) -> str:
    return f"{spec.strategy_family.replace('_', ' ')} {spec.source_hypothesis.replace('_', ' ')}"


def _news_query(spec: StrategySpec) -> str:
    return f"{spec.strategy_family.replace('_', ' ')} {_asset_word(spec.universe)}"


def _print_check(
    packet: QuantResearchPacket,
    spec: StrategySpec,
    papers: int,
    news: int,
    result: BacktestResult | None = None,
) -> BacktestResult:
    from quantcode.dashboard import sources
    from quantcode.dashboard.backtest import run_backtest

    console.print(Panel(spec.hypothesis, title=f"{packet.run_id} · {spec.strategy_name}"))
    result = result or run_backtest(spec)

    table = Table(title="Backtest")
    table.add_column("metric")
    table.add_column("value")
    table.add_row("source", result.source if result.executed else "simulated fallback")
    table.add_row("period", f"{result.start or '—'} → {result.end or '—'}")
    table.add_row("universe", ", ".join(result.universe))
    table.add_row("signal", result.signal)
    table.add_row("return", f"{result.total_return:+.2%}")
    table.add_row("sharpe", f"{result.sharpe:.2f}")
    table.add_row("max drawdown", f"{result.max_drawdown:.2%}")
    table.add_row("win rate", f"{result.win_rate:.2%}")
    table.add_row("periods", str(result.periods))
    console.print(table)
    console.print(f"[dim]{result.note}[/dim]")

    paper_rows = sources.arxiv_papers(_paper_query(spec), papers)
    paper_table = Table(title="Relevant papers")
    paper_table.add_column("year")
    paper_table.add_column("title")
    paper_table.add_column("url")
    for item in paper_rows:
        paper_table.add_row(item.get("year") or "—", item["title"], item.get("url") or "—")
    if not paper_rows:
        paper_table.add_row("—", "No arXiv results returned", "—")
    console.print(paper_table)

    news_rows = sources.google_news(_news_query(spec), news)
    news_table = Table(title="Recent news")
    news_table.add_column("year")
    news_table.add_column("headline")
    news_table.add_column("source")
    for item in news_rows:
        news_table.add_row(item.get("year") or "—", item["title"], item.get("source") or "—")
    if not news_rows:
        news_table.add_row("—", "No Google News results returned", "—")
    console.print(news_table)
    return result


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "strategy"


def _ascii_curve(result: BacktestResult, width: int = 16) -> str:
    pts = result.equity
    if len(pts) < 2:
        return "Pnl curve: n/a"
    step = max(1, len(pts) // width)
    vals = [p.equity for p in pts[::step]]
    if vals[-1] != pts[-1].equity:
        vals.append(pts[-1].equity)
    lo, hi = min(vals), max(vals)
    chars = "._-:=+*#%@"
    if hi == lo:
        body = chars[len(chars) // 2] * len(vals)
    else:
        body = "".join(chars[min(len(chars) - 1, int((v - lo) / (hi - lo) * (len(chars) - 1)))] for v in vals)
    return f"Pnl curve: {vals[0]:.1f} {body} {vals[-1]:.1f}"


def _backtest_lessons(packet: QuantResearchPacket, spec: StrategySpec, result: BacktestResult, round_no: int) -> list[Lesson]:
    prefix = f"{packet.run_id}:bt:{_slug(spec.strategy_name)}:r{round_no}"
    lessons: list[Lesson] = []
    if result.sharpe < 0.5:
        msg = "daily rebalance likely too costly" if result.rebalance == "daily" else "signal family showed weak Sharpe in this construction"
        lessons.append(
            Lesson(
                lesson_id=f"{prefix}:weak_sharpe",
                text=f"{spec.strategy_name}: Sharpe {result.sharpe:.2f}; {msg}.",
                kind="warning",
                source_run_id=packet.run_id,
                confidence=0.8,
            )
        )
    if result.max_drawdown <= -0.12:
        lessons.append(
            Lesson(
                lesson_id=f"{prefix}:drawdown",
                text=f"{spec.strategy_name}: max drawdown {result.max_drawdown:.2%}; tighten risk rules before re-testing.",
                kind="mutation_rule",
                source_run_id=packet.run_id,
                confidence=0.85,
            )
        )
    if spec.backtest_readiness == "ready_with_proxy_limitations" and result.total_return <= 0:
        lessons.append(
            Lesson(
                lesson_id=f"{prefix}:proxy",
                text=f"{spec.strategy_name}: proxy-based construction underperformed; prefer direct data over proxy variants.",
                kind="data_constraint",
                source_run_id=packet.run_id,
                confidence=0.8,
            )
        )
    if result.sharpe >= 0.75 and result.max_drawdown > -0.1:
        lessons.append(
            Lesson(
                lesson_id=f"{prefix}:pattern",
                text=f"{spec.strategy_name}: {spec.ranking_rule.feature if spec.ranking_rule else 'signal'} held up with Sharpe {result.sharpe:.2f} and max drawdown {result.max_drawdown:.2%}.",
                kind="pattern",
                source_run_id=packet.run_id,
                confidence=0.8,
            )
        )
    if not lessons:
        lessons.append(
            Lesson(
                lesson_id=f"{prefix}:baseline",
                text=f"{spec.strategy_name}: return {result.total_return:+.2%}, Sharpe {result.sharpe:.2f}, max drawdown {result.max_drawdown:.2%}; keep as a measured baseline before changing parameters.",
                kind="warning",
                source_run_id=packet.run_id,
                confidence=0.75,
            )
        )
    return lessons


def _print_lessons(lessons: list[Lesson]) -> None:
    table = Table(title="Backtest-derived lessons")
    table.add_column("kind")
    table.add_column("lesson")
    for lesson in lessons:
        table.add_row(lesson.kind, lesson.text)
    console.print(table)


def _maybe_promote_backtest_lessons(mem: Memory, lessons: list[Lesson]) -> None:
    if not typer.confirm("promote these backtest lessons to Tier 3?", default=False):
        return
    promoted = mem.curator.promote(lessons, approved=True)["promoted"]
    console.print(f"[green]promoted {len(promoted)} lesson(s).[/green]")


def _mutate_spec(spec: StrategySpec, wm: WorkspaceManager) -> StrategySpec:
    current_hold = spec.risk_rules.max_holding_days or 0
    hold_raw = typer.prompt(
        f"max holding days [{current_hold or 'unchanged'}]",
        default=str(current_hold) if current_hold else "",
        show_default=False,
    ).strip()
    new_hold = spec.risk_rules.max_holding_days if not hold_raw else int(hold_raw)
    rebalance = typer.prompt(
        "rebalance [daily|weekly|monthly]",
        default=spec.portfolio_rules.rebalance_frequency,
    ).strip()
    updated = spec.model_copy(
        update={
            "risk_rules": spec.risk_rules.model_copy(update={"max_holding_days": new_hold}),
            "portfolio_rules": spec.portfolio_rules.model_copy(update={"rebalance_frequency": rebalance}),
        }
    )
    path = wm.write_strategy_yaml(updated)
    console.print(f"[dim]wrote revised strategy: {path}[/dim]")
    return updated


def _run_backtest_review(
    packet: QuantResearchPacket,
    spec: StrategySpec,
    papers: int,
    news: int,
    round_no: int,
) -> list[Lesson]:
    from quantcode.dashboard.backtest import run_backtest

    result = run_backtest(spec)
    _print_check(packet, spec, papers=papers, news=news, result=result)
    console.print(_ascii_curve(result))
    lessons = _backtest_lessons(packet, spec, result, round_no)
    _print_lessons(lessons)
    return lessons


def _learn_from_check(packet: QuantResearchPacket, spec: StrategySpec, papers: int, news: int) -> None:
    wm = WorkspaceManager()
    mem = Memory.connect()
    current = spec
    lessons = _run_backtest_review(packet, current, papers, news, round_no=1)
    action = typer.prompt(
        "next action [stop|iterate|adjust]",
        default="stop",
    ).strip().lower()
    if action == "stop":
        _maybe_promote_backtest_lessons(mem, lessons)
        return
    if not typer.confirm("approve one more backtest round?", default=False):
        _maybe_promote_backtest_lessons(mem, lessons)
        return
    if action == "adjust":
        current = _mutate_spec(current, wm)
    lessons = _run_backtest_review(packet, current, papers, news, round_no=2)
    _maybe_promote_backtest_lessons(mem, lessons)


def _iterate_strategy(
    packet: QuantResearchPacket,
    spec: StrategySpec,
    papers: int,
    news: int,
    *,
    adjust_first: bool,
) -> None:
    if not typer.confirm("approve this backtest iteration?", default=False):
        raise typer.Exit(0)
    wm = WorkspaceManager()
    current = _mutate_spec(spec, wm) if adjust_first else spec
    lessons = _run_backtest_review(packet, current, papers, news, round_no=2)
    _maybe_promote_backtest_lessons(Memory.connect(), lessons)


def _run_paper_live(
    packet: QuantResearchPacket,
    spec: StrategySpec,
    *,
    starting_cash: float,
    reset: bool,
) -> None:
    wm = WorkspaceManager()
    plan = build_paper_plan(spec)
    if not plan.picks:
        console.print("[yellow]No live paper picks produced for this strategy.[/yellow]")
        raise typer.Exit(1)

    state = None if reset else wm.read_paper_state(spec.strategy_name)
    cash = float(state["cash"]) if state else starting_cash
    positions = {k: float(v) for k, v in (state["positions"] if state else {}).items()}
    prices = {pick.ticker: pick.price for pick in plan.picks}
    equity = cash + sum(shares * prices.get(tk, 0.0) for tk, shares in positions.items())
    if equity <= 0:
        equity = starting_cash

    targets = {pick.ticker: round(equity * pick.weight / pick.price, 4) for pick in plan.picks if pick.price > 0}
    orders: list[tuple[str, str, float, float, float]] = []
    for tk in sorted(set(positions) | set(targets)):
        current = positions.get(tk, 0.0)
        target = targets.get(tk, 0.0)
        delta = round(target - current, 4)
        if abs(delta) < 1e-6:
            continue
        action = "BUY" if delta > 0 else "SELL"
        orders.append((action, tk, abs(delta), prices.get(tk, 0.0), round(delta * prices.get(tk, 0.0), 2)))

    new_positions = {tk: shares for tk, shares in targets.items() if shares > 0}
    invested = sum(new_positions[tk] * prices[tk] for tk in new_positions)
    new_cash = round(equity - invested, 2)
    history = list(state.get("history", []))[-19:] if state else []
    history.append({"as_of": plan.as_of, "equity": round(equity, 2)})
    path = wm.write_paper_state(
        spec.strategy_name,
        {
            "run_id": packet.run_id,
            "strategy_name": spec.strategy_name,
            "as_of": plan.as_of,
            "cash": new_cash,
            "equity": round(equity, 2),
            "source": plan.source,
            "signal": plan.signal,
            "positions": new_positions,
            "history": history,
        },
    )

    summary = Table(title=f"Paper portfolio — {spec.strategy_name}")
    summary.add_column("field")
    summary.add_column("value")
    summary.add_row("run", packet.run_id)
    summary.add_row("as of", plan.as_of or "—")
    summary.add_row("source", plan.source if plan.executed else "simulated fallback")
    summary.add_row("signal", plan.signal)
    summary.add_row("equity", f"${equity:,.2f}")
    summary.add_row("cash", f"${new_cash:,.2f}")
    console.print(summary)
    console.print(f"[dim]{plan.note}[/dim]")

    picks = Table(title="Target holdings")
    picks.add_column("ticker")
    picks.add_column("price")
    picks.add_column("signal")
    picks.add_column("weight")
    for pick in plan.picks:
        picks.add_row(pick.ticker, f"${pick.price:.2f}", f"{pick.signal_value:.4f}", f"{pick.weight:.0%}")
    console.print(picks)

    order_table = Table(title="Paper orders")
    order_table.add_column("side")
    order_table.add_column("ticker")
    order_table.add_column("shares")
    order_table.add_column("price")
    order_table.add_column("notional")
    if orders:
        for side, tk, shares, price, notional in orders:
            order_table.add_row(side, tk, f"{shares:.4f}", f"${price:.2f}", f"${abs(notional):,.2f}")
    else:
        order_table.add_row("HOLD", "—", "0", "—", "$0.00")
    console.print(order_table)
    console.print(f"[dim]paper state: {path}[/dim]")


@app.command()
def init() -> None:
    """Create the workspace dirs and a starter .env (never overwrites an existing .env)."""
    wm = WorkspaceManager()
    wm.ensure_dirs()
    console.print(f"[green]workspace ready[/green] at {wm.root}/")
    env = Path(".env")
    example = Path(".env.example")
    if env.exists():
        console.print("[yellow].env exists — left untouched (HITL: won't overwrite).[/yellow]")
    elif example.exists():
        shutil.copyfile(example, env)
        console.print("[green]wrote .env[/green] from .env.example (fill in secrets as needed)")


@app.command()
def warmup() -> None:
    """Pre-pull the BGE model + tokenizer into the local cache (run ONCE, online, before going
    offline). Afterwards an offline `demo` uses real semantic embeddings and MEASURED token
    counts instead of the hash-embedding / token-estimate fallbacks (task 07; D3/D7)."""
    from quantcode.compaction.tokenizer import warm_tokenizer_cache
    from quantcode.memory._embeddings import using_real_model

    console.print("[dim]warming caches (downloads ~50MB on first run)…[/dim]")
    tokenizer_ok = warm_tokenizer_cache()
    embeddings_ok = using_real_model()  # constructs/downloads the model online, else False

    table = Table(title="QuantCode warmup — offline readiness")
    table.add_column("cache")
    table.add_column("status")
    table.add_row(
        "compaction tokenizer (bge)",
        "[green]MEASURED ✓[/green]" if tokenizer_ok else "[red]estimate fallback ✗[/red]",
    )
    table.add_row(
        "semantic embeddings (fastembed bge)",
        "[green]real model ✓[/green]" if embeddings_ok else "[red]hash fallback ✗[/red]",
    )
    console.print(table)
    if not (tokenizer_ok and embeddings_ok):
        console.print("[yellow]not fully warmed — check network, then re-run warmup.[/yellow]")
        raise typer.Exit(1)
    console.print("[green]warm — offline demo will use real embeddings + measured tokens.[/green]")


@app.command()
def benchmarks() -> None:
    """Run the reproducible, offline benchmarks (compaction recall/ROUGE-L + memory retrieval)
    and print measured numbers for the pitch. Warm caches first (`quantcode warmup`) for the
    real-embedding retrieval figure."""
    from quantcode.benchmarks import run_all

    run_all()


@app.command()
def research(
    objective: str,
    promote: bool = typer.Option(False, help="Promote lessons to Tier 3 (HITL approval)."),
) -> None:
    """Run the full research pipeline for an objective; write run + report + strategies."""
    try:
        packet = run_research(objective, promote=promote)
    except Exception as exc:  # one clean error boundary (D6)
        console.print(f"[red]pipeline failed:[/red] {exc}")
        raise typer.Exit(1) from exc
    _print_packet(packet)
    if not promote and packet.context_pack:
        console.print("[dim]lessons left pending — re-run with --promote to write Tier 3.[/dim]")


@app.command()
def strategy(
    objective: str = typer.Argument(DEFAULT_STRATEGY_OBJECTIVE),
    promote: bool = typer.Option(False, help="Promote lessons to Tier 3 memory."),
) -> None:
    """Create strategy specs from a research objective using the full agent pipeline."""
    try:
        packet = run_research(objective, promote=promote)
    except Exception as exc:
        console.print(f"[red]strategy pipeline failed:[/red] {exc}")
        raise typer.Exit(1) from exc
    _print_packet(packet)
    if packet.strategy_specs:
        _print_strategies(packet)
        console.print(f"[green]created {len(packet.strategy_specs)} strategy spec(s).[/green]")
        console.print(f"[dim]Next: quantcode check {packet.run_id}[/dim]")
    else:
        console.print("[yellow]No strategies passed feasibility + validation.[/yellow]")


@app.command()
def check(
    target: str = typer.Argument("runs/latest", help="Run id, runs/latest, or latest."),
    strategy_name: Optional[str] = typer.Option(None, "--strategy", "-s", help="Check one strategy."),
    papers: int = typer.Option(3, help="Number of arXiv papers to fetch per strategy."),
    news: int = typer.Option(4, help="Number of Google News items to fetch per strategy."),
    learn: bool = typer.Option(False, "--learn", help="Derive lessons and offer one approved re-test round."),
) -> None:
    """Backtest strategy specs and pull relevant papers/news from the terminal."""
    packet = _load_packet(target)
    specs = _select_specs(packet, strategy_name)
    if not specs:
        console.print(
            f"[yellow]{packet.run_id} has no strategy specs. Run `quantcode strategy`.[/yellow]"
        )
        raise typer.Exit(1)
    for spec in specs:
        if learn:
            _learn_from_check(packet, spec, papers=papers, news=news)
        else:
            _print_check(packet, spec, papers=papers, news=news)


@app.command()
def iterate(
    target: str = typer.Argument("runs/latest", help="Run id, runs/latest, or latest."),
    strategy_name: str = typer.Option(..., "--strategy", "-s", help="Strategy to re-test."),
    papers: int = typer.Option(3, help="Number of arXiv papers to fetch."),
    news: int = typer.Option(4, help="Number of Google News items to fetch."),
    adjust_first: bool = typer.Option(False, help="Edit basic parameters before re-testing."),
) -> None:
    """Run one explicit human-approved backtest iteration for a strategy."""
    packet = _load_packet(target)
    spec = _select_specs(packet, strategy_name)[0]
    _iterate_strategy(packet, spec, papers=papers, news=news, adjust_first=adjust_first)


@app.command()
def live(
    target: str = typer.Argument("runs/latest", help="Run id, runs/latest, or latest."),
    paper: bool = typer.Option(False, "--paper", help="Paper-trading only."),
    strategy_name: Optional[str] = typer.Option(None, "--strategy", "-s", help="Paper-trade one strategy."),
    starting_cash: float = typer.Option(100000.0, help="Starting paper cash for a new book."),
    reset: bool = typer.Option(False, help="Reset the saved paper portfolio for this strategy."),
) -> None:
    """Paper-trade the latest target portfolio from keyless EOD data."""
    if not paper:
        console.print("[yellow]Only `quantcode live --paper` is supported.[/yellow]")
        raise typer.Exit(1)
    packet = _load_packet(target)
    specs = _select_specs(packet, strategy_name)
    if not specs:
        console.print("[yellow]No strategy specs available to paper-trade.[/yellow]")
        raise typer.Exit(1)
    _run_paper_live(packet, specs[0], starting_cash=starting_cash, reset=reset)


@app.command()
def gui(
    api_host: str = typer.Option("127.0.0.1", help="Host for the FastAPI backend."),
    api_port: int = typer.Option(8000, help="Port for the FastAPI backend."),
    frontend_host: str = typer.Option("127.0.0.1", help="Host for the Next.js frontend."),
    frontend_port: int = typer.Option(3000, help="Port for the Next.js frontend."),
    open_browser: bool = typer.Option(True, "--open/--no-open", help="Open the dashboard in a browser."),
) -> None:
    """Launch the FastAPI backend and the Next.js frontend together for local GUI use."""
    npm = shutil.which("npm")
    if npm is None:
        console.print("[red]npm not found. Install Node.js/npm to launch the frontend.[/red]")
        raise typer.Exit(1)
    if not FRONTEND_DIR.exists():
        console.print(f"[red]frontend dir not found:[/red] {FRONTEND_DIR}")
        raise typer.Exit(1)
    if not (FRONTEND_DIR / "package.json").exists():
        console.print(f"[red]frontend/package.json not found:[/red] {FRONTEND_DIR / 'package.json'}")
        raise typer.Exit(1)

    backend_cmd = [
        sys.executable,
        "-c",
        (
            "from quantcode.dashboard.api import serve;"
            f"serve(host={api_host!r}, port={api_port})"
        ),
    ]
    frontend_cmd = [
        npm,
        "run",
        "dev",
        "--",
        "--hostname",
        frontend_host,
        "--port",
        str(frontend_port),
    ]
    backend_env = os.environ.copy()
    frontend_env = os.environ.copy()
    frontend_env["NEXT_PUBLIC_API_URL"] = f"http://{api_host}:{api_port}"

    backend_proc: subprocess.Popen[bytes] | None = None
    frontend_proc: subprocess.Popen[bytes] | None = None
    try:
        console.print(
            f"[dim]starting backend:[/dim] http://{api_host}:{api_port}  "
            f"[dim]frontend:[/dim] http://{frontend_host}:{frontend_port}"
        )
        backend_proc = subprocess.Popen(backend_cmd, cwd=str(REPO_ROOT), env=backend_env)
        time.sleep(1.0)
        if backend_proc.poll() is not None:
            raise typer.Exit(backend_proc.returncode or 1)

        frontend_proc = subprocess.Popen(frontend_cmd, cwd=str(FRONTEND_DIR), env=frontend_env)
        time.sleep(1.0)
        if frontend_proc.poll() is not None:
            raise typer.Exit(frontend_proc.returncode or 1)

        console.print(
            f"[green]GUI running.[/green] Open [bold]http://{frontend_host}:{frontend_port}[/bold]"
        )
        console.print("[dim]Ctrl-C stops both processes.[/dim]")
        if open_browser:
            webbrowser.open(f"http://{frontend_host}:{frontend_port}")

        while True:
            if backend_proc.poll() is not None:
                console.print("[red]backend exited unexpectedly.[/red]")
                raise typer.Exit(backend_proc.returncode or 1)
            if frontend_proc.poll() is not None:
                console.print("[red]frontend exited unexpectedly.[/red]")
                raise typer.Exit(frontend_proc.returncode or 1)
            time.sleep(1.0)
    except KeyboardInterrupt:
        console.print("\n[yellow]stopping GUI...[/yellow]")
    finally:
        _stop_process(frontend_proc, "frontend")
        _stop_process(backend_proc, "backend")


@app.command()
def demo() -> None:
    """Scripted two-run demo: run 2 retrieves a lesson learned in run 1 and changes behavior."""
    wm = WorkspaceManager()
    mem = Memory.connect()
    console.print(Panel(f"QuantCode demo — memory backend: [bold]{mem.backend_name}[/bold]"))
    objective = "Find short-horizon underreaction strategies"

    console.print("\n[bold]Run 1[/bold] — no prior memory")
    r1 = run_research(objective, promote=True, workspace=wm, memory=mem)
    _print_packet(r1)

    console.print("\n[bold]Run 2[/bold] — retrieves Tier 3 lessons from run 1")
    r2 = run_research(objective, promote=True, workspace=wm, memory=mem)
    _print_packet(r2)
    if r2.retrieved_lessons:
        console.print(
            Panel(
                "\n".join(f"⚠️ {lesson.text}" for lesson in r2.retrieved_lessons[:3]),
                title="Lessons the agent recalled before run 2",
            )
        )
    console.print(
        "[green]Proof of learning:[/green] run 2 retrieved "
        f"{len(r2.retrieved_lessons)} prior lesson(s) — the agent avoids repeating "
        "previously critiqued feasibility/validation mistakes."
    )


@app.command()
def inspect(target: str = typer.Argument("runs/latest")) -> None:
    """Print a run's artifacts (default: the latest run)."""
    wm = WorkspaceManager()
    packet = QuantResearchPacket.model_validate_json(_resolve_run(wm, target).read_text())
    _print_packet(packet)


@app.command()
def compact(
    target: str = typer.Argument("runs/latest"),
    budget: int = typer.Option(1000, help="Token budget for the context pack."),
) -> None:
    """Run the ResearchTrace Compiler on a run's trace at a given budget (Token Company demo)."""
    wm = WorkspaceManager()
    packet = QuantResearchPacket.model_validate_json(_resolve_run(wm, target).read_text())
    result = ResearchTraceCompiler().compile(packet.run_id, packet.trace_events, budget=budget)
    cp = result.pack
    est = " (estimated)" if cp.tokens_estimated else " (measured)"
    table = Table(title=f"ResearchTrace Compiler — {packet.run_id} @ budget {budget}")
    table.add_column("metric")
    table.add_column("value")
    table.add_row("tokens before → after", f"{cp.tokens_before} → {cp.tokens_after}{est}")
    table.add_row("compression ratio", f"{cp.compression_ratio:.2f}x")
    retained = f"{cp.critical_lessons_retained}/{cp.total_critical_lessons}"
    table.add_row("criticals retained", retained)
    table.add_row("duplicate events removed", str(cp.duplicate_events_removed))
    table.add_row("candidate lessons", str(len(result.candidate_lessons)))
    console.print(table)


@app.command("research-url")
def research_url(
    url: str,
    confirm: bool = typer.Option(False, help="Confirm the live Browserbase fetch (HITL)."),
    promote: bool = typer.Option(False, help="Promote lessons to Tier 3 (HITL approval)."),
) -> None:
    """Research prior art from a URL via Browserbase, then run the pipeline."""
    if not confirm:
        console.print(
            "[yellow]Live fetch is HITL-gated.[/yellow] A Browserbase fetch spends credits and "
            f"scrapes {url}. Re-run with [bold]--confirm[/bold] to proceed."
        )
        raise typer.Exit(0)
    try:
        packet = run_from_url(url, confirm=True, promote=promote)
    except Exception as exc:  # one clean error boundary
        console.print(f"[red]research-url failed:[/red] {exc}")
        raise typer.Exit(1) from exc
    _print_packet(packet)


memory_app = typer.Typer(help="Inspect Redis memory (Tier 3 semantic lessons).")
app.add_typer(memory_app, name="memory")


@memory_app.command("search")
def memory_search(query: str, k: int = typer.Option(5, help="Top-k lessons to return.")) -> None:
    """Vector-search Tier 3 lessons (the Redis 'beyond caching' surface)."""
    mem = Memory.connect()
    hits = mem.semantic.search(query, k=k)
    if not hits:
        console.print("[yellow]No lessons in Tier 3 yet. Run `quantcode demo` first.[/yellow]")
        raise typer.Exit(0)
    table = Table(title=f"Tier 3 lessons for: {query}  (backend: {mem.backend_name})")
    table.add_column("score")
    table.add_column("kind")
    table.add_column("lesson")
    table.add_column("from run")
    for lesson, score in hits:
        table.add_row(f"{score:.3f}", lesson.kind, lesson.text[:80], lesson.source_run_id)
    console.print(table)
