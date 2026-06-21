"""Runnable self-check: `python -m quantcode.llm`. Mock-only (no network)."""

from __future__ import annotations

from quantcode.llm import get_client
from quantcode.llm.base import LLMError
from quantcode.schemas import PriorArtTheme

client = get_client()  # no env set -> mock
assert client.provider_name == "mock", "default provider must be mock"

fixture = {
    "theme": "momentum_continuation",
    "summary": "Prices adjust gradually as information diffuses.",
    "mechanism_type": "behavioral_underreaction",
    "required_data": ["OHLCV"],
    "known_risks": ["crowding"],
    "source_type": "mock_catalog",
    "confidence": 0.7,
}
out = client.generate_structured("prompt", PriorArtTheme, {"mock": fixture})
assert isinstance(out, PriorArtTheme) and out.theme == "momentum_continuation"

# mock without a fixture must fail loudly, not invent data
try:
    client.generate_structured("p", PriorArtTheme, {})
except LLMError:
    pass
else:  # pragma: no cover
    raise AssertionError("mock must require a fixture")

# unknown provider must raise
try:
    get_client("nope")
except LLMError:
    pass
else:  # pragma: no cover
    raise AssertionError("unknown provider must raise")

print("llm OK — mock default, providers: mock|anthropic|openai_compatible|ollama")
