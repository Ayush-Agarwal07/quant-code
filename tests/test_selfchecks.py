"""Run every module's `python -m quantcode.<mod>` self-check under pytest.

Each new module ships an assert-based self-check (the project's "one runnable check" per
unit). Rather than duplicate them, this drives each in isolation (temp workspace + the
no-server in-memory backend) so `pytest` is one green entry point over the real package.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

import pytest

MODULES = [
    "config",
    "schemas",
    "llm",
    "workspace",
    "agents",
    "tools",
    "compaction",
    "browser",
    "memory",
    "pipeline",
    "cli",
]


@pytest.mark.parametrize("mod", MODULES)
def test_module_selfcheck(mod: str) -> None:
    env = {
        **os.environ,
        "QC_MEMORY_BACKEND": "memory",  # no Redis server needed
        "QC_WORKSPACE": tempfile.mkdtemp(),  # isolate artifacts per module
    }
    result = subprocess.run(
        [sys.executable, "-m", f"quantcode.{mod}"],
        capture_output=True,
        text=True,
        env=env,
        timeout=300,  # fastembed's first model load can be slow
    )
    assert result.returncode == 0, f"{mod} self-check failed:\n{result.stdout}\n{result.stderr}"
