# UMPI Phase 2B-R — open and commercially reusable source discovery, 22 September 2026

**Status: internal licensing/source research. Not a methodology page, not legal advice, not routed publicly, not registered in the docs catalog.** It designs no UI and writes no ingestion code.

**Product freeze this pass is allowed to break.** Phase 2A currently defines six DRAM-spot USD/chip instruments and a 1D close-to-close. This document asks a different question: what is the strongest independently reproducible DRAM-price product Urdais can ingest, retain, calculate over, and commercially publish **without a bespoke bilateral data licence**. TrendForce appears only as a fallback that still requires that licence.

**Research date.** Primary pages were fetched on 21–22 September 2026.

**Evidence classes.** **[verified]** quoted from a primary page or PDF this pass. **[retrieved]** from a fetch or search extraction of a primary page. **[inferred]** never treated as a right.

Silence is not permission. Public access is not a right. Government footnotes that reprint a commercial survey are still that survey.

---

## A. Executive conclusion

**`OPEN_SOURCE_UMPI_PATH_FOUND`.** The open path is a **monthly official DRAM price-index product**, not the current six-instrument USD/chip daily tape.

What is true:

1. **No production-safe source prints DDR5 16Gb / DDR4 8Gb / eTT as USD/chip independently of TrendForce.** MOTIE monthly trade releases do print those densities as “메모리 고정가격,” but the April 2026 DDR4 8Gb footnote of **$16.00** matches the independently attributed DRAMeXchange contract print for the same month **[verified MOTIE PDF; retrieved Yonhap / e-focus attributing the same series to DRAMeXchange]**. MOTIE’s extracted PDFs do not name TrendForce. KOGL Type 1 on MOTIE press **text** does not license a third-party survey. Those footnotes are **out of scope** as a production source.

2. **Bank of Korea does survey DRAM as a producer-price commodity.** BOK PPI releases name DRAM as a contributor (e.g. January 2026 DRAM +49.5% MoM in the computer/electronics group) **[retrieved, BOK PPI coverage]**. That is a quality-adjusted **index** (2020=100), not USD/chip, and it does not split DDR generation, density, speed, or eTT. A community ECOS wrapper maps it to table **`404Y016` / item `30911201AA`** **[retrieved, pyecos source]**. Confirm on `StatisticItemList` before ingest.

3. **Korea Customs HS `8542321010` is official DRAM chips (not modules), with an open API whose licence field is “이용허락범위 제한 없음.”** **[verified, data.go.kr 15101609 and 15100475]**. KOSIS has confirmed that code is “디램” chips; modules are **`8473304060`** **[verified, KOSIS Q&A]**. The open API returns **USD value and kg**, not pieces. Unit value is **$/kg**, mix-contaminated across generations and densities. Publish only as a **rebased unit-value index**, never as UMPI USD/chip.

4. **Standard commercial component APIs forbid the rights UMPI needs.** Digi-Key: no derivative works of DigiKey Data, no own database, delete on termination **[verified]**. Nexar/Octopart: 24-hour cache, no standalone redistribution **[verified]**. UN Comtrade: internal use; commercial re-dissemination is a paid licence **[verified]**. BOJ CGPI: non-commercial copy with attribution; **commercial reproduction requires prior permission** **[verified]**.

5. **The legally reusable product is therefore monthly and relative.** Smallest launch: **UMPI-KR DRAM PPI** (BOK). First companion: **UMPI-KR DRAM export unit-value index** (Customs `8542321010` $/kg, rebased). Optional later: BOK DRAM **export** price index (press cites it; item code not verified this pass) and, if an OGDL dataset actually carries it, Taiwan HS `854232` unit value **labelled as including HBM**.

That is a different economic object from Phase 2A spot chips. It is still DRAM pricing. It is independently reproducible. It is superior to a TrendForce dependency **if** Urdais is willing to stop claiming daily USD/chip.

TrendForce remains **fallback requiring bespoke licence** if the product must stay six-instrument daily USD/chip.

---

## B. Production-safe source inventory

| ID | Source | What it actually measures | Cadence | Rights class | UMPI role |
| --- | --- | --- | --- | --- | --- |
| KR-PPI-DRAM | Bank of Korea Producer Price Index, DRAM commodity | Quality-adjusted domestic producer DRAM prices, 2020=100 | Monthly | `production_safe` (index levels + derived MoM, with attribution) | **Primary** |
| KR-XPI-DRAM | BOK Export Price Index, DRAM item (press-cited; code unconfirmed) | Quality-adjusted export contract/transaction prices, 2020=100 | Monthly | `production_safe` once item code confirmed on the same ECOS/public-data path | Companion |
| KR-HS-DRAM | Korea Customs HS 8542321010 export value/kg | Mixed DRAM-chip export unit value | Monthly (~15th revision) | `production_safe` via data.go.kr unlimited-use APIs | Companion **index only** |
| KR-HS-MOD | HS 8473304060 DRAM modules | Modules, not chips | Monthly | Same APIs | Do not mix into the chip UV |
| KR-HS-MCP | HS 8542323000 MCP | Includes HBM-class MCP in secondary reporting | Monthly | Same APIs | Not commodity DRAM |
| TW-HS-DRAM | Taiwan HS 854232 / CCC `8542320023` | DRAM **including HBM** **[verified, MOF bulletin 30 Oct 2025]** | Monthly / annual in bulletin | `production_safe` **only** where OGDL-Taiwan-1.0 attaches; ITA HTML footer is All Rights Reserved | Optional, labelled |
| US-PPI-IC | BLS PCU3344133344131 | Integrated microcircuits including MOS memories **and** microprocessors | Monthly | `production_safe` (US public domain) | Context only; not DRAM |
| US-HS-854232 | Census HS 854232 | US trade in memories; US is not a DRAM producer | Monthly | `production_safe` (US public domain) | Optional import UV; coverage weak |
| MOTIE-FX | MOTIE “메모리 고정가격” DDR4 8Gb / DDR5 16Gb | Printed USD/chip in press notes | Monthly | `prohibited` as UMPI source (TrendForce lineage) | Cite as ministry commentary only |
| NDRC-FX | China NDRC price-monitoring notes | DDR4 8Gb 1Gx8 contract-style USD | Aperiodic | `prohibited` (commercial-survey lineage in coverage) | Out |
| DX/TF | DRAMeXchange spot/contract | Named dies USD/chip | Daily / monthly | Fallback: bespoke licence | Out of this architecture |
| CFM | China Flash Market | Chip quotes | Weekly/mixed | Bespoke licence | Out |
| Digi-Key / Nexar | Distributor/broker APIs | List/offer prices | Intraday | `prohibited` | Out |
| UN Comtrade | HS6/HS reporter trade | 6-digit memories | Monthly, lagged | `prohibited` / paid redistribute | Do not use as the feed |
| BOJ CGPI MOS memory | Japan corporate-goods MOS memory ICs | Index | Monthly | `ambiguous` (commercial copy needs prior permission) | Not V1 |
| China NBS PPI | Computer/comms/electronics PPI | Industry, not DRAM | Monthly | `ambiguous` (reuse terms not verified as unlimited) | Coverage inadequate |
| WSTS | Industry ASP | Memory billings | Monthly | Bespoke distribution licence | Out |
| Silicon Data | RAM Index | GDDR6 only | Daily | Standard terms ≠ publication | Coverage inadequate |
| Procurement | SAM.gov / DLA / DOE | Modules, sparse awards | Irregular | Public facts, not a tape | Coverage inadequate |

---

## C. Exact-price sources

**None are production-safe for UMPI USD/chip.**

### C.1 MOTIE “고정가격” (lead A)

- **Originating agency of the PDF:** Ministry of Trade, Industry and Energy, 수출입과 **[verified, MOTIE 8월 수출입동향 page; 4월 PDF]**.
- **What is printed:** USD levels for **DDR4 8Gb** and **DDR5 16Gb** (and NAND 128Gb), not eTT, not DDR4 16Gb, not DDR3 4Gb. April 2026 PDF: DDR4 8Gb $1.65 → $16.00; DDR5 16Gb $4.60 → $35.00 **[verified]**. August 2026 HTML: DDR5 16Gb $35.0 → 37.5 → 40.0 → 45.0 → 46.5 (Apr–Aug) **[verified]**. August HTML dropped DDR4 8Gb from the footnote.
- **Methodology/basis:** not stated in the extracted MOTIE text. No survey form, no session rule, no branded-vs-eTT rule.
- **Third-party commercial source:** Yonhap 1 Sep 2026 attributes August PC DDR4 8Gb 1Gx8 **고정거래가격 $25** to **DRAMeXchange** **[retrieved]**. e-focus attributes June $21 / May $20 / April $16 to TrendForce/DRAMeXchange **[retrieved]**. MOTIE’s April $16.00 is the same April print. **[inferred lineage, not a MOTIE admission]**.
- **KOGL:** Korea.kr republications of MOTIE press text are typically **공공누리 제1유형 (출처표시)** for **text**, excluding third-party photos **[retrieved]**. Type 1 does not wash a third-party survey. Public Data Act likewise excludes third-party rights.
- **Hidden densities:** this pass did not find eTT or DDR3 4Gb in MOTIE attachments. Only DDR4 8Gb, DDR5 16Gb, NAND 128Gb.
- **Classification:** `prohibited` as a production numeric source. Do not ingest MOTIE footnotes as UMPI.

### C.2 Other USD/chip government-looking prints

- China NDRC Price Monitoring Center notes have cited DDR4 8Gb 1G×8 contract averages in USD **[retrieved, secondary]**. Same commercial-survey shape. `prohibited`.
- No Korea Customs, BOK, Taiwan MOF, BLS, or Census series is a named DDR5 16Gb or DDR4 8Gb **chip** price.

Architecture 1 (open exact-price benchmark) **cannot launch**.

---

## D. Official price-index sources

### D.1 Bank of Korea DRAM PPI (lead B)

| Field | Finding | Evidence |
| --- | --- | --- |
| Existence | DRAM is a named PPI commodity; BOK monthly releases quote DRAM MoM/YoY | **[retrieved]** BOK PPI press (Jan 2026 DRAM +49.5% MoM; Aug 2026 DRAM +476.1% YoY in coverage) |
| Table / item | Community map: **stat `404Y016`**, **item `30911201AA`**, monthly. NAND `30911202AA`, logic `30911203AA`. Headline basic PPI table is **`404Y014`**; special **`404Y015`**. | **[retrieved, pyecos `_generated.py`]**. **Not live-verified** against `StatisticItemList` this pass |
| API | `https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/1/{n}/{STAT}/M/{YYYYMM}/{YYYYMM}/{ITEM}` | **[retrieved, ECOS API docs / wrappers]** |
| Also on data.go.kr | “Bank of Korea_Producer Price Survey” OpenAPI, **use permission range limitless**, free | **[verified, data.go.kr 15059642]** |
| Licence | KOSIS: commercial use and redistribution allowed with attribution; do not sell the unmodified table as a paid replica; do not distort **[verified, KOSIS 이용지침 + 활용약관 제5·제8조]**. BOK site: public-data list items are freely usable; attribution required; modifications must be disclosed **[verified, bok.or.kr 저작권보호방침]**. ECOS click-wrap Open API terms were not extracted as a separate PDF this pass — treat data.go.kr unlimited + KOSIS/BOK public-data rules as the operative grant for PPI, and keep the live ECOS 통계정보이용지침 in the engineering checklist |
| Finer DRAM splits | No DDR5 vs DDR4 vs eTT item found in wrappers or press. DRAM is one commodity | **[retrieved]** |
| Unit | Index, 2020=100, quality-adjusted Laspeyres; domestic producer shipments | **[retrieved, 생산자물가조사 통계정보보고서]** |
| Cadence / revision | Monthly. Preliminary then revised. Release ~third week of following month | **[retrieved]** |
| History | PPI commodity history is long; 2020-base linked indexes exist. Exact DRAM start date = `START_TIME` on StatisticItemList | not live-pulled |
| Independent of TrendForce | Yes. BOK surveys producers. It is not a spot board | **[inferred from official methodology; not a BOK legal opinion]** |

Rights row: access `production_safe`; automation `production_safe` (registered API key); storage `production_safe`; historical retention `production_safe`; commercial use `production_safe`; derived calculation `production_safe`; derived publication `production_safe`; raw republication `production_safe` **as a cited BOK series**, not as an unsourced Urdais print; attribution required.

### D.2 BOK DRAM export price index

Korean press in 2026 cites a separate **D램 수출물가지수** (example: Jan 2026 147.44, 2020=100, +102% YoY) **[retrieved, Herald]**. pyecos maps **semiconductor** export prices to **`402Y014` / `30911AA`**, which is the **aggregate semiconductor** item, not DRAM **[retrieved]**. DRAM and NAND export-price item codes must be read from `StatisticItemList` on `402Y014` (and currency basis: KRW / contract / USD — e-나라지표 warns users to pick the currency **[retrieved]**).

Same rights path as PPI once the item is identified. Do not publish the semiconductor aggregate as “DRAM.”

### D.3 Japan BOJ CGPI MOS memory ICs

Commodity exists (PPI and IPI “MOS memory integrated circuits”) **[retrieved, BOJ classification]**. Time-series site: copy/reproduce with attribution **except commercial purposes**, which need **advance permission** from Research and Statistics **[verified, stat-search.boj.or.jp notice]**. Classification: `ambiguous` until that permission exists. **Not in the V1 open stack.** Series code not extracted this pass.

### D.4 US BLS

- `PCU334413334413` semiconductor industry.
- `PCU3344133344131` “Integrated microcircuits, including semiconductor networks, microprocessors, and MOS memories” **[verified, BLS hedonic note]**.

Public domain with citation **[verified, BLS copyright page]**. Coverage: **not DRAM**. Optional context series only.

### D.5 China NBS

Published PPI is **计算机、通信和其他电子设备制造业**, not DRAM **[retrieved]**. Reuse terms not verified as unlimited. `coverage_inadequate`.

### D.6 Taiwan official price indexes

This pass did not find a MOEA/DGBAS DRAM producer-price **item**. Trade unit values are the Taiwan open lead (section E).

---

## E. Customs-derived sources

### E.1 Korea (lead C)

| Code | Official meaning | Use |
| --- | --- | --- |
| **8542321010** | 디램 **chips** | Chip UV index |
| **8473304060** | 디램 **모듈** | Separate; ICT “DRAM” on KOSIS **sums both** **[verified, KOSIS Q&A]** |
| **8542323000** | MCP (secondary sources place HBM here — **not official HSK text this pass**) | Do not label as DDR |
| **8542321020** | SRAM **[retrieved]** | Out |

**API (open, unlimited-use field):**

- Item × country: `https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList` — `hsSgn`, `cntyCd` required, `strtYymm`/`endYymm` max one year **[verified, 15100475]**.
- Item totals: data.go.kr **15101609** 관세청_품목별 수출입실적(GW), same licence, XML **[verified]**. Apply for the operation list at registration; fields documented on the country API are `expWgt` (kg), `expDlr` (USD), not piece count **[verified]**.

**KOGL / open-data:** data.go.kr “이용허락범위 제한 없음” is the portal’s unrestricted public-data mark (commercial + derivative). Not a numbered KOGL glyph on the API page. Treat as **Public Data Act unrestricted**, attribution still required.

**Can it isolate DDR generation/density?** No. One DRAM-chip bucket.

**Can unit values be a benchmark component?** Yes, as **index of mixed Korean DRAM-chip export unit value ($/kg)**. No as USD/chip and no as DDR5 16Gb.

**Quantity in 개:** not in these OpenAPI response specs. tradedata.go.kr UI may offer quantity for some codes; not verified as still 10-digit after the 2026 municipal 6-digit episode noted in Phase 1B. Do not wait on pieces.

**KITA K-stat / TRASS:** KITA site terms bar copy/distribution/commercial use without prior approval **[verified, kita.net 이용약관]**. K-stat FAQ: some source data are paid and member-only **[retrieved]**. **Do not use KITA/TRASS as the production feed.** Use Customs OpenAPI / tradedata.go.kr public tables instead.

### E.2 Taiwan (lead D)

- MOF Statistical Bulletin No. 20, 30 Oct 2025: HS **854232** DRAM vs other memories **8542320023 / 8542320090**. **“DRAM includes high bandwidth memory (HBM)”** **[verified]**. Generation/density **not** isolated. Modules live in **847330**, not 854232.
- ITA query UI offers average price per unit and per kg **[retrieved, publicinfo.trade.gov.tw]** but the Chinese portal footer is **Copyright © 2026 All Rights Reserved** **[retrieved]**.
- **OGDL-Taiwan-1.0** (data.gov.tw): perpetual, worldwide, commercial, derivative products/services, sublicensable, attribution mandatory or licence void ab initio **[verified]**. Use **only** datasets that actually carry that licence (e.g. listed customs value files). Do not assume the ITA HTML query is OGDL.
- 10/11-digit isolation of DDR5 16Gb: **not found**.

### E.3 US Census / Eurostat / China customs / UN Comtrade

- **Census** HS API is US government public data; 10-digit quantity exists at HS10 **[retrieved]**. HS 854232 is memories, not a Korean/Taiwan producer chip tape. Optional.
- **Eurostat COMEXT:** generally reusable under Commission reuse rules; EU is not a DRAM producer. Optional, not V1.
- **China customs** `stats.customs.gov.cn`: HS 854232 splits volatile vs non-volatile at 8-digit in tariff lists **[retrieved, unofficial HS tree]**; official reuse terms not verified as `production_safe`. `ambiguous` + likely still mixed.
- **UN Comtrade:** licence is **internal use**; copying/redistribution/commercial exploitation prohibited without UN permission; for-profit analytics needs a distribution licence **[verified]**. `prohibited` as UMPI’s public feed.

Architecture 4 (customs-derived **USD/chip**) **fails** cleanliness. Architecture 4 as a **labelled mixed UV index** is a valid companion to PPI.

---

## F. Public procurement findings

Searches of SAM.gov / DLA / DOE-style notices for 2026 found **module** buys (DDR4 16GB ATCA DIMMs, DDR5 64GB, 32GB ECC RDIMM), small quantities, missing or lumpy award prices **[retrieved]**. No recurring awarded **chip** tape with part + qty + unit price + date at production frequency.

Classification: `coverage_inadequate`. Public award facts may be citable case-by-case; they cannot be UMPI.

Korea 나라장터 OpenAPI exists (unrestricted-use field on several data.go.kr procurement APIs **[retrieved, prior wrappers]**). Not shown to contain a DRAM-chip panel.

---

## G. Standard commercial APIs with permissive terms

**None found that already grant automated access + storage + commercial analytics + derived publication without an addendum.**

| API | Standard terms | Verdict |
| --- | --- | --- |
| Digi-Key | Permitted purpose is driving Digi-Key sales / internal purchasing. No derivative works of DigiKey Data; no own database; no bulk download; delete all data on termination **[verified]** | `prohibited` |
| Nexar / Octopart | Display through licensed apps; cache ≤24h; no standalone redistribution **[verified]** | `prohibited` |
| Silicon Data RAM Index | API exists; GDDR6 only; derived distribution needs written auth (Phase 2B) | `coverage_inadequate` |
| UN Comtrade | Internal; paid redistribute | `prohibited` |
| FRED | Convenience copy of BLS is fine if you follow BLS; FRED API has extra branding rules. Prefer **BLS API directly** | n/a |
| WSTS | Distribution licence, not standard self-serve publication | Out |

---

## H. Rights matrix

Statuses: `production_safe` | `production_safe_derived_only` | `ambiguous` | `prohibited` | `coverage_inadequate`.

| Source | Access | Automation | Storage | Historical retention | Commercial use | Derived calc | Derived pub | Raw republication | Attribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BOK DRAM PPI via ECOS / data.go.kr / KOSIS | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe as **cited BOK series** | Required (agency, survey, table, date, URL) |
| Korea Customs OpenAPI 8542321010 | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe as **cited customs UV**, not as chip quote | Required |
| Taiwan data.gov.tw OGDL datasets | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | Required (OGDL exhibit) |
| Taiwan ITA HTML query | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | All Rights Reserved footer |
| BLS PPI / Census HS | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | production_safe | Cite BLS/Census; no BLS emblem |
| BOJ CGPI | production_safe for non-commercial copy | production_safe technically | ambiguous commercially | ambiguous | **prior permission** | ambiguous | ambiguous | prohibited commercially without permission | Required |
| MOTIE 고정가격 footnotes | public | n/a | prohibited (3rd-party) | prohibited | prohibited | prohibited | prohibited | prohibited | n/a as UMPI |
| Digi-Key / Nexar | restricted | restricted | prohibited (own DB / >24h) | prohibited (delete) | restricted | prohibited | prohibited | prohibited | Required if displayed at all |
| UN Comtrade | restricted | restricted | internal | internal | paid licence | paid | paid | prohibited | UN terms |
| KITA / TRASS | restricted | restricted | prohibited w/o approval | prohibited | prohibited w/o approval | prohibited | prohibited | prohibited | n/a |
| China NBS / customs portal | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | ambiguous | Not verified |

KOSIS extra constraint **[verified]:** do not sell the downloaded table **as-is** for a fee. A Urdais product that **processes** official series into a documented index is the permitted commercial pattern.

---

## I. Coverage matrix against the six current UMPI instruments

| Phase 2A instrument | Open exact USD/chip | Official index | Customs UV | Procurement | Standard API |
| --- | --- | --- | --- | --- | --- |
| DDR5 16Gb 2Gx8 4800/5600 Major | No (MOTIE footnote is TF lineage) | Collapsed into BOK “DRAM” | Collapsed into 8542321010 | No | No |
| DDR4 16Gb 2Gx8 3200 Major | No | Same | Same | No | No |
| DDR4 8Gb 1Gx8 3200 Major | No (MOTIE/NDRC = TF lineage) | Same | Same | No | No |
| DDR4 16Gb eTT | No | No | No | No | No |
| DDR4 8Gb eTT | No | No | No | No | No |
| DDR3 4Gb 512Mx8 Major | No | No | No | No | No |

eTT is a **spot-board grade**. No government series uses it.

---

## J. Best open-data architecture

**Architecture 2 — Open relative memory price index (recommended default).**

| | |
| --- | --- |
| **Instruments** | (1) **UMPI-KR DRAM PPI** — BOK DRAM producer price, 2020=100 or Urdais-rebased 100 at a stated month. (2) **UMPI-KR DRAM export UV** — Customs 8542321010 export USD/kg, rebased to 100. Optional (3) **UMPI-KR DRAM XPI** — BOK DRAM export price index after item-code confirmation |
| **Sources** | ECOS / data.go.kr BOK PPI; data.go.kr Customs GW APIs |
| **Unit** | Index points. **Not USD/chip** |
| **Cadence** | Monthly. Change label **MoM**. No daily line |
| **Earliest history** | PPI: linked 2020-base (exact DRAM `START_TIME` on first pull). Customs: multi-year monthly at 10-digit |
| **Update latency** | PPI: ~3 weeks after month-end. Customs: ~15th of following month for revision |
| **Rights** | `production_safe` with attribution; no vendor negotiation |
| **Methodology** | Publish BOK methodology (producer-stage, quality-adjusted, domestic). Publish customs UV as **value/weight**, mix across DDR generations. Never map either series onto a Phase 2A chip ID |
| **Launch now?** | **Yes**, after API keys + live item-code confirmation |
| **Phase 2A changes** | See §N |

This is the strongest independently reproducible DRAM-price product found.

---

## K. Best hybrid architecture

**Architecture 3 without fake chip prices.**

Same as J, plus:

- Optional **BLS IC PPI** (`PCU3344133344131`) as “US integrated-circuit PPI (not DRAM).”
- Optional **Taiwan HS 854232 unit-value index** only from an OGDL dataset, labelled **“Taiwan DRAM trade unit value, includes HBM.”**
- Optional **Nanya monthly revenue** / issuer ASP % as **filings context**, not prices (Phase 1B path).

Do **not** hybridize MOTIE/NDRC USD/chip onto the official indexes. That would reimport TrendForce.

Architecture 5 (public + standard-licence commercial) **has no member**. Architecture 1 **has no member**. Architecture 4 is the customs **companion** inside J/K, not a standalone chip benchmark.

---

## L. Smallest launchable instrument universe

**One series:** UMPI-KR DRAM PPI.

**Two series (recommended launch):** PPI + Customs 8542321010 UV index.

Do not launch six chip pickers. Do not launch eTT. Do not launch HBM as a price. Do not keep “USD / part” as the family unit.

If product later wants a second **country** context, add Taiwan OGDL UV (HBM-contaminated) or BLS IC PPI (DRAM-contaminated) — both must be labelled as contaminated, not as additional chip instruments.

---

## M. Cadence recommendation

| Series | Observation | Header change | Intraday | 1D / 1W |
| --- | --- | --- | --- | --- |
| BOK DRAM PPI | Monthly | **MoM** | No | No |
| Customs DRAM UV | Monthly (10-day stamps exist on some portals; V1 should use **final monthly**) | **MoM** | No | No |
| BLS IC PPI | Monthly | MoM | No | No |

Keep **last-updated** as the as-of of the latest official vintage. Do not interpolate daily. Do not use the word **today**.

Monthly official data is **superior to TrendForce daily** on rights and reproducibility. It is **inferior** as a description of the channel-spot chip market. That is a product choice, not a data bug.

---

## N. Required Phase 2A methodology changes

If Urdais takes the open path:

1. Replace UMPI-DRAM Spot six USD/chip instruments with **one or two monthly official DRAM indexes**.
2. Replace unit **USD/chip** with **index points** (state base period).
3. Replace **1D / “today”** with **MoM**.
4. State the economic object: **Korea producer DRAM (quality-adjusted)** and, separately, **Korea DRAM-chip export unit value (mixed generations, $/kg)**.
5. Explicitly **not** branded vs eTT, **not** 2Gx8 vs 1Gx8, **not** spot vs contract board.
6. Ban mapping customs $/kg or PPI points onto the old chip IDs.
7. Ban MOTIE/Yonhap/NDRC USD/chip as UMPI inputs.
8. Attribution block on every surface.
9. HBM remains withheld (customs MCP is not an HBM price).
10. TrendForce stays documented as the only path back to the old six-instrument daily product.

---

## O. Exact data endpoints / files / API IDs

**Bank of Korea ECOS**

- Portal: `https://ecos.bok.or.kr/`
- Open API: `https://ecos.bok.or.kr/api/#/`
- Search: `GET https://ecos.bok.or.kr/api/StatisticSearch/{API_KEY}/json/kr/1/{n}/{STAT_CODE}/M/{START}/{END}/{ITEM_CODE1}`
- Item list: `.../StatisticItemList/{API_KEY}/json/kr/1/1000/{STAT_CODE}`
- **First call:** ItemList on `404Y014`, `404Y015`, `404Y016`, `402Y014` filtered to 디램/DRAM.
- **Working map (confirm live):** PPI DRAM `404Y016` / `30911201AA`; NAND `30911202AA`; semiconductor export price aggregate `402Y014` / `30911AA` **[retrieved, pyecos]**.
- data.go.kr dataset: **15059642** Bank of Korea_Producer Price Survey (unlimited-use field).
- KOSIS: same PPI via national statistical DB; follow KOSIS 이용지침 citation fields.

**Korea Customs**

- data.go.kr **15101609** 품목별 수출입실적 (GW) — unlimited-use.
- data.go.kr **15100475** 품목별 국가별 수출입실적 (GW) — `https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList`.
- HS code file: **15049722** 관세청_HS부호_20260101 (confirm 8542321010 한글/영문명 and quantity-unit code).
- Query: `hsSgn=8542321010`, monthly `strtYymm`/`endYymm`.
- Derive `uv_usd_per_kg = expDlr / expWgt`. Rebase. Do not convert to USD/chip.
- Also pull `8473304060` only as a **module** control series, never blended into the chip UV without a labelled “chips+modules” name (that is what MSIT ICT “DRAM” does).

**Taiwan (optional)**

- OGDL licence: `https://data.gov.tw/en/license`
- MOF bulletin: `https://service.mof.gov.tw/public/Data/statistic/bulletin/114/2025_20_Memory_Exports_and_Imports.pdf`
- CCC/tariff files: `https://portal.sw.nat.gov.tw/APGQ/GC413`
- Do not scrape ITA HTML as if it were OGDL.

**US context (optional)**

- BLS: `https://api.bls.gov/publicAPI/v2/timeseries/data/` series `PCU3344133344131`
- Census: `https://api.census.gov/data/timeseries/intltrade/imports/hs` (and `/exports/hs`)

**Do not ingest**

- MOTIE 고정가격 footnotes
- KITA/TRASS
- UN Comtrade as the public feed
- Digi-Key / Nexar
- DRAMeXchange / CFM
- Aggregators

---

## P. Historical backfill feasibility

| Series | Backfill | Caveat |
| --- | --- | --- |
| BOK DRAM PPI | Yes, via StatisticSearch over `START_TIME`–present; 2020-base linked indexes exist for PPI | Confirm DRAM item continuity across rebases |
| BOK DRAM XPI | Likely, once item code is known | Currency-basis choice is a methodology lock |
| Customs 8542321010 | Yes, monthly value/kg for many years | Mix shift (DDR3→DDR4→DDR5, density, HBM leakage into other codes) **is** the series |
| Taiwan 854232 | Annual in MOF bulletin 2021–2025 YTD; monthly if OGDL microdata exists | HBM inside DRAM |
| BLS IC PPI | 1975–present on FRED/BLS | Not DRAM |

No open backfill reconstructs branded vs eTT or daily sessions. Do not interpolate.

---

## Q. Remaining blockers

These are **engineering confirmations**, not vendor negotiations:

1. Live `StatisticItemList` confirmation that DRAM PPI is `404Y016`/`30911201AA` (or the current official pair).
2. Whether `402Y014` contains a DRAM item distinct from `30911AA`.
3. Read the current ECOS 통계정보이용지침 (notice 15 Jun 2026) against the data.go.kr unlimited-use field; keep attribution.
4. Confirm 8542321010 quantity-unit code in HS file 15049722; V1 still uses kg.
5. Confirm Taiwan monthly 10-digit file on data.gov.tw is OGDL before using it.
6. Product decision: accept monthly index UMPI **or** return to TrendForce bespoke licence for daily USD/chip.
7. Counsel sign-off that citing BOK/Customs numbers on a commercial Urdais page matches KOSIS “processed commercial use,” not “as-is paid dump.”

No MOTIE/TrendForce/CFM/WSTS/Silicon Data outreach is required to launch architecture J.

---

## R. Final gate

**`OPEN_SOURCE_UMPI_PATH_FOUND`**

**Exact data stack engineering should build next:**

1. Register **ECOS** API key and **data.go.kr** service key (production traffic after a usage example).
2. Resolve DRAM item codes via `StatisticItemList`.
3. Ingest monthly **BOK DRAM PPI** → publish as **UMPI-KR DRAM PPI** (index, MoM, vintage date, BOK attribution).
4. Ingest monthly **Customs HS 8542321010** export USD and kg → publish as **UMPI-KR DRAM export unit-value index** (rebased $/kg, mix warning, Customs attribution).
5. Do not publish USD/chip. Do not publish six spot instruments. Do not interpolate daily. Do not ingest MOTIE 고정가격.
6. Optional second sprint: BOK DRAM export-price item; BLS IC PPI as labelled context.

If product insists on Phase 2A six-instrument daily USD/chip, that path is still **NO_OPEN_SOURCE** and remains **TrendForce fallback requiring bespoke licence.** The gate above is for the strongest **open** product that actually exists.

---

## Appendix. Primary URLs this pass

- https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/172145/view
- https://www.bok.or.kr/portal/main/contents.do?menuNo=200228
- https://ecos.bok.or.kr/
- https://kosis.kr/serviceInfo/useGuide.do
- https://kosis.kr/serviceInfo/applicationClause.do
- https://www.data.go.kr/en/data/15059642/openapi.do
- https://www.data.go.kr/data/15101609/openapi.do
- https://www.data.go.kr/data/15100475/openapi.do
- https://www.data.go.kr/data/15049722/fileData.do
- https://data.gov.tw/en/license
- https://service.mof.gov.tw/public/Data/statistic/bulletin/114/2025_20_Memory_Exports_and_Imports.pdf
- https://www.bls.gov/opub/copyright-information.htm
- https://www.stat-search.boj.or.jp/info/notice_en.html
- https://developer.digikey.com/api-user-agreement
- https://nexar.com/api/legal
- https://comtradeplus.un.org/LicenseAgreement
- https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/
- https://www.kita.net/policyAgree/policyService/policyService.do
- https://github.com/seokhoonj/pyecos/blob/main/src/pyecos/curation/_generated.py
