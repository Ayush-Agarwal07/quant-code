"""Identifier helpers for future persistent artifacts."""

from __future__ import annotations

from uuid import uuid4


def new_artifact_id(prefix: str) -> str:
    """Return a readable unique identifier."""

    normalized = prefix.strip().lower().replace(" ", "_")
    return f"{normalized}_{uuid4().hex}"
