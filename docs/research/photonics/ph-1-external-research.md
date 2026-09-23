# PH-1 — Photonics benchmark research, 23 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It designs no UI, writes no ingestion code, selects no vendor, and establishes no legal right.

**Product baseline.** The current frontend (`src/data/mock/market-detail.ts`) treats UPPI as one family, **Pluggable Optics**, with five instruments named only by nominal rate: 100G, 200G, 400G, 800G, and 1.6T. The unit is **USD / transceiver**. 800G is the headline. The same file states that generations are not subdivided by reach or standard, and that a normalised USD / Gbps may be derived later. Every displayed value, daily percentage, and history is deterministic **demo data**. Those numbers are not market observations and are not repeated here.

**Research date.** Sources were inspected on 23 September 2026. URLs, quoted report descriptions, and publication dates are as they stood that day.

**What this document does not do.** It does not defend the prototype taxonomy. It does not pick a production methodology. It does not treat analyst forecasts as observed prices.

---

## 0. Evidence standard

Three classes, marked throughout:

- **[verified]** — quoted from a primary page or PDF extracted and read in this pass.
- **[retrieved]** — obtained from a primary page whose full text was JS-rendered, truncated, or returned through a search extraction of that page. Substance reliable; wording indicative.
- **[inferred]** — a reading of how sources interact, or of a market practice. **Never treated as a right or as a price.**

**Nothing in this document establishes a right.** Public accessibility is not republication permission. A press release that quotes an analyst is not a transaction price. A forecast is not a current price. A customs unit value is not an ASP.

---

## 1. Executive Summary

**A single “800G Optical Transceiver” price is not an economically comparable object.** At one nominal rate, products already shipping in 2026 differ by reach, fiber, wavelength plan, connector, retiming, and coherent versus direct-detect. Those differences change the bill of materials, the fiber plant, and the buyer. Professional datasets do not price “800G.” They price speed crossed with reach, form factor, and, in the better Ethernet files, retimed versus linear versus co-packaged.

**What is economically relevant to AI infrastructure in September 2026, as observed rather than forecast:**

- **Scale-out fabrics** are the volume optics market. Cignal AI’s 1Q26 Optical Components Report, published 18 June 2026, says 800GbE was the majority of high-speed (400G+) datacom module shipments, that almost 20 million such modules shipped in the quarter, and that 1.6TbE was ramping, nearly all of it in DR (silicon photonics) configurations **[verified]**. That is an analyst shipment construct, not a price.
- **Short copper still displaces optics inside the rack and on scale-up.** NVIDIA’s own interconnect catalog sells DAC and active copper beside optics. Cignal AI’s 1 April 2026 CPO note says the scale-up network “is currently served by copper” **[verified]**.
- **Datacenter interconnect (scale-across) is a second market:** coherent pluggables, principally 400ZR today and 800ZR/ZR+ entering large deployments. OIF’s 800ZR implementation agreement (8 October 2024) is an 80–120 km amplified DWDM interface, not an intra-datacenter DR8 module **[verified]**.
- **Co-packaged optics are not the 2026 volume market.** On 1 April 2026 Cignal AI wrote that there were “no products shipping in volume yet,” with small demonstration deployments expected in 2026 **[verified]**. The 18 June 2026 quarterly note then says CPO port deployment “begins modestly in 2026” **[verified]**. That second sentence is a forecast of the year, not a census of installed price.

**What “price” means here.** There is no exchange, no public spot board, and no daily print. The measurement professionals actually publish is an **average selling price** built from confidential vendor shipments and sales: units, revenue, and a price that is revenue divided by units inside a defined category. LightCounting states this explicitly for more than 200 products, with history 2022–2025 and a forecast through 2031 **[verified, April 2026 Market Forecast]**. Omdia’s Optical Components Intelligence Service brochure lists units, revenues, and ASP as forecast measures **[verified]**. Cignal AI publishes quarterly revenue and unit shipments; a category ASP is derivable only where both are published at the same grain, which the public methodology page does not promise **[verified]**.

**Observation frequency.** The finest recurring professional cadence found is **quarterly** (Cignal AI; Dell’Oro Optical Transport). LightCounting’s priced forecast databases are issued on a roughly semiannual research cycle (October 2025 and April 2026 market forecasts; March 2026 Ethernet Optics), with historical blocks stated as annual ranges, not daily series **[verified]**. **One-day and one-week percentage changes have no defensible basis** in any source inspected. A monthly series was not found. Prices do move — Cignal’s June 2026 note says component shortages are “slowing the usual price declines” **[verified]** — but the observed rhythm is a supply-cycle and contract rhythm, not a session print.

**Open data cannot set the level.** US imports of optical transceivers are classified in HTS **8517.62.0090**, a residual basket whose article description is “Other” under machines for reception, conversion, and transmission, including switching and routing apparatus **[verified, CBP ruling NY N336394; HTS secondary compilations of the 2026 schedule]**. That basket cannot isolate 800G DR8 from a router, a 10G SFP, or a media converter. The nearest PPI, BLS communications-equipment manufacturing (PCU33423342), is a monthly industry index, not a transceiver price; the fiber-optic-cable PPI was discontinued with the July 2025 release **[verified]**.

**Urdais would be creating a public benchmark, not copying a public one.** The established private methodology is the analyst ASP, segmented far below nominal rate. No public optical-transceiver price index analogous to a memory spot board was found. Publishing any of those analyst series, or a derivative of them, requires a written licence. LightCounting’s March 2026 Ethernet Optics report states that redistribution without expressed permission is prohibited **[verified]**.

**What is ruled out by the evidence, without choosing a successor:**

- A production instrument defined only as “{rate} Optical Transceiver.”
- A production unit of USD / transceiver that mixes DR, FR, ZR, LPO, and CPO.
- A 1-day or 1-week change.
- An “Open UPPI” that pretends a customs unit value or a communications-equipment PPI is a transceiver ASP.

Four different designs are set out in §10. The choice among them is a later decision. It depends on questions Omdia, LightCounting, and Cignal AI have not answered in public, listed in §11 and §12.

---

## 2. Optical Transceiver Market Taxonomy

The industry does not sell a rate. It sells a **physical-medium specification** inside a **mechanical form factor**, with an electrical interface, a management interface, and often a second identity as Ethernet, InfiniBand, or coherent DWDM.

### 2.1 Who specifies what

These layers are not interchangeable, and only some of them are prices.

| Layer | What it standardises | What it does not standardise | Why it matters for a price |
| --- | --- | --- | --- |
| IEEE 802.3 | Ethernet MAC rate and optical/electrical PMDs (reach, fiber, wavelength, lane count) | Module mechanics; a dollar price | Two IEEE PMDs at the same MAC rate are different products |
| OIF implementation agreements | Coherent line interfaces (400ZR, 800ZR) and some electrical/management specs (CEI, CMIS) | Intra-datacenter parallel optics | 800ZR is a DCI product, not an 800GBASE-DR8 |
| Form-factor MSAs (OSFP, QSFP-DD and its 800/1600 extensions) | Cage, connector, power class, heat sink | The optical PMD | OSFP and QSFP-DD800 are not insert-compatible |
| LPO MSA | Linear (unretimed) pluggable optical and host-electrical specs | A market price | An 800G-DR8-LPO is not the same cost object as a retimed 800GBASE-DR8 |
| Vendor / NVIDIA LinkX coding | Which firmware image, which switch or NIC, finned versus flat top | An open price | A coded InfiniBand module can be unsellable as generic Ethernet |

**[inferred]** from the documents cited below. The split itself is how the standards are scoped, not a price claim.

### 2.2 Data rate is real, and it is not sufficient

IEEE Std **802.3df-2024** is an active standard. Board approval 15 February 2024; published 15 March 2024. It adds MAC parameters for 800 Gb/s and physical-layer specifications for 400 Gb/s and 800 Gb/s operation **[verified, IEEE SA]**. Cisco’s OSFP 800G datasheet, updated 5 January 2026, cites IEEE 802.3df and sells distinct 800GE modules against **800GBASE-VR8**, **800GBASE-DR8**, and **2×400GBASE-FR4** **[verified]**.

IEEE **P802.3dj** (200 Gb/s, 400 Gb/s, 800 Gb/s, and 1.6 Tb/s, aimed at 200 Gb/s per lane) is **not a published standard** as of this research date. Its second Standards Association recirculation closed 15 August 2026 at 86% approval, with 185 comments left for the September 2026 task-force session **[verified, IEEE 802.3 reflector, David Law, 17 August 2026]**. IEEE SA still lists the project as an active draft **[verified]**. Shipping 1.6T modules in 2026 are therefore ahead of, or beside, a finished IEEE standard. Cignal’s mix comment — nearly all 1.6T in DR silicon photonics — is about what vendors are shipping, not about a completed 802.3dj PMD set **[verified]**.

Nominal rates in commercial discussion, and how this pass classifies them:

| Rate | Status in September 2026 | Not the same thing as |
| --- | --- | --- |
| 100G | Historical volume generation; still in enterprise, breakout, and wireless/telecom catalogs | A constituent of an AI scale-out basket |
| 200G | Transitional; appears as a breakout of 800G (4×200GE) and as its own module generation | 800G |
| 400G | Deployed generation; also the client side of 2×400G modules and of 400ZR | 800G |
| 800G | The current scale-out workhorse in Cignal’s 1Q26 shipment account **[verified]** | One SKU. See §2.3 |
| 1.6T | Shipping, ramping; Cignal: +50% sequential in 1Q26, almost all DR silicon photonics **[verified]**. Full-year “exceed 10 million units in 2026” is a **forecast** in that same release | A published IEEE rate. P802.3dj is still in ballot |
| 3.2T | In LightCounting’s forecast taxonomy (Ethernet Optics, March 2026, as a forecast category through 2031) **[verified]**. Not described by Cignal’s 1Q26 public highlights as a volume shipment | A current price observation |

### 2.3 Inside 800G, the products are different

Cisco’s 5 January 2026 OSFP 800G datasheet is a single manufacturer’s catalog, not a market price list — it publishes **watts, reach, fiber, and wavelength**, not dollars. It is still enough to show that “800G” is a family **[verified]**:

| Cisco PID | Optical identity Cisco claims | Reach | Medium | Connector | Wavelengths |
| --- | --- | --- | --- | --- | --- |
| OSFP-800G-VR8 / VR8P | 800GBASE-VR8 | 30 m OM3 / 50 m OM4/5 | Parallel multimode | Dual MPO-12 or MPO-16 APC | 850 nm |
| OSFP-800G-DR8 / DR8P | 800GBASE-DR8 | 500 m | Parallel single-mode | Dual MPO-12 or MPO-16 APC | 1310 nm |
| OSFP-2X400G-FR4 | 2× 400GBASE-FR4, usable as 800GE over two duplexes | 2 km | Dual duplex single-mode | Dual duplex LC | 1270 / 1290 / 1310 / 1330 nm |

Power is in a similar band (typical about 13–14 W; maxima about 14.5–17 W with diagnostics). The economic difference is not a few watts on the module. It is **eight fiber pairs and a parallel connector versus two duplexes and a CWDM multiplexer**, plus a different installed fiber plant. A DR8 and a 2×FR4 can both be described as “an 800G optical transceiver.” They are not substitutes on a given link.

OIF-800ZR-01.0, dated 8 October 2024, defines something else again: a **single-wavelength 800G coherent** line interface for **single-span, amplified, 80–120 km DWDM** datacenter-interconnect links, in a small-form-factor pluggable, with no restriction to one cage type **[verified, OIF IA and 30 October 2024 press release]**. Cisco’s separate 800ZR/ZR+ datasheet positions 800ZR for amplified DCI and 800ZR+ (OpenROADM PCS) for metro and regional reaches beyond that **[verified]**. Juniper documents that its 800ZR and 800G OpenZR+ modules need a **coherent-optics software licence** on the host, which is a price component a client DR8 module does not have **[verified]**.

**[inferred]** A headline “800G Optical Transceiver Price” averages at least four non-fungible goods: short-reach multimode, 500 m parallel single-mode, 2 km duplex/CWDM, and coherent ZR/ZR+. Channel coding (generic versus NVIDIA/InfiniBand), retimed versus LPO, and OSFP versus QSFP-DD are further splits. LightCounting’s March 2026 Ethernet Optics report says its forecast has **more than 100 product categories** of 100GbE through 3.2T, including retimed, LPO/LRO, and CPO/NPO, **sorted by reach and form factor** **[verified]**. That is the industry’s own admission that rate is not the category.

### 2.4 Distinctions that change comparability

Ordered by how hard they make a price incomparable. This ordering is **[inferred]** from the standards and catalogs above, not from a measured price gap. This pass found **no public, recurring dollar gap** between these cells and does not invent one.

1. **Application: datacom client versus coherent DCI versus access/wireless.** Cignal AI’s own report splits Datacom at “10 km or less,” including AOCs, from Telecom at “>10 km,” including amplifiers, ROADMs, coherent, and direct-detect ER/ZR **[verified, cignal.ai/optco, page inspected 23 September 2026]**. Omdia’s brochure uses the same Telecom / Datacom / Access split **[verified]**. Mixing them produces a price of “optics,” not of a link.
2. **Optical PMD / reach / fiber.** VR/SR (multimode, tens of metres), DR (parallel single-mode, ~500 m), FR (CWDM duplex, ~2 km), LR (longer duplex), ZR/ZR+ (coherent, tens to hundreds of kilometres, amplified). Parallel DR consumes more fiber; FR consumes more optical multiplexing; ZR consumes a coherent DSP and a line system.
3. **Retimed versus linear.** The LPO MSA’s 100G-DR-LPO specification, announced 25 March 2025, covers 100/200/400/800 Gb/s parallel single-mode links at 100 Gb/s per lane and 0.5–500 m, with the DSP left on the host **[verified]**. The MSA’s public line is that this lowers power, cost, and latency. Whether it does, and by how many dollars, is not established by the specification. An 800G-DR8-LPO and a retimed 800GBASE-DR8 are different cost objects even when reach matches. LRO (linear receive optics: transmit path retimed, receive path linear) is a third electrical architecture. LightCounting tracks it as its own category **[verified]**. This pass did not retrieve an LRO MSA document.
4. **Form factor and thermal variant.** OSFP and QSFP-DD are different cages. NVIDIA documents that its switches use twin-port OSFP, while NICs may use OSFP or QSFP112, and distinguishes finned-top (switch, air-cooled) from flat or riding heat sinks (NIC, or a host that has its own heatsink) **[retrieved, NVIDIA networking interconnect documentation and DGX linking note]**. A twin-port 2×400G OSFP is also not the same object as a single-port 800G OSFP.
5. **Breakout.** Cisco’s DR8 module is specified to break out to 2×400GBASE-DR4, 4×200GBASE-DR2, and 8×100GBASE-DR1 **[verified]**. The module price and the price per 100G endpoint are different questions. A breakout-heavy buyer and a native-800G buyer can pay the same module price and have different costs per endpoint.
6. **Ethernet versus InfiniBand coding.** NVIDIA LinkX sells parallel families for Spectrum Ethernet and Quantum InfiniBand, including 800 Gb/s twin-port 2×DR4 and 2×FR4 optics and a 1600 Gb/s twin-port 2×DR4 class **[retrieved, NVIDIA interconnect documentation]**. The optical engine may be similar. The firmware, support contract, and buyer are not. A generic merchant 800G DR8 is a third commercial object.
7. **Pluggable module versus co-packaged or near-packaged optics.** CPO removes the separable module. The purchasable objects become switch ports, external laser sources (ELSFP), and a packaging process. Cignal AI, 1 April 2026: “CPO should be considered more of a process than a product” **[verified]**. An index whose unit is USD / transceiver cannot absorb CPO without changing unit.
8. **Modulation and lane plan, once rate is fixed.** 800G as 8×100G PAM4 (802.3df generation) versus 4×200G PAM4 (802.3dj generation) changes the SerDes, the DSP, and which hosts can use the module. 1.6T DR as described by Cignal is a silicon-photonics DR implementation; a future FR or coherent 1.6T is a different radio and a different fiber plan. **[inferred]** from the lane structure of 802.3df versus the stated scope of P802.3dj.
9. **Merchant versus captive.** Cignal excludes Google’s internal optical-circuit-switching deployments from the OCS total addressable market it forecasts **[verified, 18 June 2026]**. Captive consumption (a hyperscaler or NVIDIA buying from its own qualified chain at a transfer price) may never appear in a merchant ASP. **[inferred]** that a merchant ASP is the observable market, not the full economic cost of optics inside the largest clusters.

Distinctions that usually do **not** justify a separate instrument, once the PMD is fixed: pull-tab color, CMIS minor revision, and ordinary vendor brand within a multi-source IEEE PMD. Brand still matters in the channel, because coded optics sell at different list prices from compatibles. That is a **channel** fact. It is not evidence that hyperscaler contract prices differ by the same ratio. **[inferred]**

---

## 3. AI and Datacenter-Relevant Optical Technologies

Press volume is not deployment. The split below follows shipment commentary, standards that have products cited against them, and vendor catalogs. Forecast sentences are labelled as forecasts.

### 3.1 Where optics sit in an AI cluster

| Network job | What carries it in 2026 | Optical product that is economically material | Evidence status |
| --- | --- | --- | --- |
| Scale-up inside a GPU rack (NVLink-class) | Copper. Cignal: copper “beats optics in power and cost” on scale-up **[verified, 1 April 2026]** | Not a pluggable Ethernet transceiver. Future CPO/NPO would be a **new** market, not a replacement series | Observed architecture. Optical scale-up is a forecast (Cignal: scale-up optics follow scale-out by 2–3 years; “over 25 million CPO ports” a year by 2030 is explicitly conservative **forecast**) |
| Scale-out (GPU-to-leaf-to-spine) | Optics, plus short copper DAC/ACC | 400G still deployed; **800G pluggables are the volume generation**; 1.6T ramping, mostly DR silicon photonics | Cignal 1Q26 **observed** shipment account **[verified]**. NVIDIA Spectrum-X800 SN5600 is specified as 64×800G OSFP, with LinkX optics, DAC, and linear active copper, reaches “up to 2 kilometers” **[retrieved, NVIDIA Spectrum-X800 datasheet]** |
| Front-end / traditional datacenter Ethernet | Same merchant module industry, lower speed mix, more enterprise | 100G–400G, multimode and single-mode | LightCounting segments Cloud, Enterprise, and Telecom separately **[verified]** |
| Scale-across / DCI between buildings or campuses | Coherent pluggables and some embedded WDM | 400ZR/ZR+ in volume historically; **800ZR/ZR+ entering large deployments in 2026**, with Cignal naming Meta scale-across orders and an early lead for Acacia | Cignal 18 June 2026 and 27 January 2026 **[verified]**. Dell’Oro: 2025 optical-transport growth was DCI-led **[verified, 18 February 2026]** |
| InfiniBand AI back ends | NVIDIA Quantum fabrics, LinkX | Twin-port OSFP optics (2×DR4, 2×FR4) and copper, NDR at 800G-class and XDR at 1.6T-class | NVIDIA product documentation **[retrieved]**. Not the same buyer universe as generic Ethernet DR8 |
| Optical circuit switching | Largely a Google-internal architecture in public commentary; merchant OCS is a forecast market | Not a transceiver ASP | Cignal forecasts merchant OCS and **excludes** Google internal **[verified]** |

### 3.2 Deployed versus announced versus forecast

**Treat as deployed or shipping in volume, on analyst shipment evidence:**

- High-speed datacom modules as a class. Cignal, 1Q26: datacom optical-component revenue **$7.7 billion** in the quarter, more than double a year earlier; telecom optical-component revenue **$2.0 billion**. High-speed (400G+) module shipments up 145% year over year; almost **20 million** modules in the quarter. Innolight led both datacom revenue and high-speed unit shipments **[verified, 18 June 2026]**. These are research-firm aggregates. They are the best public observation of scale. They are not an invoice file.
- 800GbE as the majority of those high-speed units, with unit shipments “more than tripled year-over-year” **[verified]**. The sentence “unit shipments will more than double in 2026” is a **forecast**.
- 1.6TbE as a real ramp: sequential growth of 50% in 1Q26, “nearly all” in DR silicon photonics **[verified]**. “Will exceed 10 million units in 2026” is a **forecast**.
- 400ZR as the established coherent pluggable generation. Cignal, 27 January 2026: 400ZR/ZR+ “firmly established”; 800ZR/ZR+ “beginning large-scale rollouts this year” **[verified]**. The January note’s claim that 800ZRx will surpass 400ZRx is a **forecast**.
- DCI equipment demand in 2025. Dell’Oro, 18 February 2026: optical transport market grew 10% in 2025; direct WDM purchases for DCI grew nearly 40%; direct cloud-provider purchases grew around 50%, covering WDM transponders, ZR optics, and line systems **[verified]**. “Cloud providers will build scale-across DCI” in 2026, and the market “is forecast to grow 10 percent in 2026,” are **forecasts**.

**Treat as specified and beginning, not as the price benchmark’s base:**

- LPO. Specification exists (LPO MSA, 25 March 2025). Cisco has discussed 800G LPO as a host-paired product rather than a universal plug **[retrieved, Network World interview with Cisco, not re-fetched as a Cisco datasheet in this pass]**. LightCounting and Cignal both track linear drive as its own category. This pass did **not** find a public unit-shipment census that shows LPO as the majority of 800G.
- 800ZR shipments into Meta scale-across, described by Cignal as the first large deployments, with Acacia early **[verified, 18 June 2026]**. That is a start-of-volume statement, not a multi-year price history.

**Treat as announced or forecast, not as a 2026 price series:**

- CPO. 1 April 2026: no volume shipments; Nvidia and Broadcom/TSMC aiming at 200G/lane platforms; Lumentum and Coherent expect to ship into **scale-up** hardware by 2027; CPO port counts “small in 2026,” growth from 2027, “taking off in 2029/2030” **[verified]**. 18 June 2026: “deployments are imminent” and “begins modestly in 2026,” with tens of millions of ports a year by 2030 **[verified, forecast]**. NVIDIA’s Ethernet switching pages list Spectrum-X photonics systems with co-packaged optics (MMC connectors, 102.4 Tb/s class) alongside pluggable OSFP systems **[retrieved]**. Listing on a product page is not a shipment-weighted price.
- 3.2T retimed modules and 1.6T ZR. Present in LightCounting’s 2026–2031 forecast taxonomy. The April 2026 newsletter says demand for distributed AI clusters “will boost sales of 800G ZR/ZR+ in 2026 and 1.6T ZR/ZR+ in 2028-2029” **[verified, forecast]**.
- NPO as a distinct priced category. LightCounting’s March 2026 scope includes CPO/NPO. This pass did not retrieve a standard with the force of IEEE 802.3df or OIF-800ZR, nor a shipment count.

### 3.3 What an AI-relevant basket would have to notice

**[inferred]** from the evidence above, not a methodology choice:

- The economically central **client** optic for training and inference scale-out in 2026 is an **800G single-mode pluggable**, and the important split inside it is at least **DR (parallel, ~500 m)** versus **FR / 2×FR4 (duplex, ~2 km)**, plus a smaller multimode cell where the fiber plant is short. 1.6T DR is the generation entering volume, not the generation that already dominates units.
- **InfiniBand twin-port OSFP** is a parallel demand pool controlled by one ecosystem. Folding it into “800G Ethernet” hides both the coding and the twin-port geometry (a 1.6T OSFP cage that presents two 800G optical engines).
- **Coherent ZR** should be a different family. It is how clusters in different buildings are tied together. Its suppliers, its reach, its DSP, and Dell’Oro’s decision to track it inside optical transport rather than inside Ethernet switching all say so.
- **Scale-up copper, CPO, and OCS** are part of the technology story. They are not a transceiver ASP. Putting them in the same instrument as an 800G DR8 module changes the unit.

---

## 4. What “Price” Means in This Market

There is no single price. The words below are used in the industry. Only some of them can be observed.

| Concept | What it is | Who publishes it | Suitable as an index level? |
| --- | --- | --- | --- |
| Average selling price (ASP) | Revenue divided by units inside a researcher’s category, after the researcher has collected or estimated vendor sales | LightCounting (“pricing”); Omdia brochure (“ASP”); Dell’Oro optical transport (“average selling prices”) | The only recurring professional construct found. It is an **estimate / survey aggregate**, not a print. Rights sit with the firm |
| Shipment-weighted ASP | The same ASP when units are the weights. A rate-level ASP is shipment-weighted across PMDs whether or not the publisher admits it | Implicit in any units-and-sales database | Meaningful only if the category is homogeneous enough to average |
| Revenue / unit-derived ASP | Arithmetic on published revenue and units | Possible on Cignal **only if** a category has both. Public page documents segment revenue and unit shipments, not a price field **[verified]** | A derived figure. Still the analyst’s number. Licence required to republish |
| Manufacturer list price | A catalog or quote sheet the vendor may not even publish | Cisco’s 800G OSFP datasheet inspected here has **no dollar prices** **[verified]** | Not observed for the AI-relevant SKUs in this pass |
| Distributor / street price | A channel offer for coded or compatible modules, visible to whoever the distributor will sell to | Exists as a commercial practice. This pass did **not** collect live distributor quotes, and does not recommend collecting them by automated means | A different market from hyperscaler contracts: lower volume, different warranty, often “compatible” rather than OEM. See §7 |
| Hyperscaler contract price | Negotiated price, often annual or program-based, for qualified modules in the millions | Not published. LightCounting says more than 20 vendors **shared sales information** confidentially **[verified]** | The economic price that matters. Not directly observable |
| Procurement / tender price | A line item on a public award | Sporadic. No continuous series found | Usable as an anecdote. Not a basket |
| Analyst-estimated ASP | The usual case when vendors do not report a clean category | Cignal: “We collect vendor revenue from public sources… estimating when necessary” **[verified]** | Label it as an estimate. Do not relabel it as a transaction |

**What the professionals actually compute.** LightCounting’s April 2026 Market Forecast: a database of **shipments, pricing, and sales** for more than 200 products, history **2022–2025**, forecast **2026–2031**, drawing on more than 30 transceiver vendors of whom more than 20 shared sales data **[verified]**. The March 2026 Ethernet Optics report repeats “units, prices, and sales” for more than 100 categories, split across **cloud data centers, enterprise, and telecom** **[verified]**. The April newsletter’s discussion of the cycle is the closest public description of *how* price behaves: early-cycle shortages produce “more stable pricing”; once capacity arrives, “double ordering goes away and price declines accelerate” **[verified]**. That is a qualitative mechanism. It is not a time series.

Omdia’s Optical Components Intelligence Service brochure lists forecast measures **Units, Revenues, ASP** for datacom transceivers and AOCs, high-speed coherent optics, ICP data-center optics (transceivers, AOCs, DACs), and silicon-photonics transceivers **[verified]**. The brochure’s narrative is older than the market it describes: it still calls 400G the fastest-growing segment and shows a chart axis through 2027. Use it as evidence of **what the service measures**, not of the 2026 mix. A later product page, High-Speed OC Forecast: 2023–29, dated 15 November 2024, records that “the pricing model had an error” and that Omdia “updated the pricing on the Telecom tabs” **[verified]**. That is direct evidence of a maintained price model at least for telecom, as of late 2024. The 31 October 2025 “Datacom Transceiver, AOC, and DAC/AEC Forecast: 2024–30” page describes a full datacom update but the public abstract retrieved here does **not** repeat the word ASP **[retrieved; page later returned an error on a second fetch]**. Whether the 2025–26 file still contains ASP at PMD level is a question for Omdia, not a fact.

Dell’Oro’s Optical Transport program states metrics as manufacturer revenue, units/ports/wavelengths, and **average selling prices**, quarterly, with five-year forecasts and history from **1998** **[verified]**. The 4Q25 quarterly report, described 18 February 2026, “tables covering manufacturers’ revenue, average selling prices, and unit shipments (by speed up to 1.6 Tbps)” for DWDM, DCI, and **IPoDWDM ZR/ZR+ optics** **[verified]**. That ASP is an optical-**transport** ASP. It is the right neighborhood for ZR. It is the wrong neighborhood for an 800GBASE-DR8 module on a GPU leaf.

Cignal AI’s public methodology is revenue market share plus **unit shipments** by speed, material (InP / VCSEL / silicon photonics), and reach (SR, DR, FR, LR, CL), quarterly, history from **2019**, five-year annual forecast, Excel delivery **[verified]**. It does not, on the page inspected, say that it sells an ASP. An ASP can be computed only where revenue and units share a denominator. Segment revenue (all of Datacom) divided by 800G units would be a nonsense hybrid. **[inferred]**

**Hyperscaler contract price versus ASP.** The buyers who move the market — the cloud and AI cluster operators LightCounting and Dell’Oro both centre — do not post prices. The ASP a research firm publishes is an average across vendors and, unless the category is tight, across specifications. It lags the quarter. It can be revised. It is still the only systematic price construct this pass found.

**USD / transceiver versus USD / Gbps.** The prototype stores a module price and remarks that USD / Gbps can be derived by dividing by nominal bandwidth. Division by the nameplate rate does not quality-adjust. An 800G DR8 and an 800ZR have the same nameplate and radically different reach, power, and fiber. A falling USD / Gbps can be a genuine cost decline or a mix shift toward shorter, cheaper PMDs. **[inferred]**

---

## 5. Realistic Observation Frequency

| Cadence | Does meaningful optical-transceiver pricing exist? | What this pass actually found |
| --- | --- | --- |
| Daily | No | No exchange, no dealer screen, no session. DRAM-style intraday is the wrong analogy |
| Weekly | No | No weekly bulletin, no weekly ASP revision described by LightCounting, Omdia, Cignal, or Dell’Oro |
| Monthly | Not as a professional optics series | BLS PCU33423342 is monthly, and it is not a transceiver price. Distributor list prices can change on any day; that is not a market close |
| Quarterly | Yes, as an analyst construct | Cignal AI: report each quarter, final typically 10–11 weeks after quarter-end; a “real-time Excel” updated between reports (file stamp 17 September 2026 for a 2Q26 optical-components file, contents not public) **[verified]**. Dell’Oro Optical Transport: quarterly report **[verified]** |
| Semiannual | Yes, for LightCounting’s priced forecast databases | October 2025 and April 2026 Market Forecasts; March 2026 Ethernet Optics. Listed price **$5,995 per report** **[verified]**. This is not evidence of a $5,995 all-in annual licence |
| Annual | Yes, as history inside those databases | LightCounting states historical **2022–2025** in the April 2026 database. Omdia’s brochure lists market-**share** frequency as quarterly for revenue share and describes forecast work separately; do not read the brochure as a promise of monthly ASP |

**The prototype’s 1-day and 1-week changes are an artifact of the demo generator** (`intraday` configs of seven days; `latestDailyReturn` on each instrument). Nothing in the primary sources supplies a daily return to put in that field.

**Why the economic object is slow.** Modules are qualified per switch ASIC and per hyperscaler program. Volume is concentrated in a few buyers. LightCounting’s own cycle description is shortage, then double ordering, then a later acceleration of price cuts — a **multi-quarter** mechanism **[verified]**. A daily index would have to invent changes on days when no new information exists. That is the same failure mode already identified for HBM in the memory work: interpolating a sparse print into a continuous market.

**[inferred]** The honest labels, if a licensed series is ever shown, are **quarter** or **research vintage**, not 1D / 1W. A semiannual LightCounting price path should not be charted as if it were observed every day between report dates.

---

## 6. Commercial Data Landscape

Public pages describe scope. They do not release the numbers, and they do not grant redistribution. Subscription prices beyond the two LightCounting report stickers were **not** disclosed on the pages inspected. Do not infer a $20,000 figure, or any other figure, from silence.

### 6.1 LightCounting — closest public description of a priced, specification-level file

| Item | What is public |
| --- | --- |
| Relevant products | April 2026 Market Forecast; March 2026 Ethernet Optics. Also an October 2025 Market Forecast page with the same $5,995 sticker |
| Segmentation | Ethernet, CWDM/DWDM, FTTx, wireless, cloud datacenter, AI cluster. Ethernet file: >100 categories, 100GbE through 3.2T, retimed, LPO/LRO, CPO/NPO, **by reach and form factor**, and by cloud / enterprise / telecom |
| History | Forecast database: **2022–2025** history. The firm describes “extensive historical data” on Ethernet shipments beyond that sentence; the priced database’s stated history window is 2022–2025 |
| Price / ASP | Yes. The word used is **pricing**, alongside shipments and sales |
| Frequency | These forecast reports are not quarterly. Successive market-forecast pages are October 2025 and April 2026 |
| Forecast | 2026–2031 in both April 2026 documents |
| Units, revenue, ASP | Shipments, pricing, and sales. Sales are the revenue side |
| Delivery | Not fully specified on the abstract page beyond the report. Table of contents is downloadable |
| Sticker price | **$5,995** on the April 2026 Market Forecast and on March 2026 Ethernet Optics **[verified]** |
| Licensing | March 2026 Ethernet Optics TOC: the report “is a confidential, privileged, company product for the sole use of the intended recipients being LightCounting clients and subscribers. Any review, reliance on or redistribution by others or forwarding without LightCounting’s expressed permission is strictly prohibited” **[verified]** |

Inputs are confidential vendor sales plus public manufacturer data **[verified]**. That is an ASP constructed from a panel, not a screen price.

### 6.2 Omdia (Informa) — Optical Components Intelligence Service

| Item | What is public |
| --- | --- |
| Service | Optical Components Intelligence Service, inside Service Provider Networks |
| Products named | Optical Components Global Market Share and Forecast; Datacom Transceiver and AOC Forecast; High Speed Coherent Optics Forecast; Silicon Photonics Forecast; ICP / cloud data-center network optical components (transceivers, AOCs, DACs). A 31 October 2025 data page updates datacom transceivers, AOCs, and DACs/AECs for 2024–30, analyst Lisa Huff **[retrieved]** |
| Segmentation | Market-share segments Telecom, Datacom, Access. Super-segments Transport, Transceivers, Transmission. Regions worldwide, North America, EMEA, Asia-Oceania, Latin America and Caribbean |
| Measures | Brochure: market share and **revenues** on the quarterly market-share side; **units, revenues, ASP** on the forecast side **[verified]**. Market-share frequency in the brochure: **quarterly** for share, with an “annual” label also appearing on the share block — the brochure’s frequency lines are easy to misread and should be confirmed |
| History | Not stated as a start year on the brochure pages read |
| Forecast | Brochure horizon language runs into the late 2020s. The October 2025 datacom page says 2024–30 |
| Delivery | “Market data,” reports, analyst access. Format (Excel versus PDF) not stated on the pages read |
| Price | Not disclosed |
| Licensing | Brochure disclaimer: Omdia materials are copyrighted property of Informa Tech; opinions, not representations of fact **[verified]**. No public grant to build a redistributable index |

The November 2024 high-speed forecast note about a **pricing-model correction on the Telecom tabs** is the clearest public proof that Omdia maintains prices, and that those prices are revised **[verified]**. It is also a warning: a licensed series can move because the model was wrong, not because the market cleared.

### 6.3 Cignal AI — Optical Components Report

| Item | What is public |
| --- | --- |
| Product | Optical Components Report, quarterly |
| Coverage | Revenue share: Datacom, Telecom, Industrial, Consumer. Unit shipments of datacom optics by speed (400G/800G/1.6T/3.2T and ELSFP), material (InP/VCSEL/silicon photonics), reach (SR, DR, FR, LR, CL), including CPO and OCS from the 1Q26 edition. Telecom units by speed, form factor, and technology (direct-detect ER/ZR, PAM4 DWDM, coherent). OEM coherent port share by speed. Module types named include QSFP-DD, QSFP-DD800, QSFP-DD1600, QSFP28, OSFP |
| History | **2019** start **[verified]** |
| Price / ASP | **Not listed** as a delivered field. Revenue and units are. Category ASP is an open question (§11) |
| Frequency | Quarterly. Final report typically 10–11 weeks after quarter-end. Interim Excel (stamp seen: 17 September 2026, 2Q26 file). 1Q26 public press release 18 June 2026 |
| Forecast | Five years, annual totals, no market-share forecast |
| Delivery | Excel, PowerPoint, Active Insight |
| Price | Not disclosed on the page inspected |
| Licensing | Client download area. No public redistribution right. Methodology says some company revenues are **estimates** **[verified]** |

This is the best **public** window onto quarterly **unit and revenue** scale. It is not, on the evidence of its own page, a price feed.

### 6.4 Dell’Oro Group — optical transport and coherent, not leaf-spine client optics

| Item | What is public |
| --- | --- |
| Optical Transport quarterly and 5-year | Revenue, port/wavelength shipments, **ASP**. DWDM long haul, WDM metro, OLS, IPoDWDM ZR/ZR+ plugs, DCI, disaggregated WDM. Speeds on the program page include 100/200/400/600/800 Gbps and 1.2+ Tbps. History claimed from **1998**. Customer cuts include cloud provider **[verified]** |
| Coherent Optics advanced report | Plugs, modules, and line cards, “by speed up to 1.6 Tbps,” including use on routers and Ethernet switches. November 2024 press: five-year view; nearly half of coherent transceivers projected to ship on routers and switches — a **forecast** **[verified]** |
| Data Center Switch – AI Back-End Networks | Switch **port** revenue, port shipments, and ASP for Ethernet, InfiniBand, UALink, NVLink, scale-up and scale-out. Mentions co-packaged optics. This is a **switch** ASP, not a module ASP **[verified, program page]** |
| Price / licence | Not disclosed. Purchase via dgsales@delloro.com |

Use Dell’Oro for the **DCI / ZR** question. Do not assume its optical-transport ASP is an 800G DR8 ASP.

### 6.5 650 Group

Public press releases through 2024 describe a **Data Center AI Networking** quarterly that includes Ethernet, InfiniBand, and optical transceivers at port speeds from 25G through 3.2T, plus a separate 800 Gbps report covering switch/router ports, DCI, ZR/ZR+, and photonics **[verified, 650group.com press pages]**. The pages inspected emphasise vendor revenue and port speeds. They do **not** document an ASP-by-PMD database. Treat 650 Group as a useful industry source for AI-network structure, and as an unproven price source until a table of contents says otherwise.

### 6.6 Others

Yole has historically published optical-transceiver reports that include an ASP line in the forecast (a 2020 sample states volume, ASP, and revenue as the model outputs) **[verified, Yole 2020 sample PDF]**. That sample is six years old. This pass did not retrieve a 2026 Yole catalog page, so Yole is not treated as a current feed.

No public page inspected for CIR or similar boutiques was strong enough to add as a primary price source.

---

## 7. Open and Public Data Landscape

The search was for a legally usable series that could support an index **without** a research subscription. The result is a set of **validation** series and a set of category errors. None of them is a transceiver ASP.

### 7.1 Government price statistics

**BLS Producer Price Index, NAICS 3342, Communications Equipment Manufacturing, series PCU33423342.** Monthly, not seasonally adjusted, index December 1985 = 100. FRED shows June 2026 at **111.532**, May 2026 at 111.541, April 2026 at 111.522. Updated 15 July 2026 **[verified, FRED page quoting BLS]**. The index moves in the third decimal place across those months. It covers an industry that includes far more than optical modules. It cannot be relabelled UPPI.

**Fiber optic cable.** BLS announced that with the July 2025 PPI release on 14 August 2025 it would stop calculating a list of indexes that includes NAICS **335921 Fiber optic cable manufacturing** and the commodity fiber-optic-cable line **[verified, BLS notice]**. FRED’s PCU3359213359210 page shows a June 2025 observation and a long gap before the next scheduled date. Cable is also the wrong product: it is the medium, not the transceiver. A discontinued cable index is not a backdoor Open UPPI.

No BLS series titled as optical transceivers, pluggable optics, or silicon photonics was found.

### 7.2 Trade statistics and tariff classification

**Classification.** CBP ruling **NY N336394** classifies an optical transceiver from China in **8517.62.0090** HTSUS: “Machines for the reception, conversion and transmission or regeneration of voice, images or other data, including switching and routing apparatus: Other.” General duty free, with an additional China duty under Chapter 99 discussed in the ruling **[verified]**. Ruling **NY N302251** (2018) puts non-coded SFP transceivers from Taiwan in the same subheading and notes that the importer’s modules “operate in the same way but are designed… at different data rates” — the tariff does not split those rates **[verified]**.

A 2026 HTS compilation retrieved via a secondary tariff site lists 8517.62.00.90 article description **“Other”**, unit of quantity **No.** (number), general rate Free **[retrieved, htshub, citing 2026 HTS Revision 17 of 19 August 2026]**. The official schedule is at `https://hts.usitc.gov/`. This pass did not re-download the full USITC chapter PDF; the CBP rulings are the classification authority relied on.

Sibling statistical suffixes under 8517.62.00 include modems and switching and routing apparatus. **0090 is the residual**, not a transceiver line. Census publishes quantity in the HTS unit and value on a customs-value basis. Unit value is value divided by that quantity **[verified, Census foreign-trade guide]**. For 8517.62.0090 that quotient mixes unlike machines, mixes company transfer prices with arm’s-length prices, and mixes 1G SFPs with 1.6T OSFPs. Related-party “assists” can inflate unit value when they cannot be isolated **[verified, same Census guide]**.

**HS6 internationally** stops at 8517.62. China’s, Korea’s, or the EU’s extra digits were not shown, in any source read here, to isolate 800G DR8 from 800G FR4 or from non-transceiver apparatus. **[inferred]** A national 8- or 10-digit code might be slightly tighter than HS6 and still fail the PMD test. That is a question for a customs broker, not a reason to build an index on the US residual basket.

Census USA Trade Online does make 10-digit import data available monthly from 2003 **[verified, Census historical HS page]**. Availability is not specificity. An Open UPPI built on 8517.62.0090 would be an index of a junk drawer. It could be published only with a name that says so, and it still would not measure the AI-cluster optic.

### 7.3 Manufacturer disclosures and hyperscalers

Public company filings and press releases inspected indirectly through Cignal’s source description report **segment revenue** (Coherent communications, Lumentum telecom and datacom, Innolight, Eoptolink guidance on datacom versus telecom). Cignal says it starts from those public revenues and estimates the rest **[verified]**. None of the primary manufacturer pages fetched for this study (Cisco datasheets, NVIDIA product pages, OIF, IEEE) states a current ASP.

Hyperscaler 10-Ks and engineering blogs were not found, in this pass, to disclose transceiver contract prices. Dell’Oro and Cignal discuss their purchases. The purchasers do not print the price.

### 7.4 Distributors, catalogs, and tenders

Channel sellers (OEM-compatible specialists and broadline catalog distributors) do post offer prices for coded and compatible optics. That price is real for a buyer of ones and tens. It is not the price at which a cloud operator buys hundreds of thousands of qualified 800G DR8 modules. Reasons, all **[inferred]** from the structure above rather than from a scrape:

- The SKU is often a compatible, not the hyperscaler’s qualified part.
- Warranty, coding, and firmware differ.
- List and street in the channel are known, in this industry’s own commentary, to sit far from contract ASP. This pass did **not** record live quotes, so no ratio is stated.
- Terms of use on distributor sites commonly restrict automated collection and republication. **Those terms were not audited SKU by SKU in this pass.** Absence of an audit is not permission. PH-1 does not recommend scraping them.

Public tenders and contract awards sometimes name a transceiver. They are sporadic, specification-specific, and often bundled with switches or installation. No statistical office was found that turns them into a continuous optics index. A tender census could be a later, separate research task. It will not, by itself, recreate a quarterly ASP.

### 7.5 Could an “Open UPPI” exist?

**As a public economic indicator of transceiver prices: no**, not from the sources above.

**As a clearly labelled validation layer beside a licensed index: yes, in principle.** Candidates that are legally clean and economically honest:

- Do not publish a level in USD / transceiver.
- Optionally publish the BLS communications-equipment PPI as what it is: an industry output-price index, monthly, attribution to BLS, no claim that it is optics.
- Optionally publish a Census unit-value **index** (not a dollar level) for 8517.62.0090, with the basket definition in the name, as a coarse import-price check. US government data of this kind is the least encumbered source found. It still fails product specificity.
- Use manufacturer revenue growth only as corroboration of cycle direction, the way the memory work treats issuer commentary.

That layer is not UPPI. Calling it UPPI would repeat the prototype’s error in public data.

---

## 8. Existing Price Benchmarks

| Object | Exists? | What it actually measures | Relation to a Urdais benchmark |
| --- | --- | --- | --- |
| Public spot board for optical transceivers | **Not found** | — | There is no DRAMeXchange equivalent. Urdais would not be redistributing a public print |
| LightCounting price database | Yes, proprietary | Shipment, price, and sales by detailed product | The established private methodology. A public index would be a **derivative**, which the report text forbids without permission |
| Omdia ASP in the optical-components forecast | Described in the service brochure; telecom pricing model confirmed by a 2024 correction note | Units, revenue, ASP by the service’s categories | Same: private methodology, unknown derivative rights |
| Cignal quarterly units and revenue | Yes, proprietary | Scale and mix. Price only if derived | A market-size benchmark, not on its face a price index |
| Dell’Oro optical-transport ASP | Yes, proprietary, quarterly | WDM / DCI / ZR equipment and plugs | The closest thing to a professional **coherent DCI** price program. History claimed from 1998 is for the optical-transport program, not for 800G Ethernet modules |
| BLS PCU33423342 | Yes, public, monthly | Communications equipment manufacturing | Too broad to be a photonics index |
| Fiber-optic cable PPI | Was public; **discontinued** August 2025 | Cable, not modules | Dead series, wrong product |
| Yole-style multi-year ASP forecast | Historical reports exist | Modelled ASP | A forecast product, and the sample in hand is from 2020 |
| Academic hedonic index of transceivers | **Not found** in this pass | — | No established academic series to adapt |
| Urdais prototype UPPI | Exists only as demo UI | Five nameplate rates, USD / transceiver, synthetic daily path | Not a benchmark. The file itself says reach and standard are not yet applied |

**Conclusion.** The segmentation work has already been done inside commercial research, at the level of reach, form factor, and linear-versus-retimed. The **public** benchmark has not been done. Urdais would be creating a new public series. If it licensed LightCounting or Omdia, it would be adapting their categories and their ASP construction, not inventing the market structure. If it published only public data, it would be publishing something that is not a transceiver price. Both statements can be true. Neither is a licence.

---

## 9. Methodological Problems Urdais Must Solve

These are properties of the market, not defects of one vendor file.

1. **The good is not stable.** A 2024 800G port is 8×100G PAM4 under 802.3df. A 2026–27 800G port may be 4×200G under P802.3dj, which is still a draft. The name “800G” survives the substitution. The component does not.
2. **Entry and exit are the growth.** LightCounting’s September 2024 newsletter (still the firm’s public account of the ramp shape) said 1.6T was on a path to 10 million annual units in about four years, versus a decade for 100G **[verified, newsletter page]**. A fixed basket of 2024 SKUs misses where the money went. A basket that always holds “the leading rate” never measures a constant good.
3. **Mix shift masquerades as inflation or deflation.** If buyers move from 2×FR4 to DR8, or from retimed to LPO, the average USD / module moves even if each cell’s own price is flat. Cignal’s “nearly all 1.6T is DR” statement is a mix fact **[verified]**. An unsegmented 1.6T ASP would be a DR ASP wearing a rate label — until FR or ZR volumes arrive and the average jumps for reasons that are not a price change.
4. **USD / Gbps is not a quality adjustment.** Reach, fiber count, power, latency, and host DSP all change the service. Dividing by nameplate bandwidth, which the prototype contemplates, compares a 500 m parallel link with an 80 km coherent link on the fiction that both “are 800G.”
5. **Weights are concentrated and unstable.** A handful of cloud and AI buyers, plus NVIDIA’s InfiniBand attach, dominate high-speed units. A shipment-weighted index is an index of those programs. When one program pauses, the index moves because of **volume and mix**, which LightCounting describes as inventory and double-ordering, not only because of a posted price **[verified, April 2026 newsletter]**.
6. **Launch prices distort the first prints.** New rates enter scarce, then reprice as capacity arrives. The first quarters of 1.6T are a bad base. Cignal’s comment that shortages are slowing “the usual price declines” means the usual pattern is decline, and the current pattern is a deviation from it **[verified]**. An index that starts at the deviation will later show a drop that is normalisation.
7. **Form-factor and coding churn.** OSFP versus QSFP-DD, finned versus flat, twin-port versus single-port, Ethernet versus InfiniBand firmware. A “like-for-like” rule has to say which of these are in the specification and which are ignored. Ignoring InfiniBand coding averages two commercial markets. Keeping every variant explodes the basket faster than public data can fill it.
8. **The unit may change.** If CPO takes share, the purchased object becomes a port and an external laser, not a module. Cignal’s April 2026 note says early impact on pluggables is small because AI bandwidth demand is large enough for both, and that scale-up optics would be “an entirely new market” **[verified]**. A transceiver index that silently switches to CPO ports is a different index. A transceiver index that ignores CPO will eventually miss the scale-up job it claimed to represent.
9. **Captive and merchant.** Google OCS is large enough that Cignal states an OCS TAM **excluding** it **[verified]**. NVIDIA LinkX is a qualified attach to NVIDIA switches. Merchant ASP under-represents captive economics and over-represents whoever sells to the firms in the analyst panel.
10. **Survivorship and revision.** Categories that fail (a reach that hyperscalers skip, a form factor that loses) disappear from forecasts. Analyst files are restated: Omdia’s November 2024 pricing correction is the example in hand **[verified]**. A historical index has to freeze a vintage or publish revisions. Demo charts that never revise are not a model of this.
11. **Forecast contamination.** Every major file mixes history and forecast in one spreadsheet. A production series has to cut at the last actual quarter and refuse to plot 2027 as if it had cleared.
12. **No observable daily residual.** Once the series is quarterly, any chart engine that asks for a 1-day return will manufacture one. The methodology problem and the UI problem are the same problem.

---

## 10. Candidate Benchmark Designs

Four designs. They are alternatives, not a sequence. None is selected.

### 10.1 Specification-specific merchant pluggable ASPs

- **Measures:** the shipment-weighted average selling price of one defined module, for example retimed 800G DR8 single-mode ~500 m, kept apart from 800G 2×FR4, from 800G VR/SR, from 800G LPO, and from 800ZR.
- **Unit:** USD per module, with the specification in the name. A secondary USD / Gbps is allowed only inside that cell, as price divided by the cell’s rate, and labelled as such.
- **Universe:** merchant shipments in the analyst’s geography (typically worldwide). Not captive OCS. Not switch ports.
- **Segmentation:** one instrument per cell that has both volume and a stable definition. A 2026 starting set suggested by the evidence, not by the prototype, would be on the order of: 400G DR4; 800G DR8 retimed; 800G FR or 2×FR4 retimed; 1.6T DR; and, separately, 400ZR and 800ZR. Multimode and LPO only if the licensed file shows material units. **[inferred list]**
- **Data requirements:** units and revenue, or a stated ASP, at that grain, with a revision policy.
- **Possible sources:** LightCounting Ethernet Optics (explicitly priced, by reach and form factor). Omdia datacom forecast if the current file still has ASP below the rate. Cignal only if the Excel actually carries matching revenue and units per reach.
- **Frequency:** quarterly where Cignal or Dell’Oro is the source of the cross-check; semiannual if only LightCounting’s forecast book exists. Not daily.
- **Historical feasibility:** LightCounting states 2022–2025 for the priced database; Cignal states unit history from 2019. Cells that did not exist in 2022 (1.6T, LPO, 800ZR) will have short histories. That is a feature.
- **Advantages:** matches how buyers qualify parts; stops the 800G average from hiding DR-versus-FR-versus-ZR; comparable to the way a serious DRAM instrument names organisation and speed bin.
- **Weaknesses:** many thin series; InfiniBand versus Ethernet and OSFP versus QSFP-DD may still be inside the cell; analyst ASP is not the contract price of any one hyperscaler.
- **Methodological risks:** category redefinition when 8×100G DR8 is replaced by 4×200G DR4 at the same marketing rate; launch-price distortion; restatement.
- **Licensing:** unsuitable without permission. LightCounting’s own redistribution clause is explicit. Omdia’s copyright disclaimer does not grant derivative-index rights. Expect the negotiation to be about **derived index publication**, not about viewing the spreadsheet.

### 10.2 Shipment-weighted datacom client-optics cost index

- **Measures:** the cost of client optical bandwidth inside the datacenter, not the price of a module. Constructed as total merchant sales of a defined client-optic universe divided by total gigabits those shipments represent.
- **Unit:** USD per Gbps shipped, index form (a base quarter = 100) safer than a dollar level, because the level is an analyst construct.
- **Universe:** datacom client modules at or above a stated rate (for example 400G and above), **excluding** coherent ZR, AOCs or not by a written rule, **excluding** CPO until CPO has a bandwidth definition compatible with modules.
- **Segmentation:** one headline index plus published sub-indexes for 400G, 800G, and 1.6T so mix shift is visible rather than buried. Reach mix inside a rate remains inside the sub-index and must be disclosed as a limitation.
- **Data requirements:** units and sales by rate, every period, plus a frozen rule for nameplate bandwidth.
- **Possible sources:** same firms as §10.1. This design needs less PMD detail and is therefore more likely to be buildable from Cignal’s public category scheme (speeds) **if** sales, not only units, exist at that speed. That “if” is unverified.
- **Frequency:** quarterly.
- **Historical feasibility:** better than §10.1 for a single long line, worse as economics, because 100G-era and 800G-era bandwidth are chained through mix.
- **Advantages:** answers “is optical I/O getting cheaper per bit?” which is the question the prototype’s USD / Gbps remark was reaching for; one series instead of a catalog.
- **Weaknesses:** not a price of anything a buyer can order; a shift from FR to DR lowers the index without a discount; coherent DCI is omitted on purpose and people will ask for it.
- **Methodological risks:** chain drift; treating forecast quarters as actuals; double-counting breakout (a module counted at 800G and again as eight 100G endpoints).
- **Licensing:** same barrier. An index level computed from licensed sales is a derivative work unless the contract says otherwise.

### 10.3 Two-market coherent DCI series, kept apart from client optics

- **Measures:** ASP and unit volume of pluggable coherent optics used for DCI, principally 400ZR and 800ZR/ZR+, possibly with embedded coherent ports as a separate instrument.
- **Unit:** USD per pluggable module, by line rate and by ZR versus ZR+ if the file splits them.
- **Universe:** IPoDWDM plugs and coherent pluggables. Not 800GBASE-DR8.
- **Segmentation:** 400ZR, 400ZR+, 800ZR, 800ZR+ at minimum. Form factor (QSFP-DD versus OSFP) only if material.
- **Data requirements:** Dell’Oro-style revenue, units, ASP by speed for ZR plugs; Cignal coherent unit shipments as a cross-check.
- **Possible sources:** Dell’Oro Optical Transport and the Coherent Optics advanced report. Cignal for units and for the fact of Meta’s 800ZR+ start. LightCounting DWDM tables in the April 2026 forecast (the newsletter discusses 800G ZR/ZR+ sales **growth**, which is not an ASP).
- **Frequency:** quarterly (Dell’Oro, Cignal).
- **Historical feasibility:** 400ZR has a real installed history. Dell’Oro’s optical-transport **program** claims history from 1998; ZR pluggables exist only from the 400ZR era (OIF work, widely adopted before the 2024 800ZR IA). Do not back-cast 800ZR into 1998.
- **Advantages:** this is the optical product that connects AI buildings, and it is already how Dell’Oro cuts the market; it prevents ZR dollars from dominating or contaminating a DR8 average.
- **Weaknesses:** smaller unit volume than client 800G; software licences (Juniper’s coherent licence) may or may not be inside the module ASP; “ZR+” is a family of reaches, not one link budget.
- **Methodological risks:** mixing embedded sleds with pluggables; mixing telecom long-haul with campus DCI; treating Dell’Oro’s 2026 growth forecast as a price.
- **Licensing:** Dell’Oro prices and redistribution are undisclosed and must be assumed closed.

### 10.4 Public validation layer with no transceiver level

- **Measures:** direction and coarse pressure only. Explicitly **not** a transceiver price and not UPPI.
- **Unit:** index points. BLS December 1985 = 100 for PCU33423342. Census unit-value index = 100 in a chosen base month, for HTS 8517.62.0090, labelled “residual communications apparatus, not transceivers.”
- **Universe:** whatever those official series actually contain.
- **Segmentation:** none worth pretending. A footnote states the basket.
- **Data requirements:** FRED or BLS for the PPI; Census USA Trade Online or the Census trade API for value and quantity. Both are public statistical products.
- **Possible sources:** BLS, Census, FRED as a redistribution of BLS. Manufacturer segment revenue as narrative only.
- **Frequency:** monthly, which is the trap. Monthly observations of the wrong object will look more “market-like” than a correct quarterly ASP. The label has to be louder than the chart.
- **Historical feasibility:** high. PCU33423342 runs from 1985. Census HS10 runs monthly from 2003. Neither history is a history of 800G.
- **Advantages:** no research subscription; government data; honest about ignorance; useful as a negative control (if this index and a later licensed ASP diverge, the divergence is the finding).
- **Weaknesses:** cannot answer the research question; easy to misuse in a UI that wants a dollar and a 1-day change.
- **Methodological risks:** someone multiplies the index by an invented base dollar and calls it a price. The methodology has to forbid a dollar level.
- **Licensing:** BLS and Census series are the cleanest reuse case found, subject to ordinary attribution. That cleanliness applies to **these series as themselves**. It does not extend to a derived “optics price.”

A fifth idea — a panel of distributor offer prices for a frozen SKU list — is **not** proposed as a candidate. It would measure the channel, not the hyperscaler market, and it cannot be recommended until each source’s terms are read and a collection method those terms allow is identified. Automated harvesting is out of scope for this research and is not a fallback.

---

## 11. Critical Unknowns

These cannot be settled from the public pages read on 23 September 2026.

1. **Omdia’s current grain.** Does the 2024–30 datacom file sold after 31 October 2025 contain ASP by reach and form factor, or only by rate? The brochure says ASP. The 2025 abstract retrieved here does not. The brochure’s market narrative is stale.
2. **Omdia history and revision.** Start year of the ASP series; whether telecom and datacom prices are revised in place; what the November 2024 telecom pricing correction implies for any published history.
3. **Omdia rights.** Whether a subscriber may compute and publish an index, display a level, display a percentage change, or only use the file internally.
4. **Omdia cadence of the price** as opposed to the PDF. Quarterly, semiannual, or “when the model is updated.”
5. **LightCounting versus Omdia overlap.** Whether their 800G categories match (DR8 versus 2×FR4 versus LPO versus InfiniBand). Two ASPs that are both “800G” can still be different goods.
6. **LightCounting rights and all-in price.** $5,995 is a report sticker **[verified]**. It is not a quote for ongoing delivery, historical files, or a public index licence.
7. **Cignal price content.** Does the quarterly Excel contain revenue at the same grain as SR/DR/FR/LR units? If not, Cignal cannot price §10.1.
8. **Contract versus ASP gap.** No public source states how far hyperscaler contract prices sit from the analyst ASP or from channel street prices. Any future UI that shows one of them as “the” price will be wrong about the others by an unknown amount.
9. **InfiniBand weight.** What share of 800G and 1.6T units is NVIDIA-qualified InfiniBand rather than open Ethernet, and whether analyst “800G DR” includes both.
10. **LPO unit share in 2026.** The specification and the vendor intent are documented. The shipment share is not, on the public Cignal highlights read here.
11. **CPO 2026 volumes.** “Modest” and “no volume yet” are both from Cignal, six weeks apart in emphasis (1 April versus 18 June). The actual port count for 2026 is inside the client file.
12. **National tariff codes.** Whether any customs authority has a statistical code tighter than a residual “other transmission apparatus” basket for pluggable optical modules. US 8517.62.0090 does not.
13. **Distributor terms.** Not reviewed. Until they are, distributor prices are not a data plan.
14. **Captive share.** How much high-speed optical value is consumed inside NVIDIA, Google, and similar chains at unpublished transfer prices.

---

## 12. Recommended Questions for Omdia

Ask these in writing. Do not accept a portal login as an answer to the rights questions.

**Coverage and definitions**

1. In the current Datacom Transceiver, AOC, and DAC/AEC forecast, what is the atomic category: nominal rate, or rate × reach × form factor × (retimed / LPO / LRO / CPO)?
2. Please list the categories you actually price at 400G, 800G, 1.6T, and 3.2T. Does “800G” include DR8, 2×FR4 or FR4, VR/SR, and LPO as separate ASP rows?
3. Are InfiniBand-coded modules inside the Ethernet datacom ASP, in a separate row, or excluded?
4. Where do 400ZR and 800ZR/ZR+ sit: in the datacom forecast, the high-speed coherent forecast, or both? How do you stop double-counting?
5. How do you treat twin-port OSFP modules that contain two optical engines: one unit, or two?
6. At what point does a co-packaged port leave the transceiver ASP and enter a different series, and what unit does that series use?

**Construction of price**

7. Is the published “ASP” vendor revenue divided by vendor units, a modelled price, or a blend? What share of the 800G and 1.6T ASP is estimated rather than reported?
8. Do you shipment-weight across suppliers inside a category? Can a subscriber see the supplier mix, or only the average?
9. Are hyperscaler contract sales in the ASP, or only the merchant sell-in your panel reports?
10. How do you handle the transition from 8×100G to 4×200G modules that vendors both call 800G?
11. What is your revision policy when the pricing model is corrected, as with the November 2024 telecom-tab correction? Are history and the latest quarter both restated?

**History, frequency, delivery**

12. For each ASP row relevant to AI datacenters, what is the first historical period you will stand behind?
13. How often is the ASP updated: each quarter, twice a year, or only in the annual forecast? What is the lag after quarter-end?
14. Is delivery Excel, and are units, revenue, and ASP separate columns on the same row?
15. Which of those columns are actuals, and which are forecast? How is the cut marked?

**Rights**

16. May a subscriber display the ASP, a percentage change, or an index rebased to 100, to that subscriber’s own customers?
17. May a subscriber compute a new index from your units and revenue and publish the index without publishing the underlying cells?
18. What must be attributed, and what must not be shown (levels versus changes versus ranks)?
19. Are rights limited to internal use? If publication is possible, is it a separate licence, and is it limited to derived index values?
20. Do rights survive a change in Omdia’s category definitions, or does a restatement force the index to be withdrawn?

Parallel questions 7–20 should be put to LightCounting, substituting their “pricing” field, and to Cignal AI, first asking whether a price field exists at all. Dell’Oro should be asked the same rights questions for ZR/ZR+ ASP only, plus whether client Ethernet modules are outside that ASP by construction.

---

## Source notes

Full records, evidence class, and rights class are in `docs/research/photonics/ph-1-source-matrix.json`.

Primary pages this conclusion depends on:

- IEEE SA, IEEE 802.3df-2024, published 15 March 2024: https://standards.ieee.org/ieee/802.3df/11107/
- IEEE 802.3 reflector, P802.3dj second SA recirculation results, 17 August 2026: https://www.ieee802.org/3/email_dialog/msg01862.html
- IEEE SA, P802.3dj project status: https://standards.ieee.org/ieee/802.3dj/11115/
- OIF, 800ZR IA release, 30 October 2024: https://www.oiforum.com/oif-releases-800zr-coherent-interface-implementation-agreement-ia-and-key-400zr-ia-updates-addressing-market-demands-for-scalable-interoperable-high-capacity-solutions/
- OIF-800ZR-01.0, 8 October 2024: https://www.oiforum.com/wp-content/uploads/OIF-800ZR-01.0.pdf
- Cisco OSFP 800G datasheet, updated 5 January 2026: https://www.cisco.com/c/en/us/products/collateral/interfaces-modules/transceiver-modules/osfp-800g-transceiver-modules-ds.html
- LPO MSA announcement, 25 March 2025: https://www.lpo-msa.org/news/lpo-msa-announces-release-of-specification-for-linear-pluggable-optica
- Cignal AI Optical Components Report methodology: https://cignal.ai/optco/
- Cignal AI, 18 June 2026: https://cignal.ai/2026/06/datacom-optical-component-revenue-doubles-to-7-7-billion-in-1q26/
- Cignal AI, 1 April 2026: https://cignal.ai/2026/04/cpo-and-elsfp-1q26-update/
- Cignal AI, 27 January 2026: https://cignal.ai/2026/01/800zrx-growth-to-surpass-all-earlier-coherent-generations/
- LightCounting, April 2026 Market Forecast: https://www.lightcounting.com/report/april-2026-market-forecast-379
- LightCounting, March 2026 Ethernet Optics, including redistribution clause in the TOC: https://www.lightcounting.com/document/march-2026-ethernet-optics/382/toc
- LightCounting, April 2026 newsletter: https://www.lightcounting.com/newsletter/en/april-2026-market-forecast-379
- Omdia Optical Components Intelligence Service brochure: https://omdia.tech.informa.com/-/media/tech/omdia/brochures/service-provider-networks/omdia-product-overview---optical-components-intelligence-service.pdf
- Omdia High-Speed OC Forecast note, 15 November 2024: https://omdia.tech.informa.com/om122790/high-speed-oc-forecast-202329
- Dell’Oro Optical Transport program: https://www.delloro.com/market-research/telecommunications-infrastructure/optical-transport/
- Dell’Oro, 18 February 2026: https://www.delloro.com/news/optical-transport-market-grew-to-16-billion-in-2025/
- BLS via FRED, PCU33423342: https://fred.stlouisfed.org/series/PCU33423342
- BLS PPI discontinuation notice (July 2025 release): https://www.bls.gov/ppi/notices/2025/bls-to-discontinue-selected-ppis.htm
- CBP NY N336394: https://www.customsmobile.com/rulings/docview?doc_id=NY+N336394&highlight=NY+N336394
- Census foreign-trade guide (unit value and assists): https://www.census.gov/foreign-trade/guide/sec2.html
