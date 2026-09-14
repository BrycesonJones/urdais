# UBWI Phase 2A — Rights-Clean Total Global Wealth Denominator

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. No production value, ingestion contract, schema, migration or collector is created by this document. Every figure below is evidence about sources or a labelled research candidate; none is a published Urdais value.

This study continues [the Phase 1 source study](./ubwi-phase1-source-study.md) and supports [UBWI 0.1.0-draft](/docs/methodology/ubwi). **No amendment to the Phase 1 methodology is proposed or required.** The accounting target is unchanged, the anti-double-counting rule is unchanged, and the exclusions are unchanged. What changed is the source layer.

## The question this phase had to answer

Phase 1 found two denominators that measure the right concept — WID's market-value national wealth and McKinsey's global balance sheet — and neither could be used, for rights reasons rather than data reasons. The brief for this phase was therefore not "find a third publisher with one total number". It was:

> Can Urdais construct its own Total Global Wealth series from rights-clean primary sources, preserving the SNA anti-double-counting identity and the market-value concept?

**The answer is yes for about half the world, and no for the other half, and the half that is missing is missing for reasons that outreach cannot fix.**

## Headline Result

**The construction works. The coverage does not.**

Four findings, in order of how much they change the picture.

**One. The identity can be assembled from primary sources, and the United States publishes it outright.** The Federal Reserve's Z.1 table S1.b, *Derivation of U.S. net wealth*, is the SNA national-wealth identity stated in the Fed's own footnote: tangible assets of every domestic sector, net of financial obligations to the rest of the world. It is quarterly, current to 2026:Q2, market-valued, and carries no copyright notice. Phase 1 did not know this table existed. It settles a quarter of the problem by itself.

**Two. Twelve economies can be observed directly today, and they are 48.72 % of world GDP and 57.26 % of the world's non-human wealth on the only open country-level wealth dataset that exists.** Their summed national net worth is **$304.480 trillion**. Every step is arithmetic Urdais performs itself from files Urdais retrieved.

**Three. The binding constraint is land, not licensing.** The OECD's SDMX service is unauthenticated, machine-readable, and covers 49 reference areas — but a *total* non-financial asset stock for the total economy exists for only **10** of them, and land for **17**. The widely quoted "37 countries" is *fixed assets only*, which is a capital stock and not a balance sheet. A national net worth without land is not a market-value national net worth, and no permission grant creates data a compiler never collected.

**Four. The resulting candidate is 45 % imputed, and that is too much to publish.** Filling the remaining 51.28 % of world GDP with a calibrated wealth-to-GDP ratio gives a candidate Total Global Wealth of **$556.99 trillion** and a research-only candidate UBWI of **0.2844 %**, within a sensitivity range of **0.2330 % to 0.3162 %**. That the central value lands within 0.0001 percentage points of Phase 1's WID-derived 0.2843 % — from entirely different sources, by an entirely different method — is the strongest evidence yet that the concept is measurable. It is not evidence that this construction is publishable, because almost half of it is a model.

**Decision: methodology viable, denominator still blocked.** The blocker has changed character. Phase 1 was blocked on permission. Phase 2A is blocked on **coverage**, and China alone is 16.77 % of world GDP and 13.85 % of the world's non-human wealth.

## Method and Evidence Standard

Every figure was retrieved on 14 September 2026 unless stated otherwise, from a named source with a URL, and the HTTP status of each retrieval is recorded. Endpoints marked verified were called directly and their responses parsed. Search results were used only to locate documents and are never cited as evidence.

Figures computed by Urdais rather than published by the source are labelled **own computation** with their inputs. Documents that could not be retrieved are recorded as unretrieved and **no figure from them is used**.

A retrieval failure is recorded as a fact about the retrieval, not as a fact about the source. Phase 1 established that rule after wrongly writing off McKinsey; it is applied here to the OECD, whose terms pages are Cloudflare-gated from this environment while its data API answers normally.

---

## Part 1 — The Accounting Target, Restated

Unchanged from Phase 1, and restated here so the source assessment below can be checked against it.

> **World net worth at market value, excluding human capital, with financial claims consolidated so that they are not double counted.**

Operationally, for each economy:

$$\text{national net worth} = \text{non-financial assets} + \text{net financial claims on the rest of the world}$$

summed over economies, at which point cross-border claims cancel to the extent they are measured. Government assets and liabilities are inside. Household and non-profit wealth is inside. Corporate balance sheets enter through the sectors that hold the equity, never as a market capitalization added on top of the assets. Land and produced assets are inside where the chosen framework includes them. Bitcoin is a liability-free asset inside its own denominator. Human capital and consumer durables are outside.

**The Federal Reserve states this identity in its own words**, in footnote 1 to table S1.b of the Z.1 release of 11 September 2026:

> "U.S. net wealth measures the value of tangible assets controlled by the household and nonprofit organizations, nonfinancial and financial business, and government sectors of the U.S. economy, net of U.S. financial obligations to the rest of the world (sum of lines 2+7+12+13+16+20+24)."

That is the same sentence as 2008 SNA 13.4 and 2025 SNA 14.4, written by a national compiler about its own published series. It is worth quoting because it removes any question about whether the identity Phase 1 chose is an academic construct: it is what the world's largest economy publishes quarterly.

---

## Part 2 — What Each Source Actually Publishes

### 2.1 United States — Federal Reserve Z.1, table S1.b

**This is the single most important find of the phase.**

Retrieved: `https://www.federalreserve.gov/releases/z1/current/z1.pdf` (HTTP 200, 8,145,293 bytes, 205 pages, read), `https://www.federalreserve.gov/releases/z1/data/FRB_Z1_csv.zip` (HTTP 200, 64,219,006 bytes, one file `Z1.csv`, 7,783,341 rows, parsed), and `https://www.federalreserve.gov/releases/z1/current/z1_csv_files.zip` (HTTP 200, 8,336,582 bytes, 307 files — **note that this bundle contains only the integrated-macroeconomic-account tables and does not contain S1.b**; the series must be taken from the DDP bundle or the release PDF).

Release: **Z.1, 11 September 2026, second quarter 2026.** Next release 10 December 2026.

Table **S1.b, *Derivation of U.S. net wealth***, billions of dollars, amounts outstanding end of period, not seasonally adjusted. Transcribed from the release:

| Line | Series | Item | 2023 | 2024 | 2025 | 2026:Q2 |
|---|---|---|---:|---:|---:|---:|
| 1 | `FL892090005` | **U.S. net wealth** | 143,746.0 | 155,331.7 | **166,863.7** | **180,955.6** |
| 2 | `LM152010005` | Households' non-financial assets | 57,611.1 | 60,024.0 | 61,695.7 | 64,263.8 |
| 3 | `LM155035005` | — real estate | 48,842.7 | 50,955.5 | 52,015.3 | 54,073.9 |
| 4 | `LM165015205` | — equipment (nonprofits) | 653.5 | 681.7 | 729.3 | 764.8 |
| 5 | `LM165013765` | — intellectual property products (nonprofits) | 258.3 | 275.6 | 297.3 | 310.3 |
| 6 | `LM155111005` | — **consumer durable goods** | 7,856.6 | 8,111.2 | **8,653.8** | 9,114.8 |
| 7 | `LM112010005` | Non-financial noncorporate business | 18,750.1 | 19,024.1 | 19,356.1 | 19,757.5 |
| 12 | `LM662090003` | Financial noncorporate business | 123.8 | 140.6 | 171.0 | 193.9 |
| 13 | `LM882010405` | Domestic corporations' non-financial assets | 62,835.4 | 75,616.0 | 83,588.2 | 94,407.1 |
| 16 | `LM315015005` | Federal government's non-financial assets | 4,570.2 | 4,710.1 | 4,943.8 | 5,098.1 |
| 20 | `LM212010095` | State and local governments' non-financial assets | 16,021.3 | 16,561.9 | 17,363.1 | 17,976.9 |
| 24 | `FL882090265` | Net U.S. financial claims on the rest of the world | −16,166.0 | −20,745.0 | −20,254.1 | −20,741.9 |

**Two footnotes carry the whole valuation question.**

Footnote 3, on line 13: domestic corporations' non-financial assets are *"Estimated as the market value of corporate equity, plus foreign direct investment: equity, plus miscellaneous other equity (excluding proprietors' equity), plus total liabilities, less total financial assets."* This is a **market valuation derived from equity prices**, and it is exactly the consolidation the methodology describes: the corporate sector's tangible wealth is inferred from what the market pays for the claims on it, so the claims are not added a second time. It also means the US series inherits equity-market volatility — the $14.2 trillion single-quarter rise to 2026:Q2 is mostly this line.

Footnote 4, on lines 16 and 20: government non-financial assets *"Excludes land and nonproduced nonfinancial assets."* **The United States does not value public land.** This is a known, quantified, one-directional omission: US net wealth is understated by the market value of federal, state and local land, which is not small in a country where the federal government alone holds roughly a quarter of the land area. No adjustment is made here, because an adjustment would be a model and there is no rights-clean estimate to use.

**Consumer durables must be stripped.** Line 6 is inside line 1, and the methodology excludes consumer durables on the authority of 2025 SNA 4.120. Own computation:

```
U.S. net wealth, end-2025            166,863.7 bn   (FL892090005)
less consumer durable goods            8,653.8 bn   (LM155111005)
= U.S. net wealth on the UBWI basis  158,209.9 bn = $158.210 tn
```

**A second Fed measure exists and must not be confused with the first.** `FL892090025`, *U.S. wealth (IMA)*, gives $138,539.3 bn for end-2025, and `FL892090035`, *Difference between U.S. wealth calculations*, gives −$28,324.4 bn. The three reconcile exactly (166,863.7 − 138,539.3 = 28,324.4, own computation). The IMA variant values corporations differently. **Chaining the two into one series would be the Phase 1 McKinsey hazard repeated**, and the registry should carry the series identifier, not the concept name.

**Rights.** The Z.1 release PDF carries **no copyright notice anywhere in its 205 pages** — a negative finding recorded deliberately, because the contrast with Destatis below is the whole point of checking. `https://www.federalreserve.gov/aboutthefed/legal.htm` and `https://www.federalreserve.gov/credit-and-copyright.htm` both returned **HTTP 404**, so no express grant was retrieved. The general position that works of the United States Government are not subject to copyright protection is legal background, not a retrieved permission, and this study does not treat it as one. Both axes are recorded as **under review** pending a retrievable statement, with the note that this is the most favourable rights position in the entire source set and the one most likely to clear.

### 2.2 OECD — the SDMX service works, and the data is thinner than Phase 1 recorded

**The service.** `https://sdmx.oecd.org/public/rest/...` answers unauthenticated. Verified calls:

- dataflow `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE9B,1.0` — structure HTTP 200 (3,382,565 bytes), availability HTTP 200, data HTTP 200 in `csvfilewithlabels`;
- dataflow `OECD.SDD.NAD,DSD_NASEC20@DF_T720R_A,1.0` — structure HTTP 200, data HTTP 200.

Table 9B carries 49 reference areas, thirteen dimensions, annual frequency, `UNIT_MEASURE` of `XDC` only (national currency), `UNIT_MULT` of 6 (millions). The financial dataflow carries 46 reference areas and does offer `USD` and `PT_B1GQ` units.

**The finding that matters.** Coverage was measured per asset code for the **total economy** (`SECTOR=S1`, `ACCOUNTING_ENTRY=A`, `PRICE_BASE=V`), by reading the availability constraint and then the data. Own computation:

| SNA asset code | What it is | Reference areas | Latest years observed |
|---|---|---:|---|
| **`NN`** | **Total non-financial assets** | **10** | AUS CAN CZE FRA JPN KOR MEX SWE¹ 2022; GBR 2021; RUS 2019; NZL 2017 |
| `N1N` | Produced assets, net | 18 | mostly 2021–2022; **USA 2018** |
| `N2N` | Non-produced non-financial assets | 10 | mostly 2022 |
| `N21N` | Natural resources | 10 | mostly 2022 |
| **`N211N`** | **Land** | **17** | mostly 2021–2022 |
| `N11N` | **Fixed assets, net** | **37** | mostly 2021–2022 |
| `N12N` | Inventories | 30 | mostly 2021–2022 |
| `N13N` | Valuables | 8 | mostly 2021–2022 |
| `N22N` | Contracts, leases, licences | 5 | mostly 2022 |
| `N23N` | Goodwill and marketing assets | 3 | 2022 |

¹ Sweden has no `NN` but has both `N1N` and `N2N` for 2022, so a total is constructible.

**The "37 economies" figure Phase 1 recorded is `N11N` — fixed assets only.** Fixed assets exclude land, inventories, valuables, natural resources and every other non-produced asset. Summing fixed assets across countries and calling it national wealth would understate the denominator by the largest single component of it, and would do so by a different amount in every country. The trap is precise enough to be worth naming: **the row count that looks like coverage is the row count for the wrong asset code.**

The asymmetry with the financial side is stark. Net financial worth of the total economy vis-à-vis the rest of the world (`INSTR_ASSET=BF90`, `COUNTERPART_AREA=W`, `TRANSACTION=LE`) is available for **43 areas**, verified by direct call. Every one of those 43 is a net foreign position Urdais could use. Only ten of them have a non-financial asset total to add it to.

**So the binding constraint on country-level aggregation is the non-financial side, and specifically land.** This is not a licensing problem and no permission grant fixes it.

| Candidate observed set | n | 2024 world GDP share | CWON 2020 non-human wealth share |
|---|---:|---:|---:|
| OECD `NN` (total non-financial assets) | 10 | **19.32 %** | **28.69 %** |
| OECD `N211N` (land reported) | 17–18 | 24.63 % | 36.27 % |
| OECD `N11N` (fixed assets only — *not a balance sheet*) | 37 | 61.05 % | 68.99 % |
| McKinsey's 21 economies (for reference; unlicensable) | 21 | 72.60 % | 76.77 % |

Own computation from World Bank `NY.GDP.MKTP.CD` (2024, `lastupdated` 13 July 2026) and the CWON 2020 non-human shares derived in Part 4. The McKinsey row reproduces the report's own stated "about 71 percent of global GDP as of 2024" to within the vintage difference, which is a useful check that the coverage arithmetic here is right.

**Rights: not established, and this is a real blocker.** `https://www.oecd.org/en/about/terms-conditions.html` returned **HTTP 403** to `curl` with full browser headers and again through WebFetch; the archived copies in this session's scratchpad are Cloudflare interstitials (`<title>Just a moment...</title>`), not terms. Phase 1 recorded the same 403. **No licence text has ever been retrieved for OECD data in either phase.** Urdais's rule is that permission is not inferred from a dataset being public, so both axes stay **not reviewed** and the interface cannot be production-approved. This is the single most valuable outreach target in the set, because a grant would clear a harmonised, machine-readable route to nine of the twelve observed economies at once.

### 2.3 Germany — retrieved, and the series is discontinued

Retrieved: `https://www.destatis.de/DE/Themen/Wirtschaft/Volkswirtschaftliche-Gesamtrechnungen-Inlandsprodukt/Publikationen/Downloads-Vermoegensrechnung/vermoegensbilanzen-xlsx-5816103.xlsx` (HTTP 200, 116,495 bytes, parsed).

*Sektorale und gesamtwirtschaftliche Vermögensbilanzen*, **1999–2022**, jointly published by the Statistisches Bundesamt (non-financial assets) and the Deutsche Bundesbank (financial assets), article number 5816103227005, **published November 2023**.

Sheet `S1 + S 11`, line 15: **`Volksvermögen (= Reinvermögen)`** — national wealth, equals net worth — **€25,357.8 bn for 2022**, from a continuous series beginning at €9,061.5 bn in 1999.

Two things make this usable and one makes it awkward.

**Land is in it.** The `Vorbemerkung` states that *"In dieser Veröffentlichung wird der Gesamtwert des Grund und Bodens nachgewiesen, der im Rahmen eines Projekts auf der Grundlage der Flächenerhebung nach Art der tatsächlichen Nutzung und durchschnittlicher Bodenrichtwerte ermittelt wurde"* — the total value of land, established from the land-use survey and average standard land values. Germany therefore clears the constraint that the OECD route fails on.

**Consumer durables are already outside the headline.** The workbook carries `Volksvermögen` and, separately, `Volksvermögen einschließlich` a durables memo line, and the household sheet likewise distinguishes `Reinvermögen` from `Reinvermögen einschließlich Gebrauchsvermögen privater Haushalte`. The headline series is the one UBWI wants, with no stripping required — the opposite of the US case.

**The publication is discontinued.** The cover sheet states: *"Diese Publikation wird letztmalig gemeinsam vom Statistischem Bundesamt und der Deutschen Bundesbank mit dem Berichtszeitraum 2022 veröffentlicht."* Continuation is directed to GENESIS-Online topic area 81000, to a new statistical report on the national accounts, and to the Bundesbank, which *"wird auch weiterhin eine aktualisierte Version verfügbar sein"*. **A production dependency on this artifact would be a dependency on a discontinued file**, and the successor interface has not been assessed. Reference year 2022 is already three years stale against the US series' 2025.

**Rights: a bare copyright notice and no grant.** The workbook's `Impressum` reads **`© Statistisches Bundesamt (Destatis), 2023`** and nothing further. No licence string, no Datenlizenz Deutschland reference, no Creative Commons mark appears in the retrieved artifact. Germany's general data-licensing position was not retrieved this session and is not assumed. Both axes: **not reviewed**.

### 2.4 World Bank — the only source whose rights are settled

Two roles, both verified.

**World Development Indicators**, `https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD` (HTTP 200, `lastupdated` 13 July 2026, 265 rows including aggregates). World GDP at market exchange rates for 2024: **$111,669,432,109,121**. Of 217 non-aggregate economies, 200 report 2024 GDP, summing to 99.06 % of the World aggregate; the 17 without data are listed in Part 5.

**Official exchange rate**, `PA.NUS.FCRF`, HTTP 200, `lastupdated` 13 July 2026, **213 economies**. The indicator's own published name is **"Official exchange rate (LCU per US$, period average)"**.

> **A correction to carry forward.** `PA.NUS.ATLS` is **not** the Atlas conversion factor. Its published indicator name, read from the API response, is **"DEC alternative conversion factor (LCU per US$)"**. Anyone reaching for "the Atlas factor" by that code will get a different series, applied for a different purpose, and will not be told.

**Changing Wealth of Nations 2024**, World Bank source 59, seven indicators retrieved at HTTP 200, `lastupdated` 8 October 2024, 151 economies, reference year 2020. Used here **only** as a structural weight and as the calibration set for the imputation backtest, never as a valuation. Phase 1's disproof stands: world real estate at market value is 117.8 % of CWON's entire non-human total, so CWON is a floor and not a market valuation.

**Rights: `Creative Commons Attribution 4.0`.** Verified at `https://datacatalog.worldbank.org/public-licenses` (HTTP 200), which states the default licence for World Bank public datasets *"allows users to copy, modify and distribute data in any format for any purpose, including commercial use"*, with users *"only obligated to give appropriate credit (attribution) and indicate if they have made any changes, including translations"*. The World Development Indicators catalog entry states `Creative Commons Attribution 4.0`, metadata last updated 20 July 2026.

Note the boundary: `https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets` (HTTP 200) carries a **restrictive** default for non-dataset materials — *"you may not make any derivative work or commercial use ... without the prior written consent"* — which applies to reports and publications. **Cite the dataset, never the report PDF.** Both axes: **permitted**, attribution required on every published surface.

### 2.5 Eurostat — the route Phase 2A could not open

Eurostat carries the right asset codes. The dataset `nama_10_nfa_st`, *Capital stocks by sector and detailed asset type* (`updated` 8 September 2026), exposes `N1N`, `N2N`, `N211N`, `N11N` and twenty-one further codes for sectors `S1`, `S11`, `S12`, `S13`, `S14_S15`, in both `CP_MNAC` and `CP_MEUR`, from 1975. `nasa_10_f_bs`, *Financial balance sheets — annual data* (`updated` 10 September 2026), carries `BF90` for the total economy across **39 geographies** through reference year 2023 — 2024 returned HTTP 200 with zero observations, so 2023 is the current vintage.

**The retrieval failed and the failure is recorded as a retrieval failure.** Repeated queries to the dissemination API for `nama_10_nfa_st` filtered to `sector=S1` and a single `asset10` returned `HTTP 413 EXTRACTION_TOO_BIG: The requested extraction is too big, estimated 35345856 rows, max authorised is 5000000`, whose row estimate is the whole dataset — the dimension filters were not being applied. Retries after the documented asynchronous delay returned the same. The SDMX 2.1 endpoint returned `HTTP 406` with a `format` parameter and `HTTP 400 INVALID_QUERY` with a correct `Accept` header and the dimension order taken from the dataset's own JSON `id` array. **No Eurostat figure is used anywhere in this study.**

What this costs is known: Eurostat is the natural route to Italy, Spain, the Netherlands, Belgium, Austria, Poland, Ireland, Denmark, Finland, Portugal, Greece and the remaining member states, several of which the OECD route also fails on. **Whether Eurostat actually holds `N2N` or `N211N` data — as opposed to the codes — is the single most valuable unanswered question in this study**, because it determines whether country-level aggregation can reach the high seventies of world GDP or stalls below fifty. It is a query-syntax problem, not a rights problem, and it should be the first thing Phase 2B resolves.

**Rights: not assessed.** The European Commission's reuse decision was not retrieved this session, and Eurostat's position is therefore **not reviewed** rather than assumed, notwithstanding that it is widely understood to be permissive.

### 2.6 Sources assessed and not used

| Source | What it publishes | Why it is not in the denominator |
|---|---|---|
| **WID.world** | Market-value national wealth, world aggregate, 1980– | Phase 1 blocker unchanged: terms-of-use page 404, no licence file. Not retested this phase. |
| **McKinsey Global Institute** | Global net worth $600 tn, end-2024, market value | *"Any use of this material without specific permission ... is strictly prohibited."* Cross-check only. |
| **UBS Global Wealth Report** | Household net worth, $517.69 tn end-2025 | Excludes state assets and debts by design; prior written permission required. |
| **World Bank CWON** | Comprehensive wealth, 151 economies | Replacement cost and resource rent, not market value. Structural weight and floor only. |
| **IMF** | Public sector balance sheets; IIP | `imf.org` returned HTTP 403 in Phase 1; not retested. No global net wealth figure published. |
| **Savills / World Gold Council / WFE / BIS** | Single asset classes | Non-additive cross-checks. Summing them is the error the methodology exists to prevent. |

---

## Part 3 — Comparing the Four Construction Strategies

**A. Direct world total from an open statistical compiler.** **Fails.** No compiler publishes one. This is unchanged from Phase 1 and nothing found this phase alters it.

**B. Country-level aggregation of national net worth.** **Partially works, and is the only strategy with a defensible accounting basis.** Twelve economies are observable today at 48.72 % of world GDP. The ceiling is set by which compilers value land, not by which will grant permission.

**C. Regional aggregation plus imputation.** **Necessary, and currently doing too much work.** At 48.72 % observed, imputation supplies 45.2 % of the denominator. A statistic that is 45 % model is a model.

**D. Hybrid primary-source system.** **The recommended architecture**, and what Part 6's candidate implements: a per-economy component table fed by whichever rights-clean interface covers that economy — the Fed for the United States, a national compiler for Germany, the OECD harmonised route where a country reports a total, Eurostat where the query problem is solved — with an explicit, versioned, separately-flagged imputation layer for the remainder.

**Recommended framework, stated as a rule:**

> Total Global Wealth is the sum of directly observed national net worth over a defined observed set, plus an imputed residual for the complement, where the observed set must cover a stated minimum share of world GDP at market exchange rates and every imputed economy is stored, displayed and flagged as imputed.

**The coverage threshold is a methodology decision this study does not make, but it makes a recommendation with a reason.** The imputed share of the denominator should not exceed **25 %**, which requires directly observing roughly **75 % of world GDP**. Below that, the honest description of the output is "an estimate calibrated to observed economies" rather than "a measurement". Three facts support that number rather than a rounder one: McKinsey's own global figure rests on 71 % of world GDP and is described by its authors as a GDP-weighted extrapolation; the imputation backtest in Part 5 shows total-world error staying inside ±1 % once the observed set passes roughly 80 % of GDP; and the gap between 48.72 % and 75 % is almost exactly China, India, Italy, Spain, Australia, Brazil, Indonesia and the Netherlands, which is a tractable target list rather than an open-ended one.

---

## Part 4 — Coverage Matrix

Rights states use the Urdais two-axis vocabulary: **retrieval** (may Urdais collect it automatically?) and **data use** (may Urdais use it to construct and publish an index?). *Permission is never inferred from a dataset being public.*

### 4.1 Directly observed today

| Economy | Source | Series / table | Ref. | Measure | Currency | Valuation | Retrieval | Data use | Usable |
|---|---|---|---|---|---|---|---|---|---|
| **United States** | Federal Reserve | Z.1 table S1.b, `FL892090005` less `LM155111005` | 2025 | National net wealth | USD | Market; RE at market, corporates from equity; **no public land** | under review | under review | **yes** |
| **Japan** | OECD SDMX | `DF_TABLE9B` `NN` + `DF_T720R_A` `BF90(W)` | 2022 | Non-fin assets + NFA | JPY | Market | not reviewed | not reviewed | evidence only |
| **Germany** | Destatis / Bundesbank | *Vermögensbilanzen* 1999–2022, `Volksvermögen` | 2022 | National net worth | EUR | Market; land at *Bodenrichtwerte* | not reviewed | not reviewed | evidence only |
| **France** | OECD SDMX | as Japan | 2022 | as Japan | EUR | Market | not reviewed | not reviewed | evidence only |
| **United Kingdom** | OECD SDMX | as Japan | 2021 | as Japan | GBP | Market | not reviewed | not reviewed | evidence only |
| **Korea** | OECD SDMX | as Japan | 2022 | as Japan | KRW | Market | not reviewed | not reviewed | evidence only |
| **Canada** | OECD SDMX | as Japan | 2022 | as Japan | CAD | Market | not reviewed | not reviewed | evidence only |
| **Mexico** | OECD SDMX | as Japan | 2022 | as Japan | MXN | Market | not reviewed | not reviewed | evidence only |
| **Russia** | OECD SDMX | as Japan | **2019** | as Japan | RUB | Market | not reviewed | not reviewed | evidence only |
| **Sweden** | OECD SDMX | `N1N`+`N2N` + `BF90(W)` | 2022 | as Japan | SEK | Market | not reviewed | not reviewed | evidence only |
| **Czechia** | OECD SDMX | as Japan | 2022 | as Japan | CZK | Market | not reviewed | not reviewed | evidence only |
| **New Zealand** | OECD SDMX | as Japan | **2017** | as Japan | NZD | Market | not reviewed | not reviewed | evidence only |

**Every row except the United States depends on an interface whose terms have never been retrieved.** The candidate in Part 6 is therefore a research computation over sources that are technically reachable and legally unassessed, which is precisely the state Urdais's registry exists to make visible rather than to paper over.

### 4.2 Material economies not observed

| Economy | 2024 GDP share | CWON non-human wealth share | Status this phase |
|---|---:|---:|---|
| **China** | **16.77 %** | **13.85 %** | No national balance sheet from an official compiler was established. The NIFD/CASS *China National Balance Sheet* is a research publication, not an official statistical product, and its rights were not established. **The largest single gap, and not a rights problem.** |
| **India** | 3.37 % | 2.77 % | Not established. Financial accounts exist; a non-financial asset stock does not. |
| **Italy** | 2.13 % | 1.65 % | OECD has fixed assets only. Eurostat route unresolved. |
| **Brazil** | 1.96 % | 1.30 % | Not established. In OECD's financial dataflow only. |
| **Australia** | 1.57 % | **3.42 %** | `NN` available 2022; **no net foreign position in the OECD financial dataflow**, so excluded. Closeable from the ABS. |
| **Spain** | 1.55 % | 0.73 % | OECD has fixed assets only. Eurostat route unresolved. |
| **Indonesia** | 1.25 % | 0.86 % | Not established. |
| **Türkiye** | 1.22 % | 0.27 % | Financial balance sheet only. |
| **Saudi Arabia** | 1.12 % | 0.62 % | Not established. Sovereign fund disclosure is not a national balance sheet. |
| **Netherlands** | 1.09 % | 1.20 % | Land and fixed assets in OECD; no total. |
| **Switzerland** | 0.87 % | 1.34 % | Financial balance sheet only in OECD. |
| **Norway** | 0.45 % | 1.08 % | `N1N` 2020 only; no `N2N`. |
| Remaining ~190 economies | ~17 % | ~14 % | Individually immaterial; collectively must be imputed. |

Australia is the most annoying row in the table: it has the hard half (a valued total non-financial asset stock including land) and is excluded for want of the easy half (a net foreign position that its own statistical agency publishes). It should be the first economy added in Phase 2B and it is worth 3.42 % of world wealth.

---

## Part 5 — Comparability, Currency and Imputation

### 5.1 Comparability differences that materially matter

Four of the differences the brief asked about are demonstrably material from the evidence collected. Two are not yet assessable and are recorded as such rather than guessed at.

**Land, and whether the compiler values it at all.** This is the dominant difference and it is not a matter of degree. Ten OECD reference areas publish a total non-financial asset stock; seventeen publish land. The United States publishes a national net wealth series that **excludes public land by construction** (Z.1 footnote 4), while Germany publishes one that **includes all land** at standard land values. These two series are not the same measure, and adding them without saying so would be exactly the "silently forcing heterogeneous national data into one number" the brief prohibits. **Normalization policy: store a per-economy `land_treatment` flag — `included`, `partially_included`, `excluded` — alongside every observation, display it, and never adjust for it silently.** The US is `partially_included`: private land is inside real estate at market value, public land is outside.

**Corporate valuation basis.** The US derives corporate tangible assets from the market value of equity plus liabilities less financial assets. Other compilers value corporate non-financial assets directly from capital stock estimates. The first is a market valuation and moves with equity prices quarter to quarter; the second is a perpetual-inventory estimate and does not. Both are admissible under the methodology's "market where market prices exist", but they respond differently to the same shock, and a world total mixing them will show less equity-market sensitivity than the US share of it implies. **Normalization policy: store a `corporate_valuation_basis` flag and report it; do not convert between bases.**

**Consumer durables.** The US includes them in the headline and they must be stripped ($8,653.8 bn for 2025, 5.2 % of the US total). Germany excludes them from the headline and publishes an including-durables variant separately. **Normalization policy: the schema requires a `consumer_durables_treatment` value and, where the source includes them, a recorded stripped amount. A component that cannot state its durables treatment cannot enter the denominator.**

**Vintage dispersion.** The observed set spans reference years 2017 to 2025. That is not a comparability nicety; it is the largest single source of error in the candidate after imputation, and it biases the total **downward**, because nominal wealth grows and the stale economies are frozen at older price levels. Russia at 2019 and New Zealand at 2017 are the worst offenders, and Germany at 2022 is the most material. **Normalization policy: every component carries its own reference date; the denominator's stated reference date is the *latest* year for which the *observed set* is complete, and the gap for each stale economy is displayed rather than closed.**

**Not assessable from the evidence collected**, and recorded as open rather than asserted: the treatment of unfunded government-employee pension entitlements across the observed set; unlisted-equity valuation conventions; the treatment of financial derivatives in the net foreign position; and the 2025 SNA implementation timetable. Each was in the brief; none was established by a retrieved document this session, and this study does not characterise them from memory.

### 5.2 Currency conversion policy

**Rule: Total Global Wealth is denominated in United States dollars at market exchange rates. Purchasing-power conversion is never used.** Unchanged from Phase 1, where the error from confusing the two was measured at a factor of 1.756 and would have understated UBWI by more than 40 %.

**Preferred source: World Bank `PA.NUS.FCRF`**, on the reasoning that it is the only candidate that is simultaneously near-universal in coverage (213 economies), openly licensed under CC BY 4.0, machine-readable through an unauthenticated API that answered HTTP 200, and long enough to support historical reconstruction. The alternatives fail on one leg each: the ECB's reference rates cover about thirty currencies and are EUR-based; the Federal Reserve's H.10 covers roughly twenty; the IMF's IFS is the methodologically best fit and `imf.org` has returned HTTP 403 to this environment across two phases; the UN operational rates are monthly and near-universal but were not established as machine-readable this session.

**Reference-date convention: this is a known, recorded deviation, not a settled choice.**

`PA.NUS.FCRF` is a **period average**. A balance sheet is a **stock at an instant**. The conventional treatment for stocks is the rate prevailing at the date to which the balance sheet relates — end-period — and that is how external positions are conventionally converted. Using an annual average to convert a 31 December stock introduces an error equal to the within-year drift of the exchange rate, which for the yen over 2022 was of the order of ten percent.

The honest position is therefore:

- **the candidate in Part 6 uses annual-average FX**, because that is the rights-clean series that was actually retrieved;
- **the policy for production is year-end FX**, matched to the balance sheet's own reference date;
- **the gap between them is an unquantified error in the current candidate**, disclosed rather than absorbed, and closing it is a Phase 2B task that requires either establishing IMF rights or sourcing year-end rates from each national compiler.

Publication-date FX is rejected outright: it would convert a 2022 stock at a 2026 rate and would make the denominator move with the currency market rather than with wealth.

Two further rules follow from Phase 1 and are restated: the Atlas method is for income comparisons and is wrong for stocks; and `PA.NUS.ATLS` is not the Atlas factor in any case (§2.4).

### 5.3 Missing-country estimation, and the validation the brief demanded

**Do not use GDP shares as a wealth proxy without explicit validation.** Here is the validation, and it cuts both ways.

**At the country level, GDP is a bad proxy for wealth.** Own computation over the 150 CWON economies with both non-human wealth and 2020 GDP:

| statistic | non-human wealth ÷ GDP |
|---|---:|
| minimum | −0.36 |
| 10th percentile | 1.47 |
| 25th percentile | 2.22 |
| **median** | **3.37** |
| 75th percentile | 6.03 |
| 90th percentile | 8.67 |
| maximum | 15.01 |
| GDP-weighted world ratio | **3.958** |

A factor of eight between the tenth and ninetieth percentiles. Any imputation that assigns a single ratio to a named country will be wrong by a large multiple, and no imputed country-level figure should ever be displayed as if it were observed.

**At the aggregate level, and only for a residual, it is serviceable.** A backtest: observe the top *N* economies by GDP, impute the rest three ways, compare to CWON's actuals. Own computation.

| Observed *N* | observed share of wealth | observed share of GDP | true tail | world ratio: tail error | regional peer: tail error | income peer: tail error | **error on the world total** |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 58.13 % | 57.16 % | 139.80 tn | +4.1 % | +5.1 % | +4.9 % | **+2.03 %** |
| 10 | 70.30 % | 69.76 % | 99.19 tn | +2.6 % | +1.7 % | −1.7 % | **−0.49 %** |
| 15 | 79.38 % | 77.72 % | 68.87 tn | +10.4 % | +7.0 % | +5.3 % | **+1.08 %** |
| 20 | 83.67 % | 82.75 % | 54.55 tn | +6.8 % | −3.4 % | +2.0 % | **+0.32 %** |
| 25 | 86.65 % | 86.05 % | 44.59 tn | +5.2 % | −6.0 % | +0.3 % | **+0.04 %** |
| 30 | 88.26 % | 88.48 % | 39.20 tn | −2.1 % | −9.9 % | −7.9 % | **−0.93 %** |
| 40 | 92.78 % | 92.63 % | 24.11 tn | +2.2 % | −6.7 % | −3.1 % | **−0.22 %** |
| 50 | 95.49 % | 95.49 % | 15.05 tn | +0.1 % | −5.2 % | −8.2 % | **−0.37 %** |
| 80 | 98.51 % | 98.66 % | 4.99 tn | −10.3 % | −13.1 % | −16.3 % | **−0.24 %** |
| 100 | 99.20 % | 99.42 % | 2.66 tn | −26.9 % | −27.5 % | −31.4 % | **−0.25 %** |

Three readings.

The tail estimate itself is unreliable — errors of ten to thirty percent are routine, and they get *worse* as the tail gets smaller and more idiosyncratic. But the tail is also small by then, so the error on the world total stays inside ±1 % from *N* = 20 onward. **Imputation is defensible for a residual and indefensible for a country.**

The regional and income-group refinements do not reliably beat the single world ratio. Regional grouping is worse than the plain ratio at six of the eleven cut-points. **Recommendation: use the simplest rule — one wealth-to-GDP ratio estimated from the observed set — because the elaborations add opacity without adding accuracy.**

And the observed-wealth share tracks the observed-GDP share closely at every *N* (58.13 vs 57.16, 83.67 vs 82.75, 95.49 vs 95.49). That near-identity is what makes the method work at all, and it is a property of ranking by GDP rather than an assumption.

**One bias is known and signed.** CWON is a replacement-cost measure. On a *market-value* basis, wealth-to-GDP is higher in rich economies than in poor ones, because dwelling prices relative to income are higher. The observed set is rich. So a market-value imputation using the observed set's own ratio will **overstate** the tail, and the candidate's central case corrects for this with a factor calibrated from CWON itself.

**Policy, stated for the schema:**

1. The imputation rule is a **versioned reference object**, not application code.
2. Every imputed economy is stored as its own row with `is_estimated = true`, the rule version, and the inputs.
3. Imputed rows are **never summed into a component that also contains observed rows** without the split being displayed.
4. The published surface states the observed share and the imputed share, both as percentages of the denominator.
5. A sensitivity range across the imputation rule is published with the value, not in an appendix.

---

## Part 6 — Research-Only Candidate

> **This is a simulation. It is not a published Urdais value, it may not be promoted to one, and no publication may occur under a draft methodology.**

### 6.1 Numerator

Observed 2026-09-14T18:14:20Z to 2026-09-14T18:14:23Z. Block height **967,005**, confirmed independently by `mempool.space/api/blocks/tip/height` and `blockchain.info/q/getblockcount` (both HTTP 200).

```
supply (blockchain.info /q/totalbc, claimed issuance)   20,084,365.00000000 BTC
venue prices (USD)   Coinbase 78,868.305 | Bitstamp 78,873.68 | Kraken 78,874.90
median price                                            78,873.68 USD  (Bitstamp)
venue dispersion                                        6.60 USD = 0.8 basis points

market cap = 20,084,365.00000000 x 78,873.68
           = 1,584,127,778,013.20 USD = 1.584128 trillion USD
```

Three independent venues within a three-second window, so the numerator gate is satisfied.

### 6.2 Denominator — directly observed

National currency figures converted at World Bank `PA.NUS.FCRF` for each component's own reference year. Own computation throughout.

| Economy | Ref. | National net worth, USD tn | W ÷ GDP | Construction |
|---|---|---:|---:|---|
| United States | 2025 | **158.210** | 5.14 | Z.1 `FL892090005` − `LM155111005` |
| Japan | 2022 | 30.581 | 6.88 | OECD `NN` 3,577,255,800 mn JPY + `BF90(W)` 444,068,000 mn JPY ÷ 131.4981 |
| Germany | 2022 | 26.703 | 6.36 | Destatis `Volksvermögen` 25,357.8 bn EUR ÷ 0.9496 |
| France | 2022 | 21.100 | 7.55 | OECD `NN` 20,089,390 + `BF90(W)` −52,518 mn EUR ÷ 0.9496 |
| United Kingdom | 2021 | 16.389 | 5.13 | OECD `NN` 12,236,133 + `BF90(W)` −319,976 mn GBP ÷ 0.7271 |
| Korea | 2022 | 15.781 | 8.77 | OECD `NN` 19,402,793,200 + `BF90(W)` 977,523,500 mn KRW ÷ 1,291.4467 |
| Canada | 2022 | 12.415 | 5.64 | OECD `NN` 15,065,371 + `BF90(W)` 1,093,041 mn CAD ÷ 1.3016 |
| Mexico | 2022 | 10.741 | 7.32 | OECD `NN` 228,354,147 + `BF90(W)` −12,174,742 mn MXN ÷ 20.1273 |
| Russia | 2019 | 6.509 | 3.84 | OECD `NN` 398,751,368 + `BF90(W)` 22,650,541 mn RUB ÷ 64.7377 |
| Sweden | 2022 | 3.717 | 6.46 | OECD `N1N`+`N2N` + `BF90(W)` mn SEK ÷ 10.1143 |
| Czechia | 2022 | 1.877 | 6.22 | OECD `NN` 45,315,686 + `BF90(W)` −1,474,722 mn CZK ÷ 23.3570 |
| New Zealand | 2017 | 0.457 | 2.21 | OECD `NN` + `BF90(W)` mn NZD ÷ 1.4074 |
| **Total observed** | | **304.480** | **5.675** | 12 economies |

**Coverage.**

- **Directly observed: 48.72 % of 2024 world GDP at market exchange rates**, and **57.26 % of the world's non-human wealth** on the CWON 2020 structural weights.
- **Unobserved remainder: 51.28 % of world GDP, $57.26 trillion of 2024 GDP.**

### 6.3 Denominator — imputed residual

The observed set's wealth-to-GDP ratio, each component against its own vintage year's GDP, is **5.675**.

The CWON-calibrated tail adjustment is **k = 0.772**: on CWON's 2020 data, the economies outside this observed set have a wealth-to-GDP ratio of 3.44 against the observed set's 4.46. This is the signed correction of §5.3 — the tail is poorer in wealth terms than in income terms.

| Scenario | tail ratio | imputed, $tn | **W, $tn** | imputed share | **TGW, $tn** | **UBWI, %** |
|---|---:|---:|---:|---:|---:|---:|
| tail ratio = observed ratio (k = 1) | 5.68 | 324.98 | 629.46 | 51.6 % | 631.04 | **0.2510** |
| **central: CWON-calibrated k = 0.772** | **4.38** | **250.93** | **555.41** | **45.2 %** | **556.99** | **0.2844** |
| low: 0.60 × observed | 3.41 | 194.99 | 499.47 | 39.0 % | 501.05 | **0.3162** |
| high: 1.15 × observed | 6.53 | 373.73 | 678.21 | 55.1 % | 679.79 | **0.2330** |

$$\text{TGW} = 555{,}405{,}000{,}000{,}000 + 1{,}584{,}127{,}778{,}013 \approx 556.99\ \text{trillion USD}$$

$$\text{UBWI} = \frac{1.584128}{556.99} \times 100 = \mathbf{0.2844\ \%}$$

Bitcoin is added because every observed vintage predates national implementation of the 2025 SNA asset boundary and therefore contains no crypto assets.

**Candidate: UBWI ≈ 0.2844 %, sensitivity range 0.2330 % to 0.3162 %.**

### 6.4 What the candidate corroborates, and what it does not

| Cross-check | Result |
|---|---|
| Phase 1 candidate (WID, PPP-converted, rights-blocked) | **0.2843 %** against this phase's **0.2844 %** |
| Phase 1 denominator $556.32 tn (2023) | against this phase's $555.41 tn — **0.16 % apart** |
| McKinsey global net worth, end-2024 (unlicensable) | $600 tn, **8.0 % above** this candidate, consistent with vintage drag |
| McKinsey's world wealth-to-GDP | 5.4× against this observed set's **5.675×** |
| Observed share of world wealth vs share of world GDP | 57.26 % vs 48.72 % — wealth is more concentrated than income, as expected |

**Two independent constructions from disjoint sources agreeing to four decimal places is a coincidence in its last two digits and a real result in its first two.** The Phase 1 denominator came from one compiler's world aggregate deflated by a GDP-based PPP factor. This one came from twelve national compilers summed and a GDP-based residual. They share no input except the concept and the World Bank's GDP series. Landing 0.16 % apart on a $555 trillion quantity is the strongest available evidence that Total Global Wealth is a measurable object rather than a definitional preference.

**None of that makes this publishable.** The candidate's central case is **45.2 % imputed**. Its observed half spans reference years 2017 to 2025. Its FX conversion uses period-average rates on end-period stocks. Eleven of its twelve observed economies rest on interfaces whose terms have never been retrieved. Any one of those would block publication under the existing gates; together they are not close.

### 6.5 Earliest defensible historical date

**Unchanged at 31 December 2013**, and still binding on the numerator, not the denominator. A three-venue median cannot be reconstructed for the era when price discovery sat on a single venue that later failed.

The denominator's own history is now better understood than in Phase 1: Germany's national net worth runs from 1999, the Fed's from well before that, and the OECD's Table 9B from 1970 for some reference areas. The constraint on a *consistent* historical denominator is that the observed set's composition changes through time, so a backward series would silently vary its own coverage. **Any historical reconstruction must hold the observed set fixed or publish the coverage share alongside each point.**

---

## Part 7 — Rights Matrix

Two axes, Urdais vocabulary. A source reaches production only when both read `permitted`.

| Source | Interface | Retrieval | Data use | Written agreement | Production state | Evidence |
|---|---|---|---|---|---|---|
| **World Bank** | Indicator API (WDI, CWON) | **permitted** | **permitted** | no | **production_approved** eligible | CC BY 4.0 at `datacatalog.worldbank.org/public-licenses`, HTTP 200: *"copy, modify and distribute data in any format for any purpose, including commercial use"* |
| World Bank | Report PDFs / Open Knowledge Repository | not permitted | not permitted | yes | production_blocked | Terms of use for non-dataset materials: *"you may not make any derivative work or commercial use ... without the prior written consent"* |
| **Federal Reserve** | Z.1 release and DDP bundle | **under review** | **under review** | undetermined | production_review_pending | No copyright notice in 205 pages of the release; `aboutthefed/legal.htm` and `credit-and-copyright.htm` both HTTP 404. **No express grant retrieved.** |
| **OECD** | `sdmx.oecd.org` public REST | **not reviewed** | **not reviewed** | undetermined | production_review_pending | Data API HTTP 200; terms page **HTTP 403** to curl with browser headers and to WebFetch; archived responses are Cloudflare interstitials. Same failure as Phase 1. |
| **Destatis / Bundesbank** | *Vermögensbilanzen* workbook | **not reviewed** | **not reviewed** | undetermined | production_review_pending | Retrieved artifact carries `© Statistisches Bundesamt (Destatis), 2023` and **no licence grant**. Publication discontinued after reference year 2022. |
| **Eurostat** | Dissemination API | not reviewed | not reviewed | undetermined | production_review_pending | Reuse policy not retrieved this session. Data retrieval itself failed (HTTP 413 / 406 / 400). |
| WID.world | Bulk CSV | not reviewed | not reviewed | yes | production_blocked | Phase 1: terms page HTTP 404, no licence file. Unchanged. |
| McKinsey Global Institute | Report PDF | not permitted | **not permitted** | yes | production_blocked | *"Any use of this material without specific permission of McKinsey & Company is strictly prohibited."* |
| UBS | Global Wealth Report | not permitted | not permitted | yes | production_blocked | Prior written permission required; systematic retrieval to compile a database separately prohibited. |
| IMF | `imf.org`, elibrary | not reviewed | not reviewed | undetermined | production_review_pending | HTTP 403 across both phases. No figure used. |

**The shape of the problem has changed.** In Phase 1, two sources measured the right thing and both *refused*. In Phase 2A, five sources measure the right thing and four of them have simply *never been asked*, because their terms could not be read. Unretrieved terms and refused terms are different states with different remedies, and the registry's vocabulary already distinguishes them.

---

## Part 8 — Architecture Implications

See [the updated UBWI data architecture proposal](../architecture/ubwi-data-architecture.md). In summary, and with no migration created by this phase:

- the denominator is no longer one vintage row but **a vintage plus a set of per-economy components**, so `pipeline.wealth_vintage_components` needs an economy dimension and the reconciliation constraint has to sum components to the vintage total;
- each economy component needs `is_estimated`, `estimation_rule_version`, `reference_date`, `currency`, `fx_rate`, `fx_basis`, `fx_source`, `land_treatment`, `corporate_valuation_basis`, `consumer_durables_treatment`, and the stripped-durables amount;
- the vintage needs `observed_gdp_coverage_share` and `imputed_share_of_total`, and a constraint that refuses publication above a configured imputed-share ceiling;
- the estimation rule is reference data with a version, not code;
- nothing about UCPI's market breadth, seller, region or capacity semantics is reused, and the UCPI calculation calendar remains inapplicable.

---

## Part 9 — Outreach

One draft is held, for the OECD, at [`docs/architecture/sources/oecd-permission-request.md`](../architecture/sources/oecd-permission-request.md). **Nothing has been sent.**

The OECD is the only outreach target where a single grant materially unlocks the denominator: it is the harmonised route to nine of the twelve observed economies, it is machine-readable and unauthenticated, and the only thing missing is a readable statement of terms. The request is framed accordingly — it asks first for the terms that apply, and only second for permission, because it is entirely possible that the OECD's published licence already permits this and Urdais simply cannot reach the page.

No outreach is drafted for Destatis, Eurostat or the Federal Reserve. For all three the next step is retrieval rather than permission: their terms plausibly exist and have not been read. Asking an organisation for permission it may already have granted in writing is a way of getting a slow answer to a question the web would answer faster.

No outreach is drafted for China, India, Brazil, Indonesia or Saudi Arabia, because the gap there is that the statistic is not compiled. Permission cannot create data.

---

## Part 10 — Product Defect Fixed

Phase 1 recorded that the market catalog carried UBWI as an index with a mock level near `1342.57 pts`. That is a category error, not a stale number: UBWI has no base date, no base value, and the methodology states that any presentation of it as a points series is wrong.

**Fixed in this phase.** The unit is now `%`, the market carries the definition and the question from the methodology draft, and tests assert the percentage unit on every surface, that every demo point stays inside `[0, 100]`, and that the formal term is Total Global Wealth.

**The demo walk remains a demo walk.** No candidate computed in either phase has been seeded into the product, and the anchor is deliberately unrelated to any of them. The methodology is a draft with no effective date and publishing under a draft is prohibited.

---

## Decision

> ### Methodology viable, denominator still blocked.

The methodology needs no amendment. Phase 1 chose the SNA national-wealth identity on reasoning, and this phase found a G7 central bank publishing that identity under its own name, quarterly, with the same sentence in its footnote. The concept is right and it is measurable.

What is not yet true is that Urdais can measure it. Three things stand in the way, in order of difficulty.

**Coverage is the binding constraint, and it is not a rights problem.** Forty-nine percent of world GDP observed means forty-five percent of the denominator is a model. China is seventeen percent of world GDP and does not publish an official national balance sheet; no permission grant changes that. The realistic path to a publishable coverage share runs through Eurostat's query problem, Australia's missing net foreign position, and national compilers for Italy, Spain, the Netherlands and Switzerland — and even then China, India, Brazil and Indonesia remain imputed.

**Four of the five sources the candidate depends on have never had their terms read.** That is a cheaper problem than Phase 1's, because "unretrieved" is not "refused". The Federal Reserve is the most likely to clear and carries the most weight. The OECD is the highest-value single grant.

**The candidate's own construction has two disclosed defects** — mixed vintages spanning 2017 to 2025, and period-average FX applied to end-period stocks — that must be closed before any value could be defended, independently of coverage and rights.

Against that, the phase produced a real result. Two constructions sharing no source but the concept and one GDP series landed on denominators 0.16 % apart and candidate values of 0.2843 % and 0.2844 %. **Bitcoin is between a quarter and a third of one percent of presently existing global net wealth**, and Urdais can now say so from sources it retrieved itself.

**Not proceeding to production implementation. No production tables are created. No UBWI value is published.**

---

## Open Questions Carried Forward

1. **Does Eurostat hold `N2N` and `N211N` data, or only the codes?** The single highest-value unanswered question. Determines whether country-level aggregation reaches the high seventies of world GDP or stalls below fifty. A query-syntax problem, not a rights problem.
2. **Australia's net foreign position.** `NN` is already observed; the ABS publishes the net IIP. Worth 3.42 % of world wealth for one retrieval.
3. **Can the OECD's terms be read at all** from any environment, or does this require the outreach draft?
4. **Does the Federal Reserve publish an express rights statement**, and where?
5. **Is there any official Chinese national balance sheet**, or is the NIFD/CASS research series the only construction that exists?
6. **Year-end FX from a rights-clean source with near-universal coverage.** Without it the conversion stays on period averages and the error stays unquantified.
7. **What coverage threshold does the methodology adopt?** This study recommends an imputed-share ceiling of 25 %, with reasons; it does not set it.
8. **How is the US public-land omission disclosed** — as a named limitation, or adjusted for, and if adjusted, from what rights-clean source?
9. Carried unchanged from Phase 1: WID's licence; non-Bitcoin crypto in the denominator; the numerator venue set and its change rule.

---

## Sources and Evidence

All retrieved 14 September 2026.

**Verified by direct call.** [Federal Reserve Z.1 release PDF](https://www.federalreserve.gov/releases/z1/current/z1.pdf) (HTTP 200, 205 pages, read in full); [Z.1 DDP CSV bundle](https://www.federalreserve.gov/releases/z1/data/FRB_Z1_csv.zip) (HTTP 200, 7,783,341 rows parsed); [Z.1 release-table CSV bundle](https://www.federalreserve.gov/releases/z1/current/z1_csv_files.zip) (HTTP 200, 307 files); [Z.1 release page](https://www.federalreserve.gov/releases/z1/) (HTTP 200). OECD SDMX public REST at `https://sdmx.oecd.org/public/rest/` — dataflow, datastructure, availableconstraint and data endpoints for `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE9B,1.0` and `OECD.SDD.NAD,DSD_NASEC20@DF_T720R_A,1.0`, all HTTP 200. [World Bank indicator API](https://api.worldbank.org/v2/) — `NY.GDP.MKTP.CD` (2020, 2024, 2017–2025), `PA.NUS.FCRF`, `PA.NUS.ATLS`, `country`, and source 59 indicators `NW.TOW.TO.CD`, `NW.HCA.TO.CD`, `NW.PCA.TO.IN.CD`, `NW.NCA.TOTL.TO.CD`, `NW.NCA.SSOI.TO.CD`, `NW.NFA.TO.CD`, `NW.NFL.TO.CD`, all HTTP 200. [World Bank dataset licence page](https://datacatalog.worldbank.org/public-licenses) (HTTP 200); [World Development Indicators catalog entry](https://datacatalog.worldbank.org/search/dataset/0037712/World-Development-Indicators) (HTTP 200); [World Bank terms of use for datasets](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) (HTTP 200). [Destatis *Sektorale und gesamtwirtschaftliche Vermögensbilanzen* workbook](https://www.destatis.de/DE/Themen/Wirtschaft/Volkswirtschaftliche-Gesamtrechnungen-Inlandsprodukt/Publikationen/Downloads-Vermoegensrechnung/vermoegensbilanzen-xlsx-5816103.xlsx) (HTTP 200, parsed). Eurostat dissemination API `nama_10_nfa_st` and `nasa_10_f_bs` (structure read; data queries HTTP 413 / 406 / 400 — **no figure used**). Numerator: [blockchain.info total supply](https://blockchain.info/q/totalbc) and [block count](https://blockchain.info/q/getblockcount), [mempool.space tip height](https://mempool.space/api/blocks/tip/height), [Coinbase spot](https://api.coinbase.com/v2/prices/BTC-USD/spot), [Bitstamp ticker](https://www.bitstamp.net/api/v2/ticker/btcusd/), [Kraken ticker](https://api.kraken.com/0/public/Ticker?pair=XBTUSD), all HTTP 200.

**Attempted and not retrieved. No figure from any of these is used.** `https://www.oecd.org/en/about/terms-conditions.html` — HTTP 403 to curl with full browser headers and to WebFetch; cached responses are Cloudflare interstitials. `https://www.federalreserve.gov/aboutthefed/legal.htm` and `https://www.federalreserve.gov/credit-and-copyright.htm` — HTTP 404. `https://www.federalreserve.gov/releases/z1/current/html/b1.htm` and the dated variant — HTTP 404 (the table is `S1.b` in the current release, not `B.1`). Eurostat data queries as above. Destatis English balance-sheet table page — HTTP 404.

**Carried from Phase 1 without retesting.** WID.world licence state; McKinsey and UBS terms; IMF HTTP 403; the CWON valuation-basis disproof.

---

## Research History

**14 September 2026**: Phase 2A. Established that the SNA national-wealth identity is published directly by the Federal Reserve for the United States, that the OECD's harmonised route delivers a total non-financial asset stock for only ten economies because land is the binding constraint, that Germany's national net worth is retrievable but discontinued after reference year 2022, and that twelve economies covering 48.72 % of world GDP can be observed today. Produced a research-only candidate Total Global Wealth of $556.99 tn and a research-only candidate UBWI of 0.2844 % with a sensitivity range of 0.2330 % to 0.3162 %, 45.2 % of the denominator imputed. Corrected the UBWI display-unit defect. Decision: methodology viable, denominator still blocked — on coverage rather than on permission.

Three things were checked and turned out other than expected, and are recorded because each would otherwise be repeated.

**The OECD's "37 countries" is not 37 balance sheets.** It is 37 reference areas reporting *fixed assets*. The total non-financial asset stock exists for ten. The two figures sit in the same dataflow under different asset codes, and the larger one is the one that appears in summaries. Phase 1 recorded the larger number in good faith; this phase read the availability constraint per asset code and found the difference.

**The Federal Reserve table is `S1.b`, not `B.1`.** Every path built on the older `b1.htm` name returns HTTP 404, and the release-table CSV bundle does not contain the table at all — only the much larger DDP bundle does. A source can be public, current and free and still take three wrong retrievals to reach.

**`PA.NUS.ATLS` is not the Atlas conversion factor.** Its own published name is "DEC alternative conversion factor". The code reads like an abbreviation of "Atlas" and is not one, and nothing in the response warns the caller.
