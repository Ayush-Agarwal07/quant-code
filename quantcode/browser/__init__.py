"""The `research-url` path: URL → PriorArtTheme.

Exports `BrowserResearcherAgent`. The live fetch is HITL-gated and uses a stdlib HTTP
GET by default (optional local Playwright for JS pages); the deterministic offline
extraction needs neither.
"""

from __future__ import annotations

from quantcode.browser.agent import BrowserResearcherAgent

__all__ = ["BrowserResearcherAgent"]
