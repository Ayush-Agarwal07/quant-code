"""Future memory write proposal agent."""

from __future__ import annotations

from typing import Any

from quant_code.models.base import LLMClient
from quant_code.strategy_research.agents.base import AgentResult, BaseAgent
from quant_code.strategy_research.schemas import MemoryWriteProposalStub


class MemoryProposalAgent(BaseAgent):
    """Propose research memories without persisting them."""

    name = "memory_proposal"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)

    def run(self, packet_so_far: dict[str, Any]) -> AgentResult[list[MemoryWriteProposalStub]]:
        strategy_names = [
            strategy.strategy_name for strategy in packet_so_far.get("strategy_specs", [])
        ]

        def operation() -> list[MemoryWriteProposalStub]:
            proposals = [
                MemoryWriteProposalStub(
                    memory_type="research_lesson_memory",
                    content=(
                        "Data feasibility must be established before a hypothesis is converted "
                        "into a deterministic strategy specification."
                    ),
                    evidence_strategy_names=strategy_names,
                    confidence=0.92,
                    status="proposed_not_written",
                )
            ]
            if strategy_names:
                proposals.append(
                    MemoryWriteProposalStub(
                        memory_type="strategy_memory",
                        content=(
                            "Store the formalized rules, feasibility verdicts, critiques, and "
                            "future experiment outcomes together."
                        ),
                        evidence_strategy_names=strategy_names,
                        confidence=0.78,
                        status="proposed_not_written",
                    )
                )
            return proposals

        return self._execute(
            input_summary=f"Partial packet with {len(strategy_names)} strategies",
            output_summary="Proposed future memory writes without persistence.",
            schema_used="list[MemoryWriteProposalStub]",
            operation=operation,
        )
