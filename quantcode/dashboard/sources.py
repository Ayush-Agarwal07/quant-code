"""Real, keyless external sources for the dashboard's reading/news panels.

stdlib only (urllib + xml.etree) so the package stays dependency-light. Every fetch has a
short timeout and returns [] on ANY failure — the dashboard must never 500 because an
upstream is slow or blocked. These replace LLM-recalled (hallucinated) papers with real
ones that have working links; the LLM, when live, only writes the per-item "why".

ponytail: two GETs and two tiny XML walks. No feedparser/requests — urllib does it.
"""

from __future__ import annotations

import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

_UA = {"User-Agent": "Mozilla/5.0 (quantcode-dashboard; research)"}
_TIMEOUT = 12


def _get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=_UA)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:  # noqa: S310 — fixed https hosts
            return r.read()
    except Exception:  # noqa: BLE001 — any upstream failure → caller degrades to []
        return None


def _clean(text: str | None) -> str:
    return " ".join((text or "").split())


def arxiv_papers(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """Real q-fin papers from the arXiv Atom API. Returns title/source/year/summary/url."""
    if limit <= 0:  # skip the network entirely (offline self-checks, "no papers" requests)
        return []
    q = urllib.parse.quote(f"cat:q-fin* AND all:{query}")
    url = (
        f"http://export.arxiv.org/api/query?search_query={q}"
        f"&start=0&max_results={limit}&sortBy=relevance"
    )
    raw = _get(url)
    if raw is None:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out: list[dict[str, Any]] = []
    for entry in root.findall("a:entry", ns):
        title = _clean(entry.findtext("a:title", default="", namespaces=ns))
        if not title:
            continue
        summary = _clean(entry.findtext("a:summary", default="", namespaces=ns))
        published = entry.findtext("a:published", default="", namespaces=ns)
        link = entry.findtext("a:id", default="", namespaces=ns)  # arxiv abs URL
        out.append(
            {
                "type": "PAPER",
                "title": title,
                "source": "arXiv q-fin",
                "year": published[:4] if published else None,
                "summary": summary[:280],
                "url": link or None,
            }
        )
    return out


def google_news(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """Real recent headlines from Google News RSS (keyless). title/source/url/date."""
    if limit <= 0:  # skip the network entirely (offline self-checks, "no news" requests)
        return []
    q = urllib.parse.quote(f"{query} when:21d")
    url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    raw = _get(url)
    if raw is None:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out: list[dict[str, Any]] = []
    for item in root.findall(".//item")[:limit]:
        title = _clean(item.findtext("title"))
        if not title:
            continue
        source = _clean(item.findtext("source")) or "Google News"
        pub = item.findtext("pubDate") or ""
        # RFC-822 dates: "... 2026 ..." — pull the 4-digit year if present.
        year = next((tok for tok in pub.split() if tok.isdigit() and len(tok) == 4), None)
        out.append(
            {
                "type": "NEWS",
                "title": title,
                "source": source,
                "year": year,
                "summary": "",
                "url": _clean(item.findtext("link")) or None,
            }
        )
    return out
