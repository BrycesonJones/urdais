# Urdais Transmission Headroom

**Status: approved, version 1.0.0, effective 22 September 2026.**

This methodology governs two measurements published under one surface. They are not two views of one quantity, and this document spends most of its length on why.

## 1. Scope

Transmission Headroom V1 is **operational only**. It measures, at published instants, how far the power actually flowing across a monitored element or interface is from the limit the operator was enforcing at that moment.

It covers two markets, and publishes them as two separate products:

- **NYISO — Interface headroom.** The remaining operating margin on the transmission interfaces NYISO publishes, in the direction power is actually flowing.
- **ERCOT — Constraint margin.** The remaining margin on the transmission constraints ERCOT's real-time dispatch was actively tracking, under the specific contingency each protects against.

Nothing here is a planning measure, a capacity measure, or a measure of the network as a whole.

## 2. The cross-market rule

> **A NYISO interface headroom and an ERCOT constraint margin are never summed, averaged, ranked together, or combined into any single figure.**

They share a unit and nothing else. NYISO's population is a fixed census of published transfer interfaces; ERCOT's is whichever constraints dispatch happened to be managing in that interval, out of thousands of elements. A median across both would be a median of two different questions.

Specifically not published, now or later, without a new methodology version: total transmission headroom, average headroom across markets, a combined constrained-element count, or any national figure. This is enforced by database structure — every result binds to one market — and by test.

## 3. Source populations, stated plainly

### NYISO

The population is **the entities NYISO publishes in External Limits and Flows, at the instants it publishes them, where a direction-matched operating limit exists.** Nineteen entities appear in the current file.

This file mixes internal transfer interfaces with external scheduled ties, and the source provides no structured way to tell them apart. TH-1A tested three candidate discriminators and rejected all three. So this methodology does **not** claim to cover all New York transmission interfaces, all AC lines, all internal paths, or all external ties. It covers what NYISO publishes in this file.

### ERCOT

The population is **the constraints ERCOT SCED was actively tracking, as published in NP6-86-CD.** Roughly thirty constraints appear in a given interval, against thousands of elements in the ERCOT network.

An element with abundant margin never appears at all, so the denominator is invisible. This methodology does **not** claim to cover all ERCOT transmission elements, all contingencies, or all network constraints. Calling this "network headroom" would be a real number from a real source measuring something far narrower than its name.

## 4. Direction, and why it is chosen first

NYISO publishes a signed flow and a limit for each direction. The limit is selected from the **sign of the flow**, before any absolute value is taken:

```
if flow > 0:  headroom_mw = positive_limit − flow
if flow < 0:  headroom_mw = |negative_limit| − |flow|
if flow = 0:  no direction, no headroom
```

Taking `|flow|` first and comparing it to the positive limit would measure a westbound flow against an eastbound limit and report a comfortable margin on a constrained interface.

ERCOT publishes the monitored element's flow already oriented into the direction its constraint protects, and never publishes the element's physical orientation. So no direction is selected, none is labelled, and:

```
constraint_margin_mw = Limit − Value
```

## 5. NYISO sentinel semantics

> **A NYISO limit is unavailable if and only if `abs(limit) = 9999`, exactly.**

This is a methodology rule, not a parsing detail, because getting it wrong destroys real data in both directions.

`±9999` is NYISO's code for "this direction is not monitored". Treating it as a number fabricates roughly 11,272 MW of reverse capability on CENTRAL EAST.

The test must be exact equality, because **the largest genuine limit in the NYISO archive is 9,899 MW** — 100 MW below the sentinel, on 8,696 observations of `SCH - HQ_IMPORT_EXPORT`. A rule of `abs(limit) ≥ 9000` would silently discard every one of them.

The convention has also changed over time. Before 2005-02-01 every row carried an unsigned `9999` in **both** limit columns; the signed `−9999` appears from 2007-11. Exact magnitude handles all eras.

A limit of exactly `0` is a **real** limit meaning no flow is permitted that way, not an absent one.

## 6. ERCOT plausibility rule

> **An ERCOT limit above 50,000 MW is a disabled monitor, not a limit. The observation is retained as source evidence and excluded from every derived and published margin.**

ERCOT documents no sentinel. It leaves a constraint monitored with its limit set absurdly high, and taking that at face value reports tens of gigawatts of "headroom" on a constraint that is simply switched off.

TH-3 approves the 50,000 MW bound on the evidence rather than inheriting it. Across 23,795 canonical ERCOT limit observations:

| | |
|---|---|
| Observations at or below 50,000 MW | **23,637** |
| Observations above 50,000 MW | **158** |
| Largest limit at or below the bound | **10,392.8 MW** (`WESTEX`) |
| Smallest limit above the bound | **84,999.1 MW** (`EASTEX`) |
| **Empty band between them** | **74,606.3 MW, containing zero observations** |

The threshold sits in the middle of a completely empty range. Any bound between roughly 10,400 and 85,000 MW classifies the data identically, so the rule is insensitive to the exact number chosen — which is the property that makes it defensible rather than arbitrary.

Two further observations support it. The disabled values cluster on a visible convention — 84,999.1, 85,999.1, 86,999.1, 87,999.1, 89,999.1, 94,999.0 — and they exceed ERCOT's entire system peak load, so they cannot be thermal ratings. And `EASTEX` under `BASE CASE` carries **163 real observations and 158 disabled ones**: the same constraint alternates between monitored and disabled, so being disabled is a state of an observation, never a property of a constraint.

This rule is weaker than NYISO's exact equality and is labelled as such. If ERCOT ever publishes a documented sentinel, this becomes an equality test in a new version.

## 7. Contingency

ERCOT constraints carry a contingency, and it is half their identity: the same element under a different outage is a different constraint with a different limit.

- `base_case` — the margin with the system intact (`ContingencyName = BASE CASE`).
- `post_contingency` — the margin under one named outage.

These are **never silently combined**. Any statistic spanning both must say so; per-contingency series are preferred. In the current canonical data the split is 203 post-contingency to 18 base-case entities, so an undisclosed combined figure would be dominated by post-contingency conditions.

NYISO publishes an all-in operating limit that already embeds contingency analysis and cannot be decomposed, so its contingency kind is `not_applicable`. **NYISO and ERCOT margins are therefore not the same kind of number even before the population difference.**

## 8. Binding

Where a binding state is needed, it comes from ERCOT's own `ShadowPrice > 0`. It is **never** inferred from `margin = 0`.

The canonical data contains **47 observations with a margin of exactly zero and a shadow price of zero** — at the limit, not binding. Deriving one from the other would mislabel every one of them.

NYISO publishes no binding indicator, so none is derived for it.

## 9. Zero headroom is a measurement, not congestion

`headroom_mw = 0` is valid and is published as `0`.

It must not be read as congestion, binding, or an interface "at its limit". On NYISO the zero-headroom observations are concentrated in HVDC and controllable merchant ties sitting at exactly their rating — Neptune, VFT, HTP, CHPE — where full scheduling is routine operation. Since the source offers no way to separate those from free-flowing AC interfaces (§3), **no NYISO count of interfaces at their limit is published in V1**.

## 10. Zero flow

`flow = 0` yields status `zero_flow_direction_undetermined`: no headroom, no utilization, and no limit selected. Choosing the positive limit because it is listed first would invent a direction the grid was not running in. It is **not** 0% utilization and **not** zero headroom.

## 11. Utilization

| Market | Formula | Conditions |
|---|---|---|
| NYISO | `abs(flow) / abs(selected_limit) × 100` | after direction selection; selected limit real and non-zero |
| ERCOT | `Value / Limit × 100` | limit real, above zero, and within the plausibility bound |

Never computed for a sentinel limit, an unavailable direction, a zero-flow observation, an implausible limit, or a zero denominator. Values above 100% are preserved, never clamped — a flow past its limit is the observation the product exists to surface.

`CCTStatus` plays no part. It is ERCOT's Constraint Competitiveness Test, a market-power mitigation state, and it appears in all four combinations of contingency kind and binding state. **It does not determine eligibility for anything in this methodology.**

## 12. Negative margin

Negative headroom is preserved with its sign and never floored at zero.

Defined as: **observed flow exceeding the applicable source limit under that observation's own source semantics.** It is not called an overload, a violation, or a reliability event, because the source does not call it those things.

## 13. "Current", and the two kinds of distribution

A "current" value is **the latest eligible observation for each canonical entity, provided its source is not stale.** Entities publish at different times and NYISO's series is irregular, so a single latest timestamp across the market would silently drop entities.

Two distributions exist and are not interchangeable:

- **Point-in-time (entity-weighted).** One latest eligible observation per entity, then the statistic. This is what median and percentile metrics use. Without the one-per-entity rule a high-frequency entity would contribute hundreds of rows and dominate a "market median".
- **Historical (observation-weighted).** Every published observation, per entity. Used only for per-entity history.

**V1 publishes per-entity history and point-in-time summaries. It publishes no market-wide historical average.** NYISO is an irregular event series, so an arithmetic mean over observations is neither time-weighted nor entity-weighted, and presenting one as a market index would be inventing a smooth series because charts prefer one. Deferred, with the weighting question stated rather than resolved by default.

No forward-filling, interpolation, or synthesised timestamps anywhere. A day is however many observations the publisher made.

## 14. Sample floors

| Statistic | Floor | Basis |
|---|---|---|
| Median | **10 entities** | below this a single entity moves the middle by more than a decile |
| p10 / p25 / p90 | **12 entities** | below this a tail decile interpolates between fewer than two entities |

These were validated against the real populations rather than accepted as defaults. The candidate floor of 20 entities for percentiles was **rejected**: NYISO's entire published population is nineteen interfaces, of which sixteen currently carry a valid margin, so a floor of 20 would permanently suppress every NYISO percentile for a market whose data is complete rather than sparse.

That is the distinction the floors encode: NYISO's nineteen interfaces are a **census**, not a sample, so the floor guards against a degenerate population rather than against sampling error. Every published percentile carries its `sampleSize`, so a reader sees `n = 16` next to the number.

## 15. Currentness

A current metric is published only while its source monitor reports `current`. If the source is stale the metric status is `source_stale`, carrying no value. Historical values remain available.

ERCOT's monitor deliberately goes stale at 36 hours against a 168-hour retention window, because ERCOT publishes no archive and unretrieved history is permanently lost.

## 16. Rights and attribution

| | NYISO | ERCOT |
|---|---|---|
| Classification | `ambiguous_requires_legal_review` | `reusable_with_attribution_or_conditions` |
| Public derived analytics | permitted under founder-accepted risk | permitted |

NYISO's legal notice asserts copyright and states that access confers no licence, but its only reproduction prohibition names images and video and is silent on data. The classification stays ambiguous and is **not** relabelled as cleared. ERCOT grants that raw data may be redistributed in compilations, charts and analyses.

Required attribution:

- `Source: New York Independent System Operator, Inc., External Limits and Flows.`
- `Source: Electric Reliability Council of Texas, Inc., SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).`

Every public surface also carries the observation timestamp, the retrieval timestamp, and this methodology version. No publisher logo or trademark is used.

## 17. Approved metrics

### NYISO — market-specific

| Metric | Unit |
|---|---|
| `interface_headroom_mw` | MW, per entity, current |
| `interface_utilization_pct` | %, per entity, current |
| `interface_headroom_median_mw` | MW, point-in-time, entity-weighted |
| `interface_headroom_p10_mw`, `interface_headroom_p25_mw` | MW, point-in-time |
| `interface_utilization_median_pct`, `interface_utilization_p90_pct` | %, point-in-time |
| `interface_headroom_history` | per entity, observation-weighted |
| `interface_negative_headroom_observations` | count |

### ERCOT — market-specific

| Metric | Unit |
|---|---|
| `constraint_margin_mw` | MW, per tracked constraint, current |
| `constraint_utilization_pct` | %, per tracked constraint, current |
| `constraint_margin_median_mw` | MW, point-in-time, entity-weighted |
| `constraint_margin_p10_mw`, `constraint_margin_p25_mw` | MW, point-in-time |
| `constraint_utilization_median_pct`, `constraint_utilization_p90_pct` | %, point-in-time |
| `constraint_margin_history` | per constraint, observation-weighted |
| `binding_tracked_constraints` | count, from `ShadowPrice > 0` |
| `constraint_negative_margin_observations` | count |

Every one of these is **market-specific**. None may be compared across markets, and ranking by headroom or utilization is valid only within one market: 90% utilization does not describe the same operational condition in NYISO as in ERCOT.

## 18. Rejected and deferred

| Metric | State | Reason |
|---|---|---|
| Any cross-market MW total or average | **not defensible** | §2 |
| Combined constrained-element count | **not defensible** | incompatible denominators |
| NYISO interfaces-at-limit / binding / congested count | **deferred** | §9 — subtype unresolved, so scheduled ties at rating cannot be separated from congestion |
| NYISO subtype-specific statistics | **deferred** | no source-backed discriminator |
| ERCOT network-wide headroom | **not defensible** | §3 — only tracked constraints are observed |
| Percent of ERCOT network constrained | **not defensible** | the denominator is invisible |
| Unconstrained network capacity | **not defensible** | not observed by either source |
| Market-wide historical average | **deferred** | §13 — weighting ambiguity on an irregular event series |
| Planning transfer margin, future topology capacity, interconnection deliverability | **out of scope** | V1 is operational only; planning headroom is a future product |
| Available Transfer Capability | **excluded** | see below |

> **Available Transfer Capability is a scheduling capability concept and is not treated as operational flow-to-limit headroom in Urdais Transmission Headroom V1.**

CAISO's public ATC report was examined in TH-1: ATC exceeded TTC in 27.7% of direction-intervals because it nets counterflow, and the usage column was empty in 100% of rows, so no flow term exists at all. It answers "how much more could be scheduled", which is a different question. No ATC value enters this methodology.

## 19. Known limitations

1. **NYISO's population is small and is a census.** Sixteen entities carry a current valid margin. Percentiles rest on that, and one interface changing state moves them materially. Sample sizes are always published.
2. **NYISO's subtype is unresolved**, which blocks any at-limit or congestion count (§9).
3. **ERCOT's denominator is invisible.** Every ERCOT statistic describes tracked constraints, never the network.
4. **The ERCOT plausibility bound is a judgement**, defensible because it sits in an empty 74,606 MW band, not because ERCOT documents it.
5. **NYISO timestamps carry no timezone.** They are parsed as Eastern wall-clock and recorded as assumed; the repeated autumn hour is marked ambiguous rather than resolved.
6. **Neither source publishes a rating type.** The methodology records which published field a margin used, not whether it was a normal, emergency or ambient-adjusted rating.
7. **No market-wide history** (§13).
8. **ERCOT history begins when Urdais first swept the feed**, because the source keeps seven days and no archive.

## 20. Version history

### 1.0.0 — 22 September 2026

First approved version. Defines interface headroom for NYISO and constraint margin for ERCOT as separate market-specific products; approves the exact-`9999` sentinel rule and the 50,000 MW ERCOT plausibility bound on measured evidence; fixes direction-before-absolute-value, the two distribution kinds, and sample floors of 10 and 12; rejects every cross-market aggregate, both at-limit counts, and ATC.
