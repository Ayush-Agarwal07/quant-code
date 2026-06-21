"""BrowserResearcherAgent — the `research-url <url>` path (Browserbase track).

Two paths, one schema boundary (URL → PriorArtTheme → normal pipeline, never a raw
hypothesis — see docs/agent_flow.md "Browserbase Path"):

- `extract_from_html` — DETERMINISTIC, offline, stdlib-only (`html.parser`, no bs4).
  This is the demo + self-check path and the body shared with the live path.
- `run_url` — the LIVE Browserbase fetch (Python SDK + Playwright `connect_over_cdp`).
  🧑‍⚖️ HITL-gated: a live fetch spends Browserbase credits and scrapes a real site, so
  it requires BOTH `confirm=True` AND `config.browserbase_api_key`. `browserbase` /
  `playwright` are LAZY-imported inside `run_url` only (not installed by default; never
  imported at module top so the offline path always works).

Decisions taken (browser/README open questions, resolved per the build brief):
- Browserbase product = Python SDK + Playwright (sponsor refs; NOT Stagehand).
- Extraction = deterministic for v1 (a real-LLM enrich can come later via quantcode.llm).
- URL allow-list = each demo URL is human-confirmed through the `confirm` gate (no static
  list); robots/ToS posture is the human's call before any live target.
"""

from __future__ import annotations

from html.parser import HTMLParser

from quantcode.config import config
from quantcode.schemas import PriorArtTheme

SOURCE_TYPE = "browserbase_url"

# ponytail: tiny keyword map is enough to label a mechanism deterministically for v1;
# a real-LLM classifier is the later enrich step, not needed for the schema boundary.
_MECHANISM_KEYWORDS: dict[str, tuple[str, ...]] = {
    "momentum": ("momentum", "trend", "continuation", "winner"),
    "mean_reversion": ("reversion", "reversal", "overreaction", "contrarian"),
    "value": ("value", "valuation", "cheap", "book-to-market", "fundamental"),
    "carry": ("carry", "yield", "roll"),
    "volatility": ("volatility", "vol ", "variance", "vix"),
    "liquidity": ("liquidity", "illiquid", "bid-ask", "spread"),
    "sentiment": ("sentiment", "news", "attention", "underreaction"),
}

_RISK_KEYWORDS: dict[str, tuple[str, ...]] = {
    "regime shifts can erode the edge": ("regime", "crash", "drawdown"),
    "crowding may compress returns": ("crowd", "arbitrage", "decay"),
    "transaction costs may dominate": ("cost", "turnover", "slippage", "spread"),
    "lookahead / data-snooping bias": ("overfit", "snoop", "lookahead", "data mining"),
}


class _TextExtractor(HTMLParser):
    """Stdlib-only DOM-light scraper: collects <title>, headings, and paragraph text.

    No external parser (bs4 et al.) — `html.parser` is enough to pull the structured
    text we map into a PriorArtTheme.
    """

    _BLOCK_TAGS = {"h1", "h2", "h3", "p", "li", "blockquote"}
    # Skip non-content code AND layout chrome (site nav/masthead/footer/sidebars) so the
    # extracted theme/summary is the page's MAIN content, not "subscribe to mailings" links.
    _SKIP_TAGS = {"script", "style", "noscript", "header", "nav", "footer", "aside"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: str = ""
        self.headings: list[str] = []
        self.paragraphs: list[str] = []
        self._current: str | None = None
        self._buf: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag == "title" or tag in self._BLOCK_TAGS:
            self._flush()
            self._current = tag

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if tag == self._current:
            self._flush()

    def handle_data(self, data: str) -> None:
        if self._skip_depth or self._current is None:
            return
        self._buf.append(data)

    def _flush(self) -> None:
        if self._current is None:
            return
        text = " ".join("".join(self._buf).split())
        if text:
            if self._current == "title":
                self.title = text
            elif self._current in ("h1", "h2", "h3"):
                self.headings.append(text)
            else:
                self.paragraphs.append(text)
        self._buf.clear()
        self._current = None


def _classify(text: str, table: dict[str, tuple[str, ...]], default: str) -> str:
    low = text.lower()
    for label, needles in table.items():
        if any(n in low for n in needles):
            return label
    return default


def _collect(text: str, table: dict[str, tuple[str, ...]]) -> list[str]:
    low = text.lower()
    return [label for label, needles in table.items() if any(n in low for n in needles)]


class BrowserResearcherAgent:
    """Turns a web page into prior-art evidence. See module docstring for the two paths."""

    def extract_from_html(self, html: str, url: str) -> list[PriorArtTheme]:
        """Deterministic, offline extraction: page HTML → ≥1 PriorArtTheme.

        Stdlib `html.parser` only. Maps title/headings/paragraphs into a schema-typed
        PriorArtTheme with `source_url=url`. Emits prior-art evidence, never a hypothesis.
        """
        parser = _TextExtractor()
        parser.feed(html)
        parser.close()

        theme = parser.title or (parser.headings[0] if parser.headings else url)
        body = " ".join(parser.paragraphs)
        # ponytail: first ~2 paragraphs are a fine deterministic "summary" for v1.
        summary = " ".join(parser.paragraphs[:2]).strip() or theme
        haystack = " ".join([theme, *parser.headings, body])

        mechanism = _classify(haystack, _MECHANISM_KEYWORDS, default="unclassified")
        risks = _collect(haystack, _RISK_KEYWORDS) or [
            "unverified source — confirm the claim before relying on it"
        ]
        # required_data is left to the feasibility gate downstream; flag it explicitly.
        required_data = ["unspecified — derive in DataFeasibilityAgent"]

        return [
            PriorArtTheme(
                theme=theme,
                summary=summary,
                mechanism_type=mechanism,
                required_data=required_data,
                known_risks=risks,
                source_type=SOURCE_TYPE,
                confidence=0.3,  # scraped + deterministic → deliberately low prior
                source_url=url,
            )
        ]

    def run_url(self, url: str, *, confirm: bool = False) -> list[PriorArtTheme]:
        """LIVE Browserbase fetch of `url` → PriorArtTheme(s) via `extract_from_html`.

        🧑‍⚖️ HITL-gated. Requires BOTH `confirm=True` AND `config.browserbase_api_key`.
        `browserbase` + `playwright` are imported INSIDE this method so the gate and the
        offline path never depend on them.
        """
        if not confirm:
            raise PermissionError(
                "live fetch is HITL-gated; pass confirm=True to spend Browserbase "
                "credits and scrape a real site (confirm robots/ToS first)."
            )
        if not config.browserbase_api_key:
            raise RuntimeError(
                "BROWSERBASE_API_KEY is unset — refusing to run_url. The Browserbase "
                "track requires a real Browserbase session; we do NOT fall back to plain "
                "HTTP (that would void the bounty)."
            )

        html = self._fetch_html(url)
        return self.extract_from_html(html, url)

    def _fetch_html(self, url: str) -> str:
        """Open a Browserbase session and drive it with Playwright over CDP.

        Lazy imports keep `browserbase`/`playwright` out of the module-import path (they're
        the optional `[browser]` extra); mypy treats them as missing-OK via the pyproject
        override, alongside the other optional deps.
        """
        from browserbase import Browserbase
        from playwright.sync_api import sync_playwright

        project_id = config.browserbase_project_id
        if not project_id:
            raise RuntimeError(
                "BROWSERBASE_PROJECT_ID is unset — a Browserbase session needs a project id "
                "(dashboard → Settings → Projects, or resolve it from the API key)."
            )
        bb = Browserbase(api_key=config.browserbase_api_key)
        session = bb.sessions.create(project_id=project_id)
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(session.connect_url)
            try:
                page = browser.contexts[0].pages[0]
                page.goto(url)
                return page.content()
            finally:
                browser.close()
