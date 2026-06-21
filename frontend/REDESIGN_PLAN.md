# QuantCode Dashboard — UI Redesign Plan

**Goal:** make the dashboard (a) more **readable** and (b) reorganized around how a **quant
researcher** and a **retail trader** actually use it — without losing the AgentQR aesthetic.

Status: PLAN (no code changed yet). Decisions marked **🔶 NEEDS CONFIRMATION** are the only
things blocking implementation. Dev server hot-reloads, so changes land live as we go.

---

## 1. Where we are

Next.js app mirroring AgentQR. Pages: Overview, Memory, Compaction, Runs, run-detail. Read-only
FastAPI backend (verified working). Faithful dark mono aesthetic, clean components, graceful
empty/error states.

**Two real problems:**

- **Readability.** Almost everything is `text-[10px]`/`[11px]` IBM Plex **Mono** in
  `muted-foreground` (45% gray). Mono is great for tickers/numbers but hard for the *prose*
  QuantCode is full of (hypotheses, critiques, lessons). And there's **no hierarchy** — chrome
  labels, body text, and the key findings all render at the same size/weight, so the eye can't
  find what matters.
- **Shape.** The UI is researcher/infra-shaped and **has nothing for a trader**. Strategies are
  buried inside run-detail. Run-detail also **drops data** (see §3.3): it never renders
  `transaction_cost_risks` or `data_quality_risks`, skips `economic_rationale`, and shows only
  entry/exit rules (not ranking/portfolio/risk rules, universe, failure modes).

---

## 2. Personas & journeys

### 2a. Quant researcher — judges rigor + learning
Journey: open a run → *which hypotheses passed feasibility and **why** (missing data?)* → *what
did the critic flag — leakage / overfitting / cost / data-quality* → *the full strategy spec* →
*did run 2 avoid run 1's mistake?*
Current friction: the critique (the gold) is tiny muted bullets and **partially unrendered**;
no economic rationale; partial spec; the learning loop is only one sentence on Overview.

### 2b. Retail trader — "did it find anything usable, is it good, what's the risk, is it safe?"
Journey: scan strategies → **verdict** (accept/revise/reject) → plain "what it does" + main risk
→ the honest "not backtested / not advice."
Current friction: **no strategy view exists.** Must open each run and scroll. No verdict-forward
framing, lots of jargon.

---

## 3. The plan

### 3.0 🔶 DECISIONS NEEDED (pick before building)

- **D-A — Readability approach.** The core issue is prose in 10px muted mono.
  1. **Sans for prose, mono for data/chrome** *(recommended — biggest readability win)*: a clean
     sans for hypotheses/critiques/lessons; keep mono for numbers, labels, rules, TopNav. Slight
     vibe shift from all-mono but still looks intentional.
  2. **Keep all-mono, bigger + higher contrast** *(safest aesthetically)*: same IBM Plex Mono,
     bump body to ~12–13px, brighten content vs muted chrome, more leading.
  3. Minimal — contrast + spacing only.
- **D-B — Scope.** Which of §3.2–3.5 to build (recommend all; §3.1 readability happens regardless).
- **D-C — Strategies data source** (for §3.2): add a small backend `GET /strategies` aggregate
  endpoint *(recommended — clean, one request)* vs aggregate client-side by fetching every packet.
- **D-D — Overview emphasis / nav order.** Lead with the trader path (Strategies first) or the
  researcher path (Runs/Memory first)? Recommend nav: **Overview · Strategies · Runs · Memory ·
  Compaction** (Strategies promoted; researcher tools still one click away).

### 3.1 Readability foundation (applies to every page)
- **Type scale:** section titles ~14px; body/prose ~13px; data/labels stay mono 10–11px. Bump the
  pervasive `text-[10px]/[11px]` prose up a step.
- **Contrast/hierarchy:** content in `foreground`; reserve `muted-foreground` for labels/chrome
  only. Make the *important* thing (verdict, leakage warning, ratio) the most prominent element
  on each card, not uniform with everything else.
- **Spacing/leading:** more line-height on prose blocks; a bit more padding in dense tables.
- **Font (per D-A):** if option 1, add a sans via `next/font` and apply to prose; keep `.font-mono`
  for data. Update shared primitives (`Label`, `StatCard`, table `Th/Td`, `SectionHeader`) so the
  whole app inherits the new scale in one place.

### 3.2 NEW — Strategies catalog (trader home) `/strategies`
- Top-level page + TopNav entry. Cards (or a scannable table), one per strategy across all runs:
  **verdict** (accept=green / revise=amber / reject=red, the headline) · strategy name · family ·
  readiness · one-line plain hypothesis · **top risk** (first leakage/major issue) · `not executed`
  badge · link to its run.
- Filter/sort by verdict (e.g. "show only accept-for-backtest").
- Prominent honest framing: research only, not backtested, not advice.
- **Data:** per D-C — add `GET /strategies` → `[{run_id, strategy_name, family, readiness,
  hypothesis, verdict, top_risk, confidence}]` (join strategy_specs × critiques server-side), or
  aggregate client-side from packets.

### 3.3 Richer run-detail (researcher)
- Lead with a **verdict summary** strip (accepted / revise / reject counts; advanced vs deferred).
- **Critique = visual centerpiece:** render *all* risk categories — leakage, major issues,
  overfitting, **transaction-cost (currently missing)**, **data-quality (currently missing)** —
  plus `economic_rationale_strength` and suggested mutations, color-weighted by severity.
- **Full strategy spec:** add `economic_rationale`, `universe`, ranking/portfolio/risk rules,
  `required_data`, `expected_failure_modes` (today only hypothesis + entry/exit show). *(Needs the
  packet to include these — confirm the API returns full specs; extend types if so.)*
- **Feasibility:** make "why deferred" (missing_data / data-quality risks) prominent, not tiny.

### 3.4 NEW — Run 1 → Run 2 learning comparison
- A view (own page `/learning` or a panel on Overview) that picks two comparable runs and shows:
  the **lesson retrieved** into the later run, and how behavior changed (e.g. a proxy flagged /
  requirement added). The proof-of-learning, currently just narrated.
- **Data:** uses `retrieved_lessons` / `produced_lessons` + episodes already in the API.

### 3.5 Overview reframe
- Clear one-liner of what QuantCode is + two explicit entry points: **Strategies** (trader) and
  **Runs/Memory** (researcher). Keep the proof-of-learning callout (link it to §3.4). Keep the
  disclaimer.

---

## 4. Components to add / change
- **Change (shared):** `Label`, `StatCard`, `Pill`, `SectionHeader`, table `Th/Td` → new type
  scale + contrast (one place → whole app benefits).
- **Add:** `StrategyCard` (verdict-forward), `RiskGroup` (all critique risk categories), `Prose`
  (readable body wrapper), maybe `Stat`/`Metric` for the big numbers.
- **Change (pages):** `app/page.tsx`, `app/runs/[run_id]/page.tsx`, TopNav (+ new
  `app/strategies/page.tsx`, optional `app/learning/page.tsx`).

## 5. Backend touch (only if D-C = endpoint)
- Add `GET /strategies` to `quantcode/dashboard/api.py` (read-only aggregate from packets) +
  mirror the type in `frontend/src/types`. Re-run ruff + mypy. Everything else is frontend-only.

## 6. Verification
- `cd frontend && npm run build` green after each phase (type-check + build).
- Manual: each page against the live API (data already seeded: run_001/002, 2 lessons).
- If backend touched: `.venv/bin/ruff check quantcode/ && .venv/bin/mypy quantcode/` + a quick
  `/strategies` curl.

## 7. Out of scope
Auth, any write/mutation, real backtest numbers, heavy charting beyond the compaction bar,
mobile-first layout. Stays read-only.

## 8. Suggested sequence
1. §3.1 readability foundation (shared primitives + type scale) — immediate, visible win.
2. §3.2 Strategies catalog (+ `/strategies` if D-C=endpoint).
3. §3.3 run-detail enrichment.
4. §3.5 Overview reframe.
5. §3.4 learning comparison.
Build green + eyeball after each.
