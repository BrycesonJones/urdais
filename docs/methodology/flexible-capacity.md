# Flexible Capacity

**Version 1.1.0.** Urdais Flexible Capacity states, for one balancing authority and one calendar year, how much additional flat electrical load that system could have carried below a stated peak reference if the new load accepted a stated annual curtailment energy allowance.

**This is a scenario model over observed balancing-authority demand. It does not measure firm interconnection capacity, transmission headroom, distribution headroom, or compute capacity.**

**Curtailment-enabled headroom is the maximum hypothetical additional flat load that remains below the methodology-defined peak reference after applying the scenario's allowed curtailment budget.**

---

## 1. What the product is for

Demand for large new interconnections is growing faster than transmission and generation are being built, and the queues that record it are measured elsewhere in Urdais. A separate question is worth asking of the system as it already stands: existing peaks are brief, most hours sit well below them, and a load willing to step back during the few tightest hours does not need the system to be built for its own peak.

This methodology answers that question and only that question. It is a counterfactual computed from observed hourly demand: not a forecast, not an assessment of what any particular site could interconnect, and not a claim that any megawatt is available to anyone.

## 2. Nature of the result

The output is a **scenario** quantity. Three things follow, and they are conditions of use rather than caveats:

1. **It is conditional.** Every figure is the answer to "what if", under assumptions §5 lists in full. Changing an assumption changes the figure, and the assumptions are published beside it.
2. **It is retrospective.** It describes a year that has already happened, using the demand that was actually observed. It says nothing about a future year.
3. **It is generation-adequacy only.** The single constraint represented is that total demand should stay below a peak reference. No transmission limit, interface limit, substation rating, local deliverability requirement or distribution constraint is represented anywhere in the calculation. A system with ample generation adequacy and no wires to a particular site produces the same number as one without that problem.

## 3. Output

| | |
| --- | --- |
| Metric | `curtailment_enabled_headroom_gw` |
| Quantity | Additional **flat electrical load**, in gigawatts |
| Grain | One balancing authority, one market-local calendar year, one value of alpha |
| Class | Generation-adequacy scenario headroom |

It is not firm capacity. Firm capacity is a commitment a system operator makes; this is an arithmetic property of a demand series.

## 4. The scenario control

The control is **alpha**, the `annual_curtailment_energy_fraction`: the energy the hypothetical new load forgoes over the year, as a fraction of the energy it would have consumed had it never curtailed.

An energy allowance is the control rather than a count of hours because the number of hours is an *output* of the model, not an input to it: how many hours a given allowance spends depends on the shape of the demand series, and fixing the hours instead would fix the wrong end of the problem. The retired scenario chart used an undefined "flexible hours per year" as its axis, which is the defect this parameter exists to remove.

### Equivalent full-load hours

The allowance restates cleanly in hours:

```
equivalent_full_load_hours = alpha x T
```

where `T` is the number of valid hourly observations used. For a complete non-leap year:

| alpha | Equivalent full-load hours |
| --- | --- |
| 0.25% | 21.9 |
| 0.50% | 43.8 |
| 1.00% | 87.6 |

This is an **energy equivalence**. It is the allowance divided by the new load's own size, and it is not:

- the number of clock hours in which any curtailment occurs,
- the number of curtailment events,
- the duration of any event.

Those three are reported separately, from the solved result. They are routinely larger than the equivalent full-load hours, because most curtailed hours are partial: a year may spend 43.8 equivalent full-load hours across several hundred clock hours of shallow reduction. Conflating the two overstates how often the load is interrupted and understates how many hours it is touched.

### Default scenarios

Methodology 1.0.0 publishes alpha at **0.25%, 0.50% and 1.00%**, with 0.50% as the default. These are Urdais scenario parameters. They are informed by the range external research found to be discussed in the literature, and they are **not** reproductions of any published figure: every value Urdais states is recomputed from EIA-930 by this methodology.

Alpha is bounded above at **5%**. The bound is a guardrail on the model's domain, not a claim that 5% is achievable: past a few percent, a load being curtailed becomes something other than the flexible-but-firm load this model describes, and the linear energy budget stops being a good account of it.

## 5. Inputs

The calculation keeps observed quantities and assumed quantities structurally apart, and every result carries both.

### Observed

| Input | Source |
| --- | --- |
| Hourly actual demand, MW | EIA-930 type `D`, via `pipeline.power_observations`, canonical and supersession-resolved |
| Balancing authority identity and zone | `reference.grid_areas` |

Nothing else is observed. In particular, no demand-response inventory, no storage inventory, no generation data, no transmission data and no price data enters the calculation.

### Assumed

| Parameter | 1.0.0 |
| --- | --- |
| `annual_curtailment_energy_fraction` | 0.0025, 0.0050, 0.0100; default 0.0050 |
| `annual_curtailment_energy_fraction_maximum` | 0.05 |
| `peak_reference_rule` | `modeled_period_observed_peak` |
| `peak_region_coverage_rule` | `local_calendar_day_of_observed_peak` |
| `peak_plausibility_max_over_p999` | 1.5 |
| `maximum_contiguous_gap_hours` | 1 |
| `modeled_load_shape` | `flat` |
| `rebound_model` | `no_rebound` |
| `curtailment_dispatch_foresight` | `perfect_within_period` |
| `battery_enabled` | `false` |
| `minimum_annual_coverage` | 0.995 |
| `missing_hour_treatment` | `excluded_no_interpolation` |
| `market_scope` | `per_balancing_authority_no_aggregation` |
| `solver_method` | `bisection_on_feasible_interval` |
| `solver_tolerance_mw` | 0.000001 |
| `validation_market` | `ercot` |

Each is registered in `reference.methodology_parameters` against this version, with its rationale, and is approved individually. **Nothing is unresolved.** Version 1.0.0 registered three parameters as unresolved drafts; §16 records how each was settled.

## 6. The modelled period, and local time

A modelled period is one **market-local calendar year**, expressed as a half-open interval of UTC instants from local 1 January 00:00 to the next local 1 January 00:00.

Peak demand is a local-calendar idea, so the window must be local. Canonical storage is UTC and stays UTC, and the series is indexed by instant throughout.

That choice disposes of daylight saving rather than handling it. Both boundaries fall in standard time, so the interval contains exactly 24 x (365 or 366) hours however many clock changes lie inside it. The spring-forward hour that "disappears" and the autumn hour that "repeats" are properties of wall-clock labels, not of instants: no instant is lost and none is duplicated. A series built from local hour labels would lose one hour every March and double one every November; this one cannot. The local *days* are 23 and 25 hours long respectively, and the year still totals 8,760.

`T`, the observation count used in the budget, is the number of valid observations actually present — never an assumed 8,760.

## 7. Coverage, and why nothing is interpolated

A market-year may be modelled only if its hourly coverage is at least **99.5%**.

**Missing hours are excluded. They are never interpolated, carried forward, or filled from any model.** The reason is specific to this metric: the answer is decided by the top of the load distribution, and the peak reference is a single observed hour. An invented value near the top of the distribution would change the result while being indistinguishable from evidence. Excluding an hour costs one term in a sum of thousands; inventing one can move the reference itself.

The threshold is calibrated against measured history. A complete backfill of local year 2025 across all seven markets returned:

| Coverage | Markets |
| --- | --- |
| 100.0000% (0 hours absent) | ERCOT, MISO, SPP |
| 99.9886% (1 hour absent) | PJM, NYISO, ISO-NE |
| 99.9772% (2 hours absent) | CAISO |

The worst observed market-year is missing two hours. A floor of 99.5% is roughly twenty times that, so a normal year passes without strain, while a year that has lost more than about 44 hours is refused rather than modelled.

### The peak region must be complete

A coverage ratio bounds how *many* hours are absent, not *where* they are, and those are not the same risk. Forty-four hours scattered across a mild spring are nearly harmless. Forty-four consecutive hours of an August afternoon could remove the year's true maximum, leave a surviving shoulder hour to become `Peak_ref`, and produce a headroom figure higher than the evidence supports — with a coverage ratio that still looks healthy.

So 1.0.0 adds a second, topological condition:

> **The local calendar day containing the observed maximum must be completely present. A market-year whose peak day has any missing hour is ineligible.**

It is deterministic from the observed series and invents no threshold, which is why it can be adopted now. The day is counted in instants, so a spring-forward peak day legitimately expects 23 hours and a fall-back day 25; nothing assumes 24. Every result reports the peak day, its expected hours and its present hours, so the check is visible rather than implicit.

**This is a necessary condition, not a sufficient one.** A complete peak day cannot prove that a gap elsewhere in the year did not contain a higher value. Bounding that residual is what the third condition does.

### No contiguous gap longer than one hour

> **A market-year containing a run of two or more consecutive absent hours is ineligible, wherever that run falls.**

Measured, not chosen. The full design and results are in `docs/research/flexible-capacity/fc3-gap-sensitivity.md`; two findings decide it.

**Observed gaps are bimodal.** Across fourteen complete market-years spanning 2023 and 2024, a gap is either a single isolated hour or a publisher outage of 22 to 25 hours. No gap between 2 and 21 hours was ever observed, so every threshold in that whole interval admits exactly the same market-years.

**Distortion grows steeply with length.** Deleting a contiguous block adversarially — at the worst position outside the peak day — overstates headroom by up to:

| Gap | α = 0.25% | α = 0.50% | α = 1.00% |
| ---: | ---: | ---: | ---: |
| 1 h | 3.19% | 1.58% | 0.77% |
| 2 h | 6.20% | 3.11% | 1.50% |
| 6 h | 13.01% | 7.72% | 3.68% |
| 24 h | 14.11% | 10.19% | 5.81% |
| 96 h | 30.35% | 21.12% | 13.80% |

Since the entire interval [1, 21] admits the same market-years, the choice costs nothing in coverage and the tightest bound wins. One hour it is.

The distortion is **one-sided**: it always overstates. Deleting a low-load hour only removes budget and lowers the answer; deleting an hour that was carrying curtailment removes a constraint and raises it. Only the second direction is dangerous, and it is the one bounded here.

Worst-case distortion is **not monotone in gap length**. A long gap cannot be aimed — twenty-four hours necessarily swallows a nightly trough, while six hours can sit entirely on one afternoon — so a threshold of N promises that no gap of *any* length up to N distorts by more than the stated bound, never a single measurement taken at N.

**The residual limitation.** At one hour the bound is 3.19%, at the smallest published allowance. That is real and is reported on every result rather than hidden. For scale, the smallest year-over-year movement measured in D\* itself across these markets is 20.8%, so the measurement distortion is about a sixth of the smallest genuine signal it could be confused with.

## 8. The calculation

### Peak reference

```
Peak_ref = max over t in the modelled period of Load_t
```

The **modelled period's own maximum observed hourly actual demand**, with ties resolved to the earliest hour so the result never depends on iteration order.

Three properties recommend it. It is entirely observed, requiring no forecast and no planning document, so the scenario rests on one source. It is within-period, so modelling year Y needs only year Y — a rule referencing the prior year would need two complete years before it could state anything, and would mix two periods in one figure. And it makes every gap non-negative, so the counterfactual is exactly "without raising the peak this system actually reached".

The alternatives considered and **not** adopted are named in the code so the choice is on the record: `prior_period_observed_peak`, `seasonal_observed_peak`, `percentile_of_observed_load`. Adopting any of them is a methodology version change, not a code change.

### Is the maximum a peak at all

> **A market-year whose maximum exceeds the 99.9th percentile of its own hourly loads by more than 1.5× is ineligible.**

This rule exists because FC-3 found a case no coverage rule could catch. SPP published **3,621,097 MW** for the hour beginning 2023-06-12T22:00Z — sixty-five times that market's real annual peak of about 56 GW. The year is 100% complete, contains no gaps at all, and satisfies every other condition. Taken at face value it produces 3,597 GW of headroom, which is not a number about anything.

The canonical observation is evidence and is never repaired, so the value stays exactly as the publisher sent it and the **market-year** is refused instead.

The factor is measured. Across the twenty genuine market-years examined, the maximum sits between **1.008 and 1.063** times the 99.9th percentile, because a real annual peak is by definition near the top of its own distribution. A factor of 1.5 is seven times the widest genuine separation and forty-four times below the defect: it cannot plausibly reject a real peak, and it cannot plausibly admit that one.

### Required curtailment

For each hour `t`, let `d_t = Peak_ref - Load_t` be the headroom below the reference. For a hypothetical additional flat load `D`:

```
R_t(D) = min( D , max( 0 , D - d_t ) )
```

`R_t` is the megawatts the new load must shed in hour `t`. The outer `min` is physical: new load can curtail itself and nothing else, so it can never shed more than its own size, and an hour whose demand already exceeded the reference is not something the new load can repair. Under the reference rule 1.0.0 adopts, every `d_t` is non-negative and the clamp never binds; it is stated because it is the definition.

### The budget, and the solution

`D*` is the largest `D >= 0` satisfying

```
sum over t of R_t(D)  <=  alpha x D x T
```

and

```
curtailment_enabled_headroom_gw = D* / 1000
```

with `D*` in MW.

### Why a solution exists and is unique

Each `R_t` is non-decreasing, convex and piecewise linear in `D`, so their sum is too; the budget is linear in `D`. Their difference is therefore convex and zero at `D = 0`, so the feasible set is an interval anchored at zero: **if `D` is feasible, so is everything below it.** That is what makes a one-dimensional search valid, and it is tested directly rather than assumed.

At `alpha = 0` the result is exactly zero, for every system: the peak hour has `d_t = 0`, so any positive flat load requires curtailment there, and no curtailment is permitted.

### Solver

| | |
| --- | --- |
| Method | Bisection on `[0, U]` |
| Upper bound `U` | `sum_t max(d_t, 0) / ((1 - alpha) x T)` |
| Tolerance | 0.000001 MW, or 100 iterations |
| Returned value | The **feasible** end of the final bracket, never the infeasible end |
| Rounding | Floored to 6 decimal places in MW; reported energy is recomputed at the rounded value |

The bound is analytic, not guessed. Since `R_t >= D - max(d_t, 0)`, any `D` above `U` requires more curtailment than the budget can buy. Where no hour exceeds the reference, `U` is exactly `(Peak_ref - mean Load) / (1 - alpha)`, which is also the plain-language ceiling for the whole product: headroom cannot exceed the average unused headroom, inflated by whatever curtailment is permitted.

Returning the feasible end guarantees the published figure satisfies its own budget rather than approximating it. Reported energy is then recomputed at the reported headroom, so the two always describe the same scenario.

### Derived figures

From `D*`, each reported alongside the headroom:

| Figure | Definition |
| --- | --- |
| `curtailed_energy_mwh` | `sum_t R_t(D*)` |
| `curtailment_clock_hours` | Count of hours where `R_t(D*) > 0` |
| `curtailment_event_count` | Maximal runs of consecutive curtailed hours |
| `mean_curtailment_event_hours` | Mean run length |
| `max_curtailment_event_hours` | Longest run |

A run is broken by a missing hour. An absent observation never bridges two events into one.

## 9. Storage

**Storage contributes nothing in version 1.0.0, and `battery_enabled` is registered as an approved `false`.**

Three independent reasons, each sufficient:

1. **It is not additive with curtailable load.** Both serve the same tight hours. A battery that discharges during the peak and a load that steps back during the peak are substitutes for one another over the same hours, and adding their contributions counts the same headroom twice. The retired scenario chart added them, with an unexplained 0.8 multiplier on the battery term; that multiplier has no basis and is not carried forward.
2. **There is no inventory to use.** Urdais holds no deployed-storage figures for any market. The interconnection queue holds thousands of battery *requests*, and a battery in a queue cannot shift load. `reference.capacity_component_kinds` already names `storage_capability`, and no row has ever been written to it.
3. **It is a materially larger model.** Storage is characterised by power, energy, duration, round-trip efficiency, state of charge and recharge opportunity. None of those is representable in a flat-load energy-budget formulation, and pretending otherwise would produce a number with no defensible derivation.

`deployed_storage_inventory` is registered as an unresolved parameter. A future version may add storage once such an inventory exists and the non-additivity is modelled explicitly — not by summing two independent terms.

## 10. Demand response

Demand response is **not** an input to version 1.0.0, and the reason it is written down here rather than merely omitted is that adding it later is a specific, identified trap.

Some publishers already net demand response out of the demand they report. SPP defines Net Peak Demand as forecast peak demand less controllable and dispatchable demand response, and the Urdais ingestion for that source carries `netPeakDemandExcludesDemandResponse` on every record precisely so the fact survives. A future phase that ingests a demand-response inventory and adds it to a demand series that already excludes it would count the same megawatts twice.

Any version that introduces demand response must first establish, per publisher, whether the demand series it is added to already nets it out. `demand_response_inventory` is registered as unresolved until then.

## 11. Terminology this product may not use

The output is electrical load headroom under a scenario. These framings assert something the model does not establish, and none may appear in Urdais code, field names, copy, API responses or documentation:

- **"unlocked compute GW"**, **"additional compute capacity"**, **"compute capacity unlocked"** — the model produces electrical megawatts. No conversion from electrical load to computational capacity is performed anywhere in Urdais, and none is implied. Converting one to the other would require assumptions about facility power usage effectiveness, accelerator power draw, utilisation and refresh that this methodology does not make and no Urdais source supports.
- **"total unlocked"**, **"unlocked capacity"** — "unlocked" asserts availability. The result is a counterfactual property of a demand series, not a quantity anyone can procure.

The permitted terms are **curtailment-enabled headroom**, **additional flat load**, **scenario headroom** and **generation-adequacy scenario**. The prohibition is enforced by test, not by convention.

## 12. Geographic scope

Published **per balancing authority**. Seven are in scope: ERCOT, PJM, MISO, SPP, CAISO, NYISO and ISO-NE. ERCOT is the validation market, because its history is complete and its peak is sharply defined.

**Markets are never summed.** There is no Flexible Capacity total, no national figure, and no cross-market aggregate of any kind.

Each balancing authority sets its own peak reference from its own demand, and those references belong to different systems with different peak hours, different seasons and no shared adequacy constraint. Adding the results would produce a number describing no system that exists — it would assume, silently, that headroom in one market can serve load in another, which is exactly the transmission question this methodology explicitly does not represent. `market_scope` is registered as `per_balancing_authority_no_aggregation`.

## 13. Validation

A result is published only if all of the following hold.

**Inputs.** Every load value finite and non-negative; every timestamp an exact UTC hour inside the period; no duplicate hour after supersession is resolved; `0 <= alpha <= 0.05`; coverage at or above the floor; **the local calendar day holding the peak reference complete**; **no contiguous gap longer than one hour**; **the maximum within 1.5× the 99.9th percentile**; the series market equal to the period market.

**Output.** `D*` finite and non-negative; curtailed energy finite; curtailed energy no greater than the reported budget; `R_t <= D*` in every hour; no NaN or infinity anywhere; no negative clock-hour or event count; the result reproducible exactly from the same inputs.

**Semantic.** `alpha = 0` yields `D* = 0`. `D*` is non-decreasing in alpha. No result aggregates markets. No result includes a storage contribution.

**Publication.** Separate from, and in addition to, the above: nothing may be published while any registered parameter of the approved version is unapproved or unresolved. This gate fails closed and is not satisfiable at 1.0.0 as registered.

## 14. Limitations

Attached to every result, not only recorded here:

1. A scenario over observed demand: not a forecast, and not a measurement of available capacity.
2. Electrical load headroom. Not compute capacity; no conversion to compute is performed or implied.
3. Generation adequacy only: no transmission, distribution, interconnection or local deliverability limit is represented.
4. Assumes the new load is flat, and that its curtailment is dispatched in exactly the hours required — that is, with perfect knowledge of the year. A real operator without foresight would achieve less.
5. Curtailed energy is forgone, not deferred. No rebound is modelled, so a load that must make up the work later is not described by this figure.
6. Storage contributes nothing, and is not additive with curtailable load.
7. Demand response is not an input, and some publishers already net it out of demand.
8. Published per balancing authority. Markets are not summed and no national figure exists.
9. A single missing hour outside the peak day can overstate headroom by up to 3.19% at the smallest published allowance. Longer gaps make a market-year ineligible rather than distorting it.
10. A market-year whose maximum is implausibly far above its own distribution is refused, not corrected. The canonical value stays as the publisher sent it.

## 15. Versioning

Version 1.1.0 is registered in `reference.methodologies` and `reference.methodology_versions` with the SHA-256 of this document. Authorisation is a registry read: the calculation checks that the version is registered, approved, and carries the digest the code was written against. The presence of this file on disk authorises nothing.

An approved version is never edited in place. Version 1.0.0 remains registered as `superseded` with its own digest and its own parameter set, so what was believed at the time stays readable. 1.0.0 published nothing during its life — it was blocked by its own unresolved parameters — so superseding it costs no published figure.

## 16. What 1.1.0 resolved

Version 1.0.0 registered three parameters as unresolved drafts, and a publication gate that fails closed while any parameter is unresolved. All three are now settled, and the gate opens.

| Parameter | 1.0.0 | 1.1.0 | How |
| --- | --- | --- | --- |
| `maximum_contiguous_gap_hours` | unresolved | **1** | Measured, §7 |
| `demand_response_inventory` | unresolved | **not used in 1.1.0** | Scope, below |
| `deployed_storage_inventory` | unresolved | **not used in 1.1.0** | Scope, below |

**The two inventories were the wrong kind of unresolved.** Neither is consumed anywhere in this methodology's calculation. The model adds a hypothetical flat load to an observed demand series and asks what curtailment budget keeps it below the observed peak; no term reads a demand-response inventory, and `battery_enabled` is false so no term reads a storage inventory. Leaving them unresolved blocked publication on the absence of something the model never asked for. They are now approved as explicitly out of scope, which is a resolution; a fabricated number would not have been.

Nothing they warned about is weakened. §9 still refuses to model storage and still gives the three reasons. §10 still records that some publishers already net demand response out of the demand they report, and that any future version introducing a demand-response term must establish per publisher whether the series it is added to already excludes it. Both parameters remain candidates for a future version, and a version that enables either must register it as an input rather than re-approving it as out of scope.

One rule was **added** rather than resolved: `peak_plausibility_max_over_p999`, §8. FC-3 found a market-year that passed every existing condition and produced a meaningless figure, which is a defect in 1.0.0 discovered by running it against three years of real data.
