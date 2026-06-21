"""Model provider selection."""

from __future__ import annotations

from quant_code.config import Settings
from quant_code.core.exceptions import UnsupportedProviderError
from quant_code.models.base import LLMClient
from quant_code.models.mock import MockLLMClient
from quant_code.models.ollama import OllamaClient
from quant_code.models.openai_compatible import OpenAICompatibleClient


class ModelRouter:
    """Construct supported model clients from provider names."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.from_env()

    def get_client(self, provider: str = "mock") -> LLMClient:
        normalized = provider.strip().lower()
        if normalized == "mock":
            return MockLLMClient()
        if normalized == "openai_compatible":
            return OpenAICompatibleClient(
                base_url=self.settings.openai_base_url,
                api_key=self.settings.openai_api_key,
                model=self.settings.openai_model,
            )
        if normalized == "ollama":
            return OllamaClient(
                base_url=self.settings.ollama_base_url,
                model=self.settings.ollama_model,
            )
        raise UnsupportedProviderError(
            f"Unsupported provider '{provider}'. Choose mock, openai_compatible, or ollama."
        )
