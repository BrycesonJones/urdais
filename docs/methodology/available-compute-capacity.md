# Available Compute Capacity Methodology

**Version 0.1.0, draft, 17 September 2026. Status: draft. No value is published under this version and none may be.** Prepared from the UCPI H100 SXM Phase 1 source study, the Phase 2 terms reviews recorded in `reference.source_interfaces`, and a direct audit of every compute source interface registered in the Urdais production database.

Prepared under the [Urdais methodology framework](/docs/methodology). Facts marked *measured* were observed against real responses or the production database; facts marked *documented* come from a source's own documents.

This document defines a **dataset**, not an index. There is no level, no base date and no weighting. There is a population of observations and a set of aggregations over it.

---

## 1. Objective

Available Compute Capacity measures:

> **How much rentable AI compute is visibly available in the market at a point in time, and how that availability is distributed across GPU types, providers and regions.**

The word *visibly* is load-bearing. The dataset measures what sources state, not what exists.

### 1.1 The two statements this methodology exists to make

> **Published or advertised compute pricing does not itself constitute evidence of available compute capacity.**

> **Available Compute Capacity measures observable market supply, not total installed fleet capacity and not provider utilization.**

Both are mandatory in any presentation of this dataset.

### 1.2 What this dataset is not

It is not, and must never be described as:

- total installed GPU fleet, globally or per provider
- provider utilization, occupancy or idle capacity
- a forecast of future supply
- a measure of capacity that is *not* rentable — reserved, internal, or committed
- a measure of anything a provider has not stated

**Provider utilization is explicitly out of scope and is not estimable from this data.** Utilization is rented ÷ installed. This dataset observes neither term. It observes what a provider says is available, which is a third quantity related to both only through facts no source discloses. The Fleet Utilization surface that preceded this dataset was demonstration data and was removed rather than reinterpreted, because no arrangement of observable supply data produces a utilization rate.

---

## 2. Definition of available capacity

An observation of available capacity is a **statement by a source, about a named configuration, that some amount of it can be rented now**.

Three things must hold. The source must state availability explicitly; the statement must attach to a resolved hardware configuration; and the statement must have been retrieved through a permitted and reproducible path.

### 2.1 What does not establish capacity

None of the following is an observation of available capacity, and none may be converted into one:

- **A published hourly price for an H100** establishes a price observation. It says nothing about supply.
- **A product page listing an H100** establishes that the product exists in a catalog.
- **A provider's revenue, funding or size** establishes nothing.
- **Estimated fleet size or GPU shipment data** establishes nothing about what is rentable now.
- **Datacenter megawatts or floor space** establishes nothing about accelerator availability.
- **A prior availability observation** establishes what was true then. It is never carried forward as now.
- **A count of marketplace listings** establishes a count of listings, unless each listing states its own quantity.

The first row is the one that matters most in practice, because a price feed is the easiest thing to obtain and the most tempting thing to misread. Urdais's largest compute source, Price of Compute, publishes listed prices for sixteen providers and states in its own documentation that these are *"listed prices, not guaranteed availability"* and *"Listed ≠ attainable."* Sixteen priced providers is therefore **zero** observed providers under this methodology.

This rule is enforced structurally rather than by convention: capacity observations are rows in `pipeline.capacity_observations`, price observations are rows in `pipeline.normalized_observations`, and no code path converts one into the other. A price row cannot accidentally become a capacity row because it is a different row in a different table with different constraints.

---

## 3. Measurement hierarchy

Sources differ in precision, and the dataset records the difference rather than flattening it. Every observation declares its tier, and the tier governs which values it may carry. The constraint is in the database, not only in code.

**Tier 1 — Exact quantity.** The source stated a number of available units, for example `128 H100 SXM available in us-east`. Permitted columns: `available_quantity`, `quantity_unit`.

**Tier 2 — Quantity range.** The source stated bounds, for example `50–100 available`. Permitted columns: `quantity_min`, `quantity_max`, `quantity_unit`.

**Tier 3 — Availability state.** The source stated availability with no number, for example `H100 available in us-east`. Permitted column: `availability_state`.

**Tier 4 — Unknown.** No usable capacity signal. No value column may be populated.

### 3.1 The prohibition

**Tier 3 and Tier 4 observations never become numbers.** A source reporting an instance type as available, with no quantity, is one availability-state observation. It is not one GPU, not one node, and not one of anything countable. A source reporting nothing is not zero.

This is the single most important rule in this document. Violating it would let coverage — the number of providers Urdais happens to have integrated — masquerade as supply.

### 3.2 Zero is not unknown

A Tier 1 observation of `0` is a real and informative observation: the source was asked and said none are available. It is stored as `available_quantity = 0` with `measurement_type = 'exact_quantity'`, and it participates in totals as a zero.

Not knowing is `measurement_type = 'unknown'` with every quantity column null. The two must never be represented the same way, and a collector failure produces the second, never the first.

### 3.3 Units

A quantity states what it counts: `accelerator`, `node`, or `instance`. These are not interchangeable and are not summed together. A node count converts to an accelerator count only where the configuration's accelerators-per-node (`gpus_per_unit`) is separately evidenced; where it is not, the observation aggregates only within its own unit.

---

## 4. Eligible sources

A source is eligible when **all** of the following hold:

1. It is registered in `reference.source_interfaces`.
2. Its `terms_review_state` is `permitted`.
3. Its `production_access_state` is `production_approved`.
4. It has a row in `reference.capacity_signal_capabilities` with `max_measurement_tier ≤ 3`.

Capability and permission are separate axes and both are required. The most capable capacity interface found anywhere in the compute market is one Urdais has been refused in writing; capability does not cure that, and no alternative endpoint, cache or intermediary cures it either, because what was refused was the use and not the road.

### 4.1 Source audit, 17 September 2026

Every compute-side interface registered in production, and what it can support. *Measured* against the production database and the recorded terms reviews.

**`vast-ai-offer-search` — Tier 1, not permitted.** Carries a per-offer `rentable` boolean with `num_gpus`, making it the only interface found anywhere that explicitly encodes a quantity per listing. Its Terms of Use place availability and capacity data outside the licensed purposes and reserve index rights to the publisher. Separately from permission, it cannot enumerate its own population: it caps responses at 64 records while reporting `truncated: false`.

**`runpod-gpu-types` — Tier 3, not permitted.** Carries a four-level per-datacenter availability signal, conditional on requested GPU count and country. Refused in writing on both axes on 14 September 2026.

**`lambda-instance-types` — Tier 3, blocked.** Carries `regions_with_capacity_available` per instance type. Terms under review.

**`digitalocean-sizes` — Tier 3, under review.** Carries an `available` boolean with a `regions` array. Both axes need written confirmation.

**`aws-price-list-bulk` — Tier 4, permitted.** No capacity signal.

**`azure-retail-prices` — Tier 4, permitted.** No capacity signal.

**`price-of-compute-prices` — Tier 4, approved.** No capacity signal; the publisher disclaims availability explicitly.

**The intersection of permitted and capable is empty.** Every interface that carries a capacity signal is blocked or refused, and every interface that is permitted carries none. This is the reason no value is published under this version.

### 4.2 Consequence

The dataset is defined, built, tested and operating. It holds zero observations, and it says so. It will hold real observations on the day any capable interface is permitted, with no further schema or methodology change — the collector contract, the tier constraints and the aggregation rules are already in place and already exercised by tests.

A small first dataset is acceptable. A fabricated one is not. Where coverage is zero, the surface reports zero coverage.

---

## 5. Normalization

Normalization is confined to what can be checked against the preserved source value.

**Preserved unchanged.** Every observation stores `source_native_value` — the source's own expression of availability — and `source_native_field`, the field it came from. Any normalization below can therefore be re-derived and audited.

**GPU identity** resolves to a canonical `normalized_gpu_type` using the same vocabulary and the same hardware identity grading as UCPI. An observation whose hardware cannot be resolved above grade C does not aggregate by GPU type; it remains in the population and in the provider count.

**Regions** map to canonical ISO country codes through `reference.region_mappings`, with the mapping's evidence recorded. `source_native_region` is retained regardless. An unmapped region does not aggregate by region; it still aggregates into totals.

**Availability states** map to the family vocabulary: `available`, `limited`, `waitlisted`, `sold_out`, `quote_required`, `unknown`. A source's own wording maps by a documented rule per interface, never by inference from adjacent fields.

**Not normalized.** Quantities are never converted between units without evidenced `gpus_per_unit`; availability is never inferred from price, presence in a catalog, or the behaviour of a neighbouring region.

---

## 6. Aggregation

Only quantitative observations — Tiers 1 and 2 — enter numeric totals.

### 6.1 Total observed available capacity

For a set of eligible, fresh, non-superseded Tier 1 observations at time *t*:

$$C_t = \sum_{i=1}^{n} c_{i,t}$$

where each $c_{i,t}$ is an explicitly reported available quantity in a single unit.

Tier 2 observations aggregate as a **bounded interval**, never as a midpoint:

$$\left[\sum_{i} \min_i,\ \sum_{i} \max_i\right]$$

A midpoint would be a number nobody reported. Tier 1 and Tier 2 totals combine into one interval whose lower bound includes every exact quantity and every minimum, and whose upper bound includes every exact quantity and every maximum. Where only Tier 1 observations exist, the interval is a point.

### 6.2 Permitted breakdowns

By GPU type; by provider; by region; by provider × GPU; by region × GPU. Each breakdown carries its own coverage statement, because a breakdown is a different sample from the total.

### 6.3 Categorical observations are reported separately, always

Tier 3 observations are counted, never summed, and are reported as a count of providers and configurations alongside the numeric total — never inside it. The published form is:

> 742 GPUs observed available across 5 quantitative sources.
> 3 additional providers report H100 availability without stating a quantity.

The second line never becomes "745".

### 6.4 Deduplication

The deduplication key is `capacity_source_entity_id` — the infrastructure operator where determinable, the seller otherwise — combined with the configuration and the region. Two interfaces reporting the same capacity source describe **one** supply, and the higher source-quality grade wins; a tie is broken by the more recent `observed_at`, and a remaining tie by the more precise tier.

Marketplace observations collapse to the host or seller identity the marketplace exposes, never to the marketplace itself, so that a venue listing 40 sellers is 40 capacity sources and not one.

The Phase 1 study established that **operator identity has no source at any of the thirteen sellers examined**, so in practice the seller fallback applies across the whole market. This is a known limitation: a seller reselling another operator's hardware, and that operator selling directly, would be counted twice. No observable field distinguishes them today.

---

## 7. Freshness

Capacity is the most time-sensitive quantity Urdais measures. A price from yesterday is a fact about yesterday; an availability from yesterday is not evidence about today.

### 7.1 No source states an availability timestamp

*Measured, Phase 1.* No provider examined exposes an availability-change or availability-effective timestamp. `availability_observed_at` is therefore nullable and the policy rests on **collection time**, which Urdais controls and records exactly, in `retrieved_at`.

### 7.2 The window

Each interface carries its own `freshness_horizon_seconds`, set from its observed collection cadence and stored on its capability row. The default for an interface collected daily is **86,400 seconds**.

An observation is:

- **fresh** — within its horizon. Counts toward current capacity.
- **stale** — past its horizon. **Excluded from every current-capacity total**, retained in history, and shown as stale.
- **superseded** — a newer observation exists for the same key. Retained; never counted as current.

### 7.3 No carry-forward

A stale observation is never carried forward as current supply, and a source that fails to refresh does not retain its last figure in the total. It leaves the total and the coverage statement records that it left. A total that silently keeps a dead source's last good number is the specific failure this section exists to prevent.

### 7.4 Failure is not zero

A failed retrieval — timeout, auth failure, schema change, non-200 — produces **no observation**. It never produces `available_quantity = 0`. The affected source is reported as temporarily unavailable, and the total is reported with reduced coverage rather than with a hole silently valued at zero.

---

## 8. Historical observations and revisions

Every collector run writes new rows. Nothing is overwritten and nothing is deleted.

A correction supersedes: the corrected row is written, and the superseded row records `superseded_by_id`, `superseded_at` and a `supersession_reason`. Both remain. Series queries read only rows no supersession points past, so the current view reflects corrections while the audit trail survives them.

The dataset publishes no time range longer than it has observed. A three-day history renders three days. Range controls offer only the ranges the data supports.

---

## 9. Coverage limitations

Stated with every presentation of this dataset:

1. **Coverage is a convenience sample, not a market.** It is the set of interfaces that both expose availability and permit Urdais to use it. That set is not representative of the compute market and is not weighted to be.
2. **The total is a floor.** It answers "at least this much was visibly available across these sources", never "this much exists".
3. **Operator identity is unresolved market-wide**, so resale double-counting cannot be excluded (§6.4).
4. **Absence of an observation is not absence of capacity.** A provider not in the dataset is a provider Urdais cannot see.
5. **Regional coverage is narrower than total coverage**, since region resolution can fail independently.
6. **As of version 0.1.0 coverage is zero.** No permitted interface exposes a capacity signal (§4.1).

---

## 10. Publication

No value may be published under a draft methodology version. This version is a draft and carries no effective date.

Publication additionally requires at least one eligible source producing fresh Tier 1–3 observations. Until then the surface renders an insufficient-coverage state that reports what is missing and why — which is a true statement about the market Urdais can see, and the only true statement available.

---

## 11. Change log

**0.1.0-draft, 17 September 2026.** Initial draft. Defines the dataset, the measurement hierarchy, aggregation, deduplication, freshness and the source audit. Records that no permitted interface exposes a capacity signal.
