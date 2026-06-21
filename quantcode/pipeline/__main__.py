"""Runnable self-check: `python -m quantcode.pipeline`. Offline (mock LLM + in-memory).

Proves the spine AND the headline learning loop: run 1 produces + promotes lessons to
Tier 3; run 2 retrieves them before generating strategies.
"""

from __future__ import annotations

import os
import tempfile

os.environ.setdefault("QC_MEMORY_BACKEND", "memory")  # no Redis server needed

from quantcode.memory import Memory  # noqa: E402  (env must be set before connect)
from quantcode.pipeline import run_research  # noqa: E402
from quantcode.workspace import WorkspaceManager  # noqa: E402

OBJECTIVE = "Find short-horizon underreaction strategies"

with tempfile.TemporaryDirectory() as tmp:
    wm = WorkspaceManager(tmp)
    mem = Memory.connect()  # shared across both runs so Tier 3 persists between them

    run1 = run_research(OBJECTIVE, promote=True, workspace=wm, memory=mem)
    assert run1.run_id == "run_001"
    assert run1.strategy_specs, "run 1 should write ≥1 strategy"
    assert run1.critiques, "run 1 should produce critiques"
    # a small run fits under budget (ratio ~1.0) — real compression is shown by `compact --budget`
    assert run1.context_pack and run1.context_pack.compression_ratio >= 1.0
    assert run1.produced_lessons, "run 1 (promote=True) should promote ≥1 lesson to Tier 3"
    assert not run1.retrieved_lessons, "run 1 has no prior memory to retrieve"
    assert (wm.research_runs / "run_001.json").exists()
    assert (wm.reports / "run_001.md").exists()

    run2 = run_research(OBJECTIVE, promote=True, workspace=wm, memory=mem)
    assert run2.run_id == "run_002"
    assert run2.retrieved_lessons, "run 2 must retrieve Tier 3 lessons learned in run 1"

cp = run1.context_pack
print(
    f"pipeline OK — run1: {len(run1.strategy_specs)} strategies, "
    f"{len(run1.produced_lessons)} lessons promoted, "
    f"compaction {cp.tokens_before}→{cp.tokens_after} ({cp.compression_ratio:.2f}x); "
    f"run2 retrieved {len(run2.retrieved_lessons)} lesson(s) — learning loop proven."
)
