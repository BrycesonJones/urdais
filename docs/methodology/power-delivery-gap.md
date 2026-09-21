# Urdais Power Delivery Gap — 1.0.0

**Status: approved, version 1.0.0, effective 21 September 2026.** This document defines what Urdais publishes as a delivery gap, for which market-season pairs, and — mostly — where it publishes nothing.

**One market of seven produces a gap.** That is the finding. A delivery gap requires a planning demand forecast and an approved planning capacity result that describe the same thing, and across the seven markets PD-3 and PD-4 cover, exactly one pair survives every compatibility test.

## Primary Question

> For a given market, season and forecast year, by how much does the planning forecast peak demand exceed the accredited capacity the market's own planning process recognises?

```
delivery_gap = planning forecast demand − approved planning capacity
```

**Sign.** Positive means forecast demand exceeds approved planning capacity. Zero means they are equal. Negative means capacity exceeds forecast demand.

## What this is not

- **Not transmission headroom.** Nothing here models a network.
- **Not a resource adequacy surplus.** That is capacity against a *requirement* — an obligation set to a loss-of-load standard — and it is a separate diagnostic family.
- **Not operational headroom.** These are annual planning quantities, not real-time margins.

## Question A, and only Question A

```
Question A   planning demand − capability          ← this document
Question B   capability − required capacity        ← not this document
```

They can point opposite ways: a market can satisfy its reliability requirement comfortably while its forecast peak outruns accredited capacity, because a requirement is set against a probabilistic standard and a forecast peak is not. Version 1.0.0 computes A only. B stays with the resource adequacy diagnostics and is never called a delivery gap.

## Eligibility

| Market | Status | Gap pairs | Why |
| --- | --- | --- | --- |
| ERCOT | `public_gap_eligible` | 10 | Both sides exist and every compatibility test passes |
| PJM | `capacity_only` | 0 | Three independent mismatches, below |
| MISO | `capacity_only` | 0 | No planning demand series exists at all |
| CAISO | `demand_only` | 0 | No approved capacity result |
| ISO-NE | `demand_only` | 0 | No approved capacity result |
| NYISO | `component_only` | 0 | Neither side |
| SPP | `blocked` | 0 | Neither side, and publication prohibited |

### ERCOT — approved

```
delivery_gap(ERCOT, season, year)
  = demand   Long-Term Load Forecast, ERCOT Adjusted      [planning point]
              grain           balancing_authority
              period          seasonal
              peak_type       coincident_peak
              load_basis      net
  − capacity Protocol Prescribed Total Capacity            [capacity result]
              scenario        peak load hour
              period          seasonal
              capacity_basis  accredited
```

Ten pairs: summer and winter, 2026 through 2030 — the intersection of the forecast's horizon and the report's.

**Only the peak load hour.** The Capacity, Demand and Reserves report also states capacity at the *peak net load hour*, and those ten results have **no eligible demand partner**. "Net" means different things on the two sides: the load forecast's `net` basis means net of behind-the-meter generation, while the report's *net load* means load less renewable output. They are not the same adjustment and are never paired.

**Only the coincident peak.** The forecast also publishes a non-coincident peak, which is the sum of zonal peaks and is not a quantity the system must serve at one moment.

**Only the reference demand case.** ERCOT publishes thirty-six demand scenarios — a TSP-provided case with a different large-load treatment, and thirty-four historical weather years. Version 1.0.0 pairs the reference case (`ERCOT Adjusted`) only. A gap under a P90 or a specific weather year is a legitimate and different question, and the capacity side does not vary with it; approving that pairing needs its own decision.

**This gap will not reproduce ERCOT's published reserve margin, and should not be expected to.** ERCOT computes its margin against *firm* peak load, which excludes load it may curtail — 88,639 MW for summer 2026 against the forecast's 94,650 MW. This gap uses the full forecast peak, so it is the more conservative question: does accredited capacity cover all the load the forecast expects, not merely the firm part of it.

### PJM — capacity only

Three independent mismatches, each sufficient on its own, all confirmed against canonical data.

1. **Period basis.** The demand forecast is monthly — 252 monthly coincident peaks — and the capacity result is a delivery year. There is no approved mapping from one to the other, and choosing a month would be a decision nobody made.
2. **Load basis.** The demand forecast states `unspecified` for gross versus net, because PJM's report does not say. An unspecified load basis cannot be differenced against an unforced capacity.
3. **Resource scope.** The capacity is capacity committed through the Reliability Pricing Model and excludes what Fixed Resource Requirement entities committed, while the demand covers the whole RTO footprint including the load those entities serve.

The third is the one that cannot be fixed by a period rule. It is **not** to be closed by subtracting FRR load from demand without a source-backed scope mapping, by importing a figure from a research note, or by substituting the Reliability Requirement for capacity.

### MISO — capacity only

MISO has an approved capacity result and **no planning demand series at all**: its long-term load forecast was blocked in PD-3B, on rights and because the public artifact is a set of growth-rate trajectories rather than a vintaged megawatt series.

MISO's loss of load expectation study does state a system peak demand beside the capacity, in the same table and season — the most closely aligned pair in the whole domain. It is deliberately not used. That figure is a capacity study's own input, not a planning demand forecast, and differencing a report against itself reproduces MISO's published reserve margin rather than measuring anything Urdais set out to measure. Using it would also mean ERCOT's gap and MISO's gap were built from different kinds of thing.

### CAISO and ISO-NE — demand only

Both have planning demand and neither has an approved capacity result: CAISO's net qualifying capacity cannot be frozen as an input, and ISO-NE's only capability rows are tie benefits. Requirements are not substitutes. ICR, Net ICR and HQICC are never capacity.

### NYISO — component only

Neither side. NYISO's requirements are percentages of each locality's own peak; `LCR × peak` and `IRM × peak` produce requirements in megawatts, not capability, and neither may stand in for capacity.

### SPP — blocked

Neither side, and publication is prohibited regardless. Nothing is derived from raster tables or from material its publisher marked internal only.

## Compatibility rules

A pair is eligible only if **every** rule passes. There is no partial credit and no nearest match.

**Period.** Same period basis, same target year, and same season where either side is seasonal. No quarterly interpolation, no nearest-year substitution, no comparing a capability year against an unrelated calendar year. A market needing an explicit period mapping gets one written into this document, never a heuristic in code.

**Geography.** Exact match. Balancing-authority demand pairs only with whole-market capacity. Demand at system level is never compared against an LDA, a locality or a local resource zone, and localities are never summed to manufacture a market total.

**Peak definition.** Coincident and non-coincident peaks are different questions. A peak measured at the system peak load hour and one measured at the peak net load hour are different questions. Unrestricted and restricted peaks are different questions. Where definitions differ materially the pair is ineligible; nothing is silently normalised into anything else.

**Load basis.** Gross and net are not interchangeable, and an `unspecified` basis is not compatible with anything, because a difference taken across an unknown adjustment is unknown by the same amount.

**Resource scope.** Demand and capacity must cover the same load and resource footprint. Capacity procured for part of a market may not be differenced against demand for all of it.

**Basis.** The capacity basis is carried onto the gap. A gap taken against accredited capacity and one taken against unforced capacity are not the same series and are never mixed.

## Three gates

A gap reaches a public surface only if all three open.

1. **Methodology.** Is this pairing approved under an `approved` version, and is the result `validated`?
2. **Rights.** The **most restrictive input wins**: the demand source, the capacity source and the delivery-gap display purpose must all permit it. A gap is a derived value from two sources and inherits the stricter of them.
3. **Currentness.** Both the demand vintage and the capacity result must be the ones in force. A stale side produces no current published gap; the earlier pairing is kept, not deleted.

## Missing data

If either side is unavailable, the gap is **unavailable**. Never zero, never forward-filled, never interpolated, never taken from a generator inventory or an interconnection queue, and never built by substituting a requirement for a capability.

## Limitations

- One market. Ten pairs. Every other market has a recorded reason.
- No locational gap anywhere, because no market publishes locational capacity this pipeline can hold.
- Only the reference demand case, so the published gap carries no weather or scenario range.
- The ERCOT gap is more conservative than ERCOT's own reserve margin, by design and by disclosure.
- The capacity side stops at the report's horizon while the demand side runs further. Pairs exist only where both do, which is why the horizon is 2026–2030 rather than the forecast's 2031.

## Version history

| Version | Status | Note |
| --- | --- | --- |
| 1.0.0 | approved | Approves ERCOT summer and winter, 2026–2030, reference demand case against peak-load-hour capacity. Every other market ineligible with a recorded reason. |
