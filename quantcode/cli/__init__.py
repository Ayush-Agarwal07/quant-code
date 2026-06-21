"""quantcode CLI — the product surface. Thin: parse args, call pipeline/workspace/memory,
render with rich. NO business logic here (it belongs in pipeline/)."""

from __future__ import annotations

import shutil
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from quantcode.compaction import ResearchTraceCompiler
from quantcode.memory import Memory
from quantcode.pipeline import run_from_url, run_research
from quantcode.schemas import QuantResearchPacket, StrategySpec
from quantcode.workspace import WorkspaceManager

app = typer.Typer(help="QuantCode — Claude Code for systematic strategy research (CLI-first).")
console = Console()

ADVANCING = {"testable_now", "testable_with_proxy"}
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


def _print_check(packet: QuantResearchPacket, spec: StrategySpec, papers: int, news: int) -> None:
    from quantcode.dashboard import sources
    from quantcode.dashboard.backtest import run_backtest

    console.print(Panel(spec.hypothesis, title=f"{packet.run_id} · {spec.strategy_name}"))
    result = run_backtest(spec)

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
    strategy_name: str | None = typer.Option(None, "--strategy", "-s", help="Check one strategy."),
    papers: int = typer.Option(3, help="Number of arXiv papers to fetch per strategy."),
    news: int = typer.Option(4, help="Number of Google News items to fetch per strategy."),
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
        _print_check(packet, spec, papers=papers, news=news)


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
