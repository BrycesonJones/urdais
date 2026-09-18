# Map Phase 2 — handoff

State of the branch, so another agent can continue without re-deriving anything.
Written 2026-09-17.

## Where things are

| | |
| --- | --- |
| Starting `main` | `7bb750c` (`feat(uavi): a volatility index that averages volatilities, and will not publish (#118)`) |
| Branch | `feat/map-facility-foundation` |
| Scope | Production facility foundation plus a dry-run importer and a small sample. Not a map redesign, not the full 78-record dataset. |
| Architecture doc | `docs/architecture/map-facility-foundation.md` — read this first. |

## What is done

- **Schema.** `supabase/migrations/20260917260000_map_facility_foundation.sql`:
  `reference.facilities`, `facility_aliases`, `facility_evidence`,
  `facility_evidence_claims`, `facility_facts`, `facility_relationships`, plus
  the two shared predicates and the deferred publication triggers. Nothing is
  seeded; the importer is the only way in.
- **Taxonomy.** `compute_cluster` → `gpu_compute_cluster` everywhere, public
  label "GPU Compute Cluster". The old value is refused by the database, by the
  contract, by the map's runtime check and by the tests.
- **Unmapped removed from the public map.** No mapping-status field, no legend
  row, no visibility group. Whether a record shows is `publication_state`.
- **Contract.** `src/lib/facilities/contract.ts`, version
  `urdais.map.facility-import/1`, checked exactly.
- **Importer.** `scripts/map/import-facilities.ts` (`npm run map:import`), dry
  run by default, `--write` to persist, one transaction, idempotent.
- **Sample.** `data/map/facilities-sample.v1.json` — 18 facilities, 8
  relationships, 40 evidence records, 131 claims, 23 facts, 34 aliases. 14 ask
  to publish; 4 persist as research records.
- **Read path.** `src/lib/facilities/read/` → `/api/map/facilities` and the
  `/map` page, which is now a server component passing points down.
- **Map integration.** The MapLibre engine, clustering, zoom, basemap,
  navigation and layout are untouched. `UrdaisMap` takes `points` instead of
  importing demo data; `src/data/mock/map-points.ts` is deleted.
- **Popup.** Category, address, owner, operator, status, verified date, and the
  cited sources as links. The contact-email row is gone (the read path publishes
  no contact address).

## What is not done, deliberately

- The other 60 research facilities. Phase 2 proves the architecture on a sample;
  see the transformation procedure in the architecture doc.
- No production database has this migration. Nothing was applied to UrdaisProd
  or UrdaisDev — everything below ran against a local throwaway cluster.
- No methodology version is registered for the facility dataset. The map
  publishes sourced facts rather than a calculated figure, so whether it needs a
  methodology lineage row is a Phase 3 decision.
- `reference.facility_evidence` links to `source_interfaces` and
  `source_retrievals` are nullable and unused by the sample. No terms review was
  run on the research sources: these are citations with links, not feeds Urdais
  ingests. If citing them should go through the terms machinery, that is a
  Phase 3 question and it is open.
- Owner and operator are free text; they are not resolved to
  `reference.market_entities`.
- No coordinate in the sample is at `city` precision, because only one record in
  the whole research package is and it has no coordinates at all. That path is
  covered by unit fixtures, not by real data.

## Commands

```bash
# a local database on a free port (54329 may be another session's)
URDAIS_PG_PORT=54331 URDAIS_DB_NAME=urdais_map scripts/db/local.sh start
URDAIS_PG_PORT=54331 URDAIS_DB_NAME=urdais_map scripts/db/local.sh reset
URDAIS_PG_PORT=54331 URDAIS_DB_NAME=urdais_map scripts/db/local.sh migrate
URDAIS_PG_PORT=54331 URDAIS_DB_NAME=urdais_map scripts/db/local.sh test

npm run map:import                       # dry run, prints the plan
DATABASE_URL=postgresql://postgres@localhost:54331/urdais_map npm run map:import -- --write

npm test && npm run typecheck && npm run lint && npm run build
npm run migrations:check
```

## What was run, and the results

| Check | Result |
| --- | --- |
| `scripts/db/local.sh ci` (roles → reset → migrate → test, twice) | pass, 40 SQL test files including the new `390_map_facility_foundation.sql` |
| `npm run migrations:check` | ok, 84 migrations |
| `npm test` | 141 files, 2132 tests, all pass |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | succeeds; `/map` dynamic, `/api/map/facilities` present |
| `npm run map:import -- --write` against the local database | 18 inserted, 8 relationships, 40 evidence, 131 claims, 23 facts, 34 aliases |
| the same command again | 0 inserted, 0 updated, 18 unchanged; identical digest |
| `next start` + `GET /api/map/facilities` | 14 facilities served, coverage 6/5/2/1 across four countries |
| `next start` + `GET /map` | 200; legend reads "GPU Compute Cluster", no "Unmapped" row, facility ids present in the server-rendered HTML |

No browser screenshot was taken — the MapLibre engine is unchanged and the
render path is covered by the component tests plus the served HTML above.

## Decisions that must not be revisited without a reason

1. **"Unmapped" is not a public category.** It is a publication state. A record
   that cannot be placed is absent from the map, never a black dot somewhere.
2. **`gpu_compute_cluster` is canonical.** `compute_cluster` is retired.
3. **Shared coordinates never merge two entities.** No deduplication on position
   or on name similarity, anywhere, at any confidence.
4. **A dry run is the importer's default.** `--write` is always explicit.
5. **Power infrastructure publishes only through an evidenced compute link.**
6. **Evidence is per claim.** A source supports the claims listed against it and
   no others; a fact cannot exist without one.
7. **Unknown is null.** No placeholder, no zero, no city centroid standing in
   for a position.
8. **Fugaku is not a GPU compute cluster** — the research flags it as CPU-based
   A64FX. It stays in research until the taxonomy question is settled.
9. **Grok is not a source.** The company pages, filings, permits and government
   records are.

## The next exact task

Extend the dataset, not the architecture. In order:

1. Pick the next tranche from `URDAIS_MAP_RESEARCH_PHASE_1.md` §4 — the records
   in §8.6 are explicitly *not* map-ingestable, so they enter as `research`.
2. Add them to `data/map/facilities-sample.v1.json` (or a second file; the
   importer takes `--file`), following the transformation procedure in
   `docs/architecture/map-facility-foundation.md`.
3. `npm run map:import` and read every error and review candidate.
4. Only then `--write` against a local database, and re-run `npm test`.

Applying the migration to a deployed environment is a separate, explicit step
and has not been done. `docs/operations/production-environments.md` has the
UrdaisDev/UrdaisProd rules; confirm which target before any apply.
