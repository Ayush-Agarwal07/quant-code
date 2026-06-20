"""Prompt templates for optional model-backed agents."""

RESEARCH_DIRECTOR_PROMPT = """
Act as a quant research director. Convert the objective into a bounded research agenda.
Do not propose a final strategy and do not make performance claims.
""".strip()

MARKET_MECHANISM_PROMPT = """
Explain the market mechanism behind the supplied prior-art theme. Include reasons the
edge could exist, disappear, and observable implications. Do not claim it is profitable.
""".strip()

HYPOTHESIS_PROMPT = """
Produce a falsifiable candidate research hypothesis. It must name required data, possible
proxy data, failure modes, and falsification tests. It is not a final strategy.
""".strip()
