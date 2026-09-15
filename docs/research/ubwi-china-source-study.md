# UBWI — China Source Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026 as part of [UBWI Phase 2B](./ubwi-phase2b-coverage-expansion.md). No production value, ingestion contract, schema, migration or collector is created by this document. Every figure below is evidence about a source; none is a published Urdais value.

## Why China is its own document

China is **16.77 % of 2024 world GDP** and **13.85 % of the world's non-human wealth** on the CWON 2020 structural weights — larger than every unobserved economy behind it put together, and larger than the entire gap between Urdais's present coverage and any publication threshold worth naming. [Phase 2A](./ubwi-phase2a-denominator-source-study.md) recorded that no official Chinese national balance sheet was established, and flagged as an open question whether that was a fact about China or a fact about Phase 2A's searching.

This study answers that question.

> **Finding: China is genuinely not directly observable and not defensibly constructible, and the reason is not rights, not language, and not retrieval. The single largest component of Chinese national wealth — land — is reported by the responsible ministry in hectares, and no official compiler publishes a monetary valuation of it, or of the total non-financial asset stock.**

## Method

First-party and official sources only, searched in both English and Chinese, under the terminology the concept actually travels under in Chinese practice: 国家资产负债表 (national balance sheet), 国民资产负债表, 国家财富 / 国民财富 (national wealth), 非金融资产 (non-financial assets), 固定资产 (fixed assets), 固定资本存量 (fixed capital stock), 土地资产 (land assets), 住户财富 (household wealth), 政府资产 (government assets), 企业资产 (enterprise assets), 国际投资头寸 (international investment position), 部门资产负债表 (sector balance sheets), 资金流量表 (flow of funds).

Search engines were used only to locate documents. Every figure below comes from a document retrieved directly, with its HTTP status recorded. Where retrieval failed, that is recorded as a fact about the retrieval.

## What was retrieved, and what it shows

### 1. National Bureau of Statistics — the yearbook has no balance sheet

**China Statistical Yearbook 2025**, English edition, complete table of contents parsed (retrieved earlier on 14 September 2026 in the Phase 2A session; the live host `www.stats.gov.cn` returned **DNS SERVFAIL** from this environment at the time of writing, recorded as a retrieval failure and not as a fact about the source).

Chapter 3, **National Accounts**, contains twenty-three tables. In full, the stock-adjacent ones are:

| Table | What it is |
|---|---|
| 3-1 … 3-14 | Gross domestic product and its composition — **flows** |
| **3-15** | **Flow of Funds Accounts (Non-financial Transaction, 2023)** — 资金流量表（实物交易）, **a transactions table, not a balance sheet** |
| **3-16** | **Flow of Funds Accounts (Financial Transaction, 2023)** — 资金流量表（金融交易）, likewise transactions |
| 3-17 … 3-19 | Primary and disposable income by sector — flows |
| 3-20 | Balance of Payments — flows |
| 3-21 … 3-23 | Input-output tables, 2023 |

A keyword sweep of the entire 770-line table of contents for `Balance Sheet`, `Asset`, `Wealth`, `Capital Stock`, `Net Worth` and `Liabilit` returns **no national balance sheet, no national wealth table, no capital stock table, and no non-financial asset stock for the total economy**. What it does return is instructive about the traps:

- **Energy, petroleum, coal and electricity "Balance Sheets"** (9-3 … 9-6, 28-11) — physical commodity balances, nothing to do with a financial balance sheet.
- **"Investment in Fixed Assets"** (chapter 10, nineteen tables) — 固定资产投资, which is **gross fixed capital formation, a flow**. This is the single most likely thing to be mistaken for a capital stock. It is not one. China does not publish an official 固定资本存量.
- **Balance Sheet of Monetary Authority / Other Depository Corporations / Foreign-funded Banks** (18-10 … 18-12) — financial-sector balance sheets, gross claims, overwhelmingly domestic and therefore consolidated away in the national identity.
- **Assets and Liabilities of Construction Enterprises / Enterprises for Real Estate Development** (14-11 … 14-14, 19-12) — enterprise **book** assets for two industries.

**Conclusion.** The NBS publishes the flow accounts and the input-output framework but not the stock accounts. The flow of funds table is annual and the most recent reference year in the 2025 yearbook is 2023.

### 2. State Council / Ministry of Finance — state assets, in book value and in hectares

**《国务院关于2024年度国有资产管理情况的综合报告》** — *State Council comprehensive report on the management of state-owned assets for 2024*, retrieved from the National People's Congress site `http://www.npc.gov.cn/npc/c2/c30834/202510/t20251028_449021.html` (**HTTP 200**, 25,036 bytes), published 28 October 2025. The Ministry of Finance mirror at `zcgls.mof.gov.cn` returned **HTTP 502** and is recorded as unretrieved.

Verbatim, as at end-2024:

> 「汇总中央和地方情况，全国国有企业国有资本权益总额109.4万亿元，对应国有企业资产总额401.7万亿元、负债总额260.5万亿元，平均资产负债率64.8%。」

> 「汇总中央和地方情况，全国国有金融资本权益总额33.9万亿元，对应金融企业资产总额487.9万亿元、负债总额435.9万亿元。」

> 「汇总中央和地方情况，全国行政事业性国有资产总额68.2万亿元、负债总额12.8万亿元、净资产55.4万亿元。」

> 「（四）国有自然资源资产 截至2024年末，全国国有土地总面积**52413.0万公顷**；……2024年，全国国有建设用地出让价款4.1万亿元；全国矿业权出让收益1383.9亿元。」

**Four reasons this cannot enter the denominator, in descending order of severity.**

**Land is in hectares.** 524.13 million hectares of state-owned land, reported as an **area**. The only monetary land figures in the report are 出让价款 — the year's **land-transfer revenue**, ¥4.1 tn, a flow — and mining-rights transfer receipts, ¥138.4 bn, also a flow. Converting a year of transfer revenue into a stock value would be a capitalisation model invented by Urdais, not an observation, and the methodology's rule against forcing a source to support a concept it does not support applies directly. **This is the binding constraint, and it is the same constraint as everywhere else in Phase 2A — land — in its most extreme form.**

**It is state-owned assets only.** Private and foreign-invested enterprises, and the household sector, are outside the report by construction. Chinese household wealth is dominated by dwellings, and no official compiler publishes a market valuation of the residential dwelling stock.

**The enterprise figures are gross book assets, not net worth at market value.** 资产总额 ¥401.7 tn for non-financial SOEs and ¥487.9 tn for financial SOEs are balance-sheet totals under Chinese accounting standards, which include financial assets. Adding them to anything would double count on a scale that dwarfs the quantity being measured — the financial-enterprise figure alone is roughly four times China's GDP and consists almost entirely of claims on other domestic sectors. This is precisely the error the anti-double-counting rule exists to prevent.

**The reference basis is not market value.** Nothing in the report states a market-value basis, and 行政事业性国有资产 are administrative assets carried at acquisition cost less depreciation.

### 3. State Administration of Foreign Exchange — the one component that is clean

**《国家外汇管理局公布2025年末我国国际投资头寸表》**, retrieved from `https://www.safe.gov.cn/safe/2026/0327/27298.html` (**HTTP 200**, 121,329 bytes), published 27 March 2026, index number 000014453-2026-00229.

> 「2025年末，我国对外金融资产117860亿美元，对外负债77147亿美元，**对外净资产40713亿美元**。」

**China's net international investment position at end-2025 is US$4,071.3 bn.** Assets US$11,786.0 bn, liabilities US$7,714.7 bn. The release is quarterly, revised on a published mechanism, denominated in USD directly so no FX conversion is needed, and is exactly the `NFA` term the UBWI identity requires.

**It is also useless on its own**, and the arithmetic says why. In the observed economies, net foreign assets are between −23 % and +11 % of national net worth, and the non-financial asset stock is the rest. China's NFA is about 3 % of the country's 2024 GDP. The identity is $W = NF + NFA$; Urdais has $NFA$ to the nearest hundred million dollars and has no $NF$ at all.

### 4. NIFD / CASS — a research series, published as a book

国家金融与发展实验室 (National Institution for Finance & Development) hosts a 国家资产负债表研究中心 (Center for National Balance Sheet Research). Its site `nifd.cn` was retrieved (HTTP 200) and its public **数据 DATA** section offers exactly one series: 宏观杠杆率, the macro leverage ratio. **The balance sheet itself is not on the site.** 《中国国家资产负债表 2020》 is a priced monograph from 中国社会科学出版社.

Three separate reasons this cannot be the denominator source for China:

1. **It is not an official statistical product.** NIFD is a think tank affiliated with the Chinese Academy of Social Sciences, not a statistical authority under the Statistics Law.
2. **Its rights were not established and its data is not machine-retrievable.** A book is not an interface.
3. **Phase 1's McKinsey precedent controls.** A single research publisher's proprietary aggregate, whose construction Urdais cannot reproduce from primary components, is a cross-check and not a denominator — even when it is measuring the right concept.

### 5. Retrieval failures, recorded as such

| Target | Result |
|---|---|
| `www.stats.gov.cn` (yearbook index, NBS data portal, NBS commentary) | **DNS SERVFAIL** from this environment at the time of writing. The Phase 2A session reached the same host successfully earlier the same day, so this is a network condition, not a source posture. |
| `www.qstheory.cn` (求是, Party theoretical journal, article on national balance sheet management) | **DNS ENOTFOUND / HTTP 000** |
| `zcgls.mof.gov.cn` (Ministry of Finance mirror of the state-asset report) | **HTTP 502** |

**One claim was deliberately not used.** Search results assert that the NBS has compiled an annual national balance sheet internally since 2018 without publishing it. The document that would establish this is on `stats.gov.cn`, which could not be reached. **That claim is therefore recorded as unverified and no weight is placed on it.** If true it changes nothing operationally — an unpublished statistic is not a source — but it would change the outreach calculus, and it should be re-checked when the host is reachable.

## Rights, for completeness

The NBS terms of service (retrieved in the Phase 2A session, `stats.gov.cn/sj/tjzs/fwtk`) state:

> 「三、数据使用 1.用户可以在本网站下载和使用国家统计局发布的统计数据；」

— users may download and use published statistical data. But the same page requires attribution, reserves copyright (「本网所有内容，未经注明，版权一律归国家统计局网站所有」), and limits reuse to 「以新闻性或资料性公共免费信息为使用目的的合理、善意引用」 — reasonable, good-faith citation for news or reference purposes as free public information. **That purpose limitation is not a grant of commercial derived use**, and under Urdais's rule permission is not inferred. NBS would be recorded as *retrieval: under review, data use: under review*.

**This is moot.** The rights question never binds, because the statistic does not exist. Permission cannot create data. No outreach to any Chinese compiler is drafted or recommended.

## Component construction, tested and rejected

Phase 3 of the Phase 2B brief requires testing whether $W_{CHN} = NF_{CHN} + NFA_{CHN}$ can be built from primary components. It cannot, and the rejection is on the brief's own stated criteria:

| Criterion | Verdict for China |
|---|---|
| Components conceptually compatible | **Fails.** Gross book assets of state enterprises, an area of land in hectares, and a USD net investment position are three different kinds of object. |
| Valuation bases documented | **Fails.** No market-value basis is stated anywhere for the asset figures. |
| Double counting controlled | **Fails.** ¥487.9 tn of financial-enterprise assets are overwhelmingly claims on other resident sectors. |
| Reference dates reconcilable | Passes — 2024/2025 figures are current. Irrelevant given the rest. |
| Consistent with the UBWI denominator concept | **Fails.** State-owned only; households and private enterprises entirely absent. |

> **The construction is rejected. Building a Chinese national wealth figure by adding SOE book assets, an administrative asset total and a land area would be exactly the "adding unrelated asset-class estimates" the brief prohibits, and it would produce a number that looked authoritative and meant nothing.**

## Conclusion

> ### China is still blocked, and the blocker is a statistic that is not compiled.

Phase 2A's classification survives the deeper search and is now supported rather than merely asserted. To restate it precisely, since the three states have different remedies:

- **Not directly observable.** No official compiler publishes a national balance sheet, a total non-financial asset stock, a fixed capital stock, or a monetary land valuation.
- **Not defensibly constructible.** The one clean primary component, SAFE's net international investment position, is the small term in the identity. The large term has no primary source at any level of aggregation.
- **Not a rights problem, and not an outreach target.** Nothing is being withheld from Urdais that anyone could grant.

**Consequence for the phase.** China is 16.77 % of world GDP. Its absence is not a gap that closes with effort, and the coverage arithmetic in [the Phase 2B study](./ubwi-phase2b-coverage-expansion.md) shows that **80 % of world GDP directly observed is unreachable without it** — the ceiling on every economy that today publishes a valued non-financial asset total, or plausibly could from existing statistical programmes, is **62.93 %**.

The honest statement of the China problem is therefore not "Urdais cannot get China". It is: **the world's second-largest economy does not publish, in monetary terms, the stock of the thing UBWI's denominator is made of, and no amount of Urdais's effort changes that.**

## Sources

All retrieved 14 September 2026 unless stated.

**Verified by direct call.** [State Council comprehensive report on state-owned asset management for 2024, npc.gov.cn](http://www.npc.gov.cn/npc/c2/c30834/202510/t20251028_449021.html) (HTTP 200). [SAFE, China's international investment position at end-2025](https://www.safe.gov.cn/safe/2026/0327/27298.html) (HTTP 200). [NIFD](http://www.nifd.cn/) and its [Center for National Balance Sheet Research](http://www.nifd.cn/Center/Details/73) (HTTP 200).

**Retrieved in the Phase 2A session earlier the same day and parsed here.** China Statistical Yearbook 2025 English table of contents (`stats.gov.cn/sj/ndsj/2025/`); NBS terms of service (`stats.gov.cn`).

**Attempted and not retrieved. No figure from any of these is used.** `www.stats.gov.cn` — DNS SERVFAIL at the time of writing. `www.qstheory.cn` — DNS failure. `zcgls.mof.gov.cn` — HTTP 502.
