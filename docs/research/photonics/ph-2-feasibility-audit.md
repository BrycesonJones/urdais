# PH-2 — Photonics data feasibility audit

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 23 September 2026.

**Scope.** PH-2 determines which candidate UPPI architectures are supportable by obtainable, maintainable, legally usable data. **PH-2 does not select a methodology. PH-3 does.** No candidate is ranked here, no winner is declared, and no preference is expressed beyond the evidence.

**What this document does not do.** It writes no production code, no migration, no schema, and no ingestion. It does not modify UPPI frontend behaviour and does not remove the existing demo. It establishes no right: **absence of a bar is never recorded as permission.**

**Prior art this audit is built on, and does not repeat**
- `docs/research/photonics/ph-1-external-research.md` + `ph-1-source-matrix.json` — provider-landscape pass, 23 September 2026.
- `docs/research/photonics-pricing/source-shortlist.md` — 21-entry two-axis source study, 14 September 2026.
- `docs/research/photonics-pricing/iccsz-tender-pricing.md` — Chinese carrier tender channel, assessed and rejected.
- `docs/research/photonics/ph-2-source-rights-research.md` + `ph-2-source-rights-matrix.json` — **parallel PH-2A source-and-rights pass, same day.** It read terms and fetched merchant pages that this pass could not, and §5 below is corrected against it.
- PH-1 methodology pass (index-number analysis, normalisation, candidate architectures, stress tests).

---

## Evidence and rights vocabulary

Four classes, marked throughout. They are not interchangeable.

| Class | Meaning |
|---|---|
| **VERIFIED FACT** | Retrieved and read in this pass, or in a cited prior pass, from a primary or near-primary source. Retrieval date given where it matters. |
| **INFERENCE** | A reading of how cited facts interact. Never a right, never a price. |
| **UNKNOWN** | Not established. **Not converted to BLOCKED merely because the information is private.** |
| **RIGHT REQUIRING WRITTEN PERMISSION** | A use that a contract or notice governs, and for which no grant has been read. Cannot be assumed from silence, from public accessibility, or from a permissive robots.txt. |

### Retrieval method and its limits

All live probes in §5 and §6 were made on **23 September 2026** from a single US network, over HTTPS, with either a browser user-agent string or `curl`, one request per URL, no retries against bot managers, no attempt to defeat any protection, and **no collection of any price**. `robots.txt` was read first in every case. A negative result from this environment is evidence about *this* access path on *this* date, not proof that no access path exists. Each finding below is scoped accordingly.

**Compliance disclosure.** One automated request in this pass fetched a PDF under `omdia.tech.informa.com/-/media/…`. Omdia's `robots.txt`, re-read the same day, places `ClaudeBot` and `Claude-User` under `Disallow: /`. That request was therefore contrary to Omdia's stated policy. **No content was extracted and nothing from it is used anywhere in this document.** It is recorded here rather than omitted, and no further automated request to that domain beyond `robots.txt` should be made. The correct route to Omdia is `citations@omdia.com` and the enquiry form.

---

## 1. Executive summary

**No candidate is presently VIABLE as a published UPPI. One candidate is VIABLE as supporting infrastructure, one is VIABLE as a validation layer that is explicitly not UPPI, and every price-bearing candidate is gated on a right that has not been read.**

Seven findings carry the audit.

**1. The merchant-price path is blocked by contract, not by availability — and at the two catalogs whose terms have been read, the prohibition is explicit.** Public prices are genuinely fetchable: the parallel PH-2A pass read, by direct fetch on 23 September 2026, a Cisco OSFP-800G-DR8 at CDW (list $10,791.78, advertised $7,464.99) and a Vitex 800G QSFP-DD DR8 at $1,100 **[VERIFIED FACT, PH-2A §2.3–2.4]**. The blocker is the licence to use them. **FS.com's Terms of Use (last updated 9 December 2022) forbid "any data mining, scraper, spider robots, or similar data gathering or extraction methods", and forbid reproduction, distribution or derivatives without express written consent** **[VERIFIED FACT, PH-2A §2.1]**. **DigiKey's terms forbid automated access and forbid publishing or distributing content**, limiting copies to internal or personal non-commercial use **[VERIFIED FACT, PH-2A §2.2]**. Independently, this pass found **Optcore names `ClaudeBot`, `Claude-Web` and `AnthropicAI` under `Disallow: /`** **[VERIFIED FACT]**. Several other merchants (CDW, Vitex, FiberMall, LINK-PP, Mouser, Arrow, Avnet) have terms that are simply **unread** — which is UNKNOWN, not blocked, and is where the remaining path runs.

**2. The licensed path has a documented prohibition on one provider and documented silence on the rest.** LightCounting's own report text states its product is "a confidential, privileged, company product … Any review, reliance on or redistribution by others or forwarding without LightCounting's expressed permission is strictly prohibited" **[VERIFIED FACT, PH-1 pass]**. Cignal AI's subscription agreement bars derivative works outright **[VERIFIED FACT, source study]**. Omdia grants nothing publicly and routes reuse through `citations@omdia.com` **[VERIFIED FACT]**. Both LightCounting and Omdia bar Urdais's crawler class by name at `/`, re-verified today **[VERIFIED FACT]**. None of this makes the data unobtainable — it makes the *right* a written-permission question, which is precisely what PH-2 is for.

**3. Data-rate is not the only thing that must be pinned, and the field list is shorter than it looks.** §3 proposes a **six-field comparison key plus two disambiguators**. The important simplification: **reach, fiber type, wavelength plan and lane count are all already encoded in the exact PMD designation** (800GBASE-DR8, 2×400GBASE-FR4, 800ZR). Carrying them as separate stratum fields is redundant and creates inconsistency risk. They belong in the ontology as derived attributes of the PMD, not in the key.

**4. The NVIDIA twin-port module breaks `nominal_rate` as a field, and nothing else in the key does.** An 800 Gb/s twin-port OSFP presents **2×400 Gb/s** through two optical connectors **[VERIFIED FACT: NVIDIA MMA4Z00-NS documentation]**. Module aggregate rate, endpoint rate and port count are three different numbers. Any key with one `rate` field will silently mis-stratify these products. §3 adds `port_multiplicity` for exactly this reason.

**5. Weight lag is methodologically ordinary; weight lag *in this market* is not.** National statistical offices routinely run current prices against weights one to two years old. Optics does not tolerate that gracefully — the 400G→800G→1.6T rotation is roughly a two-year cycle, so a year-old weight vector can be materially wrong about which cells matter. This is a **testable sensitivity question, not a blocking objection** (§7), and PH-3 should require the test rather than assume an answer.

**6. A hybrid index can leak its provider's weights, and this is arithmetic, not speculation.** If Urdais publishes an aggregate index plus per-stratum sub-indices computed from self-observed prices, then over enough periods the licensed weight vector becomes solvable from the published outputs (§7.4). A provider's counsel will ask about this before they ask about anything else. It is also straightforwardly mitigable, and naming the mitigation in the ask is the strongest possible signal of good faith.

**7. The ontology is the one thing Urdais can own outright, starting now.** IEEE 802 standards are downloadable at no charge through the IEEE GET Program **[VERIFIED FACT]**; the OSFP, QSFP-DD and LPO MSAs and OIF implementation agreements publish freely; vendor datasheets publish characteristics and no prices. **Specification facts are not copyrightable; IEEE's document text is.** An ontology that records facts and cites designations — and never reproduces standard text or tables — is **VIABLE** today with no licence and no provider. It is also the only asset that survives a change of price provider.

---

## 2. Settled PH-1 constraints carried into this audit

These are treated as working constraints, not re-litigated.

| # | Constraint | Consequence for PH-2 |
|---|---|---|
| 1 | Nominal data rate alone is not a sufficient product identity | Every candidate must demonstrate that its source carries observations at, or mappable to, the §3 key. A source priced only by rate **fails specification fidelity** regardless of its other merits |
| 2 | Daily and weekly professional optical pricing was not found; quarterly data must not be interpolated into synthetic daily movement | Cadence is an evaluation axis, and any design requiring sub-monthly display is disqualified at the design stage, not at the UI stage |
| 3 | Client/datacom optics and coherent DCI are separate economic markets | Candidate E is a separate family with its own providers and its own series. A design that blends them is **FALSIFIED**, not merely imprecise |
| 4 | Product ontology and economic observation are separate layers | Ontology feasibility is assessed independently (§10) and is not gated on any price provider |
| 5 | Public government datasets cannot set a transceiver ASP level | Candidate F is supporting infrastructure. It is a UPPI candidate only if new evidence overturns PH-1, and none was found |

---

## 3. Minimum product comparison key

### 3.1 Design principle

A stratum must contain only products that a buyer would treat as substitutes on a given link. The key is the **smallest set of fields that prevents non-substitutes from meeting**. Every additional field thins the strata, and thin strata are the merchant panel's main failure mode (§5), so minimality is a real constraint and not an aesthetic one. **[METHODOLOGICAL JUDGMENT]**

### 3.2 The key

**Six required comparability fields plus two required disambiguators.**

| # | Field | Vocabulary | Why it cannot be dropped |
|---|---|---|---|
| 1 | `application_class` | `client_datacom` \| `coherent_dci` \| `access_transport` | PH-1 settled finding 3. Gates everything below it; an 800G DR8 and an 800ZR must never meet |
| 2 | `module_aggregate_rate` | 100G / 200G / 400G / 800G / 1.6T / 3.2T | Necessary, insufficient alone |
| 3 | `pmd_designation` | Exact IEEE PMD or OIF IA or MSA name: `800GBASE-DR8`, `2×400GBASE-FR4`, `800GBASE-VR8`, `800ZR`, `400ZR` | **The composite field.** Encodes reach, fiber type, wavelength plan and lane count in one canonical token |
| 4 | `retiming_architecture` | `retimed` \| `lro` \| `lpo` \| `cpo_npo` | The DSP is a leading cost element; LPO exists to remove it. An 800G-DR8-LPO and a retimed 800GBASE-DR8 are different cost objects at identical reach |
| 5 | `form_factor_family` | `QSFP-DD` \| `QSFP-DD800` \| `QSFP-DD1600` \| `OSFP` \| `OSFP1600` \| `OSFP-XD` \| `QSFP112` | Not insert-compatible with one another; a cage change is a product change |
| 6 | `commercial_coding` | `merchant_generic` \| `oem_coded` \| `infiniband_coded` | Different warranty, firmware, support contract and buyer. A commercial distinction, and a real one |
| D1 | `port_multiplicity` | `single_port` \| `twin_port` | **Required disambiguator.** A twin-port 800G OSFP is 2×400G endpoints; module rate, endpoint rate and port count diverge |
| D2 | `standard_status` | `ratified` \| `draft` \| `msa` \| `vendor_defined` | **Required disambiguator.** P802.3dj was still in ballot in 2026 **[VERIFIED FACT, PH-1 pass]**, so 1.6T designations can change under a stable marketing name |

### 3.3 Fields deliberately **not** in the key

Recorded so PH-3 does not re-add them by reflex. All belong in the **ontology** as attributes of the PMD or of the part, not in the stratum key.

| Field | Disposition | Reason |
|---|---|---|
| `reach`, `fiber_type`, `wavelength_configuration`, `lane_count` | **UNNECESSARY as key fields; REQUIRED as ontology attributes** | Fully determined by `pmd_designation`. Carrying both invites contradictory records |
| `coherent_or_direct_detect` | UNNECESSARY | Determined by `application_class` + `pmd_designation` |
| `protocol/ecosystem` | UNNECESSARY as separate field | Collapsed into `commercial_coding` |
| `connector` | **DESIRABLE** | Usually determined by PMD, but MPO-12 vs MPO-16 APC varies within one PMD. Record it; split on it only if observed prices separate |
| `manufacturer` | **DESIRABLE** | Needed for dispersion diagnostics and vendor-concentration disclosure, not for stratum identity |
| `manufacturer_part_number` | **REQUIRED as the observation identifier**, not as a key field | The thing that makes a matched model matched |
| `standard_version` | DESIRABLE | Amendment-level detail; usually not a price break |
| `lifecycle_state` | **DESIRABLE, rising to REQUIRED for a merchant panel** | End-of-life clearance pricing is a known outlier source (§5) |

### 3.4 The key tested against the required examples

| Example | Key resolution | Verdict |
|---|---|---|
| **800G DR8 retimed OSFP** | `client_datacom` / 800G / `800GBASE-DR8` / `retimed` / `OSFP` / coding / `single_port` / ratified (802.3df) | Baseline stratum |
| **800G DR8 LPO** | Identical except `retiming_architecture = lpo` | **Separated by field 4.** Without field 4 these two merge — the single most likely silent error in a rate-plus-reach design |
| **800G 2×FR4** | `pmd_designation = 2×400GBASE-FR4` — 2 km, duplex LC, CWDM | **Separated by field 3.** Different fiber plant, different optical multiplexing, not a substitute for DR8 on any link |
| **800ZR** | `application_class = coherent_dci`, `pmd_designation = 800ZR` | **Separated at field 1**, before any other comparison is attempted. Also carries a host coherent-software licence that a client module does not **[VERIFIED FACT, PH-1 pass]** |
| **NVIDIA-coded twin-port optic** | `commercial_coding = infiniband_coded` (or `oem_coded`), `port_multiplicity = twin_port` | **Separated by field 6 and D1.** Exposes that `module_aggregate_rate = 800G` while endpoint rate = 400G — the key records both only because D1 exists |
| **1.6T DR-class module** | 1.6T / `1.6TBASE-DR8` (or vendor designation) / `standard_status = draft` | **Admitted, with a warning flag.** D2 prevents a later ratified renaming from silently breaking the matched model |

**Finding.** The key separates all six examples, and each separation is carried by a *different* field — which is evidence that none of the six fields is redundant. **[INFERENCE]**

---

## 4. Input requirements by candidate

Fields marked **REQUIRED** (the candidate cannot be built without it), **DESIRABLE** (materially improves quality or diagnostics), **UNNECESSARY** (do not collect; collection cost without index value).

### 4.1 A — specification-matched merchant price index

| Field | State | Note |
|---|---|---|
| `observed_at` timestamp (UTC) | REQUIRED | The observation date, not the publication date |
| `merchant_id` | REQUIRED | Panel composition must be auditable |
| `source_url` + retrieval provenance | REQUIRED | Reproducibility is the candidate's entire claim |
| `merchant_sku` | REQUIRED | The matching identifier across periods |
| `manufacturer` + `manufacturer_part_number` | REQUIRED | Distinguishes a re-listed SKU from a new product |
| §3 specification key (8 fields) | REQUIRED | Stratum assignment |
| `offer_price` + `currency` | REQUIRED | |
| `quantity_tier` | REQUIRED | A qty-1 price and a qty-100 price are different observations |
| `tax_shipping_basis` | REQUIRED | Ex-tax, ex-shipping must be explicit and constant |
| `stock_state` / availability | REQUIRED | An offer on an unavailable part is not a price **[METHODOLOGICAL JUDGMENT]** |
| `commercial_coding` (OEM vs compatible) | REQUIRED | Already key field 6; restated because merchant catalogues blur it |
| `lifecycle_state` | DESIRABLE → REQUIRED | EOL clearance is a systematic downward outlier |
| `region/storefront` | DESIRABLE | Enables a cross-geography panel; also a confound if unlabelled |
| `promotional_flag`, `list_vs_sale` | DESIRABLE | |
| Customer reviews, ratings, imagery, marketing copy | UNNECESSARY | No index value |

### 4.2 B — client-optics cost index (as briefed, weight-bearing)

Everything in §4.1, plus:

| Field | State |
|---|---|
| `shipment_units` by stratum, per period | REQUIRED |
| `category_share` (unit or expenditure) | REQUIRED — one of units or shares, not both required |
| `weight_vintage` (period the weights describe) | REQUIRED |
| `rebalance_period` and rule | REQUIRED |
| `nameplate_bandwidth` per stratum, frozen by rule | REQUIRED if the unit is USD/Gbps |
| Revenue at the same grain as units | DESIRABLE — enables expenditure rather than unit weights |

**Variant B2 — topology-weighted, weight-free.** Quantities come from a **published, versioned reference fabric** rather than from a provider. Requires everything in §4.1 plus a `topology_version` and its port-count schedule, and **no licensed input at all**. Recorded because the brief's B is weight-bearing by assumption, and that assumption is escapable. **[METHODOLOGICAL JUDGMENT]**

### 4.3 C — licensed specification-level ASP

| Field | State |
|---|---|
| `period` + explicit period-end convention | REQUIRED |
| `specification_category` at or mappable to the §3 key | REQUIRED — **the gating field** |
| `units` | REQUIRED |
| `revenue` and/or `asp` on the same row as units | REQUIRED |
| `actual_vs_forecast` flag | REQUIRED — a forecast used as an actual is a §14 failure |
| `revision_vintage` / file version | REQUIRED |
| `geography` | REQUIRED |
| `provider_methodology_version` | REQUIRED |
| `estimated_vs_reported` share per cell | DESIRABLE — Cignal states some revenues are estimates **[VERIFIED FACT, PH-1 pass]** |
| `supplier_mix` behind each ASP | DESIRABLE |
| Vendor-level detail | UNNECESSARY for the index, and likely the most rights-sensitive field to request |

### 4.4 D — hybrid public price + licensed weights

§4.1 (prices) + the weight subset of §4.3 (`specification_category`, `units`/`shares`, `weight_vintage`, `geography`, `methodology_version`). **ASP itself is UNNECESSARY** — and that is the point of the architecture (§7).

### 4.5 E — coherent DCI family

As §4.3, with `application_class = coherent_dci` and a required split on `400ZR` / `400ZR+` / `800ZR` / `800ZR+`, plus a REQUIRED `pluggable_vs_embedded` flag and a DESIRABLE `host_software_licence_included` flag.

### 4.6 F — public validation layer

| Field | State |
|---|---|
| Series identifier, period, index value | REQUIRED |
| Basket definition text, carried into the display name | REQUIRED |
| Attribution string | REQUIRED |
| Any derived dollar level | **PROHIBITED** — see §14 |

---

## 5. Merchant panel feasibility (Candidate A)

### 5.1 What was probed, and what came back

Two evidence sets, both 23 September 2026. **Set 1 (this pass):** transport-layer probes — `robots.txt` first, single request per URL, browser UA or `curl`, no retries against bot managers, **no price collected**. **Set 2 (parallel PH-2A pass):** terms pages read in full and selected product pages fetched, including prices. Set 2 supersedes Set 1 wherever they conflict, because reading a contract beats failing to fetch one.

| Merchant | `robots.txt` | Claude-class named? | Public price in server HTML | Readable terms | Assessment |
|---|---|---|---|---|---|
| **FS.com** | **HTTP 202, zero bytes** to this pass | Cannot be determined from robots | Yes — UK/AU storefront prices observed by PH-2A | **Yes — read in full by PH-2A.** Terms last updated 9 Dec 2022 | **BLOCKED_RIGHTS on read terms.** Forbids "data mining, scraper, spider robots, or similar data gathering or extraction methods"; forbids reproduction, distribution and derivatives without **express written consent** **[VERIFIED FACT, PH-2A §2.1]**. This *supersedes* PH-1's "unreadable" finding: the terms exist, they were read, and they say no |
| **DigiKey** | Allows some named AI crawlers | No | Product Information API v4 exists | **Yes — read by PH-2A** | **BLOCKED_RIGHTS on read terms.** Forbids "any robot, scraper, spider, or other automated means"; content may be stored only for internal business or personal non-commercial use and **may not be published, distributed or displayed** **[VERIFIED FACT, PH-2A §2.2]**. A robots allow-line is not a licence |
| **CDW** (Cisco OEM) | Not probed | — | **Yes** — Cisco OSFP-800G-DR8=, list $10,791.78, advertised $7,464.99, plus a lower sign-in price **[VERIFIED FACT, PH-2A §2.3]** | **Not read** | **UNKNOWN.** A real public OEM price surface with unread terms |
| **Vitex Direct** | Not probed | — | **Yes** — VD-8CDR8CM-AA, 800G QSFP-DD DR8, $1,100, in stock **[VERIFIED FACT, PH-2A §2.4]** | **Not read** | **UNKNOWN.** Retimed-vs-LPO is unstated on the page, so key field 4 is unresolvable from the listing |
| **FiberMall** | HTTP 200, minimal (`Disallow: /bin/`) | No | **Yes** — category listing separates LPO/non-LPO, OSFP/QSFP-DD, DR8/SR8/FR4/2FR2 | **`/terms-conditions.html` returns 404; no substitute found** | **UNKNOWN.** Best observed specification labelling of any merchant; no terms exist to read |
| **LINK-PP** | Not probed | — | Retrieved claim: Cisco-compatible OSFP DR8 at $1,030 | **Not read** | **UNKNOWN** |
| **Flexoptix** | HTTP 200, permissive; `Disallow: /*?`, `/catalog/`, `/checkout/`; sitemaps published | No | **No.** Prices are client-side; no currency value in server HTML | **GTC readable** (status 18.08.2026) — but it is a **sales contract**, not a website ToU. Clauses 1–19 cover delivery, payment, warranty, liability, IP in supplied products. **No website-use, data-use or automated-access clause exists** | Permissive crawl, **no public price**, commercial-customers-only shop, **no governing terms for collection** |
| **Optcore** | HTTP 200 | **Yes — `ClaudeBot`, `Claude-Web`, `AnthropicAI` under `Disallow: /`** | Not fetched | n/a | **Barred by the operator. Do not collect** |
| **ProLabs** | CloudFront **403** | Unknown | Not fetched | `/terms-of-use` 404 per PH-1 | Bot-walled; no terms exist to read |
| **NADDOD** | HTTP 200, permissive; disallows facet query strings (`/*?brand=`, `/*?wavelength=`, `/*?connector=` …); sitemap published | No | **403 on a product page** | Not reached | `robots.txt` permits what the server then refuses. **Enumeration by facet is explicitly disallowed — which is the access pattern an index needs** |
| **FiberMall** | HTTP 200, minimal (`Disallow: /bin/`) | No | Not established | Not reached | Under-assessed; a candidate for a human check |
| **ColfaxDirect** | **404 — no robots.txt** | n/a | Not established | Not established | Absence of terms is a risk, not a permission |
| **AscentOptics** | Redirect to apex host | Not resolved | Not established | Not established | Under-assessed |

### 5.2 Against the twelve required properties

| Requirement | State | Evidence |
|---|---|---|
| Enough sellers per stratum | **UNKNOWN** | Not measurable without collection. Requires the §15 census |
| Enough SKUs per stratum | **UNKNOWN** | Same |
| Stable product identity across periods | **UNKNOWN** | Whether merchants re-list SKUs under new identifiers is untested and would break matched-model linking at the root |
| Repeat observations | **UNKNOWN** | Requires a prospective pilot |
| Historical continuity | **BLOCKED_DATA** | No merchant publishes price history; no archive route with established rights was found (§11) |
| Geographic consistency | **UNKNOWN** | FS.com operates multi-region storefronts per PH-1; whether same-SKU cross-region prices are comparable is untested |
| OEM/compatible separation | **VIABLE in principle** | Key field 6 handles it; whether merchant catalogues label it reliably is **UNKNOWN** |
| Stock awareness | **UNKNOWN** | Whether availability is exposed per SKU is untested |
| Quantity-tier normalisation | **UNKNOWN** | Whether tier pricing is public, and whether qty-1 is representative, is untested |
| **Lawful collection** | **BLOCKED_RIGHTS today** | One merchant bars the crawler class by name; the richest serves unreadable policy documents; the permissive ones either refuse product pages or publish no price |
| **Lawful storage** | **UNKNOWN** | Follows collection; no terms read that address retention |
| **Lawful derivative publication** | **UNKNOWN — RIGHT REQUIRING WRITTEN PERMISSION** | No merchant grant of any kind was read |

### 5.3 Finding

**A public price on a web page is not a data plan.** The combined evidence is unambiguous on where the failure sits: **prices are available, and the licence to use them is not.** Every merchant whose terms have actually been read — FS.com and DigiKey — **prohibits both the collection method and the publication of the result** **[VERIFIED FACT, PH-2A §2.1–2.2]**. Both prohibitions name express written consent as the route through.

Two consequences follow, and they point in opposite directions, which is why this is a conditional state and not a block. **[INFERENCE from §5.1.]**

1. **The two largest, best-stocked catalogues are out** unless consent is obtained. A robots.txt allow-line does not help: DigiKey allows named AI crawlers in robots and forbids automated access in its terms. **Terms govern; robots is a courtesy signal.**
2. **The remaining path is real but unmapped.** CDW, Vitex, FiberMall, LINK-PP, Mouser, Arrow, Avnet and others publish prices and have **unread** terms. Under this audit's own rule, unread is **UNKNOWN**, not BLOCKED — and it is the only direction in which Candidate A can advance without a negotiation. It also has a known defect: FiberMall has no terms page at all (404), and absence of terms is a risk, not a permission.

A third, independent obstacle sits underneath the rights question. PH-2A's manual SKU pilot found that **merchant listings frequently do not state retiming architecture** — Vitex's 800G DR8 page says neither "LPO" nor "retimed" **[VERIFIED FACT, PH-2A §2.4]** — and that the merchant label "FR" is not one cell **[VERIFIED FACT, PH-2A §3]**. Key field 4 is therefore **not reliably derivable from public listing text**, which is gate A-6 failing on its first contact with real data.

**Candidate A cannot be called VIABLE on the evidence available today.** The missing evidence is one written consent *or* a terms review of the unread merchants, plus the empirical census — and now, additionally, a demonstrated method for resolving retiming architecture when the listing does not state it.

---

## 6. Licensed ASP feasibility (Candidate C)

Assessed per provider. No subscription was purchased, no gated page was accessed, and nothing below is a quote.

### 6.1 LightCounting

| Axis | Finding |
|---|---|
| Data required vs documented | Ethernet Optics (March 2026) documents **>100 product categories**, 100GbE–3.2T, **including retimed, LPO/LRO and CPO/NPO, sorted by reach and form factor**, split cloud/enterprise/telecom, with **units, prices and sales** **[VERIFIED FACT, PH-1 pass]** |
| **Specification fidelity** | **The only provider whose public documentation describes grain at or near the §3 key.** Retiming architecture and reach and form factor are all named |
| Grain adequacy vs §3 | Fields 2, 3, 4, 5 appear covered. Fields 1 and 6 (`application_class`, `commercial_coding` / InfiniBand) **UNKNOWN** |
| Cadence | Semi-annual model refresh; not quarterly **[VERIFIED FACT]** |
| History | **2022–2025** actuals in the April 2026 forecast database **[VERIFIED FACT]** |
| Actual/forecast split | Documented as history 2022–2025, forecast 2026–2031. Row-level flagging **UNKNOWN** |
| Revisions | **UNKNOWN** |
| Automated retrieval | **Barred.** `robots.txt` re-read 23 Sep 2026: `ClaudeBot`, `Claude-Web` … `Disallow: /` **[VERIFIED FACT]** |
| **Derived-index rights** | **BLOCKED_RIGHTS on documented text.** Report TOC: "a confidential, privileged, company product for the sole use of the intended recipients … Any review, reliance on or redistribution by others or forwarding without LightCounting's expressed permission is strictly prohibited" **[VERIFIED FACT, PH-1 pass]**. The clause names its own escape hatch — *expressed permission* |
| Redistribution / API / MCP rights | **UNKNOWN — RIGHT REQUIRING WRITTEN PERMISSION** |
| Access cost | **KNOWN, partially:** $5,995 per report sticker on two 2026 reports **[VERIFIED FACT]**. This is **not** an ongoing licence, historical-file, or publication price |
| Publication licence cost | **QUOTE_REQUIRED** |

### 6.2 Omdia

| Axis | Finding |
|---|---|
| Data required vs documented | Optical Components Intelligence Service brochure lists forecast measures **Units, Revenues, ASP** across datacom transceivers/AOCs, high-speed coherent, ICP data-centre optics, silicon photonics **[VERIFIED FACT, PH-1 pass]** |
| **Specification fidelity** | **UNKNOWN and pivotal.** The brochure proves ASP exists; it does not prove ASP exists *below the rate*. The 31 Oct 2025 datacom page abstract did not repeat "ASP" **[PH-1, retrieved]** |
| Cadence | Quarterly for share; ASP update cadence **UNKNOWN** |
| History | **UNKNOWN** — no start year stated on pages read |
| Revisions | **Documented to occur:** a Nov 2024 product page records that "the pricing model had an error" and that pricing on the Telecom tabs was updated **[VERIFIED FACT, PH-1 pass]**. Proof of a maintained *and revised* price model |
| Automated retrieval | **Barred.** `robots.txt` re-read 23 Sep 2026: `ClaudeBot` and `Claude-User` in a block ending `Disallow: /` **[VERIFIED FACT]** |
| Derived-index rights | **UNKNOWN.** Copyright asserted by Informa Tech; reuse routed through `citations@omdia.com` **[VERIFIED FACT]**. No public grant, and **no public prohibition of a derived index either** — this is genuinely UNKNOWN, not BLOCKED |
| Cost | **UNKNOWN / QUOTE_REQUIRED** |

### 6.3 Cignal AI

| Axis | Finding |
|---|---|
| Price field | **Not documented as a delivered field.** Public methodology describes revenue share and **unit shipments** by speed, material and reach (SR/DR/FR/LR/CL), quarterly, history from **2019**, Excel delivery **[VERIFIED FACT, PH-1 pass]** |
| Specification fidelity | **Strong on units** — reach is a native dimension. An ASP exists only where revenue and units share a denominator, which the public page does not establish |
| Derived-index rights | **BLOCKED_RIGHTS on documented text.** Subscription agreement: internal use only; "not … sell, license, rent, modify, distribute, copy, reproduce, transmit, publicly display … adapt, edit, compile or create derivative works" **[VERIFIED FACT, source study]**. A **Citation Policy** and written consent are named in the same agreement |
| Automated retrieval | `robots.txt` re-read 23 Sep 2026: `ClaudeBot` disallowed **only** on `/wp-content/uploads/`; `User-agent: *  Disallow:` otherwise **[VERIFIED FACT]**. The most permissive research-firm robots in the vertical |
| Cost | **UNKNOWN / QUOTE_REQUIRED** |
| Net | **Candidate C via Cignal is BLOCKED_DATA for price** until the Excel is shown to carry revenue at the same grain as units, **and BLOCKED_RIGHTS for derivative publication** absent written consent. It remains the strongest **weights** candidate (§7) |

### 6.4 Dell'Oro Group

| Axis | Finding |
|---|---|
| Optical Transport programme | Revenue, ports/wavelengths, **ASP**, quarterly, history claimed from **1998**; 4Q25 report described as tabling manufacturer revenue, ASPs and unit shipments by speed to 1.6 Tbps for DWDM, DCI and **IPoDWDM ZR/ZR+ optics** **[VERIFIED FACT, PH-1 pass]** |
| **Fit to Candidate C (client optics)** | **FALSIFIED.** This is an optical-*transport* ASP. It is not an 800GBASE-DR8 ASP on a GPU leaf, and treating it as one would be a §14 failure |
| **Fit to Candidate E (coherent DCI)** | **The best-documented fit found.** ZR/ZR+ plug ASP by speed is exactly Candidate E's object |
| Website ToU | Fetched in the source study: 2019 boilerplate, **no anti-scraping, data-mining, redistribution or derivative-works clause** **[VERIFIED FACT]**. `robots.txt` re-read 23 Sep 2026: `User-agent: *  Disallow:` — allow-all, no AI bar **[VERIFIED FACT]** |
| Derived-index rights | **UNKNOWN.** The subscription contract, not the site ToU, governs actual data |
| Cost | **UNKNOWN / QUOTE_REQUIRED** |

### 6.5 Others

**650 Group** — public pages describe AI-networking and 800 Gbps quarterlies emphasising vendor revenue and port speeds; **no ASP-by-PMD database documented** **[VERIFIED FACT, PH-1 pass]**. **UNKNOWN**, worth a TOC request; small firms are the likeliest to strike a novel structure. **Yole** — a 2020 sample shows volume/ASP/revenue model outputs; six years stale and no current catalogue retrieved **[VERIFIED FACT, PH-1 pass]**. **UNKNOWN**.

---

## 7. Hybrid weight feasibility (Candidate D)

**Architecture:** Urdais observes specification-level prices itself (Candidate A's panel); the provider supplies only shipment or category weights; Urdais computes and publishes the aggregate.

### 7.1 Mathematical validity

**Valid, and unremarkable as index theory. [METHODOLOGICAL JUDGMENT, standard practice.]** Running externally-sourced weights against internally-observed price relatives is what a Laspeyres-type or Lowe index is: base-period (or reference-period) quantities against current prices. National statistical offices do this routinely. Nothing about sourcing the weights from a commercial provider rather than a national accounts survey changes the arithmetic.

Three conditions must hold, and only the first is automatic:

1. **Weights and prices must be defined over the same partition.** If provider categories do not map one-to-one onto §3 strata, the mapping error is silent and unmeasurable. **This is the binding constraint of the entire architecture**, and it is why §6's "specification fidelity" row matters more than the price field itself.
2. **Weight completeness.** A stratum with a price but no weight, or a weight but no price, must have a published rule (§7.3).
3. **Weight and price must describe the same universe.** Merchant-panel prices describe the channel; provider weights describe merchant shipments including hyperscale programmes. **The resulting index is a channel-price index weighted by market-shipment structure — which is a coherent object, but it is not "the market price," and it must not be named as one.** **[METHODOLOGICAL JUDGMENT]**

### 7.2 Minimum weight granularity

**At or above the §3 key, never below its gating fields.** Concretely: weights must separate at minimum `application_class` × `module_aggregate_rate` × `pmd_designation`. Weights at rate-only grain are **insufficient** — they would force Urdais to allocate within a rate by assumption, which reintroduces exactly the mix contamination the stratification exists to remove. Weights at finer grain than the price panel can always be aggregated up; the reverse is not true, so **finer is strictly safer**.

### 7.3 Rebalance, lag, and how much lag is tolerable

| Question | Finding |
|---|---|
| Can weights lag prices? | **Yes, and this is ordinary.** Every fixed-base index in official statistics uses weights older than its prices |
| Can annual weights support monthly prices? | **Yes in principle.** The index becomes a Lowe/Young index with an annual weight reference period and monthly price observations — a completely standard construction |
| How much lag is tolerable *here*? | **UNKNOWN, and this is a required empirical test, not a judgment call.** Optics rotates generations on roughly a two-year cycle, so a weight vector one year old can materially misstate which strata matter. The error term is the covariance between weight drift and relative price movement, which nobody can sign a priori |
| Rebalance frequency | Annual chain link is the natural default given semi-annual (LightCounting) or quarterly (Cignal, Dell'Oro) weight publication. **A mid-chain weight swap is a methodology version event**, never a silent update |
| Missing cells — price without weight | Publish a rule: either exclude the stratum from the aggregate (and disclose the excluded share) or assign the weight of its parent group pro rata. **Never impute a weight of zero silently** |
| Missing cells — weight without price | Redistribute that weight across priced strata within the same parent, and **publish the covered-weight share every period**. If covered weight falls below a stated floor, suspend the aggregate rather than print a thin number |

### 7.4 Reconstruction risk — can the provider's weights be recovered from Urdais's output?

**Yes, under conditions that are easy to meet accidentally. This is arithmetic. [INFERENCE, but deterministic.]**

Suppose Urdais publishes, each period, an aggregate index *and* the per-stratum sub-indices, with *N* strata and a weight vector held fixed for a year. Each published aggregate is one linear equation in the *N* unknown weights, with known coefficients (the sub-index relatives Urdais itself published). Over *T* periods within the fixed-weight window, the system has *T* equations and *N* unknowns. **Once *T* ≥ *N*, the weight vector is solvable exactly**; below that it is bounded, and tightly so if the weights are known to be non-negative and to sum to one.

Practical reading: with a monthly cadence and, say, eight strata, a provider's annual weight vector becomes recoverable **within eight months** of publication by anyone with the published sub-indices.

**Mitigations, in descending strength:**
1. **License the weights for publication.** Then reconstruction is irrelevant because disclosure is permitted. This is the cleanest ask and should be the opening position.
2. **Publish the aggregate only**, withholding per-stratum sub-indices. Kills reconstruction, and also kills the transparency that makes the index credible — a real trade-off, not a free fix.
3. **Publish sub-indices but not the aggregate.** Preserves transparency, removes the solvable system, and leaves the headline to the reader — methodologically odd.
4. **Coarsen the published weights deliberately** (publish the bands Urdais used, rounded), so that what is recoverable is what was already disclosed.

**Naming this risk unprompted in the provider conversation is the strongest available signal that Urdais understands what it is asking for.** **[METHODOLOGICAL JUDGMENT]**

### 7.5 Does a licensed weight contaminate the publication rights of the result?

**Yes — an index computed from licensed weights is a derivative work of those weights, and no provider examined grants that right publicly. [RIGHT REQUIRING WRITTEN PERMISSION.]** The contract must say, explicitly and separately:

- that Urdais may **compute** a derived index from the licensed weights;
- that Urdais may **publish index levels**, **percentage changes**, and **rebased values**;
- that Urdais may expose those values through an **API** and through an **MCP/agent interface** (a distinct distribution channel that standard media clauses do not contemplate);
- whether the weights themselves may be disclosed, and at what grain;
- what **survives termination** — specifically whether already-published history may remain published;
- what happens on a **provider category restatement**, and whether it forces withdrawal.

**None of these can be inferred from a subscription that merely grants access. [METHODOLOGICAL JUDGMENT.]**

### 7.6 Net

Candidate D is **the architecture that asks a provider for the least and gives Urdais the most defensible product**: prices remain reproducible and auditable because Urdais observed them; weights carry the market structure Urdais cannot see. It inherits **every one of Candidate A's collection blockers**, and adds a written-permission requirement of its own. It is not a way around Candidate A's problem; it is a way around Candidate C's.

---

## 8. Coherent DCI feasibility (Candidate E)

| Axis | Finding |
|---|---|
| Economic object | Pluggable coherent optics for data-centre interconnect: 400ZR, 400ZR+, 800ZR, 800ZR+. OIF-800ZR-01.0 (8 Oct 2024) defines a single-wavelength 800G coherent line interface for single-span amplified **80–120 km** DWDM **[VERIFIED FACT]** |
| Separation from client optics | **Structural, and settled by PH-1.** Enforced at key field 1 before any other comparison |
| Best-documented source | **Dell'Oro**, which publishes ASP by speed for ZR/ZR+ plugs inside Optical Transport **[VERIFIED FACT, PH-1 pass]** |
| Cross-check source | Cignal AI coherent unit shipments and OEM coherent port share **[VERIFIED FACT, PH-1 pass]** |
| Cadence | Quarterly — the best cadence of any candidate |
| History | Real for 400ZR. **Do not back-cast 800ZR into the 1998 optical-transport history**; the programme's history is not the product's history |
| Specification hazards | Embedded coherent sleds must not mix with pluggables; telecom long-haul must not mix with campus DCI; **ZR+ is a family of reaches, not one link budget**; host **coherent-software licences** may sit outside the module ASP **[VERIFIED FACT, PH-1 pass]** |
| Rights | **UNKNOWN.** Dell'Oro's site ToU is silent on derivatives and its robots is allow-all, but the subscription contract governs and has not been read |
| Cost | **UNKNOWN / QUOTE_REQUIRED** |
| Source independence | **Weak — effectively single-provider.** Dell'Oro is the only documented ZR ASP programme found |
| Net | **CONDITIONALLY_VIABLE.** The cleanest economic object in the audit, the clearest provider fit, and the worst source-concentration profile |

---

## 9. Public validation layer (Candidate F)

**As a UPPI candidate: FALSIFIED.** Restated from PH-1 with the mechanism, because this is the failure most likely to be re-proposed.

| Series | What it is | Why it is not UPPI |
|---|---|---|
| **BLS PCU33423342**, Communications Equipment Manufacturing, monthly, Dec 1985 = 100 | An industry output price index | Covers vastly more than optical modules; moved in the third decimal place across Apr–Jun 2026 **[VERIFIED FACT, PH-1 pass]**. It cannot be relabelled a transceiver price |
| **HTS 8517.62.00.90** import unit value | Customs value ÷ quantity ("No.") | **The residual "Other" line** under a heading covering all data transmission/reception apparatus. Siblings `.10` (modems) and `.20` (switching and routing) are broken out; `.90` is what is left. CBP has ruled transceivers into it **[VERIFIED FACT]** — alongside everything else. Mixes rates, reaches, form factors, and arm's-length with related-party transfer values |
| **NAICS 335921 fiber optic cable PPI** | Was public | **Discontinued** with the July 2025 release **[VERIFIED FACT, PH-1 pass]**, and cable is the medium, not the module |

**As supporting infrastructure: VIABLE.** These are the cleanest reuse rights in the vertical — US government statistical products, attribution-only. Permitted roles:

- a **negative control**: if a future licensed ASP and the public series diverge, the divergence is itself the finding;
- a **coverage/context panel** on a methodology page;
- a **cycle-direction corroborator**, the way issuer commentary is used in the memory vertical.

**Hard constraints:** publish as **index points only**, never a dollar level; carry the basket definition **in the display name**, not in a footnote; never route it under the UPPI identifier; and forbid, in the methodology text, any multiplication by an assumed base dollar.

---

## 10. Ontology independence assessment

**Question:** can Urdais build and maintain a rights-safe canonical product ontology without any price provider?

**Answer: VIABLE. This is the one unambiguous yes in the audit.**

| Axis | Finding |
|---|---|
| Source availability | IEEE 802 standards are downloadable at no charge through the **IEEE GET Program** **[VERIFIED FACT]**. OSFP, QSFP-DD and LPO MSAs publish specifications openly. OIF publishes implementation agreements. Vendor datasheets (Cisco, Lumentum, Coherent, Amphenol, NVIDIA, Source Photonics) publish characteristics freely and **publish no prices** **[VERIFIED FACT, PH-1 passes]** |
| Crawl rights | OIF, Ethernet Alliance, and the named vendors were found robots-permissive with no AI-crawler bar **[VERIFIED FACT, source study §19]** |
| **Copyright boundary** | **The critical distinction.** IEEE "is, and shall remain the sole copyright holder" of GET documents, and users accept Terms and Conditions before download **[VERIFIED FACT]**. **Specification facts are not copyrightable; IEEE's expression of them is.** An ontology may record that `800GBASE-DR8` is 8 lanes, parallel SMF, ~500 m, 1310 nm, and cite the clause. It may **not** reproduce standard text or tables |
| Maintenance burden | Real but bounded: a new PMD arrives on a multi-year standards cadence, a new form factor less often. The 2026 live item is P802.3dj ratification, which is why key disambiguator D2 exists |
| Provider independence | **Complete.** The ontology has no provider dependency and survives every price-source change |
| What Urdais should own canonically | `application_class`, `pmd_designation` and its derived attributes, `retiming_architecture`, `form_factor_family`, `standard_status`, and the part-number registry |
| What is provider-specific | The **mapping** from each provider's category labels onto `pmd_designation`. This should be modelled as a versioned per-provider concordance, never by renaming Urdais's own canonical terms **[METHODOLOGICAL JUDGMENT]** |

**Consequence for sequencing.** The ontology is buildable now, is useful under every surviving candidate, costs nothing, and is the asset that makes a later provider switch a mapping exercise rather than a rebuild. It is also the thing that lets Urdais evaluate a provider's grain in the first place — you cannot ask "is this ASP at PMD level?" without a PMD vocabulary to ask it against.

---

## 11. Historical feasibility

**Separating backfillable from prospective-only.**

| Candidate | Backfillable | Prospective-only | Realistic depth |
|---|---|---|---|
| **A — merchant** | **None established.** No merchant publishes price history; no archive route with established rights was found | Everything | Starts when collection starts |
| **B — cost index (weighted)** | Only as far back as the weights and prices both extend | Prices | Bounded by A |
| **B2 — topology-weighted** | Topologies could in principle be defined retrospectively, but **should not be** — a back-dated topology is a modelling claim about the past dressed as an observation | Prices | Bounded by A |
| **C — licensed ASP** | **The only genuinely backfillable candidate.** LightCounting states 2022–2025 actuals **[VERIFIED FACT]**; Cignal units from 2019 **[VERIFIED FACT]** | — | Multi-year, provider-dependent |
| **D — hybrid** | Prices prospective; weights backfillable. **The two halves have different start dates**, and the index begins at the later one | Prices | Bounded by A |
| **E — coherent DCI** | Dell'Oro optical transport claims history from 1998, **but ZR pluggables exist only from the 400ZR era** | — | 400ZR-era onward, not 1998 |
| **F — public** | Deep: PPI from 1985, Census HS10 monthly from 2003 **[VERIFIED FACT, PH-1 pass]** | — | Deep, and about the wrong object |

### 11.1 Is a clean launch preferable to weak backfill?

**[METHODOLOGICAL JUDGMENT: yes, decisively, wherever the backfill would come from a different price concept than the forward series.**

A merchant-panel index spliced onto a licensed-ASP history is not one series with a long history. It is two different economic objects joined at a point, and the join is a structural break that will be read as a market event forever. The same applies to splicing a trade unit value onto anything.

The honest construction is: **start the series at the first period Urdais actually observed, publish the start date prominently, and place any longer-history series beside it as a separately named context panel — never behind it as backfill.** A short honest series is a better asset than a long composite one, and this repository has already paid the cost of the alternative once, in the UCPI live-index audit.

**The one case where backfill is legitimate:** Candidate C, where the provider's own history *is* the same construct as the forward series, subject to §12's vintage rules.

---

## 12. Revision and vintage requirements

What PH-3 will need to specify. **Nothing here is implemented.**

| Requirement | What PH-3 must decide |
|---|---|
| **Immutable raw observations** | Raw observations are append-only and never edited in place. A correction is a new row superseding an old one, with both retained. This mirrors the `news_articles` immutability rule already in this codebase |
| **Observation vintage** | Every observation carries the date it was *observed*, distinct from the period it *describes* and from the date it was *published* |
| **Source revision handling** | Provider restatements are a normal event (Omdia's Nov 2024 pricing correction is the documented example **[VERIFIED FACT]**). PH-3 must choose: real-time series (never revised), revised series (always current), or both published side by side |
| **Late observations** | A rule for an observation arriving after its period closed: admitted into the next release with a revision marker, or refused |
| **Restatement policy** | Whether a provider category redefinition forces a chain link, a series break, or a withdrawal |
| **Revised index releases** | Each release carries a release vintage; prior releases remain retrievable |
| **Methodology versioning** | Approved methodology versions are **never edited in place** — supersede and add a successor, never re-point content. This is an existing house rule and applies to UPPI from its first draft |
| **Forecast contamination guard** | A hard cut at the last actual period. Forecast rows must be structurally incapable of entering a published index |
| **Weight vintage** | For Candidate D, the weight reference period is published alongside every index value |

---

## 13. Cost and rights assessment

Costs decomposed as briefed. **No price is invented.**

| Candidate | A. Access | B. History | C. Update/subscription | D. Publication licence | E. API redistribution | F. MCP/agent redistribution | G. Engineering/maintenance |
|---|---|---|---|---|---|---|---|
| **A — merchant** | Low (own collection) | n/a — none exists | Low | **UNKNOWN** — consent, possibly a fee | UNKNOWN | UNKNOWN | **High and recurring** — SKU-to-key mapping, panel churn, ontology upkeep |
| **B — weighted cost index** | Inherits A + C | Inherits | Inherits | Inherits both | UNKNOWN | UNKNOWN | High |
| **B2 — topology-weighted** | Inherits A | n/a | Inherits A | Inherits A | Inherits A | Inherits A | High + topology maintenance and defence |
| **C — licensed ASP** | **KNOWN, partial:** $5,995 per LightCounting report **[VERIFIED FACT]** — a report sticker, not a data licence | QUOTE_REQUIRED | QUOTE_REQUIRED | **QUOTE_REQUIRED** — likely separate | **QUOTE_REQUIRED** | **QUOTE_REQUIRED** — likely not contemplated by any standard clause | Low ingestion, high mapping |
| **D — hybrid** | A + weight licence | Weights only | QUOTE_REQUIRED | **QUOTE_REQUIRED** | QUOTE_REQUIRED | QUOTE_REQUIRED | High |
| **E — coherent DCI** | QUOTE_REQUIRED | QUOTE_REQUIRED | QUOTE_REQUIRED | QUOTE_REQUIRED | QUOTE_REQUIRED | QUOTE_REQUIRED | Low |
| **F — public** | **KNOWN: zero.** Free, attribution-only | **KNOWN: zero** | **KNOWN: zero** | **KNOWN: none required** | None required | None required | Low |
| **Ontology** | **KNOWN: zero** | n/a | **KNOWN: zero** | n/a — facts, not expression | n/a | n/a | Moderate, recurring |

### 13.1 The economics finding

**No candidate has yet been shown to be BLOCKED_ECONOMICS, and it would be wrong to record one as such today.** Every commercial figure except the LightCounting report sticker is `QUOTE_REQUIRED`. A source that turns out to be technically excellent and priced beyond Urdais's means must be recorded **as a budget constraint**, in its own row, and never disguised as a methodological defect. That distinction is the whole reason cost is a separate axis in this audit. **[METHODOLOGICAL JUDGMENT]**

### 13.2 The rights findings, consolidated

| Class | Sources |
|---|---|
| **Documented prohibition on derivative publication** | LightCounting (report confidentiality/redistribution clause); Cignal AI (subscription agreement, no derivative works); **FS.com** (no reproduction, distribution or derivatives without express written consent); **DigiKey** (content may not be published, distributed or displayed) — **all four name written permission or a consent route as the escape hatch** |
| **Documented prohibition on automated collection** | **FS.com** ("data mining, scraper, spider robots, or similar"); **DigiKey** ("any robot, scraper, spider, or other automated means") — both **[VERIFIED FACT, PH-2A]**. Note DigiKey's robots.txt *allows* several named AI crawlers while its terms forbid automated access: **terms govern** |
| **Crawler class barred by name at `/`** | LightCounting, Omdia (re-verified 23 Sep 2026); Optcore (merchant) |
| **Terms unreadable by this pass, read by PH-2A** | FS.com — `robots.txt` and the ToU URL return HTTP 202 zero-byte to a direct client, yet the terms themselves were obtained and read. **A failed fetch is not evidence that no terms exist** |
| **No governing terms found at all** | Flexoptix (GTC is a sales contract with no data or website-use clause); FiberMall (`/terms-conditions.html` 404); ProLabs; ColfaxDirect. **Absence of terms is a risk, not a permission** |
| **Terms simply unread — UNKNOWN, not blocked** | CDW, Vitex Direct, LINK-PP, Mouser, Arrow, Avnet, Approved Networks. **The only direction in which Candidate A can advance without a negotiation** |
| **Silent, neither granting nor prohibiting** | Omdia (copyright asserted, reuse routed to `citations@omdia.com`); Dell'Oro (2019 boilerplate ToU, allow-all robots) |
| **Clean, attribution-only** | BLS, US Census, FRED — for those series as themselves, not for a derived "optics price" |
| **Facts, not expression** | IEEE PMD characteristics, MSA and OIF designations, vendor datasheet specifications |

---

## 14. Failure analysis

Each failure mode, which candidates are exposed, and the guard that prevents it.

| # | Failure mode | Exposed | Guard |
|---|---|---|---|
| 1 | **Mixes incomparable PMDs** | A, B, C, D if provider grain is rate-only | Key field 3. **A rate-only source fails specification fidelity and cannot be used for a matched-model design** |
| 2 | **Treats a rate as a product** | The existing prototype, directly | Key fields 1–6; the prototype's five rate instruments are not strata |
| 3 | **Mixes client optics and coherent DCI** | Any single-family design; Dell'Oro transport ASP read as a client ASP | Key field 1, evaluated before all others. Candidate E is a separate family by construction |
| 4 | **Creates daily observations from quarterly data** | Any candidate rendered on the existing surface | Store and publish at observation cadence; forbid interpolated values in the stored series; no 1D/1W display element may exist |
| 5 | **Uses forecast data as actual** | C, D, E — every major provider file mixes both **[VERIFIED FACT, PH-1 pass]** | REQUIRED `actual_vs_forecast` flag (§4.3); hard cut at the last actual period |
| 6 | **Mismatched units and revenue** | C, D — dividing segment revenue by a sub-segment unit count | Require revenue and units **on the same row at the same grain**; otherwise no ASP may be derived |
| 7 | **Relies on inaccessible weights without disclosure** | B, D | Publish weight grain, vintage and **covered-weight share every period**; suspend the aggregate below a stated floor |
| 8 | **Uses merchant prices contrary to terms** | A, B, B2, D | No collection from any source whose terms bar it or cannot be read. Optcore is barred; FS.com is unreadable; neither may be collected today |
| 9 | **Republishes licensed data without permission** | C, D, E | Written derivative-publication permission before any value is published, including percentage changes |
| 10 | **Treats customs unit values as transceiver ASP** | F, if promoted | §9. Index points only, basket in the name, no dollar level |
| 11 | **Treats broad equipment PPI as UPPI** | F, if promoted | §9 |
| 12 | **Silently changes the economic object during a technology transition** | All of them | Benchmark migration, topology re-spec, provider recategorisation and weight-vector replacement are **each a methodology version event** with an overlap link — never a metadata edit |
| 13 | *(added)* **Leaks a provider's confidential weights through published outputs** | D | §7.4 — license the weights for publication, or restrict what is published |
| 14 | *(added)* **Splices two different price concepts into one series to manufacture history** | Any backfilled design | §11.1 — start at first observation; context series beside, never behind |

---

## 15. Candidate survival matrix

No numeric scores. No ranking. Rows are alphabetical by candidate identifier.

| | **A** Merchant matched-model | **B** Client-optics cost index | **C** Licensed specification ASP | **D** Hybrid price + licensed weights | **E** Coherent DCI | **F** Public validation layer |
|---|---|---|---|---|---|---|
| **Economic validity** | Sound — constant-quality price of a defined capability | Sound — cost of client optical bandwidth; mixes price and mix by design, which must be disclosed | Sound — shipment-weighted market ASP | Sound — channel prices weighted by market structure; **must not be named "market price"** | Sound and the cleanest object in the audit | **Not a transceiver price.** Valid only as context |
| **Product specificity** | Full control; determined by Urdais's own key | Inherits A; weights must match the key | **LightCounting documents grain at/near the key; Omdia UNKNOWN; Cignal units-only; Dell'Oro transport-level** | Inherits A for price; weights gated on provider grain | Good — ZR/ZR+ split by speed documented | **None.** Residual customs basket / whole-industry PPI |
| **Data availability** | **BLOCKED today** — no probed merchant served a public price to a non-browser client under readable terms | Inherits A + weights | Exists, gated behind subscription | Inherits A + weights | Exists (Dell'Oro) | **VIABLE** — free and public |
| **Historical depth** | None; prospective only | Prospective | **Best** — LightCounting 2022–2025; Cignal units from 2019 | Later of the two halves | 400ZR-era onward; **not** 1998 | Deep and about the wrong object |
| **Frequency** | Monthly feasible if collectible | Quarterly | Semi-annual (LightCounting) / quarterly (Cignal, Dell'Oro) | Monthly prices, annual/semi-annual weights | **Quarterly — best of the price candidates** | Monthly — and monthly observation of the wrong object is a trap |
| **Rights** | **BLOCKED_RIGHTS pending written consent**; one merchant bars the crawler class by name; richest merchant's terms unreadable | Inherits A and C | **Documented prohibition** (LightCounting, Cignal); **UNKNOWN** (Omdia, Dell'Oro) — all name a written-permission route | Inherits A; **plus separate written derivative language required** (§7.5) | **UNKNOWN** — contract not read | **Clean**, attribution-only |
| **Reproducibility** | **Highest** — a URL, a date, a number, a published formula | High if topology/weights published | **Lowest** — a modelled ASP cannot be audited by a third party | High for prices, opaque for weights | Low — provider-modelled | Perfect |
| **Source independence** | Panel diversifiable in principle; **single-merchant concentration today** | Inherits both legs | Provider-specific categories; switching requires re-mapping | **Best of the licensed designs** — prices are Urdais's own, only weights are provider-bound | **Weakest — effectively single-provider (Dell'Oro)** | Fully independent |
| **Cost** | Low access, **high recurring engineering** | Inherits both | $5,995/report KNOWN; everything else QUOTE_REQUIRED | Weight licence QUOTE_REQUIRED | QUOTE_REQUIRED | **Zero** |
| **Operational burden** | **Highest** — collection, SKU mapping, panel churn, outlier policy | High | Low ingestion, high category mapping | High | Low | Low |
| **Current feasibility state** | **CONDITIONALLY_VIABLE** | **CONDITIONALLY_VIABLE** (B2 variant: CONDITIONALLY_VIABLE without any licence) | **BLOCKED_RIGHTS** (LightCounting, Cignal) / **UNKNOWN** (Omdia) / **FALSIFIED for client optics** (Dell'Oro) | **CONDITIONALLY_VIABLE** | **CONDITIONALLY_VIABLE** | **VIABLE as validation layer; FALSIFIED as a UPPI candidate** |
| **Conditions required to advance** | Written collection + derivative-publication consent from ≥1 merchant with a genuinely public price surface; SKU census; volatility pilot; cross-merchant dispersion; SKU→key mapping test | A's conditions + weights at key grain (or, for B2, a topology defensible from citable engineering sources) | Written derivative-publication permission; sample schema; category definitions; actual/forecast boundary; revision policy; quote | A's conditions + weights at key grain + explicit publication/API/MCP language + weight-lag sensitivity test + reconstruction mitigation agreed | Dell'Oro contract terms; ZR/ZR+ grain confirmation; pluggable-vs-embedded separation; quote | None to remain a validation layer. **Promotion to UPPI requires evidence that overturns PH-1, and none was found** |

---

## 16. PH-3 entry gates

For every candidate not falsified, the evidence PH-3 must **possess** before selecting a methodology. Thresholds are justified where stated and flagged as empirical where they cannot be.

### Candidate A — merchant matched-model

| Gate | Requirement | Justification |
|---|---|---|
| A-1 | **Written consent** from ≥1 merchant covering automated collection, storage, and publication of a derived index | Rights cannot be inferred. This gate is absolute |
| A-2 | **SKU census** per candidate stratum | Determines whether strata can be populated at all |
| A-3 | **Minimum constituents per stratum** — a published floor with a stated rationale | **Do not fix a number before A-2.** The floor should be derived from observed dispersion (A-5), not asserted. A floor chosen before the census is arbitrary |
| A-4 | **Repeat-observation pilot**, ≥12 weeks at the intended cadence | Settles empirically whether list prices move, and how often. §6 of the PH-1 methodology pass argued this from theory; only a pilot answers it |
| A-5 | **Cross-merchant dispersion measurement** on identical specifications | If dispersion is large, merchant selection dominates the index and a multi-merchant panel becomes mandatory rather than desirable |
| A-6 | **SKU→key mapping test** — what share of listings can be resolved to all eight key fields from public listing data | If reach, retiming architecture and coding are not reliably stated, stratification is unbuildable at acceptable cost |
| A-7 | **Identity-stability test** — do merchant SKU identifiers persist across the pilot | A re-listed SKU breaks matched-model linking at the root |

### Candidate B / B2 — cost index

B-1: all of A's gates. B-2: weights at §7.2 grain with documented vintage **(B only)**. B-3 **(B2 only)**: a reference topology derivable from **citable public engineering documents**, not invented — this gate alone decides whether B2 exists. B-4: a published rule for what a topology version change does to the series.

### Candidate C — licensed ASP

C-1: **sample schema received**, showing actual columns and rows. C-2: **exact category definitions**, tested against the six §3.4 examples — specifically whether DR8, 2×FR4, VR/SR and LPO are separate priced rows. C-3: **actual/forecast boundary documented at row level**. C-4: **revision policy in writing**, including what the Nov 2024 Omdia pricing correction did to history. C-5: **written derivative-publication permission** covering levels, percentage changes, rebased index values, API and MCP distribution. C-6: **quote** separating access, history, updates and publication licence. C-7: **termination survival** of already-published history.

### Candidate D — hybrid

D-1: all of A's gates (prices). D-2: weights available at §7.2 grain. D-3: **explicit derivative-publication rights for the weights** (§7.5). D-4: **weight-lag sensitivity test** — recompute a candidate index with weights lagged 6 and 12 months against contemporaneous weights, and show the divergence is within a stated tolerance. **This is empirical; no defensible threshold can be set in advance.** D-5: **reconstruction mitigation agreed in writing** (§7.4).

### Candidate E — coherent DCI

E-1: Dell'Oro contract terms read. E-2: confirmation that ZR/ZR+ ASP is split by speed and by ZR vs ZR+. E-3: pluggable/embedded separation confirmed. E-4: confirmation that client Ethernet modules are excluded by construction. E-5: quote. E-6: a documented position on the single-provider dependency.

### Candidate F — public validation layer

F-1: attribution strings recorded. F-2: a display rule forbidding any dollar level and requiring the basket in the series name. F-3: a written statement that it is not UPPI, carried on the surface and not only in the methodology.

### Ontology

O-1: canonical vocabularies for the six key fields plus two disambiguators, sourced to standards/MSA/OIF documents. O-2: a **copyright boundary rule** — facts and designations recorded, standard text never reproduced. O-3: a per-provider concordance model, versioned. O-4: a maintenance owner and a review trigger tied to standards events (P802.3dj ratification first).

---

## 17. Remaining vendor questions

### 17.1 Omdia — the questions that decide Candidate C and D

**Grain — answer first; if the answer is "by rate," the rest is moot.**
1. In the current Datacom Transceiver, AOC and DAC/AEC forecast, what is the **atomic priced category**: nominal rate, or rate × PMD × form factor × retiming architecture?
2. Please list every category you price at 400G, 800G and 1.6T. **Are 800GBASE-DR8, 2×400GBASE-FR4, 800GBASE-VR8 and 800G-DR8-LPO separate ASP rows?**
3. Are InfiniBand-coded modules inside the datacom ASP, in a separate row, or excluded?
4. Where do 400ZR and 800ZR/ZR+ sit, and how is double-counting with the coherent forecast prevented?
5. How is a **twin-port OSFP** containing two optical engines counted — one unit or two?
6. At what point does a co-packaged port leave the transceiver ASP, and what unit does it enter?

**Construction of price**
7. Is the published ASP vendor revenue ÷ vendor units, a modelled price, or a blend? What share of the 800G and 1.6T ASP is **estimated rather than reported**?
8. Are **units, revenue and ASP on the same row** at the same grain?
9. Are hyperscaler contract sales inside the ASP, or only merchant sell-in from your panel?
10. How is the 8×100G → 4×200G transition handled when vendors call both "800G"?

**History, cadence, revision**
11. For each AI-relevant row, what is the **first historical period you will stand behind**?
12. How often is the ASP updated, and with what lag after period end?
13. What is the **revision policy**, and specifically what did the November 2024 telecom pricing correction do to previously delivered history?
14. Which rows are actual and which forecast, and **how is the boundary marked in the file**?

**Rights — must be answered in writing**
15. May a subscriber **compute and publish an index derived from** this data on an ongoing basis?
16. Separately: may Urdais publish **index levels**, **percentage changes**, and **rebased values**?
17. May those values be exposed through an **API**, and through an **MCP/agent interface**? Are these separate grants?
18. Is publication a **separate licence**, and what does it cost?
19. **Would you license shipment or category weights alone — without ASP — for an index whose prices Urdais observes and publishes itself?** (§7.6: this asks for less and exposes no pricing IP.)
20. If so: at what grain, and may the weights themselves be disclosed? If not disclosed, we would need to agree a mitigation for the reconstruction property described in §7.4 — **we raise it rather than wait to be asked**.
21. What survives termination — may already-published history remain published?
22. Does a category restatement force the derived index to be withdrawn?
23. Urdais's crawler class is barred at `/` in your `robots.txt`. Urdais has honoured that and collected nothing. Does a licensed relationship change that, and is the bar blanket policy?

### 17.2 LightCounting

Questions 1–22 above, substituting the "pricing" field, **plus**: (a) does the >100-category Ethernet Optics taxonomy separate retimed / LRO / LPO **as priced rows** or only as forecast categories; (b) is the $5,995 report sticker related in any way to an ongoing data licence; (c) the confidentiality clause names *expressed permission* — what is the process for obtaining it?

### 17.3 Cignal AI

First: **does a price or ASP field exist in the deliverable at all?** Then: does the quarterly Excel carry **revenue at the same grain as SR/DR/FR/LR unit shipments**? Then the rights questions, noting that the subscription agreement bars derivative works and names a **Citation Policy** — what does that policy permit?

### 17.4 Dell'Oro

Rights questions 15–22 for **ZR/ZR+ ASP only**. Plus: are client Ethernet modules outside the optical-transport ASP by construction? Are pluggable and embedded coherent separated? Are ZR and ZR+ separate rows? Does the module ASP include or exclude host coherent-software licences?

### 17.5 Merchants (FS.com, Flexoptix, and any candidate identified later)

1. May Urdais collect listed prices automatically, at a stated cadence and rate limit?
2. May Urdais **store** those observations and publish a **derived index** from them, with attribution?
3. Is there a feed, API or agreed export that avoids page collection entirely?
4. Is any price history available?
5. FS.com specifically: `robots.txt` and the Terms of Use return HTTP 202 with a zero-byte body to outside clients, so **Urdais has not been able to read either document and has therefore collected nothing.** Could you provide the applicable terms directly?

---

## 18. Explicitly rejected paths

| Path | State | Reason |
|---|---|---|
| Broad communications-equipment PPI as UPPI | **FALSIFIED** | Whole-industry index; moved in the third decimal place across three 2026 months **[VERIFIED FACT, PH-1 pass]** |
| HTS 8517.62.00.90 unit value as a transceiver ASP | **FALSIFIED** | Residual "Other" line; siblings break out modems and switching/routing, leaving everything else. Mixes rates, reaches, related-party transfers |
| Fiber-optic-cable PPI as a photonics proxy | **FALSIFIED** | Discontinued August 2025, and cable is the medium, not the module |
| Dell'Oro optical-transport ASP as a client-optics price | **FALSIFIED** | Wrong economic object (§6.4) |
| Chinese carrier tender pricing as an index constituent | **FALSIFIED** | Assessed in `iccsz-tender-pricing.md`: no 800G, no 1.6T, no ZR in the channel; awards frequently administered at the ceiling price |
| Collection from Optcore | **BLOCKED_RIGHTS** | Operator names `ClaudeBot`, `Claude-Web`, `AnthropicAI` under `Disallow: /` **[VERIFIED FACT, 23 Sep 2026]** |
| Collection from FS.com | **BLOCKED_RIGHTS** | Terms of Use read by PH-2A: forbid scrapers and data-extraction methods, and forbid reproduction, distribution and derivatives without express written consent **[VERIFIED FACT]** |
| Collection from DigiKey | **BLOCKED_RIGHTS** | Terms forbid automated access and forbid publishing or distributing content **[VERIFIED FACT]**. Its permissive robots.txt does not override this |
| Defeating any bot manager to reach a price | **REJECTED** | Not attempted, not proposed, and not a fallback |
| Daily or weekly UPPI values from quarterly or semi-annual sources | **FALSIFIED** | PH-1 settled finding 2 |
| Secondary-market / broker prices | **REJECTED** | Condition, authenticity and grey-market contamination make them uninterpretable |
| USAC E-Rate line-item awards | **REJECTED** | Genuinely open and redistributable, but the population is K-12 and library campus networking, not AI-fabric optics |
| GSA CALC | **REJECTED** | Covers awarded **labour** rates on professional-services schedules, not product prices |
| Public issuer disclosure as a substitute for licensed weights | **BLOCKED_DATA** | Issuer volumes are company-level, not specification-level; at least one key filing redacts unit and unit-price cells; circulating FY figures are secondary and their unit multiplier is unresolved **[VERIFIED FACT, source study §4]**. **There is no open substitute for licensed weights at the required grain** |
| A photonics equity wrapper as a price proxy | **REJECTED** | Measures expected profits of a small vendor set |

---

## 19. PH-2 conclusion

Per-candidate states. **No candidate is selected. No candidate is ranked. PH-3 decides.**

**Candidate A — specification-matched merchant price index: CONDITIONALLY_VIABLE.**
*Reason:* methodologically sound, maximally reproducible, and fully under Urdais's control on specification fidelity. Blocked today by rights, not by availability: prices are demonstrably fetchable, and **both merchants whose terms have been read — FS.com and DigiKey — prohibit both the collection method and the publication of the result**, each naming written consent as the route through. Optcore independently bars Urdais's crawler class by name. What keeps this CONDITIONALLY_VIABLE rather than BLOCKED is that a substantial set of price-publishing merchants (CDW, Vitex, FiberMall, LINK-PP, and the broadline distributors) have terms that are **unread** — which is UNKNOWN, and must not be converted to BLOCKED.
*Conditions:* gates A-1 through A-7 (§16), with A-1 now satisfiable by **either** written consent from a barred merchant **or** a terms review establishing an unbarred one. A-6 has already failed once on real data: PH-2A found retiming architecture routinely absent from listing text, so the gate now additionally requires a demonstrated method for resolving key field 4 when the listing is silent.
*If A-1 fails on both routes:* the candidate becomes **BLOCKED_RIGHTS**, and with it B, B2 and D.

**Candidate B — client-optics cost index: CONDITIONALLY_VIABLE.**
*Reason:* economically meaningful, but as briefed it is weight-bearing and therefore inherits both A's collection problem and C's licensing problem.
*Conditions:* A's gates, plus weights at §7.2 grain with documented vintage.
*Noted variant:* **B2, topology-weighted**, replaces licensed weights with a published, versioned reference fabric and is **CONDITIONALLY_VIABLE with no licensed dependency at all** — gated on A's collection consent and on gate B-3, a topology defensible from citable public engineering documents.

**Candidate C — licensed specification-level ASP: BLOCKED_RIGHTS for LightCounting and Cignal AI; UNKNOWN for Omdia; FALSIFIED for client optics via Dell'Oro.**
*Reason:* LightCounting's report text and Cignal's subscription agreement both prohibit redistribution and derivative works in terms Urdais has read — and both name written permission as the route through. Omdia neither grants nor prohibits publicly, which is UNKNOWN and must not be recorded as blocked. Dell'Oro's ASP is an optical-transport ASP and does not measure the client-optics object.
*Conditions:* gates C-1 through C-7 (§16). The decisive one is C-2 — whether the provider prices below the rate. On public documentation, **LightCounting is the only provider whose grain is described at or near the §3 key**; Omdia's grain is the single most valuable unknown in the audit.

**Candidate D — hybrid public price + licensed weights: CONDITIONALLY_VIABLE.**
*Reason:* mathematically ordinary and rights-narrower than C — it asks a provider for weights, not for their price model, and leaves every published price reproducible. It does not escape A's collection blocker; it escapes C's.
*Conditions:* A's gates, plus weights at §7.2 grain, plus explicit written publication/API/MCP language, plus a weight-lag sensitivity test (D-4, empirical — no threshold can be set in advance), plus an agreed mitigation for the weight-reconstruction property in §7.4.

**Candidate E — coherent DCI family: CONDITIONALLY_VIABLE.**
*Reason:* the cleanest economic object in the audit, with the best-documented provider fit (Dell'Oro ZR/ZR+ ASP by speed) and the best cadence (quarterly). Its weakness is structural rather than methodological: effectively a single-provider dependency, with contract terms unread.
*Conditions:* gates E-1 through E-6, including a documented position on the single-source risk.

**Candidate F — public validation layer: VIABLE as supporting infrastructure; FALSIFIED as a UPPI candidate.**
*Reason:* BLS and Census series are the cleanest rights in the vertical and are genuinely useful as a negative control and context panel. They measure an industry and a residual customs basket, not transceivers. No evidence found in this pass overturns PH-1 finding 5.
*Conditions:* none to remain a validation layer. Display constraints in §9 are mandatory, not advisory.

**Ontology — VIABLE.**
*Reason:* IEEE 802 standards are free through the GET Program, MSAs and OIF publish openly, vendor datasheets publish characteristics and no prices, and specification facts are not copyrightable. It has no provider dependency, is useful under every surviving candidate, costs nothing but maintenance, and converts a future provider switch from a rebuild into a re-mapping.
*Conditions:* gates O-1 through O-4, of which O-2 — the copyright boundary between recording facts and reproducing IEEE text — is the one that must be written down before work starts.

### What PH-2 changed

Three things PH-3 now knows that PH-1 did not.

1. **The merchant blocker moved from unknown to documented, and its shape changed.** PH-1 recorded FS.com's terms as unreadable. PH-2 read them: they **forbid scraping and forbid derivative publication without express written consent**, and DigiKey's do the same. The blocker is a contract, not availability — prices are fetchable — and it is therefore negotiable. The surviving route is the set of price-publishing merchants whose terms nobody has read yet.
2. **The comparison key is shorter than the field list suggests.** Reach, fiber, wavelength plan and lane count are **already inside the PMD designation** and should not be separate stratum fields. Eight fields, not sixteen.
3. **The hybrid architecture has a specific, arithmetic disclosure risk** (§7.4) that must be raised with a provider rather than discovered by one.

### Stop condition

PH-2 ends here. No methodology is selected, no candidate is ranked, no version is assigned, no production code, migration, schema or ingestion exists or is proposed, the UPPI demo is untouched, and nothing is committed. PH-3 selects a methodology once the §16 gates are satisfied by evidence rather than by assumption.
