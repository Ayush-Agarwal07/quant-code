"""Browserbase-powered `research-url` path: URL → PriorArtTheme.

Exports `BrowserResearcherAgent`. The live fetch is HITL-gated and lazy-imports the
Browserbase SDK + Playwright; the deterministic offline extraction needs neither.
"""

from __future__ import annotations

from quantcode.browser.agent import BrowserResearcherAgent

__all__ = ["BrowserResearcherAgent"]
