"""Central configuration for QuantCode.

Loads `.env` once; every value is env-overridable. One module on purpose.

ponytail: a single config module, not a `config/` package. Add structure only
if this file actually grows past ~50 lines of real logic.

Committed settings below: Redis (primary memory substrate) and Browserbase
(research-url). The LLM section is INTENTIONALLY UNRESOLVED — see the open
question block. Do not wire a provider here until a human decides.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    # --- Redis: PRIMARY sponsor track, memory substrate (not a cache) ---
    redis_url: str
    redis_namespace: str  # key prefix, e.g. "qc" -> qc:run:{id}:trace
    tier1_ttl_seconds: int  # working-trace TTL

    # --- Browserbase: research-url path (CONFIGURED, must run on their platform) ---
    browserbase_api_key: str | None
    browserbase_project_id: str | None

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
    return Config(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        redis_namespace=os.getenv("REDIS_NAMESPACE", "qc"),
        # ponytail: 1h default TTL; tune per demo. Docs say Tier 1 "should expire"
        # but give no number — confirm with human (see memory/tier1_working/README.md).
        tier1_ttl_seconds=int(os.getenv("QC_TIER1_TTL", "3600")),
        browserbase_api_key=os.getenv("BROWSERBASE_API_KEY"),
        browserbase_project_id=os.getenv("BROWSERBASE_PROJECT_ID"),
        workspace_dir=os.getenv("QC_WORKSPACE", "workspace"),
        llm_provider=os.getenv("QC_LLM_PROVIDER"),  # intentionally unset
        llm_model=os.getenv("QC_LLM_MODEL"),  # intentionally unset
    )


config = load()


if __name__ == "__main__":  # runnable self-check: `python -m quantcode.config`
    c = load()
    assert c.redis_url, "redis_url must be set"
    assert c.redis_namespace, "redis_namespace must be set"
    assert c.tier1_ttl_seconds > 0, "tier1 TTL must be positive"

    def _mask(v: str | None) -> str:
        return "<set>" if v else "<unset>"

    print("QuantCode config:")
    print(f"  redis_url          = {c.redis_url}")
    print(f"  redis_namespace    = {c.redis_namespace}")
    print(f"  tier1_ttl_seconds  = {c.tier1_ttl_seconds}")
    print(f"  browserbase_api_key= {_mask(c.browserbase_api_key)}")
    print(f"  browserbase_project= {_mask(c.browserbase_project_id)}")
    print(f"  workspace_dir      = {c.workspace_dir}")
    print(f"  llm_provider       = {c.llm_provider or '<UNDECIDED — ask human>'}")
    print(f"  llm_model          = {c.llm_model or '<UNDECIDED — ask human>'}")
