"""Non-persistent memory boundary."""

from __future__ import annotations

from quant_code.strategy_research.schemas import MemoryWriteProposalStub


class MemoryStoreStub:
    """Expose the future memory interface without persistence."""

    def retrieve(self, query: str) -> list[str]:
        del query
        return []

    def propose_write(self, proposal: MemoryWriteProposalStub) -> MemoryWriteProposalStub:
        return proposal
