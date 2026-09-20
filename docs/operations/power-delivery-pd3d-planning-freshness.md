# Power Delivery PD-3D: planning production path and the freshness gate

**Status:** internal implementation note. No frontend surface reads this yet.

PD-3C could ingest four planning sources. PD-3D answers the question that makes those numbers safe to serve: *is what Urdais holds still what the publisher says?*

## Currentness is a comparison, not a clock

Operational power has an age threshold — an EIA-930 hour two days old is stale, full stop. A planning forecast has no such property. ERCOT's April 2025 Adjusted LTLF was ERCOT's current official forecast throughout 2026, and any rule of the form `published_at < X days ago ⇒ stale` would have been wrong every day it fired.

So currentness asks two questions, both answerable from evidence:

> What is the latest vintage the publisher has released, as of the last time Urdais successfully looked — and is that the vintage Urdais serves?

Eight statuses, resolved by one pure function (`freshness/status.ts`), in this precedence:

| Status | Meaning |
| --- | --- |
| `blocked` | The source is not watchable: rights, format, or methodology. Whatever its dates say. |
| `unknown` | No monitor, or no check has ever succeeded. |
| `source_check_failed` | The most recent check could not read the source. |
| `source_check_overdue` | No successful check inside the monitor's interval; what the publisher has done since is unknown. |
| `new_vintage_available` | A newer release exists and has not been ingested. |
| `ingestion_pending` | The newer release is ingested, awaiting validation. |
| `validation_failed` | The newer release is ingested and failed validation. |
| `current` | Serving the latest release, validated, checked recently enough to say so. |

`isCurrent` is true for exactly one of them. Every other path fails closed: a source Urdais cannot currently read is not one it can make claims about, which is why a failed or expired check outranks a favourable comparison drawn from older knowledge.

Validation reuses the vintage's existing `quality_status`: `accepted` is validated, `provisional` is awaiting validation, `suspect` is failed.

## Two gates, kept separate

Rights decide whether a value may be shown at all. Currentness decides whether it may be called the current official forecast. They fail for different reasons and a reader needs to know which.

`planningMarketStatuses()` returns both, and `publishableAsCurrent` is the only field asserting both at once. `publishableCurrentPlanningMarkets()` returns only markets that pass both, so a caller cannot accidentally render a superseded vintage. The PD-3C `publishable*` reads remain a rights decision alone and are documented as *not* a currentness claim.

## Source discovery

Each checker is anchored on the artifact the ingestion adapter actually reads, so a release Urdais cannot ingest never becomes the vintage it is measured against. Parsing is pure; fetching is the caller's job, so no unit test touches the network.

| Market | Method | Anchor |
| --- | --- | --- |
| ERCOT | HTML listing | A dated path carrying **both** `Summer-and-Winter-Peaks.xlsx` and a finalised `YYYY_LTLF_Report`. |
| PJM | HTML listing | Highest year with a `YYYY-load-report-data.xlsx`. |
| CAISO (CEC) | HTML listing | An anchor titled exactly `CED <year> Peak Forecast`. |
| ISO-NE | Asset probe | Newest `{year}_celt.xlsx` present at ISO-NE's own canonical asset path. |

The ERCOT rule is the one that earns its keep. The live Load Forecast page carries an October 2025 winter adjustment workbook and Batch Zero material under *later* dated paths than the April 2025 forecast; a checker taking "the newest file" would have invented a release and marked ERCOT stale against it. Requiring the finalised report alongside the peaks workbook is what excludes preliminary material. The CEC rule does the same work against `CED <year> Peak Forecast - POU Planning Areas`, a different dataset that is not a CAISO replacement. PJM ignores a year published only as a PDF, because a year Urdais cannot ingest would put PJM permanently behind.

A checker that no longer recognises its source raises rather than returning nothing — "the page was redesigned" and "nothing has changed" must not look alike.

## Evidence

Every check is persisted to `pipeline.planning_source_checks`, append-only, successes and failures alike: checked URL, timestamp, HTTP status, discovered vintage key and publication date, artifact URL and hash where one exists, checker version, the evidence payload, and the error when it failed. Currentness is derived from these rows, never from a scrape held in memory.

A check records its own HTTP evidence rather than creating a `source_retrievals` row. A retrieval is the record of collecting a published value; a check reads a listing page to find out whether a value exists to collect. `retrieval_id` is kept nullable for a future check that downloads a full artifact.

`reference.planning_source_monitors` says where to look, how often (`check_interval`), the expected cadence, and — for the three unwatchable sources — the kind and reason. All seven planning interfaces have a monitor, because a market with no data should say why rather than look like an oversight.

## Production execution path

`.github/workflows/planning-production-ingest.yml`, manual dispatch only, mirroring the map import convention: `write=false` default, repository migration integrity first, dry run always, then write, then an idempotence re-run, then verification, with reports uploaded as artifacts. No cron — these are annual publications, and a nightly job would re-ask the question three hundred times a year to hear "no".

`npm run power-delivery:planning-production -- --expect-project <ref>` is the command behind it. Its gate asks three things in order, and no step prints a connection string or any part of one:

1. **Which database is this?** The Supabase project reference is read out of the connection (`postgres.<ref>` or `db.<ref>.supabase.co`) and compared with the one the operator named. UrdaisDev and UrdaisProd differ by twenty characters.
2. **Is its schema current?** Any repository migration the ledger has not applied stops the run. Ingesting into a database missing a *later* migration succeeds and writes rows that do not mean what the repository thinks they mean.
3. **Was writing intended?** Dry run is the default.

## Deferred

NYISO and SPP remain un-ingested (PDF-only, no deterministic extraction); MISO remains out of scope. No cron. No deliverable capacity, delivery gap, planning aggregation, or frontend work — PD-4, PD-5 and PD-6 respectively.
