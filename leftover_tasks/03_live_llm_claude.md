# 03 — Live LLM path (Claude; openai_compatible / ollama optional)

**Status:** OPEN. **Priority:** med. **Effort:** L–M. **🧑‍⚖️ HITL:** first real LLM call (cost).

## Why it matters
`demo` runs on the deterministic mock — perfect for stage, but it means no real LLM call has
ever happened. The `AnthropicClient` (structured output via forced tool-use) and the ported
`openai_compatible` / `ollama` clients are implemented but unexercised live.

## Current state
- `quantcode/llm/`: router defaults to `mock`; real providers live behind `QC_LLM_PROVIDER`.
- `anthropic` is declared in the `[llm]` extra but NOT installed.
- Agents call `llm.generate_structured(prompt, Schema, {"mock": fixture, ...})`; real
  providers strip the reserved `mock` key (`_send_context`).

## Steps
1. Install the optional dep: `.venv/bin/python -m pip install -e ".[llm]"`.
2. Configure env: `QC_LLM_PROVIDER=anthropic`, `QC_LLM_MODEL=<current Claude model id>`,
   `ANTHROPIC_API_KEY=…`.
3. Smoke-test one agent first (cheap), e.g. a short script:
   `get_client("anthropic").generate_structured(PROMPT, PriorArtTheme, {...})` → assert it
   returns a schema-valid `PriorArtTheme`.
4. Then a full real run: `quantcode research "Find short-horizon underreaction strategies"`
   (mock fixtures are ignored on the real path).
5. (Optional) openai_compatible: `QC_LLM_PROVIDER=openai_compatible` + `QC_OPENAI_API_KEY` +
   `QC_OPENAI_MODEL`. Ollama: `QC_LLM_PROVIDER=ollama` + local server + `QC_OLLAMA_MODEL`.

## Risks (live-only)
- Tool-use block parsing in `AnthropicClient` is untested against the real API.
- Model id correctness + rate limits + token cost; a full pipeline = ~9+ calls per run.
- Real-LLM outputs must still validate against the frozen schemas (forced tool-use helps).

## Acceptance
At least one agent returns a schema-valid artifact from a real Claude call; ideally a full
`quantcode research` run completes on `provider=anthropic`. Note observed cost.

## Refs
`quantcode/llm/providers.py`, `quantcode/llm/__init__.py`, `.env.example`, `DECISIONS.md` D1.
