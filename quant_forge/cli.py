"""Command-line interface for Quant Forge."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from quant_forge import __version__
from quant_forge.core.exceptions import QuantForgeError
from quant_forge.core.json_utils import write_model_json
from quant_forge.strategy_research.schemas import MAIN_SCHEMA_NAMES
from quant_forge.strategy_research.workflow import run_quant_research

app = typer.Typer(
    name="qf",
    help="Quant Forge: a research-only agentic quant research prototype.",
    no_args_is_help=True,
)
console = Console()


@app.command()
def run(
    objective: Annotated[str, typer.Argument(help="Research objective to investigate.")],
    provider: Annotated[
        str, typer.Option("--provider", help="Structured model provider.")
    ] = "mock",
    output: Annotated[
        Path | None, typer.Option("--output", help="Optional JSON output path.")
    ] = None,
) -> None:
    """Run the one-shot research workflow."""

    try:
        packet = run_quant_research(objective, model_provider=provider)
    except QuantForgeError as exc:
        console.print(f"[red]Research workflow failed:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    verdict_counts = Counter(report.verdict.value for report in packet.data_feasibility_reports)
    table = Table(title="Quant Forge Research Summary", show_header=False)
    table.add_column("Artifact", style="cyan")
    table.add_column("Result")
    table.add_row("Research objective", packet.request.objective)
    table.add_row("Prior-art themes", str(len(packet.prior_art_themes)))
    table.add_row("Candidate hypotheses", str(len(packet.candidate_hypotheses)))
    table.add_row(
        "Feasibility verdicts",
        ", ".join(f"{name}: {count}" for name, count in sorted(verdict_counts.items())),
    )
    table.add_row("Strategy specifications", str(len(packet.strategy_specs)))
    table.add_row("Critiques", str(len(packet.critiques)))
    console.print(table)
    console.print("[yellow]Backtesting was stubbed and was not executed.[/yellow]")

    if output is not None:
        write_model_json(packet, output)
        console.print(f"Wrote structured research packet to [bold]{output}[/bold]")


@app.command("schemas")
def list_schemas() -> None:
    """Print the main structured artifact names."""

    console.print("[bold]Main schemas[/bold]")
    for schema_name in MAIN_SCHEMA_NAMES:
        console.print(f"- {schema_name}")


@app.command("version")
def version_command() -> None:
    """Print the package version."""

    console.print(__version__)


if __name__ == "__main__":
    app()
