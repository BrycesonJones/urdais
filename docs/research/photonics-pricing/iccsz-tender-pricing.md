# ICCSZ and Chinese telecom tender pricing

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. This follows up lead §20 of `source-shortlist.md`, which flagged iccsz.com (讯石光通讯网) as *"the most promising unexplored lead in this vertical"* because it reports China Telecom and China Mobile tender results carrying unit counts and winning bidders.

**No collection has taken place. No ingestion code, migration, schema change or pipeline exists or is proposed for implementation here.** This document proposes a data model; it commits no SQL.

It uses the registry vocabulary from `supabase/migrations/20260913060200_source_registry.sql` and `20260913070000_source_terms_review.sql`, and the two-axis discipline from `docs/architecture/sources/terms-review.md`:

**Axis 1 (`terms_review_state`)** — may Urdais retrieve this interface automatically?
**Axis 2 (`data_use_terms_state`)** — may Urdais use what it retrieves to construct, calculate, publish or maintain an index?

Where a rights answer is not determinable it is recorded as **unknown**. Absence of a bar is never recorded as permission.

---

## Executive conclusion

**Recommendation: use only as discovery-and-validation. Do not build a Chinese-tender price index, and do not treat ICCSZ as a licensed data source.**

Four findings drive this, in descending order of weight.

**1. The channel does not carry the product Urdais needs.** Chinese carrier 集采 (centralized procurement) of *standalone optical modules* covers low-speed access, fronthaul and transport optics — 10G BIDI SFP+, 25G CWDM, 100G QSFP28. The blended award value in the two cleanest examples found is **≈78–111 元/只 (≈US$11–16) excluding VAT**. That is a 10G/100G access-module price. The 400G/800G/1.6T AI-cluster optics that a photonics index exists to measure are **not procured this way**: they arrive bundled inside OTN/switch/server equipment tenders where no module line item is published, or they bypass the carriers entirely and are bought direct by ByteDance, Alibaba and Tencent, whose procurement is not disclosed at all. The one carrier lot in this study explicitly aimed at high-speed modules — China Mobile Terminal Company's 100,000-unit 高速光模块 package — is a **budget** of 160m RMB against an expressly **non-committed quantity** (非承诺量), i.e. an intent, not a transaction.

**2. Where the number exists, it is frequently administered rather than discovered.** In China Mobile's 2026–2027 普通光缆 award, **17 of 18 winning candidates bid the 最高投标限价 of 7,099,800,000 元 exactly** — to the yuan — producing a weighted average of 102.57 元/芯公里 that is simply the buyer's ceiling divided by the buyer's quantity. In China Telecom's 15,000-unit 算力一体机 award, the first and second candidates in *each* of two packages submitted **identical bids to the fen**. A series built on such awards would measure Chinese carrier budget policy, not an optics market. This does not happen every time — the Guangdong module award below cleared at 70% of ceiling — but it happens often enough that no unaudited derivation is safe.

**3. Nothing about ICCSZ's rights is knowable, starting with whether Urdais may fetch it at all.** `iccsz.com` **could not be resolved from this environment** (see the retrieval note below), so **robots.txt was not read and the terms of use were not read.** Under the discipline this project already applies to FS.com and Yole, that is *unknown on both axes*, and it meant no page on the domain was fetched during this study. Everything below about ICCSZ was assembled from search-result metadata and from the same stories carried by other publishers.

**4. ICCSZ is a reporter, not the publisher of record — and that is the good news.** Every award traced here originates in a mandatory statutory disclosure by the buyer. 《招标投标法实施条例》第五十四条 requires the 招标人 to publish 中标候选人公示 within 3 days of the evaluation report, for not less than 3 days, for any 依法必须进行招标的项目. The facts are compelled public disclosure. **The primary portals, not ICCSZ, are the correct target** — and ICCSZ's genuine value is as a *discovery and indexing layer* over a set of portals that are individually near-unsearchable.

The honest summary: this is a **validation and market-direction source for the Chinese access/transport optics segment**, worth a handful of low-frequency observations a year. It is not an index constituent, and it is not the AI-photonics price signal the vertical is missing.

---

## Retrieval note — why nothing was fetched from iccsz.com

Recorded plainly because it bounds every ICCSZ finding below.

| Probe | Result |
|---|---|
| `getaddrinfo` / `curl https://www.iccsz.com/robots.txt` | **`Could not resolve host`**, repeatedly, for `iccsz.com`, `www.iccsz.com` and `news.iccsz.com`. |
| `dig @8.8.8.8`, `@1.1.1.1`, `@223.5.5.5` | All return **`116.63.86.33`** (Huawei Cloud, CN). The domain is live; this environment's resolver does not return it. |
| WHOIS | `ICCSZ.COM`, status ACTIVE, created 2001-09-20, expiry 2028-09-20, registrar Xin Net Technology (xinnet.com), NS `ns19/ns20.xincache.com`. |
| Forced resolution (`--resolve`, `--dns-servers`) | Refused by the environment's command classifier. Not retried by any other route. |
| Control | `curl` to `census.gov`, `baidu.com`, `b2b.10086.cn` all returned 200, so this is specific to the domain, not a China-wide or general network block. |

**Consequence, applied strictly.** The task's own rule is to check `robots.txt` before fetching anything else from the domain. The check could not be completed, so **no other page on the domain was requested.** `terms_review_state` for every ICCSZ interface is **`not_reviewed`** — not `permitted`, and not `not_permitted` either, because a bar was never read. A human on an unfiltered connection should re-run this check before any further work; if it comes back naming ClaudeBot, Claude-Web, Claude-User or anthropic-ai — as LightCounting and Omdia do — the discovery-layer role dies with it and only the primary portals remain.

---

## ICCSZ source assessment

Assembled from search-result titles, snippets and URL structure only.

| Field | Finding |
|---|---|
| Site | 讯石光通讯网 / 讯石光通讯咨询网, `iccsz.com`, self-described 「光通讯行业的充电站」. |
| Operator | 「讯石公司」 per the site's own footer as reproduced in search results. Shenzhen-based: **粤ICP备12008183号**, 公安备案 **粤公网安备 44030402001515号**. Published phone **0755-82960080**. No company registration number, legal name or address was verified. |
| Copyright line | `Copyright © 2003-2023 ICCSZ.com Inc. All Rights Reserved`, alongside 「讯石公司 www.iccsz.com 版权所有」. Implies an archive reaching back to ~2003 and an explicit all-rights-reserved assertion. |
| Original publisher? | **No, for tender content.** Every tender item traced is a report of a disclosure made first by China Mobile, China Telecom or China Unicom on their own procurement portals. ICCSZ is the original publisher of its own analysis (【讯石观察】), its 月报 reports and its industry rankings (ICC讯石·光通信行业英雄榜) — none of which are tender data. |
| Sections carrying tender results | 要闻资讯 (`ArticleList.aspx?column_id=8f73a5b031da4abf8e806d4c69e89238`) is the section that surfaces 集采 items; tender stories also appear under the general news stream. No dedicated 招标/集采 channel was identified. |
| Archive structure | Two URL schemes serve the same article: a **dated static path** `/site/cn/News/YYYY/MM/DD/<YYYYMMDDhhmmss######>.htm`, and a **GUID path** `/4g/news.Asp?ID=<32-hex>`. The dated path is date-enumerable and archival; the GUID path is not enumerable without an index. Example of one article under both: the 2025 三省 165k-module story appears as `/site/cn/News/2025/03/30/20250330092616200505.htm` and, per `source-shortlist.md` §20, as `/4g/news.Asp?ID=f3fd87a920894937b5aefece6b371dad`. |
| Search / pagination | `Search.aspx?keywords=…&column_id=ALL&station=全部&Page=N` — a keyword search with an explicit page parameter, observed as high as `Page=45`. That is the discovery affordance the carrier portals lack. |
| RSS / API / bulk | None identified. |
| Login / paywall | The news stream appears open. **Reports are gated**: ICC讯石产研院 publishes 《全球光通信市场动态月报》 and 《全球光通讯市场现状分析及预测》 to members of its 企联荟 membership platform, delivered by email. So the site is a free news layer over a paid research business. |
| Publishes a price index? | **No — question closed.** `source-shortlist.md` §20 recorded this as unconfirmed. No ICCSZ-original price index or ASP series was found. What ICCSZ publishes about prices is **reporting on other firms' numbers** (e.g. its coverage of LightCounting's 2025 vendor Top-10 and market-size figures), which would inherit an unlicensed chain — the same defect already recorded for the memory aggregators in the outreach tracker. |
| Robots.txt | **Not read.** Unknown. |
| Terms of use / republication / commercial-use policy | **Not read.** Unknown. An unqualified 版权所有 in the footer is an assertion of rights, not a licence. |
| Automated-retrieval restrictions | **Unknown.** |
| Licensing / data / BD contact | **UNVERIFIED.** Only `0755-82960080` (the 企联荟 membership line, from search snippets) was located. No email address was retrieved from the domain. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface` (discovery role: `product_reference_documentation` is the closer fit for an index layer); access_class `unknown`; **terms_review_state `not_reviewed`, data_use_terms_state `not_reviewed`**; production_access_state `production_blocked`. |

**One structural observation worth keeping.** Across roughly a dozen Chinese-language searches for carrier optical procurement, ICCSZ was the single most frequently returned domain — often the only outlet carrying a given 集采 item, and consistently ranked ahead of 光纤在线 (c-fol.net), C114 and 通信世界网. Whatever its rights posture turns out to be, **it is the de-facto index of this event class**, which is precisely the discovery role §20 hoped for and precisely *not* a licensing case.

---

## Primary-source map

Every award traced here has a compelled statutory origin. The chain is always the same shape:

> **buyer's own e-procurement portal (primary, mandated)** → 转载 by trade press (ICCSZ, 光纤在线, C114, 通信世界网) → aggregated by financial press (Sina, Eastmoney, Tencent) → **ICCSZ is one hop, and never the first.**

### Legal basis

《中华人民共和国招标投标法实施条例》**第五十四条**: for a 依法必须进行招标的项目, the 招标人 must publish the 中标候选人公示 within 3 days of receiving the evaluation report, and the public-notice period must be **not less than 3 days**. 《招标公告和公示信息发布管理办法》 (NDRC) further requires such notices, other than genuinely confidential or trade-secret content, to be published to the public. The three carriers are state-owned enterprises whose major procurements fall inside this regime.

**Two consequences.** The disclosure is compelled, not discretionary — so it is durable and will not be withdrawn on a vendor's request. And the same regulation carves out **商业秘密**, which is exactly the exemption under which unit-price cells are redacted in Accelink's CSRC reply (recorded in `source-shortlist.md` §4). Expect the same reticence here: quantity and total are published; per-SKU unit price usually is not.

### Portal retrieval posture — probed 14 September 2026

Each portal's `/robots.txt` was requested directly. None of the three carrier portals publishes one.

| Portal | Operator | robots.txt | Retrieval posture |
|---|---|---|---|
| `b2b.10086.cn` — 中国移动采购与招标网 | China Mobile | **None.** `/robots.txt` and `/sitemap.xml` both return **HTTP 200 with the identical 855-byte Vue SPA shell**; the server answers every unknown path with the app. | Content is entirely client-rendered from a JSON backend; nothing is served to a non-browser client. The shell carries `<body oncontextmenu="return false">` — right-click disabled, a weak but explicit anti-copy signal. **Axis 1 unknown; absence of robots.txt is not permission.** |
| `caigou.chinatelecom.com.cn` — 中国电信阳光采购网 | China Telecom | **None.** `/robots.txt` returns HTTP 200 with the SPA shell. | Shell ships an active bot-management client (`MSS_EICS` + an obfuscated `$_ts` challenge bundle) before the app. Substantive content behind a JS challenge. **Axis 1 unknown, and the operator has installed machinery that says non-browser clients are not wanted.** |
| `www.chinaunicombidding.cn` — 中国联通采购与招标网 | China Unicom | **None.** SPA shell with the same `$_ts` challenge family. | A real detail URL (`/bidInformation/detail?id=2039918529084383232`) returns **HTTP 412 Precondition Failed** to a non-browser client. Effectively bot-walled. |
| `www.ccgp.gov.cn` — 中国政府采购网 | MOF | `/robots.txt` → **404** (site's own error page). | Not the right venue regardless: carrier procurement is SOE procurement under 招标投标法, not 政府采购法, so carrier optics tenders do not appear here. |
| `bulletin.cebpubservice.com` — 中国招标投标公共服务平台 | CEBPubService | **HTTP 405**, Aliyun WAF: 「您访问的URL有可能对网站造成安全威胁，您的访问被阻断」. | The statutorily designated national 指定媒介 — and the most valuable single target if it were reachable. Blocked at the edge to this client. |
| `www.chinabidding.com.cn` — 中国采购与招标网 | — | Did not resolve from this environment. | Unassessed. |

**The finding that matters.** The *primary* sources are, if anything, harder to retrieve than the secondary ones: three SPA portals with no robots.txt, two of them running commercial bot management, and the national bulletin behind a WAF. **The rights position is genuinely better at the primary layer (compelled public disclosure of facts) while the retrieval position is worse.** That is the exact inverse of the usual Urdais pattern and it is the reason the recommendation below is not "go to the primary source and build".

---

## Representative examples

Fourteen procurement events. Chinese terms are preserved beside translations wherever the distinction is load-bearing. **预估金额 (estimated amount) ≠ 最高投标限价 (maximum bid ceiling) ≠ 投标报价 (submitted bid) ≠ 中标金额 (award amount) ≠ 预算 (budget).** These are not synonyms for "price" and are not collapsed anywhere below.

Sources are given as the discovery article; the primary disclosure is the buyer's portal in every case.

### 1. 中国电信广东公司 2026–2027年度第三方光模块集中采购项目 — the single best example found

| Field | Value |
|---|---|
| Buyer | 中国电信股份有限公司广东分公司 (China Telecom Guangdong) |
| Award date | Evaluated by 2026-03-06; portal notice 2026-03-06, reported 2026-03-10 |
| Product | 通用光模块 (general-purpose optical modules). **Speed/form-factor mix not disclosed.** |
| Quantity | **164,098 只** |
| 最高投标限价 | **18,213,356.52 元（不含税）** → **110.99 元/只** ceiling |
| 投标报价 (不含税) | 中天宽带 12,681,892.71 · 武汉飞沃 12,479,522.06 · 武汉瑞斯康达 13,282,258.90 |
| 中标份额 | 50% / 30% / 20% |
| Rejected bids | 5 of 8 rejected — 3 for 不满足关键技术指标资格要求, 2 for 不满足自主生产能力资格要求 |
| Award stage | 中标候选人公示 |
| Bundling | None disclosed; modules only |
| Tax | 不含税 stated explicitly |
| Discovery | 光纤在线 `http://www.c-fol.net/news/4_202603/20260310151305.html` |
| Primary | 中国电信阳光采购网, `caigou.chinatelecom.com.cn` |

**Derivation.** Each candidate priced the full 164,098-unit basket and was then allocated a share, so the blended awarded unit value is Σ(share × bid) ÷ quantity = 12,741,254.75 ÷ 164,098 = **77.64 元/只（不含税）** ≈ 87.7 元 incl. 13% VAT ≈ **US$10.9** at 7.1 CNY/USD. Award cleared at **70.0% of ceiling** — genuine price discovery, not ceiling-hugging.

**Why it is still only `derivable_unit_value` and not a price.** The mix is unpublished. 164,098 "general-purpose modules" spanning 1G through 100G at unknown proportions gives a blended figure whose movement between rounds is indistinguishable from a change in mix. Comparable over time only if the mix is comparable, and the mix is not disclosed.

### 2. 中国电信 2025年 广东/浙江/湖北三省公司 通用光模块联合集采

| Field | Value |
|---|---|
| Buyer | China Telecom Guangdong + Zhejiang + Hubei, joint |
| Award date | 2025-03-30 |
| Product | 10G 单纤双向 BIDI SFP+ CPRI; 100G 双纤双向 QSFP28 以太网&OTU4 |
| Quantity | **165,230 只** — 标包1 广东 86,264 · 标包2 浙江 50,273 · 标包3 湖北 28,693 |
| Winners | 光迅科技, 亨通光电, 瑞斯康达, 武汉飞沃 (4 中标候选人) |
| Amounts | **Not located.** 光纤在线 reports 「单只模块的价格在80元左右」 — a journalist's approximation, not a disclosed figure |
| Award stage | 中标候选人公示 |
| Discovery | ICCSZ `/site/cn/News/2025/03/30/20250330092616200505.htm`; 光纤在线 `/news/7_202503/20250331013312.html` |

The lead article behind `source-shortlist.md` §20. **The ~80元 figure must never be used**: it is secondary, rounded, and its basis is unstated. It happens to sit plausibly next to example 1's 77.64元, which is exactly what makes it dangerous.

### 3. 中国电信 2022年 光模块集中采购

| Field | Value |
|---|---|
| Buyer | 中国电信 (group level) |
| Award date | 2023-04-28 |
| Product | 双通道双速 SFP / SFP+ / XFP / SFP28 / QSFP28 / CFP / CFP2 / CFP4, speeds 100M · 155M · 622M · GE · 2.5G · 10G · 25G · 100G |
| Quantity | **814,529 只** |
| Winners | 10 vendors, ranked |
| Amounts | **Not located** in the secondary report |
| Award stage | 中标候选人公示 |
| Discovery | C114 `https://www.c114.com.cn/news/117/a1230746.html`; ICCSZ `/site/cn/News/2023/04/28/20230428135522184080.htm` |

**The earliest module event with a disclosed quantity found in this study.** Also the clearest illustration of the mix problem: eight speed grades and eight form factors in one procurement.

### 4. 中国移动终端公司 2025年自有品牌光传输器件制造服务项目

| Field | Value |
|---|---|
| Buyer | 中国移动终端公司 |
| Date | Announced 2025-12-02 |
| Structure | 标包一 低速光模块 **600,000 只**, 预算 **60,000,000 元（含税）** → ~100 元/只 · 标包二 高速光模块 **100,000 只**, 预算 **160,000,000 元（含税）** → ~1,600 元/只 |
| Total | 220,000,000 元, 3-year term, 独家供应 per lot |
| **Critical caveat** | Quantities are **非承诺量** — expressly not committed volumes |
| Award stage | **预算 / budget only.** No 中标 information located |
| Discovery | 艾邦半导体网 `https://www.ab-sm.com/a/71851`, itself citing 「中国移动公告、讯石光通讯」 |

The only carrier lot found that is explicitly aimed at high-speed modules, and it is a budget against a non-committed quantity. **1,600 元 is what China Mobile is willing to spend per high-speed module, not what one costs.** Collapsing 预算 into "price" here would be the single most damaging error available in this dataset.

### 5. 中国移动 省际骨干传送网 400G OTN 新技术试验网设备集中采购 (2023)

| Field | Value |
|---|---|
| Buyer | China Mobile |
| Dates | Tender ~2023-08; award 2023-11 |
| Quantity | **1,910 台 OTN 设备 + 11,190 个 400G 线路 OTU 端口** |
| 最高投标限价 | 标包1 19.67亿 · 标包2 11.72亿 · 标包3 4.92亿 = **约 36.3亿元（不含税）** |
| 投标报价 | 标包1 华为+华为服务联合体 **1,726,743,187.91（不含税）/ 1,947,987,398.30（含税）** · 标包2 中兴 **948,097,279.40 / 1,071,350,065.16** · 标包3 烽火+武汉烽火服务联合体 **434,136,125.42 / 490,560,751.15** |
| 中标份额 | 55% / 30% / 15% (三个标包: 一平面, 二平面东部, 二平面西部) |
| Bundling | **Heavy** — chassis, line cards, muxponders, amplifiers, installation and technical services; the 400G coherent optics are inside the OTU cards and never priced separately |
| Discovery | C114 `https://www.c114.com.cn/news/118/a1249069.html`; 通信世界网 `https://www.cww.net.cn/article?id=584979`; ICCSZ `/4g/news.Asp?ID=4e1fcd8b625c456e9035e4c7ec23f1db` |

The richest disclosure in the study — ceiling, bid, tax-inclusive and tax-exclusive, and share, per lot — and **worthless as a coherent-optics price**. Naïve division gives 3,108,976,592.73 ÷ 11,190 = 277,835 元 per 400G port, which is a systems price with services in it. The award cleared at 85.6% of ceiling.

### 6. 中国移动 2024–2026年 CWDM 基站前传设备集中采购

| Field | Value |
|---|---|
| Buyer | China Mobile |
| Award date | 2024-12-02 |
| Quantity | **436,600 套** |
| 最高投标限价 | **396,450,780.53 元** → 908.0 元/套 ceiling |
| Award | 10 winners; reported aggregate ≈ 3.6亿元 → ≈ **825 元/套** |
| Product mix in one lot | 25G 6波 CWDM 无源 · 10G 6波 CWDM 无源 · 10G 12波 CWDM 无源 · 25G 6波 CWDM 半有源 · 10G 6波 CWDM 半有源 |
| Module content | Secondary reporting *estimates* >3,000,000 optical modules implied. **Estimate, not disclosure.** |
| Discovery | 光纤在线 `https://www.c-fol.net/m/news/view.php?id=20241202101613`; ICCSZ `/4g/news.Asp?ID=5bba9e835b4346efbed4cafdd797a2cb` |

**The canonical naïve-division trap.** A "套" is a multi-module system; five materially different configurations sit in one lot; passive and semi-active units are mixed; and the module count is an analyst's inference. Any per-module figure derived here would be fabricated.

### 7. 中国移动 2026–2027年 CWDM 基站前传设备集中采购

Same product family as #6, **规模 57.85万套** (vs 43.66万套) — announced 2026. Recorded because it establishes that this event class **recurs on a ~2-year cycle with a comparable product definition**, which is the minimum precondition for any time series. Amounts not located. Discovery: ICCSZ `/4g/news.Asp?ID=be0a4ecb1e3245b383fdd1c7670ebc1b`.

### 8. 中国移动 2026–2027年 CPE OTN 设备集中采购

规模 **29,652 台** — 自主可控 7,123 台 + 通用场景 22,529 台. 最高投标限价 set but not disclosed in accessible reporting. Discovery: 乙方宝 `https://m.yfbzb.com/inviteBid/detail/20260401_586201738.html`. Equipment, not modules; noted for the 自主可控 (domestically-controllable) split, which is a **product-definition break** an index would have to handle — the same nominal device at two different qualification standards is two different goods.

### 9. 中国电信 2025–2026年 企业全光组网接入算力一体机集中采购 — the bid-integrity warning

| Field | Value |
|---|---|
| Buyer | China Telecom |
| Evaluated | 2025-12-23 |
| Quantity | **15,000 台** — 标包1 ARM 5,000 · 标包2 X86 10,000 |
| **最高投标限价, per unit** | ARM Type I **14,000–22,500 元/台（不含税）**, Type II **16,000–41,000**; X86 Type I **11,500–20,000**, Type II **14,000–39,000** |
| 中标候选人 | ARM: 华为 **98,752,000 元（不含税）**, 四川九洲电器 **the same figure**. X86: 上海依图网络科技 **174,168,000 元（不含税）**, 燕阳科技（苏州） **the same figure** |
| Discovery | C114 `https://m.c114.com.cn/w117-1302765.html`; Sina, 「太巧合！…与另一企业报价完全相同！分毫不差！」 |

Two things at once. It is the **only example in the study publishing an explicit per-unit monetary figure** — and that figure is a *ceiling range*, an administrative instrument. And in both packages the first and second candidates bid **the identical amount to the fen**. Whatever explains that, it is not two firms independently discovering the same price. **Chinese carrier bid amounts cannot be assumed to be independent competitive observations.**

### 10. 中国移动 2026–2027年 普通光缆产品集中采购 — the administered-price control case

| Field | Value |
|---|---|
| Buyer | China Mobile · 招标编号 **CMCC20260500183** |
| Award | 2026-09-05 / 09-07 |
| Quantity | 约 **216.18万皮长公里** = **6,922.2万芯公里** |
| 最高投标限价 | **7,099,800,000 元（不含税）** |
| Result | 18 中标; **17 of them bid 70.998亿元 exactly** — 「顶格落槌」 |
| Derived | **102.57 元/芯公里**, i.e. exactly ceiling ÷ quantity; reported as a **1.15× increase** on the prior round |
| Discovery | Sina `https://finance.sina.com.cn/tech/roll/2026-09-05/doc-iniqtspw3735316.shtml`; ICCSZ `/4g/News.Asp?ID=0d25e118c9244f5ba2ed1fe5c7d647f7` |

Not an optical module, and included deliberately. It is the **cleanest derivation in the entire dataset** — one homogeneous product, one unit, one total, and the derived unit value reproduces the reported figure exactly — and it is **economically meaningless as a market price**, because the number is the buyer's ceiling and the "1.15× increase" is an administrative reset. This example is the reason the recommendation is not "derive unit values wherever the arithmetic is clean."

### 11. 中国移动 2024–2025年 特种光缆产品集中采购

720万芯公里, **总预算约 68,817.70万元**. 预算 stage only. Discovery: ICCSZ `/4g/news.Asp?ID=59dc4c0d1b6f48f38f0caacc3115cd81`; 中国线缆网. Recorded as a **budget_only** exemplar with a disclosed quantity — the shape that most tempts a bad derivation.

### 12. 中国联通 2024年 光缆集中采购

15 中标候选人; 报价 spread **29.01亿 – 46.28亿元（不含税）** across bidders for a comparable scope. Discovery: C114 `https://m.c114.com.cn/w16-1281857.html`, `https://m.c114.com.cn/w119-1282091.html`. Recorded for two reasons: it is the only China Unicom disclosure located with real numbers, and a **1.6× spread between the lowest and highest bid on the same scope** shows that 投标报价 dispersion is wide — so a single bid is not a market price, and the choice of which bid to observe materially changes the answer.

### 13. 中国电信 2024年 天翼云 400G 交换机集中采购

Spec explicitly **64 × 400GE (QSFP-DD) fixed ports**; 锐捷网络 (Ruijie) 中标. Discovery: 通信世界网 `https://www.cww.net.cn/article?id=588099`; C114 `https://m.c114.com.cn/w117-1259054.html`. **The only 400G-datacom carrier tender found**, and it prices a switch. The QSFP-DD optics are either bought separately or bundled and never itemized. This is the structural reason the tender channel cannot see 400G module prices.

### 14. 中国移动 2025–2026年 无源器件集中采购

8 中标厂商, announced 2025-02-19. Discovery: 光纤在线 `https://www.c-fol.net/news/1_202502/20250219161034.html`. Passive components — adjacent product space, included to bound coverage: the carriers tender the passive/access layer densely and the high-speed active layer barely at all.

---

## Price-usability classification

| # | Event | Classification | Basis |
|---|---|---|---|
| 1 | CT Guangdong 2026–27 modules, 164,098只 | **`derivable_unit_value`** | Quantity + share-weighted 投标报价 + explicit 不含税. Only defensible derivation in the set. Blended over an undisclosed speed mix. |
| 2 | CT 3-province 2025, 165,230只 | `supplier_share_only` | Quantities and winners published; no amount located. The 「80元左右」 figure is secondary and unusable. |
| 3 | CT 2022, 814,529只 | `supplier_share_only` | Quantity and 10 ranked winners; no amount located. |
| 4 | CM Terminal 2025, 700,000只 | **`budget_only`** | 预算, and quantity is 非承诺量. Two reasons it is not a transaction. |
| 5 | CM 400G OTN 2023 | `package_level_only` | Full ceiling/bid/share disclosure at lot level; optics embedded in equipment + services. |
| 6 | CM CWDM fronthaul 2024–26, 436,600套 | **`not_price_usable`** | Five materially different configurations in one lot; passive+semi-active mixed; module count is an estimate. |
| 7 | CM CWDM fronthaul 2026–27, 578,500套 | `not_price_usable` | Same defect; amount not located. |
| 8 | CM CPE OTN 2026–27, 29,652台 | `package_level_only` | Equipment; 自主可控/通用 split is a product break. |
| 9 | CT 算力一体机 2025–26, 15,000台 | **`budget_only`** | The only explicit per-unit figures are 最高投标限价 ranges. Identical first/second bids void the award as an independent observation. |
| 10 | CM 普通光缆 2026–27 | `derivable_unit_value` — **arithmetically, and reject economically** | Derivation is exact (102.57 元/芯公里) and the number is the buyer's ceiling. Clean ≠ meaningful. |
| 11 | CM 特种光缆 2024–25 | `budget_only` | 总预算 + quantity. |
| 12 | CU 光缆 2024 | `package_level_only` | Bid range only; 1.6× dispersion across bidders. |
| 13 | CT 天翼云 400G switch 2024 | `supplier_share_only` | Winner known; optics not itemized. |
| 14 | CM 无源器件 2025–26 | `supplier_share_only` | Winners only. |

**Score: 14 events inspected. 0 with an explicit unit price for optical modules. 1 with a defensibly derivable module unit value (#1). 1 more arithmetically derivable but economically administered (#10).**

The only explicit per-unit monetary figures found anywhere (#9's 11,500–41,000 元/台 ranges) are **ceilings on a computing appliance**, not module prices.

### Where naïve division misleads — the specific failure modes seen

1. **Multiple speeds in one lot.** #3 spans 100M to 100G in one procurement; #2 mixes 10G BIDI and 100G QSFP28; #1 does not disclose its mix at all. Blended ÷ total is a mix index wearing a price index's clothes.
2. **Mixed form factor and reach.** #3 spans SFP through CFP4.
3. **Passive and active in one line.** #6 puts 无源 and 半有源 CWDM units in the same 套 count.
4. **Bundled services.** #5 is priced by 联合体 pairing an equipment vendor with its services arm (华为技术 + 华为技术服务; 烽火通信 + 武汉烽火技术服务) — installation and support are inside the number by construction.
5. **The unit is a system, not a component.** #6's 套 and #13's switch each contain an unstated number of modules.
6. **Tax.** #5 discloses both bases and they differ by 12.8%; #4 is 含税; #1, #9, #10, #12 are 不含税. Mixing bases silently introduces a 13% error.
7. **Multiple suppliers at different prices.** #1's three winners bid 12.48m / 12.68m / 13.28m for the same basket — a 6.4% spread that only a share weighting resolves. #12's spread is 1.6×.
8. **The award equals the ceiling.** #10, 17 of 18 bidders. #9, first = second to the fen. When this happens the "price" is the buyer's arithmetic.
9. **Non-committed quantity.** #4's 非承诺量 means the denominator itself is notional.
10. **Product-definition breaks.** #8's 自主可控 vs 通用场景 split changes what the good is between rounds.

---

## Rights matrix

| Source | Axis 1 — retrieval (`terms_review_state`) | Axis 2 — data use (`data_use_terms_state`) | Evidence |
|---|---|---|---|
| **iccsz.com** | **`not_reviewed`** | **`not_reviewed`** | robots.txt not readable — domain did not resolve from this environment; terms never fetched. 版权所有 footer is an assertion, not a licence. |
| **b2b.10086.cn** (CM) | **`not_reviewed`** — no robots.txt published; SPA shell for every path; `oncontextmenu` disabled | **`under_review`** — the underlying facts are compelled statutory disclosure; the portal's own terms were never read | Direct probe 2026-09-14. |
| **caigou.chinatelecom.com.cn** (CT) | **`not_reviewed`**, leaning adverse — active bot management (`MSS_EICS` / `$_ts`) | **`under_review`** — as above | Direct probe 2026-09-14. |
| **www.chinaunicombidding.cn** (CU) | **`not_reviewed`**, leaning adverse — HTTP 412 to non-browser clients | **`under_review`** | Direct probe 2026-09-14. |
| **bulletin.cebpubservice.com** (national 指定媒介) | **`not_reviewed`** — HTTP 405, Aliyun WAF block | **`under_review`** | Direct probe 2026-09-14. |
| **www.ccgp.gov.cn** | robots.txt 404 → none published | n/a — wrong venue for SOE procurement | Direct probe 2026-09-14. |
| **c-fol.net, c114.com.cn, cww.net.cn** and financial press | **`not_reviewed`** — not assessed; out of scope | **`not_reviewed`** | Used here for research reading only. |

**Three disciplines carried forward from existing Urdais records.**

- *Absence of terms is not permission.* Recorded for ProLabs in `source-shortlist.md`; it applies to all three carrier portals, none of which publishes a robots.txt.
- *A third-party route around a blocked source is not a cure.* Recorded in `runpod-permission-denied.md`. If a carrier portal turns out to bar automated retrieval, **reading the same award off ICCSZ or 光纤在线 does not fix it.** This is the most likely way this particular research would be mis-implemented.
- *The two axes diverge, and here they diverge unusually.* The primary layer is **rights-clean and retrieval-hostile**; the secondary layer is **retrieval-plausible and rights-opaque**. Neither leg is currently buildable.

---

## Historical depth, cadence and coverage

**Depth.** ICCSZ's dated archive path and its `© 2003–` copyright line suggest coverage reaching to roughly 2003. The earliest *module* event with a disclosed quantity located here is **China Telecom's 2022 procurement, announced 2023-04-28** (814,529 只). Treat **2023-04-28 as the earliest usable historical date**, and 2022 as the earliest usable *event* date. Depth beyond that is asserted by the site's own archive structure, not verified.

**Cadence — and this is decisive.** Standalone module 集采 at the group level appears roughly **once every one to three years per carrier**, supplemented by irregular provincial procurements (#1, #2). Counting generously, the entire Chinese carrier channel produces something on the order of **2–5 module-relevant award events per year across all three carriers**, of which perhaps one carries a derivable unit value. An index cannot be built on that. It is an annual-to-biennial validation point.

**Product coverage against what the vertical needs.**

| Segment | Carrier tender coverage |
|---|---|
| 10G/25G access, fronthaul, CWDM | **Dense.** #1, #2, #3, #6, #7, #14. |
| 100G QSFP28 telecom/OTU4 | **Present**, always blended into mixed lots. #2, #3. |
| 400G coherent / OTN line-side | **Equipment only.** #5, #8. Optics never itemized. |
| 400G datacom (QSFP-DD) | **Switch only.** #13. |
| **800G / 1.6T** | **Absent.** No carrier tender found. |
| **400ZR / 800ZR** | **Absent.** |
| **DCI and AI-cluster optics** | **Absent from the tender channel.** Bought direct by ByteDance, Alibaba and Tencent — reported at a combined "several million units" of 800G demand, with Alibaba Cloud introducing 800G in 2025 and 1.6T from 2026, none of it publicly tendered. |

**The coverage table is the answer to the hypothesis.** The channel is dense exactly where a photonics index is least interesting and empty exactly where it is most interesting.

---

## Economic interpretation

**What the number actually measures.** A Chinese carrier award unit value is *the volume-discounted, VAT-inclusive-or-exclusive, framework-contract price of a domestically-qualified access or transport optical module, sold in a single-buyer administered procurement to a state-owned operator, at a quantity of 10⁵–10⁶ units, under a supplier-share allocation that guarantees no single vendor the whole volume, subject to a buyer-published ceiling and to domestic-content qualification.* That is a real and interesting economic object. It is not an optical-module market price, and it is emphatically not a global spot price.

Six distortions between it and any global reference:

1. **Monopsony.** Three buyers, coordinated procurement calendars, published ceilings, and empirical evidence (#9, #10) that bids cluster at or on the ceiling. The buyer sets the level.
2. **Bulk framework, not spot.** 164,098 units in one award against FS.com's per-SKU retail. These are opposite ends of the same distribution; the spread between them is a discount structure, not a price change.
3. **Domestic-content qualification.** #1 rejected two bidders for 不满足自主生产能力资格要求; #8 splits 自主可控 from 通用. The eligible supplier set is policy-constrained, so the award reflects a Chinese domestic-supply price, not a world price.
4. **Currency and tax.** RMB, with VAT treatment varying by notice and both bases sometimes published (#5). USD conversion at award date adds an FX term to a series whose true signal is small.
5. **Segment mismatch.** The tendered goods are telecom access optics. Global photonics price attention is on AI-datacom. The two segments have diverged sharply in the last three years — Chinese module makers' revenue growth is driven by 800G datacom sold to hyperscalers, not by carrier 集采.
6. **Declining representativeness.** Chinese trade coverage in 2026 explicitly questions whether carrier 集采 is still the industry bellwether it was: 「运营商光缆集采相继流标，'行业风向标'为何失灵？」 and 「随着财大气粗的AI云公司冲击，运营商的'行业风向标'地位摇摇欲坠」. The channel is losing signal value at the same time the AI segment is gaining it.

**Role assessment.**

| Role | Verdict |
|---|---|
| **(A) Primary index constituent** | **No.** 2–5 events a year, one derivable value among them, undisclosed product mix, administered levels, wrong segment. Fails frequency, comparability and representativeness simultaneously. |
| **(B) Transaction-price anchor** | **No, with one qualification.** #1 is genuinely transaction-adjacent — a real award, at 70% of ceiling, with tax basis stated. But it anchors *Chinese carrier access optics at 10⁵ volume*, an object no Urdais index currently targets. If Urdais ever builds a telecom-access-optics series, revisit this; for AI photonics it anchors nothing. |
| **(C) Validation observation** | **Yes — this is the real value.** A once- or twice-yearly independent check that the low-speed end of any Urdais photonics series is in the right order of magnitude. #1's 77.64 元/只（不含税）≈ US$10.9 is a hard, dated, buyer-disclosed number. Very few exist in this vertical. |
| **(D) Market-direction signal** | **Yes, qualified.** Award-vs-ceiling ratio, bidder count, rejection rate, share concentration and the supplier roster are all genuine directional signals about Chinese domestic optics supply — and they are *more* informative than the price, because they are less administered. #4's 73% budget skew toward high-speed modules is a real demand signal even though 1,600 元 is not a price. |

---

## Proposed data model — proposal only, no SQL

Reuses `reference.providers` / `reference.source_interfaces` and the existing observation/provenance architecture in `docs/BACKEND_PRD.md`. **Nothing here is a migration and nothing here should be built until the recommendation below changes.** The reason to write it down is that the vocabulary problem — the five Chinese monetary terms — is real and would otherwise be re-solved badly later.

**Registry.** Four `reference.providers` rows (`china-mobile`, `china-telecom`, `china-unicom`, `iccsz`), each `provider_kind` `other`. Source interfaces: one per carrier portal, `source_class` `price_surface`, `access_class` `unknown`, both terms axes `not_reviewed`, `production_access_state` `production_blocked`. ICCSZ gets its own interface for the **discovery** role, and it must be a *different* interface row from any price surface, so that a discovery-only permission can never be mistaken for a data-use permission.

**Entities.** Five levels, because collapsing any two of them is where the errors live.

- `procurement_event` — 招标编号, buyer, project title (Chinese + translation), tender-issue date, award date, statutory basis, primary notice URL.
- `procurement_lot` — 标包 number and name, one row per lot. Never aggregate across lots.
- `lot_product_line` — the declared product content of a lot: speed, form factor, reach, wavelength plan, active/passive, and a `mix_disclosed boolean`. When false, every unit value derived from that lot is blended and must be flagged as such downstream.
- `procurement_quantity` — value, unit (只 / 套 / 台 / 端口 / 芯公里), and `is_committed boolean` to carry 非承诺量.
- `procurement_amount` — the load-bearing table.

**`procurement_amount` — the part that must not be got wrong.**

| Column | Purpose |
|---|---|
| `amount_value`, `currency` | The figure. |
| `amount_term_zh` | **The original Chinese term, stored verbatim and never translated on write**: `预估金额` \| `最高投标限价` \| `投标报价` \| `中标金额` \| `预算` \| `合同金额`. |
| `award_stage` | `announced_budget` \| `bid_ceiling` \| `submitted_bid` \| `winning_bid` \| `framework_ceiling` \| `completed_procurement`. Derived from `amount_term_zh` by an explicit mapping, not by inference. |
| `tax_basis` | `inclusive` \| `exclusive` \| `unstated`. No default. A row with `unstated` may not enter any calculation. |
| `bidder_id`, `award_share_pct` | Who bid it, and what share they were allocated. |
| `bundles_services`, `bundles_hardware` | Booleans, defaulting **true** — bundling must be disproved, not assumed absent. |

**`price_signal` — a derived object, never an observation.** Only materializable when: quantity `is_committed`; `tax_basis` is not `unstated`; `mix_disclosed` is true *or* the row is flagged `blended`; `bundles_*` are both false; and `award_stage` is `winning_bid` or `completed_procurement`. Carries the classification vocabulary from the section above (`explicit_unit_price` … `not_price_usable`) plus `derivation_method` and `ceiling_ratio` (award ÷ ceiling) — because a `ceiling_ratio` of 1.000 is the marker of an administered number and must be visible to anyone using the series.

**Provenance — two source columns, always.** `primary_source_id` (the buyer's portal notice, with its own URL and retrieval timestamp) and `discovery_source_id` (ICCSZ or whichever outlet surfaced it). **A row whose `primary_source_id` is null is not usable**, regardless of how good the discovery article looked. This is the structural expression of the finding that ICCSZ is never the publisher of record.

---

## Outreach

**Required, and narrowly scoped.** One recipient, one question, and the question is about *discovery*, not data.

**ICCSZ (讯石公司) — ask only whether automated retrieval of the news index is permitted.** Urdais does not need to license ICCSZ's content: the tender facts are compelled public disclosure and belong to the buyer's notice, not to the reporter. What Urdais would want is the far smaller thing of being allowed to *read the index* to find out that an award happened, then go to the primary notice. Asking for that, rather than for a content licence, is both honest and much more likely to succeed. A draft is at `docs/architecture/sources/memory-photonics-permission-requests.md` §9 and a row is seeded in the tracker at `not yet contacted` with an empty date. **Nothing has been sent, and no mail-client draft was created.**

Two prerequisites before that message goes anywhere:

1. **Read `https://iccsz.com/robots.txt` in a browser on an unfiltered connection.** If it names ClaudeBot, Claude-Web, Claude-User or anthropic-ai, say so in the first paragraph of the message — the precedent set for LightCounting and Omdia in the outreach tracker.
2. **Find an email address.** Only `0755-82960080` was located, and it is the 企联荟 membership line. The contact is **UNVERIFIED** and the tracker row is therefore `blocked — no verified contact`, not `not yet contacted`, until a real address is retrieved from the domain.

**Not required:**

- **The three carriers.** Their 中标候选人公示 is a statutory disclosure of fact under 招标投标法实施条例 第五十四条. There is no data-use permission to ask for, and no procurement department would understand the question. The open issue is retrieval, and a bot-management vendor's challenge page is not something an email resolves.
- **The other trade outlets** (光纤在线, C114, 通信世界网). Same discovery-layer position as ICCSZ; approach them only if ICCSZ says no and the discovery role still looks worth having.

---

## Recommendation

**Use only as discovery-and-validation.**

Not "proceed to implementation", because the arithmetic does not survive contact with the product: fourteen events, zero explicit module unit prices, one defensible derivation, and that one derivation is a blended figure over an undisclosed mix of access optics. Not "proceed after permission", because permission is not the binding constraint — even a full grant from ICCSZ and clean access to all three carrier portals would yield roughly two to five events a year in a product segment the AI-photonics thesis does not care about. And not "reject as a pricing source", because #1 is real: a dated, buyer-disclosed, tax-explicit, share-weighted award at 77.64 元/只（不含税） is a harder number than anything FS.com's blocked storefront or LightCounting's paywalled model will give up for free, and there are not many of those in this vertical.

So: keep it, at its true size. Record the events by hand as they occur — a handful a year — as **validation observations** against the low-speed end of any future Urdais photonics series, and as **directional signals** through award-vs-ceiling ratio, bidder count and supplier concentration. Do not model it, do not schedule it, do not build a collector for it, and do not let a clean division tempt anyone into publishing a Chinese carrier award as an optics price.

The hypothesis this study set out to test — that Chinese telecom procurement disclosures could be turned into a reproducible, rights-cleared series of transaction-adjacent optical-component prices — is **answered no**, and the reason is not rights and not retrieval. It is that the transactions the Chinese carriers disclose are not the transactions the photonics index needs to measure. **The AI-photonics price signal is being set in private direct procurement between hyperscalers and module makers, and no public tender channel sees it.** That is a finding worth having, because it forecloses the most attractive-looking shortcut in the vertical and points the remaining effort back at the sources `source-shortlist.md` already identified: the Chinese A-share issuer disclosures, which at least concern the right products, and the storefront and research-firm conversations, which at least concern the right speeds.

---

## Related records

- `docs/research/photonics-pricing/source-shortlist.md` — the photonics source study; §20 opened this lead, and §4 holds the A-share issuer route that this study points back to
- `docs/architecture/sources/memory-photonics-outreach-tracker.md` — the ICCSZ row seeded by this study
- `docs/architecture/sources/memory-photonics-permission-requests.md` §9 — the ICCSZ draft
- `docs/architecture/sources/terms-review.md` — the two-axis classification this study inherits
- `docs/architecture/sources/runpod-permission-denied.md` — the model for recording a refusal, and the rule that a third-party route around a blocked source is not a cure
- `docs/BACKEND_PRD.md` — the observation and provenance architecture the proposed model reuses
