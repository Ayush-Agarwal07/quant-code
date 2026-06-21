"""Shared agent execution and trace behavior."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from pydantic import ValidationError

from quant_code.core.exceptions import AgentExecutionError
from quant_code.models.base import LLMClient
from quant_code.strategy_research.schemas import AgentTrace

T = TypeVar("T")


@dataclass(frozen=True)
class AgentResult(Generic[T]):
    """A validated agent output and its execution trace."""

    output: T
    trace: AgentTrace


class BaseAgent(ABC):
    """Base class that turns validated operations into traceable agent results."""

    name = "base_agent"

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self.logger = logging.getLogger(f"{__name__}.{self.name}")

    def _execute(
        self,
        *,
        input_summary: str,
        output_summary: str,
        schema_used: str,
        operation: Callable[[], T],
    ) -> AgentResult[T]:
        try:
            output = operation()
        except (ValidationError, ValueError, TypeError) as exc:
            self.logger.exception("%s failed validation", self.name)
            raise AgentExecutionError(f"{self.name} failed: {exc}") from exc
        trace = AgentTrace(
            agent_name=self.name,
            input_summary=input_summary,
            output_summary=output_summary,
            schema_used=schema_used,
            validation_status="success",
            errors=[],
        )
        return AgentResult(output=output, trace=trace)

    @abstractmethod
    def run(self, *args: Any, **kwargs: Any) -> AgentResult[Any]:
        """Run the focused agent task."""
