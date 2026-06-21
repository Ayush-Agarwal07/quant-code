"""Offline self-check: `.venv/bin/python -m quantcode.browser`.

Asserts the deterministic extraction path works and the live path stays HITL-gated —
WITHOUT importing browserbase/playwright (proves the offline path is dependency-free).
Runs fully offline.
"""

from __future__ import annotations

import sys

from quantcode.browser import BrowserResearcherAgent
from quantcode.schemas import PriorArtTheme

# Small embedded fixture — a plausible prior-art page about a momentum effect.
_FIXTURE_HTML = """
<html>
  <head><title>Cross-Sectional Momentum in Equities</title></head>
  <body>
    <h1>Momentum: Winners Keep Winning</h1>
    <script>var ignore = "not text";</script>
    <p>Stocks with strong trailing returns tend to continue outperforming over the
       next few months, a continuation effect documented across markets.</p>
    <p>The edge is often attributed to gradual information diffusion, but it suffers
       sharp momentum crashes during regime shifts and can decay as the trade crowds.</p>
    <li>Transaction costs and turnover can erode the premium.</li>
  </body>
</html>
"""

_FIXTURE_URL = "https://example.com/momentum"


def main() -> int:
    agent = BrowserResearcherAgent()

    # 1. Deterministic extraction returns ≥1 fully-populated PriorArtTheme.
    themes = agent.extract_from_html(_FIXTURE_HTML, _FIXTURE_URL)
    assert themes, "extract_from_html must return at least one PriorArtTheme"
    theme = themes[0]
    assert isinstance(theme, PriorArtTheme)
    assert theme.source_url == _FIXTURE_URL, "source_url must be set to the input url"
    assert theme.source_type == "browserbase_url"
    assert theme.theme and theme.summary and theme.mechanism_type
    assert theme.required_data and theme.known_risks
    assert 0.0 <= theme.confidence <= 1.0
    assert theme.mechanism_type == "momentum", "fixture should classify as momentum"

    # 2. Live path is HITL-gated: confirm=False raises and does NOT import browserbase.
    try:
        agent.run_url(_FIXTURE_URL, confirm=False)
    except PermissionError as exc:
        assert "confirm=True" in str(exc), "gate message must tell the human how to proceed"
    else:  # pragma: no cover - the gate must fire
        raise AssertionError("run_url(confirm=False) must raise the HITL gate error")

    assert "browserbase" not in sys.modules, "offline self-check must NOT import browserbase"
    assert "playwright" not in sys.modules, "offline self-check must NOT import playwright"

    print("quantcode.browser self-check OK")
    print(f"  theme         = {theme.theme}")
    print(f"  mechanism     = {theme.mechanism_type}")
    print(f"  source_url    = {theme.source_url}")
    print(f"  known_risks   = {theme.known_risks}")
    print("  run_url(confirm=False) → HITL-gated (no browserbase import)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
