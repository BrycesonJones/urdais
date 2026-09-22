# UMPI Phase 2C — live source verification, 22 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It records what was confirmed against the official systems on 22 September 2026, so the identifiers frozen in [the UMPI-KR DRAM methodology](/docs/methodology/umpi-kr-dram) rest on a live reading rather than on a community wrapper. No adapter was built, no series was ingested, and no observation was stored.

**Why this pass existed.** Phase 2B-R proposed the open-data architecture but marked its central identifier **not live-verified**: the Bank of Korea DRAM PPI mapping came from `pyecos`, a community ECOS wrapper, and the export-price item code was unknown. A methodology cannot freeze an identifier it has never resolved.

**Method.** ECOS metadata was read through its documented `sample` key, which returns metadata in pages of at most ten rows and requires no user credential. The item lists were paged and scanned in full where the answer depended on absence. Customs and classification material was read from the agencies' own published pages. No API key was requested, registered, or used on the user's behalf.

---

## Results

| Gate | Result | How it was established |
| --- | --- | --- |
| **C1** BOK DRAM PPI stat/item confirmed live | **PASS** | `StatisticTableList` returns `404Y016` = "4.1.1.3. 생산자물가지수(품목별)", cycle `M`, `ORG_NAME` 한국은행. `StatisticItemList` returns `30911201AA`, `ITEM_NAME` **DRAM**, parent `309AA` 컴퓨터,전자및광학기기. `StatisticSearch` on `(404Y016, M, 30911201AA)` returns monthly values through `202608` |
| **C2** Unit, base, frequency, start time | **PASS** | `UNIT_NAME` `2020=100`; `CYCLE` `M`; `START_TIME` `199501`; `END_TIME` `202608`; basket `WEIGHT` 1.2 |
| **C3** No finer official DRAM split | **PASS** | The `309` group was scanned in full. It contains exactly one DRAM item. Its nearest siblings are `30911101AA` 트랜지스터, `30911102AA` LED, `30911104AA` 실리콘웨이퍼, `30911202AA` 플래시메모리, `30911203AA` 시스템반도체. **No DDR5, DDR4, DDR3, density, organization, speed-bin or eTT child exists** |
| **C4** HSK 8542321010 official definition | **PASS** | `8542.32` = 메모리. `8542321010` = **디램**; `8542321020` = 에스램; `8542321030` = 플래시 메모리; `8542321090` = 기타; `8542322000` = 하이브리드 집적회로; `8542323000` = 복합구조칩 집적회로. Read from a Korean government rendering of the 관세·통계통합품목분류표 |
| **C5** Export USD and weight fields | **PASS** | `expDlr` = 수출금액(달러), declared export value in USD, FOB; `expWgt` = 수출중량(kg). **Piece counts are not in the response specification.** Import value is 과세가격미화금액 (CIF), which is why the ratio is export-side only |
| **C6** Customs use-right field | **PASS** | data.go.kr **15100475** and **15101609**: 이용허락범위 **제한 없음**. data.go.kr **15049722** HS code file: 공공저작물 **출처표시 (제1유형)** |
| **C7** BOK rights and attribution | **PASS** | Bank of Korea 저작권보호방침: "제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다"; "출처가 한국은행임을 반드시 밝혀야 하며"; "수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다". Commercial use is not prohibited for designated public data; material outside the designation needs prior approval |

**All seven verification gates pass.** The remaining gates C8–C12 are methodology decisions rather than lookups, and are frozen in the methodology document.

## Two corrections to Phase 2B-R

### 1. A DRAM export price index exists, on a table nobody had checked

Phase 2B-R recorded the export-price item as unconfirmed and noted that `pyecos` mapped only the **semiconductor aggregate** `30911AA` on `402Y014`.

Verification found both halves of that picture to be true and incomplete:

- **`402Y014`** = "4.3.1.1. 수출물가지수(기본분류)" genuinely has **no DRAM item**. Its finest semiconductor split is `309111AA` 개별소자 and `309112AA` 집적회로 under `30911AA` 반도체. Publishing that aggregate as "DRAM" would have been wrong, exactly as 2B-R warned.
- **`402Y015`** = "4.3.1.2. 수출물가지수(특수분류)" has 72 rows and **no semiconductor or DRAM item at all**.
- **`402Y016`** = "4.3.1.3. 수출물가지수(품목별)" — the by-commodity table, the exact parallel of the PPI table — carries **`30911201AA` DRAM**, `2020=100`, monthly, `197101`–`202608`, basket weight **103.4**, alongside `30911202AA` 플래시메모리 (29.8) and `30911203AA` 시스템반도체 (27.9).

DRAM at 103.4 per mille is the **single largest item in Korea's export price basket** in that group, which is a fact about the Korean export economy more than about Urdais.

**It is verified and it is still not in V1**, for a reason verification itself surfaced: see below.

### 2. An item code does not identify a series

`30911201AA` means DRAM in **both** `404Y016` (producer prices) and `402Y016` (export prices). The same code, the same month, two different numbers:

| Reference month | `404Y016` producer | `402Y016` export |
| --- | --- | --- |
| 2026-06 | 496.84 | see below |
| 2026-07 | 538.74 | — |
| 2026-08 | 553.02 | — |

And `402Y016` does not return one value per month at all. A three-row request for 2026-06 returned **three different values for the same month** — 252.74, 252.74, 326.71 — because the table carries a second dimension. Scanning `GRP_CODE` across the table resolved it:

> **`402Y016` Group2 = 계약통화기준 (contract-currency basis), 달러기준 (USD basis), 원화기준 (KRW basis).**

Two engineering consequences, both now frozen in the methodology:

1. **A series is identified by the triple `(stat_code, item_code, cycle)` plus any group dimension**, never by item code alone. An implementation keyed on `30911201AA` would silently publish producer prices as export prices, or mix three currency bases into one series.
2. **The export price index needs a currency-basis decision before it can be a product.** Choosing among KRW, USD and contract-currency bases changes what the series means — a KRW-based export index moves with the won, a USD-based one does not. That decision is a methodology lock, it was never made, and making it silently in an adapter would be the worst available outcome. The series is therefore recorded as a **verified future candidate**, not a V1 series.

## What was not verified, and why it does not block

| Item | State | Effect |
| --- | --- | --- |
| Statistical quantity unit (수량단위) for 8542321010 | Not shown in the classification rendering read | **None.** V1 uses kilograms, which are confirmed in the API field specification. A piece count would be a different, better series if it ever existed, and the methodology does not depend on one |
| ECOS 통계정보이용지침 as a separate document | Not extracted | Low. The operative grant used is the Bank of Korea's own published copyright policy plus the data.go.kr designation. An engineering checklist item, not a rights gap |
| Whether HBM is declared under `8542323000` | Not confirmed from official classification text | **None for V1.** That code is a sibling of `854232.10xx`, so whatever is declared under it is outside Series B by construction |
| Korea Customs response payloads | Not called | Deliberate. Calling the trade API requires a registered service key, and registering one on the user's behalf is outside this phase |

## Evidence of liveness

Three consecutive producer-price values were retrieved to confirm the identifier resolves to a real, current series: **2026-06 = 496.84, 2026-07 = 538.74, 2026-08 = 553.02**, unit `2020=100`.

**These are not Urdais observations.** They were read to prove an identifier, they are recorded here as verification evidence in a research document, and they are not stored in any production table, not published, and not the beginning of a series. Phase 3 will retrieve the series properly, under a registered key, with vintage and provenance.

## What Phase 3 is cleared to build

In this order, and nothing beyond it without a further methodology version:

1. Register an ECOS API key and a data.go.kr service key. **Credentials are configuration and are never committed.**
2. Ingest `(404Y016, 30911201AA, M)` monthly, append-only with vintage, and publish it as **UMPI-KR DRAM PPI** in BOK's own base with BOK attribution.
3. Ingest Korea Customs HSK 8542321010 monthly `expDlr` and `expWgt`, compute `expDlr / expWgt`, rebase to the 2020 calendar-year aggregate, and publish it as **UMPI-KR DRAM Export UV** with the mix warning and Customs attribution.
4. Compute MoM on published values only, withheld across gaps and boundaries.
5. Replace the demo surface per P1–P8 of the methodology.

**Not cleared:** the export price index until its currency basis is decided; any Taiwan, Japan, US or China series; any proprietary or commercial-lineage source; any daily cadence; and any composite headline.
