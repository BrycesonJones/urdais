# Model Frontier — Phase 3A blocker resolution

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026 by measuring Epoch AI's published benchmark bundle against UrdaisProd. No implementation, no ingestion, no schema, no migration and no approved methodology is created by this document.

**Outcome: all blockers closed.** Two were closed by evidence; measurement opened a third, and it was resolved by decision on 16 September 2026 — recorded in §8. Phase 3A is complete.

## 1. Epoch join coverage — measured

Downloaded `benchmark_data.zip` from Epoch's published path. The bundle's own `README.md` restates the licence and citation, which is the strongest form the evidence could take — the grant travels with the data:

> Epoch AI's data is free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license.

It also resolves the internal/external split **mechanically**: files carrying the `_external.csv` suffix are externally sourced; files without it are Epoch-administered. `benchmark_metadata.csv` confirms this per benchmark with a `source_file` column. The five V1 candidates are all unsuffixed, so **"which rows are safe" is answerable by filename**, not by interpretation.

### Coverage against the 34 price-eligible SKUs

Two numbers per benchmark, because Epoch's identifiers make the distinction unavoidable. "Exact" is strict string equality against the SKU. "+effort" counts SKUs reachable only as `<sku>_<effort>` — `qwen3.8-max-0902_xhigh`, `gpt-6-astra_max`.

| benchmark | exact | +effort | SKUs reached | of 34 | points | score dates |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **GPQA Diamond** | 8 | 16 | **24** | 71 % | 44 | 2025-10-16 → 2026-09-02 |
| **Mock AIME 2024-25** | 8 | 17 | **25** | 74 % | 45 | 2025-10-16 → 2026-09-02 |
| **FrontierMath Tiers 1-3 v2** | 5 | 18 | **23** | 68 % | 25 | 2026-06-10 → 2026-09-02 |
| **FrontierMath Tier 4 v2** | 5 | 18 | **23** | 68 % | 29 | 2026-06-10 → 2026-09-02 |
| SWE-bench Verified | 3 | 1 | **4** | 12 % | 4 | 2026-02-13 → 2026-06-01 |
| MATH Level 5 | 1 | 0 | **1** | 3 % | 2 | 2025-10-16 → 2025-10-22 |

Nine SKUs carry no Epoch score on any of the six and are unmapped throughout: `gpt-5.6-cyber`, `grok-4.20-0309-non-reasoning`, `grok-4.20-multi-agent-0309`, `grok-build-0.1`, `kimi-k2.7-code-highspeed`, `qwen3-max`, `qwen3.7-max-2026-05-20`, `qwen3.7-max-2026-06-08`, `qwen3.8-27b`.

### The joined list, GPQA Diamond (24 SKUs)

Exact: `claude-haiku-4-5-20251001`, `claude-opus-5`, `gemini-2.5-pro`, `gemini-3.1-pro-preview`, `grok-4.20-0309-reasoning`, `kimi-k2.6`, `kimi-k2.7-code`, `qwen3.6-max-preview`.

Effort-suffixed only: `claude-sonnet-5`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `grok-4.3`, `grok-4.5`, `grok-4.6`, `kimi-k3`, `qwen3.8-max`, `qwen3.8-max-0902`.

**Read that second list carefully. It is every current flagship.** A strict exact-only frontier would plot 8 models and omit `gpt-6-astra`, `grok-4.6`, `gemini-3.8-flash`, `claude-sonnet-5`, `kimi-k3` and `qwen3.8-max` — a "frontier" chart with the frontier missing, which is a worse misstatement than showing nothing.

## 2. The new blocker: reasoning-effort configuration

Epoch identifies a run as **model + inference-time effort**, and the levels differ per model: `gpt-6-astra` carries six on FrontierMath Tier 4 v2 (`none`, `low`, `medium`, `high`, `xhigh`, `max`); `grok-4.5` carries one (`high`); `claude-haiku-4-5-20251001` carries a thinking budget (`32K`) rather than an effort level at all.

That is better practice than a bare alias — the mismatch is visible rather than silent. It also creates a problem the price axis cannot absorb:

> **Per-token price is invariant to reasoning effort. Capability and token consumption are not.**

So `gpt-6-astra_max` and `gpt-6-astra_low` sit at *identical x* with different y. Any Pareto rule then reports that maximum effort dominates — true on the axes plotted, and economically misleading, because the high-effort configuration consumes far more tokens per task at the same per-token rate. The blended price answers "what does a token cost", and effort changes "how many tokens", which the axis does not show.

This is the exact mirror of the price cherry-pick the selection rule was built to prevent, and it is **not** solved by picking one effort per model: there is no `standard` effort, the available levels differ per model, and choosing the highest-scoring one is score-maximising selection by another name.

### Resolution — **approved 16 September 2026**, see §8

**Plot each `(model, effort configuration)` as its own entity**, effort rendered in the label, and disclose on the surface that per-token price does not vary with effort while token consumption does.

The argument for it is that **nothing is selected**. Every published configuration is plotted, and domination is left to the Pareto rule operating over legitimately distinct points rather than to a rule that picks a representative score. A frontier point then means something exactly true: *at this per-token price, this capability was measured under this configuration.* The alternatives all require Urdais to choose which score speaks for a model, which is the thing the identity policy refuses elsewhere.

The honest cost, which belongs in the methodology rather than a footnote: a reader comparing two points at the same x is not comparing two equal-cost options.

This was a methodology decision with a public consequence, so it was referred rather than taken. It was approved, with a semantic boundary attached. §8 records what was approved and what the product may therefore never claim.

## 3. Anthropic base region — resolved to `region = null`

Five independent lines of evidence, and they agree.

**Anthropic's published pricing table** lists one global list price per model — Opus 5 `$5 / $25`, Sonnet 5 `$2 / $10`, Haiku 4.5 `$1 / $5`, Fable 5.1 `$10 / $50`. Those are **exactly** the `region = null` rows in production.

**Anthropic states the default explicitly**: *"The Claude API (first-party) is global by default"*, and under data-residency pricing, *"specifying US-only inference through the `inference_geo` parameter incurs a 1.1x multiplier on all token pricing categories. Global routing (the default) uses standard pricing."*

**The production data matches that multiplier exactly.** Every `us` row is `null × 1.1`: 10→11, 50→55, 5→5.5, 25→27.5, 2→2.2, 10→11.

**Token Price has already decided it.** The approved Anthropic constituent in `src/lib/tokens/read/benchmark.ts` declares `baseRegion: null`. Model Frontier adopts it by reference rather than re-deciding it.

**And `us` fails a structural test**: `claude-haiku-4-5-20251001` has no `us` row at all, so a `us` rule would exclude a model for lacking an opt-in surcharge.

On the anti-cherry-pick requirement: `null` is the cheaper row, and it is **not chosen for that reason**. It is chosen by name — the default, standard, unscoped product — and the same evidence would select it if the multiplier were below 1.0. `us` is an opt-in data-residency variant, not the base product.

## 4. Recommended V1 benchmark set — two frontiers

**GPQA Diamond** and **FrontierMath Tiers 1-3 v2.**

| | why |
| --- | --- |
| GPQA Diamond | best coverage (24 SKUs, 44 points); graduate-level science reasoning; the most widely recognised of the five, so a reader can sanity-check it |
| FrontierMath Tiers 1-3 v2 | 23 SKUs; **tightest score-date window by far** (3 months vs 11); a genuinely different dimension — advanced mathematics; ~1 point per SKU, so fewer effort variants to disclose |

**Dropped, and why:**

- **SWE-bench Verified — 4 SKUs.** Not a frontier. Painful, because coding is the most economically relevant dimension, and its absence is a coverage fact rather than a preference. **V1 ships with no coding frontier.**
- **MATH Level 5 — 1 SKU.** Not a chart.
- **Mock AIME — 25 SKUs, the best coverage of all.** Dropped anyway: it is competition mathematics, the same dimension FrontierMath already carries, so it adds points without adding an axis. Two complementary frontiers beat three where two are correlated. Reconsider it only if FrontierMath is rejected.
- **FrontierMath Tier 4 v2** — same dimension as Tiers 1-3, harder. A candidate to swap in, not to add.

Two selectors, not five. The brief asked for the smallest strong set, and the data supports exactly two.

## 5. Temporal disclosure wording — draft

The measured spreads make this concrete rather than theoretical: GPQA Diamond scores span **2025-10-16 to 2026-09-02**, nearly eleven months, against a price snapshot from a **single day**.

Proposed surface wording:

> **Capability** — GPQA Diamond, measured by Epoch AI. Each model's score carries its own evaluation date, shown on the point; scores on this chart were run between {first} and {last}.
>
> **Price** — Urdais Token Price, `0.5 × input + 0.5 × output` per 1M tokens, from the provider's published standard rate observed on {price_as_of}.
>
> **These dates differ, and the chart does not reconcile them.** A model's capability was measured when it was measured; its price is the one observed on a single later date. Neither is adjusted to the other.
>
> **No historical frontier is published.** Urdais holds one price observation date, so this is a current-state view. A frontier series begins when Token Price has scheduled ingestion, and nothing here is backfilled to imply one.

Plus, if the effort resolution in §2 is approved:

> Points are labelled with the reasoning-effort configuration Epoch used. Per-token price does not vary with that configuration; token consumption does, so two points at the same price are not two equal-cost options.

## 6. Open-weight classification — plan only, not built

Not needed for the current chart beyond the existing filled/ringed distinction, so nothing is implemented here.

**A useful discovery:** Epoch's `model_metadata.csv` carries an `accessibility` column across 1,063 models with a four-way taxonomy — `API access` (491), `Open weights (unrestricted)` (249), `Open weights (restricted use)` (120), `Open weights (non-commercial)` (28), plus `Unreleased` (13) and `Hosted access (no API)` (11).

That is a strong **worklist and cross-check**, and it is CC BY so it may be used. It is **not** the primary evidence: it is a third party's assertion, and the standing rule is that classification comes from the publisher's own model card or weights licence.

Planned shape for Phase 3B/4:

```
reference.model_access_class (
  model_id      uuid unique  → reference.models(id),
  access_class  text         → open_weight_unrestricted | open_weight_restricted
                             | open_weight_non_commercial | proprietary_api | hosted_no_api,
  evidence_url  text not null,     -- the model card or licence, not a marketing page
  evidence_source text not null,   -- 'publisher model card' | 'weights licence'
  licence_name  text,              -- the weights licence where one exists
  corroboration text,              -- e.g. 'Epoch accessibility: Open weights (unrestricted)'
  verified_at   date not null,
  verified_by   text not null
)
```

Rules: never classified from a name — `gpt-oss` and `gpt-5.6-luna` share a prefix and differ. A hosted derivative takes its **serving** identity until the card is checked. A model with no verified row is **unclassified** and renders in neither group rather than defaulting to proprietary. Shared with Phase 4, built once.

## 7. Phase 3A decision

**Epoch remains approved.** Measurement strengthened the licensing case rather than weakening it: the grant ships inside the bundle, and the internal/external split is a filename convention rather than a judgement call.

| | |
| --- | --- |
| **Source** | Epoch AI, Epoch-administered benchmarks only, CC BY 4.0 |
| **V1 benchmark set** | GPQA Diamond · FrontierMath Tiers 1-3 v2 |
| **Anthropic region** | `region = null` — resolved on primary-source evidence |
| **Plotted unit** | canonical priced SKU + source-declared configuration (§8) |
| **GPQA Diamond** | **44 points across 24 SKUs** |
| **FrontierMath Tiers 1-3 v2** | **25 points across 23 SKUs** |
| **V1 coding frontier** | none — SWE-bench Verified reaches 4 SKUs |
| **Blockers remaining** | **none** |

## 8. Approved: configuration-level capability observations

Approved 16 September 2026. **The plotted unit is the canonical priced model SKU plus the source-declared reasoning effort or configuration.**

Epoch's effort runs are **never collapsed** into one score and no "representative" effort level is selected. For `gpt-6-astra_max`, three facts are preserved separately:

| field | value |
| --- | --- |
| canonical priced SKU | `gpt-6-astra` |
| capability configuration | `max` |
| raw source identifier | `gpt-6-astra_max` |

The **capability score belongs to that exact configuration**. The **token price belongs to the underlying SKU** under the price selection rule already approved in the [source decision memo](./phase-3a-source-decision.md) — `standard` service tier, named base context tier, named base region, selected by name and never by price.

Several configurations of one SKU therefore share an x-coordinate and differ in y. **Pareto efficiency is computed over configurations, not over canonical model identities.**

### Measured consequence

| | GPQA Diamond | FrontierMath T1-3 v2 |
| --- | ---: | ---: |
| plotted points | **44** | **25** |
| distinct priced SKUs | 24 | 23 |
| SKUs with more than one configuration | **12** | **1** |
| duplicate `(SKU, configuration)` pairs | **0** | **0** |
| configurations observed | `(as published)`, `32K`, `none`, `minimal`, `low`, `high`, `xhigh`, `max` | `(as published)`, `none`, `low`, `high`, `xhigh`, `max` |

Two properties matter. **No `(SKU, configuration)` pair repeats**, so the plotted key is unique, the ordering is total and the frontier is deterministic without a tie-break rule. And the two frontiers have very different exposure to stacking: half of GPQA's SKUs carry multiple configurations, against **one** on FrontierMath — where the caveat below is nearly theoretical.

A row whose configuration Epoch did not declare is recorded as `(as published)` rather than assigned a level. That is a fourth thing Urdais will not guess.

### The semantic boundary — the condition of approval

> Model Frontier compares **benchmark capability** with **provider list price per 1M tokens**. Reasoning effort may change the number of tokens consumed, so **equal unit token prices do not imply equal total cost per request or task.**

The product **must not claim**, in any surface, label, tooltip, heading or export:

- total inference cost
- cost per task
- the cheapest model to accomplish an outcome
- economic efficiency after accounting for reasoning-token consumption

Every one of those requires usage or outcome data Urdais does not hold. The axis answers *what a token costs*; effort changes *how many are spent*; and V1 measures only the first. Two points at the same x are two prices per token, not two equal-cost options — and where one dominates the other, it has bought that capability with tokens this chart does not count.

This boundary is what makes configuration-level plotting honest rather than merely convenient. It is not a caveat bolted on afterwards; it is the reason the approach is admissible at all.

### UI requirements

- The **model is the primary label**. The configuration is **secondary metadata**, subordinate in the visual hierarchy.
- Effort variants are **never presented as unrelated commercial SKUs**. They are one purchasable model observed under different settings, and the chart must read that way.
- Every tooltip exposes, at minimum: **source benchmark · score · effort/configuration · capability as-of date · price as-of date · blended unit price**.

### Methodology requirements

The published methodology must state, in its own words and not by implication:

1. **Why Urdais does not choose a preferred effort level.** There is no `standard` effort; the available levels differ per model; and selecting the highest-scoring one would be score-maximising selection — the mirror of the cheapest-row price selection the price rule exists to prevent. Plotting every published configuration selects nothing.
2. **Why several configurations can share an x-coordinate.** Per-token price is a property of the SKU and is invariant to inference-time settings.
3. **That domination is configuration-level.** A frontier point is a configuration, not a model, and a model may appear on the frontier under one configuration and not another.
4. **That total token consumption is outside V1**, together with the four claims the product does not make.

### Decisions carried forward unchanged

Epoch AI as the V1 source · Option C, benchmark-specific frontiers · GPQA Diamond and FrontierMath Tiers 1-3 v2 · Anthropic base region `null` · exact evidenced identity links only, unmatched stays unmatched · named price selection, never cheapest-row selection.

**Phase 3A is complete.**
