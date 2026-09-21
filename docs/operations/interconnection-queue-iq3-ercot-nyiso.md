# Interconnection Queue IQ-3: the ERCOT archive and NYISO's two queues

**Status:** internal implementation note, not registered in the docs catalog. No public API, no frontend surface, no derived analytics, no production write.

IQ-2 built the canonical model on three markets that carry their own lifecycle history. IQ-3 adds the two that do something different: ERCOT, whose history exists only as an archive of published files, and NYISO, which publishes a load interconnection queue and classifies it by end use.

## The architectural decision: no presence table

IQ-2 deduplicates unchanged observations, so a request seen in ninety-nine consecutive monthly reports does not get ninety-nine identical rows. That raises the obvious question — how do you then answer *was request X in snapshot Y* — and the brief asked for the smallest possible presence table if the existing linkage could not answer it.

**It can, and none was added.** Every retrieval writes one raw record per source row, and that record already carries both the snapshot and the native queue id. Presence is not a fact that needs recording; it is a fact the evidence already is. A second structure asserting the same thing would be a second thing to keep true, and the two would eventually disagree.

The only change needed was an index, `(native_queue_id, snapshot_id)`, because the question at 107,847 ERCOT raw records is always "which snapshots held this id". `requestPresence()` and `requestPresenceRange()` read it directly. A database test asserts no table whose name contains "presence" exists.

## ERCOT

### The archive

99 workbooks on the Market Information System, report type 15933, across 93 report periods from December 2018 to August 2026. Six are corrections ERCOT republished for a period it had already reported; July 2020 has two.

| | |
| --- | --- |
| Artifacts discovered | 99 |
| Report periods | 93 |
| Corrections | 6 |
| Parsed | **99** |
| Deferred | 0 |
| Raw records | 107,847 |
| Stable requests | 3,325 |
| Observations | 23,404 |
| Confirmations | 84,443 |
| Historical range | 2018-12 to 2026-08 |

23,404 observations against 107,847 raw rows is the deduplication working: a request whose entry is unchanged month to month has its evidence recorded and its canonical state left alone.

### Order is by report period, not by publication date

ERCOT uploaded its entire December 2018 to April 2020 backlog on a single day in June 2020. Sorting the archive by publication date therefore puts 2018 after 2020 and produces observation ordinals in the wrong order — which was visible in the first backfill as a project whose MW appeared to move 349.13 → 350 → 349.13. Sorted by the period each file reports on, the same project reads 350 → 349.13 → 209, which is what ERCOT actually published. The secondary sort is publication date, so a correction still lands after the artifact it corrects.

### Corrections

A correction gets its own snapshot with its own key (`gis-2023-06-correction`), sharing the report period of the artifact it corrects. Both artifacts are retained in full — 1,316 raw records for the June 2023 original, 1,317 for the correction — and both remain queryable by period. Ingested after the original, the correction's content becomes the canonical state for anything it changed. The June 2023 correction added exactly one project; stable identity was unaffected.

### The stacked header

ERCOT writes a column name down several rows: "Approval Date for" / "Submission of Proof of" / "Site Control" is one column. A reader pinned to a single row finds "Changes from Last Report" where it expected a milestone date. `resolveHeader` reconstructs each column's full label by concatenating every non-empty cell in that column between the row carrying `INR` and the first row carrying a real INR, then matches semantically.

That flexibility was needed immediately. The sheet has been named three ways across the archive: one sheet called "Project Details" until 2021, a separate "Project Details - Small Gen" from January 2022 while the main sheet kept its old name, and "Project Details - Large Gen" later. Matching the current name exactly lost 41 of the 99 artifacts on the first attempt.

The small-generator sheet publishes no study phase at all — ERCOT tracks those by a model-ready date — so its requests are held at `unknown` and one deferral per artifact records why, rather than assigning a stage the source never stated.

### Negative MW

The sheet says capacity for repowering "are reported on a net change basis with respect to the original capacity amount, and thus may have zero or negative values". The observed minimum is −53.3 MW on 24INR0372, a solar project present in 51 snapshots. It is stored as −53.3: not absolute, not zeroed, and not read as a withdrawal. A regression test covers all three.

### Batteries

866 of the current large-generator rows carry fuel `OTH` with technology `BA`. Classification uses the pair and the technology code decides, so 19INR0176 reads as `battery_storage` with both native fields retained. Fuel alone would file every battery in ERCOT as "other".

### What ERCOT cannot say

**The GIS report publishes no actual commercial operation date.** It publishes an approval for energization and an approval for synchronization, which are milestones, and a projected COD, which is a plan. None is evidence that a plant is operating.

So no ERCOT observation is ever `operational`, and none is ever `withdrawn` — the report states neither. Verified: **0 ERCOT observations carry either stage.** Completion and time-to-operation metrics are not available for ERCOT from this source, and IQ-5 must not construct them from a projected date.

### Disappearance is only absence

A request that stops appearing keeps the last stage the publisher gave it. 08INR0019b was last seen in February 2020 and remains `study`, not withdrawn, not terminal. `requestPresenceRange()` reports first seen, last seen and how many snapshots held it, and says nothing about what the absence means — that is a question for a methodology.

## NYISO

| Sheet | Rows | Class |
| --- | --- | --- |
| Interconnection Queue | 95 | generation, storage, transmission |
| Cluster Projects | 110 | generation, storage |
| Load Projects | **74** | **load** |
| Withdrawn | 1,451 | withdrawn |
| Cluster Projects-Withdrawn | 281 | withdrawn |
| In Service | 149 | operational |

2,164 raw records, 2,160 stable requests (four identity collisions), 2,160 observations, 3,827 quantities.

The current workbook is XLSX, so **no legacy `.xls` tooling was added**. The URL carries a date and changes monthly, so the adapter discovers it from the interconnections page rather than pinning last month's file.

### Load is structurally separate from generation

Load requests carry `request_class = 'load'`, their MW is stored under a different quantity kind with `direction = 'withdrawal'`, and queue numbers are prefixed (`L205`, `Q0276`) because the two queues reuse the same numbers. A load MW cannot reach a generation total by accident, and a database query confirms **zero** load quantities are stored under any generation quantity kind.

### End use, including AI

NYISO assigns each load an end-use code. Normalized only from those codes, never from a project name:

| Normalized | Native | Count |
| --- | --- | --- |
| `data_center` | DAT, DAT-CM | 28 |
| **`data_center_ai`** | **DAT-AI** | **12** |
| `research` | RD | 5 |
| `manufacturing` | M-CH, M-CG, M-IN | 5 |
| `other` | O | 1 |
| `unknown` | (blank) | 23 |

L1670 is a 250 MW load at Dunkirk 230 kV, submitted January 2024, coded DAT-AI, currently at SRIS/SIS Approved. A database constraint prevents an end use being attached to a generation request.

### The status legend does not fit in one cell

NYISO prints its legend in note cells rather than publishing it as a table, and the first cell stops at `10=Accepted Cost Allocation/IA in Progress,` — codes 11 through 15 continue in a second cell, and the cluster sheet has a parallel legend with C-suffixed codes. Reading only the cell containing "Project Status # Key" left every code above 10 unmapped and 91 spurious deferrals. Every legend-shaped cell is now read and the codes accumulate.

That legend also carries a trap worth naming: NYISO defines both **13 = In Service for Test** and **14 = In Service Commercial**, plus **15 = Partial In-Service**. Only 14 is commercial operation. A rule matching "in service" loosely would declare a plant under test to be operating, so the mapping checks commercial first and sends the other two to `under_construction`.

Sheet membership still outranks the code: a row on the Withdrawn sheet is withdrawn whatever its status says. Where a sheet asserts the stage and the row carries no code, the sheet itself is recorded as the evidence, because an operational observation must always be able to say what made it operational.

NYISO publishes no actual in-service date and no withdrawal date, so neither is invented.

## Idempotence

**A snapshot that already exists is a complete no-op.** This was not true when the archive first replayed: reprocessing December 2018 compared its content against each request's *current* state, saw a difference, and wrote 23,165 observations dated backwards. Persistence is transactional per artifact, so a snapshot row exists only if everything derived from it committed — reprocessing can only produce what is already there.

| | ERCOT | NYISO |
| --- | --- | --- |
| Artifacts reprocessed | 99 | 1 |
| Snapshots created | 0 | 0 |
| Raw records | 0 | 0 |
| Requests | 0 | 0 |
| Observations | 0 | 0 |
| Quantities / resources | 0 / 0 | 0 / 0 |
| Deferrals | 0 | 0 |

A *new* snapshot with unchanged content still confirms, which is the case that matters for a daily source like CAISO and is unchanged from IQ-2.

## Currentness

Both are monthly and neither inherits a continuous feed's threshold: 1,128 hours, a full month plus publication lag. ERCOT publishes the GIS report a few days after the month it covers; NYISO dates each workbook in its filename. A database test asserts no monthly source carries a sub-monthly threshold.

## Rights

**ERCOT is `reusable_with_attribution_or_conditions`** — the only queue source of five with an affirmative grant, resting on ERCOT Terms of Use section 5. The conditions recorded include the report's own "FOR PLANNING PURPOSES ONLY" statement and that a queued capacity is never presented as available supply.

**NYISO is `ambiguous_requires_legal_review`.** NYISO asserts copyright and publishes no reuse grant; it publishes under founder-accepted risk with the open question retained in provenance. Neither classification was changed from what IQ-1 recorded, and no source was relabelled.

## Cost

| | ERCOT | NYISO |
| --- | --- | --- |
| Retrieval | 85.9 s (99 artifacts) | 1.1 s |
| Parse | 7.1 s | 0.14 s |
| Persist | 14.1 s | 0.60 s |
| SQL statements | 2,668 | 37 |
| Statements per artifact | ~27 | 37 |

107,847 raw records cost 2,668 statements, about 27 per artifact regardless of how many rows it holds. Archive retrieval is sequential with three bounded retries and a growing pause; an artifact that still will not come back is deferred by name rather than failing the backfill.

## Deferrals

1,569 across both markets, none duplicated on rerun.

| Source | Kind | Count |
| --- | --- | --- |
| ERCOT | unmapped technology | 1,099 |
| ERCOT | unmapped status (small-gen sheets with no study phase) | 58 |
| NYISO | unparseable value (`N/A` in a MW cell) | 235 |
| NYISO | unmapped technology | 175 |
| NYISO | unsupported row | 2 |

ERCOT's 1,099 unmapped technologies are almost entirely fuel `OTH` with no technology code on older artifacts, where the publisher named neither. NYISO's 235 unparseable values are `N/A` written into an MW cell on the In Service sheet — a real absence, recorded rather than read as zero.

## Frontend assumptions this adds to the IQ-2 list

Reported only; nothing changed.

1. **Negative MW breaks a bar chart that assumes a floor of zero.** ERCOT publishes reductions, and the Power Analytics mock treats queued GW as strictly positive.
2. **There is now real history**, 93 ERCOT report periods of it. The mock's `QUEUE_YEARS` is five synthetic annual points derived by scaling the latest value backwards; the actual shape is monthly, uneven, and has corrections in it.
3. **Load and generation cannot share an axis.** Only NYISO publishes a load queue, so a load/generation toggle is available for one market of five and empty for the rest.
4. **An AI data-centre classification exists and is first-party.** 12 NYISO requests, 250 MW each in one case. The mock has no concept of it, and it must not be synthesised for markets that do not publish it.
5. **ERCOT can never show a completion rate or a time to operation** from this source, so any market-comparison view has a structural hole rather than a missing-data hole.

## Recommended IQ-4

ISO-NE and SPP, which completes canonical coverage. ISO-NE needs the HTML table extractor IQ-1 identified and brings the `CNR` capacity-rights rows that must not be summed. SPP needs a CSV reader tolerant of its pre-header row and is **collected but never displayed** — its terms permit copying "EXCEPT when such materials will be used in commercial publication", which reaches everything Urdais would publish. After that, IQ-5 can define the cohort methodology against a complete evidence base.
