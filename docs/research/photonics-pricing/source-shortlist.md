# Photonics source shortlist

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. This is a source study for the photonics vertical: optical transceivers (400G/800G/1.6T), silicon photonics, co-packaged optics, lasers and optical components relevant to AI data-centre infrastructure, and high-speed interconnect. It is not a methodology, it does not create an index, and it registers nothing in the database. No collection has taken place from any source below.

It uses the registry vocabulary from `supabase/migrations/20260913060200_source_registry.sql` and `20260913070000_source_terms_review.sql`, and the two-axis discipline from `docs/architecture/sources/terms-review.md`.

**Axis 1 (`terms_review_state`)** — may Urdais retrieve this interface automatically?
**Axis 2 (`data_use_terms_state`)** — may Urdais use what it retrieves to construct, calculate, publish or maintain an index?

Where a rights answer is not determinable from public terms it is recorded as **unknown — ask in outreach**.

## Structural finding

There is **no listed futures contract and no exchange-published index on optical transceivers or photonic components**. The only listed instruments are equity wrappers. A photonics price index is a greenfield construct.

The usable public price surface has exactly three legally distinguishable legs:

1. **Distributor and e-commerce list prices** (FS.com, Flexoptix) — SKU-level, real, daily-observable, and the richest of them actively blocks automated clients.
2. **Chinese A-share issuer disclosure** — the only place absolute per-unit prices (元/只) and unit volumes appear as regulated fact. US-listed optics issuers give direction; Chinese issuers give numbers.
3. **Trade statistics** (US Census, UN Comtrade) — free or cheap and redistributable, but HS-code impure.

Everything else — LightCounting, Omdia, Cignal AI, Yole, TechInsights, Dell'Oro — is paid research whose terms explicitly prohibit the derived-index use case. Those are partnership conversations, not acquisitions.

**A finding specific to this vertical: three of the most relevant firms name Urdais's own crawler class in robots.txt.** LightCounting disallows `ClaudeBot`, `Claude-Web` and `anthropic-ai` at `/`; Omdia disallows `ClaudeBot` and `Claude-User` at `/`. That is not a reason to be evasive; it is a reason to lead outreach by acknowledging it.

---

## Tier 1 — materially improves a photonics index

### 1. Omdia — Optical Components Intelligence Service

| Field | Finding |
|---|---|
| Data possessed | Explicitly *"market sizing, forecasts, and data on volumes, pricing and revenue"* for optical components — https://omdia.tech.informa.com/advance-your-business/service-providers-and-communications/optical-components-intelligence-service. Quarterly issues (e.g. *Optical Components – 1Q25 (Share Only)*, https://omdia.tech.informa.com/om128830/optical-components--1q25-share-only). |
| Public vs gated | Paid subscription. |
| Automated retrieval (axis 1) | **not permitted by robots.txt.** Fetched 2026-09-14: https://omdia.tech.informa.com/robots.txt lists `User-agent: ClaudeBot` and `User-agent: Claude-User` — alongside GPTBot, CCBot, Bytespider, Amazonbot, Applebot, MistralAI-User, ia_archiver, PetalBot, Timpibot — under a single `Disallow: /`. Everything else gets `Allow: /`. |
| Redistribution / derived index (axis 2) | **unknown — ask in outreach.** Subscription terms not public. |
| Cadence | Quarterly. |
| Coverage | Global optical components. |
| Route | Licensing conversation only. |
| Contact | `citations@omdia.com` for research and data-citation requests, `press@omdia.com` for press, per https://omdia.tech.informa.com/contact-us; product-intelligence enquiry form at https://pages.omdia.informa.com/Product-Intelligence-Services_Contact-Us. **SEMI-VERIFIED** — attributed to Omdia's own contact page but the page returned 403 to every re-verification attempt on 2026-09-14. Load it in a browser before sending. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `sales_only`; terms_review_state `not_permitted` (robots); data_use_terms_state `under_review`; production_access_state `production_blocked`. |

**Why this ranks first in photonics.** It is the only paid product that advertises *pricing* at optical-component granularity, and it is the only research firm in this vertical that publishes a citations address — meaning it has already thought about third-party reuse and built a door for it. Best-formed ask in the vertical.

### 2. LightCounting

| Field | Finding |
|---|---|
| Data possessed | The deepest ASP dataset in the vertical. Forecast databases carry **history 2022–2025 and forecast 2026–2031 for shipments, pricing and sales of 200+ distinct products** across Ethernet, CWDM/DWDM, FTTx, wireless, cloud datacentre and AI clusters. Model refreshed every six months from module-vendor surveys. https://www.lightcounting.com/report/april-2026-market-forecast-379, https://www.lightcounting.com/faq. |
| Independent evidence of authority | Accelink's CSRC review-inquiry reply cites *"LightCounting Market Forecast Report – October 2024"* as the demand basis for its own capex model. Their numbers surface inside regulated filings. |
| Public vs gated | Paid; Corporate licence bundles reports, databases and analyst access. |
| Automated retrieval (axis 1) | **not permitted by robots.txt, and named.** Fetched 2026-09-14: https://www.lightcounting.com/robots.txt issues `Disallow: /` individually to **ClaudeBot, Claude-Web and anthropic-ai**, plus GPTBot, ChatGPT-User, CCBot, Google-Extended, Applebot-Extended, PerplexityBot, cohere-ai, Bytespider, Diffbot, DataForSeoBot, ImagesiftBot, FacebookBot, img2dataset, Timpibot, MAZBot, FriendlyCrawler, VelenPublicWebCrawler, omgili/omgilibot, and **Scrapy**. |
| Redistribution / derived index (axis 2) | **unknown — ask in outreach.** Licence terms could not be read; the server returns 403 to non-browser clients. This is a paywalled-terms situation. |
| Cadence | Semi-annual model refresh. |
| Coverage | Global, 200+ product lines. |
| Route | Licensed database, potentially a partnership. |
| Contact | **VERIFIED.** `info@lightcounting.com` is published in plain text on their own homepage — *"Reach us at info@lightcounting.com"* — confirmed by direct retrieval of https://www.lightcounting.com/ and https://www.lightcounting.com/our-team on 2026-09-14. `sales@lightcounting.com`, +1-703-997-9187 and 7726 Gunston Plaza Unit 1480, Lorton VA 22079 are attributed to https://www.lightcounting.com/contact-us but that page 403s; treat `sales@` as **semi-verified** and prefer `info@`. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `sales_only`; terms_review_state `not_permitted` (robots); data_use_terms_state `under_review`; production_access_state `production_blocked`. |

### 3. FS.com (Fiberstore)

| Field | Finding |
|---|---|
| Data possessed | The richest public price surface in the vertical, at exactly the granularity an index needs: per-SKU USD list prices for 800G and 1.6T optics, DAC/AOC/ACC/AEC and MPO. Catalogue at https://www.fs.com/c/800g-osfp-4089. Observed prices (via search index, **not** first-party retrieval): OSFP 800G 2xSR4 50m $879.00; 2xDR4 100m $1,119.00; 2xDR4 500m $1,319.00; 2xFR4 2km $1,869.00; QSFP-DD 800G 2xLR4 10km $2,499.00. Multi-region storefronts (US/EU/UK/AU/SG) give the same SKU in several currencies — a genuine cross-geography price panel. |
| Public vs gated | Prices are public, no login. |
| Automated retrieval (axis 1) | **unknown — and unknowable from outside.** `https://www.fs.com/robots.txt` returns **HTTP 202 with a zero-byte body** to WebFetch and to curl with a full browser user-agent (confirmed independently 2026-09-14). Every policy URL probed does the same: `/policies/terms_of_use-p0015.html`, `/eu-en/policies/terms_of_use.html`, `/uk/policies/terms_of_use.html`, `/sitemap.xml`. No attempt was made to defeat the bot manager. |
| Redistribution / derived index (axis 2) | **unknown — ask in outreach.** |
| Cadence | Continuous list-price updates. |
| Coverage | Global storefronts; AI-datacentre optics. |
| Route | Needs a licensed feed or written collection consent. |
| Contact | **UNVERIFIED.** No BD or data email located; the site would not serve to this study. Correct routes are the contact form at https://www.fs.com/service.html and LinkedIn BD outreach to FS (Fiberstore) partnerships. |
| Registry values if seeded | provider_kind `marketplace`; source_class `catalog_price_interface`; access_class `unknown`; both axes `under_review`; production_access_state `production_blocked`. |

**RIGHTS RISK — headline paywalled-terms case.** This is simultaneously the highest-value and the most opaque source in the study. The Terms of Use cannot be read and robots.txt cannot be read, so **no rights determination is possible and none should be inferred.** Do not build on unconsented collection here.

### 4. Chinese A-share optical-module issuers (no permission ask required)

CSRC disclosure rules force issuers to publish product-level revenue, volume and unit-price tables. This is the only place absolute per-unit optical-module prices appear as regulated public fact.

| Issuer | Finding |
|---|---|
| **Accelink / 光迅科技 (SZ 002281)** | The 131-page CSRC review-inquiry reply (http://file.finance.sina.com.cn/211.154.219.97:9494/MRGG/CNSESZ_STOCK/2026/2026-02-14/11967952.PDF) carries at p.32 a table headed 「单位：万元，万只，元/只 … 收入 / 数量 / 单价」 split into 传输类 (transport) and 数据与接入类 (datacom & access) for FY2022–FY2024 and 9M2025. **Critical caveat: the 数量 and 单价 cells are redacted as `**` in the public version** under the commercial-secret exemption. Revenue is disclosed in full. The narrative text nonetheless publishes ASP deltas in plain language — *"2024年度…数据与接入类…产品均价提升20.10%"* — which is a citable public year-over-year datacom ASP change. |
| **Innolight / 中际旭创 (SZ 300308)**, **Eoptolink / 新易盛 (SZ 300502)** | Annual reports carry the mandatory 产能/产量/销量 table; combined with segment revenue this yields a derived blended ASP series. **Not yet extracted first-party.** FY2025 figures circulating in secondary press (capacity 1,747 / production 1,634 / sales 1,603, https://news.qq.com/rain/a/20260330A08R6500) are unconfirmed and the unit multiplier (万只 vs 只) is unresolved. **This must be verified from the filing before it goes anywhere near an index.** |
| Access route | **cninfo.com.cn geo-blocks US IPs** (403 on robots.txt and on PDF paths); szse.cn resets the connection. Working mirrors from a US IP are `file.finance.sina.com.cn` and `notice.10jqka.com.cn`, both of which served full PDFs. The mirrors' own terms were **not assessed**. |
| Rights | Regulated public disclosure; the figures are facts. Redistribution of derived statistics is the normal defensible use. |

### 5. US Census International Trade API (no permission ask required)

| Field | Finding |
|---|---|
| Data possessed | Monthly US imports and exports by HS at **10-digit**, with value and quantity, by country and district — so unit values are derivable. https://www.census.gov/data/developers/data-sets/international-trade.html; endpoint family `api.census.gov/data/timeseries/intltrade/imports/hs`. |
| Public vs gated | Free. A key is required (free, https://www.census.gov/data/developers/); a keyless probe returned empty. |
| Automated retrieval (axis 1) | **permitted.** Terms fetched in full at https://www.census.gov/data/developers/about/terms-of-service.html: *"You may use the Census Bureau API to develop a service … to search, display, analyze, retrieve, view and otherwise 'get' information from Census Bureau data."* robots.txt fetched: only `/search-results.html`, `/cgi-bin/`, `/libs/`, `/tmp/`, `/etc/` disallowed; no AI-crawler bar. |
| Redistribution / derived index (axis 2) | **permitted.** No commercial-use bar, no redistribution bar, no derived-works bar. |
| Attribution | Mandatory: *"This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau."* Plus no modifying or falsely representing content while still citing Census. |
| Cadence | Monthly; 2013–present via API. |
| Coverage | US trade only. |
| Contact | **VERIFIED.** `eid.international.trade.data@census.gov`, Economic Indicators Division, International Trade — published in Census's own FT900 release (https://www.census.gov/foreign-trade/Press-Release/current_press_release/ft900.pdf), phone 1-800-549-0595 option 4. |
| Registry values if seeded | provider_kind `other`; source_class `price_surface`; access_class `api_key`; **terms_review_state `permitted`, data_use_terms_state `permitted`**; production_access_state `research_usable` until an interface is actually built. |

**The cleanest rights profile of anything in either vertical.** Same HS-impurity caveat as Comtrade below: even 10-digit lines are not pure transceiver lines.

---

## Tier 2 — useful supplemental

### 6. UN Comtrade

Tested live with no key: `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=156&period=2024&partnerCode=0&cmdCode=851762&flowCode=X` returned China FY2024 exports of HS 851762 = fobvalue US$39,400,339,673 on qty 2,049,126,364 units, an implied unit value of ≈ $19.2.

**Honest caveat:** HS 851762 is "machines for the reception, conversion and transmission of voice/images/data" and sweeps in routers, switches and base stations. At HS6 the unit value is *not* a transceiver price. Directional cross-check only.

Rights, fetched at https://uncomtrade.org/docs/faqs-on-use-and-re-dissemination/: re-dissemination "as is (without any transformation)" requires an active Premium Pro subscription; data "transformed or substantially different from the original" can be re-disseminated without the re-dissemination fee **but still requires an active premium subscription**; re-disseminating more than 100,000 original records to non-subscribers triggers a further licence-to-distribute fee. A derived index is transformed, so the pathway is clean — but it is a **budget line, not a free source**. Subscription desk via https://shop.un.org/databases — **UNVERIFIED**.

### 7. Cignal AI

Quarterly Optical Components report: revenue-based share across Datacom/Telecom/Industrial/Consumer, detailed unit shipments, 400/800/1.6TbE datacom transceivers, 400ZR/800ZR coherent, five-year forecasts, continuously updated (https://cignal.ai/optco/).

robots.txt fetched 2026-09-14: blocks ClaudeBot/GPTBot/CCBot/PerplexityBot from `/wp-content/uploads/` only; `User-agent: *  Disallow:` otherwise. Notably **not** a site-wide AI bar.

**RIGHTS RISK — severe, with a named escape hatch.** From https://cignal.ai/subscription-agreement/, verbatim: *"the Site and the Services are provided only for your internal use and that you will not use, share, provide, assign or otherwise make available any information that is provided by Cignal … with or without remuneration, to any third party, without the express written consent of Cignal."* And: *"you agree not to sell, license, rent, modify, distribute, copy, reproduce, transmit, publicly display, publicly perform, publish, adapt, edit, compile or create derivative works from any such data, information, reports, content or other materials."* An index is squarely a derivative work. **However** the agreement names a **Cignal Citation Policy** governing approved reproduction with attribution, and contemplates written consent. That makes it a partnership conversation.

Contact: **UNVERIFIED — no published email.** Confirmed independently on 2026-09-14 that https://cignal.ai/contact/ carries a form only, with no mailto anywhere on `/contact/`, `/purchase/` or `/about/`. Correct route is the form. LinkedIn to founder/lead analyst Andrew Schmitt is the alternate, also **UNVERIFIED**.

### 8. Flexoptix (Darmstadt)

Deep AI-datacentre catalogue: OSFP224, QSFP-DD800, QSFP112/OSFP112, 1.6T/800G/400G Ethernet **and InfiniBand**, LPO, AOC/DAC/ACC/AEC, plus an NVIDIA compatibility matrix (https://www.flexoptix.net/en/).

robots.txt fetched, permissive: `Disallow: /index.php/`, `/*?`, `/checkout/`, `/app/`, `/lib/`, `/*.php$`, `/pkginfo/`, `/report/`, `/var/`, `/catalog/`, `/customer/`, `/sendfriend/`, `/review/`, `/*SID=`. No AI-crawler bar; clean product URLs are not disallowed (the `/catalog/` bar is the Magento internal path). Sitemaps published.

**RIGHTS RISK:** the shop is commercial-customers-and-government-only and prices sit behind account context; the GTC page (https://www.flexoptix.net/en/legal/gtc/) served only shop chrome. **The substantive GTC is effectively behind the storefront: unknown — ask in outreach.**

Contact **VERIFIED** by direct retrieval of the Impressum (https://www.flexoptix.net/en/legal/imprint/) on 2026-09-14: `info@flexoptix.net`, `order@flexoptix.net`, `order@flexoptix.us`, `datenschutz@flexoptix.net`, tel +49 6151 62904-0 / +1 (415) 688-8500. Managing directors named: Markus Arnold, Thomas Weible, Stephan Werner. Flexoptix GmbH, Mühltalstr. 153, 64297 Darmstadt, HRB 97014.

### 9. TechInsights — cost side, not price side

Teardown BOM delivered as Excel with Summary / Cost of Goods Sold / Major ICs / Discretes / Non-electronics tabs. Optical-transceiver coverage confirmed to exist: https://www.techinsights.com/products/bom-1912-817 (Huawei OSG040001 Optical Transceiver Unit BOM). Searchable BOM database at https://www.techinsights.com/technology/bom-database.

robots.txt fetched: stock Drupal (admin/search/user paths only), **no AI-crawler bar**. Subscription terms not public — **unknown — ask in outreach.**

Value: gives the **cost floor** under an ASP index, and the spread between BOM cost and FS.com list is itself an indexable quantity. But it is per-device and episodic, not a time series.

Contact **UNVERIFIED**: forms only (`/contact-us/sales-inquiry`, `/contact-us/customer-success`, `/contact-us/media-request`), phone 1-877-826-4447, confirmed 2026-09-14.

### 10. Yole Group

Market, technology, reverse-engineering and **costing** analyses; Silicon Photonics report line (https://www.yolegroup.com/product/report/silicon-photonics-2024/). Licences for Reports, Monitors and Teardown Tracks give portal access plus PDF and Excel downloads.

**Bot-blocked:** `https://www.yolegroup.com/robots.txt` and `/contact/` both return HTTP 202 with zero bytes; `/terms-and-conditions/` returned 403 (confirmed independently 2026-09-14). **Paywalled-terms situation — licence scope, redistribution and citation rules unknown.**

Contact **semi-verified**: `support@yolegroup.com` (general, per https://www.yolegroup.com/faq/) and `sandrine.leroy@yole.fr` (PR Director — the published route for *"presentations and press announcements using data from Yole Group's products"*, the closest analogue to a citation permission). Note the mixed domain (`yolegroup.com` vs `yole.fr`); confirm in a browser.

### 11. Dell'Oro Group — permissive robots, weakest terms, no public ASP

robots.txt fetched: `User-agent: *  Disallow:` — allow-all, with sitemap. **No AI bar whatsoever, the most permissive research firm in this study.**

Terms fetched in full at https://www.delloro.com/terms-of-use/, last updated 10 April 2019. Boilerplate. **No anti-scraping clause, no data-mining clause, no redistribution clause, no derivative-works clause.** The only IP language is generic: *"The Service and its original content, features and functionality are and will remain the exclusive property of Dell'Oro Group Inc and its licensors."*

Relevant programmes exist — Optical Transport; Data Center Interconnect with IPoDWDM & WDM Systems; Data Center IT Semiconductors & Components; Ethernet Adapter & Smart NIC (confirmed on their nav 2026-09-14) — but the **free surface is press releases with market sizes, not ASPs**. The subscription contract, not the website ToU, is what would govern actual data.

Contact **UNVERIFIED**: https://www.delloro.com/about/contact/ is a form; zero mailto addresses extracted on direct retrieval. Published commercial routes are "Request a Quote" and "Custom Research and Consulting".

### 12. 650 Group

robots.txt fetched: blocks only `/wp-admin/`, no AI bar. Covers optics and data-centre networking. Small firm, Incline Village NV; founders Alan Weckel and Chris DePuy (https://650group.com/about-us/).

Contact **UNVERIFIED**: `/contact/` is 404 and no mailto addresses appear on `/about-us/` or the homepage (confirmed 2026-09-14). Third-party aggregators assert an address; it is **not published on their own domain and is not used here**. Correct route is LinkedIn BD to Alan Weckel. Small firms like this are often the most willing to strike a novel data partnership.

### 13. ProLabs

robots.txt fetched, permissive for products: disallows cart/checkout/account/forum/compare and `/search?`; product pages allowed, sitemap published. Catalogue spans 100BASE-FX through 800Gb (https://www.prolabs.com/products/optical-transceivers/), but **no public prices were confirmed without login** and they sell largely through Anixter/Graybar, so pricing is likely quote-based. Modest index value.

**RIGHTS RISK: no discoverable terms of use at all.** `/terms-of-use` is 404 and the sitemap contains no legal page.

Contact **VERIFIED** by direct retrieval of https://www.prolabs.com/contact-us on 2026-09-14: `sales@prolabs.com`, `salesemea@prolabs.com`, `support@prolabs.com`.

### 14. Supplyframe Commodity IQ (Siemens)

Pricing situation, lead-time analysis, supply/demand forecasts and comparative cost analysis across electronic-component commodity categories, off a network of 15M professionals and 500 industry partners; plus a Design & Demand Index from behavioural signals (https://supplyframe.com/commodity-iq). Free weekly "IQ Insider" newsletter at https://intelligence.supplyframe.com/iq-insider/.

Optoelectronics is one commodity bucket among many, so the fit is adjacent rather than specialist. Methodologically this is the closest analogue to what Urdais is building, which cuts both ways. Rights and API terms **unknown — ask in outreach**. Contact **UNVERIFIED**, enquiry form only. The free newsletter is a zero-cost subscription worth taking regardless.

---

## Tier 3 — speculative, or evaluated and rejected

### 15. Digi-Key — rights-blocked, do not build on this

Superficially perfect: free APIs with real-time price and availability. robots.txt is unusually welcoming, granting explicit `Allow: /` to ClaudeBot, GPTBot, ChatGPT-User, OAI-SearchBot, Google-Extended, Gemini-Deep-Research and PerplexityBot. The contract then kills it — see the memory shortlist §6 for the verbatim four-clause bar from https://developer.digikey.com/api-user-agreement. `orders@digikey.com` / 1-800-344-4539 is published (VERIFIED) but is a support line, not BD.

### 16. Bot-walled, unassessable

**Mouser** (`robots.txt` → Akamai "Access Denied"), **Optcore** (`robots.txt` → Cloudflare 403), **Marvell** (`robots.txt` → Akamai 403). Rights unknown; deprioritise.

### 17. Thorlabs / Edmund Optics — wrong product space

Both publish public catalogue prices and both are crawl-tolerant. **Thorlabs** robots.txt (updated 2026-06-11): long named-bot blocklist, `Crawl-delay: 30`, disallows `/search`, `/thorcat/`, `/content/`, `/static/` and CAD/binary extensions; **no AI-crawler bar**. **Edmund Optics** robots.txt: blocks account/cart/search/quote/modal paths and Solr endpoints; product pages allowed, no AI bar — but note `/Catalog/PartNumber/_VolumePricingWindow?partNumberId=*` is specifically disallowed, i.e. volume pricing is off-limits to crawlers.

They sell lab and bulk optics — lenses, mounts, filters — not 400G/800G/1.6T datacentre transceivers. Tier 3 on relevance, not on rights.

### 18. Alibaba / 1688 listings

`https://www.alibaba.com/robots.txt` allows `/product-detail/` and `/showroom/` while disallowing `/products/`, `/trade/`, `/buy/`, `/searchweb/*.html`, `/detail/ajax/`. So individual product pages are crawlable but **search-result enumeration is barred** — precisely the access pattern an index needs. Listing prices are negotiable MOQ-tiered asks, not transactions, and listing quality is poor. Weak signal, awkward rights. Alibaba's ToS was **not fetched**.

### 19. Vendors and industry bodies with no price data (assessed, negative)

- **Coherent**, **Lumentum**, **Source Photonics**, **POET Technologies** — robots.txt fetched for each, all broadly permissive (Source Photonics uses the Cloudflare Content-Signal framework, worth a closer read). **None publishes list prices.** Value is IR-side only.
- **Broadcom / NVIDIA / Cisco-Acacia / Ciena / Infinera-Nokia** — no public component price disclosure. NVIDIA's Quantum-X / Spectrum-X photonics pricing is bundled into system quotes.
- **Ayar Labs / Celestial AI / Lightmatter / Xscape / Nubis** — pre-revenue or design-win stage, no shipping-product price surface. Watch-list only.
- **AAOI** — the FY2018 10-K was fetched in full (https://www.sec.gov/Archives/edgar/data/1158114/000155837019001078/aaoi-20181231x10k.htm) and grepped: ASP appears **only as qualitative narrative** (*"a reduction in average selling prices for certain products as a result of price negotiations with our customers"*, *"accelerated erosion of average selling prices"*). No numeric ASP, no unit volumes. This is the general pattern for US-listed optics.
- **OIF** and **Ethernet Alliance** — both fully crawlable, both publish specifications and interop results, never prices. Genuinely useful for the **taxonomy layer** of an index (form factors, reach classes, MSA naming), since an index needs a stable SKU ontology. Not a price source.
- **AIM Photonics** — robots.txt is Squarespace's default AI blocklist, naming `anthropic-ai` and `ClaudeBot`. No price data anyway.

### 20. iccsz.com (讯石光通讯网) — highest-value unexplored lead

Chinese optical-communications industry portal that publishes **China Telecom and China Mobile tender results with unit counts and winning bidders** (e.g. https://www.iccsz.com/4g/news.Asp?ID=f3fd87a920894937b5aefece6b371dad — China Telecom 2025 three-province procurement, 165,000 optical modules, four winning candidates). Carrier tender awards are among the few genuinely public sources of near-transaction pricing in this industry.

**Not assessed:** robots.txt not fetched, terms not read, and it is unconfirmed whether any price index is published. Flagged as the most promising unexplored lead in this vertical.

**Now assessed — see `iccsz-tender-pricing.md` in this directory.** Summary of what changed: ICCSZ publishes **no** price index (question closed); it is a reporter, never the publisher of record, since carrier awards are compelled statutory disclosure by the buyer under 《招标投标法实施条例》第五十四条; robots.txt and terms are **still unread** because `iccsz.com` did not resolve from the research environment, so nothing was fetched from the domain and both axes stay `not_reviewed`. Fourteen procurement events were traced: **zero carry an explicit optical-module unit price**, one carries a defensibly derivable blended value (China Telecom Guangdong 2026–27, 164,098 只 at 77.64 元/只 不含税), and the channel carries **no 800G, no 1.6T and no ZR coherent optics at all** — those go to hyperscalers by private direct purchase. Recommendation: **discovery-and-validation only**, not an index constituent.

### 21. Foundries — no price surface

Tower Semiconductor, GlobalFoundries (Fotonix), imec, CompoundTek, Sivers: MPW shuttle and NRE pricing is quote-based and under NDA. No public wafer-price data.

---

## Source-rights risk register (photonics)

| Category | Finding |
|---|---|
| **Named bars on Urdais's own crawler class, verified in robots.txt** | **LightCounting** — `Disallow: /` to ClaudeBot, Claude-Web and anthropic-ai, plus Scrapy. **Omdia** — `Disallow: /` to ClaudeBot and Claude-User. **AIM Photonics** — Squarespace default AI blocklist. **Cignal AI** — partial only, `/wp-content/uploads/`. |
| **Contract clauses that bar a derived index outright** | **Digi-Key** — no derivative works, no bulk download, no undifferentiated aggregation, nothing competitive to their services. **Cignal AI** — internal use only, no derivative works, nothing provided to third parties without express written consent. **UN Comtrade** — a transformed index still requires an active premium subscription. |
| **Paywalled / unreadable terms — no determination possible from outside** | **FS.com** (HTTP 202 zero-byte to every policy URL and to robots.txt), **Yole Group** (202/403), **LightCounting** (403), **Mouser**, **Optcore**, **Marvell** (bot-walled), **Flexoptix GTC** (body not served outside a storefront session), **Digi-Key** supplementary terms pages (SAML redirect). |
| **No terms at all** | **ProLabs** — `/terms-of-use` 404 and no legal page in the sitemap. Absence of terms is its own risk, not a permission. |
| **Geo-blocks** | **cninfo.com.cn** and **szse.cn** refuse US IPs. Chinese filings must come via `file.finance.sina.com.cn` / `notice.10jqka.com.cn`, whose own terms were not assessed. |
| **Clean, no material rights risk found** | **US Census API** (attribution notice mandatory), **Dell'Oro website ToU** (2019 boilerplate, silent on scraping and derivatives), **650 Group**, **TechInsights**, **ProLabs**, **Flexoptix**, **Thorlabs**, **Edmund Optics**, **OIF**, **Ethernet Alliance**, **Coherent**, **Lumentum**, **POET** — all robots-permissive with no AI bar. |

---

## Registry note

Same position as the memory shortlist: `reference.providers` and `reference.source_interfaces` are the right home, and **this slice writes no migration**, because nothing here is collected from yet. The `Registry values if seeded` lines record the intended vocabulary.

US Census is the one interface in either vertical that would enter the registry with both axes already `permitted` on published terms, and it should carry the mandatory attribution string in its `notes` when it does.
