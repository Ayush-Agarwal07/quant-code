"""WorkspaceManager — the single owner of all workspace file I/O.

Nothing else in the codebase opens files under the workspace directly. This is what
makes QuantCode feel like a local coding agent over files.

D6 conventions: zero-padded `run_NNN`; `latest` = newest-by-mtime; overwrite policy is
refuse-then-version (auto `_vN` on collision) — a *true* overwrite requires explicit
`overwrite=True`, which is the 🧑‍⚖️ HITL-gated path callers must opt into.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import yaml

from quantcode.config import config
from quantcode.schemas import ContextPack, QuantResearchPacket, StrategySpec

_RUN_RE = re.compile(r"run_(\d+)")


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "strategy"


class WorkspaceManager:
    def __init__(self, root: str | Path | None = None) -> None:
        # ponytail: honor a live QC_WORKSPACE override (config is frozen at import; this
        # lets tests/`-m` runs and per-invocation overrides redirect without a reload).
        self.root = Path(root or os.getenv("QC_WORKSPACE") or config.workspace_dir)
        self.strategies = self.root / "strategies"
        self.research_runs = self.root / "research_runs"
        self.reports = self.root / "reports"
        self.memory = self.root / "memory"
        self.paper = self.root / "paper"

    # --- setup ---------------------------------------------------------------
    def ensure_dirs(self) -> None:
        for d in (self.strategies, self.research_runs, self.reports, self.memory, self.paper):
            d.mkdir(parents=True, exist_ok=True)

    # --- run numbering -------------------------------------------------------
    def next_run_id(self) -> str:
        nums = [
            int(m.group(1))
            for p in self.research_runs.glob("run_*.json")
            if (m := _RUN_RE.fullmatch(p.stem))
        ]
        return f"run_{(max(nums) + 1) if nums else 1:03d}"

    def latest_run_id(self) -> str | None:
        runs = [p for p in self.research_runs.glob("run_*.json") if _RUN_RE.fullmatch(p.stem)]
        return max(runs, key=lambda p: p.stat().st_mtime).stem if runs else None

    # --- writes (all atomic: temp file + os.replace) -------------------------
    def write_strategy_yaml(self, spec: StrategySpec, *, overwrite: bool = False) -> Path:
        path = self.strategies / f"{_slug(spec.strategy_name)}.yaml"
        path = path if overwrite else self._versioned(path)
        self._atomic_write(path, yaml.safe_dump(spec.model_dump(mode="json"), sort_keys=False))
        return path

    def write_run_json(self, packet: QuantResearchPacket, *, overwrite: bool = False) -> Path:
        path = self.research_runs / f"{packet.run_id}.json"
        path = path if overwrite else self._versioned(path)
        self._atomic_write(path, packet.model_dump_json(indent=2))
        return path

    def write_markdown_report(
        self, run_id: str, markdown: str, *, overwrite: bool = False
    ) -> Path:
        path = self.reports / f"{run_id}.md"
        path = path if overwrite else self._versioned(path)
        self._atomic_write(path, markdown)
        return path

    def write_context_pack(self, pack: ContextPack, *, overwrite: bool = False) -> Path:
        # ponytail: ':' is valid in Redis keys but ugly/Windows-hostile as a filename.
        path = self.memory / f"{pack.pack_id.replace(':', '_')}.json"
        path = path if overwrite else self._versioned(path)
        self._atomic_write(path, pack.model_dump_json(indent=2))
        return path

    def write_paper_state(self, name: str, state: dict[str, Any]) -> Path:
        path = self.paper / f"{_slug(name)}.json"
        self._atomic_write(path, json.dumps(state, indent=2, sort_keys=True))
        return path

    # --- reads ---------------------------------------------------------------
    def read_existing_strategies(self) -> list[StrategySpec]:
        return [
            StrategySpec.model_validate(yaml.safe_load(p.read_text(encoding="utf-8")))
            for p in sorted(self.strategies.glob("*.yaml"))
        ]

    def read_paper_state(self, name: str) -> dict[str, Any] | None:
        path = self.paper / f"{_slug(name)}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def list_workspace(self) -> dict[str, list[str]]:
        return {
            "strategies": [p.name for p in sorted(self.strategies.glob("*.yaml"))],
            "research_runs": [p.name for p in sorted(self.research_runs.glob("*.json"))],
            "reports": [p.name for p in sorted(self.reports.glob("*.md"))],
            "memory": [p.name for p in sorted(self.memory.glob("*.json"))],
            "paper": [p.name for p in sorted(self.paper.glob("*.json"))],
        }

    # --- internals -----------------------------------------------------------
    @staticmethod
    def _atomic_write(path: Path, data: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(data, encoding="utf-8")
        os.replace(tmp, path)

    @staticmethod
    def _versioned(path: Path) -> Path:
        if not path.exists():
            return path
        n = 2
        while (cand := path.with_name(f"{path.stem}_v{n}{path.suffix}")).exists():
            n += 1
        return cand
