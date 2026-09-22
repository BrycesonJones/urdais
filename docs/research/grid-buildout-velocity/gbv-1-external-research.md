# Urdais Grid Buildout Velocity — GBV-1 External Research

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It writes no ingestion code, designs no UI, ingests no production data, and does not compute a velocity metric. It establishes no legal right.

**Research assessment versus Urdais product policy.** Rights classifications below are the research assessment. Urdais product policy may separately permit public display of sources classified `ambiguous_requires_legal_review` under founder-accepted legal risk, while preserving the original classification, attribution, and unresolved issue in provenance. Sources classified `unsuitable_without_permission` remain blocked from public publication unless explicit permission is obtained. That policy layer does not change any classification in this document.

**Scope.** Whether a defensible, source-backed product can measure how quickly **major transmission infrastructure** in the seven organised U.S. wholesale markets (ERCOT, PJM, MISO, SPP, CAISO, NYISO, ISO-NE) moves from planned/approved status into construction and operation.

**Intended concept (product, not a source term).** How fast the physical transmission system is being built or completed. It is **not** generation waiting in queue, operational transfer margin, or whether future demand exceeds approved capacity.

**Research date.** Sources were inspected on 22 September 2026.

A machine-readable copy is in `docs/research/grid-buildout-velocity/gbv-1-source-matrix.json`.

---

## 0. Evidence standard

- **[verified]** — quoted from a primary page or PDF extracted and read in this pass.
- **[retrieved]** — obtained by fetching a primary page or from a search extraction of a primary page.
- **[inferred]** — my reading of how sources interact. **Never treated as a right.**
- **[proposed]** — a Urdais methodology mapping. Not a source fact.

This pass did **not** parse every cell of the latest ERCOT TPIT workbook, SPP QPT appendices, MISO Appendix A workbooks, CAISO TDF XLSX files, or ISO-NE project-list spreadsheets. Field presence is recorded when a primary rule, presentation, or page names the field. Where only a GIS mirror or a prior-year restatement was read, that is marked.

---

## A. Executive conclusion

**A seven-market headline velocity metric is not defensible.** The markets do not publish the same lifecycle states, inclusion thresholds, quantity units, or timing conventions. Several of the structurally strongest trackers (MISO MTEP Portal, SPP Quarterly Project Tracking) are `unsuitable_without_permission` for public commercial display.

**A smaller, market-specific V1 is defensible.** The strongest public-ready pair is **ERCOT TPIT** (completed / future / cancelled sections; projected and, by older Planning Guide language and GIS mirrors, actual in-service dates) and **CAISO Transmission Development Forum TPP workbooks** (original ISD at Board approval, revised ISD, construction start, native status, cancellation / on-hold). ISO-NE’s RSP Project List is the next-best structured public list, but ISO-NE copyright is `ambiguous_requires_legal_review`. PJM has a live Project Status & Cost Allocation page and TEAC/FERC filings; the public planning chart was marked stale on the day of inspection, and the page did not yield a machine-readable dump in this pass.

**NYISO does not publish a portfolio tracker comparable to the other six.** What exists is a small set of named backbone projects (CHPE, Propel NY, Local Transmission Plan substations) plus quarterly Public Policy developer reports that are submitted to NYISO and are not, on the evidence of this pass, a public project-level time series.

**Federal sources do not replace ISO trackers.** EIA-411 transmission-addition tables were discontinued. FERC-730 covers only incentive-rate projects ≥ $20 million. NERC’s Electricity Supply & Demand “2025 Transmission Projects” file has original vs expected in-service dates and delay comments **[retrieved, NERC ESD field list]**, but NERC materials remain `unsuitable_without_permission` (PD-1).

**Generator-interconnection network upgrades must be excluded from GBV.** Every market mixes them into transmission tracking (CAISO GIP workbook, MISO GIP, SPP GI NTCs, ISO-NE Part 2, ERCOT Tier 4 generator-tie work). Those rows belong to Interconnection Queue, not Grid Buildout Velocity.

---

## B. Market-by-market source matrix

Rights classes are the research assessment. `Public status` is whether the *research* supports public display of the proposed V1 input, before the founder-risk overlay for `ambiguous_*` sources.

### ERCOT

| Field | Value |
| --- | --- |
| Best source | Transmission Project and Information Tracking (TPIT) |
| Publisher | ERCOT |
| URL | https://www.ercot.com/gridinfo/planning and https://www.ercot.com/gridinfo/sysplan |
| Latest vintage seen | 17 July 2026 XLSX (547.1 KB) plus “Archived Transmission Project and Information Tracking” ZIP (18.8 MB) **[verified]** |
| Access | Public download; no login |
| Format | XLSX current; ZIP archive |
| Cadence | Planning Guide §6.4.2(3): **triannual** **[verified]** |
| Machine-readable | Yes (XLSX). Cell schema not parsed in this pass |
| Auth | None for the public report. SSWG TPIT procedures are MIS Secure **[verified, Planning Guide transparency table]** |
| Supporting sources | Regional Transmission Plan; RPG meeting decks; PUCT CCN dockets; TAMU/NRI planned-transmission GIS (third-party host of ERCOT-like fields) |
| Rights | `reusable_with_attribution_or_conditions` (PD-1 ERCOT.com public raw data) |
| Public status | Publish with attribution |
| Major caveat | RPG-incomplete, beyond-SSWG-horizon, RAS-only, in-kind replacement, and minor impedance-only jobs **may be excluded** **[verified, Planning Guide §6.4.1(2)]**. That systematically drops early “proposed” and like-for-like rebuilds. |

Planning Guide §6.4.5 requires sections for field definitions, **future**, **completed**, **cancelled**, RTP-approved, TSP contacts, and **a cost summary** **[verified]**. An older Planning Guide extract (Nov 2020) required TSP-supplied **project status ∈ {Conceptual, Planned, Under Construction}**, **Projected In-Service Date**, and **Actual In-Service Date** **[retrieved, Scribd copy of §6.4]**. The 1 June 2026 Planning Guide still mandates the completed/cancelled/future sections; it points field-level detail to the SSWG Procedure Manual, which was **not retrieved** in this pass. July 2026 RPG decks quote TPIT number, name, tier, project ISD, county, and TSP **[verified]**. The TAMU GIS layer exposes `projectnum`, voltage class, `transmissionowner`, `inservicedate` (aliased Projected In-Service Date), `rpgnum`, status coded Conceptual / Planned / Under Construction, and `miles` **[retrieved]**. Treat the GIS as a **mirror, not the authority**.

### PJM

| Field | Value |
| --- | --- |
| Best source | Project Status & Cost Allocation page, plus TEAC Board white papers and FERC Schedule 12 filings |
| Publisher | PJM |
| URL | https://www.pjm.com/planning/project-construction (retired construct-status page redirects here) **[retrieved]** |
| Supporting | https://pjm.com/planning ; TEAC e.g. https://www.pjm.com/-/media/DotCom/committees-groups/committees/teac/2026/20260707/20260707-pjm-board-whitepaper.pdf |
| Access | Public web UI; JS-rendered. This pass’s fetch of the project-construction page timed out / returned chrome only |
| Format | Interactive page; historical XLS mentioned in a 2020 pjm.com roadmap **[retrieved]**; TEAC/FERC PDFs |
| Cadence | Continuous page; Board/TEAC cycles; FERC filings within 30 days of Board approval **[verified, TEAC white paper]** |
| Machine-readable | **Not confirmed in this pass.** Planning-page “Transmission Under Construction” chart carried a **stale-data** banner **[verified]** |
| Auth | None for the public page. Planning Center TO Planner / TC Planner are member tools |
| Rights | pjm.com `ambiguous_requires_legal_review`. Data Miner `unsuitable_without_permission`. **Do not ingest GBV via Data Miner.** |
| Public status | Internal ingest; public only under founder-risk overlay |
| Major caveat | Baseline vs supplemental vs Immediate-Need are different approval regimes. Supplemental costs “are not PJM Board approved” **[verified, planning page]**. Queue/cycle interconnection upgrades are a separate product. |

A 2020 pjm.com roadmap listed desired/missing XLS columns including Expected rating, Percent Complete, Initial TEAC, Latest TEAC, ISA In-Service, **Revised In Service**, **Projected In Service**, Last Updated **[retrieved]**. That is a product-feedback list, **not** a 2026 field dictionary. TEAC/FERC 2026 filings do publish upgrade ID (e.g. `b4089.1`), description, **miles in the narrative**, estimated cost, construction responsibility, required in-service date, and cost allocation **[verified]**.

### MISO

| Field | Value |
| --- | --- |
| Best source | MTEP Portal Appendix A Status Report / In-Service Projects; annual MTEP report + Appendix A |
| Publisher | MISO |
| URL | https://www.misoenergy.org/planning/transmission-planning/mtep/ |
| Portal access | MISO Help Center login, **not** the website PROFILE login **[retrieved, KA-01366]** |
| Public files | MTEP25 Report ZIP; quarterly updates “in the Documents section” of the MTEP page **[verified]**; System Planning Committee Prior MTEP Status Report (e.g. 9 Dec 2025) **[retrieved]** |
| Cadence | Board approval each December; TO quarterly updates in the Portal **[verified]** |
| Machine-readable | Portal reports yes (login). Annual Appendix A workbooks historically XLS. Portal not opened in this pass |
| Auth | Help Center account for Portal; CEII/NDA for maps/FTP |
| Rights | `unsuitable_without_permission` (MISO website ToU; PD-1) |
| Public status | **Blocked public** |
| Major caveat | Appendix A includes **Generator Interconnection Projects**. MTEP25: 432 projects, 1,901 transmission miles **[verified]**. LRTP Tranches dominate cost/miles and are not comparable to local BRP/Other jobs. |

Native planning states on the public page: projects under evaluation; Appendix A (Board-approved, quarterly construction status / estimated ISD / estimated cost until in service); In-Service Projects from all MTEP cycles; variance analysis for cost/schedule **[verified]**. Older MTEP language: Appendix B = need documented, not ready for execution; Appendix A = Board-approved to proceed with permitting and construction **[retrieved, MTEP14 restatement]**.

### SPP

| Field | Value |
| --- | --- |
| Best source | Quarterly Project Tracking (QPT) + Notification to Construct (NTC) letters |
| Publisher | SPP |
| URL | https://www.spp.org/engineering/project-tracking-ntcs/ |
| Library | https://www.spp.org/spp-documents-filings/?id=18641 — QPT reports from 2010 through **3Q 2026 (5 Aug 2026)** **[verified]** |
| Access | Public PDF/XLS appendices; no login observed |
| Format | Quarterly report + Appendix 1 & 2 |
| Cadence | Quarterly TO poll **[verified]** |
| Machine-readable | Appendices are file downloads (size implies XLS/PDF). Cell schema not parsed in this pass |
| Auth | None for the public QPT library |
| Rights | `unsuitable_without_permission` for commercial publication (PD-1 SPP Portal / commercial-authorisation rule). Treat spp.org QPT the same until legal says otherwise. |
| Public status | **Blocked public** |
| Major caveat | QPT covers STEP, Aggregate Study, **and TO-planned** projects, and the NTC folders include **Generation Interconnection** NTCs **[verified]**. Closed Out upgrades “are reported as Closed Out for one quarter and then **removed from the active portfolio**” **[retrieved, 2023 STEP restatement]**. Longitudinal tracking **requires retaining every quarterly file**. |

Published field definitions on the tracking page **[verified]**: `NTC_ID`, `PID`, `UID` (upgrade; many per project), Area, Project Name, **Project Owner Indicated In-Service Date**, **RTO Determined Need Date**, **NTC issue date**, cost estimate, final cost, project lead time, status comments.

Native STEP/QPT statuses **[retrieved, 2023 STEP]**: Closed Out; Complete; Delay – Mitigation; Delay (behind schedule); Identified; In Service; NTC-C Project Estimate Window; NTC Commitment Window; On Schedule < 4; On Schedule > 4; Re-evaluation; RFP Issued; Suspended.

ITP issues NTCs inside the four-year commitment horizon and ATPs beyond it **[retrieved, SPP ITP page]**. ATP-only projects are not yet construction-authorized in the same sense as an NTC.

### CAISO

| Field | Value |
| --- | --- |
| Best source | Transmission Development Forum **Approved Projects – Transmission Planning Process** workbook |
| Publisher | CAISO, with CPUC |
| URL | https://www.caiso.com/library/transmission-development-forum ; Jul 2026 meeting https://www.caiso.com/library/transmission-development-forum-jul-29-2026-900-am |
| Latest vintage | TPP workbook and GIP workbook posted 3 Aug 2026 **[verified]** |
| Access | Public |
| Format | XLSX workbooks + PTO PDFs |
| Cadence | Semiannual (January and July). Next forum 27 January 2027. Was quarterly; moving to two per year to align with CPUC TPR **[verified, 29 Jul 2026 agenda]** |
| Machine-readable | Yes (XLSX). Workbook cells not parsed in this pass; PTO PDFs were |
| Auth | None |
| Rights | CAISO website `reusable_with_attribution_or_conditions`. CPUC TPR public spreadsheets likely similar; **NDA slices are out of scope**. |
| Public status | TPP workbook publishable with credit. **Do not use the GIP “Network Upgrades” workbook as GBV.** |
| Major caveat | Agenda: forum **“Will not include cost information”** **[verified]**. GIP workbook is interconnection-triggered (executed LGIA) **[verified]**. |

SCE July 2026 TDF columns **[verified]**: Project; Transmission Plan Approved; ISD at Approval in Transmission Plan; Expected ISD Jan 2026 TDF; Current Expected ISD; Project Status; CPUC Permit Filing; Construction Start; Reason for ISD Change. Native statuses observed: Engineering, Construction, Construction Complete, Initiation, On Hold, Design, Closeout, Exempt (permit).

PG&E July 2026 TDF columns **[verified]**: Project No. (e.g. `2223-R-08`); Transmission Plan Approved; ISD at TPP Approval; Previous TDF Report Dated; Planned In-Service; Comments (`In-service`, `Cancelled`, `On Hold`, delays, improvements). Construction-start is on the SCE tables; not on the PG&E slides extracted here.

Supporting: Board-approved 2025–2026 Transmission Plan (19 May 2026); CPUC Transmission Project Review Process (Res. E-5252) — PG&E / SCE / SDG&E public project spreadsheets twice a year, plus NDA confidential sets **[verified, CPUC TPR page]**. TPR is useful cost/history context; it is IOU-only and not a CAISO-wide in-service census.

### NYISO

| Field | Value |
| --- | --- |
| Best source | No single public portfolio tracker. Closest: CRP “Planned Transmission”; Comprehensive Area Transmission Review tables; Local Transmission Plans; Public Policy selection reports |
| Publisher | NYISO; NYPSC (Article VII); TOs |
| URLs | https://www.nyiso.com/documents/20142/2248481/2025-2034-Comprehensive-Reliability-Plan.pdf ; Public Policy Process / PPTPP Manual; NYSRC planning-status attachments |
| Access | Public PDFs |
| Format | PDF. Developer quarterly status reports are **submitted to NYISO**, not shown as a public workbook in this pass **[verified, PPTPP Manual §10]** |
| Cadence | CRP biennial-ish; STAR quarterly; LTP annual; PPTP quarterly internally |
| Machine-readable | No |
| Auth | None for the PDFs |
| Rights | `ambiguous_requires_legal_review` |
| Public status | Named-project watchlist only; not a velocity product |
| Major caveat | CRP listed Smart Path Connect (Dec 2025), CHPE (May / spring 2026), Propel NY T051 (May 2030) **[verified]**. That is three projects, not a buildout census. Article VII / PSC orders give approval dates for a handful of lines. |

PPTPP Manual: after selection the Developer files a quarterly Project Status Report (milestones, site control, permits, procurement, financing). NYISO “will maintain a list … of all Developers who have accepted the terms and conditions of an Article VII certificate” **[verified]**. That is a permit-acceptance list, not an in-service time series.

### ISO-NE

| Field | Value |
| --- | --- |
| Best sources | RSP Project List; Asset Condition List |
| Publisher | ISO New England |
| URL | https://www.iso-ne.com/system-planning/system-plans-studies/rsp/rsp-project-list-and-the-asset-condition-list |
| Latest vintage | June 2026 PAC update (23 Jun 2026) **[verified]** |
| Access | Public XLS + presentation, 3× per year (typically March, June, October) **[verified]** |
| Format | Spreadsheet + PDF. Presentation extracted; XLS cells not parsed |
| Machine-readable | Yes |
| Auth | None |
| Rights | `ambiguous_requires_legal_review` |
| Public status | Internal ingest; public only under founder-risk overlay |
| Major caveat | **Part 2 = Generator Interconnection Upgrades** — exclude from GBV. Asset Condition List (since March 2016) is TO-identified replacement/refurbishment; ISO-NE “does not determine the need” **[verified]**. Mixing Asset Condition into “new build” inflates velocity with rebuilds. |

Native RSP statuses **[verified, June 2026 appendix]**: In Service; Under Construction; Planned; Proposed; Cancelled. (`Concept` removed after FERC accepted Tariff changes 10 Dec 2019.)

Published columns **[verified]**: Project ID; Primary / Other Equipment Owner; Projected Month/Year of In-Service; Major Project; description; Status; **PPA / I.3.9 approval date** (or `no` / `NR`); **TCA approval date**; Estimated Costs (PTF) with stated accuracy bands.

June 2026 RSP highlight: one reliability upgrade in service since March ($0.8M breaker at Millbury); no new and no cancelled RSP projects. Asset Condition: 7 in-service totaling $362.1M, 9 new totaling $303.3M **[verified]**. Those two series are not the same product.

---

## C. Lifecycle-state matrix

Preserve native terms. Do not collapse them in storage.

| Native state | ERCOT | PJM | MISO | SPP | CAISO | NYISO | ISO-NE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Proposed / identified / conceptual | Conceptual (older PG); RTP-identified but maybe excluded until SSWG | TEAC recommended, pre-Board | Under evaluation; Appendix B | Identified; RFP Issued | Initiation / Design; TPP cycle before Board | PPTN solicitation; LTP “assumed” | Proposed |
| Planned / recommended | Planned; RTP section | Board-recommended / approved RTEP | — | On Schedule <4 / >4 | Transmission Plan Approved | CRP “planned transmission” | Planned (I.3.9 if required) |
| Approved / authorized | RPG complete (else excluded from TPIT); PUCT CCN where required | Board-approved baseline; supplemental is TO | Appendix A Board approval | NTC / NTC-C issued; 90-day commitment window | ISO Board TPP approval; CPUC permit filing date | Board selection; Article VII; Development Agreement | PPA date; TCA date |
| Development / permitting | Not a TPIT enum | Not confirmed on the JS page | Regulatory-approval narrative on LRTP dashboards | NTC-C estimate window; status comments | CPUC Permit Filing; Engineering / Design | PPTP quarterly (internal) | Planned after I.3.9, before UC |
| Under construction | Under Construction | “Transmission Under Construction” chart (stale on inspection day) | Construction status in Appendix A Status Report | Implied by comments / In Service vs Complete split | Construction; Construction Start date | Not a portfolio field | Under Construction |
| Completed / in service | Completed section; Actual ISD (older PG) | In-service / projected / revised dates (roadmap; TEAC required ISD) | MTEP In-Service Projects | In Service; Complete; Closed Out | In-service comment; Construction Complete; Closeout | CRP/ATR “Y/In-Service” | In Service (since last update in the highlight tables) |
| Cancelled | Cancelled section | Project Cancellations on planning page | Variance / dropped (not fully mapped this pass) | NTC withdrawn (STEP tables) | Cancelled in TPP | Withdrawn deactivation ≠ tx cancel | Cancelled |
| Suspended / delayed / on hold | Not a required enum | Scope/cost change | Variance analysis | Delay – Mitigation; Suspended; Re-evaluation | On Hold; Reason for ISD Change | STAR monitors slip of named projects | Not a status; slip appears as revised projected ISD |

**Not published as a portfolio enum in this pass:** a uniform “permitting” state (except CAISO permit-filing date); PJM percent-complete as a confirmed 2026 column; NYISO construction-start.

---

## D. Date-field matrix

| Date | ERCOT | PJM | MISO | SPP | CAISO | NYISO | ISO-NE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Announcement / first listing | TPIT number assigned when entered in Future **[verified]** | Initial TEAC (roadmap only) | MTEP cycle year | Identified / NTC issue | Transmission Plan Approved year | Board selection / PSC order date | First appearance on a dated list |
| Approval date | RPG completion (not a mandated TPIT column in 2026 PG text); PUCT CCN in dockets | Board approval date via TEAC/FERC | Board December / out-of-cycle | **NTC issue date** **[verified]** | **Transmission Plan Approved** **[verified]** | Board / PSC / Dev. Agreement | **PPA date**; **TCA date** **[verified]** |
| Construction start | **Not in Planning Guide §6.4.5 list** | **Not confirmed** | **Not named** on the public MTEP page | **Not named** on the definitions list | **Yes — Construction Start** (SCE tables) **[verified]** | **Not a portfolio field** | **Not a list column** |
| Target / required ISD | Projected ISD **[retrieved / RPG]** | Required Upgrade In-Service Date (TEAC/FERC) **[verified]** | Estimated in-service **[verified]** | **RTO Need Date** **[verified]** | **ISD at TPP Approval** **[verified]** | Required Project In-Service Date (PPTP) **[verified]** | Projected Month/Year **[verified]** |
| Revised target ISD | New projected ISD in the next TPIT vintage | Revised / Projected In Service (roadmap); page not confirmed | Quarterly estimated ISD update | **Owner Indicated ISD** vs Need Date **[verified]** | Previous TDF ISD and Current Expected ISD **[verified]** | STAR/CRP date changes for named projects | New projected month/year each list |
| Actual in-service | Required in older PG; Completed section exists **[verified]** | Not confirmed as a distinct “actual” vs projected on the public page | In-Service Projects list | Complete / In Service / Closed Out; owner final cost after books close | PTO “In-service” comments with calendar dates **[verified]** | ATR “Y/In-Service”; press/CRP | Status = In Service; highlight tables name the interval since last list |
| Precision | Month-year in RPG tables | Day in some FERC rows (e.g. 10/14/2027) **[verified]** | Often year or month | Date fields defined; precision not parsed | Day-level on PG&E slides **[verified]** | Season/month | Month/year **[verified]** |

**A real completion-velocity metric (approval → actual energization) is possible only where both an approval date and an actual in-service date exist on the same project ID.** That is source-backed today for **CAISO TPP** and **ISO-NE RSP (PPA → In Service)**, and structurally for **SPP (NTC issue → Complete)** if the quarterly files are retained. ERCOT can support **projected/actual ISD** and **completed-per-vintage** counts; an approval-to-service median is **not** source-backed until RPG/CCN dates are joined from other dockets. NYISO can do this only for a handful of named projects. PJM can do it from TEAC/FERC required dates **plus** a confirmed actual-in-service field — the latter was **not confirmed** on the live page in this pass.

---

## E. Quantity-field matrix

| Quantity | ERCOT | PJM | MISO | SPP | CAISO TDF | NYISO | ISO-NE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Line / circuit miles | GIS `miles`; RPG narratives. **XLSX not confirmed** | Narrative miles in some TEAC items; not a confirmed census field | MTEP reports circuit-miles (MTEP25 1,901 mi; MTEP24 ~6,230 planned circuit-mi) **[verified / retrieved]** | Not on the definitions list | Occasional in comments (e.g. ~3 mi, 23.63 mi). **Not a workbook-wide field in the slides** | Named-project descriptions | Not in the June 2026 column list |
| Voltage class | Yes (tiers / kV in RPG and GIS) | Filter-by-voltage on the page **[retrieved]** | Yes in Appendix A / report tables | Area / upgrade descriptions (not parsed) | In project names | In CRP/LTP text | In project names; not a dedicated column in the appendix |
| Project cost | Cost **summary** section required **[verified]** | Estimated upgrade cost **[verified]** | Estimated cost until in service **[verified]** | Cost estimate + **final cost** **[verified]** | **Explicitly excluded** **[verified]** | Selected-project reports; not a portfolio | Estimated PTF $; in-service $ in highlights **[verified]** |
| MW transfer / rating | Not a TPIT-mandated field | Expected rating listed as a *missing* XLS field in 2020 **[retrieved]** | Not the MTEP status headline | Not on the definitions list | Queue MW only on **GIP** tables (IQ, not GBV) | CHPE 1,250 MW is a facility rating, not a census | Not a list column |
| Substations / transformers | In project names / tiers | In descriptions | In Appendix A facility rows | Upgrade-level UID | In names | LTP substations | In descriptions |
| Circuit count | Not confirmed | Not confirmed | Not confirmed | UID ≈ upgrade/circuit grain | Not confirmed | Not confirmed | Subprojects under Major Project |

**These fields are not comparable across markets.** A CAISO TPP “project” can be a breaker addition or a 500 kV line. An ISO-NE Asset Condition row can be CIP-014 fencing. An SPP UID is an upgrade, not a project. MISO “1,901 miles” mixes new corridor and rebuild. **Do not invent a common unit.** If V1 needs a scale measure, publish **market-native** counts and, where the same file has it, miles or dollars — never a seven-market “GW of transfer.”

---

## F. Project identity and longitudinal tracking

| Market | Stable ID? | Name / sponsor / TO | Geography / endpoints | Status history | Structural verdict |
| --- | --- | --- | --- | --- | --- |
| ERCOT | TPIT number assigned by ERCOT **[verified]**; RPG number (e.g. `26RPG017`) is a different key | Name + TSP in RPG/TPIT | County in RPG tables | Requires the archive ZIP + completed/cancelled tabs. Current file is a status snapshot plus completed/cancelled sections | **Yes, if every triannual file is kept.** Renames possible; join TPIT# not name |
| PJM | Upgrade IDs (`b4089.1`) **[verified]** | TO / construction responsibility | Zone / state filters | Page is current-state; TEAC PDFs are event vintages. Related-projects links exist **[retrieved]** | **Partially.** Possible if page exports and TEAC filings are snapshotted. Splits (`.1` / `.2`) are native |
| MISO | MTEP project number (e.g. 16145) **[retrieved]** | TO, state | Subregion / LRZ in reports | Portal “historical and most current” **[verified]** | **Yes inside the Portal.** Public ZIP vintages also exist. Login-gated |
| SPP | `PID` + `UID` + `NTC_ID` **[verified]** | Project owner / DTO | Area number | Closed Out **dropped after one quarter** **[retrieved]** | **Yes only with a complete quarterly archive.** UID splits are native |
| CAISO | TPP Project No. (`2223-R-08`) **[verified]** | PTO | PTO / area | Prior TDF ISD columns + comment trail. Library holds forums back to 2022 **[verified]** | **Yes for TPP IDs** across TDF vintages. Rescopes and “new Original ISD” occur **[verified, South Bay]** |
| NYISO | Queue # used even for transmission (Q631 CHPE, Q1289 Propel) **[retrieved, ATR]**; PPTP project codes (T051) | Developer / designated entity | Zone / locality | No public status history table | **Named projects only.** Do not claim portfolio identity |
| ISO-NE | Project ID generated by System Planning **[verified]** | Primary Equipment Owner | State in the name | 3×/year lists; In Service highlight = since last update, not a forever IS tab | **Yes if every list vintage is kept.** Part numbers do **not** change when a project goes IS or Cancelled **[verified]** |

**Corrections.** ERCOT SSWG/TPIT is TSP-updated; CAISO posts “replacing document” workbooks **[verified]**; ISO-NE takes a PAC comment period then posts finals **[verified]**. In-place revision means **snapshots are mandatory** (same lesson as IQ-1).

---

## G. Candidate metric assessment

| Metric | Verdict | Why |
| --- | --- | --- |
| Projects entering service per year | **Defensible** in ERCOT (completed section), ISO-NE (IS since last list, annualised with 3 vintages), CAISO TPP (in-service comments), and internally in SPP/MISO | Unit is a native project/upgrade. **Not comparable across markets** (inclusion thresholds differ). Exclude GI rows. |
| Line miles entering service per year | **Partially defensible** in MISO (report circuit-miles) and possibly ERCOT if the TPIT/GIS mile field is complete | CAISO TDF and ISO-NE lists do not publish a complete mile column. Rebuild vs greenfield is often mixed. |
| Project cost entering service per year | **Partially defensible** in ISO-NE (explicit), SPP (final cost), MISO (estimated/current), PJM (estimated) | CAISO TDF **forbids cost**. ERCOT has a summary, not confirmed project-level. Nominal $ across decades is not a physical velocity. |
| Median approval-to-service time | **Partially defensible** in CAISO (TPP approval year/cycle → actual/current ISD) and ISO-NE (PPA date → IS). **Structurally** in SPP (NTC issue → Complete) | ERCOT lacks a mandated approval-date column. PJM actual-IS not confirmed. NYISO n is too small. |
| Median construction-to-service time | **Partially defensible in CAISO only** (Construction Start published) | Not a published field in ERCOT PG, SPP definitions, ISO-NE columns, NYISO portfolio, or MISO public page. |
| Share of planned projects completed on time | **Partially defensible** in CAISO (ISD at approval vs current/actual) and SPP (Need Date vs owner ISD) | “On time” vs **need date** is not the same as vs **original expected ISD**. ISO-NE has no frozen original ISD column in the appendix — only the current projected month/year. |
| Delay distribution | **Partially defensible** in CAISO (reason codes + prior vs current ISD) and SPP (Delay statuses + comments) | Others require vintage-to-vintage projected-ISD diffs (possible if we snapshot). |
| Completion rate by cohort | **Partially defensible** where archives exist (ERCOT ZIP, SPP QPT back to 2010, CAISO TDF library, ISO-NE 3×/year) | Needs a frozen “entered planned/approved in year Y” rule. SPP Closed Out drop and ERCOT RPG exclusion bias the denominator. |
| Active construction backlog | **Partially defensible** as a count of native UC / Under Construction / Construction | CAISO and ISO-NE yes. ERCOT yes if status enum is in the XLSX. PJM chart was stale. Not a MW backlog. |
| Annual net additions by voltage class | **Not defensible** as a seven-market series; **partial** inside MISO/ERCOT if voltage and miles/counts are complete | Voltage lives in names more often than in a clean field. Net vs gross (rebuilds) is unpublished. |

No metric that needs **MW transfer capability** is defensible from these trackers.

---

## H. Cross-market comparability

| Test | Result |
| --- | --- |
| Lifecycle definitions | Fail. “Planned” in ISO-NE means I.3.9 (if required). “Planned” in ERCOT is a TSP status. SPP “On Schedule < 4” is relative to Need Date, not construction. |
| Inclusion thresholds | Fail. ERCOT ≥60 kV Tier 1–4, excluding in-kind replacement and incomplete RPG. ISO-NE splits reliability vs asset condition. MISO Appendix A includes GIP, EPR, MVP, Other. CAISO TDF TPP = Board-approved only. NYISO public set ≈ handful of backbone projects. |
| Project scale | Fail. Breaker vs 765 kV vs CIP-014 fence. |
| Timing conventions | Fail. Jun–May vs calendar vs capability year vs “since last quarterly list.” Required Need Date ≠ owner ISD ≠ TPP-at-approval ISD. |
| Publication cadence | Fail. Continuous (PJM), quarterly (SPP, MISO portal), triannual (ERCOT), 3×/year (ISO-NE), 2×/year (CAISO), biennial/ad hoc (NYISO CRP). |
| Granularity | Fail. SPP UID vs PID; PJM b-number splits; ISO-NE Major Project vs component; CAISO Part G hold. |

**Do not publish a seven-market total.** If a later phase wants a “Urdais seven-market” chart, it would be a labelled collage of market-native series, not a sum.

---

## I. Rights classification matrix

| Source | Class | Attribution | Redistribution / commercial | Terms URL / basis |
| --- | --- | --- | --- | --- |
| ERCOT.com TPIT / RTP / RPG public files | `reusable_with_attribution_or_conditions` | Credit ERCOT; keep notices where the ToU requires | Public raw data usable in compilations, charts, analyses (PD-1) | https://www.ercot.com/help/terms |
| PJM.com Project Status / TEAC PDFs | `ambiguous_requires_legal_review` | Unresolved | Not an affirmative commercial grant | pjm.com legal/privacy |
| PJM Data Miner | `unsuitable_without_permission` | — | Redistribution of data **or derivatives** prohibited without membership licence (PD-1) | Data Miner API Guide / DLA |
| MISO website / MTEP PDFs | `unsuitable_without_permission` | — | No modify/publish/transmit/derivative (PD-1) | misoenergy.org terms |
| MISO MTEP Portal | `unsuitable_without_permission` | — | Login + website ToU | Help Center KA-01366 |
| SPP QPT / NTC / STEP | `unsuitable_without_permission` | Citation ≠ commercial licence | Commercial publication needs written authorisation (PD-1 Portal ToU; apply until legal splits spp.org vs Portal) | portal.spp.org ToU; spp.org |
| CAISO website TDF / TPP | `reusable_with_attribution_or_conditions` | Credit CAISO; keep notices | PRA-style public use (PD-1) | caiso.com legal / website terms |
| CAISO API | `ambiguous_requires_legal_review` | — | “CAISO Data” ownership clause (PD-1) | API ToU — **not needed for TDF XLSX** |
| CPUC TPR public spreadsheets | `ambiguous_requires_legal_review` | Credit CPUC / IOU | Public vs NDA sets; do not ingest NDA | https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/transmission-project-review-process |
| NYISO CRP / manuals / LTP PDFs | `ambiguous_requires_legal_review` | Unresolved | No affirmative numeric-data licence (PD-1) | nyiso.com legal notice |
| ISO-NE RSP / ACL lists | `ambiguous_requires_legal_review` | Unresolved | Copyright; non-personal duplication may violate (PD-1) | iso-ne.com terms |
| EIA (860, 411 archive, copyrights page) | `clearly_reusable` | Requested acknowledgment | Public domain (PD-1) | https://www.eia.gov/about/copyrights_reuse.cfm |
| FERC-730 / Form 1 as FERC publications | `reusable_with_attribution_or_conditions` | U.S. government work | No EIA-style reuse page (PD-1 pattern) | https://www.ferc.gov/industries-data/electric/resources/industry-forms/ferc-730-report-transmission-investment-activity |
| NERC ESD / LTRA | `unsuitable_without_permission` | — | Copyright; all rights reserved (PD-1) | nerc.com terms |
| TAMU/NRI GIS | `ambiguous_requires_legal_review` | Third-party host | Not an ERCOT primary | https://gis.nri.tamu.edu/arcgis/rest/services/Hosted/Planned_Transmission_Projects/FeatureServer/layers |

Do not relabel ambiguous material as cleared.

---

## J. Separation from adjacent Urdais products

| Product | Question it answers | GBV must not use as its numerator |
| --- | --- | --- |
| **Interconnection Queue** (IQ-1) | How much generation/storage/merchant TX is waiting, withdrawing, or reaching COD | Queue MW, GIS Report, PlanningQueues.xml, GIP/LGIA-triggered network-upgrade workbooks, SPP GI NTCs, ISO-NE Part 2, ERCOT generator-tie Tier 4 rows |
| **Transmission Headroom** (TH-1) | Signed MW of operational limit minus flow on a monitored element, now | ATC/TTC, binding-constraint shadows, EIA-930 flows, CETL/CIL |
| **Power Delivery Gap** (PD-1–4A) | Whether planning demand exceeds a chosen deliverable-capacity construct | CDR/PRMR/ICR/NQC stacks, EIA-930 load, planning peaks |

GBV answers only: **how fast is the physical transmission system being built or completed?**

Implementation rule **[proposed]**: every ingested row gets `driver_class` ∈ {regional_reliability, economic, public_policy, local_other, **generator_interconnection**, asset_condition, unknown}. V1 public metrics use the first four. GI is IQ. Asset condition is an optional labeled series, never mixed into “new build.”

---

## K. Recommended V1

Prefer a smaller defensible V1 over a broad weak one.

**Markets to include (public):** ERCOT (TPIT), CAISO (TDF **TPP workbook only**).

**Markets to include (internal; public only under founder-risk overlay):** ISO-NE RSP Project List **excluding Part 2**; PJM Project Status + TEAC/FERC vintages once an export/field dictionary is confirmed.

**Markets to defer for public product:** MISO, SPP (best structure, blocked rights). NYISO portfolio velocity.

**NYISO optional:** a named-project strip (Smart Path Connect, CHPE, Propel NY, listed LTP substations) with source dates — not a market velocity number.

**Metrics to publish (market-native, never summed):**

1. Count of projects/upgrades newly **In Service / Completed** in the vintage (ERCOT, CAISO, ISO-NE).
2. Count of **active** Planned + Under Construction (backlog), native states only.
3. CAISO-only: distribution of **current expected ISD − ISD at TPP approval**, and count On Hold / Cancelled.
4. ISO-NE-only (if published): $ of reliability projects placed in service since the prior list — labeled as **cost, not physical velocity**.

**Metrics to defer:** seven-market index; miles-weighted U.S. total; cost-weighted U.S. total; construction-start medians outside CAISO; on-time rate that mixes Need Date with original ISD; MW transfer additions; FERC-730; NERC ESD; CPUC TPR NDA; EIA-860; queue-driven upgrades.

**Unit:** **project/upgrade counts first.** Miles and dollars only as optional market-specific overlays where the same official file carries them. Multiple measures, not one fake common unit.

**Historical depth:** snapshot every official vintage going forward. Backfill: ERCOT TPIT archive ZIP; CAISO TDF library from 2022; ISO-NE lists as far as the RSP page retains; SPP QPT internally to 2010. Do not interpolate monthly points.

**Update cadence:** native only — ERCOT ~3×/year, CAISO 2×/year, ISO-NE 3×/year, PJM on observed page/TEAC change. No quarterly interpolation.

**V1 architecture [proposed]:** market-specific native methods, common semantic interface (`area`, `native_id`, `native_status`, `as_of`, `projected_isd`, `actual_isd`, `approval_date`, `quantity_native`). Same Option 2 pattern as PD-4A. Option 4 publication discipline: empty cell ≠ zero.

---

## L. Major risks and gaps

1. **GI contamination** — the fastest way to duplicate Interconnection Queue.
2. **Rebuilds counted as buildout** — ISO-NE Asset Condition, MISO Other/age-and-condition, ERCOT exclusion of in-kind vs everyone else’s inclusion.
3. **Rights** — MISO and SPP have the cleanest construction-tracking semantics and cannot be published.
4. **Stale or JS-only PJM page** — do not treat the planning-home chart as current.
5. **SPP Closed Out deletion** — lose history unless we archive.
6. **ERCOT RPG gap** — large projects missing until review completes; early pipeline understated.
7. **CAISO no cost; NYISO no portfolio.**
8. **Approval ≠ construction start ≠ energization.**
9. **Rescopes reset “original ISD”** (CAISO South Bay) — freeze first-seen ISD ourselves.
10. **Federal fallback is a trap** — EIA-411 dead; FERC-730 incomplete; NERC ESD rights-blocked.

---

## M. Exact source URLs

- ERCOT Planning: https://www.ercot.com/gridinfo/planning
- ERCOT Market Reports / TPIT: https://www.ercot.com/gridinfo/sysplan
- ERCOT Planning Guide (1 Jun 2026): https://www.ercot.com/files/docs/2026/05/29/June-1-2026-Plannng-Guide.pdf
- ERCOT terms: https://www.ercot.com/help/terms
- PJM Project Status & Cost Allocation: https://www.pjm.com/planning/project-construction
- PJM Planning: https://pjm.com/planning
- PJM TEAC Jul 2026 white paper: https://www.pjm.com/-/media/DotCom/committees-groups/committees/teac/2026/20260707/20260707-pjm-board-whitepaper.pdf
- MISO MTEP: https://www.misoenergy.org/planning/transmission-planning/mtep/
- MISO Portal access: https://help.misoenergy.org/knowledgebase/article/KA-01366/en-us
- SPP Project Tracking & NTCs: https://www.spp.org/engineering/project-tracking-ntcs/
- SPP QPT library: https://www.spp.org/spp-documents-filings/?id=18641
- SPP ITP: https://www.spp.org/engineering/transmission-planning/integrated-transmission-planning/
- CAISO TDF library: https://www.caiso.com/library/transmission-development-forum
- CAISO TDF 29 Jul 2026: https://www.caiso.com/library/transmission-development-forum-jul-29-2026-900-am
- CAISO TDF agenda: https://www.caiso.com/documents/agenda-overview-transmission-development-forum-jul-29-2026.pdf
- CAISO 2025–2026 Transmission Plan: https://www.caiso.com/documents/board-approved-2025-2026-transmission-plan.pdf
- CPUC TPR: https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/transmission-project-review-process
- NYISO 2025–2034 CRP: https://www.nyiso.com/documents/20142/2248481/2025-2034-Comprehensive-Reliability-Plan.pdf
- NYISO PPTPP Manual: https://www.nyiso.com/documents/20142/12590492/6%20PPTPP_Manual_Clean.pdf/3b82cbea-a275-2396-bbc5-3329b3510e35
- ISO-NE RSP / ACL lists: https://www.iso-ne.com/system-planning/system-plans-studies/rsp/rsp-project-list-and-the-asset-condition-list
- ISO-NE Jun 2026 PAC list update: https://www.iso-ne.com/static-assets/documents/100037/final_project_list_presentation_jun_2026.pdf
- FERC-730: https://www.ferc.gov/industries-data/electric/resources/industry-forms/ferc-730-report-transmission-investment-activity
- EIA-411 archive: https://www.eia.gov/electricity/data/eia411/
- EIA copyrights: https://www.eia.gov/about/copyrights_reuse.cfm
- NERC ESD: https://www.nerc.com/programs/reliability-assessment--performance-analysis/electricity-supply--demand

---

## N. Unresolved questions requiring follow-up (GBV-2)

1. Parse the 17 July 2026 ERCOT TPIT XLSX and confirm whether **Actual In-Service Date**, **miles**, **cost per project**, and the Conceptual/Planned/Under Construction enum are in the current file, not only in the 2020 Planning Guide / GIS mirror.
2. Retrieve the ERCOT SSWG Procedure Manual TPIT field dictionary (Planning Guide points there).
3. Confirm whether the PJM Project Status page still offers an XLS/XML export and which 2026 columns are populated (actual vs projected vs revised ISD, percent complete, cancellations).
4. Open MISO MTEP Portal (or the public quarterly Documents files) and inventory Appendix A construction-status enums and in-service date types.
5. Parse SPP 3Q 2026 QPT Appendix 1 & 2 for miles, voltage, GI vs ITP flags, and whether Closed Out rows still appear.
6. Parse CAISO Jul 2026 TPP XLSX (not just PTO PDFs) for a complete status enum and whether any mile/voltage columns exist.
7. Legal: may spp.org QPT be treated differently from the SPP Portal ToU? May MISO Appendix A ZIPs be displayed internally only?
8. Does NYISO post any public PPTP quarterly status workbooks, or only the Attachment D submissions?
9. How far back do ISO-NE RSP XLS files remain on the list page?
10. PUCT CCN / state siting join: is there a stable ID back to TPIT / RTEP / MTEP numbers?
11. Should Asset Condition (ISO-NE) and MISO “age and condition” be a **second product series** (“grid replacement velocity”) rather than GBV V1?

No code, no UI, no ingest, and no velocity number is computed in this pass.
