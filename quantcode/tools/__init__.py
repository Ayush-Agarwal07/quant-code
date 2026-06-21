"""tools/ — the deterministic half of the QuantCode pipeline.

No LLM, no I/O, pure functions: same input -> same output, always. These tools are
the counterweight to the agents — they enforce policy (the D8 allowlist + leakage
blocklist) and produce honest, repeatable artifacts (the never-executed runner stub).

Public surface:
    FeatureCatalog        — the D8 18 features (source of truth) + the 7 operators
    DataCatalog           — classify required-data tokens vs what's available
    StrategyValidatorTool — the validation gate -> StrategyValidationReport
    ExperimentRunnerStub  — always status="not_executed" (backtesting is a non-goal)
"""

from __future__ import annotations

from quantcode.tools.data_catalog import DataCatalog
from quantcode.tools.experiment_runner import ExperimentRunnerStub
from quantcode.tools.feature_catalog import SUPPORTED_OPERATORS, FeatureCatalog
from quantcode.tools.validator import StrategyValidatorTool

__all__ = [
    "SUPPORTED_OPERATORS",
    "DataCatalog",
    "ExperimentRunnerStub",
    "FeatureCatalog",
    "StrategyValidatorTool",
]
