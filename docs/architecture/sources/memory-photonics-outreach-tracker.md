# Memory and Photonics Outreach Tracker

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Opened 14 September 2026. This is the operational record of outbound data-acquisition contact for the memory and photonics verticals: who was approached, when, through what channel, what came back, and when to follow up.

**Nothing in this document has been sent.** Every row is seeded at `not yet contacted` with an empty contacted date. Drafts live in `memory-photonics-permission-requests.md`; sending is a separate, human-approved step. No date is backdated and no contact history is invented.

## How to use this

Three rules, carried over from the compute outreach in this directory.

1. **Sending a request is not permission.** A row moving to `sent` changes nothing about a source's registry state. Only written evidence granting an axis moves a classification.
2. **Record refusals with the same care as grants.** A clear no closes the question and removes the provider from future outreach, which is worth as much as a yes. `runpod-permission-denied.md` is the model.
3. **Do not begin collection on a verbal, implied or partial yes.** Production approval requires both `terms_review_state` and `data_use_terms_state` at `permitted`. A helpful reply confirming an API exists answers the wrong question.

### Status vocabulary

Deliberately distinct from the registry's `terms_review_state` values so the two are never confused. This column tracks the *conversation*; the registry tracks the *rights*.

| Status | Meaning |
|---|---|
| `not yet contacted` | Seeded. Draft may or may not exist. |
| `blocked — no verified contact` | Worth contacting, but no address is published and the route is a web form, a phone line or LinkedIn. Needs a human decision on channel. |
| `sent` | Message sent. Date and channel recorded. |
| `acknowledged` | Provider confirmed receipt; decided nothing. |
| `granted` | Written grant received. Record which axes and against which version of their terms. |
| `partially granted` | One axis granted, the other not, or granted subject to conditions. |
| `refused` | Written refusal. Preserve verbatim in a dedicated document. |
| `no response` | Follow-up window elapsed with nothing back. |
| `not pursued` | Evaluated and deliberately dropped. Reason recorded. |

### Contact verification vocabulary

| Marker | Meaning |
|---|---|
| **VERIFIED** | Address retrieved first-hand from the provider's own domain on the date shown. |
| **SEMI-VERIFIED** | Attributed to the provider's own page, but the page refused direct retrieval. Load it in a browser before sending. |
| **UNVERIFIED** | No published address. The named form, phone or LinkedIn route is the correct channel. Do not guess an address. |

No address in this document was taken from a third-party aggregator. Where aggregators asserted addresses (650 Group, TrendForce, Counterpoint), those were deliberately discarded.

---

## Tier 1 — memory

| Provider | Vertical | Contact | Verification | Date contacted | Status | Response | Licensing notes | Next follow-up |
|---|---|---|---|---|---|---|---|---|
| WSTS Inc. | Memory | `tp@wsts.org` (Tobias Proettel, Administrator; remit includes distribution licenses), cc `sh@wsts.org` | **VERIFIED** 2026-09-14, https://www.wsts.org/65/CONTACT | — | `not yet contacted` | — | Reproduction without written permission is barred outright. A **distribution licence** regime exists and is the named door. Ask for a derived-index distribution licence over the Memory ASP series, not a subscription. | 10 business days after sending |
| TrendForce Corp. / DRAMeXchange | Memory | `SR_MI@trendforce.com` (Semiconductor Research), cc `mi@dramexchange.com` | **VERIFIED** 2026-09-14, https://www.trendforce.com/contact/reporting and dramexchange.com homepage mailto | — | `not yet contacted` | — | ToU §6.2 bars derivative works without express prior written consent; §6.3 specifies the attribution form for the authorized case; §5.h bars use in betting/prediction-market/speculative activity and must be raised explicitly. Two separable asks: a $5,000 Silver subscription as a non-redistributable validation set, and a derived-index licence. Do not conflate them. | 10 business days after sending |
| Silicon Data | Memory | `support@silicondata.com` + Data Partnerships route, https://www.silicondata.com/data-partnerships | **VERIFIED** 2026-09-14, https://www.silicondata.com/contact-us | — | `not yet contacted` | — | Already operates a GDDR6 RAM Index with API, bulk download and a settlement-ready reference endpoint. DDR5/DDR4/LPDDR/HBM/NAND uncovered. Frame as partner-on-the-rest, not compete-on-GDDR6. Warm start from existing compute research. | 7 business days after sending |
| Korea Customs Service | Memory | Portal inquiry function at https://tradedata.go.kr/cts/index.do; tel 1544-1285 / 125 | **UNVERIFIED** — no published English BD or data address | — | `blocked — no verified contact` | — | Public data; no permission ask is needed to begin. The open question is the 저작권보호정책 copyright policy, which was not read. Derivation work can start in parallel. | On the copyright-policy read, not on a reply |
| Micron / SK hynix / Samsung / Nanya / Kioxia-Sandisk | Memory | n/a | n/a | — | `not pursued` | — | **No outreach required.** Public securities disclosure; lawful to cite. Anchors and validates a level, cannot set one. | — |

## Tier 1 — photonics

| Provider | Vertical | Contact | Verification | Date contacted | Status | Response | Licensing notes | Next follow-up |
|---|---|---|---|---|---|---|---|---|
| Omdia (Informa) | Photonics | `citations@omdia.com`, https://omdia.tech.informa.com/contact-us | **SEMI-VERIFIED** — page 403s to direct retrieval; confirm in a browser before sending | — | `not yet contacted` | — | Optical Components Intelligence Service explicitly advertises pricing data. robots.txt names ClaudeBot and Claude-User under `Disallow: /` — acknowledge this in the message. A published citations address means they have already thought about third-party reuse. | 10 business days after sending |
| LightCounting | Photonics | `info@lightcounting.com`; `sales@lightcounting.com` semi-verified | **VERIFIED** 2026-09-14 for `info@` — published in plain text on https://www.lightcounting.com/ | — | `not yet contacted` | — | 200+ products × price × shipments, history 2022–2025 and forecast 2026–2031, semi-annual refresh. robots.txt names ClaudeBot, Claude-Web and anthropic-ai at `Disallow: /` and blocks Scrapy; licence terms unreadable (403). Lead by naming the robots bar. | 10 business days after sending |
| Cignal AI | Photonics | Form only, https://cignal.ai/contact/; LinkedIn to Andrew Schmitt as alternate | **UNVERIFIED** — no mailto on `/contact/`, `/purchase/` or `/about/`, confirmed 2026-09-14 | — | `blocked — no verified contact` | — | Subscription agreement bars derivative works and third-party provision without express written consent, **but names a Cignal Citation Policy**. Ask about that policy specifically. Draft is ready; only the channel is unresolved. | 10 business days after sending |
| FS.com (Fiberstore) | Photonics | Form at https://www.fs.com/service.html; LinkedIn BD as alternate | **UNVERIFIED** — site refuses all unauthenticated retrieval | — | `blocked — no verified contact` | — | Richest public price surface in the vertical and completely opaque on rights: robots.txt and every policy URL return HTTP 202 zero-byte. **No rights determination is possible from outside and none should be inferred.** Ask for written collection consent and whether a feed exists. | 10 business days after sending |
| US Census Bureau | Photonics | `eid.international.trade.data@census.gov`, 1-800-549-0595 opt. 4 | **VERIFIED** 2026-09-14, census.gov FT900 release | — | `not yet contacted` | — | **Both axes already permitted on published terms.** No permission ask needed. Outreach is only a courtesy note plus practical questions on rate limits and 10-digit HS line selection. Free API key required. Mandatory attribution string. | Optional; no blocker |
| Accelink / Innolight / Eoptolink (CSRC filings) | Photonics | IR departments named in each annual report | **UNVERIFIED** — not extracted | — | `not pursued` | — | **No outreach required.** Regulated disclosure. Accelink's unit-price cells are redacted but narrative ASP deltas are published. Innolight and Eoptolink FY2025 tables **must be verified first-party** before use; secondary-press figures are unconfirmed and the 万只/只 multiplier is unresolved. | — |

## Tier 2 — memory

| Provider | Vertical | Contact | Verification | Date contacted | Status | Response | Licensing notes | Next follow-up |
|---|---|---|---|---|---|---|---|---|
| Digi-Key | Memory | https://developer.digikey.com/support; `orders@digikey.com` is a support line, not BD | **UNVERIFIED** for BD purposes | — | `not yet contacted` | — | API User Agreement bars an index four separate ways: no derivative works, no bulk download, no undifferentiated aggregation, nothing competitive. Any approach must ask for an express written carve-out. Their AI-crawler allowlist suggests the institution is not reflexively closed. | 15 business days after sending |
| Nexar / Octopart (Altium) | Memory | https://support.nexar.com/support/home | **UNVERIFIED** | — | `blocked — no verified contact` | — | **Get the terms first** — they were not retrievable. One contract would cover many distributors, which is the whole appeal. | On terms retrieval |
| Counterpoint Research | Memory | Form, https://counterpointresearch.com/en/contact-us | **UNVERIFIED** | — | `not yet contacted` | — | Monthly Memory Pricing Tracker; tracks long-term agreements reshaping DRAM pricing. Internal-use subscription; buy for validation, not redistribution. | 15 business days after sending |
| TechInsights | Memory + Photonics | Forms: `/contact-us/sales-inquiry`, `/contact-us/customer-success`; 1-877-826-4447 | **UNVERIFIED** — no published email, confirmed 2026-09-14 | — | `not yet contacted` | — | Monthly Memory Pricing Report incl. HBM; separately, teardown BOM gives the **cost floor** under a photonics ASP index. One conversation can cover both verticals. | 15 business days after sending |
| Yole Group | Memory + Photonics | `support@yolegroup.com`, cc `sandrine.leroy@yole.fr` (PR Director, published route for external use of Yole data) | **SEMI-VERIFIED** — site 202/403; mixed domain, confirm in a browser | — | `not yet contacted` | — | DRAM Market Monitor (monthly pricing updates, strong on HBM mix) and Silicon Photonics line. T&C page exists but is unreadable — paywalled terms. | 15 business days after sending |
| SEMI | Memory | `mktstats@semi.org`, 1.877.746.7788 | **VERIFIED** 2026-09-14, https://store-us.semi.org/products/material-market-data-subscription-mmds-1 | — | `not yet contacted` | — | Upstream materials and wafer pricing, not memory device prices. Useful for a cost-floor model only. Every `semi.org` page including robots.txt returned 403 — crawl and ToS posture unverified. | 15 business days after sending |
| SemiAnalysis | Memory | Existing relationship from compute research | — | — | `not yet contacted` | — | Memory Model: bottoms-up DRAM/NAND, HBM pricing by generation and supplier. Sold separately from the newsletter. | — |
| Objective Analysis (Jim Handy) | Memory | Site contact route / LinkedIn | **UNVERIFIED** — no email or phone published, confirmed 2026-09-14 | — | `blocked — no verified contact` | — | Low data value, **high advisory value**. The cheapest available sanity-check on index methodology, especially the HBM-mix normalization problem in the Korea customs series. | — |
| Coughlin Associates (Tom Coughlin) | Memory | Site contact route / LinkedIn | **UNVERIFIED** | — | `blocked — no verified contact` | — | As above, for NAND/SSD. | — |
| Arrow Electronics | Memory | https://developers.arrow.com/api/ | **UNVERIFIED** | — | `not yet contacted` | — | Real Pricing & Availability API, 50 req/s. Terms not retrieved. | 15 business days after sending |
| Avnet | Memory | https://apiportal.avnet.com/ | **UNVERIFIED** | — | `not yet contacted` | — | Reported mandatory monthly cache-deletion clause would be fatal to a historical archive. **Verify the clause before investing effort.** | 15 business days after sending |
| Farnell / element14 | Memory | Partner portal | **UNVERIFIED** | — | `not yet contacted` | — | Tiered pricing, stock, lead times, per-warehouse regional breakdown, XML/JSON. Terms not published on the doc page. | 15 business days after sending |
| Findchips (Supplyframe/Siemens) | Memory | Site route | **UNVERIFIED** | — | `not yet contacted` | — | Most permissive robots posture found, including `Content-Signal: ai-train=yes`. `/terms` 404s, so the contractual position is unknown. | 15 business days after sending |
| Sourceability / Sourcengine | Memory | Site route | **UNVERIFIED** | — | `not yet contacted` | — | Order API exposes inventory trends and pricing history across 3,500+ suppliers. Procurement-oriented; presumes a customer relationship. | — |
| SiliconExpert | Memory | https://www.siliconexpert.com/contact-api/ | **UNVERIFIED** — form, no email | — | `not yet contacted` | — | BOM-risk tool; memory pricing is incidental. Low priority unless a distributor licence proves unobtainable. | — |
| Mouser | Memory | — | **UNVERIFIED** — site bot-walled | — | `not pursued` | — | Reported display-only licence; site refuses unauthenticated retrieval including robots.txt. Deprioritised. | — |

## Tier 2 — photonics

| Provider | Vertical | Contact | Verification | Date contacted | Status | Response | Licensing notes | Next follow-up |
|---|---|---|---|---|---|---|---|---|
| Flexoptix GmbH | Photonics | `info@flexoptix.net`; `order@flexoptix.net` / `order@flexoptix.us`; +49 6151 62904-0 | **VERIFIED** 2026-09-14, https://www.flexoptix.net/en/legal/imprint/ | — | `not yet contacted` | — | Clean robots posture, real 1.6T/800G Ethernet **and InfiniBand** catalogue, European price point complementing FS.com. GTC body not served outside a storefront session — terms unknown. Managing directors Markus Arnold, Thomas Weible, Stephan Werner. | 10 business days after sending |
| Dell'Oro Group | Photonics | Form, https://www.delloro.com/about/contact/ | **UNVERIFIED** — zero mailto addresses, confirmed 2026-09-14 | — | `not yet contacted` | — | **Weakest website terms of any research firm here**: 2019 boilerplate, silent on scraping, redistribution and derivative works; robots.txt is allow-all. But the free surface is market sizes, not ASPs, and the subscription contract would govern actual data. | 15 business days after sending |
| 650 Group | Photonics | LinkedIn to Alan Weckel; `/contact/` is 404 | **UNVERIFIED** — aggregator-asserted address deliberately discarded | — | `blocked — no verified contact` | — | Small firm, permissive robots, plausibly the most willing in the vertical to strike a novel data partnership. | 15 business days after sending |
| ProLabs | Photonics | `sales@prolabs.com`, `salesemea@prolabs.com` | **VERIFIED** 2026-09-14, https://www.prolabs.com/contact-us | — | `not yet contacted` | — | 100BASE-FX to 800Gb, but no public prices confirmed and they sell through Anixter/Graybar, so likely quote-based. **No discoverable terms of use at all** — `/terms-of-use` 404 and no legal page in the sitemap. | 15 business days after sending |
| UN Comtrade | Photonics | https://shop.un.org/databases | **UNVERIFIED** | — | `not yet contacted` | — | A transformed derived index is a permitted re-dissemination but **still requires an active premium subscription**. Budget line, not a free source. | 15 business days after sending |
| Supplyframe Commodity IQ (Siemens) | Photonics | Enquiry form | **UNVERIFIED** | — | `not yet contacted` | — | Methodologically the closest analogue to what Urdais is building — potential partner and potential competitor. Optoelectronics is one bucket among many. Free IQ Insider newsletter is worth taking regardless. | — |
| ICCSZ / 讯石光通讯网 (讯石公司, 深圳) | Photonics | No email published; only `0755-82960080`, the 企联荟 membership line | **UNVERIFIED** — `iccsz.com` did not resolve from the research environment, so nothing on the domain was fetched, including robots.txt | — | `blocked — no verified contact` | — | **Discovery-layer ask only.** Its tender reporting is 转载 of compelled statutory disclosure by the three carriers under 《招标投标法实施条例》第五十四条; the facts belong to the buyer's notice, not to ICCSZ. The draft therefore asks only whether an automated client may read the news index to *find* awards, never for a content licence. **Two blockers before sending: read `iccsz.com/robots.txt` in a browser, and retrieve a real address from the domain.** Full assessment: `docs/research/photonics-pricing/iccsz-tender-pricing.md`. | 10 business days after sending |

---

## Deliberately not pursued

| Provider | Vertical | Reason |
|---|---|---|
| BLS PPI | Memory | Best rights profile anywhere, but the memory/microprocessor product-line index was discontinued in 2015 and no memory-specific series is published. Retain only as a macro control variable. |
| memoryindex.io, siliconanalysts.com, memorypricechart.com, capitalandcompute.net | Memory | Derivative aggregators openly built on TrendForce data plus, in one case, an Amazon affiliate retail site. Ingesting any of them would inherit an unlicensed chain — the same principle already recorded for compute, where routing a blocked provider's values through a third party is explicitly not a cure. |
| Alibaba / 1688 | Photonics | robots.txt bars search-result enumeration, which is precisely the access pattern an index needs. Listing prices are negotiable MOQ asks, not transactions. |
| Thorlabs, Edmund Optics | Photonics | Crawl-tolerant with public prices, but they sell lab and bulk optics, not datacentre transceivers. Wrong product space. |
| Coherent, Lumentum, Broadcom, NVIDIA, Cisco-Acacia, Ciena, Infinera-Nokia, Marvell, Source Photonics, POET | Photonics | No public component price disclosure. IR-side value only. |
| Ayar Labs, Celestial AI, Lightmatter, Xscape, Nubis | Photonics | Pre-revenue or design-win stage; no shipping-product price surface. Watch-list only. |
| Optical foundries (Tower, GlobalFoundries Fotonix, imec, CompoundTek, Sivers) | Photonics | MPW and NRE pricing is quote-based and under NDA. |
| OIF, Ethernet Alliance | Photonics | No prices — but genuinely useful for the **SKU taxonomy layer** (form factors, reach classes, MSA naming). Revisit for ontology, not for price. |

## Open leads that need research before they can become rows

| Lead | Vertical | What is unknown |
|---|---|---|
| ~~iccsz.com (讯石光通讯网)~~ | Photonics | **Researched. Now a Tier 2 photonics row above.** `docs/research/photonics-pricing/iccsz-tender-pricing.md`: it publishes no price index (question closed); it is a reporter, never the publisher of record; 14 carrier procurement events were inspected and **none carries an explicit optical-module unit price**, with one defensibly derivable blended value. robots.txt and terms remain **unread** — the domain did not resolve from the research environment, so nothing was fetched from it. Recommendation: discovery-and-validation only. |
| Chinese carrier e-procurement portals (`b2b.10086.cn`, `caigou.chinatelecom.com.cn`, `www.chinaunicombidding.cn`, `bulletin.cebpubservice.com`) | Photonics | Probed 2026-09-14. **None publishes a robots.txt** — the three carrier portals return an SPA shell with HTTP 200 for every path; two run commercial bot management; a China Unicom detail URL returns HTTP 412 and the national 指定媒介 bulletin returns HTTP 405 behind an Aliyun WAF. The published facts are compelled statutory disclosure, so axis 2 is defensible; **axis 1 is unknown and absence of robots.txt is not permission.** No outreach route exists — the blocker is retrieval, not rights. |
| Component broker channel (Fusion Worldwide, netCOMPONENTS, Chip1Exchange) | Memory + Photonics | Brokers hold genuine spot-market pricing. Entirely unexamined. |
| Chinese customs (GACC) direct | Photonics | Only third-party aggregators were reached. Official portal, terms and the 8-digit subheadings under 8517.62 are unassessed. |
| Taiwan MOEA Department of Statistics | Memory | Open-data endpoint and terms not located. |
| Shenzhen Huaqiangbei | Memory | World's largest physical memory spot market, unindexed. No licensable source exists today; the opportunity is original collection. |
| Innolight (300308) and Eoptolink (300502) FY2025 annual reports | Photonics | The 产能/产量/销量 tables have not been extracted first-party. Secondary-press figures are unconfirmed and the 万只/只 multiplier is unresolved. |
| Korea Customs 저작권보호정책 | Memory | The single rights question that most affects the best clean memory source. |

## Related records

- `docs/research/memory-pricing/source-shortlist.md` — memory source study, rights evidence and registry values
- `docs/research/photonics-pricing/source-shortlist.md` — photonics source study, rights evidence and registry values
- `docs/architecture/sources/memory-photonics-permission-requests.md` — the draft messages
- `docs/architecture/sources/terms-review.md` — the two-axis classification these verticals inherit
- `docs/architecture/sources/runpod-permission-denied.md` — the model for recording a refusal, and the rule that a third-party route around a refusal is not a cure
- `docs/architecture/sources/price-of-compute.md` — the one production-approved source, and what a good outcome looks like
