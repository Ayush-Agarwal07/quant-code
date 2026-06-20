"""Minimal optional client for local Ollama structured output."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from quant_forge.core.exceptions import ModelProviderError


class OllamaClient:
    """Call a local Ollama chat endpoint when configured."""

    def __init__(self, *, base_url: str, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        if not self.model:
            raise ModelProviderError("Ollama provider requires AAL_OLLAMA_MODEL")
        body = {
            "model": self.model,
            "stream": False,
            "format": schema.model_json_schema(),
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(context or {})},
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
            raise ModelProviderError(f"Ollama structured generation failed: {exc}") from exc
