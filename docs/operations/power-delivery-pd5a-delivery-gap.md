# Power Delivery PD-5A: delivery gap eligibility and methodology lock

**Status:** internal implementation note. The approved methodology is [docs/methodology/power-delivery-gap.md](/docs/methodology/power-delivery-gap.md).

PD-4 ended with capacity results for three of seven markets. PD-5A asks which of those can be paired with a planning demand forecast, and locks the answer before any generic gap engine exists.

**One market, ten pairs.** Every other market has a recorded blocker.

## The matrix

| Market | Status | Pairs | Demand | Capacity | Blocker |
| --- | --- | --- | --- | --- | --- |
| ERCOT | `public_gap_eligible` | 10 | LTLF, 982 points | CDR, 20 results | — |
| PJM | `capacity_only` | 0 | 15,624 points | 1 result | Period, load basis, resource scope |
| MISO | `capacity_only` | 0 | **none** | 4 results | No planning demand series exists |
| CAISO | `demand_only` | 0 | 78 points | **none** | No approved capacity result |
| ISO-NE | `demand_only` | 0 | 40 points | **none** | No approved capacity result |
| NYISO | `component_only` | 0 | none | none | Neither side |
| SPP | `blocked` | 0 | none | none | Neither side, publication prohibited |

Built by ingesting all thirteen artifacts into a clean database and reading the two domains against each other. ERCOT is the only market with both sides — and having both sides is necessary, not sufficient: PJM has both and fails anyway.

## ERCOT, exactly

```
demand    Long-Term Load Forecast, ERCOT Adjusted, balancing authority,
          seasonal, coincident peak, net load basis
capacity  CDR Protocol Prescribed Total Capacity, peak load hour, accredited
```

Ten pairs — summer and winter, 2026 to 2030 — and the result is a real product signal:

| Season | 2026 | 2027 | 2028 | 2029 | 2030 |
| --- | --- | --- | --- | --- | --- |
| Summer | −10,200 | −5,055 | +7,850 | +13,771 | +23,443 |
| Winter | −5,196 | +14,100 | +34,700 | +52,817 | +62,209 |

Capacity is ahead of forecast demand in 2026, and demand overtakes it from winter 2027 onward. The widening is partly real load growth and partly the reports' different horizons: the CDR counts capacity already planned or under construction, while the forecast keeps projecting load. That is what a delivery gap is *for*, and it is also why the disclosure below matters.

### Three things this pairing deliberately excludes

**The peak net load hour.** The CDR also states capacity at the peak net load hour, and those ten results have **no demand partner at all**. "Net" means different things on the two sides — the forecast's `net` basis nets behind-the-meter generation, while the report's *net load* nets renewable output. Different adjustments, never paired.

**The non-coincident peak.** It is a sum of zonal peaks and not a quantity the system serves at one moment.

**Thirty-five of thirty-six demand scenarios.** ERCOT publishes a TSP-provided case and thirty-four historical weather years. Only the reference case pairs in V1. A gap under P90 demand is a legitimate and *different* question, and the capacity side does not move with it.

### The disclosure that matters most

**This gap will not reproduce ERCOT's published reserve margin.** ERCOT computes its margin against *firm* peak load — 88,639 MW for summer 2026 — while the forecast's full net coincident peak is 94,650 MW. The 6,011 MW difference is load ERCOT may curtail. This gap uses the full forecast peak, making it the more conservative question: does accredited capacity cover all the load the forecast expects, not merely the firm part.

Anyone comparing Urdais's number to ERCOT's margin will find they differ. The methodology says why, in those terms.

## Why PJM fails with both sides present

Three independent mismatches, each sufficient alone, all confirmed against canonical data rather than recalled from PD-4F:

1. **Period basis** — demand is monthly (252 monthly coincident peaks), capacity is a delivery year. No approved mapping exists and choosing a month would be a decision nobody made.
2. **Load basis** — the demand forecast states `unspecified`, because PJM's report does not say. A difference taken across an unknown adjustment is unknown by the same amount.
3. **Resource scope** — capacity is RPM-committed only; demand covers the whole RTO footprint including the load FRR entities serve with capacity this figure excludes.

The third cannot be closed by a period rule, and is explicitly not to be closed by subtracting FRR load from demand without a source-backed scope mapping.

## MISO, and a tempting pairing not taken

MISO has capacity and **no planning demand series at all** — its load forecast was blocked in PD-3B on rights, and the public artifact is growth-rate trajectories rather than a vintaged megawatt series.

Its LOLE study *does* state a system peak demand beside the capacity, in the same table and season. That is the most closely aligned pair in the entire domain, and it is deliberately unused: that figure is a capacity study's own input, and differencing a report against itself restates MISO's published reserve margin rather than measuring a delivery gap. Using it would also mean ERCOT's gap and MISO's gap were built from different kinds of thing.

This corrects the PD-4F report, which said MISO "could internally" support a gap. That was true of a PD-4-internal pairing and is not true of the PD-3 demand this product is defined on.

## Compatibility rules, enforced not assumed

Period, geography, peak definition, load basis, resource scope and capacity basis must all match. There is no partial credit and no nearest match: no quarterly interpolation, no nearest-year substitution, no summing localities into a market total, and no silently normalising one peak definition into another. Each rule has a test that pairs a deliberately mismatched row and asserts nothing is produced.

## Three gates

| Gate | Rule |
| --- | --- |
| Methodology | The pairing is approved under an `approved` version, and the result is `validated` |
| Rights | **The most restrictive input wins** — demand source, capacity source and the delivery-gap purpose must all permit it |
| Currentness | Both the demand vintage and the capacity result are the ones in force |

The rights gate is stricter here than anywhere earlier in PD-4, because a gap descends from two sources. A refusal on either blocks publication while the gap is still computed and retained.

One registry change was needed: the `public_derived_delivery_gap_display` purpose existed from PD-4B but had no determination anywhere, so it read as blocked. Determinations were added for **exactly the two ERCOT sources** that feed the approved pairing. No determination exists for any other source, because nobody has reviewed delivery-gap display for a market that produces no gap, and an absent determination correctly reads as blocked.

## Schema

Two tables. `delivery_gap_results` holds the demand, the capacity and the difference, with **both** scenario ids — a gap is a statement about one demand case against one capacity case, and naming only one would hide half of what was assumed. The database checks the arithmetic itself (`gap_value = demand_value − capacity_value`), so a row cannot disagree with its own inputs, and the subtraction is done in PostgreSQL's exact decimal rather than in JavaScript, which would round a sixteen-digit value.

`delivery_gap_result_inputs` freezes the exact planning point and the exact capacity result. Twenty input rows behind ten gaps.

Identity is `(methodology version, market, locality, demand scenario, capacity scenario, period basis, year, season, peak type, unit)`, so summer and winter, peak-load and peak-net, and successive vintages all coexist rather than overwriting each other.

## Idempotence and cost

Rerunning over unchanged inputs wrote nothing: 0 inserted, 0 revised, 10 unchanged. Comparison is on the two stored input values rather than on the difference, which avoids ever rounding a sixteen-digit number to decide whether it moved.

## What PD-6 will have to change

The frontend's current demo chart assumes a seven-market delivery gap series. On this evidence it has one market, two seasons, five years, one scenario — and four markets that must render as *explained absence* rather than as an empty series or a zero line. Specifically:

- A market selector cannot default to "all seven".
- A zero line for CAISO, NYISO, ISO-NE, SPP, MISO or PJM would be a fabrication; each needs its blocker text.
- The ERCOT series needs its own disclosure about firm versus forecast peak, or a reader will compare it to ERCOT's margin and conclude Urdais is wrong.
- Negative gaps are normal and meaningful (capacity ahead of demand) and must not be clipped at zero.

## What would widen coverage

In order of value per unit of work: **ISO-NE's qualified capacity report** (adds a whole market, and ISO-NE already has demand), **PJM's FRR committed capacity or an RPM-scope demand series** (converts an existing capability into a gap), and **the CAISO resource-grain schema decision** (largest, and CAISO already has demand).
