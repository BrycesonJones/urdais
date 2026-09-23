# PH-1 — UPPI benchmark methodology research

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog. No code, migration, schema, ingestion or frontend change is proposed or made.** Prepared 23 September 2026.

Scope: determine whether "Urdais Photonics Price Index" can become a defensible production benchmark, and if so what it should actually measure. This document does **not** freeze a methodology, does not select a candidate, and does not assess source rights beyond what is needed to keep the candidates grounded — rights are PH-2.

Prior art in this repository that this document builds on rather than repeats:
- `docs/research/photonics-pricing/source-shortlist.md` — 21-entry source study with two-axis rights findings.
- `docs/research/photonics-pricing/iccsz-tender-pricing.md` — Chinese carrier tender channel, assessed and rejected as an index constituent.

**Evidence labelling used throughout.** **[FACT]** — verifiable from the cited primary or near-primary source. **[INFERENCE]** — reasoned from cited facts, not itself cited. **[JUDGMENT]** — methodological opinion, defensible but contestable. **[UNKNOWN]** — not established; requires further research, a pilot, or a vendor conversation.

No market price, shipment volume, vendor share, licensing term or dataset is invented anywhere in this document. All illustrative numbers in §12 are explicitly hypothetical and are labelled as such.

---

## 1. Executive conclusion

**The economic concept is sound and a defensible public benchmark is achievable. The prototype is not a specification for it, and almost nothing in the prototype survives contact with the underlying market.**

Six conclusions drive everything below.

**1. "800G" is not a product. It is one field of a nine-field product key.** IEEE P802.3dj's own adopted objectives define, at 800 Gb/s alone, **eight distinct optical physical-layer specifications** — 4 pairs of SMF to 500 m, 4 pairs to 2 km, 4 wavelengths over a single SMF to 500 m, 4λ to 2 km, 4λ to 10 km, 1λ to 10 km, single SMF to 20 km, and single SMF to 40 km — before form factor, retiming architecture, host protocol or fiber type are considered **[FACT]**. Comparing two unspecified "800G transceivers" is comparing products whose prices can differ by an order of magnitude for reasons that have nothing to do with price change. The prototype's taxonomy is a bandwidth axis presented as a product axis.

**2. `$/transceiver` is only meaningful inside a fully specified stratum, and `$/Gbps` is not the fix.** Dividing by nominal bandwidth is not a neutral normalisation — it is a hedonic quality adjustment in which the coefficient on bandwidth has been silently forced to exactly 1.0 and every other characteristic set to zero **[JUDGMENT]**. That assumption is testable and has never been tested. Treating it as arithmetic rather than as an assumption is the single most consequential unexamined decision in the prototype.

**3. There is no daily optical transceiver price, anywhere, at any level of the market.** The observable price surfaces are merchant list prices (sticky, revised irregularly), negotiated contracts (quarterly to annual), research-firm ASPs (quarterly at best; LightCounting's model refreshes semi-annually) and trade statistics (monthly, ~5 week lag) **[FACT, per the source study and §6]**. The prototype's 1-day and 1-week changes and its intraday series have no referent in the world. They should be deleted, not re-sourced.

**4. Two different, both-legitimate indices are being conflated, and they will move in opposite directions.** A *constant-quality price index* answers "is a given optical capability getting cheaper?" A *cost-of-connectivity index* answers "is it getting cheaper to network an AI cluster?" In a generational transition the first can fall while the second rises. Urdais must build these as separate products with separate names, or it will publish a number that is wrong under both readings.

**5. The open-data route is real but narrow, and it must be named honestly.** A merchant-list-price matched-model index is reproducible, rights-assessable and buildable. It is **not** industry ASP, is **not** what hyperscalers pay, and must never be labelled as either. The trade-unit-value route is a macro cross-check and is disqualified as an index by construction — §12 shows it printing **+11%** and **+20%** in two scenarios where *every single price in the market fell* **[hypothetical, §12]**.

**6. The highest-value action available right now costs nothing and is rights-clean: build the product ontology before building any price series.** IEEE 802.3, the OSFP/QSFP-DD/LPO MSAs, OIF and vendor datasheets are freely readable, permissively crawlable per the existing source study, and publish exactly the characteristic data (rate, lanes, reach, fiber, wavelength plan, modulation, retiming, form factor, power) that every candidate methodology needs and that no price source will supply. The ontology is the load-bearing asset; the price feed is swappable on top of it.

**Provisional lean, offered as [JUDGMENT] and explicitly not as a PH-3 decision:** Candidate **A (matched-model listed-price index)** is the only candidate that is simultaneously buildable, reproducible and affordable today, and Candidate **B (cost-to-connect a reference fabric)** is the most economically meaningful thing Urdais could publish in this vertical and is the differentiated product. They are complements, not alternatives — B consumes A's price observations. Candidate C (licensed shipment-weighted ASP) is the methodological gold standard and is licensing-blocked. Candidate D (trade unit value) is a context indicator and must never carry the UPPI name. §13 sets out the empirical tests that should actually decide this in PH-3.

---

## 2. Definition of the economic measurement problem

### 2.1 What is actually being bought

An optical transceiver is not a final good and is not consumed for itself. It is an intermediate capital input purchased to obtain a **capability**: *move N bits per second, over distance D, on fiber type F, at a given reliability, power and latency, between two specific pieces of switching silicon.* Price change in this market is therefore only interpretable relative to a definition of the capability held constant.

This has a direct consequence that governs the whole design. Three things move at once and are routinely confused:

| What moves | What it is | Example |
|---|---|---|
| The price of an unchanged capability | **Price change.** What a price index must isolate. | The same 800G 2×DR4 500 m module costs less this quarter than last. |
| The capability delivered per dollar | **Quality change / technical progress.** | 1.6T at 1.5× the price of 800G delivers 2× the bits. |
| Which capabilities are bought | **Mix / composition change.** | A fabric shifts from 10 km long-reach links to 500 m links. |

A number that does not say which of these it is measuring is not a benchmark. **[JUDGMENT]** The prototype's `$/transceiver` series, subdivided only by data rate, is simultaneously exposed to all three and controls for none.

### 2.2 The candidate economic objects (Task 1)

Assessed from first principles, then tested against observability.

**A. Price of an individual optical module.**
*Answers:* nothing generalisable. A single SKU's price path is a fact about one vendor's commercial posture.
*Does not answer:* anything about the market.
*Verdict:* an observation, not an economic object. It is the raw material for A/B/C below.

**B. Price of a standardised transceiver specification.**
*Answers:* "is this exact capability — 800G, 2×DR4, OSFP, DSP-retimed, 500 m, SMF — getting cheaper?" This is the classical constant-quality price relative, and it is the only object for which the matched-model method is valid.
*Does not answer:* what a buyer's optics bill is doing, because buyers migrate between specifications. Silent on generational transitions by construction.
*Verdict:* **the correct elementary unit.** Everything defensible is built out of these.

**C. Price per Gbit/s of optical bandwidth.**
*Answers:* within one reach class and one era, the cost of bandwidth.
*Does not answer:* anything across reach classes, and across generations it answers only under the forced assumption that value scales exactly linearly with bit rate. It also mechanically manufactures a ~50% decline at every generational doubling whose size is a property of the standards roadmap, not of the market **[INFERENCE]**.
*Verdict:* a **diagnostic subseries**, never a headline. See §8.

**D. Price per unit of reach-adjusted bandwidth ($/Gbps·km).**
*Answers:* in principle, the cost of moving a bit a metre.
*Does not answer:* anything real, because reach is not a continuous, substitutable quantity. It is a **step function** set by discrete PMD classes — 500 m, 2 km, 10 km, 20 km, 40 km, 80–120 km coherent **[FACT: IEEE P802.3dj objectives; OIF 400ZR/800ZR]** — and no buyer trades bandwidth against distance at a constant rate. A 10 km module is not "20× the product" of a 500 m module.
*Verdict:* **reject.** It imposes two forced hedonic coefficients instead of one and is less interpretable than either input.

**E. Cost of optical connectivity for a representative AI cluster.**
*Answers:* "is it getting cheaper to build the optical layer of an AI factory?" — the question the PRD's economic framing actually poses. It is a cost index over a specified reference topology, in $ per GPU or $ per delivered Tbps of fabric bandwidth.
*Does not answer:* constant-quality price change. It deliberately includes mix and quality effects, because for this question they *are* the signal.
*Verdict:* **the most economically meaningful object available**, and the one nobody else publishes. Its integrity rests entirely on the reference topology being specified, versioned, dated and changed only on a published schedule.

**F. Shipment-weighted market ASP.**
*Answers:* what the market as a whole actually paid per unit.
*Does not answer:* price change — it is a mix-contaminated average, and §12 demonstrates it rising while every constituent price falls.
*Verdict:* a legitimate **market statistic**, not a price index. Useful as a weight source, dangerous as a headline.

**G. Acquisition cost of a changing basket of optical technologies.**
*Answers:* the realised expenditure path of a buyer who migrates with the technology.
*Does not answer:* whether that path reflects price or substitution.
*Verdict:* this is E under a different name when the basket is specified, and is undefined when it is not. Subsumed into E.

**H. Other defensible objects considered.**
- **Cost per unit of *effective* (post-FEC, post-oversubscription) delivered bandwidth.** Rejected: requires topology and traffic assumptions Urdais cannot observe **[JUDGMENT]**.
- **Optics cost as a share of total cluster capex.** Legitimate and interesting, but it is a ratio of two indices, not a price index; it inherits the error of both. Candidate for a derived display metric, not a benchmark.
- **Cost floor (teardown BOM) and the BOM-to-list spread.** Flagged in the existing source study via TechInsights. Economically real — the spread is a margin indicator — but per-device and episodic, not a time series **[FACT, per source study §9]**.
- **$/W of optical connectivity.** Not a price at all; a ratio of a price to a power figure. See §8.

---

## 3. Market and product taxonomy (Task 2 and Task 3)

### 3.1 The homogeneity test, run against the primary standard

The question posed — *would comparing two "800G transceivers" without controlling for characteristics be comparing materially different products?* — is answered decisively by the standards body itself.

IEEE P802.3dj's adopted objectives, verbatim from the task force's own project document, define for 800 Gb/s a physical-layer specification **[FACT]**:

> over 4 pairs of SMF with lengths up to at least 500 m · over 4 pairs of SMF with lengths up to at least 2 km · over 4 wavelengths over a single SMF in each direction with lengths up to at least 500 m · over 4 wavelengths over a single SMF in each direction with lengths up to at least 2 km · over 1 wavelength over a single SMF in each direction with lengths up to at least 10 km · over a single SMF in each direction with lengths up to at least 20 km · over 4 wavelengths over a single SMF in each direction with lengths up to at least 10 km · over a single SMF in each direction with lengths up to at least 40 km

— plus 4-lane electrical backplane and 4-pair twinax copper objectives. That is **eight optical variants of "800G" in one standard**, spanning 500 m to 40 km, parallel-fiber and WDM, single-wavelength and four-wavelength. Source: https://www.ieee802.org/3/dj/projdoc/objectives_P802d3dj_240314.pdf (adopted objectives, 14 March 2024), task force at https://www.ieee802.org/3/dj/index.html.

And that is only the IEEE-standardised set. The deployed 800G population also includes MSA-defined products that IEEE never specified: 800G 2×FR4 and 2×DR4 built as two independent 400G engines in one module, per the 800G Pluggable MSA and the QSFP-DD/OSFP MSAs **[FACT]** — see https://www.arista.com/assets/data/pdf/Datasheets/Arista-800G_Optics_FAQ.pdf and the OSFP MSA specification at https://www.osfpmsa.org/assets/pdf/OSFP_Module_Specification_Rev5_1.pdf.

**Answer: yes, unambiguously.** Two products both correctly labelled "800G optical transceiver" may differ in reach by a factor of 80, in fiber type, in whether they use one wavelength or four, in whether they contain one DSP or two or none, and in whether they are even the same modulation family. Any price series that does not control for this is not measuring price.

### 3.2 The minimum specification key for a comparable series

**[JUDGMENT]** The minimum set of fields that must be pinned before two observations may be treated as the same product. Nine fields, each with a closed vocabulary drawn from a standards or MSA document:

| # | Field | Vocabulary source | Why it cannot be dropped |
|---|---|---|---|
| 1 | **Aggregate rate** | IEEE 802.3 | 100G / 200G / 400G / 800G / 1.6T. Necessary, nowhere near sufficient. |
| 2 | **Lane structure** | IEEE 802.3, OIF CEI | 8×100G vs 4×200G at 800G are different silicon generations at the same rate, and price differently **[INFERENCE]**. |
| 3 | **Reach class / PMD** | IEEE 802.3 PMD name | SR / DR / FR / LR / ER / ZR. The dominant non-rate price driver **[INFERENCE]**. |
| 4 | **Fiber type** | IEEE 802.3 | MMF (VCSEL-based SR) vs SMF (EML/SiPh-based DR/FR/LR). Different optical supply chains, different cost floors. |
| 5 | **Optical interface / wavelength plan** | IEEE 802.3, 100G Lambda MSA | Parallel single-λ-per-fiber (DR) vs CWDM4/LAN-WDM (FR/LR). Determines laser count and MUX cost. |
| 6 | **Detection & modulation family** | IEEE 802.3 (IM-DD) vs OIF ZR (coherent) | **Datacom IM-DD and coherent are not the same market.** A coherent 800ZR module contains a coherent DSP, ITLA and optical hybrid absent from every direct-detect module. Never mix them in one stratum. |
| 7 | **Retiming architecture** | LPO MSA; vendor datasheets | Fully retimed (2 DSPs) / LRO half-retimed (1 DSP) / LPO (no DSP). The DSP is a leading cost and power element; LPO/LRO exist specifically to remove it **[FACT]** — LPO MSA at https://www.lpo-msa.org/home/faqs.html, overview at https://eps.ieee.org/wp-content/uploads/2026/03/Linear-Pluggable-Optics_V2-UPDATED.pdf, and Juniper's LPO/LRO taxonomy at https://www.juniper.net/documentation/us/en/hardware/800g-optics-cables-guide/optics/topics/concept/800g-optic-types-lpolro.html. Two "800G DR8" modules, one LPO and one retimed, are different products at different prices. |
| 8 | **Form factor** | OSFP MSA, QSFP-DD MSA | QSFP-DD / OSFP / OSFP1600 / OSFP-XD, and — critically — **thermal variant** (finned-top vs flat-top). NVIDIA ships both mechanical variants of the same optical part for air- vs liquid-cooled hosts **[FACT]**: https://networking-docs.nvidia.com/800gmma4z00ns/overview. At 1.6T the form factor field forks further into OSFP1600 vs OSFP-XD vs QSFP-DD1600, per https://osfpmsa.org/assets/pdf/OSFP1600_and_OSFP-XD.pdf. |
| 9 | **Host protocol & vendor coding** | Vendor documentation | Ethernet / InfiniBand / NVIDIA twin-port. NVIDIA's MMA4Z00-NS is an 800 Gb/s *twin-port* OSFP presenting **2×400 Gb/s** with two internal engines and two MPO-12 connectors — a topology-specific product with no generic equivalent **[FACT]**. And OEM-coded vs third-party-coded modules of nominally identical optical spec carry different warranty, support and lock-in and are **different economic goods** **[JUDGMENT]**. |

A tenth field, **temperature/grade (commercial vs industrial)**, is recommended but may be collapsed if observation counts are thin **[JUDGMENT]**.

The prototype pins field 1 and leaves fields 2–9 free. That is the defect, stated precisely.

### 3.3 Where the optics actually are — the AI optics universe (Task 3)

Marketing narrative and deployment diverge sharply at exactly the layer that matters most, so this section is built on deployment evidence.

| Layer | Distance | What is actually deployed | Optical? |
|---|---|---|---|
| **Intra-rack / scale-up** | < 3 m | **Copper.** The NVIDIA GB200 NVL72 scale-up domain is a passive copper cable backplane — NVIDIA's own system documentation lists an "NVLink passive copper cable backplane" among the rack's components **[FACT]**: https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html. IEEE P802.3dj likewise defines twinaxial copper objectives at ≥1.0 m for every rate through 1.6T **[FACT]**. | **No.** Today's densest AI interconnect layer buys almost no optics. |
| **Rack-to-rack / scale-out leaf** | 5–100 m | Pluggable optics (SR over MMF where legacy MMF plant exists; increasingly DR over SMF), plus AEC/ACC copper at the short end. | **Yes** — the highest-volume optical layer. |
| **Cluster / fabric (leaf–spine, rail-optimised)** | 100 m – 2 km | DR4 / 2×DR4 (500 m) and FR4 / 2×FR4 (2 km) on SMF. | **Yes** — the economic centre of gravity of AI optics **[INFERENCE]**. |
| **Campus / building-to-building** | 2–10 km | FR / LR class, 4λ or single-λ. | Yes, lower volume. |
| **Data-centre interconnect (DCI)** | 80–120 km | **Coherent**, not datacom: OIF 400ZR and 800ZR, single-span amplified DWDM **[FACT]**: https://www.oiforum.com/oif-releases-800zr-coherent-interface-implementation-agreement-ia-and-key-400zr-ia-updates-addressing-market-demands-for-scalable-interoperable-high-capacity-solutions/ | Yes, but a **structurally different market** with different suppliers, different silicon and different price behaviour. |

Two further structural facts bound the universe:

- **Co-packaged optics is a live, shipping-class technology, not a future one.** NVIDIA announced Quantum-X and Spectrum-X Photonics CPO switches on 18 March 2025 **[FACT]**: https://nvidianews.nvidia.com/news/nvidia-spectrum-x-co-packaged-optics-networking-switches-ai-factories. CPO has **no unit price**: the optics are inside the switch and the buyer purchases a switch **[INFERENCE]**. Any index defined over pluggable modules is therefore exposed to a substitution it structurally cannot observe — if CPO takes share, a pluggable-module index measures a shrinking slice of the connectivity economy while reporting nothing about it. This is a permanent, un-fixable bias of every pluggable-only design and must be disclosed as such, not engineered away **[JUDGMENT]**.
- **Scale-up is migrating toward optics on vendor roadmaps.** If and when it does, optical intensity per GPU changes discontinuously. **[UNKNOWN]** — timing and form are not established, and this document takes no position on it.

**Recommendation on universe scope [JUDGMENT]: deliberately focus, do not cover everything.** The defensible V1 universe is **datacom IM-DD pluggable optics for the rack-to-rack and cluster/fabric layers, single-mode and multimode, 400G / 800G / 1.6T.** Specifically:
- **In:** SR, DR, FR, LR class pluggables at 400G/800G/1.6T in QSFP-DD, OSFP, OSFP1600, OSFP-XD.
- **Out (separate family, never blended):** coherent ZR/ZR+ DCI — different market, different suppliers, different price dynamics.
- **Out (tracked, not priced):** CPO/NPO — no unit price exists; disclose as a coverage gap.
- **Out (separate product if ever built):** DAC/AEC/ACC/AOC copper and active cables — these are the *substitutes* for short-reach optics, and folding them in would let a copper substitution masquerade as an optics price decline. Tracking them as a companion series is valuable precisely because they are the substitute.
- **Out:** 100G and 200G as headline constituents. They are legacy for AI infrastructure and their inclusion in the prototype reflects a bandwidth ladder, not the AI economy. Retain 100G only if history depth is needed for backfill, clearly marked as legacy.

---

## 4. Critique of the current UPPI prototype

The prototype under review is `src/data/mock/market-detail.ts`, `UPPI_MARKET`: five instruments — 100G, 200G, 400G, 800G, 1.6T — each `$/transceiver`, each carrying a `bandwidthGbps` field, each with a daily series and a 7-day intraday series, with 800G as the headline benchmark and a documented intent to migrate the headline to 1.6T. Twelve defects, in descending order of severity.

**1. The taxonomy is an axis, not a partition.** Data rate is field 1 of 9 (§3.2). Each prototype "instrument" is a union of dozens of materially different products. **Consequence:** the series cannot be sourced, because there is no price to observe for the object it names.

**2. There is no such thing as "the" 800G price, so a single benchmark instrument per generation is unsourceable.** The comment describes 800G as "a representative high-bandwidth optical interconnect generation." Representativeness is a weighting claim, and no weights exist. **Consequence:** whoever implements this must silently choose a SKU, and that choice — not the market — will drive the series.

**3. Daily and intraday movement is fabricated by construction.** The prototype generates daily returns from a seed and a volatility parameter, and renders 1-day and 1-week changes. No optical transceiver price is observed daily anywhere (§6). **Consequence:** the most prominent numbers on the surface — today's move — would be pure artefact. This is the defect most likely to be noticed by an expert reader and the one with the worst reputational consequence.

**4. `$/transceiver` as the market-level unit is a category error.** It puts a 50 m multimode 2×SR4 and a 40 km single-λ module on one axis.

**5. `bandwidthGbps` invites an unexamined hedonic.** The code comment states $/Gbps is derivable as "price ÷ bandwidthGbps," "the meaningful cross-generation comparison." It is meaningful only under an assumption that has never been stated or tested (§8.2).

**6. Five independent generational series invite the aggregation fallacy.** Each series may decline while the cost of connecting a cluster rises, because buyers migrate up the ladder. The surface offers no aggregate and no guidance, so the reader will do the aggregation themselves, wrongly.

**7. Headline migration 800G → 1.6T is an undisclosed rebase.** Moving the default instrument changes what the headline means without a version bump or a documented link. Under the house rule that approved methodology versions are never edited in place, a benchmark migration is a **methodology version event**, not a metadata edit **[JUDGMENT]**.

**8. Modelled history is infeasible as real history.** The 100G instrument carries `LONG_HISTORY_DAYS` of daily points from 2014. No rights-clean source of daily 100G transceiver prices from 2014 exists in the source study. **Consequence:** the chart shape sets an expectation that production cannot meet, which is the same trap the UCPI live-index NO-GO documented.

**9. 100G and 200G are in the universe for ladder-completeness, not for economic relevance** to AI infrastructure (§3.3).

**10. Reach, form factor and retiming are explicitly deferred** ("Generations are not yet subdivided by reach or standard (DR8, FR4, …)"). These are not refinements to add later — they are the difference between a price and a number.

**11. Coherent DCI and CPO are unhandled.** The comment anticipates a future "Optical Engines / CPO" family. CPO cannot be priced per unit at all (§3.3); it is a coverage gap to disclose, not a family to populate.

**12. The unit label will survive into production and mislead.** `$/transceiver` on a market-level axis is the kind of label that gets quoted back. Whatever is built, the headline should be **index points on a stated base**, with `$/unit` and `$/Gbps` demoted to per-stratum diagnostics (§8.5).

**What survives from the prototype:** the economic question in the comment — *"what moving information with optical infrastructure costs"* — is the right question. The instrument/family scaffolding is reusable if families become *reach-and-architecture strata* rather than bandwidth tiers. Nothing else survives.

---

## 5. Price-concept analysis (Task 4)

Assessed on seven axes. "Observability" and "licensing" are assessed against the findings already recorded in `source-shortlist.md` and are not re-derived here.

| Price concept | Economic meaning | Observability | Representativeness | Mix-shift exposure | Reproducibility | Historical availability | Licensing risk |
|---|---|---|---|---|---|---|---|
| **List price (OEM published)** | Vendor's posted ask; an anchor for discount negotiation | Poor — Cisco/Arista/NVIDIA GPLs are not public; no public OEM list price surface was found in the source study **[FACT]** | Weak — realised discounts are large and unobservable | Low if SKU-pinned | High if published | None | Low |
| **Merchant / distributor advertised price** | The price a buyer without negotiating power actually faces | **Good** — FS.com and Flexoptix publish per-SKU prices at the needed granularity **[FACT, source study §3, §8]** | Represents the long tail, **not hyperscale procurement** | Low if SKU-pinned | **High** — a URL and a date | Limited to each merchant's site history; no archive guaranteed **[UNKNOWN]** | **High and unresolved** — FS.com's robots.txt and ToU return HTTP 202 zero-byte and could not be read **[FACT, source study]** |
| **Transaction price** | The economically correct concept | Essentially zero for AI optics — hyperscaler purchases are private | Perfect if obtainable | None | N/A | N/A | N/A |
| **Hyperscaler negotiated price** | What the marginal AI buyer pays; the number the market wants | **Zero.** Not disclosed anywhere. The Chinese carrier tender channel — the one public near-transaction channel — was assessed and carries **no 800G, no 1.6T and no ZR at all** **[FACT, `iccsz-tender-pricing.md`]** | Perfect if obtainable | None | N/A | N/A | N/A |
| **Vendor ASP (issuer-disclosed)** | Revenue ÷ units for one vendor | Partial — CSRC rules require listed issuers to disclose production volume, sales volume and inventory of main products by industry segment **[FACT]**: http://www.csrc.gov.cn/csrc_en/c102034/c1371318/content.shtml. US-listed optics issuers disclose ASP only qualitatively **[FACT, source study §19]** | Single vendor, whole product line | **Severe** — a vendor's blended ASP rises purely from mix | Medium — filing-dependent; Accelink's unit and unit-price cells are redacted in the public version **[FACT, source study §4]** | Annual/semi-annual, multi-year | Low — regulated public disclosure |
| **Shipment-weighted market ASP** | What the market paid on average | Licensed only — Omdia advertises "volumes, pricing and revenue"; LightCounting models 200+ products with history and forecast **[FACT, source study §1–2]** | **Best available representativeness** | **Severe by construction** — it *is* the mix | Zero for a third party; unauditable | Deep (LightCounting history 2022–2025 + forecast) | **Blocking.** Both firms bar Urdais's crawler class by name in robots.txt; Cignal's subscription agreement bars derivative works outright **[FACT, source study]** |
| **Revenue ÷ unit ASP (derived)** | Same as above, self-computed | Only where both numerator and denominator are disclosed | Vendor-scoped | Severe | Medium | Filing history | Low |
| **Modelled industry ASP** | An analyst's estimate | Licensed only | Depends entirely on the model | Depends | **Zero** — cannot be reproduced without the model | Vendor-dependent | Blocking |
| **Import/export unit value** | Customs value ÷ customs quantity | **Good and free.** HTS 8517.62.00.90 carries unit of quantity "No." **[FACT, verified against the USITC HTS API]**, and CBP has ruled optical transceivers into 8517.62.0090 **[FACT]**: https://rulings.cbp.gov/ruling/n336394. Census API terms permit retrieval and derived use **[FACT, source study §5]** | **Fatally impure** — 8517.62.00.90 is the residual "Other" basket under a heading covering all apparatus for transmission or reception of data | **Catastrophic** — see §12 | High | Monthly, 2013–present via API | **Clean** (Census); Comtrade requires a premium subscription even for transformed re-dissemination **[FACT, source study §6]** |

### 5.1 Which concepts can support a credible public index

**[JUDGMENT]**

- **Merchant advertised price — yes, conditionally.** The only concept that is simultaneously observable at SKU granularity, reproducible from a URL and a timestamp, and potentially rights-clearable. Its weakness is representativeness, and that weakness is *disclosable* rather than fatal, because it can be named precisely: this is the price faced by a buyer without hyperscale negotiating leverage. Conditional on PH-2 resolving the FS.com/Flexoptix rights question, which is currently unreadable, not merely unresolved.
- **Shipment-weighted ASP — yes, and it is the gold standard, if licensable.** Its mix-contamination is not a defect when it is used as a *weight* input to a matched-model index rather than as the index itself. That is the highest-value form of an Omdia or LightCounting relationship: **license the weights, not the headline number** **[JUDGMENT]** — see §15.
- **Issuer-disclosed vendor ASP — as a validation series only.** One or two vendors, annual, mix-contaminated. It is a plausibility check on an index, not an index.
- **Import/export unit value — as a labelled context indicator only.** §12 shows it printing large positive changes in periods when every price fell. It may be published beside UPPI; it may never be published as UPPI.
- **Transaction and hyperscaler prices — no.** Not obtainable. Stop looking for them and stop implying the index approximates them.
- **Modelled industry ASP — no.** Irreproducible by a third party, and reproducibility is a stated Urdais criterion.

---

## 6. Frequency analysis (Task 5)

### 6.1 The cadence of the underlying market

| Process | Natural cadence | Basis |
|---|---|---|
| Standards and generational transitions | Multi-year | P802.3dj targeting completion 2026 **[FACT]**: https://www.ieee802.org/3/dj/index.html |
| Hyperscaler contract price resets | Quarterly to annual; multi-quarter capacity commitments | **[INFERENCE]** from reported procurement practice; specific cadence **[UNKNOWN]** |
| Research-firm ASP publication | **Quarterly at best.** Omdia's optical components service is quarterly; Cignal AI's is quarterly; **LightCounting's model refreshes semi-annually** **[FACT, source study §1, 2, 7]** | |
| Merchant list-price revision | Irregular and sticky; magnitude and frequency **[UNKNOWN]** — this is a measurable question and §13 makes it a required pilot | |
| Trade statistics | Monthly, roughly five-week lag **[FACT]** | |
| Vendor financial disclosure | Quarterly (revenue), annual (volumes) | |
| Supply-shock repricing | Episodic. The 2026 market is in a documented supply-constrained phase; TrendForce's own release identifies component shortages as the primary capacity bottleneck **[FACT]**: https://www.trendforce.com/presscenter/news/20260420-13017.html | |

**The fastest-moving *credible* observation in this market is monthly. The fastest-moving *authoritative* observation is quarterly.**

### 6.2 Recommendation

**[JUDGMENT]** **Observe monthly. Publish monthly. Never display sub-monthly change.**

- **Monthly observation** is defensible for a merchant-list-price design: collection is cheap, the observation date is exact, and a monthly snapshot captures list-price revisions without pretending to a cadence the market does not have.
- **Quarterly publication** is the correct cadence for any design that consumes research-firm ASP data, because that is the data's own cadence.
- **The index should carry an explicit "observation cadence" and "as-of" on the surface**, and the surface must not render a 1-day or 1-week change at all — not "N/A", but absent.

### 6.3 On interpolating quarterly observations into daily values

**Methodologically unacceptable. [JUDGMENT], and the reasoning is not a matter of taste.**

1. **It fabricates information.** Interpolation creates 89 values per quarter that were never observed. Publishing them as index values asserts knowledge that does not exist. Under Urdais's own standing rule that a proxy must never be labelled as the thing it proxies, an interpolated daily value must never be labelled an observation.
2. **It systematically falsifies the statistical properties readers will compute.** Interpolated series have near-zero high-frequency variance and near-unit autocorrelation. Any user computing volatility, drawdown, or correlation against another Urdais series gets a number that is an artefact of the interpolation scheme. This is worse than a missing series, because it is confidently wrong.
3. **It destroys the revision audit trail.** Research-firm data is revised. A daily interpolated series cannot represent a revision without rewriting history.
4. **The chart lies even when the data does not.** A daily-resolution line implies daily price discovery. A quarterly step function is honest and looks like what it is.

**What is acceptable instead:** publish at the observation frequency; carry an explicit `as_of` and `observation_frequency`; hold the last observed value flat for display continuity **only if** the surface labels it as "last observed" and the API returns the observation date, not a synthetic one. Step-flat display is acceptable; interpolated values in the stored series are not.

**Implementation note for a later phase, flagged not resolved:** a monthly or quarterly series interacts with the historical-range base-selection rule in `src/lib/market-ranges.ts` (base at or before the window start **and** within one further window). A quarterly cadence will produce empty 1M and possibly 3M ranges. That is correct behaviour and should be surfaced as such, not worked around **[JUDGMENT]**.

---

## 7. Index-number methodology analysis (Task 6)

### 7.1 The governing constraint: weights

Almost every classical index formula requires **quantity or expenditure weights**. Fisher, Paasche, Törnqvist and expenditure-weighted Laspeyres all need them; Fisher and Törnqvist need them in **both** periods.

**Urdais does not have shipment weights and cannot obtain them from any open source.** They exist only inside the licensed datasets (§5). This single fact eliminates Fisher, Paasche and Törnqvist from every open-data candidate, and it is the most important practical constraint in this entire document **[JUDGMENT]**.

What remains for an unweighted or exogenously weighted design:
- **Jevons (geometric mean of price relatives)** — the elementary aggregate of choice. It satisfies time reversal and transitivity, is invariant to the units each item is quoted in, and is the standard recommendation for elementary aggregation where no weights exist.
- **Dutot (ratio of arithmetic mean prices)** — **reject.** Dutot over heterogeneous items *is a unit-value index in disguise*: it is dominated by high-priced items and it moves when the sample composition moves. It reproduces the exact failure mode §12 demonstrates.
- **Carli (arithmetic mean of relatives)** — **reject.** Upward-biased and fails the time-reversal test.
- **Exogenously weighted aggregation above the elementary level** — weights taken from a *published reference topology* (Candidate B) or from a documented, versioned judgment weighting. This is honest if and only if the weights are published and versioned as part of the methodology.

### 7.2 The index-number problems, each with a disposition

| Problem | Why it bites in optics | Disposition **[JUDGMENT]** |
|---|---|---|
| **Product turnover** | Generation cadence is roughly a doubling every 2–3 years; SKUs churn faster | Chained index with annual link; **never** a fixed basket |
| **Generational substitution** | 400G → 800G → 1.6T | Not a price effect. Handled by Candidate B (cost index), not by A |
| **Declining prices** | Structural | Chaining handles it; no special treatment |
| **Quality improvement** | Bandwidth, power/bit, reach, density all improve together and are **collinear** | This collinearity is why a naive hedonic will fail with few observations — see §7.4 |
| **Changing bandwidth** | The dominant quality axis | Never divide by it silently (§8.2) |
| **Changing reach** | Buyers migrate to shorter reach as topologies densify | **Stratify by reach.** Never aggregate across reach classes without weights |
| **Power efficiency** | 400G DR4 ≈ 9–12 W, 800G DR8 ≈ 16 W, 1.6T ≈ 16–28 W per published datasheets **[FACT, vendor datasheets: FS 800G OSFP DR8 max 16 W, https://resource.fs.com/mall/file/datasheet/800g-osfp-dr8-datasheet.pdf; Lumentum 1.6T 2×DR4 TRO typical 16 W, https://www.lumentum.com/en/products/16t-2dr4-tro-osfp-transceiver-module]** | A hedonic characteristic if a hedonic is ever estimated; **not** a normalisation denominator (§8) |
| **Changing form factors** | QSFP-DD → OSFP → OSFP1600/OSFP-XD | Stratify. A form-factor change is a product change |
| **Vendor mix** | OEM-coded vs third-party at very different price points | **Separate strata.** Never average across them |
| **Shipment mix** | Unobservable without a licence | The reason weights must be exogenous and published |
| **New product introduction** | 1.6T launching at a premium | **Overlap linking only.** A new constituent contributes *relatives*, never a *level*. See §12 scenario 3 |
| **Discontinued products** | 100G/200G exiting AI fabrics | Drop on the chain link, never mid-chain; carry forward no imputed price beyond one period |
| **Sparse observations** | Some strata will have 1–3 observed SKUs | Publish a per-stratum observation count and **suppress a stratum below a stated minimum**, rather than publishing a thin number |
| **Negotiated/private pricing** | The real market is invisible | Disclosed as the index's defining limitation, in its name |
| **Outliers** | Clearance, EOL, mispriced listings | Rule-based, published, symmetric filter. Note the IMF's caution that aggressive outlier deletion in unit-value work risks "missing large price catch-ups" **[FACT]**: https://www.imf.org/external/np/sta/tegeipi/ch2.pdf |
| **Survivorship bias** | Only SKUs that stay listed get measured, and SKUs are delisted precisely when uncompetitive | **Structural and unfixable in an open design.** Disclose; do not claim to correct it |

### 7.3 Which classical approaches are actually relevant

- **Fixed basket — reject.** Dies on turnover within 2–3 years.
- **Chained index — adopt.** Mandatory given turnover. Accept chain drift as the cost.
- **Matched-model — adopt as the core.** This is the method the Federal Reserve itself uses for communications equipment: the G.17 documentation states that its product-class indexes "are most commonly **matched-model Fisher chain aggregations of unit values** for detailed product categories," with data drawn from "private vendors, trade groups, government sources, and academic research papers" **[FACT]**: https://www.federalreserve.gov/releases/g17/commequip_price_indexes.htm. Note that "unit values" there are *within* narrowly defined product categories — exactly the stratification this document argues for. The Fed's own communications-equipment indexes are **annual, with quarterly for selected classes only** **[FACT, same source]** — an authoritative precedent against a daily index.
- **Hedonic adjustment — hold in reserve, do not launch with it.** See §7.4.
- **Unit-value index — reject as an index; retain as a labelled context indicator.** The IMF Export and Import Price Index Manual is explicit that unit value indices are biased because "there is no careful matching of prices of like with like" and new and old varieties are bundled **[FACT]**: https://www.imf.org/external/np/sta/tegeipi/ch2.pdf.
- **Geometric mean (Jevons) — adopt for elementary aggregation.**
- **Arithmetic mean of prices (Dutot) — reject** (§7.1).
- **Laspeyres — available only with exogenous published weights;** acceptable for Candidate B where the "weights" are a reference topology's port counts.
- **Paasche, Fisher, Törnqvist — unavailable without licensed weights.** If Candidate C is ever licensed, **Törnqvist is the correct superlative choice** for a market where expenditure shares shift fast, with Fisher as the alternative.

**On not mechanically importing financial-index methodology:** an equity index tracks a portfolio whose constituents are fungible claims with continuous two-sided quotes. Optical modules have none of those properties — no continuous quotation, no fungibility across reach classes, no two-sided market, and a constituent set that turns over completely every few years. Free-float weighting, daily rebalancing, divisor adjustment and continuous quotation have **no analogue here** and importing them is the primary way this project could go wrong **[JUDGMENT]**. The relevant intellectual tradition is official price statistics (BLS/IMF/Fed), not index funds.

### 7.4 On hedonics specifically

Hedonic regression is the only principled way to price a generational transition, and BLS's own guidance is that hedonics are used precisely where "the concept of a matched model breaks down" and newly introduced goods differ sharply from those currently priced **[FACT]**: https://www.bls.gov/cpi/quality-adjustment/hedonic-price-adjustment-techniques.htm.

It is nonetheless the wrong launch choice here, for three reasons **[JUDGMENT]**:

1. **Sample size.** A credible hedonic needs many observations per period across a spread of characteristic combinations. A merchant-list panel over a focused universe will plausibly yield tens, not thousands, of SKUs **[UNKNOWN — this is exactly what the §13 pilot must measure]**.
2. **Collinearity.** Bandwidth, lane rate, power, form factor and DSP count all advance together. The regression cannot separate their coefficients from a short panel, which means the estimated "bandwidth coefficient" would be an artefact.
3. **Reproducibility.** A hedonic index is only reproducible if the regression specification, the variable selection procedure and the data are all published. That is achievable, but it is a large commitment to make before the data is even characterised.

**Recommendation:** design the schema so a hedonic is possible later — collect every characteristic from day one whether or not it is used — and launch on matched-model. Revisit after 12–18 months of panel data, at which point the collinearity question can be answered empirically rather than assumed.

---

## 8. Normalization analysis (Task 7)

### 8.1 The general principle

Normalisation is never neutral. Dividing price by a characteristic *is* a quality adjustment with the coefficient on that characteristic set to exactly 1.0 and every other characteristic set to 0. The question for each candidate denominator is not "does it look comparable?" but "**is the implied elasticity defensible, and has anyone tested it?**" **[JUDGMENT]**

### 8.2 Each candidate denominator

| Unit | What it implies | Verdict |
|---|---|---|
| **$/transceiver** | Nothing — it is the raw observation | **Valid only inside a fully specified stratum.** Invalid as a market-level unit. Retain as the per-stratum diagnostic |
| **$/Gbps** | Value scales exactly linearly with bit rate; nothing else matters | **Conceals more than it reveals across generations; useful within one.** Two failure modes: (a) it mechanically prints a ~50% decline at every generational doubling whose magnitude is set by the standards ladder, not by the market; (b) it is meaningless across reach — a 40 km 800G module and a 500 m 800G module have identical $/Gbps denominators and non-comparable numerators. **Publish as a per-stratum diagnostic. Never as a headline.** |
| **$/Tbps** | Identical to $/Gbps with a scale factor | Same verdict; cosmetic only |
| **$/Gbps·km** | Bandwidth and distance are substitutable at a constant rate | **Reject** (§2.2 D). Reach is a discrete PMD step function; nobody trades bits against metres |
| **$/lane** | Value scales with electrical lane count | A genuinely useful **engineering diagnostic** — it tracks the SerDes generation and isolates the 100G/lane → 200G/lane transition. Not a headline: buyers do not purchase lanes |
| **$/port** | One module = one port | Nearly always identical to $/transceiver, and **breaks precisely where it matters**: NVIDIA's twin-port OSFP presents 2×400G in one module **[FACT, §3.2]**, and breakout cabling makes one module serve four ports. Useful only if "port" is defined against a specific topology — which is Candidate B |
| **$/W of optical connectivity** | Not a price. A ratio of a price to a power figure | **Reject as a unit.** Power efficiency is a quality characteristic, not a deflator. The honest treatment is **twin series**: an index of price, and beside it an index of W/Gbps. Two series that can be read together beat one ratio that can be read only one way |
| **$/unit of delivered network bandwidth** | Cost of the connectivity a cluster actually gets | **The most defensible normalisation in the list**, and it is only computable inside a specified reference topology — i.e. it *is* Candidate B. It correctly accounts for the fact that a fabric needs a specific number of modules of specific types to deliver a specific bisection bandwidth |

### 8.3 The decisive case against normalising the headline

Consider a hypothetical 1.6T module at 1.5× the price of an 800G module of the same reach class **[hypothetical]**. In $/Gbps it is 25% *cheaper*. In matched-model terms nothing happened — they are different products and neither price changed. Both statements are true; they answer different questions. A single headline unit forces a choice between them and hides the choice from the reader.

**Recommendation [JUDGMENT]:** the UPPI headline is **index points on a stated base (e.g. Jan 2026 = 100)**. `$/unit` and `$/Gbps` appear as per-stratum diagnostics with their assumptions stated. This also matches how every official price index in the world is published, and it removes the prototype's `$/transceiver` market-level label.

---

## 9. Data-feasibility assessment (Task 8)

The source landscape has already been surveyed in detail. This section records only what PH-1's methodology work adds or changes.

### 9.1 What the methodology work changes about source priorities

**The characteristics layer is separable from the price layer, and it is free.** Every candidate methodology needs a stratification ontology: a closed vocabulary of rate, lane structure, reach class, fiber type, wavelength plan, modulation family, retiming architecture, form factor and host protocol, plus per-SKU power and connector data. That entire layer is obtainable from sources the source study already found permissive: **IEEE 802.3** (https://www.ieee802.org/3/dj/), the **OSFP MSA** (https://osfpmsa.org/), the **QSFP-DD MSA**, the **LPO MSA** (https://www.lpo-msa.org/), **OIF** (https://www.oiforum.com/), and public vendor datasheets from Cisco, Lumentum, Coherent, Source Photonics, Amphenol and NVIDIA — all of which publish specifications freely and none of which publish prices **[FACT, source study §19: "OIF and Ethernet Alliance — both fully crawlable … Genuinely useful for the taxonomy layer of an index"]**.

**[JUDGMENT] This reverses the natural build order.** The instinct is to find a price source first. The correct order is: build the ontology (free, rights-clean, useful under every candidate), then attach whichever price source PH-2 clears. If the price source changes, the ontology survives.

### 9.2 Price sources, re-ranked by methodological fit

| Source | Methodological role | Blocking issue |
|---|---|---|
| **FS.com / Flexoptix merchant prices** | Primary constituent prices for Candidates A and B | **Rights unreadable**, not merely unresolved — FS.com serves HTTP 202 zero-byte to robots.txt and every policy URL **[FACT]**. PH-2 must resolve by written consent, not by inference |
| **Omdia / LightCounting / Cignal AI** | **Weights**, and optionally the ASP headline (Candidate C) | Named robots.txt bars on Urdais's crawler class (LightCounting, Omdia); Cignal's agreement bars derivative works **[FACT]** |
| **IEEE / MSAs / OIF / vendor datasheets** | **Characteristics ontology** — required by every candidate | None found |
| **US Census International Trade API** | Candidate D context indicator; macro cross-check | HS impurity (§9.3). Rights clean, attribution mandatory **[FACT]** |
| **Chinese A-share issuer filings** | Validation series; derived vendor ASP | Volume/unit-price cells redacted in at least one key filing; cninfo geo-blocks US IPs **[FACT]** |
| **TechInsights teardown BOM** | Cost floor; BOM-to-list spread | Episodic, not a time series |
| **USAC E-Rate FRN line items** (https://opendata.usac.org/E-Rate/E-Rate-Request-for-Discount-on-Services-FRN-Line-I/hbj5-2bpj/data) | **New to this study.** A genuinely open, redistributable US dataset of awarded line-item equipment prices | **Wrong population.** K-12 and library procurement, overwhelmingly campus networking, not AI-fabric optics. **[JUDGMENT] Not usable for UPPI**; recorded so PH-3 does not rediscover and over-rate it |
| **GSA Advantage / CALC** | Considered and set aside | CALC covers awarded **labor** rates on professional-services schedules, not product prices **[FACT]**: https://calc.gsa.gov/. Product pricing sits in GSA Advantage, whose bulk access and rights are **[UNKNOWN]** |

### 9.3 The HS-code impurity, established precisely

The existing study flagged HS 851762 as impure at HS6. This study establishes the US 10-digit position **[FACT, verified against the USITC HTS API at https://hts.usitc.gov/]**:

| HTS | Description | Unit of quantity |
|---|---|---|
| 8517.62.00.10 | Modems, of a kind used with data processing machines of heading 8471 | No. |
| 8517.62.00.20 | **Switching and routing apparatus** | No. |
| 8517.62.00.90 | **Other** | No. |

CBP has ruled optical transceivers into **8517.62.0090** **[FACT]**: https://rulings.cbp.gov/ruling/n336394.

Two findings follow. **Good news:** the line reports quantity in "No.", so a unit value is arithmetically derivable, and switches and routers are broken out separately into `.20`, which removes the single largest contaminant the HS6 analysis implied. **Bad news:** `.90` remains the residual "Other" bucket of a heading covering all apparatus for transmission or reception of data — it still contains media converters, wireless access points, network adapters and much else **[INFERENCE]**, and it mixes every rate, reach and form factor into one arithmetic mean. **[JUDGMENT] It is a macro indicator with a real but limited signal, and it is disqualified as an index by §12 scenarios 1, 2 and 5.**

### 9.4 The honest summary of feasibility

**[JUDGMENT]** A defensible UPPI is feasible **only** in the merchant-list-price form, and **only** if PH-2 obtains written collection consent from at least one merchant. If PH-2 fails, the remaining honest options are (i) publish nothing and say why, or (ii) publish the trade unit-value indicator under a different name with an explicit disclaimer that it is not a price index. There is no third option that does not involve mislabelling a proxy.

---

## 10. Open-benchmark fallback designs (Task 9)

Assume no proprietary ASP dataset is affordable or redistributable. Three designs, each with an explicit statement of what it is not.

### Fallback 1 — Specification-locked merchant price panel *(this is Candidate A)*

**Measures:** the change over time in the advertised price of a fixed, fully specified set of optical products offered by a fixed set of merchants.
**WOULD represent:** a reproducible, constant-quality price signal for the optics a buyer without hyperscale negotiating leverage faces; the direction and rough magnitude of price movement in the pluggable optics market; relative movement between reach classes and between generations.
**WOULD NOT represent:** industry ASP; what any hyperscaler pays; transaction prices; volume-weighted market averages; anything about CPO or about optics bundled into switches.
**Honest name:** "listed price," never "market price." This mirrors the naming discipline already applied to UCPI-H100-SXM-**LISTED**.

### Fallback 2 — Cost-to-connect a published reference fabric *(this is Candidate B)*

**Measures:** the cost of the optical bill of materials required to build one published, versioned reference AI network topology, priced with Fallback 1's observations.
**WOULD represent:** the cost of optical connectivity per GPU and per delivered Tbps for a stated architecture; a genuinely differentiated economic statistic that no market-research firm publishes; the combined effect of price change *and* architectural change, which is what a buyer actually experiences.
**WOULD NOT represent:** any real buyer's bill; a constant-quality price index; a forecast; anything about copper substitution beyond what the reference topology specifies.
**Critical integrity condition:** the topology must be published in full, versioned, and changed only on an announced schedule with an overlap period. An unannounced topology change is indistinguishable from a price move and would destroy the series.

### Fallback 3 — Trade unit-value context indicator *(this is Candidate D)*

**Measures:** US customs value divided by customs quantity for HTS 8517.62.00.90, monthly.
**WOULD represent:** a free, monthly, long-history, fully reproducible macro indicator of the average declared unit value of a broad class of network transmission apparatus, including but far from limited to optical transceivers.
**WOULD NOT represent:** a price index of any kind, an optical transceiver price, a constant-quality series, or anything that can be compared period-to-period without mix caveats. §12 shows it can print a large *increase* in a period when every price fell.
**Naming discipline:** it must not carry the UPPI name. If published at all, it is a separate, differently named context series.

### Fallbacks considered and rejected

- **Standardised product basket priced by crowd-sourced or community submissions** — unverifiable provenance; rejected.
- **Secondary-market (eBay/broker) prices** — condition, authenticity and grey-market contamination make them uninterpretable; rejected.
- **Price-per-bandwidth of *switch systems* as a proxy for optics** — measures a different good and confounds silicon with optics; rejected.
- **A "photonics equity" proxy index** — measures expected profits of a small vendor set, not prices; rejected, and note the existing finding that the only listed instruments in this vertical are equity wrappers **[FACT, source study]**.

---

## 11. Candidate UPPI methodologies (Task 10)

Four architectures. They differ in economic object, not in parameter settings. They are presented in no priority order; §13 sets the selection framework.

---

### Candidate A — **UPPI-LISTED**: matched-model listed-price index

| Dimension | Specification |
|---|---|
| **Economic question** | Holding the optical capability constant, is its listed price rising or falling? |
| **Index universe** | Datacom IM-DD pluggable optics, 400G / 800G / 1.6T, rack-to-rack and cluster/fabric layers. Excludes coherent ZR, CPO, DAC/AEC/AOC, 100G/200G (legacy, optional backfill only) |
| **Constituent definition** | A **(SKU × merchant)** pair, pinned on all nine specification fields of §3.2. Strata are defined by (rate × reach class × fiber × retiming architecture × form-factor family × vendor class). Minimum 3 observed constituents per stratum for publication; otherwise the stratum is suppressed and its weight redistributed, with the suppression recorded |
| **Unit** | **Index points, base = 100** at a stated date. Diagnostics: `$/unit` and `$/Gbps` per stratum |
| **Price concept** | Merchant advertised price, single currency (USD), excluding tax and shipping, at a stated quantity tier (qty = 1 unless otherwise specified), captured with URL and timestamp |
| **Weighting** | **Two-level.** Elementary: unweighted **Jevons** geometric mean of price relatives within a stratum. Upper: **exogenous published weights** — either (i) a documented judgment weighting versioned with the methodology, or (ii) the port counts of the Candidate B reference topology, or (iii) licensed shipment weights if PH-2 ever obtains them. The weight source is part of the methodology version |
| **Rebalance policy** | Constituent set reviewed monthly, chained **annually** on a fixed date. New constituents enter only at a chain link. No mid-chain level entry, ever |
| **Observation frequency** | Monthly, on a fixed collection date, published with the observation date |
| **Aggregation formula** | Chained Jevons within strata; weighted geometric aggregation across strata; annual chain link with a one-period overlap |
| **Missing observations** | One period missing: carry the stratum relative (impute the stratum's own movement onto the missing constituent), flag it. Two consecutive: drop the constituent at the next link, no level effect. Never carry a stale *price* forward as if observed |
| **New products** | **Overlap linking only.** A new SKU must be observed in two consecutive periods; it then contributes its *relative* from the second period onward. Its price *level* never enters the index. This means the index is silent on launch premia — a known and disclosed limitation |
| **Discontinued products** | Dropped at the next chain link; last observed relative used through that link; no imputed prices beyond one period |
| **Backfill feasibility** | **Poor and the hardest constraint on this candidate.** Merchant sites do not publish price history; third-party archives are incomplete and their rights are separately **[UNKNOWN]**. Realistic expectation: the index starts approximately when collection starts. **[JUDGMENT] Plan for a forward-only series and say so, rather than promising history that cannot be sourced** — the same failure the UCPI live-index audit found |
| **Source requirements** | ≥1 merchant with written collection consent; the free characteristics ontology; ideally ≥2 merchants so that merchant-specific pricing policy is diversified |
| **Reproducibility** | **High.** Every constituent is a URL, a date and a number, with a published formula |
| **Licensing dependence** | **Entirely on merchant consent.** Zero dependence on research firms if judgment weights are used |
| **Principal biases** | Merchant-population bias (not hyperscale prices); survivorship bias (delisted SKUs vanish); list-price stickiness (understates true volatility); single-merchant concentration; blindness to CPO substitution; **no launch-premium signal** |
| **Users must NOT infer** | Industry ASP · hyperscaler prices · transaction prices · the cost of building a network · anything about CPO or bundled optics · that a flat index means a flat market during a supply shock |

**Variant A2 — hedonic.** Identical universe and collection; replaces matched-model linking with a time-dummy hedonic over the characteristic set. **[JUDGMENT] Not a launch candidate** (§7.4), but the schema must support it: collect every characteristic from day one. Revisit at 12–18 months of panel.

---

### Candidate B — **UPPI-CONNECT**: cost-to-connect a reference AI fabric

| Dimension | Specification |
|---|---|
| **Economic question** | What does it cost to build the optical layer of a defined AI cluster, and how is that cost changing? |
| **Index universe** | The optical BOM of one or more **published reference topologies** — e.g. an N-GPU rail-optimised leaf–spine fabric with a stated oversubscription ratio, stated link-length distribution, and stated generation |
| **Constituent definition** | A **(reference topology, link class, quantity)** triple. The topology fixes *how many* modules of *which* specification are required; Candidate A's observations supply the prices |
| **Unit** | **$ per GPU of optical connectivity**, and **$ per delivered Tbps of fabric bandwidth**. Also published as index points |
| **Price concept** | Same as Candidate A (merchant listed price). B is a *weighting and aggregation* layer over A's price observations, not a separate price concept |
| **Weighting** | **The topology is the weighting** — quantity weights are engineering requirements, published in full, not estimated. This is the candidate's central methodological advantage: the weights are *derived and auditable* rather than licensed or guessed |
| **Rebalance policy** | Topology versions are published with an effective date and an **overlap period in which both versions are priced**, so a topology change produces a documented link, never a level jump |
| **Observation frequency** | Monthly observation, **quarterly publication [JUDGMENT]** — build cost is not a monthly decision and quarterly reduces false precision |
| **Aggregation formula** | Laspeyres-type: fixed quantities from the topology version × current prices, chained across topology versions at overlap |
| **Missing observations** | Inherited from A. A link class with no priceable constituent suspends the whole topology print for that period rather than silently substituting — a partial BOM is not a BOM |
| **New products** | Enter when a **topology version** adopts them, not when they appear on the market. A 1.6T reference topology is a *new topology version* priced in parallel, not an edit to the existing one |
| **Discontinued products** | Same — handled at topology version boundaries |
| **Backfill feasibility** | Same constraint as A, plus the requirement that historical topology versions be defensible as of their dates. **[JUDGMENT] Do not backfill topologies; start forward** |
| **Source requirements** | Candidate A, plus a **defensible public basis for each reference topology** — vendor reference architectures, published cluster designs, standards documents. The topology must be justifiable from citable engineering sources, not invented |
| **Reproducibility** | **Highest of all four candidates**, if the topology is fully published — a reader with the topology document and the price observations can recompute every figure |
| **Licensing dependence** | Same as A |
| **Principal biases** | The topology is a modelling choice and *is* the index — a different topology gives a different answer; excludes switches, fiber plant, patch panels, labour and optics bundled into CPO switches unless explicitly included; list-price basis inherited from A |
| **Users must NOT infer** | That this is any real buyer's bill · that it is a constant-quality price index (it deliberately mixes price and architecture) · that it forecasts cluster cost · that a topology change was a price change |

---

### Candidate C — **UPPI-ASP**: licensed shipment-weighted ASP index

| Dimension | Specification |
|---|---|
| **Economic question** | What is the market-wide, shipment-weighted price of optical transceivers, and how is it changing net of mix? |
| **Index universe** | Whatever the licensed dataset covers — potentially the full global optical component market including segments Urdais cannot otherwise see |
| **Constituent definition** | The provider's product categories, mapped onto Urdais's specification key. **The mapping is the methodological work** and must be published |
| **Unit** | Index points; underlying ASPs in $/unit |
| **Price concept** | Shipment-weighted ASP, or modelled industry ASP, depending on the provider |
| **Weighting** | **Licensed shipment weights** — the thing no open source provides |
| **Rebalance policy** | Follows the provider's category revisions, which are outside Urdais's control — a material governance risk |
| **Observation frequency** | Quarterly at best; LightCounting's model refreshes semi-annually **[FACT]** |
| **Aggregation formula** | **Törnqvist** (or Fisher) chained across quarters — available here and only here, because both-period expenditure weights exist |
| **Missing observations** | Provider-dependent; likely none, because modelled data is complete by construction — which is itself a warning |
| **New products** | Provider-dependent. Urdais would need to know whether the provider level-links or overlap-links new categories, and would inherit that choice **[UNKNOWN]** |
| **Discontinued products** | Provider-dependent |
| **Backfill feasibility** | **Best of all four.** LightCounting advertises history 2022–2025 plus forecast **[FACT, source study §2]** |
| **Source requirements** | A commercial licence explicitly permitting derived-index construction, publication and ongoing redistribution |
| **Reproducibility** | **Lowest.** A third party cannot audit a modelled ASP. This directly conflicts with Urdais's stated reproducibility criterion |
| **Licensing dependence** | **Total, and currently blocking.** LightCounting and Omdia bar Urdais's crawler class by name; Cignal's agreement bars derivative works outright **[FACT]** |
| **Principal biases** | Model opacity; provider revision policy; category drift; **mix contamination if the provider's ASP is used raw rather than as weights** |
| **Users must NOT infer** | That the number is independently verified · that revisions will not restate history · that Urdais can explain the provider's model |

**[JUDGMENT] The highest-value form of a research-firm relationship is not to license the ASP headline. It is to license the *shipment weights* and apply them to Urdais's own observed prices** — this yields a superlative-index-quality result, keeps the price observations reproducible, and asks the provider for a far narrower grant than redistribution of their headline numbers. §15 builds the Omdia question list around this.

---

### Candidate D — **Optical Trade Unit Value** (explicitly NOT UPPI)

| Dimension | Specification |
|---|---|
| **Economic question** | How is the average declared customs unit value of network transmission apparatus moving? |
| **Index universe** | HTS 8517.62.00.90 US imports; optionally selected partner countries via Comtrade |
| **Constituent definition** | (HTS line × partner country × month) |
| **Unit** | $ per unit ("No."), and index points |
| **Price concept** | Import unit value |
| **Weighting** | Implicit — trade quantities. Uncontrollable |
| **Rebalance policy** | None; HTS revisions are exogenous and must be documented as breaks |
| **Observation frequency** | Monthly, ~5-week lag |
| **Aggregation formula** | Value ÷ quantity; optionally a Laspeyres across partner countries to *partially* control country mix |
| **Missing observations** | Rare |
| **New / discontinued products** | Invisible — the defining flaw |
| **Backfill feasibility** | **Best of all four.** 2013–present via the Census API **[FACT]** |
| **Source requirements** | A free Census API key; mandatory attribution string |
| **Reproducibility** | **Perfect.** Anyone can recompute it |
| **Licensing dependence** | None (Census). Comtrade requires a premium subscription even for transformed re-dissemination **[FACT]** |
| **Principal biases** | **Severe mix contamination**; HS impurity (`.90` is a residual bucket); transfer pricing between related parties; tariff-driven declaration behaviour — note that Chinese-origin goods under this line carry an additional 7.5% ad valorem duty **[FACT]**: https://rulings.cbp.gov/ruling/n336394 — and re-routing or reclassification responses to tariffs would move the series for reasons with nothing to do with price |
| **Users must NOT infer** | That it is a transceiver price · that a rise means prices rose · **anything at all** without the mix caveat attached |

---

## 12. Hypothetical stress tests (Task 11)

**All numbers in this section are invented for illustration. None is a market observation, a forecast, or a claim about any real product, vendor or period.**

### 12.0 The hypothetical world

Four fully specified strata:

| Stratum | Specification |
|---|---|
| **S1** | 400G DR4, QSFP-DD, DSP-retimed, 500 m, SMF |
| **S2** | 800G 2×DR4, OSFP, DSP-retimed, 500 m, SMF |
| **S3** | 1.6T DR8, OSFP-XD, DSP-retimed, 500 m, SMF |
| **S4** | 800G 2×LR4, OSFP, DSP-retimed, 10 km, SMF |

For Candidate B, the reference topology v1 requires exactly 100 modules of S2 per unit of fabric.
For Candidates A and C, price relatives are aggregated Jevons-geometric with Törnqvist expenditure weights where quantities are known.
Candidate D computes total value ÷ total units.

---

### Scenario 1 — 800G prices fall while shipment share rises

| | Period 0 price | Period 0 units | Period 1 price | Period 1 units |
|---|---|---|---|---|
| S1 (400G) | $500 | 60 | $490 | 30 |
| S2 (800G) | $1,000 | 40 | $900 | 70 |

**Every price in the market fell.**

- **A / C (matched-model, Törnqvist-weighted):** relatives 0.980 and 0.900; average expenditure weights 0.309 / 0.691 → index **0.924, −7.6%**. ✅ Captures genuine price change.
- **B (fixed topology, 100 × S2):** $100,000 → $90,000 → **−10.0%**. ✅ Correct for its question.
- **D (unit value):** period 0 = $70,000/100 = **$700**; period 1 = $77,700/100 = **$777** → **+11.0%**. ❌ **Reports an 11% increase in a period when every single price fell.** This is the mix effect in its purest form, and it is exactly what a naive `$/transceiver` average does.

---

### Scenario 2 — 400G becomes cheaper but loses share to 800G

| | P0 price | P0 units | P1 price | P1 units |
|---|---|---|---|---|
| S1 | $500 | 70 | $450 | 40 |
| S2 | $1,000 | 30 | $1,000 | 60 |

- **A / C:** relatives 0.900 and 1.000; average weights 0.385 / 0.615 → **0.960, −4.0%**. ✅
- **B:** S2 unchanged → **0.0%**. ✅ Correct — nothing the reference fabric buys changed price.
- **D:** $650 → $780 → **+20.0%**. ❌ A 20% "increase" driven entirely by substitution toward a more capable product.

---

### Scenario 3 — 1.6T launches at a large premium

Period 1 adds **S3 at $2,600** with 5 units, alongside S2 at $900.
In $/Gbps: S3 = $1.625/Gbps vs S2 = $1.125/Gbps — **the new generation is 44% more expensive per bit at launch**.

- **A:** S3 has no period-0 price. Under overlap linking it contributes **nothing** this period. Index change from the launch: **0.0%**. ✅ Correct for a constant-quality price index — and ❌ **silent on the most economically significant event of the year.** This is Candidate A's central, disclosable limitation.
- **B:** unchanged for topology v1. A **topology v2** built on 1.6T would be published in parallel and would print a **higher** cost per delivered Tbps at launch. ✅ **Only Candidate B can express "the new generation costs more per bit today."**
- **C:** the provider's ASP rises as the premium product enters the average. ⚠️ Directionally informative, but it is a mix effect being read as a price effect.
- **D:** unit value rises. ⚠️ Same confusion, with no way to decompose it.

**The lesson:** the launch premium is a real and important economic fact, and a matched-model price index structurally cannot report it. That is not a bug to fix — it is the reason Candidates A and B must both exist.

---

### Scenario 4 — a low-cost vendor enters the basket

S2 in period 0 contains only OEM-coded modules at **$1,000**. In period 1 a third-party-coded module at **$600** appears.

- **Naive averaging (and the prototype's implied behaviour):** stratum average $1,000 → $800 → **−20.0%**. ❌ **Entirely sample composition. No price changed.**
- **A with strict overlap linking:** the new constituent's *level* never enters; it must be observed twice before contributing a relative → **0.0%** at entry. ✅
- **A with the §3.2 vendor-class field:** OEM-coded and third-party-coded are **different strata**, so the entrant does not even land in the same pool. ✅✅ This is why field 9 is not optional.
- **D:** unit value falls, indistinguishably from a genuine price decline. ❌

---

### Scenario 5 — mix shifts from long-reach to short-reach

Prices **unchanged**: S4 (10 km) $2,400, S2 (500 m) $1,000. Units shift from 30/70 to 10/90.

- **A / C:** both relatives 1.000 → **0.0%**. ✅ Nothing changed, nothing reported.
- **D:** $1,420 → $1,140 → **−19.7%**. ❌ **A 20% "price decline" that is 100% reach mix.**
- **B:** moves only if the *topology version* changed. If topology v2 genuinely specifies fewer long-reach links, B prints the decline — and that is **correct**, because for a cost index a real architectural change is signal, not noise, provided it is documented and dated.

**This scenario is the direct indictment of the prototype.** A prototype "800G" series that does not control reach is structurally identical to Candidate D and will print exactly this kind of phantom move.

---

### Scenario 6 — bandwidth doubles while module price rises only modestly

S2 (800G) $1,000 → S3 (1.6T, same reach class) $1,500.

- **$/Gbps:** $1.250 → $0.938 → **−25.0%**.
- **A (matched-model, no quality adjustment):** different products, no matched pair → **0.0%**.
- **A2 (hedonic with an *estimated* bandwidth coefficient):** somewhere between 0% and −25%, and **the estimate is the entire content of the answer**.
- **A with $/Gbps normalisation:** −25%, which is precisely a hedonic with the bandwidth coefficient **forced to 1.0** and every other characteristic forced to 0.
- **B:** depends on whether one 1.6T module actually substitutes for two 800G modules in the reference topology. If it does — same port count, same reach, half the modules — the fabric cost falls and B prints the decline. If it requires a new switch generation, new SerDes and new fiber plant, the substitution is not one-for-two and **−25% overstates the gain**.

**This is the deepest methodological point in the document.** The $/Gbps answer and the matched-model answer differ by 25 percentage points, and the gap is entirely an untested assumption about substitutability. The only two defensible resolutions are (a) estimate the coefficient (A2, needs data Urdais does not yet have) or (b) model the substitution explicitly in a reference topology (B). Silently dividing by bandwidth resolves it by assumption and hides the assumption. **The prototype does exactly that.**

---

### 12.7 Summary of behaviour

| Scenario | A (matched-model) | B (cost-to-connect) | C (ASP) | D (unit value) |
|---|---|---|---|---|
| 1. 800G falls, share rises | **−7.6%** ✅ | **−10.0%** ✅ | −7.6% ✅ | **+11.0%** ❌ |
| 2. 400G cheaper, loses share | **−4.0%** ✅ | 0.0% ✅ | −4.0% ✅ | **+20.0%** ❌ |
| 3. 1.6T premium launch | 0.0% ✅ but silent | higher $/Tbps on v2 ✅ | rises ⚠️ | rises ⚠️ |
| 4. Low-cost vendor enters | 0.0% ✅ | 0.0% ✅ | depends on provider ⚠️ | falls ❌ |
| 5. Long-reach → short-reach | 0.0% ✅ | moves only on topology change ✅ | 0.0% if stratified ✅ | **−19.7%** ❌ |
| 6. Bandwidth doubles, price +50% | 0.0%, or −25% if normalised ⚠️ | depends on substitutability ✅ | depends ⚠️ | falls ⚠️ |

**Candidate D fails three of six scenarios outright and is misleading in two more. It is not a price index and must never be presented as one.**

---

## 13. Decision framework for PH-3 (Task 12)

### 13.1 Criteria, with what each actually tests

No candidate is declared a winner here. These are the criteria and the evidence each demands.

| # | Criterion | The test that resolves it |
|---|---|---|
| 1 | **Economic interpretability** | Can the index be stated in one sentence that a network procurement lead would recognise as true? Can a reader state what it does *not* mean? |
| 2 | **Data availability** | Does a rights-cleared price source exist, with enough SKUs per stratum to meet the minimum-observation rule? **Requires the §13.3 pilot** |
| 3 | **Licensing feasibility** | Is there **written** consent or clearly permissive published terms? Absence of a bar is not permission — the house rule |
| 4 | **Reproducibility** | Could an independent party recompute the index from the published methodology and the cited sources? C fails this outright |
| 5 | **Historical depth** | How far back can the series honestly go? A and B: probably forward-only. C: multi-year. D: 2013 |
| 6 | **Update frequency** | Does the cadence match the data's cadence, with no interpolation? |
| 7 | **Resistance to mix distortion** | Run §12's six scenarios against the concrete design. Any design that fails scenarios 1, 2 or 5 is disqualified |
| 8 | **Relevance to AI infrastructure** | Does the universe match where AI optics money actually goes (§3.3), not where the bandwidth ladder suggests? |
| 9 | **Methodological transparency** | Are the strata, formula, weights, linking rules and suppression rules all published? |
| 10 | **Long-term maintainability** | What happens at the next generation, the next form factor, and if CPO takes share? What is the standing cost of maintaining the ontology? |

**[JUDGMENT] Criteria 3 and 7 are gating, not weighted.** A design that fails licensing or fails the mix-distortion scenarios is out regardless of how it scores elsewhere. The remaining eight can be traded off.

### 13.2 A structural recommendation for how PH-3 should frame the choice

**[JUDGMENT]** PH-3 should not choose one of four. It should decide three things in order:

1. **Is there a rights-cleared price observation source?** If no → the only honest outputs are the Candidate D context indicator under a different name, or nothing. Decide this first; everything else is downstream.
2. **Given a price source, launch Candidate A** — it is the reproducible constant-quality series, and B cannot exist without it.
3. **Decide whether B ships at launch or later.** B is where the differentiated value is, and it is also where the reputational risk is, because the reference topology is a modelling claim Urdais must defend.

Candidate C is a *procurement decision*, not a methodology decision, and it improves A and B (as a weight source) rather than replacing them.

### 13.3 Empirical information still required before a choice is possible

Six things. None is a matter of opinion; all are measurable.

1. **A merchant SKU census.** How many distinct, fully specifiable SKUs exist per stratum on a candidate merchant? This determines whether the minimum-observation rule is satisfiable and whether a hedonic will ever be possible. **[UNKNOWN] — the single highest-value missing fact.**
2. **A list-price volatility pilot.** Observe a fixed SKU set at a fixed cadence for 8–12 weeks and measure how often and by how much listed prices actually change. This settles the frequency question empirically instead of by argument. **[UNKNOWN]**
3. **Historical availability of merchant prices.** Is there any rights-clean route to price history, or is the series forward-only? **[UNKNOWN]**
4. **Whether a defensible reference topology can be sourced from citable public engineering documents** rather than invented. **[UNKNOWN]** — this gates Candidate B entirely.
5. **Cross-merchant dispersion.** How far apart are two merchants on the same specification? Large dispersion means merchant selection dominates the index and more merchants are mandatory. **[UNKNOWN]**
6. **The mapping cost from merchant SKU text to the nine-field specification key.** If SKU titles do not reliably carry reach, retiming architecture and vendor class, the stratification is unbuildable at acceptable cost. **[UNKNOWN]**

All six can be answered without a licence and without writing production code. **[JUDGMENT] They should be answered before PH-3 selects anything, and items 1, 2, 5 and 6 are the natural content of a PH-2 pilot running alongside the rights work.**

---

## 14. Critical unknowns requiring further research or vendor discussion

**Rights (PH-2's scope, listed for completeness)**
- Whether FS.com permits automated collection and derived-index use. **Currently unreadable, not merely unresolved** — HTTP 202 zero-byte on robots.txt and every policy URL **[FACT]**. Must be settled in writing.
- Flexoptix's substantive GTC, which is not served outside a storefront session.
- Whether any research firm will grant a *weights-only* licence (§15).

**Data structure**
- All six items in §13.3.
- Whether merchant catalogues expose a stable SKU identifier across time, or whether SKUs are silently re-listed — which would break matched-model linking at the root. **[UNKNOWN]**
- Whether quantity-tier pricing is exposed publicly and whether qty=1 pricing is representative. **[UNKNOWN]**
- Whether multi-region storefronts (the source study notes US/EU/UK/AU/SG variants) can support a cross-geography panel, or whether currency and regional-pricing policy would dominate. **[UNKNOWN]**

**Market structure**
- The actual deployed mix by reach class in AI fabrics. Everything in §3.3 about the cluster layer being the centre of gravity is **[INFERENCE]**, not measured. This is the single fact most worth buying from a research firm.
- The pace and shape of CPO substitution, which bounds the useful life of any pluggable-only index. **[UNKNOWN]**
- Whether and when scale-up interconnect moves to optics. **[UNKNOWN]**
- Whether the 2026 supply-constrained environment makes list prices *more* informative (they move) or *less* (they become nominal while allocation, not price, clears the market). **[UNKNOWN] — and important, because it affects what the index measures in its first year.**

**Methodology**
- Whether the bandwidth coefficient is anywhere near 1.0 — the assumption behind every $/Gbps figure. Testable only with a panel. **[UNKNOWN]**
- Whether OEM-coded and third-party-coded modules move together. If they do, they can share a stratum; if not, they cannot. **[UNKNOWN]**
- Whether a defensible reference topology exists in public engineering literature. **[UNKNOWN]**

**Governance**
- Whether UPPI should publish at all before it can publish Candidate B, given that Candidate A alone is a listed-price index of a market whose real prices are negotiated. **[JUDGMENT: an open question, and a legitimate reason to defer.]**

---

## 15. Questions Urdais should ask Omdia (and LightCounting / Cignal AI / Dell'Oro) before methodology selection

Structured so the first block is answerable in a first call and determines whether the rest is worth having. The framing throughout is *weights and structure*, not *headline numbers* — a narrower and far more grantable ask.

### Block 1 — Does the licence permit the use case at all
1. Does any licence tier permit constructing and **publicly publishing an index derived from** your data, on an ongoing basis, with attribution — as distinct from citing your figures in a report?
2. If yes, what exactly may be published: index values only, or also the underlying category-level ASPs?
3. Is there a **citation policy** separate from the subscription agreement, and does it contemplate ongoing derived publication rather than one-off press citation? (Omdia publishes a `citations@omdia.com` address, which suggests this has been considered **[FACT, source study §1]**.)
4. What survives termination? If Urdais publishes an index for three years and the licence lapses, may the historical series remain published?
5. Are there redistribution tiers priced by audience size, and what are the bands?

### Block 2 — The weights-only ask *(the highest-value question in the list)*
6. **Would you license shipment volumes / unit shares alone — without ASPs — as weights for an index whose prices Urdais observes and publishes itself?** This is a narrower grant, it does not expose your pricing IP, and Urdais's output would not substitute for your product.
7. At what granularity are volumes available — by rate only, or by rate × reach × form factor × retiming architecture?
8. Would you consider a co-branded or attributed arrangement in which the weights are credited to Omdia by name?

### Block 3 — Granularity, which determines whether the data can support a real index
9. At what granularity is pricing broken out? Specifically: is 800G split by **reach class** (DR/FR/LR), by **form factor** (QSFP-DD/OSFP), by **retiming architecture** (retimed / LRO / LPO), and by **fiber type**? *(If the answer is "800G is one line," the dataset cannot support a constant-quality index and this whole conversation changes.)*
10. Are Ethernet and InfiniBand optics separated? Are NVIDIA twin-port modules counted as one unit or two?
11. Are coherent ZR/ZR+ modules separated from datacom IM-DD?
12. Are OEM-coded and third-party/generic modules separated?
13. Are DAC/AEC/ACC/AOC copper products in scope, and separately identified?
14. How is **CPO** handled — excluded, imputed, or allocated at some notional per-port value?

### Block 4 — Methodology, which determines whether the number can be trusted downstream
15. Is the ASP a **shipment-weighted average of reported transactions**, a **modelled estimate**, or a blend? What share of each period is survey-reported versus modelled?
16. How many vendors report, and what share of global units do they represent?
17. Is the ASP a transaction price, a booked price, or a list price? Does it include or exclude the NRE, support and tooling components of a supply agreement?
18. **When a new product category is introduced (e.g. 1.6T), does its first-period price enter the level, or is it overlap-linked?** *(This determines whether the provider's series has a new-product bias Urdais would inherit.)*
19. What is the revision policy? How often is history restated, and by how much historically?
20. Are category definitions ever changed retroactively, and is a concordance published when they are?

### Block 5 — Coverage, cadence and operational fit
21. What is the actual publication cadence and lag — quarter-end plus how many weeks?
22. What is the earliest period available at the current granularity, as opposed to at a coarser historical granularity?
23. Is there a machine-readable delivery (API, flat file), or is it PDF and slideware?
24. What geographic splits exist, and are China-domestic volumes included in global figures?
25. Do you already license data to anyone constructing a public index in any sector? If so, what did that structure look like?

### Block 6 — Opening the robots.txt question directly
26. Urdais's crawler class (`ClaudeBot`, `Claude-User`) is disallowed at `/` in your robots.txt **[FACT]**. Urdais has honoured that and has collected nothing. Is that bar a blanket policy, and does a licensed relationship change it? *(Raising this unprompted is the strongest available signal of good faith, and the existing source study already recommends leading with it.)*

---

## Appendix — sources cited

**Standards and industry specifications**
- IEEE P802.3dj Task Force — https://www.ieee802.org/3/dj/index.html
- IEEE P802.3dj adopted objectives (14 Mar 2024) — https://www.ieee802.org/3/dj/projdoc/objectives_P802d3dj_240314.pdf
- OSFP MSA module specification Rev 5.1 — https://www.osfpmsa.org/assets/pdf/OSFP_Module_Specification_Rev5_1.pdf
- OSFP MSA, OSFP1600 and OSFP-XD — https://osfpmsa.org/assets/pdf/OSFP1600_and_OSFP-XD.pdf
- LPO MSA FAQ — https://www.lpo-msa.org/home/faqs.html
- IEEE EPS, "Linear Pluggable Optics – An Overview" — https://eps.ieee.org/wp-content/uploads/2026/03/Linear-Pluggable-Optics_V2-UPDATED.pdf
- Juniper, LPO and LRO optic types — https://www.juniper.net/documentation/us/en/hardware/800g-optics-cables-guide/optics/topics/concept/800g-optic-types-lpolro.html
- OIF, 800ZR IA release and 400ZR updates — https://www.oiforum.com/oif-releases-800zr-coherent-interface-implementation-agreement-ia-and-key-400zr-ia-updates-addressing-market-demands-for-scalable-interoperable-high-capacity-solutions/
- Arista 800G optics FAQ — https://www.arista.com/assets/data/pdf/Datasheets/Arista-800G_Optics_FAQ.pdf

**Products and deployment**
- NVIDIA DGX GB200 system hardware (NVLink passive copper cable backplane) — https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html
- NVIDIA MMA4Z00-NS 800 Gb/s twin-port OSFP overview — https://networking-docs.nvidia.com/800gmma4z00ns/overview
- NVIDIA Spectrum-X / Quantum-X Photonics CPO announcement — https://nvidianews.nvidia.com/news/nvidia-spectrum-x-co-packaged-optics-networking-switches-ai-factories
- FS 800G OSFP DR8 datasheet (16 W max) — https://resource.fs.com/mall/file/datasheet/800g-osfp-dr8-datasheet.pdf
- Lumentum 1.6T 2×DR4 TRO OSFP — https://www.lumentum.com/en/products/16t-2dr4-tro-osfp-transceiver-module

**Index-number methodology**
- Federal Reserve G.17, communications equipment price indexes methodology — https://www.federalreserve.gov/releases/g17/commequip_price_indexes.htm
- Byrne & Corrado, "Prices for Communications Equipment: Rewriting the Record," FEDS 2015-069 — https://www.federalreserve.gov/econresdata/feds/2015/files/2015069pap.pdf
- Byrne & Corrado, "ICT Asset Prices: Marshaling Evidence into New Measures," FEDS 2017-016 — https://www.federalreserve.gov/econresdata/feds/2017/files/2017016pap.pdf
- IMF, Export and Import Price Index Manual, Ch. 2 "Unit Value Indices" — https://www.imf.org/external/np/sta/tegeipi/ch2.pdf
- IMF, Producer Price Index Manual — https://www.imf.org/external/pubs/ft/ppi/2010/manual/ppi.pdf
- BLS, hedonic price adjustment techniques — https://www.bls.gov/cpi/quality-adjustment/hedonic-price-adjustment-techniques.htm

**Data sources and classification**
- USITC Harmonized Tariff Schedule — https://hts.usitc.gov/
- CBP ruling NY N336394, classification of an optical transceiver — https://rulings.cbp.gov/ruling/n336394
- US Census International Trade API — https://www.census.gov/data/developers/data-sets/international-trade.html
- CSRC Announcement [2014] No.21 (production/sales volume disclosure) — http://www.csrc.gov.cn/csrc_en/c102034/c1371318/content.shtml
- USAC Open Data, E-Rate FRN line items — https://opendata.usac.org/E-Rate/E-Rate-Request-for-Discount-on-Services-FRN-Line-I/hbj5-2bpj/data
- GSA CALC — https://calc.gsa.gov/
- TrendForce, AI optical transceiver market and component shortages (20 Apr 2026) — https://www.trendforce.com/presscenter/news/20260420-13017.html

---

## Stop condition

PH-1 ends here. No methodology is frozen, no candidate is selected, no version is assigned, no code, migration, schema, ingestion path or surface change is proposed for implementation, and nothing in the Urdais repository has been modified. PH-2 investigates source rights and licensing; PH-3 selects a methodology against §13 once the six empirical unknowns in §13.3 are answered.
