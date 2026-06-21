"""Shared lesson-signal policy for compaction candidates and Tier-3 promotion."""

from __future__ import annotations

CRITICAL_LESSON_CONFIDENCE = 0.6
SUPPORTING_LESSON_CONFIDENCE = 0.4
TIER3_MIN_CONFIDENCE = 0.5


def is_tier3_signal(confidence: float) -> bool:
    """Return whether a candidate has enough signal for long-term memory."""
    return confidence >= TIER3_MIN_CONFIDENCE
