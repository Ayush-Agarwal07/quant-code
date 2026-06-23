"""Agent 2 — PriorArtDiscoveryAgent: web → PriorArtThemes.

Search path (arXiv + Google News) → URLs → optional live fetch + extract.
Falls back to arXiv metadata-only themes when live fetch is off (QC_BROWSER_FETCH),
and to an offline catalog if the network is unavailable entirely.
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.browser import BrowserResearcherAgent
from quantcode.dashboard import sources
from quantcode.schemas import PriorArtTheme, ResearchAgenda

_FALLBACK: list[dict[str, object]] = [
    {
        "theme": "momentum_continuation",
        "summary": "Recent winners keep outperforming as information diffuses gradually.",
        "mechanism_type": "behavioral_underreaction",
        "required_data": ["OHLCV"],
        "known_risks": ["momentum crashes", "crowding"],
        "source_type": "offline_catalog",
        "confidence": 0.75,
        "source_url": None,
    },
    {
        "theme": "post_earnings_drift",
        "summary": "Prices drift toward an earnings surprise for weeks after the report.",
        "mechanism_type": "behavioral_underreaction",
        "required_data": ["OHLCV", "earnings_surprise"],
        "known_risks": ["timestamp/leakage on earnings dates", "thin coverage"],
        "source_type": "offline_catalog",
        "confidence": 0.7,
        "source_url": None,
    },
    {
        "theme": "volume_confirmed_continuation",
        "summary": "Moves on abnormally high volume underreact more strongly.",
        "mechanism_type": "behavioral_underreaction",
        "required_data": ["OHLCV", "volume"],
        "known_risks": ["volume regime shifts"],
        "source_type": "offline_catalog",
        "confidence": 0.6,
        "source_url": None,
    },
]


def _metadata_theme(p: dict) -> PriorArtTheme:
    """arXiv/news metadata → PriorArtTheme without a live fetch."""
    title = p.get("title") or ""
    summary = p.get("summary") or title
    return PriorArtTheme(
        theme=title[:120],
        summary=summary[:300],
        mechanism_type="unclassified",
        required_data=["unspecified — derive in DataFeasibilityAgent"],
        known_risks=["unverified — confirm before relying on it"],
        source_type=p.get("type", "web").lower() + "_metadata",
        confidence=0.45,
        source_url=p.get("url"),
    )


class PriorArtDiscoveryAgent(Agent):
    def run(self, agenda: ResearchAgenda) -> list[PriorArtTheme]:
        query = f"{agenda.research_objective} {agenda.research_domain}"

        # 1. Search: arXiv papers + Google News headlines → list of {url, title, summary, ...}
        papers = sources.arxiv_papers(query, limit=4)
        news = sources.google_news(query, limit=2)
        hits = papers + news

        if not hits:
            return [PriorArtTheme(**f) for f in _FALLBACK]  # type: ignore[arg-type]

        # 2. Fetch: optionally fetch each URL → richer extracted PriorArtTheme.
        #    Off by default (QC_BROWSER_FETCH); falls back to a metadata-only theme when
        #    off or when the URL has no content worth extracting.
        browser = BrowserResearcherAgent()
        themes: list[PriorArtTheme] = []
        for hit in hits:
            url = hit.get("url")
            if url:
                fetched = browser.fetch_and_extract(url)  # [] unless QC_BROWSER_FETCH=1
                if fetched:
                    themes.extend(fetched)
                    continue
            themes.append(_metadata_theme(hit))

        return themes
