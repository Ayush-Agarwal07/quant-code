"""Tier 1 — Working Trace. Append-only, TTL'd raw run events (ephemeral).

`qc:run:{run_id}:trace` is a Redis list; TTL=config.tier1_ttl_seconds is set on first
write. Store refs/ids to large artifacts (they live in `workspace/`), not copies.
"""

from __future__ import annotations

from quantcode.config import config
from quantcode.memory.client import MemoryClient
from quantcode.schemas import TraceEvent


class WorkingMemory:
    def __init__(self, mem: MemoryClient) -> None:
        self._mem = mem

    def append(self, event: TraceEvent) -> None:
        key = self._mem.trace_key(event.run_id)
        self._mem.backend.rpush_ttl(key, event.model_dump_json(), config.tier1_ttl_seconds)

    def read_trace(self, run_id: str) -> list[TraceEvent]:
        key = self._mem.trace_key(run_id)
        return [TraceEvent.model_validate_json(v) for v in self._mem.backend.lrange(key)]
