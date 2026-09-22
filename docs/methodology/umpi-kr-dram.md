# UMPI-KR DRAM Methodology

**Status: approved, version 1.0.0, effective 22 September 2026.** This document defines the Urdais Memory Price Index V1 as a family of **two monthly official-data DRAM indexes** built entirely from Korean government statistics.

The two series are published independently and are never combined. **There is no UMPI headline number and no composite between them**: one is a quality-adjusted price index produced by a statistical agency, the other a unit-value index Urdais computes from customs value and weight, and a blend of the two would be a number with no referent.

The demo memory values still visible in the product are not published under this or any methodology version, and the production read path cannot serve them.

This document follows the principles of the [Urdais methodology framework](/docs/methodology).

**This supersedes the launch role of [UMPI-DRAM Spot](/docs/methodology/umpi), which is deferred rather than withdrawn.** That document defined six DRAM chip instruments in USD per chip from a commercial spot board. It remains a complete and reviewable specification, and it remains unpublishable: the source that carries those six instruments does not permit public commercial display of its prices. Nothing here revives it, and nothing here deletes it. See [Relationship to the deferred spot architecture](#docs-relationship-to-the-deferred-spot-architecture).

**What changed, in one sentence.** Urdais stopped trying to reproduce a commercial spot board it cannot license, and started measuring DRAM prices with statistics it can obtain, store, recompute, retain and publish on its own authority.

---

## Output Identity

| Field | Value |
| --- | --- |
| Family | UMPI, the Urdais Memory Price Index |
| Launch series | Two, published separately |
| Series A | **UMPI-KR DRAM PPI** — `UMPI-KR-DRAM-PPI` |
| Series B | **UMPI-KR DRAM Export UV** — `UMPI-KR-DRAM-EXPORT-UV` |
| Unit, both | Index points |
| Cadence, both | Monthly |
| Canonical change, both | **MoM** |
| Methodology version | 1.0.0 |
| Status | Approved |
| Effective date | 22 September 2026 |
| Publication state | Publishable. Each series publishes only while its own rights gate holds |

**There is no composite UMPI headline, and this version does not create one.** The two series measure different economic objects by different methods, and a weighted blend of them would be a number with no referent. They are never averaged, never summed, never chained, and neither is ever used to fill a gap in the other.

The two series are also **not** the six Phase 2A chip instruments under new names. They do not inherit those identifiers, and those identifiers are not reused here.

## Output Definition

### Series A — UMPI-KR DRAM PPI

> **UMPI-KR DRAM PPI is the Bank of Korea's official Producer Price Index for DRAM, published by Urdais as a cited monthly series with a Urdais-calculated month-over-month change.**

It measures the price of DRAM at the **domestic producer shipment stage in Korea**, as surveyed and quality-adjusted by the Bank of Korea under its own statistical methodology. Urdais does not compute the index level; the Bank of Korea does.

What it is **not**, stated because each of these is a plausible misreading:

- Not a spot-market price, and not a transaction tape.
- Not DDR5-specific, DDR4-specific or DDR3-specific. BOK surveys **one DRAM commodity**; no generation, density, organization, speed bin or grade split exists (verified — see [Source verification](#docs-source-verification)).
- Not branded versus eTT. That distinction is a commercial spot-board grade and appears in no official statistic.
- Not a module price, not a wafer price, and not a price per chip in any currency.
- Not an export price. Producer-stage and export-stage are different measurements, and BOK publishes both; V1 takes the producer one.

### Series B — UMPI-KR DRAM Export UV

> **UMPI-KR DRAM Export UV is a monthly unit-value index Urdais calculates from Korea Customs official export statistics for DRAM chips under HSK 8542321010, as declared export value in USD divided by declared export weight in kilograms, rebased to an index.**

Urdais computes this one. The inputs are official; the index is Urdais's derivation, and is labelled as such wherever it appears.

> **A unit value is not a price.** Its movement combines genuine price change with change in **what was exported** — generation mix, density mix, vendor mix, product mix inside the code, and specification change. It is a **trade unit-value index**, and it is never described as a DRAM price, a DDR5 price, a chip price, a quality-adjusted price, or a market close.

This warning is not a caveat appended for safety. It is the definition: the series is an honest measurement of export unit value, and it would be a dishonest measurement of price.

## The PPI / UV distinction, frozen

The two series answer different questions and are constructed by different parties under different rules. This version freezes the separation.

| | UMPI-KR DRAM PPI | UMPI-KR DRAM Export UV |
| --- | --- | --- |
| Kind | **Price index** | **Unit-value index** |
| Computed by | Bank of Korea | **Urdais**, from official inputs |
| Quality-adjusted | **Yes**, by BOK | **No** |
| Stage | Domestic producer shipment | Export, FOB declared |
| Composition effects | Controlled by BOK's method | **Present and material** |
| Urdais's role | Cite, store, compute MoM | Calculate, rebase, compute MoM |

> **They are never averaged, blended, chained, spliced, or used to impute one another.** A month missing from one is not filled from the other. A reader is always told which one they are looking at.

## Canonical Series

### Series A — UMPI-KR DRAM PPI

| Property | Value |
| --- | --- |
| Identifier | `UMPI-KR-DRAM-PPI` |
| Source agency | Bank of Korea (한국은행) |
| Source system | ECOS (Economic Statistics System) |
| Statistic table | `404Y016` — 4.1.1.3. 생산자물가지수(품목별) (Producer Price Index by commodity) |
| Item code | `30911201AA` — item name **DRAM** |
| Parent group | `309AA` 컴퓨터,전자및광학기기 (computer, electronic and optical equipment) |
| Cycle | `M` (monthly) |
| Unit | Index, **2020=100** |
| Basket weight | 1.2 per mille of the PPI basket |
| Available range | **199501 – 202608** at verification |
| Published unit | Index points, in BOK's own base |

### Series B — UMPI-KR DRAM Export UV

| Property | Value |
| --- | --- |
| Identifier | `UMPI-KR-DRAM-EXPORT-UV` |
| Source agency | Korea Customs Service (관세청) |
| Source system | data.go.kr open API |
| Commodity code | **HSK 8542321010** — 디램 (DRAM), memory chips |
| Value field | `expDlr` — 수출금액(달러), declared export value in USD, FOB |
| Weight field | `expWgt` — 수출중량(kg), declared export weight in kilograms |
| Cycle | Monthly |
| Native quantity | USD per kilogram |
| Published unit | Index points, **2020 calendar-year average = 100** |

**The published Series B value is an index. The underlying USD/kg is retained internally for reproducibility** and may be exposed as metadata. It is never presented as a price per chip, and the two must never appear in a way that invites the reader to treat kilograms as chips.

### Codes deliberately excluded

| Code | What it is | Why excluded |
| --- | --- | --- |
| `8473304060` | 디램 모듈 — DRAM modules | Modules are a different product. Korea's ICT statistics sum chips and modules into one "DRAM" figure; this methodology does not, and never blends the two under one name |
| `8542321020` | 에스램 — SRAM | Not DRAM |
| `8542321030` | 플래시 메모리 — Flash memory | Not DRAM |
| `8542321090` | 기타 — Other memories | Unidentified composition |
| `8542323000` | 복합구조칩 집적회로 — multichip integrated circuits | A **sibling** 10-digit code, not inside `854232.10xx`. Secondary reporting associates HBM-class packages with it; that association is not confirmed from official classification text, and either way it does not enter Series B |

Because MCP sits in a sibling code rather than inside the DRAM chip code, **Series B is not knowingly contaminated by HBM-class multichip packages**. That is a structural property of the classification, not a claim about every declaration made under it.

## Source verification

Every identifier above was confirmed live against the official systems on **22 September 2026**, not inherited from a community wrapper. The prior research mapping was correct in one place and incomplete in another, and both are recorded.

| Gate | Confirmed | Evidence |
| --- | --- | --- |
| Table identity | `404Y016` = "4.1.1.3. 생산자물가지수(품목별)", cycle `M`, agency 한국은행 | ECOS `StatisticTableList` |
| Item identity | `30911201AA`, item name **DRAM**, unit `2020=100`, range `199501`–`202608`, weight 1.2, parent `309AA` | ECOS `StatisticItemList` |
| Series resolves | The `(404Y016, 30911201AA, M)` triple returns monthly values through `202608` | ECOS `StatisticSearch` |
| No finer DRAM split | The `309` group contains exactly one DRAM item. Its siblings are 트랜지스터, LED, 실리콘웨이퍼, 플래시메모리 (`30911202AA`), 시스템반도체 (`30911203AA`). **No DDR5, DDR4, DDR3, density, organization, speed or eTT child exists** | ECOS `StatisticItemList`, full scan of the group |
| HSK identity | `8542.32` = 메모리; **`8542321010` = 디램**; `8542321020` = 에스램; `8542321030` = 플래시 메모리; `8542321090` = 기타; `8542323000` = 복합구조칩 집적회로 | Korean government rendering of the 관세·통계통합품목분류표 |
| Customs fields | `expDlr` 수출금액(달러) and `expWgt` 수출중량(kg) are the documented export fields; **piece counts are not in the response specification** | data.go.kr dataset 15100475 |
| Customs cadence | Monthly, updated approximately the 15th of the following month | data.go.kr datasets 15100475 and 15101609 |

### Two corrections to the prior research

1. **A DRAM export price index does exist, and the prior mapping missed it.** Earlier research recorded the export-price item as unconfirmed, and a community wrapper mapped only the **semiconductor aggregate** `30911AA` on table `402Y014`. Verification found that `402Y014` (수출물가지수 기본분류) indeed has **no DRAM item** — its finest semiconductor split is 개별소자 and 집적회로 — but that the **by-commodity export table `402Y016`** carries `30911201AA` **DRAM**, `2020=100`, monthly, range `197101`–`202608`, basket weight **103.4**. It is real, it is long, and it is not in V1; see [Deferred and future candidates](#docs-deferred-and-future-candidates).
2. **An item code alone does not identify a series.** `30911201AA` means DRAM in *both* `404Y016` (producer prices) and `402Y016` (export prices), and the two tables return **different values for the same month**. A series is identified by the **triple** `(stat_code, item_code, cycle)`, plus any group dimension the table carries. An implementation that keys on the item code alone will silently publish the wrong statistic.

## Methodology

### Series A — nothing is recomputed

The published value for a reference month is **the value BOK publishes for that month, in BOK's own base**, unchanged. Urdais applies no arithmetic to the level, no rebasing, no smoothing, no seasonal adjustment and no currency conversion. The only Urdais calculation on Series A is the MoM change.

Urdais publishes BOK's number as a cited BOK series. It does not present the level as a Urdais construction, and it does not claim ownership of the source fact.

### Series B — the unit value and its rebasing

For a reference month `t`, from the official export figures for HSK 8542321010:

```
uv_usd_per_kg_t = expDlr_t / expWgt_t
```

Both terms are export-side and declared on the same basis. **Import figures are never used**: Korean import values are reported CIF while exports are FOB declared, so a ratio mixing them would measure freight and insurance as well as price.

The published index rebases that quantity to a **fixed historical base**:

```
UV_index_t = 100 × uv_usd_per_kg_t / uv_usd_per_kg_base
```

where

```
uv_usd_per_kg_base = ( Σ expDlr_m for the 12 months of 2020 ) / ( Σ expWgt_m for the 12 months of 2020 )
```

> **The base is the calendar-year 2020 aggregate unit value: total 2020 export USD divided by total 2020 export kilograms. Base = 100.**

**Why this base, and not the alternatives.** Urdais has no general base-100 index convention to inherit — UTVI deliberately publishes a level rather than a rebased index, and UBWI publishes a percentage — so the choice is made here and justified rather than assumed.

- **2020 matches the base period of the Bank of Korea series beside it.** The two series then sit on comparable scales, which makes the chart honest about their shapes without implying they measure the same thing. Their *bases* agree; their *methods* do not, and the surface says so.
- **It is fixed and historical, so it never moves.** A base of "the first live month" would silently rebase the whole history every time the product relaunched, and would make a series with thirty years of available history appear to begin at launch.
- **An annual aggregate, not a single month.** A single base month would import that month's mix and noise into every value in the series forever. Summing value and weight across twelve months before dividing gives a weight-weighted annual unit value rather than an average of twelve ratios, which is the arithmetic that matches what a unit value is.
- **It is reproducible by a third party** from the same public API without any Urdais input.

**The base is frozen by this methodology version.** Changing it is a new version, it is disclosed, and it does not silently restate published history.

**A BOK rebase does not rebase Series B.** If the Bank of Korea moves its PPI to a later base, Series A's unit changes because BOK's unit changed — that is a source event, recorded as such — while Series B stays on its own frozen 2020 base until a Urdais methodology version says otherwise. The two bases may then differ, and the surface must state each series' base rather than implying a shared one.

### Change calculation, both series

> **The canonical change is MoM: the value for a reference month against the value for the immediately preceding reference month, within the same series, the same source lineage, the same methodology version and the same base regime.**

```
MoM_t = (value_t − value_{t−1}) / value_{t−1}
```

| Question | Rule |
| --- | --- |
| Which two values | Consecutive **reference months** of the same series. Never across series, never across base regimes |
| Which vintage | **Both values from the latest available vintage.** A revised month is never compared against a stale neighbour |
| A missing preceding month | The change is **withheld**. It is never computed across a gap and never shown as zero |
| First month of a series | Withheld |
| Across a base change or methodology version | **Withheld**, because the two values are not the same measurement expressed the same way |
| Label | **MoM**. Never `1D`, never `session`, never `today` |

No other change is canonical in V1. YoY may be derived later under a version that defines it; it is not defined here.

## Cadence

> **Both series are monthly. There is no intraday value, no daily value, no weekly value, and no interpolation of any kind.**

- The observation identity is the **reference month**, not the retrieval date.
- BOK PPI is released roughly three weeks after month end, preliminary and then revised.
- Korea Customs figures update around the 15th of the following month. V1 uses **final monthly** figures and does not publish 10-day or 20-day provisional trade counts as if they were the month.
- A month with no official figure has **no point**. It is not zero, not carried forward, not interpolated, and not estimated from the other series.
- The surface shows the **latest reference month** and the vintage it came from, never a synthetic "as of today".

## Vintage and revisions

Official statistics are revised, and a product that overwrites them loses the ability to explain what it published. This follows the settlement discipline already established for UTVI.

For every observation, Urdais stores:

| Field | Meaning |
| --- | --- |
| Reference period | The month the value describes |
| Release / publication date | When the agency published that value, where the agency exposes it |
| Retrieval time | When Urdais read it |
| Vintage | Which reading of that reference month this is |
| Value | As published, at source precision |
| Source metadata | Table, item, cycle, unit, base, code, field names |

Four rules:

1. **Every retrieval is recorded append-only.** Nothing is overwritten.
2. **The published value for a reference month is the value from its most recent retrieval.**
3. **A later change is a supersession, never an edit.** The prior value stays retrievable, and a previously published figure remains explainable.
4. **Provisional and final are distinguished and labelled**, so a reader can tell a first print from a settled one.

A revision changes the current published history under the revision rules above; it does not retroactively rewrite what Urdais stated at an earlier time, and the lineage to explain the earlier statement is retained.

## Historical backfill

Backfill is permitted and bounded, per series. **No interpolation, in history or in the present.**

**Series A.** Backfill from the earliest official DRAM observation available under the currently linked BOK series — `199501` at verification. BOK publishes linked indexes across its base regimes; **Urdais preserves that official linking and does not splice incompatible base regimes on its own initiative.** If BOK does not supply a link across a regime boundary, the boundary becomes a published methodology boundary rather than a silent join.

**Series B.** Backfill only where **all** hold: HSK 8542321010 is definitionally comparable over the span, both `expDlr` and `expWgt` exist for the month, and any classification change is documented. The base requires the twelve months of 2020, so the series cannot be published before that base is computable.

> **If the HSK classification changes materially, a methodology boundary is created. Unlike classifications are never silently spliced into one series.**

Mix shift is not a defect to be corrected out of Series B. Over a long span the migration from DDR3 to DDR4 to DDR5 and the rise of higher densities **is part of what the series records**, and the methodology says so rather than pretending to a purity it does not have.

## Rights and attribution

Both sources are official public data, obtained and used under published government terms. Urdais owns its methodology, its calculations and its normalization. **It does not own the source facts, and it does not claim to.**

### Bank of Korea

| Item | Position |
| --- | --- |
| Agency | Bank of Korea (한국은행) |
| Dataset | ECOS statistic `404Y016`, item `30911201AA`; the same survey is published on data.go.kr as the Bank of Korea Producer Price Survey |
| Use | Designated public data may be used freely without a separate procedure — "제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다" |
| Attribution | **Mandatory.** "출처가 한국은행임을 반드시 밝혀야 하며" — the source must be identified as the Bank of Korea |
| Modification | **Disclosure mandatory.** "수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다" — any modification, alteration or processing must be clearly disclosed |
| Commercial use | Not prohibited for designated public data |
| Boundary | Material outside the public-data designation requires prior approval and is not used |

Two obligations follow and are binding on the surface: **every display of Series A names the Bank of Korea**, and **the MoM change is disclosed as a Urdais calculation** rather than presented as a BOK figure.

### Korea Customs Service

| Item | Position |
| --- | --- |
| Agency | Korea Customs Service (관세청) |
| Datasets | data.go.kr **15100475** 품목별 국가별 수출입실적(GW); **15101609** 품목별 수출입실적(GW); **15049722** HS부호 (classification reference) |
| Use right | **이용허락범위 제한 없음** — no restriction on the scope of use, on both trade-statistics APIs |
| Classification file | 공공저작물 출처표시 (제1유형) — attribution type |
| Attribution | **Mandatory.** Every display of Series B names the Korea Customs Service and the HSK code |
| Derivation | **Disclosure mandatory.** Series B is a Urdais calculation from official value and weight, and is labelled a unit-value index, never an official price |

A further constraint applies to both, and is a rule about product shape rather than about citation: Urdais publishes a **processed, documented index product**. It does not resell an unmodified official table as a paid replica, and it does not present official figures in a way that distorts them.

## Prohibited sources

The following are **barred from production ingestion for V1**, and none may be added without an explicit new methodology and source-rights version. Several are barred for reasons that survive any amount of technical convenience.

| Source | Why |
| --- | --- |
| TrendForce / DRAMeXchange prices | Terms bar display and publication to third parties; commercial use refused. Deferred licensed path only |
| MOTIE 고정가격 press footnotes | Government-published, but the numbers carry commercial-survey lineage. A public-sector licence over press **text** does not license a third party's survey **figures** |
| Yonhap, e-focus and other reproductions of commercial DRAM prices | Same lineage, one step further removed |
| CFM / China Flash Market | Reproduction barred without written permission; never contacted |
| KITA / TRASS | Terms bar copying, distribution and commercial use without prior approval |
| Digi-Key, Nexar / Octopart | No own database, no derivative works, deletion on termination |
| UN Comtrade | Internal use; commercial re-dissemination requires a paid licence |
| Aggregators and reconstructions | Inherit the restrictions of whatever they reproduce |

> **A restriction on a figure attaches to the figure, not to the page it is read from.** Ingesting a government footnote, a news article or an aggregator that reprints a commercial survey does not cure the survey's terms.

## Ingestion Contract

This section specifies the contract every retrieval obeys. It is not itself an authorization to collect: a source may be collected from only while its own rights gate holds, and approval of this methodology does not grant, widen or cure any source's terms.

| # | Requirement |
| --- | --- |
| I1 | **Identify a series by its full triple** `(stat_code, item_code, cycle)` plus any group dimension. An item code alone is ambiguous across BOK tables |
| I2 | **Fail closed.** A response that does not resolve to the declared identifiers is rejected and recorded, never coerced |
| I3 | **No fabrication.** A missing month produces no row. Nothing is interpolated, carried forward or estimated |
| I4 | **Append-only.** Every retrieval is recorded; nothing is overwritten |
| I5 | **Native fidelity.** Source value, precision, unit and base are stored as published |
| I6 | **Export side only** for Series B, `expDlr` over `expWgt`. Import fields are never used in the ratio |
| I7 | **Series separation.** Series A and Series B are stored as distinct series and are never merged, averaged or used to impute one another |
| I8 | **Credentials are configuration, and neither series requires one.** Both agencies expose the declared identifiers over an official unauthenticated transport, so collection depends on no personal or national identity credential. A registered key, where one is held, is environment configuration that raises the page size only: it is never committed, never recorded in a retrieval, and never changes a published value |

## Stored Outputs

For as long as any published value depends on them: every admitted observation with its vintage and provenance; the computed `uv_usd_per_kg` and the base aggregate for Series B; every published value with its methodology version and reference month; every rejection with its reason; and the attribution metadata each source requires.

## Validation / Quality Rules

| Rule | Behaviour |
| --- | --- |
| Identifier mismatch | Rejected and recorded. Never mapped to the nearest series |
| Unit or base change at source | Rejected into review. A silent base change must never enter a series as if it were a price move |
| Missing month | No point, no substitute |
| Zero or absent weight in Series B | The month is rejected; a division by zero is never published as a value |
| Implausible movement | Recorded and flagged for review, never silently dropped or corrected. There is no automatic outlier rule |
| Provisional value | Published as provisional and labelled |
| Series B mix warning | Attached to the series as a property, not as optional presentation |

## Published Surface

Recorded as requirements for a later phase. **No frontend change is made by this document**, and the current demo surface is untouched.

| # | Requirement |
| --- | --- |
| P1 | Remove the six demonstration chip-price series from the production UMPI path. They are demo data and must never be promoted |
| P2 | Remove `USD/chip`, `1D`, `today` and the branded/eTT family selector from the V1 surface |
| P3 | Show **MoM** as the change, and the **latest reference month** with its vintage |
| P4 | Show source attribution on every surface displaying either series — Bank of Korea for A, Korea Customs Service and the HSK code for B |
| P5 | Distinguish PPI from Export UV plainly, including each series' own base |
| P6 | Display the mix warning on Series B wherever the series appears |
| P7 | Keep HBM withheld, exactly as before |
| P8 | Keep the deferred spot methodology reachable and clearly marked as not V1 |

## Relationship to the deferred spot architecture

[UMPI-DRAM Spot](/docs/methodology/umpi) is **deferred, not deleted and not superseded in substance**. Its six instruments, its USD-per-chip unit, its branded/eTT separation and its 1D close-to-close change remain a correct specification of a different product that Urdais cannot currently license.

- It is **not** UMPI V1, **not** production-ready, and **not** the default public methodology for UMPI.
- Its six instrument identifiers stay attached to it and are **not reused** by the series defined here.
- It becomes relevant again only if Urdais obtains written rights permitting public commercial display of a spot board's prices, from any source.
- Nothing in this document weakens its gates, and nothing in it revives them.

The two are different economic objects. A monthly official index is not a slower version of a daily spot price, and this family does not pretend to be one.

## Deferred and future candidates

Recorded so that a later phase does not rediscover them, and so that none is mistaken for V1 content.

| Candidate | State |
| --- | --- |
| **BOK DRAM export price index** — `402Y016` / `30911201AA`, `2020=100`, monthly, from `197101`, weight 103.4 | **Verified to exist. Not in V1.** The table carries a currency-basis dimension — 계약통화기준, 달러기준, 원화기준 — and choosing among them is a methodology lock this version does not make. A future version may add it as a companion after fixing the currency basis |
| Taiwan HS 854232 unit value | Out. Official Taiwanese material states DRAM there **includes HBM**, and the open-licence status of the specific monthly file is unconfirmed |
| US BLS integrated-circuit PPI | Out of the family. Public domain and citable, but it is not DRAM and would be context only |
| Japan BOJ CGPI MOS memory | Out. Commercial reproduction requires prior permission |
| HBM prices | **Withheld**, unchanged. No official series prices HBM, and a multichip customs code is not an HBM price |

## Lineage and Reproducibility

Published value → methodology version → stored observation with its vintage → agency response with its identifiers → official source.

Both series are **independently reproducible by a third party**: the identifiers, formula, base and rules in this document are sufficient to recompute every published figure from the same public APIs. That property is the reason this architecture exists, and it is the substantive gain over the deferred spot product.

## Publication and Revision Behavior

- **Publication requires an approved methodology version and a working implementation whose values reproduce.** Neither substitutes for the other.
- **Production is fail-closed.** Where requirements are unmet, no value is published and no demo, placeholder or estimated value is shown in its place.
- **Attribution is published with the value**, in the form each agency's terms require.
- **Revisions supersede and are recorded**; they never silently overwrite.

## Methodology Version

**1.0.0.** Status `approved`, effective **22 September 2026**.

Approval permits publication of the two series defined here, and nothing else. It does **not** approve the deferred six-instrument spot architecture, DDR5/DDR4/eTT chip quotes, USD per chip, HBM prices, a composite between the two series, the Bank of Korea export price index, or any proprietary vendor data. Each of those remains outside V1 and would require its own version.

**Approval changes the methodology's standing, not the sources' rights.** The Bank of Korea determination stays `ambiguous_requires_legal_review` with its founder-accepted-risk marker: an approved methodology says Urdais may publish this measurement, not that a question about a source credential has been answered.

**0.1.0-draft** is retained as the superseded predecessor rather than deleted. Values calculated under it were internal-only and were never published; they are regenerated under 1.0.0 rather than relabelled, because the methodology version is part of a calculation's identity.

**Why approval did not relabel the draft's calculations.** A published value must be able to say which public methodology governs it. The draft's records carried the draft's identity, so promoting them by changing a column would have made the lineage assert something that was not true when the number was produced. They are superseded by deterministic recalculation under 1.0.0 from the same inputs, and the draft rows remain for audit.

**Why a new lineage rather than a version bump of the spot methodology.** This product changes the economic object, the sources, the unit, the cadence, the instrument universe, the change calculation and the publication semantics. Nothing of the spot specification survives into it except the family name. Bumping `umpi.md` to `0.2.0-draft` would assert a continuity that does not exist and would destroy a specification that is still correct for its own product. The spot document therefore keeps its version and its content and is marked deferred; this document starts its own lineage at `0.1.0-draft`.

An approved version is never edited in place. A change is made by superseding this version with a successor, so that published values stay attributable to the rules that produced them.

## Version History

**1.0.0, 22 September 2026 — approved, effective 22 September 2026.** First approved version, and the first that permits publication. The economic objects, units, cadence, change definition, rights gates and refusals are exactly those frozen at `0.1.0-draft`: nothing about what is measured changed at approval, which is why the version step is a promotion rather than a redefinition. What it adds is standing — the two series may be published, independently and with their attribution, and Series B carries its trade-unit-value warning wherever it appears. Records calculated under the draft are superseded by recalculation under this version rather than relabelled. Supersedes 0.1.0-draft.

**0.1.0-draft, 22 September 2026.** First definition of the UMPI-KR DRAM family. Pivots UMPI V1 from six proprietary-source daily USD-per-chip spot instruments to two monthly official-data indexes, and defers rather than deletes the spot specification. Defines Series A as the Bank of Korea DRAM Producer Price Index published as a cited series, and Series B as a Urdais-calculated export unit-value index from Korea Customs value and weight under HSK 8542321010, rebased to the 2020 calendar-year aggregate = 100. Freezes the price-index versus unit-value distinction and forbids averaging, blending or mutual imputation; freezes monthly cadence, the MoM change and the ban on interpolation; freezes the append-only vintage and supersession rules and the per-series backfill boundaries; records the attribution and modification-disclosure obligations of both agencies; and bars every proprietary and commercial-lineage source from V1. Records the live verification of all identifiers on 22 September 2026, including the discovery that a DRAM export price index exists on `402Y016` and that an item code alone does not identify a BOK series. No source is ingested, no observation is created, and no production effective date is established.
