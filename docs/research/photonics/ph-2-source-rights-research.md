# PH-2A — Photonics source and rights feasibility, 23 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It designs no UI, writes no ingestion, selects no vendor, and establishes no legal right.

**PH-1 stands.** This pass does not reopen the settled findings: rate alone is not a comparable product; daily and weekly optics prices are not defensible and will not be interpolated; client optics and coherent DCI are different markets; ontology and economic observations stay separate. Nothing below is a choice of UPPI methodology.

**Research date.** Sources were inspected on 23 September 2026. The SKU notes are a feasibility pilot, not a price index and not a time series.

**Evidence classes used below.**

- **VERIFIED FACT** — quoted from a primary page or PDF read in this pass.
- **RETRIEVED CLAIM** — primary page whose wording came through a saved extraction that was not a clean full fetch, or a page that rendered incompletely.
- **INFERENCE** — a reading of how sources interact. Never a right and never a price.
- **UNKNOWN** — not documented. Requires written confirmation before anyone treats it as permitted.

---

## 1. Executive Summary

Urdais can define the products from open specifications. Urdais cannot, on the documents read today, publish a transceiver price from any source that actually has one.

| Path | Can observations be obtained? | Grain actually seen | Frequency | History | Publish a derived value? | What it would cost |
| --- | --- | --- | --- | --- | --- | --- |
| A. Merchant / catalog prices | Yes, for some specification cells, as a channel offer | PMD, reach, form factor, and sometimes LPO are on the listing. Retimed is often unlabeled. Ethernet vs InfiniBand is sometimes labeled | Whenever the page changes. Not a close | No legitimate backfill found for 12, 24, or 36 months | **No**, for the catalogs whose terms were read (FS, DigiKey). Other sellers: **UNKNOWN** until their terms are read | Access is free. A republication licence is **NOT PUBLICLY DISCLOSED** and is a separate contract |
| B. Licensed professional ASP | Yes, inside a subscription, where the publisher says the field exists | LightCounting: rate × reach × form factor, and retimed / LPO / LRO / CPO / NPO. Omdia: ASP is described; current datacom grain is **UNKNOWN**. Cignal: units and revenue; an ASP field is **not documented** | Quarterly (Cignal, Dell’Oro). LightCounting priced books are on a semiannual report cycle | LightCounting priced database: 2022–2025. Cignal units: from 2019. Dell’Oro optical-transport program: from 1998, which is not an 800G DR8 history | **Not granted** by any public licence read here. Cignal expressly forbids derivative works. LightCounting forbids redistribution without permission | Report stickers where shown: LightCounting **$5,995** per report. Omdia, Cignal, Dell’Oro subscription prices: **NOT PUBLICLY DISCLOSED**. A derived-index licence is a second, undisclosed cost |
| C. Public prices + licensed weights | The two pieces exist in the world. They are not offered as a package | Weights, where documented, sit at the analyst’s category, which can be finer than rate | Same as the weight file | Same as the weight file | Using the weights in a published index is a derivative use. **UNKNOWN** and not granted | Would still require the weight licence. It does not avoid one |
| D. Coherent DCI | Dell’Oro documents ASP for ZR/ZR+ inside optical transport. That is the right market and the wrong file for client DR8 | Speed, up to 1.6 Tbps, for plugs and wavelengths. ZR vs ZR+ split inside the ASP: **UNKNOWN** | Quarterly | Program history from 1998. ZR itself is only as old as ZR | Report-data publication rights: **UNKNOWN**. The website terms do not decide them | **NOT PUBLICLY DISCLOSED** |
| E. Public context series | Yes | Industry PPI; residual customs basket | Monthly | Long | Yes, **as themselves**, with attribution. Not as UPPI | Free |

**What PH-3 is allowed to assume.**

- A specification ontology can be built from IEEE, OIF, QSFP-DD, and OSFP documents without buying a price feed. OIF’s 800ZR notice expressly allows explanatory derivative works if the copyright notice is kept and the agreement text is not modified **[VERIFIED FACT]**. QSFP-DD Rev 7.1 authorizes download, reproduction, and distribution of that document and grants no patent licence **[VERIFIED FACT]**.
- The only recurring professional **price** field documented at specification grain is LightCounting’s “pricing,” bundled with shipments and sales, under a redistribution ban **[VERIFIED FACT]**.
- A merchant panel is technically plausible and legally blocked at the two large catalogs whose terms were read. FS forbids scrapers and forbids reproducing the site or making derivatives without written consent **[VERIFIED FACT, terms last updated 9 December 2022]**. DigiKey forbids robots and forbids publishing the content; copies are limited to internal or personal non-commercial use **[VERIFIED FACT]**.
- No source documents a right to show original values, percentage changes, a normalized index, an API, or post-termination retention. Those twelve rights are **UNKNOWN** unless a sentence below quotes a prohibition. A prohibition is not a menu of the things that are allowed. It is a ban.

**Ruled out, again, as collection plans:** rate-only averages, customs unit values labeled as transceiver prices, the communications-equipment PPI labeled as UPPI, scraping against the terms above, republishing analyst ASP without permission, forecasts as observations, daily interpolation, and an ASP built by dividing revenue and units that do not share a denominator.

---

## 2. Merchant Source Census

Prices below are channel offers seen on 23 September 2026. They are not hyperscaler contract prices and not ASPs. They are recorded so PH-3 can see whether a number is on the page. They are not a basket.

### 2.1 FS.com

| Field | Finding |
| --- | --- |
| URL | https://www.fs.com/policies/terms_of_use-p0015.html |
| Operator | FS.com, Inc. and affiliates. Legal notices: 380 Centerpoint Blvd, New Castle, DE 19720 |
| Market | Global site; UK and AU storefronts also observed |
| What it sells | Own-brand and coded-compatible optics, including 800G DR8, 800G LPO, and 1.6T 2×DR4/DR8. OEM (Cisco/NVIDIA factory) modules are not what the FS listings are |
| Terms date | Last updated **9 December 2022** **[VERIFIED FACT]** |
| Licence | Personal, non-transferable, non-exclusive, revocable licence to access the site to use or purchase. All other rights reserved |
| Automation | “You may not use any data mining, scraper, spider robots, or similar data gathering or extraction methods to access, monitor, or copy any content” **[VERIFIED FACT]** |
| Derivatives / redistribution | No resale or distribution of the site or services, and no use, reproduction, public display, distribution, or derivatives, without express written consent **[VERIFIED FACT]** |
| Prices | “Published prices may be changed without notice.” Billed at acceptance or shipment. Published prices exclude taxes, duties, insurance, and shipping **[VERIFIED FACT]** |
| API | None found |
| History | No historical price book found. The terms describe a live price, not an archive |
| Rights class | **UNSUITABLE_WITHOUT_PERMISSION** for storage as a series, publication, or a derived index |

A product page on the AU store, retrieved rather than fully re-fetched, showed a customized 1.6T OSFP224 RHS/flat-top 2×DR4/DR8, 1310 nm, 500 m, dual MPO-12/APC, at **AUD 2,866.60**, with “16 Sold” **[RETRIEVED CLAIM, https://www.fs.com/au/products/332933.html]**. The UK category extraction showed 800G DR8 offers in GBP excluding VAT (about £970 to £1,519 depending on coding and form factor) **[RETRIEVED CLAIM]**. Those figures are not repeated as a panel. FS’s own terms forbid copying them into a product.

### 2.2 DigiKey

| Field | Finding |
| --- | --- |
| Terms | https://www.digikey.com.au/en/terms-and-conditions (AU mirror of the DigiKey terms read in full) |
| Market | United States catalog distributor, Thief River Falls, MN |
| API | Product Information API v4 exists: https://developer.digikey.com/products/product-information-v4/productsearch. Keyword search does not return MyPricing. Product details can return MyPricing when the caller is authenticated **[VERIFIED FACT, developer portal]** |
| Automation | “You may not use any robot, scraper, spider, or other automated means to access or gather the Content from the Site” **[VERIFIED FACT]** |
| What a visitor may do with content | Download, print, and store portions for **internal business purposes or personal non-commercial use**. “You may not copy or post the Content on any network computer or transmit, distribute, publish, display, or broadcast the Content in any media.” No modification **[VERIFIED FACT]** |
| robots.txt | Allows some named AI crawlers and disallows account areas. A robots allow-line is not a licence. The terms govern **[VERIFIED FACT, https://www.digikey.com/robots.txt]** |
| Developer-agreement grant to republish API prices | **UNKNOWN**. The site terms already prohibit publishing Content. No separate API republication schedule was read |
| High-speed optics actually priced in this pass | A 400G/800G DigiKey product page was **not** opened. Do not treat the API’s existence as evidence that 800G DR8 is stocked |
| Rights class | **UNSUITABLE_WITHOUT_PERMISSION** |

### 2.3 CDW — Cisco OEM

| Field | Finding |
| --- | --- |
| Page read | https://www.cdw.com/product/cisco-osfp-transceiver-module-800-gigabit-ethernet/8548849 |
| Market | United States reseller |
| SKU | Cisco OSFP-800G-DR8= |
| Specification on the page | 800 Gigabit Ethernet, 800GBase-DR8, 2× MPO-12, 1310 nm, up to 500 m **[VERIFIED FACT]** |
| Price on the direct fetch | List **$10,791.78**. Advertised **$7,464.99**. “Sign in for your price” **[VERIFIED FACT]** |
| OEM vs compatible | OEM Cisco |
| LPO | Not stated. Do not infer retimed |
| Stock | Not stated on the fetched text |
| Login | A lower account price exists behind sign-in. The number was not visible |
| Terms of use | **UNKNOWN_NOT_YET_REVIEWED**. The product page was read. The CDW legal terms were not. Public visibility is not permission |
| Rights class | **UNKNOWN_NOT_YET_REVIEWED** until the terms are read. Not a collection plan |

### 2.4 Vitex Direct (Hackensack, NJ)

| Field | Finding |
| --- | --- |
| Pages read | https://www.vitextech.com/products/800g-qsfp-dd-dr8-500m **[VERIFIED FACT]**. 1.6T page retrieved: https://www.vitextech.com/products/1-6t-osfp-dr8 **[RETRIEVED CLAIM]** |
| Seller | Vitex Direct LLC, 32 Mercer St, Hackensack, NJ. US engineering support. Not an OEM |
| 800G cell | VD-8CDR8CM-AA. QSFP-DD, 8×100G PAM4, 1310 nm, 500 m SMF, dual MPO-12 APC, host FEC, CMIS 5.0. Page says Ethernet, not NVIDIA OSFP platforms. Regular price **$1,100**. “Ship in 2 Days / In stock, ships from NJ” **[VERIFIED FACT]** |
| LPO | The word LPO does not appear. The page does not say “retimed” either. Classification: **UNKNOWN** |
| 1.6T cell | VO-1TDR8CM-AA described as 1.6T OSFP224 finned-top, 8×212.5 Gb/s PAM4, 500 m, dual MPO-12, Ethernet/InfiniBand, regular price **$1,850** **[RETRIEVED CLAIM]** |
| Volume | Bulk and unlisted configurations are quoted, “typically within one business day” **[VERIFIED FACT]** |
| Terms | **UNKNOWN_NOT_YET_REVIEWED** |
| Rights class | **UNKNOWN_NOT_YET_REVIEWED** |

### 2.5 FiberMall

| Field | Finding |
| --- | --- |
| Page | https://www.fibermall.com/store-21972-800g-qsfp-dd-osfp.htm category listing, text saved in this pass **[RETRIEVED CLAIM]** |
| Market | Ships “from Asia”; storefront prices in USD. Country of the seller was not established from a legal page |
| What the listing shows | Separate cards for LPO and non-LPO, OSFP and QSFP-DD, DR8, SR8, FR4, 2FR2, and 200G-per-lane DR4. Compatible coding is sometimes in the title (“FiberMall Juniper”) |
| Terms URL tried | https://www.fibermall.com/terms-conditions.html returned **404**. No substitute terms page was found |
| Automation / redistribution | **UNKNOWN** |
| Rights class | **UNKNOWN_NOT_YET_REVIEWED**. Do not collect |

### 2.6 LINK-PP (l-p.com)

A product URL in search results described a Cisco-compatible OSFP DR8 at **$1,030** with a one-piece tier and a note to contact them for wholesale **[RETRIEVED CLAIM, https://www.l-p.com/ca/products/495667.htm]**. The page was not re-fetched and the terms were not read. **UNKNOWN_NOT_YET_REVIEWED.**

### 2.7 Sellers not in this census

OEM module makers (Innolight, Eoptolink, Coherent, NVIDIA LinkX) do not publish a contract price; PH-1 already established that. Mouser, Arrow, Avnet, ProLabs, Approved Networks, GSA Advantage, and SAM.gov line items were **not** opened. They are not rejected. They are **UNKNOWN_NOT_YET_REVIEWED**. A later pass may add them only by reading each terms page first.

---

## 3. Manual Specification-Matched SKU Pilot

Method: individual product and category pages were opened or their saved text was read. No crawler was written. Counts are of listings **seen**, not of the world market. Prices are USD list/offer unless noted. Dispersion is the range of those offers. It is not a standard deviation and not an index.

### 3.1 800G DR8, about 500 m, single-mode, 8×100G

| Check | Result |
| --- | --- |
| Merchants with a page in this pass | FS (UK listing, retrieved), FiberMall, Vitex, CDW (Cisco OEM), LINK-PP (retrieved). Five |
| Comparable SKUs seen | More than one per merchant once form factor, heatsink, connector (MPO-12 vs MPO-16), and coding (generic, Cisco, Arista, Juniper, NVIDIA) are counted. They are not one SKU |
| OEM vs compatible | One OEM observation (Cisco via CDW). The others are compatible or MSA-labeled |
| PMD identifiable | Yes on the pages that say DR8, 1310 nm, 500 m, SMF |
| Form factor | Explicit: OSFP or QSFP-DD. Vitex states QSFP-DD will not fit NVIDIA OSFP cages |
| Retimed vs LPO | LPO is explicit only when the title says LPO. A DR8 title that omits LPO was **not** treated as proof of a retimer |
| Offers seen for non-LPO DR8-class | FiberMall OSFP flat-top DR8 **$1,199**; FiberMall QSFP-DD DR8 **$1,250**; FiberMall OSFP MPO-16 **$900**; Vitex QSFP-DD **$1,100**; LINK-PP compatible OSFP **$1,030** retrieved; CDW Cisco advertised **$7,464.99** against a list of **$10,791.78** |
| In stock | Vitex: yes, ships in two days. Others: not established. “Add to cart” is not a stock count |
| Quote required | Unit price was on the page. CDW account price and Vitex bulk price were not |
| History | None on these pages |

**INFERENCE.** Compatible 800G DR8 channel offers clustered roughly between $900 and $1,250 on this day. The Cisco-coded reseller advertisement was several times that. A single “800G DR8 price” that averages them mixes a compatible MSA module with an OEM-coded module. That split is economically material even after PMD, reach, and form factor are controlled. Coding belongs in the ontology.

### 3.2 800G FR / 2×FR4

The label “FR” on merchant pages is **not one cell**.

On the FiberMall 800G category **[RETRIEVED CLAIM]**:

- “800G OSFP FR4 (200G per line)” duplex LC, 2 km: **$3,500**
- “800G QSFP-DD800 FR4 (200G per line)”: **$3,500**
- LPO QSFP-DD 2×400G FR4, 2 km: **$1,800**
- LPO OSFP 2×400G FR4: **$3,500**

**INFERENCE.** A 200G-per-lane FR4 (four wavelengths, one duplex, the P802.3dj-class module) is a different good from a 2×400GBASE-FR4 (two duplexes, 100G-per-lane CWDM), and both differ from an LPO version of either. The page states “200G per line” or “LPO” and “2x400G” in the titles, so a careful reader can separate them. A scraper keyed on “800G FR” cannot.

No Cisco OEM 2×FR4 dollar price was opened in this pass. Cisco’s January 2026 datasheet specifies OSFP-2X400G-FR4 and does not list a dollar price (PH-1).

### 3.3 800G LPO DR8

FiberMall titles that say LPO: QSFP-DD DR **$1,500**; OSFP DR8 **$1,800** **[RETRIEVED CLAIM]**. Those sit above several non-LPO DR8 cards on the same page. **INFERENCE:** do not assume LPO is the cheap cell. This is one storefront on one day. It is not a market result. Stock and terms: unknown.

### 3.4 1.6T DR-class

Merchant products exist. They are not a mature comparable set.

| Listing | What the page asserts | Price seen | Class |
| --- | --- | --- | --- |
| Vitex VO-1TDR8CM-AA | 1.6T OSFP224, 500 m, dual MPO-12, 8×212.5G PAM4 | $1,850 | RETRIEVED CLAIM |
| FS AU OSFP-DR8-1.6T-FL | Customized 1.6T OSFP224 RHS/flat top, 2×DR4/DR8, 500 m, InfiniBand wording on the page | AUD 2,866.60 | RETRIEVED CLAIM |
| FiberMall OSFP-1.6T-DR8D | 500 m, dual MPO-12, OSFP224. The price widget was a template, not a reliable number, except a stray “1300.00” in the extraction | Do not use | RETRIEVED CLAIM, price **UNKNOWN** |

PMD and form factor are explicit. Retimed vs LPO is not. Ethernet vs InfiniBand is explicit on the FS AU text (InfiniBand) and mixed on the Vitex title. History: none.

### 3.5 400G DR4

**Not completed.** No 400G DR4 product page was fetched in this pass. The same merchants sell 400G families, and DigiKey’s public API can be queried for a part number, but neither a price nor a stock status is recorded here. PH-3 should not inherit a 400G merchant level from this pilot.

### 3.6 What the pilot is allowed to conclude

A specification-matched **channel** panel is operationally possible: listings name PMD, reach, fiber, connector, and form factor, and some name LPO. It is not yet a legal panel, it has no history, it is not the hyperscaler price, and inside a single PMD the OEM-coded price and the compatible price are different goods. Quote-only volume tiers sit under the posted unit price and were not observed.

---

## 4. Historical Price Feasibility

| Mechanism | What was found | Backfill? |
| --- | --- | --- |
| Vendor historical price books | FS terms describe a price that changes without notice and is billed at acceptance. No downloadable history | No |
| Distributor APIs | DigiKey’s API returns a current price for an authorized caller. It is not documented as a historical tape. Publishing it is barred by the site terms | No |
| Public catalog archives maintained by the seller | None found for these SKUs | No |
| Procurement archives / public contracts | Not censused SKU by SKU. CDW shows a current advertisement, not a twelve-month file | Not shown |
| Internet Archive | Not queried. Even if a page exists, FS’s terms forbid copying site content, and DigiKey’s terms forbid publishing content. An archived copy does not create a redistribution right | Do not use as a backfill |
| Professional files | LightCounting states history **2022–2025** for shipments, pricing, and sales. Cignal states a **2019** start for the optical-components report. Dell’Oro’s optical-transport **program** claims history from **1998** | These are the only multi-year economic histories documented. They are licensed, not merchant lists. 1998 is not a history of 800G DR8 |

**12 months, 24 months, and 36+ months of merchant/list prices: not plausible from any legitimate mechanism found.** A production history of specification-level ASP, if it is to exist, has to come from a licensed research file whose vintage is no earlier than that file’s actual coverage of the cell. 1.6T and 800ZR will be shorter than 400G DR4 inside the same database. That is a property of the market, already settled in PH-1.

---

## 5. Omdia Assessment

**Service.** Optical Components Intelligence Service. Brochure measures include units, revenues, and ASP. A 31 October 2025 datacom product covers transceivers, AOCs, and DAC/AECs for 2024–30. A 15 November 2024 high-speed forecast note records a correction to the pricing model on the Telecom tabs. Narrative in the brochure that calls 400G the fastest-growing segment is stale. All of that is PH-1 and still stands.

**Grain of the current ASP.** **UNKNOWN.** The brochure says ASP. The October 2025 public abstract does not say whether the row is rate, or rate × reach × form factor × linear/retimed.

**Actual vs forecast.** **UNKNOWN** how the file marks the cut. The Telecom pricing correction shows that published prices are revised.

**Cadence.** Brochure language mixes quarterly market share and forecast products. The exact ASP update calendar is **UNKNOWN**.

**Delivery.** “Market data” plus reports. Excel vs portal: **UNKNOWN** on the pages read.

**Price of the service.** **NOT PUBLICLY DISCLOSED.**

**What the public legal documents do say.**

Omdia Client Citations, Claims and Quotations Policy, updated October 2025 **[VERIFIED FACT, PDF]**:

- External use of Omdia IP requires pre-approval, with limited exceptions.
- A citation format is specified for market-share and similar statements, plus a disclaimer that results are not an endorsement.
- Only research published within **18 months** may be cited.
- Research that **includes specific reprint or distribution rights in the purchase contract** may be used externally in full, unmodified, without a further approval.
- Financial or securities use is case by case.
- Requests go to citations@omdia.com.

Informa Intelligence report-purchase terms (EMEA, February 2021) **[VERIFIED FACT, Informa page]**: a non-exclusive, non-transferable licence **solely for internal business purposes**. Artificial intelligence or machine learning purposes are **expressly prohibited** in that document. The buyer “will not make available, copy, reproduce, retransmit, disseminate, sell, license, distribute, publish or otherwise circulate the Report(s), or any portion thereof, without our prior written consent.” Named-user, not a site licence, unless extra users are purchased.

Those 2021 terms may not be the paper Omdia would attach to a 2026 order. They are evidence of the publisher’s public posture. They are not a grant.

**Derived-data rights.** Internal viewing of a purchased report: contemplated. Internal calculation, storage in an Urdais system, display of levels, display of changes, a normalized index, aggregates, customer API, MCP redistribution, and retention after termination: **UNKNOWN**, except that publication and derivative circulation are prohibited unless a written consent or a reprint clause in the order says otherwise. The citation policy’s 18-month rule would, if it were the only external path, forbid a historical index that cites older vintages. A standing index is not “a citation.”

**Rights class.** **UNSUITABLE_WITHOUT_PERMISSION.**

---

## 6. LightCounting Assessment

**Products read.** April 2026 Market Forecast. March 2026 Ethernet Optics, including the table-of-contents file. May 2026 “Silicon Photonics, LPO, CPO” table of contents.

**Grain [VERIFIED FACT, May 2026 TOC].** Forecast segmented by application (Ethernet, DWDM, wireless, FTTx) and by product category: AOCs, retimed pluggables, LPO/LRO, NPO/CPO. “All the products are sorted by data rate, reach, and form factor into more than 200 categories.” That is the specification grain PH-1 required. It is inside the report, not in a public feed.

**Fields.** Shipments, pricing, and sales. History in the April 2026 database: **2022–2025**. Forecast: **2026–2031**. Ethernet file: cloud, enterprise, telecom.

**Cadence.** October 2025 and April 2026 market forecasts; March 2026 Ethernet Optics; May 2026 silicon-photonics/LPO/CPO report. Not quarterly. Not a tape.

**Sticker.** **$5,995** on the April 2026 Market Forecast and the March 2026 Ethernet Optics report. That is the price of a report. It is not the price of a redistribution licence and not the price of an annual service.

**Redistribution [VERIFIED FACT, repeated in the March 2026 Ethernet TOC and the May 2026 silicon-photonics TOC].** The report “is a confidential, privileged, company product for the sole use of the intended recipients being LightCounting clients and subscribers. Any review, reliance on or redistribution by others or forwarding without LightCounting’s expressed permission is strictly prohibited.”

**Derived index.** Not separately defined. The sentence that is present prohibits redistribution without expressed permission. It does not say “derivatives are allowed if the cells are hidden.” **UNKNOWN** whether a paid permission would cover an index, a percentage, or an API. Absent that permission, the public text does not allow it.

**Weights without prices.** Units and prices are in the same report. No public offer to license weights alone was found. **UNKNOWN.**

**Rights class.** **UNSUITABLE_WITHOUT_PERMISSION.**

---

## 7. Cignal AI Assessment

**Page.** https://cignal.ai/optco/ and the terms at https://cignal.ai/subscription-agreement/ (last updated **16 January 2021**).

**What the report contains [VERIFIED FACT, methodology page, consistent with PH-1].** Quarterly revenue by Datacom, Telecom, Industrial, Consumer. Datacom unit shipments by speed (400G/800G/1.6T/3.2T and ELSFP), material, and reach (SR, DR, FR, LR, CL). Telecom units by speed, form factor, and technology. History from **2019**. Excel. Five-year annual forecast. Final report typically 10–11 weeks after quarter-end. A 2Q26 client file was stamped 17 September 2026; its contents were not public.

**ASP field.** **Not documented.** Do not divide Datacom revenue by 800G units. Those denominators do not match. If the Excel has revenue at the same reach grain as the units, that fact is **UNKNOWN** until a subscriber layout is seen.

**Purchase page [VERIFIED FACT, https://cignal.ai/purchase/].** Annual subscription or single issue. “Contact us to request pricing.” Site-based access so employees of the subscriber may share **inside** the organization. That internal sharing right is not an external publication right.

**Terms [VERIFIED FACT].**

- Paid services are “only for your internal use.”
- No sharing with any third party without express written consent.
- Citation policy: no external dissemination without prior written approval, which may be withheld. If approval is given, the material must be quoted verbatim and not “manipulated, adapted, paraphrased, or summarized.”
- Except as the subscription allows or a separate writing allows: the user agrees not to “sell, license, rent, modify, distribute, copy, reproduce, transmit, publicly display, publicly perform, publish, adapt, edit, compile or **create derivative works**.”

A published index is a derivative and a publication. The terms forbid both unless Cignal writes something else. Percentage changes and normalized indexes are not exemptions. They are derivatives.

**Retention after termination.** The terms allow Cignal to terminate access and remove materials. A subscriber’s right to keep a private archive is **UNKNOWN**.

**Rights class.** **UNSUITABLE_WITHOUT_PERMISSION.**

---

## 8. Dell’Oro Assessment

**Use this source for coherent DCI and ZR, not for 800GBASE-DR8.** PH-1’s boundary stands. The optical-transport program states revenue, shipments, and average selling prices, quarterly, history claimed from 1998, speeds including ZR/ZR+ plugs up to the program’s stated ceiling **[VERIFIED FACT, program page and 18 February 2026 release]**.

**ASP grain inside ZR vs ZR+.** **UNKNOWN** from the public program text. The public text says IPoDWDM ZR/ZR+ plugs and speeds. It does not print the row layout.

**Cadence [VERIFIED FACT, FAQ].** Quarterly reports in February, May, August, and November. Five-year forecasts in January and July.

**Licence structure [VERIFIED FACT, FAQ].** “Dell’Oro Group licenses market research information to subscribers on the basis of physical location and company affiliation. Both single location and global location licenses are available. Contact us directly for more detailed information.”

**Website terms [VERIFIED FACT, last updated 10 April 2019].** These govern use of delloro.com. Content of the site is Dell’Oro’s property. They do **not** state whether a subscriber may store report tables, display an ASP, publish an index, or keep data after the subscription ends. Do not read a website disclaimer as the data licence, and do not read silence as permission.

**Price.** **NOT PUBLICLY DISCLOSED.** Quote form offers “Subscription Service” or “Single Report” with no dollar figure.

**Data Center Switch – AI Back-End** ASP is a switch-port ASP. It is not a transceiver ASP. Rejected as a UPPI input. It remains a possible context series for port speeds, under the same unknown data licence.

**Rights class for report data.** **UNKNOWN** on the website terms, and **UNSUITABLE_WITHOUT_PERMISSION** as a practical collection rule until the subscription agreement is read. Silence is not a grant.

---

## 9. Other Commercial Sources

| Source | What this pass added | Rights |
| --- | --- | --- |
| 650 Group | No new primary page beyond PH-1. Public descriptions still do not document an ASP-by-PMD file or a licence | **UNKNOWN_NOT_YET_REVIEWED** as a price source |
| Yole | 2020 sample only, from PH-1. Not a 2026 feed | Do not use for a current level |
| Informa 2021 subscription terms | API access exists only if the order form says so, and the annex that was retrieved does not grant republication | Confirms API ≠ redistribution right |

No additional firm was found in this pass with a public optical-transceiver price tape and a public republication licence.

---

## 10. Hybrid Price + Licensed-Weight Feasibility

The architecture PH-1 left open is: permitted specification-level prices, plus licensed shipment weights, producing an index that does not print the provider’s ASP.

**Do the weights exist?** Yes, inside the same products as the prices or the units.

- LightCounting: shipments by the 200-category grid. The price is in the same database.
- Cignal: unit shipments by speed and reach. No documented ASP. A reach-share can be computed from units. Publishing that share is still a dissemination of paid data.
- Omdia: units are a stated measure. Whether they are delivered without ASP is **UNKNOWN**.
- Dell’Oro: units and ASP together for ZR. A weight-only cut is **UNKNOWN**.

**Is a weights-only licence documented?** **No.**

**Would hiding the weight and publishing only the index be enough?** **UNKNOWN**, and the texts that exist point the other way. Cignal forbids derivative works outright. LightCounting forbids redistribution without permission and does not carve out aggregates. Omdia’s citation rule still requires pre-approval for external use of data. An index whose weights are Cignal’s unit shares is a derivative of Cignal data even if no Cignal number appears on the screen.

**INFERENCE.** A hybrid can be negotiated. It cannot be assumed. The negotiation has to ask for a named right: “subscriber may publish an index whose weights are computed from your unit file, without displaying units, shares, or ASP, including via an API, for the life of the index, including after termination, with stated attribution.” Until that sentence is in a contract, path C is not a legal design. It is a question.

---

## 11. Ontology Source Map

The ontology can be specified without a price vendor. Replacing LightCounting with Omdia would not require a new meaning of “800GBASE-DR8.” Price identity and economic observation stay separate, as PH-1 required.

| Source | Fields it can establish | Reuse | Versioning |
| --- | --- | --- | --- |
| IEEE Std 802.3df-2024, published 15 March 2024, https://standards.ieee.org/ieee/802.3df/11107/ | 800G MAC; PMDs Cisco cites against it, including 800GBASE-DR8 and 800GBASE-VR8 (PH-1 datasheet). Reach, fiber, lane count for those PMDs | PDF is in the IEEE GET program at no cost. That is a right to obtain the standard. It is not, on the page read, a right to load the standard into a commercial product. Normalized facts (names, reaches) are the ontology target. Verbatim clause text is IEEE copyright. Commercial database of the extracted facts: **AMBIGUOUS_REQUIRES_LEGAL_REVIEW** | Published standard. Amendments supersede. Store the standard identity, not a paraphrase that omits the year |
| IEEE P802.3dj | Draft PMDs for 200G/lane, including 1.6T. Not a standard as of the 15 August 2026 recirculation (PH-1) | Drafts are not a stable ontology key. A merchant “1.6T DR8” sold in 2026 may cite the draft. Record it as draft-referenced, not as IEEE-standard | Ballot comments were still open in September 2026. Expect the names to move |
| OIF-800ZR-01.0, 8 October 2024 | Single-wavelength 800G coherent, 80–120 km amplified DCI. Not a client DR8 | Copyright © 2024 OIF. “This document and translations of it may be copied and furnished to others, and derivative works that comment on or otherwise explain it or assist in its implementation may be prepared, copied, published and distributed” if the notice is kept and the document itself is not modified **[VERIFIED FACT]** | 01.0. 400ZR has later revisions (PH-1). Key the IA revision |
| QSFP-DD Hardware Rev 7.1, 25 June 2024, http://www.qsfp-dd.com/wp-content/uploads/2024/07/QSFP-DD-Hardware-Rev7.1.pdf | Mechanical form factor for QSFP-DD / DD800 / DD1600. Not the optical PMD | “You are authorized to download, reproduce and distribute this document. All other rights are reserved.” No patent licence **[VERIFIED FACT]** | Rev 7.1. Earlier revs remain public. Do not collapse them |
| OSFP Module Specification Rev 5.1, https://osfpmsa.org/assets/pdf/OSFP_Module_Specification_Rev5_1.pdf | OSFP cage, power, heatsink class. Not the optical PMD | Licence “to download, reproduce, and distribute this document under the provisions of the OSFP MSA Agreement.” No other IP licence **[VERIFIED FACT]** | Rev 5.1. Cisco’s January 2026 datasheet cited Rev 5.1 |
| LPO MSA 100G-DR-LPO, announced 25 March 2025 | Linear vs not, at 100G/lane, through 800G DR8, 0.5–500 m SMF | The announcement is public. The specification PDF’s reuse clause was not re-read in this pass | **UNKNOWN** until the spec’s own notice is quoted. Do not assume the QSFP-DD sentence applies |
| CMIS | Management interface version (Cisco cited CMIS 5.3; Vitex cited 5.0). A revision mismatch is not a different PMD | OIF/CMIS document notice not re-audited here | Store the CMIS revision as an attribute, not as the price identity |
| Manufacturer datasheets (Cisco, Vitex, NVIDIA) | Which PMD a shipping PID claims, heatsink, coding, breakout | Cisco and NVIDIA page copyrights were not cleared for a database. Use them as evidence of what is sold. The ontology key should be the standard name, not the PID | Datasheets are revised (Cisco OSFP 800G sheet updated 5 January 2026) |

**INFERENCE.** Urdais can keep a source-independent key: standard body, document id, revision, PMD name, reach, fiber, lane rate, form factor, linear/retimed flag, client vs coherent, Ethernet vs InfiniBand coding. Price providers then map their categories onto those keys. When a provider’s category is only “800G,” the map fails and that provider cannot feed that instrument. That is a data defect, not a reason to coarsen the key.

---

## 12. Rights Matrix

Classes: CLEARLY_REUSABLE, REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS, AMBIGUOUS_REQUIRES_LEGAL_REVIEW, UNSUITABLE_WITHOUT_PERMISSION, UNKNOWN_NOT_YET_REVIEWED.

Twelve derived-data questions apply to every commercial price source. Unless a cell below quotes a grant, the answer is **UNKNOWN**. Cignal is the exception: derivative works and external dissemination are prohibited unless a later writing grants them.

| Source | Type | Data | Grain | Frequency | History | Access | Cost | Rights class | Store raw? | Publish raw? | Publish derived? | API redistribution? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IEEE 802.3df-2024 | Standard | PMD definitions | Per PMD | On publication | The standard | GET PDF | Free to obtain | AMBIGUOUS for a commercial fact store; the download is free | Facts: review. PDF: only as the GET terms allow | PDF: not cleared by this pass | Explanatory facts: review | No |
| OIF-800ZR-01.0 | IA | Coherent DCI definition | One interface | Revision | 2024-10-08 | PDF | Free to obtain | REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS for copies and explanatory derivatives | Yes, unmodified, with notice | Yes, unmodified, with notice | Explanatory derivatives yes, with notice. A price index is not this grant | No |
| QSFP-DD Rev 7.1 | MSA spec | Form factor | Mechanical | Revision | 2024-06-25 | PDF | Free | REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS for the document | The document may be reproduced | The document may be distributed | Patent rights: no. A price: no | No |
| OSFP Rev 5.1 | MSA spec | Form factor | Mechanical | Revision | Rev 5.1 | PDF | Free | REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS for the document | Same pattern | Same pattern | No patent licence | No |
| LPO MSA spec | MSA spec | Linear DR | 100G/lane to 800G | Revision | 2025-03-25 announcement | PDF | Free to obtain | UNKNOWN_NOT_YET_REVIEWED on the file’s own notice | Unknown | Unknown | Unknown | No |
| FS.com catalog | Merchant | Channel price | SKU | Irregular | None found | Website | Free to view | UNSUITABLE_WITHOUT_PERMISSION | No | No | No | No API found |
| DigiKey catalog and API | Distributor | Current offer, stock | SKU | Current | Not documented | Site or API | Free / developer credentials. Data licence NOT PUBLIC | UNSUITABLE_WITHOUT_PERMISSION | Internal or personal non-commercial only, per terms | No | No | No |
| CDW Cisco listing | Reseller | OEM advertisement | SKU | Current | None | Website | Free to view | UNKNOWN_NOT_YET_REVIEWED | Unknown | Unknown | Unknown | Unknown |
| Vitex | Specialist | MSA-compatible offer | SKU | Current | None | Website | Free to view | UNKNOWN_NOT_YET_REVIEWED | Unknown | Unknown | Unknown | Unknown |
| FiberMall | Specialist | Compatible offer | SKU | Current | None | Website | Free to view | UNKNOWN_NOT_YET_REVIEWED (terms URL 404) | Unknown | Unknown | Unknown | Unknown |
| LightCounting Ethernet / Market Forecast | Research | Units, pricing, sales | Rate × reach × form factor × architecture | Semiannual reports | 2022–2025 in the priced database | Report purchase | $5,995 per listed report. Redistribution price NOT PUBLIC | UNSUITABLE_WITHOUT_PERMISSION | Unknown beyond “clients and subscribers” | Prohibited without expressed permission | Not granted | Not granted |
| Omdia Optical Components | Research | Units, revenue, ASP described | UNKNOWN at PMD level | UNKNOWN for ASP | UNKNOWN start year | Subscription | NOT PUBLIC | UNSUITABLE_WITHOUT_PERMISSION | Internal use is the public posture | Pre-approval or a reprint clause | Not granted | API only if the order says so; republication still not granted |
| Cignal AI Optical Components | Research | Revenue, units. ASP not documented | Speed, reach, material, form factor on telecom | Quarterly | From 2019 | Subscription or single issue | NOT PUBLIC | UNSUITABLE_WITHOUT_PERMISSION | Internal, site-wide inside the subscriber | Prohibited without written approval, and then verbatim only | Prohibited (derivative works) | Prohibited |
| Dell’Oro Optical Transport | Research | Revenue, units, ASP for WDM/ZR | Speed and application. Row layout UNKNOWN | Quarterly | Program from 1998 | Subscription or single report | NOT PUBLIC | UNSUITABLE_WITHOUT_PERMISSION as an operating rule; the data contract itself was not public | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| BLS PCU33423342 | Official index | Communications-equipment PPI | Industry | Monthly | From 1985 | FRED / BLS | Free | REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS as that index | Yes | Yes, as the PPI | A relabel into UPPI: no | Yes, as the PPI, with attribution |
| Census HTS 8517.62.0090 | Official trade | Unit value of a residual basket | Not a transceiver | Monthly | From 2003 at HS10 | Census | Free | REUSABLE_WITH_ATTRIBUTION_OR_CONDITIONS as that basket | Yes | Yes, if named honestly | A relabel into a transceiver ASP: no | Yes, as Census data |

Post-termination retention is **UNKNOWN** for every commercial research contract read here. Cignal’s terms allow Cignal to cut off access. They do not say the subscriber may keep a working tape.

---

## 13. Economic / Cost Matrix

Subscription cost and publication cost are different purchases. Where a dollar is missing, it is missing on purpose.

| Path | Access cost | Publication / derived-index cost | Class |
| --- | --- | --- | --- |
| Read FS, Vitex, FiberMall, CDW pages | $0 | Not offered. FS and DigiKey require written consent that has no public price | Free to view. Republication: unknown and currently prohibited where terms were read |
| DigiKey API credentials | Developer signup; no public fee was on the portal page read | Not included | Low-cost or free access. Unusable for a public series under the site terms |
| One LightCounting report | **$5,995** sticker | Redistribution / derived index: **NOT PUBLICLY DISCLOSED** | Report purchase, plus a separate licence if publication is even available |
| LightCounting annual relationship | **NOT PUBLICLY DISCLOSED** | **NOT PUBLICLY DISCLOSED** | Unknown, likely enterprise, and still not a publication right |
| Omdia Optical Components service | **NOT PUBLICLY DISCLOSED** | Reprint exists only when the contract sells it. Price **NOT PUBLICLY DISCLOSED** | Enterprise subscription plus optional reprint |
| Cignal annual or single issue | **NOT PUBLICLY DISCLOSED** (“contact us”) | Written approval, not a rate card | Enterprise or report purchase. Publication is a separate ask, and the citation rule wants verbatim quotes rather than an index |
| Dell’Oro subscription or single report | **NOT PUBLICLY DISCLOSED** | **NOT PUBLICLY DISCLOSED** | Unknown until a quote. Location licence (single site vs global) changes the access price and still may not include publication |
| BLS, Census, IEEE GET, OIF PDF, QSFP-DD PDF, OSFP PDF | $0 | Ontology documents have the grants in §11. Statistics have attribution conditions. None of these is a transceiver ASP | Free / open for what they actually are |

**INFERENCE.** The cheap path (merchant pages) cannot be published. The path that has the right grain (LightCounting) has a known report price and an unknown publication price. Budgeting $5,995 as the cost of UPPI would buy a PDF the terms forbid Urdais to turn into a public number.

---

## 14. Rejected Sources and Approaches

Reject these as UPPI inputs. Rejection means “do not build on this.” It does not mean the underlying series is false.

1. **Rate-only merchant averages**, including an average of every card on FiberMall’s 800G page. That page alone runs from an SR8 at $650 to a 200G-per-lane FR4 at $3,500.
2. **HTS 8517.62.0090 unit values** labeled as transceiver prices. Settled in PH-1.
3. **BLS PCU33423342** labeled as UPPI. Settled in PH-1. It remains usable as a named PPI.
4. **Scraping FS or DigiKey**, or calling the DigiKey API to fill a public series. Both terms forbid that use.
5. **Internet Archive copies of those catalogs** as a history or as a workaround.
6. **Analyst ASP, units, or shares republished, rebased, or exposed through an API** without a written grant. LightCounting, Omdia, and Cignal public texts do not contain that grant. Cignal forbids the derivative expressly.
7. **Forecast columns** (LightCounting 2026–2031, Cignal five-year totals, Dell’Oro January/July forecast books) presented as observations.
8. **Daily or weekly interpolation** of quarterly or semiannual observations. Settled in PH-1.
9. **ASP manufactured by dividing Cignal segment revenue by a speed’s unit shipments.**
10. **One series that averages 800G DR8 and 800ZR.** Settled in PH-1.
11. **Dell’Oro optical-transport ASP used as a client DR8 price.**
12. **Dell’Oro AI back-end switch-port ASP used as a module price.**
13. **A FiberMall or Vitex dollar treated as the market** while terms are unread and the buyer is a channel customer of one.
14. **OEM and compatible prices averaged inside one instrument** without a coding attribute. The CDW Cisco advertisement and the Vitex MSA module are not the same offer.
15. **LPO inferred from the absence of the word “retimed,”** or the reverse.

---

## 15. Open Questions Requiring Vendor Contact

Send these in writing. A portal login is not an answer.

**FS (legal@fs.com), only if a merchant path is still wanted**

1. Will you license a specified SKU list, current price and stock, for storage and for publication of an index that does not reproduce your catalog?
2. Is there a historical price file, and may it be used the same way?
3. What is the fee, and does it survive termination?

**DigiKey**

4. Does any agreement, separate from the public website terms, allow a data licensee to store and publish prices?
5. Does the Product Information API return a history?

**Omdia (citations@omdia.com and the account team)**

6. In the file sold now, is ASP a column on a row defined by rate × reach × form factor × retimed/LPO, or only by rate?
7. Are units separable from ASP in the delivery?
8. First historical period you will stand behind, for 400G DR4, 800G DR8, 800G 2×FR4, 1.6T DR, 400ZR, and 800ZR, separately.
9. How is actual marked versus forecast, and what is the revision policy?
10. May a subscriber store the file in its own systems?
11. May it publish a level, a percentage change, a rebased index, or an API, and which of those require a reprint schedule?
12. May weights be licensed without the ASP, with the index public and the weights private?
13. What happens to stored data when the subscription ends?
14. Price of access, and price of the publication right, as two numbers.

**LightCounting**

15. Confirm the category list for 800G and 1.6T: which reaches, which form factors, and whether InfiniBand-coded modules are inside the Ethernet row.
16. Is “pricing” a shipment-weighted ASP, and what share is estimated?
17. The $5,995 sticker is understood as a report price. What is the price of expressed permission to publish a derived index, and does “reliance” in the footer prohibit a subscriber from using the figures inside an index calculation even internally?
18. Same twelve rights questions as Omdia items 10–13.
19. Will you license units without pricing?

**Cignal AI**

20. Does any table pair revenue and units on the same reach row? If not, say so, and we will not compute an ASP.
21. The terms forbid derivative works and external dissemination. Is there a paid schedule that permits an index, and what may be shown?
22. Site licence versus a publication licence: confirm they are different contracts.
23. Retention after termination.

**Dell’Oro (DGSales@DellOro.com)**

24. For ZR/ZR+ plugs only: ASP by 400ZR, 400ZR+, 800ZR, 800ZR+, or a coarser row?
25. Please send the data-licence language that distinguishes internal use from publication. The 2019 website terms do not.
26. Price of a single-location licence and of a publication rider, separately.
27. Confirm client Ethernet DR8 is outside this ASP.

---

## 16. Evidence Collected for PH-3

PH-3 can take the following as inputs. It still has to choose a methodology. This document does not.

1. **Ontology keys are buildable now** from IEEE 802.3df, OIF-800ZR-01.0, QSFP-DD Rev 7.1, and OSFP Rev 5.1, with the reuse limits in §11. Draft 802.3dj and merchant 1.6T names are provisional keys.
2. **A channel panel can see specification cells**, including LPO versus a module whose title does not say LPO, and OSFP versus QSFP-DD. On 23 September 2026 the compatible 800G DR8 offers inspected sat near $900–$1,250, and a Cisco OEM advertisement at CDW was $7,464.99 against a $10,791.78 list. That spread is a finding about comparability, not a price to publish.
3. **Those channel pages are not a legal feed.** FS and DigiKey terms forbid the collection method and the publication. Other sellers are unread. There is no 12-month merchant history.
4. **LightCounting is the only source whose public abstract puts pricing on a rate × reach × form factor × architecture grid.** Report price $5,995. Publication right not included.
5. **Cignal is a quarterly unit-and-revenue source from 2019, with an explicit ban on derivative works.** Do not invent an ASP. A weights-only hybrid is a contract question, not a structure that escapes the ban.
6. **Omdia describes ASP and units and requires pre-approval for external use.** Grain, history, cadence of the price, and the publication fee are unanswered.
7. **Dell’Oro is the quarterly ASP source for the DCI/ZR market, under a location licence whose publication terms were not public.** Do not point it at client DR8.
8. **Every publication right that matters is UNKNOWN until a vendor writes it down.** Internal viewing must not be upgraded, by assumption, into storage, display, an index, an API, or retention.
9. **Public statistics remain available as labeled context** and remain ineligible as the index.

Machine-readable companion: `docs/research/photonics/ph-2-source-rights-matrix.json`.
