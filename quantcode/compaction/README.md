# compaction/

**Status:** scaffold — not implemented. **★ Primary sponsor track: The Token Company (ALL IN).**

## Purpose

The **ResearchTrace Compiler** — turns a long, noisy Tier 1 trace into a compact
context pack within a token budget, and extracts candidate lessons. This is the
Token Company centerpiece ("depth of research" + the name is literally about tokens).
Give it a named identity in the demo.

## What to implement

- `ResearchTrace Compiler` (deterministic): dedupe repeated events, extract candidate
  lessons, compress to a target token budget, emit a `ContextPack` + metrics.
- `CompactorAgent` (LLM-backed summarization step, if needed beyond deterministic
  compaction).

Demo metrics to produce (must be **measured**, not the placeholder estimates in docs):

```
tokens_before, tokens_after, compression_ratio,
critical_lessons_retained / total, duplicate_events_removed, budget
```

## How it connects

`pipeline/` calls this after Tier 1 is written: trace → compiler → candidate lessons
→ `MemoryCurator` (promotes to Tier 2/3) and `ContextPack` → `workspace/memory/` +
`qc:context_pack:{id}`. The dashboard's before/after panel reads these metrics.

## Implementation instructions

1. Real token counting — use the actual tokenizer of the chosen LLM, not a word
   count. If counts are estimates, label them as estimates in output.
2. Deterministic dedup first (cheap, honest), LLM summarization only for what remains.
3. The compiler must **not** promote lessons itself — it proposes; `MemoryCurator` disposes.
4. Self-check: feed a trace with known duplicates; assert dedup count + that
   `tokens_after < tokens_before`.

## ❓ Open questions (ask human)

- [ ] Tokenizer/counter — depends on the undecided LLM backend. Which one?
- [ ] Default budget (docs show 1000) — fixed or per-command (`compact --budget`)?
- [ ] How is "critical lesson retained" measured (the X/10 metric) — by what oracle?

## 🧑‍⚖️ HITL checkpoints

- [ ] Before publishing any compression metric in the demo/pitch: confirm it's
      measured and reproducible — inflated numbers here sink credibility on the
      track that's literally about tokens.
