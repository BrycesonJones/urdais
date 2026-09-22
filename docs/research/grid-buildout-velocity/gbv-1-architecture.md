# Grid Buildout Velocity — GBV-1 architecture and methodology foundation

**Status: internal design document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It writes no ingestion code, creates no migration, designs no analytics engine, adds no API route, changes no frontend, and computes no velocity number. It establishes no legal right.

**Inputs.** `gbv-1-external-research.md` and `gbv-1-source-matrix.json` are the external research of record. `gbv-1-source-verification.md` records what the two public candidate artifacts actually contain, parsed on 22 September 2026. Where verification and external research disagree, verification governs; the superseded claim is preserved in that document.

**Evidence marks.** `[verified]` parsed from a retrieved artifact in this phase. `[research]` carried from the external research at its own evidence mark. `[proposed]` a Urdais design decision, not a source fact.

---

## 1. What changed after verification

The external research recommended a two-market public V1 — **ERCOT and CAISO, both doing completions.** Parsing the artifacts moved both markets, in opposite directions.

| Claim | External research | Verified | Effect |
| --- | --- | --- | --- |
| ERCOT `Actual In-Service Date` | unparsed, inferred from a 2020 Planning Guide | **present, 262/262 on Completed, typed dates** | ERCOT promoted: a real completion census |
| ERCOT approval date | "not a mandated column" | 3 columns exist, but required only for Tier 1–3; 18.7% populated on a 79%-Tier-4 sheet | verdict unchanged, reasoning corrected |
| ERCOT miles | possibly usable | new/rebuilt split exists, but **Optional**, and >0 on only 33 and 63 of 262 | miles metric rejected |
| ERCOT per-project cost | "summary, project level not confirmed" | **withheld by design** — public file is the `No Cost` variant | cost metric rejected for ERCOT |
| ERCOT archive depth | backfill route | **2007–2014 only**, then an 11-year hole | historical depth cut hard |
| CAISO completions | co-equal public market | **8 in-service rows out of 233** | CAISO demoted for completions |
| CAISO `Project Status` | a clean native enum | uncontrolled free text; "in-flight" in 4 spellings | cannot be mapped mechanically |
| CAISO construction start | published actual; supports a construction-to-service median | column is **`Expected` Construction Start**, includes `TBD` | that metric rejected everywhere |
| CAISO ISD history | needs Urdais snapshots | **~15 vintage columns inside one workbook** | CAISO promoted for slip |

The net is not "one market instead of two". It is that **the two public markets support different metrics.** ERCOT can say how many projects were energised. CAISO can say how far schedules have moved from the date the board approved. Neither can do the other's job, and forcing both into one chart is what the old mock does wrong.

---

## 2. Product definition

**Grid Buildout Velocity measures how quickly tracked transmission infrastructure progresses into physical service, and how delivery schedules move over time, using each market's own project records.** `[proposed]`

It is a **count-and-duration** product, not a capacity product.

**A GBV project** is a transmission work item that a market operator lists in its own transmission project tracker, that is sponsored by a transmission owner, and whose completion the operator records or can be observed to record.

**Velocity** has exactly two admissible senses in V1:

1. **Throughput** — how many tracked projects entered service in a period.
2. **Schedule adherence** — how far a project's expected in-service date has moved from the date the publisher recorded for it earlier, where the publisher records such a date.

Both are per-market. Neither is a rate of capacity addition.

**Tracking, not approval, is the inclusion rule.** Membership in the publisher's tracker is what makes a project a GBV project. An approval milestone is **not** required, because it is not generally available: ERCOT's approval-shaped columns are mandatory only for Tier 1–3, and `Tier 4` is 208 of 262 completed rows — 79% `[verified]`. Requiring approval evidence would discard four fifths of the ERCOT census.

Approval therefore appears in exactly one place: **approval-to-service duration is a specific deferred metric, admissible only on the subset where an approval date is actually evidenced, published with its denominator and its scope named** (§7). CAISO's `Transmission Plan Approved` is a structured date across its portfolio `[verified]`, which is why M4 can anchor on it; ERCOT's is not, which is why no ERCOT metric does.

**Explicitly not GBV:**

- Generation, storage, or merchant capacity awaiting interconnection — **Interconnection Queue**.
- Signed MW of operational limit minus flow on a monitored element — **Transmission Headroom**.
- Whether planning demand exceeds a deliverable-capacity construct — **Power Delivery Gap**.
- Transformer or equipment procurement lead times. No market publishes these in a transmission tracker; the existing mock models them. Modelled inputs are not observations.
- Network upgrades triggered by a generator interconnection agreement, in any market.

**Why "velocity" and not "grid growth".** Growth implies a stock measured in physical units — miles, GW, GVA. §6 shows those units are unavailable, optional, or incomparable in every public artifact examined. Throughput and slip are measurable; growth is not.

---

## 3. Asset scope

Decided per asset type, on whether sources separate it. `[proposed]`

| Asset type | V1 | Reasoning |
| --- | --- | --- |
| Transmission lines — new | **include** | Core. ERCOT separates `Trans Circuit Miles New` `[verified]`. |
| Substations, switching stations | **include** | 138/345 kV substation work is the bulk of ERCOT completions `[verified]`. Excluding it would discard most of the census. |
| Transformers, autotransformers | **include** | Listed as projects; `Autotransformer Capacity (MVA)` is a distinct column `[verified]`. |
| Reactive devices (capacitor, reactor) | **include, labelled** | Present as projects with `Reactive Capability Added` `[verified]`. Count them; never convert Mvar into a velocity unit. |
| Reconductoring, rebuild, upgrade of existing facilities | **include, separately labelled** | ERCOT's separate rebuilt-miles column proves the publisher distinguishes them `[verified]`. Must never merge into "new build". |
| HVDC | **include when listed** | No public V1 market currently lists one in the parsed artifacts; do not build a special case yet. |
| Reliability-driven projects | **include** | The dominant driver class. |
| Economic / congestion-driven projects | **include** | Same lifecycle and tracker. |
| Public-policy-driven projects | **include** | Same. |
| Interregional projects | **include when listed by a member market**; no separate interregional series | Only one side would be observed. |
| **Generator-interconnection network upgrades** | **exclude** | Interconnection Queue owns these. §9. |
| **Load interconnection / points of delivery** | **exclude from headline, retain labelled** | 9 of 262 ERCOT completions are `POD` work, several named for data centres `[verified]`. Genuine transmission investment, but demand-driven connection, not network buildout. Publishing them inside a buildout count would overstate it. |
| Asset-condition / age-driven replacement | **exclude from V1** | ISO-NE runs this as an avowedly separate list where the operator "does not determine the need" `[research]`. A replacement series is a different product. |
| Distribution-voltage work | **exclude** | Below transmission scope; ERCOT includes some `Construct New Distribution Station` rows `[verified]` which the tier and kV fields can screen. |

**Rule.** Materially different asset types are counted in the same series only where the publisher itself tracks them in one list under one lifecycle. They are never summed into a physical unit.

---

## 4. Lifecycle model

Canonical classes, with publisher-native text retained verbatim on every observation. `[proposed]`

`proposed` · `planned` · `approved` · `in_development` · `under_construction` · `in_service` · `cancelled` · `suspended` · `unknown`

**The mapping rule that verification forced.** ERCOT's `Transmission Status` column disagrees with sheet membership on **44.7% of completed rows**, and the field dictionary marks that column **Optional** while marking `Actual In-Service Date` **Required once energized** `[verified]`.

> **Lifecycle is derived from the strongest evidence the publisher offers, not from whichever field is named "status".** Where a publisher partitions projects into lists, list membership is authoritative. A status string is a secondary observation, stored and shown, never the classifier.

### ERCOT `[verified]`

| Evidence | Canonical | Completion date | Confidence |
| --- | --- | --- | --- |
| Row on `Completed` sheet **and** `Actual In-Service Date` is a real date | `in_service` | known | authoritative |
| Row on `Completed` sheet, actual date is the `9999` sentinel (9 rows) | **`in_service`** | **`unknown`** | authoritative lifecycle, unusable date |
| Row on `Cancelled` sheet | `cancelled` | n/a | authoritative |
| Row on `Future` or `Planned` sheet, status text `Under Construction` | `under_construction` | n/a | status-derived, lower confidence |
| Row on `Future` or `Planned` sheet, status text `Planned` | `planned` | n/a | status-derived |
| Row on `Future` or `Planned` sheet, status text `Conceptual` | `proposed` | n/a | status-derived |
| Row on `Future`/`Planned`, status blank or `In-Service` (14 rows) | `unknown` | n/a | contradicts sheet |

**Lifecycle and date quality are separate axes, and a defect in one never overwrites the other.** The nine sentinel rows sit on the authoritative Completed sheet; ERCOT has stated they are complete. What is missing is the *precision of when*, not the fact of completion. Demoting them to `unknown` would let a date defect erase an authoritative lifecycle state and would under-report ERCOT's completions. They are therefore `in_service` with `completion_date_quality = sentinel_unknown`, carried in every backlog and stock figure, and excluded only from metrics that need a real date — where they are reported as a named date-quality exclusion, never dropped silently.

ERCOT has **no `approved` state in the tracker**. RPG review and BOD review dates approximate it for Tier 1–3 only. ERCOT has **no `in_development` and no construction-start** field at all.

### CAISO `[verified]`

`Project Status` is free text with four spellings of "in-flight" and two of "in service". It is **not mapped mechanically in V1.** CAISO rows carry:

- `approved` — from `Transmission Plan Approved`, which is a structured date and the reliable state.
- `cancelled` — from the 5 unambiguous `Cancelled` rows.
- `unknown` — everything else, with the native string retained.

CAISO's value in V1 does not depend on lifecycle classification. §7.

### Unmapped states

Every native string that does not map is retained, counted, and surfaced in a deferral record. An unmapped state is never silently folded into `unknown` without leaving evidence — the same discipline the other Power Analytics products use.

**Never infer completion from a planning status, and never infer it from the passage of a projected date.**

---

## 5. Project identity

**Primary key is the publisher's own project identifier, scoped to market and, where the publisher partitions, to the list.** `[proposed]`

- ERCOT: `ERCOT Project Number`. Native suffixes (`72876A`/`72876B`, `73371F`) denote phase or component splits and are **part of the identifier**, never normalised away `[verified]`. `Phase Number` is a separate column.
- CAISO: `TP Project ID`, e.g. `2223-R-08` `[verified]`.

**Uniqueness cannot be assumed.** The ERCOT Future sheet holds 1,429 rows against 1,424 distinct project numbers — 5 duplicates `[verified]`. Identity is therefore `(market, native_id, occurrence)` where occurrence disambiguates repeats within one retrieved sheet, and duplicates are flagged for review rather than merged or dropped.

Across sheets the partition is clean: zero intersection between Future, Planned, Completed and Cancelled `[verified]`. A project number appearing in two lists in one vintage is a defect to surface, not to resolve silently.

Handling of change:

| Event | Treatment |
| --- | --- |
| Rename | Identity follows the ID. Title is an observation with its own history. |
| Sponsor / TO change | New observation; identity unchanged. |
| Split | Native suffixed IDs are distinct projects, linked by a typed relationship. |
| Merge | Never inferred. Only recorded where a publisher states it, e.g. ERCOT `Associated Projects`. |
| Rescope | New observation. The at-approval date is never rewritten. |
| Correction | Supersede; the prior observation is retained. |
| Disappearance from a vintage | Not a completion and not a cancellation. It is `absent_from_vintage`, an observation in its own right. |

**No fuzzy matching.** Similar names, shared endpoints, or adjacent counties never join two projects. Cross-market identity is not attempted.

---

## 6. Quantity semantics

Native quantities are stored separately and never combined. `[proposed]`

| Quantity | Availability | Comparable within market | Comparable across markets |
| --- | --- | --- | --- |
| Project / upgrade count | ERCOT, CAISO | **yes**, with a stated inclusion rule | **no** — thresholds and project scale differ |
| Circuit miles, new | ERCOT only; **Optional**, >0 on 33/262 `[verified]` | no — zero is indistinguishable from unreported | no |
| Circuit miles, rebuilt/upgraded | ERCOT only; same defect `[verified]` | no | no |
| Service level kV | ERCOT `[verified]` | yes, as a label | no |
| Autotransformer MVA | ERCOT, Optional | no | no |
| Reactive Mvar | ERCOT, Optional | no | no |
| Project cost | **withheld** in the public ERCOT file; **absent by policy** from CAISO TDF `[verified]` | n/a | n/a |
| Transfer capability (MW/GW) | **published by no market tracker** `[research]` | n/a | n/a |
| Duration in days between two dated milestones | ERCOT (approval→service, Tier 1–3 only); CAISO (approval→expected) | yes, scoped | no |

**No synthetic common quantity is created.** There is no GBV "capacity added", no miles-equivalent, no cost-weighted index.

**The V1 unit is the project count, plus durations in days.** That is not a fallback — it is the only unit both artifacts support without an assumption.

---

## 7. Metric decision table

Numerator, denominator, cohort, date, floor, missing-data rule and scope for each. `[proposed]`

### `publish_v1`

**M1 — ERCOT projects entering service, by period**
- Numerator: distinct ERCOT projects on the `Completed` sheet with a real `Actual In-Service Date` in the period, after excluding generator-interconnection-driven and POD rows.
- Denominator: none; a count.
- Date: `Actual In-Service Date` `[verified]`.
- Cohort: energisation period.
- Floor: none — a count of zero is publishable and meaningful.
- Missing data: the 9 `9999` sentinel rows are `in_service` but carry no usable date, so they **cannot be placed in a period**. They are excluded from this metric only, and published beside it as a named date-quality exclusion with its count. They remain `in_service` everywhere else, including M2 and any stock or cumulative figure.
- Scope: ERCOT only. Public, with attribution.
- Caveat published alongside: the Completed sheet is a rolling window, currently 2025–2026 only `[verified]`, so early periods are not comparable to later ones until forward snapshots accumulate.

**M2 — ERCOT active backlog by lifecycle class**
- Numerator: count of projects in `under_construction` / `planned` / `proposed` as of a vintage.
- Date: the vintage's retrieval, not a project date.
- Missing data: rows whose status contradicts sheet membership are counted as `unknown` and shown as such.
- Scope: ERCOT. Point-in-time only; not a rate.

**M3 — ERCOT completions by service level kV and by works character**
- A labelled decomposition of M1 as **counts**. kV comes from `Service Level kV`, which is Required and 100% populated `[verified]`.
- Works character is a **four-way classification, including an explicit unknown**, because both mileage columns are **Optional** and a blank is not evidence of zero:

  | Condition | Class |
  | --- | --- |
  | new miles > 0 **and** rebuilt miles not > 0 | `new` |
  | rebuilt miles > 0 **and** new miles not > 0 | `rebuilt_or_reconductored` |
  | both > 0 | `both` |
  | neither > 0 — blank, zero, or non-numeric | `unknown_unclassified` |

- **Blank is never coerced to zero.** ERCOT does not state that an empty mileage cell means "no mileage", so a row reporting nothing is unclassified — not a substation project by inference.

  Measured on the current Completed sheet `[verified]`:

  | Class | Rows | Share |
  | --- | --- | --- |
  | `new` | 30 | 11.5% |
  | `rebuilt_or_reconductored` | 60 | 22.9% |
  | `both` | 3 | 1.1% |
  | **`unknown_unclassified`** | **169** | **64.5%** |

  Nearly two thirds of ERCOT completions report no mileage at all. Treating that as "zero miles, therefore substation work" would be an inference the source does not support, applied to the **majority** of the series.
- **The unknown bucket is published whenever it is non-zero**, with its count and share, beside the classified classes. A decomposition that hides it would read as though ERCOT completions were overwhelmingly substation work, which the source does not say.
- Never a mileage sum. The mileage fields decide a label only; their magnitudes are never added, averaged, or published as a quantity.
- Floor: suppress a kV class with fewer than 5 completions in the period. The `unknown_unclassified` count is never suppressed, since it is a data-quality disclosure rather than a small-sample statistic.
- Open question 4 in §17 would collapse this bucket: a publisher statement that blank means zero is the only thing that could justify reclassifying those rows.

**M4 — CAISO schedule slip against the approved in-service date**
- Numerator: per project, `Current In-Service July 2026 TDF` minus `In-service Date at Approval in Transmission Plan`, in days `[verified]`.
- Population: the 233 rows, excluding `Cancelled`.
- Published as a distribution — median and quartiles — never a single headline.
- Floor: 12 projects, consistent with the percentile floor reasoning used in Transmission Headroom.
- Missing data: rows lacking either endpoint are excluded and counted.
- Scope: CAISO. Public, with attribution.

**M5 — CAISO on-hold and cancelled counts, with published reasons**
- Counts plus the verbatim `Reason for ISD Change from Original Comitted Date` `[verified]`.
- Reasons are shown as published text; no reason taxonomy is invented.

### `defer`

| Metric | Why deferred, and what would unblock it |
| --- | --- |
| Trailing-12-month completions | Needs ≥ 4 consecutive ERCOT vintages retained. Revisit at GBV-5 + ~1 year. |
| Completion rate by approval cohort | Needs approval dates; ERCOT has them for Tier 1–3 only at 18.7% `[verified]`. Admissible later, scoped and with the denominator shown. |
| Median approval-to-service, ERCOT Tier 1–3 | Same. Defer until the Tier 1–3 completed sample passes a stated floor. |
| ISO-NE completions and PPA→in-service duration | Structurally the best remaining candidate `[research]`, but the RSP spreadsheet is unparsed and rights are `ambiguous_requires_legal_review`. GBV-2 should parse it. |
| PJM anything | No confirmed machine-readable export `[research]`. |
| Delay distribution outside CAISO | Needs vintage-over-vintage projected-ISD diffs, i.e. Urdais snapshots. |
| Line miles entering service | Would need the Optional miles fields to become reliably reported, or a publisher statement that blank means zero. |

### `reject`

| Metric | Why |
| --- | --- |
| Any seven-market headline | §8. |
| Transfer capability added (GW/year) | No tracker publishes it `[research]`. This is the mock's default metric. |
| Substation capacity added (GVA/year) | MVA is Optional and single-market; a GVA sum is an invented unit. |
| Transformer procurement lead time | Not an observation. The mock models it. |
| **Median construction-to-service duration** | Verification killed this: CAISO's column is `Expected Construction Start` including `TBD` `[verified]`, and no other market publishes construction start at all. The external research's "defensible in CAISO only" is withdrawn. |
| Project cost entering service, ERCOT | Cost is withheld from the public artifact by design `[verified]`. |
| On-time completion share mixing need-date and original-ISD | Two different clocks `[research]`. If ever built, one clock only, named. |
| Cross-market cost or miles totals | Incomparable, and partly unavailable. |

---

## 8. Cohort maturity and survivorship

The failure mode: computing a duration from completed projects only, so the slowest projects — still unfinished — never enter the statistic, and the published duration is biased downward. The Interconnection Queue work already refused a metric for a related reason, and the same discipline applies. `[proposed]`

Rules for any cohort or duration metric:

1. **Right censoring is explicit.** Unresolved projects stay in the denominator as censored observations. They are never dropped.
2. **Minimum cohort age.** No approval-cohort completion rate is published until the cohort is at least as old as the observed p90 completion time for that market, or a stated fallback if p90 is not yet estimable.
3. **Unresolved-share ceiling.** If more than 50% of a cohort is unresolved, publish the unresolved share instead of a completion rate.
4. **Both figures travel together.** Any duration statistic is published beside the count it was computed from and the count excluded.
5. **Slip is not survivorship-prone and is exempt.** M4 uses every non-cancelled project regardless of completion, which is precisely why it is publishable when completion durations are not.

---

## 9. Driver classification and the interconnection boundary

Every ingested row carries `driver_class` ∈ `regional_reliability` · `economic` · `public_policy` · `local_other` · `generator_interconnection` · `load_interconnection` · `asset_condition` · `unknown`. `[proposed]` V1 headline metrics use the first four.

**Classification is evidence-based, not regex-based.** Verification showed why: an ERCOT interconnection-request number (`\d{2}INR\d{3,5}`) appears in **8.0%** of completed rows, while roughly **20.2%** read as interconnection-driven on a broader keyword scan `[verified]`. A keyword match is a *signal*, not a classification.

Therefore:

- An explicit publisher marker — an INR number, a CAISO GIP workbook membership, an ISO-NE Part 2 section — classifies the row.
- A keyword signal alone yields `unknown`, which is **excluded from headline metrics and reported as a coverage gap**.
- The count of `unknown` rows is published with every metric. If `unknown` exceeds the rows classified into the four headline classes, the metric is withheld.

This deliberately under-claims. Publishing a buildout count contaminated with interconnection work would duplicate Interconnection Queue and overstate buildout; publishing a smaller number with a stated gap does neither.

---

## 10. Cross-market aggregation

**Decision: reject for V1, and reject as a default posture.** `[proposed]`

Not deferred. The external research found six independent comparability failures — lifecycle definitions, inclusion thresholds, project scale, timing conventions, cadence, granularity `[research]` — and verification added a seventh: **the two public markets cannot even support the same metric.** ERCOT has actual completions and no usable slip history; CAISO has slip history and eight completions.

A seven-market or even two-market headline would therefore be summing a throughput count with a schedule statistic, across populations whose smallest members are a capacitor bank and whose largest is a 500 kV line.

Any future cross-market presentation is a **labelled collage of market-native series on a shared time axis**, with per-market denominators visible — never a sum, ratio, or index.

---

## 11. Rights architecture

Classifications are carried from the external research. Nothing in verification changed one. `[research]`, retrieval `[verified]`.

| Source | Class | Retain | Calculate | Public display | Attribution |
| --- | --- | --- | --- | --- | --- |
| ERCOT TPIT (`No Cost` public XLSX, archive ZIP) | `reusable_with_attribution_or_conditions` | yes | yes | **yes** | Credit ERCOT |
| CAISO TDF TPP workbook | `reusable_with_attribution_or_conditions` | yes | yes | **yes** | Credit CAISO |
| CAISO GIP network-upgrades workbook | same class, **out of product scope** | n/a | n/a | n/a | — |
| ISO-NE RSP / Asset Condition | `ambiguous_requires_legal_review` | yes | yes | only under founder-accepted risk | unresolved |
| PJM pjm.com / TEAC / FERC | `ambiguous_requires_legal_review` | yes | yes | only under founder-accepted risk | unresolved |
| PJM Data Miner | `unsuitable_without_permission` | **no** | no | **no** | — |
| MISO website, MTEP PDFs, MTEP Portal | `unsuitable_without_permission` | **no** | no | **no** | — |
| SPP QPT / NTC / STEP | `unsuitable_without_permission` | **no** | no | **no** | — |
| NYISO CRP / manuals | `ambiguous_requires_legal_review` | yes | yes | only under founder-accepted risk | unresolved |
| NERC ESD | `unsuitable_without_permission` | **no** | no | **no** | — |
| EIA | `clearly_reusable` | yes | yes | yes | acknowledgment requested |

**MISO and SPP are not published for coverage symmetry.** They have the cleanest construction-tracking semantics in the matrix and that does not matter; the terms are the constraint. This mirrors the SPP decision already taken in Interconnection Queue.

No stored classification is relabelled. `ambiguous_requires_legal_review` may be displayed under founder-accepted risk with the classification and unresolved issue preserved in provenance; `unsuitable_without_permission` stays blocked.

The ERCOT `TransmissionOwnerProjContac` sheet holds named individuals, emails and phone numbers. **It is not ingested.**

---

## 12. Conceptual storage model

Design only; no migration in this phase. Shapes follow the existing `reference` / `pipeline` split and the append-only evidence rule enforced by `pipeline.forbid_mutation()`. `[proposed]`

```
reference.buildout_markets            market registry, inclusion rule, native list names
reference.buildout_source_interfaces  one per published artifact family
reference.buildout_lifecycle_states   canonical classes + per-market native strings
reference.buildout_driver_classes     driver vocabulary (§9)

pipeline.source_retrievals            (existing) HTTP retrieval + rights snapshot
pipeline.buildout_snapshots           one per (source interface, content hash, vintage)
pipeline.raw_buildout_records         row-level source bytes, verbatim
pipeline.buildout_projects            durable identity (market, native_id, occurrence)
pipeline.buildout_project_observations per-vintage attributes: title, owner, kV, tier, list
pipeline.buildout_lifecycle_observations canonical class + native text + derivation evidence
pipeline.buildout_milestones          typed dates (§13)
pipeline.buildout_quantities          native quantity + unit + as-published flag
pipeline.buildout_relationships       typed links: phase_of, associated_with, supersedes
pipeline.buildout_deferrals           unmapped states, duplicate ids, sentinels, unknown drivers
pipeline.buildout_analytics_runs      methodology version + input digest
```

Lineage is unbroken and reconstructible in both directions:

```
published metric → analytics run → lifecycle/milestone observation
                → project observation → raw record → snapshot
                → retrieval → rights snapshot
```

**Snapshot-first idempotence.** Identity is `(source interface, content hash, vintage key)`, checked before any work — the pattern already proven in Transmission Headroom, where a rerun wrote zero rows. ERCOT republishes in place at the same URL `[verified]`, so content hash, not filename, is the change signal.

---

## 13. Milestone semantics

Milestones are typed, append-only, and never overwritten. `[proposed]`

| Kind | ERCOT | CAISO |
| --- | --- | --- |
| `proposed_listed` | first vintage the project appears in | — |
| `approved` | `Date RPG Review Completed` (Tier 1–3), `Date ERCOT BOD Review Completed` (Tier 1) `[verified]` | `Transmission Plan Approved` `[verified]` |
| `target_in_service_at_approval` | **not published** | `In-service Date at Approval in Transmission Plan` `[verified]` |
| `target_in_service_current` | `Projected In-Service Date` `[verified]` | `Current In-Service July 2026 TDF` `[verified]` |
| `target_in_service_prior` | prior vintage's projected date, once snapshots exist | ~15 `Previous In-Service … TDF` columns, already in the file `[verified]` |
| `permit_filing_expected` | — | `Expected CPUC Permit Application Filing` `[verified]` |
| `construction_start_expected` | — | `Expected Construction Start` `[verified]` |
| `construction_start_actual` | **published by neither** | **published by neither** |
| `actual_in_service` | `Actual In-Service Date` `[verified]` | **not published** |

Invariants:

1. **An original target is never overwritten by a revision.** Each revision is a new row; the at-approval value is immutable once observed.
2. **Expected and actual are different kinds and never compared as if equal.** `construction_start_expected` may not be used in any duration metric that implies an actual.
3. **Precision is stored.** ERCOT dates are month/year by instruction though typed as datetimes `[verified]`; a day-precision reading is not asserted.
4. **Sentinels are typed, not parsed.** A `9999` actual-in-service value is stored with the raw value preserved and a date quality of `sentinel_unknown`. It makes **the date** unknown, never the lifecycle state the publisher's list already asserts (§4).
5. **Urdais-derived durations are never stored as milestones.** They are analytics outputs.

---

## 14. The existing frontend mock

`src/components/power-analytics/grid-buildout-chart.tsx`, 120 lines, rendered by `power-analytics-page.tsx`. **Not modified in this phase.** Context for GBV-4 only.

It reads `BUILDOUT_METRICS` from `src/data/mock/power-analytics.ts` and offers four measures via `aggregateByYear(...)` over all markets.

| Mock assumption | Supported by GBV-1? |
| --- | --- |
| `transfer-capacity` — "GW added / year", *"the most direct measure of network expansion"*, and the **default selected metric** | **No.** No tracker publishes transfer capability. Rejected in §7. |
| `circuit-miles` — miles added/year, summed across markets | **No.** ERCOT-only, Optional, >0 on 33/262 `[verified]`; cross-market sum rejected. |
| `substations` — "GVA added / year" | **No.** MVA is Optional and single-market; GVA is an invented unit. |
| `transformer-lead-time` — "**Modelled** lead time … averaged across markets", `lowerIsBetter: true` | **No.** Explicitly modelled, not observed, and not a transmission-project record. |
| `aggregateByYear` sums across the whole market universe | **No.** Cross-market aggregation rejected in §10. |
| One value per year, complete annual series | **No.** ERCOT completions currently cover 2025–2026 `[verified]`. |
| A single headline with a percent change versus prior year | **No.** Requires a comparable prior year that does not exist. |
| Column chart, one measure at a time, unit switches with the measure | **Yes** — the *interaction* pattern survives and suits per-market series. |
| `lowerIsBetter` support | **Yes** — reusable for M4, where a larger slip is worse. |

**All four mock metrics and the aggregation must be removed in GBV-4.** What survives is the chart shell: the measure selector, the unit-switching axis, the accessible `<desc>` series text, and the latest-bar emphasis. GBV-4 replaces the mock's cross-market annual series with per-market series and must introduce a market selector, which the component does not currently have.

---

## 15. Recommended V1

The narrowest defensible shape. `[proposed]`

**Public markets: ERCOT and CAISO — with different metrics.**

| Market | Source | Metrics | Cadence | Depth |
| --- | --- | --- | --- | --- |
| ERCOT | TPIT public `No Cost` XLSX | M1 completions, M2 backlog, M3 kV and works-character decomposition with an explicit unknown bucket | triannual `[research]`, change detected by content hash | 2025–2026 now; forward by snapshot. 2007–2014 archive is a separate optional backfill in a legacy format `[verified]` |
| CAISO | TDF Approved Projects TPP workbook | M4 slip distribution, M5 on-hold/cancelled with reasons | semiannual, Jan and Jul `[research]` | ~15 in-file vintages back to Jan 2022 `[verified]` |

**Deferred to GBV-2 assessment, internal only:** ISO-NE RSP list, the strongest unparsed candidate.

**Not in V1:** PJM (no confirmed export), NYISO (no portfolio), MISO and SPP (rights-blocked).

**Unit:** project counts and durations in days. No miles, no cost, no capacity.

**What the product says on day one.** For ERCOT, how many tracked transmission projects were energised in each period, decomposed by voltage and by works character — `new`, `rebuilt_or_reconductored`, `both`, or `unknown_unclassified`, the last being large on current data and published rather than hidden — with interconnection-driven work and completions carrying no usable date excluded and separately counted. For CAISO, how far projects have slipped from the in-service dates recorded when the board approved them, as a distribution with published reasons. Presented as two market-native panels that are never combined.

**What it must not say.** Any national or multi-market total; any capacity, mileage or cost figure; any completion duration that excludes unfinished projects.

---

## 16. Phase plan

### GBV-2 — canonical ingestion `[proposed]`

Scope: `reference` and `pipeline` migrations for §12; retrieval, snapshot and raw-record storage for ERCOT TPIT and CAISO TPP; a dependency-free XLSX read path (the PD-3C reader already exists and should be reused rather than re-implemented); lifecycle derivation per §4 including sheet-membership authority, the `9999` sentinel, and duplicate-ID flagging; driver classification per §9 with `unknown` preserved; **parse the ISO-NE RSP list and report whether it supports M1-equivalent metrics.**

Stop condition: both public sources ingest idempotently — a rerun over identical artifacts writes nothing — with deferrals populated and zero silent drops.

Validation gate: row counts reconcile to the source sheets exactly; the 262/1429/358/78 partition is reproduced; every unmapped native state appears in `buildout_deferrals`; rerun writes zero rows.

### GBV-3 — methodology and analytics `[proposed]`

Scope: methodology document at 1.0.0 with a registry-backed content-hash guard — use the DB-backed pattern from `assertMethodologyApproved`, **not** a filesystem read, so the guard survives serverless bundling; M1–M5 only; cohort and censoring rules from §8; sample floors; exclusion accounting.

Stop condition: metrics computed against production-shaped data with every exclusion counted and reconcilable to the input.

Validation gate: exclusions plus published rows equal input rows; no metric publishes below its floor; no cross-market aggregate exists anywhere in the output.

### GBV-4 — API and frontend `[proposed]`

Scope: read model with rights filtering in SQL; public API; replace the mock — delete all four `BUILDOUT_METRICS`, remove `aggregateByYear` for buildout, remove the mock import; add a market selector; render ERCOT and CAISO as separate panels with distinct units and their own attribution.

Stop condition: the mock is gone and the live surface renders both markets from the database.

Validation gate: no `@/data/mock/power-analytics` buildout import remains; both panels render; contract validation rejects any cross-market total; attribution present for both sources.

### GBV-5 — production activation `[proposed]`

Scope: apply migrations to production; ingest both sources; run analytics; register a currentness monitor sized to each source's real cadence (triannual and semiannual — a daily staleness threshold would be wrong); schedule; verify API and frontend.

Stop condition: production live, awaiting the unattended scheduler gate.

Validation gate: schema and ledger clean; zero domain violations; API 200; both panels live; currentness `current`; idempotent rerun; **and, per standing policy, the product is not complete until one unattended scheduled run is observed end to end.**

---

## 17. Open source gaps

Carried forward, with verification's additions marked.

1. **[new]** The ERCOT Completed sheet's retention window rule is unknown — actual dates span 2025–2026 only, so rows leave at some cadence. Determines whether forward snapshots are sufficient.
2. **[new]** ERCOT archive `.xls` internals (2007–2014) are unparsed; schema continuity with the 2026 workbook is unverified.
3. **[new]** No public ERCOT TPIT vintage appears to exist between 2014 and July 2026.
4. **[new]** Whether ERCOT's `Trans Circuit Miles` blank means zero or unreported. A publisher statement would unblock a mileage metric.
5. **[new]** Whether CAISO ever records an actual in-service date anywhere, or only status text.
6. **[new]** ERCOT `POD` rows: load-interconnection treatment needs a product decision (§3).
7. ISO-NE RSP spreadsheet columns and history depth — unparsed.
8. PJM: whether any machine-readable export exists.
9. NYISO: whether public PPTP quarterly status workbooks exist.
10. Legal: whether spp.org QPT can be treated separately from the SPP Portal terms; whether MISO Appendix A may be held internally.
11. Whether asset-condition replacement should become a separate "grid replacement" series.
12. PUCT CCN and state siting joins back to TPIT numbers.
