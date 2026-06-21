"""Reproducible, offline benchmarks for the two pitch-critical capabilities (task 08).

Run: `python -m quantcode.benchmarks`  (or `quantcode benchmarks`).

Deterministic and dependency-free — no RAGAS, no LLM judge, no server. Numbers are MEASURED
(real bge tokenizer + embeddings if warmed; clearly flagged otherwise) and reproducible from
one command, so they're safe to quote in the pitch.

1. **Compaction quality** (Token Company): synthetic traces with LABELED must-retain decisions
   -> slot-fill recall (did every must-retain decision survive compaction?) + ROUGE-L vs the
   oracle + measured compression ratio. This is the meaning-preservation claim, at scale.
2. **Memory retrieval** (Redis): seed known lessons, query with PARAPHRASES -> recall@1/@3 and
   MRR (does semantic search surface the relevant prior lesson?). Ranking is backend-independent
   (same embeddings + cosine on RediSearch or the in-memory brute force), so the in-memory run
   is representative — and the paraphrase signal only holds on the real embedding model.
"""

from __future__ import annotations

import json
import statistics

from rich.console import Console
from rich.table import Table

from quantcode.compaction import ResearchTraceCompiler
from quantcode.memory import Memory
from quantcode.memory._embeddings import using_real_model
from quantcode.memory.client import InMemoryBackend, RedisMemory
from quantcode.schemas import Lesson, TraceEvent

console = Console()


# --------------------------------------------------------------------------- #
# ROUGE-L (LCS-based F1) — stdlib, no nltk/rouge dependency.
# --------------------------------------------------------------------------- #
def _lcs_len(a: list[str], b: list[str]) -> int:
    dp = [0] * (len(b) + 1)
    for x in a:
        prev = 0
        for j, y in enumerate(b, 1):
            prev, dp[j] = dp[j], (prev + 1 if x == y else max(dp[j], dp[j - 1]))
    return dp[-1]


def _rouge_l_recall(candidate: str, reference: str) -> float:
    """ROUGE-L recall: LCS coverage of the oracle (reference) by the pack (candidate). Recall,
    not F1 — the pack legitimately carries extra context, so precision would understate; the
    meaningful question is 'how much of the must-retain content survived'."""
    cand, ref = candidate.lower().split(), reference.lower().split()
    if not cand or not ref:
        return 0.0
    return _lcs_len(cand, ref) / len(ref)


# --------------------------------------------------------------------------- #
# Benchmark 1 — compaction quality (slot-fill recall + ROUGE-L + ratio)
# --------------------------------------------------------------------------- #
# Deterministic pools (indexed per trace) so the dataset is reproducible, not random.
_RISKS = [
    "gap_1d uses same-day close, a look-ahead leak",
    "the earnings-surprise proxy is not point-in-time lagged",
    "survivorship bias in the backtest universe",
    "ranking on same-day returns leaks future information",
    "the volatility estimate peeks at the close it trades on",
]
_ISSUES = [
    "weekly rebalance turnover may erode a thin edge",
    "thresholds at 0.0 are arbitrary and untested",
    "the signal decays after the first holding week",
    "transaction costs are assumed unrealistically low",
    "the universe is too small to diversify idiosyncratic risk",
]
_CONSTRAINTS = [
    "requires point-in-time fundamentals not in the free feed",
    "needs intraday bars the daily pipeline does not store",
    "depends on a borrow-availability feed we lack",
    "assumes corporate-action-adjusted prices",
    "needs analyst-revision data behind a paywall",
]
_VERDICTS = ["accept_for_backtest", "revise_before_backtest", "reject"]


def _synthetic_trace(i: int) -> tuple[list[TraceEvent], list[str]]:
    """One labeled trace: a critic + feasibility decision (with KNOWN must-retain strings),
    plus generic-noise steps and a duplicate (to exercise dedup). Fully deterministic in `i`."""
    risk, issue = _RISKS[i % len(_RISKS)], _ISSUES[i % len(_ISSUES)]
    constraint, verdict = _CONSTRAINTS[i % len(_CONSTRAINTS)], _VERDICTS[i % len(_VERDICTS)]
    strat, hyp = f"strategy_{i}", f"hypothesis_{i}"

    critic = TraceEvent(
        run_id=f"bench_{i}", step=1, agent_name="ResearchCriticAgent", status="success",
        output_summary=f"{strat}: {verdict}",
        output_detail=json.dumps(
            [{"strategy_name": strat, "verdict": verdict,
              "leakage_risks": [risk], "major_issues": [issue]}]
        ),
    )
    feasibility = TraceEvent(
        run_id=f"bench_{i}", step=2, agent_name="DataFeasibilityAgent", status="success",
        output_summary=f"{hyp}: deferred",
        output_detail=json.dumps([{"hypothesis_name": hyp, "verdict": "testable_with_proxy",
                                   "constraint": constraint}]),
    )
    # generic noise the compaction must distill away (no must-retain content) — verbose, like
    # the real intermediate outputs an uncompacted agent would carry forward.
    blurb = ("Ranked a broad candidate set by historical information coefficient, liquidity, "
             "turnover, and implementation cost before narrowing the shortlist.")
    noise = [
        TraceEvent(
            run_id=f"bench_{i}", step=3 + j, agent_name=name, status="success",
            output_summary=f"{name} produced output",
            output_detail=json.dumps(
                [{"notes": blurb, "items": [f"{name}_candidate_{k}" for k in range(8)]}]
            ),
        )
        for j, name in enumerate(
            ("ResearchDirectorAgent", "StrategyWriterAgent",
             "StrategyFormalizerAgent", "MarketMechanismAgent")
        )
    ]
    events = [critic, feasibility, *noise, noise[0]]  # duplicate noise[0] -> dedup target
    must_retain = [risk, issue, constraint, verdict, strat, hyp]
    return events, must_retain


# Tight relative to the synthetic traces so compaction actually compresses; slot-fill recall is
# budget-INDEPENDENT (must-retain decisions always survive), only the ratio scales with budget.
_BENCH_BUDGET = 150


def bench_compaction(n: int = 60, budget: int = _BENCH_BUDGET) -> dict[str, float]:
    compiler = ResearchTraceCompiler()
    recalls, rouges, ratios, dedups, estimated = [], [], [], [], False
    for i in range(n):
        events, must = _synthetic_trace(i)
        pack = compiler.compile(f"bench_{i}", events, budget=budget).pack
        estimated = estimated or pack.tokens_estimated
        joined = " ".join(pack.lessons)
        recalls.append(sum(m in joined for m in must) / len(must))  # slot-fill recall
        rouges.append(_rouge_l_recall(joined, " ".join(must)))
        ratios.append(pack.compression_ratio)
        dedups.append(pack.duplicate_events_removed)
    return {
        "traces": n,
        "budget": budget,
        "slot_fill_recall": statistics.mean(recalls),
        "rouge_l_recall": statistics.mean(rouges),
        "compression_ratio": statistics.mean(ratios),
        "dups_removed_avg": statistics.mean(dedups),
        "estimated": float(estimated),
    }


# --------------------------------------------------------------------------- #
# Benchmark 2 — memory retrieval (recall@k + MRR on paraphrase queries)
# --------------------------------------------------------------------------- #
# (label, lesson_text_stored_in_Tier3, paraphrase_query_that_should_retrieve_it)
_RETRIEVAL_SET: list[tuple[str, str, str]] = [
    ("lookahead", "Ranking on same-day returns leaks future information into entry signals.",
     "using tomorrow's data in today's signal causes look-ahead bias"),
    ("costs", "High turnover monthly rebalancing erodes returns through transaction costs.",
     "frequent rebalancing fees eat into net performance"),
    ("survivorship", "Backtesting only on current index members ignores delisted losers.",
     "excluding failed delisted companies inflates backtest returns"),
    ("regime", "Momentum crashes during sharp market reversals after prolonged trends.",
     "trend-following breaks down in sudden market regime shifts"),
    ("crowding", "Crowded factor trades compress expected returns as capital piles in.",
     "popular arbitraged strategies decay as more money crowds in"),
]


def bench_retrieval(k: int = 3) -> dict[str, float]:
    mem = Memory(RedisMemory(InMemoryBackend(), "bench"))  # deterministic, no server
    for idx, (label, text, _) in enumerate(_RETRIEVAL_SET):
        mem.semantic.write_lesson(
            Lesson(lesson_id=f"bench:{label}", text=text, kind="warning", source_run_id=f"r{idx}")
        )
    hit1, hit_k, rr = 0, 0, []
    for label, _, query in _RETRIEVAL_SET:
        hits = mem.semantic.search(query, k=len(_RETRIEVAL_SET))
        ranked = [lesson.lesson_id for lesson, _ in hits]
        target = f"bench:{label}"
        rank = ranked.index(target) + 1 if target in ranked else 0
        hit1 += rank == 1
        hit_k += 0 < rank <= k
        rr.append(1 / rank if rank else 0.0)
    n = len(_RETRIEVAL_SET)
    return {
        "queries": n, "k": k,
        "recall_at_1": hit1 / n,
        "recall_at_k": hit_k / n,
        "mrr": statistics.mean(rr),
        "real_model": float(using_real_model()),
    }


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #
def run_all() -> tuple[dict[str, float], dict[str, float]]:
    comp = bench_compaction()
    ret = bench_retrieval()

    t1 = Table(title="Benchmark 1 — Compaction quality (Token Company)")
    t1.add_column("metric")
    t1.add_column("value", justify="right")
    flag = " (estimated)" if comp["estimated"] else " (measured)"
    t1.add_row("traces", str(int(comp["traces"])))
    t1.add_row("slot-fill recall (must-retain survived)", f"{comp['slot_fill_recall']:.1%}")
    t1.add_row("ROUGE-L recall (oracle coverage)", f"{comp['rouge_l_recall']:.3f}")
    t1.add_row(f"compression ratio @ budget {int(comp['budget'])}{flag}",
               f"{comp['compression_ratio']:.2f}x")
    t1.add_row("duplicate events removed (avg)", f"{comp['dups_removed_avg']:.1f}")
    console.print(t1)

    t2 = Table(title="Benchmark 2 — Memory retrieval (Redis semantic search)")
    t2.add_column("metric")
    t2.add_column("value", justify="right")
    emb = "real bge embeddings" if ret["real_model"] else "HASH fallback (run `quantcode warmup`)"
    t2.add_row("paraphrase queries", str(int(ret["queries"])))
    t2.add_row("recall@1", f"{ret['recall_at_1']:.1%}")
    t2.add_row(f"recall@{int(ret['k'])} (failure surfaced)", f"{ret['recall_at_k']:.1%}")
    t2.add_row("MRR", f"{ret['mrr']:.3f}")
    t2.add_row("embedding model", emb)
    console.print(t2)
    return comp, ret


def main() -> None:
    comp, ret = run_all()
    # runnable check: lossless compaction keeps the meaning; retrieval works when the real model
    # is warm (skip that assertion on the hash fallback, which is not semantic).
    assert comp["slot_fill_recall"] >= 0.99, comp["slot_fill_recall"]
    if ret["real_model"]:
        assert ret["recall_at_k"] >= 0.8, ret["recall_at_k"]
        console.print("[green]benchmarks OK[/green] — compaction lossless, retrieval recall holds.")
    else:
        console.print("[yellow]benchmarks OK (retrieval on hash fallback — run `quantcode warmup`"
                      " for the real number).[/yellow]")


if __name__ == "__main__":
    main()
