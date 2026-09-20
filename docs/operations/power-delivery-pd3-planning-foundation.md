# Power Delivery PD-3B: planning-forecast foundation and rights policy

**Status:** internal implementation note. It is not the public Power Delivery methodology, it does not change the Power Analytics page, and it ingests nothing. PD-3B builds the schema, the rights model, and the read surface that a later ingestion phase will fill.

Planning demand is a separate domain from PD-2 operational power. EIA-930 `D` and `DF` are hourly measurements of what a grid did; an ISO long-term load forecast is a dated publication about what a grid is expected to do a decade out, carrying a scenario, a weather basis, a gross/net convention and a large-load screen. PD-3B reuses PD-2's geography (`reference.grid_areas`), the provider and source-interface registry, `pipeline.source_retrievals`, and the append-only and supersede-never-edit conventions. It reuses nothing else: `reference.power_metrics`, `pipeline.raw_power_records`, `pipeline.power_observations` and `aggregateCoincidentActualLoad` are untouched, and there is no `planning_demand_forecast` operational metric.

## The Urdais rights policy

> A source classified `ambiguous_requires_legal_review` may be ingested, normalized, calculated from and publicly displayed under founder-accepted legal risk, provided the source, its rights classification, its attribution requirement and the unresolved issue are retained in provenance and shown with the value.
>
> A source classified `unsuitable_without_permission` may be retained internally where that is appropriate, and must not be published unless a permission is obtained.

Two consequences are enforced rather than trusted:

- **Publishing does not upgrade a classification.** An ambiguous source that Urdais publishes is still recorded as ambiguous, and the publication decision says so. `reference.source_use_permissions.rights_classification` is the reviewer's finding and is never edited to read "cleared" or "approved". A later written permission is a *new effective-dated row* whose classification still says `unsuitable_without_permission`; only its `disposition` changes to `permitted`.
- **There is one implementation.** `mayPublishPlanningForecast` in `src/lib/power-delivery/planning/rights.ts` is the only place the rule lives. Read functions, API routes and components call it; none of them re-derive an answer from a classification string. The database carries no publish/do-not-publish flag, because a second copy of the rule would eventually disagree with the first on a source nobody was watching.

| Classification | Public display |
| --- | --- |
| `clearly_reusable` | allowed |
| `reusable_with_attribution_or_conditions` | allowed, subject to the stored conditions |
| `ambiguous_requires_legal_review` | allowed under founder-accepted risk, classification and open question preserved |
| `unsuitable_without_permission` | blocked, unless a later determination records an explicit permission |

Two further gates block a public read regardless of how permissive the terms are: a `disposition` of `prohibited` or `revoked`, and a vintage whose `publication_state` is `internal_only` or `withdrawn`. A required credit line with no attribution text recorded also blocks, because a condition that cannot be honoured has not been met.

## V1 source policy

Classifications are the PD-3 research findings of 19 September 2026 (`docs/research/power-delivery/phase-3-planning-demand.md`), reproduced unchanged.

| Market | Source interface | Classification | Public display |
| --- | --- | --- | --- |
| ERCOT | `ercot-long-term-load-forecast` | `reusable_with_attribution_or_conditions` | yes, attribution required |
| PJM | `pjm-load-forecast-report` | `ambiguous_requires_legal_review` | yes, under accepted risk |
| CAISO | `cec-california-energy-demand-forecast` | `ambiguous_requires_legal_review` | yes, under accepted risk |
| NYISO | `nyiso-gold-book` | `ambiguous_requires_legal_review` | yes, under accepted risk |
| ISO-NE | `iso-ne-celt-report` | `ambiguous_requires_legal_review` | yes, under accepted risk |
| SPP | `spp-resource-adequacy-report` | `unsuitable_without_permission` | no |
| MISO | `miso-long-term-load-forecast` | `unsuitable_without_permission` | no; also methodology-blocked |

MISO is blocked twice over and the record says so, so that clearing the rights alone does not read as clearing the source: no public first-party vintaged MW series exists at balancing-authority grain.

## Vintages, corrections, and scenarios

A **vintage** is one immutable publisher release. The grain of truth is the vintage, not the target year: the 2025 and 2026 releases both say something about 2031, and neither supersedes the other. Overlapping target years are normal and are the reason vintages exist.

Supersession is reserved for a corrected or reissued artifact of the *same* release, identified by `native_vintage_key`. A trigger refuses any other supersession, so a new annual forecast cannot pose as a correction of its predecessor, and a vintage of one market cannot be superseded by a vintage of another. A correction is written by retiring the predecessor and then inserting the replacement, so exactly one live row per release holds at every moment.

**Scenarios** are vintage-scoped and native. `native_scenario_key` and `native_scenario_label` are what the publisher called it; `canonical_class` (`reference` / `high` / `low` / `other`) is an optional cross-market reading and may be null. There is no forced cross-market base case: ERCOT's Adjusted Forecast, PJM's single staff forecast and the CEC's planning case are not the same object. Weather basis, gross/net status, large-load policy and both structured and textual assumptions are preserved per scenario and repeated on each point.

## Evidence and points

`pipeline.raw_planning_forecast_records` holds one extracted value as it was read, with the locator needed to find it again: workbook sheet/range/cell, PDF page and table, CSV row, or HTML selector. A constraint refuses an extraction that cannot point at its own source. Re-extracting the same artifact is idempotent — `(retrieval_id, record_hash)` is unique — and the table is append-only.

`pipeline.planning_forecast_points` holds canonical values at three grains: `annual`, `seasonal`, and `hourly_profile`. Annual and seasonal points carry no timestamp; an hourly point carries one only because the source published an hourly profile. Hourly support does not make planning data hourly.

`pipeline.retrieval_rights_snapshots` freezes the determination in force for each purpose at the moment an artifact was collected, so a later review cannot silently change what a stored artifact was collected under.

## Read surface

`src/lib/power-delivery/planning/read.ts` has two families. `publishable*` reads pass every vintage through the publication policy and return nothing for a blocked source; a test walks the module's exports so a new public read that forgets the gate fails there rather than in production. `*Internal` reads are server-only and return blocked and internal-only material for operator surfaces and ingestion. `pipeline` tables are never exposed to a client; `src/lib/power-delivery/planning/surface.ts` is the server-only entry point.

## Aggregation

Planning forecasts remain market-specific. There is no seven-market planning total, no sum of official peaks, no coincidence or diversity model, and no quarterly interpolation. The markets' peaks fall in different hours and seasons on different weather bases; adding them produces a number describing no moment that ever existed. `aggregateCoincidentActualLoad` now rejects any member carrying planning-only fields or an interval that is not one operational hour, and the planning read module does not import it.

## Deferred

PD-3B does not ingest ERCOT, PJM, CEC, NYISO, ISO-NE or SPP files; does not implement MISO planning ingestion or FERC Form 714; does not touch the Power Analytics frontend; and does not implement deliverable capacity or delivery gap.
