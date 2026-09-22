# Grid Buildout Velocity — GBV-1 source verification

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It writes no ingestion code, designs no UI, ingests no production data, and computes no velocity metric. It establishes no legal right.

**What this document is.** `gbv-1-external-research.md` is the external research input of record. It was explicit that it had not parsed the current ERCOT TPIT workbook, the CAISO TPP workbook, the SPP appendices, or the MISO Appendix A files, and it marked those claims accordingly. This document records what happened when the two **public** candidate artifacts were actually downloaded and parsed on 22 September 2026.

It **supersedes specific claims** in the external research. It does not edit them. Where the two disagree, this document governs, and the superseded claim is quoted so the change is auditable.

Artifacts parsed with `openpyxl` 3.1.5. Byte counts and row counts are from the retrieved files.

---

## 1. ERCOT TPIT — verified

**Artifact.** `https://www.ercot.com/files/docs/2022/03/02/ERCOT-July-Ad-Hoc-TPIT-No-Cost-071326-UPDATE.xlsx`
HTTP 200, **560,265 bytes**, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. This matches the 547.1 KB the external research recorded, so it is the same artifact.

It is the only file link on `https://www.ercot.com/gridinfo/sysplan`.

**Note the filename: `No-Cost`.** The public artifact is a cost-stripped variant. This matters and is treated in §1.5.

### 1.1 Workbook structure

Nine sheets:

| Sheet | Rows × cols | Role |
| --- | --- | --- |
| `ImprovementCostSummary07172026` | 39 × 23 | Aggregate cost by kV class (765/345/138/115/69/Total) |
| `FutureTPIT071326NoCost` | 1431 × 33 | 1,429 data rows |
| `PlannedTPIT071326NoCost` | 360 × 33 | 358 data rows |
| `CompletedTPIT071326NoCost` | 264 × 33 | 262 data rows |
| `CancelledTPIT071326NoCost` | 80 × 33 | 78 data rows |
| `RTPProjects` | 90 × 8 | RTP cross-reference |
| `TransmissionOwnerProjContac` | 23 × 8 | TO contacts (personal data — do not ingest) |
| `TSPResponsibility` | 32 × 2 | **The field dictionary** |
| `Cost Summary Info` | 8 × 4 | Cost-summary metadata |

The four lifecycle sheets carry an **identical 33-column schema**, header on row 2, data from row 3.

The external research anticipated future / completed / cancelled / RTP sections. There is also a **`Planned` sheet**, which it did not list.

### 1.2 The 33 columns, verbatim

```
[0]  ERCOT Project Number
[1]  Project Title (text, please start with location name first)
[2]  Project Description (text)
[3]  Comments/Reasons for Delays/Changes/Speedup (text) (Optional)
[4]  Terminal "from" Location
[5]  Terminal "to" Location
[6]  Transmission Status "under construction, planned or conceptual"
[7]  Associated Projects (project number) (Optional)
[8]  Transmission Owner (text)
[9]  TSP/Company Contact
[10] Transmission Owner Project Number (Optional)
[11] Projected In-Service Date (Month/Yr)
[12] Actual In-Service Date (Month/Yr)
[13] Service Level kV
[14] Trans Circuit Miles New
[15] Trans Circuit Miles Rebuilt, Reconductored or Upgraded
[16] Autotransformer Capacity (MVA)
[17] Reactive Capability Added   (Mvar ) (-Reactor, +Capacitor )
[18] County Location for Substation or Starting Point for a Line
[19] County Location for Ending Point for a Line (Optional for Substation projects)
[20] Planning Charter Tier
[21] RPG Number
[22] Date Submitted TO ERCOT for RPG Review (Month/Yr)
[23] Date RPG Review Completed (Month/Yr)
[24] Date ERCOT BOD Review Completed (Month/Yr)
[25] SSWG Base Case Related Bus Numbers (If applicable)  (CSV)
[26] Is the project reflected in SSWG Base Cases? (Y/N)
[27] Part of Interface (Y/N)
[28] Requested Additional Information (Optional)
[29] Other (Optional)
[30] Phase Number
[31] MOD Project Number
[32] RTP Project Number
```

### 1.3 The embedded field dictionary

`TSPResponsibility` is the TSP-obligation table. It answers open question 2 of the external research (retrieve the SSWG Procedure Manual field dictionary) **without needing the Procedure Manual**:

| Field | Required / Optional |
| --- | --- |
| ERCOT Project Number | Required |
| RTP Project Number | Required if in RTP |
| RPG Project Number | Required for submitted Tier 1, 2, and 3 projects |
| Project Title | Required |
| Project Description | **Optional** |
| Transmission Status | **Optional** |
| Transmission Owner | Required |
| Projected In-Service Date (Month/Yr) | Required |
| **Actual In-Service Date (Month/Yr)** | **Required once energized in the field** |
| **CONFIDENTIAL Total Project Estimated Cost** | Required |
| Service Level kV | Required |
| **Trans Circuit Miles New** | **Optional** |
| **Trans Circuit Miles Rebuilt or Upgraded** | **Optional** |
| Autotransformer Capacity (MVA) | Optional |
| Reactive Capability Added | Optional |
| Planning Charter Tier | Required |
| Date Submitted TO ERCOT for RPG Review | Required for submitted Tier 1, 2, and 3 projects |
| Date RPG Review Completed | Required for Tier 1–3, if RPG review has been completed |
| Date ERCOT BOD Review Completed | Required for Tier 1, if BOD review completed |
| SSWG Base Case Related Bus Numbers | Required |
| Is the project reflected in SSWG Base Cases? | Required |
| Part of Interface (Y/N) | Required |

### 1.4 Population, measured

Non-empty share by sheet:

| Field | Future (1429) | Planned (358) | Completed (262) | Cancelled (78) |
| --- | --- | --- | --- | --- |
| ERCOT Project Number | 100% | 100% | 100% | 100% |
| Transmission Owner | 100% | 100% | 100% | 100% |
| Projected In-Service Date | 100% | 100% | 100% | 100% |
| **Actual In-Service Date** | 1.3% | 3.9% | **100%** | 2.6% |
| Service Level kV | 99.9% | 100% | 100% | 100% |
| Planning Charter Tier | 100% | 100% | 100% | 100% |
| Trans Circuit Miles New | 99.9% | 99.2% | 99.6% | 100% |
| Trans Circuit Miles Rebuilt | 99.5% | 99.7% | 99.6% | 100% |
| RPG Number | 26.2% | 18.2% | 19.8% | 1.3% |
| Date RPG Review Completed | 20.2% | 13.1% | 18.7% | 1.3% |
| Date ERCOT BOD Review Completed | 8.9% | 6.1% | 6.9% | 1.3% |

### 1.5 Findings that change the recommendation

**(a) `Actual In-Service Date` exists and is complete on the Completed sheet — 262 of 262.**

Superseded claim: *"required_in_older_planning_guide; completed_section_exists; current_xlsx_not_parsed"*.

All 262 values are typed datetimes, not strings. The field dictionary makes it mandatory once energised. **This is the single verification the V1 recommendation was waiting on, and it passes.** ERCOT can support a real completion census rather than a projected-date proxy.

**(b) Approval dates exist as columns but are structurally sparse.**

Superseded claim: *"approval_date: not_a_mandated_tpit_column_in_2026_pg_text"*. Three approval-shaped columns exist: RPG submission, RPG review completed, ERCOT BOD review completed.

They are, however, required **only for Tier 1–3** (and BOD only for Tier 1). On the Completed sheet, `Tier 4` is 208 of 262 rows — 79%. So RPG review completed is populated on 18.7% and BOD on 6.9%, and the populated subset is *not* a random sample: it is the large-project subset by construction.

The research's verdict (no defensible ERCOT approval-to-service median) therefore **stands, for a different reason**. The columns are present; the population is biased. An approval-to-service duration is admissible only if explicitly scoped to Tier 1–3 and published with its denominator.

**(c) The `Transmission Status` column contradicts sheet membership, and the column is Optional.**

On the Completed sheet the status values are `In-Service` 145, `Planned` 104, `Under Construction` 11. **117 of 262 completed rows — 44.7% — carry a non-completed status string.** The Future sheet contains 3 rows marked `In-Service`; Planned contains 11.

The four sheets are a clean partition: 1,424 / 358 / 262 / 78 unique project numbers with **zero intersection** between any pair.

**Sheet membership is the lifecycle authority. The status column is not.** An ingest keying on the status text would misclassify nearly half of ERCOT's completions. The field dictionary corroborates this: `Transmission Status` is Optional, `Actual In-Service Date` is Required.

**(d) A `9999` sentinel exists in the actual-date column.**

Nine Completed rows carry `Actual In-Service Date` = year **9999** (e.g. `72876A` "Provide 138 kV POD for Skybox at Teal Switch"; `78365` "Fryers Creek 138/69 kV Switch"). These are on the Completed sheet but carry no real energisation date.

This is the same shape as the NYISO `9999` MW sentinel handled in Transmission Headroom. It must be an explicit unknown, excluded from date arithmetic and counted in a stated denominator — never silently coerced or dropped.

**(e) Circuit miles are separated into new versus rebuilt — but both are Optional, and mostly zero.**

`Trans Circuit Miles New` and `Trans Circuit Miles Rebuilt, Reconductored or Upgraded` are distinct columns, ~99.6% non-empty on Completed. That directly addresses the "rebuilds counted as buildout" risk.

But on the 262 completed rows, only **33 have new miles > 0** and **63 have rebuilt miles > 0**. Roughly three quarters of completed ERCOT projects are substation, transformer, breaker, or reactive work with no line mileage at all.

Both fields are **Optional** in the dictionary, so a `0` cannot be distinguished from "not reported". Under existing publication discipline — empty is not zero — a miles-summing metric is **not defensible**, and the count is the honest unit.

**(f) Per-project cost is permanently unavailable in the public artifact.**

The dictionary names `CONFIDENTIAL Total Project Estimated Cost` as Required of TSPs, and the public file is the `No Cost` variant with that column removed. What remains is `ImprovementCostSummary07172026`, an aggregate by kV class. Per-project ERCOT cost is not merely unparsed; it is withheld by design. No ERCOT cost metric at project grain is possible from public data.

**(g) Project identity is nearly, but not perfectly, unique.**

The Future sheet has 1,429 data rows and 1,424 distinct project numbers — **5 duplicates**. Suffixed identifiers are native and meaningful (`72876A`/`72876B`, `78480A`/`78480B`, `73371F`/`73371H`, `90180A`/`90180B`), indicating phase or component splits. `Phase Number` is a dedicated column.

Identity cannot assume uniqueness of project number within a sheet.

**(h) Generator-interconnection contamination is real, and only partly machine-detectable.**

Completed rows whose title or description contains an ERCOT interconnection-request number matching `\d{2}INR\d{3,5}`: **21 of 262 (8.0%)** — e.g. `72053` "Oasis 345kV Substation Expansion for SOHO BESS (23INR0419)", `76624` "WA Parish 345kV Substation Expansion for Crowned Heron Storage (24INR0405)".

Rows matching a broader generation/storage keyword set: **53 of 262 (20.2%)**, all within Tier 4.

So the INR number is a **high-precision but incomplete** marker: it catches 8%, while around 20% appear interconnection-driven. A keyword rule is not a classification. GBV-2 must treat driver classification as an explicit, reviewable step with an `unknown` class, not a regex.

Nine completed rows are load-side `POD` (point of delivery) work, several named for data centres. Those are neither generator interconnection nor backbone expansion, and need their own decision.

**(i) The public archive stops in 2014.**

`Archived-Transmission-Project-and-Information-Tracking.zip` — HTTP 200, **19,705,062 bytes**, 74 entries, all legacy `.xls`. Filename years run **2007–2014** only (2007×1, 2008×1, 2009×2, 2010×6, 2011×11, 2012×19, 2013×6, 2014×1).

Superseded claim: the research listed "ERCOT TPIT archive ZIP" as the backfill route without noting its end date.

There is **no public ERCOT TPIT vintage between 2014 and the July 2026 file.** And the current Completed sheet is a rolling window, not a cumulative census: its actual in-service years are only **2025 (194 rows) and 2026 (59 rows)**, plus the 9 sentinels.

ERCOT historical depth is therefore: a 2007–2014 block in a legacy format, an eleven-year hole, and roughly **1.5 years** of completions in the current file. Depth must be built forward by snapshotting each triannual vintage.

### 1.6 Other verified distributions (Completed sheet)

- Service level kV: `138` 163, `345` 76, `69` 23. No 765 or 115 completions in this window.
- Planning Charter Tier: `Tier 4` 208, `Tier 3` 41, `Tier 1` 8, `Tier 2` 5.

---

## 2. CAISO TPP workbook — verified

**Artifact.** `https://www.caiso.com/documents/approved-projects-transmission-planning-process-jul-2026.xlsx`
HTTP 200, **635,627 bytes**. Linked from the 29 July 2026 forum page, which is JS-rendered; the library index exposes no file links to a plain fetch.

The sibling `https://www.caiso.com/documents/network-upgrades-generation-interconnection-jul-2026.xlsx` is the generator-interconnection workbook. It is **out of scope for GBV** and confirms the external research's warning.

### 2.1 Structure

Eleven sheets: `Impact Category` plus ten PTO sheets — `PGaE` (143 rows), `SCE` (47), `SDGaE` (24), `LSPower` (9), `VEA_GLW` (3), `HWT` (2), `CalGrid` (2), `Lotus` (1), `CitizensEnergy` (1), `DCRT` (1). **233 project rows total.**

Column counts differ per sheet (16–27) because each PTO carries only the TDF vintages it has existed for. Column *names* are consistent.

### 2.2 Columns (PG&E / SCE shape)

```
TP Project ID | Project | PTO | Transmission Plan Approved
In-service Date at Approval in Transmission Plan
Expected In-Service Date 2020-2021 Transmission Plan
Previous In-Service Jan 2022 TDF ... Previous In-Service Jan 2026 TDF   (~15 vintage columns)
Current In-Service July 2026 TDF
Project Status | Expected CPUC Permit Application Filing | Expected Construction Start
Reason for ISD Change from Original Comitted Date | Delay Resolver | Notes
```

### 2.3 Findings that change the recommendation

**(a) The workbook is its own longitudinal archive.** It carries roughly fifteen dated in-service columns from `Jan 2022 TDF` through `Jan 2026 TDF`, plus `Current In-Service July 2026 TDF`, alongside a frozen **`In-service Date at Approval in Transmission Plan`**.

This is better than the external research described from PTO slides. The revision history of every project's expected date is in a single retrieved file, so CAISO slip analysis does **not** depend on Urdais having snapshotted prior forums. It also removes the "rescope resets the original ISD" worry for the at-approval column specifically, because that column is preserved beside the revisions.

**(b) `Project Status` is uncontrolled free text.** Observed values across 233 rows:

`In-Flight` 90, `Initiating` 37, `Construction` 16, `Engineering` 13, `Design` 12, `Preliminary Engineering` 9, `Planning` 8, `Initiation` 6, `In-Service` 5, `Cancelled` 5, `In-flight` 4, `Permitting, engineering and design` 4, `In flight` 3, `On Hold` 3, `Construction Complete` 3, `Permitting` 3, `On Hold (CAISO)` 2, `In Service` 2, `Initial Development Activities` 2, `Final Engineering` 1, `Engineering Design` 1, `TBD` 1, `Completed` 1.

"In-flight" appears in **four different casings/spellings** totalling 98 rows. "In-Service" and "In Service" are separate strings. This is PTO-authored prose, not an enum. The external research read tidier-looking PTO PDFs and recorded a cleaner status list than the workbook actually contains.

**(c) The completed population is tiny.** `In-Service` (5) + `In Service` (2) + `Completed` (1) = **8 projects**; adding `Construction Complete` (3) reaches 11, out of 233.

A CAISO completions-per-year series would rest on single digits. **That is below any defensible sample floor**, and it contradicts the external research's recommendation of CAISO as a co-equal public completion market.

**(d) There is no actual in-service date column.** Every date column is an expectation — at approval, at a prior forum, or current. Completion can only be *inferred* from a free-text status, and §2.3(b) shows how unreliable that string is.

**(e) Construction start is expected, not actual.** The column is `Expected Construction Start`. Values are mixed datetimes and strings including literal `TBD` (SCE: 37 datetimes, 9 strings of 46 populated).

Superseded claim: the research listed CAISO construction start as a published actual and made "median construction-to-service time" *"partially defensible in CAISO only"*. **It is not defensible anywhere.** No market in the matrix publishes an actual construction-start date. That candidate metric is rejected outright.

**(f) What CAISO is genuinely strong at is slip, not velocity.** `In-service Date at Approval in Transmission Plan` + the vintage series + `Reason for ISD Change from Original Comitted Date` + `Delay Resolver` is a well-formed schedule-slip dataset over 233 projects — considerably better evidenced than its eight completions.

---

## 3. Not verified in this pass

Unchanged from the external research, and still carrying its evidence marks:

- **PJM** — the project-construction page is JS-rendered; no machine-readable export confirmed.
- **MISO** — Portal is login-gated; Appendix A workbooks not opened. Rights block public use regardless.
- **SPP** — QPT appendices not parsed. Rights block public use regardless.
- **ISO-NE** — RSP list spreadsheet not parsed; only the June 2026 presentation was read by the external research.
- **NYISO** — PDF-only; nothing to parse.
- ERCOT archive `.xls` internals (2007–2014) were not opened; only the filename manifest was read.

No rights classification changed in this pass. Nothing here was retrieved from a login-gated or NDA source.
