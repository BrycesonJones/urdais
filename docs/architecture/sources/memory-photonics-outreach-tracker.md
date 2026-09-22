# Memory and Photonics Outreach Tracker

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Opened 14 September 2026. This is the operational record of outbound data-acquisition contact for the memory and photonics verticals: who was approached, when, through what channel, what came back, and when to follow up.

**Corrected 22 September 2026 by UMPI Phase 2B.** This document said five requests had been sent and that no response was recorded for any of them. That was true of the repository and false of the world. A search of the sending account (`bryceson.jones17@gmail.com`) found that **TrendForce replied within 18 hours**, that the **Silicon Data message bounced and was never delivered**, that **Omdia and LightCounting both replied**, and that **no WSTS message exists in that mailbox at all**. Send dates and times are now recorded where the mailbox carries them. The superseded rows are preserved in [Superseded records](#superseded-records) rather than deleted, because what the repository believed is itself part of the record.

**Four requests were delivered:** TrendForce / DRAMeXchange, Omdia, LightCounting, and — for photonics only — the follow-ups within those threads. **One bounced:** Silicon Data. **One is unverified:** WSTS. Remaining drafts live in `memory-photonics-permission-requests.md`; sending them remains a separate, human-approved step.

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
| `sent — awaiting response` | Message sent; no response recorded. Record the exact date and channel when evidence is available, otherwise say that they are not recorded. |
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
| WSTS Inc. | Memory | `tp@wsts.org` (Tobias Proettel, Administrator; remit includes distribution licenses), cc `sh@wsts.org` | **VERIFIED** 2026-09-14, https://www.wsts.org/65/CONTACT | **Unverified — no message found** | **`send unverified`** | None. **No WSTS message exists in the searched mailbox, sent or received.** Either it was never sent or it went from an account not searched | Reproduction without written permission is barred outright; a **distribution licence** regime exists and is the named door, held by regional semiconductor associations. Not a source for any of the six UMPI V1 instruments — validation or weighting input at most | **Not on the V1 critical path.** Do not let this block UMPI. Confirm whether it was ever sent before re-sending |
| TrendForce Corp. / DRAMeXchange | Memory | `SR_MI@trendforce.com` (Semiconductor Research), cc `mi@dramexchange.com`; **replied from** `yhlin@trendforce.com` (Deric Lin, Sales Division) | **VERIFIED** 2026-09-14, https://www.trendforce.com/contact/reporting and dramexchange.com homepage mailto | **2026-09-14 17:59:58 UTC** | **`partially granted — commercial use refused, one licence route named`** | **Replied 2026-09-15 08:08:56 UTC.** "We only provide Excel files, and no other APIs are currently available." "We do not permit the commercial use of our data. However, if the data is to be published only after a complete re-analysis, we can open a separate discussion regarding the license." Named Memory Platinum, HBM, Server DRAM and Mobile packages. Did not answer storage, post-termination retention, §5.h, attribution or automation. **Urdais closed the thread 2026-09-15 on budget grounds; TrendForce invited a future approach 2026-09-17. This is not a refusal.** | Verbatim reply, clause analysis and rights matrix in `trendforce-licensing-response.md`. The reply is sales guidance, not a licence: no registry state changes. UMPI V1 publishes the source close unchanged, which is outside the "complete re-analysis" opening — see `docs/research/memory-pricing/umpi-phase-2b-licensing-closure.md` | **Re-open with the narrow six-line scope in request 10.** Draft ready, unsent, awaiting approval |
| Silicon Data | Memory | `support@silicondata.com` — **address does not accept mail**; Data Partnerships route, https://www.silicondata.com/data-partnerships | Address was VERIFIED on the contact page 2026-09-14, but **is a Google Group that rejects posts** | Attempted **2026-09-14 18:00:07 UTC** | **`not delivered — bounced`** | **Never reached the company.** Bounce at 18:00:09 UTC, two seconds after sending: "the group you tried to contact (support) may not exist, or you may not have permission to post messages to the group" | Coverage is still GDDR6 only, which does not intersect any of the six canonical UMPI instruments. Per the Phase 2B brief, no further effort here unless coverage changes | **None for UMPI V1.** If pursued later, use the Data Partnerships route and re-verify the address first |
| Korea Customs Service | Memory | Portal inquiry function at https://tradedata.go.kr/cts/index.do; tel 1544-1285 / 125 | **UNVERIFIED** — no published English BD or data address | — | `blocked — no verified contact` | — | Public data; no permission ask is needed to begin. The open question is the 저작권보호정책 copyright policy, which was not read. Derivation work can start in parallel. | On the copyright-policy read, not on a reply |
| Micron / SK hynix / Samsung / Nanya / Kioxia-Sandisk | Memory | n/a | n/a | — | `not pursued` | — | **No outreach required.** Public securities disclosure; lawful to cite. Anchors and validates a level, cannot set one. | — |

## Superseded records

Preserved rather than deleted, per the rule that a corrected record should show what it corrected. Each of these was the tracker's state until 22 September 2026.

| Provider | Superseded state | Why it was wrong |
|---|---|---|
| TrendForce / DRAMeXchange | `sent — awaiting response`, "No response recorded", send date `not recorded` | A reply had been received on 15 September 2026 and the thread had been closed by Urdais on 15 September. None of it was in the repository |
| Silicon Data | `sent — awaiting response`, "No response recorded" | The message bounced two seconds after sending and was never delivered. "Awaiting response" described a message nobody had received |
| WSTS | `sent — awaiting response`, "No response recorded" | No evidence of the send exists in the searched mailbox. The status asserted an action that cannot be confirmed |
| Omdia | `sent — awaiting response`, "No response recorded" | Replied 15 September 2026; referred to the commercial team; a call is scheduled. Photonics, not memory |
| LightCounting | `sent — awaiting response`, "No response recorded" | Replied 15 September 2026 asking what benefit Urdais offers them; Urdais answered the same day. Photonics, not memory |

**The lesson is procedural, not clerical.** A tracker that records sends but is never reconciled against the mailbox will drift in exactly one direction: it will make the vendor look silent when the vendor has answered. Reconcile this document against the sending account whenever a phase depends on what a vendor said.

## Tier 1 — photonics

| Provider | Vertical | Contact | Verification | Date contacted | Status | Response | Licensing notes | Next follow-up |
|---|---|---|---|---|---|---|---|---|
| Omdia (Informa) | Photonics | `citations@omdia.com`, https://omdia.tech.informa.com/contact-us | **VERIFIED manually before sending** — exact verification date not recorded; the page 403s to direct retrieval | **2026-09-14 18:00:28 UTC** | **`acknowledged — commercial team engaged`** | **Replied 2026-09-15.** Enquiry referred to the commercial team; a scoping call is scheduled. Photonics, not memory; does not affect UMPI | Optical Components Intelligence Service explicitly advertises pricing data. robots.txt names ClaudeBot and Claude-User under `Disallow: /`; the sent request acknowledges this. A published citations address means they have already thought about third-party reuse. Sending the request grants no rights. | Confirm send date; follow up 10 business days after sending |
| LightCounting | Photonics | `info@lightcounting.com`; `sales@lightcounting.com` semi-verified | **VERIFIED** 2026-09-14 for `info@` — published in plain text on https://www.lightcounting.com/ | **2026-09-14 18:00:16 UTC** | **`acknowledged — qualifying Urdais`** | **Replied 2026-09-15** (`george@lightcounting.com`), asking what benefit the Urdais platform offers them; Urdais answered the same day. No rights discussed. Photonics, not memory | 200+ products × price × shipments, history 2022–2025 and forecast 2026–2031, semi-annual refresh. robots.txt names ClaudeBot, Claude-Web and anthropic-ai at `Disallow: /` and blocks Scrapy; licence terms unreadable (403). The sent request names the robots bar. Sending the request grants no rights. | Confirm send date; follow up 10 business days after sending |
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
