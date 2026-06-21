"""Runnable self-check: `python -m quantcode.llm`.

Default is mock-only (no network). Use `--live-smoke --confirm` for one real structured call.
"""

from __future__ import annotations

import argparse
import json

from quantcode.llm import get_client
from quantcode.llm.base import LLMError
from quantcode.schemas import PriorArtTheme


SMOKE_PROMPT = (
    "Return exactly one schema-valid PriorArtTheme for a quant research system. "
    "Use conservative, well-known prior art. Do not invent citations or URLs."
)
SMOKE_CONTEXT = {
    "objective": "Find short-horizon underreaction strategies in liquid equities.",
    "constraints": {
        "horizon": "1-5 trading days",
        "allowed_data": ["OHLCV", "earnings calendar", "news timestamp metadata"],
    },
}


def _mock_selfcheck() -> None:
    client = get_client("mock")  # explicit so .env cannot turn the offline check live
    assert client.provider_name == "mock", "offline self-check must use mock"

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


def _live_smoke(provider: str | None, confirm: bool) -> None:
    client = get_client(provider)
    if client.provider_name == "mock":
        raise LLMError("live smoke requires a real provider: anthropic|openai_compatible|ollama")
    if not confirm:
        raise LLMError("live smoke spends provider credits; re-run with --confirm")

    out = client.generate_structured(SMOKE_PROMPT, PriorArtTheme, SMOKE_CONTEXT)
    usage = getattr(client, "last_usage", {}) or {}
    print(
        json.dumps(
            {
                "provider": client.provider_name,
                "model": getattr(client, "model", None),
                "schema": PriorArtTheme.__name__,
                "usage": usage,
                "result": out.model_dump(),
            },
            indent=2,
            sort_keys=True,
        )
    )


parser = argparse.ArgumentParser()
parser.add_argument("--live-smoke", action="store_true", help="run one real structured call")
parser.add_argument("--provider", help="override QC_LLM_PROVIDER for --live-smoke")
parser.add_argument("--confirm", action="store_true", help="confirm provider credit spend")
args = parser.parse_args()

if args.live_smoke:
    _live_smoke(args.provider, args.confirm)
else:
    _mock_selfcheck()
