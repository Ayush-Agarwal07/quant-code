"""ResearchTrace Compiler — compacts noisy Tier 1 traces into budgeted ContextPacks.

The Token-Company centerpiece (decision D7). Deterministic dedup + budget compression with
MEASURED token metrics; proposes candidate lessons but never promotes them (that's
`MemoryCurator`'s job). See `compiler.py` for the explicit "critical lesson" oracle.
"""

from __future__ import annotations

from quantcode.compaction.compiler import CompactionResult, ResearchTraceCompiler
from quantcode.compaction.tokenizer import TokenCounter, get_token_counter

__all__ = [
    "CompactionResult",
    "ResearchTraceCompiler",
    "TokenCounter",
    "get_token_counter",
]
