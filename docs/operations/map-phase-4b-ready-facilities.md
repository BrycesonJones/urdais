# Map Phase 4B: authoritative ready-for-map publication

Phase 4B converts the authoritative `Ready for Map` sheet from
`urdais_map_phase4b_ready_and_manual_v2.xlsx` into the existing
`urdais.map.facility-import/2` dataset. The workbook itself is not edited. Its
implementation manifest is `data/map/phase4b-workbook-manifest.v1.json`.

## Scope controls

The workbook invariants are enforced before projection:

- `Ready for Map`: 107 rows and 107 unique IDs;
- `Manual Lookup`: 312 rows and 312 unique IDs;
- intersection: zero IDs;
- total: 419 unique IDs;
- every ready row has finite latitude and longitude;
- every ready row uses building, campus, or street precision;
- every ready row has the `resolved_map_ready` outcome and source references.

The manifest retains every supplied field for the 107 ready rows. For the
manual sheet it retains only ID and current outcome, solely to prove exclusion.
No manual record is normalized, geocoded, split, resolved, or added by this
phase.

## Projection

`npm run map:phase4b` is a dry run by default. `npm run map:phase4b -- --write`
updates the canonical JSON after all invariants pass. It only addresses records
by stable workbook ID, never by fuzzy name or coordinate matching.

The projection updates 30 existing canonical records and inserts 77 new data
centers. A new row is accepted only when its operator is one of the explicit
workbook data-center operators used in this phase: Digital Realty, Equinix,
Hetzner Online, or QTS. Existing rows retain their category, owner, aliases,
lifecycle, facts, and prior evidence. Workbook evidence is appended by source
URL, and supplied notes, evidence tier, research batch, prior location label,
address, coordinates, and precision remain traceable.

All 107 ready records request the existing `research` publication state. That
state is public only when the database read path independently confirms a
current, non-city position and admissible positioning evidence.

## Count accounting

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Canonical facilities | 110 | 187 | +77 |
| Published / verified | 29 | 29 | 0 |
| Research | 59 | 138 | +79 |
| Internal review | 22 | 20 | -2 |
| Public map-visible facilities | 54 | 136 | +82 |
| Evidence rows in canonical input | 215 | 416 | +201 |
| Evidence claims in canonical input | 614 | 1,146 | +532 |
| Aliases | 135 | 135 | 0 |
| Relationships | 20 | 20 | 0 |

Of the workbook's 107 ready IDs, 30 were already canonical and 25 were already
publicly visible. The projection inserts 77 and gives defensible positions to
the other five existing records, so all 107 become map-visible. The total is
therefore the actual prior public count of 54 plus 82 newly visible records,
not 54 plus 107.

The four canonical categories remain unchanged. The resulting category counts
are 144 data centers, 18 GPU compute clusters, 20 semiconductor fabs, and five
power-infrastructure records.

## Collision review

The deterministic exact checks identify two legitimate shared-location groups:

- Equinix TY6 and TY7 share the published address and coordinates but remain
  distinct IBX facilities.
- Equinix LD4, LD5, and LD6 share the Slough Trading Estate campus position but
  remain three stable facility entities.

The importer also reports nearby facilities for review and never merges them.
QTS numbered campuses remain distinct. QTS Vimercate is stored in Italy with
country code `IT`.

## Deployment boundary

This phase uses the existing transactional, idempotent facility importer and
requires no schema migration. A hosted production write is allowed only after
the stacked facility migrations are deployed in order and the production
project identity, migration ledger, current counts, and exact dry-run write set
have been verified. No production database is modified merely by projecting or
testing this dataset.

The Phase 4B production-readiness check on 2026-09-18 resolved the linked
project as `UrdaisProd` (`cyqtaydtfuwaexjkuynq`). Its migration ledger contains
58 entries and ends at `20260916100000`. Both `reference.facilities` and
`reference.facility_evidence` are absent. The production facility and public
counts are therefore unavailable rather than zero, and the importer must not
run there yet.

Required sequence:

1. merge the stacked map PRs in order: facility foundation, facility dataset,
   Data Center methodology v2, Phase 4A, then Phase 4B;
2. deploy every pending repository migration in ledger order, including
   `20260917260000_map_facility_foundation.sql`,
   `20260917270000_map_facility_methodology.sql`,
   `20260917280000_map_data_center_scope_v2.sql`, and
   `20260918090000_map_public_research.sql`;
3. verify the linked project and migration ledger again;
4. run the importer dry run against production and review the exact write set;
5. run the explicit transactional write, rerun it to prove idempotence, then
   validate the public read model and final counts.
