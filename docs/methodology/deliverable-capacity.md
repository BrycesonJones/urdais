# Urdais Deliverable Capacity — 1.0.0

**Status: approved, version 1.0.0, effective 21 September 2026.** Prepared and approved 21 September 2026, superseding 0.1.0-draft. This document defines what Urdais publishes as deliverable capacity, for which markets, from which sources, and — at least as importantly — for which markets it publishes nothing.

Three of seven markets produce a result under this version. That is the finding, not a gap in the work. Each of the other four is component-only for a reason recorded here and enforced in code.

## Primary Question

> For a given market, period and scenario, how much accredited or protocol capacity does the market's own planning process recognise as available to serve load?

The published value for an eligible market is a **source-published capability quantity, carried through unchanged**. Version 1.0.0 approves no arithmetic. Every result is an identity on one canonical component, and the methodology's work is deciding *which* component, for which markets, under what scope.

## What deliverable capacity is in V1

A source-backed planning capability quantity representing the accredited or protocol capacity recognised at the stated market, geography, period and scenario.

It is **not** a transmission-perfect maximum load-serving capability. No market publishes that, and no combination of what they do publish produces it. A reader who takes the name to promise more physical precision than the underlying accreditation carries would be misreading it, which is why every published result carries its capacity basis and its scope alongside the number.

### The name

`Deliverable Capacity` overstates what V1 measures. **Planning Capacity** or **Accredited Planning Capacity** would describe it more honestly, and a public surface should prefer one of those. The code, tables and methodology slug are unchanged: renaming a schema to improve a label is a cost without a benefit, and the honest label belongs on the surface where a reader meets the number.

The name also collides with a tariff term. SPP's Open Access Transmission Tariff uses **Deliverable Capacity** for accredited megawatts a transmission study found deliverable to the SPP East Balancing Authority Area. That is a different quantity from this one, it is never mapped into this one, and a regression test enforces the separation.

## Three quantities, kept apart

| | What it is | Where it lives |
| --- | --- | --- |
| **Resource capability** | What a publisher says exists or cleared | `pipeline.grid_capacity_components`, `quantity_kind = capability` |
| **Network constraint** | What the network permits across a boundary | `pipeline.grid_constraint_values` |
| **Deliverable capacity result** | What Urdais concluded | `pipeline.deliverable_capacity_results` |

A requirement is a fourth thing and is never any of these. ICR, Net ICR, PRMR, LRR, LCR, RAR, IRM, FPR, ACAP PRM and every locational capacity requirement are obligations, not supply. None may become a result under this version, and the database refuses a requirement filed as a capability.

## Question A and Question B

Two different subtractions, deliberately not merged.

**Question A — planning capacity margin.**
`capability − forecast peak demand`. How much accredited capacity stands above expected peak.

**Question B — resource adequacy surplus.**
`capability − required capacity`. How much accredited capacity stands above the market's own obligation.

They answer different questions and can point opposite ways: a market can clear its reliability requirement while holding little margin over raw peak, because the requirement is set against a loss-of-load standard rather than against the peak itself.

**PD-5's delivery gap is Question A only**, and only where period, geography, basis and *scope* all align. Question B stays a resource-adequacy diagnostic and is not the delivery gap.

Version 1.0.0 computes neither. It approves the capability term that a later phase would subtract from, and records per market whether Question A is even validly askable — which for one eligible market it is not.

## Eligible markets

| Market | V1 status | Result | Question A eligible |
| --- | --- | --- | --- |
| ERCOT | `approved_result` | Protocol Prescribed Total Capacity | **Yes** |
| PJM | `approved_result` | RPM-committed unforced capacity, RTO | **No** — scope mismatch |
| MISO | `internal_result_only` | Unforced Capacity, system | Yes, internally |
| CAISO | `component_only` | — | — |
| NYISO | `component_only` | — | — |
| ISO-NE | `component_only` | — | — |
| SPP | `component_only`, publication blocked | — | — |

### ERCOT — approved

```
deliverable_capacity(ERCOT, season, year, scenario)
  = Total Capacity                              [component]
    quantity_kind   = capability
    component_kind  = accredited_resource_capacity
    capacity_basis  = accredited
    grid_subarea_id = null
    source          = Capacity, Demand and Reserves Report, Seasonal Summary
```

One component in, one result out. Period basis `seasonal`; both summer and winter are produced for every forecast year the report covers.

The **peak load hour** and **peak net load hour** scenarios are separate results and never cross. They are two answers about the same season measured at two different hours, and the CDR states both because they differ — for summer 2026 by nearly 13,000 MW. Collapsing them would discard the distinction the report exists to draw.

Excluded: DC-tie ratings, which are interconnection ratings rather than an accredited contribution; any zonal figure, because the CDR defines none and ERCOT has no capacity zones in the resource-adequacy sense; the planning reserve margin, which is a ratio.

Question A is valid for ERCOT: the same table, the same season and the same peak-hour scenario also state Firm Peak Load, so capability and demand share every dimension.

### PJM — approved at RTO, with a stated scope limit

```
deliverable_capacity(PJM, delivery_year, base_residual_auction)
  = Participant Sell Offers Cleared, RTO        [component]
    quantity_kind   = capability
    component_kind  = procured_capacity
    capacity_basis  = ucap
    grid_subarea_id = null
    source          = Base Residual Auction Summary of Auction Results
```

This is **capacity committed through the Reliability Pricing Model, and only that.** It excludes capacity committed by Fixed Resource Requirement entities — roughly 11,900 MW for 2026/27 — because PJM states that figure only in the narrative auction report and in no published table or workbook. It also excludes price responsive demand, because the workbook's figure does and the report's larger figure counts it; the two are different quantities under similar names and only the workbook's is machine-readable.

**PJM is therefore not Question A eligible in V1.** PJM's forecast peak load includes FRR load, while this capability excludes FRR supply. Differencing them would report a gap of which a large part is an artifact of mismatched scope. A valid PJM Question A needs either FRR committed capacity on the supply side or RPM-scope demand on the demand side, and neither is currently canonical.

**No LDA result.** PD-4A's candidate `in-LDA accredited UCAP + CETL` is not approved and this phase does not approve it. The evidence is against it on two independent grounds: the two terms come from different publications whose geography does not line up — PJM's transfer-rights sheet reports against "PS Equivalent" and "ATSI Equivalent", not the areas the limits are stated for — and cleared capacity is what cleared rather than what exists, so a resource inside the area that did not clear, or that belongs to an FRR entity, is absent from it. Their sum is neither a physical capability nor a market one. PJM localities stay components and constraints.

Never a PJM result: the Reliability Requirement, which is an obligation; CETL at any level, which is a network limit; CETO, which is a transfer obligation.

### MISO — approved, internal only

```
deliverable_capacity(MISO, planning_year, season, lole_study)
  = Unforced Capacity, system                   [component]
    quantity_kind   = capability
    component_kind  = accredited_resource_capacity
    capacity_basis  = ucap
    grid_subarea_id = null
    source          = Planning Year Loss of Load Expectation Study Report
```

Four seasonal results per planning year. The basis is **UCAP and is labelled UCAP**; it is not Seasonal Accredited Capacity and is never relabelled as such. MISO's SAC is an auction accreditation stated in the Planning Resource Auction results, whose 2026 posting is not publicly retrievable.

**No zonal result.** `local capability + CIL` is not approved. MISO states plainly that a zone's Local Clearing Requirement is its Local Reliability Requirement less its Capacity Import Limit, and both inputs are now held for every zone and season — and the subtraction is still not performed, because PD-4A left MISO's locational arithmetic unapproved pending confirmation of whether imports are already embedded in the local figures. An easy calculation is not an approved one.

**Publication is blocked by rights, not by methodology.** MISO's terms were reviewed and refused; the result is computed, validated and retained at `internal_only`, and no permission grant exists that could change that.

### CAISO — component only

The question this phase had to answer was whether summing resource-level Net Qualifying Capacity is a defensible market-level capability. Mechanically it survives scrutiny: energy-only resources already carry zero in all 1,902 of their resource-months, interim and partial deliverability are already reduced by CAISO, there are no duplicate resource-months across 19,368 rows, no negative values, and no import or intertie resources, so the aggregate would be internal generation only with nothing double counted.

It fails on something else. **A result must be reconstructible from its frozen input rows and its methodology version alone**, and `pipeline.deliverable_capacity_result_inputs` can freeze only components and constraints. CAISO has neither: its evidence is 19,368 raw records, and the capacity schema has no resource-class or resource-level component grain to promote them into. A CAISO result could be computed but could not be frozen, and an unfreezable published number is one nobody can audit.

Two further hazards are recorded for whoever revisits this. The workbook's second sheet, "2026 Other", is **not disjoint** from the main list — 22 of its 31 resources appear in both — so the two sheets must never be added. And CAISO publishes no area total of its own against which any aggregate could be checked.

Unblocked by: a CAISO-published area total, or a resource-level component grain added deliberately with its own aggregation rules. Maximum Import Capability stays out regardless, and would in any case be additive to this aggregate only because imports are absent from it.

### NYISO — component only

NYISO publishes its requirements as percentages of each locality's own forecast peak and publishes no market-level capability series that is machine-readable. There is nothing to carry through.

Never a NYISO result: `LCR × peak`, `IRM × peak`, or any locality serving capability built from transmission security floors. Multiplying a requirement rate by a peak produces a requirement in megawatts, not a capability, and a floor is a limit rather than a resource.

### ISO-NE — component only

The ingested artifact states requirements and network limits. Its only capability rows are **tie benefits** — capacity New England credits itself for its interconnections — and a tie benefit is not the region's accredited resource capability. Qualified Capacity is published in the auction qualification reports, a different release on a different schedule, and is not ingested.

Never an ISO-NE result: ICR, Net ICR, or HQICC as capability substitutes. The first two are obligations and the third is a credit netted out of an obligation.

### SPP — component only, publication blocked

Two separate facts, and both hold.

*Component only:* SPP publishes no readable capability at all. Its accredited capacity totals and aggregate requirement are raster images in the resource adequacy report. The one quantity this pipeline holds from SPP is the accredited capacity planning reserve margin, which is a requirement.

*Publication blocked:* SPP's terms were reviewed and refused, so even a value it did publish could not be shown. The Summer Season Deliverability Study — which does state a deliverable capacity total — is stamped "SPP Internal Only" on every page and is not retained at all.

Either fact alone would stop a result. Both are recorded because removing one would not remove the other.

## Rules that hold for every result

**Basis is preserved and never converted.** Protocol MW, UCAP, ICAP, NQC, SAC and ACAP are different accreditations. No result converts between them, and the combination rules refuse to add two values of different bases.

**No cross-market aggregate.** There is no seven-market deliverable capacity total, and `refuseSevenMarketCapacityTotal` exists to say so where someone would otherwise write one. The markets accredit capacity on different bases, over different periods, against different reliability standards.

**No cross-locality aggregate.** PJM's and MISO's localities nest; each area's figure already counts the areas inside it, and the nesting is published in tariff schedules this pipeline does not ingest. `refuseNestedSubareaTotal` refuses the operation rather than guarding it with a hierarchy Urdais would have to invent.

**Unavailable is unavailable.** A market with no approved result has no row. It is never zero, never inferred from a requirement, never filled from EIA-860 or an interconnection queue, and never carried forward from a different market or an earlier year.

**No quarterly interpolation.** A seasonal or annual value is stated for the period its publisher stated it for.

## Three gates, checked separately

A number reaches a public surface only if all three open, and each answers a different question.

1. **Methodology gate.** Is this market approved under an `approved` methodology version, and is the result `validated`? A draft version can publish nothing; the database enforces this independently of the code.
2. **Rights gate.** Do the source's determinations permit public display of a derived value? This is evaluated per source and never softened by methodology approval.
3. **Currentness gate.** Does every frozen input come from the vintage currently in force for that market? A calculation that succeeds against last year's inputs is a stale result, not a current one.

Failing any gate leaves the result retained and unpublished, never absent and never approximated.

## Publication behaviour by market

| Market | Rights classification | Derived display |
| --- | --- | --- |
| ERCOT | `reusable_with_attribution_or_conditions` | Allowed, attribution required |
| PJM | `ambiguous_requires_legal_review` | Allowed under founder-accepted risk |
| MISO | `unsuitable_without_permission` | **Blocked** |
| SPP | `unsuitable_without_permission` | **Blocked** |
| CAISO / NYISO / ISO-NE | `ambiguous_requires_legal_review` | Would be allowed under founder-accepted risk, but no result exists |

No classification is altered by this document. Approving a methodology does not grant a right, and a market whose result is blocked keeps its result internally rather than not computing it.

## Limitations

- Three of seven markets produce a result, and only two may be published.
- Only one of those two supports a valid planning capacity margin. PJM's scope excludes FRR supply while its demand forecast includes FRR load.
- No result is locational. Every approved result is whole-market.
- No result is derived from more than one component. Version 1.0.0 approves no arithmetic at all, which is a deliberately narrow claim and the only one the evidence currently supports.
- CAISO's aggregation is mechanically sound and remains unapproved for a structural reason — inputs that cannot be frozen — rather than a semantic one. That is the most likely candidate for 1.1.0.

## Version history

| Version | Status | Note |
| --- | --- | --- |
| 0.1.0-draft | superseded | Established the four quantities and that no universal cross-market formula is defensible. Published nothing. |
| 1.0.0 | approved | Approves capability identities for ERCOT and PJM RTO publicly and MISO internally; leaves CAISO, NYISO, ISO-NE and SPP component-only, each for a recorded reason. Approves no arithmetic. |
