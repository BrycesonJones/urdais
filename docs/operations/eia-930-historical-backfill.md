# EIA-930 historical backfill — operations

**Status: internal operational runbook. Not a methodology, not routed publicly, and not registered in the docs catalog.** The methodology that consumes this history is `docs/methodology/flexible-capacity.md`, version 1.0.0, and nothing here may change it.

---

## What this is for

The scheduled Power Delivery job collects a rolling three days of EIA-930: `scheduledPowerWindow()` asks for `now - 48h` through `now + 23h`, which is right for a delivery-gap surface that wants the current hour and the last revision. Flexible Capacity asks a question about whole years, and a year is not reachable by waiting.

This is the tool that fills the gap, and it is deliberately not a second pipeline.

## Architecture

| | |
| --- | --- |
| Entry point | `npm run power-delivery:eia-backfill` |
| Runner | `src/lib/flexible-capacity/backfill.ts` |
| Per-chunk work | `runPowerIngestion` — the same function the cron calls |
| Retrieval | `fetchEia930` — unchanged |
| Persistence | `persistEiaPage` — unchanged |
| Ledger | `pipeline.power_ingestion_runs`, one row per chunk, `trigger_kind = 'backfill'` |

The runner contains no retrieval, no parsing and no SQL. It plans chunks, calls the reviewed path once per chunk, and totals what came back. A test asserts that the module never names `fetchEia930`, `source_retrievals` or `power_observations` in code.

**No new table holds hourly demand.** Flexible Capacity reads `pipeline.power_observations`, which is where Power Delivery already puts it.

### Why chunks

`fetchEia930` pages until it has the whole window and returns every page — response bodies included — in memory at once. A calendar year is about 123,000 rows across 25 pages. Requesting it in one call would hold all of that simultaneously and lose the whole year to one failure at hour 8,000.

Chunk size is arithmetic. The EIA page length is 5,000 rows, and one request covers seven balancing authorities × two metrics = **14 rows per UTC hour**, so a chunk of N days is 336N rows and fits one page while N ≤ 14. The default is **7 days = 2,352 rows**, which leaves a wide margin and makes a year 53 chunks.

### Why both metrics

`buildEia930Parameters` facets `D` and `DF` in a single query. Requesting actual demand alone would mean a second request shape, a second idempotency-key space over the same hours, and a divergence between what the backfill and the cron collect. Carrying the day-ahead forecast is much the cheaper of the two, and Power Delivery wants it anyway.

---

## Running it

```bash
# what would this cost? writes nothing.
npm run power-delivery:eia-backfill -- --local-year 2025 --market ercot --estimate

# a market-local calendar year
npm run power-delivery:eia-backfill -- --local-year 2025 --market ercot

# an explicit UTC-hour range
npm run power-delivery:eia-backfill -- --start 2023-01-01T00 --end 2025-12-31T23

# verify what landed
npm run power-delivery:eia-backfill-verify -- --local-year 2025
```

`--market` only chooses whose local year `--local-year` resolves against. **Every request covers all seven balancing authorities**, because that is the one request shape the client builds. There is no per-market retrieval.

Run `--estimate` first. Always.

### Production

The script refuses a non-local database without `--confirm-production`, and prints the target host before it starts. A historical backfill against production is an authorised operator action, not a routine one.

---

## Cost

Per market-local year, all seven markets, both metrics:

| | |
| --- | --- |
| UTC hours | 8,760 (8,784 in a leap year) |
| Chunks / API requests | 53 |
| Raw rows | ~122,600 |
| Canonical observations | ~61,300 per metric |
| Measured wall time | **16m 15s** for one year, local database |
| Measured throughput | ~125 canonical rows/second |

### Three years, measured

FC-3 ran the full three-year range and the FC-2 projection turned out to be wrong in both size and attribution. The measured figures:

| | Projected in FC-2 | **Measured in FC-3** |
| --- | --- | --- |
| Range | — | `2023-01-01T05` → `2026-01-01T07`, 26,307 hours |
| Chunks / requests | 157 | **157, all succeeded** |
| Raw rows | ~368,000 | **367,934** |
| Observations inserted | — | **367,834** (100 rows carried no value) |
| Wall time | ~50 min | **41 min 18 s**, local database — see *Where you run it* |
| Storage | ~110 MB, dominated by response bodies | **442 MB, dominated by raw records** |

The storage breakdown is the correction worth keeping:

| Table | Three years |
| --- | ---: |
| `pipeline.raw_power_records` | 262 MB |
| `pipeline.power_observations` | 176 MB |
| `pipeline.source_retrievals` | **4.4 MB** |

Response bodies were expected to dominate and do not: EIA's JSON compresses roughly a hundredfold under TOAST. What actually costs is the per-row canonical evidence — 368,000 raw records and the observations derived from them, with their indexes. Budget **~150 MB per year**, not the ~37 MB FC-2 projected.

---

## Where you run it

**Every wall-clock figure above was measured against a local database, and that turns out to be the load-bearing detail.** The ingestion is semantically correct wherever it runs and is *locality-sensitive*: it is bound by network round trips, not by CPU, disk or the publisher.

`persistEiaPage` issues roughly four sequential statements per source row — insert the raw record, take an advisory lock, select the current observation, insert or supersede it — inside one transaction per chunk. A 7-day chunk holds 2,352 rows, so a chunk is about **10,000 sequential round trips**. That is a deliberate design: the lock and the select are what make supersession correct under concurrency, and each is cheap when the database is a millisecond away.

Measured during the FC-4B activation attempt on 2026-09-23:

| | Local socket | Production pooler, from a laptop |
| --- | --- | --- |
| Sequential round trip | ~0.05 ms | **58.2 ms** |
| Per chunk (2,352 rows) | ~16 s | **~9 min** |
| 157 chunks (three years) | **41 min** | **~24 hours** |

The prediction from the measured round trip matched the observed rate exactly, which is what identifies latency as the whole cause: not the source, not the database, not the data.

> **Run a historical backfill from inside the database's region.** At an in-region round trip of about a millisecond the same code should finish three years in an hour or two, with no change to any data semantics.

Check before you start, rather than discovering it at chunk three:

```bash
npm run power-delivery:eia-backfill -- --local-year 2025 --market ercot --estimate
```

then time a hundred sequential round trips against the target. Anything above a few milliseconds means the run belongs somewhere else.

**Do not solve this by letting it run overnight.** The problem is not only elapsed time; it is supervising day-long transactions through a connection pooler with nobody watching. Stop and move the execution instead.

**Stopping is safe, and resuming is cheap.** An interrupted chunk rolls back whole — the FC-4B attempt left zero duplicate active rows and no stuck transactions — and a chunk already held matches its retrieval idempotency key and returns after one or two round trips without touching a single row. A partial backfill is a valid partial history, and re-running the same range picks up where it stopped.

**A batched write path is possible and is not required.** Multi-row inserts, or `COPY` into a staging table followed by one set-based merge, would make latency nearly irrelevant. It is worth engineering if Urdais starts doing large historical reloads regularly. It is not worth doing to unblock one backfill: `persistEiaPage` is shared with the scheduled Power Delivery cron, so changing it trades a straightforward operational workaround for risk in a path that runs every day.

---

## Idempotence

Rerunning a range is safe, cheap and the first thing to try.

A retrieval's identity is `eia-930|start|end|offset|length|responseHash`. Re-requesting the same window with unchanged bytes matches an existing key, and `persistEiaPage` returns `already_recorded` without touching an observation. Measured on a chunk already present:

```
retrievals 0   rawRecords 0   inserted 0   revised 0   unchanged 0
```

Nothing at all. Where EIA *has* revised a value, the old observation is superseded and the new one inserted, which is the ordinary supersession path and not special to backfilling.

Resumption is therefore just "run the same range again". Chunks already held cost one request each and write nothing.

A failing chunk does not abandon the range: the remaining chunks cover different hours and the successful ones are worth keeping. Every failure is reported with the exact window that caused it. `--stop-on-error` overrides this when a failure looks systemic.

---

## Verification

`npm run power-delivery:eia-backfill-verify` reads and reports; it writes nothing and publishes nothing.

Per market-local year it reports expected hours, canonical hours, missing hours, coverage percent against the methodology floor, the longest contiguous gap, and the observed peak with its **local** timestamp.

Measured for local year 2025, all seven markets:

| Market | Hours | Coverage | Longest gap | Observed peak | Local time |
| --- | --- | --- | --- | --- | --- |
| ERCOT | 8760 / 8760 | 100.0000% | 0 | 83,597 MW | 2025-08-18 18:00 |
| MISO | 8760 / 8760 | 100.0000% | 0 | 118,661 MW | 2025-07-24 16:00 |
| SPP | 8760 / 8760 | 100.0000% | 0 | 54,745 MW | 2025-08-21 17:00 |
| PJM | 8759 / 8760 | 99.9886% | 1 | 160,560 MW | 2025-06-23 18:00 |
| NYISO | 8759 / 8760 | 99.9886% | 1 | 31,857 MW | 2025-06-24 19:00 |
| ISO-NE | 8759 / 8760 | 99.9886% | 1 | 25,898 MW | 2025-06-24 19:00 |
| CAISO | 8758 / 8760 | 99.9772% | 2 | 43,860 MW | 2025-08-21 20:00 |

All seven pass the 99.5% floor with room to spare. Every peak falls on a summer afternoon or evening in market-local time, and CAISO's is the latest of the seven — which is what its net-peak shape should produce, and is a useful sign that the timezone handling is doing something real rather than something plausible-looking.

**No figure in that table is a published Urdais value.** It is coverage verification.

---

## What must never be "fixed" by hand

- **A missing hour on the peak day.** Methodology 1.0.0 refuses the whole market-year if the local calendar day holding the observed maximum has any hour absent, and the verify script reports that day's expected and present hours. It is a refusal, not a warning: a peak set from a day with holes in it produces a headroom figure higher than the evidence supports.
- **A missing hour anywhere else.** Methodology 1.0.0 excludes it and never interpolates. The scenario is decided by the top of the load distribution and the peak reference is a single observed hour, so an invented value near the top would change the answer while being indistinguishable from evidence. Absence is reported, not repaired.
- **A superseded observation.** EIA revises. The old row stays, superseded; it is not deleted and not overwritten.
- **A chunk boundary.** Chunks tile the range exactly, and the tiling is tested. Shifting one by hand to "catch" a missing hour creates an overlapping retrieval key for no benefit — the hour is missing because EIA did not serve it.
- **A slow run, by raising the chunk size.** Chunking is not what makes a remote run slow; the per-row round trips are, and a bigger chunk has proportionally more of them while also breaking the one-page arithmetic. Move where it runs instead.
- **The 14-day chunk ceiling.** It is `EIA_PAGE_LENGTH / (24 × 14)`. Raising it silently introduces a second page per chunk and the memory problem chunking exists to avoid.

---

## Rights

`reference.source_interfaces` row `eia-930-region-data` is `production_approved`, `terms_review_state = permitted`, `data_use_terms_state = permitted`, access class `api_key`. Historical retrieval uses the same interface, the same permission grant and the same API key as the scheduled job.

**No new rights work is required, and no new dataset may be added under cover of this tool.** It retrieves EIA-930 `D` and `DF` and nothing else.

---

## Configuration

| Variable | Purpose | New? |
| --- | --- | --- |
| `EIA_API_KEY` | The EIA API v2 key | No — shared with the scheduled job |
| `DATABASE_URL` | Target database | No |

**No new environment variable or secret is introduced.**
