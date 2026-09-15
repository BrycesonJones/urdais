# UBWI Phase 2C — Final Denominator Hardening Before Production

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. No production value, ingestion contract, schema, migration or collector is created by this document. Every figure below is either evidence about a source or a labelled research candidate; **none is a published Urdais value**, and no UBWI value is published, seeded or promoted by this phase.

Continues [the Phase 2B study](./ubwi-phase2b-coverage-expansion.md), [the Phase 2A source study](./ubwi-phase2a-denominator-source-study.md) and [the Phase 1 source study](./ubwi-phase1-source-study.md), supports [UBWI 0.1.0-draft](/docs/methodology/ubwi), and is accompanied by [the China source study](./ubwi-china-source-study.md). **No amendment to the methodology is proposed or required.** The denominator concept is unchanged: consolidated world net worth at market value, excluding human capital, on national-balance-sheet logic, with Bitcoin inside its own denominator and no lost-coin adjustment.

## The question

> **How far can Urdais push the rights-cleared observed Total Global Wealth denominator using already-identifiable, high-value national sources, and what is the strongest defensible V1 denominator?**

## Headline Result

> ### Every observed economy is now rights-cleared, and the publication gate Phases 2A and 2B proposed turns out to be arithmetically impossible.

**One. The rights gap closed to zero.** Phase 2B ended with 53.99 % of world GDP technically observed and **47.66 % rights-cleared**, the 6.33 pp difference being Germany and Italy. Both are resolved, neither by outreach. Germany is re-sourced from **Eurostat** (`N11N` + `N211N` + `BF90`), which reproduces the Destatis/Bundesbank *Volksvermögen* to **0.25 %**; Italy from **Istat's own SDMX service** plus Eurostat, which reproduces the Istat/Banca d'Italia joint publication to **0.03 %**. **Rights-cleared observed coverage is now 53.99 % — identical to technically observed coverage, on 16 of 16 economies.**

**Two. Four national compilers replaced four OECD rows, and three of them were years fresher.** Japan moves from OECD 2022 to **Cabinet Office ESRI, end-2024**; the United Kingdom from OECD 2021 to **ONS, end-2024**; Canada from OECD 2022 to **Statistics Canada, 31 December 2025** (a quarterly series whose latest point is 30 June 2026); Korea from OECD 2022 to **Bank of Korea, end-2025**. The GDP-weighted mean vintage improves from **2023.71 to 2024.39**. Korea's own figure is **10.9 % higher** than the OECD's for the same year, because Korea rebased to 2020 and the OECD extract had not.

**Three. Two "blocked" sources were blocked by this machine's DNS resolver, not by the source.** `www.esri.cao.go.jp` and `www.stats.gov.cn` both return `SERVFAIL` from the local resolver and both resolve normally through 8.8.8.8 and 1.1.1.1. Japan's entire national balance sheet was two `nslookup` calls away across two phases. This is a production finding about retrieval, not about Japan or China.

**Four. The France discrepancy is resolved, at the source, exactly.** INSEE and the Banque de France publish France's *patrimoine national* at 31 December 2025 as **€20,235.4 bn**. Eurostat's `N1N + N2N + BF90` for the same date is **€20,235.381 bn** — agreement to one part in 10⁵, on all three legs separately. **Eurostat is right; the OECD's `BF90` with `COUNTERPART_AREA=W` is the outlier**, and after this phase's re-sourcing it survives in the observed set only for Mexico, Russia and New Zealand.

**Five. `NonProductionDataflow = true` is on all 1,548 dataflows in the OECD's public SDMX registry**, including OECD's headline annual GDP flow and third-party flows mirrored from Eurostat and the IAEG-SDGs. It carries no information distinguishing `DF_TABLE9B` from anything else. Phase 2B's caution is withdrawn.

**Six — and this is the phase's most consequential finding. The gate Phases 2A and 2B proposed cannot be met by any attainable denominator.** An imputed-share bound of ≤ 25 % requires **68.44 %** observed GDP coverage. The ceiling without China is **62.93 %**, and that ceiling already assumes nineteen statistical offices begin valuing land. **A ≤ 25 % imputed share and a ≥ 70 % coverage gate are not stretch targets; they are outside the feasible set**, and a gate outside the feasible set is a decision never to publish, taken by arithmetic rather than by judgement.

**Decision: ready after one limited source/rights fix.** The rights work is finished, the vintage profile is current, the two cross-route disagreements are resolved or bounded, and the feasible frontier is measured. What remains is one bounded item: Korea's ECOS operational API key, which the Bank of Korea reviews rather than auto-approves, and which a production collector needs.

## Method and Evidence Standard

Unchanged from Phases 2A and 2B. Every figure was retrieved on 14 September 2026 unless stated, from a named source with a URL, with the HTTP status of each retrieval recorded. Figures Urdais computes rather than reads are labelled **own computation** with their inputs. Documents that could not be retrieved are recorded as unretrieved and **no figure from them is used**. A retrieval failure is a fact about the retrieval, not about the source — the rule that produced finding three.

Search engines were used only to locate documents and are never cited as evidence. All research was performed sequentially by direct `urllib` and `curl` calls; no sub-agents were used.

---

## Part 1 — Corrections to Phase 2B

Three, recorded first because each would otherwise propagate.

### 1.1 The OECD Cloudflare gate is intermittent, not path-specific

Phase 2B concluded: *"the gate is real and path-specific; the canonical path is simply not gated."* **That is wrong.**

The canonical URL `https://www.oecd.org/en/about/terms-conditions.html` was re-run with Phase 2B's exact three headers, twice, roughly twenty minutes after its successful HTTP 200, and returned **HTTP 403 both times**. The same URL that served 1,482,983 bytes of terms served a Cloudflare interstitial shortly afterwards. The gate is a rate- and reputation-sensitive bot challenge applied to the host, and any URL on it can return 403 at any time.

**The rights conclusion is unaffected and stands.** The cached artifact at `scratchpad/oecd/https_www_oecd_org_en_about_terms_conditions_html.html` (1,482,983 bytes) was re-read this phase and contains, verbatim under *Permitted Use*:

> "Except where additional restrictions apply as stated above, you can extract from, download, copy, adapt, print, distribute, share and embed Data for any purpose, even for commercial use."

A Wayback snapshot of the same canonical URL, also cached, contains the identical sentence. **The grant is corroborated by two independent retrievals and does not depend on the page being reachable today.**

**What changes is the production design, and it changes materially.** A scheduled collector *will* receive HTTP 403 from a URL that grants it access.

- A 403 from a terms page **must not** be interpreted as a licence change, a revocation, or a reason to demote a source's rights state.
- Rights state must be anchored to a **cached, hashed terms artifact with its own retrieval timestamp**, not re-derived from a live fetch on each run.
- Re-confirmation is a **scheduled, failure-tolerant** task whose negative result is "not re-confirmed today", never "no longer permitted". Only a *successfully retrieved* terms document whose text has changed may move a rights state.

This generalises beyond the OECD and is the single most important operational correction in the phase.

### 1.2 Two sources were blocked by the local DNS resolver

Phase 2B's open question 8 records China as *"blocked on `stats.gov.cn` DNS resolution"*, and Phase 2B's open question 4 records Japan's Cabinet Office route as *"not attempted"*.

Own measurement, this phase:

| Host | Local resolver (192.168.68.1) | 8.8.8.8 | 1.1.1.1 |
|---|---|---|---|
| `www.esri.cao.go.jp` | **SERVFAIL** | 210.148.118.43 | 210.148.118.43 |
| `www.cao.go.jp` | **SERVFAIL** | 210.149.83.57 | — |
| `www.stats.gov.cn` | **SERVFAIL** | 121.32.243.92 (via `qaxcloudwaf.com`) | — |

Fetching `https://www.esri.cao.go.jp/jp/sna/menu.html` with `curl --resolve` against the public answer returned **HTTP 200, 17,552 bytes** on the first attempt, and the complete Japanese national balance sheet followed. **Japan's balance sheet was unreachable for two research phases because of a resolver, and the failure was recorded as a property of the source.**

**Production rule:** a collector must distinguish *resolution* failure from *source* failure, must use an explicit resolver rather than the host's default, and must never record a DNS failure as a source state. This is now the second finding in two phases where a retrieval defect was mistaken for a fact about a compiler.

**On China:** the resolver finding is a lead about *reachability*, not about content, and [the China study's conclusion is unaffected](./ubwi-china-source-study.md) — the NBS does not publish, in monetary terms, a national stock of non-financial assets or a land valuation, and reaching the site does not create one. **China research is not reopened by this phase.** The one thing that changes is that `stats.gov.cn` should be recorded as *reachable, content-insufficient* rather than *unreachable*, because those are different findings and only one of them is about China.

### 1.3 Germany's `Vermögensbilanzen` is not discontinued — it moved

Phase 2B recorded the publication as *"discontinued after reference year 2022"*. The 2022 workbook's own cover says something narrower: 「Diese Publikation wird **letztmalig gemeinsam** vom Statistischem Bundesamt und der Deutschen Bundesbank mit dem Berichtszeitraum 2022 veröffentlicht … **Auf den Seiten der Deutschen Bundesbank wird auch weiterhin eine aktualisierte Version verfügbar sein.**」 — the *joint* publication ended; an updated version continues on the Bundesbank's pages.

It does. `https://www.bundesbank.de/de/statistiken/gesamtwirtschaftliche-rechenwerke/vermoegensbilanzen/vermoegensbilanzen-773974` (HTTP 200) carries ***Sektorale und gesamtwirtschaftliche Vermögensbilanzen 1999–2024*, dated 14 April 2026**, in PDF and XLSX. The XLSX was retrieved (HTTP 200, 74,545 bytes) and parsed. **A successor exists and is two reference years fresher than Phase 2B recorded.** See Part 3.2 for why the phase nonetheless takes Germany from Eurostat.

---

## Part 2 — Workstream 1: Japan, the United Kingdom, Canada, Korea

All four now come from their national compiler. Together they are **12.77 % of 2024 world GDP** and were carried at OECD vintages of 2021–2022.

### 2.1 Japan — Cabinet Office ESRI, end-2024

**Source.** 内閣府 経済社会総合研究所 (Cabinet Office, Economic and Social Research Institute), *2024年度 国民経済計算年次推計* (2024 annual national accounts estimates), **stock edition released 20 January 2026**. Table **`統合勘定 / 1. 期末貸借対照表勘定`** (Integrated accounts, closing balance sheet account), retrieved as `https://www.esri.cao.go.jp/jp/sna/data/data_list/kakuhou/files/2024/tables/2024sca_jp.xlsx` (**HTTP 200**, 55,741 bytes, parsed). Units 十億円 (JPY billion), stocks at calendar year-end, series run 1994–2024.

| Line | Item | 2022 | 2023 | **2024** |
|---|---|---:|---:|---:|
| 1 | 非金融資産 Non-financial assets | 3,748,583.8 | 3,863,661.3 | **4,011,002.3** |
| 1(2)a | 土地 **Land** | 1,402,301.1 | 1,446,837.6 | **1,510,508.8** |
| 2 | 金融資産 Financial assets | 9,174,866.0 | 9,716,494.7 | 10,108,401.2 |
| 3 | 負債 Liabilities | 8,751,409.2 | 9,240,215.6 | 9,569,929.3 |
| **4** | **正味資産 NET WORTH** | 4,172,040.6 | 4,339,940.4 | **4,549,474.2** |

Own computation reproduces the published net worth exactly: 4,011,002.3 + 10,108,401.2 − 9,569,929.3 = **4,549,474.2**.

- **Land: included**, ¥1,510,508.8 bn = **37.7 %** of non-financial assets.
- **Consumer durables: outside the balance sheet.** 家計の主要耐久消費財残高 appears only as a 参考表 (reference table), consistent with the SNA asset boundary. No stripping required.
- **Historic monuments** appear as a memo line (¥724.9 bn) and are not in the total.

**Against the OECD route.** OECD `NN` for Japan 2022 is ¥3,577.3 tn against ESRI's ¥3,748.6 tn (**4.6 % lower**); OECD `BF90(W)` is ¥444.1 tn against ESRI's net financial position of ¥423.5 tn (**4.9 % higher**). Phase 2B's Japan row was **¥4,021.3 tn against the compiler's own ¥4,172.0 tn for the same year — 3.6 % low.**

**Rights: cleared.** `https://www.cao.go.jp/notice/rule.html` (HTTP 200, 令和7年3月25日現在) states that Cabinet Office website content is subject to 公共データ利用規約（第1.0版）(Public Data Terms of Use v1.0, Digital Agency) unless otherwise marked, with exclusions only for symbol marks, logos and character designs. That licence (`https://www.digital.go.jp/resources/open_data/public_data_license_v1.0`, HTTP 200) states:

> 「当ウェブサイトで公開している情報は … **複製、公衆送信、翻訳・変形等の翻案等、自由に利用できます。商用利用も可能です。**」
> 「なお、**数値データ、簡単な表・グラフ等は著作権による保護の対象ではありません**ので、これらについては本利用ルールの適用はなく、自由に利用できます。」

Reproduction, public transmission and adaptation, freely, commercial use included; numerical data and simple tables are not copyright-protected at all. Attribution required, and where content is edited or processed that must be stated separately.

### 2.2 United Kingdom — ONS, end-2024

**Source.** Office for National Statistics, *The UK national balance sheet estimates*, dataset landing `https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/datasets/thenationalbalancesheetestimates/data` (HTTP 200), **release date 18 December 2025**, described by ONS as *"Annual estimates of the market value of financial and non-financial assets for the UK"*. Workbook `nbsreferencetables2025.xlsx` retrieved (**HTTP 200**, 532,615 bytes, parsed). **Table C — *The UK national balance sheet: net worth at end of 2024, current prices (£ million)***, row *Total economy*:

| ESA code | Item | £ mn |
|---|---|---:|
| AN.11 | Fixed assets | 5,730,280 |
| AN.12 | Inventories | 377,169 |
| AN.1 | Produced non-financial assets | 6,107,449 |
| **AN.2151** | **Land** | **7,117,771** |
| AN.2 | Non-produced non-financial assets | 7,122,404 |
| **AN** | **Total non-financial assets** | **13,229,853** |
| AF.A | Total financial assets | 37,376,228 |
| AF.L | Total financial liabilities | 37,521,788 |
| **BF.90** | **Financial net worth** | **−145,560** |
| **B.90** | **NET WORTH** | **13,084,293** |

Own computation: 13,229,853 − 145,560 = **13,084,293**, reproducing the published net worth exactly.

- **Land: included**, £7,117,771 mn = **53.8 %** of non-financial assets — the highest land share in the observed set.
- **Consumer durables: outside** the asset list (ESA 2010 boundary).
- Phase 2B's UK row was OECD 2021 at £11,916,157 mn. This is **three reference years fresher**.

**Rights: cleared, and this also dissolves a Phase 2B blocker.** `https://www.ons.gov.uk/help/terms-conditions` (HTTP 200, © Crown copyright 2026): *"Most content on this website is subject to Crown copyright protection and is published under the Open Government Licence (OGL)"*, with exemptions only for photographs, illustrations and videos under third-party agreements. OGL v3 (`https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/`, HTTP 200) grants a *"worldwide, royalty-free, perpetual, non-exclusive licence"* to *"copy, publish, distribute and transmit"*, *"adapt"*, and *"exploit the Information commercially and non-commercially"*, with attribution.

Phase 2B had to drop Eurostat's UK rows because **Eurostat's commercial-reuse exception excludes non-EU/EFTA/candidate countries**, and fell back to the OECD at 2021. Sourcing the UK from its own compiler removes that constraint entirely.

### 2.3 Canada — Statistics Canada, 31 December 2025 (quarterly)

**Source.** Statistics Canada **Table 36-10-0580-01, *National Balance Sheet Accounts***, via the Web Data Service (`https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata`, HTTP 200). Cube metadata: quarterly, **1990-01-01 to 2026-04-01, released 2026-09-11**, status *CURRENT*. Sector dimension member 2, *National balance sheets*; valuation member 1, *Market value*. Data by vector (`getDataFromVectorsAndLatestNPeriods`, HTTP 200), C$ millions:

| Vector | Item | 2025-10-01 (31 Dec 2025) | 2026-04-01 (30 Jun 2026) |
|---|---|---:|---:|
| 62693710 | Non-financial assets | 17,437,298 | 18,356,907 |
| 62693711 | — Produced | 9,882,859 | 10,068,176 |
| 1290926673 | — — Fixed assets | 8,246,631 | 8,434,709 |
| 62693717 | — — Inventories | 663,461 | 648,457 |
| **62693716** | — — **Consumer durables** | **972,767** | 985,010 |
| 62693719 | — Non-produced | 7,554,439 | 8,288,731 |
| **62693720** | — — **Land** | **6,369,477** | 6,557,606 |
| 62693721 | Net financial assets | 1,671,317 | 1,945,455 |
| **62693792** | **Net worth** | **19,108,615** | **20,302,362** |

Own computation: 17,437,298 + 1,671,317 = **19,108,615** ✓, and 8,246,631 + 663,461 + 972,767 = **9,882,859** ✓.

- **Canada includes consumer durables as a produced non-financial asset** (category 8, its own vector). The methodology excludes them on the authority of 2025 SNA 4.120, as it does for the United States. **Canada's figure is therefore 19,108,615 − 972,767 = C$18,135,848 mn.** Phase 2B's OECD-sourced Canadian row did not strip them, because the OECD aggregate does not expose them.
- **Land: included**, C$6,369,477 mn.

**Selection rule, stated because Canada is the first quarterly source.** The observed set takes **the latest published observation at or before 31 December of the latest complete calendar year** — here 2025 Q4. This is a selection rule, not interpolation; no stock is bridged. The 30 June 2026 point exists and is disclosed, and a future phase may adopt a different rule, but mixing a mid-2026 stock into a set otherwise dated 31 December 2025 would repeat Australia's disclosed date mismatch without Australia's excuse (Australia has no December observation; Canada does).

**Rights: cleared.** `https://www.statcan.gc.ca/en/terms-conditions/open-licence` (HTTP 200), *Statistics Canada Open Licence*: a *"worldwide, royalty-free, non-exclusive licence to: use, reproduce, publish, freely distribute, **or sell** the Information; use, reproduce, publish, freely distribute, or sell **Value-added Products**; and, sublicence any or all such rights"*, where *Value-added Products* means *"any products you have produced by adapting or incorporating the Information"*. Attribution form specified: *"Adapted from Statistics Canada, name of product, reference date. This does not constitute an endorsement by Statistics Canada of this product."*

**One production caveat, quoted:** *"Statistics Canada may modify this licence at any time, and such modifications shall be effective immediately upon posting … Your use of the Information will be governed by the terms of the licence in force as of the date and time you accessed the Information."* The licence is versioned by access time, which is an argument for the cached-terms-artifact rule in Part 1.1 rather than against the source.

### 2.4 Korea — Bank of Korea, end-2025

**Source.** Bank of Korea **ECOS** statistical table **`291Y505`, *제도부문별 대차대조표(명목, 연말기준)*** (Balance sheet by institutional sector, nominal, year-end), under *2.4. 국민대차대조표(2020년 기준년)* — the National Balance Sheet on 2020 base year, compiled jointly by the Bank of Korea and Statistics Korea. Retrieved through the ECOS Open API (`https://ecos.bok.or.kr/api/StatisticSearch/…`, HTTP 200). Sector `SEC10` 국내 (domestic total economy), units 십억원 (KRW billion):

| Item | 2022 | 2023 | 2024 | **2025** |
|---|---:|---:|---:|---:|
| 비금융자산 Non-financial assets | 21,578,884.3 | 21,850,436.4 | 22,433,325.1 | **23,290,594.3** |
| — 토지자산 **Land** | 12,017,252.4 | 11,889,360.0 | 12,106,754.2 | **12,660,370.2** |
| 금융자산 Financial assets | 21,938,540.5 | 22,967,220.6 | 24,524,765.3 | 27,318,477.0 |
| 금융부채 Financial liabilities | 20,924,053.1 | 21,929,084.0 | 22,927,698.1 | 26,047,617.1 |
| **순자산 NET WORTH** | 22,593,371.7 | 22,888,573.0 | 24,030,392.3 | **24,561,454.2** |

Own computation reproduces the published net worth exactly in all four years. The rest-of-world sector (`SEC11`) carries the mirror-image net worth (−1,263,979.7 for 2025), confirming the consolidation.

- **Land: included**, KRW 12,660,370.2 bn = **54.4 %** of non-financial assets.
- **Consumer durables: not in the asset list** (비금융생산자산 comprises 건설자산, 설비자산, 지식재산생산물, 재고자산).
- **Against the OECD route: the largest single-country correction in the phase.** OECD `NN` for Korea 2022 is KRW 19,402.8 tn against the Bank of Korea's 21,578.9 tn — **10.1 % low** — and Phase 2B's Korea net worth of KRW 20,380.3 tn is **9.8 % below** the compiler's own 22,593.4 tn for the same year. The cause is the 2020 rebasing, which the OECD extract predates.

**Rights: data use cleared; retrieval permitted, with a registration step that is a named production task.**

The Bank of Korea's 저작권보호방침 (`https://www.bok.or.kr/portal/main/contents.do?menuNo=200228`, HTTP 200) states that BOK website information is copyright-protected and that, under the 공공데이터법 (Public Data Act):

> 「1. 한국은행이 「공공데이터법」 제19조에 따라 공표하여 홈페이지에 게시한 제공대상 공공데이터는 **별도의 절차 없이 자유롭게 이용**할 수 있습니다.」
> 「4. 한국은행 홈페이지에 게시된 정보를 이용할 때에는 **출처가 한국은행임을 반드시 밝혀야** 하며, 해당 정보를 수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다.」

Public data published under Article 19 may be used freely without any separate procedure; attribution to the Bank of Korea is mandatory, and modification must be disclosed. The BOK's own 공공데이터 목록 page returns 「콘텐츠 준비중입니다」 (content in preparation) and could not be read, so the list itself was not retrieved. **The gap is closed from the other side:** the Bank of Korea's registration of its national-accounts Open API on Korea's national open-data portal, `https://www.data.go.kr/data/15059629/openapi.do` (HTTP 200, 제공기관 한국은행, 관리부서 데이터관리허브팀), declares **비용부과유무 무료** and **이용허락범위 제한 없음** — free of charge, **no restriction on the scope of use**.

**The residual, stated plainly.** The same registration declares 심의유형: **개발단계 자동승인 / 운영단계 심의승인** — a development API key is auto-approved, an **operational key is granted after review by the Bank of Korea**. The figures above were retrieved with the publicly documented `sample` key, which is expressly provided and is capped at ten records per call. **A production collector needs an operational key, and that key is reviewed rather than issued on request.** This is the one remaining item in the phase's final decision.

---

## Part 3 — Workstream 2: Germany and Italy

### 3.1 The rights question, restated

Phase 2B left both `under review` on the data-use axis for different reasons: Destatis grants *reproduction and distribution* and is silent on *adaptation*; the Italian figure came from a joint Istat / Banca d'Italia publication and Banca d'Italia's site copyright requires prior written authorisation. Both are resolved, and in both cases the resolution was to **find the same numbers behind a licence that already says what Urdais needs**, rather than to argue about what a narrower clause implies.

### 3.2 Germany — Eurostat reproduces the German compiler's own aggregate

**First the successor question, because the brief asks it directly.** A successor exists. *Sektorale und gesamtwirtschaftliche Vermögensbilanzen 1999–2024*, Deutsche Bundesbank, **14 April 2026**, XLSX retrieved (HTTP 200, 74,545 bytes, parsed), Mrd. EUR am Jahresende, sheet `S1 + S 11`, *Gesamte Volkswirtschaft*:

| Item | 2022 | 2023 | **2024** |
|---|---:|---:|---:|
| Sachvermögen (non-financial assets) | 21,431.6 | 22,371.3 | **23,525.5** |
| — Anlagevermögen (fixed assets) | 14,363.2 | 15,445.7 | **15,872.8** |
| — **Grund und Boden (land)** | 7,068.4 | 6,925.6 | **7,652.7** |
| Forderungen gegenüber dem Ausland | 12,469.0 | 13,012.7 | 14,195.9 |
| Verbindlichkeiten gegenüber dem Ausland | 9,544.1 | 9,832.3 | 10,486.2 |
| **Volksvermögen (= Reinvermögen)** | **24,356.5** | 25,551.7 | **27,235.2** |
| (memo) Gebrauchsvermögen privater Haushalte | 1,092.4 | 1,167.3 | 1,188.1 |

Own computation: 23,525.5 + 14,195.9 − 10,486.2 = **27,235.2** ✓. Consumer durables are a memo line outside the headline.

**A vintage warning falls out of this.** The discontinued 2022 workbook gave 2022 *Volksvermögen* as **25,357.8** — the number Phase 2B used. The current publication gives 2022 as **24,356.5**, a **−3.9 %** revision, with a footnote recording a correction applied on 13 April 2026. **A stale vintage is not merely old; it can be wrong about its own year by more than a typical year's growth.**

**Why Germany is nonetheless taken from Eurostat.** The Bundesbank file carries 「© Deutsche Bundesbank, 2025/2026. **Publizistische Verwertung nur mit Quellenangabe gestattet.**」 — publishing use permitted, attribution the only condition. That is stronger than Phase 2B's Destatis clause, but it is a permission notice, not a licence, and it does not expressly grant adaptation or commercial derived use. Urdais does not infer permission. **Destatis's GENESIS-Online, the DL-DE/BY-2.0 route Phase 2B named as the remedy, is not anonymously machine-retrievable**: the documented REST base `https://www-genesis.destatis.de/genesisWS/rest/2020/…` now redirects to a JavaScript announcement page (`genesis.destatis.de/datenbank/online/announcement`, HTTP 200, 2,506 bytes, *"You need to enable JavaScript to run this app"*) and returns no data to an unauthenticated request. The Bundesbank publishes no dataset on GovData (CKAN `package_search` for *Vermögensbilanz* returns **count 0**), so no DL-DE licence attaches there either.

**Eurostat carries the identical German figures, under a licence that is read and permissive.** Own computation from `nama_10_nfa_bs` (S1, `CP_MNAC`) and `nasa_10_f_bs` (`BF90`, S1, consolidated), EUR million, reference year 2024:

| Eurostat code | Value | German compiler's own figure | Match |
|---|---:|---:|---|
| `N11N` fixed assets, net | 15,872,831 | Anlagevermögen 15,872.8 bn | **exact** |
| `N211N` land | 7,652,655 | Grund und Boden 7,652.7 bn | **exact** |
| sum = non-financial assets | 23,525,486 | Sachvermögen 23,525.5 bn | **exact** |
| `BF90` S1 consolidated | 3,641,996 | net foreign position 3,709.7 bn | 1.8 % |
| **total** | **27,167,482** | **Volksvermögen 27,235.2 bn** | **0.25 %** |

> **Germany = €27,167,482 mn at end-2024, from Eurostat, reproducing the German national compiler's own published *Volksvermögen* to 0.25 %.**

**On the asset aggregate, stated explicitly because the brief forbids silently combining incompatible components.** Eurostat publishes neither `N1N` nor `N2N` for Germany. The construction is `N11N + N211N`, which is *not* the general SNA non-financial total — and that is exactly right here, because it is **the aggregate the German compiler itself publishes**: 「So sind **weder für das Vorratsvermögen und das Vermögen an Wertsachen**, noch zu den **über den Grund und Boden hinausgehenden nichtproduzierten Vermögensgütern** … entsprechende Daten verfügbar」. German *Sachvermögen* is fixed assets plus land and nothing else, by the compiler's own statement. The construction is therefore concept-matched, and it is validated numerically against the compiler's total.

**Germany's figure is a one-directional understatement** — inventories, valuables, mineral and water resources are missing — of the same class as Italy's.

**Rights: cleared.** Eurostat copyright notice (`https://ec.europa.eu/eurostat/web/main/help/copyright-notice`, retrieved Phase 2B, HTTP 200): commercial and non-commercial reuse authorised with attribution, no written licence required. **Germany is an EU Member State, so the non-EU/EFTA/candidate commercial-reuse exception does not apply.**

### 3.3 Italy — Istat's own dissemination service, plus Eurostat

**Source.** Istat SDMX web service (`https://esploradati.istat.it/SDMXWS/rest/`), dataflow **`IT1,94_1063_DF_DCCN_ISTITUZ_ANA1_5,1.0` — *Stock of non-financial assets***, indicator `LEN_D_W0` *stock of non financial assets (net)*, sector `S1` *total economy*, asset `N` *all non-financial assets*, valuation `V` current prices, **edition `2026M1` (January 2026)**. Retrieved HTTP 200, EUR million:

| Asset code | Item | 2022 | 2023 | **2024** |
|---|---|---:|---:|---:|
| `N` | all non-financial assets | 11,147,322.7 | 11,318,814.7 | **11,513,938.7** |
| `N12` | inventories | 480,530.2 | 484,221.8 | 491,725.0 |
| `N2112` | land under cultivation | 293,260.3 | 295,963.4 | 298,346.3 |
| `NM` | **consumer durables (memo)** | 604,420.1 | 640,009.5 | 664,330.3 |

Net financial worth from Eurostat `nasa_10_f_bs` `BF90`, S1, consolidated, 2024: **324,864** EUR mn.

> **Italy = 11,513,938.7 + 324,864 = €11,838,802.7 mn at end-2024.**

**Corroboration.** The Istat / Banca d'Italia joint publication *La ricchezza dei settori istituzionali in Italia: 2005–2024* (28 January 2026) gives total-economy net wealth as the sum of sector net wealth: 11,732 + 1,015 + 610 − 1,522 = **€11,835 bn**. The construction above gives **€11,838.8 bn** — **0.03 % apart**, from two independent routes, both machine-retrievable.

- **Land: included.** Istat's asset taxonomy embeds land underlying dwellings and buildings inside `N111A2111A` and `N1121A2111B` and reports land under cultivation separately as `N2112`; a separate land total is not published, so `land_treatment` is `included` without a stated land share.
- **Consumer durables: excluded**, and reported separately by Istat as `NM` (€664,330.3 mn) — a memorandum item under ESA 2010, not a component of `N`.
- **Compiler-stated omissions carried forward unchanged:** 「monumenti, oggetti di valore e talune attività non finanziarie non prodotte (ad esempio, risorse naturali diverse dai terreni)」. Italy remains a one-directional understatement.

**Rights: cleared, on both legs, each under its own licence.** The non-financial leg is Istat-published through Istat's own service, under Istat's legal notice (`https://www.istat.it/en/legal-notice/`, HTTP 200, Phase 2B): Creative Commons Attribution 4.0, expressly *"for any purpose, even commercially"*. The financial leg is Eurostat, and Italy is an EU Member State. **Banca d'Italia's restrictive site copyright is no longer in the chain**, which is precisely the remedy Phase 2B named — reached by re-sourcing rather than by asking.

---

## Part 4 — Workstream 4: the France discrepancy, resolved at the source

Phase 2B found the OECD and Eurostat disagreeing on France's net foreign position and called it "approximately 8×". Own re-measurement of the two Phase 2B extracts, EUR million:

| Year | OECD `BF90`, `COUNTERPART_AREA=W` | Eurostat `nasa_10_f_bs` `BF90`, S1, consolidated | ratio |
|---|---:|---:|---:|
| 2019 | −76,588 | −442,017 | 5.8× |
| 2020 | −107,121 | −458,703 | 4.3× |
| 2021 | −189,977 | −519,835 | 2.7× |
| 2022 | −52,518 | −431,822 | 8.2× |

**The measured range is 2.7× to 8.2×**, and the absolute gap peaks at **€379 bn in 2022**.

### 4.1 The tie-breaker

INSEE and the Banque de France publish France's national balance sheet directly. **INSEE, *Patrimoine national par secteur institutionnel et grand type d'actif en 2025*** (`https://www.insee.fr/fr/statistiques/fichier/2830290/econ-gen-patrimoine-nat.xlsx`, HTTP 200, 8,414 bytes, parsed), *Sources : Banque de France ; Insee, comptes nationaux annuels - base 2020*, at **31 December 2025**, EUR billions, column *Économie nationale*:

| Item | INSEE / Banque de France | Eurostat, own computation | difference |
|---|---:|---:|---:|
| Actifs non financiers | **20,292.2** | `N1N + N2N` = 20,292.218 | **0.0001 %** |
| Patrimoine financier net | **−56.8** | `BF90` S1 CO = −56.837 | **0.06 %** |
| **Patrimoine (ou valeur nette)** | **20,235.4** | 20,235.381 | **0.0001 %** |

Corroborated independently by *Le patrimoine économique national en 2024*, Insee Première n° 2081, 6 November 2025 (`https://www.insee.fr/fr/statistiques/8661938`, HTTP 200): 「Fin 2024, le patrimoine économique national … s'est élevé à **19 559 milliards d'euros**」, against Eurostat's 2024 construction of €19,922 bn — 1.9 % apart, consistent with the Banque de France financial-accounts revision INSEE dates to 23 October 2025.

### 4.2 The resolution

- **Preferred source: Eurostat `nasa_10_f_bs` `BF90`, sector S1, consolidated** (or the national compiler directly where it publishes one).
- **Reason:** the French national compiler's own published national net worth is Eurostat's construction, to one part in 10⁵, on all three legs separately. This is not a plausibility check; it is an identity match.
- **The OECD `BF90` with `COUNTERPART_AREA=W` is the outlier and is not the same measurement.** It is small, volatile, and on France it is 2.7×–8.2× smaller than the national-accounts net financial worth of the total economy. The behaviour is consistent with a **vintage difference on a small, revision-prone term** rather than a concept error: the same OECD series is well-behaved for Japan (4.9 % from ESRI's own figure) and Korea (KRW 977.5 tn against a NIIP of similar magnitude). The phase does **not** claim to know which it is, and does not need to.
- **Remaining uncertainty: bounded and now small.** The maximum observed absolute gap is €379 bn = **1.87 % of France's net worth** and **0.10 % of the observed global denominator**. After this phase re-sourced Japan, the United Kingdom, Canada and Korea to their own compilers, the OECD `BF90(W)` series survives in the observed set only for **Mexico, Russia and New Zealand**, whose combined net-foreign-position content is **+$1.24 tn against $349.07 tn — 0.36 % of the observed denominator**, down from Phase 2B's 1.2 %.
- **Effect on the global denominator: negligible, and no series is averaged.** France is taken wholly from Eurostat. The three OECD survivors are carried as-is with the disagreement disclosed per row.

**Sensitivity band carried forward:** ±0.36 % on the observed denominator from the OECD `BF90(W)` rows, which maps to **±0.0006 pp** on the candidate UBWI — an order of magnitude below the tail-calibration band.

---

## Part 5 — Workstream 3: the OECD `NonProductionDataflow` annotation

### 5.1 What was measured

The dataflow's own metadata (`https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.NAD/DSD_NASEC10@DF_TABLE9B/1.0`, HTTP 200, 6,585 bytes) carries, as its first annotation and with no title or id:

```xml
<common:Annotation>
  <common:AnnotationType>NonProductionDataflow</common:AnnotationType>
  <common:AnnotationText xml:lang="en">true</common:AnnotationText>
</common:Annotation>
```

**The decisive evidence is the population, not the row.** The complete public dataflow listing was retrieved (`https://sdmx.oecd.org/public/rest/dataflow/all/all/latest`, **HTTP 200, 8,916,182 bytes**) and every `Dataflow` element enumerated. Own computation:

| | count |
|---|---:|
| Dataflows in the OECD public SDMX registry | **1,548** |
| Carrying `NonProductionDataflow` | **1,548** |
| With value `true` | **1,548** |
| With value `false`, or absent | **0** |

Flows carrying it include `OECD.SDD.NAD:DSD_NAMAIN10@DF_TABLE1` (*Annual GDP and components following the three approaches*) — the OECD's headline national accounts flow — and flows mirrored from other agencies entirely (`ESTAT:SEEA_AEA_A`, `IAEG-SDGs:DF_SDG_GLC`).

### 5.2 What OECD documents

`sdmx.oecd.org` runs the **.Stat Suite**, the OECD-led SIS-CC platform. Its published reference *SDMX annotations supported by the .Stat Suite* (`https://sis-cc.gitlab.io/dotstatsuite-documentation/using-de/sdmx-annotations/`, retrieved) documents the user-managed and automatically generated annotation types — `LAYOUT_ROW`, `DEFAULT`, `NOT_DISPLAYED`, `METADATA` and others, all of which also appear on `DF_TABLE9B` — and **`NonProductionDataflow` does not appear in it at all**. No OECD statement of the annotation's meaning was retrieved, and none is asserted here.

### 5.3 Classification

> ### Usable with explicit caveat.

**The flag does not disqualify `DF_TABLE9B`, and Phase 2B's caution is withdrawn.** A field whose value is `true` on 1,548 of 1,548 flows — including OECD's flagship GDP flow and flows the OECD did not author — carries **zero discriminating information** about any individual flow. It cannot mean "this flow is experimental", because it is on everything. Phase 2B's reading ("a reason not to build a production dependency on that particular flow") does not survive the measurement.

**The caveat is about what Urdais may conclude from it, in both directions.** Because the OECD publishes no definition, Urdais must not read a *support commitment* into the flag either. Two operational rules follow:

1. **Monitor the value distribution, not the presence.** A registry-wide constant is not a signal. If the population ever ceases to be uniform — if some flows read `false`, or if `DF_TABLE9B` alone changes — *that* is a signal worth acting on, and the collector should record the flag's value and the registry-wide distribution at each structure refresh so the change is detectable.
2. **Take the dataflow's own description as the production evidence instead.** `DF_TABLE9B` states that it supersedes `SNA_TABLE9B` *"in the previous dissemination system"*, links OECD's methodology-change documentation, and names `STAT.Contact@oecd.org`. That is what a maintained dissemination flow looks like; a registry annotation is not.

**Materiality, stated so the classification is not over-weighted.** After Phase 2C, the OECD route supplies **three of sixteen** observed economies — Mexico, Russia and New Zealand, together **3.83 % of world GDP and 5.06 % of the observed denominator**. Phase 2B's dependency on it was four times larger.

---

## Part 6 — Workstream 5: the feasible frontier

Five figures, never collapsed.

| | n | share of 2024 world GDP | share of CWON non-human wealth |
|---|---:|---:|---:|
| **Rights-cleared observed, end of Phase 2B** | 14 | **47.66 %** | 56.38 % |
| **Technically observed, end of Phase 2B and now** | 16 | **53.99 %** | **64.08 %** |
| **Rights-cleared observed, end of Phase 2C** | **16** | **53.99 %** | **64.08 %** |
| Coverage *added* in Phase 2C | 0 economies | **+6.33 pp rights-cleared, +0.00 pp technical** | +7.70 pp |
| **Maximum technically observable, without China** | ~41 | **62.93 %** | — |
| **Maximum rights-cleared observable, without China** | ~41 | **62.93 %** | — |
| **Structurally unobservable** | ~185 | **37.07 %** | — |

**The two frontiers have converged, and that is the phase's structural result.** Phase 2B's ceiling of 62.93 % was a *technical* ceiling with an open rights question behind it. It is now also the *rights* ceiling, because every economy in the ceiling set is covered by a licence Urdais has read: EU Member States, EFTA members and EU candidate countries by Eurostat's copyright notice; OECD members outside that set (Israel) by the OECD's terms; and the economies already sourced nationally by their own compilers' licences. **There is no economy that Urdais can observe but may not publish.**

### 6.1 Is the frontier 55 %, 60 %, 63 %, or something else?

**Closer to 56 % than to 63 %, and the distinction is not a rounding argument.** Own computation, decomposing the ceiling:

| Frontier | Coverage | What it requires |
|---|---:|---|
| Today | **53.99 %** | Nothing. Already achieved and rights-cleared. |
| **Near-term, real** | **55.72 %** | Norway, Finland, Hungary, Israel, Latvia, Portugal — each already publishes a valued non-financial asset total and is excluded only for a missing matched net-foreign-position year or an unbridgeable gap (Norway's `N2N` stops at 2014). **These are retrieval and alignment problems, not statistical-programme problems.** |
| Absolute, without China | **62.93 %** | The above **plus nineteen EU/EFTA/OECD economies each beginning to value land and publish a non-produced total** — Spain, Poland, Belgium, Denmark, Ireland, Greece, Romania, Slovakia, Croatia, Bulgaria, Slovenia, Lithuania, Luxembourg, Estonia, Cyprus, Malta, Switzerland, Türkiye, Iceland. **Nineteen sovereign decisions Urdais does not influence.** |
| With China | 79.70 % | [Not observable and not constructible.](./ubwi-china-source-study.md) |

> **The feasible frontier on today's publications is 55.72 %. The 62.93 % figure is a counterfactual ceiling, and quoting it as "the frontier" would credit Urdais with nineteen statistical programmes that do not exist.**

Urdais is **1.73 pp** below what today's global statistical system can actually support, and **8.94 pp** below what it could support if nineteen offices changed what they publish.

### 6.2 The gate Phases 2A and 2B proposed is outside the feasible set

This is the finding that changes the recommendation. Own computation: with the observed-set wealth-to-GDP ratio R = 5.689 and the CWON tail calibration k = 0.723, the imputed share of the denominator is a function of coverage alone.

| Coverage frontier | Observed $tn | Imputed $tn | **Imputed share** | Candidate UBWI |
|---|---:|---:|---:|---:|
| Today, 53.99 % | 349.07 | 211.31 | **37.7 %** | 0.2819 % |
| Near-term, 55.72 % | 353.95 | 203.41 | **36.5 %** | 0.2834 % |
| Counterfactual ceiling, 62.93 % | 399.77 | 170.28 | **29.9 %** | 0.2771 % |
| With China, 79.70 % | 506.32 | 93.24 | 15.6 % | 0.2635 % |

Inverted, the question becomes what coverage each imputed-share bound demands:

| Imputed-share bound | Required observed GDP coverage | Feasible without China? |
|---|---:|---|
| ≤ 25 % (**proposed by Phases 2A and 2B**) | **68.44 %** | **No — above the 62.93 % ceiling** |
| ≤ 30 % | 62.78 % | Only at the counterfactual ceiling |
| ≤ 35 % | 57.31 % | **No — above the 55.72 % near-term frontier** |
| **≤ 40 %** | **52.03 %** | **Yes — met today, with 1.96 pp of coverage headroom** |
| ≤ 45 % | 46.91 % | Yes, trivially |

> **A ≤ 25 % imputed-share gate and a ≥ 70 % coverage gate are not demanding. They are unsatisfiable.** Adopting them is a decision never to publish UBWI, taken by arithmetic rather than by judgement, and it would be taken without anyone having written down that that is what it means. This document writes it down.

---

## Part 7 — Workstream 6: the Phase 2C research-only candidate

> **This is a simulation. It is not a published Urdais value, it may not be promoted to one, and no publication may occur under a draft methodology.** Not live. Not seeded. Not production. Not methodology-approved.

### 7.1 Numerator

**Carried unchanged from Phases 2A and 2B** and not re-observed, because the numerator is instantaneous and re-observing it would change the comparison without changing what is being tested. Observed 2026-09-14T18:14:20Z, block height 967,005: supply 20,084,365.00000000 BTC × median of three venues 78,873.68 USD = **$1,584,127,778,013 = 1.584128 tn**.

### 7.2 The observed set

All sixteen rights-cleared. Own computation. **Primary basis: end-period FX** matched to each component's own reference date, from ECB reference rates — the rule Phase 2B recommended and this phase adopts. Period-average conversion (World Bank `PA.NUS.FCRF`) is shown alongside for continuity with the Phases 2A and 2B candidates.

| Economy | Reference date | NW $tn (end-period) | NW $tn (period-avg) | W/GDP | Land | Source | New in 2C |
|---|---|---:|---:|---:|---|---|---|
| United States | 2025-12-31 | **158.210** | 158.210 | 5.14 | partial | Fed Z.1 S1.b `FL892090005` − `LM155111005` | |
| Japan | 2024-12-31 | **28.986** | 30.056 | 6.92 | 37.7 % of NFA | ESRI 期末貸借対照表 正味資産 | **✓ national, +2 yr** |
| Germany | 2024-12-31 | **28.224** | 29.406 | 6.02 | 32.5 % of NFA | Eurostat `N11N+N211N+BF90` | **✓ cleared, +2 yr** |
| France | 2025-12-31 | **23.777** | 22.866 | 7.06 | included | Eurostat `N1N+N2N+BF90` | |
| Korea | 2025-12-31 | **17.007** | 17.267 | 9.08 | 54.4 % of NFA | BOK ECOS `291Y505` 순자산 | **✓ national, +3 yr** |
| United Kingdom | 2024-12-31 | **16.394** | 16.723 | 4.44 | 53.8 % of NFA | ONS NBS Table C `B.90` | **✓ national, +3 yr** |
| Australia | 2025-06-30 | **13.982** | 13.797 | 7.77 | 47.0 % of NFA | ABS 5204.0 t10 `A2421151J` | |
| Canada | 2025-12-31 | **13.246** | 12.972 | 5.71 | included | StatCan 36-10-0580 net worth − durables | **✓ national, +3 yr** |
| Italy | 2024-12-31 | **12.299** | 12.814 | 5.16 | included | Istat `LEN_D_W0` + Eurostat `BF90` | **✓ cleared** |
| Mexico | 2022-12-31 | **11.056** | 10.741 | 7.54 | included | OECD `NN` + `BF90(W)` | |
| Netherlands | 2025-12-31 | **8.012** | 7.705 | 6.01 | 43.5 % of NFA | CBS `85953NED` + Eurostat `BF90` | |
| Russia | 2019-12-31 | *6.509* | 6.509 | 3.84 | unknown | OECD `NN` + `BF90(W)` | |
| Sweden | 2025-12-31 | **4.383** | 4.110 | 6.55 | included | Eurostat `N1N+N2N+BF90` | |
| Austria | 2023-12-31 | **3.460** | 3.386 | 6.70 | included | Eurostat `N1N+N2N+BF90` | |
| Czechia | 2025-12-31 | **2.180** | 2.055 | 5.58 | included | Eurostat `N1N+N2N+BF90` | |
| New Zealand | 2017-12-31 | **0.458** | 0.457 | 2.22 | included | OECD `NN` + `BF90(W)` | |
| **Total observed** | | **348.182** | **349.073** | **5.68 / 5.69** | 15 of 16 report land | **16 economies, 16 rights-cleared** | |

*Russia is carried on period-average FX in both columns: the ECB discontinued its rouble reference-rate fixing in 2022 and no end-period rate is available. This is disclosed as the single FX-basis exception and is 1.87 % of the observed denominator.*

### 7.3 The candidate

Unobserved remainder of 2024 world GDP: **$51.37 tn**. CWON tail calibration **k = 0.723** (tail 3.25 against observed 4.50 on CWON 2020). Observed-set wealth-to-GDP ratio **5.675** end-period / **5.689** period-average.

| Scenario | tail ratio | imputed $tn | **W $tn** | imputed share | **TGW $tn** | **UBWI %** |
|---|---:|---:|---:|---:|---:|---:|
| tail ratio = observed ratio (k = 1) | 5.67 | 291.53 | 639.72 | 45.6 % | 641.30 | **0.2470** |
| **central: CWON-calibrated k = 0.723** | **4.10** | **210.63** | **558.82** | **37.7 %** | **560.40** | **0.2827** |
| low: 0.60 × observed | 3.40 | 174.92 | 523.10 | 33.4 % | 524.69 | **0.3019** |
| high: 1.15 × observed | 6.53 | 335.26 | 683.45 | 49.1 % | 685.03 | **0.2312** |

$$\text{UBWI} = \frac{1.584128}{560.40} \times 100 = \mathbf{0.2827\ \%}\qquad\text{range } 0.2312\%\ \text{–}\ 0.3019\%$$

**On period-average FX**, for direct comparison with Phases 2A and 2B: W = **$560.25 tn**, TGW = **$561.83 tn**, **UBWI = 0.2820 %**, imputed share **37.7 %**, range 0.2307 %–0.3012 %.

**Gated variants, own computation** (period-average FX):

| Variant | n | coverage | observed $tn | imputed share | TGW $tn | UBWI % |
|---|---:|---:|---:|---:|---:|---:|
| All 16, rights-cleared (**headline**) | 16 | 53.99 % | 349.07 | 37.7 % | 561.83 | **0.2820** |
| Vintage gate ≥ 2022 (drops NZL, RUS) | 14 | 51.80 % | 342.11 | **40.9 %** | 580.22 | 0.2730 |
| Vintage gate ≥ 2023 | 13 | 50.16 % | 331.37 | 41.9 % | 571.57 | 0.2772 |
| Vintage gate ≥ 2024 | 12 | 49.68 % | 327.98 | 42.4 % | 570.63 | 0.2776 |
| No OECD `BF90(W)` rows | 13 | 50.16 % | 331.37 | 41.9 % | 571.57 | 0.2772 |
| Land reported only (drops RUS) | 15 | 52.04 % | 342.56 | 40.5 % | 576.94 | 0.2746 |

**A result worth stating because it is counter-intuitive: every tightening raises the imputed share.** A ≥ 2022 vintage gate improves the vintage profile and moves the denominator from 37.7 % modelled to **40.9 %** modelled. Quality gates on the observed set trade against the quality of the aggregate, and a gate design that does not price that trade will make the published number *more* of a model while appearing to make it stricter.

### 7.4 Comparison with the prior candidates

| | Phase 1 (WID) | Phase 2A | Phase 2B | **Phase 2C** |
|---|---:|---:|---:|---:|
| Observed economies | — (world aggregate) | 12 | 16 | **16** |
| Observed GDP coverage | — | 48.72 % | 53.99 % | **53.99 %** |
| **Rights-cleared coverage** | 0 % | 0 % | 47.66 % | **53.99 %** |
| Economies under review | — | 12 | 2 | **0** |
| National (primary) sources | 0 | 2 | 5 | **7** |
| Observed denominator | — | $304.480 tn | $344.514 tn | **$349.073 tn** |
| Imputed share | — | 45.2 % | 38.0 % | **37.7 %** |
| GDP-weighted mean vintage | — | ~2022 | 2023.71 | **2024.39** |
| Total Global Wealth | $556.32 tn | $556.99 tn | $557.69 tn | **$561.83 tn** |
| **Candidate UBWI** (period-avg) | **0.2843 %** | **0.2844 %** | **0.2841 %** | **0.2820 %** |
| Candidate UBWI (end-period) | — | — | 0.2833 % | **0.2827 %** |

**Is the result materially stable? Yes, and the test was a real one this time.** Four constructions give 0.2843 / 0.2844 / 0.2841 / 0.2820 — a spread of **0.0024 pp, or 0.85 % of the value**. Phase 2C is the first phase whose changes could plausibly have moved it: four economies re-sourced to different compilers, Korea's figure up 9.8 % on its own compiler's number, Japan's up 3.6 %, the UK's up three reference years, Germany's 2022 value revised down 3.9 % by its own compiler, Canada's consumer durables stripped for the first time. **The denominator absorbed all of it and moved 0.7 %.**

**What that is and is not evidence of.** It is strong evidence that Total Global Wealth is a **measurable object** whose value does not depend on which defensible construction you choose, and that **Bitcoin is a little over a quarter of one percent of presently existing global net wealth**. It is **not** evidence that the construction is publishable. Phase 2B's caution stands and is sharpened: 37.7 % of the denominator is still a model, and part of the stability comes from the model absorbing whatever the observed set does.

### 7.5 The largest single uncertainty is China, and it is quantifiable

The central case imputes China at k × R = 4.11 times GDP, giving **$77.0 tn** — **31.1 % of the imputed residual** and 13.7 % of Total Global Wealth. Own computation, varying only China's assumed wealth-to-GDP ratio and holding everything else at the central case:

| China wealth-to-GDP assumption | China $tn | W $tn | TGW $tn | **UBWI %** |
|---|---:|---:|---:|---:|
| 3.0 (low) | 56.19 | 539.54 | 541.12 | **0.2927** |
| 4.0 | 74.92 | 558.27 | 559.85 | 0.2830 |
| **4.11 — current model (k × R)** | **77.04** | **560.38** | **561.97** | **0.2819** |
| 5.0 | 93.65 | 577.00 | 578.58 | 0.2738 |
| 6.0 | 112.38 | 595.73 | 597.31 | 0.2652 |
| 7.0 | 131.11 | 614.45 | 616.04 | 0.2571 |
| 8.77 (Korea's ratio — the observed maximum) | 164.26 | 647.61 | 649.19 | **0.2440** |

> **One unobservable economy's assumed ratio moves the candidate from 0.2440 % to 0.2927 % — a band of 0.0487 pp, 17 % of the value, and comparable in width to the entire tail-calibration sensitivity range.** This belongs on any published surface, named, and it is a better disclosure than a bare coverage percentage because it says what the reader is actually uncertain about.

---

## Part 8 — Vintage discipline

| | Phase 2B | **Phase 2C** |
|---|---|---|
| Oldest observation | 2017 (New Zealand) | **2017 (New Zealand)** |
| Newest observation | 2025 | **2025** (eight economies) |
| Vintage dispersion | 8 years | **8 years** |
| Median reference year | 2022 | **2024** |
| **GDP-weighted mean vintage** | **2023.71** | **2024.39** |

Bounded stale-vintage acceptance, own computation:

| Rule | n | Share of world GDP | Observed $tn (period-avg) |
|---|---:|---:|---:|
| Latest available per economy (**used**) | 16 | **53.99 %** | 349.07 |
| Reference year ≥ 2022 | 14 | 51.80 % | 342.11 |
| Reference year ≥ 2023 | 13 | 50.16 % | 331.37 |
| Reference year ≥ 2024 | 12 | 49.68 % | 327.98 |
| Reference year ≥ 2025 | 8 | 36.29 % | — |

**Materially stale economies, disclosed and not bridged:**

- **New Zealand, 2017** — nine years stale, 0.23 % of world GDP, 0.13 % of the observed denominator. OECD route; no national re-source attempted this phase.
- **Russia, 2019** — seven years stale, 1.96 % of world GDP, 1.87 % of the observed denominator. Also the only row with `land: unknown` and the only row without an end-period FX fixing. **Three independent defects on one row.**
- **Mexico, 2022** — four years stale, 1.64 % of world GDP. OECD route.
- **Austria, 2023** — three years stale, 0.48 % of world GDP. Eurostat's `N2N` for Austria stops at 2023.

**No stock is interpolated across years anywhere in this phase.** Norway remains rejected on exactly the Phase 2B ground: `N2N` stops at 2014 while `N1N` runs to 2022, and closing an eight-year gap would be silent interpolation. Canada's quarterly series is selected, not interpolated, by the rule in Part 2.3.

**The revision finding belongs here.** Germany's 2022 *Volksvermögen* was €25,357.8 bn in the vintage Phase 2B used and is €24,356.5 bn in the current publication — **a −3.9 % revision to a closed reference year**. Vintage age is not only a measure of how out-of-date a figure is; it is a measure of how likely the figure is to be *superseded rather than extended*. A production design that refreshes only the latest year would have carried the stale 2022 German value indefinitely.

---

## Part 9 — FX discipline

**Rule adopted this phase: end-period FX, matched to each component's own reference date, sourced per economy, stored with its own `fx_basis`, `fx_source` and fixing date.** Rates from ECB reference rates, daily, series `EXR.D.<CUR>.EUR.SP00.A` (`data-api.ecb.europa.eu`, HTTP 200, 27,302 observations, cached Phase 2B), taking the last fixing at or before each reference date and cross-rating through USD/EUR.

Own computation, Phase 2C observed set:

| Economy | Reference date | Period-average $tn | End-period $tn | Difference |
|---|---|---:|---:|---:|
| United States | 2025-12-31 | 158.210 | 158.210 | 0.00 % |
| Japan | 2024-12-31 | 30.056 | 28.986 | **−3.56 %** |
| Germany | 2024-12-31 | 29.406 | 28.224 | **−4.02 %** |
| France | 2025-12-31 | 22.866 | 23.777 | +3.98 % |
| Korea | 2025-12-31 | 17.267 | 17.007 | −1.51 % |
| United Kingdom | 2024-12-31 | 16.723 | 16.394 | −1.97 % |
| Australia | 2025-06-30 | 13.797 | 13.982 | +1.35 % |
| Canada | 2025-12-31 | 12.972 | 13.246 | +2.11 % |
| Italy | 2024-12-31 | 12.814 | 12.299 | **−4.02 %** |
| Mexico | 2022-12-31 | 10.741 | 11.056 | +2.93 % |
| Netherlands | 2025-12-31 | 7.705 | 8.012 | +3.98 % |
| Russia | 2019-12-31 | 6.509 | *n/a* | **no ECB fixing** |
| Sweden | 2025-12-31 | 4.110 | 4.383 | **+6.63 %** |
| Austria | 2023-12-31 | 3.386 | 3.460 | +2.19 % |
| Czechia | 2025-12-31 | 2.055 | 2.180 | **+6.08 %** |
| New Zealand | 2017-12-31 | 0.457 | 0.458 | +0.17 % |
| **Total** | | **349.073** | **348.182** | **−0.26 %** |

**Two readings, and the second is still the one that matters.**

The **aggregate** effect is −0.26 % on the observed denominator, moving the candidate from 0.2820 % to 0.2827 % — 7 ten-thousandths of a percentage point. Phase 2B measured +0.44 %; the sign flipped because Japan, Germany and Italy are now dated end-2024 rather than end-2022 or end-2025, and the country-level errors cancel differently against a different date mix. **That the aggregate effect is small and unstable in sign is itself the argument for fixing the basis rather than treating the choice as immaterial.**

The **country-level** effect does not cancel and reaches **+6.63 % (Sweden)** and **−4.02 % (Germany and Italy)**. Any per-economy figure on a published surface would be wrong by that much on the wrong basis.

**The one source requiring period-average FX, identified as the brief requires: Russia.** The ECB discontinued its rouble reference-rate fixing in 2022, and no end-period rate is obtainable from the FX source the rest of the set uses. Russia's row is therefore converted at World Bank `PA.NUS.FCRF` for 2019, a period average, on an end-period stock. **Impact: $6.509 tn, 1.87 % of the observed denominator, on a row that is already seven years stale and already carries `land: unknown`.** The honest options are to source a 2019 rouble end-period rate from a different compiler — which would mix FX sources within one denominator — or to drop Russia under the vintage gate, which the ≥ 2022 variant does. **No FX conventions are mixed without this disclosure.**

---

## Part 10 — Rights matrix, end of Phase 2C

Two axes, Urdais vocabulary. A source reaches production only when both read `permitted`. Rows retrieved this phase are marked ✓.

| Source | Interface | Retrieval | Data use | Evidence |
|---|---|---|---|---|
| **World Bank** | Indicator API | permitted | permitted | CC BY 4.0 (Phase 2A) |
| **Federal Reserve** | Z.1 release, DDP bundle | permitted | permitted | `federalreserve.gov/disclaimer.htm`: public domain, cite the Board (Phase 2B) |
| **OECD** | `sdmx.oecd.org` public REST | permitted **(intermittent 403 on the terms host)** | permitted | Cached terms artifact, §3 *Permitted Use*: *"extract from, download, copy, adapt … even for commercial use"*; Wayback corroboration ✓ |
| **Eurostat** | Dissemination API | permitted | **permitted for EU/EFTA/acceding/candidate countries only** | Copyright notice (Phase 2B). Covers Germany, Italy, France, NL, SE, AT, CZ. Does **not** cover the UK — which is why the UK is now ONS |
| **ABS** | Time-series workbooks | permitted | permitted | CC BY 4.0 (Phase 2B) |
| **CBS (NL)** | StatLine OData | permitted | permitted | CC BY 4.0 (Phase 2B) |
| **Istat** | SDMX web service + website | permitted ✓ | permitted | CC BY 4.0, *"for any purpose, even commercially"* (Phase 2B); Istat SDMX HTTP 200 ✓ |
| **ONS** | Website datasets | **permitted ✓** | **permitted ✓** | `ons.gov.uk/help/terms-conditions` → OGL v3: copy, publish, adapt, *"exploit the Information commercially"*, with attribution |
| **Statistics Canada** | Web Data Service | **permitted ✓** | **permitted ✓** | Statistics Canada Open Licence: use, publish, distribute **or sell** the Information and Value-added Products; sublicensable; attribution specified. *Licence may be modified at any time* |
| **Cabinet Office / ESRI (JP)** | Website workbooks | **permitted ✓** | **permitted ✓** | `cao.go.jp/notice/rule.html` → 公共データ利用規約 1.0: 複製・公衆送信・翻案, 商用利用も可能; numerical data not copyright-protected |
| **Bank of Korea** | ECOS Open API | **permitted, operational key reviewed ✓** | **permitted ✓** | 저작권보호방침: Article 19 public data 「별도의 절차 없이 자유롭게 이용」 with mandatory attribution; `data.go.kr/data/15059629` (제공기관 한국은행): 무료, **이용허락범위 제한 없음**; 운영단계 심의승인 |
| **Deutsche Bundesbank** | Website publications | permitted ✓ | **under review ✓** | 「© Deutsche Bundesbank, 2025/2026. Publizistische Verwertung nur mit Quellenangabe gestattet.」 — publishing with attribution; adaptation and commercial derived use not expressly granted. **Not in the chain**: Germany is taken from Eurostat |
| **Destatis** | GENESIS-Online | **not machine-retrievable anonymously ✓** | permitted (DL-DE/BY-2.0) | REST base redirects to a JavaScript announcement page; no data returned unauthenticated |
| **Banca d'Italia** | Website | not permitted | not permitted | Prior written authorisation (Phase 2B). **Not in the chain**: Italy's financial leg is Eurostat |
| **INSEE** | Website datasets | permitted ✓ | not reviewed | Used **only as a tie-breaker** in Part 4; no figure from INSEE enters the candidate |
| **ECB** | Data Portal API (FX) | permitted | **under review** | `data-api.ecb.europa.eu` HTTP 200; terms still not retrieved. **Carried forward; FX policy depends on it** |
| NBS China | stats.gov.cn | **reachable via public DNS ✓** | under review | Content-insufficient, not unreachable. See Part 1.2 |
| WID.world | Bulk CSV | not reviewed | not reviewed | Terms page HTTP 404 (Phase 1). Unchanged |
| McKinsey / UBS / IMF | — | not permitted / not reviewed | not permitted / not reviewed | Unchanged. No figure used |

**Every source in the Phase 2C candidate reads `permitted` on both axes.** Two rows that were in the Phase 2B chain — Deutsche Bundesbank and Banca d'Italia — are no longer in it, and both are recorded rather than deleted so the route is not re-attempted.

**The one qualification, carried into the final decision.** Korea's retrieval is `permitted` on a documented public sample key and requires a **reviewed operational key** for production volumes. That is a registration step, not a permission negotiation, and it is the only item standing between this denominator and a production-approvable source chain.

---

## Part 11 — Proposed V1 publication gate

**Proposed, not adopted.** This replaces the Phase 2B proposal, which Part 6.2 shows to be unsatisfiable.

**The design principle, stated first because it is what changed.** A gate must be set against the **feasible frontier**, not against an intuition about what a good number looks like. A threshold above the frontier is not a high standard; it is a permanent refusal disguised as one. Every bound below is checked against 55.72 % — what today's global statistical system can actually support — and its current status is stated.

| Gate | Proposed value | Status today | Why this value |
|---|---|---|---|
| **Maximum imputed share of the denominator** | **≤ 40 %**, tightening to ≤ 38 % once the near-term frontier is reached | **37.7 % — met, 2.3 pp headroom** | The binding bound. ≤ 25 % requires 68.44 % coverage and ≤ 35 % requires 57.31 %; both exceed the 55.72 % frontier (Part 6.2). ≤ 40 % requires 52.03 % and is the tightest satisfiable bound. |
| **Minimum rights-cleared observed GDP coverage** | **≥ 52 %** | **53.99 % — met** | Derived from the imputed-share bound at the observed-set ratio, not chosen as a round number. It is the same constraint stated in the other unit and should move with it. |
| **Every observed constituent rights-cleared** | **Required, no exceptions** | **16 of 16 — met** | The only gate in this table that is both absolute and currently satisfied. Achieved this phase; it should never be traded for coverage. |
| **Maximum vintage age** | **≤ 4 years at calculation date** | **Fails: New Zealand 2017, Russia 2019** | Costs 2.19 pp of coverage and **raises the imputed share to 40.9 %** (Part 7.3). The gate is right and its cost must be stated, not hidden. |
| **Maximum vintage dispersion** | **≤ 4 years** oldest to newest | **Fails: 8 years (2017–2025)** | Satisfied automatically once the vintage-age gate is met. |
| **Maximum composition-sensitivity band** | **p10–p90 ≤ 15 pp** | ~16 pp at 54 % coverage, interpolating Phase 2B Part 7.2 (17.76 pp at 50 %, 14.79 pp at 60 %) — **marginal fail** | A ≤ 10 pp band needs ~75 % coverage and is unsatisfiable. ≤ 15 pp is reachable at ~58–60 % and is the honest near-frontier target. |
| **Economies above 3 % of world GDP** | **Disclosure, not observation.** Each such economy must be named on the published surface with its GDP weight and its observation status, and where it is unobserved the published sensitivity range must span a plausible range of its wealth-to-GDP ratio | **Achievable — not yet implemented** | Six qualify: USA 26.24 % (observed), **China 16.77 % (not)**, Germany 4.20 % (observed), Japan 3.75 % (observed), **India 3.37 % (not)**, UK 3.31 % (observed). A requirement to *observe* all six is a permanent block on China, which the brief correctly forbids. Part 7.5 shows the China band is **0.2440 %–0.2927 %** and is the single most informative disclosure available. |
| **Land treatment** | Every component states `included` / `partially_included` / `excluded`; the non-`included` share of the denominator is published | **Achievable — 15 of 16 report land; the US is `partially_included` at 26.24 % of world GDP and Russia is `unknown`** | Carried unchanged from Phase 2B. Land is 37.7 %–54.4 % of non-financial assets where it is measured. |
| **FX basis** | End-period, matched to each component's own reference date; any exception named on the surface | **Met with one named exception (Russia, no ECB rouble fixing)** | Country-level error up to 6.63 % on the wrong basis (Part 9). |
| **Sensitivity range** | Published **with** the value, never in an appendix; the China band published alongside the tail-calibration band | **Achievable** | Carried from Phases 2A and 2B, extended by Part 7.5. |

**What this gate would do today.** It would **refuse publication**, on three counts: vintage age, vintage dispersion, and the composition band — all three of which are **satisfiable**, and two of which (age and dispersion) are satisfied by the same action: drop New Zealand and Russia, at a cost of 2.19 pp of coverage and 3.2 pp of imputed share. That is a real trade-off with a real cost, which is what a gate is supposed to produce. It is not the Phase 2B gate's outcome, which was to refuse publication forever on a bound no attainable denominator could meet.

**What it would not do.** It would not certify the number as a measurement. A denominator that is 37.7 % modelled, with China's ratio moving the answer by 17 %, is an **estimate calibrated to observed economies**, and every surface carrying it must say so in those words.

---

## Part 12 — Architecture implications

See [the UBWI data architecture proposal](../architecture/ubwi-data-architecture.md), amended alongside this study. **No migration is created and none should be.** The per-economy model from Phases 2A and 2B is preserved unchanged. Four findings become design requirements the earlier phases could not have known to ask for:

- **A rights state must be anchored to a cached terms artifact, not to a live fetch.** The OECD host returns 403 intermittently to a URL that grants access. A collector that re-derives rights state from a live retrieval will demote a permitted source at random.
- **Resolution failure is not source failure.** Two compilers were recorded as blocked across two phases because of a local DNS resolver. The retrieval record needs to distinguish DNS, transport, HTTP and content failures, and only the last may touch a source's state.
- **A quarterly source needs a selection rule, stored.** Canada publishes four observations a year. Which one enters a vintage is a methodology decision that must be recorded with the component, not re-derived by whichever script runs.
- **Consumer durables must be stripped per-economy, from a per-economy line.** The United States and Canada both include them and both expose them separately; Japan, Korea, Italy and Germany all report them as memoranda outside the total. A denominator that strips them for one and not the other is comparing different objects.

---

## Part 13 — Product surface

**Unchanged, and correctly so.** The market catalog carries UBWI with unit `%`, the methodology's definition and question, and a demo walk whose anchor is deliberately unrelated to any research candidate. Tests assert the percentage unit on every surface, that demo points stay inside `[0, 100]`, and that the formal term is **Total Global Wealth**.

**No factual display defect was found in this phase and no candidate has been seeded.** The methodology is a draft with no effective date and publishing under a draft is prohibited.

---

## Decision

> ### Ready after one limited source/rights fix.

**The research is finished.** Three phases asked whether a rights-cleared observed Total Global Wealth denominator could be built. It can, it has been, and this phase closed the last gap: **16 of 16 observed economies are rights-cleared, 53.99 % of world GDP, every licence read, no outreach sent across three phases.** Seven of the sixteen now come from their own national compiler rather than a harmonisation layer, the GDP-weighted mean vintage is **2024.39**, both cross-route disagreements are resolved or bounded below 0.4 % of the denominator, and the OECD dataflow flag that looked like a production risk is a registry-wide constant carrying no information.

**The one fix is Korea's ECOS operational API key**, which the Bank of Korea grants after review rather than on request. The data-use rights are cleared and explicit; only the production retrieval volume needs the key. Nothing else in the chain requires anything from anyone.

**What the phase also established, and what will matter more.** The publication gate Phases 2A and 2B proposed — imputed share ≤ 25 %, coverage ≥ 70 % — **cannot be satisfied by any denominator the global statistical system can produce**, with or without every plausible improvement short of China. Carrying it forward would have been a decision never to publish UBWI, taken silently. The gate proposed in Part 11 is set against the measured frontier instead: it is satisfiable, it fails today on three counts that are all fixable, and it would cost 2.19 pp of coverage to pass.

**Not proceeding to production implementation in this phase. No production tables are created. No UBWI value is published, seeded or promoted.** Research on the denominator should stop here and hand off.

---

## Rejected Sources and Dead Ends

Recorded so they are not re-attempted.

| Route | Outcome |
|---|---|
| **Destatis GENESIS-Online REST API** (`genesisWS/rest/2020/…`) | Redirects to a JavaScript announcement SPA; returns no data unauthenticated. The DL-DE/BY-2.0 route Phase 2B named as Germany's remedy is not anonymously machine-retrievable. **Superseded**: Eurostat carries the identical German figures. |
| **Deutsche Bundesbank as Germany's source** | Successor publication exists and is current (2024), but its notice grants publishing with attribution and not adaptation or commercial derived use. **Used for corroboration only.** |
| **Bundesbank SDMX API for a *Vermögensbilanz* flow** | Enumerated all dataflows (`api.statistiken.bundesbank.de/rest/metadata/dataflow/BBK`, HTTP 200); no wealth-balance-sheet flow exists. Financial accounts are `BBAF3`; the non-financial side is Destatis's. |
| **GovData (German open-data portal) for Bundesbank data** | CKAN `package_search` for *Vermögensbilanz* and *Volksvermögen*: **count 0**. The Bundesbank does not register there. |
| **Banca d'Italia AgID open data for Italy's financial leg** | Not needed and not attempted. Eurostat supplies `BF90` for Italy under a cleared licence; adding a second interface would add a rights review for no gain. |
| **Eurostat for Italy's non-financial assets** | Eurostat carries `N11N` only for Italy — no land, no non-produced total. Confirmed again this phase. Istat's own service is the route. |
| **Eurostat for the United Kingdom** | Blocked by Eurostat's non-EU/EFTA/candidate commercial-reuse exception, and stale (2019) in any case. **Superseded** by ONS. |
| **BOK press-release board search** | `bok.or.kr/portal/bbs/P0000559/list.do` returns HTTP 200 but renders results in JavaScript; no press release located. ECOS Open API is the route. |
| **KOSIS search** | HTTP 200, results rendered in JavaScript, no parseable dataset links. |
| **ECOS full table enumeration with the sample key** | Works, but capped at ten records per call. Adequate for research, not for production; an operational key is required. |
| **Headless Chrome** | Unchanged from Phase 2B: hangs in both headless modes with `CVDisplayLinkCreateWithCGDisplay failed`. Not re-attempted. Plain `urllib` and `curl --resolve` outperformed it in every case. |
| **OECD terms page, live re-fetch** | Returns HTTP 403 intermittently. **Do not re-fetch to re-confirm the grant**; read the cached artifact. |

---

## Open Questions Carried Forward

1. **Korea's ECOS operational API key.** 운영단계 심의승인 — reviewed, not auto-issued. **The only item in the final decision.**
2. **ECB terms of use for the reference-rate series.** Carried unresolved from Phase 2B; FX policy depends on it and it is a retrieval, not a request.
3. **New Zealand (2017) and Russia (2019).** Both fail the proposed vintage gate. New Zealand publishes a national balance sheet through Stats NZ; Russia's route would need a rouble FX source the ECB no longer provides. Together 2.19 pp of world GDP.
4. **The six near-frontier economies** — Norway, Finland, Hungary, Israel, Latvia, Portugal — worth **1.73 pp** of coverage and the difference between 53.99 % and the real frontier of 55.72 %. Each is blocked on a matched net-foreign-position year, not on rights.
5. **Spain's non-financial asset stock**, carried unchanged from Phase 2B. Eurostat has `N11N` only (2023). Worth 1.55 % of world GDP.
6. **How the US public-land omission is disclosed.** Carried unchanged across three phases; 26.24 % of world GDP sits behind it.
7. **Whether Mexico can be re-sourced from INEGI.** The last large OECD-route row, 1.64 % of world GDP, four years stale, carrying the `BF90(W)` disagreement.
8. Carried unchanged from Phase 1: WID's licence; non-Bitcoin crypto in the denominator; the numerator venue set and its change rule.

**Not carried forward: China.** [The study's conclusion is unchanged](./ubwi-china-source-study.md) and this phase found no first-party lead that alters it. The DNS finding in Part 1.2 changes how `stats.gov.cn` should be *recorded*, not what it publishes.

---

## Sources and Evidence

All retrieved 14 September 2026 unless stated.

**Verified by direct call this phase.** [Statistics Canada Web Data Service](https://www150.statcan.gc.ca/t1/wds/rest/) — `getCubeMetadata`, `getSeriesInfoFromCubePidCoord` and `getDataFromVectorsAndLatestNPeriods` for product 36100580 (all HTTP 200); [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence) (HTTP 200). [ONS national balance sheet dataset](https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/datasets/thenationalbalancesheetestimates/data) (HTTP 200) and `nbsreferencetables2025.xlsx` (HTTP 200, 532,615 b, parsed); [ONS terms and conditions](https://www.ons.gov.uk/help/terms-conditions) (HTTP 200); [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) (HTTP 200). Cabinet Office ESRI — [SNA menu](https://www.esri.cao.go.jp/jp/sna/menu.html) (HTTP 200 via public-DNS resolve), [2024 table list](https://www.esri.cao.go.jp/jp/sna/data/data_list/kakuhou/files/2024/2024_kaku_top.html) (HTTP 200), [`2024sca_jp.xlsx`](https://www.esri.cao.go.jp/jp/sna/data/data_list/kakuhou/files/2024/tables/2024sca_jp.xlsx) (HTTP 200, 55,741 b, parsed), [ESRI 利用案内](https://www.esri.cao.go.jp/jp/goriyou.html) (HTTP 200), [内閣府ホームページ利用規約](https://www.cao.go.jp/notice/rule.html) (HTTP 200), [公共データ利用規約 第1.0版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) (HTTP 200). Bank of Korea — ECOS Open API `StatisticTableList`, `StatisticItemList` and `StatisticSearch` for `291Y505` (all HTTP 200), [BOK 저작권보호방침](https://www.bok.or.kr/portal/main/contents.do?menuNo=200228) (HTTP 200), [data.go.kr 한국은행_국민계정](https://www.data.go.kr/data/15059629/openapi.do) (HTTP 200). [Bundesbank *Vermögensbilanzen*](https://www.bundesbank.de/de/statistiken/gesamtwirtschaftliche-rechenwerke/vermoegensbilanzen/vermoegensbilanzen-773974) (HTTP 200) and its [XLSX](https://www.bundesbank.de/resource/blob/615826/799c8104de23a1f63526c1f7809478e3/472B63F073F071307366337C94F8C870/sektorale-und-gesamtwirtschaftliche-vermoegensbilanzen-xls-data.xlsx) (HTTP 200, 74,545 b, parsed); [Bundesbank SDMX dataflow list](https://api.statistiken.bundesbank.de/rest/metadata/dataflow/BBK) (HTTP 200); [Destatis VGR contents](https://www.destatis.de/DE/Themen/Wirtschaft/Volkswirtschaftliche-Gesamtrechnungen-Inlandsprodukt/_inhalt.html) (HTTP 200); GovData CKAN `package_search` (HTTP 200). [Istat SDMX dataflow list](https://esploradati.istat.it/SDMXWS/rest/dataflow/IT1) (HTTP 200, 13,649,183 b) and dataflow `94_1063_DF_DCCN_ISTITUZ_ANA1_5` data (HTTP 200). [INSEE *Patrimoine national par secteur institutionnel*](https://www.insee.fr/fr/statistiques/2830290) and its [XLSX](https://www.insee.fr/fr/statistiques/fichier/2830290/econ-gen-patrimoine-nat.xlsx) (HTTP 200, parsed); [Insee Première n° 2081](https://www.insee.fr/fr/statistiques/8661938) (HTTP 200). [OECD SDMX dataflow `DSD_NASEC10@DF_TABLE9B`](https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.NAD/DSD_NASEC10@DF_TABLE9B/1.0) (HTTP 200) and [the complete public dataflow listing](https://sdmx.oecd.org/public/rest/dataflow/all/all/latest) (HTTP 200, 8,916,182 b, 1,548 flows enumerated); [.Stat Suite SDMX annotations reference](https://sis-cc.gitlab.io/dotstatsuite-documentation/using-de/sdmx-annotations/).

**Read from cache, not re-fetched, by instruction.** [OECD Terms & Conditions](https://www.oecd.org/en/about/terms-conditions.html) — the 1,482,983-byte artifact retrieved in Phase 2B, re-read this phase and confirmed to contain the *Permitted Use* grant verbatim, corroborated by the cached Wayback snapshot of the same URL.

**Attempted and not retrieved. No figure from any of these is used.** `www-genesis.destatis.de/genesisWS/rest/2020/catalogue/tables` and `/find/find` — HTTP 200 but redirected to a JavaScript announcement page with no data. `bok.or.kr/portal/search/totalSearch.do` — HTTP 404. BOK 공공데이터 제공 board — HTTP 200, 「콘텐츠 준비중입니다」. `kosis.kr/search` — HTTP 200, JavaScript-rendered, no parseable results. `www.oecd.org/en/about/terms-conditions.html` — **HTTP 403 twice on re-test**; see Part 1.1.

**Carried from earlier phases without retesting.** Federal Reserve Z.1 table S1.b figures (Phase 2A, release 11 September 2026); ABS 5204.0 and CBS 85953NED figures (Phase 2B); Eurostat `nama_10_nfa_bs` and `nasa_10_f_bs` extracts (Phase 2B, `updated` 2026-09-08 and 2026-09-10); OECD `DF_TABLE9B` and `DF_T720R_A` extracts (Phase 2A); ECB daily reference rates (Phase 2B, 27,302 observations); World Bank `NY.GDP.MKTP.CD` and `PA.NUS.FCRF` (Phase 2B, `lastupdated` 13 July 2026); CWON 2020 structural weights; the Bitcoin numerator observation; the Eurostat, ABS, CBS, Istat, Federal Reserve and World Bank licence texts.

---

## Research History

**14 September 2026**: Phase 2C. Re-sourced **Japan** (Cabinet Office ESRI, end-2024), the **United Kingdom** (ONS, end-2024), **Canada** (Statistics Canada, 31 December 2025) and **Korea** (Bank of Korea, end-2025) from their national compilers, and re-sourced **Germany** (Eurostat, end-2024) and **Italy** (Istat + Eurostat, end-2024) to cleared licences. **Rights-cleared observed coverage rose from 47.66 % to 53.99 % of world GDP and now equals technically observed coverage on 16 of 16 economies.** GDP-weighted mean vintage improved from 2023.71 to 2024.39. Resolved the France net-foreign-position discrepancy exactly against INSEE/Banque de France and bounded the residual OECD exposure at 0.36 % of the observed denominator. Classified the OECD `NonProductionDataflow` annotation as **usable with explicit caveat** after finding it on all 1,548 public dataflows. Measured the feasible frontier at **55.72 %** on today's publications and 62.93 % counterfactually, and showed that **the ≤ 25 % imputed-share gate proposed by Phases 2A and 2B requires 68.44 % coverage and is therefore unsatisfiable**. Produced a research-only candidate Total Global Wealth of **$560.40 tn** and a research-only candidate UBWI of **0.2827 %** on end-period FX (0.2820 % on period-average), range 0.2312 %–0.3019 %, **37.7 % imputed**. Decision: ready after one limited source/rights fix.

Four things were checked and turned out other than Phase 2B recorded.

**The OECD gate is intermittent, not path-specific.** The same canonical URL that served the terms returned HTTP 403 twenty minutes later, twice. The grant is fine; the *inference rule* was not. A scheduled collector must anchor rights to a cached artifact, because it will be told 403 by a page that says yes.

**Japan was never blocked by Japan.** `www.esri.cao.go.jp` fails on this machine's DNS resolver and answers instantly through a public one. Two phases recorded the Cabinet Office route as unattempted or unreachable; it took two `nslookup` calls and returned the full national balance sheet. The same is true of `stats.gov.cn`, which changes nothing about China's content and everything about how that finding should have been written down.

**Germany's publication was not discontinued.** It moved to the Bundesbank and is two reference years fresher than recorded — and its 2022 figure has since been revised down by 3.9 %, which means Phase 2B's German row was stale *and* superseded, not merely old.

**Two of the four national compilers disagreed with the OECD by more than the OECD route's own error bar.** Korea's own figure is 9.8 % above the OECD's for the same year, because Korea rebased and the OECD extract had not. Harmonisation layers carry a vintage of their own, and it is not the compiler's.
