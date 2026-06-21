"""Real LLM providers. The two ported ones are stdlib-only (urllib); Anthropic uses
the optional `anthropic` SDK (lazy import). 🧑‍⚖️ HITL: the FIRST real (non-mock) call is
gated — the router only returns these when QC_LLM_PROVIDER is explicitly set away from mock.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ValidationError

from quantcode.llm.base import LLMError


def _log_usage(provider: str, model: str | None, schema: str, usage: dict[str, Any]) -> None:
    path = os.getenv("QC_LLM_USAGE_LOG")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "ts": time.time(),
                    "provider": provider,
                    "model": model,
                    "schema": schema,
                    "usage": usage,
                },
                sort_keys=True,
            )
            + "\n"
        )


def _send_context(context: dict[str, Any] | None) -> str:
    """Serialize context for a real provider, dropping the reserved `mock` fixture key
    (that key is for MockLLMClient only — never send the canned answer to a real model)."""
    return json.dumps({k: v for k, v in (context or {}).items() if k != "mock"})


def _to_strict_schema(node: Any) -> Any:
    """Make a Pydantic JSON schema satisfy OpenAI strict structured-output rules: every object
    sets additionalProperties:false and lists ALL properties as required (OpenAI ignores Python
    defaults, so optional fields must still appear). `default` is stripped — strict mode rejects
    it. Schemas using unsupported keywords (e.g. minItems from list min_length) may still fail."""
    if isinstance(node, dict):
        if node.get("type") == "array" and "prefixItems" in node and "items" not in node:
            items = node.get("prefixItems") or [{"type": "string"}]
            node = {k: v for k, v in node.items() if k != "prefixItems"}
            node["items"] = (
                items[0] if all(item == items[0] for item in items) else {"anyOf": items}
            )
        if (
            node.get("type") == "object"
            and "properties" not in node
            and "additionalProperties" in node
        ):
            value_schema = node["additionalProperties"]
            if not isinstance(value_schema, dict):
                value_schema = {"type": "string"}
            value_schema = _to_strict_schema(value_schema)
            out = {
                "type": "object",
                "properties": {"value": value_schema},
                "required": ["value"],
                "additionalProperties": False,
            }
            if node.get("title"):
                out["title"] = node["title"]
            return out
        out = {k: _to_strict_schema(v) for k, v in node.items() if k != "default"}
        if out.get("type") == "object":
            # ponytail: OpenAI strict schemas reject free-form dicts. These metadata dicts can
            # be empty for live smoke; schema validation still catches core artifact shape.
            out["additionalProperties"] = False
            properties = out.get("properties")
            if isinstance(properties, dict):
                out["required"] = list(properties.keys())
        return out
    if isinstance(node, list):
        return [_to_strict_schema(v) for v in node]
    return node


def _repair_strategy_spec_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    rule = data.get("ranking_rule")
    if not isinstance(rule, dict):
        return data
    top_n = rule.get("top_n")
    bottom_n = rule.get("bottom_n")
    if top_n is None or bottom_n is None:
        return data

    repaired = dict(data)
    repaired_rule = dict(rule)
    order = str(repaired_rule.get("order") or "").lower()
    # Long-only consumers interpret the ranking side through order, so keep one count only.
    if order == "ascending":
        repaired_rule["top_n"] = None
    else:
        repaired_rule["bottom_n"] = None
    repaired["ranking_rule"] = repaired_rule
    return repaired


def _validate_with_repairs(schema: type[BaseModel], raw: str) -> BaseModel:
    try:
        return schema.model_validate_json(raw)
    except ValidationError as exc:
        if schema.__name__ != "StrategySpec":
            raise
        data = _repair_strategy_spec_payload(json.loads(raw))
        if data == json.loads(raw):
            raise exc
        return schema.model_validate(data)


class OpenAICompatibleClient:
    """OpenAI-compatible chat completions with JSON-schema structured output (ported)."""

    provider_name = "openai_compatible"

    def __init__(self, *, base_url: str, api_key: str | None, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.last_usage: dict[str, Any] = {}

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
                    "schema": _to_strict_schema(schema.model_json_schema()),
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
            self.last_usage = payload.get("usage") or {}
            _log_usage(self.provider_name, self.model, schema.__name__, self.last_usage)
            return _validate_with_repairs(schema, payload["choices"][0]["message"]["content"])
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise LLMError(
                f"openai_compatible structured generation failed: HTTP {exc.code}: {detail}"
            ) from exc
        except (URLError, KeyError, TypeError, ValueError) as exc:
            raise LLMError(f"openai_compatible structured generation failed: {exc}") from exc


class OllamaClient:
    """Local Ollama chat with schema-constrained output (ported)."""

    provider_name = "ollama"

    def __init__(self, *, base_url: str, model: str | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.last_usage: dict[str, Any] = {}

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
            self.last_usage = {
                k: payload[k]
                for k in ("prompt_eval_count", "eval_count", "total_duration")
                if k in payload
            }
            _log_usage(self.provider_name, self.model, schema.__name__, self.last_usage)
            return _validate_with_repairs(schema, payload["message"]["content"])
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
        self.last_usage: dict[str, Any] = {}

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
            usage = getattr(msg, "usage", None)
            self.last_usage = {
                "input_tokens": getattr(usage, "input_tokens", None),
                "output_tokens": getattr(usage, "output_tokens", None),
            }
            _log_usage(self.provider_name, self.model, schema.__name__, self.last_usage)
            for block in msg.content:
                if getattr(block, "type", None) == "tool_use":
                    try:
                        return schema.model_validate(block.input)
                    except ValidationError as exc:
                        if schema.__name__ != "StrategySpec":
                            raise exc
                        return schema.model_validate(_repair_strategy_spec_payload(block.input))
            raise LLMError("anthropic returned no tool_use block")
        except Exception as exc:  # noqa: BLE001 — surface any SDK/validation failure as LLMError
            raise LLMError(f"anthropic structured generation failed: {exc}") from exc
