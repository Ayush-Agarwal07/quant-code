"""MemoryCurator (D6, lives HERE). Validates candidate lessons from compaction, writes
the Tier 2 episode, and promotes to Tier 3 — but Tier-3 promotion is HITL-gated.

🧑‍⚖️ Tier 3 is the agent's long-term belief set: junk here poisons every future run, so
`promote()` does NOT write to Tier 3 unless explicitly approved (`approved=True` or env
`QC_AUTO_PROMOTE=1`); otherwise it returns the candidates as *pending* for human review.
Default = no auto-promotion. The curator never promotes directly from raw traces — it
takes already-extracted candidate `Lesson`s (the compaction step does the extraction).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from quantcode.memory.client import RedisMemory
from quantcode.memory.tier2_episodic import EpisodicMemory
from quantcode.memory.tier3_semantic import SemanticMemory
from quantcode.schemas import EpisodeRecord, Lesson


@dataclass
class CurationResult:
    """Outcome of one curation pass."""

    episode: EpisodeRecord
    promoted: list[Lesson] = field(default_factory=list)  # written to Tier 3
    pending: list[Lesson] = field(default_factory=list)  # awaiting HITL approval
    rejected: list[Lesson] = field(default_factory=list)  # failed validation


class MemoryCurator:
    def __init__(self, mem: RedisMemory) -> None:
        self._mem = mem
        self._tier2 = EpisodicMemory(mem)
        self._tier3 = SemanticMemory(mem)

    @staticmethod
    def _valid(lesson: Lesson, run_id: str) -> bool:
        """ponytail: minimal sanity gate — non-empty text + provenance matches the run.
        (Schema-level shape is already enforced by pydantic on construction.)"""
        return bool(lesson.text.strip()) and lesson.source_run_id == run_id

    def curate(
        self,
        candidates: list[Lesson],
        run_id: str,
        *,
        episode: EpisodeRecord | None = None,
        approved: bool = False,
    ) -> CurationResult:
        """Validate candidates, write the Tier 2 episode, then attempt Tier 3 promotion."""
        valid = [c for c in candidates if self._valid(c, run_id)]
        rejected = [c for c in candidates if c not in valid]

        promote_out = self.promote(valid, approved=approved)

        # ponytail: synthesize a minimal episode if the caller didn't hand one in.
        ep = episode or EpisodeRecord(
            run_id=run_id,
            objective="",
            strategy_names=[],
            critique_summaries=[],
            failed_feasibility=[],
            retrieved_lesson_ids=[],
            produced_lesson_ids=[lesson.lesson_id for lesson in promote_out["promoted"]],
        )
        self._tier2.write_episode(ep)

        return CurationResult(
            episode=ep,
            promoted=promote_out["promoted"],
            pending=promote_out["pending"],
            rejected=rejected,
        )

    def promote(self, lessons: list[Lesson], approved: bool = False) -> dict[str, list[Lesson]]:
        """🧑‍⚖️ HITL-gated Tier-3 write. Unless `approved` (or QC_AUTO_PROMOTE=1), lessons
        are returned as `pending` and NOT written. Returns {'promoted': [...], 'pending': [...]}."""
        auto = os.getenv("QC_AUTO_PROMOTE") == "1"
        if not (approved or auto):
            return {"promoted": [], "pending": list(lessons)}
        promoted = [self._tier3.write_lesson(lesson) for lesson in lessons]
        return {"promoted": promoted, "pending": []}
