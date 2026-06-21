"""LLM client factory (ported ModelRouter — D1).

`demo` default is mock (deterministic, offline). Real providers are returned only when
QC_LLM_PROVIDER is set away from "mock" — that env switch IS the HITL gate on the first
real call (config defaults leave provider unset → mock).
"""

from __future__ import annotations

import os

from quantcode.config import config
from quantcode.llm.base import LLMClient, LLMError
from quantcode.llm.mock import MockLLMClient
from quantcode.llm.providers import AnthropicClient, OllamaClient, OpenAICompatibleClient

__all__ = ["LLMClient", "LLMError", "get_client"]


def get_client(provider: str | None = None) -> LLMClient:
    """Build the configured LLM client. Defaults to mock when nothing is set."""
    name = (provider or config.llm_provider or "mock").strip().lower()
    if name == "mock":
        return MockLLMClient()
    if name == "anthropic":
        return AnthropicClient(api_key=os.getenv("ANTHROPIC_API_KEY"), model=config.llm_model)
    if name in ("openai", "openai_compatible"):
        return OpenAICompatibleClient(
            base_url=os.getenv("QC_OPENAI_BASE_URL", "https://api.openai.com/v1"),
            api_key=os.getenv("QC_OPENAI_API_KEY"),
            model=os.getenv("QC_OPENAI_MODEL") or config.llm_model,
        )
    if name == "ollama":
        return OllamaClient(
            base_url=os.getenv("QC_OLLAMA_BASE_URL", "http://localhost:11434"),
            model=os.getenv("QC_OLLAMA_MODEL") or config.llm_model,
        )
    raise LLMError(f"unknown provider {name!r}; choose mock|anthropic|openai_compatible|ollama")
