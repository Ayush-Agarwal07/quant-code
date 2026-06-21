"""Agent 7 — StrategyWriterAgent: finalize a validated spec for writing.

Input: list[StrategySpec] (already validated by StrategyValidatorTool upstream).
Output: list[StrategySpec], finalized. Minimal by design — it confirms backtest_readiness
and hands clean specs to the WorkspaceManager (which owns the actual YAML write, D6).
"""

from __future__ import annotations

from quantcode.agents.base import Agent
from quantcode.schemas import StrategySpec

PROMPT = (
    "Finalize this validated strategy for writing to disk. Do not change the trading logic; only "
    "confirm the fields are coherent and that backtest_readiness honestly reflects any proxy "
    "limitations. Return the spec ready to serialize."
)


class StrategyWriterAgent(Agent):
    def run(self, specs: list[StrategySpec]) -> list[StrategySpec]:
        # ponytail: one model per call; loop specs, round-tripping each through the LLM
        # contract so the path is identical for mock and real providers.
        finalized: list[StrategySpec] = []
        for spec in specs:
            ctx = {"spec": spec.model_dump(mode="json"), "mock": self._mock(spec)}
            out = self.llm.generate_structured(PROMPT, StrategySpec, ctx)
            assert isinstance(out, StrategySpec)
            finalized.append(out)
        return finalized

    def _mock(self, spec: StrategySpec) -> dict[str, object]:
        # ponytail: writer is a no-op finalize — echo the validated spec back unchanged.
        return spec.model_dump(mode="json")
