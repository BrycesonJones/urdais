# PH-3 — Photonics research close-out

**Status: formal close-out record. Internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 23 September 2026.

**This document closes the Photonics investigation for MVP purposes.** It writes no production code, no migration, no ingestion and no frontend change, builds no ontology, fabricates no price data, and creates no PH-4 implementation plan. Nothing is committed.

**It is written to be read months from now by someone who has not seen PH-1 or PH-2.** Every conclusion needed to act is restated here. The earlier artifacts are evidence, not prerequisites.

---

## 0. The decision, up front

### SHOULD URDAIS IMPLEMENT UPPI NOW?

## DEFERRED_PENDING_DATA_RIGHTS

**UPPI is not required for the Urdais MVP, and it is not implementable today. The binding constraint is a written publication right, not data availability, not methodology, and not cost.**

That distinction is the single most important sentence in this document, because it determines what reopening looks like.

- **Data exists at adequate grain.** LightCounting's public abstract puts *pricing* on a rate × reach × form-factor × architecture grid — retimed, LPO, LRO, CPO/NPO — across more than 100 categories **[VERIFIED FACT, PH-1 external pass]**. That is the product identity UPPI needs.
- **Prices exist and are fetchable.** On 23 September 2026 a Cisco OSFP-800G-DR8 was publicly listed at CDW (list $10,791.78, advertised $7,464.99) and a compatible 800G QSFP-DD DR8 at Vitex at $1,100 **[VERIFIED FACT, PH-2A §2.3–2.4]**.
- **The methodology is settled enough to build.** PH-1 produced a comparison key, an index-number architecture, and six stress tests that separate a genuine price index from a mix artefact.
- **What does not exist is permission.** Every source that has the right data prohibits, or has not granted, the right to publish something derived from it. FS.com's Terms of Use forbid *"any data mining, scraper, spider robots, or similar data gathering or extraction methods"* and forbid reproduction, distribution or derivatives without express written consent **[VERIFIED FACT, terms last updated 9 Dec 2022]**. DigiKey's forbid automated access and forbid publishing content **[VERIFIED FACT]**. Cignal AI's subscription agreement forbids derivative works outright **[VERIFIED FACT]**. LightCounting's report text forbids redistribution without expressed permission **[VERIFIED FACT]**. Omdia routes all external use through pre-approval **[VERIFIED FACT]**.

**A secondary feasibility gap also exists and is recorded so it is not forgotten:** even with rights, a merchant panel has **no legitimate historical backfill** at 12, 24 or 36 months **[VERIFIED FACT, PH-2A §4]**, and merchant listings **frequently do not state retiming architecture** — a field that price identity requires **[VERIFIED FACT, PH-2A §2.4, §3]**. Rights is the *primary* blocker because it gates every path; feasibility is a *second* gate that the merchant path must also clear.

**What this decision is not.** It is not "we couldn't find data." The research located the data, priced part of it, identified its grain, and established exactly which sentence in which contract stands in the way. That is a finished piece of work, and §12 converts it into objective reopening conditions.

**Urdais should now move to the Power Index. Photonics does not block the MVP and has no open work items.**

---

## 1. Artifact reconciliation

Six artifacts, produced by two independent research passes, are closed out here.

| Artifact | Pass | Role |
|---|---|---|
| `ph-1-uppi-benchmark-methodology.md` | PH-1 methodology | Economic object, index-number analysis, normalisation, candidate architectures, stress tests |
| `ph-1-external-research.md` + `ph-1-source-matrix.json` | PH-1 external | Provider landscape, taxonomy, frequency, existing benchmarks |
| `ph-2-source-rights-research.md` + `ph-2-source-rights-matrix.json` | PH-2A rights | Terms read in full, merchant census with observed prices, ontology source map, cost matrix |
| `ph-2-feasibility-audit.md` + `ph-2-feasibility-matrix.json` | PH-2B feasibility | Feasibility states, comparison key, hybrid-weight analysis, entry gates |

**Preservation note.** `ph-1-uppi-benchmark-methodology.md` existed only in a session scratchpad and would have been lost. It has been copied into `docs/research/photonics/` as part of this close-out. **[ACTION TAKEN]**

### 1.1 Where the artifacts disagreed, and what governs

Documented rather than smoothed over, because a future reader will otherwise re-derive them.

| # | Disagreement | Resolution — strongest available evidence governs |
|---|---|---|
| 1 | **FS.com terms.** PH-1 and the first draft of PH-2B recorded them as *unreadable* (HTTP 202, zero bytes). PH-2A **read them in full**. | **PH-2A governs.** The terms exist, were read, and prohibit both the collection method and derivative publication. *A failed fetch is not evidence that no terms exist.* PH-2B was corrected before filing |
| 2 | **Merchant price visibility.** PH-2B's transport probe concluded no merchant served a public price to a non-browser client. PH-2A **fetched real prices** from CDW and Vitex. | **PH-2A governs.** Prices are available. The blocker is the licence, not availability. PH-2B was corrected before filing |
| 3 | **Ontology rights.** PH-2B classified the ontology **VIABLE**, reasoning that specification facts are not copyrightable. PH-2A classified a commercial database of facts extracted from IEEE standards as **AMBIGUOUS_REQUIRES_LEGAL_REVIEW**. | **PH-2A governs as the more conservative and better-evidenced position.** Neither pass read IEEE's GET Terms and Conditions, so PH-2B's position rests on a legal proposition rather than on a source. See §7, which splits the ontology by document family — the OSFP, QSFP-DD and OIF portions carry **express** distribution grants; the IEEE-derived portion does not |
| 4 | **Candidate lettering.** Four different A–G schemes exist across the artifacts and this prompt. | Crosswalk in §5.1. **The PH-3 lettering is canonical from here.** |
| 5 | **Cost of LightCounting.** The $5,995 figure appears in several places. | It is a **single-report sticker price**, not an access licence, not a historical-file price, and **not a publication right**. PH-2A states the point plainly: budgeting $5,995 as the cost of UPPI "would buy a PDF the terms forbid Urdais to turn into a public number" |

No disagreement was found on the economic findings. Both passes independently concluded that rate alone is not a product identity, that no daily market exists, and that client optics and coherent DCI are different markets.

---

## 2. Settled findings carried forward

Restated compactly so this document stands alone. Each was established by the artifacts above and is **not reopened without new evidence**.

1. **Rate alone is not a product identity.** At 800 Gb/s, IEEE P802.3dj's adopted objectives alone define **eight distinct optical PMDs**, from 500 m parallel SMF to 40 km **[VERIFIED FACT]**. Add form factor, retiming architecture, coding and port multiplicity and "800G transceiver" names a family, not a product.
2. **No daily or weekly optical-transceiver price market exists.** The fastest credible cadence is monthly for merchant offers and quarterly for professional constructs. Interpolation of quarterly data into daily values is prohibited (§10).
3. **Client/datacom optics and coherent DCI are different economic markets.** An 800GBASE-DR8 and an 800ZR share a nameplate and nothing else — different silicon, different suppliers, different buyers, and a host coherent-software licence on one and not the other **[VERIFIED FACT]**.
4. **Product ontology and economic observation are separate layers.** The ontology is provider-neutral; providers map onto it. Replacing a price provider must never change the meaning of `800GBASE-DR8`.
5. **Public macro proxies are not UPPI.** BLS PCU33423342 is a whole-industry index that moved in the third decimal place across three 2026 months. HTS 8517.62.00.90 is the *residual* "Other" line after modems and switching/routing are broken out. Both are context; neither is a transceiver price.
6. **Merchant pricing is not cleared.** Terms read at FS.com and DigiKey prohibit the required behaviour. Other merchants' terms are unread — **UNKNOWN, not blocked**. No merchant history exists. Retiming architecture is often absent from listings.
7. **Commercial ASP data exists; publication rights do not.** LightCounting has the grain and bans redistribution. Cignal bans derivative works and does not document an ASP field at all. Omdia has the products and unresolved grain and rights. Dell'Oro is the DCI/ZR source, not a client-optics source.
8. **Licensed weights do not route around the rights problem.** No weights-only licence is documented anywhere. An index whose weights are a provider's unit file is a derivative of that provider's data even if no provider number is ever displayed. **Do not design around vendor licensing.**

---

## 3. Task 1 — the future economic object

### 3.1 The statement

> **UPPI is intended to measure the change over time in the price of a precisely specified optical connectivity capability, holding that capability constant.**

> **UPPI is not intended to measure:** shipment-weighted industry average selling price; what any hyperscaler pays; the total cost of building a network; the cost of optical bandwidth per bit; the revenue or margin of optical vendors; or the price of "optics" as an undifferentiated category.

### 3.2 Which economic object, and why only one

The candidate objects considered across PH-1 were: constant-quality transceiver pricing, shipment-weighted industry ASP, channel acquisition pricing, cost per optical bandwidth, and cost of connecting a reference cluster.

**The intended object is constant-quality price change. [METHODOLOGICAL JUDGMENT, consistent with both PH-1 passes.]** The reasoning:

- **Shipment-weighted ASP is a market statistic, not a price index.** PH-1's stress tests showed a unit-value/ASP construction printing **+11%** and **+20%** in periods when *every constituent price fell*, and **−19.7%** on a pure reach-mix shift with no price changing at all. It is a legitimate thing to know and a dangerous thing to call a price index. It is also the object Urdais can least reproduce, since a modelled ASP cannot be audited by a third party.
- **Cost per optical bandwidth is a derived presentation, not an object.** Dividing price by nameplate rate is a hedonic quality adjustment with the bandwidth coefficient silently forced to 1.0 and every other characteristic set to zero. It mechanically manufactures a ~50% decline at each generational doubling, whose magnitude is a property of the standards roadmap rather than of the market.
- **Cost of connecting a reference cluster is a different, also-valid object** — and it is a *cost* index that deliberately mixes price and architecture. It must never be blended with a price index. It is preserved separately as candidate G.
- **Channel acquisition pricing is the likely observable, not the object.** If UPPI is ever built on merchant offers, the object remains constant-quality price change and the *observation basis* is the channel. That distinction must survive into the name.

### 3.3 Naming discipline, fixed now

**If UPPI is ever built on channel or listed prices, the published identifier must say so** — mirroring the existing `UCPI-H100-SXM-LISTED` precedent in this repository. A listed-price index must never be presented as, or named as, industry ASP or market price. **[METHODOLOGICAL JUDGMENT, binding on any future implementation.]**

---

## 4. Task 2 — the future product family

Conceptual only. **No product identifier is reserved, approved, or implied by this section.** Creating IDs would imply an approved methodology, and none exists.

```
Photonics (domain)
│
├── Client / datacom optics          ← the intended home of "UPPI"
│     └── specification-aware series, one per comparison key (§5)
│           e.g. client · 800G · 800GBASE-DR8 · retimed · OSFP · <coding>
│
└── Coherent DCI                     ← a SEPARATE family, never a sub-series of the above
      └── specification-aware series
            e.g. coherent · 800ZR · <form factor>
```

Three structural rules for whoever builds this:

1. **The split between client optics and coherent DCI is at the top of the tree, not inside an instrument list.** It is the first field evaluated in the comparison key (§5) and it precedes every other comparison. A future engineer must not be able to place an 800ZR series under the client family by configuration.
2. **The leaf is a specification-aware series, never a nominal rate.** "800G" is a navigation label at most. It is not an instrument.
3. **Candidate G (reference-fabric BOM) is a different economic object and would sit beside both families, not inside either.** It is a cost index; these are price indices.

**Not decided here:** whether the client family is called UPPI and the DCI family something else, or whether both sit under a common photonics prefix. That is a product-naming decision for whoever reopens the work, and it should follow §3.3's naming discipline.

---

## 5. Task 3 — the frozen product identity model

**Purpose of this section: to make it impossible for a future engineer to return to `rate = 800G; price = X` as the whole product definition.**

### 5.1 Candidate crosswalk (canonical from here)

| PH-3 letter | Name | PH-2B letter | PH-2A path | PH-1 methodology |
|---|---|---|---|---|
| **A** | Specification-matched merchant price index | A | A | A (UPPI-LISTED) |
| **B** | Licensed specification-level professional ASP | C | B | C (UPPI-ASP) |
| **C** | Client-optics cost / bandwidth index | B | — | — |
| **D** | Hybrid permitted prices + licensed weights | D | C | — |
| **E** | Coherent DCI pricing | E | D | — |
| **F** | Public government validation / context series | F | E | D (trade unit value) |
| **G** | Reference-fabric optical BOM / UPPI-CONNECT | B2 | — | B (UPPI-CONNECT) |

### 5.2 The comparison key

| Field | Classification | Observability | Why |
|---|---|---|---|
| **`application_class`** (`client_datacom` / `coherent_dci` / `access_transport`) | **REQUIRED_FOR_PRICE_IDENTITY** | Reliable | Settled finding 3. Evaluated first; gates every other comparison |
| **`pmd_designation`** (exact IEEE PMD / OIF IA / MSA name: `800GBASE-DR8`, `2×400GBASE-FR4`, `800ZR`) | **REQUIRED_FOR_PRICE_IDENTITY** | Reliable — merchants state it | **The composite field.** Encodes reach, fiber type, wavelength plan and lane count in one canonical token |
| **`module_aggregate_rate`** | **REQUIRED_FOR_PRICE_IDENTITY** | Reliable | Partly implied by PMD, and retained for two clear reasons: **(a)** draft and vendor-defined designations do not reliably encode it, and **(b)** twin-port modules break the implication (an 800 Gb/s module presenting 2×400 Gb/s). **Rule: where rate and PMD conflict, PMD wins.** |
| **`retiming_architecture`** (`retimed` / `lro` / `lpo` / `cpo_npo`) | **REQUIRED_FOR_PRICE_IDENTITY** | **UNRESOLVED** | The DSP is a leading cost element and LPO exists to remove it, so this genuinely separates products. **But PH-2A found listings that state neither "LPO" nor "retimed"** — and inferring one from the absence of the other is explicitly rejected (§6). A future panel must resolve this from the manufacturer part number, not from listing prose |
| **`form_factor_family`** (`QSFP-DD` / `QSFP-DD800` / `QSFP-DD1600` / `OSFP` / `OSFP1600` / `OSFP-XD` / `QSFP112`) | **REQUIRED_FOR_PRICE_IDENTITY** | Reliable | Not insert-compatible with one another. A cage change is a product change |
| **`commercial_coding`** (`merchant_generic` / `oem_coded` / `infiniband_coded`) | **REQUIRED_FOR_PRICE_IDENTITY** | Usually stated | §6 establishes a materially different price level. Different warranty, firmware, support and buyer |
| **`port_multiplicity`** (`single_port` / `twin_port`) | **REQUIRED_FOR_PRICE_IDENTITY** | Reliable | NVIDIA's twin-port OSFP presents 2×400 Gb/s through two connectors. Module rate, endpoint rate and port count are three different numbers |
| **`standard_status`** (`ratified` / `draft` / `msa` / `vendor_defined`) | **ATTRIBUTE_ONLY — mandatory to record** | Reliable | **Refined from PH-2B, which called it a required disambiguator.** Two modules differing only in whether their PMD is ratified are the *same product with different provenance*. It is a key-stability flag, not an identity field — but it must be recorded, because P802.3dj names can move |
| `reach`, `fiber_type`, `wavelength_configuration`, `lane_count` | **REDUNDANT as identity; ATTRIBUTE_ONLY** | Derived | Fully determined by `pmd_designation`. Storing both invites contradictory records |
| `coherent_or_direct_detect` | **REDUNDANT** | Derived | Determined by `application_class` + `pmd_designation` |
| `protocol / ecosystem` | **REDUNDANT** | Derived | Collapsed into `commercial_coding` |
| `connector` (MPO-12 vs MPO-16 APC) | **ATTRIBUTE_ONLY** | Stated | Usually determined by PMD but varies within one; record it, split on it only if observed prices separate |
| `manufacturer`, `manufacturer_part_number` | **ATTRIBUTE_ONLY** (MPN is the *observation identifier*) | Reliable | Needed for matched-model linking and dispersion diagnostics, not for stratum identity |
| `lifecycle_state`, `standard_version`, `CMIS revision` | **ATTRIBUTE_ONLY** | Varies | EOL clearance is a known outlier source; a CMIS revision mismatch is not a different PMD |

**Net: seven fields carry price identity, one is mandatory provenance, and everything else is an attribute.** The list is shorter than it looks precisely because the PMD designation already carries four of the facts a naive schema would duplicate.

---

## 6. Task 4 — OEM versus compatible policy

### 6.1 The evidence

On 23 September 2026, for nominally the same optical specification — 800G DR8, 500 m, single-mode:

| Offer | Price |
|---|---|
| Cisco OEM `OSFP-800G-DR8=` at CDW | **$10,791.78 list / $7,464.99 advertised** (a lower sign-in price exists) **[VERIFIED FACT, PH-2A §2.3]** |
| Compatible 800G DR8 offers inspected | **≈$900–$1,250** **[VERIFIED FACT, PH-2A §16]** |
| Vitex compatible 800G QSFP-DD DR8 | **$1,100**, in stock **[VERIFIED FACT, PH-2A §2.4]** |

That is roughly a **six- to eight-fold** spread on the same PMD.

### 6.2 The policy

**Binding on any future implementation. [METHODOLOGICAL JUDGMENT, on the evidence above.]**

1. **`commercial_coding` is a price-identity field.** It is in the key (§5), not an attribute.
2. **OEM and compatible are separate strata. They are never averaged, under any weighting, for any reason.** A single stratum spanning both would be dominated by whichever happened to be sampled, and the resulting series would move on sample composition rather than on price. This is the same failure that disqualified unit-value constructions in PH-1's stress tests.
3. **They are different goods, not different prices for one good.** OEM modules carry manufacturer warranty, qualified firmware, support entitlement and switch-vendor lock-in. Compatible modules do not. The spread is not a discount; it is a different product.
4. **Neither universe is preferred by this close-out, and the choice cannot be made without the SKU census** that PH-2 identified as a required gate. What each answers:
   - *OEM/coded universe* — closer to what an enterprise buying through a vendor channel pays; fewer observable SKUs; prices are frequently gated behind sign-in.
   - *Compatible/merchant-generic universe* — far more observable breadth; represents a buyer without OEM qualification requirements; further from hyperscale procurement.
5. **Whichever is chosen, the published series must name it.** "Listed OEM-coded" and "listed compatible" are different claims and must read differently to a user.
6. **Absent a stated coding, an observation is not admissible.** An offer whose OEM/compatible status cannot be determined is dropped, not defaulted.

---

## 7. Task 5 — candidate close-out

Two dispositions per candidate, because they answer different questions: **design disposition** (is the idea worth keeping?) and **current status** (can it be built?). No ranking.

### A — Specification-matched merchant price index
- **Economic object:** constant-quality price change of a specified optical capability, observed from channel offers.
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** methodologically sound and maximally reproducible — every observation is a URL, a date and a number. Blocked by contract at both catalogues whose terms were read (FS.com, DigiKey), each prohibiting the collection method *and* derivative publication. Optcore independently bars Urdais's crawler class by name in `robots.txt`.
- **Unresolved blockers:** (1) publication rights; (2) no legitimate historical backfill at 12/24/36 months; (3) `retiming_architecture` not reliably derivable from listing text; (4) terms unread at the price-publishing merchants (CDW, Vitex, FiberMall, LINK-PP, Mouser, Arrow, Avnet) — **UNKNOWN, not blocked**.
- **Reopening evidence:** written consent from one merchant covering automated collection, storage and derived publication; **or** a terms review establishing a merchant that does not bar it — plus a SKU census, a repeat-observation pilot, cross-merchant dispersion, and a demonstrated method for resolving retiming architecture.

### B — Licensed specification-level professional ASP
- **Economic object:** shipment-weighted industry ASP within a specification category.
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** LightCounting is the only source whose public abstract places pricing on a rate × reach × form-factor × architecture grid, and its report text forbids redistribution without expressed permission. Cignal AI forbids derivative works outright and does not document an ASP field at all. Omdia's grain and rights are unresolved. Dell'Oro's ASP is an optical-*transport* ASP and does not measure client optics.
- **Unresolved blockers:** derived-publication rights at every provider; Omdia's pricing grain; whether any provider's ASP separates DR8 from 2×FR4 from LPO; revision policy; publication-licence cost.
- **Reopening evidence:** the seventeen Omdia answers in §9, or their equivalents from another provider — critically including written derived-publication rights.
- **Note:** this candidate has the **best historical depth of any** (LightCounting actuals 2022–2025) and the **worst reproducibility** (a modelled ASP cannot be audited by a third party). Both facts survive into any future selection.

### C — Client-optics cost / bandwidth index
- **Economic object:** the cost of client optical bandwidth inside the data centre, in index form.
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** economically meaningful and answers the question the prototype's `$/Gbps` remark was reaching for, but it is weight-bearing by construction and therefore inherits **both** A's collection blocker and B's licensing blocker.
- **Unresolved blockers:** everything in A and B, plus a frozen rule for nameplate bandwidth and a published treatment of breakout double-counting.
- **Reopening evidence:** A unblocked **and** weights available at key grain — or a decision to build G instead, which reaches a related question without a licensed weight.

### D — Hybrid permitted prices + licensed weights
- **Economic object:** self-observed specification-level prices aggregated with provider shipment weights.
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** the architecture is mathematically ordinary — it is a Lowe/Laspeyres construction, and running externally sourced weights against internally observed relatives is what official statistics do routinely. It asks a provider for less than B does. **It does not escape the rights problem:** no weights-only licence is documented anywhere, and an index whose weights come from a provider's unit file is a derivative of that data even if no provider number is displayed.
- **Unresolved blockers:** A's collection consent; a weights-only licence that does not exist publicly; explicit publication/API/MCP language; **and a disclosure risk that must be raised proactively** — over enough periods, published sub-indices plus a published aggregate make the provider's weight vector algebraically solvable (with monthly cadence and eight strata, within roughly eight months).
- **Reopening evidence:** a contract containing, in substance, *"subscriber may publish an index whose weights are computed from your unit file, without displaying units, shares or ASP, including via an API, for the life of the index, including after termination, with stated attribution"* — plus an agreed mitigation for the reconstruction property, plus a weight-lag sensitivity test.

### E — Coherent DCI pricing
- **Economic object:** price of pluggable coherent optics for data-centre interconnect (400ZR, 400ZR+, 800ZR, 800ZR+).
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** the cleanest economic object in the whole investigation, with the best cadence (quarterly) and the clearest provider fit — Dell'Oro publishes ASP by speed for ZR/ZR+ plugs. Blocked on unread contract terms and an unresolved ZR-versus-ZR+ split.
- **Unresolved blockers:** Dell'Oro's contract and publication terms; whether ZR and ZR+ are separate ASP rows; pluggable-versus-embedded separation; whether host coherent-software licences are inside or outside the module ASP; **effective single-provider dependency**.
- **Reopening evidence:** Dell'Oro terms read; grain confirmed; a documented position on single-source risk; a quote.
- **Note:** this is the candidate most likely to be unblocked by a single conversation, and the one with the least source redundancy if it is.

### F — Public government validation / context series
- **Economic object:** none relevant to transceivers.
- **Design disposition: CONTEXT_ONLY.** **Current status: AVAILABLE NOW.**
- **Reason:** BLS PCU33423342 and HTS 8517.62.00.90 have the cleanest rights in the vertical — free, attribution-only — and measure an industry and a residual customs basket respectively. Useful as a **negative control** (a divergence from a future licensed ASP is itself a finding) and as a context panel.
- **Unresolved blockers:** none. It is not blocked; it is simply not UPPI.
- **Binding display constraints if ever surfaced:** index points only, **never a dollar level**; basket definition carried **in the series name**, not a footnote; never routed under a UPPI identifier; methodology text must forbid multiplication by an assumed base dollar.

### G — Reference-fabric optical BOM / UPPI-CONNECT
- **Economic object:** the cost of the optical bill of materials for one published, versioned reference AI fabric, in $ per GPU and $ per delivered Tbps.
- **Design disposition: PRESERVE_FOR_FUTURE.** **Current status: BLOCKED.**
- **Reason:** the most differentiated idea produced by the investigation — no market-research firm publishes it — and **the only candidate with no licensed-data dependency at all**, because the reference topology supplies the quantities that every other design must license as weights. It is nonetheless blocked, because it consumes candidate A's price observations and A is blocked.
- **Unresolved blockers:** A's collection consent; and a reference topology that is **derivable from citable public engineering documents rather than invented** — an unproven condition.
- **Reopening evidence:** A unblocked, plus a defensible published topology.
- **Note:** this is a **cost** index that deliberately mixes price and architecture. It must never be blended with, or presented as, a constant-quality price index, and a topology version change must be a documented methodology event, never a silent edit.

---

## 8. Task 6 — DO NOT REINTRODUCE WITHOUT NEW EVIDENCE

**This section is institutional memory. Each item was examined and rejected on evidence. Reintroducing any of them requires new evidence that specifically overturns the stated reason — not a new opinion, and not the observation that it would be convenient.**

| # | Approach | Why it was rejected |
|---|---|---|
| 1 | **Generic rate-only price series** ("800G Optical Transceiver Price") | Names a family, not a product. Eight optical PMDs exist at 800 Gb/s in one standard before form factor, architecture or coding |
| 2 | **Uncontrolled "800G average price"** | A single merchant category page spans an SR8 at $650 to a 200G-per-lane FR4 at $3,500. The average measures which cards were on the page |
| 3 | **Mixing DR8, FR variants, LPO and retimed in one series** | Different fiber plant, different optical multiplexing, different DSP content. Not substitutes on any link |
| 4 | **Mixing client optics and coherent DCI** (e.g. DR8 with 800ZR) | Different silicon, suppliers, buyers and reach class; one carries a host coherent-software licence and the other does not |
| 5 | **Daily or weekly synthetic pricing** | No daily optical price market exists at any level. The prototype's 1D/1W changes are generator artefacts with no referent |
| 6 | **Interpolating quarterly or semi-annual observations into daily values** | Fabricates observations; falsifies every volatility, drawdown and correlation a user computes; destroys the revision audit trail |
| 7 | **Customs unit values labelled as transceiver ASP** | HTS 8517.62.00.90 is the residual "Other" line after modems and switching/routing are broken out; mixes rates, reaches, form factors and related-party transfer values |
| 8 | **Communications-equipment PPI labelled as UPPI** | Whole-industry index; moved in the third decimal place across three consecutive 2026 months |
| 9 | **Scraping FS.com or DigiKey**, or using the DigiKey API to fill a public series | Both sets of terms forbid the collection method and the publication. A permissive `robots.txt` does not override terms — **terms govern** |
| 10 | **Internet Archive copies of those catalogues** as history or as a workaround | Routing around a prohibition is still the prohibited use |
| 11 | **Commercial analyst data republished, rebased, or exposed via API without written derived-publication rights** | No provider grants it publicly; Cignal forbids derivative works expressly; LightCounting forbids redistribution without expressed permission |
| 12 | **Revenue ÷ unit pseudo-ASP using mismatched categories** (e.g. segment revenue ÷ one speed's units) | The numerator and denominator do not share a denominator. The result is a number with no economic referent |
| 13 | **Forecast columns presented as observations** | Every major provider file mixes history and forecast in one deliverable. A hard cut at the last actual period is mandatory |
| 14 | **OEM and compatible optics silently averaged** | A six- to eight-fold observed spread on the same PMD (§6). They are different goods |
| 15 | **Inferring LPO from the absence of "retimed"**, or the reverse | Merchant listings frequently state neither. Absence of a label is not a value |
| 16 | **Dell'Oro optical-transport ASP, or AI back-end switch-port ASP, used as a client module price** | Wrong economic object in both cases |
| 17 | **Assuming a weights-only licence exists because it would be convenient** | None is documented anywhere. Design around the rights problem is not permitted |
| 18 | **Publishing a channel/listed price index under a name implying market or industry ASP** | The observation basis must survive into the identifier (§3.3) |
| 19 | **Splicing two different price concepts to manufacture a longer history** | A merchant panel joined to a licensed ASP history is two objects with a structural break, not one series |
| 20 | **Treating absence of terms as permission** (FiberMall's 404 terms page, ProLabs, ColfaxDirect) | Absence of terms is a risk, not a grant |

---

## 9. Task 7 — ontology status

## APPROVED_CONCEPTUALLY — BUILD DEFERRED

The photonics ontology is conceptually sound, provider-independent, and the one asset from this investigation that would survive any change of price source. **It should not be built now**, because its only consumer is a deferred product and there is no compelling reason to build it independent of UPPI.

### 9.1 The rights position, reconciled

PH-2B and PH-2A disagreed here (§1.1 item 3). **The conservative position governs**, and the correct resolution is to split the ontology by document family rather than to issue one verdict:

| Document family | Reuse position |
|---|---|
| **OIF implementation agreements** (e.g. OIF-800ZR-01.0) | **Express grant.** The notice permits copying, and permits derivative works "that comment on or otherwise explain it or assist in its implementation" to be prepared, published and distributed, provided the copyright notice is kept and the document itself is not modified **[VERIFIED FACT]** |
| **QSFP-DD Hardware Rev 7.1** | **Express grant.** "You are authorized to download, reproduce and distribute this document. All other rights are reserved." No patent licence **[VERIFIED FACT]** |
| **OSFP Module Specification Rev 5.1** | **Express grant** to download, reproduce and distribute under the OSFP MSA Agreement. No other IP licence **[VERIFIED FACT]** |
| **IEEE 802.3 standards** (via the GET Program) | **AMBIGUOUS — REQUIRES LEGAL REVIEW.** GET provides the standard at no cost; that is a right to *obtain* it. Whether a commercial database of facts extracted from it is permitted was **not established** — IEEE's GET Terms and Conditions were not read by either pass. **Verbatim clause text is IEEE copyright and must never be copied into Urdais** |
| **LPO MSA specification** | **UNKNOWN.** The announcement is public; the specification's own reuse notice was not read. **Do not assume the QSFP-DD sentence applies** |
| **Manufacturer datasheets** (Cisco, NVIDIA, Vitex, Lumentum) | Not cleared for a database. Use as *evidence of what is sold*. The ontology key must be the standard name, never the vendor part number |

**Consequence: conceptual approval does not authorise copying standards text.** A future build must record normalised facts and cite document identity and revision — never reproduce clause text or tables — and must obtain a legal read on the IEEE-derived-facts question before that portion is populated.

### 9.2 What a future implementation should own

| Layer | Owned canonically by Urdais |
|---|---|
| **Canonical product identity** | The seven price-identity fields of §5, with closed vocabularies |
| **Standards references** | Standards body, document identifier, revision, and the PMD name as the body spells it |
| **Revision / version** | Document revision is stored, never collapsed. Earlier revisions remain valid keys |
| **Draft / final status** | `standard_status`, recorded as provenance (§5). A draft-referenced key is marked as such, never promoted silently |
| **Provider mappings** | A **versioned per-provider concordance** from each provider's category labels onto `pmd_designation`. Never by renaming Urdais's own canonical terms. **Where a provider's category is only "800G", the mapping fails and that provider cannot feed that instrument — that is a data defect, not a reason to coarsen the key** |
| **Manufacturer / SKU mappings** | Manufacturer part number → canonical key, as an attribute layer |
| **Provenance** | For every fact: source document, revision, retrieval date, and evidence class |

---

## 10. Task 8 — the rights package that would unblock commercial data

A commercial requirements specification for vendor conversations. **Not legal advice and not contract language.**

### 10.1 The distinction that governs everything

> **An ACCESS LICENCE lets Urdais read the data.**
> **A DERIVED PUBLICATION / REDISTRIBUTION LICENCE lets Urdais publish something computed from it.**
>
> **These are two separate purchases. Every provider examined sells the first. None publicly offers the second.** A subscription, a portal login, or an invoice for a report grants the first and says nothing about the second. **Internal viewing must never be upgraded, by assumption, into storage, display, an index, an API, or retention.**

### 10.2 Required grants

| # | Right | Layer | Why it is separately required |
|---|---|---|---|
| 1 | Ingest licensed observations by machine | Access | A permitted human download is not a permitted automated pull |
| 2 | Store them internally, indefinitely | Access | Series construction requires retained history |
| 3 | Calculate proprietary Urdais derived indices | **Derived** | Computation of a derivative work; distinct from reading |
| 4 | Publish derived **index levels** | **Derived** | |
| 5 | Publish **percentage changes** | **Derived** | Often assumed to be covered by (4); it is not. Ask separately |
| 6 | Publish **historical derived series** | **Derived** | A back-series discloses more than a current value |
| 7 | Distribute via the **Urdais website** | **Derived** | |
| 8 | Distribute via **API** | **Derived** | A machine endpoint is a different distribution channel from a web page |
| 9 | Distribute via **MCP / agent interfaces** | **Derived** | Not contemplated by any standard media clause. **Must be named explicitly** |
| 10 | **Maintain historical continuity after termination** | **Derived** | Determines whether a lapsed contract forces withdrawal of published history — an existential risk for a published index |
| 11 | Disclose methodology and attribution | Both | Urdais must be able to describe how the index is built without breaching confidentiality |
| 12 | Process provider revisions | Both | Restatement handling must be permitted and defined |

### 10.3 Additional terms to settle in the same conversation

- Whether **weights alone** can be licensed without licensing or displaying ASP (§7 candidate D).
- What happens to the derived index on a **provider category restatement** — chain link, series break, or withdrawal.
- Whether the grant is **perpetual for already-published values** or coterminous with the subscription.
- The **price of the publication licence, separately from access** — the two are routinely quoted together and must be separated.
- Whether Urdais's crawler class, currently barred at `/` by LightCounting and Omdia, is unblocked by a licensed relationship.

---

## 11. Task 9 — Omdia reopening conditions

Omdia is the most plausible unblocking path because its grain is **unknown rather than prohibited** — it has the products (units, revenues, ASP across datacom transceivers, coherent optics, ICP data-centre optics and silicon photonics) and has not published a refusal.

**Ask in writing. A verbal conversation may inform research; production rights require written confirmation. A portal login is not an answer, and ambiguity is not permission.**

**Answers that would justify reopening production work — all seventeen:**

| # | Question | What a reopening answer looks like |
|---|---|---|
| 1 | **Exact pricing grain** — what is the atomic priced category? | Finer than nominal rate |
| 2 | Are **PMD, reach, form factor and retiming architecture** distinguishable? Are 800GBASE-DR8, 2×400GBASE-FR4, 800GBASE-VR8 and 800G-DR8-LPO separate ASP rows? | Yes, as separate rows |
| 3 | **Definition of ASP** — vendor revenue ÷ vendor units, a modelled price, or a blend? What share is estimated rather than reported? | A stated construction with a stated estimated share |
| 4 | **Historical actual coverage** — first period Omdia will stand behind, per AI-relevant row | A specific year, not "extensive history" |
| 5 | **Actual vs forecast flags** — how is the boundary marked *in the file*? | Row-level flag |
| 6 | **Update cadence** of the price (not the PDF) and lag after period end | A stated cadence |
| 7 | **Revision policy** — specifically, what the November 2024 telecom pricing correction did to previously delivered history | A written policy |
| 8 | **Units / revenue / ASP alignment** — are they on the same row at the same grain? | Yes |
| 9 | **Derived-index publication rights** | Granted in writing |
| 10 | **Normalized-index publication rights** (rebased to 100) | Granted |
| 11 | **Percentage-change publication rights** | Granted separately from (9) |
| 12 | **API rights** | Granted |
| 13 | **MCP / agent distribution rights** | Granted, named explicitly |
| 14 | **Retention rights** after termination | Published history may remain published |
| 15 | **Access price** | A quote |
| 16 | **Separate publication licence price** | A quote, distinct from (15) |
| 17 | **Whether weights-only licensing exists** | Yes, with a grain |

**The gating answer is #2.** If the atomic category is nominal rate, the dataset cannot support a specification-aware index and questions 9–17 do not matter. **Ask it first.**

Parallel questions should go to LightCounting (substituting their "pricing" field, and asking the process for the *expressed permission* their own clause names), to Cignal AI (first asking whether a price field exists at all, and what their Citation Policy permits), and to Dell'Oro for ZR/ZR+ only.

**One further item, to be raised unprompted:** Urdais's crawler class is barred at `/` in both LightCounting's and Omdia's `robots.txt`. Urdais has honoured that and collected nothing. Saying so first is the strongest available signal of good faith, and it is true.

---

## 12. Task 10 — frequency and history policy

**Binding principles for any future implementation. No synthetic frequency, ever.**

| Principle | Rule |
|---|---|
| **Natural source cadence** | Merchant offers: monthly at best (irregular, sticky). Professional ASP: quarterly (Cignal, Dell'Oro) or semi-annual (LightCounting). Public statistics: monthly. **The index publishes at its source's cadence and no faster** |
| **Observation timestamp** | Every observation records the date it was *observed*, distinct from the period it *describes* |
| **Publication timestamp** | Recorded separately from both. Three dates, never conflated |
| **Stale state** | A series with no new observation past its expected cadence is marked stale on the surface. **Holding the last value flat for display continuity is permitted only if labelled "last observed" and the API returns the real observation date** |
| **Inception date** | Published prominently. A series begins when observation began |
| **Missing periods** | Represented as missing. Never interpolated, never forward-filled into the stored series |
| **Revisions** | Provider restatements are normal. Raw observations are append-only; a correction supersedes rather than edits. Index releases carry a release vintage |
| **Different inception dates across technologies** | **Expected and correct.** 1.6T will have a shorter history than 400G because 1.6T is younger. **A 1.6T series does not need fake history to align visually with 400G.** Charts must tolerate ragged left edges |
| **Change windows in the UI** | The surface exposes only change windows the observations support. A quarterly series has no 1D or 1W change — those elements must be **absent**, not rendered as "N/A" |
| **Forecast** | A hard cut at the last actual period. Forecast rows must be structurally incapable of entering a published index |

---

## 13. Task 11 — prototype disposition

### The current state

The frontend carries `UPPI — Urdais Photonics Price Index` with five instruments named only by nominal rate (100G, 200G, 400G, 800G, 1.6T), a unit of `$/transceiver`, 800G as headline, **entirely synthetic demo data**, and 1-day/1-week changes plus a 7-day intraday series generated from seeds.

### Recommendation

## REMOVE_FROM_PUBLIC_FRONTEND

**Not actioned. PH-3 does not modify the frontend.** This is a recommendation requiring separate authorisation and its own change.

**Reasoning. [METHODOLOGICAL JUDGMENT.]**

1. **The taxonomy is known to be wrong, not merely provisional.** Rate-only instruments are settled finding 1's exact failure. Keeping them on a public surface teaches users a product model this investigation spent two phases disproving.
2. **The most prominent numbers are the least defensible.** A visitor's eye goes to today's change. Those values are generator artefacts for a market that has no daily price at any level.
3. **UPPI is not required for the MVP.** There is no product cost to removal and no user is served by it.
4. **The credibility risk is to the live products, not to UPPI.** The surface also carries genuinely published indices — UCPI, UTVI, UMPI, GBV, Power Delivery. A demo product sitting beside them, distinguishable only by a label, transfers doubt onto the real ones. That asymmetry is the strongest argument here.
5. **A research label does not fix (1) or (2).** `KEEP_PUBLIC_WITH_EXPLICIT_RESEARCH_LABEL` was considered and is weaker: it preserves a wrong taxonomy and synthetic daily movement on a public page, and relies on every reader noticing a label. Labels mitigate *uncertainty*; they do not mitigate *known incorrectness*.

**`KEEP_AS_INTERNAL_DEMO_ONLY` is an acceptable second choice** if there is a UI-development reason to retain a multi-instrument market for layout work — provided it is unreachable from public routes. **Do not preserve an inaccurate public product merely because UI work already exists.**

**If removal proceeds**, the follow-up change should also retire the rate-only instrument definitions rather than leave them dormant, so that a future engineer reopening Photonics starts from §5's key rather than from the prototype's five rates.

---

## 14. Task 12 — reopen triggers

**Objective conditions. Vague triggers such as "when more data becomes available" are explicitly not acceptable.** Reopening requires that a named trigger's verification list be satisfied *in full*.

### Trigger A — Commercial dataset with written derived-publication rights at acceptable cost
**Fires when:** a provider supplies, in writing, the §10.2 rights package (or a defined subset sufficient for the intended surface) at a quoted price Urdais accepts.
**Verify before reopening:**
1. Pricing grain is finer than nominal rate and separates PMD / reach / form factor / retiming architecture (Omdia question 2).
2. Rights 3–10 of §10.2 are granted in writing, with API and MCP named explicitly.
3. Post-termination retention of published history is granted.
4. Actual/forecast boundary is flagged at row level.
5. Revision policy is documented.
6. Units, revenue and ASP align on the same row at the same grain.
7. Access price and publication-licence price are quoted separately.

### Trigger B — Rights-cleared merchant or API source with adequate specification grain
**Fires when:** a merchant or catalogue grants, in writing, automated collection plus derived publication — **or** a terms review establishes a price-publishing merchant whose terms bar neither.
**Verify before reopening:**
1. Written consent, or a terms page read in full that permits both behaviours.
2. SKU census demonstrating the strata can be populated.
3. A demonstrated method for resolving `retiming_architecture` where listings are silent.
4. Cross-merchant dispersion measured on identical specifications.
5. SKU identifier stability confirmed across at least one pilot window.
6. Explicit OEM/compatible separation available in the source data.

### Trigger C — A new public or open dataset that directly measures optical pricing
**Fires when:** a statistical agency, standards body, exchange or open-data programme publishes a series whose *object* is optical transceiver prices at specification grain.
**Verify before reopening:**
1. The series measures transceivers, not an industry aggregate or a residual customs basket.
2. Grain reaches at least PMD level.
3. Licence permits derived publication.
4. Cadence and revision policy are documented.
**Explicitly does not fire on:** a new communications-equipment PPI, a new customs code, or a broader HS breakout, unless it isolates pluggable optical modules by PMD.

### Trigger D — Sufficient prospective rights-cleared observations accumulate
**Fires when:** a rights-cleared collection (from B) has run long enough to support a matched-model index.
**Verify before reopening:**
1. Minimum observation count per stratum met, with the floor derived from measured dispersion rather than asserted.
2. Repeat observations across at least two chain-link candidate periods.
3. Outlier and lifecycle policy defined and tested against real data.
4. Measured list-price volatility supports the intended publication cadence.

### Trigger E — A commercial partnership supplying both data and publication rights
**Fires when:** a provider proposes a co-branded, attributed or partnership structure covering data and publication together.
**Verify before reopening:**
1. All of Trigger A's verification list.
2. Whether attribution or co-branding constrains Urdais's methodological independence.
3. Whether the structure creates a single-provider dependency (acute for candidate E).
4. What happens to the index if the partnership ends.

### Anti-triggers — do **not** reopen on these
- A new prototype, mockup or design asking for a photonics chart.
- Competitor launch of a photonics index.
- A conference announcement, vendor roadmap, or press claim about optical pricing.
- Availability of a dataset whose rights are "probably fine" or "not explicitly prohibited".
- A desire to increase the number of Urdais products.

---

## 15. Task 13 — what happens next

| Work | Classification |
|---|---|
| **UPPI production implementation** | **NO ACTION.** Deferred pending data rights |
| **Photonics ontology build** | **NO ACTION.** Approved conceptually; no compelling reason to build independent of UPPI |
| **Frontend prototype disposition** | **ONE OPEN RECOMMENDATION** (§13). Requires separate authorisation; not a Photonics research task |
| **Vendor outreach — Omdia, LightCounting, Cignal, Dell'Oro** | **MONITOR.** Send the §11 questions if and when a conversation opens. Not a scheduled workstream, and not a blocker for anything |
| **Merchant terms review** (CDW, Vitex, FiberMall, LINK-PP, Mouser, Arrow, Avnet) | **REOPEN ONLY ON TRIGGER B.** Cheap to do, but only worth doing if a merchant path is actually wanted |
| **Public context series (candidate F)** | **NO ACTION** for UPPI purposes. Available if a methodology page ever wants a labelled context panel |
| **P802.3dj ratification** | **MONITOR**, passively. It changes ontology keys, not the rights position. No action required when it lands |

### PH-4

> **PH-4 SHOULD NOT BEGIN.**
>
> Price implementation is deferred. There is no PH-4 implementation phase, and one must not be created because earlier planning assumed a phase count. The next Photonics work item is **whichever trigger in §14 fires first**, and its first step is that trigger's verification list — not a new research phase.

---

## 16. Task 14 — formal close-out record

```
PHOTONICS RESEARCH STATUS      COMPLETE
                               PH-1 and PH-2 executed across two independent passes.
                               No further research is required to make the deferral decision.

UPPI PRODUCTION STATUS         DEFERRED_PENDING_DATA_RIGHTS
                               Data exists at adequate grain. Prices are observable.
                               Methodology is settled. The missing element is a written
                               derived-publication right. A secondary feasibility gap
                               (no merchant history; retiming architecture not in listings)
                               must also clear if the merchant path is chosen.

ONTOLOGY STATUS                APPROVED CONCEPTUALLY — BUILD DEFERRED
                               Provider-independent and durable. OSFP, QSFP-DD and OIF
                               documents carry express distribution grants. The
                               IEEE-derived-facts database question is AMBIGUOUS and
                               REQUIRES LEGAL REVIEW before that portion is populated.
                               Verbatim standards text must never be copied into Urdais.

CLIENT OPTICS STATUS           DEFERRED. The intended home of UPPI. Economic object
                               defined (§3). Comparison key frozen (§5). No source cleared.

COHERENT DCI STATUS            DEFERRED, SEPARATE FAMILY. Cleanest economic object and
                               best cadence in the investigation. Dell'Oro is the
                               documented provider; contract terms unread; effectively a
                               single-provider dependency. Must never be merged with
                               client optics.

MERCHANT PRICE PATH            BLOCKED — RIGHTS.
                               FS.com and DigiKey terms prohibit both the collection
                               method and derivative publication. Optcore bars Urdais's
                               crawler class by name. CDW, Vitex, FiberMall, LINK-PP and
                               the broadline distributors are UNREAD — UNKNOWN, not
                               blocked, and the only route that advances without a
                               negotiation. No legitimate historical backfill exists.

COMMERCIAL ASP PATH            BLOCKED — RIGHTS.
                               LightCounting has the grain and bans redistribution.
                               Cignal bans derivative works and documents no ASP field.
                               Omdia's grain and rights are UNRESOLVED and are the most
                               valuable open question in the vertical.
                               Dell'Oro measures optical transport, not client optics.
                               $5,995 is a report sticker, not a publication right.

PUBLIC PROXY PATH              CONTEXT ONLY — AVAILABLE NOW.
                               BLS PCU33423342 and HTS 8517.62.00.90 are free and
                               attribution-only. Never labelled as UPPI. Index points
                               only; never a dollar level.

MVP REQUIREMENT                NO.
                               Urdais has a sufficient MVP product surface. UPPI is not
                               required and does not block the MVP.

NEXT ACTION                    NONE FOR PHOTONICS. Proceed to the Power Index.
                               One open recommendation, requiring separate authorisation:
                               remove the UPPI demo from the public frontend (§13).
                               PH-4 SHOULD NOT BEGIN.

REOPEN CONDITIONS              Five objective triggers, each with a verification list (§14):
                               A. Commercial dataset + written derived-publication rights
                                  at acceptable cost.
                               B. Rights-cleared merchant/API source with adequate
                                  specification grain.
                               C. New public dataset directly measuring optical pricing
                                  at PMD grain.
                               D. Sufficient prospective rights-cleared observations for a
                                  matched-model index.
                               E. Commercial partnership supplying data and publication
                                  rights together.
                               Anti-triggers listed in §14. Reopening requires a named
                               trigger's verification list satisfied in full.
```

---

## 17. Stop condition

PH-3 ends here, and with it the Photonics investigation for MVP purposes.

No methodology was selected, because none can be built today. No production code, migration, ingestion, schema or frontend change exists or is proposed for implementation. The ontology was not built. No price data was fabricated. No PH-4 implementation plan was created, and none should be. Nothing is committed.

**Photonics leaves this phase in a clean state: the economic object is defined, the product identity model is frozen, twenty failed approaches are permanently recorded, the rights package Urdais would need is specified, and five objective reopening triggers exist. No future engineer needs to repeat PH-1 or PH-2.**
