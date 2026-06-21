# 07 — fastembed / tokenizer pre-warm for offline stage use

**Status:** DONE (2026-06-20 — single `quantcode warmup` command). **Priority:** low. **Effort:** XS.

**What shipped:** `quantcode warmup` (`cli/__init__.py`) pre-pulls BOTH the bge tokenizer
(`warm_tokenizer_cache()`) and the fastembed BGE model (`using_real_model()` constructs/downloads
it) in one online run, then prints a readiness table and exits non-zero if either is still on a
fallback. Verified: both report ✓ and an offline `demo` then shows real embeddings + MEASURED
compaction tokens. Replaces the two manual one-liners with one stage-prep command.

## Why it matters
Real semantic vector search (the Redis "beyond caching" proof) needs the fastembed BGE model
(~50MB) and the bge tokenizer (for compaction). Both download on first use. If the stage is
offline and the cache is cold, QuantCode silently drops to the deterministic **hash** embedding
(weaker ranking — a paraphrase may not rank first) and a labeled token estimate. Pre-warm once
online so the live demo uses the real model.

## Current state
- `quantcode/memory/_embeddings.py`: lazy fastembed + hash fallback; `using_real_model()` tells
  you which is active.
- `quantcode/compaction/tokenizer.py`: `warm_tokenizer_cache()` pre-pulls the tokenizer;
  falls back to a labeled ~4-chars/token estimate if cold.

## Steps (run once, online, before going offline)
1. Warm the tokenizer: `.venv/bin/python -c "from quantcode.compaction.tokenizer import warm_tokenizer_cache; print(warm_tokenizer_cache())"`.
2. Warm fastembed: `.venv/bin/python -c "from quantcode.memory._embeddings import embed, using_real_model; embed('warm'); print('real model:', using_real_model())"`.
3. Confirm offline: re-run the embed check with no network → `using_real_model()` should still
   be True (cache hit).

## Acceptance
After pre-warming, an offline `quantcode demo` reports real embeddings (not the hash fallback)
and measured (not estimated) compaction tokens.

## Refs
`quantcode/memory/_embeddings.py`, `quantcode/compaction/tokenizer.py`, `DECISIONS.md` D3/D7.
