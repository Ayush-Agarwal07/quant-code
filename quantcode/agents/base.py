"""Tiny shared base for the research agents (D6: prompts live per-agent).

Every agent is PURE: typed input → typed `schemas/` output, via one LLM client.
Agents never touch Redis, files, tools, or the network — `pipeline/` wires them and
`tools/` does the deterministic work. The mock path drives the offline `demo`: each
agent ships a deterministic fixture and passes it under `context["mock"]`.
"""

from __future__ import annotations

from quantcode.llm import LLMClient, get_client


class Agent:
    """Base for all research agents — holds the one dependency they share."""

    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or get_client()
