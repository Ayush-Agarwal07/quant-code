"""QuantCode memory substrate (★ Redis sponsor track) — three Redis-backed tiers over one
shared client + key schema, with an in-memory fallback so the demo needs no server.

    from quantcode.memory import Memory
    mem = Memory.connect()          # picks redis or in-memory (D2 gates remote/forced)
    mem.working.append(event)       # Tier 1 (TTL'd trace)
    mem.episodic.write_episode(ep)  # Tier 2 (durable per-run record)
    mem.semantic.write_lesson(l)    # Tier 3 (vector-searchable lessons)
    mem.semantic.search(q, k=5)     # KNN retrieval
    mem.curator.curate(cands, run)  # validate + Tier 2 write + HITL-gated Tier 3 promote
"""

from __future__ import annotations

from quantcode.memory.client import RedisMemory
from quantcode.memory.curator import CurationResult, MemoryCurator
from quantcode.memory.tier1_working import WorkingMemory
from quantcode.memory.tier2_episodic import EpisodicMemory
from quantcode.memory.tier3_semantic import SemanticMemory

__all__ = [
    "CurationResult",
    "EpisodicMemory",
    "Memory",
    "MemoryCurator",
    "RedisMemory",
    "SemanticMemory",
    "WorkingMemory",
]


class Memory:
    """Top-level handle wiring the shared `RedisMemory` to the three tiers + curator."""

    def __init__(self, mem: RedisMemory) -> None:
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
        return cls(RedisMemory.connect())
