"""Runnable self-check: `python -m quantcode.workspace`. Uses a temp root (no pollution)."""

from __future__ import annotations

import tempfile
from pathlib import Path

from quantcode.schemas import sample_strategy_spec
from quantcode.workspace import WorkspaceManager

with tempfile.TemporaryDirectory() as tmp:
    wm = WorkspaceManager(tmp)
    wm.ensure_dirs()

    assert wm.next_run_id() == "run_001"
    assert wm.latest_run_id() is None

    spec = sample_strategy_spec()
    p1 = wm.write_strategy_yaml(spec)
    assert p1.name == "demo_momentum.yaml"

    # round-trip: written YAML reads back equal to the model
    (loaded,) = wm.read_existing_strategies()
    assert loaded == spec, "strategy YAML round-trip"

    # refuse-then-version: writing the same strategy again versions, never overwrites
    p2 = wm.write_strategy_yaml(spec)
    assert p2.name == "demo_momentum_v2.yaml" and p1.exists()

    inv = wm.list_workspace()
    assert set(inv["strategies"]) == {"demo_momentum.yaml", "demo_momentum_v2.yaml"}

    # report write + latest resolution against a run file
    (Path(wm.research_runs) / "run_001.json").write_text("{}", encoding="utf-8")
    assert wm.latest_run_id() == "run_001"
    assert wm.next_run_id() == "run_002"

print("workspace OK — atomic writes, run numbering, refuse-then-version, YAML round-trip")
