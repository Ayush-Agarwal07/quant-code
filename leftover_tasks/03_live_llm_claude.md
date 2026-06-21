# 03 — Live LLM path (Claude; openai_compatible / ollama optional)

**Status:** PARTIAL (2026-06-21). **Priority:** P0. **Effort:** XS once Anthropic env is set.
**🧑‍⚖️ HITL:** first Claude call spends API credits.

## Why it matters
`demo` runs on the deterministic mock — perfect for stage, but Claude itself still has not
been exercised live. The OpenAI-compatible structured path was verified live on 2026-06-21:
`gpt-4o-mini`, `PriorArtTheme`, 442 total tokens, schema-valid result.

## Current state
- `quantcode/llm/`: router defaults to `mock`; real providers live behind `QC_LLM_PROVIDER`.
- `python -m quantcode.llm --live-smoke --provider <provider> --confirm` runs one cheap,
  schema-valid real call and prints provider/model/usage/result.
- Anthropic could not run locally: `ANTHROPIC_API_KEY` and `QC_LLM_MODEL` were unset.
- Agents call `llm.generate_structured(prompt, Schema, {"mock": fixture, ...})`; real
  providers strip the reserved `mock` key (`_send_context`).

## Steps
1. Install the optional dep if needed: `.venv/bin/python -m pip install -e ".[llm]"`.
2. Configure env: `QC_LLM_PROVIDER=anthropic`, `QC_LLM_MODEL=<current Claude model id>`,
   `ANTHROPIC_API_KEY=…`.
3. Smoke-test one cheap structured call:
   `python -m quantcode.llm --live-smoke --provider anthropic --confirm`.
4. Then a full real run: `quantcode research "Find short-horizon underreaction strategies"`
   (mock fixtures are ignored on the real path).

## Risks (live-only)
- Model id correctness + rate limits + token cost; a full pipeline = ~9+ calls per run.
- Tool-use block parsing in `AnthropicClient` is still untested against the real API.
- Real-LLM outputs must still validate against the frozen schemas (forced tool-use helps).

## Acceptance
A schema-valid artifact returns from a real Claude call; ideally a full `quantcode research`
run completes on `provider=anthropic`. Note observed token usage/cost.

## Refs
`quantcode/llm/providers.py`, `quantcode/llm/__init__.py`, `.env.example`, `DECISIONS.md` D1.
