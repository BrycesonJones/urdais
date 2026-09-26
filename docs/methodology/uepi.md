# UEPI Methodology

**Status: approved, version 1.0.0, effective 24 September 2026.** This document presents the Urdais Energy & Power Index V1: a set of **independent daily wholesale electricity price benchmarks**, one per organised U.S. market, in dollars per megawatt-hour.

The authoritative text is the frozen specification `docs/research/uepi/uepi-v1-specification.md`, whose SHA-256 is `14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a`. Every released UEPI value carries that version and that digest, and a value calculated under any other is not released. This page presents that specification for readers; it does not restate it as a second authority, and where the two could differ the specification governs.

This document follows the principles of the [Urdais methodology framework](/docs/methodology).

**There is no UEPI headline number.** The family holds one series per market and no composite. Seven markets in four timezones, measuring two different price constructs, have no average with a referent — so none is published, and no cross-market statistic is derived.

---

## Output Identity

| Field | Value |
| --- | --- |
| Family | UEPI, the Urdais Energy & Power Index |
| Series | One per organised market, published independently |
| Unit | $/MWh |
| Cadence | Daily, one value per operating day |
| Canonical change | Day-over-day, and each selectable horizon |
| Methodology version | 1.0.0 |
| Effective date | 24 September 2026 |
| Composite | **None.** No headline level, no cross-market average |

| Market | Series id | Display symbol |
| --- | --- | --- |
| ERCOT | `uepi-ercot` | UEPI-ERCOT |
| CAISO | `uepi-caiso` | UEPI-CAISO |
| NYISO | `uepi-nyiso` | UEPI-NYISO |
| MISO | `uepi-miso` | UEPI-MISO |
| SPP | `uepi-spp` | UEPI-SPP |
| ISO-NE | `uepi-iso-ne` | UEPI-ISO-NE |
| PJM | `uepi-pjm` | UEPI-PJM |

Not every series is published. Publication is a separate question from calculation, and is answered per market below.

## What UEPI Measures

For each market, the **arithmetic mean of the valid hourly day-ahead prices of one operating day**, at one defined location, taken from the market operator's own published data.

It is a day-ahead auction benchmark. It is **not** the price paid by load, **not** a real-time price, and **not** an index published by the ISO or RTO — it is an Urdais calculation over public market data.

### Two price constructs, never flattened together

Three markets publish a **delivered price** that includes congestion, and where the market prices them, losses. Four publish only the uniform **system energy component**, because they publish no footprint-wide total at all, and Urdais will not average hubs or zones into one.

| Construct | Markets | What it contains |
| --- | --- | --- |
| Delivered price | ERCOT, PJM, ISO-NE | Energy plus congestion, and losses where priced |
| System energy component | CAISO, MISO, NYISO, SPP | The energy component alone |

These are different economic objects that share a unit. Every series states which one it is, and what its construct excludes, beside its value. A chart comparing a delivered price with an energy component is comparing two things, and the metadata is what lets a reader see that.

## Aggregation

The daily value is the arithmetic mean of the valid hours of the operating day, computed in exact decimal arithmetic and stored to six decimal places. Each released value carries a SHA-256 of the specification version and the ordered `(interval, price)` pairs it was computed from, so any value can be recomputed and checked rather than trusted.

### Completeness is exact

A day is released only when **every** hour of its operating day is present. There is no threshold below 100 %: a 23-hour spring-forward day is complete at 23 hours, and a 23-hour day in June is a hole. A day with a hole is not released, and nothing fills it — no interpolation, no carry-forward, no zero.

### Daylight saving

Operating days are the market's own, in the market's own zone, so a day has 23, 24 or 25 hours as the calendar dictates. MISO is the exception, and it is a fact about MISO rather than an approximation: it publishes hours-ending in Eastern *Standard* Time all year and never observes the transitions, so a MISO day always has 24 hours.

### Negative prices

Wholesale prices can be zero or negative, and UEPI stores and publishes them as they cleared. On 12 April 2026 the SPP North Hub day-ahead daily mean was −$0.11/MWh and the South Hub's −$8.63/MWh. A negative price is what the market settled at, not a bad row.

## How Change Is Expressed

Once a value can sit at or below zero, ordinary percentage return breaks in ways that still print a plausible number. A negative denominator inverts the sign, so a price improving from −$10 to −$5 reports "−50 %" while the number rose. A zero denominator is undefined. A zero crossing produces a figure describing no rate of return anyone can act on.

So UEPI publishes two quantities under one rule:

- The **change in dollars per megawatt-hour is always computed and always shown.** It is well defined for every sign combination and is the quantity a power buyer experiences.
- The **percentage is computed only when both endpoints are strictly positive.** Otherwise it is absent, with a stated reason — never 0 %, never a percentage taken from a magnitude.
- **Direction always comes from the sign of the dollar change**, never from the percentage. A move from −$10 to −$5 is a rise, and is shown as one.
- **The unit is always on the number.** `+$1.24/MWh` and `+3.4 %` are never interchangeable.
- **The same rule applies to every horizon** — day, week, month, three months, six months, year — with no exception.

## Range Selection

Every released value is stamped at its operating date at 00:00:00 UTC. That is a date key, not a claim about when the hours occurred; it is what lets markets in four timezones line up on one axis and makes calendar-month arithmetic exact.

A horizon's base is the **last released observation at or before the window start** — never the closest overall, never an interpolation, never the oldest point available. The base must itself lie no earlier than one further window back, so a "1 month" label cannot be stretched over a year-old observation. A horizon with no base in reach is offered as unavailable rather than drawn over a fabricated line.

Because a base may still sit a day or two off the exact boundary — the price of not interpolating — every change states the dates it measured between, and the surface shows them.

## Release and Revision

A value is released when its day is complete, its hours pass their quality checks, and the specification version it was calculated under is approved and in force. Quality checks are recorded with the value, including the margin each one measured.

Corrections are made by **supersession, never by editing**. A revised day inserts a new row and marks the old one superseded; raw source evidence is append-only and cannot be updated at all. A day withheld by a quality check stays withheld until the evidence changes — the tolerance is not widened to admit it.

## Publication and Rights

Calculating a series and publishing it are separate decisions, gated separately.

The **terms** gate asks whether the market operator's terms permit Urdais to show a value derived from their data. The **posture** gate asks whether Urdais has built the series and decided to show it. A series must pass both. Deciding to publish never upgrades a rights classification, and an ambiguous classification publishes with its unresolved issue attached to the value rather than resolved away.

| Market | Published | Why |
| --- | --- | --- |
| ERCOT | Yes | The terms are an affirmative grant for public raw data in compilations and analyses, with attribution |
| CAISO | Yes | Classification ambiguous; published under founder-accepted legal risk with the open question stated |
| NYISO | Yes | Classification ambiguous; published under founder-accepted legal risk with the open question stated |
| MISO | No | The site terms forbid creating derivative works, and a daily mean is one |
| SPP | No | Commercial publication requires express written authorization from an SPP officer |
| PJM | No | Redistribution of Data Miner data, including derived data, requires an active PJM membership |
| ISO-NE | No | Urdais has not built this series to release |

A market that is not published is **absent** from the public API and from the product surface — not present carrying a null value. Its values exist, are complete and are retained internally.

## Known Limitations

These are published rather than held internally, because a reader comparing two series needs them to read the chart correctly.

**All markets.** UEPI is an Urdais calculation over public market data, not an index published by the ISO or RTO. It is a day-ahead auction benchmark, not the price paid by load, and not a real-time price. Values can be zero or negative; where they are, UEPI shows the change in $/MWh and shows no percentage.

**ERCOT.** The day-ahead hub average is a shift-factor construct, not the simple mean of the four regional hub prices. The written definition changed effective 1 September 2019 under NPRR931, so history spanning that date spans two definitions.

**CAISO.** Energy component only: congestion, losses and the marginal greenhouse-gas component are excluded. Whether the greenhouse-gas component should be included is an open methodology question.

**NYISO.** A reference-bus energy component derived from a zonal row; NYISO publishes no statewide LBMP and no hub. Zonal prices, including New York City, can differ materially from this reference price.

**MISO.** Energy component derived as `LMP − MCC − MLC` from the ex-post file; MISO publishes no energy-component column. Hours are Eastern Standard Time all year.

**SPP.** Energy component for the SPP balancing authority only; the western `SWPW` market is excluded. SPP's own trading hubs diverge from each other and from this series.

**ISO-NE.** Hub total LMP, defined by tariff as the arithmetic average of the Hub's nodes. The Hub node list is revisable without the location id changing, so the hub-definition vintage is pinned in metadata.

**PJM.** RTO-aggregate total LMP; Western Hub, the traded benchmark, is a different and narrower price.

## Comparison

Within UEPI, series are compared in absolute $/MWh and are never rebased to a common index level: rebasing moves the zero- and negative-base problem into the base period and hides it behind a synthetic number.

Against indices in other units, a rebased comparison is drawn only when every series' window base is strictly positive. Where one is not, the comparison is refused with a stated reason rather than drawn on a percentage axis that cannot carry it.

## Versioning

This is version 1.0.0. A change to any definition above — a construct, a location, a tolerance, an aggregation rule — is a new version with its own digest and effective date, registered before any value is calculated under it. Approved versions are never edited in place, and a percentage change is never measured across a version boundary.
