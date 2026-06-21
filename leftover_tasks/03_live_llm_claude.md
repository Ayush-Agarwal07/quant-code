# 03 — Live LLM path (OpenAI from `.env`; Claude / ollama optional)

**Status:** DONE (2026-06-21). **Priority:** P0. **Effort:** XS.
**🧑‍⚖️ HITL:** OpenAI live smoke spent API credits; full pipeline live run remains optional.

## Why it matters
`demo` runs on the deterministic mock — perfect for stage, but the real LLM path needed
one current live smoke. Use the existing OpenAI config in `.env`:
`QC_LLM_PROVIDER=openai`, `QC_OPENAI_API_KEY=<set in .env>`, `QC_OPENAI_MODEL=gpt-4o-mini`.
The OpenAI-compatible structured path was verified live on 2026-06-21: `gpt-4o-mini`,
`PriorArtTheme`, 442 total tokens, schema-valid result.

## Current state
- `quantcode/llm/`: router defaults to `mock`; real providers live behind `QC_LLM_PROVIDER`.
- `python -m quantcode.llm --live-smoke --provider <provider> --confirm` runs one cheap,
  schema-valid real call and prints provider/model/usage/result.
- `.env` currently has the OpenAI live path configured; do not copy the API key into docs.
- Anthropic remains optional: `ANTHROPIC_API_KEY` and `QC_LLM_MODEL` were unset locally.
- Agents call `llm.generate_structured(prompt, Schema, {"mock": fixture, ...})`; real
  providers strip the reserved `mock` key (`_send_context`).

## Done
1. Confirm `.env` contains `QC_LLM_PROVIDER=openai`, `QC_OPENAI_API_KEY`, and
   `QC_OPENAI_MODEL`.
2. No optional SDK is needed for OpenAI-compatible mode; it uses stdlib `urllib`.
3. Smoke-tested one cheap structured call:
   `.venv/bin/python -m quantcode.llm --live-smoke --provider openai --confirm`.
4. Deferred full real run: `quantcode research "Find short-horizon underreaction strategies"`
   costs ~9+ calls and is no longer part of this smoke-test task.

## Risks (live-only)
- Model id correctness + rate limits + token cost; a full pipeline = ~9+ calls per run.
- OpenAI strict JSON-schema compatibility can fail if a schema uses unsupported keywords.
- Tool-use block parsing in `AnthropicClient` is still untested against the real API.
- Real-LLM outputs must still validate against the frozen schemas (forced tool-use helps).

## Acceptance
A schema-valid `PriorArtTheme` returned from the current OpenAI key in `.env`. Observed:
`gpt-4o-mini`, 442 total tokens, schema-valid result.

## Refs
`quantcode/llm/providers.py`, `quantcode/llm/__init__.py`, `.env.example`, `DECISIONS.md` D1.
