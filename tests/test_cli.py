from __future__ import annotations

import json

from typer.testing import CliRunner

from quant_code.cli import app

runner = CliRunner()


def test_cli_version() -> None:
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.stdout


def test_cli_schemas() -> None:
    result = runner.invoke(app, ["schemas"])
    assert result.exit_code == 0
    assert "QuantResearchPacket" in result.stdout
    assert "StrategySpec" in result.stdout


def test_cli_run_mock_mode(tmp_path) -> None:
    output = tmp_path / "packet.json"
    result = runner.invoke(
        app,
        [
            "run",
            "Find robust short-horizon equity strategies based on market underreaction.",
            "--provider",
            "mock",
            "--output",
            str(output),
        ],
    )
    assert result.exit_code == 0
    assert "Backtesting was stubbed and was not executed." in result.stdout
    assert output.exists()
    packet = json.loads(output.read_text(encoding="utf-8"))
    assert packet["request"]["objective"].startswith("Find robust")
    assert packet["experiment_results"][0]["status"] == "not_executed"
