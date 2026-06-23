"""Central configuration for QuantCode.

Loads `.env` once; every value is env-overridable. One module on purpose.

ponytail: a single config module, not a `config/` package. Add structure only
if this file actually grows past ~50 lines of real logic.

Defaults are fully local & free: memory persists to a local SQLite file, the
research-url path uses a plain HTTP GET. Redis (`QC_MEMORY_BACKEND=redis`) and
a real LLM (`[llm]` extra) are opt-in. The LLM section is INTENTIONALLY
UNRESOLVED — see the open question block. Do not wire a provider here until a
human decides.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    # --- Memory: local SQLite by default; Redis is opt-in (QC_MEMORY_BACKEND=redis) ---
    db_path: str  # SQLite file backing Tier 2/3 (default: <workspace>/memory/quantcode.db)
    namespace: str  # key prefix, e.g. "qc" -> qc:run:{id}:trace
    tier1_ttl_seconds: int  # working-trace TTL (Redis only; sqlite/memory ignore it)
    redis_url: str  # used only when QC_MEMORY_BACKEND=redis

    # --- Workspace: artifact root (strategies/, research_runs/, reports/, memory/) ---
    workspace_dir: str

    # --- LLM: ❓ OPEN QUESTION — NOT DECIDED. Do not assume a default. ---
    # Unresolved with the human:
    #   1. Provider: Anthropic Claude API? old multi-backend router? mock-only?
    #   2. WHERE the client lives — no models/ dir was created.
    #   3. Which SDK + which model id.
    # These are read from env so nothing is hard-coded, but they default to None.
    # An agent that needs an LLM MUST stop and resolve this. See agents/README.md.
    llm_provider: str | None
    llm_model: str | None


def load() -> Config:
    workspace_dir = os.getenv("QC_WORKSPACE", "workspace")
    return Config(
        db_path=os.getenv("QC_DB_PATH", f"{workspace_dir}/memory/quantcode.db"),
        namespace=os.getenv("QC_NAMESPACE", "qc"),
        # ponytail: 1h default TTL; only the Redis backend honors it (sqlite/memory ignore).
        tier1_ttl_seconds=int(os.getenv("QC_TIER1_TTL", "3600")),
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        workspace_dir=workspace_dir,
        llm_provider=os.getenv("QC_LLM_PROVIDER"),  # intentionally unset
        llm_model=os.getenv("QC_LLM_MODEL"),  # intentionally unset
    )


config = load()


if __name__ == "__main__":  # runnable self-check: `python -m quantcode.config`
    c = load()
    assert c.db_path, "db_path must be set"
    assert c.namespace, "namespace must be set"
    assert c.tier1_ttl_seconds > 0, "tier1 TTL must be positive"

    print("QuantCode config:")
    print(f"  db_path            = {c.db_path}")
    print(f"  namespace          = {c.namespace}")
    print(f"  tier1_ttl_seconds  = {c.tier1_ttl_seconds}")
    print(f"  redis_url          = {c.redis_url}")
    print(f"  workspace_dir      = {c.workspace_dir}")
    print(f"  llm_provider       = {c.llm_provider or '<UNDECIDED — ask human>'}")
    print(f"  llm_model          = {c.llm_model or '<UNDECIDED — ask human>'}")
