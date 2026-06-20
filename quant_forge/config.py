"""Environment-backed configuration for optional model providers."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    """Runtime settings with mock-safe defaults."""

    model_provider: str = "mock"
    log_level: str = "INFO"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str | None = None
    openai_model: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        load_dotenv()
        return cls(
            model_provider=os.getenv("AAL_MODEL_PROVIDER", "mock"),
            log_level=os.getenv("AAL_LOG_LEVEL", "INFO"),
            openai_base_url=os.getenv("AAL_OPENAI_BASE_URL", "https://api.openai.com/v1"),
            openai_api_key=os.getenv("AAL_OPENAI_API_KEY"),
            openai_model=os.getenv("AAL_OPENAI_MODEL"),
            ollama_base_url=os.getenv("AAL_OLLAMA_BASE_URL", "http://localhost:11434"),
            ollama_model=os.getenv("AAL_OLLAMA_MODEL"),
        )
