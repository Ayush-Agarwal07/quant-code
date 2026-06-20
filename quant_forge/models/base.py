"""Base model client protocol."""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel


class LLMClient(Protocol):
    """Interface used by agents that need structured model output."""

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        """Generate and validate one structured artifact."""
        ...
