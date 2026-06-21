"""Runnable self-check: `python -m quantcode.cli`. Offline (mock LLM + in-memory),
isolated temp workspace. Exercises the demo / inspect / memory commands end-to-end."""

from __future__ import annotations

import os
import tempfile

_TMP = tempfile.mkdtemp()
os.environ["QC_WORKSPACE"] = _TMP  # set BEFORE config is imported
os.environ.setdefault("QC_MEMORY_BACKEND", "memory")

from typer.testing import CliRunner  # noqa: E402

from quantcode.cli import app  # noqa: E402

runner = CliRunner()

demo = runner.invoke(app, ["demo"])
assert demo.exit_code == 0, demo.output
assert "Proof of learning" in demo.output, demo.output

inspect = runner.invoke(app, ["inspect"])
assert inspect.exit_code == 0, inspect.output
assert "run_002" in inspect.output, inspect.output

compact = runner.invoke(app, ["compact", "runs/latest", "--budget", "40"])
assert compact.exit_code == 0, compact.output

search = runner.invoke(app, ["memory", "search", "underreaction"])
assert search.exit_code == 0, search.output

url = runner.invoke(app, ["research-url", "https://example.com"])
assert url.exit_code == 0 and "HITL-gated" in url.output, url.output

print("cli OK — demo/inspect/compact/memory-search/research-url all wired (offline)")
