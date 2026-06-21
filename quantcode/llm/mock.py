"""Deterministic, offline LLM for `demo` and tests.

D4: agents are rebuilt fresh and each owns its deterministic fixture, so the mock is
generic — an agent passes its canned output under `context["mock"]` and the mock
validates it against the requested schema. One call path for real vs mock; offline.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ValidationError

from quantcode.llm.base import LLMError


class MockLLMClient:
    provider_name = "mock"

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        del prompt
        ctx = context or {}
        fixture = ctx.get("mock", ctx.get("data"))
        if fixture is None:
            raise LLMError(
                f"MockLLMClient needs context['mock'] for {schema.__name__} "
                "(the agent must supply its deterministic fixture in mock mode)"
            )
        try:
            return schema.model_validate(fixture)
        except ValidationError as exc:
            raise LLMError(f"mock fixture invalid for {schema.__name__}: {exc}") from exc
