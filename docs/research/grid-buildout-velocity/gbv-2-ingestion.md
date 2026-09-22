# Grid Buildout Velocity — GBV-2 canonical ingestion

**Status: internal implementation note. Not the public Grid Buildout Velocity methodology, not routed publicly, and not registered in the docs catalog.** No analytics, API route, frontend change or cron exists yet, and nothing here was written to production.

GBV-1 settled the semantics. This phase builds the ingestion that holds them, for the two public sources, and reports what the real artifacts did when the rules met them.

---

## 1. What is ingested

| Source | Interface slug | Lists | Rows |
| --- | --- | --- | --- |
| ERCOT TPIT | `ercot-tpit-transmission-projects` | `future`, `planned`, `completed`, `cancelled` | 1,429 / 358 / 262 / 78 = **2,127** |
| CAISO TDF TPP | `caiso-tdf-approved-tpp-projects` | ten transmission-owner sheets | **233** |

Run with `npm run grid-buildout:ingest -- --all`, or `--source ercot`. `--file ercot=<path>` replays a workbook already on disk, which is how the counts below were produced without re-fetching.

There is no cron. Both publishers republish two or three times a year, and a genuinely new vintage is detected by content hash rather than by a schedule.

**Never ingested:** ERCOT's `TransmissionOwnerProjContac` sheet and its `TSP/Company Contact` column, which hold names, emails and phone numbers; the CAISO `Impact Category` legend; and the CAISO generator-interconnection workbook, which is a different artifact at a different URL.

---

## 2. Architecture

One canonical model, two adapters. An adapter declares where its artifact lives and implements `parse`, a pure function from retrieved bytes to a `ParsedSnapshot`. Retrieval, hashing, snapshot identity, durable project identity, batching, idempotence and the rights chain are shared, and no adapter reimplements them.

```
reference.buildout_lifecycle_states / _bases / _milestone_kinds / _date_qualities
          _date_precisions / _quantity_kinds / _driver_classes / _driver_bases
          _relationship_kinds / _deferral_reasons

pipeline.buildout_snapshots            one retrieved artifact
        .raw_buildout_records          one source row, verbatim
        .buildout_projects             durable identity (interface, native_id, occurrence)
        .buildout_project_observations per-vintage attributes and driver
        .buildout_lifecycle_observations canonical state + basis + native text
        .buildout_milestones           typed dates, labelled by vintage
        .buildout_quantities           native quantities with reported/not-reported
        .buildout_relationships        stated links only
        .buildout_deferrals            what was seen and not canonicalised
```

Every table is append-only through `pipeline.forbid_mutation()`. Lineage runs canonical row → raw row → snapshot → retrieval → rights state, and `pipeline.buildout_domain_violations()` fails any canonical row whose raw row belongs to a different snapshot, even though both foreign keys resolve.

The XLSX reader is PD-3C's, reused rather than rewritten.

---

## 3. The rules, and what they did to real data

### Lifecycle comes from list membership

ERCOT's `Transmission Status` column is Optional in its own field dictionary and contradicts sheet membership on **188 rows** across the workbook, 117 of them on the Completed sheet. Membership decides the state; the status string is stored as evidence and a `status_contradicts_list` deferral is recorded each time.

Observed lifecycle after ingest:

| State | ERCOT | CAISO |
| --- | --- | --- |
| `planned` | 1,414 | — |
| `proposed` | 292 | — |
| `under_construction` | 31 | — |
| `in_service` | **262** | — |
| `cancelled` | 78 | 5 |
| `unknown` | 50 | 228 |

CAISO's 228 `unknown` are not a failure. Its `Project Status` is uncontrolled free text — four spellings of "in-flight" — so only `Cancelled` is mapped and every other string is retained unmapped with a deferral. A status vocabulary nobody controls is not a lifecycle.

### A date defect never touches the lifecycle

Nine ERCOT completed rows carry an actual in-service date of year 9999. After ingest all nine are `in_service`, basis `source_list_membership`, with `date_quality = sentinel_unknown` and no date. Completed rows split **253 reported / 9 sentinel**.

The schema enforces this rather than trusting the pipeline: a milestone carries a date exactly when its quality is `reported`, so a sentinel cannot smuggle one in and a reported date cannot be empty.

### Blank is not zero — and it mattered less than expected

GBV-1 required that an empty mileage cell never be read as zero, and the pipeline keeps `is_reported` distinct from a value. Measuring the real workbook refines the GBV-1 figure materially, and this document supersedes it:

| Completed sheet | `circuit_miles_new` | `circuit_miles_rebuilt` |
| --- | --- | --- |
| positive | 33 | 63 |
| **explicit zero** | **228** | **198** |
| genuinely blank | 1 | 1 |

GBV-1 reported 169 of 262 completions as `unknown_unclassified`, treating "no positive mileage" as unclassified. That conflated an explicit zero with silence. TSPs overwhelmingly write a literal `0` rather than leaving the cell empty, so the split is really **168 rows affirmatively reporting no mileage** and **1 row genuinely unreported**.

The rule stands and the pipeline still records which was seen. What changes is the expected shape of M3: its unknown bucket is one row, not two thirds of the series, and "most ERCOT completions are substation, transformer and reactive work" becomes a finding the source supports rather than a gap in it. GBV-3 should classify from `is_reported` rather than from `value > 0`.

### Driver classification needs publisher evidence

The schema refuses any driver class other than `unknown` unless the basis is `publisher_field` or `publisher_identifier`. An ERCOT interconnection-request number (`23INR0419`) is an identifier ERCOT printed and classifies the row; the word "solar" in a title does not. **257 ERCOT rows** carry a generation or storage word with no publisher evidence: each is `unknown` with a `driver_signal_only` deferral, and none reaches a headline metric.

CAISO publishes no driver field at all, so all 233 rows are `unknown` with basis `none`. Its TPP workbook is by definition the planning-process portfolio and the interconnection work sits in the sibling file, but "absent from that file" is not an affirmative statement about this one.

### Identity is the publisher's, and repeats are recorded rather than resolved

Durable identity is `(source interface, native id, occurrence)`. Native suffixes are part of the identifier and are never normalised away.

Two shapes of repeat turned up, and they are not the same problem:

- **ERCOT: 5 identifiers repeat, all within the `future` sheet** — matching GBV-1's 1,429 rows against 1,424 distinct numbers. The publisher has used a number twice.
- **CAISO: 16 identifiers repeat across 19 extra rows, on *different* transmission-owner sheets.** `1718-R-11` appears on PG&E, SCE and VEA/GLW. These plainly describe one co-owned project split across owners.

Neither is merged. Both are held as separate occurrences with a `duplicate_native_id` record naming the lists involved, because merging the CAISO rows would need a rule CAISO has not stated. **This is a live constraint on GBV-3: a metric counting distinct CAISO projects must resolve the 16 before treating them as independent, or it will overstate the portfolio by up to 19 of 233.**

### CAISO's vintage history is the point of the source

Each `Previous In-Service <Month Year> TDF` column becomes its own milestone, labelled with its vintage, beside the frozen `In-service Date at Approval` and the current expectation. Ingest produced **3,036 prior-vintage milestones** over 233 projects — roughly thirteen revisions each — from a single retrieval, with no Urdais snapshot history required.

`Expected Construction Start` is stored as `construction_start_expected`. There is no actual construction-start kind anywhere in the vocabulary, because no market in V1 publishes one.

---

## 4. Ingest results

First ingest, into an empty database:

| | ERCOT | CAISO |
| --- | --- | --- |
| snapshots | 1 | 1 |
| retrievals | 1 | 1 |
| raw records | 2,127 | 233 |
| projects | 2,127 | 233 |
| project observations | 2,127 | 233 |
| lifecycle observations | 2,127 | 233 |
| milestones | 2,808 | 4,191 |
| quantities | 10,635 | 0 |
| relationships | 145 (17 resolved) | 0 |
| deferrals | 595 | 915 |

Milestones by kind — ERCOT: `target_in_service_current` 2,127, `approved` 385, `actual_in_service` 296. CAISO: `target_in_service_prior_vintage` 3,036, `approved` 233, `target_in_service_at_approval` 232, `construction_start_expected` 232, `permit_filing_expected` 231, `target_in_service_current` 227.

The 385 ERCOT `approved` milestones are RPG-review dates, present only for Tier 1–3 — which is why GBV-1 deferred an ERCOT approval-to-service duration rather than publishing one.

Deferrals by reason:

| Reason | ERCOT | CAISO |
| --- | --- | --- |
| `driver_signal_only` | 257 | — |
| `status_contradicts_list` | 188 | — |
| `unresolved_relationship` | 76 | — |
| `unmapped_lifecycle` | 50 | 227 |
| `sentinel_date` | 19 | 296 |
| `duplicate_native_id` | 5 | 16 |
| `unparseable_date` | — | 376 |

CAISO's `unparseable_date` count is text in a date column across fifteen vintage columns; the milestone rows record which column each came from, so the detail is not lost in the summary.

**Immediate identical rerun: 0 snapshots, 0 raw records, 0 projects, 0 observations, 0 milestones, 0 quantities, 0 relationships, 0 deferrals.** Snapshot identity is checked before any work, so a rerun over unchanged bytes is a complete no-op rather than a set of conflict-suppressed writes.

`pipeline.buildout_domain_violations()`: **0**, after both ingests.

---

## 5. ISO-NE source validation

GBV-1 left ISO-NE as the strongest deferred candidate. This is a research subtask only — nothing was ingested, and ISO-NE is not added to V1.

The RSP list page is JavaScript-rendered and exposes no file link to a plain fetch; three guessed spreadsheet URLs returned 404. The June 2026 list-update presentation does fetch (HTTP 200, 513,085 bytes), and its appendix is a complete field dictionary.

| Field | Detail |
| --- | --- |
| **Project ID** | Generated by ISO-NE System Planning. A stable native identifier. |
| **Part Number** | Part 1 Reliability, **Part 2 Generator Interconnection**, Part 3 Market Efficiency, each split `a` (Planned or Under Construction) / `b` (Proposed). |
| **Status** | A controlled enum with published definitions: `In Service`, `Under Construction`, `Planned`, `Proposed`, `Cancelled`. |
| Primary / Other Equipment Owner | Sponsor, and co-ownership. |
| Projected Month/Year of In-Service | Target date, month precision. |
| Major Project / Project Component | An explicit parent-child relationship. |
| **PPA Approval** | Date of I.3.9 approval. `no` means required and not yet received; `NR` means not required. |
| **TCA Approval** | Date of cost-allocation approval, with an `NR` sentinel. |
| Estimated Costs (PTF) | With stated accuracy ranges. |

Three findings matter for a later phase.

**ISO-NE is the only V1-candidate market with a publisher-stated driver field.** Part 2 is generator interconnection, named by the publisher. That is `publisher_field` evidence — stronger than ERCOT's inferred identifiers and far stronger than CAISO's silence — and it would let the interconnection boundary be drawn from the source rather than reconstructed.

**Its status is a controlled vocabulary with published definitions**, unlike CAISO's free text, so it would map cleanly without the unmapped bulk CAISO produces.

**But it publishes no actual in-service date.** The only date column is the projected one; completion is reported as "placed in service since the last update", so completion timing has the granularity of the publication interval — three times a year — not of a date. An ISO-NE completions series would be a count per update window, not per month.

`no` and `NR` are sentinels in date columns, the same family as ERCOT's 9999, and would need the same explicit handling.

Rights are unchanged: `ambiguous_requires_legal_review`, so any ISO-NE ingest is internal unless published under founder-accepted risk.

Still unverified: the spreadsheet itself, its exact column order, how far back the list page retains vintages, and whether any machine-readable endpoint exists.

---

## 6. What GBV-3 inherits

1. **Classify works character from `is_reported`, not from `value > 0`.** The unknown bucket is 1 row, not 169 (§3).
2. **Resolve or disclose the 16 CAISO cross-owner duplicates** before counting distinct projects.
3. ERCOT `approved` milestones cover Tier 1–3 only; any duration built on them must publish its denominator.
4. CAISO's 228 unmapped statuses mean no CAISO completion count is possible; slip is anchored on dates, not status.
5. Deferrals are the coverage-gap ledger. Every published metric should reconcile its exclusions against them.

---

## 7. Boundaries observed

No analytics, no methodology version, no API route, no frontend change, no cron, and no production write. `src/components/power-analytics/grid-buildout-chart.tsx` is untouched. No rights classification was changed. The only network activity was retrieving two public workbooks and one public PDF.
