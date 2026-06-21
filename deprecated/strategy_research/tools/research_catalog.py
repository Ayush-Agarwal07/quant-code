"""Offline catalog of known anomaly research themes."""

from __future__ import annotations

from quant_code.strategy_research.schemas import PriorArtTheme


class KnownAnomalyCatalogTool:
    """Return a small, deterministic prior-art catalog."""

    def list_themes(self) -> list[PriorArtTheme]:
        return [
            PriorArtTheme(
                theme="post_earnings_announcement_drift",
                summary="Prices may continue moving after earnings information is released.",
                mechanism_type="behavioral_underreaction",
                required_data=["earnings_dates", "earnings_surprise", "OHLCV"],
                known_risks=[
                    "event timestamp leakage",
                    "earnings data revisions",
                    "event-day costs",
                ],
                source_type="known_anomaly_catalog",
                confidence=0.78,
            ),
            PriorArtTheme(
                theme="analyst_revision_drift",
                summary="Prices may react gradually to changes in analyst expectations.",
                mechanism_type="information_diffusion",
                required_data=["analyst_revisions", "OHLCV"],
                known_risks=[
                    "vendor timestamp quality",
                    "crowding",
                    "unavailable point-in-time data",
                ],
                source_type="known_anomaly_catalog",
                confidence=0.64,
            ),
            PriorArtTheme(
                theme="momentum_continuation",
                summary=(
                    "Recent relative winners may continue outperforming over intermediate horizons."
                ),
                mechanism_type="behavioral_underreaction",
                required_data=["OHLCV", "derived_price_features"],
                known_risks=["momentum crashes", "turnover", "crowding"],
                source_type="known_anomaly_catalog",
                confidence=0.75,
            ),
            PriorArtTheme(
                theme="short_term_reversal",
                summary="Very short-term price pressure may partially reverse.",
                mechanism_type="liquidity_and_market_structure",
                required_data=["OHLCV", "derived_price_features", "derived_volume_features"],
                known_risks=["bid-ask bounce", "high turnover", "adverse selection"],
                source_type="known_anomaly_catalog",
                confidence=0.67,
            ),
            PriorArtTheme(
                theme="volatility_risk_premium",
                summary="Option-implied volatility may exceed subsequently realized volatility.",
                mechanism_type="risk_premium",
                required_data=["options_implied_volatility", "derived_volatility_features"],
                known_risks=["tail losses", "options costs", "unavailable options data"],
                source_type="known_anomaly_catalog",
                confidence=0.69,
            ),
            PriorArtTheme(
                theme="sector_relative_strength",
                summary="Leaders relative to sector peers may continue outperforming.",
                mechanism_type="information_diffusion",
                required_data=["OHLCV", "sector_labels", "derived_price_features"],
                known_risks=["sector concentration", "regime dependence", "turnover"],
                source_type="known_anomaly_catalog",
                confidence=0.7,
            ),
        ]


class ResearchCorpusSearchStub:
    """Search the offline catalog with deterministic keyword scoring."""

    def __init__(self, catalog: KnownAnomalyCatalogTool | None = None) -> None:
        self.catalog = catalog or KnownAnomalyCatalogTool()

    def search(self, query: str, *, limit: int = 4) -> list[PriorArtTheme]:
        tokens = {
            token.strip(".,:;!?").lower()
            for token in query.replace("-", " ").split()
            if len(token) > 3
        }
        scored: list[tuple[int, PriorArtTheme]] = []
        for index, theme in enumerate(self.catalog.list_themes()):
            text = f"{theme.theme} {theme.summary} {theme.mechanism_type}".replace("_", " ").lower()
            score = sum(token in text for token in tokens)
            if "underreaction" in query.lower() and theme.mechanism_type in {
                "behavioral_underreaction",
                "information_diffusion",
            }:
                score += 3
            scored.append((score * 10 - index, theme))
        return [item for _, item in sorted(scored, key=lambda pair: pair[0], reverse=True)[:limit]]
