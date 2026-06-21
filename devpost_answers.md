# Devpost Answers

## When developing this project, how did you address ethical concerns related to AI, including potential social, environmental, and privacy impacts?

We addressed AI ethics by designing the product so AI supports decisions rather than silently making them. The core principle is `human in the loop`: users can review outputs, inspect the reasoning, and make the final call instead of treating the model as an unquestioned authority.

On honesty and reliability, we try to reduce hallucination risk by grounding outputs in traceable evidence. When the system makes a factual claim, it should cite the underlying source or data it came from, so users can verify it themselves. We also aim to communicate uncertainty clearly, avoid overstating confidence, and make it obvious when the model is generating an estimate versus reporting a confirmed fact.

On privacy, we minimize collection and retention of sensitive data, only use the data necessary for the product to function, and avoid exposing private user information in prompts, logs, or outputs. We also think users should know when AI is being used and what data is being processed.

On social impact, we considered the risk that users might over-rely on AI outputs or that errors could reinforce bias or bad decisions. That is why we emphasize transparency, user review, and clear limitations rather than full automation. The goal is augmentation, not replacing human judgment where context and accountability matter.

On environmental impact, we try to be pragmatic about model usage: using the smallest effective workflow, avoiding unnecessary inference calls, and only applying heavier AI steps where they add real value. In short, we treated ethical AI as a product design issue, not just a model issue: transparency, source-backed honesty, privacy minimization, and human oversight were built into the workflow.

## Project Story

### About the project

> **QuantCode** is our attempt at building *Claude Code for systematic strategy research*:
> a local AI research agent that helps turn messy quant ideas into structured, critiqueable, reusable research artifacts.

#### The problem that inspired us

Quant research is still fragmented and manual. Ideas live in notebooks, strategy rules get lost in chat logs, and lessons from failed experiments usually disappear after the run ends.

We wanted to build something that felt less like an AI wrapper and more like a real research partner:

- take in a research objective
- generate structured hypotheses and strategy specs
- critique feasibility and leakage risk
- store reusable lessons for the next run

What motivated us most was the gap between how **quants actually work** and how most AI tools are marketed. Real research is iterative, skeptical, and constrained by data quality, reproducibility, and execution rules. So instead of pretending to autonomously "find alpha," we built a system that is deliberately more honest and more useful.

> **Broad research, narrow execution.**

That became the guiding principle for the whole project.

#### How we built it

We built QuantCode as a **CLI-first workflow** with a **read-only dashboard** layered on top.

At a high level, the pipeline looks like this:

```text
Research objective
→ prior-art and mechanism research
→ hypothesis generation
→ data-feasibility gate
→ strategy formalization
→ validation gate
→ critique and experiment planning
→ memory compaction
→ reusable lessons for the next run
```

Under the hood, the Python pipeline runs a sequence of focused agents for:

- research direction
- prior-art discovery
- market-mechanism reasoning
- hypothesis generation
- data-feasibility checks
- strategy formalization
- validation
- critique
- experiment planning
- memory curation

The outputs are written into a local workspace as:

- strategy YAML
- run JSON
- Markdown reports
- compressed context packs

We also built a **Next.js dashboard** so judges and users can inspect the run timeline, critiques, memory, and compaction results without digging through raw files.

#### The key technical ideas

**1. Separate "interesting" from "valid."**  
In quant, a clever idea is not the same as a reproducible strategy. We added:

- a **feasibility gate** to decide whether a hypothesis is testable now, testable only with a proxy, or blocked by missing data
- a **validation gate** to reject vague or unsafe strategy definitions before they are written as structured specs

**2. Treat memory as infrastructure, not a chat log.**  
We used a **three-tier Redis memory design**:

- short-lived working traces
- episodic run memory
- durable semantic lessons

Instead of replaying full traces every time, we compact long runs into smaller context packs and promote only the useful lessons. That lets the system avoid repeating prior mistakes in future runs.

**3. Keep the system honest.**  
We were careful not to let the demo imply more than the product actually does. QuantCode is **not**:

- a live trading bot
- a broker integration
- a claim that every generated strategy works

We explicitly bounded experiment execution, used structured outputs, and kept a **human in the loop** so users can inspect what happened instead of trusting a black box.

#### Challenges we faced

The hardest challenge was **honesty**.

AI finance demos can easily sound more credible than they are. We did not want to build something that gestures at rigor while quietly hiding uncertainty. That forced us to keep strong boundaries between:

- research vs. execution
- suggestion vs. evidence
- generated output vs. validated artifact

The second big challenge was **scope control**. There were many tempting directions:

- live broker integrations
- more data connectors
- fully automated optimization loops
- richer evaluation systems

We cut most of that. The version we shipped focuses on the smallest system that still proves the core idea: an AI-assisted research workflow that writes structured artifacts, critiques itself, stores lessons, and improves the next run.

#### What we learned

We learned that AI is genuinely strong at:

- structuring messy research
- connecting prior art
- generating candidate hypotheses
- summarizing lessons across long traces

We also learned where it is weak: implying empirical validity without proper data, testing, and controls. That pushed us toward a design where AI **augments** quantitative research rather than replacing it.

From an engineering standpoint, we found that **strict schemas + explicit gates + memory compaction** were more valuable than adding more agent behavior. A simpler, well-bounded pipeline is easier to trust, easier to demo, and easier to extend.

#### Where we want to take it next

The next step is **not** to make the agent more autonomous.

The next step is to tighten the evaluation boundary with:

- a lightweight point-in-time backtester
- better data connectors
- stronger measured learning from backtest outcomes

The long-term vision is a research environment where ideas, critiques, evidence, and lessons **compound over time** instead of disappearing after each run.

## How does your project use Redis and The Token Company?

QuantCode runs a multi-step quant research pipeline. Each run produces a lot of intermediate reasoning, critiques, and constraints. Instead of throwing that away, we store it in Redis as agent memory, so later runs can retrieve useful lessons and avoid repeating mistakes.

We use three memory tiers in Redis.

Tier 1 is the raw agent trace: short-lived working memory stored with TTL.

Tier 2 is episodic memory: durable records for each run, including the objective, generated strategies, critiques, and provenance.

Tier 3 is semantic memory: boiled-down reusable lessons such as warnings, data constraints, and mutation rules.

Before promoting memory, we run our ResearchTrace Compiler on the Tier 1 trace. A raw research trace is noisy, so the compiler compacts it into a smaller context pack while preserving the decision-bearing parts.

It takes the full trace, removes near-duplicate events, and extractively keeps only the decision-relevant spans from each event verbatim. If the event output is structured, we parse it and strip boilerplate fields like IDs, timestamps, and schema metadata while preserving the actual verdicts, constraints, and critiques. It then marks critical lessons deterministically: any failed event, or any event from a critic or feasibility step, is treated as critical.

Those critical lessons are prioritized first under a hard token budget, and we measure `tokens_before`, `tokens_after`, `compression_ratio`, and `critical_lessons_retained`. If one boundary lesson does not fully fit, we keep a verbatim truncated head with an ellipsis rather than exceeding budget.

The result is a compact context pack plus candidate lessons for long-term memory. That gives us measured token savings and more importantly, a system that can learn across runs: run 1 produces a lesson, Redis stores it, and run 2 retrieves it before generating new strategies.
