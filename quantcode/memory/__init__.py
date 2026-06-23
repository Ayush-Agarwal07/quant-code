"""QuantCode memory substrate — three tiers over one shared client + key schema.

Defaults to a local SQLite file (persistent, no server). `QC_MEMORY_BACKEND=memory` uses
an in-process store; `=redis` uses Redis + RediSearch (opt-in).

    from quantcode.memory import Memory
    mem = Memory.connect()          # sqlite by default; memory/redis via QC_MEMORY_BACKEND
    mem.working.append(event)       # Tier 1 (TTL'd trace)
    mem.episodic.write_episode(ep)  # Tier 2 (durable per-run record)
    mem.semantic.write_lesson(l)    # Tier 3 (vector-searchable lessons)
    mem.semantic.search(q, k=5)     # KNN retrieval
    mem.curator.curate(cands, run)  # validate + Tier 2 write + HITL-gated Tier 3 promote
"""

from __future__ import annotations

from quantcode.memory.client import MemoryClient
from quantcode.memory.curator import CurationResult, MemoryCurator
from quantcode.memory.tier1_working import WorkingMemory
from quantcode.memory.tier2_episodic import EpisodicMemory
from quantcode.memory.tier3_semantic import SemanticMemory

__all__ = [
    "CurationResult",
    "EpisodicMemory",
    "Memory",
    "MemoryCurator",
    "MemoryClient",
    "SemanticMemory",
    "WorkingMemory",
]


class Memory:
    """Top-level handle wiring the shared `MemoryClient` to the three tiers + curator."""

    def __init__(self, mem: MemoryClient) -> None:
        self.client = mem
        self.working = WorkingMemory(mem)
        self.episodic = EpisodicMemory(mem)
        self.semantic = SemanticMemory(mem)
        self.curator = MemoryCurator(mem)

    @property
    def backend_name(self) -> str:
        return self.client.backend_name

    @classmethod
    def connect(cls) -> Memory:
        return cls(MemoryClient.connect())
