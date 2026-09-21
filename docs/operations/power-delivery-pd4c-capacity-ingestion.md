# Power Delivery PD-4C: grid capacity ingestion

**Status:** internal implementation note. Not the public Power Delivery methodology, and no frontend surface reads this data.

PD-4B built the grid capacity domain. PD-4C fills three of its seven markets with real first-party values and, in doing so, corrected two things the schema had assumed. What is not ingested is recorded with a reason rather than left as an absence.

## What is ingested

| Market | Source | Vintage | Capability | Requirements | Constraints | Evidence only |
| --- | --- | --- | --- | --- | --- | --- |
| ERCOT | Capacity, Demand and Reserves Report, December 2025 | `cdr-2025-12` | 20 | — | — | 20 |
| CAISO | Final Net Qualifying Capacity Report, compliance year 2026 | `nqc-final-2026` | — | — | — | 19,368 |
| ISO-NE | Summary of ICR and Related Values | `icr-summary-2025-12-16` | 95 | 74 | 240 | 80 |

A further 20 ERCOT components and 19 ISO-NE components are demand, classified `diagnostic_only`: a firm peak load or a 50/50 summer peak forecast is retained only so a requirement or a reserve margin can be checked against the figure it was set against. Demand is never capability. ISO-NE's 95 capability rows are all tie benefits; it publishes no qualified capacity in this artifact.

Run with `npm run power-delivery:capacity-ingest -- --source ercot`, or `--all`. `--dry-run` parses without writing. Every run prints what it deferred alongside what it stored.

There is no cron. These are annual publications; a nightly job would spend a year confirming nothing had changed.

## Two numbers that check the parser

The research put ERCOT's Summer 2026 capacity at 104,850 MW and ISO-NE's 2026 third ARA ICR at 31,059 MW. Both come out of the parser: 104,849.98533433278 MW from cell D56 of `Seasonal Summary`, and 31,059 MW from cell C21 of `FCA14-FCA18 (2023-2027) `. Neither is written down anywhere in this codebase.

One figure in the PD-4C brief is misattributed. 91,875 MW is not Winter 2026/27; it is Summer 2026 measured at the **peak net load hour** rather than the peak load hour (cell E56, 91,874.564 MW). Winter 2026/27 at the peak load hour is 95,388.42 MW. The two hours are kept as separate scenarios precisely because they are separate answers to the same question.

## What each publisher means, kept

Nothing is normalised into a common currency. ERCOT's CDR states protocol accounting, so its capacity basis is `accredited`; ISO-NE states installed capacity, so its basis is `icap`. A megawatt of ICAP and a megawatt of accredited capacity are not the same promise and the schema will not let them be added.

**ERCOT.** `Total Capacity` is the capability. Labels in the CDR indent by moving column, so the reader looks in both B and C; a reader that looked only in C would find the demand row and silently lose every capacity figure. Each season has three columns and the third is a difference between the other two, so it is dropped rather than stored as a third statement. The reserve margin is a ratio and the capacity tables are in MW, so it is kept as evidence rather than reshaped into a quantity. No zonal figure and no DC-tie rating: ERCOT has no capacity zones in the resource-adequacy sense, and a tie rating is an interconnection limit, not an accredited contribution.

**CAISO.** The NQC report is per resource — 1,753 generators, twelve monthly values each — and states no total. Every published resource-month is stored as evidence with its deliverability status attached, and **no capability component is created.** Summing the column would produce a number CAISO has never stated, across full-capacity, partial, interim and energy-only resources whose megawatts are different promises; that aggregation is a methodology decision, and PD-4A left it behind a signed methodology. The ten local capacity areas come from CAISO's own enumeration on the header sheet, not from the data, so a typo in one row cannot invent an area. `CAISO System` is not seeded as a locality: it is how the sheet says a resource is in none of them.

**ISO-NE.** Two header rows carry the meaning — row 4 names the metric family, row 5 the zone or interface it applies to — and a commitment period is restated at its forward auction and again at each reconfiguration auction, so the auction is the scenario and the period is the CCP. That is what lets 2026 FCA17 and 2026 3rd ARA coexist as different statements about one period. Tie benefits, including the Hydro-Quebec credits the research names HQICC, are stored as their own quantity on their own interface and are **never** folded into accredited capability: that folding is the double count the research found most often.

## Two gaps the live artifacts exposed

PD-4B was to be left alone unless a real source demanded otherwise. Two did.

**An interface that leaves the market.** PD-4B admitted `external_tie` as an interface kind and then made it unbuildable: every interface had to name a locality inside the market. ISO-NE publishes transfer capability across ties to New York, the Maritimes and Hydro-Quebec in the same table as its internal ones. `external_counterparty` names the far side as text, because it is outside the balancing authority and a subarea row would claim Urdais models its internal structure.

**Requirements a market states more than one of.** ISO-NE states an installed capacity requirement and a second one net of tie benefits, and three different local obligations for one zone. Under PD-4B's vocabulary the second of each pair collided with the first on the live-row index — correctly, because they claimed to be the same quantity. They are not: a gross requirement and a net one differ by exactly the credits under dispute. Four vocabulary rows were added; nothing was renamed or repointed.

A third change was forced by the registry rather than the schema: a capacity source fell to the trailing branch of the retrieval guard, which demands the right to use a value as an index input. A capacity, demand and reserves report is not an index input. It is read for retention and analysis, which is what the planning class already said, and demanding the other right was demanding the wrong permission.

## Idempotence

Keyed four ways: a retrieval by artifact content, a raw record by a hash of its value, the publisher's own term and its locator, a vintage by the publisher's release key, and a canonical row by the identity its partial unique index enforces. Rerunning all three sources over identical artifacts writes nothing: 0 inserts and 0 revisions against 19,936 raw records, 228 components and 240 constraints.

Values are compared as `value::text`, never `value::float8`. Production runs `extra_float_digits = 0`, which renders float8 to fifteen significant digits; ERCOT's capacity figures need sixteen. PD-3E lost a day to that, and a regression test here fails against the defective form.

Writes are batched at 1,000 rows, chosen from PostgreSQL's 65,535 bound-parameter ceiling against a 25-column raw row. CAISO's 19,368 records are twenty statements, not 19,368.

## Rights

ERCOT is `reusable_with_attribution_or_conditions` and approved for production outright. CAISO and ISO-NE are `ambiguous_requires_legal_review` and collected under `production_approved_under_accepted_risk`, which records that Urdais authorised collection under its own policy and asserts nothing about the terms. No classification was relabelled and every unresolved issue is intact. A vintage is refused outright if no determination governing public display of its values is in force.

## What is deferred, and why

`CAPACITY_DEFERRALS` in `src/lib/power-delivery/capacity/ingest/registry.ts` carries each of these with the artifact URL and what would unblock it. The CLI prints them on every run.

- **CAISO Maximum Import Capability** — published only as a PDF. This pipeline does not reconstruct table structure from text positioning and does not transcribe numbers by hand.
- **CAISO NQC as an area total** — a methodology decision, not an extraction. The evidence such a methodology would read is stored.
- **CAISO Local Capacity Requirement** — set in the Local Capacity Technical Study, a different publication. Filing it under this vintage would attribute it to a report that does not contain it.
- **ISO-NE Existing Qualified Capacity** — not a column of this artifact. It is published in the auction qualification reports, on a different schedule.
- **ISO-NE's column headed `ICAP`** — the workbook defines no term for it. Whether it is a capability or a requirement decides whether it is supply or obligation, and the two would enter a delivery gap with opposite signs. Kept as evidence with its cell reference.

## Explicit exclusions

No PJM, NYISO, MISO or SPP. No delivery gap. No frontend. No `deliverable_capacity_results` row of any kind: creating one would mean fixing methodology details PD-4B deliberately left open, and the table exists so that an Urdais conclusion can never be mistaken for something a publisher said.
