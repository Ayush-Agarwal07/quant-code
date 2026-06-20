"""Minimal optional client for OpenAI-compatible structured-output APIs."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from quant_forge.core.exceptions import ModelProviderError


class OpenAICompatibleClient:
    """Call an OpenAI-compatible chat completions endpoint when configured."""

    def __init__(self, *, base_url: str, api_key: str | None, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        if not self.api_key or not self.model:
            raise ModelProviderError(
                "OpenAI-compatible provider requires AAL_OPENAI_API_KEY and AAL_OPENAI_MODEL"
            )
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(context or {})},
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
            content = payload["choices"][0]["message"]["content"]
            return schema.model_validate_json(content)
        except (URLError, KeyError, TypeError, ValueError) as exc:
            raise ModelProviderError(
                f"OpenAI-compatible structured generation failed: {exc}"
            ) from exc
