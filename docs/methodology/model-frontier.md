# Urdais Model Frontier Methodology

**Version 1.0.0, approved 16 September 2026. Status: approved for production, effective from 16 September 2026.** Prepared from the Phase 3A capability-source research, and approved after the implementation was built and verified against the published source.

Model Frontier has no ingestion of its own beyond one published dataset, and no price of its own at all. It is a join: measured capability from Epoch AI, against Urdais Token Price, with a Pareto frontier drawn over the result.

## 1. The claim

> **Benchmark capability against provider list price per 1M tokens.**

That is the whole of it. Model Frontier is **not** a ranking of models by quality, not a measure of value for money, and not a statement about what anything costs to run.

## 2. The cost boundary

This is the most important paragraph in the document, because it is the thing most likely to be misread.

> Model Frontier compares benchmark capability with provider list price per 1M tokens. **Reasoning effort may change the number of tokens consumed, so equal unit token prices do not imply equal total cost per request or task.**

Urdais does **not** claim, on any surface, in any label, tooltip, heading or export:

- total inference cost
- cost per task
- the cheapest model to accomplish an outcome
- economic efficiency after accounting for reasoning-token consumption

Each of those requires usage or outcome data Urdais does not hold. The x axis answers *what a token costs*. Reasoning effort changes *how many are spent*. V1 measures only the first, and the gap between them is real: where one configuration dominates another at the same price, it bought that capability with tokens this chart does not count.

## 3. The plotted unit

A point is **one canonical priced model SKU under one source-declared configuration, on one benchmark.**

Epoch identifies an evaluation as a model plus an inference-time setting — `gpt-6-astra_max`, `qwen3.8-max-0902_xhigh`. Three facts are preserved separately and never merged: the canonical priced SKU, the configuration, and the raw source identifier.

**Urdais does not choose a preferred effort level.** There is no `standard` effort; the levels available differ per model, from one to six; and selecting the highest-scoring run would be score-maximising selection — the mirror of the cheapest-row price selection §5 exists to prevent. Plotting every published configuration selects nothing, and leaves domination to the rule rather than to an Urdais preference.

**Several configurations therefore share an x-coordinate.** Per-token price is a property of the SKU and does not move with inference-time settings, so a model's configurations form a vertical stack. That is a true picture of the published facts, and §2 is why it is not a complete economic one.

Where the source declares no configuration, the point is labelled **`(as published)`**. Nothing is inferred.

## 4. Capability source

**Epoch AI**, from the published `benchmark_data.zip` bundle — never the rendered dashboard.

- **Licence**: Creative Commons Attribution 4.0 International (CC BY 4.0), stated in the bundle's own `README.md`, so the grant travels with the data.
- **Citation**: *Epoch AI, 'Capabilities & Benchmarking'. Published online at epoch.ai. Retrieved from 'https://epoch.ai/benchmarks' [online resource].* Rendered wherever a frontier is shown. A retrieval whose README no longer states the CC BY licence is refused rather than ingested.
- **Eligibility**: only benchmarks Epoch administers itself. The bundle marks externally sourced files with an `_external.csv` suffix and states they retain their original licensing; Urdais ingests none of them. One licensor covers every row Urdais publishes.

For its internally administered benchmarks Epoch is the author of the measurements — it ran them, under documented settings — so it holds the rights it licenses.

## 5. Price

**Urdais Token Price methodology 1.2, adopted by reference**: a standardised workload of 500,000 input plus 500,000 output tokens, weighted 0.5 / 0.5, in **USD per 1M tokens**. Model Frontier does not define a blend of its own and changing it is a Token Price methodology change, not a Frontier one.

Which published price represents a model is decided **by named product characteristic, and the price is not read until the row is chosen** — the structural guarantee that frontier position cannot be improved by selection.

1. **Service tier `standard`.** Named, not cheapest: batch pricing is materially lower and is a different product with different latency guarantees, so a cheapest-wins rule would systematically select it. A provider publishing no standard tier yields no eligible price and the model is **excluded** rather than priced from another tier.
2. **The provider's declared base context tier**, or none where the provider publishes one price for the model.
3. **The provider's declared base region.** Anthropic's is none: its published table is the global list, its documentation states the first-party API is global by default, and the `us` rows are the `inference_geo` data-residency option at a 1.1× multiplier — an opt-in variant, not the base product.
4. **Both legs from the same selection.** Never a standard input against a batch output.
5. **Exactly one row per leg.** Zero excludes the model; more than one excludes it as ambiguous. There is deliberately **no tie-break**, because every tie-break available here is a price comparison under another name.

## 6. Model identity

A source identifier joins to a priced SKU only on an **evidenced** link. Links are exact decompositions against the priced catalogue, corroborated by the source's own organisation field:

- the identifier equals a priced SKU character for character, or equals a priced SKU followed by `_` and a configuration token; **and**
- the organisation the source attributes the result to is the provider Urdais prices that SKU under.

A string prefix alone is not evidence, which is why the second condition is required and why a row with no declared organisation does not link.

**Nothing is normalised.** No case folding, no suffix stripping, no preview-to-GA inference, no reasoning/non-reasoning collapse, no hosted-derivative guessing. Production holds the traps this protects against: `gemini-3.1-pro-preview` is priced separately from any GA sibling, and `grok-4.20-0309-reasoning` and `-non-reasoning` are two priced products whose scores must differ.

Four link states, and only the first is plotted:

- **`evidenced`** — the link is asserted on the evidence above.
- **`ambiguous`** — the identifier decomposes against more than one priced SKU, or the source's organisation disagrees with the provider Urdais prices that SKU under.
- **`unmapped`** — Urdais has not established the link. Resolvable by research, and the only one of the three that is.
- **`not_applicable`** — the source scored something that is not a purchasable model.

The other three **keep the observation and refuse the join**. A wrong link silently moves a point on a public chart; a missing one is visible in the exclusion counts.

## 7. The Pareto rule

For an eligible set on one benchmark, a configuration is on the frontier when **no other configuration on that benchmark** has:

- score ≥ its score, **and**
- blended price ≤ its price,

with at least one strict inequality.

- **Domination is configuration-level**, never model-level. A model may be on the frontier under one configuration and not another.
- **Computed independently per benchmark.** A GPQA Diamond point is never compared with a FrontierMath point; the scores measure different things on different question sets.
- **Exact ties both survive**: two points identical on both axes do not dominate each other, because neither is strictly better on either axis.
- **Duplicate `(SKU, configuration, benchmark)` points are refused**, not resolved. Two rows for one key mean the source published a result twice or the identity layer produced two links, and picking one would hide the defect.
- Ordering is by price, then score, then identifier, so the drawn path and the reported list are stable across runs.

## 8. Temporal semantics

**Model Frontier V1 is a current-state product, not a historical series.**

Capability and price carry **separate dates** and are never blended into one synthetic as-of:

- `capability_as_of` — when Epoch ran the evaluation. These span months, because models are scored when they are released.
- `price_as_of` — when Urdais observed the provider's published price.

Both are rendered. **The chart does not reconcile them**, and says so: a model's capability was measured when it was measured, and its price is the one observed on a later single date.

**No historical frontier is published**, and none is implied. Urdais holds one price observation date, so a frontier series is not yet possible; it becomes possible when Token Price has scheduled ingestion and real price history. Nothing is backfilled to suggest otherwise.

## 9. Exclusions

Every observation that does not become a point is **counted and reported beside the chart**: unmapped identity, ambiguous identity, and linked models with no eligible price. A partial frontier looks exactly like a complete one — every remaining point is correct, the axes are right — so the shortfall is stated rather than left to be inferred.

Epoch scores many models Urdais does not price. Those are `unmapped`, and their count is the honest measure of how much of the evaluated field this chart covers.

## 10. Revisions

An observation whose content hash changes is **superseded**, never overwritten; both rows remain and the frontier is derived at read time from live rows only. A revised score therefore changes the chart on the next request, with nothing to invalidate and nothing that can go stale.

Ingestion is idempotent by content: a bundle whose bytes hash to the last ingested one writes nothing. A scheduled retrieval confirming unchanged data is **not** a data rollover, and the two are reported differently.

## 11. V1 scope

**Benchmarks**: GPQA Diamond, and FrontierMath Tiers 1–3 v2. Two, chosen for coverage and for measuring different things — graduate-level science reasoning and research-level mathematics.

Deliberately not shipped: **SWE-bench Verified**, which reaches four priced models — so **V1 has no coding frontier**, which is a coverage fact rather than a preference; **MATH Level 5**, which reaches one; and **Mock AIME**, which has the best coverage of the five and duplicates FrontierMath's dimension.

**No composite score.** A single capability axis would require weights across incompatible benchmarks that Urdais would have to invent and defend. Named benchmarks keep every plotted number a real published measurement with its own citation.

**Point styling is neutral.** Open-weight and proprietary models are not distinguished, because that classification does not exist in Urdais production yet and inferring it from a model's name is precisely what §6 forbids.

## 12. Versioning

A new version is required to change: the capability source or the eligible benchmark set; the plotted unit; the price selection rule or the blend it references; the identity rules; the Pareto rule; or the temporal policy.

A new version is **not** required to add a model the source begins scoring inside the already-declared benchmark set, or to record a revision under §10.

## Version history

**1.0.0, approved 16 September 2026, effective 16 September 2026**: first production version. Establishes the claim and the cost boundary; Epoch AI as the capability source under CC BY 4.0, restricted to Epoch-administered benchmarks; GPQA Diamond and FrontierMath Tiers 1–3 v2 as the V1 set; the configuration-level plotted unit; exact evidenced identity with three non-plotting refusal states; named price selection by reference to Token Price 1.2; configuration-level Pareto domination; separate capability and price dates with no historical series claimed; and reported exclusions.
