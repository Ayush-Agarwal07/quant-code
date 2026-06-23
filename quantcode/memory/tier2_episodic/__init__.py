"""Tier 2 — Episodic Memory. One durable record per run (no TTL).

`qc:episode:{run_id}` holds an `EpisodeRecord` JSON — a queryable projection of the run
packet, with retrieval/produced-lesson provenance. Powers the cross-run comparison panel.
"""

from __future__ import annotations

from quantcode.memory.client import MemoryClient
from quantcode.schemas import EpisodeRecord


class EpisodicMemory:
    def __init__(self, mem: MemoryClient) -> None:
        self._mem = mem

    def write_episode(self, episode: EpisodeRecord) -> None:
        self._mem.backend.set_json(self._mem.episode_key(episode.run_id), episode.model_dump_json())

    def read_episode(self, run_id: str) -> EpisodeRecord | None:
        raw = self._mem.backend.get(self._mem.episode_key(run_id))
        return EpisodeRecord.model_validate_json(raw) if raw else None

    def list_episodes(self) -> list[EpisodeRecord]:
        out: list[EpisodeRecord] = []
        for key in self._mem.backend.keys(self._mem.episode_pattern()):
            if (raw := self._mem.backend.get(key)) is not None:
                out.append(EpisodeRecord.model_validate_json(raw))
        return out
