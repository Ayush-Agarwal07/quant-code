"""Tier 3 — Semantic Lessons + vector search.

Each lesson is stored at `qc:lesson:{lesson_id}` with a 384-d embedding. `search()` runs
KNN: brute-force cosine on the sqlite/in-memory backends, RediSearch server-side on Redis.
Embeddings default to a deterministic hash; install the `[embeddings]` extra for real
semantic vectors (fastembed). Provenance (`source_run_id`) rides along so the UI can show
*why* a warning exists.
"""

from __future__ import annotations

from quantcode.memory._embeddings import embed
from quantcode.memory.client import MemoryClient
from quantcode.schemas import Lesson


class SemanticMemory:
    def __init__(self, mem: MemoryClient) -> None:
        self._mem = mem

    def write_lesson(self, lesson: Lesson) -> Lesson:
        """Embed (if needed) and index. Returns the lesson with its embedding set."""
        if lesson.embedding is None:
            lesson.embedding = embed(lesson.text)
        self._mem.backend.index_lesson(
            self._mem.lesson_key(lesson.lesson_id), lesson.model_dump_json(), lesson.embedding
        )
        return lesson

    def read_lesson(self, lesson_id: str) -> Lesson | None:
        raw = self._mem.backend.get(self._mem.lesson_key(lesson_id))
        return Lesson.model_validate_json(raw) if raw else None

    def search(self, query: str, k: int = 5) -> list[tuple[Lesson, float]]:
        """Top-k lessons by semantic similarity to `query` (cosine, higher = closer)."""
        out: list[tuple[Lesson, float]] = []
        for key, score in self._mem.backend.knn(embed(query), k):
            if (raw := self._mem.backend.get(key)) is not None:
                out.append((Lesson.model_validate_json(raw), score))
        return out
