# UBWI Phase 2B — Raising Rights-Cleared Observed Coverage

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. No production value, ingestion contract, schema, migration or collector is created by this document. Every figure below is either evidence about a source or a labelled research candidate; **none is a published Urdais value**, and no UBWI value is published, seeded or promoted by this phase.

Continues [the Phase 2A source study](./ubwi-phase2a-denominator-source-study.md) and [the Phase 1 source study](./ubwi-phase1-source-study.md), supports [UBWI 0.1.0-draft](/docs/methodology/ubwi), and is accompanied by [the China source study](./ubwi-china-source-study.md). **No amendment to the methodology is proposed or required.** The denominator concept is unchanged: consolidated world net worth at market value, excluding human capital, on national-balance-sheet logic, with Bitcoin inside its own denominator and no lost-coin adjustment.

## The question

> **Can Urdais raise directly observed, rights-cleared Total Global Wealth coverage from the Phase 2A level toward at least ~80 % of world GDP without changing the denominator concept?**

## Headline Result

> ### No — and the phase established why, with a number.

**Coverage rose materially and rights went from unresolved to largely resolved. Neither gets to 80 %, and 80 % is not reachable at all.**

**One. The rights wall came down.** Phase 2A's candidate rested on five sources, four of which had terms that had never been read; the rights-cleared share of the denominator was **zero**. This phase retrieved licence texts for the Federal Reserve, the OECD, Eurostat, the ABS, CBS, Istat and Destatis. **The OECD terms page, which returned HTTP 403 across two prior phases, returned HTTP 200** to a plain `urllib` request carrying a current Chrome `User-Agent` plus `Accept` and `Accept-Language`, and it grants both axes outright. **The Federal Reserve's express grant exists** and is on `disclaimer.htm`, not on the two pages Phase 2A tried. Rights-cleared coverage went from **0 % to 47.66 % of world GDP** without sending a single message.

**Two. Coverage rose from 48.72 % to 53.99 % of world GDP**, on 16 economies rather than 12, adding **Australia**, **Italy**, the **Netherlands** and **Austria**, and refreshing France, Sweden and Czechia to reference year 2025. The summed observed national net worth is **$344.514 tn**.

**Three. Eurostat — Phase 2A's "single most valuable unanswered question" — is answered, and the answer is no.** The query problem was a wrong-dataset problem: `nama_10_nfa_st` is *Capital stocks by industry*, has no sector dimension and carries only fixed-asset codes. The right dataset is **`nama_10_nfa_bs`**, *Capital stocks by sector and detailed asset type*, and it answers HTTP 200 immediately. It carries produced assets for 11 geographies and **non-produced assets for six** — AT, CZ, FR, NO, SE, UK. **Italy, Spain, the Netherlands, Poland and Belgium have no non-produced total in Eurostat at all.** The Eurostat route did not unlock southern and central Europe; it added Austria, and it added fresh vintages. Italy and the Netherlands came from their national compilers instead.

**Four. The ceiling is 62.93 % of world GDP, and 80 % is arithmetically unreachable without China.** Counting every economy that today publishes a valued total non-financial asset stock, plus every one blocked only on a missing net-foreign-position year, plus — generously — every EU/EFTA/OECD economy that currently publishes fixed assets only *as if each began publishing land and a non-produced total tomorrow*, the maximum is **62.93 %**. Adding China would give **79.70 %**; China and India together, **83.07 %**. [China is not observable and not constructible](./ubwi-china-source-study.md), for reasons no permission or effort can change.

**Five. The evidence does not support 80 % as the right threshold.** Re-running the leave-out validation at seven coverage levels shows the world-total error and the composition-sensitivity band improving **smoothly and without a kink**: the p10–p90 band on 400 random observed sets narrows from 17.76 pp at 50 % coverage to 9.03 pp at 80 % to 4.27 pp at 90 %. There is no coverage level at which imputation stops being a model and starts being a measurement. 80 % was a plausible guess; the data says it is a point on a curve.

**Decision: methodology viable, coverage still insufficient.** The blocker has not moved since Phase 2A — it is coverage, not permission — but it is now measured rather than estimated, and it is now known to be a *ceiling* rather than a *gap*.

## Method and Evidence Standard

Unchanged from Phase 2A and restated because this phase overturns two Phase 2A findings and one Phase 2A input series, and the standard is what made that possible.

Every figure was retrieved on 14 September 2026 unless stated, from a named source with a URL, with the HTTP status of each retrieval recorded. Figures Urdais computes rather than reads are labelled **own computation** with their inputs. Documents that could not be retrieved are recorded as unretrieved and **no figure from them is used**. A retrieval failure is a fact about the retrieval, not about the source — the rule that made the OECD re-attempt worth making.

Search engines were used only to locate documents and are never cited as evidence.

---

## Part 1 — Corrections to Phase 2A

Four, recorded first because each would otherwise propagate.

### 1.1 The OECD terms are readable, and they permit everything Urdais needs

`https://www.oecd.org/en/about/terms-conditions.html` returned **HTTP 200, 1,482,983 bytes**, title *Terms & Conditions | OECD*, to `urllib.request` with these three headers and nothing else:

```
User-Agent:      Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
                 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36
Accept:          text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
```

Two other spellings of the same page (`/termsandconditions/`, `/en/about/terms-and-conditions.html`) and `oecd-ilibrary.org/oecd/terms` still return **HTTP 403** with a Cloudflare interstitial, so the gate is real and path-specific; the canonical path is simply not gated. A Wayback snapshot of the same canonical URL returns the same text, which corroborates it independently.

**This retires the Phase 2A outreach draft.** See Part 5.

### 1.2 The Federal Reserve publishes an express grant

Phase 2A recorded "no express grant retrieved" after `aboutthefed/legal.htm` and `credit-and-copyright.htm` returned HTTP 404. The grant is at **`https://www.federalreserve.gov/disclaimer.htm`** (HTTP 200, 85,130 bytes), under the heading *Copyright/trademark*:

> "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information."

The United States is 26.2 % of world GDP and the largest single component of the denominator. **This one retrieval is worth more than every other rights finding in the phase combined.**

### 1.3 Eurostat's `nama_10_nfa_st` is the wrong dataset, and the HTTP 413 was a symptom

Phase 2A described `nama_10_nfa_st` as *"Capital stocks by sector and detailed asset type"* exposing `N1N`, `N2N`, `N211N` for sectors `S1`, `S11`, `S12`, `S13`, `S14_S15`. Retrieved directly, the dataset's own metadata says otherwise:

| | `nama_10_nfa_st` | `nama_10_nfa_bs` |
|---|---|---|
| Label | **Capital stocks by *industry* (NACE Rev.2) and detailed asset type** | Capital stocks by **sector** and detailed asset type |
| Dimensions | `freq, unit, nace_r2, asset10, geo, time` — **no `sector`** | `freq, unit, sector, asset10, geo, time` |
| Asset codes | 28, all `N11*` — **fixed assets only** | 25, including `N1N`, `N2N`, `N21N`, `N211N`, `N212N` |
| Units | `CLV*`, `CRC*`, `PYR*` — volumes and replacement cost | **`CP_MNAC`, `CP_MEUR` — current prices** |

Filtering `nama_10_nfa_st` by `sector=S1` returns `INVALID_QUERY_DIMENSION: Dimension "SECTOR" is not defined`. Phase 2A's repeated `HTTP 413 EXTRACTION_TOO_BIG` was the server refusing an unfiltered extraction because the filter named a dimension that did not exist. **Not a rate limit, not a syntax quirk: the wrong dataset.**

### 1.4 The OECD's net-foreign-position series does not agree with Eurostat's, and Phase 2A's candidate used the OECD one

France is the only economy in the observed set reachable by both routes. Own computation, EUR millions:

| Year | OECD `BF90`, `COUNTERPART_AREA=W` | Eurostat `nasa_10_f_bs` `BF90`, `S1`, consolidated |
|---|---:|---:|
| 2019 | −76,588 | −442,017 |
| 2020 | −107,121 | −458,703 |
| 2021 | −189,977 | −519,835 |
| 2022 | **−52,518** | **−431,822** |

France's published net international investment position is of the order of −€0.6 to −0.9 tn over this period. **The Eurostat series is the right order of magnitude and the OECD series is not.** The non-financial totals, by contrast, agree closely — OECD `NN` 2022 of 20,089,390 against Eurostat `N1N+N2N` 2022 of 20,397,676, **1.5 % apart** — which is a genuine corroboration of both routes on the large term and isolates the problem to the financial term.

**Bounded impact.** Seven rows in this phase's candidate still take their net foreign position from the OECD series (Japan, Korea, Canada, Mexico, Russia, New Zealand, the United Kingdom). Their combined net-foreign-position content is **+$4.174 tn against $344.514 tn of observed denominator — 1.2 %**. Even if that series were wrong by 100 % the observed denominator would move by 1.2 %. **Recorded as a disclosed defect with a bounded magnitude, and as a named task: verify each against its own compiler's published IIP before any production use.**

---

## Part 2 — Gap-Priority Table

Ranked by 2024 share of world GDP (World Bank `NY.GDP.MKTP.CD`, `lastupdated` 13 July 2026, world total $111,669,432,109,121). CWON non-human wealth shares are own computation from World Bank source 59, reference year 2020.

| Economy | GDP share | Wealth share | National balance sheet? | Total non-fin? | Land? | NFA / ROW? | Latest | Status after this phase |
|---|---:|---:|---|---|---|---|---|---|
| **China** | **16.77 %** | **13.85 %** | **no** | no | **hectares only** | yes (SAFE, 2025) | — | **Blocked. Not a rights problem.** [Study](./ubwi-china-source-study.md) |
| **India** | 3.37 % | 2.77 % | no | no | no | OECD 2020 | — | Not established. Financial side only. |
| **Italy** | 2.13 % | 1.65 % | **yes (by sector)** | yes | **yes** | yes | **2024** | **ADDED.** Istat/BdI sum of sectors. Rights under review. |
| **Brazil** | 1.96 % | 1.30 % | no | no | no | OECD 2020 | — | Not established. |
| **Australia** | 1.57 % | **3.42 %** | **yes, published outright** | yes | **yes (47 % of NFA)** | yes | **30 Jun 2025** | **ADDED.** ABS. CC BY 4.0. |
| **Spain** | 1.55 % | 0.73 % | no | **no** | no | yes | 2023 | Eurostat has fixed assets + inventories only. |
| **Indonesia** | 1.25 % | 0.86 % | no | no | no | no | — | Not established. |
| **Türkiye** | 1.22 % | 0.27 % | no | no | no | yes | 2025 | Financial side only. |
| **Saudi Arabia** | 1.12 % | 0.62 % | no | no | no | no | — | Not established. |
| **Netherlands** | 1.09 % | 1.20 % | **yes** | **yes (market value)** | **yes (44 % of NFA)** | yes | **2025** | **ADDED.** CBS 85953NED + Eurostat. CC BY 4.0. |
| **Switzerland** | 0.87 % | 1.34 % | no | no | no | yes | 2022 | Financial side only in OECD. |
| **Poland** | 0.80 % | 0.53 % | no | no | no | yes | 2025 | Fixed assets + inventories only. |
| **Belgium** | 0.60 % | 0.45 % | no | no | no | yes | 2025 | Fixed assets + inventories only. |
| **Argentina** | 0.57 % | 0.44 % | no | no | no | no | — | Not established. |
| **Ireland** | 0.50 % | 0.24 % | no | no | no | yes | 2025 | Fixed assets only. GDP is distorted; see Part 4. |
| **Austria** | 0.48 % | 0.35 % | **constructible** | **yes** | **yes** | yes | **2023** | **ADDED.** Eurostat `N1N+N2N`. |
| **Norway** | 0.45 % | 1.08 % | partly | `N2N` stops at **2014** | no | yes 2025 | 2022/2014 | **Rejected.** An eight-year gap would be silent interpolation. |
| **Denmark** | 0.43 % | 0.35 % | no | no | no | yes | 2025 | Fixed assets + inventories only. |
| **Finland** | 0.30 % | 0.36 % | partly | no `N2N` | yes 2024 | yes | 2024 | `N1N` and land but no non-produced total. |
| **Portugal** | 0.28 % | 0.16 % | partly | no `N2N` | no | yes | 2023 | `N1N` only. |
| Remaining ~185 economies | ~10 % | ~9 % | — | — | — | — | — | Individually immaterial; collectively imputed. |

**The pattern is unchanged from Phase 2A and is now measured across two independent compilers.** Land is the binding constraint. Eurostat publishes land (`N211N`) for ten geographies and a non-produced total (`N2N`) for six; the OECD publishes land for seventeen reference areas and a non-financial total for ten. The economies that fail do not fail on permission, on retrieval or on language. They fail because their compiler has never valued the ground.

---

## Part 3 — What Was Added, and How

### 3.1 Australia — the ABS publishes the identity outright, quarterly-aligned and current

`https://www.abs.gov.au/statistics/economy/national-accounts/australian-system-national-accounts/2024-25/5204010_National_Balance_Sheet.xlsx` (**HTTP 200**, 114,704 bytes, parsed). *5204.0 Australian System of National Accounts, Table 10. National Balance Sheet*, current prices, **as at 30 June 2025**, A$ billions:

| Series ID | Item | A$ bn |
|---|---|---:|
| `A2421113V` | Non-financial assets | 22,077.3 |
| `A2421132A` | — of which **Land** | **10,373.6** |
| `A2421138R` | Financial assets with the rest of the world | 4,362.0 |
| `A2421145L` | Liabilities to the rest of the world (incl. share capital) | 5,026.7 |
| **`A2421151J`** | **NET WORTH** | **21,412.6** |

Own computation: 22,077.3 + 4,362.0 − 5,026.7 = **21,412.6**, reproducing the published net worth exactly. This is the SNA national-wealth identity, presented already consolidated against the rest of the world — the same statement as the Fed's S1.b, from the other side of the world.

**Land is 47.0 % of Australian non-financial assets.** That single number is the best available illustration of what the economies without a land valuation are missing.

**Consumer durables are outside** — the table's asset list runs produced/non-produced with no durables line, consistent with the SNA asset boundary and requiring no stripping.

**Rights: cleared.** `https://www.abs.gov.au/website-privacy-copyright-and-disclaimer` (HTTP 200, page release date 13 April 2026): *"All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence"*, excepting the Coat of Arms, the ABS logo, trade marks, **unit record data (microdata)**, third-party content, sub-brands and branding artwork. A published time-series workbook is none of these.

**One disclosed comparability issue.** Australia's reference date is **30 June**, not 31 December. Every other economy in the observed set is a calendar year-end. The denominator therefore mixes a mid-year stock into a year-end aggregate, and the FX conversion has been matched to 30 June 2025 accordingly. This must be a stored, displayed field, not a footnote.

### 3.2 Netherlands — CBS publishes non-financial assets at market value through 2025

CBS StatLine open-data table **`85953NED`, *Niet-financiële balansen; nationale rekeningen***, `Modified` 28 August 2026, period 1995–2025, retrieved through `https://opendata.cbs.nl/ODataApi/odata/85953NED/` (HTTP 200). The table's own description: *"De balans geeft de **marktwaarde** van de niet-financiële activa"* — the balance sheet gives the **market value** of non-financial assets.

Sector `A044923` (Totaal alle sectoren), `Eindbalans` at end-2025, EUR million:

| Code | Item | EUR mn |
|---|---|---:|
| `AN11` | Vaste activa (fixed assets) | 3,346,755 |
| `AN12` | Voorraden (inventories) | 160,584 |
| **`AN211`** | **Grond (land)** | **2,724,051** |
| `AN212` | Olie- en gasreserves | 28,356 |
| **`T001482`** | **Niet-financiële activa** | **6,259,747** |

Own computation: the four components sum to 6,259,746 against a published total of 6,259,747 — a one-million rounding difference on €6.3 tn.

Net financial worth from Eurostat `nasa_10_f_bs`, `BF90`, `S1`, consolidated, end-2025: **+558,590** EUR mn. **Netherlands national net worth = €6,818,337 mn = €6.818 tn.**

**Independently corroborated by CBS's own prose.** CBS states the Netherlands' end-2024 wealth was *"bijna 6,5 biljoen euro"* comprising 0.7 tn financial and 5.8 tn non-financial. Own computation from the retrieved data: end-2024 non-financial assets **5,804,674** EUR mn = €5.80 tn, end-2024 `BF90` **725,326** EUR mn = €0.73 tn, total €6.53 tn. **The identity Urdais is assembling is the identity CBS is describing.**

**Land is 43.5 % of Dutch non-financial assets.** **Consumer durables are not in the table's asset list.**

**Rights: cleared.** `https://www.cbs.nl/en-gb/about-us/website/copyright` (HTTP 200): *"Unless otherwise stated, the content of this website is subject to Creative Commons Attribution (CC BY 4.0)."*

### 3.3 Italy — Istat and Banca d'Italia publish it by sector; the total is a sum

*La ricchezza dei settori istituzionali in Italia: 2005–2024*, joint Istat / Banca d'Italia, **28 January 2026**, retrieved from `https://www.istat.it/wp-content/uploads/2026/01/Nota_Ricchezza_Istat_Bankitalia_2026.pdf` (**HTTP 200**, 756,131 bytes, 27 pages, parsed). Net wealth at end-2024, EUR billions, quoted from the publication:

| Sector | *Ricchezza netta* | EUR bn |
|---|---|---:|
| Famiglie (households incl. NPISH) | 「la ricchezza netta delle famiglie italiane … è stata pari a 11.732 miliardi di euro」 | 11,732 |
| Società non finanziarie | 「la ricchezza netta delle società non finanziarie è risultata pari a 1.015 miliardi」 | 1,015 |
| Società finanziarie | 「la ricchezza netta delle società finanziarie è aumentata (610 miliardi di euro…)」 | 610 |
| Amministrazioni pubbliche | 「negativa per 1.522 miliardi di euro」 | −1,522 |
| **Total economy** | **own computation** | **11,835** |

Summing sector net worth *is* the national identity — intra-domestic claims are each an asset of one sector and a liability of another and cancel exactly — and the publication's own methodological note confirms the underlying accounts are compiled for the total economy: 「I Conti patrimoniali sono compilati per i settori istituzionali residenti, **per il totale dell'economia nazionale** e per il resto del mondo」.

**Independent plausibility check, own computation.** Eurostat gives Italy fixed assets of €6,998 bn and inventories of €492 bn for 2024 — **with no land** — plus `BF90` of €325 bn, a lower bound of €7,815 bn. The gap to €11,835 bn is **€4,020 bn, 34 % of the total**, which must be land, other non-produced assets and valuables. That share sits squarely between Australia's 47 % and the Netherlands' 43.5 % of *non-financial* assets. The construction behaves like its peers.

**Two disclosed incompletenesses, stated by the compiler.** 「Quella degli stock delle attività non finanziarie, elaborata dall'Istat … non è ancora completa per la non disponibilità di dati su alcune attività patrimoniali di più complessa misurazione, quali i monumenti, gli oggetti di valore e talune attività non finanziarie non prodotte (ad esempio, risorse naturali diverse dai terreni)」 — monuments, valuables and natural resources other than land are missing. **The Italian figure is a one-directional understatement**, and land itself is included.

**Rights: under review, and this is a real open question rather than a formality.** Istat's legal notice (`https://www.istat.it/en/legal-notice/`, HTTP 200) is *Creative Commons Attribution 4.0*, expressly *"for any purpose, even commercially"*. Banca d'Italia's copyright page (`https://www.bancaditalia.it/footer/copyright/index.html`, HTTP 200) is the opposite: 「Il copyright e ogni altro diritto su questo sito spetta alla Banca d'Italia … senza preventiva autorizzazione scritta della Banca. **Fanno eccezione gli open data della Banca d'Italia, inclusi nel portale AgID** … rilasciati con licenza Creative Commons Attribuzione 4.0 Internazionale (CC-BY 4.0)」 — the website requires prior written authorisation; only the AgID open data are CC BY 4.0. The artifact Urdais retrieved is Istat-hosted, and Eurostat's own exception list flags *"co-publications between Eurostat and other publishers"* as a category where the permissive default does not apply. **Italy is recorded `under review` on the data-use axis.** The named remedy is to re-source the financial component from Banca d'Italia's AgID open data and the non-financial component from Istat, so that each leg carries its own CC BY 4.0.

### 3.4 Austria, and fresher vintages for France, Sweden and Czechia

`nama_10_nfa_bs` filtered to `sector=S1`, `unit=CP_MNAC`, all geographies, per asset code. Own computation of availability:

| Code | Item | Geographies | Latest by geography |
|---|---|---:|---|
| `N1N` | Produced assets, net | 11 | CZ FR SE **2025**; AT FI NL **2024**; HU LV PT 2023; NO 2022; UK 2019 |
| **`N2N`** | **Non-produced assets, net** | **6** | CZ FR SE **2025**; AT 2023; **NO 2014**; UK 2019 |
| `N211N` | Land | 10 | CZ FR SE 2025; DE FI NL SK 2024; AT EE 2023; UK 2019 |
| `N11N` | Fixed assets, net (*not a balance sheet*) | 32 | mostly 2023–2025 |
| `N12N` | Inventories | 25 | mostly 2023–2025 |
| `BF90` (`nasa_10_f_bs`, S1, consolidated) | Net financial worth | **35** | almost all **2025** |

The asymmetry Phase 2A found at the OECD reproduces exactly at Eurostat: **35 geographies have a net foreign position and six have a non-financial total to add it to.**

New: **Austria** (2023, `N1N`+`N2N`+`BF90`, land reported). Refreshed: **France 2022→2025**, **Sweden 2022→2025**, **Czechia 2022→2025**. Rejected: **Norway**, whose `N2N` stops at 2014 while `N1N` runs to 2022 — closing an eight-year gap would be silent interpolation of an asset stock, which the brief forbids and the methodology's vintage rule forbids.

**Rights: cleared, with one exception that bites.** `https://ec.europa.eu/eurostat/web/main/help/copyright-notice` (HTTP 200):

> "Reuse of statistical data, metadata, publications, and other dissemination tools published on this website for commercial or non-commercial purposes is authorised provided the source is acknowledged."
> "There is no special procedure or requirement for a written licence. Just download the material and use it, unless the material is listed in the exceptions above."

The exception:

> "The following Eurostat data and documents **may not be reused for commercial purposes** … **Data for countries other than: Member States of the European Union (EU), Member States of the European Free Trade Association (EFTA), official EU acceding and candidate countries.** Examples are data for the United States of America, Japan or China. In such cases, the user will need to eliminate these data from the tables before reusing them commercially."

**This blocks the United Kingdom on the Eurostat route.** The UK is not an EU Member State, not EFTA, and not an acceding or candidate country. Eurostat's UK rows — which are the 2019 vintage in any case — have been dropped, and the UK is taken from the OECD route at reference year 2021, where the OECD's own terms permit commercial reuse without a country restriction. **Recorded as a standing rule for the ingestion design: the Eurostat interface is licensed per-country, not per-dataset.**

### 3.5 Germany — the grant Phase 2A could not find, on a publication that is still discontinued

`https://www.destatis.de/EN/Service/Legal-Notice/_node.html` (HTTP 200):

> "The following applies for all standard publications of the Federal Statistical Office, either in printed or electronic form, and for the content of our website www.destatis.de, **including charts and downloadable products**, unless additional or other information is given on the product/website itself. © Statistisches Bundesamt (Destatis), 2026. **Reproduction and distribution, also of parts, are permitted provided that the source is mentioned.**"

and separately:

> "Copyright for the Genesis-Online database … **Data licence Germany – attribution – version 2.0**"

**Destatis retrieval: permitted.** **Destatis data use: under review**, and deliberately so. The general clause grants *reproduction and distribution* and is silent on *adaptation*; deriving an aggregate index is adaptation on the strictest reading, and Urdais does not infer permission. DL-DE/BY-2.0, which governs GENESIS-Online, is unambiguous — 「Die bereitgestellten Daten und Metadaten dürfen für die **kommerzielle** und nicht kommerzielle Nutzung insbesondere vervielfältigt … verändert, bearbeitet sowie an Dritte übermittelt werden; mit eigenen Daten und Daten Anderer zusammengeführt und zu selbständigen neuen Datensätzen verbunden werden」 — commercial use, modification, and combination into new derived datasets, with a source note.

**The remedy is the same as the continuity remedy.** The *Vermögensbilanzen* workbook is discontinued after reference year 2022 and directs continuation to GENESIS-Online topic area 81000. Re-sourcing Germany from GENESIS clears the licence and the staleness in one move. Until then Germany sits at reference year 2022 and `under review`.

---

## Part 4 — Coverage Accounting

Three figures, never collapsed, as the brief requires.

### 4.1 The observed set

Own computation throughout. National-currency figures converted at World Bank `PA.NUS.FCRF` (period average) for each component's own reference year; see Part 6 for the end-period alternative.

| Economy | Ref. | Net worth $tn | W/GDP | Rights | Land | Source |
|---|---|---:|---:|---|---|---|
| United States | 2025 | **158.210** | 5.14 | **cleared** | partial (no public land) | Fed Z.1 S1.b `FL892090005` − `LM155111005` |
| Japan | 2022 | 30.581 | 6.88 | **cleared** | included | OECD `NN` + `BF90(W)` |
| Germany | 2022 | 26.703 | 6.36 | *review* | included | Destatis *Volksvermögen* |
| France | **2025** | 22.866 | 6.79 | **cleared** | included | Eurostat `N1N+N2N` + `BF90` |
| United Kingdom | 2021 | 16.389 | 5.13 | **cleared** | included | OECD `NN` + `BF90(W)` |
| Korea | 2022 | 15.781 | 8.77 | **cleared** | included | OECD `NN` + `BF90(W)` |
| **Australia** | **2025** | **13.797** | 7.67 | **cleared** | included (47 % of NFA) | ABS 5204.0 t10 `A2421151J` |
| **Italy** | **2024** | **12.810** | 5.37 | *review* | included | Istat/BdI sum of sectors |
| Canada | 2022 | 12.415 | 5.64 | **cleared** | included | OECD `NN` + `BF90(W)` |
| Mexico | 2022 | 10.741 | 7.32 | **cleared** | included | OECD `NN` + `BF90(W)` |
| **Netherlands** | **2025** | **7.705** | 5.78 | **cleared** | included (44 % of NFA) | CBS `85953NED` + Eurostat `BF90` |
| Russia | 2019 | 6.509 | 3.84 | **cleared** | unknown | OECD `NN` + `BF90(W)` |
| Sweden | **2025** | 4.110 | 6.14 | **cleared** | included | Eurostat `N1N+N2N` + `BF90` |
| **Austria** | **2023** | **3.386** | 6.55 | **cleared** | included | Eurostat `N1N+N2N` + `BF90` |
| Czechia | **2025** | 2.055 | 5.26 | **cleared** | included | Eurostat `N1N+N2N` + `BF90` |
| New Zealand | 2017 | 0.457 | 2.21 | **cleared** | included | OECD `NN` + `BF90(W)` |
| **Total observed** | | **344.514** | **5.700** | | 14 of 16 report land | **16 economies** |

### 4.2 The three coverage figures

| | n | share of 2024 world GDP | share of CWON non-human wealth | observed $tn |
|---|---:|---:|---:|---:|
| **Technically observed** | 16 | **53.99 %** | **64.08 %** | 344.514 |
| **Rights-cleared observed** | 14 | **47.66 %** | **56.38 %** | 305.004 |
| **Under review** | 2 | 6.33 % | 7.70 % | 39.510 |
| **Imputed** | ~185 | **46.01 %** | 35.92 % | — |

Movement against Phase 2A: technically observed **48.72 % → 53.99 %** (+5.27 pp), wealth share **57.26 % → 64.08 %** (+6.82 pp), **rights-cleared 0 % → 47.66 %** (+47.66 pp).

**Under review** is Germany (4.27 % of world GDP — adaptation not expressly granted on the discontinued workbook) and Italy (2.13 % — joint Istat/Banca d'Italia authorship). Both have named remedies that are retrievals, not requests.

**The gap between technically observed and rights-cleared is 6.33 pp and closeable.** The gap between rights-cleared and any publication threshold is not.

### 4.3 The ceiling

Own computation, and the most important number in the phase.

| Scenario | Observed share of 2024 world GDP |
|---|---:|
| Observed today | **53.99 %** |
| **+** economies with a non-financial total but no matching net-foreign-position year (NOR, FIN, HUN, ISR, LVA, PRT) | 55.72 % |
| **+** every EU/EFTA/OECD economy publishing fixed assets only, *as if each began publishing land and a non-produced total* (ESP, POL, BEL, DNK, IRL, GRC, ROU, SVK, HRV, BGR, SVN, LTU, LUX, EST, CYP, MLT, CHE, TUR, ISL) | **62.93 %** |
| **+** China | 79.70 % |
| **+** China and India | 83.07 % |
| **+** China, India, Brazil, Indonesia, Saudi Arabia, Türkiye | 87.40 % |

The third row is deliberately generous: it credits Urdais with nineteen economies that do not today publish a valued non-financial asset total, on the assumption that each one changes its statistical programme. Even so:

> **62.93 % is the ceiling without China, and 79.70 % is the ceiling with it. An 80 % rights-cleared observed threshold is not a stretch target. It is outside the feasible set.**

---

## Part 5 — Rights Matrix

Two axes, Urdais vocabulary. A source reaches production only when both read `permitted`. **Every row below was retrieved this phase unless marked.**

| Source | Interface | Retrieval | Data use | Evidence |
|---|---|---|---|---|
| **World Bank** | Indicator API | **permitted** | **permitted** | CC BY 4.0, `datacatalog.worldbank.org/public-licenses` (Phase 2A, HTTP 200) |
| **Federal Reserve** | Z.1 release, DDP bundle | **permitted** | **permitted** | `federalreserve.gov/disclaimer.htm` HTTP 200: *"information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source"* |
| **OECD** | `sdmx.oecd.org` public REST | **permitted** | **permitted** | `oecd.org/en/about/terms-conditions.html` HTTP 200 — §3 *Permitted Use*: *"you can extract from, download, copy, adapt, print, distribute, share and embed Data for any purpose, even for commercial use"*; §3 *APIs*: *"You may use one or more OECD-developed application programming interfaces … to facilitate access to the Data"* |
| **Eurostat** | Dissemination API | **permitted** | **permitted for EU/EFTA/acceding/candidate countries only** | `ec.europa.eu/eurostat/web/main/help/copyright-notice` HTTP 200; commercial reuse authorised with attribution, **no written licence required**; non-EU/EFTA country data excluded from commercial reuse |
| **ABS** | Time-series workbooks | **permitted** | **permitted** | `abs.gov.au/website-privacy-copyright-and-disclaimer` HTTP 200: CC BY 4.0 with named exceptions, none of which covers a published workbook |
| **CBS (NL)** | StatLine OData | **permitted** | **permitted** | `cbs.nl/en-gb/about-us/website/copyright` HTTP 200: CC BY 4.0 |
| **Istat** | Website / PDF | **permitted** | **permitted** | `istat.it/en/legal-notice/` HTTP 200: CC BY 4.0, *"for any purpose, even commercially"* |
| **Banca d'Italia** | Website | **not permitted** | **not permitted** | `bancaditalia.it/footer/copyright/index.html` HTTP 200: prior written authorisation required |
| **Banca d'Italia** | AgID open data, `dati.gov.it` | **permitted** | **permitted** | same page: 「rilasciati con licenza Creative Commons Attribuzione 4.0 Internazionale」 |
| **Destatis** | destatis.de downloadable products | **permitted** | **under review** | `destatis.de/EN/Service/Legal-Notice/_node.html` HTTP 200: reproduction and distribution granted with source; adaptation not expressly granted |
| **Destatis** | GENESIS-Online | **permitted** | **permitted** | same page: Datenlizenz Deutschland – Namensnennung – 2.0; `govdata.de/dl-de/by-2-0` HTTP 200 grants commercial use, modification and derived datasets |
| **ECB** | Data Portal API (FX) | under review | under review | `data-api.ecb.europa.eu` HTTP 200; terms not retrieved this phase |
| **NBS China** | stats.gov.cn | under review | under review | Purpose-limited to 「新闻性或资料性公共免费信息」; moot — see the China study |
| WID.world | Bulk CSV | not reviewed | not reviewed | Phase 1: terms page HTTP 404. Unchanged. |
| McKinsey | Report PDF | not permitted | **not permitted** | *"Any use of this material without specific permission … is strictly prohibited."* |
| UBS | Global Wealth Report | not permitted | not permitted | Prior written permission required |
| IMF | imf.org | not reviewed | not reviewed | HTTP 403 across three phases. No figure used. |

### 5.1 OECD terms resolution — no outreach

The brief's Phase 5 test is whether the published terms clearly cover four things. They do, and each is quoted:

| Requirement | OECD terms, §3 *Data* |
|---|---|
| Automated retrieval from SDMX | *"You may use one or more OECD-developed application programming interfaces ("APIs") to facilitate access to the Data."* |
| Retention / caching | *"you can **extract from, download, copy** … Data for any purpose"* |
| Commercial derived use | *"**adapt** … Data for any purpose, **even for commercial use**"* |
| Publication of derived aggregates | *"**distribute, share and embed** Data … When sharing or licensing work created using the Data, you agree to include the same acknowledgment requirement in any sub-licenses that you grant"* |

**Attribution format, binding:** `OECD (year), (dataset name), (data source) DOI or URL (accessed on (date))`, with the sub-licence pass-through.

**Three conditions to carry into the ingestion design, not objections:**

1. **Rate discipline is contractual, not merely polite.** *"The OECD may monitor your use of the Data and reserves the right … to modify the amount of Data you may request in a single query, to modify the number of queries you may make over a specified time … The OECD reserves the right to limit or suspend any user's IP address access to the APIs at any time and without notice … if you are placing too great a strain on the infrastructure."*
2. **API version currency is required.** *"you therefore agree, for each API, to use the most up-to-date version available."*
3. **Third-party ownership must be checked per dataset.** *"Data may be subject to restrictions beyond the scope of these Terms and Conditions … It is the user's responsibility to verify, either directly in the metadata or … by clicking on the icon and then referring to the 'source' tab, whether the Data is fully or partially owned by third parties."* The SDMX dataflow metadata for `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE9B,1.0` was retrieved (HTTP 200) and **declares no third-party restriction**; it does, however, carry the registry annotation `NonProductionDataflow = true`, which is recorded as an operational fact about the dataflow's status in the OECD registry and as a reason not to build a production dependency on that particular flow without confirming its designation.

> **Recommendation: do not send the OECD permission request. The terms are published, retrievable, and grant both axes.** The draft at [`docs/architecture/sources/oecd-permission-request.md`](../architecture/sources/oecd-permission-request.md) is closed as resolved-without-outreach. **Nothing has been sent and nothing should be.**

**No outreach is drafted or recommended for any source in this phase.** Every remaining rights gap — Destatis adaptation, Italy's joint authorship, the ECB's terms — is a retrieval, and Phase 2A's rule holds: asking an organisation for permission it may already have granted in writing is a slow way to get an answer the web gives faster. This phase proved that rule twice.

---

## Part 6 — Vintage and FX Discipline

### 6.1 Vintage

Reference years span **2017 to 2025**; median 2022; GDP-weighted mean vintage **2023.71** (own computation), up from Phase 2A because the four largest additions and three refreshes are 2024–2025.

Bounded stale-vintage acceptance, own computation:

| Rule | n | Share of world GDP | Observed $tn |
|---|---:|---:|---:|
| Latest available per economy (**used**) | 16 | 53.99 % | 344.514 |
| Reference year ≥ 2024 | 7 | 34.71 % | 221.554 |
| Reference year ≥ 2023 | 8 | 35.19 % | 224.940 |
| Reference year ≥ 2022 | 13 | 48.49 % | 321.156 |
| Common reference year 2022 only | 5 (CAN, DEU, JPN, KOR, MEX) | — | — |

**A common-reference-year denominator is not available at any useful coverage.** Five economies share 2022 and the United States is not among them. A ≥2022 bound costs 5.5 pp of coverage and drops Russia and New Zealand, the two worst offenders; a ≥2024 bound costs 19.3 pp and drops the entire OECD-route set including Japan and Germany.

> **Recommended rule: latest available per economy, with a hard maximum vintage age and the age displayed per economy.** A ≥2022 bound — a maximum age of four years against a 2026 calculation — is the only bounded rule that does not destroy coverage, and it would exclude only Russia (2019) and New Zealand (2017), together 2.1 % of world GDP. **No asset stock is interpolated across years anywhere in this phase**, which is why Norway is rejected rather than bridged.

### 6.2 FX

Phase 2A used World Bank `PA.NUS.FCRF`, a **period average**, on **end-period** stocks, and disclosed the resulting error as unquantified. **It is now quantified.**

End-period rates were taken from **ECB reference rates**, daily frequency, series `EXR.D.<CUR>.EUR.SP00.A` (`data-api.ecb.europa.eu`, HTTP 200, 5,951,214 bytes, 27,302 observations), using the last fixing at or before each component's own reference date and cross-rating through USD/EUR to obtain LCU per USD. Own computation:

| Economy | Ref. | Period-average $tn | End-period $tn | Difference |
|---|---|---:|---:|---:|
| Japan | 2022 | 30.581 | 30.493 | −0.088 (−0.29 %) |
| Germany | 2022 | 26.703 | 27.047 | +0.344 (+1.29 %) |
| France | 2025 | 22.866 | 23.777 | +0.911 (+3.98 %) |
| United Kingdom | 2021 | 16.389 | 16.062 | −0.328 (−2.00 %) |
| Korea | 2022 | 15.781 | 16.173 | +0.392 (+2.48 %) |
| Australia | 30 Jun 2025 | 13.797 | 13.982 | +0.186 (+1.35 %) |
| Italy | 2024 | 12.810 | 12.295 | −0.515 (−4.02 %) |
| Canada | 2022 | 12.415 | 11.935 | −0.479 (−3.86 %) |
| Mexico | 2022 | 10.741 | 11.056 | +0.315 (+2.93 %) |
| Netherlands | 2025 | 7.705 | 8.012 | +0.307 (+3.98 %) |
| Sweden | 2025 | 4.110 | 4.383 | +0.273 (+6.63 %) |
| Austria | 2023 | 3.386 | 3.460 | +0.074 (+2.19 %) |
| Czechia | 2025 | 2.055 | 2.180 | +0.125 (+6.08 %) |
| New Zealand | 2017 | 0.457 | 0.458 | +0.001 (+0.17 %) |
| **Total** | | **344.514** | **346.031** | **+1.517 (+0.44 %)** |

**Two readings, and the second is the one that matters.**

The **aggregate** effect is small — +0.44 % on the observed denominator, moving the candidate UBWI from 0.2841 % to **0.2833 %**, a difference of 8 ten-thousandths of a percentage point. Phase 2A's disclosed defect turns out to be immaterial at the world level, because the country-level errors have both signs and substantially cancel.

The **country-level** effect does not cancel and is up to **6.6 %** (Sweden) and **−4.0 %** (Italy). Any per-economy figure displayed on a published surface would be wrong by that much on the wrong FX basis, and the errors are largest in exactly the small open economies whose currencies move most.

> **Rule, unchanged in principle and now evidenced: end-period FX matched to the balance sheet's own reference date, sourced per economy, stored with its own `fx_basis`, `fx_source` and fixing date.** Period-average FX is acceptable only as a disclosed interim and only for the world aggregate. ECB reference rates cover the observed set except the rouble; the rouble's fixing was discontinued by the ECB in 2022 and Russia's row would need a different source or to be dropped under the ≥2022 vintage rule anyway.

---

## Part 7 — Re-testing the 80 % Threshold

The brief asks whether ~80 % is the right publication threshold. It asks for the answer not to be chosen for convenience. **It is not the right threshold, and the reason is not that it is too high — it is that it is not a threshold at all.**

### 7.1 Leave-out validation on CWON 2020

Observe the top-*N* economies by 2020 GDP; impute the tail at the observed set's own wealth-to-GDP ratio; compare against CWON actuals. Own computation over the 150 CWON economies with both a non-human wealth figure and 2020 GDP.

| Target coverage | *N* | Observed GDP | Observed wealth | Tail $tn | Tail error | **World-total error** | Median &#124;country error&#124; |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 % | 4 | 53.93 % | 56.04 % | 146.81 | +8.88 % | **+3.91 %** | 51.9 % |
| 60 % | 6 | 60.33 % | 60.90 % | 130.56 | +2.43 % | **+0.95 %** | 48.9 % |
| 70 % | 11 | 71.53 % | 73.06 % | 89.96 | +7.96 % | **+2.14 %** | 50.3 % |
| 75 % | 14 | 76.39 % | 78.52 % | 71.72 | +13.01 % | **+2.79 %** | 50.8 % |
| **80 %** | 17 | 80.08 % | 81.44 % | 61.99 | +9.14 % | **+1.70 %** | 50.0 % |
| 85 % | 24 | 85.45 % | 86.29 % | 45.80 | +7.10 % | **+0.97 %** | 50.3 % |
| 90 % | 34 | 90.23 % | 90.58 % | 31.44 | +4.23 % | **+0.40 %** | 50.4 % |

**The world-total error is not monotone in coverage and shows no break at 80 %.** It is *worse* at 80 % (+1.70 %) than at 60 % (+0.95 %) and 85 % (+0.97 %). The non-monotonicity is composition noise: which particular economies fall just inside or just outside a GDP cut-point matters more than how many of them there are.

**The median per-country error is ~50 % at every coverage level and never improves.** Imputation is indefensible for a named country at 50 % coverage and equally indefensible at 90 %. Phase 2A's finding stands and is now shown to be coverage-invariant.

### 7.2 Sensitivity to *which* countries are omitted

The brief asks for this explicitly, and it is where the real signal is. 400 random observed sets drawn to each coverage target, own computation, world-total error:

| Coverage | Median | p10 | p90 | **p90 − p10** | Worst |
|---:|---:|---:|---:|---:|---:|
| 50 % | −0.20 % | −9.05 % | +8.70 % | **17.76 pp** | +19.96 % |
| 60 % | −0.01 % | −7.59 % | +7.20 % | **14.79 pp** | +15.59 % |
| 70 % | −0.13 % | −6.96 % | +6.09 % | **13.04 pp** | −12.53 % |
| 75 % | −0.08 % | −6.16 % | +4.69 % | **10.86 pp** | −10.42 % |
| 80 % | −0.01 % | −5.99 % | +3.04 % | **9.03 pp** | −11.07 % |
| 85 % | −0.03 % | −5.21 % | +2.27 % | **7.48 pp** | −8.83 % |
| 90 % | +0.02 % | −2.50 % | +1.77 % | **4.27 pp** | −7.25 % |

**This is the honest picture and it is a smooth curve.** The imputation is unbiased in the median at every level — which is what makes the method usable at all — and the uncertainty band narrows monotonically and gradually. Nothing special happens at 80 %. Nothing special happens anywhere.

### 7.3 Sensitivity to land-heavy versus low-land economies

14 of 16 observed economies report land. The only `partial` is the **United States**, which excludes public land by construction (Z.1 footnote 4) and is **26.2 % of world GDP** — a quarter of the denominator carries a known, signed, one-directional understatement of unquantified size. Where land can be measured it is enormous: **47.0 %** of Australian non-financial assets, **43.5 %** of Dutch, an implied **34 %** of the Italian total.

**The land-treatment split is a larger and more systematic error source than the coverage threshold.** A denominator that is 80 % observed but mixes land-inclusive and land-exclusive compilers without adjustment is not obviously better than one that is 54 % observed and flags the difference.

### 7.4 What the per-country tail actually looks like

At 80 % coverage the imputed tail is 132 economies. Median absolute error **50.0 %**, p90 **184.3 %**. The ten largest overstatements: Romania +291 %, Trinidad and Tobago +294 %, Greece +301 %, El Salvador +370 %, Djibouti +400 %, Georgia +541 %, Jordan +1,333 %, **Ireland +6,203 %**, Lebanon +13,516 %, Montenegro +72,973 %.

Ireland is the instructive one: its GDP is inflated by intellectual-property relocation and contract manufacturing, so a GDP-proportional wealth imputation assigns it sixty-three times its actual non-human wealth. Montenegro's 72,973 % is an artifact of a near-zero CWON denominator (€0.03 bn) and should be read as "undefined" rather than as a large error.

> **Conclusion on the threshold. The evidence does not support ~80 % of world GDP as a publication rule, and it does not support any other GDP-coverage figure as a natural threshold either.** The defensible gate is not a coverage number at all; it is a **bound on the imputed share of the denominator**, together with a bound on the uncertainty band that the sensitivity table lets Urdais read off directly. See the publication gate proposal in Part 9.

---

## Part 8 — Research-Only Candidate

> **This is a simulation. It is not a published Urdais value, it may not be promoted to one, and no publication may occur under a draft methodology.** Not live. Not seeded. Not production. Not methodology-approved.

### 8.1 Numerator

**Carried unchanged from Phase 2A** and not re-observed, because the numerator is instantaneous and re-observing it would change the comparison without changing what is being tested. Observed 2026-09-14T18:14:20Z, block height 967,005: supply 20,084,365.00000000 BTC × median of three venues 78,873.68 USD = **$1,584,127,778,013 = 1.584128 tn**.

### 8.2 Denominator and candidate

Observed: **$344.514 tn** over 16 economies, 53.99 % of 2024 world GDP. Unobserved remainder of 2024 world GDP: **$51.37 tn**. Observed-set wealth-to-GDP ratio **5.700** (each component against its own vintage year). CWON tail calibration **k = 0.723** (tail 3.25 against observed 4.50 on CWON 2020).

| Scenario | tail ratio | imputed $tn | **W $tn** | imputed share | **TGW $tn** | **UBWI %** |
|---|---:|---:|---:|---:|---:|---:|
| tail ratio = observed ratio (k = 1) | 5.70 | 292.85 | 637.37 | 45.9 % | 638.95 | **0.2479** |
| **central: CWON-calibrated k = 0.723** | **4.12** | **211.59** | **556.10** | **38.0 %** | **557.69** | **0.2841** |
| low: 0.60 × observed | 3.42 | 175.71 | 520.23 | 33.8 % | 521.81 | **0.3036** |
| high: 1.15 × observed | 6.56 | 336.78 | 681.30 | 49.4 % | 682.88 | **0.2320** |

$$\text{UBWI} = \frac{1.584128}{557.69} \times 100 = \mathbf{0.2841\ \%}\qquad\text{range } 0.2320\%\ \text{–}\ 0.3036\%$$

**Variants, all own computation:**

- **Rights-cleared observed only** (14 economies, $305.004 tn observed, everything else imputed): W = **$554.82 tn**, TGW = **$556.40 tn**, **UBWI = 0.2847 %**, imputed share **45.0 %**.
- **End-period FX** (Part 6.2): W = **$557.62 tn**, **UBWI = 0.2833 %**.

### 8.3 Comparison with the prior candidates

| | Phase 1 (WID) | Phase 2A | **Phase 2B** |
|---|---:|---:|---:|
| Observed economies | — (world aggregate) | 12 | **16** |
| Observed GDP coverage | — | 48.72 % | **53.99 %** |
| **Rights-cleared coverage** | 0 % | **0 %** | **47.66 %** |
| Observed denominator | — | $304.480 tn | **$344.514 tn** |
| Imputed share | — | 45.2 % | **38.0 %** |
| Total Global Wealth | $556.32 tn (2023) | $556.99 tn | **$557.69 tn** |
| **Candidate UBWI** | **0.2843 %** | **0.2844 %** | **0.2841 %** |

**Three constructions, three source sets, three methods, 0.2843 / 0.2844 / 0.2841.** The Phase 1 candidate came from one compiler's world aggregate deflated by a PPP factor. Phase 2A summed twelve national compilers. This phase sums sixteen, four of them new, three of them re-vintaged by up to three years, with a corrected Eurostat route and a different tail calibration (k moved from 0.772 to 0.723). The denominators span $556.32–557.69 tn, a range of **0.25 %**.

**What that is and is not evidence of.** It is strong evidence that **Total Global Wealth is a measurable object** whose value does not depend on which of several defensible constructions you choose, and that **Bitcoin is between a quarter and a third of one percent of presently existing global net wealth**. It is **not** evidence that this construction is publishable: adding four economies worth 5.27 pp of world GDP moved the candidate by 0.0003 percentage points precisely *because* the imputation was already absorbing them at close to the right value — the stability comes partly from the model, and a model agreeing with itself is not a measurement.

### 8.4 Earliest defensible historical date

**Unchanged at 31 December 2013**, binding on the numerator. The denominator's own history is now better mapped: Eurostat's `nasa_10_f_bs` runs from 1990–1995 for most geographies, `nama_10_nfa_bs` from 1975 for some, the ABS national balance sheet from 1989, Destatis from 1999, CBS from 1995, Istat/BdI from 2005. **Any historical reconstruction must hold the observed set fixed or publish the coverage share alongside each point**, because the observed set's composition changes through time and a backward series would silently vary its own coverage.

---

## Part 9 — Publication Gate Proposal

**Proposed, not adopted.** The evidence in Part 7 is strong enough to reject an 80 % GDP-coverage rule and strong enough to propose the shape of a gate; it is not strong enough to formalise thresholds into production methodology, and this document does not do so.

| Gate | Proposed value | Why this value, from this phase's evidence |
|---|---|---|
| **Maximum imputed share of the denominator** | **≤ 25 %** | The only bound that speaks directly to what the published number *is*. At the current 38 % (technically observed) and 45 % (rights-cleared), the honest description is "an estimate calibrated to observed economies". Carried forward unchanged from Phase 2A, which reasoned to it independently. |
| **Minimum rights-cleared observed GDP coverage** | **≥ 70 %** | Derived from the imputed-share bound at the observed set's wealth-to-GDP ratio, **not** chosen as a round number. Currently 47.66 %; ceiling without China 62.93 %. |
| **Maximum uncertainty band** | **p10–p90 ≤ 10 pp** on the composition sensitivity | Readable directly from Part 7.2: satisfied at ≥ 75 % coverage, not at 54 %. |
| **Maximum vintage age** | **≤ 4 years** at calculation date | The only bounded rule that does not destroy coverage (Part 6.1); would exclude Russia and New Zealand today. |
| **Maximum vintage dispersion** | **≤ 4 years** between the oldest and newest component in the observed set | Currently 8 years (2017–2025). |
| **Required presence of major economies** | **Every economy above 3 % of world GDP must be observed, or the index is not published** | Today: the United States (observed), **China (not observed)**, India (not observed), Germany, Japan, the United Kingdom. **This gate alone blocks publication indefinitely on present data** and it should, because a "world" wealth measure that models away the second-largest economy is not measuring the world. |
| **Land treatment** | Every component must state `included`, `partially_included` or `excluded`; the share of the denominator that is `partially_included` or `excluded` must be published | The US alone is 26.2 % of world GDP on `partially_included` (Part 7.3). |
| **FX basis** | End-period, matched to each component's own reference date | Country-level error up to 6.6 % on the wrong basis (Part 6.2). |
| **Sensitivity range** | Published **with** the value, never in an appendix | Carried forward from Phase 2A. |

**Note on the interaction.** The major-economy gate and the 70 % coverage gate are not independent — China satisfies or fails both — but they fail for different reasons and should both be stated, because a future in which China's coverage is replaced by a dozen mid-sized economies would satisfy the second and still, correctly, fail the first.

---

## Part 10 — Architecture Implications

See [the UBWI data architecture proposal](../architecture/ubwi-data-architecture.md), amended alongside this study. **No migration is created and none should be**; the per-economy model from Phase 2A is preserved and extended. In summary, the per-economy component record needs `observation_status`, `rights_status`, `source_type` (`primary` / `harmonized`), `reference_date`, `valuation_basis`, `land_treatment`, `nfa_treatment`, `is_estimated`, `estimation_rule_version` and `coverage_weight`, and the vintage needs all three coverage shares rather than one.

**Three findings from this phase turn into schema requirements that Phase 2A could not have known to ask for:**

- **Rights are per-country on at least one interface**, not per-interface. Eurostat's licence permits commercial reuse for EU/EFTA/acceding/candidate countries and forbids it for everyone else in the same dataset. A single `source_interface.terms_state` cannot express that.
- **The reference *date* is not the reference *year*.** Australia's balance sheet is at 30 June. A year-typed column would silently convert a mid-year stock to a year-end one and would pick the wrong FX fixing.
- **A country can be reachable by two routes that disagree.** France's net foreign position differs by €379 bn between the OECD and Eurostat. The registry must record which interface a component came from, at the component level, so that a disagreement is visible rather than averaged.

---

## Part 11 — Product Surface

**Unchanged, and correctly so.** The market catalog carries UBWI with unit `%`, the methodology's definition and question, and a demo walk whose anchor is deliberately unrelated to any research candidate. Tests assert the percentage unit on every surface, that demo points stay inside `[0, 100]`, and that the formal term is **Total Global Wealth**. The Phase 2A display-defect fix holds.

**No factual display defect was found in this phase and no candidate has been seeded.** The methodology is a draft with no effective date, its denominator has no source chain cleared end-to-end, and publishing under a draft is prohibited.

---

## Decision

> ### Methodology viable, coverage still insufficient.

The methodology needs no amendment and did not receive one. The denominator concept survived four new economies, two new national compilers, a corrected Eurostat route and a corrected FX basis without a single adjustment — which is the strongest thing that can be said for a definition.

**What changed, and it is substantial.** Rights went from the dominant unknown to a largely solved problem: **47.66 % of world GDP is now observed under licences Urdais has read**, against 0 % at the end of Phase 2A, and the two largest rights blockers — the OECD's unreadable terms and the Federal Reserve's missing grant — were both dissolved by retrieval rather than by outreach. **No message was sent and none should be.** Coverage rose 5.27 pp, the imputed share fell from 45.2 % to 38.0 %, and the vintage profile improved by nearly two years on a GDP-weighted basis.

**What did not change is the thing that matters.** The 80 % threshold is not merely unmet; it is **unreachable**. Crediting every economy that could plausibly publish a valued non-financial asset total from its existing statistical programme gives **62.93 %** of world GDP, and the missing 17 pp to 80 % is China almost exactly. [China does not publish, in monetary terms, the stock of the thing this denominator is made of](./ubwi-china-source-study.md) — its state land is reported in hectares — and that is not a rights problem, a retrieval problem or a language problem.

**And the threshold itself did not survive testing.** Re-run at seven coverage levels, the imputation's world-total error and composition-sensitivity band improve smoothly and without a kink; the per-country error is ~50 % at every level. There is no coverage share at which a GDP-proportional residual stops being a model. The right gate is a bound on the imputed share and on the published uncertainty band, plus a hard requirement that every economy above 3 % of world GDP be observed — a gate that blocks publication today, for the correct reason.

**Not proceeding to production implementation. No production tables are created. No UBWI value is published, seeded or promoted.**

---

## Open Questions Carried Forward

1. **Re-source Germany from GENESIS-Online** (topic area 81000) under DL-DE/BY-2.0. Clears both the licence ambiguity and the discontinued-publication dependency in one move. **Highest-value remaining retrieval.**
2. **Re-source Italy's financial component from Banca d'Italia's AgID open data** on `dati.gov.it`, so each leg of the Italian construction carries its own CC BY 4.0.
3. **Verify the OECD `BF90(W)` series against each compiler's published IIP** for Japan, Korea, Canada, Mexico, Russia, New Zealand and the United Kingdom. Bounded at 1.2 % of the observed denominator, but it is a known disagreement and should not be carried into production unresolved.
4. **Fresher national-compiler routes for Japan, the United Kingdom, Canada and Korea.** All four publish national balance sheets directly (Cabinet Office 国民経済計算, ONS national balance sheet, StatCan National Balance Sheet Accounts, Bank of Korea / Statistics Korea 국민대차대조표) and all four currently sit at OECD vintages of 2021–2022. Together they are ~11 % of world GDP frozen up to five years stale. **Not attempted this phase.**
5. **Spain's non-financial asset stock.** The Istat/BdI international comparison states Spanish non-financial asset data exists for 2012–2023 — implying a fixed-capital-plus-land series Eurostat does not expose. Worth 1.55 % of world GDP.
6. **Confirm the OECD `NonProductionDataflow` annotation's meaning** and whether a production-designated dataflow carries the same national-accounts content.
7. **ECB terms of use for the reference-rate series**, now that FX policy depends on it.
8. **Whether the NBS compiles an unpublished national balance sheet.** Immaterial operationally; would change the (currently nil) outreach calculus. Blocked on `stats.gov.cn` DNS resolution.
9. **How the US public-land omission is disclosed** — named limitation, or adjusted from a rights-clean source. Carried unchanged; 26.2 % of world GDP sits behind it.
10. Carried unchanged from Phase 1: WID's licence; non-Bitcoin crypto in the denominator; the numerator venue set and its change rule.

---

## Sources and Evidence

All retrieved 14 September 2026.

**Verified by direct call.** [OECD Terms & Conditions](https://www.oecd.org/en/about/terms-conditions.html) (HTTP 200, 1,482,983 b). [Federal Reserve disclaimer](https://www.federalreserve.gov/disclaimer.htm) (HTTP 200). OECD SDMX public REST `sdmx.oecd.org/public/rest/` — dataflow metadata for `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE9B,1.0` (HTTP 200). Eurostat dissemination API — [`nama_10_nfa_bs`](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_nfa_bs) (HTTP 200, `updated` 2026-09-08), [`nasa_10_f_bs`](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nasa_10_f_bs) (HTTP 200, `updated` 2026-09-10), `nama_10_nfa_st` (HTTP 200, structure read). [Eurostat copyright notice](https://ec.europa.eu/eurostat/web/main/help/copyright-notice) and [European Commission legal notice](https://commission.europa.eu/legal-notice_en) (both HTTP 200). [ABS National Balance Sheet workbook 5204010](https://www.abs.gov.au/statistics/economy/national-accounts/australian-system-national-accounts/2024-25/5204010_National_Balance_Sheet.xlsx) (HTTP 200, parsed) and [ABS copyright](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer) (HTTP 200). [CBS StatLine table 85953NED](https://opendata.cbs.nl/ODataApi/odata/85953NED/) (HTTP 200) and [CBS copyright](https://www.cbs.nl/en-gb/about-us/website/copyright) (HTTP 200). [Istat / Banca d'Italia, *La ricchezza dei settori istituzionali in Italia 2005–2024*](https://www.istat.it/wp-content/uploads/2026/01/Nota_Ricchezza_Istat_Bankitalia_2026.pdf) (HTTP 200, 27 pages), [Istat legal notice](https://www.istat.it/en/legal-notice/) and [Banca d'Italia copyright](https://www.bancaditalia.it/footer/copyright/index.html) (both HTTP 200). [Destatis legal notice](https://www.destatis.de/EN/Service/Legal-Notice/_node.html) (HTTP 200) and [Datenlizenz Deutschland 2.0](https://www.govdata.de/dl-de/by-2-0) (HTTP 200). [World Bank indicator API](https://api.worldbank.org/v2/) — `NY.GDP.MKTP.CD` and `PA.NUS.FCRF` for 2017–2025 (HTTP 200, `lastupdated` 13 July 2026). [ECB Data Portal](https://data-api.ecb.europa.eu/service/data/EXR/) `EXR.D.*.EUR.SP00.A` (HTTP 200, 27,302 observations). China sources listed in [the China source study](./ubwi-china-source-study.md).

**Attempted and not retrieved. No figure from any of these is used.** `oecd.org/termsandconditions/`, `oecd.org/en/about/terms-and-conditions.html`, `oecd-ilibrary.org/oecd/terms` — HTTP 403, Cloudflare interstitials. `ec.europa.eu/eurostat/about-us/policies/copyright` — HTTP 404. `federalreserve.gov/legal.htm`, `/aboutthefed/policies.htm`, `/aboutthefed/website-terms.htm`, `/data/terms-of-service.htm` — HTTP 404. `destatis.de/EN/Service/Copyright/_node.html` and three further spellings — HTTP 404. `bancaditalia.it/footer/note-legali/` — HTTP 404. Headless Chrome (`--headless=new`, `--headless=old`) hangs indefinitely on this machine with `CVDisplayLinkCreateWithCGDisplay failed`, so the browser route recommended for the OECD page was unavailable and was not needed.

**Carried from earlier phases without retesting.** Federal Reserve Z.1 table S1.b figures (Phase 2A, release 11 September 2026); Destatis *Vermögensbilanzen* workbook figures (Phase 2A); OECD `DF_TABLE9B` and `DF_T720R_A` extracts (Phase 2A); CWON 2020 structural weights; the Bitcoin numerator observation; WID, McKinsey, UBS and IMF rights states.

---

## Research History

**14 September 2026**: Phase 2B. Added Australia, Italy, the Netherlands and Austria, and refreshed France, Sweden and Czechia to reference year 2025, taking technically observed coverage from 48.72 % to **53.99 %** of world GDP and 57.26 % to **64.08 %** of CWON non-human wealth. Retrieved licence texts for seven sources and took rights-cleared coverage from **0 % to 47.66 %** of world GDP without sending any outreach. Established that **80 % of world GDP directly observed is unreachable**, with a ceiling of **62.93 %** excluding China and **79.70 %** including it, and that China is not observable or constructible. Re-tested the 80 % threshold at seven coverage levels and found no natural break. Quantified the period-average-versus-end-period FX defect at **+0.44 %** on the world aggregate and up to **6.6 %** per country. Produced a research-only candidate Total Global Wealth of **$557.69 tn** and a research-only candidate UBWI of **0.2841 %**, range 0.2320 %–0.3036 %, **38.0 % imputed**. Decision: methodology viable, coverage still insufficient.

Four things were checked and turned out other than Phase 2A recorded, each noted because each would otherwise have been repeated.

**The OECD's terms were never unreachable — one canonical URL was never gated.** Two phases recorded HTTP 403 and drafted an outreach request around it. The canonical path returns HTTP 200 to three ordinary browser headers. The rule that a retrieval failure is a fact about the retrieval is what made the third attempt worth making, and it saved a permission request to an organisation that had already published the permission.

**The Federal Reserve's grant was two clicks away on a page nobody guessed.** `disclaimer.htm`, not `legal.htm`, not `credit-and-copyright.htm`. Twenty-six percent of world GDP turned on a filename.

**Eurostat's `HTTP 413 EXTRACTION_TOO_BIG` was a wrong-dataset error wearing a rate-limit costume.** `nama_10_nfa_st` is *by industry* and has no `sector` dimension; filtering on one made the server estimate the whole dataset. The dataset Phase 2A wanted, `nama_10_nfa_bs`, answers immediately — and delivers non-produced assets for six geographies, which is worse news than the 413 was.

**A country reachable by two routes can be given two different answers.** The OECD and Eurostat agree to 1.5 % on France's non-financial asset stock and disagree by a factor of eight on its net foreign position. Harmonised sources are not automatically consistent sources, and a registry that records only the concept and not the interface cannot show the difference.
