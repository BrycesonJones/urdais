# UMPI Phase 1B — production instrument validation, 21 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It designs no UI, writes no ingestion code, selects no vendor, and establishes no legal right.

**Product baseline.** The current frontend (`src/data/mock/market-detail.ts`) treats UMPI as two families that do not share a unit: DRAM at **USD / part** (six instruments; family default DDR5 16Gb) and HBM at **USD / GB** (HBM3E, HBM3, HBM4; market headline HBM3E). Every displayed value, daily percentage, chart, and history is deterministic **demo data**. This document asks which of those labels, units, and UI semantics can survive contact with real, recurring, legally usable observations.

**Prior work (do not rediscover).** `docs/research/memory-pricing/source-shortlist.md`, 14 September 2026, already established: no exchange settlement; TrendForce/DRAMeXchange as the concentrated spot/contract print; WSTS as industry ASP with a distribution-licence door; Silicon Data as a GDDR6-only RAM Index; Korea Customs as a legally cleaner but $/kg-contaminated unit-value; manufacturer IR as validation not a level; distributor APIs as contractually barred as a class. Phase 1B updates those hypotheses only where new evidence changes the production path, and closes the instrument-definition, HBM-observability, cadence, and “what can we actually publish” questions that the shortlist left open.

**Research date.** Sources were inspected on 21 September 2026. URLs, membership prices, terms, and quotes are as they stood that day.

**Outreach context.** The brief states Urdais has already contacted WSTS, TrendForce/DRAMeXchange, and Silicon Data. This repository contains no outreach correspondence, so **no permission is assumed**. Follow-up asks are specified in §Q.

---

## 0. Evidence standard

Three classes, marked throughout:

- **[verified]** — quoted from a primary page or PDF extracted and read in this pass.
- **[retrieved]** — obtained by fetching a primary page or from a search extraction of a primary page. Substance reliable; wording indicative where the full document was JS-rendered or a fetch timed out.
- **[inferred]** — a reading of how sources interact, or of a market practice. **Never treated as a right.**

**Nothing in this document establishes a right.** Public accessibility is not republication permission. News reports that quote analysts are not transaction prices. Forecasts are not current prices. Demo UI values are not evidence.

---

## A. Phase 1B executive conclusion

**The smallest defensible production UMPI is a licensed DRAM-spot chip benchmark. The current HBM headline cannot be a production price series. Nothing in the current UMPI surface can be published from public data alone.**

What is true as of 21 September 2026:

1. **The six DRAM labels are not invented.** They are abbreviated names of the live DRAMeXchange/TrendForce spot board, which on 21 September 2026 printed session averages for exactly those densities plus a seventh instrument UMPI does not carry (DDR5 16Gb eTT) **[verified, dramexchange.com and trendforce.com/price]**. “16Gb” is **gigabits**. The priced object is a **chip/die**, quoted in **USD per piece**. The board already supplies the missing comparability fields: organization (`2Gx8` / `1Gx8` / `512Mx8`), speed bin (`4800/5600`, `3200`, `1600/1866`), and grade (branded vs eTT).

2. **Those prints are not usable.** DRAMeXchange Terms of Use §6.2 (last updated 1 January 2020) forbid reproducing, modifying, creating derivative works from, displaying, publishing, or circulating any materials without express prior written consent **[verified]**. CFM闪存市场, the only independent recurring alternative found, forbids copying, reprinting, compiling, displaying, or publishing any content without written permission **[verified]**. Access and index-publication rights remain distinct, as the 14 September study said.

3. **HBM3 / HBM3E / HBM4 are real products and a false price market.** All three suppliers are in commercial HBM4: Samsung announced mass production and commercial shipment on 12 February 2026 **[verified, Samsung Newsroom]**; Micron announced volume shipment of HBM4 36GB 12H for NVIDIA Vera Rubin in calendar Q1 2026 **[retrieved, Micron IR 16 March 2026]**; SK hynix began HBM4 mass shipments in Q2 2026 and has LTAs with around ten customers **[verified, SK hynix 29 July 2026]**. None of those disclosures, and no public board, prints a recurring HBM3 / HBM3E / HBM4 transaction or contract price. TrendForce’s HBM Package ($30,000) includes “HBM ASP per Gb” and “aperiodic” price updates **[verified, membership page]** — that is a licensed **analyst construct**, not a spot print. Public $/GB figures circulating in 2026 are analyst estimates or journalist arithmetic on KITA “HBM-related” unit values. **Do not present them as market prices.**

4. **The current frontend semantics only half-survive.** DRAM spot is a **business-day, multi-session** market (TrendForce updates DRAM spot three times a day **[verified]**). “Today” is therefore sloppy but not invented — the honest label is **1D** or **session**. DRAM contract is **monthly**. HBM is **monthly / quarterly / aperiodic**. Intraday charts and a daily “today” move on HBM are not defensible. Daily interpolation of sparse HBM or contract prints would fabricate a continuously trading market.

5. **Public filings and customs cannot substitute for the missing licence.** They can validate direction. They cannot set a DDR5 16Gb or HBM3E level.

**What Urdais can build, in order of increasing licence dependence:**

| Build now (no new licence) | After one DRAM derived-index licence | After DRAM + HBM derived-index licences |
| --- | --- | --- |
| Withhold UMPI prices. Keep the family shell. Optionally publish a **public validation layer** (Nanya monthly revenue; Micron/SK hynix QoQ ASP %; Korea/Taiwan HS unit-value *indices*, not $/part) explicitly *not* as UMPI instruments. | **UMPI-DRAM Spot**: the six current instruments, labels qualified to the board definition, unit **USD / die**, cadence **business-day session**, change label **1D / session**. Add DDR5 16Gb eTT only if the licensed feed includes it. HBM remains withheld or research-preview. | Same DRAM, plus a **separate** UMPI-DRAM Contract family (monthly; do not mix with spot), plus UMPI-HBM as a **licensed ASP/GB or ASP/Gb series** labelled estimate/survey, not a transaction print. HBM4 may appear as research-preview until the licensed series actually prints it. |

**Recommendation for the production decision (not a UI preference):** treat Architecture A in §O — licensed DRAM spot, HBM withheld or explicitly estimated — as the smallest production UMPI. Do not start a backend ingestion pipeline until the rights questions in §R are answered in writing.

---

## B. Current UMPI instrument audit

Definition class is a **comparability** judgement, not a quality score.

| Current label | Real market meaning | Comparability problem | Likely source | Cadence | Unit | Definition class | Data state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DDR5 16Gb | Branded/Major DDR5 **16-gigabit** die, industry-quoted as `DDR5 16Gb (2Gx8) 4800/5600` **[verified, DX/TF spot board 21 Sep 2026]** | Label omits organization, speed, and branded-vs-eTT. DDR5 16Gb eTT printed **$24.800** the same session the branded print was **$56.933** **[verified]** | TrendForce/DRAMeXchange spot; CFM “DDR5 16Gb Major” as independent quote | Business-day; DX three sessions/day | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| DDR4 16Gb | Branded DDR4 16Gb die, `DDR4 16Gb (2Gx8) 3200` | Same omitted fields. Same-day contract teaser for `DDR4 16Gb 2Gx8` was **$48.00** vs spot **$85.00** **[verified]** — spot and contract are different markets | Same | Same (spot); monthly (contract) | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| DDR4 8Gb | Branded DDR4 8Gb die, `DDR4 8Gb (1Gx8) 3200` | Same. Contract teaser **$24.00** vs spot **$46.036** **[verified]** | Same | Same | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| DDR4 16Gb eTT | Unmarked **effectively tested** DDR4 16Gb die, `DDR4 16Gb (2Gx8) eTT` | Grade is the instrument. Branded $85.00 vs eTT $13.35 on 21 Sep 2026 **[verified]** — density alone is not fungible | Same | Business-day spot | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| DDR4 8Gb eTT | Unmarked eTT DDR4 8Gb die, `DDR4 8Gb (1Gx8) eTT` | Same grade split (branded $46.036 vs eTT $5.880) **[verified]** | Same | Business-day spot | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| DDR3 4Gb | Legacy branded DDR3 4Gb die, `DDR3 4Gb 512Mx8 1600/1866` | Speed/org omitted; contract teaser uses `DDR3 4Gb 256Mx16` — a **different organization** **[verified]**. Spot and contract labels are not the same part | Same | Business-day spot; monthly contract on a different org | USD / die | usable-with-minor-qualifier-additions | `possible_but_requires_commercial_license` |
| HBM3 | JEDEC HBM3 generation (JESD238 family). Sold as stacked cubes into accelerator/package contracts, not as a public chip | Generation-only. 8-high 24GB vs 12-high 36GB vs vendor vs pin speed are different products. No public recurring print | TrendForce HBM Package ASP/Gb (survey); no spot board | Quarterly datasheet; aperiodic “price update” | Typically modelled USD/GB or USD/Gb | too-ambiguous-for-production | `estimate_only` |
| HBM3E | Vendor name for extended HBM3 (SK hynix: “extended version of HBM3” **[retrieved, SK hynix 26 Sep 2024]**). Micron ships 24GB 8H and 36GB 12H **[retrieved, micron.com/products/memory/hbm/hbm3e]** | Same as HBM3, plus “E” is not a separate public price market. Current UMPI headline | Same | Same | Modelled USD/GB | too-ambiguous-for-production | `estimate_only` |
| HBM4 | JEDEC JESD270-4 (16 Apr 2025; 4A Dec 2025). Commercial shipments in 2026 from all three suppliers **[verified/retrieved]**. Stacks 4/8/12/16-high, 24Gb or 32Gb dies, up to 64GB **[verified, JEDEC PR]**; SPHBM4 (JESD330-4, Jun 2026) is a different package **[retrieved]** | Commercial product, **no observed price**. Generation-only still collapses 24–48GB and three vendors | Same; issuer revenue comments only | Event / quarterly / aperiodic | No observed unit | too-ambiguous-for-production | `estimate_only` |

None of the six DRAM labels is `too-ambiguous-for-production` **if** the methodology locks the implied board definition. None is `sufficiently-defined-for-production` as currently written, because a reader cannot tell branded from eTT or 2Gx8-3200 from another bin.

---

## C. DRAM canonical-definition findings

### C.1 Density is gigabits, the object is a die

Industry pricing writes `16Gb`, `8Gb`, `4Gb` for **gigabit die density**, not gigabyte module capacity. The board’s parenthetical organizations make this unambiguous: `2Gx8` = 2G × 8-bit = 16 gigabits; `1Gx8` = 8 gigabits; `512Mx8` = 4 gigabits **[verified, DX item names]**. Module products on the same site are labelled in **GB** (`DDR5 UDIMM 16GB`, `DDR5 RDIMM 32GB`) **[verified]**. UMPI’s `$/part` is therefore **USD per die/chip**, not per module and not per gigabyte.

JEDEC DRAM standards specify density in gigabits; this pass did not re-extract JESD79-5 text (jedec.org blocked a later fetch). The board naming is sufficient to lock the convention.

### C.2 Implied qualifiers the current labels hide

| UMPI label | Implied organization | Implied speed | Implied grade |
| --- | --- | --- | --- |
| DDR5 16Gb | 2Gx8 | 4800/5600 | Branded / Major |
| DDR4 16Gb | 2Gx8 | 3200 | Branded / Major |
| DDR4 8Gb | 1Gx8 | 3200 | Branded / Major |
| DDR4 16Gb eTT | 2Gx8 | (eTT; speed not separately printed) | eTT |
| DDR4 8Gb eTT | 1Gx8 | (eTT) | eTT |
| DDR3 4Gb | 512Mx8 | 1600/1866 | Branded |

**[inferred]** from the live board, not from a Urdais methodology. A production methodology must state these as eligibility rules, not leave them implicit.

### C.3 What eTT means

In DRAM channel/spot usage, **eTT = effectively tested**, not “extended-temperature tested.” It is an unmarked, value-grade die sold to module makers who brand the module themselves. Industry grading, high to low: Major/branded original → eTT → uTT (untested) → downgrade **[retrieved, EE Times Asia; CST/simmtester]**.

That definition is stable enough for a longitudinal series: DRAMeXchange has quoted eTT as a named line for years (Silver membership includes Daily Express history from 28 November 2003 **[verified, membership page]**). What is **not** stable is the branded–eTT spread. Older CST commentary described a few-cent gap; on 21 September 2026 the branded DDR4 16Gb session average was **$85.00** against eTT **$13.35** **[verified]**. Collapsing them would be a category error.

eTT is standardized *as a spot-board grade*, not as a JEDEC product. Vendor mix inside eTT is unknown and unmarked by construction. That is acceptable only if the methodology says “unmarked eTT die as surveyed by [licensed source],” not “a qualified Samsung/SK hynix/Micron part.”

### C.4 Does manufacturer or speed break comparability?

**Manufacturer (branded):** the spot board does **not** split Samsung vs SK hynix vs Micron. It prints one branded/Major line. **[inferred]** those dies are treated as substitutes in the Taiwan/China spot channel. They are not substitutes in OEM qualification. For a *spot* instrument, one branded print is the market convention. For a *server/AI contract* instrument, vendor and qualification matter and are not on this board.

**Speed/bin:** the board already bins. DDR5 branded is 4800/5600, not “any DDR5 16Gb.” A 6400 or 24Gb die would be a different instrument. Density alone is **not** enough.

**Package:** the priced object is the **component die**, not a DIMM. x8 organization is specified; package outline (FBGA) is not. That matches how the spot market talks.

### C.5 $/part survives — with a definition

**One part = one surveyed die matching the locked organization, speed bin, and grade (branded or eTT), priced in USD.** Observed DX/CFM quotes are already in that unit. No bit-normalization is required to compare a day’s DDR5 16Gb branded print with the previous day’s.

Two products both called “DDR5 16Gb” **do** differ materially: branded vs eTT (2.3× on 21 Sep 2026), and spot vs contract (see §J). The unit survives; the **label** needs the qualifiers in §C.2.

Do not switch DRAM to $/GB. That would mix a 16Gb die with a 16GB module and hide the branded/eTT split the product already got right.

---

## D. HBM canonical-definition findings

### D.1 How HBM is sold

HBM is sold as **stacked cubes** (plus a logic/base die) into a small number of accelerator and ASIC customers, typically under multi-year **long-term agreements**, not through a public spot channel. SK hynix: “finalized Long-Term Agreements (LTAs) with around 10 customers” **[verified, 29 July 2026]**. Micron: “we are really not commenting on pricing” on the FQ3’26 call, while stating HBM is “a higher price product … compared to non HBM on a per bit basis” **[retrieved, call transcript]**. Samsung: commercial HBM4 shipment announced, no price **[verified, 12 February 2026]**.

There is **no HBM line on the DRAMeXchange spot board** inspected 21 September 2026 **[verified]**. TrendForce sells a separate HBM Package, not a daily HBM spot table **[verified]**.

### D.2 Generation-only is not an instrument

| Attribute | Status | Why |
| --- | --- | --- |
| Generation (HBM3 / HBM3E / HBM4) | **Mandatory** | Different JEDEC generations and commercial ramps |
| Capacity per stack | **Mandatory** | HBM3E is both 24GB 8H and 36GB 12H **[retrieved, Micron product page; SK hynix 12-layer PR]**. Samsung HBM4: 24–36GB at 12-high, 48GB path at 16-high **[verified]** |
| Stack height | **Mandatory** | Same generation, different products; JEDEC HBM4 allows 4/8/12/16-high **[verified]** |
| Vendor | **Mandatory for economic comparability; usually unavailable as a public price** | Qualification is vendor- and customer-specific. SK hynix historically led NVIDIA HBM; Samsung and Micron are now shipping HBM4. No public vendor-split price |
| Data rate / bandwidth | **Useful metadata** | Samsung HBM4 claims 11.7 Gbps typical, 13 Gbps peak, 3.3 TB/s **[verified]** vs JEDEC HBM4 up to 8 Gb/s / 2 TB/s **[verified]**. A $/GB that ignores bandwidth hides the thing AI buyers pay for |
| Package (HBM vs SPHBM4) | **Mandatory if SPHBM4 ships into the series** | JESD330-4 (Jun 2026) uses HBM4 stacks with a different buffer die for standard packaging **[retrieved]**. Not interchangeable with on-package HBM4 |
| Customer / accelerator class | **Usually unavailable** | Embedded in NDA contracts. Micron named Vera Rubin for HBM4 36GB 12H **[retrieved]**; that is product context, not a price |

HBM3E is **not** a separate JEDEC number in the sources read; it is the industry name for extended HBM3 (SK hynix’s own gloss **[retrieved]**). Treating “HBM3E” as a single price is the current product’s central HBM defect.

### D.3 Canonical HBM instrument, if Urdais ever publishes one

Minimum: `generation + capacity_GB + stack_height + (vendor if the source splits it)`. Display unit may still be USD/GB **derived from that stack**, never from a generation-only blob.

Until a licensed source actually prints that object, **do not invent it**.

---

## E. HBM price-observability findings

Classification of every HBM price-like number encountered in this pass. None is a Urdais production input.

| What | Date / period | Figure | Class | Source | Use for UMPI? |
| --- | --- | --- | --- | --- | --- |
| Samsung “begun mass production … shipped commercial products” | 12 Feb 2026 | No price | company disclosure (shipment, not ASP) | Samsung Newsroom **[verified]** | Existence of HBM4 market, not a price |
| Micron HBM4 36GB 12H volume shipment for Vera Rubin | Calendar Q1 2026 | No price | company disclosure | Micron IR PR 16 Mar 2026 **[retrieved]** | Same |
| Micron “already shipped over $1 billion in HBM4 revenue”; 12-high ramp 2× HBM3E 12-high | FQ3 FY26 (ended 28 May 2026), remarks 24 Jun 2026 | Revenue, not $/GB | company-disclosed revenue | Prepared remarks / 8-K coverage **[retrieved]** | Scale, not a level |
| SK hynix HBM4 mass shipments; ~10 LTAs; “not commenting” equivalent — no unit price | Q2 2026, 29 Jul 2026 | No price | company disclosure | SK hynix Newsroom **[verified]** | Same |
| TrendForce HBM Datasheet field “HBM ASP per Gb”; “HBM Price Update” aperiodic | Product page, 2026 | Not public | analyst estimate / survey (vendor claim of method) | Membership page **[verified]** | Only with commercial + derived-publication licence; still not a transaction tape |
| TrendForce 3Q26 HBM Industry Analysis: “2026 is a pricing pause… 2027 brings a sharp ASP surge” | 5 Aug 2026 | Narrative / forecast | forecast | trendforce.com/research/download/RP260805KC3 **[retrieved]** | Not a current price |
| KITA “HBM-related” average export price | May–Aug 2026 | $58.21 → $69.50/$69.51 → $76.13/$76.14 → $73.39 per **unit** | inferred/model-derived unit value (journalist arithmetic on KITA aggregates) | Seoul Shinmun citing KITA, 2 Sep and 21 Sep 2026 **[retrieved]** | Proxy for blended MCP/HBM, not HBM3/HBM3E/HBM4. Do not ingest the news article; pull KITA yourself if used |
| Cantor / Fubon “SK hynix HBM4 ~$31–32/GB vs HBM3E ~$17–18/GB” | Aug 2026 press | ~$31–32/GB | analyst estimate | Secondary press **[retrieved]** | Not a transaction |
| Silicon Analysts / capitalandcompute / memoryindex.io HBM $/GB tables | 2026 | Various $8–$17/GB | inferred/model-derived; several cite TrendForce | Aggregators **[retrieved]** | **Do not ingest** (14 Sep study already barred this class) |
| Isolated “broker ask ~$77/GB” mentioned by Silicon Analysts | 2026 | ~$77/GB | market quote (outlier, not verified here) | Secondary **[retrieved]** | Insufficient |

**Direct transaction / contract observation: none found in public.**  
**Distributor/list HBM stack price: none found.**  
**Procurement award price: none found.**

**Conclusion.** USD/GB for HBM is **usually derived from analyst estimates**, occasionally **calculable from a stack price if one were observed**, and **not directly observed** on any public recurring market. KITA per-unit export values are a **blended customs proxy**, not $/GB and not generation-specific.

If Urdais publishes an HBM number without a licence, the only honest form is a **Urdais-constructed relative index** from public customs/filings, labelled as such — not “HBM3E $/GB.”

---

## F. Existing-source update

Only material changes to the 14 September study.

### F.1 TrendForce / DRAMeXchange — confirmed as the UMPI taxonomy’s origin

**New.** The live spot board on 21 September 2026 is the current UMPI DRAM list plus `DDR5 16Gb (2Gx8) eTT` **[verified]**. Session averages that day (USD / die, GMT+8 18:10):

| Board item | Session average | Session change |
| --- | --- | --- |
| DDR5 16Gb (2Gx8) 4800/5600 | 56.933 | +1.67% |
| DDR5 16Gb (2Gx8) eTT | 24.800 | +0.81% |
| DDR4 16Gb (2Gx8) 3200 | 85.000 | −0.88% |
| DDR4 16Gb (2Gx8) eTT | 13.350 | +0.95% |
| DDR4 8Gb (1Gx8) 3200 | 46.036 | 0.00% |
| DDR4 8Gb (1Gx8) eTT | 5.880 | +1.91% |
| DDR3 4Gb 512Mx8 1600/1866 | 13.780 | 0.00% |

These are **survey session averages**, described by TrendForce as based primarily on market transaction prices for mainstream chips, with bid/ask used for low-volume non-mainstream items **[verified, PriceInformation]**. They are **not** an exchange last-sale. Wide daily high/low (DDR4 16Gb branded 45.50–119.50 the same day) shows the average is a constructed print.

**New.** The public **contract** teaser (labelled “2H Jul”, page also notes August contract updated 31 Aug 2026 for Gold+) is a **different basket**: modules (SO-DIMM) plus chip lines including `DDR4 16Gb 2Gx8` **$48.00** and `DDR3 4Gb 256Mx16` **$14.50** **[verified]**. Spot vs contract for the same density are not interchangeable. DDR3 contract organization (`256Mx16`) is not the spot organization (`512Mx8`).

**Unchanged.** Silver $5,000 / Gold $11,000 / Memory Platinum $30,000 / Memory Diamond $55,000 / HBM Package $30,000 / Server DRAM $25,000 **[verified]**. Silver includes five years of daily spot Excel and Daily Express from 28 November 2003 **[verified]**. Spot update three times a day; contract monthly **[verified]**. Terms §6.2 derivative-work bar and §5.h betting/prediction-market bar unchanged **[verified]**. Insights.trendforce.com ToS: content “intended solely for the personal use of the individual subscriber”; redistribution without prior written consent prohibited **[verified]** — this is the Substack product, not a substitute for the membership agreement, but it is consistent.

**HBM Package (new detail).** Datasheet fields include market share, layers, wafer capacity, “HBM ASP per Gb”, revenue by product/supplier; bulletin mid-month; price update **aperiodic** **[verified]**. That cadence **forbids** a daily HBM “today” even after licence.

### F.2 Silicon Data — still not a UMPI source

**Confirmed.** RAM Index API enum is `GDDR6` only; history from 2026-01-26; Plus/Professional **[retrieved, docs.silicondata.com]**. Portal ToS: standard licence is internal use; no distributing or making available data or materials based on or derived from the Services to any third party, except limited extracts that cannot substitute for the service, with attribution, cease-on-request; other derived distribution only if specifically authorized in writing **[retrieved, portal.silicondata.com/terms-of-service]**. Dataset page: “Redistribution or settlement reference is licensed separately” **[retrieved]**.

**Update.** This is a **rights and coverage** confirmation, not a new path. Partner-on-DDR/HBM remains an outreach question (§Q). It does not back any current UMPI instrument.

### F.3 WSTS — still a broad ASP, still not an instrument

**Confirmed.** Historical Billings Report (latest July 2026) free, no login **[verified]**. Copyright: “Reproduction in any electronic or physical form, in whole or in part, without written permission from WSTS is prohibited by law” **[verified, Information Management]**. Proprietary Section: share only inside the Authorized Organization; “will not be released to any external third parties” **[verified, Conditions for Use]**. Distribution licences sit with regional semiconductor associations **[verified]**. Contact still Tobias Proettel `tp@wsts.org` **[verified]**.

**Unchanged production role.** Monthly Memory-category ASP cannot print DDR5 16Gb or HBM3E. Useful only as a licensed validation/weighting series.

### F.4 Korea Customs — the 14 September $/kg story is incomplete, and September 2026 made it worse

See §H. Material updates: (1) Korean trade statistics are also reported **per piece (개)**, not only per kilogram; (2) 10-digit HSK used in the market (DRAM `8542.32.1010`, MCP/HBM `8542.32.3000`, NAND `8542.32.1030`/`1090`, modules `8473.30.4060`) is **widely cited but not verified on the 2026 UNIPASS tariff table in this pass**; (3) from September 2026, TRASS **municipal** queries were reported as collapsed to 6-digit HS `8542.32`, which **mixes DRAM, NAND, and MCP/HBM** **[retrieved, secondary]**. National `tradedata.go.kr` still publishes 10- and 20-day provisionals (homepage showed Sep 1–20 2026 **[verified]**) but this pass did not extract a 10-digit DRAM series from it.

### F.5 Manufacturer disclosure — still no levels; HBM4 existence is now firm

See §I. Material updates: commercial HBM4 from all three suppliers; Micron HBM4 revenue “over $1 billion” **[retrieved]**; SK hynix LTAs ~10 customers **[verified]**; Nanya Q2’26 ASP +>60% with flat bits **[verified]**; Nanya/Winbond monthly revenue still have no absolute ASP.

### F.6 Distributor class — not re-opened

The 14 September Digi-Key / Mouser / Avnet findings stand. This pass did not re-fetch those agreements. Channel prices remain the wrong market for UMPI’s chip/HBM thesis.

---

## G. New material sources

Only sources that change the production path.

### G.1 CFM闪存市场 (China Flash Market) — independent DRAM quote

**Why it matters.** It is the only recurring DRAM chip quote found that is **not** TrendForce, and it uses the same Major/eTT vocabulary.

- Organization: 深圳市闪存市场资讯有限公司; `https://chinaflashmarket.com/`; contact `Service@ChinaFlashMarket.com` **[verified]**
- Example observation: 16 September 2026 newsflash — DDR5 16Gb Major **$45.00** (+2.27%), DDR5 16Gb eTT **$26.00** (+4.84%) **[verified, chinaflashmarket.com/newsflash/38874]**. That is a **market quote** in a CFM article, not a licensed feed Urdais may republish.
- vs DX same week: DX branded DDR5 16Gb session averages were mid-$50s **[verified]**. The two desks do not print the same number. That is useful **if licensed as a second survey**, fatal if silently mixed.
- Cadence: at least weekly in the free newsflash; paid “报价中心” exists (`/price/pay`) **[retrieved]**
- Rights: disclaimer forbids unauthorized 复制、转载、传播、改编、汇编、展示、发行 of any content including 数据、图表; licensed reuse must attribute “来源：CFM闪存市场” and stay inside the permit **[verified]**. Classification: `commercial_license_required`
- Automation: no public API found. Treat as operational/manual or ask for a feed in outreach.

### G.2 KITA / TRASS trade statistics — per-piece unit values

**Why it matters.** The 14 September study framed Korea as **$/kg**. Korean journalists in 2026 are publishing **$/unit** “HBM-related” and DRAM chip series from KITA/TRASS. If 10-digit national queries still return quantity in **개**, this is a better public proxy than Customs $/kg.

- KITA trade statistics service, cited by Seoul Shinmun 2 Sep and 21 Sep 2026 for HBM-related unit values **[retrieved]**
- TRASS (한국무역통계진흥원) cited for DRAM $/kg 1–20 Aug 2026 **[retrieved]**
- **Not ingested.** Pull from the official query UI, not from newspapers.
- Rights: not read. Classify `ambiguous_requires_legal_review` until KITA/TRASS terms are extracted.
- Limitation: “HBM-related” in the press is almost certainly the MCP/HBM heading, not HBM3E 36GB 12H. September 2026 6-digit municipal collapse may destroy the split for some access paths (§H).

### G.3 Taiwan MOF / ITA HS 854232 unit values

**Why it matters.** A second-country public unit-value series, with an official UI that exposes **average price per unit and per kilogram** **[retrieved, publicinfo.trade.gov.tw]**. MOF statistical bulletin already splits HS 854232 DRAM vs “other memory” at finer 11-digit codes (e.g. 8542320023) in a 2025 bulletin **[retrieved, service.mof.gov.tw PDF]**.

- Cannot print UMPI instruments.
- Can support a **Taiwan memory unit-value index** as validation.
- Rights: Taiwan government open-data / site terms not extracted this pass. `ambiguous_requires_legal_review`.

### G.4 Explicitly rejected as production sources

`memoryindex.io`, `siliconanalysts.com`, `capitalandcompute.net` — third-party reconstructions that name TrendForce/DRAMeXchange as inputs **[retrieved]**. Ingesting them inherits an unlicensed chain. Unchanged from 14 September.

---

## H. Korea Customs result

**Answer:** Korea trade statistics are **useful as a directional / nowcast / validation layer**, not as a substitute for UMPI instrument levels. They cannot print DDR5 16Gb or HBM3E.

### H.1 Codes and separation

International HS 8542.32 is “electronic integrated circuits: memories.” Korea extends this to 10-digit HSK. Market practice (Korean investment blogs, KITA journalism) maps:

| Cited HSK | Claimed contents |
| --- | --- |
| 8542.32.1010 | DRAM chips |
| 8542.32.1030 / 8542.32.1090 | NAND (sources disagree on the last four digits) |
| 8542.32.3000 | MCP / “복합구조칩”, **HBM included** |
| 8473.30.4060 | DRAM modules |

**[retrieved, not verified on the 2026 UNIPASS tariff table.]** UNIPASS has a 2026 tariff search (`unipass.customs.go.kr/clip/hsinfosrch`) **[retrieved]**; this pass did not extract the official 10-digit descriptions. **That extraction is a remaining blocker (§P).**

Even if 8542.32.3000 is confirmed, it is **MCP including HBM**, not HBM3 / HBM3E / HBM4. HBM mix **does** contaminate any 6-digit 8542.32 aggregate (DRAM + NAND + MCP). It **also** contaminates a 10-digit MCP line (HBM + other stacked/MCP products).

**September 2026 change:** secondary reporting says TRASS **시·군·구** queries were unified to **6-digit** HS, explicitly so that firm-level ASP and HBM splits would not be inferable **[retrieved]**. If that applies only to municipal cuts, national 10-digit may survive. If it applies more broadly, the best public HBM proxy just disappeared. **Must be checked on tradedata.go.kr and stat.kita.net, not inferred from blogs.**

### H.2 Quantity units

Journalists using KITA report HBM-related **export quantity in 개 (pieces)** and value in USD, then divide **[retrieved, Seoul Shinmun 2 Sep 2026: 132.48 million units, $10.086 billion, $76.13/unit in July]**. TRASS DRAM-ex-modules is still being quoted **$/kg** ($92,183/kg, 1–20 Aug 2026) **[retrieved]**. So both units exist. **[inferred]** piece unit values are the ones that could ever resemble $/part; $/kg remains mix- and weight-contaminated.

A 16Gb DDR5 die and an HBM4 12-high cube are both “one piece.” Per-piece MCP unit value is **not** HBM $/GB.

### H.3 Provisionals, history, API

- `tradedata.go.kr` homepage on 21 September 2026 showed **Sep 1–20** current-month and Jan–Aug prior-month blocks **[verified]**. That confirms 10/20-day provisionals at national total level.
- Secondary commentary: 10-day estimates can miss the month by a wide margin; 20-day is closer; final around the 15th of the following month **[retrieved]**. **Do not publish 10-day as a UMPI print.**
- Historical depth: Korean trade statistics exist for decades at HS6; 10-digit continuity is a revision risk and was **not** mapped this pass.
- `data.go.kr` hosts Korea Customs open APIs with “이용허락범위 제한 없음” on at least some trade-performance APIs **[retrieved]**. Those APIs are **not** confirmed to expose 10-digit memory unit values.

### H.4 Rights

Korea Customs copyright policy describes **공공누리 (KOGL)** types 0–4. Type 1 allows commercial use and modification with attribution; Types 2–4 restrict commercial use and/or modification; unmarked works require prior consultation **[retrieved, customs.go.kr copyright policy — page fetch timed out; text from search extraction]**.

`tradedata.go.kr` was **not** confirmed to carry a KOGL mark on the statistics Urdais would use. Footer copyright language was noted in the 14 September study and not re-settled.

| Right | Status |
| --- | --- |
| Access | Public portal, free **[verified]** |
| Automate | Unknown; no documented DRAM unit-value API. `data.go.kr` APIs are a different product |
| Store / retain history | Likely OK for public statistics if KOGL Type 1; unconfirmed |
| Calculate derived index | Type 1 allows 2차적저작물; unmarked = ask |
| Publish derived / raw | Attribution required under Type 1; raw republication of tables may still need review |
| Commercial use | Type 1 yes; Type 2/4 no |
| Classification until mark confirmed | `ambiguous_requires_legal_review` |

### H.5 Production role

Use, if rights clear and 10-digit still queryable: **validation signal, directional nowcast, optional weighting input.**  
Do not use as: UMPI instrument level, HBM3E $/GB, or a daily series.

---

## I. Public-filings result

**Answer:** filings can support a **relative validation layer** (QoQ ASP %, monthly revenue, “HBM shipped / LTA signed”). They **cannot** set an absolute DDR5 16Gb or HBM3E price, and they **cannot** be summed into a synthetic $/part.

| Issuer | Recurring public fields | Absolute ASP? | HBM price? | Notes |
| --- | --- | --- | --- | --- |
| Micron | Quarterly DRAM/NAND revenue, bit-shipment **direction**, ASP **% change**; HBM product commentary; SCA commentary | No | No. FQ3’26 DRAM revenue $31.328B, bits +low-single-digit, ASP +low-60s% **[retrieved, earnings materials]**; HBM4 revenue “over $1 billion” **[retrieved]** | Best US disclosure. Still a blend across all DRAM |
| SK hynix | Quarterly revenue, OP; qualitative “DRAM and NAND prices increased”; HBM4 shipment / LTA count | No unit ASP in the 29 Jul 2026 release **[verified]** | No | Newsroom ToS already refused for automated news collection (non-commercial, no robots) — **citation of an earnings release is a different act than scraping the newsroom**; still not a price feed |
| Samsung | DS division totals; HBM4 shipment claims in results text | No DRAM/HBM split price | No | Blended memory. Q1’26 results claim first mass product sales of HBM4 for Vera Rubin **[retrieved]** |
| Nanya (2408) | **Monthly** unaudited revenue (TWSE/MOPS habit); quarterly ASP **%** and bit **direction** | No. Q2’26: revenue NT$82,549M, ASP +>60%, bits flat **[verified]** | N/A (not an HBM supplier of record here) | Cleanest **monthly** public DRAM-maker revenue. Still a company, not an instrument |
| Winbond (2344) | Monthly consolidated revenue | No | No | August 2026 NT$27.309B **[verified, Winbond PR 4 Sep 2026]** includes Nuvoton and other subsidiaries — **contaminated** as a DRAM price proxy |
| Kioxia / Sandisk | NAND-heavy; not UMPI instruments | — | — | Out of UMPI scope unless the product expands to NAND |

**What a filings combination can create:** a Urdais “memory tightness” or “maker ASP direction” **index** (base 100), vintageed, with each print tied to a filing date.  
**What it cannot create:** UMPI’s current instruments.

SK hynix Newsroom terms (already on file from the 15 September news pass) prohibit robots and limit the site to non-commercial use **[verified in prior Urdais research]**. Do not automate the newsroom. Citing a specific earnings release as a human-reviewed source is a legal question for counsel, not a feed design.

---

## J. Spot vs contract recommendation

**UMPI’s current DRAM labels map to the spot board, not to contract.** That is a fact about naming **[verified]**. It is not automatically the right economic choice for an AI-era index.

| Market | Who | Cadence | What is priced | AI/server relevance | UMPI mapping |
| --- | --- | --- | --- | --- | --- |
| **Spot** | Brokers, module makers, channel distributors, some SI; DX says it also operates a trading department **[verified]** | Three sessions/day; public teaser daily | Named dies, branded and eTT | Indirect. Tightness shows up here; this is not how NVIDIA buys HBM or how OEMs buy server RDIMM | **Current six labels** |
| **Contract** | PC/server OEMs vs makers; DX inquires OEM procurement and maker sales; publishes high/low/avg because the prices are confidential **[verified]** | Monthly (DRAM); server DIMM monthly on a separate $25k package | Often **modules** (SO-DIMM, UDIMM, RDIMM) and some chips; DDR3 org may differ | Higher for PC/server conventional DRAM. Still not HBM | Not the current labels |
| **LTA / strategic** | Hyperscalers and accelerator vendors vs three HBM/DRAM makers | Multi-year, rarely reprinted | Allocated stacks and wafers | **The AI market** | Invisible except as issuer commentary |

On 21 September 2026 the branded DDR4 16Gb **spot** average was $85.00 while the public **contract** teaser for DDR4 16Gb 2Gx8 was $48.00 **[verified]**. Publishing one number named “DDR4 16Gb” without saying which market would be false.

**Recommendation:**

- **Primary series for the existing DRAM family:** **spot**, because that is what the labels already are, and it is the only daily chip tape.
- **Contract:** a **separate family or sub-series** (`UMPI-DRAM Contract`), monthly, different instruments (modules + the contract chip list), never mixed on one axis with spot.
- **Do not** use spot as a silent proxy for server/AI contract. A methodology sentence must say spot is the **channel/die** market.
- If Urdais’s product intent is “AI memory cost,” spot DDR is the **wrong hero** and HBM is the right hero — but HBM is not observable. That tension is the product decision, not something research can paper over.

---

## K. Unit recommendation

| Family | Current unit | Verdict | Rule |
| --- | --- | --- | --- |
| DRAM | USD / part | **Keep**, defined as **USD / die** | Eligible part = one die matching locked generation, density (Gb), organization, speed bin, grade. Store the source’s native USD/piece. Do not convert to $/GB for the official print |
| HBM | USD / GB | **Keep only as a derived display** if a stack price or licensed ASP exists | Preferred stored native unit: **USD / stack** (or licensed ASP/Gb). Publish $/GB only as `stack_price / capacity_GB` or vendor ASP, with capacity and generation on the instrument. **Do not** introduce $/GB/s in V1 — no observed bandwidth-priced market |
| Public proxies | n/a | **Index points (base 100)** or native customs unit | Do not relabel $/kg or $/piece MCP as UMPI $/part or $/GB |

---

## L. Cadence and frontend-semantics recommendation

The market header currently prints the move with the word **“today”** (`src/components/market-detail/market-header.tsx`). UCPI already uses **“1D”**. UMPI should not use a more aggressive word than UCPI for a slower market.

| Series | Observation | Change label | Intraday chart | 1D range | 1W / 1M / 3M / 1Y |
| --- | --- | --- | --- | --- | --- |
| DRAM spot (if licensed) | Business-day session average (DX: three prints/day) | **1D** or **session** — not “today” | **No** for V1. Three licensed prints do not make a public tape Urdais can chart without raw-republication rights | Yes, as last session vs prior session | Yes, if history is licensed (Silver: 5 years Excel; Daily Express from 2003) |
| DRAM contract (if licensed) | Monthly | **MoM** or **since previous print** | No | No | 3M / 1Y / longer; 1W is decoration |
| HBM licensed ASP | Monthly bulletin / quarterly datasheet / aperiodic price update | **since previous observation** | No | No | 3M / 1Y if the licensed history exists |
| HBM estimate / research-preview | Event-driven | **latest change** + date of both prints | No | No | Sparse points, **no interpolated daily line** |
| Public customs / filings | 10/20-day or monthly / quarterly | **MoM** or **vs last vintage** | No | No | Vintageed; never daily |

**Last-updated timestamp:** keep. It is the one current header concept that is always honest.

**Compare:** keep **inside a family and inside a market** (spot vs spot). Do not compare DRAM $/die to HBM $/GB (the UI already prevents that). Do not compare spot DDR4 16Gb to contract DDR4 16Gb on an absolute axis without labelling both.

**Historical charts:** a daily-looking line is justified **only** for licensed DRAM spot. For everything else, plot observation dates. If a smoother is shown, it must be labelled interpolation, not a price.

Demo series in `market-detail.ts` currently invent ~1,300 daily DRAM points and ~900 daily HBM3E points. Those shapes must not ship as production history.

---

## M. Rights matrix

| Source | Access | Automate | Store | History | Calculate | Derived publish | Raw publish | Commercial | Post-termination | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DRAMeXchange / TrendForce membership | Paid; login **[verified]** | Unknown; `/api/*` robots-disallowed on trendforce.com (14 Sep); price pages login-gated | Only under contract | Silver: 5y Excel **[verified]** | Barred without consent (§6.2) **[verified]** | Barred without written consent | Barred | Paid commercial product; publication is a second ask | Unknown — ask | `commercial_license_required` |
| TrendForce Insights (Substack) | Paid | n/a | Personal-use clause **[verified]** | n/a | No | No | No | Personal use | Unknown | `not_usable` for UMPI |
| CFM闪存市场 | Public newsflash; paid quote centre | No API found | Forbidden without written permit **[verified]** | Unknown | Forbidden without permit | Forbidden without permit | Forbidden | Commercial product; ask | Unknown | `commercial_license_required` |
| Silicon Data RAM Index | Paid API | Yes (API) **[retrieved]** | Internal licence | From 2026-01-26, GDDR6 only | Limited extracts; derived distribution needs written auth **[retrieved]** | Separate redistribution licence | Separate | Subscription ≠ publication | Unknown | `commercial_license_required` (and **wrong product**) |
| WSTS subscriber / distribution licence | Free Blue Book; paid detail | Unknown | Copyright bar **[verified]** | 40y billings **[verified]** | Distribution licence is the door | Only if licence says so | No by default | Yes via distribution licence | Unknown | `commercial_license_required` |
| WSTS Blue Book (free web) | Public **[verified]** | Download | Copyright still asserted on the website **[verified]** | Monthly regional totals | Unclear; copyright is blanket | Do not assume | Do not assume | Unclear | n/a | `ambiguous_requires_legal_review` |
| Korea tradedata.go.kr | Public **[verified]** | Unknown | KOGL if marked | Long HS history | Type 1 allows derivatives | Type 1 with attribution | Review | Type 1 yes | n/a | `ambiguous_requires_legal_review` |
| KITA / TRASS | Portal; login likely for detail | Unknown | Unread | Yes (journalist use) | Unread | Unread | Unread | Unread | n/a | `ambiguous_requires_legal_review` |
| Taiwan ITA / MOF customs | Public query **[retrieved]** | Unknown | Unread | Multi-year bulletin **[retrieved]** | Unread | Unread | Unread | Unread | n/a | `ambiguous_requires_legal_review` |
| Micron IR / SEC | Public | Existing Urdais IR discipline; do not scrape blocked RSS | Yes (securities disclosure) | Quarterly | Yes (facts) | Yes, as citation of facts | Quote sparingly | Yes | n/a | `public_republication_with_attribution` **[inferred from US securities practice; not a Micron grant]** |
| Nanya / Winbond monthly PR | Public **[verified]** | Prefer MOPS official file over scraping IR HTML | Yes | Monthly | Yes | Yes, as cited facts | Quote | Yes | n/a | `public_republication_with_attribution` **[inferred]** |
| SK hynix Newsroom site | Public pages | **No** — prior Urdais review: robots + non-commercial **[verified, 15 Sep news pass]** | Display/storage without consent barred on that ToS | — | Do not build a feed | Cite a specific release only after counsel | No | Site says non-commercial | n/a | `not_usable` as a feed; earnings *facts* may still be citable |
| data.go.kr Customs APIs (generic trade) | Free key **[retrieved]** | Yes | “이용허락범위 제한 없음” on listed APIs **[retrieved]** | Product-specific | Likely | Likely with attribution | Likely | Likely | n/a | `public_republication_with_attribution` **only for those APIs**, not a DRAM instrument feed |
| Aggregators (memoryindex.io etc.) | Public | Irrelevant | Contaminated | — | — | — | — | — | — | `not_usable` |

TrendForce §5.h (betting / prediction markets) remains a named clause for any licence conversation **[verified]**.

---

## N. Instrument production-state matrix

| Instrument | Data state | Evidence |
| --- | --- | --- |
| DDR5 16Gb | `possible_but_requires_commercial_license` | Recurring branded die print exists (DX daily; CFM at least weekly). Terms bar derivative publication without consent. |
| DDR4 16Gb | `possible_but_requires_commercial_license` | Same. Spot and contract both exist and **disagree** ($85 vs $48) **[verified]**. |
| DDR4 8Gb | `possible_but_requires_commercial_license` | Same ($46.036 spot vs $24 contract) **[verified]**. |
| DDR4 16Gb eTT | `possible_but_requires_commercial_license` | Named eTT line on the same board. Longitudinal grade, not a JEDEC part. |
| DDR4 8Gb eTT | `possible_but_requires_commercial_license` | Same. |
| DDR3 4Gb | `possible_but_requires_commercial_license` | Spot line exists; contract line is a different organization. Legacy but still printed. |
| HBM3 | `estimate_only` | No public recurring price. Licensed TrendForce ASP/Gb would still be a survey estimate. Customs MCP unit value is not HBM3. |
| HBM3E | `estimate_only` | Same. Current headline is the most important number Urdais cannot yet defend. |
| HBM4 | `estimate_only` | **Commercial market: yes.** **Observed prices: no.** Shipments from Samsung (Feb 2026), Micron (Q1 2026), SK hynix (Q2 2026). Keep as a **research-preview instrument**, not a production price, and not deleted. |

No current instrument is `production_ready_source_identified`. None is `insufficient_market_data` except in the narrow sense that HBM has no *price* market — the product market exists.

---

## O. Strongest production architectures

Chosen on observability, comparability, rights, reproducibility, and market meaning — not UI neatness.

### Architecture A — smallest production UMPI (recommended default)

- **Publish:** UMPI-DRAM Spot, six current instruments, labels extended to the board definition, unit USD/die, change **1D/session**.
- **Licence:** TrendForce Silver or Gold **plus written derived-index publication rights** (access ≠ publication). CFM as backup or second survey, same rights ask.
- **Withhold:** HBM prices. Keep the HBM family in the UI as empty/research-preview so a later HBM4 headline needs no restructure (the frontend already allows that).
- **Public layer (optional, separate rail):** Nanya monthly revenue; Micron/SK hynix ASP %; Korea/Taiwan unit-value *indices*. Never labelled as the DRAM instruments.

This is the only architecture that (1) matches what the current labels actually are, (2) has a recurring observation, and (3) fails only on rights — a solvable commercial problem.

### Architecture B — full three-family product (only after two more licences)

- UMPI-DRAM Spot (A).
- UMPI-DRAM Contract (monthly; modules/chips as the contract board defines them; MoM).
- UMPI-HBM as licensed TrendForce (or other) **ASP/GB or ASP/Gb**, instrumented at least by generation and, if the datasheet splits them, by layer/capacity. Provenance: **survey estimate**. Cadence: monthly/quarterly. HBM4 research-preview until the licensed series prints it.

This is the closest to “AI memory + conventional memory” and the furthest from “we observed a trade.”

### Architecture C — public-only (buildable now, **not** current UMPI)

- No $/part, no HBM $/GB.
- Relative indices from KOGL-cleared customs (if 10-digit survives) and cited issuer ASP %.
- Useful as UBWI-style honesty. **Does not preserve the current taxonomy.** Do not ship this under the existing six+three instrument picker; that would be a category lie.

**Not recommended:** mixing spot and contract in one series; publishing aggregator HBM $/GB; interpolating HBM into a daily chart; treating Korea $/kg as DDR5 16Gb.

---

## P. Exact unresolved blockers

1. Written **derived-index + public display** grant from TrendForce/DRAMeXchange (and separately: raw republication? post-termination retention? §5.h scope?).
2. Same grant from CFM if used as primary or backup.
3. Written grant from TrendForce HBM Package if Architecture B is chosen — including whether “ASP per Gb” may be published as a Urdais number or only used internally.
4. Official **2026 HSK descriptions** for 8542.32.1010 / 8542.32.3000 / NAND twins, extracted from UNIPASS, not blogs.
5. Whether **national** 10-digit quantity (개) queries still exist on tradedata.go.kr / KITA after the September 2026 6-digit municipal change.
6. KOGL **mark** on the specific Customs/KITA tables Urdais would use.
7. Taiwan ITA/MOF terms for commercial derived publication.
8. Micron FQ3 prepared-remarks PDF not extracted first-hand in this pass (HBM4 “>$1B” is **[retrieved]** from secondary transcripts/8-K coverage). Confirm from `investors.micron.com` PDF before citing on a methodology page.
9. WSTS distribution-licence quote and whether Memory ASP may appear in a public index (outreach already contemplated; no reply on file here).
10. Silicon Data: will they add DDR/HBM, and will they sell a redistribution licence? Coverage is currently GDDR6 only.
11. Product decision, not a data gap: is UMPI’s hero **spot conventional DRAM** (observable if licensed) or **HBM** (the AI object, estimate-only)?

---

## Q. Vendor / human outreach required

| Who | Dataset | Rights to ask | Why |
| --- | --- | --- | --- |
| TrendForce Semiconductor Research, `SR_MI@trendforce.com` (already the named desk, 14 Sep) | DRAM spot session averages for the seven board lines (six UMPI + DDR5 eTT); optional contract high/low/avg; Excel history; DXI if wanted as validation | (1) automated retrieval, (2) store and retain history **after termination**, (3) **calculate and publicly display a Urdais index / benchmark derived from the prints**, (4) whether raw USD/die may appear, (5) §5.h written carve-out that a non-tradable published index is not “betting,” (6) attribution form | This is the only daily source that already *is* UMPI-DRAM |
| Same desk, HBM Package | HBM ASP per Gb / any generation-layer split; bulletin + datasheet history | Same derived-publication ask, plus permission to label the print as a TrendForce-based **estimate/survey** | Only licensable HBM *price-like* series found |
| CFM, `Service@ChinaFlashMarket.com` | DDR Major/eTT chip quotes, history, feed or API | Same as TrendForce, in Chinese/English: 衍生指数公示, 原始报价转载, 商业使用, 解约后历史保留 | Independent second print; documents that UMPI is not a DX clone |
| WSTS, Tobias Proettel `tp@wsts.org` | Memory shipment value/units/ASP (monthly) | Distribution licence: external derivative analysis / public index; post-termination retention | Validation series, not UMPI instruments |
| Silicon Data, `support@silicondata.com` + partnerships | Whether DDR5/DDR4/HBM will exist; if not, stop | Redistribution / custom-index licence is irrelevant until coverage exists | Warm partner; wrong instruments today |
| Korea Customs data officer / tradedata inquiry; KITA stats | 10-digit export value, quantity (개), weight, 10/20-day and final, HS 8542.32.* and 8473.30.* | Written confirmation of KOGL type or licence for commercial derived publication | Unlocks Architecture C and the validation layer |
| Taiwan ITA / MOF statistics | HS 854232 unit and per-kg averages | Same | Second-country public proxy |

Do not ask distributors (Digi-Key class) for an index licence unless Architecture C is abandoned and UMPI is redefined as channel retail. The 14 September contracts already answer no.

---

## R. Engineering gate

Do **not** begin a UMPI production ingestion pipeline until every line is Yes or an explicit “won’t have / withheld.”

| # | Question | Must be |
| --- | --- | --- |
| R1 | Has a counterparty granted **written** rights to calculate and **publicly display** a derived UMPI-DRAM value from their DRAM spot prints? | Yes, or DRAM prices stay withheld |
| R2 | Does that grant include **historical retention after termination**? | Yes, or Urdais cannot meet its own reproducibility rule |
| R3 | Are the six DRAM instruments locked to the board definition in a **methodology** (org, speed, branded vs eTT, USD/die, spot)? | Yes |
| R4 | Is spot vs contract a **separate series decision**, written down? | Yes |
| R5 | Is HBM priced, withheld, or research-preview — chosen in writing? | Yes |
| R6 | If HBM is shown, is every number classified (estimate / customs proxy / licensed ASP) and is daily interpolation **forbidden**? | Yes |
| R7 | Is HBM4 explicitly **not** a production price until an observation or licensed ASP exists? | Yes |
| R8 | Is the header word **“today”** replaced per series (1D / MoM / since previous observation)? | Yes |
| R9 | Are Korea/Taiwan unit values **not** mapped onto UMPI instrument IDs? | Yes |
| R10 | Are aggregators (memoryindex.io and peers) on the do-not-ingest list? | Yes |
| R11 | Is SK hynix Newsroom **not** an automated source? | Yes |
| R12 | Has counsel (or a recorded legal review) accepted the Micron/Nanya **citation** path as facts-from-filings? | Yes |

If R1 is No, the production UMPI is an empty family plus optional public validation indices. That is a valid, honest product. Building a scraper or a daily HBM chart before R1–R8 is how the demo becomes a false market.

---

## Appendix. Dated observations used (not UMPI prints)

**Observed / surveyed market prints (third-party; Urdais has no licence to republish as product data):**

- DRAMeXchange / TrendForce DRAM **spot** session averages, 21 September 2026 18:10 GMT+8 — table in §F.1 **[verified]**. Class: **survey session average**, primarily transaction-based for mainstream chips per TrendForce’s own method note.
- TrendForce DRAM **contract** teaser, page stamp 31 July 2026 15:00 GMT+8, August file noted 31 August 2026 — DDR4 16Gb 2Gx8 session average **$48.00**; DDR4 8Gb 1Gx8 **$24.00**; DDR3 4Gb 256Mx16 **$14.50**; plus SO-DIMM lines **[verified]**. Class: **contract benchmark** (high/low/avg survey).
- CFM newsflash, 16 September 2026 — DDR5 16Gb Major **$45.00**; DDR5 16Gb eTT **$26.00** **[verified]**. Class: **market quote** in a CFM article.

**Company disclosures (not prices):**

- Samsung HBM4 commercial shipment, 12 February 2026 **[verified]**.
- Micron HBM4 36GB 12H volume shipment, calendar Q1 2026 **[retrieved]**.
- SK hynix Q2 2026 results, 29 July 2026 — revenue KRW 79.3187T; HBM4 mass shipments; ~10 LTAs **[verified]**.
- Nanya Q2 2026, 10 July 2026 — ASP +>60%, bits flat **[verified]**.
- Winbond August 2026 monthly revenue NT$27.308717B, 4 September 2026 **[verified]**.

**Analyst estimates and forecasts:** not tabulated as prices. See §E.

**Customs unit values:** journalist-reported KITA/TRASS figures in §E and §H are **secondary**. Do not treat them as Urdais-verified observations until pulled from the official query.
