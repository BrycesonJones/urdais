# Urdais Power Delivery — PD-3 Research: Long-Horizon Planning Demand

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It writes no ingestion code, designs no UI, and selects no deliverable-capacity methodology. It establishes no legal right.

**Research assessment versus Urdais product policy.** The `public_display_status` values in this document, and in the machine-readable matrix beside it, reflect the research and legal assessment only. Urdais product policy may separately permit public display of sources classified `ambiguous_requires_legal_review` under founder-accepted legal risk, while preserving the original rights classification, attribution requirements, and unresolved issue in provenance. Sources classified `unsuitable_without_permission` remain blocked unless explicit permission is obtained. See `docs/operations/power-delivery-pd3-planning-foundation.md`. This note explains that the two are separate layers; it changes no finding, no rights classification, and no `public_display_status` value in this document.

**Scope.** Official long-horizon planning demand forecasts for the seven PD-2 physical-grid markets (ERCOT, PJM, MISO, SPP, CAISO, NYISO, ISO-NE). Operational EIA-930 `D` / `DF` is out of scope except as the geographic universe PD-3 must align to.

**Product baseline.** PD-2 already has a production operational foundation: `actual_load` = EIA-930 `D`, `operational_demand_forecast` = EIA-930 `DF`, hourly native grain, BA codes `ERCO` / `PJM` / `MISO` / `SWPP` / `CISO` / `NYIS` / `ISNE`. PD-3 asks what Urdais can defensibly ingest, retain, normalize, and potentially publish as *planning* demand.

**Research date.** Sources were inspected on 19 September 2026. URLs, vintages, and terms of use are as they stood that day.

A machine-readable copy of the source matrix is in `docs/research/power-delivery/phase-3-planning-demand-matrix.json`.

---

## 0. Evidence standard

Three classes, marked throughout:

- **[verified]** — quoted from a primary page or PDF extracted and read in this pass.
- **[retrieved]** — obtained by fetching a primary page or from a search extraction of a primary page. Substance reliable; wording indicative where the full document was JS-rendered, a fetch timed out, or only a listing was visible.
- **[inferred]** — my reading of how sources interact. **Never treated as a right.**

**Nothing in this document establishes a right.** Publicly downloadable is not commercially reusable. Silence in a terms page is not permission. Forecast **publication vintage** and **large-load screening** are first-class.

Rights classes (same as PD-1): `clearly_reusable` | `reusable_with_attribution_or_conditions` | `ambiguous_requires_legal_review` | `unsuitable_without_permission`.

ISO terms are not EIA/FERC terms. EIA-930 terms are not ISO planning-document terms.

---

## A. Executive conclusions

### A.1 Cleanest planning-forecast path

**ERCOT is the only market that is both methodologically first-party at hourly grain and rights-clean enough to publish with attribution today.** The 2025 Long-Term Demand and Energy Forecast (LTDEF / LTLF) publishes hourly weather-zone and ERCOT-total workbooks (XLSB), seasonal peaks, energy, weather-year scenarios, P50/P90, and an explicit waterfall that isolates data centers, crypto, hydrogen, industrial, EV, LFL, and BTM PV **[verified, 2025 LTLF report; Load Forecast page]**. ERCOT.com Terms of Use §5 allow raw public data to be used in compilations, charts, and analyses **[verified, PD-1]**.

**The catch is vintage, not rights.** As of 19 September 2026 there is **no finalized 2026 LTLF** on the Load Forecast page. The page still serves 2025 LTLF files. PUCT Project 59772 adopted a Batch Zero Base Load adjustment on 18 June 2026; Governor Abbott’s 3 August 2026 audit directive paused Batch Zero classification; ERCOT told the Commission it recommends delaying LTLF publication until final verified Base Load classification, with an eligibility verification report due 10 December 2026 **[verified, ERCOT Batch Zero Update 11 Sep 2026; PUCT 58317_27 filing]**. The latest *complete, published* planning vintage is the **April 2025 ERCOT Adjusted Forecast**, which the December 2025 CDR used **[verified, PD-1 CDR notes; Load Forecast page listing]**.

**PJM and CEC/CAISO are the next-best first-party products**, methodologically:

- **PJM 2026 Load Forecast Report** (posted 14 January 2026) is an independent staff 20-year zonal/LDA/RTO forecast with Excel tables, hourly zonal ZIP files, an RTO hourly-shape ZIP, a Previous Reports ZIP, Manual 19 Attachment B large-load screens, and a 29 May 2026 Data Center Accuracy Report **[verified, Load Forecast Development Process page; 2026 Load Forecast Report]**.
- **CEC CED 2025** (adopted 21 January 2026) is the CAISO planning-demand source of record. It publishes CAISO-BAA hourly files for Planning, Local Reliability, and Local Reliability with Known Loads, plus LSE/BAA tables and an explicit data-center methodology **[verified, CED 2025 demand-side page; CAISO 2026 SLRA]**.

**NYISO Gold Book** and **ISO-NE CELT** are first-party, scenario-rich, Excel-backed planning products that align to PD-2 geography. They are internally ingestible. Public display is blocked by copyright language that does not affirmatively grant commercial republication **[verified, PD-1 terms]**.

### A.2 Rights blockers

| Source | Blocker | Classification |
| --- | --- | --- |
| MISO website / LTLF whitepapers / OMS-MISO decks | Website ToU forbids publish, distribute, or derivative works of website content **[verified, PD-1]** | `unsuitable_without_permission` |
| SPP RA reports / Portal | Commercial publication or quoting SPP in commercial materials requires express written authorization **[verified, PD-1]** | `unsuitable_without_permission` for public display |
| CEC CED / IEPR | PRA-style public-use with credit **and** “Use or modification of these materials or information for commercial or profit-making purposes is prohibited” **[verified, energy.ca.gov/conditions-of-use]** | `ambiguous_requires_legal_review` — this is the CAISO planning-forecast gate |
| PJM pjm.com Load Forecast PDFs/XLS | Not Data Miner, but website copyright still applies. Data Miner derived-data ban is a separate, sharper ban that **does not automatically attach** to pjm.com planning files **[inferred; do not treat as a grant]** | `ambiguous_requires_legal_review` |
| NYISO Gold Book | Access confers no licence; IP reserved **[verified, PD-1]** | `ambiguous_requires_legal_review` |
| ISO-NE CELT | “Any duplication of the Content or non-personal use may violate copyright” **[verified, PD-1]** | `ambiguous_requires_legal_review` |
| NERC LTRA | Copyright asserted; no reuse grant found **[retrieved, PD-1]** | `unsuitable_without_permission` — out of PD-3 V1 |

**ERCOT.com** remains `reusable_with_attribution_or_conditions`. **FERC Form 714** remains `reusable_with_attribution_or_conditions` on U.S. government-works practice, not an affirmative FERC reuse page **[inferred, same as PD-1]**. **EIA** is `clearly_reusable` but has no long-horizon planning forecast for these markets.

### A.3 Methodology blockers

**MISO cannot currently supply a production PD-3 series comparable to ERCOT/PJM/CEC.** Module E / PRA coincident peaks are LSE-submitted through MECT and are not a public vintageed MW demand time series. The December 2024 Long-Term Load Forecast whitepaper gives coincident-peak *CAGR trajectories* (122 GW in 2024 to 152–186 GW in 2044) rather than a downloadable year-by-year Excel at BA grain **[verified, Dec 2024 LTLF whitepaper]**. A 2026 LTLF workshop (13 April 2026) exists; the associated whitepaper PDF returned HTTP 500 in this pass; stakeholders asked MISO to publish zonal Excel **[retrieved, MISO Engage feedback]**. OMS-MISO 2026 is a five-year *resource* survey that states member-reported load growth of 3.1%–5.1% CAGR — not a machine-readable demand series **[verified, MISO 2026 OMS-MISO news release]**. MISO Futures hourly load files are transmission-planning scenarios, not the RA demand forecast.

**SPP’s public planning-demand product is LRE-submitted Net Peak Demand in the seasonal Resource Adequacy Report**, not an independent ISO long-term load forecast. Horizon in the 2026 Summer report is summer 2026 through summer 2031. LRE workbooks are not public. ITP is transmission planning. Net Peak Demand is already net of controllable/dispatchable demand response **[verified, 2026 Summer RA Report; Attachment AA]**.

**FERC Form 714 Schedule 2 (forecast block) cannot replace ISO-specific planning forecasts for V1.** Respondents are planning areas with peak > 200 MW, not PD-2 BAs. There are no scenarios, no large-load documentation, no hourly planning profiles, and mapping is error-prone. ERCOT’s FERC-jurisdictional status makes a 1:1 BA filing unlikely; this pass did not confirm an ERCOT Inc. Form 714 planning-area filing.

### A.4 Seven-market aggregation is not currently defensible

**Option B (simple sum of official peaks) is not defensible.** The seven official peaks are non-coincident, live in different time zones, peak in different seasons, use different weather probabilities, mix gross/net/BTM conventions, apply incompatible large-load screens, and are published on different calendars. PJM’s published Load Forecast peaks are **non-coincident unrestricted** unless noted otherwise **[verified, 2026 Load Forecast Report note]**. SPP Net Peak Demand is DR-netted. CEC Planning 1-in-2 for CAISO excludes Known Loads; ERCOT Adjusted includes realization-adjusted contracts and officer letters. Adding them produces a number with no coincident physical meaning.

**Option C (Urdais-modeled coincident aggregate) is not currently possible for seven markets.** Public hourly planning profiles were confirmed for ERCOT (Adjusted XLSB) and CEC CAISO (hourly CED files). PJM posts zonal hourly forecast ZIPs and an RTO Hourly Shape ZIP **[verified, Load Forecast Development Process page]**. ISO-NE moved to an hourly methodology in CELT 2025, but this pass did not extract the public 8760 workbook. NYISO Gold Book is annual energy and seasonal coincident peaks, not an 8760. MISO and SPP have no public ISO-coincident hourly planning demand series. A seven-market coincident model would have to invent shapes for at least MISO, SPP, and NYISO.

**Option A (market-specific forecasts only) is the only option supported by current evidence.** A seven-market planning-demand line should remain deferred.

### A.5 Does FERC 714 materially improve the path?

**As a rights-cleaner internal cross-check, yes. As a V1 publication source or ISO replacement, no.**

It supplies an annual vintage of 10-year summer peak, winter peak, and annual net energy for planning-area respondents, in CSV (2006–2010) and XBRL (2011+) **[retrieved, FERC Form 714 instructions / blank form]**. That is useful for backfill of *utility* forecast vintages. It does not give ISO coincident peaks, scenarios, large-load screens, or PD-2 BA geography. Summing 714 respondents inside an RTO would be a non-coincident utility sum, not the ISO planning peak.

---

## B. Market-by-market source matrix

Units MW unless noted. “Current vintage” is the latest *complete published* planning-demand vintage as of 19 September 2026.

### B.1 ERCOT

| Field | Value |
| --- | --- |
| Market | ERCOT (PD-2 BA `ERCO`) |
| Source | 2025 Long-Term Demand and Energy Forecast (LTDEF / LTLF); CDR uses the Adjusted Forecast |
| Publisher | Electric Reliability Council of Texas, Inc. |
| URL | https://www.ercot.com/gridinfo/load/forecast ; CDR https://www.ercot.com/gridinfo/resource |
| Current vintage | **April 2025 ERCOT Adjusted Forecast** (hourly XLSB 15 Apr 2025; methodology report 8 Apr 2025 / updated 7 Aug 2025). December 2025 CDR uses this vintage. **2026 LTLF not finalized** as of this pass **[verified]** |
| Historical vintages | Current Load Forecast page lists 2025 LTLF files only. CDR archives exist on the Resource Adequacy page (this pass did not enumerate every prior LTLF year on the live load-forecast page — do not invent a complete LTLF file archive) |
| Forecast horizon | Hourly files: next ~10 years (page text still says historical weather 2008–2022; 2025 report uses weather years 2008–2024 for 2025–2034/2035) **[verified]** |
| Cadence | Annual LTLF intended; CDR semiannual intended. May 2026 CDR skipped load/reserve tables during recalibration **[retrieved, PD-1]** |
| Native grain | Hourly by weather zone + ERCOT total; monthly peaks and energy; coincident and non-coincident summer/winter peaks; weather-year scenarios; P50 and P90 |
| Format | XLSB (hourly), XLSX (peaks/energy/scenarios), DOCX/PDF methodology. Machine-readable: **yes** (hourly workbooks) |
| Geographic coverage | ERCOT region (eight weather zones). Lubbock integration and additional RCEC load are explicit adders **[verified, 2025 LTLF]**. Aligns to PD-2 `ERCO` with documented footprint additions |
| Scenarios | See §C. Source-published: TSP Provided vs ERCOT Adjusted large-load; weather-year scenarios; P50/P90; Uri (Feb 2021) and Elliott (Dec 2022) winter weather; Moody’s high economic used for Far West P90 |
| Large-load treatment | TSP RFI. **Contracts** = signed agreement + financial commitment. **Officer Letters** = no signed agreement; TSP officer attests viability to ERCOT officer. Adjusted Forecast: 180-day delay; data-center requested MW × 49.8%; officer-letter MW × 55.4% realization. End-use types: hydrogen, data centers, crypto, oil and gas, industrial. LFL modeled separately (~3,700 MW on system; 50% of coincident summer peak, 15% of net-load peak) **[verified, 2025 LTLF]**. 2026 path: Batch Zero Base / Studied / Excluded classification, currently paused for audit **[verified, Sep 2026 Batch Zero update]** |
| Rights | `reusable_with_attribution_or_conditions` |
| Public-display status | **Production-ready with attribution**, pinned to the April 2025 Adjusted vintage until a finalized 2026 LTLF exists |
| Notes | Appendix A of the 2025 report: summer peak 85,759 MW (2025) → 94,650 (2026) → 144,522 (2031); energy 486 → 1,038 TWh **[verified]**. Net Forecast = Base + EV + LFL + Adjusted Contracts + Adjusted Officer Letters − PV **[verified]**. Peak load and peak net load are both first-class (CDR PRM is published on both) |

### B.2 PJM

| Field | Value |
| --- | --- |
| Market | PJM (PD-2 BA `PJM`) |
| Source | 2026 Load Forecast Report + Tables/Data XLS + Long-Term Load Forecast Supplement (Feb 2026) |
| Publisher | PJM Interconnection (Resource Adequacy Planning Department — independent staff forecast) |
| URL | https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process ; report https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report.pdf ; tables https://www.pjm.com/-/media/DotCom/planning/res-adeq/load-forecast/2026-load-report-tables.xlsx |
| Current vintage | Posted **14 January 2026**. Supplement / additional files 6 February 2026. Mid-year update 24 July 2026 labeled **Informational Only**. Data Center Accuracy Report 29 May 2026 **[verified]** |
| Historical vintages | **Previous Reports ZIP** on the same page **[verified]**. Usable for backfill of publication-date vs target-year |
| Forecast horizon | 20-year peaks, net energy, load management, distributed solar, PEVs, battery storage by zone, LDA, and RTO **[verified]** |
| Cadence | Annual (January). Mid-year update informational |
| Native grain | Annual/seasonal unrestricted peaks; net energy; zonal and LDA; **non-coincident unless noted**; hourly zonal ZIPs and RTO Hourly Shape ZIP **[verified]** |
| Format | PDF + XLS + ZIP. Machine-readable: **yes** |
| Geographic coverage | PJM RTO / Control Area as of the report (zone incorporation dates listed, including OVEC 1 Dec 2018, EKPC 1 Jun 2013, DOM 1 May 2005, etc.) **[verified]**. Aligns to PD-2 `PJM` with time-varying membership — store zone-set with vintage |
| Scenarios | Single independent staff forecast, not a published high/low pair. Weather: 403 scenarios from 1994–2024 **[verified]**. Load-management and voltage-reduction are *after* unrestricted peak. BTM solar/battery reduce summer peak; EVs added **[verified]** |
| Large-load treatment | Manual 19 Attachment B. EDC/LSE submissions ≥ **50 MW**. Categories: **ESO** (Electric Service Obligation), **CC** (Construction Commitment), **Other**. **Firm** (ESO or CC plus meaningful financial commitment) may affect RPM-period forecast years; **Non-Firm** may be considered only outside RPM years and derated. 2026 implementation: typically ≥36-month ramp, ~70% utilization unless supported; Non-Firm prior to 2030 set to zero in the LAS summary **[retrieved, LAS 24 Nov 2025; Manual 19]**. Data-center adjustments applied to AEP, ATSI, APS, BGE, COMED, DAYTON, DLCO, JCPL, METED, PECO, PEPCO, PL, DOM, PS **[verified, 2026 report]** |
| Rights | `ambiguous_requires_legal_review` (pjm.com). Do **not** ingest via Data Miner (`unsuitable_without_permission` for redistribution of data or derivatives) |
| Public-display status | **Internally ingestible; not publicly publishable** pending counsel on pjm.com copyright |
| Notes | 2026 vintage is *lower* than 2025 through 2032 because of EV, economics, and firmer large-load screens: −2,564 MW / −1.6% for 2026 (3rd IA), −4,414 MW / −2.6% for 2028 RPM, −1,630 MW / −0.8% for 2031 RTEP **[verified]**. Summer unrestricted RTO peak 222,106 MW in 2036 (10-year +65,733 MW); winter 204,650 MW in 2035/36 **[verified]**. 10-year summer growth 3.6%/yr |

### B.3 MISO

| Field | Value |
| --- | --- |
| Market | MISO (PD-2 BA `MISO`) |
| Strongest first-party candidate | December 2024 Long-Term Load Forecast whitepaper; 2026 LTLF workshop (13 Apr 2026). **Not** Module E public data. **Not** OMS-MISO as a demand time series |
| Publisher | Midcontinent Independent System Operator |
| URL | https://cdn.misoenergy.org/MISO%20Long-Term%20Load%20Forecast%20Whitepaper_December%202024667166.pdf ; 2026 workshop https://www.misoenergy.org/engage/stakeholder-feedback/2026/workshops-long-term-load-forecast-20260413/ ; LTLF committee https://www.misoenergy.org/engage/committees/long-term-load-forecast/ |
| Current vintage | Dec 2024 whitepaper is the latest **independently extracted** first-party document in this pass. A May 2026 whitepaper is referenced by stakeholders (`20260513 LTLF Whitepaper.pdf`); fetch of that CDN URL returned HTTP 500. Do not treat press figures (e.g. 163 GW by 2035) as verified |
| Historical vintages | Futures Series 1 (2021), Series 1A (2023), Series 2 (2026) are scenario vintages, not RA demand vintages. Dec 2024 LTLF is one published load-forecast vintage |
| Forecast horizon | Whitepaper: 2024–2044 coincident peak trajectories |
| Cadence | Irregular workshops; not an annual Excel product analogous to PJM/CELT/Gold Book |
| Native grain | Coincident peak CAGR trajectories (Low / Current / High); energy by driver; LRZ narrative. **No public year-by-year BA hourly or seasonal-peak Excel confirmed in this pass** |
| Format | PDF whitepaper; some Futures hourly XLSX on the Futures page. Machine-readable demand series: **no** (not at ISO coincident-peak grain as a public product) |
| Geographic coverage | MISO footprint / 10 LRZs. Generally aligns to PD-2 `MISO`; LRZ 9 includes Louisiana and eastern Texas. Membership changes must be versioned |
| Scenarios | Source-published: Low 1.1%, Current 1.6%, High 2.0% CAGR 2024–2044 from 122 GW (2024) to 152–186 GW (2044) **[verified, Dec 2024 whitepaper]**. Drivers: building electrification, AI/data centers, EVs, new industry/reshoring, green hydrogen, DER |
| Large-load treatment | Data centers are an explicit modeled driver (149–241 TWh by 2044 in the 2024 whitepaper). Screening rules comparable to PJM ESO/CC or ERCOT contracts/officer letters were **not** found as a public, binding inclusion screen. Stakeholder comments on the 2026 workshop note 30–60% of data-center load may be backed by on-site generation **[retrieved, feedback page]** — that is stakeholder comment, not MISO policy |
| Module E / PRA | LSE 50/50 coincident demand submitted in MECT. Public artifacts are PRMR/capacity, not a demand time series. Treat as **participant-private** |
| OMS-MISO 2026 | Five-year resource survey (2027/28–2031/32). Member-reported load growth 3.1%–5.1% CAGR **[verified, MISO news release]**. Capacity-oriented. Not a PD-3 demand series |
| Rights | `unsuitable_without_permission` |
| Public-display status | **Blocked pending permission / legal review**, and **blocked for production as a first-party MW series** until a public vintageed demand workbook exists |
| Notes | Weakest of the seven for a defensible PD-3 ingest |

### B.4 SPP

| Field | Value |
| --- | --- |
| Market | SPP East BAA (PD-2 BA `SWPP`) |
| Source | 2026 Summer Season Resource Adequacy Report (East BAA) |
| Publisher | Southwest Power Pool |
| URL | https://spp.org/documents/76932/2026%20spp%20summer%20resource%20adequacy%20report.pdf ; RA page https://www.spp.org/engineering/resource-adequacy/ ; Attachment AA https://spp.org/documents/58597/attachment%20aa%20tariff.pdf |
| Current vintage | Published **15 June 2026** **[verified]** |
| Historical vintages | Prior-year RA reports exist as separate PDFs (e.g. 2024 June report at spp.org/documents/71804/…). This pass did not build a complete year list |
| Forecast horizon | Upcoming summer season plus **summer 2027 through summer 2031** **[verified]** — six-year class, not 10–20 |
| Cadence | Seasonal (summer and winter RA reports) |
| Native grain | Aggregate **LRE Forecasted Net Peak Demand**; also (in prior-year reports) non-coincident LRE peak, DR, EE. Not hourly. Not independently modeled by SPP staff |
| Format | PDF. Table 1 numeric cells were not extracted as text in this pass — do not invent 2026 MW. Machine-readable: **weak** (PDF tables). LRE workbooks: **not public** |
| Geographic coverage | **SPP East BAA only**. Not WEIS. Aligns to PD-2 `SWPP` if WEIS is excluded — which PD-2 already does. Do not mix SPP-administered Western markets |
| Scenarios | No published high/low demand fan. Net Peak Demand already nets controllable/dispatchable DR and firm-power contract adjustments **[verified, Attachment AA definition]** |
| Large-load treatment | LREs submit Workbook Net Peak Demand. SPP’s FERC information report (secondary coverage of the 2026 RA filing) states many data-center interconnection requests “have historically been incorporated into utility load forecasts before development plans were sufficiently mature” **[retrieved, secondary]**. No public ESO/CC-style screen. Individual LRE large-load assumptions are inside confidential workbooks |
| Rights | `unsuitable_without_permission` for commercial publication |
| Public-display status | **Internally ingestible; public display blocked pending written SPP authorization** |
| Notes | 2026 summer: 65 LREs met RAR; ACAP PRM 7.06%; East BAA ACAP reserve margin 17.1% (~5,752 MW excess above RAR). Existing-only resources: aggregate RAR deficiency beginning **2029**; 28% increase in LRE Net Peak Demand by 2031 vs ~1% increase in accredited capacity **[verified]**. ITP is a different product (transmission planning load review) |

### B.5 CAISO (source of record: CEC CED, not CAISO OASIS)

| Field | Value |
| --- | --- |
| Market | CAISO BAA (PD-2 BA `CISO`) |
| Source | California Energy Demand (CED) 2025 / 2025 IEPR; CAISO 2026 Summer Loads and Resources Assessment *uses* CED, it does not originate it |
| Publisher | California Energy Commission (forecast); CAISO (seasonal assessment that cites CEC) |
| URL | https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3 ; SLRA https://www.caiso.com/documents/2026-summer-loads-and-resources-assessment.pdf ; conditions https://www.energy.ca.gov/conditions-of-use |
| Current vintage | CED 2025 adopted **21 January 2026**; adopted forecast years **2025–2045**, some files extrapolated to 2050 **[verified, CED page]**. SLRA 2026 uses the CED 2025 1-in-2 Planning scenario |
| Historical vintages | CED 2024 Planning Forecast Updated LSE/BA tables are posted on the CED 2025 page **[verified]**. Prior IEPR/CEDU cycles exist; this pass did not inventory every year |
| Forecast horizon | 2025–2045 (hourly files include 2050 extrapolation) |
| Cadence | Biennial IEPR + update years |
| Native grain | **Hourly CAISO BAA** (Planning; Local Reliability; Local Reliability with Known Loads); LSE/BAA annual tables; peak forecast workbooks; IOU planning-area hourlies (PGE, SCE, SDGE, VEA); statewide totals are a *different* geography |
| Format | XLS hourly and peak files. Machine-readable: **yes** |
| Geographic coverage | **CED CAISO hourly files align to PD-2 `CISO`.** CED Total State / planning areas (LADWP, SMUD, IID, BANC/NCNC, etc.) do **not**. Never substitute California statewide demand for CAISO BAA |
| Scenarios | Source-published: Baseline vs managed (AAEE/AAFS); Planning vs Local Reliability; with/without Known Loads; 1-in-2 / 1-in-5 / 1-in-10 / 1-in-20 peaks; self-gen High / Mid ITC / Mid / Low; AATE transportation scenarios. Data-center supplemental harmonic hourly profile is labeled optional **[verified]** |
| Large-load treatment | Two distinct CEC constructs. **Known Loads**: utility energization requests (distribution-level, CPUC High DER / GNA filings); cancellation rates, ramp, utilization; included in Local Reliability, **excluded from 2025 Planning** to limit RA/IRP downstream impact **[retrieved, CEC Known Loads presentations; verified in SLRA footnote]**. **Data centers**: project-based from utility application data; groups by signed agreement / active application / inquiry; **67% utilization**; scenario-specific confidence; multi-year ramp; Group 2/3 schedules shifted **[retrieved, Data Center Methodology Memo]**. SLRA: 2026 CAISO 1-in-2 Planning peak **46,844 MW** on 2 Sep 2026 HE18 PDT, excluding Known Loads; Known Loads could add ~**1,569 MW** **[verified, SLRA]**. 1-in-5/10/20: 49,534 / 50,872 / 52,122 MW **[verified]** |
| Rights | CEC: `ambiguous_requires_legal_review`. CAISO SLRA PDF on caiso.com: `reusable_with_attribution_or_conditions` (website PRA language) — but republishing SLRA numbers that are CEC CED numbers does not escape the CEC clause **[inferred]** |
| Public-display status | **Internally ingestible; not publicly publishable** until counsel scopes the CEC commercial-use sentence to CED workbooks |
| Notes | Strongest CAISO-BAA hourly planning product in the seven-market set. Single Forecast Set agreement reallocates CED to LSE/BA for IRP and transmission planning **[verified, CED page]** |

### B.6 NYISO

| Field | Value |
| --- | --- |
| Market | NYISO / NYCA (PD-2 BA `NYIS`) |
| Source | 2026 Load & Capacity Data Report (Gold Book) |
| Publisher | New York Independent System Operator |
| URL | https://www.nyiso.com/load-capacity-data-report-gold-book- |
| Current vintage | Posted **29 April 2026**: Gold Book PDF; Baseline / Higher Demand / Lower Demand XLSX; graphs; existing generating facilities XLSX **[retrieved, Gold Book page listing]**. Direct 2026 PDF URL attempted in this pass returned 404; body quotes below that need cell-level 2026 figures are therefore not independently extracted from the 2026 PDF |
| Historical vintages | Page lists 2026 and 2025. NYISO Library “Load and Capacity Data Report” keeps current + two previous years; **See More** for a longer listing **[retrieved, NYISO knowledge article]**. Usable for vintage backfill; enumerate from the Library rather than assuming a complete public archive |
| Forecast horizon | Energy and seasonal peaks through ~2055 in the 2025 Gold Book structure; generating capacity shorter **[verified, 2025 Gold Book]**. Treat 2026 similarly until the 2026 PDF is extracted |
| Cadence | Annual (April) |
| Native grain | NYCA and 11-zone annual energy; summer and winter coincident peaks; not an 8760. ICAP Market Peak Load Forecast is a separate one-year product |
| Format | PDF + XLSX. Machine-readable: **yes** (Excel tables) |
| Geographic coverage | New York Control Area. Aligns to PD-2 `NYIS` |
| Scenarios | Source-published: **Baseline / Higher Demand / Lower Demand**. Weather: expected future weather with temperature trends; most TOs at 50th percentile peak weather, Con Edison and O&R at **67th**; 90/10/99 percentile coincident peaks **[verified, 2025 Gold Book — confirm 2026 tables on ingest]**. Hydrogen electrolysis is **excluded** from baseline; included in Higher Demand in the 2025 book **[verified, 2025]** |
| Large-load treatment | Table I-14 is **not** the interconnection queue. 2025 notes: tables “do not necessarily reflect the proposed date and MW values listed in Table IV-7, and include impacts for load projects not listed in the NYISO Interconnection Queue” **[verified, 2025 Gold Book]**. Higher/Lower scenarios scale large-load growth up/down. Secondary coverage of the 2026 Gold Book reports 2026 summer large-load impact **538 MW** vs a queue >12 GW **[retrieved, secondary; do not treat as verified from the 2026 PDF]**. Flexible Load by Zone is a separate peak-reduction potential |
| Rights | `ambiguous_requires_legal_review` |
| Public-display status | **Internally ingestible; not publicly publishable** pending counsel |
| Notes | Baseline includes EE, codes & standards, BTM PV, BTM non-solar DG, BTM storage peak reductions, EVs, building electrification, and Table I-14 large loads. Wholesale storage is **not** a peak reducer (it is dispatched as supply). Winter PV peak reduction is zero |

### B.7 ISO-NE

| Field | Value |
| --- | --- |
| Market | ISO-NE / New England Control Area (PD-2 BA `ISNE`) |
| Source | CELT 2026 (Forecast Report of Capacity, Energy, Loads, and Transmission) and Forecast Data workbook |
| Publisher | ISO New England |
| URL | https://www.iso-ne.com/celt ; https://www.iso-ne.com/system-planning/system-forecasting/load-forecast |
| Current vintage | CELT 2026 published **1 May 2026** covering 2026–2035 **[retrieved, ISO Newswire 18 May 2026]**. CELT and Load Forecast page document tables were JS-empty in this pass — **no direct XLSX file URL extracted**. Final-draft PAC/LFC decks are posted |
| Historical vintages | Annual CELT series is the intended backfill path. Confirm file listing on ingest; do not invent years |
| Forecast horizon | 10-year CELT; some component forecasts discussed into the 2040s in the large-load deck |
| Cadence | Annual (1 May) |
| Native grain | Regional, state, and zonal energy and seasonal peaks; 50/50 and 90/10; gross reconstituted vs net of BTM PV (and PDR reconstitution for ARA gross). Hourly methodology implemented CELT 2025; public 8760 extract not confirmed in this pass |
| Format | PDF + intended Forecast Data workbook. Machine-readable: **yes, if the workbook is present** (scheduled location: Load Forecast page) |
| Geographic coverage | New England Control Area. Aligns to PD-2 `ISNE` |
| Scenarios | Source-published: 50/50 and 90/10; gross vs net of BTM PV; EE forecast; DG/BTM PV forecast; electrification (EV, heat pump); BTM BESS; large-load component. ARA-adjusted gross using pre-CELT 2025 methodology on dedicated tabs **[retrieved, CELT 2026 decks]** |
| Large-load treatment | Debut component in CELT 2026. Inclusion: **>20 MW** expected nameplate **and** a **formal study agreement**. Near-term summer/winter limited to projects **under construction**. Final-draft: two projects (NEMA data center 200 MW thru 2027; CT general electrification 85 MW thru 2040); **none under construction**, so contribution to winter 2026/27 and summer 2026 and **2027 = 0** **[retrieved, Final Draft Large Load Forecast PDF; ISO Newswire]**. Nameplate is derated for maturity and load type. ISO Newswire: ~110 MW peak in the 2030s, ~130 MW in the 2040s |
| Rights | `ambiguous_requires_legal_review` |
| Public-display status | **Internally ingestible; not publicly publishable** pending counsel. Confirm workbook URL before calling ingest production-ready even internally |
| Notes | Material regional difference vs ERCOT/PJM: official near-term large-load contribution is zero because of the construction screen |

### B.8 FERC Form 714 (fallback, not a market)

See §9 / §E–G. Not 1:1 with any PD-2 BA.

---

## C. Scenario-normalization matrix

Do **not** collapse these into one canonical scenario across markets. Where a source clearly labels an official or “focus” case, that is noted as a *candidate*, not a Urdais choice.

| Market | Canonical / base candidate (source-labeled) | Alternate scenarios (source-published) | Weather basis | Gross / net | BTM treatment | Large-load treatment | Peak type |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ERCOT | **ERCOT Adjusted Forecast** (report: “will serve as the focus”) | TSP Provided; weather-year 2008–2024; P90; Uri; Elliott; Far West Moody’s high for P90 | Rank-and-average / 2008 mapping as 50th-percentile coincident; P90 from weather-year distribution | Waterfall **net** of BTM PV; CDR also publishes peak **net load** | BTM PV reconstituted historically then subtracted; frozen-efficiency base | Contracts + officer letters with realization factors; 2026 Batch Zero not yet in a published LTLF | Hourly; coincident summer (Jun–Sep) and winter (Dec–Mar); weather-zone coincident and non-coincident |
| PJM | Single independent staff forecast | 403 weather simulations internally; unrestricted vs after load management; mid-year informational | Weather-normalized / median seasonal from 1994–2024 simulations | Unrestricted peak **after** BTM solar/battery (summer) and **after** EV, **before** load management | BTM solar/battery from S&P Global, applied by PJM | Manual 19 Att. B Firm vs Non-Firm; 50 MW; ~70% utilization; ≥36-month ramp | **Non-coincident unrestricted** unless noted; also zonal/LDA; hourly shapes available |
| MISO | Current Trajectory (1.6% CAGR) is labeled “Current,” not an RA official peak | Low 1.1% / High 2.0%; OMS-MISO member forecasts; Futures F1/F2/F3 | Climate/weather discussed in whitepaper; not a 50/50 vs 90/10 table | Coincident **net** peak in the 2024 whitepaper title/figures | DER as a separate driver (69–78 TWh by 2044) | Data centers modeled as a driver; no public contract/construction screen | Coincident peak (whitepaper); Module E 50/50 coincident (private) |
| SPP | LRE Workbook Net Peak Demand as aggregated in the RA report | Non-coincident LRE peak (prior-year tables); no high/low fan | Not a published 50/50 vs 90/10 in the 2026 summer report extract | **Net** Peak Demand = peak − DR − firm-power adjustments | Not a first-class BTM table in the RA report | LRE-submitted; no public ISO screen | Seasonal Net Peak Demand, East BAA aggregate; non-coincident LRE peaks in supporting tables |
| CAISO | **CED Planning, 1-in-2, without Known Loads** (what CAISO SLRA used for 2026) | Local Reliability; Local Reliability + Known Loads; 1-in-5/10/20; baseline vs managed AAEE/AAFS; self-gen High/Mid/Low | 1-in-N weather | Managed vs baseline; Planning vs Local Reliability | Dedicated BTM DG forecast; hourly BTM PV and storage | Known Loads excluded from Planning; data centers project-based with 67% utilization | Hourly CAISO BAA; annual 1-in-N peaks (2026 1-in-2 on 2 Sep HE18) |
| NYISO | **Baseline** (“expected NYCA load”) | Higher Demand; Lower Demand; 90/10/99 weather percentiles; “prior to large load growth” columns | 50th percentile most TOs; 67th ConEd/O&R; temperature trends | Baseline is after BTM PV and BTM storage peak reductions; wholesale storage not netted from peak | BTM PV, BTM non-solar DG, BTM storage as explicit tables; 10,000 MW DC BTM solar policy target before 2030 in 2025 book | Table I-14 screened subset of queue + some non-queue; Higher/Lower scale it; hydrogen excluded from baseline | NYCA coincident summer and winter; zonal |
| ISO-NE | **50/50 net of BTM PV** (CELT long-term) plus separate ARA gross tabs | 90/10; gross reconstituted (BTM PV + PDR) for remaining ARAs; EE/DG/EV/HP/BESS/large-load components | 50/50 and 90/10 | Gross vs net of BTM PV is first-class | BTM PV and BTM BESS component forecasts | >20 MW + study agreement; construction screen zeros 2026–2027 summer | Seasonal peaks; zonal; hourly methodology exists |

**Inference, not source:** there is no cross-market “base case” that is 50/50, gross, including all requested large loads. Forcing one would be a Urdais model.

---

## D. Forecast-vintage design

Preserve at least these fields on every planning-demand point. The grain of truth is the **vintage**, not the target year.

| Field | Purpose |
| --- | --- |
| `market` | PD-2 slug (`ercot` … `iso-ne`) and EIA BA code |
| `source` | Product id (e.g. `ercot-ltlf-adjusted`, `pjm-load-forecast-report`, `cec-ced-planning`, `nyiso-gold-book-baseline`, `isone-celt`, `spp-ra-net-peak`, `ferc-714-sch2`) |
| `publisher` | Legal publisher |
| `publication_date` | Report/posting date (`2025-04-15` vs `2026-01-14`) |
| `retrieved_at` | When Urdais fetched it |
| `target_year` | Forecast year (e.g. 2028) |
| `target_season` | `summer` / `winter` / `annual` / `hour` |
| `scenario` | Source terminology, not a Urdais enum smash (`ERCOT_Adjusted`, `CED_Planning`, `GoldBook_Baseline`, `CELT_50_50_net_BTM_PV`, …) |
| `weather_basis` | `P50` / `P90` / `1-in-2` / `1-in-10` / `67th_percentile` / `weather_year_2008` / `not_stated` |
| `peak_type` | `coincident` / `noncoincident` / `unrestricted` / `hourly_profile` |
| `gross_net_status` | `gross_reconstituted` / `net_of_btm_pv` / `net_of_dr` / `waterfall_net` / `not_stated` |
| `large_load_policy` | Source screen (`contracts_plus_officer_letters_adjusted`, `m19_firm_eso_cc`, `cec_known_loads_excluded`, `celt_construction_screen`, `lre_workbook`, `table_i14_screened`, `not_stated`) |
| `value` | Numeric |
| `unit` | `MW` or `MWh` / `GWh` / `TWh` |
| `methodology_or_source_version` | e.g. `CELT_2026_hourly`, `PJM_hourly_model_year4`, `ERCOT_2025_waterfall`, `CED_2025`, Batch Zero protocol if/when published |
| `source_provenance` | URL, file name, hash, terms URL, rights class |
| `geographic_grain` | `ba_total` / `weather_zone` / `pjm_zone` / `lda` / `nyiso_zone` / `isone_zone` / `cec_planning_area` / `ferc714_planning_area` |
| `footprint_as_of` | Membership/date so OVEC/Lubbock/RTO expansions do not silently splice |

This is how Urdais distinguishes “2028 forecast published in 2024” from “2028 forecast published in 2026.”

**Backfill feasibility (this pass):**

| Source | Historical vintages obtainable? |
| --- | --- |
| PJM | **Yes** — Previous Reports ZIP **[verified]** |
| NYISO | **Yes, with Library See More** — current + two years on the Gold Book page; older via Library **[retrieved]** |
| CEC | **Partial** — CED 2024 files linked from the CED 2025 page **[verified]**; older IEPR cycles exist as separate pages |
| ERCOT CDR | **Yes** — Resource Adequacy archives **[retrieved, PD-1]** |
| ERCOT LTLF hourly | **Current page shows 2025 only.** Do not claim a multi-year hourly LTLF archive without listing files |
| ISO-NE CELT | **Intended yes** (annual series); confirm file listing (JS-empty in this pass) |
| SPP RA | **Partial** — discrete annual PDFs; not a packaged ZIP |
| MISO | **Weak** — whitepapers and Futures, not a comparable demand vintage stack |
| FERC 714 | **Yes** — 1993–2005 ASCII, 2006–2010 CSV, 2011+ XBRL **[retrieved]** |

---

## E. Aggregation analysis

PD-2 actuals can be coincident-summed hour by hour in UTC because EIA-930 is hourly and definitionally consistent. PD-3 planning peaks cannot.

### Option A — No aggregate (market-specific only)

**Supported.** Each market retains native grain, scenario, weather basis, large-load policy, and vintage. This matches how operators actually plan. It is the only option that does not require Urdais to invent coincidence, weather, or screening.

**Cost.** No single “seven-market planning demand” line. The product must not label seven independent peaks as U.S. load.

### Option B — Simple sum of official peaks

**Not defensible.** Failures, each independently fatal:

1. **Non-coincident peaks.** PJM’s published report peaks are non-coincident unrestricted **[verified]**. ISO coincident peaks (NYISO, ISO-NE, MISO Module E, ERCOT coincident) are different objects. Summing non-coincident zonal/RTO peaks with coincident ISO peaks double-counts diversity.
2. **Time zones.** ERCOT CPT, CAISO PPT, Eastern markets EPT. Annual peak *dates* cannot be added.
3. **Peak seasons.** NYISO is transitioning toward winter peaking **[verified, 2025 Gold Book]**. CAISO 2026 1-in-2 peak is 2 September HE18 **[verified, SLRA]**. ERCOT summer is Jun–Sep. SPP RA is seasonal. A “2028 peak” is not the same hour.
4. **Weather.** 50/50 vs 90/10 vs 1-in-2 vs 1-in-10 vs 67th percentile ConEd vs rank-and-average P50 vs 403 PJM weather draws.
5. **Gross/net.** ISO-NE gross reconstituted vs net BTM PV; ERCOT waterfall minus PV; PJM unrestricted after BTM solar; SPP Net Peak Demand minus DR; CEC managed vs baseline.
6. **Large-load screens.** ISO-NE 2027 large-load = 0 (construction). ERCOT Adjusted realization factors. PJM Firm/Non-Firm. CEC Known Loads *out* of Planning. NYISO Table I-14 << queue. SPP LRE self-report. Adding these pretends the screens are the same.
7. **Vintages.** Pinning “2026” mixes April 2025 ERCOT Adjusted, January 2026 PJM, January 2026 CED, April 2026 Gold Book, May 2026 CELT, June 2026 SPP RA, and an unpublished ERCOT 2026 LTLF / incomplete MISO Excel.

Option B is a spreadsheet convenience, not a grid quantity.

### Option C — Urdais-modeled aggregate (hourly profiles or explicit diversity)

**Conceptually the only honest aggregate**, and **not currently buildable for seven markets**.

Evidence required before Option C could be labeled anything but a prototype:

- Hourly (or at least same-timezone daily-peak) planning profiles for **all seven** BA areas, or an explicit, versioned coincidence/diversity factor with a stated estimation sample.
- One chosen scenario per market, documented as a Urdais mapping, not as “the ISO base case.”
- One weather philosophy (e.g. all P50/1-in-2), accepting residual incomparability.
- One large-load policy philosophy (e.g. “source-official focus case”), not a Urdais re-screen.
- Conversion to UTC and coincident sum, then peak-of-sum — never sum-of-peaks.
- Rights path for every hourly file used in a public derived series (PJM’s derived-data ban is Data Miner-specific; pjm.com hourly ZIPs still need copyright review; CEC commercial-use clause still gates CAISO hourlies).

**What exists today toward C:** ERCOT Adjusted hourly XLSB; CEC CAISO hourly XLS; PJM zonal hourly ZIPs + RTO Hourly Shape ZIP. **What does not:** NYISO 8760, SPP 8760, MISO official LTLF 8760 (Futures hourlies are the wrong product). ISO-NE hourly methodology is real; public file not confirmed.

**V1 recommendation:** Option A. Do not ship Option B. Do not ship Option C as “official seven-market planning demand.”

---

## F. Rights matrix

Separate four uses. “Internal retention” is not a publication licence.

| Source | Internal retention | Internal calculation | Public raw-value display | Public derived-value display | Attribution | Unresolved terms issue |
| --- | --- | --- | --- | --- | --- | --- |
| EIA-930 (ops only; not PD-3) | Yes | Yes | Yes, with EIA acknowledgment | Yes | EIA + publication date | Counsel confirm API ToS “get” covers a commercial terminal (PD-1 Q1) |
| FERC Form 714 Sch. 2 forecast | Yes | Yes | Likely yes as U.S. government work | Likely yes | FERC + report year | No FERC copyrights-and-reuse page equivalent to EIA’s **[inferred]** |
| ERCOT.com LTLF / CDR | Yes | Yes | **Yes** for raw public data in charts/analyses | **Yes** | Credit ERCOT; raw data need not retain notices per ToU §5 | Confirm grant covers Public API vs HTML/files (PD-1 Q12) |
| PJM Load Forecast on pjm.com | Yes | Yes | **No** until counsel | **No** until counsel (copyright; not Data Miner) | If later permitted, PJM + report date | Does website copyright bar numeric tables in a commercial product? |
| PJM Data Miner | Members per DLA | Members per DLA | **No** without membership | **No** — derived-data ban **[verified, PD-1]** | n/a | Do not use Data Miner for PD-3 |
| MISO website / whitepapers | Engineering copy, high caution | High caution — ToU bars derivative works | **No** | **No** | n/a | Does ToU reach PDF whitepapers and Engage files? |
| SPP RA PDF | Yes | Yes | **No** without written authorization | **No** without written authorization | Citation allowed for non-commercial copy | Will SPP grant commercial publication of Table 1 peaks? |
| CEC CED / IEPR | Yes | Yes | **No** until counsel | **No** until counsel | Credit CEC if any public use | Scope of commercial-use prohibition vs PRA public-use paragraph; does it reach CED XLS? |
| CAISO SLRA PDF | Yes | Yes | Website PRA language is permissive **[verified, PD-1]** | Same, with credit | Credit CAISO | SLRA load numbers are CEC numbers — CEC clause may still bind **[inferred]** |
| NYISO Gold Book | Yes | Yes | **No** until counsel | **No** until counsel | If later permitted, NYISO + Gold Book year | Silence on numeric Excel republication |
| ISO-NE CELT | Yes | Yes | **No** until counsel | **No** until counsel | If later permitted, ISO-NE + CELT year | Does “non-personal use” reach CELT tables? |
| NERC LTRA | Secondary read-only | Do not build series from it | **No** | **No** | n/a | Out of PD-3 V1 |

---

## G. Recommended PD-3 V1

Do not force seven-of-seven coverage.

### G.1 Ingest now (internal)

| Priority | Source | Why |
| --- | --- | --- |
| 1 | ERCOT 2025 Adjusted LTLF hourly XLSB + peak/energy XLSX + 2025 methodology report; December 2025 CDR load tables | Rights-cleanest ISO path; native hourly; explicit large-load waterfall |
| 2 | CEC CED 2025 CAISO hourly files (Planning, Local Reliability, Local Reliability + Known Loads) + peak workbook + Data Center Methodology Memo | Only CAISO-BAA hourly planning product; Known Loads first-class |
| 3 | PJM 2026 Load Forecast tables XLS + report PDF + Previous Reports ZIP + Manual 19 Att. B + load-adjustment XLS | Best Eastern vintage stack; Firm/Non-Firm screen documented |
| 4 | NYISO 2026 Gold Book Baseline/Higher/Lower XLSX | 30-year NYCA; Table I-14; aligns to `NYIS` |
| 5 | ISO-NE CELT 2026 Forecast Data workbook (confirm file URL) + large-load deck | Aligns to `ISNE`; construction screen is a material contrast case |
| 6 | SPP 2026 Summer RA Report (and winter counterpart when posting) | East BAA Net Peak Demand only; hold public |
| 7 | FERC 714 yearly planning-area forecast (XBRL/CSV) | Rights-cleaner backfill and cross-check; **not** a market series |
| Hold | MISO Dec 2024 LTLF whitepaper PDF; 2026 workshop materials | Context only until a public MW workbook exists |
| Out | MISO Module E/MECT, OMS-MISO as a demand series, NERC LTRA tables, Data Miner, SPP LRE workbooks, CEC Total State as a CAISO proxy |

### G.2 Publish now

**Only ERCOT**, and only as:

- source = ERCOT Adjusted Long-Term Load Forecast
- vintage = April 2025 (publication date)
- scenario = Adjusted (not TSP Provided, not unpublished Batch Zero)
- geography = ERCOT region / `ERCO`
- attribution per ERCOT.com ToU

Do **not** publish a 2026 ERCOT LTLF until ERCOT posts a finalized file after Batch Zero verification.

### G.3 Hold internal-only (no public raw or derived planning MW)

PJM Load Forecast, CEC CED (including CAISO hourlies), NYISO Gold Book, ISO-NE CELT, SPP RA tables, FERC 714 (until counsel confirms government-works display), MISO whitepaper figures.

### G.4 Aggregate

**Deferred.** Option A only. No seven-market planning-demand total on any public or prototype chart that could be read as official.

### G.5 Explicitly out of scope for PD-3 V1

- Operational EIA-930 `DF` (already PD-2)
- Deliverable capacity / delivery gap
- Interconnection-queue GW as demand
- UEPI / wholesale prices
- NERC LTRA table republication
- California statewide CED as CAISO
- SPP WEIS
- MISO Module E participant data
- Choosing a single canonical scenario across markets
- Interpolating quarterly points from seasonal peaks without labeling interpolation
- Shipping Batch Zero / 368 GW ERCOT preliminary figures as the planning series

### G.6 Implementation-state summary

| Market | V1 state |
| --- | --- |
| ERCOT | **production-ready with attribution** (April 2025 Adjusted vintage frozen) |
| PJM | **internally ingestible but not publicly publishable** |
| CAISO (CEC CED) | **internally ingestible but not publicly publishable** (CEC commercial-use clause) |
| NYISO | **internally ingestible but not publicly publishable** |
| ISO-NE | **internally ingestible but not publicly publishable** (also confirm workbook URL) |
| SPP | **internally ingestible but not publicly publishable** (written authorization required for public) |
| MISO | **blocked pending permission/legal review** *and* **blocked due to methodological incompatibility** for a production MW series |

---

## H. Open questions

Resolve before implementation. None is rhetorical.

### Rights / legal

1. May Urdais publicly display ERCOT Adjusted LTLF *numeric* peaks and hourly-derived seasonal peaks in a commercial product under ERCOT.com ToU §5?
2. Does the CEC commercial-use sentence apply to CED 2025 hourly XLS workbooks, or only to copyright-marked / third-party materials? **This gates any public CAISO planning line.**
3. Does pjm.com copyright bar republication of Load Forecast Excel *numbers* (not Data Miner)? If yes, is Associate Membership + DLA even relevant for pjm.com files?
4. Will SPP grant written authorization to display East BAA Net Peak Demand from RA reports?
5. Does MISO website ToU reach LTLF whitepapers and Engage PDFs?
6. NYISO: is Gold Book XLSX commercially republishable, or internal-only?
7. ISO-NE: does “non-personal use may violate copyright” reach CELT Forecast Data cells?
8. FERC 714: confirm counsel agrees U.S. government-works treatment covers XBRL forecast tables Urdais would store and display.
9. If a public *derived* seven-market model is ever built from CEC + PJM hourlies, do CEC commercial-use and PJM copyright still attach to the derivative?

### Vintage / files

10. Enumerate ERCOT LTLF hourly archives before 2025 (not listed on the 19 Sep 2026 Load Forecast page).
11. Extract the 2026 Gold Book PDF (direct URL 404’d in this pass) and confirm Table I-14 2026 MW vs the 2025 methodology language.
12. Confirm the CELT 2026 Forecast Data workbook file URL and whether 8760s are inside it.
13. Obtain the May 2026 MISO LTLF whitepaper (`20260513 LTLF Whitepaper.pdf` returned 500) and any accompanying Excel.
14. Extract SPP 2026 RA Report Table 1 MW (numeric cells not in the text extract).
15. Inventory FERC 714 planning-area respondents and map to PD-2 BAs; confirm whether ERCOT Inc. files.

### Methodology

16. For ERCOT public V1, is April 2025 Adjusted acceptable while 2026 LTLF is delayed, or must the tile wait for Batch Zero?
17. Which CEC scenario is stored as the CAISO internal default — Planning 1-in-2 without Known Loads (SLRA), or Local Reliability with Known Loads (data-center relevant)?
18. PJM: store unrestricted non-coincident *and* any coincident tables, and never mix them.
19. ISO-NE: store both 50/50 net and ARA gross; they are different objects.
20. MISO: is there any public year-by-year coincident-peak Excel that this pass missed?
21. SPP: is ITP 50/50 load a better long-horizon demand source than RA Net Peak Demand, and is it public at BA grain?
22. Peak load vs peak net load for ERCOT and CAISO — a single “demand” line will mis-state evening net-load need.
23. Coincidence: what estimation sample would be required before Option C is more than a labeled prototype (EIA-930 historical coincidence among the seven BAs is a possible *operations* diversity factor, not a planning-weather factor)?

### Geographic

24. PJM zone-set by vintage (OVEC 2018, etc.) — splice rules.
25. MISO South / LRZ 9 vs EIA `MISO`.
26. SPP East BAA vs any future RTO expansion; never include WEIS.
27. CEC CAISO BAA vs PGE/SCE/SDGE TAC vs statewide.

### Process

28. Hash and retain terms artifacts per source at ingest time (same pattern as other Urdais rights objects).
29. What is explicitly out of the public tile vs the internal research warehouse.

---

## Appendix 1 — FERC Form 714 Schedule 2 forecast (detail)

**What it is.** FERC Form No. 714, Annual Electric Balancing Authority Area and Planning Area Report, authorized by the Federal Power Act and 18 CFR § 141.51 **[retrieved]**. Filed on or before **June 1** for the preceding calendar year.

**Who files the planning-area forecast.** Any electric utility or group constituting a planning area with peak load **greater than 200 MW** based on net energy for load for the reporting year must complete applicable schedules. Typical respondent: the principal resource-planning and forecasting entity with an obligation to serve planning-area demands **[retrieved, FERC overview / instructions]**. Balancing-authority filers are a separate 141.51(a)(1) class.

**Forecast structure.** Part III Schedule 2 forecast block: for each of the **next ten years**, forecast **summer peak (MW)**, **winter peak (MW)**, and **annual net energy for load (MWh)** **[verified, blank 2025 form / 2021 instructions]**. No scenario column. No large-load column. No hourly forecast.

**History.** 1993–2005 ASCII by NERC region; 2006–2010 CSV database; 2011+ XBRL on the e-Forms portal **[retrieved, FERC data page]**. Report year vs forecast year are distinct — this *is* a vintageed planning forecast.

**Mapping to PD-2.** PUDL documents that FERC-714 respondents are sometimes utilities and sometimes BAs; EIA-861 geometries are used to approximate service territory; identifiers differ between CSV and XBRL eras **[retrieved, PUDL ferc714 docs]**. Ambiguity is first-class. A known class of error is treating a utility respondent as a BA (or vice versa). This pass did not produce a respondent→seven-market crosswalk and did not confirm an ERCOT Inc. filing.

**Quality.** Completeness is filer-dependent. Planning-area footprints change with mergers. Hourly actuals (Schedule 2a) are standard-time, not daylight time **[verified, instructions]**. Forecasts have no weather-probability metadata.

**Can it replace ISO forecasts for V1?** **No.** Wrong geography, no coincidence, no scenarios, no large-load policy, incomplete ERCOT, and a June 1 lag. **Can it help?** **Yes**, as a rights-cleaner vintage backfill and as a diagnostic when an ISO number and the sum of in-footprint 714 respondents diverge.

**Rights.** U.S. government work practice; no EIA-style reuse page found. Classification: `reusable_with_attribution_or_conditions`. Attribution: FERC Form 714, respondent, report year.

---

## Appendix 2 — Terms excerpts (indicative)

Quoted so §F can be re-checked against the live page. Not a licence grant to Urdais.

**ERCOT.com ToU §5** — raw public data may be used, reproduced, and redistributed in compilations, charts, and analyses without maintaining notices **[verified, PD-1]**.

**CEC Conditions of Use** — public-service / PRA use with credit; “Some of the materials… may not be used for any purpose. Use or modification of these materials or information for commercial or profit-making purposes is prohibited…” **[verified, 19 Sep 2026 fetch]**.

**PJM Data Miner** — redistribution of information **or data derived from Data Miner** strictly prohibited without membership **[verified, PD-1]**. Does not, by its words, automatically govern pjm.com Load Forecast files.

**MISO Terms of Use** — no publish, distribute, or derivative works of website content **[verified, PD-1]**.

**SPP Portal Terms** — commercial publication requires express written authorization **[verified, PD-1]**. Whether the same clause governs spp.org engineering PDFs should be confirmed by counsel; treat as hostile to commercial display until cleared.

**NYISO Legal Notice** — access confers no licence; IP reserved **[verified, PD-1]**.

**ISO-NE Legal** — Content copyrighted; non-personal duplication may violate copyright **[verified, PD-1]**.

**EIA Copyrights and Reuse** — U.S. government publications public domain; acknowledge EIA with publication date **[retrieved, PD-1]**. Irrelevant to ISO planning PDFs.

---

## Appendix 3 — What this pass did not do

- Did not download full hourly XLSB/XLS workbooks or parse every peak table cell (SPP Table 1 MW; PJM 2026 unrestricted summer MW for 2026; CELT workbook; 2026 Gold Book PDF body).
- Did not obtain ISO membership agreements or counsel opinions.
- Did not map FERC 714 respondents onto the seven BAs.
- Did not treat GridStatus / S&P / Hitachi as primary sources.
- Did not select a deliverable-capacity methodology.
- Did not choose a seven-market aggregate.

---

## Appendix 4 — Primary URLs (as of 19 September 2026)

- ERCOT Load Forecast: https://www.ercot.com/gridinfo/load/forecast
- ERCOT Resource Adequacy / CDR: https://www.ercot.com/gridinfo/resource
- ERCOT Batch Zero update (11 Sep 2026): https://www.ercot.com/files/docs/2026/09/11/14-Batch-Zero-Update.pdf
- PUCT 59772 LTLF adjustment: https://interchange.puc.texas.gov/Documents/59772_1_1645544.PDF
- PUCT 58317_27 Batch Zero / LTLF delay: https://interchange.puc.texas.gov/Documents/58317_27_1672569.PDF
- PJM Load Forecast Development Process: https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process
- PJM 2026 Load Forecast Report: https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report.pdf
- PJM 2026 tables: https://www.pjm.com/-/media/DotCom/planning/res-adeq/load-forecast/2026-load-report-tables.xlsx
- PJM Manual 19: https://www.pjm.com/-/media/DotCom/documents/manuals/m19
- MISO Dec 2024 LTLF whitepaper: https://cdn.misoenergy.org/MISO%20Long-Term%20Load%20Forecast%20Whitepaper_December%202024667166.pdf
- MISO 2026 LTLF workshop: https://www.misoenergy.org/engage/stakeholder-feedback/2026/workshops-long-term-load-forecast-20260413/
- OMS-MISO 2026 release: https://www.misoenergy.org/meet-miso/media-center/2026---news-releases/omsmiso-survey-shows-surge-in-new-resource-additions/
- SPP 2026 Summer RA Report: https://spp.org/documents/76932/2026%20spp%20summer%20resource%20adequacy%20report.pdf
- CEC CED 2025: https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3
- CEC Conditions of Use: https://www.energy.ca.gov/conditions-of-use
- CEC Data Center Methodology Memo: https://www.energy.ca.gov/sites/default/files/2026-04/Data_Center_Methodology_Memo_ada.pdf
- CAISO 2026 SLRA: https://www.caiso.com/documents/2026-summer-loads-and-resources-assessment.pdf
- NYISO Gold Book: https://www.nyiso.com/load-capacity-data-report-gold-book-
- ISO-NE CELT: https://www.iso-ne.com/celt
- ISO-NE Load Forecast: https://www.iso-ne.com/system-planning/system-forecasting/load-forecast
- ISO-NE CELT 2026 large-load deck: https://www.iso-ne.com/static-assets/documents/100033/fx2026_large_loads.pdf
- ISO Newswire CELT 2026 large loads: https://isonewswire.com/2026/05/18/iso-ne-establishes-forecast-framework-for-data-centers-other-large-loads/
- FERC Form 714 overview: https://www.ferc.gov/industries-data/electric/general-information/electric-industry-forms/form-no-714-annual-electric/overview
- FERC Form 714 data: https://www.ferc.gov/industries-data/electric/general-information/electric-industry-forms/form-no-714-annual-electric/data
- 18 CFR § 141.51: https://www.law.cornell.edu/cfr/text/18/141.51
