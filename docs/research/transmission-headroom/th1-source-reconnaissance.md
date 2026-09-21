# Transmission Headroom TH-1: source reconnaissance and metric architecture

**Status: internal research document.** Not a methodology, not routed publicly, not registered in the docs catalog. It approves no metric, creates no source right, and no production table or surface reads it. Prepared 21 September 2026 against `main` at `45fcb02`.

Every number in this document came from an artifact actually retrieved on 21 September 2026, not from a documentation page. Where a source could not be retrieved, that is stated rather than inferred.

## The short version

Seven markets, and the honest answer is that **two support a defensible headroom product today, one supports a capability product that is not headroom, and four do not** — two of those four because their data is behind an account, and two because the numerator simply is not published.

| Market | Closest source concept | Flow published? | Limit published? | Class |
|---|---|---|---|---|
| NYISO | Interface flow with directional limits | **yes** | **yes, per interval** | **B — derivable** |
| ERCOT | Binding-constraint limit/flow pairs | **yes** | **yes** | **B — derivable, binding subset only** |
| CAISO | ATC / TTC / TRM / CBM per branch group | no (`USEAGE_MW` empty) | capability, not a thermal limit | **C — capability proxy** |
| SPP | Flowgate effective limits | no | **yes, three of them** | **C — limits without flow** |
| MISO | Binding constraints, shadow price only | no | no | **D — insufficient** |
| PJM | Data Miner 2 transmission feeds | unknown | unknown | **D — unretrievable, rights adverse** |
| ISO-NE | Web Services limits/flows | unknown | unknown | **D — unretrievable** |

The recommended TH-2 tranche is **NYISO and ERCOT only**. Reasons in §14.

---

## 1. Working definition

The definition I recommend Urdais adopt, and the one the rest of this document tests against:

> **Transmission headroom** is the signed megawatt quantity by which the power flowing across a specific monitored element or interface, **in a specific direction**, under a **specific contingency assumption**, differs from the limit the operator was enforcing on that element **at that moment**.
>
> `headroom_mw = applicable_limit_mw − observed_flow_mw`, evaluated per element, per direction, per contingency, per interval.

Four words in that definition are load-bearing, and each of them is a trap a casual definition falls into.

**"Specific"** — headroom is not a property of a market. It is a property of one element under one contingency. Aggregating it across elements is a separate, later decision (§11).

**"Direction"** — NYISO publishes a positive and a negative limit per interface and a signed flow. An interface with 2,690 MW of eastbound room may have none westbound, or may not be monitored westbound at all. A single unsigned "headroom MW" destroys this.

**"Contingency assumption"** — ERCOT's own data shows 314 of 332 constraint rows in one artifact are post-contingency and only 18 are `BASE CASE`. Base-case margin and contingency-secure margin are different numbers about different questions.

**"At that moment"** — limits move intraday. NYISO's CENTRAL EAST interface carried both 2,690 and 2,740 MW as its positive limit within a single day, and UPNY CONED carried 5,680 and 5,800. A cached rating table would be wrong for part of every day.

### Operational and planning headroom must be separate series

Yes — unambiguously, and this is the first architectural commitment I would make.

Operational headroom is a 5-minute observation of what the operator was enforcing against what actually flowed. Planning headroom is the output of a study about a future year under assumed conditions. They share a unit and nothing else: different time basis, different topology, different contingency set, different revision behaviour, different meaning of "limit". Publishing them as one series would repeat the Power Delivery lesson — that a shared unit is not a shared quantity.

**TH-1 recommends the V1 product be operational headroom only.** No planning source was retrieved in this phase, and none of the retrieved sources supports a planning series.

---

## 2. Glossary

Source-backed where a retrieved artifact names the term; otherwise marked as industry usage.

| Term | Meaning | Where observed |
|---|---|---|
| **Actual flow** | Measured or state-estimated MW across an element. | NYISO `Flow (MWH)`; ERCOT `Value` |
| **Normal / applicable limit** | The MW the operator is enforcing on the element now. | NYISO `Positive/Negative Limit (MWH)`; ERCOT `Limit` |
| **Source limit** | The facility's underlying rating before operational adjustment. | SPP `Source Limit` |
| **Effective limit** | The rating actually enforced, after adjustment. | SPP `Real Time Effective Limit`, `Initial Effective Limit` |
| **TTC** | Total Transfer Capability — the most that can be transferred across an interface. | CAISO `TTC_MW` |
| **ATC** | Available Transfer Capability — TTC less reserved margins **and net of counterflow**. | CAISO `ATC_MW` |
| **TRM** | Transmission Reliability Margin, held back for uncertainty. | CAISO `TRM_MW`, plus `TRM_FTO_MW`, `TRM_SPI_MW`, `TRM_UF_MW` |
| **CBM** | Capacity Benefit Margin, reserved for generation reliability imports. | CAISO `CBM_MW` |
| **OTC** | Operating Transfer Capability. | CAISO `OTC_MW` |
| **Shadow price** | The marginal value of relaxing a binding constraint by 1 MW. | ERCOT, MISO, SPP |
| **Flowgate** | A monitored transfer path, often with a NERC-registered identity. | SPP `Constraint Type = FG`, `NERCID` |
| **Contingency** | The outage the limit is protecting against; `BASE CASE` means none. | ERCOT `ContingencyName`; SPP `Contingent Facility` |
| **TLR** | Transmission Loading Relief, the NERC curtailment procedure. | SPP `TLR Level` |
| **Interconnection deliverability** | Whether a *generator* can deliver to load. Not a network margin. | Power Delivery methodology |
| **Queue MW** | MW of projects requesting interconnection. Not capacity, not headroom. | Interconnection Queue 1.0.0 |

---

## 3. NYISO — the strongest source, and the only one publishing flow and limit together as a standing series

**Source.** `http://mis.nyiso.com/public/csv/ExternalLimitsFlows/YYYYMMDDExternalLimitsFlows.csv`, with monthly archives at `.../YYYYMM01ExternalLimitsFlows_csv.zip`. Plain HTTP, no account, no cookie, no token, no JavaScript.

**Schema** (unchanged since at least 2005):

```
Timestamp,Interface Name,Point ID,Flow (MWH),Positive Limit (MWH),Negative Limit (MWH)
09/21/2026 00:00,CENTRAL EAST - VC,23330,1273.04,2690,-9999
```

**Retrieved 21 September 2026:** 4,237 rows, 221 timestamps, 19 interfaces, 232,329 bytes for a partial day.

### The full interface roster as actually observed

| Interface | Point ID | Positive limit(s) | Negative limit(s) | Flow range |
|---|---|---|---|---|
| CENTRAL EAST - VC | 23330 | 2690, **2740** | −9999 | 1082.2 … 1867.7 |
| DYSINGER EAST | 23326 | 2850 | −9999 | 140.3 … 1214.0 |
| MOSES SOUTH | 23319 | 3400 | −1600 | −607.7 … 775.1 |
| SCH - HQ - NY | 23324 | 1500 | −100, **−985** | −985.0 … −33.0 |
| SCH - HQ_CEDARS | 325274 | 49 | 0 | 0.0 … 0.0 |
| SCH - HQ_CHPE | 625211 | 1250 | −1250 | 0.0 … 1250.0 |
| SCH - HQ_IMPORT_EXPORT | 325376 | 1310 | −9999 | −985.0 … −33.0 |
| SCH - NE - NY | 23318 | 1400 | −1600 | −1397.3 … 844.7 |
| SCH - NPX_1385 | 325277 | 200 | −200 | −20.0 … 126.0 |
| SCH - NPX_CSC | 325154 | 330 | −330 | 1.0 … 330.0 |
| SCH - OH - NY | 23317 | 1900 | −1600 | 182.3 … 1275.8 |
| SCH - PJ - NY | 23316 | 1700 | −1050 | −129.7 … 1361.0 |
| SCH - PJM_HTP | 325905 | 660 | −660 | 60.0 … 660.0 |
| SCH - PJM_NEPTUNE | 325305 | 660 | −660 | **660.0 … 660.0** |
| SCH - PJM_VFT | 325658 | 315 | −315 | 242.0 … 315.0 |
| SPR/DUN-SOUTH | 23320 | 4350 | −9999 | 807.5 … 3062.5 |
| TOTAL EAST | 23314 | 7550 | −9999 | 2090.9 … 3389.1 |
| UPNY CONED | 23315 | 5680, **5800** | −9999 | 1491.6 … 3974.6 |
| WEST CENTRAL | 23312 | **9999** | −9999 | −172.8 … 802.8 |

### Five things this table proves

1. **`9999` and `−9999` are sentinels, not limits.** Six internal interfaces carry `−9999` westbound and WEST CENTRAL carries `9999` eastbound. `headroom = 1273.04 − (−9999)` would fabricate 11,272 MW of reverse capability on CENTRAL EAST. **Any row whose applicable limit is ±9999 has no headroom in that direction and must be recorded as unmonitored, never as a number.**

2. **Limits are dynamic.** CENTRAL EAST moved between 2,690 and 2,740 within the day; UPNY CONED between 5,680 and 5,800; SCH - HQ - NY's negative limit between −100 and −985. The limit must be read per interval. There is no static rating table.

3. **Flow is signed and direction is real.** MOSES SOUTH ran −607.7 to +775.1. SCH - HQ - NY ran entirely negative, so its binding limit is the negative one while its positive limit of 1,500 is never approached.

4. **Zero headroom is a real, correct observation.** SCH - PJM_NEPTUNE sat at exactly 660.0 against a 660 limit for every interval of the day. That is an HVDC merchant tie run at its rating: headroom 0.0, and it must render as 0.0, not as missing.

5. **A dead tie is not zero headroom.** SCH - HQ_CEDARS has limits 49 / 0 and flow 0.0 throughout. Its headroom is arithmetically 49 but it is carrying nothing; this needs a state, not a number.

### History, and where it actually starts

Monthly archives return HTTP 200 back to **January 2002**. But the schema's *meaning* changed, which a naive backfill would miss:

| Month | Rows | Interfaces | Stamps/day | Negative limit `9999` | Negative limit `−9999` | First timestamp |
|---|---|---|---|---|---|---|
| 2005-01 | 4,015 | 11 | 365 | **4,015 (all)** | 0 | `00:01:35` |
| 2010-01 | 4,896 | 17 | 288 | 0 | 1,728 | `00:00` |
| 2015-01 | 5,184 | 18 | 288 | 0 | 2,016 | `00:00` |
| 2020-01 | 5,184 | 18 | 288 | 0 | 2,016 | `00:00` |
| 2026-01 | 5,202 | 18 | 289 | 0 | 2,023 | `00:00` |

In 2005 **every row** carried `9999` in both limit columns — an unsigned sentinel — so limits were effectively not published, and timestamps were irregular (`00:01:35`, 365/day). By 2010 the convention is signed (`−9999`), the cadence is a clean 288 intervals of 5 minutes, and real limits appear.

**Usable headroom history therefore begins somewhere between 2006 and 2010, not 2002.** TH-2 must bisect that boundary rather than assume it, and must treat the 2005-era convention as a distinct schema.

Interface count grows 11 → 17 → 18 → 19. New interfaces appear (`SCH - HQ_CHPE`, Point ID 625211, is the Champlain Hudson Power Express, recently energized). Identity must be the numeric **Point ID**, never the name.

**Acquisition risk: low.** Static path, predictable filenames, no auth, monthly archives for backfill, stable schema since 2010.

---

## 4. ERCOT — real limit/flow pairs, but only where a constraint is already binding

**Source.** MIS report `NP6-86-CD`, "SCED Shadow Prices and Binding Transmission Constraints", `reportTypeId=12302`. Listing at `https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302`; artifacts via `https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId=<id>`. No account required.

**Retrieved 21 September 2026:** listing carried 368 artifacts; one downloaded (5,810 bytes zipped) contained 332 rows, 30 distinct constraints, 13 SCED intervals.

```
SCEDTimeStamp,RepeatedHourFlag,ConstraintID,ConstraintName,ContingencyName,ShadowPrice,
MaxShadowPrice,Limit,Value,ViolatedMW,FromStation,ToStation,FromStationkV,ToStationkV,CCTStatus
09/21/2026 16:55:23,N,24,CONCHO_HARI1_A,XBAL89,0,2800,29.4,29.3,-0.2,CONCHO,HARI,69,69,NONCOMP
09/21/2026 16:55:23,N,27,NELRIO,BASE CASE,49.92439,5251,867,867,0,,,0,0,NONCOMP
```

This is the only source retrieved that publishes `Limit` and `Value` (flow) as an explicit pair on the same row, with the contingency named.

### Measured semantics

- `Limit − Value` ranged **−0.30 … 266.70 MW**, mean 27.24.
- `ViolatedMW` equals `−(Limit − Value)` to within 0.1 MW rounding; 52 of 332 rows differ, all by ≤0.1. It is the same quantity with the opposite sign, rounded.
- **105 of 332 rows had margin ≤ 0, and exactly those 105 rows had `ShadowPrice > 0`.** Shadow price is therefore a clean, source-backed binding indicator — no invented threshold needed (§10).
- Only **1 row** had `ViolatedMW > 0`, i.e. genuinely over the limit.
- `ContingencyName` is **314 named contingencies vs 18 `BASE CASE`**. Post-contingency is the normal case, not the exception.
- `ConstraintID` is a small stable integer; `FromStation`/`ToStation`/`kV` give physical anchors, though `NELRIO` (a base-case constraint) has empty stations and `0` kV.

### The trap that disqualifies this as a general headroom source

**This report contains only constraints SCED was actively managing.** 30 constraints in an interval, out of thousands of ERCOT elements. An element with abundant headroom never appears at all.

So ERCOT supports *constraint margin where the grid is tight* — a genuinely interesting series about where Texas is congested and by how much — but it cannot answer "how much headroom does ERCOT have", because the denominator is invisible. **Naming this "ERCOT transmission headroom" without that qualifier would be the CNR mistake again:** a real number from a real source, measuring something narrower than its name implies.

`CCTStatus` was `NONCOMP` on every row observed; its vocabulary is unresolved.

**Acquisition risk: medium.** No auth, but `doclookupId` values are opaque and must be scraped from the HTML listing (368 links per page, ~5 minutes apart), and the listing is a rolling window. Long history needs either the ERCOT archive product or continuous capture from now. The IQ-3 ERCOT reader already handles this listing idiom.

---

## 5. CAISO — a complete ATC dataset, and a decisive argument that ATC is not headroom

**Source.** OASIS `SingleZip`, `queryname=TRNS_CURR_USAGE`. Public HTTP, no key. Related: `PRC_NOMOGRAM` (15,597 bytes). `ATL_CNSTR`, `ATL_ATC`, `ATL_TTC`, `ATL_OPS_BNDRY` and `ATL_BRANCH_LIMIT` all returned `INVALID_REQUEST` with error 1001 under the parameter set tried — they exist but need parameters TH-1 did not determine.

**Retrieved for 19 September 2026:** 1,989,515 bytes, **147,264 rows**, 59 branch groups, 96 quarter-hour intervals, both directions.

Thirteen data items per group/direction/interval: `TTC_MW`, `ATC_MW`, `OTC_MW`, `TRM_MW` (+ `TRM_FTO_MW`, `TRM_SPI_MW`, `TRM_UF_MW`), `CBM_MW`, `CONSTRAINT_MW`, `MKT_XFER_CAP_MW`, `USEAGE_MW`, `AS_IMPORT_MW`, `ENE_IMPORT_MW`. `DIRECTION` is `E`/`I` — **directionality is first-class in the source.**

### Two measurements that settle the "is ATC headroom?" question

I tested the textbook identity `ATC = TTC − TRM − CBM − usage` against all 11,328 direction-intervals:

- **3,135 rows (27.7%) have `ATC > TTC`.** The identity is not merely inexact; it is impossible for more than a quarter of the data.
- **`USEAGE_MW` is 0 in 100% of rows.** The usage column is not populated in this report at all.
- **74.5% of group-intervals have export and import residuals that are exact negatives of each other** (e.g. ADLANTO-SP_ITC: export residual −309.0, import residual +309.0).

That antisymmetry is the explanation: CAISO's ATC **nets counterflow**. Scheduling 309 MW inbound creates 309 MW of additional outbound capability, so export ATC legitimately exceeds export TTC.

### Conclusion: ATC must not be published as headroom

1. It contains **no flow term** — `USEAGE_MW` is empty, so `limit − flow` is not derivable.
2. It is **capability net of reservations and counterflow**, not distance-to-limit.
3. `ATC > TTC` would be nonsense for any quantity described as "remaining room".

ATC is a legitimate and interesting quantity — *how much more could be scheduled* — but it answers a different question from headroom and belongs, if published at all, as its own clearly-named metric. Treating them as the same series would be a category error.

**Acquisition risk: low** for the endpoint (no auth, stable, dated parameters), **medium** for coverage, since the constraint-level reports needed for true headroom were not successfully parameterised in TH-1.

---

## 6. SPP — three limits, no flow, and an independent rights question

**Source.** `https://portal.spp.org/file-browser-api/download/rtbm-binding-constraints?path=/YYYY/MM/By_Day/RTBM-DAILY-BC-YYYYMMDD.csv`, plus `?path=/RTBM-BC-latestInterval.csv` for the current interval.

**Retrieved for 20 September 2026:** 2,067,092 bytes, **13,936 rows**.

```
Interval,GMTIntervalEnd,Constraint Name,Constraint Type,NERCID,TLR Level,State,Shadow Price,
Monitored Facility,Contingent Facility,Source Limit,Real Time Effective Limit,Initial Effective Limit,Interconnect
09/20/2026 00:05:00,...,TMP845_30027,FG,30027,CME,ACTIVATED,0.0000,LN MARSHAL3 - KNOB,WR:MARSHAL3 SSEN:115:2:12,70,63.7,67.9,E
```

Two findings worth carrying forward even though SPP is not a TH-2 candidate:

**Three limits per row.** `Source Limit` 70, `Real Time Effective Limit` 63.7, `Initial Effective Limit` 67.9 — on the same constraint, in the same interval. A headroom number computed against the wrong one is wrong by 9% here. This is the limit-hierarchy problem made concrete: **any future model must record which limit it used, as a first-class field, not a convention.**

**`State` is a source-backed severity.** Observed values `ACTIVATED` and `BINDING`. This is exactly the source-provided state to prefer over invented thresholds.

**But there is no flow column**, so `limit − flow` is not derivable. SPP is limits-without-flow: Class C.

**Rights: must be classified independently, and I have not done so.** The Interconnection Queue blocks SPP's *Generator Interconnection Active Request Listing* as `unsuitable_without_permission`. That determination attached to that interface, and TH-1 deliberately does **not** inherit it. The `portal.spp.org` Marketplace file-browser is a different interface and needs its own terms review before any TH work. It would be equally wrong to assume it is blocked and to assume it is clear.

---

## 7. MISO — constrained-ness without magnitude

**Source.** `https://docs.misoenergy.org/marketreports/2026_rt_bc_HIST.csv` (year-to-date history) and daily `YYYYMMDD_rt_bc.xls` / `_da_bc.xls`.

**Retrieved 21 September 2026:** 60,321,025 bytes, **364,923 rows** for 2026 to date. Daily RT workbook 153,088 bytes; DA 73,728.

```
Market Date,Flowgate NERCID,Constraint_ID,Constraint Name,Branch Name ( Branch Type / From CA / To CA ),
Contingency Description,Hour of Occurrence,Preliminary Shadow Price,Constraint Description,Override,
Curve Type,BP1,PC1,BP2,PC2
1/1/2026,,262348,ALW16053_LAURELSS_LAUREJASPE16_1_1,LAURELSS LAUREJASPE16_1 1 (LN/ALTW/ALTW),AMES - FERNALD 161,00:05,($20.93),,0,PERCENT,100.0,1000.0,102.0,2000.0
```

**There is no limit column and no flow column.** `BP1`/`BP2` are penalty-curve breakpoints expressed as *percent of limit* (100.0, 102.0) paired with penalty prices (`PC1` 1000.0, `PC2` 2000.0). They tell you the constraint bound at ~100% of a limit whose MW value is never published.

MISO is genuinely rich for *congestion* work — deep history, shadow prices, NERC flowgate IDs, named contingencies — and genuinely unable to support a headroom MW. **Class D for this product.** A constrained-interface count is the most it could contribute, and even that is a count of *binding* constraints, not of the network.

---

## 8. PJM — could not be retrieved, and the rights signal is adverse

Every Data Miner 2 path tried returned `401` at `https://api.pjm.com/api/v1/` or `404` for guessed feed names. The API uses an Azure APIM `Ocp-Apim-Subscription-Key`, confirmed in PJM's own API guide (2,634,674-byte PDF, 65 pages, retrieved). A key requires a registered PJM Tools account approved by a Customer Account Manager.

**No PJM artifact was retrieved. No PJM field name in this document is first-hand.**

On rights, PJM's Legal and Privacy page states:

> "Access to this website does not confer any license or ownership interest in either the form or content of the website, including any confidential or proprietary information or intellectual property of any kind or nature."

Secondary sources describe a Data Miner 2 term prohibiting redistribution of data "contained in or derived from" Data Miner 2 without a PJM-issued Redistribution License, and restricting non-member use to internal business use. **I could not load the PJM knowledge article to verify that wording first-hand, so it is recorded here as unverified** — but it is specific enough, and adverse enough, that it must be resolved before any PJM transmission work rather than after.

This is the §23 discipline in action: the Interconnection Queue classified *PJM Planning Queues* as `ambiguous_requires_legal_review` and publishes under founder-accepted risk. **That determination cannot transfer to Data Miner 2**, which is a different interface with different, apparently more restrictive, access terms.

**Class D for TH-2** — not because PJM lacks the data, but because Urdais cannot currently obtain it or establish the right to publish from it.

---

## 9. ISO-NE — entirely auth-gated

`https://webservices.iso-ne.com/api/v1.1/...` returned `401 Unauthorized` on every path tried, including `/limits/current` and `/fiveminutesystemload/current.json`. `www.iso-ne.com/ws/wsclient` returned `500`. Five public-CSV path patterns returned `404`.

**No ISO-NE artifact was retrieved.** ISO-NE Web Services require a free registered account; that is an acquisition step and a terms question, not a technical blocker, but it was not completed in TH-1.

Note the same non-inheritance rule: IQ-4 classified the *ISO-NE Interconnection Request Queue* as `ambiguous_requires_legal_review` from a public unauthenticated page. Web Services is a different interface behind an account agreement and needs its own review.

**Class D for TH-2**, revisitable once an account and its terms are reviewed.

---

## 10. Cross-cutting semantics

### Granularity — do not collapse these

| Market | Native granularity | Entity kind |
|---|---|---|
| NYISO | Named transfer interface with Point ID | **interface** (internal) and **import/export path** (`SCH -` ties) |
| ERCOT | Monitored element with From/To station and kV | **monitored element**, occasionally a **zone-level base-case constraint** |
| SPP | Flowgate with NERC ID, plus monitored + contingent facility | **flowgate** |
| MISO | Flowgate NERC ID + branch name | **flowgate** / **line** |
| CAISO | Intertie branch group | **import/export path** |

NYISO alone spans two kinds in one file: `TOTAL EAST` is an internal transfer interface; `SCH - PJM_NEPTUNE` is a merchant HVDC tie to another market. They should not share a row type without an explicit kind discriminator.

**Recommendation: keep `transmission_interface` and `transmission_element` as separate canonical entities.** They have different identity sources, different limit semantics, and different directional meaning. One generalized table would force a lowest-common-denominator schema and lose exactly the distinctions that make the product defensible.

### Directionality

Directional in every source that publishes enough to tell: NYISO signed flow with separate positive/negative limits; CAISO explicit `E`/`I`; ERCOT implicitly via the monitored element's orientation. **Direction must be a first-class column, never folded into an absolute value.**

### Limit hierarchy

Observed: SPP's three-way `Source` / `Initial Effective` / `Real Time Effective`; NYISO's intraday-varying positive and negative limits; ERCOT's single `Limit` that already reflects the enforced value. Normal vs emergency vs ambient-adjusted vs dynamic ratings are **not** distinguishable in any retrieved artifact. The model must therefore record *which published limit field* a headroom number used, and must not claim a rating type the source did not state.

### Contingency

ERCOT names it per row (`BASE CASE` vs e.g. `XBAL89`) — 314 named to 18 base-case. SPP names a `Contingent Facility` per row. MISO gives a `Contingency Description`. NYISO gives **none**: its interface limits are operating limits that already embed contingency analysis, so NYISO headroom is "against the enforced operating limit" and cannot be decomposed into pre- and post-contingency.

This asymmetry is important: **NYISO and ERCOT headroom are not the same kind of number.** NYISO's is one margin against an all-in operating limit; ERCOT's is many margins, one per contingency, on an element.

### Utilization

`utilization = |flow| / limit` is defensible **only** where flow and limit are directionally matched and the limit is not a sentinel:

- Use the positive limit when flow > 0 and the negative limit when flow < 0; never `|flow| / positive_limit`.
- Never compute it when the applicable limit is ±9999.
- Never compute it for CAISO or SPP at all — there is no flow.

### Negative headroom

Preserve it. ERCOT's `ViolatedMW` already encodes an over-limit condition and one row in the sample was genuinely violated. Clamping to zero would erase precisely the moments the product exists to show. `headroom_mw` should be a signed numeric with no floor.

### Severity states

Prefer source-backed: SPP's `State` (`ACTIVATED`/`BINDING`), ERCOT's `ShadowPrice > 0` (which matched margin ≤ 0 on 105/105 rows). Invent no thresholds. Where no source state exists (NYISO), publish the margin and let the reader judge, or derive a state only under an approved methodology.

---

## 11. Cross-market comparability

**A single cross-market "Transmission Headroom MW" is not defensible, and TH-1 recommends against ever attempting one.**

The evidence is stronger here than it was for queue capacity. The quantities are not merely differently measured; they are different objects:

- NYISO headroom is a margin on **19 named transfer interfaces** against all-in operating limits.
- ERCOT margin is a distance-to-limit on **whichever ~30 elements SCED was actively managing in that interval**, per contingency.
- CAISO ATC is **capability net of counterflow** with no flow term.
- SPP publishes limits with no flow; MISO publishes neither.

Summing or averaging these would produce a number with no referent. Even counting "constrained interfaces" across markets is unsafe, because ERCOT's and SPP's denominators are the binding subset while NYISO's is a fixed roster of 19.

**Project-count-style comparability does not exist here.** What travels across markets is the *shape* of the finding, not the magnitude: "this interface is at its limit" is comparable; "this market has N MW of headroom" is not.

---

## 12. Candidate V1 metrics

| Metric | Verdict |
|---|---|
| Interface headroom MW (per interface, per direction, per interval) | **Market-specific, defensible** — NYISO |
| Interface utilization % (direction-matched) | **Market-specific, defensible** — NYISO |
| Hours at zero headroom / at limit | **Market-specific, defensible** — NYISO (Neptune shows the case) |
| Constraint margin MW when binding | **Market-specific, defensible** — ERCOT |
| Binding constraint count | **Subset-only** — ERCOT, SPP, MISO; denominators differ, never cross-market |
| Median / p10 interface headroom | **Subset-only** — NYISO only, and only over its fixed roster |
| Headroom history | **Defensible** — NYISO from ~2006–2010 forward, ERCOT forward-only |
| Available Transfer Capability | **Market-specific, and must not be called headroom** — CAISO |
| Import / export headroom | **Market-specific** — NYISO `SCH -` ties only |
| Planning transfer margin | **Not defensible** — no planning source retrieved |
| Cross-market headroom MW | **Not defensible** — §11 |
| Constrained-interface count across markets | **Not defensible** — incompatible denominators |

---

## 13. Boundaries against the existing products

**`queue MW ≠ transmission headroom`.** Interconnection Queue measures requests to connect and how often they complete. Headroom measures the network's distance to an enforced limit. Queue MW is a request, not a flow, and is not located on any monitored element. The two may later be *joined analytically* — "which interfaces are near their limit in regions with large queues" is a legitimate question — but queue MW can never define, derive, or substitute for available transmission capacity.

**`deliverable capacity ≠ transmission headroom`.** Power Delivery relates capacity and load under its own methodology and its own approved identities. Headroom is a source-native network measurement. They share no numerator and no denominator.

Both invariants should be enforced the way the queue enforced its own: as database constraints and tests, not as prose.

---

## 14. Recommended TH-2

**Markets: NYISO and ERCOT. Two, not seven.**

NYISO because it is the only source that publishes flow and a directional limit together as a standing series, with no auth, a stable schema since 2010, a numeric Point ID, and roughly two decades of monthly archives. It can support a real historical product on day one.

ERCOT because it publishes genuine limit/flow pairs with explicit contingency naming and a clean source-backed binding indicator, and because the IQ-3 ERCOT MIS reader already solves its listing idiom.

Not CAISO — its public data is capability, not headroom, and publishing ATC as headroom is the single most likely way to get this product wrong. Not SPP or MISO — no flow. Not PJM or ISO-NE — no artifact could be retrieved and, for PJM, the rights signal is adverse.

**Scope I would give TH-2:**

1. Canonical foundation: `transmission_interface` and `transmission_element` as separate entities, identity by source-native ID (`Point ID`, `ConstraintID`), never by name.
2. A `transmission_limit_observation` and a `transmission_flow_observation`, joined into a derived margin only where both exist for the same element, direction, contingency and interval.
3. **Sentinel handling as a first-class rule**: ±9999 is `unmonitored`, never a limit. Enforce in the database.
4. Signed headroom with no floor.
5. `limit_field_used` recorded on every derived row.
6. NYISO ingestion, current + monthly archive backfill, with the 2005-era convention detected and either excluded or handled as a separate schema.
7. ERCOT ingestion of NP6-86-CD, forward-only, labelled explicitly as the binding subset.
8. No frontend, no public API, no cross-market metric.

Rights review for the NYISO MIS interface and the ERCOT MIS interface must be completed and recorded **before** TH-2 ingestion, not alongside it.

---

## 15. Unresolved questions

1. **Where exactly does NYISO's usable limit history begin?** Between 2006 and 2010. Needs bisection.
2. **CAISO's constraint-level reports** — `ATL_CNSTR`, `ATL_ATC`, `ATL_TTC`, `ATL_BRANCH_LIMIT` exist but were not parameterised. A correct parameter set might move CAISO from C to B.
3. **PJM Data Miner 2 terms** — the redistribution prohibition is reported but unverified at source. Must be read first-hand.
4. **ISO-NE Web Services** — account terms unreviewed; data shape unknown.
5. **SPP Marketplace rights** — needs an independent determination; the queue's SPP block does not transfer.
6. **ERCOT `CCTStatus`** — vocabulary unknown; `NONCOMP` on all observed rows.
7. **NYISO dead ties** — how should SCH - HQ_CEDARS (limit 49, flow 0 all day) be represented? Arithmetic headroom exists; the tie does not appear to be in service.
8. **No planning source was investigated in any market.** Planning headroom remains entirely unexamined.
9. **Map compatibility** — see below; no coordinates were found in any retrieved artifact.

## 16. Map compatibility

No retrieved artifact carried coordinates. The best geographic anchors observed:

- **ERCOT**: `FromStation` / `ToStation` names plus `FromStationkV` / `ToStationkV` — substation endpoints by name, not location.
- **SPP**: `Monitored Facility` and `Contingent Facility` as free text (`LN MARSHAL3 - KNOB`), plus a `State` column and `NERCID`. SPP separately operates an ArcGIS service (`pricecontourmap.spp.org/arcgis/rest/services/MarketMaps/RTBM_FeatureData/MapServer`) exposing hub and interface features — unexamined, but the most promising geographic lead found.
- **MISO**: branch names with from/to control areas.
- **NYISO**: interface names only — no endpoints, no coordinates.

Future geographic linking is **plausible but not free**: it would require resolving substation names to locations, which is the same class of problem the map phase solved for facilities, with the same risk of name-similarity false matches. **Do not attempt it in TH-2.**
