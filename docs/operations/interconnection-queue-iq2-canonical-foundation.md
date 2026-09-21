# Interconnection Queue IQ-2: the canonical foundation

**Status:** internal implementation note, not registered in the docs catalog. No public API, no frontend surface, no derived analytics, and no production write. IQ-1's research is [phase-1-source-architecture.md](/docs/research/interconnection-queue/phase-1-source-architecture.md).

IQ-1 established that a genuine historical queue product is possible. IQ-2 builds the evidence layer for it and ingests the three markets that carry their own lifecycle history: PJM, MISO and CAISO.

## What is held

| | PJM | MISO | CAISO |
| --- | --- | --- | --- |
| Artifact | `PlanningQueues.xml` | `/api/giqueue/getprojects` | `publicqueuereport.xlsx` |
| Format | XML, 22.7 MB | JSON | XLSX, 3 sheets |
| Raw records | 9,200 | 3,852 | 2,278 |
| Canonical requests | 9,200 | 3,850 | 2,278 |
| Observations | 9,200 | 3,850 | 2,278 |
| Quantities | 26,569 | 23,100 | 5,071 |
| Resources | 9,786 | 4,193 | 2,793 |
| Deferrals | 115 | 108 | 27 |
| Snapshot key | content hash | content hash | `report-run-2026-09-21` |
| Cadence | continuous | continuous | daily |

15,328 requests, 15,330 raw records, 54,740 quantities, 16,772 resources.

## The two decisions that shape everything

**There is no `capacity_mw` column, and there never will be.** Every native MW field becomes its own row in `interconnection_request_quantities` under the publisher's own field name. PJM publishes four MW fields for the same projects that aggregate to 1,628 GW, 883 GW, 638 GW and 91 GW; choosing one and calling it "the" queue MW is the most likely way for this product to publish a wrong number. The schema makes it impossible to do by accident because there is nowhere to put it. A database test asserts no such column exists.

**Identity is (market, native queue id) and nothing else.** Names, counties, substations, developers and technologies all move between snapshots, and CAISO's withdrawn projects are literally named `Project Name - Confidential`. Two native ids are never merged because the projects look alike.

## The domain wall

`pipeline.interconnection_domain_violations()` returns every foreign key joining the queue tables to the Power Delivery capacity chain or the GPU compute capacity tables. It must always return zero rows, and both the migration and `540_interconnection_queue.sql` assert that it does. A schema change that wires the two together cannot pass review quietly.

Queue MW is a request to connect. It is not accredited capacity, deliverable capacity, installed capacity, or transmission headroom.

## Deduplication: evidence accumulates, observations do not

Every retrieval writes raw evidence — it is the record of what the publisher served. Canonical observations are written only when the publisher says something new.

The comparison is `observationHash`, a content hash over every material normalized field including every quantity and every resource. It deliberately excludes the locator and the raw payload, so a publisher who reorders rows has not "changed" anything. An unchanged request advances `last_snapshot_id` and `last_raw_record_id` rather than duplicating the row.

Without this, CAISO's daily workbook alone would add 2,285 identical observations a day and PJM's would add 9,200.

A request that oscillates — suspended, resumed, suspended again — gets three observations, not two: `observation_ordinal` is the identity, never the hash.

## Lifecycle, and the rule that protects it

Nine stages, of which exactly two are terminal: `operational` and `withdrawn`. `unknown` is deliberately **not** terminal, so a vocabulary gap can never silently shrink the active queue.

**`operational` is only ever reachable through `operationalStage()`, and that function requires the publisher to say so.** A proposed commercial operation date in the past is evidence that a project is late, which is the common case in every queue. It is never evidence that a project is running.

This rule caught a real error during IQ-2. MISO publishes a `doneDate`, and treating it as a commercial operation date is the obvious reading. It is wrong: of 269 requests carrying one, **201 have a `postGIAStatus` that is not in service** — 104 under construction, 62 not started, and 32 withdrawn. `doneDate` dates the completion of the *interconnection request process*, not the start of operation. Reading it as a COD declared 250 MISO projects operating; MISO says 92 are. The field is retained in `native_status` under its own name and never becomes a date.

### Per-market mapping

**PJM** maps twelve native statuses. A withdrawal date outranks a stale status. `In Service` or an `ActualInServiceDate` is the only route to operational.

**MISO's status is a tuple**, and all three fields are preserved. Precedence, derived from the combinations MISO actually publishes: a withdrawal wins outright; then `postGIAStatus`, the only field that says where the plant actually got to; then `studyPhase`. 74 requests remain `unknown` — `Done` applications with no post-GIA status, no `doneDate` and no evidence of any outcome. That is MISO closing a request without publishing what happened, and it is recorded as a deferral rather than guessed.

**CAISO's sheet membership is its lifecycle statement** and outranks every other signal: the withdrawn sheet is withdrawn, the completed sheet is operational. Only the completed sheet publishes an `Actual On-line Date`; the other two publish a `Current On-line Date`, which is a forecast and is stored as a revision, never as an actual.

## Hybrids: three conventions, one of them dangerous

**CAISO publishes components and they are not additive.** `Type-1/2/3`, `Fuel-1/2/3`, `MW-1/2/3` are descriptive composition; `Net MWs to Grid` is the project figure and is read from its own column. **937 of CAISO's current observations have components that sum above the project figure** — queue 2023 is Solar + Battery summing 4,132.6 MW against a published net of 2,000 MW. Component quantities carry `quantity_kind = 'component_mw'` and a `resource_ordinal`; a database constraint keeps the two in lockstep, the read model offers no total, and a test asserts the parts exceed the whole.

**PJM and MISO publish a compound label and no split.** The parts become resources so the technology mix is right, `is_source_separated` is false, and no MW is attributed to any of them. A split MISO never published cannot be recovered by inventing one.

**A compound fuel label is not a hybrid.** `hybrid` is a structural fact about the source's encoding, and `technologyFor()` never returns it.

## Identity collisions

MISO serves **J2656 twice** in one response: same queue date, two study cycles, 180 MW against 0 MW. Picking one would assert something MISO did not, and failing the source would discard 3,851 unambiguous requests over one bad id.

So neither row becomes canonical. Both are written as raw evidence, a deferral names the collision, and the CLI reports it. 3,852 raw records, 3,850 requests.

## Provenance and currentness

Every observation points at the raw record it came from and the snapshot that raw record belongs to. Verified against the live data: zero observations without a raw record, zero quantities without an observation, zero raw records without a snapshot.

Cadence is per source and never shared. CAISO stamps a report run date and regenerates daily (stale after 72 hours, allowing for a weekend); PJM and MISO refresh continuously and stamp nothing, so only content change is observable (stale after 168 hours). One threshold across the three would call CAISO stale over a weekend while calling a PJM feed that had not moved in a month current.

## Cost

| | PJM | MISO | CAISO |
| --- | --- | --- | --- |
| Retrieval | 24.8 s | 1.4 s | 0.5 s |
| Parse | 0.54 s | 0.09 s | 0.20 s |
| Persist | 2.4 s | 1.1 s | 0.5 s |
| SQL statements, first run | 94 | 63 | 38 |
| SQL statements, no-op rerun | 49 | 31 | 28 |

9,200 PJM records cost 94 statements, not 9,200 round trips. Statements scale with batch count at 1,000 rows per batch, sized to PostgreSQL's 65,535 bound-parameter ceiling.

## Verified behaviour

**Exact rerun** — 0 raw records, 0 requests, 0 observations, 0 quantities, 0 resources, 0 deferrals inserted across all three. Everything confirmed instead.

**One-row correction** — PJM's `MWCapacity` restated on a single project: a new snapshot, 9,200 raw records (new evidence), **0** new requests, **exactly 1** new observation, 9,199 confirmed. The corrected request holds two observations, ordinal 1 at 135 MW no longer latest and ordinal 2 at 999 MW latest. No other request was touched.

**New snapshot, unchanged content** — resolves to the existing snapshot, writes nothing, confirms everything.

## Source-reported history is not observed history

Today's PJM feed says a project withdrew in 2019. That is **source-reported lifecycle**: PJM's own statement, retained in the feed. It is not the same as Urdais holding a 2019 snapshot.

`interconnection_queue_snapshots` records what Urdais observed and when. Lifecycle dates on an observation record what the publisher says happened. The two must not be conflated when IQ-5 builds cohort metrics: a cohort analysis over source-reported dates is legitimate for these three markets precisely because they retain their own history, and it would not be legitimate for a market that only publishes current state.

## Rights

All three sources are `ambiguous_requires_legal_review`, classified from each queue artifact's own terms rather than inherited from Power Delivery. Under the founder-accepted-risk policy retention and calculation are permitted, public display is permitted with attribution, and the unresolved question stays visible in provenance. None is relabelled as cleared. Four queue-specific purposes were added rather than reusing an unrelated purpose that happened to grant similar behaviour.

Retrievals run under `research` purpose. No source has an affirmative reuse grant and none claims one.

## Deferrals

248 across the three markets, each one a thing the publisher said that this pipeline did not map:

| Source | Kind | Count |
| --- | --- | --- |
| PJM | unmapped technology | 115 |
| MISO | unmapped status | 72 |
| MISO | unmapped technology | 34 |
| MISO | identity collision | 2 |
| CAISO | unmapped technology | 27 |

A deferral in the data is auditable. A value silently discarded is an absence someone later mistakes for an oversight.

## Frontend assumptions this contradicts

Reported only; nothing was changed. `src/components/power-analytics/interconnection-queue.tsx` with `INTERCONNECTION_OBSERVATIONS` in `src/data/mock/power-analytics.ts`:

1. **One `queuedGw` per market.** There are seven incompatible MW definitions across the seven markets and four within PJM alone. Any single number needs a declared quantity kind beside it.
2. **All seven markets shown as comparable.** SPP cannot be displayed at all on rights, and IQ-2 holds three markets.
3. **A load-versus-generation toggle for every market.** Only NYISO publishes a load queue in these artifacts; none of PJM, MISO or CAISO does.
4. **A `medianWaitMonths` for every market**, implying a wait that ends. Most requests never reach operation: 4,921 of PJM's 9,200 are withdrawn.
5. **Current state only.** The canonical model is observation history, and the surface has nowhere to express that a project's status changed.
6. **Proposed COD shown as expected operation.** A proposed date is not an operational signal, and 201 MISO rows prove how far the two can diverge.

## Recommended IQ-3

ERCOT's 99 monthly GIS vintages plus NYISO. ERCOT is the one market whose history must be accumulated from published snapshots rather than read out of the current file, which exercises the snapshot model properly for the first time; NYISO brings the load queue and its end-use classification, which is what `interconnection_request_classes` was left extensible for. Both need the existing XLSX reader and no new one.
