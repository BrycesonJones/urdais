# Memory source shortlist

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. This is a source study for the memory vertical (DRAM, HBM, NAND/flash, modules). It is not a methodology, it does not create an index, and it registers nothing in the database. No collection has taken place from any source below.

It uses the vocabulary already in the registry (`supabase/migrations/20260913060200_source_registry.sql` and `20260913070000_source_terms_review.sql`) and the two-axis discipline established for compute in `docs/architecture/sources/terms-review.md`:

> Technically collectible ≠ robots-allowed ≠ contractually permitted to automate ≠ permitted to republish as Urdais market data.

**Axis 1 (`terms_review_state`)** — may Urdais retrieve this interface automatically?
**Axis 2 (`data_use_terms_state`)** — may Urdais use what it retrieves to construct, calculate, publish or maintain an index?

Where a rights answer is not determinable from public terms it is recorded as **unknown — ask in outreach**. That is a legitimate outcome, not a gap to be filled by inference.

## Structural finding

Memory is not shaped like compute, and the difference changes the acquisition strategy.

1. **There is no exchange and no futures contract on memory.** The only listed instruments carrying the DRAM ticker are equity wrappers (Roundhill Memory ETF, Cboe listing `DRAM`, formed 2026-03-31; https://www.cboe.com/us/equities/listings/listed_products/symbols/DRAM/). There is no settlement price to reference — and equally, no incumbent index franchise defending one.
2. **Spot price discovery is effectively a private monopoly.** TrendForce/DRAMeXchange is the benchmark the industry quotes, and it is one Taiwanese company surveying brokers.
3. **Consequently the binding constraint in this vertical is rights, not availability.** Nearly every commercially useful memory price source contractually forbids exactly what an index does.

The legally clean assembly path is therefore: **government trade statistics + public issuer disclosure + directly-licensed broker/distributor quotes** — not scraping the incumbents.

---

## Tier 1 — materially improves a memory index

### 1. WSTS — World Semiconductor Trade Statistics

| Field | Finding |
|---|---|
| Data possessed | Monthly shipment **value, units and average selling prices** by product type including a Memory category, by end-use and region. Described by SIA as *"the only primary source for sales data about the semiconductor markets directly from industry participants"* (https://www.semiconductors.org/data-resources/market-data/). Value ÷ units is a true manufacturer ASP, reported by the manufacturers. |
| Public vs gated | Historical Billings Report (40 years, latest July 2026) is free with no login at https://www.wsts.org/. Monthly product-level detail and forecasts are member/subscriber-gated. |
| Automated retrieval (axis 1) | **unknown — ask in outreach.** No API documented; the free Blue Book is a download. |
| Commercial use | **unknown — ask in outreach.** |
| Redistribution / derived index (axis 2) | **not permitted without written permission.** Verbatim, https://www.wsts.org/, retrieved 2026-09-14: *"All WSTS Publications, including this Web Site, are copyrighted by WSTS Inc. All rights reserved. Reproduction in any electronic or physical form, in whole or in part, without written permission from WSTS is prohibited by law."* Subscriber terms are reported to add: *"Any redistribution of WSTS proprietary data outside the subscriber's organization is strictly prohibited"*, with logins recorded. **But** subscribers *"may conduct derivative analyses for use in client newsletters or similar external communications"* — that carve-out is the whole negotiation. |
| Named door | WSTS operates a formal **distribution licence** regime: *"Semiconductor industry organizations hold distribution licenses for WSTS reports"* (https://www.wsts.org/61/63/Subscription-with-WSTS---Foundry-membership). Urdais cannot qualify for membership (which requires designing and selling semiconductors under its own trade name), so a distribution licence is the path. |
| Cadence | Monthly (1 Sep 2026 release carried July 2026 data). |
| Coverage | Worldwide, four regions, by product category. |
| Route | Subscription + distribution licence. |
| Contact | **VERIFIED.** Tobias Proettel, Administrator, `tp@wsts.org`, +49 (177) 388 1977 — published at https://www.wsts.org/65/CONTACT, and his listed remit expressly includes *distribution licenses*. Secondary: Sherree Hellinger, `sh@wsts.org` (US office, member services). Both re-confirmed by direct retrieval on 2026-09-14. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `account_authentication`; terms_review_state `under_review`; data_use_terms_state `not_permitted`; written_agreement_required `true`; production_access_state `production_blocked`. |

**Why this ranks first.** It is the only source that can give an industry-reported memory ASP *and* has a published, named mechanism for lawful redistribution. Highest value, clearest door, verified recipient whose job description contains the exact word.

### 2. TrendForce / DRAMeXchange

| Field | Finding |
|---|---|
| Data possessed | The most granular memory price set in existence. Daily **spot** (DDR5/DDR4/DDR3 chips by capacity, GDDR, LPDDR, wafer, eMMC, memory card, module) and monthly **contract** (UDIMM, RDIMM, SO-DIMM, raw chips, PC-client OEM SSD, mobile DRAM), plus the proprietary **DXI** index. Price surface enumerated at https://www.dramexchange.com/ (`/Price/Dram_Spot`, `/Price/Flash_Spot`, `/Price/Wafer_Spot`, `/Price/LPDDR_Spot`, `/Price/GDDR_Spot`, `/Price/Module_Spot`, `/Price/eMMC`, `/Price/NationalContractDramDetail`, `/Price/PCClientOEMSSD`, `/Price/SSD_Street`) and https://www.trendforce.com/price/dram/dram_spot. |
| Public vs gated | **Registration-gated.** Retrieved 2026-09-14: every `/Price/*` page on dramexchange.com renders a login panel offering *"Register as general member and get FREE service for the following: DRAM spot/contract prices, NAND Flash spot/contract prices, Memory Card spot prices"*. Deeper detail is paid membership. Published membership tiers (https://www.trendforce.com/membership/DRAMeXchange): Silver $5,000/yr (contract + spot with 5 years of history in Excel + DXI + daily alerts), Gold $11,000, Memory Platinum $30,000, Memory Diamond $55,000, HBM package $30,000, Server DRAM $25,000. |
| Corporate identity | DRAMeXchange is *"a Business Division of TrendForce Corp."* (site footer, retrieved 2026-09-14). One counterparty, not two. |
| robots.txt | **Fetched 2026-09-14.** https://www.trendforce.com/robots.txt: `User-agent: *`, `Disallow: /images/hp_final.jpg`, `/images/LoboChiang_final_20220901.jpg`, `/search`, `/searchNews`, `/research/feedback/*`, **`/api/*`**. No crawl-delay. `/price/` is **not** disallowed. https://www.dramexchange.com/robots.txt returns **404** — no robots file at all. |
| Automated retrieval (axis 1) | **unknown — ask in outreach**, leaning restrictive. `/api/*` is robots-barred on trendforce.com; the price pages are behind a login, so retrieval would be authenticated access under a membership agreement rather than open crawling. |
| Redistribution / derived index (axis 2) | **not permitted without written consent.** Verbatim from the DRAMeXchange Terms of Use, https://www.dramexchange.com/About/TermsOfUse, retrieved 2026-09-14 (page states the last update as 1 January 2020): §6.2 *"YOU MAY NOT REPRODUCE, MODIFY, CREATE DERIVATIVE WORKS FROM, DISPLAY, PERFORM, PUBLISH, DISTRIBUTE, DISSEMINATE, BROADCAST OR CIRCULATE TO ANY THIRD PARTY, ANY MATERIALS CONTAINED ON THE SERVICES WITHOUT THE EXPRESS PRIOR WRITTEN CONSENT OF THE WEBSITE OR ITS LEGAL OWNER."* An index is a derivative work. |
| Attribution | §6.3, same document: *"UNDER AUTHORIZED USE, MODIFICATION, REPRODUCTION, PUBLISHING, OR DISSEMINATION OF CONTENTS, USERS ARE REQUIRED TO INCLUDE A NOTICE INDICATING THAT THE WEBSITE IS THE SOURCE OF THE MATERIAL, INCLUDING THE NAME OF THE WEBSITE AND ITS URL ADDRESS."* So attribution is already specified for the authorized case. |
| Unusual clause worth naming | §5.h, same document: users are *"PROHIBITED FROM USING, REFERENCING, INCORPORATING, OR RELYING UPON ANY PRICES, DATA, FORECASTS, RESEARCH, OR OTHER CONTENT PROVIDED THROUGH THE WEBSITE IN CONNECTION WITH ANY BETTING, WAGERING, PREDICTION MARKET, OR OTHER SPECULATIVE ACTIVITY BASED ON THE OCCURRENCE OR OUTCOME OF FUTURE EVENTS."* A published price index is not itself a wagering product, but a licensed index whose downstream users settle contracts against it could be argued into this clause. It must be raised explicitly in any licence conversation rather than discovered later. |
| Cadence | Spot daily; contract monthly, released on the last day of the month, with paid early notice. |
| Coverage | Global memory spot and contract, Asia-centric collection. |
| Route | Paid membership + a separate derived-index licence. |
| Contact | **VERIFIED.** `SR_MI@trendforce.com` — Semiconductor Research department, the correct desk for memory — published at https://www.trendforce.com/contact/reporting alongside +886-2-7702-6888 and 11F., No. 68, Sec. 3, Nanjing E. Rd., Zhongshan Dist., Taipei City 10489. Confirmed by direct retrieval 2026-09-14; the same page also lists `OR_MI@trendforce.com` (Optoelectronics Research), which is the photonics desk. DRAMeXchange separately publishes `mailto:mi@dramexchange.com` on its homepage. Footer general address `service@trendforce.com`. Addresses circulating on third-party aggregators (ZoomInfo, RocketReach) are **not** used. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `account_authentication`; terms_review_state `under_review`; data_use_terms_state `not_permitted`; written_agreement_required `true`; production_access_state `production_blocked`. |

**Two separable asks.** Silver at $5,000 with five years of Excel history is cheap enough to buy purely as a non-redistributable validation set. That is a different transaction from a derived-index licence, and the two should not be conflated in the approach.

### 3. Silicon Data

| Field | Finding |
|---|---|
| Data possessed | Already operates a **RAM Index** — GDDR6 wholesale spot (https://www.silicondata.com/products/ram-index). Published methodology: weighted basket across constituent GDDR6 products, multiple intra-day wholesale spot quotes averaged into a daily product price, dynamic weights reviewed every two months, published daily at 16:00 UTC on business days, four decimal places. |
| Public vs gated | Portal subscription. |
| Route | **API endpoints, bulk download, 90-day history, and a "settlement-ready reference endpoint."** Also runs a **Data Partnerships** programme soliciting contributed data (https://www.silicondata.com/data-partnerships). |
| Rights | **unknown — ask in outreach.** Subscription terms not assessed. |
| Cadence | Daily, business days. |
| Coverage | GDDR6 only. DDR5, DDR4, LPDDR, HBM and NAND are uncovered — which is precisely the complementary space. |
| Contact | **VERIFIED.** `support@silicondata.com`, published at https://www.silicondata.com/contact-us (confirmed by direct retrieval 2026-09-14), plus a "Book a call" scheduler and a work-email contact form. No dedicated BD address is published; the partnerships page and the scheduler are the correct routes. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `api_key`; both terms axes `not_reviewed`; production_access_state `research_usable`. |

**Why it matters.** Silicon Data appears in Urdais's existing compute price research, so this is a warm start rather than a cold approach. They have built the mechanism this vertical needs and pointed it at one product family. The framing is partner-on-the-rest, not compete-on-GDDR6.

### 4. Korea Customs Service — export unit values (no permission ask required to begin)

| Field | Finding |
|---|---|
| Data possessed | HS-code-level export value and net weight, from which a unit value ($/kg) for memory ICs is derived. Korea is the majority of world DRAM supply, so this is a market-wide observation rather than a sample. |
| Portal | `unipass.customs.go.kr/ets` now redirects to **https://tradedata.go.kr/cts/index.do** (confirmed 2026-09-14). Korean government portal, English version available, downloadable confirmed (확정통계) and provisional (잠정통계) statistics. |
| Public vs gated | Public, free. |
| Cadence | Monthly, **plus 10-day and 20-day provisional releases** — the highest-frequency legally clean memory signal identified anywhere in this study. |
| Rights | Footer states *"Copyright Korea Customs Service. All Rights Reserved"* and links a 저작권보호정책 (copyright protection policy). **The policy text was not read. Treat as likely permissive Korean government open data but unconfirmed — this is the single rights question that most affects this recommendation.** |
| Known weakness | Unit value is **per kilogram**, not per bit or per gigabit, and HBM mix-shift contaminates it badly: an HBM stack weighs little and costs enormously, so a rising HBM share inflates $/kg independently of any price move. Using this requires an explicit normalization model. It is a derivation, not a print. |
| Contact | **UNVERIFIED.** Technical support 1544-1285 and general enquiries 125 (both Korean-language); postal 189 Cheongsa-ro, Seo-gu, Daejeon 35208. No published English BD or data-licensing address was found. The correct route is the portal's own inquiry function. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `public_unauthenticated`; both axes `under_review` pending the copyright policy. |

### 5. Manufacturer IR disclosure (no permission ask required)

Public securities disclosure is the best rights position available in this vertical: factual, free, ungated, and lawful to cite.

| Issuer | What is disclosed | URL |
|---|---|---|
| Micron | Most granular. FQ1'26 DRAM +20% QoQ price, NAND +mid-teens; FQ3'26 DRAM ASP +low-60s%, NAND +mid-80s%, bit shipments given separately. Also disclosed 16 signed long-term agreements — direct evidence that contract structure is shifting away from spot. | https://investors.micron.com/quarterly-results |
| SK hynix | Q2'26 DRAM ASP ~+30% QoQ, NAND ASP +mid-50%, with bit-shipment guidance. | https://news.skhynix.com/en/q2-2026-business-results/ |
| Nanya (TWSE 2408) | ASPs +>70% QoQ in Q1'26, and **monthly revenue** filed via TWSE MOPS — a monthly-frequency public datapoint from a pure-play DRAM maker. Winbond files the same way. | https://www.nanya.com/en/Ir |
| Samsung | Blended memory ASP ~+146% vs the 2025 average, but **does not split DRAM from NAND**. A real gap. | Samsung IR |
| Kioxia / Sandisk | NAND ASP-vs-bit attribution disclosed. | https://investor.sandisk.com/ |

These cannot set a level. They can anchor and validate one, and Nanya's monthly revenue plus Korea customs monthly gives two independent monthly public signals to cross-check a derived series against.

---

## Tier 2 — useful supplemental

### 6. Distributor APIs — technically ideal, contractually barred as a class

This is the most important negative finding in the memory study. All of these expose real, transactable, quantity-tiered prices on memory components with stock levels. All of them prohibit the index use case.

| Provider | Interface | Rights finding |
|---|---|---|
| **Digi-Key** | https://developer.digikey.com/ — Product Information V4, price breaks and stock | **not permitted.** API User Agreement, https://developer.digikey.com/api-user-agreement, fetched 2026-09-14, prohibits: *"use the API, DigiKey Data, or Documentation to update or create your own database of information"*; *"modify or create derivative works of the DigiKey Data"*; *"distribute or disclose DigiKey Data to any third parties"*; *"aggregate, in any way, any DigiKey Data with third party content or data without distinction"*; *"use the API or DigiKey Data in a way that is competitive to or inconsistent with DigiKey's services"*; *"bulk download DigiKey Data."* Four separate clauses each independently bar an index. Liability capped at $1,000. |
| | robots.txt | **Counterpoint worth noting.** https://www.digikey.com/robots.txt (fetched 2026-09-14) grants explicit `Allow: /` to ClaudeBot, Claude-User, Claude-SearchBot, GPTBot, PerplexityBot and Google-Extended while banning Ahrefs/MJ12/PetalBot/Yandex. The robots posture is permissive and the contract posture is prohibitive. Do not mistake one for the other. |
| | Gated terms | `developer.digikey.com/documentation/terms-of-use` and `digikey.com/en/resources/api-solutions/terms-of-use` both refused unauthenticated retrieval on 2026-09-14 (SAML redirect / Cloudflare 403). The operative agreement is public at the `/api-user-agreement` URL above. |
| **Mouser** | https://www.mouser.com/en/apiterms/ | *"limited, non-exclusive, revocable, non-sublicensable, non-transferable license to copy and display the Mouser Electronics Data solely on your Application"*; other purposes require prior written consent. **Clause not confirmed by direct retrieval** — mouser.com returns an Akamai access-denied interstitial to non-browser clients, including on `/robots.txt` (confirmed 2026-09-14). |
| **Arrow** | https://developers.arrow.com/api/ — genuine Pricing & Availability API, 50 req/s (Arrow.com/Verical), 3 req/s premium | Terms exist; **not retrieved. unknown — ask in outreach.** |
| **Avnet** | https://apiportal.avnet.com/ | Reported clause, **UNVERIFIED** (direct fetch HTTP 400): *"You must delete your cached data regularly, at least monthly, and provide evidence about your deletion towards Avnet upon request"* (https://www.avnet.com/americas/about-avnet/terms-of-use-api/). A price index is a permanent historical archive; if that clause is real it is fatal. |
| **Farnell / element14** | https://partner.element14.com/docs/Product_Search_API_REST__Description — tiered pricing, stock, lead times, per-warehouse regional breakdown, XML/JSON | Terms not published on the doc page. **unknown — ask in outreach.** |
| **Nexar / Octopart (Altium)** | https://nexar.com/api — GraphQL, aggregates *"current stock levels, pricing, lifecycle status and technical component information"* across distributors; free eval 100 matched parts, paid tiers to Enterprise | **Terms not retrievable** (site shell only; no robots.txt). **unknown — ask in outreach.** One contract would cover many distributors, which is why it is worth the attempt. No published BD address; route is https://support.nexar.com/support/home — **UNVERIFIED**. |
| **Findchips (Supplyframe/Siemens)** | https://www.findchips.com/ | Most permissive robots posture found: fetched robots.txt disallows only `/api/inventory/search/` and `/offline`, `Crawl-delay: 10`, and carries `Content-Signal: ai-train=yes, search=yes, ai-input=yes`. `/terms` 404s. **unknown — ask in outreach.** |

**Relevance caveat that limits the whole class.** Distributor catalogue prices are *resale* prices for small-lot named-brand modules. They lag contract DRAM by weeks and carry distributor margin. Good for a retail/channel sub-index; poor as a proxy for the contract market that actually moves.

### 7. Subscription research houses — buy for validation, cannot redistribute

| Firm | Memory-price product | Contact |
|---|---|---|
| **Counterpoint Research** | Monthly **Memory Pricing Tracker** plus quarterly DRAM Tracker & Forecast; notably tracks long-term agreements reshaping DRAM pricing dynamics — directly relevant to whether a spot index stays representative. https://counterpointresearch.com/en/reports/memory-price-tracker-and-forecast-july-2026 | Form only, https://counterpointresearch.com/en/contact-us — **UNVERIFIED** |
| **TechInsights** | Monthly **Memory Pricing Report**: Server/Mobile/PC DRAM, **HBM**, SLC/MLC/TLC/QLC NAND, client SSD, UFS. https://www.techinsights.com/blog/memory-pricing-report-january-2026 | Forms only (`/contact-us/sales-inquiry`, `/contact-us/customer-success`, `/contact-us/media-request`), phone 1-877-826-4447, confirmed 2026-09-14 — **no published email, UNVERIFIED** |
| **Omdia (Informa)** | **DRAM Memory Intelligence Service** and **NAND Memory Intelligence Service**, monthly pricing updates. https://omdia.tech.informa.com/advance-your-business/semiconductors/dram-memory-intelligence-service | `citations@omdia.com` — semi-verified, see the photonics shortlist |
| **Yole Group** | **DRAM Market Monitor**, quarterly with monthly pricing updates; strong on HBM mix and blended-ASP effects, which is exactly the contamination problem in the Korea customs series. https://www.yolegroup.com/product/monitor/dram-market-monitor/ | `support@yolegroup.com` — semi-verified, direct fetch bot-blocked |
| **SemiAnalysis** | **Memory Model**: bottoms-up DRAM/NAND, HBM pricing across generations and suppliers, vendor-level shipments in stacks/bits/wafers, quarterly 2022–2027. Sold separately from the newsletter. https://semianalysis.com/memory-model/ | Already in Urdais's compute source set |
| **Objective Analysis** (Jim Handy) / **Coughlin Associates** (Tom Coughlin) | Small specialist shops; heavy free public commentary at https://thememoryguy.com/ and https://tomcoughlin.com/. Objective Analysis publishes named analysts (Jim Handy, Tom Starnes, Tim Stammers) but **no email or phone** (confirmed 2026-09-14). | **UNVERIFIED**, forms/LinkedIn only |

Rights across this class are uniformly internal-use subscription licences. **None is a redistribution route.** Buy one as ground truth; do not build on it. Objective Analysis and Coughlin have low data value but high advisory value — they are the field's institutional memory and are the cheapest available sanity-check on an index methodology, particularly on the HBM-mix normalization problem.

### 8. SEMI — upstream materials, not memory device prices

Sells the Silicon Wafer Market Monitor (quarterly shipments by region and wafer size, plus wafer pricing trends) and the Material Market Data Subscription (10 wafer-fab + 7 packaging material types, quarterly, 10-year history + 2-year forecast). Published prices: MMDS $4,450 member / $9,850 non-member; Silicon Wafer Market Monitor $6,250 / $8,950; World Fab Forecast $3,800 / $5,600 (https://store-us.semi.org/collections/market-information).

Contact **VERIFIED**: `mktstats@semi.org`, published on the MMDS store page https://store-us.semi.org/products/material-market-data-subscription-mmds-1 (confirmed by direct retrieval 2026-09-14), plus 1.877.746.7788.

This is input cost, not memory price. Useful for a cost-floor model; it does not improve price discovery. **Note: every `semi.org` page including `/robots.txt` returned 403 to this study — SEMI's crawl and ToS posture is UNVERIFIED.** The Shopify store did resolve.

### 9. SiliconExpert / Z2Data

Component-data platforms with real-time pricing across a billion-plus components and API export (https://www.siliconexpert.com/products/api/, https://www.z2data.com/pricing). Quote-based commercial licensing, no published rates. SiliconExpert publishes a dedicated API contact page at https://www.siliconexpert.com/contact-api/ — form, **no published email, UNVERIFIED**. These are BOM-risk tools; memory pricing is incidental. Low priority unless a distributor licence proves unobtainable.

### 10. Sourceability / Sourcengine

Marketplace with an Order API reaching 3,500+ suppliers, exposing *inventory trends, pricing history* and RFQ handling (https://sourceability.com/sourcengine). Procurement-oriented rather than data-oriented; access presumes a customer relationship. Terms **unknown — ask in outreach**. `sourcengine.com` and `sourceability.com` both refused unauthenticated retrieval on 2026-09-14.

---

## Tier 3 — speculative, or evaluated and rejected

### 11. BLS PPI — legally perfect, substantively empty

Rights are the best available anywhere. https://www.bls.gov/developers/termsOfService.htm imposes no commercial-use prohibition; the obligations are attribution (*"BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov"*), citing the retrieval date, no logo use, and no misrepresentation. Free API v1 (no registration) and v2 (registered).

**But BLS discontinued its memory and microprocessor product-line index in 2015, and no memory- or DRAM-specific PPI series is currently published.** The surviving `PCU334413334413` (Semiconductor and Related Device Manufacturing) is dominated by logic, analog and discretes and has recently moved opposite to memory prices. Retain only as a macro control variable. Note that `https://www.bls.gov/robots.txt` returned 403 with an explicit anti-bot statement, while the terms page itself served fine.

That US official statistics contain no memory price series is itself part of the case for the index existing.

### 12. Chinese / Asian spot markets (Huaqiangbei)

No official published memory price index exists from Shenzhen Huaqiang or the market authorities; searching in Chinese for 华强北电子市场价格指数 returned none. What exists is journalist field surveys carrying concrete quotes — Kingston 16GB DDR4 at ¥750–800, up from ¥680 in mid-May (https://www.yicai.com/news/103260635.html, https://www.21jingji.com/article/20260401/herald/0204324fe4fa5a88dc8385e97635b7b6.html, https://www.cnstock.com/commonDetail/747635).

No licensable source today. But this is the world's largest physical memory spot market and it is unindexed — the most interesting original-collection opportunity in the vertical, and the highest-effort.

### 13. Derivative aggregators — do not ingest

`memoryindex.io` (https://memoryindex.io/methodology) is a free open DRAM/HBM/NAND tracker whose own methodology page names TrendForce/DRAMeXchange as source #1 and Counterpoint as #2, and which also cites `memory-prices.com` — an Amazon affiliate RAM price-comparison site updated only periodically. Its operator is not identified anywhere on the page. Same pattern at `siliconanalysts.com`, `memorypricechart.com`, `capitalandcompute.net/memory-prices`. `dramwatch.com` does not resolve.

Two lessons. Its *"reported / derived / estimate"* provenance tagging is a good pattern and consistent with the discipline Urdais already applies to UCPI. Its rights posture is not: it is a third party publicly building an index on data whose terms appear to forbid it. **Ingesting any of these would inherit an unlicensed chain. Avoid aggregators entirely** — the same principle already recorded for compute, where routing a blocked provider's values through a third party is explicitly not a cure (`docs/architecture/sources/runpod-permission-denied.md`).

### 14. Taiwan MOEA

Repeatedly cited as authoritative for Taiwanese semiconductor and DRAM module production statistics, but the actual open-data endpoint and its terms were not located in this study. Likely a modest production-volume series rather than price. **Genuine gap.**

---

## Source-rights risk register (memory)

| Risk | Source | Verbatim / evidence | Severity |
|---|---|---|---|
| Derivative works barred outright | DRAMeXchange / TrendForce | §6.2, *"YOU MAY NOT REPRODUCE, MODIFY, CREATE DERIVATIVE WORKS FROM … WITHOUT THE EXPRESS PRIOR WRITTEN CONSENT"* (fetched) | **Fatal** without a licence |
| Betting / prediction-market clause | DRAMeXchange / TrendForce | §5.h (fetched) — bears on downstream settlement use of a licensed index | Moderate, must be named in the ask |
| Reproduction barred, prosecution language | WSTS | *"Reproduction in any electronic or physical form, in whole or in part, without written permission from WSTS is prohibited by law"* (fetched) | Severe, but a **distribution licence regime exists** |
| Creating a database from the data barred | Digi-Key | API User Agreement (fetched) | **Fatal** without a licence |
| Undifferentiated aggregation barred | Digi-Key | API User Agreement (fetched) — this is definitionally what an index does | **Fatal** without a licence |
| Competitive-use bar | Digi-Key | *"in a way that is competitive to or inconsistent with DigiKey's services"* (fetched) | **Fatal** without a licence |
| Mandatory monthly cache deletion | Avnet | Reported clause, **UNVERIFIED** — incompatible with any historical archive | **Fatal** if confirmed |
| Display-only licence | Mouser | Reported clause, **UNVERIFIED** (site bot-walled) | Severe |
| robots.txt API bar | TrendForce | `Disallow: /api/*`; `/price/` **not** barred (fetched) | Moderate — scope carefully |
| Terms unretrievable | Nexar (site shell), Findchips (`/terms` 404), Arrow & Mouser robots.txt, Avnet API terms (400), all of semi.org (403), Digi-Key gated terms pages | — | **Must ask in outreach; do not assume** |
| Copyright policy unread | Korea Customs 저작권보호정책 | — | The one open question on the best clean source |
| Provenance contamination | memoryindex.io and peers | Openly built on TrendForce plus an affiliate retail site | Moderate — do not ingest aggregators |

No paywalled-terms situation was found in the memory vertical in the strict sense (terms visible only after login). Terms were either published or absent, with Digi-Key's *supplementary* terms pages gated while the operative agreement stayed public.

---

## Registry note

`reference.providers` and `reference.source_interfaces` are the existing registry and are the right home for these rows. **This slice writes no migration.** Registering a provider is a database change, and CLAUDE.md forbids introducing tables or rows not required by the current slice; nothing here is collected from, so nothing needs a row yet. The `Registry values if seeded` lines above record the intended vocabulary so a later slice can seed mechanically without re-deriving the classification.

Two schema observations for whoever writes that migration:

- `providers_kind_allowed` permits only `cloud_provider`, `marketplace`, `hardware_vendor`, `other`. Price-reporting agencies, statistical offices and standards bodies all land in `other`. If the memory and photonics verticals proceed, a `data_publisher` or `statistical_agency` kind would carry more meaning than `other` does.
- `source_interfaces_class_allowed` has no value for a periodic research report or a statistical release. `price_surface` is the least-wrong fit and is what the values above use.
