"""Runnable self-check: `python -m quantcode.memory`. FORCES the in-memory fallback
(QC_MEMORY_BACKEND=memory) so it passes offline with no server.

Exercises all three tiers + the curator's HITL gate. The Tier-3 paraphrase-ranking
assertion only holds with real fastembed embeddings; if the model can't load offline it
prints a SKIP but still asserts search returns results via the deterministic hash fallback.
"""

from __future__ import annotations

import os

os.environ["QC_MEMORY_BACKEND"] = "memory"  # force fallback BEFORE connecting

from quantcode.memory import Memory  # noqa: E402
from quantcode.memory._embeddings import using_real_model  # noqa: E402
from quantcode.schemas import EpisodeRecord, Lesson, TraceEvent  # noqa: E402

mem = Memory.connect()
assert mem.backend_name == "memory", "self-check must run on the in-memory fallback"

# --- Tier 1: append + read a TraceEvent ----------------------------------------
ev = TraceEvent(run_id="run_001", step=1, agent_name="hypothesis", status="success")
mem.working.append(ev)
(read_ev,) = mem.working.read_trace("run_001")
assert read_ev == ev, "Tier 1 trace round-trip"

# --- Tier 2: write + read an EpisodeRecord -------------------------------------
ep = EpisodeRecord(
    run_id="run_001",
    objective="find a momentum edge",
    strategy_names=["demo_momentum"],
    critique_summaries=["lookahead risk on ranking"],
    failed_feasibility=[],
    retrieved_lesson_ids=[],
    produced_lesson_ids=["lesson_lookahead"],
)
mem.episodic.write_episode(ep)
assert mem.episodic.read_episode("run_001") == ep, "Tier 2 episode round-trip"
assert [e.run_id for e in mem.episodic.list_episodes()] == ["run_001"], "Tier 2 list"

# --- Tier 3: write two lessons, search a PARAPHRASE of one ----------------------
l1 = Lesson(
    lesson_id="lesson_lookahead",
    text="Ranking on same-day returns leaks future information into entry signals.",
    kind="warning",
    source_run_id="run_001",
)
l2 = Lesson(
    lesson_id="lesson_costs",
    text="High turnover monthly rebalancing erodes returns through transaction costs.",
    kind="warning",
    source_run_id="run_001",
)
mem.semantic.write_lesson(l1)
mem.semantic.write_lesson(l2)

results = mem.semantic.search("lookahead bias from using future data in the signal", k=5)
assert results, "Tier 3 search must return results (even on the hash fallback)"

if using_real_model():
    top_id = results[0][0].lesson_id
    assert top_id == "lesson_lookahead", f"paraphrase should rank l1 first, got {top_id}"
    print("memory tier3: real fastembed embeddings — paraphrase ranked correctly")
else:
    print("memory tier3: SKIP paraphrase-ranking (fastembed model unavailable offline); "
          "hash fallback returned results")

# --- Curator: Tier-3 promotion is HITL-gated -----------------------------------
cand = Lesson(
    lesson_id="lesson_pending",
    text="Volatility-targeted weighting stabilizes drawdowns in momentum books.",
    kind="pattern",
    source_run_id="run_002",
)
gated = mem.curator.curate([cand], run_id="run_002")  # no approval
assert gated.pending and not gated.promoted, "Tier 3 promotion must be gated by default"
assert mem.semantic.read_lesson("lesson_pending") is None, "gated lesson must NOT be written"

approved = mem.curator.curate([cand], run_id="run_002", approved=True)
assert approved.promoted and not approved.pending, "explicit approval must promote"
assert mem.semantic.read_lesson("lesson_pending") is not None, "approved lesson is in Tier 3"

# validation rejects junk / mismatched provenance
junk = Lesson(lesson_id="junk", text="   ", kind="warning", source_run_id="run_002")
res = mem.curator.curate([junk], run_id="run_002", approved=True)
assert res.rejected and not res.promoted, "blank lesson must be rejected"

print("memory OK — tier1 trace, tier2 episode, tier3 vector search, HITL-gated promotion "
      f"(backend={mem.backend_name})")
