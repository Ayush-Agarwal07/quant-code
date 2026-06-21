"""Real LLM providers. The two ported ones are stdlib-only (urllib); Anthropic uses
the optional `anthropic` SDK (lazy import). 🧑‍⚖️ HITL: the FIRST real (non-mock) call is
gated — the router only returns these when QC_LLM_PROVIDER is explicitly set away from mock.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from quantcode.llm.base import LLMError


def _send_context(context: dict[str, Any] | None) -> str:
    """Serialize context for a real provider, dropping the reserved `mock` fixture key
    (that key is for MockLLMClient only — never send the canned answer to a real model)."""
    return json.dumps({k: v for k, v in (context or {}).items() if k != "mock"})


class OpenAICompatibleClient:
    """OpenAI-compatible chat completions with JSON-schema structured output (ported)."""

    provider_name = "openai_compatible"

    def __init__(self, *, base_url: str, api_key: str | None, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def generate_structured(
        self, prompt: str, schema: type[BaseModel], context: dict[str, Any] | None = None
    ) -> BaseModel:
        if not self.api_key or not self.model:
            raise LLMError("openai_compatible requires QC_OPENAI_API_KEY and QC_OPENAI_MODEL")
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": _send_context(context)},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": True,
                    "schema": schema.model_json_schema(),
                },
            },
        }
        request = Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
            return schema.model_validate_json(payload["choices"][0]["message"]["content"])
        except (URLError, KeyError, TypeError, ValueError) as exc:
            raise LLMError(f"openai_compatible structured generation failed: {exc}") from exc


class OllamaClient:
    """Local Ollama chat with schema-constrained output (ported)."""

    provider_name = "ollama"

    def __init__(self, *, base_url: str, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate_structured(
        self, prompt: str, schema: type[BaseModel], context: dict[str, Any] | None = None
    ) -> BaseModel:
        if not self.model:
            raise LLMError("ollama requires QC_OLLAMA_MODEL")
        body = {
            "model": self.model,
            "stream": False,
            "format": schema.model_json_schema(),
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": _send_context(context)},
            ],
        }
        request = Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
            return schema.model_validate_json(payload["message"]["content"])
        except (URLError, KeyError, TypeError, ValueError) as exc:
            raise LLMError(f"ollama structured generation failed: {exc}") from exc


class AnthropicClient:
    """Claude via the official SDK, structured output via forced tool-use (D1, NEW).

    Optional dep: `pip install -e '.[llm]'`. 🧑‍⚖️ HITL: first real call must be human-confirmed.
    """

    provider_name = "anthropic"

    def __init__(self, *, api_key: str | None, model: str | None) -> None:
        self.api_key = api_key
        self.model = model

    def generate_structured(
        self, prompt: str, schema: type[BaseModel], context: dict[str, Any] | None = None
    ) -> BaseModel:
        if not self.api_key or not self.model:
            raise LLMError("anthropic requires ANTHROPIC_API_KEY and QC_LLM_MODEL")
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise LLMError("anthropic SDK missing; install with `pip install -e '.[llm]'`") from exc

        client = anthropic.Anthropic(api_key=self.api_key)
        tool = {
            "name": schema.__name__,
            "description": f"Emit one valid {schema.__name__}.",
            "input_schema": schema.model_json_schema(),
        }
        try:
            msg = client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=prompt,
                messages=[{"role": "user", "content": _send_context(context)}],
                tools=[tool],
                tool_choice={"type": "tool", "name": schema.__name__},
            )
            for block in msg.content:
                if getattr(block, "type", None) == "tool_use":
                    return schema.model_validate(block.input)
            raise LLMError("anthropic returned no tool_use block")
        except Exception as exc:  # noqa: BLE001 — surface any SDK/validation failure as LLMError
            raise LLMError(f"anthropic structured generation failed: {exc}") from exc
