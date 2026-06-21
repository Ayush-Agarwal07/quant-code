"""Read-only FastAPI over QuantCode artifacts + Redis memory — the dashboard's backend.

Primary source is the workspace run JSONs (self-contained: each packet embeds its context
pack, retrieved/produced lessons, episode, and trace events), so the dashboard works even
without Redis. Redis is used only for the live semantic search box and degrades to [].

NO writes, no agent calls. `fastapi`/`uvicorn` are the optional `[dashboard]` extra; this
module is imported lazily by `quantcode dashboard`, so the package imports fine without them.
"""

from __future__ import annotations

import threading
import uuid
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from quantcode.config import config
from quantcode.dashboard import sources
from quantcode.llm import LLMError, get_client
from quantcode.schemas import (
    DataFeasibilityReport,
    QuantResearchPacket,
    StrategyCritique,
    StrategySpec,
)
from quantcode.workspace import WorkspaceManager

ADVANCING = {"testable_now", "testable_with_proxy"}


# --- Agent chat (Tier 1: one grounded LLM call, no pipeline run, no writes) --------------- #
# The reply shape the Agent tab renders. Real providers generate it; in mock mode the
# MockLLMClient just echoes the deterministic fixture we pass as context["mock"], so this
# endpoint never 500s offline and costs zero tokens until QC_LLM_PROVIDER is set.
class AgentChatReply(BaseModel):
    lead: str
    required_data: list[str]
    feasibility: list[str]
    risks: list[str]
    next_run: str


class ChatRequest(BaseModel):
    message: str
    run_id: str | None = None
    strategy_name: str | None = None


class DraftRequest(BaseModel):
    idea: str
    run_id: str | None = None


def _pick_spec(p: QuantResearchPacket, strategy_name: str | None) -> StrategySpec | None:
    if strategy_name:
        for s in p.strategy_specs:
            if s.strategy_name == strategy_name:
                return s
    return p.strategy_specs[0] if p.strategy_specs else None


def _critique_for(p: QuantResearchPacket, spec: StrategySpec) -> StrategyCritique | None:
    return next((c for c in p.critiques if c.strategy_name == spec.strategy_name), None)


def _feasibility_for(p: QuantResearchPacket, spec: StrategySpec) -> DataFeasibilityReport | None:
    return next(
        (r for r in p.data_feasibility_reports if r.hypothesis_name == spec.source_hypothesis),
        None,
    )


def _chat_fixture(p: QuantResearchPacket, spec: StrategySpec) -> AgentChatReply:
    """Deterministic reply from packet fields — the mock fixture AND the mock-mode answer."""
    crit = _critique_for(p, spec)
    feas = _feasibility_for(p, spec)
    required = list(spec.required_data)
    if feas:
        required += [f"{d} (currently missing)" for d in feas.missing_data]
    feasibility: list[str] = []
    if feas:
        verdict = feas.verdict.value.replace("_", " ")
        feasibility.append(f"Feasibility verdict on record: {verdict}.")
        if feas.missing_data:
            feasibility.append("Missing data: " + ", ".join(feas.missing_data) + ".")
        if feas.proxy_available and feas.proxy_description:
            feasibility.append("A proxy exists: " + feas.proxy_description)
    else:
        feasibility.append(
            "Confirm every input is available now, via an adapter, or via a proxy before proposing."
        )
    risks = (crit.leakage_risks + crit.major_issues + crit.overfitting_risks)[:4] if crit else []
    if not risks:
        risks = list(spec.expected_failure_modes) or [
            "look-ahead / leakage in signal construction",
            "overfitting to a single regime",
            "edge erodes after transaction costs",
        ]
    return AgentChatReply(
        lead=f"Looking at {spec.strategy_name} from run {p.run_id}, here's the grounded next step.",
        required_data=required,
        feasibility=feasibility,
        risks=risks,
        next_run=f'objective: "Re-test {spec.strategy_name} after addressing {risks[0]}" '
        f"· universe: {spec.universe}",
    )


def _chat_prompt(p: QuantResearchPacket, spec: StrategySpec, message: str) -> str:
    crit = _critique_for(p, spec)
    feas = _feasibility_for(p, spec)
    return (
        "You are QuantCode's research assistant. You help shape quant trading-strategy RESEARCH. "
        "This is research only — never imply live trading, never give financial advice. Answer the "
        "user grounded in the strategy below, then fill the structured fields honestly.\n\n"
        f"Strategy spec:\n{spec.model_dump_json(indent=2)}\n\n"
        f"Critique:\n{crit.model_dump_json(indent=2) if crit else 'none on record'}\n\n"
        f"Feasibility:\n{feas.model_dump_json(indent=2) if feas else 'none on record'}\n\n"
        f"User message: {message}"
    )


# --- Curated reading + market alerts (the "Suggested Reading" / news panels) -------------- #
# Items are genuinely tied to the selected strategy: derived from the packet in mock mode,
# LLM-curated when a provider is live. AI titles can be approximate → the UI labels them.
class ReadingItem(BaseModel):
    type: Literal["PAPER", "NEWS", "NOTE", "DATA"]
    title: str
    source: str
    year: str | None = None
    summary: str
    why: str  # why it matters for THIS strategy
    url: str | None = None


class MarketAlert(BaseModel):
    tag: Literal["FOMC", "FX", "CRYPTO", "EQUITY", "RATES", "MACRO"]
    headline: str
    strategy_tag: str


class CuratedReading(BaseModel):
    items: list[ReadingItem]
    alerts: list[MarketAlert]


class ReadingWhys(BaseModel):
    """One 'why this matters' sentence per item, in order — the only thing the LLM writes
    for reading (titles/sources come from real arXiv/news, so they can't be hallucinated)."""

    whys: list[str]


class ReadingRequest(BaseModel):
    run_id: str | None = None
    strategy_name: str | None = None


def _alert_tag(universe: str) -> str:
    u = universe.lower()
    if "fx" in u or "currenc" in u or "g10" in u:
        return "FX"
    if "crypto" in u or "btc" in u or "coin" in u:
        return "CRYPTO"
    if "bond" in u or "rate" in u or "treasur" in u:
        return "RATES"
    if "equit" in u or "stock" in u or "share" in u:
        return "EQUITY"
    return "MACRO"


def _mechanism_for(p: QuantResearchPacket, spec: StrategySpec):  # type: ignore[no-untyped-def]
    hyp = next(
        (h for h in p.candidate_hypotheses if h.hypothesis_name == spec.source_hypothesis), None
    )
    if hyp is None:
        return None
    return next((m for m in p.market_mechanisms if m.name == hyp.mechanism), None)


_ASSET_WORD = {"FX": "currencies", "CRYPTO": "crypto", "RATES": "bonds", "EQUITY": "stocks"}


def _reading_query(p: QuantResearchPacket, spec: StrategySpec) -> str:
    """Short search string for arXiv — strategy family + the mechanism it leans on."""
    mech = _mechanism_for(p, spec)
    family = spec.strategy_family.replace("_", " ")
    extra = mech.name.replace("_", " ") if mech else spec.source_hypothesis.replace("_", " ")
    return f"{family} {extra}".strip()


def _news_query(spec: StrategySpec) -> str:
    """Short search string for Google News — family + asset class (less academic)."""
    asset = _ASSET_WORD.get(_alert_tag(spec.universe), "markets")
    return f"{spec.strategy_family.replace('_', ' ')} {asset}".strip()


def _packet_items(p: QuantResearchPacket, spec: StrategySpec) -> list[ReadingItem]:
    """The DATA + NOTE items that come from this run (not external)."""
    items: list[ReadingItem] = []
    feas = _feasibility_for(p, spec)
    if feas:
        have = [*feas.available_now, *feas.available_with_existing_adapter]
        summary = (
            f"Available: {', '.join(have) or 'none'}. "
            f"Missing: {', '.join(feas.missing_data) or 'none'}."
        )
        items.append(
            ReadingItem(
                type="DATA",
                title=f"Data availability — {feas.hypothesis_name.replace('_', ' ')}",
                source="Feasibility gate",
                summary=summary,
                why="",
            )
        )
    for lesson in (p.retrieved_lessons + p.produced_lessons)[:2]:
        items.append(
            ReadingItem(
                type="NOTE",
                title=lesson.kind.replace("_", " "),
                source=f"Memory · {lesson.source_run_id}",
                summary=lesson.text,
                why="",
            )
        )
    return items


def _template_why(item: ReadingItem, spec: StrategySpec) -> str:
    name = spec.strategy_name
    if item.type == "PAPER":
        return f"Academic context for {name}'s {spec.strategy_family.replace('_', ' ')} edge."
    if item.type == "NEWS":
        return f"Current market backdrop for {name} ({spec.universe})."
    if item.type == "DATA":
        return f"Whether {name} is testable now or needs a proxy."
    return f"A prior lesson shaping how {name} was proposed."


def _whys_prompt(items: list[ReadingItem], spec: StrategySpec) -> str:
    listing = "\n".join(
        f"{i + 1}. [{it.type}] {it.title} — {it.summary[:160]}" for i, it in enumerate(items)
    )
    return (
        "You are QuantCode's research curator. For EACH numbered item below, write ONE sentence "
        "on why it matters specifically for this strategy (its mechanism, data, or risks). Return "
        "`whys` in the SAME ORDER, one per item. Research only; not financial advice; do not "
        "restate the title.\n\n"
        f"Strategy: {spec.strategy_name} ({spec.strategy_family}) — {spec.hypothesis}\n"
        f"Universe: {spec.universe}\n\n"
        f"Items:\n{listing}"
    )


def _alerts_from_news(news: list[dict[str, Any]], spec: StrategySpec) -> list[MarketAlert]:
    tag = _alert_tag(spec.universe)
    return [
        MarketAlert(tag=tag, headline=n["title"], strategy_tag=spec.strategy_name)  # type: ignore[arg-type]
        for n in news
    ]


def derived_alerts(p: QuantResearchPacket, spec: StrategySpec) -> list[MarketAlert]:
    """Offline fallback alerts (no live news) — from the mechanism + critique."""
    alerts: list[MarketAlert] = []
    tag = _alert_tag(spec.universe)
    mech = _mechanism_for(p, spec)
    if mech and mech.why_edge_might_disappear:
        alerts.append(
            MarketAlert(
                tag=tag,  # type: ignore[arg-type]
                headline=f"Edge-durability: {mech.why_edge_might_disappear[0]}.",
                strategy_tag=spec.strategy_name,
            )
        )
    crit = _critique_for(p, spec)
    if crit:
        risk = (crit.leakage_risks + crit.major_issues + crit.overfitting_risks)[:1]
        if risk:
            alerts.append(
                MarketAlert(tag="MACRO", headline=risk[0], strategy_tag=spec.strategy_name)
            )
    return alerts


def _summary(p: QuantResearchPacket) -> dict[str, Any]:
    return {
        "run_id": p.run_id,
        "objective": p.request.objective,
        "strategies": len(p.strategy_specs),
        "critiques": len(p.critiques),
        "advanced": sum(1 for r in p.data_feasibility_reports if r.verdict.value in ADVANCING),
        "deferred": sum(1 for r in p.data_feasibility_reports if r.verdict.value not in ADVANCING),
        "compression_ratio": p.context_pack.compression_ratio if p.context_pack else None,
        "retrieved_lessons": len(p.retrieved_lessons),
        "produced_lessons": len(p.produced_lessons),
    }


# --- Run trigger (the ONE write path: launches the real pipeline from the UI) ------------ #
# ponytail: in-memory job store + a global lock that serializes runs (one at a time) — fine
# for the single-worker `quantcode dashboard`. Use a real queue if this ever scales out.
class RunRequest(BaseModel):
    objective: str
    promote: bool = False


_JOBS: dict[str, dict[str, Any]] = {}
_RUN_LOCK = threading.Lock()


def _run_job(job_id: str, objective: str, promote: bool) -> None:
    with _RUN_LOCK:
        _JOBS[job_id]["status"] = "running"
        try:
            from quantcode.pipeline import run_research

            packet = run_research(objective, promote=promote)
            _JOBS[job_id].update(status="done", run_id=packet.run_id)
        except Exception as exc:  # noqa: BLE001 — surface any pipeline failure to the poller
            _JOBS[job_id].update(status="error", error=str(exc))


def create_app() -> FastAPI:
    app = FastAPI(title="QuantCode dashboard API", description="Read-only.", version="1")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"]
    )
    wm = WorkspaceManager()

    def packets() -> list[QuantResearchPacket]:
        out: list[QuantResearchPacket] = []
        for path in sorted(wm.research_runs.glob("run_*.json")):
            try:
                out.append(QuantResearchPacket.model_validate_json(path.read_text()))
            except Exception:  # noqa: BLE001 — skip an unreadable/partial run, don't 500 the API
                continue
        return out

    def load(run_id: str) -> QuantResearchPacket:
        path = wm.research_runs / f"{run_id}.json"
        if not path.exists():
            raise HTTPException(404, f"no run {run_id}")
        return QuantResearchPacket.model_validate_json(path.read_text())

    def _memory() -> Any | None:
        # connect lazily; the API must never 500 because Redis is down
        try:
            from quantcode.memory import Memory

            return Memory.connect()
        except Exception:  # noqa: BLE001
            return None

    @app.get("/overview")
    def overview() -> dict[str, Any]:
        pkts = packets()
        mem = _memory()
        return {
            "backend": mem.backend_name if mem else "unavailable",
            "llm_provider": config.llm_provider or "mock",
            "run_ids": [p.run_id for p in pkts],
            "run_count": len(pkts),
            "lesson_count": sum(len(p.produced_lessons) for p in pkts),
            "episode_count": len(pkts),
            "latest_run_id": pkts[-1].run_id if pkts else None,
            "disclaimer": "Research only — experiments are not_executed; no performance claimed.",
        }

    @app.get("/runs")
    def runs() -> list[dict[str, Any]]:
        return [_summary(p) for p in packets()]

    @app.get("/strategies")
    def strategies() -> list[dict[str, Any]]:
        """Flat catalog of every strategy across runs, joined with its critique verdict +
        top risk — the trader-facing view (the packet keeps the full detail)."""
        out: list[dict[str, Any]] = []
        for p in packets():
            crit = {c.strategy_name: c for c in p.critiques}
            for s in p.strategy_specs:
                c = crit.get(s.strategy_name)
                risks = (c.leakage_risks + c.major_issues + c.overfitting_risks) if c else []
                out.append(
                    {
                        "run_id": p.run_id,
                        "strategy_name": s.strategy_name,
                        "strategy_family": s.strategy_family,
                        "universe": s.universe,
                        "hypothesis": s.hypothesis,
                        "readiness": s.backtest_readiness,
                        "confidence": s.confidence,
                        "verdict": c.verdict if c else None,
                        "rationale_strength": c.economic_rationale_strength if c else None,
                        "top_risk": risks[0] if risks else None,
                        "risk_count": len(risks),
                    }
                )
        return out

    @app.get("/runs/latest")
    def latest() -> dict[str, Any]:
        rid = wm.latest_run_id()
        if rid is None:
            raise HTTPException(404, "no runs yet")
        return load(rid).model_dump(mode="json")

    @app.get("/runs/{run_id}")
    def run(run_id: str) -> dict[str, Any]:
        return load(run_id).model_dump(mode="json")

    @app.get("/compaction/{run_id}")
    def compaction(run_id: str) -> dict[str, Any]:
        p = load(run_id)
        if p.context_pack is None:
            raise HTTPException(404, f"no context pack for {run_id}")
        return p.context_pack.model_dump(mode="json")

    @app.get("/memory/lessons")
    def lessons(q: str | None = None, k: int = 5) -> list[dict[str, Any]]:
        if q:  # live vector search (Redis); [] if unavailable
            mem = _memory()
            if mem is None:
                return []
            try:
                return [
                    {"lesson": lesson.model_dump(mode="json"), "score": score}
                    for lesson, score in mem.semantic.search(q, k=k)
                ]
            except Exception:  # noqa: BLE001
                return []
        # default listing: produced lessons across all runs (from files — always works)
        seen: set[str] = set()
        out: list[dict[str, Any]] = []
        for p in packets():
            for lesson in p.produced_lessons:
                if lesson.lesson_id in seen:
                    continue
                seen.add(lesson.lesson_id)
                out.append({"lesson": lesson.model_dump(mode="json"), "score": None})
        return out

    @app.get("/memory/episodes")
    def episodes() -> list[dict[str, Any]]:
        return [p.episode.model_dump(mode="json") for p in packets() if p.episode is not None]

    # --- Agent chat (Tier 1) — reads a packet, makes ONE grounded LLM call, returns text.
    # Mutates nothing. Provider is mock until QC_LLM_PROVIDER is set (that env switch is the
    # cost/HITL gate); the frontend stays offline in mock mode and only POSTs here when live.
    @app.post("/agent/chat")
    def agent_chat(body: ChatRequest) -> dict[str, Any]:
        rid = body.run_id or wm.latest_run_id()
        if rid is None:
            raise HTTPException(404, "no runs yet")
        p = load(rid)
        spec = _pick_spec(p, body.strategy_name)
        if spec is None:
            raise HTTPException(404, "no strategies in this run")
        client = get_client()
        fixture = _chat_fixture(p, spec)
        try:
            reply = client.generate_structured(
                _chat_prompt(p, spec, body.message),
                AgentChatReply,
                context={"mock": fixture.model_dump()},
            )
        except LLMError as exc:
            raise HTTPException(502, f"LLM error: {exc}") from exc
        return {
            "reply": reply.model_dump(mode="json"),
            "provider": client.provider_name,
            "run_id": rid,
            "strategy_name": spec.strategy_name,
        }

    @app.post("/agent/draft-strategy")
    def agent_draft(body: DraftRequest) -> dict[str, Any]:
        """Draft (not persist) a StrategySpec from a free-text idea. Read-only — the spec is
        returned for review, never written to disk or Redis."""
        rid = body.run_id or wm.latest_run_id()
        if rid is None:
            raise HTTPException(404, "no runs yet")
        p = load(rid)
        if not p.strategy_specs:
            raise HTTPException(404, "no example strategy to ground a draft")
        client = get_client()
        example = p.strategy_specs[0]
        prompt = (
            "You are QuantCode's StrategyFormalizer. Turn the user's idea into exactly ONE valid "
            "StrategySpec following the same DSL as the example. Research only; not financial "
            "advice. Use only named, available features; include at least one entry and one exit "
            f"rule.\n\nExample spec:\n{example.model_dump_json(indent=2)}\n\nUser idea: {body.idea}"
        )
        try:
            spec = client.generate_structured(
                prompt, StrategySpec, context={"mock": example.model_dump()}
            )
        except LLMError as exc:
            raise HTTPException(502, f"LLM error: {exc}") from exc
        return {
            "spec": spec.model_dump(mode="json"),
            "provider": client.provider_name,
            "drafted": True,
        }

    @app.post("/agent/backtest")
    def agent_backtest(body: ReadingRequest) -> dict[str, Any]:
        """On-demand cross-sectional backtest of a strategy on real keyless EOD prices
        (simulated fallback when prices are unreachable). Computes; persists nothing."""
        from quantcode.dashboard.backtest import run_backtest

        rid = body.run_id or wm.latest_run_id()
        if rid is None:
            raise HTTPException(404, "no runs yet")
        p = load(rid)
        spec = _pick_spec(p, body.strategy_name)
        if spec is None:
            raise HTTPException(404, "no strategies in this run")
        result = run_backtest(spec)
        return {
            "backtest": result.model_dump(mode="json"),
            "run_id": rid,
            "strategy_name": spec.strategy_name,
        }

    @app.post("/agent/reading")
    def agent_reading(body: ReadingRequest) -> dict[str, Any]:
        """Curated reading + alerts for a strategy. Papers come from arXiv and news from
        Google News (REAL, with working links); the feasibility/lesson items from the packet.
        The LLM, when live, writes only the per-item 'why'. Read-only; degrades gracefully."""
        rid = body.run_id or wm.latest_run_id()
        if rid is None:
            raise HTTPException(404, "no runs yet")
        p = load(rid)
        spec = _pick_spec(p, body.strategy_name)
        if spec is None:
            raise HTTPException(404, "no strategies in this run")

        papers = [
            ReadingItem(**d, why="") for d in sources.arxiv_papers(_reading_query(p, spec), 3)
        ]
        news = sources.google_news(_news_query(spec), 4)
        items = [*papers, *_packet_items(p, spec)]
        alerts = _alerts_from_news(news, spec) or derived_alerts(p, spec)

        client = get_client()
        whys: list[str] | None = None
        if client.provider_name != "mock" and items:
            try:
                out = client.generate_structured(_whys_prompt(items, spec), ReadingWhys)
                whys = out.whys  # type: ignore[attr-defined]
            except LLMError:
                whys = None  # fall back to templates — never fail the panel
        for i, it in enumerate(items):
            it.why = (whys[i] if whys and i < len(whys) else "") or _template_why(it, spec)

        return {
            "reading": CuratedReading(items=items, alerts=alerts).model_dump(mode="json"),
            "provider": client.provider_name,
            "run_id": rid,
            "strategy_name": spec.strategy_name,
        }

    @app.post("/agent/run")
    def create_run(body: RunRequest) -> dict[str, Any]:
        """WRITE PATH — launches the real research pipeline in the background and returns a
        job id to poll. This mutates the workspace (and Redis), unlike every GET here. With a
        live LLM provider it makes ~9 model calls and costs tokens. Under /agent/* so it never
        collides with the frontend's Next GET route handler at /api/backend/runs."""
        objective = body.objective.strip()
        if not objective:
            raise HTTPException(422, "objective is required")
        job_id = uuid.uuid4().hex[:12]
        _JOBS[job_id] = {"status": "queued", "objective": objective, "run_id": None, "error": None}
        threading.Thread(
            target=_run_job, args=(job_id, objective, body.promote), daemon=True
        ).start()
        return {"job_id": job_id, "status": "queued", "provider": get_client().provider_name}

    @app.get("/agent/run/{job_id}")
    def run_job_status(job_id: str) -> dict[str, Any]:
        job = _JOBS.get(job_id)
        if job is None:
            raise HTTPException(404, "no such job")
        return {"job_id": job_id, **job}

    return app


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port)
