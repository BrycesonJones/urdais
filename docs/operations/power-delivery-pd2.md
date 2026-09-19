# Power Delivery PD-2: EIA-930 operational foundation

**Status:** internal implementation note. This is not the public Power Delivery methodology and does not replace the demo chart.

PD-2 creates a production data boundary for hourly operational demand. The physical grid universe is independent of UEPI, wholesale-price instruments, `market-detail.ts`, and frontend catalog order. Its explicit identity is `seven_organized_us_wholesale_markets`; it is not U.S. or national load.

| Area | EIA balancing-authority code | Reference timezone |
| --- | --- | --- |
| ERCOT | `ERCO` | `America/Chicago` |
| PJM | `PJM` | `America/New_York` |
| MISO | `MISO` | `America/Chicago` |
| SPP | `SWPP` | `America/Chicago` |
| CAISO | `CISO` | `America/Los_Angeles` |
| NYISO | `NYIS` | `America/New_York` |
| ISO-NE | `ISNE` | `America/New_York` |

Membership is attached to a dated universe version. A future footprint change creates another version; it does not edit V1 or restate historical aggregates.

## Canonical definitions

- `actual_load` is EIA Form 930 type `D`: the balancing authority's hourly observed demand.
- `operational_demand_forecast` is EIA Form 930 type `DF`: the balancing authority's hourly day-ahead demand forecast. It is not a long-term planning forecast.
- Native grain is one UTC hour. EIA's API labels the integrated hourly value `megawatthours`; dividing by the exactly one-hour interval produces the canonical average-MW value with the same numeric magnitude. Both native value/unit and normalized MW are retained.
- An unavailable DF is absent or retained as unavailable evidence; it is never invented.

## Coincident aggregation

For each UTC hour, select one current `actual_load` observation for every member of the universe version effective for that interval. Verify all expected members, then sum the seven MW values. If any member is absent, the aggregate is `null` and coverage reports the missing area IDs. Daily, monthly, seasonal, and annual peaks may be calculated only from that coincident aggregate series—never by summing independently calculated market peaks.

## Revisions and provenance

EIA is registered in the existing provider/source-interface/permission registry. Every API page is recorded in `pipeline.source_retrievals`; every native row is retained in append-only `pipeline.raw_power_records`. Identical re-reads retain raw evidence without duplicating current canonical state. A changed value inserts a new `pipeline.power_observations` row and supersedes the prior row, preserving what EIA previously reported and when the change was observed.

The collector requires server-only `EIA_API_KEY`. Its retrieval and idempotency design supports hourly operation, but the current Vercel Hobby deployment invokes it once daily at 08:15 UTC (`15 8 * * *`). This cadence is a deployment-frequency constraint, not a data-model or canonical-grain constraint. Every invocation still rereads the previous 48 completed hours so revisions are observed and requests the current plus next 23 UTC hours so available day-ahead `DF` rows reach the operational-forecast read path. Future `D` rows remain absent/unavailable; they are never fabricated. `npm run power-delivery:ingest -- --start YYYY-MM-DDTHH --end YYYY-MM-DDTHH --backfill` provides the historical path. Reruns are content-idempotent, API pages are paginated, transient errors are retried, and each completed run is summarized in `pipeline.power_ingestion_runs`.

## Explicit exclusions

PD-2 does not define or store `planning_demand_forecast`, `deliverable_capacity`, or `delivery_gap`. It does not ingest EIA-860, ISO/RTO-native feeds, interconnection queues, transmission headroom, grid buildout, flexible capacity, or Power Economics. It does not interpolate quarterly values or connect production observations to the existing 2024–2031 demo chart.
