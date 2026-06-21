"""Runnable self-check: `python -m quantcode.schemas`.

Asserts StrategySpec round-trips JSON *and* YAML (it's persisted as YAML), that
extra='forbid' rejects typos, and that schema_version is present.
"""

from __future__ import annotations

import yaml

from quantcode.schemas import MAIN_SCHEMA_NAMES, SCHEMA_VERSION, StrategySpec, sample_strategy_spec

spec = sample_strategy_spec()

assert StrategySpec.model_validate_json(spec.model_dump_json()) == spec, "JSON round-trip"

as_yaml = yaml.safe_dump(spec.model_dump(mode="json"), sort_keys=False)
assert StrategySpec.model_validate(yaml.safe_load(as_yaml)) == spec, "YAML round-trip"

try:
    StrategySpec.model_validate({**spec.model_dump(mode="json"), "bogus_field": 1})
except Exception:
    pass
else:  # pragma: no cover
    raise AssertionError("extra='forbid' should reject unknown fields")

assert spec.schema_version == SCHEMA_VERSION

print(f"schemas OK — {len(MAIN_SCHEMA_NAMES)} models, schema_version={SCHEMA_VERSION}")
print("StrategySpec YAML sample:\n" + as_yaml)
