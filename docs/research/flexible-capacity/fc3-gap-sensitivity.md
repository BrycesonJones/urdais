# FC-3: the gap-sensitivity study

**Status: internal research record. Not the public methodology, not routed publicly, and not registered in the docs catalog.** This document records how `maximum_contiguous_gap_hours` was resolved and why `peak_plausibility_max_over_p999` had to be added. No figure in it is a published Urdais value. The rules it produced live in `docs/methodology/flexible-capacity.md` version 1.1.0.

---

## 1. The question

FC-2 froze two of the three conditions a market-year must satisfy and left the third open on purpose:

> A coverage ratio bounds how *many* hours are absent, not *where*. Forty-four hours scattered across a mild spring are nearly harmless; forty-four consecutive hours of an August afternoon could remove the year's true maximum. 1.0.0 does not close this.

Rather than pick a number, FC-2 registered `maximum_contiguous_gap_hours` as unresolved and made publication fail closed while it stayed that way. FC-3's job was to measure it.

## 2. Why the evidence had to be manufactured

Measured EIA-930 history is almost complete. FC-2 looked at 2025 alone and found a worst case of two absent hours in 8,760. Waiting for a year bad enough to be informative would mean never resolving the parameter.

So the experiment is a controlled deletion: take a market-year that is complete, remove a contiguous block of known length at a known position, and measure what the model does. The manufactured gap is the independent variable; everything else is held fixed.

## 3. What is being measured, and why the search is tractable

With the peak day complete and the deletion outside it, **`Peak_ref` is invariant** — the maximum survives, so every `d_t` is unchanged. The entire effect falls on the feasibility equation

```
sum_t max(0, D - d_t)  <=  alpha * D * T
```

Deleting an hour removes its term `c_t = max(0, D − d_t)` from the left and one unit of `T` from the right. That gives the whole phenomenon:

- Deleting a **low-load** hour removes nothing from the left — its `c_t` is zero — and only shrinks the budget. **D\* falls.** Understating headroom is the safe direction.
- Deleting a **high-load** hour removes a large `c_t` and only `alpha × D` of budget. **D\* rises.** Overstating headroom is the dangerous direction, and it is the one a threshold must bound.

It also identifies the worst case without brute force: the most damaging window of length L is the one maximising `Σ c_t` over L consecutive hours, which one sliding pass finds. The argument is first order, so the study recomputes the **top 40** windows of that ranking rather than only its best entry.

**The shortcut was verified, not assumed.** Against an exhaustive scan of every admissible placement on ERCOT 2025:

| Gap | Exhaustive worst | Analytic worst | Agrees |
| ---: | ---: | ---: | :---: |
| 6 h | 4.82354% | 4.82354% | ✔ |
| 24 h | 5.12466% | 5.12466% | ✔ |
| 48 h | 8.44247% | 8.44247% | ✔ |

## 4. Design

| | |
| --- | --- |
| Markets | all seven |
| Years | market-local 2023, 2024, 2025 |
| α | 0.25%, 0.50%, 1.00% |
| Gap lengths | 1, 2, 3, 6, 12, 18, 24, 36, 48, 72, 96 hours |
| Placements | worst-contribution (top 40), highest-load, peak-day-adjacent, median-load, lowest-load |
| Excluded | any window intersecting the local peak day — already fatal under the FC-2 rule |
| Excluded | market-years with pre-existing gaps, which would confound the manufactured one |

Implementation: `src/lib/flexible-capacity/research/gap-sensitivity.ts`, run by `npm run flexible-capacity:gap-study`.

## 5. Finding one: observed gaps are bimodal

Gap topology across the fourteen complete market-years of 2023–2024:

| Market-year | Missing hours | Longest run |
| --- | ---: | ---: |
| ERCOT 2023, ERCOT 2024, MISO 2023, NYISO 2023, NYISO 2024, ISO-NE 2023, CAISO 2024 | 0 | 0 |
| CAISO 2023 | 2 | 1 |
| ISO-NE 2024 | 3 | 1 |
| SPP 2024 | 25 | 24 |
| MISO 2024 | 24 | 24 |
| PJM 2024 | 22 | 22 |
| PJM 2023 | 25 | 25 |

A gap is either **a single isolated hour** or **a publisher outage of 22 to 25 hours**. Nothing between 2 and 21 hours was ever observed.

That matters more than it looks: **every threshold in [1, 21] admits exactly the same market-years.** The choice is free in product terms across that whole interval.

## 6. Finding two: distortion grows steeply, and is not monotone

Worst-case overstatement of D\*, maximum over all markets and years, by gap length:

| α | 1 h | 2 h | 3 h | 6 h | 12 h | 24 h | 36 h | 96 h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.25% | **3.19%** | 6.20% | 8.54% | 13.01% | 13.40% | 14.11% | 23.09% | 30.35% |
| 0.50% | **1.58%** | 3.11% | 4.46% | 7.72% | 9.28% | 10.19% | 17.84% | 21.12% |
| 1.00% | **0.77%** | 1.50% | 2.16% | 3.68% | 5.43% | 5.81% | 10.31% | 13.80% |

Two properties of that table are worth stating.

**Sensitivity rises as α falls.** At 0.25% the budget is 21.9 equivalent full-load hours and only about 56 clock hours carry any curtailment, so losing one of them is proportionally large. The most sensitive published scenario sets the bound.

**Worst-case distortion is not monotone in gap length.** On ERCOT 2023, six hours (7.38%) distorts more than twelve (7.34%) or eighteen (7.30%). A long gap cannot be aimed: twenty-four hours necessarily swallows a nightly trough whose hours carry no curtailment and only cost budget, while six hours can sit entirely on one afternoon. The curve therefore has local maxima at the diurnal rhythm.

Consequently a threshold of N promises that **no gap of any length up to N** distorts by more than the stated bound — a running maximum, never a single measurement taken at N.

## 7. The resolution

> **`maximum_contiguous_gap_hours = 1`**

The argument is short because the two findings do the work. Every threshold in [1, 21] admits the same market-years, so the choice costs nothing in coverage; and distortion at 1 hour (3.19%) is a quarter of distortion at 12 hours (13.40%). When the options are indistinguishable in what they admit, the tightest bound wins.

The choice is also **robust**: it would take a market-year with a gap of exactly 2 to 21 hours to make any threshold in that range behave differently, and no such year exists in three years of seven markets.

**The residual limitation, stated rather than hidden.** At one hour the bound is 3.19% at α = 0.25%, one-sided and always in the direction of overstatement. For scale, the smallest year-over-year movement in D\* measured across these markets is 20.8% (PJM 2023 → 2024 at α = 0.50%), and the largest is +76% (ERCOT 2023 → 2024). The measurement distortion is about a sixth of the smallest genuine signal it could be confused with. It is carried on every result as a standing limitation.

**What was not done.** No α-dependent threshold, though the table invites one: a single rule is simpler to state and to check, and the bound is set by the most sensitive scenario, which is the conservative reading. No attempt to infer a missing hour's load from its neighbours — that would be a new modelling assumption with its own justification to earn, and FC-3's brief was to measure, not to invent.

## 8. What the study found that it was not looking for

Running the model over three years of real data surfaced a defect no coverage rule could catch.

**SPP published 3,621,097 MW for the hour beginning 2023-06-12T22:00Z** — sixty-five times that market's real annual peak of about 56 GW, and roughly six times the entire generating capacity of the United States.

SPP 2023 is **100% complete**, contains **no gaps at all**, and satisfies every condition FC-2 defined. Under `modeled_period_observed_peak` its `Peak_ref` becomes 3.62 TW, every `d_t` becomes enormous, and the model reports **3,597 GW** of curtailment-enabled headroom. The figure is not wrong so much as not about anything.

This is a real contradiction in the methodology as specified: the peak rule cannot distinguish a peak from a publisher error, and no other rule looks.

The canonical observation is evidence and is never repaired, so the value stays exactly as SPP sent it and the **market-year** is refused instead. The rule is measured, not assumed:

| | max ÷ 99.9th percentile |
| --- | ---: |
| Twenty genuine market-years | **1.008 – 1.063** |
| SPP 2023 | **66.172** |

A real annual peak is by definition near the top of its own distribution. A factor of **1.5** is seven times the widest genuine separation and forty-four times below the defect: it cannot plausibly reject a real peak, and it cannot plausibly admit that one.

Registered as `peak_plausibility_max_over_p999 = 1.5`, new in 1.1.0.

## 9. What this means for eligibility

Applying all four conditions to 2023–2025, seven markets, twenty-one market-years:

| Outcome | Count | Market-years |
| --- | ---: | --- |
| Eligible | **16** | all of CAISO, ERCOT, ISO-NE, NYISO; MISO 2023 & 2025; PJM 2025; SPP 2025 |
| Refused — contiguous gap | 4 | PJM 2023 (25 h), PJM 2024 (22 h), MISO 2024 (24 h), SPP 2024 (24 h) |
| Refused — implausible peak | 1 | SPP 2023 |

Sixteen of twenty-one, refused for stated reasons rather than modelled with a caveat.

## 10. Reproducing it

The inventory, baselines and full experiment sweep:

```bash
npm run flexible-capacity:gap-study -- --years 2023,2024,2025
```

With the exhaustive confirmation for one market-year, which is slow:

```bash
npm run flexible-capacity:gap-study -- --years 2025 --market ercot --exhaustive
```

Both read canonical observations and write nothing.
