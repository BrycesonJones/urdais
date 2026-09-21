# Interconnection Queue IQ-1: source reconnaissance and architecture

**Status:** internal research artifact, not registered in the docs catalog. No production write, no schema, no ingestion, no frontend. Every number below was read out of a retrieved artifact on 21 September 2026, not out of a publisher's documentation.

## The decision this phase was called to make

> Can we build a true historical queue product, or do some markets only expose current state?

**We can, for six of seven markets, and by two different mechanisms that must not be confused.**

Five markets carry their own lifecycle history *inside the current file*: a withdrawn project stays in the file with the date it withdrew, and a completed project stays with the date it reached operation. For those markets the first retrieval already supports cohort analysis — how much entered the queue in 2021, how much of it withdrew, how much reached operation — without waiting a year to accumulate snapshots.

One market, ERCOT, does the opposite: its monthly file describes only the present, but every monthly file since December 2018 is still downloadable. History is reconstructible there, from 99 published vintages.

One market, SPP, supports neither, and is separately barred from commercial publication.

| Market | History mechanism | Evidence |
| --- | --- | --- |
| PJM | In-file lifecycle | 9,200 projects: 4,768 withdrawn with `WithdrawalDate`, 1,850 with `WithdrawnRemarks`, 1,246 with `ActualInServiceDate` |
| MISO | In-file lifecycle | 3,852 projects: 2,148 withdrawn with `withdrawnDate`, 552 `Done`, 269 with `doneDate` |
| CAISO | In-file lifecycle | Separate sheets: 267 active, 253 completed with `Actual On-line Date`, 1,765 withdrawn with `Withdrawn Date` and `Reason for Withdrawal` |
| ISO-NE | In-file lifecycle | 1,751 rows: 1,329 withdrawn, 362 commercial, 60 active, with `W/D Date` and `Op Date` |
| NYISO | In-file lifecycle | Separate `Withdrawn` (2,516 rows) and `In Service` (150 rows) sheets |
| ERCOT | Published vintages | 99 monthly `GIS_Report` workbooks on the MIS, December 2018 to August 2026, all still retrievable |
| SPP | **Neither** | Active listing only; `Date Withdrawn` column exists and is empty in all 1,019 rows |

**The architectural consequence is that we do both anyway.** We retain every retrieved snapshot *and* parse native lifecycle dates. Snapshots are not redundant where lifecycle is native, because four of these publishers revise history in place. ERCOT publishes explicit corrections as separate files — `GIS_Report_June_2023_Corrected`, `GIS_Report_April_2022_Corrected`, `GIS_Report_July_2020_CORRECTION2` — which is proof that a previously published figure can be wrong and be replaced. Without our own snapshot we could not say what the queue was understood to be at the time a number was published, only what the publisher now says it was.

## Source matrix

The machine-readable version is [phase-1-source-matrix.json](phase-1-source-matrix.json); it is the authority and this table is its summary.

| Market | Artifact | Format | Records | Cadence observed | Vintages retained |
| --- | --- | --- | --- | --- | --- |
| ERCOT | GIS Report (MIS report type 15933) | XLSX, 14 sheets | 1,778 large + 23 small gen | Monthly | **99 files, back to Dec 2018** |
| PJM | `PlanningQueues.xml` | XML, 41 elements | 9,200 | Continuous; `LastUpdated` per project | Current file only |
| PJM (cycle) | `transitionProjects.xml` | XML | 310 (TC1 only) | Continuous | Current file only |
| MISO | `/api/giqueue/getprojects` | JSON, 26 keys | 3,852 | Continuous | Current response only |
| CAISO | `publicqueuereport.xlsx` | XLSX, 3 sheets | 2,285 across sheets | **Daily** (`Report Run Date: 09/21/2026`) | Overwritten at a stable URL |
| NYISO | `NYISO-Interconnection-Queue-<MMDDYYYY>.xlsx` | XLSX, 9 sheets | 110 + 121 + 91 + 2,516 + 150 | Monthly (dated filename) | Filename is dated; prior months not indexed |
| ISO-NE | IRTT public queue | Structured HTML table | 1,751 | Daily ("changes from day to day") | Current view only |
| Cross-check | LBNL *Queued Up* | XLSX + codebook | 7 ISOs + 50 non-ISO BAs | Annual (through end 2025) | Editions retained |

The FERC route was investigated and **rejected as a primary source**. FERC does not publish a consolidated machine-readable national queue; what exists is per-utility Order 2023 postings of varying format. The useful cross-market artifact is LBNL's *Queued Up*, which is CC BY 4.0, carries a codebook, and covers ~98% of installed U.S. capacity — but it is annual and a year stale by construction. It is a **normalization aid and cross-check only**: it tells us whether our ERCOT totals are plausible, it never becomes the ERCOT number.

## Why queue MW is not capacity, stated in the sources' own numbers

This is the invariant the product most needs, and the artifacts prove it rather than merely implying it.

**No market publishes one MW.** Every market publishes several, and they disagree by multiples:

| Market | Native MW fields | Spread |
| --- | --- | --- |
| SPP | `Capacity`, `MAX Summer MW`, `MAX Winter MW`, `Requested Maximum Injection Capability (MW)`, `Requested Network Resource Deliverability (MW)`, `Nameplate Capacity` | 191,188 vs 57,709 vs 49,125 MW — **3.9×** |
| PJM | `MaximumFacilityOutput`, `MWEnergy`, `MWCapacity`, `MWInService` | 1,628,423 vs 883,250 vs 637,778 vs 91,261 MW — **17.8×** |
| MISO | `summerNetMW`, `winterNetMW`, `dp1ErisMw`, `dp1NrisMw`, `dp2ErisMw`, `dp2NrisMw` | six fields, ERIS and NRIS populated on 43% and 38% of rows |
| CAISO | `MW-1`, `MW-2`, `MW-3`, `Net MWs to Grid` | components double-count; see below |
| NYISO | `SP (MW)`, `WP (MW)`, `Energy Storage Capability` | summer and winter differ |
| ISO-NE | `Net MW`, `Summer MW`, `Winter MW` | differ on 344 of 1,751 rows |
| ERCOT | one `Capacity (MW)`, **net-change basis** | minimum −53.3 MW |

A "total queue MW" is therefore a choice, not a reading. PJM's queue is 1,628 GW or 638 GW depending only on which published column is summed.

Three specific traps make the invariant non-negotiable:

**ERCOT MW can be negative.** The sheet note states capacity for repowering projects "are reported on a net change basis with respect to the original capacity amount, and thus may have zero or negative values." The observed minimum is −53.3 MW. A queue MW is a *change in a request*, not a quantity of supply.

**ISO-NE's queue counts capacity rights against plants that already exist.** 726 of 1,751 rows carry service type `CNR`. Park City Offshore Wind CNR reports `Net MW` 0 and `Summer MW` 838.2 — it is a request for capacity rights, not for 838 MW of new generation. Naugatuck Avenue Battery Storage CNR Only explicitly says "(see QP1089)" in its name. Summing `Summer MW` over ISO-NE's queue adds 838 MW of nothing.

**SPP's "active" list is 33% already operating.** 336 of 1,019 rows have status `IA FULLY EXECUTED/COMMERCIAL OPERATION`. SPP's active request listing is not a backlog.

Accordingly: **no queue quantity may flow into `deliverable_capacity_results`, the Power Delivery gap, or Transmission Headroom.** Not by default, not behind a flag. A future methodology may relate a project that reached *actual* commercial operation to a buildout metric; that is a different table and a different approval.

## Hybrids: three incompatible publishing conventions

| Market | Convention | Consequence |
| --- | --- | --- |
| CAISO | `Type-1/2/3`, `Fuel-1/2/3`, `MW-1/2/3` plus `Net MWs to Grid` | Components are published **and must not be summed** |
| PJM, ISO-NE, SPP | Compound label in one field, one MW | Components are **not recoverable** |
| MISO | `fuelType: Hybrid` / `facilityType: Solar/Battery`, one MW | Components are **not recoverable** |
| NYISO | `Energy Storage Capability` MW alongside `SP (MW)` | Storage portion given separately |
| ERCOT | Not marked in the queue at all; a separate monthly *Co-located Battery Identification Report* | Requires joining two artifacts |

CAISO's own rows demonstrate the double-count: queue position 22 is Wind 38 MW + Battery 38 MW with `Net MWs to Grid` of **38**, not 76. Position 54 is Natural Gas 119.9 + Battery 119.9 with net **119.9**. 156 of 267 active CAISO rows carry two or more components, so naive summation inflates most of that queue. `Net MWs to Grid` is the only non-double-counted CAISO figure.

ISO-NE states the limit outright: "the public Queue does not reveal how megawatts are divided between battery and generator for co-located projects."

**A compound fuel label is not proof of a hybrid.** ISO-NE's 288 compound values include `SUN BAT` (139, a real hybrid) and `DFO NG` (105, a single dual-fuel generator burning distillate or gas) and `DFO KER NG` (4, three fuels, one machine). Reading "more than one fuel" as "more than one resource" would invent 105 batteries. Dual-fuel and hybrid must be separate flags derived from separate evidence.

## Status: seven vocabularies, no shared axis

Native status is preserved verbatim in every case. The normalized lifecycle below is a *proposal*, and several markets do not fit it cleanly.

| Market | Native status shape | Observed values |
| --- | --- | --- |
| PJM | Single field, 12 values | Withdrawn 4,768 · Active 2,362 · In Service 1,180 · Confirmed 224 · Engineering and Procurement 210 · Suspended 140 · Retracted 131 · Under Construction 64 · Deactivated 59 · Partially in Service 37 · Annulled 24 · Canceled 1 |
| MISO | **Three** fields: `applicationStatus`, `studyPhase`, `postGIAStatus` | Withdrawn 2,148 · Active 1,049 · Done 552 · Pending Revision Approval 87 · Pending Transfer 11 — crossed with GIA/Phase 1/2/3 and Under Construction/In Service |
| ERCOT | Composite sentence in one cell | `SS Completed, FIS Started, No IA` 1,048 · `SS Completed, FIS Completed, IA` 303 · four more combinations |
| SPP | Compound, conflates agreement with operation | `IA FULLY EXECUTED/COMMERCIAL OPERATION` 336 · `IA FULLY EXECUTED/ON SCHEDULE` 304 · `DISIS STAGE` 149 · `IA FULLY EXECUTED/ON SUSPENSION` 25 |
| NYISO | **Numeric code** 1–12 with a legend in a note cell | 11 (IA executed) 50 · 10 (cost allocation accepted) 21 · 12 (in service) 16 |
| ISO-NE | Single letter | W 1,329 · C 362 · A 60 |
| CAISO | Sheet membership plus `Application Status` | ACTIVE / COMPLETED / (withdrawn sheet) |

Two structural problems fall out. ERCOT's status is a sentence that must be decomposed into three independent booleans (system study, full interconnection study, agreement) rather than mapped as a string. MISO's status is a *tuple*: a project can be `applicationStatus: Active`, `studyPhase: GIA`, `postGIAStatus: Under Construction` simultaneously, and flattening that to one normalized stage discards which of the three moved.

Proposed normalized stages, unchanged from the brief except where evidence forced it:

`requested` · `study` · `agreement_pending` · `agreement_executed` · `under_construction` · `operational` · `suspended` · `withdrawn` · `unknown`

Dropped from the candidate list: `validation` and `facilities_study` (no market exposes them as a distinct terminal state — facilities study is a study *phase*, carried in a separate phase field), and `cancelled` folded into `withdrawn` with the native value retained, because only PJM distinguishes Canceled (n=1) from Withdrawn and the distinction is not defined anywhere public. Added: `under_construction`, which PJM (64 + 37), MISO (128) and SPP publish and which is emphatically not `operational`.

**`operational` is only ever set from an explicit operational signal** — PJM `ActualInServiceDate` or status `In Service`, MISO `postGIAStatus: In Service` or `doneDate`, CAISO membership of the Completed sheet with an `Actual On-line Date`, ISO-NE status `C`, NYISO membership of the In Service sheet. Never from a proposed or revised COD. ERCOT publishes no actual-COD field at all: it has `Approved for Energization` and `Approved for Synchronization` milestone dates and a monthly *Commissioning Update* sheet (21 rows). ERCOT projects therefore reach `agreement_executed` and an energization milestone, and `operational` for ERCOT is **not derivable from the GIS report alone** — an honest gap, not something to paper over with the projected COD.

## Identity

Queue IDs are stable *within* a market's current file and unstable across time and process reform.

Observed identity hazards:

- **ERCOT splits one request into several.** The sheet note: "A developer may split a project into two or more additional projects with different INR numbers during the interconnection request process… the new projects do not inherit certain milestone dates entered for the original project." Suffixed INRs (`15INR0064b`, `17INR0027b`) are in the file.
- **ISO-NE cross-references supersession in free text.** 28 rows name another queue position (`Kingdom Community Wind Increase (see Q311)`), and `CNR Only` rows are second requests against a project already in the queue.
- **PJM changed identifier regimes.** Serial identifiers (`A01`) and cycle identifiers (`AE1-070`) live in two different files with different schemas, and the cycle file is only Transition Cycle 1.
- **MISO exposes two keys**, a surrogate `id` (3356658) and the queue number `J4182`, and has `Pending Transfer` as a status — a request changing hands.
- **CAISO withdrawn project names are literally `Project Name - Confidential`**, so name is unusable as an identity signal there.

Proposed model, in three layers:

1. `interconnection_request` — stable identity, keyed on **(market, native queue ID)** and nothing else. Never keyed on name, county, or MW.
2. `interconnection_request_observation` — what a given snapshot said: status, stage, every native MW field, proposed COD, study dates. Append-only, superseded not edited.
3. `interconnection_request_relationship` — typed, evidence-bearing links: `split_from`, `supersedes`, `capacity_rights_for`, `reapplication_of`. A relationship exists **only** where the source states it (ERCOT's suffix convention, ISO-NE's "see Qxxx" text, MISO's transfer status). Name or location similarity never creates one.

This directly answers the brief's requirement: same request changing status is a new observation; same project reapplying is two requests plus a relationship *if the source says so*; a source correction is a new observation of the same request; a snapshot change is a new observation.

## Geography

| Market | Native geography | Map-ready? |
| --- | --- | --- |
| MISO | county, state, `poiName` (96%) | Named POI only — **no** |
| ERCOT | county, CDR reporting zone, POI location with station name and kV | Named POI — **no** |
| CAISO | county, state, utility, PTO study region, station or transmission line | Named station — **no** |
| NYISO | county, state, NYISO zone, points of interconnection | Named POI — **no** |
| ISO-NE | county, state, zone, POI text | Named POI — **no** |
| PJM | county, state, transmission owner | County only — **no** |
| SPP | nearest town or county, state, TO at POI, substation or line | Named substation — **no** |

**No market publishes coordinates for queue projects.** Every one publishes a named substation or point of interconnection and a county. Since IQ-1 forbids geocoding, and county centroids would be a fabricated precision, the honest answer is that **zero markets are map-ready today**. The unblock is not geocoding: it is resolving the named POI against `reference.facilities`, which already holds substation-grade entities, and carrying the match as evidence with its own confidence — a later phase, not IQ-2.

Existing grid geography (`reference.grid_operators`, `grid_areas`, `grid_subareas`) is reusable for market and zone attribution. It must not absorb counties, substations or POIs: BA membership is a settled seven-market model and a substation is not a member of a balancing authority in that sense. Counties and POIs belong to the queue domain.

## Rights

Classified from each queue artifact's own terms, not inherited from Power Delivery.

| Market | Classification | Basis | Public display |
| --- | --- | --- | --- |
| ERCOT | `reusable_with_attribution_or_conditions` | Artifact disclaimer: "FOR PLANNING PURPOSES ONLY", warranty disclaimed, no redistribution bar | Allowed, attribution + the planning-purposes condition recorded |
| PJM | `ambiguous_requires_legal_review` | Public file, no queue-specific grant located | Allowed under founder-accepted risk |
| MISO | `ambiguous_requires_legal_review` | Open JSON endpoint, no stated licence | Allowed under founder-accepted risk |
| CAISO | `ambiguous_requires_legal_review` | Public XLSX, no stated licence | Allowed under founder-accepted risk |
| NYISO | `ambiguous_requires_legal_review` | Public XLSX, no stated licence | Allowed under founder-accepted risk |
| ISO-NE | `ambiguous_requires_legal_review` | "Copyright ©2026 ISO New England Inc." on the page, no reuse grant | Allowed under founder-accepted risk |
| **SPP** | **`unsuitable_without_permission`** | Terms & Conditions grant copying and distribution with citation **"EXCEPT when such materials will be used in commercial publication"** | **Prohibited** |
| LBNL *Queued Up* | `clearly_reusable` | **CC BY 4.0**, attribution to LBNL and GridTracker | Allowed |

SPP is the one hard block, and it is a *different* block from PD-4E's. PD-4E refused SPP's deliverability study because the document was stamped "SPP Internal Only". This queue artifact is openly published — the bar is the commercial-publication carve-out in SPP's site terms, which reaches every SPP artifact Urdais would publish. SPP queue data may be collected and held under research purpose; it may not be displayed. There is no permission grant to cite, and none should be manufactured.

ISO-NE's copyright assertion is new information relative to Power Delivery and is why it sits at ambiguous rather than reusable.

## Candidate V1 metrics

| Metric | Verdict | Note |
| --- | --- | --- |
| Active projects | **Source-backed** | 6 markets; SPP held internal |
| Active requested MW | **Source-backed, per named field** | Must be published as e.g. "PJM MWEnergy", never "queue MW" |
| Active MW by technology | **Source-backed** | After the dual-fuel/hybrid split |
| Active MW by market | **Derived, defensible** | Cross-market totals only if one MW semantic is declared |
| Median queue age | **Source-backed** | `observation_date − application_date`; all 7 publish a request date |
| New requests / MW entering | **Derived, defensible** | From request date in-file for PJM, MISO, CAISO, ISO-NE, NYISO |
| Withdrawals / MW withdrawn | **Derived, defensible for 5** | PJM, MISO, CAISO, ISO-NE, NYISO carry withdrawal dates. **Not ERCOT** from one file |
| Withdrawal reason mix | **Source-backed for 2** | CAISO `Reason for Withdrawal`, PJM `WithdrawnRemarks` (1,850). No other market publishes one |
| Projects/MW reaching operation | **Derived, defensible for 5** | Not ERCOT — no actual COD field exists |
| Completion rate | **Defensible for PJM, MISO, CAISO, ISO-NE, NYISO only** | See denominators below |
| Median time to operation | **Defensible for the same 5** | `actual_operation_date − application_date`, cohort-scoped |
| Project size distribution | **Source-backed** | Per market, per declared MW field |
| Queue age distribution | **Source-backed** | |
| Technology mix | **Source-backed** | Native labels preserved |
| Queue growth over time | **Source-backed for ERCOT** (99 vintages); **derived for 5** | ERCOT is the only market with observed history today |
| Cross-market total queue MW | **Not defensible** | Seven incompatible MW definitions; would be a fabricated aggregate |
| Anything ERCOT-operational | **Not defensible** | ERCOT publishes no actual commercial-operation date |
| Any SPP public figure | **Blocked on rights** | |

### Denominator discipline

Completion rate is never `operational ÷ currently active`. That ratio moves when withdrawals clear the denominator and says nothing about outcomes.

The defensible form is a **cohort**: of requests *submitted* in year Y, the share that had reached actual commercial operation by observation date, reported with the cohort year and the observation window. PJM's file supports this directly — 9,111 rows carry `SubmittedDate`, 1,246 carry `ActualInServiceDate`, 4,740 carry `WithdrawalDate`, so entry, exit and outcome are all dated for the same population. MISO, CAISO, ISO-NE and NYISO support it on the same pattern.

Two rules follow. A cohort younger than the observed median time to operation is **censored** and must not be published as a completion rate. And ERCOT, lacking an actual-COD field, is excluded from completion metrics until either the Commissioning Update sheets are accumulated over many vintages or an operational signal is sourced elsewhere.

## Proposed architecture

Hypotheses, not requirements. Names are provisional and deliberately carry `interconnection_` to avoid the existing `capacity`, `facility` and `grid_capacity` families.

**Reference** — `interconnection_queue_sources` (one per market artifact, with cadence and rights), `interconnection_statuses` (normalized vocabulary), `interconnection_native_statuses` (native value → normalized, per market, with the mapping's evidence), `interconnection_technologies`, `interconnection_quantity_kinds` (the named MW semantics: `maximum_facility_output`, `energy_service_mw`, `capacity_service_mw`, `net_mw_to_grid`, `summer_peak_mw`, `winter_peak_mw`, `nameplate_mw`, `requested_injection_mw`, `storage_capability_mw`, `peak_load_mw`).

**Pipeline** — `interconnection_retrievals` (artifact hash, URL, fetched-at), `interconnection_queue_snapshots` (one per retrieval per source), `raw_interconnection_records` (verbatim row/object with its locator), `interconnection_requests` (stable identity), `interconnection_request_observations` (snapshot-scoped state), `interconnection_request_quantities` (one row per native MW field per observation — **this is why no generic `capacity_mw` column exists**), `interconnection_request_components` (CAISO-style component rows, flagged as non-summable), `interconnection_request_relationships`.

The quantity table is the load-bearing decision. Putting every native MW in its own typed row, rather than picking one for a `capacity_mw` column, is what keeps PJM's 1,628 GW and 638 GW both retrievable and correctly labelled, and it is what makes "queue MW" impossible to compute by accident.

## What the repository already provides

**Directly reusable:** the retrieval and artifact-hashing pattern (`artifact.ts` in both planning and capacity ingest — collector identity, extraction version, record hash, retrieval key); the rights machinery end to end (`reference.source_use_permissions`, `source_rights_classifications`, `retrieval_rights_snapshots`, and `mayPublishSourceValue` in `src/lib/rights/publication.ts`, including the founder-accepted-risk path); batched persistence (`CAPACITY_WRITE_BATCH_SIZE = 1000`, sized to PostgreSQL's 65,535 bound-parameter ceiling); the adapter-registry shape, where a per-source adapter implements only a pure `parse` and the framework owns retrieval, hashing, rights, idempotence and supersession; source monitoring (`reference.planning_source_monitors`, `pipeline.planning_source_checks`) as the model for per-market cadence; the dependency-free XLSX reader in `planning/xlsx/`, which handles ERCOT's, CAISO's and NYISO's workbooks.

**Needed and absent:** an XML reader (PJM's 22.7 MB `PlanningQueues.xml` and `transitionProjects.xml`); a CSV reader tolerant of SPP's pre-header `"Last Updated On"` row; an HTML table extractor for ISO-NE's IRTT; and a legacy `.xls` (OLE2/BIFF) reader **if** any NYISO artifact still arrives in that format — the current NYISO file is XLSX, but the older posted file is binary `.xls` and the repo's ZIP-based reader cannot open it. The PDF reader is not needed: no market's queue requires it, and no OCR is contemplated anywhere.

**Collisions:** none by name — no `queue` or `interconnection` table exists. Semantic neighbours to stay clear of: `pipeline.capacity_observations` belongs to the GPU compute product, not the grid; `pipeline.grid_capacity_*` and `deliverable_capacity_results` are Power Delivery's approved-capacity chain and must never receive a queue quantity; `reference.facilities` is the map's physical-asset registry and is the eventual join target for POI resolution, not a place to write queue rows.

**Frontend mock to be replaced:** `src/components/power-analytics/interconnection-queue.tsx` with `INTERCONNECTION_OBSERVATIONS` in `src/data/mock/power-analytics.ts`. Four of its assumptions are already contradicted: it shows all seven markets (SPP cannot be displayed); it presents one `queuedGw` per market (seven incompatible MW definitions); it offers a clean load-versus-generation toggle (only NYISO publishes a load queue as such, with 91 rows and `End-Use` codes including `DAT` 24 and `DAT-AI` 12 — ERCOT's large-load queue is a separate report, and the other five do not expose one in these artifacts); and it publishes a `medianWaitMonths` for every market, which is not defensible for ERCOT.

## Blockers and open questions

1. **SPP is rights-blocked for display.** Collect under research purpose; publish nothing. No permission grant exists and none should be invented.
2. **ERCOT cannot report operational outcomes** from the GIS report. Completion and time-to-operation exclude ERCOT until an operational signal is sourced or vintages are accumulated.
3. **CAISO's active count needs confirmation.** 267 active rows totalling 74 GW is small against CAISO's publicly discussed queue. The file self-describes as "for All: Active"; IQ-2 must confirm whether newer clusters are absent from the public report before any CAISO total is published.
4. **ISO-NE's 60 active rows** likewise need confirmation against the IRTT's default filter, since the export guidance tells users to filter by status themselves.
5. **PJM's queue is split across two files** with different schemas, and the cycle file covers only TC1. Whether later cycles get their own files, or join the serial file, is unresolved.
6. **NYISO historical vintages are not indexed.** The filename carries a date, so prior months may be addressable by convention, but no archive listing was found.
7. **MISO's status is a three-field tuple.** Flattening it to one normalized stage loses information; the observation table should carry all three natively.
8. **No market publishes coordinates.** Map readiness depends on a POI-resolution phase that does not exist.

## Recommended IQ-2 scope

Narrow, and deliberately not all seven markets.

Build the schema above plus the retrieval/adapter framework, and ingest **PJM, MISO and CAISO** — chosen because all three carry native lifecycle history, they cover the three distinct hybrid conventions (unrecoverable, unrecoverable, component-level), they exercise the two missing readers (XML, and XLSX with shifting per-sheet columns), and together they make cohort metrics real on first ingestion rather than after a year of snapshots. Preserve every native MW field and every native status. Publish nothing.

ERCOT follows in IQ-3 with the vintage backfill, since 99 workbooks is its own project. ISO-NE and NYISO follow once the HTML extractor and the load-queue semantics are settled. SPP is collected but never displayed, and should be last.
