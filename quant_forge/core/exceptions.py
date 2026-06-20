"""Framework-specific exceptions."""


class QuantForgeError(Exception):
    """Base exception for the project."""


class AgentExecutionError(QuantForgeError):
    """Raised when an agent cannot produce a valid artifact."""


class ModelProviderError(QuantForgeError):
    """Raised when a model provider is missing configuration or fails."""


class UnsupportedProviderError(ModelProviderError):
    """Raised when the requested model provider is unknown."""
