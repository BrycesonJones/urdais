# Transmission Headroom TH-2: canonical ingestion

**Status: internal implementation note.** Not the public Transmission Headroom methodology — there isn't one yet; that is TH-3. No public API and no frontend surface reads this data.

TH-1 established the semantics and TH-1A closed the two source contracts. TH-2 builds the evidence model those contracts imply and fills it from NYISO and ERCOT.

## What runs

```
npm run transmission-headroom:ingest -- --source nyiso                  # today, NYISO's calendar day
npm run transmission-headroom:ingest -- --source nyiso --month 2005-02  # one monthly archive
npm run transmission-headroom:ingest -- --source nyiso --from 2005-02 --to 2005-12
npm run transmission-headroom:ingest -- --source ercot                  # the whole current listing
npm run transmission-headroom:ingest -- --source ercot --limit 6
npm run transmission-headroom:ingest -- --all --dry-run
```

There is no cron in TH-2. Scheduling belongs to TH-5, but the cadence it will need is set by the sources and is not symmetric — see **ERCOT is forward-only** below.

## Architecture

One framework, two adapters. An adapter owns `discover` and `parse`, both pure given bytes; retrieval, hashing, rights snapshots, entity identity, idempotence, derivation and persistence are shared and neither adapter reimplements them.

| | NYISO | ERCOT |
|---|---|---|
| Entity | `transmission_interfaces` | `transmission_elements` |
| Identity | `Point ID` | `(ConstraintName, ContingencyName)` |
| Artifact | daily CSV, monthly ZIP | hourly CSV-in-ZIP behind `doclookupId` |
| Limits per row | two, directional | one, undirected |
| Contingency | `not_applicable` | `base_case` / `post_contingency` |
| Margin | limit selected by flow sign | `Limit − Value` |
| History | archives to 2002, usable from **2005-02-01** | **rolling 7 days, no archive** |

The two entity tables are deliberately separate. Collapsing them would force a row that loses direction on the NYISO side and contingency on the ERCOT side.

## Four rules enforced by the database, not by convention

**A margin cannot be assembled from mismatched parts.** `transmission_margins` has composite foreign keys over `(observation, entity, instant, source interface, contingency kind)`. A margin referencing another market, entity, instant or contingency fails to insert.

**A sentinel is never a quantity.** `check ((limit_state = 'sentinel') = (abs(limit_mw) = 9999))`. Exact magnitude, because the largest genuine limit in the NYISO archive is **9,899 MW** — 100 MW below the sentinel, on 8,696 observations in the data ingested here. A `>= 9000` threshold would have erased every one.

**An absence is never a zero.** `check ((state = 'ok') = (headroom_mw is not null))`. The other three states carry null and a reason.

**Raw evidence is immutable.** Append-only triggers on every evidence table; normalisation never writes back into a raw row.

## NYISO

### Backfill starts 2005-02-01, not 2002

Monthly archives return HTTP 200 back to January 2002, and ingesting them would be wrong. Before 2005-02-01 every row carries an unsigned `9999` in **both** limit columns, so no limit is published and there is nothing to measure against. The CLI refuses an earlier `--month` rather than silently producing 100% `unmonitored_direction`.

The three eras behave exactly as TH-1A predicted, confirmed against ingested data:

| Archive | real limits | sentinel | zero |
|---|---:|---:|---:|
| 2005-02 (era 2) | 177,650 | **0** | 0 |
| 2007-11 (era 3) | 191,127 | 52,176 | 17,577 |
| 2026-09-21 (era 4) | 6,960 | 1,920 | 240 |

### It is an event series, not a grid

Nothing forward-fills, interpolates or synthesises a timestamp. A single observed day carried 289 stamps including three off-grid (`04:39`, `04:41`, `17:37`) and two skipped slots. Deduplication is on `(entity, instant)`, so a monthly archive overlapping an already-ingested day adds no second observation.

### The filename follows NYISO's calendar, not the machine's

`discover` derives today's file from the **Eastern** date. Deriving it from UTC asks for tomorrow's file every evening after 20:00 Eastern — a 404 that would read as a missing day rather than an error. There is a regression test.

### Identity is the Point ID

Eight of twenty-five Point IDs were renamed across the archive, some twice (`PJM-NYPP` → `PJM-NYISO` → `SCH - PJ - NY`). The upsert refreshes the name and never matches on it. After ingesting 2005-02 and 2026-09, eleven interfaces show `first_seen_at` of 2005-02-01 under names they did not have in 2005 — identity held across the renames.

The inverse trap is sharper: `CENTRAL-EAST` (23313) ends in January 2005 and `CENTRAL EAST - VC` (**23330**) begins in February. Different IDs, correctly two entities.

### Subtype is deliberately unset

The file mixes internal transfer interfaces and external scheduled ties, and the source publishes no structured discriminator — the `SCH - ` prefix is a heuristic over names that demonstrably change. `subtype` carries a check constraint requiring null, so a later guess cannot slip in without a methodology decision. This blocks any "interfaces at their limit" count, because on a scheduled HVDC tie flow equal to limit is routine full scheduling rather than congestion.

## ERCOT

### Forward-only, and the window is the risk

The listing is a rolling seven-day window; ERCOT's own product page says *Display Duration: 7 days* and no archive endpoint exists. **Unretrieved history is permanently lost.** `coverage_start` in the read model is the first interval actually retained, never the first ERCOT produced.

The currentness monitor therefore goes stale at **36 hours against a 168-hour retention window**, deliberately firing with roughly five days of retrievable history still left. `retentionAtRisk` flags when age passes half the window.

### ConstraintID is not identity

Across nine artifacts, 28 IDs mapped to several constraint names and 71 names mapped to several IDs. Identity is `(ConstraintName, ContingencyName)` joined on ASCII Unit Separator — **not** NUL, which PostgreSQL rejects in a text column outright. `ConstraintID` is retained as observation metadata.

### CCTStatus never gates anything

`COMP` / `NONCOMP` is the Constraint Competitiveness Test — market-power mitigation, orthogonal to headroom, present in all four combinations of contingency kind and binding state. Stored as native metadata with a regression test asserting every row parses regardless of its value.

### The implausible-limit bound is a judgement, and says so

ERCOT has no documented sentinel. It leaves a constraint monitored with its limit effectively disabled — `85,999.1` and `84,999.1` observed on `EASTEX` with a zero shadow price, which at face value reports 83,449 MW of margin. The bound lives in `IMPLAUSIBLE_LIMIT_MW` (50,000) rather than in a parser branch, the row is **retained** as evidence with `limit_state = 'implausible'`, and no margin is derived from it. This is weaker than NYISO's exact rule and should be revisited in TH-3 when the methodology can state it properly.

### Binding comes from the source

`ShadowPrice` is stored and never derived from the margin. TH-1A found a real counter-example: `2270__B` under `SBLURDH8` with `Limit = Value = 33.3`, margin exactly zero, shadow price zero. Margin sign and binding state are two facts, allowed to disagree at the boundary.

## Full NYISO backfill runbook

TH-2 ingested a representative sample locally, not the whole archive. The full backfill is ~260 monthly archives and roughly 43 million observations; at the measured rate it is hours of wall clock and tens of gigabytes, which is a deliberate operational decision rather than something to slip into a build.

1. Confirm the target. `echo $DATABASE_URL` — TH-2 ran entirely against `localhost:54329/urdais_local`.
2. Apply `20261004100000` and `20261004110000`.
3. Walk months forward from `2005-02`, one archive at a time:
   `npm run transmission-headroom:ingest -- --source nyiso --from 2005-02 --to 2005-12`, then year by year. Each archive is its own transaction, so an interruption loses at most one month and re-running it is a no-op.
4. Expect roughly 90,000–170,000 observations per archive, growing with the interface roster.
5. After each year, check `select count(*) from pipeline.transmission_domain_violations()` — expected 0.
6. Re-run one already-ingested month and confirm `artifactsAlreadyHeld` equals the archive count and every total is 0.

Do not parallelise across months into one database without measuring first; the batching is tuned for a single writer.

## Scale and batching

Batched multi-row inserts throughout, chunked to stay inside PostgreSQL's 65,535 bound-parameter ceiling (`floor(60000 / paramsPerRow)`, capped at 1,000 rows). No row-by-row SQL anywhere.

Measured on a full NYISO monthly archive (2005-02): 89,661 rows parsed → 88,825 flow observations, 177,650 limit observations, in a single transaction.

## Idempotence

Snapshot identity is `(source interface, content hash, publisher key)`, checked **before** any work. A re-fetch of identical bytes commits nothing and costs five statements.

Proven across both sources: row counts identical before and after a full re-run, `artifactsAlreadyHeld` equal to the artifact count, every insert total zero.

Where content has genuinely changed — NYISO's daily file grows through the day — the new bytes are a new snapshot, and the observation-level unique keys mean the overlapping instants add no duplicate flow, limit or margin.

## What TH-2 does not do

No public API, no frontend, no chart, no cross-market metric, no published methodology, no production write. The calculation version `0.1.0` is internal and exists so a derived margin records which deterministic rule produced it.
