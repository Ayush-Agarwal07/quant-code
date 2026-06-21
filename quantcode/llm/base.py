"""LLM client protocol + error (ported interface from deprecated/models/base.py — D1)."""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel


class LLMError(RuntimeError):
    """A provider could not produce a valid structured artifact."""


class LLMClient(Protocol):
    """Every agent depends on exactly this. Same shape as the deprecated baseline."""

    provider_name: str

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        """Generate and validate one structured artifact of type `schema`."""
        ...
