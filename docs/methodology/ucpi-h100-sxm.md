# UCPI-H100-SXM Child Specification

**Status: proposed child specification, version 0.1.1-draft. Launch blocked.** Prepared 12 September 2026, amended 13 September 2026. No production value, price series, provider list, or history is established by this document. Every price appearing here is research evidence gathered to test the methodology, never a published value.

This is the first child of the [Urdais Compute Price Index family](/docs/methodology/ucpi) and the first application of that family methodology to a real compute product. It is therefore two things at once: a specification for measuring one product, and an empirical test of whether the family's architecture survives contact with the market.

**The 0.1.0-draft result was that the architecture holds and the data does not.** The public price surfaces on which that study was conducted do not carry the region, availability, minimum-topology, multi-offer, or operator information the family requires.

**This amendment closes most of that gap, and launch remains blocked for narrower and better-understood reasons.** Two research passes since the first draft studied provider APIs, catalogs and ordering interfaces, and then ran the first H100-specific empirical experiment. The fields the price surfaces lack are, for most sellers, carried by machine-readable interfaces. The child can now state deterministic rules for region, availability evidence, minimum topology, tenancy evidence, operator fallback, price and availability freshness, mandatory fees, and the three-stage eligibility criteria, together with the exact fields a future ingestion system must produce. What remains open is a small, named set of numerical parameters that require observation over time rather than at one instant, plus the bundle envelope level and the seller-reduction rule. **No research offer has become a P2 observation**: P2 is still empty, which is what launch blocked continues to mean.

**Three states are distinguished throughout and are not the same thing**: methodology-defined, backend-implementable, and launch-ready. This child is now the first two and is not the third.

**Evidence is reported in three separate populations**, because the first draft of this study mixed them and drew statistics across the mixture. See [Evidence Populations](#docs-evidence-populations).

## Relationship to the UCPI Family

This specification inherits the family methodology and adds only what H100 SXM requires. It does not restate parent rules, and it does not modify them: where the research suggested a parent rule needs revision, that is recorded in [Findings for the Parent Methodology](#docs-findings-for-the-parent-methodology) rather than worked around here.

**Inherited unchanged**: the economic object and the exact statistic; the capacity-source identity and collapse rule; seller-level reduction as a concept; the regional median and its even-`N` convention; the source-quality and observation-type framework; availability semantics and the availability state vocabulary; reconfirmation semantics and the three freshness dimensions; the procurement taxonomy; bundle and topology principles; the prohibition on synthetic decomposition and on fractional normalization; price-component principles; the aggregation population for percentiles; publication statuses; corrections; lineage; and versioning.

**Fixed by this child**: hardware identity and the evidence required to establish it; topology class and the minimum-topology observation rule; procurement mode; the tenancy requirement and which evidence grades satisfy it; the service dimensions that are requirements rather than metadata; index currency; the percentile interpolation convention; the canonical region taxonomy and its mapping contract; the availability evidence scale and the minimum grade; the separation of the economic, source-observable and calculable populations; the price and availability freshness architecture; the carry rule per dimension; the tax-basis and mandatory-fee rules; the operator-attribution fallback; the three-stage eligibility criteria; the exclusion and diagnostic vocabulary; and the ingestion field contract.

**Unresolved after this research**: the bundle envelope level; the seller-reduction rule; the numerical freshness ages and the price carry limit; the cross-time stability of the marketplace seller identifier; and four numerical publication gates. Each is listed in [Launch Blockers](#docs-launch-blockers) with the specific study required.


## Primary Question

> What is the market-accessible rental price of the defined H100 SXM compute product within a given region?

Under the family methodology the statistic will be the regional median across final capacity-source observations of each participant's lowest-priced qualifying accessible offer.

## Evidence Populations

Observations are reported at three stages, and a statistic computed over one stage must never be presented as describing another.

**P0, the identity-qualified research universe.** Price observations from individual sellers whose H100 SXM identity is established under the evidence rule below. P0 exists to show market structure and dispersion and to test the identity rule. It deliberately contains observations that fail the child's topology, service-product, availability, region, or operator requirements. **P0 is not the child's price distribution.**

**P1, the selected-product advertised-rental population.** P0 observations that additionally satisfy the child's resolved requirements: full-device rental rather than a different service product, on-demand and non-preemptible, and the selected per-accelerator allocation topology. P1 observations may still fail unresolved launch requirements. **P1 is not a UCPI value.**

**P2, the final UCPI-eligible population.** Observations satisfying every parent and child requirement. **P2 is currently empty**, which is what launch blocked means.

A platform-level aggregate is not an observation at any stage; see [Marketplace Treatment](#docs-marketplace-treatment).

## Hardware Identity

An accelerator called "H100" is not necessarily an H100 SXM, and the research found a single seller using three different "H100" labels at three different prices on one page. Identity is therefore established from NVIDIA's own product documentation, not from a seller's product name.

From NVIDIA's [H100 product specifications](https://www.nvidia.com/en-us/data-center/h100/), retrieved 12 September 2026, the H100 SXM is specified as 80GB of GPU memory with 3.35TB/s of memory bandwidth, up to 700W thermal design power, SXM form factor, 900GB/s NVLink bandwidth, and server options of "HGX H100 (4-8 GPUs), DGX H100 (8 GPUs)". The H100 NVL on the same table is a materially different product: 94GB, 3.9TB/s, 350-400W, PCIe dual-slot air-cooled, 600GB/s NVLink, and server options of "Partner systems (1-8 GPUs)". The [H100 NVL product brief](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/h100/PB-11773-001_v01.pdf), March 2024, documents that product separately.

The canonical identity for this child is therefore: vendor NVIDIA; architecture Hopper; model H100; form factor SXM; GPU memory 80GB; full physical device, not a partition. An offer failing any of these is not this product.

H200, GH200, H100 NVL, H100 PCIe, and any partitioned H100 are different instruments. They are out of scope and are not price-compared with this child under any normalization.

### Establishing SXM from seller evidence

A seller's label alone is frequently insufficient, so the child defines a graded evidence rule.

**Grade A, explicit designation**: the seller states SXM or SXM5. P0 contains four Grade A observations.

**Grade B, HGX designation mapped by NVIDIA documentation**: the seller states NVIDIA HGX H100. NVIDIA's enterprise reference architecture documentation states directly that an HGX baseboard carries "Eight H100, H200 or B200 SXM GPUs on a H100, H200 or B200 baseboard", so an HGX H100 system contains H100 SXM GPUs as a matter of documented system composition rather than inference. The rule is therefore: **an official seller designation of NVIDIA HGX H100 qualifies as H100 SXM, because NVIDIA primary documentation maps HGX H100 directly to H100 SXM GPUs.** A vague or marketing use of "HGX" without the H100 designation does not qualify.

**Grade C, documented SKU mapping**: official instance documentation that identifies the underlying part.

**Insufficient**: a bare "H100" with no form factor, an "H100 NVLink" label that does not distinguish SXM from an NVL-based system, and any inference from price level or from the fact that an offer is sold in eights. These are excluded with reason `HARDWARE_VARIANT_UNRESOLVED`.

**This rule is outcome-determining and is recorded as such.** Over the identity-qualified seller population, admitting Grade A only gives four observations with a median of $3.7196; admitting Grades A and B gives nine with a median of $3.9492, **6.2% higher**, and more than doubles coverage. A rule that looks like bookkeeping moves both the level and the breadth of the measure. **The child adopts Grades A, B, and C**, because Grade B rests on NVIDIA's own documented system composition rather than on a guess, and because excluding more than half the sellers to avoid a documented mapping would make the measure less representative, not more rigorous.

## Topology Class

**NVIDIA's documented H100 SXM server platforms are multi-GPU systems.** The H100 SXM's documented server options are HGX H100 at four to eight accelerators and DGX H100 at eight, and NVIDIA's reference architecture documentation describes eight SXM GPUs on a baseboard. This document does not claim the stronger proposition that no single-GPU SXM server exists anywhere, which the available primary evidence does not establish.

The commercial consequence observed in the research is separate and narrower: **several sellers expose one full accelerator from such a multi-accelerator host**, so a single-accelerator offer is typically an allocation rather than a standalone machine. That shapes what can be compared.

**Topology is classified by the minimum purchasable commercial topology, never by the quoted denominator.** A price displayed in dollars per GPU-hour is a unit of presentation and is not evidence that a buyer may rent one accelerator. The question is what the buyer must actually take.

**The child specifies the per-accelerator allocation class**: an offer of one or more full H100 SXM accelerators from an HGX host where the buyer is not required to take a whole node. The whole-node class is a legitimate sibling and is never merged in, because dividing a node price by eight is arithmetic, not comparability.

Applying the minimum-topology rule to the research sample produced a material correction. Of nine identity-qualified sellers, **three are confirmed per-accelerator**, one is **confirmed whole-node only** and excluded, one is **confirmed serverless** and excluded on service product, and **four could not be classified from the public price surface at all**. The unclassifiable cases are instructive: one displays a per-GPU rate whose stated host resources are eight-node scale beside an unexposed size selector; one is labelled HGX with no accelerator count; one is a cluster product whose minimum is not stated; and one has a GPU-count field whose value the rendered page does not carry.

**The first draft's topology subgroup statistic is withdrawn.** That figure, a per-accelerator median of $3.67 against $3.99 for whole-node products and a difference of 8.7%, was computed by classifying sellers on their quoted denominator rather than on minimum purchasable topology. The classification was wrong, so the number is withdrawn rather than restated, and no replacement is computed: with three confirmed per-accelerator sellers and one confirmed whole-node seller, no defensible comparison exists.

**Minimum purchasable topology is an ordering-interface attribute that the price surface frequently does not expose.** The later research established that it is nonetheless recoverable in machine-readable form for most sellers, and the rule below states exactly what must be observed.

### The minimum-topology observation rule

For a P2-eligible observation the minimum purchasable GPU count must be **established from a source field, never derived from the quoted denominator**. The observable shapes, each verified in a provider's own interface or published specification, are: the smallest accelerator count among the offers a marketplace machine actually lists; the smallest GPU count among the seller's instance types for this accelerator; an explicit minimum-pod-GPU-count field; and a stock-keeping-unit definition that fixes the count.

Where the minimum cannot be established from such a field, the observation is `MINIMUM_TOPOLOGY_UNKNOWN` and is **not P2 eligible**. A per-GPU presentation of price is never treated as evidence that one accelerator may be rented, and a quantity is never inferred from the denominator of a quoted rate.

### A machine fraction is not a device fraction

The research identified an ingestion trap severe enough to record in the specification, because reading it wrongly would silently exclude most of one venue under the family's fractional-accelerator prohibition.

One marketplace exposes a field giving the **fraction of a machine's accelerators** that an offer comprises. Tested arithmetically, the offer's accelerator count divided by that fraction reproduced the machine's total accelerator count **exactly for all 35 machines observed, with no inconsistency**, and every one of the 116 offers reported the full 80GB of device memory.

**A fraction below one therefore means whole accelerators taken from a larger machine. It does not mean a partitioned accelerator.** The family's prohibition on fractional and shared devices is a prohibition on sub-device partitions, and it is tested against device memory and the identity attributes, never against a machine-occupancy ratio. An offer taking one whole accelerator from an eight-accelerator host is a full device by this child's identity rule, and its tenancy is assessed separately under the rule below.


## Procurement Mode

**On-demand, non-preemptible.** The research found this mode present across every researched seller that publishes a price at all, while interruptible and reserved pricing was narrower and more heterogeneous: one seller published a preemptible rate roughly half its on-demand rate, another published four separate reserved tiers by commitment length spanning 20%, and several publish reserved pricing only on request.

Interruptible capacity is excluded because it is a different product bearing interruption risk. Reserved and committed capacity is excluded because its price is inseparable from a commitment term and because it is frequently quote-only. Negotiated contracts are excluded as unobservable. Each is a candidate sibling series.

Promotional pricing is excluded by the family, and the research encountered a live instance: one seller published a headline instance rate labelled as a promotion with a stated expiry date, alongside its ordinary rate. The ordinary rate is the observation; the promotional rate is recorded and counted as a diagnostic.

## Tenancy, Virtualization, and Service Tier

The child requires **exclusive use of the full physical accelerator**. A virtual machine that passes through an entire H100 SXM qualifies; a shared or partitioned accelerator does not. Bare metal is not required, because the research found exclusive full-device access delivered through virtual machines across most of the market and no evidence that the hypervisor boundary is what moves price.

Fractional and time-shared products are excluded, per the family, and are not normalized into accelerator-hours.

**Exclusivity must be evidenced per observation, not inferred from the existence of an H100 price.** Each candidate is graded: **explicit**, where the seller states a dedicated or exclusive full accelerator; **documented**, where official product documentation establishes a full-device product without using the word; **ambiguous**, where neither is present and the offer is neither clearly exclusive nor clearly shared; **shared or fractional**, which is excluded; and **unknown**. An explicit statement that partitioning is disabled is not required where documentation clearly establishes a dedicated full accelerator, but silence is not converted into certainty either. Ambiguous and unknown observations remain research candidates and do not enter a final population. Launch is already blocked, so there is no reason to lower this standard to keep the sample large.

The child makes requirements of: full-device exclusivity; non-preemptibility; and the accelerator identity above. It records as metadata, not requirements: host CPU and memory allocation; local storage; intra-node NVLink presence; inter-node fabric and its bandwidth; provisioning latency; and support terms.

That division is deliberately conservative, because **the research cannot yet show which service dimensions move price**. Separating the effect of inter-node InfiniBand from the effect of seller pricing strategy requires observations that vary one dimension at a time, which a single-day snapshot across ten sellers does not provide. Promoting any of these to a requirement without that evidence would discard offers on a guess.

### Which tenancy grades are eligible

**Explicit and Documented are P2 eligible. Ambiguous, Unknown, and Shared or fractional are not**, and are excluded with reason `TENANCY_UNRESOLVED` for the first two and `FRACTIONAL_OR_SHARED_DEVICE` for the third.

The rule is deterministic for a future ingestion system: exclusivity is established from a seller statement or from official product documentation, both of which are retained as evidence on the observation, and **it is never inferred from price level, from the accelerator being sold singly, or from the absence of a statement that the device is shared**.

The research applied this to the one venue with the strongest availability data, and the classification was corrected during this pass. An earlier reading rested on that venue's security documentation, which establishes container-level isolation between clients in detail, describing separate namespaces and control groups, network, file-system and process isolation, but says nothing about the accelerator itself. On that basis the venue was first graded Ambiguous.

**That was a failure to read the right page, and it is corrected.** The venue's official Concepts documentation defines an instance as "a running, isolated environment on the host's machine with **exclusive access to the GPUs you rented**", and notes that instances are almost always containers with a small subset being virtual machines. That is a direct statement by the venue, in its own product documentation, that the accelerators an instance rents are exclusively accessed.

**The venue therefore grades Documented and satisfies this child's tenancy requirement.** Documented rather than Explicit is the right grade because the statement is the venue's product documentation covering every offer on the platform, not a per-offer assertion by the individual seller behind an offer. The machine-fraction arithmetic and the uniform full device memory independently establish that allocation is in whole accelerators, so the two lines of evidence agree.

No other primary source from that venue contradicts the statement. Its security documentation is silent on accelerator assignment rather than opposed to it, and its documentation set contains no concept of a partitioned, time-shared, or virtualized fractional accelerator at all.

**The rule itself is unchanged.** Only the grade assigned to one venue changed, and it changed because a primary source was read that should have been read the first time. Silence is still not converted into certainty; what closed this was a statement, not an inference.


## Bundle Envelope

**The form of the envelope is now resolved. Its level is not, and remains a launch blocker.**

The family requires a child to declare the host-resource envelope it treats as ordinary, makes offers outside it ineligible rather than adjusted, and prohibits synthetic decomposition.

### The envelope is a floor, not a band

**The child's bundle envelope takes the form of a minimum host-resource allocation per accelerator, not a two-sided range.**

The reasoning is economic rather than statistical. A host bundle too small to keep an H100 SXM supplied changes what the buyer can do with the accelerator, so an inadequate bundle is a genuine product difference. An unusually generous bundle does not make the accelerator a different product for a buyer who wants the accelerator; it makes the offer better value. **A two-sided band would exclude the generous offer for no economic reason**, and the family's requirement is that the envelope describe what is ordinary for the instrument, not that it describe the middle of whatever sample happened to be collected.

The evidence supports the form directly. The marketplace experiment produced **23 pre-bundle research candidates**, meaning H100 SXM offers that were on-demand, currently rentable, and in the per-accelerator allocation class. They are **not P2 observations and are not called eligible**: the bundle envelope is precisely what has not been applied to them, and several other P2 requirements are unresolved. Applying the specialist-cloud host-resource range observed in the first draft as a two-sided band to that set admits **2 of 23, 9%**, and host memory rather than virtual CPU count is the binding constraint. The offers it removes are overwhelmingly removed for having *less* than the band, not more.

### The level is not set, and the reason is the reason it matters

Host-resource dispersion per accelerator across those 23 research candidates spans a factor of **7.0 in virtual CPUs, 18.3 in host memory, and 8.7 in local storage**, against factors of 1.62 and 2.05 for virtual CPUs and memory among the disclosing specialist clouds of the first draft. **The marketplace segment is roughly an order of magnitude more heterogeneous than the specialist-cloud segment**, so the envelope level is the boundary that decides whether that segment is measured at all.

The sensitivity is direct. A floor at 8 virtual CPUs and 16GB per accelerator removes almost nothing. A floor at 16 virtual CPUs and 125GB reduces the marketplace's participating hosts from eight to two and takes the one country that reached the family's structural floor down to a single participant, at which the family publishes no value.

**Choosing the level would therefore be choosing whether this child publishes, which is the one reason the family forbids for choosing a parameter.** The level requires evidence of what host allocation is actually required to use an H100 SXM for ordinary workloads, which is a hardware and workload question this research did not ask and cannot answer from price data.

Until then the child accepts bundle heterogeneity within the per-accelerator allocation class as **named accepted heterogeneity** for research purposes, publishes the bundle dispersion of every observation, and records the level as unresolved. Synthetic decomposition remains prohibited: no imputed price is subtracted for virtual CPUs, memory, storage, or network.

**The family requires a child to declare an envelope before launch, so this is a launch requirement rather than an optional refinement.** It does not block merging this draft.


## Geographic Taxonomy

**This was the first launch blocker. It is now resolved.**

The family makes regional series primary, represents geography as a hierarchy from facility through seller region label, metropolitan area and country to the canonical UCPI region, and requires that seller labels never be aggregated directly.

### The canonical region is the country

**The canonical UCPI region for this child is the country in which the capacity is located, identified by its ISO 3166-1 alpha-2 code.**

Country is chosen because it is the finest level that can be mapped consistently from every region-exposing source in this market, and the choice was tested rather than assumed.

**A finer taxonomy is not constructible.** On the venue with the best-populated geography data, a genuine subnational identifier was present on 9 of 116 H100 SXM offers, **7.8%**; the other 92.2% resolve to a country and no further. The venue's own documented query filter for location is a two-letter country code, and its integer location code proved one-to-one with country. A metropolitan taxonomy would therefore be unmappable for nine offers in ten at the one source that exposes availability at all.

**A coarser taxonomy is refused even though it would help.** Moving from country to a macro region takes the number of regions reaching the family's two-participant structural floor from one to three in the tested sample. That is precisely the move the family forbids, and the merge is not cosmetic: a European macro region would combine an observed German price of $2.0022 with a Czech price of $2.6170, **31% apart**, into a single figure. Region breadth is not chosen to satisfy participant gates.

Country is also the level at which a genuine economic boundary operates. Data-residency and sovereignty obligations, which are among the reasons a buyer cannot freely substitute capacity across geographies, are country-level legal constraints.

**The finest geography a source discloses is always retained**, as the family requires, so that a finer series can be built later without re-collection.

### The region mapping contract

Each provider's native region identifier is mapped to a canonical country through a **versioned mapping that records the native identifier, the provider, the geographic evidence supporting the mapping, the canonical target, a confidence grade, and the effective interval**. Seller labels are never aggregated directly and a mapping is never inferred from the label's spelling alone.

The native shapes this child must accept, each verified during the research, are: a hyperscaler region code with an accompanying location description; a region code paired with a human-readable description naming a state and country; a location string plus an integer country code; a datacenter identifier; and a price-table heading.

**The mapping contract has an explicit refusal case, and it is load-bearing.** Where a source publishes only a supra-national grouping, such as a continental price table heading, **the observation is `REGION_UNRESOLVED` and is not assigned to any country.** It is never allocated to a representative or most-likely country, because that would place a fabricated attribute in the identity of the observation. A grouping that is coarser than the canonical region cannot be refined by Urdais without inventing the refinement.

Where a mapping changes, the change carries an effective interval and applies prospectively; a published historical value never moves because a mapping was later corrected, which follows the family's lineage rule.


## Availability Evidence

**This was the second and most serious launch blocker. The evidence scale and the minimum grade are now resolved.**

The family requires that an eligible observation be accessible rather than merely advertised, grades how availability was established, and leaves the minimum acceptable grade to the child.

### The discriminating test

The first draft framed the problem as granularity and could not find a defensible line, because requiring the strongest grade admitted almost nobody while accepting the weakest admitted the advertised-price object the family rejects.

The research supplies a better line, and it is not about granularity at all.

> **An availability signal is admissible only if the same field, from the same source, can express that the specified product is not obtainable.**

A signal that can only ever say "present" carries no information about accessibility. A stock-keeping unit does not disappear from a price catalog when capacity runs out, and a price page does not blank itself when a product sells out. A per-offer state that is false for most offers, a region list that omits regions without capacity, and an ordinal capacity level whose lowest value is "none" all carry that information. The test is **provider-neutral, reproducible from the source's own schema, and empirically checkable**, because a non-discriminating field can be identified by the fact that it never takes a negative value.

### The evidence grades

Ordered from strongest, drawn from what providers were observed to expose rather than from a hypothetical scale.

- **Grade 1, order-acceptance confirmation**: a programmatic confirmation that an order for the specified configuration would be accepted. **Not obtainable at any researched seller without an account**, and therefore currently theoretical.
- **Grade 2, offer-addressable capacity state**: a per-offer state naming whether that specific offer can be taken now. Verified at one marketplace, where the field was false for the large majority of observed offers.
- **Grade 3, product-and-region capacity assertion**: the seller asserts, for the specified product, the regions or datacenters in which capacity is currently available, or an ordinal capacity level whose lowest value denotes none. Verified in the published specifications of two specialist clouds.
- **Grade 4, catalog or price-interface presence**: the product exists in a machine-readable catalog or price interface with no capacity signal. **Non-discriminating.**
- **Grade 5, price-surface presence**: a price appears on a page. **Non-discriminating.**
- **Grade 6, absent or quote-required**: no price is transactable without negotiation.

### The minimum grade for the headline

**The minimum availability evidence grade for a P2-eligible observation is Grade 3.**

Grade 3 is the weakest grade that passes the discriminating test, and the line falls there for reasons that do not depend on which provider happens to be most transparent. Setting the minimum at Grade 2 would restrict the headline to the single venue that exposes offer-level state, which would make the measure a description of one marketplace rather than of a market. Setting it at Grade 4 would admit exactly the advertised-price object the family rejected as a target, since neither Grade 4 nor Grade 5 can ever report absence.

**This has an uncomfortable and deliberate consequence, stated rather than hidden.** The two best-structured price sources found in the whole research programme, both unauthenticated, both region-resolved, both carrying price effective dates, expose no capacity signal at all. They are Grade 4. **They are therefore not eligible for the headline**, and under the family's taxonomy their observations are advertised non-accessible prices. Source quality did not decide this; the economic object did, exactly as the family's separation of the two requires.

Where a source's availability is conditional on the requested quantity, as one specialist cloud's documented interface is, **the availability answer must be obtained at this child's minimum topology**, because an answer about a different quantity is an answer about a different product.

### Raw signals mapped to the family's availability states

The family's states are Available, Limited, Waitlisted, Sold out, Quote required, and Unknown. This child maps observed source shapes to them as follows, and the mapping is part of the specification rather than an implementation detail.

- An offer-level state reporting that the offer can be taken now maps to **Available** at Grade 2.
- An offer-level state reporting that it cannot maps to **Sold out** at Grade 2, because no capacity is offered through that offer.
- The specified product's region appearing in the seller's list of regions with capacity available maps to **Available** at Grade 3, for that region only.
- The product existing in the seller's catalog while its region is absent from that list maps to **Sold out** at Grade 3, for that region.
- An ordinal capacity level at or above the middle of the seller's scale, obtained at the child's minimum topology, maps to **Available** at Grade 3; the lowest non-zero level maps to **Limited**; a level denoting none maps to **Sold out**.
- Catalog or price-interface presence with no capacity signal maps to **Unknown** at Grade 4.
- A price page alone maps to **Unknown** at Grade 5.
- An explicit queue or waitlist maps to **Waitlisted**; "contact for pricing" maps to **Quote required**.

**Limited is admitted to the headline by this child**, because an ordinal level reported by the seller at the child's own minimum topology is a positive assertion that capacity exists under a stated constraint, which is what the family's Limited state means. The share of eligible observations resting on Limited is published, and a gate on that share is named below.

Availability is **never** inferred from the absence of a sold-out indication, from the existence of a price, or from the fact that a catalog contains the product.


## Seller-Level Reduction

**The experiment the family asked for has now been run for the first time. It did not settle the rule, and the reason it did not is itself a finding.**

The family permits the seller minimum, the seller median, and a canonical selection, adopts the minimum as a provisional default, records a catalogue-breadth bias against it, and asks the first child to compare them on real data.

### The cell, defined exactly

A comparable cell is one capacity source, one canonical region, one instrument, one service tier, one procurement mode, one topology class, and one calculation date. For this child the topology class is the per-accelerator allocation class as a whole, so a seller's one, two and four-accelerator offers of the same product in the same country **are inside one cell**; they are quantity variants within a fixed class, not different products.

### What the experiment found

The first draft could not recover a single comparable multi-price cell. An H100-filtered study of one marketplace recovered **six**.

**The seller median stood above the seller minimum by up to 18.95%, with a mean of 3.71% across the six cells.** The dispersion splits cleanly into two patterns that must not be conflated. Where several offers come from one machine they are quantity partitions priced almost exactly linearly, and minimum and median differ by less than 0.2%. Where offers come from **different machines** they are genuinely distinct capacity, and the within-cell spread reached 27.7% and 60.6%.

**The catalogue-breadth bias the family recorded is confirmed, and its driver in a marketplace is machine count rather than zone count.** The host listing three machines produced a minimum 19% below its own median; the host listing two machines in two different states produced no dispersion at all. Within-cell price dispersion was **not** explained by bundle quality in a consistent direction: in both large-spread cells the cheapest machine carried the most host memory per accelerator, so the minimum was not systematically selecting an inferior bundle, but price was not tracking the bundle either.

### The reduction rule did not move the published statistic, and that proves nothing

Only one country reached the family's two-participant structural floor. There, with three participants, the regional median was **identical under the seller minimum, the seller median, and even a seller maximum**.

**This is coincidence, not robustness, and it is recorded as coincidence.** With three participants the median is the middle participant, and that participant published a single offer, so no reduction rule could have moved the result. The rule moved the extreme participants by up to 19% without touching the outcome. A different participant count, or a multi-offer participant in the middle, would give a different answer.

### A new argument against the minimum, from enumeration

The study established something about the venue's interface that bears directly on the rule. **The interface does not return a complete or stable result set.** It caps responses at 64 records regardless of the requested limit, reports its own truncation flag as false while doing so, returns 22 different records out of 64 when only the ordering changes, and omitted seven genuinely available offers from a query filtered to return exactly those. Per-offer content was perfectly consistent across nine responses, with no disagreement on price or availability state, so this is incompleteness in the interface rather than volatility in the data.

The consequence for the rule is structural, and it is stated exactly rather than loosely. Because a retrieved subset is contained in the complete set, **the minimum over the retrieved subset is weakly greater than or equal to the minimum over the complete set**. The enumeration error is therefore **one-sided**: it can only move the observed participant price up, never down, and its magnitude depends on how much of the set the collector happened to receive. A median over the same partial set carries no such one-sided error and is less sensitive to which subset arrived.

This is a consideration the family did not have when it recorded the minimum as its provisional default. It is not by itself sufficient to overturn it.

### The decision

**The seller minimum is retained as the family default, provisionally and still unratified.** Six cells, at one venue, at one instant, in one country that reached the structural floor, are not grounds for ratifying a family-level rule, and ratifying on them would be the arbitrary precision this programme exists to avoid.

The ratification study must now compare the minimum, the median, and a canonical selection across **several venues and several days**, must include specialist-cloud cells rather than marketplace cells alone, and must **measure enumeration completeness per venue**, because a rule that selects an extremum cannot be evaluated on a source whose population is unknown.

**A venue whose enumeration completeness has not been established carries the diagnostic `ENUMERATION_INCOMPLETE` on every observation derived from it**, and that diagnostic is published. It does not by itself make an observation ineligible, because no source in this market is known to guarantee completeness, but a measure whose participant prices are extrema over partial sets must say so.


## Capacity-Source Attribution

The family makes the capacity source the aggregation participant: the infrastructure operator where reliably determinable, the seller otherwise.

**No researched seller disclosed its infrastructure operator, at any of the thirteen sellers and venues examined across both research passes.** The operator attribution rate is zero, no collapse events were observed, and the undetermined-operator share is 100%. That is a real result rather than a failure of effort: specialist clouds present themselves as the operator, and whether they own, lease, or resell the underlying hardware is not published. The family's prohibition on inferring operator identity from price, geography, or configuration similarity means this cannot be closed by analysis.

The later research added one nuance. One marketplace operates a certified-datacenter programme requiring an active information-security certificate, ownership by a registered business, a signed hosting agreement, and verified owner identity. **The venue therefore knows the identity of its certified operators and does not publish it.** The gap is one of disclosure, not of the market lacking operators, and it is not closable by Urdais.

### Operator attribution is a diagnostic, never a gate

**Seller fallback is the default capacity-source identity for this child, and operator attribution is a published diagnostic rather than a publication gate.**

The family already provides the fallback, and this child now states plainly why it does not additionally adopt a maximum undetermined-operator share. With zero of thirteen sellers attributable, any such gate would be an impossible gate: it would guarantee that no value is ever published, not because the measure is unrepresentative but because the market does not publish a field. **A methodology must not create a publication gate on information the market does not expose.**

The cost of that decision is stated rather than hidden. Where one operator sells through several sellers, this child **cannot detect the duplication**, and the affected capacity would carry more than one participant weight. The child publishes the undetermined-operator share, which is expected to be 100% at launch, and carries a standing limitation that its participant count is a count of sellers and may overstate the number of distinct capacity pools.

Where an operator attribution is later established on evidence, it applies **prospectively** from the date it becomes known, as new knowledge rather than a historical error, exactly as the family requires. Only an attribution that was demonstrably wrong on the evidence available at the time is handled as a correction.

### Marketplace seller identity

A marketplace host identifier is a candidate for the seller-fallback identity, and the research examined it directly rather than assuming it.

The venue documents its host identifier as a host user identifier, states that hosting requires its own separate account, and confirms that one host account may operate several machines. **Within a single session the identifier was stable**: the same eighteen hosts appeared in every unfiltered response, the identifier was constant per machine, and a host-level attribute was constant per host.

Three questions remain open, and they are the ones that matter for a daily series. **Stability over time was not tested.** Whether one commercial seller can hold several host accounts was not established. Whether an identifier survives a change of hardware was not established.

**The identifier may serve as the marketplace seller-fallback key provisionally**, and the child records `MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED` until a repeated-observation study establishes cross-time stability. The reason this blocks marketplace participation rather than merely qualifying it is specific: in a daily series, an identifier that churns is **indistinguishable from participants entering and leaving**, so composition disclosure would report market structure changing when only an identifier changed.

### Marketplace Treatment

The marketplace in the sample publishes a platform-wide median alongside a floor. **That median is an aggregate across many independent host offers and is not one capacity-source observation.** The venue's own host documentation is explicit that hosts sell the resources, that hosts set the pricing on the offers they create, and that "a rental contract is created each time a client accepts your offer by renting an instance". The participant is therefore the host behind an offer, not the venue, and a platform median already aggregates across participants before UCPI has applied any of its own rules.

**The first draft treated that platform median as one participant, which was wrong, and it is corrected.** The observation is removed from the participant population and retained only as market-structure evidence, where it remains genuinely useful: it shows that a venue's floor and its own typical price can differ by 17%, which is part of the empirical case against a cheapest-available target. Reconstructing the individual host offers from the dated snapshot was not possible because they were not retained, and inventing them was not an option.

The correction matters to the numbers. Removing the platform aggregate moves the P0 median from $3.9246 to $3.9492, a change of only 0.63%, but it collapses the reported spread from 3.05 times to **1.93 times** and the interquartile range from $0.41 to **$0.14**. The platform aggregate was carrying most of the apparent dispersion.

Marketplace listings are not excluded in principle. They enter once individual host offers can be mapped to capacity-source identities, which is a data-resolution requirement rather than a gap in the family's rules.

## Price, Unit, and Currency

The normalized unit is **United States dollars per H100 SXM accelerator-hour**, meaning the mandatory cost of one full dedicated accelerator for one hour under this child's specification.

**Every qualifying price observed was denominated in USD.** No non-USD qualifying observation was found, so no conversion arises in the current sample. The child nevertheless states the family requirement: native price and currency are always retained, and any future non-USD observation is converted under an approved rate convention which remains unresolved because no observation yet requires one.

Billing granularity varied and converts cleanly within the product: sellers billed per hour, per minute, and per second. Per-second and per-minute billing are unit changes, not product changes, and are admitted.

Where a source publishes a price for an instance rather than for an accelerator, the per-accelerator figure is obtained by dividing by the instance's stated accelerator count. That is a unit conversion **inside the declared topology class** and is permitted only there; it is never used to bring a whole-node product into this child.

### Mandatory fees and what enters the price

The family separates usage-proportional mandatory charges, which enter the hourly figure, from fixed or one-time mandatory charges, which are never silently amortized, and excludes charges depending on how the buyer uses the product.

The research verified this against a real source composition. At the one venue publishing a decomposed price, the advertised hourly total equalled the base rate plus the cost of the included storage allocation **exactly, with a maximum absolute deviation of zero across all 116 observed offers**, while network transfer was priced separately per gigabyte.

The rules that follow are deterministic:

- The **included storage allocation** that a seller bundles into its hourly rate is a usage-proportional mandatory charge and is **inside** the normalized price.
- **Network transfer priced per unit of data** depends on how the buyer uses the product and is **outside** the price, retained as a diagnostic.
- An **interruptible or bid price** published alongside the on-demand rate is a different procurement mode and is never the observation.
- **Promotional fields**, including a discount rate, a discounted total, or a maximum credit discount, are recorded and counted as a diagnostic. The ordinary commercial rate is the observation, and a discounted figure is never used.

**No one-time activation or setup charge was found on any qualifying offer at any researched seller**, so the family's amortization prohibition did not bind. That is a finding about this class rather than a general one, and the ingestion contract still captures fixed charges and any minimum spend so that the rule can be applied if one appears.

### Tax basis

The family requires prices exclusive of transaction taxes and requires that an observation whose basis cannot be established be flagged with its share published. The research found one seller stating explicitly that prices exclude sales tax, value-added tax and goods-and-services tax, and most sellers stating nothing.

The child adopts **evidence by general terms**, and the rule has three branches.

- A source's tax basis may be established from the seller's **general billing or terms documentation**, not only from the price surface. A basis established that way is as good as one printed beside the price.
- Where the basis is positively established as **inclusive of transaction tax**, the observation is **ineligible** with reason `TAX_BASIS_INCLUSIVE`. It is never adjusted to an exclusive figure, because that would require inventing a jurisdiction and a rate.
- Where the basis cannot be established from either source, the observation is flagged `TAX_BASIS_UNRESOLVED` and **remains P2 eligible**, with the unresolved share published and subject to a publication gate whose numerical value is unresolved.

**Silence is not treated as evidence of a pre-tax basis.** The unresolved flag says exactly that the basis is unknown. Disqualifying on silence was rejected because it would exclude most of the market on a documentation convention rather than an economic difference, and because transaction taxes in this market are generally jurisdiction-specific and applied at billing rather than embedded in a published rate. The risk that an unresolved observation is in fact tax-inclusive is real, is not removable by analysis, and is what the published share and the gate exist to bound.


## Temporal Rules, Freshness, and Carry

The family proposes daily calculation, distinguishes the observation, effective, cutoff and publication times, and separates price freshness, availability freshness and reference-data freshness as three dimensions a child may govern differently.

**The architecture is now resolved. The numerical ages are not.**

### Source-effective time and observed time are never substituted for one another

Two times are recorded on every observation and they answer different questions. The **source-effective time** is when the source itself says the price took effect. The **observed time** is when Urdais retrieved it.

The research measured how rare the first is. Only two sources in thirteen expose anything of the kind: one hyperscaler price interface carries a per-meter effective date, and one bulk price catalog carries a whole-catalog publication timestamp and a dated version path. **Every specialist cloud in the child's confirmed candidate set exposes none.**

**Where a source states no effective time, the observation records the source-effective time as absent.** It is never defaulted to the retrieval time. A collection timestamp is evidence of when Urdais looked, and carries no information about when the seller last changed the price; substituting one for the other would manufacture a precision the source does not provide and would make an unchanged page indistinguishable from a freshly confirmed one.

### Availability freshness rests on re-observation, and says so

**No researched seller exposes an availability-change timestamp.** The last remaining candidate was eliminated by this research: the marketplace date fields on an offer are the offer's own expiry, documented as the date until which the offer accepts new rentals, which is a forward-looking limit rather than a record of when availability changed.

The child therefore defines:

> **`availability_observed_at` is the time at which Urdais last directly re-observed the availability evidence. It is not, and is never presented as, the time at which availability changed.**

**This is methodologically acceptable, and the reason is specific rather than a concession.** The family's Reconfirmed state already requires that every eligibility-relevant field, availability included, be re-established at each collection cycle rather than inferred from a timestamp. Availability is therefore established by direct observation in the first place, and the observation time is the correct age to attach to it. The semantics are recorded explicitly on the observation so that no downstream user can read it as a seller event time.

### What the evidence does and does not bound

One genuine measurement of price dynamics was obtained without a repeated study, because a source that publishes the effective date of its current price reveals how long that price has stood. Across 138 H100 meters at one hyperscaler, **every currently effective price had been in force for at least 196 days, the median for 955 days, and every effective date fell on the first of a month**.

Against that, the marketplace's per-offer prices and availability states move continuously. **The two dimensions differ by orders of magnitude, which vindicates the family's decision to govern them separately.**

It does **not** yield a numerical limit for this child. The measurement covers one source class that is not headline-eligible on availability, the specialist clouds that form the child's confirmed candidates publish no effective dates at all, and availability cadence was observed at a single instant.

`price_max_age`, `availability_max_age` and `reference_data_max_age` therefore remain **unresolved**. No value is proposed, because any value proposed now would be invented.

One **ordering constraint** is supported by the evidence and is adopted, because it constrains the eventual choice without inventing a number:

> **`availability_max_age` must not exceed `price_max_age`.**

Availability was shown to be the only dimension that is offer-addressable and can change without any accompanying price change, while published prices at the most timestamped source move on month boundaries. A parameter set permitting availability evidence to age longer than price evidence would contradict the family's rule that a recent price paired with stale availability is not a current accessible offer.

### Carry, per dimension

- **Reference data**, meaning hardware identity, product definitions, region mappings and bundle definitions, may be carried while its version and effective interval remain valid, as the family permits.
- **Price** may be carried within `price_max_age`, which is unresolved. A carried price is never presented as current, its age is recorded, and the carried share is published.
- **An Available state is not carried.** Where the availability evidence was not re-observed in a cycle, the observation does not enter the headline, regardless of how recent its price is.

The availability rule is the conservative branch of a choice the family leaves open, and it is proposed rather than asserted as the only possibility. Its justification is that carrying an accessibility claim through a cycle in which accessibility was not observed asserts something for which there is no evidence, and the family's own carry rule already refuses a fresh price paired with stale availability. Its operational cost is real and is stated: a single collection failure removes the affected participants from that day's coverage, and a region below its participant gate produces no value rather than a value resting on yesterday's accessibility. **Whether a short bounded availability carry is defensible instead requires the cadence study**, and until that study exists the child does not assume one.

Whether weekends should produce observations is likewise unresolved and depends on the same study.


## Regional Aggregation and Dispersion

The family's regional median applies unchanged, including the even-`N` convention.

This child fixes an **exact quantile convention**, because "linear interpolation" alone is implementation-dependent and two implementations could publish different percentiles from identical inputs. For `N` observations sorted ascending as `x_1 … x_N` and a quantile `q` in `[0, 1]`, let

`h = (N − 1) q`, `f = floor(h)`

and the quantile is

`Q(q) = x_(f+1) + (h − f) × (x_(f+2) − x_(f+1))`

taking `Q(q) = x_N` when `f + 1 = N`. This is the Hyndman and Fan type 7 definition, equivalently the conventional linear interpolation used by common numerical libraries. It is computed over the same final participant population that produces the median, on unrounded normalized prices. The convention is fixed now and is not to be changed to alter a published number.

## Publication Gates

**Four gates the family requires are now closed structurally, because the eligibility rules already exclude every observation that would fail them. Four remain open numerically.**

That distinction matters for the backend: a structurally closed gate is an invariant the calculation can assert, not a threshold it must carry a parameter for.

### Closed by construction

- **Maximum Unknown-availability share: zero.** The availability minimum is Grade 3, and every Unknown observation is Grade 4 or weaker, so no Unknown observation reaches P2.
- **Maximum unresolved-tenancy share: zero.** Only Explicit and Documented grades are P2 eligible.
- **Maximum topology-unknown share: zero.** An observation whose minimum purchasable topology is not established is `MINIMUM_TOPOLOGY_UNKNOWN` and is not P2 eligible.
- **Maximum out-of-envelope bundle share: zero**, once the envelope level exists, because an offer outside the envelope is ineligible rather than adjusted under the family's rule.

### Structural, from the family, and unchanged

A region with no eligible participant has no value. **A region with exactly one has no market price.** The research gives no reason to weaken that and several to respect it: at country level, five of the six regions observed on the one venue exposing availability had exactly one participant.

### Open, and numerical

- **Minimum final participant count above the structural floor.** Unresolved. The only measurement available is that leaving one participant out of a nine-observation research population moves the median by at most 0.62%, which measures the robustness of a nine-observation median and says nothing about a threshold. **Regional participant counts do not yet exist**, because no production collection has run; the single region that reached the structural floor in the marketplace experiment had three participants, which is one region on one venue at one instant. Setting a number now would be choosing it for the reason the family forbids.
- **Maximum share resting on the weakest admitted availability grade.** Unresolved. Now well defined, because the grade scale exists: it is the share of eligible observations at Grade 3 rather than Grade 2, together with the share whose state is Limited rather than Available.
- **Maximum carried share.** Unresolved, and now narrower in scope: since an Available state is not carried, this is a price-carry share only.
- **Maximum `TAX_BASIS_UNRESOLVED` share.** Unresolved, and required, because this is the gate that bounds the risk accepted by not disqualifying on an unestablished basis.

**Operator attribution is not a gate**, for the reason given in [Capacity-Source Attribution](#docs-capacity-source-attribution). Its share is published as a diagnostic.

**No numerical value is chosen for any open gate**, and none may be chosen from a sample assembled to test the methodology. Each requires regional participant counts and grade compositions from repeated production collection.


## Composition Changes

The family requires composition disclosure. This research shows it will matter here: participant sets are small, and the hardware-identity rule alone moves the identity-qualified median by 6.2% depending on which grades are admitted.

### What counts as a composition change

Six events, each recorded on the observation with the date it took effect:

- a capacity source **entered** the eligible population;
- a capacity source **left** it, including by its source becoming unavailable;
- two or more sellers **collapsed** into one capacity source on a newly evidenced operator attribution, or a previous collapse was undone;
- a **marketplace seller identifier changed** for a participant that is otherwise continuing;
- a **region mapping version changed**, moving observations between canonical regions;
- the **child specification version changed**.

### How percentage change is treated

The family makes percentage change the headline change signal. This child fixes when it is published, annotated, or withheld, and the rule is deterministic.

**Published** where the immediately preceding observation for the same child and region has status Published, and none of the six events above occurred between the two dates.

**Published with a composition annotation** where a capacity source entered or left, or where a collapse changed the participant set. The level and the change are still published, with the change marked as reflecting a composition move as well as a price move. **A composition-driven move is never presented as a market-price move.**

**Withheld** in three cases, each because no meaningful percentage change exists rather than as a matter of caution:

- the prior observation was **Delayed or Unavailable**, so there is no prior published level to compare against;
- the **child specification version changed** between the two dates, so the two levels were computed under different rules and their difference is not a price change;
- the **region mapping version changed** in a way that moved observations into or out of this region, so the two levels describe different populations.

A marketplace seller identifier changing for an otherwise continuing participant is annotated rather than withheld, and is flagged separately from a genuine entry or exit, because until identifier stability is established the two are not reliably distinguishable and the disclosure must say which one Urdais actually observed.


## Source Observability and Eligibility

The research raised a question the first draft did not pose, because it only arises once the data is known to exist somewhere: **can a seller be included when Urdais cannot obtain the fields that establish its eligibility?**

Three populations are distinguished, and conflating any two of them would misdescribe the market.

- The **economic universe** is every seller that commercially offers the child-specified product. Membership depends on what the seller sells, and on nothing else.
- The **source-observable universe** is the subset for which Urdais has a permitted and reproducible collection path that yields the fields P2 requires.
- The **P2 calculation population** is the subset of those whose current observation satisfies every parent and child rule on the calculation date.

**Access is never an economic attribute.** A seller that does not publish a machine-readable interface, or whose interface requires a key Urdais does not hold, has not stopped being part of the market. It has stopped being observable by Urdais, which is a statement about Urdais.

A seller in the economic universe but outside the source-observable universe is excluded with reason `SOURCE_INSUFFICIENT`, and **the count of such sellers is published as an observability-gap diagnostic** alongside every observation. That diagnostic exists so that a user can distinguish a measure covering most of a market from one covering the part of a market that happens to publish an API, and so that the child cannot quietly claim completeness it does not have.

This is not a hypothetical distinction. **Three of the richest sources found require provider API keys**, and without them availability cannot be evidenced at all for much of the specialist-cloud segment that forms this child's confirmed candidate set. The practical consequence is recorded in [Launch Blockers](#docs-launch-blockers) as an operational prerequisite rather than a methodological one.

**Source access class is recorded as source-registry metadata, not as an eligibility attribute.** The classes observed are: public unauthenticated; authenticated API; authenticated console only; documentation only; and sales only. They describe how a source is reached and they bear on operational feasibility and on licensing, never on whether an offer is economically eligible. The one place access touches eligibility is indirect and already covered: if the required fields cannot be obtained, the observation fails on the missing field, under that field's own rule.

## Stage Criteria: P0, P1, and P2

The three evidence populations are defined above. This section states the criteria mechanically, so that a future ingestion system can evaluate them without interpretation. Every failure names an exclusion reason from the vocabulary below.

### P0, identity qualification

An observation is P0 when the accelerator's identity is established: vendor NVIDIA, architecture Hopper, model H100, **form factor SXM**, device memory 80GB, and a full physical device rather than a partition, each under the graded evidence rule in [Hardware Identity](#docs-hardware-identity).

Fields required: the seller's product designation, the stated form factor or an official designation that maps to it, the stated device memory, and the identity evidence grade.

Failures: `WRONG_HARDWARE` where the accelerator is a different model or generation; `HARDWARE_VARIANT_UNRESOLVED` where the form factor cannot be established, including a bare model name with no form factor and any label that does not distinguish SXM from an NVL-based system; `FRACTIONAL_OR_SHARED_DEVICE` where the offer is a sub-device partition.

### P1, selected-product eligibility

A P0 observation is P1 when it additionally satisfies the child's resolved product requirements.

Fields required: the service product; the procurement mode and preemptibility; the minimum purchasable accelerator count; and the tenancy evidence grade.

Criteria: the product is a **persistent full-device rental**, not serverless execution, a managed inference endpoint, or another service product; the procurement mode is **on-demand and non-preemptible**, and the price is not a promotional, trial or subsidized rate; the **minimum purchasable topology is established from a source field** and the offer falls in the per-accelerator allocation class; and the tenancy grade is **Explicit or Documented**.

Failures: `WRONG_SERVICE_PRODUCT`; `WRONG_PROCUREMENT_MODE`; `PREEMPTIBLE`; `PROMOTIONAL_PRICE`; `MINIMUM_TOPOLOGY_UNKNOWN`; `WHOLE_NODE_REQUIRED`; `TENANCY_UNRESOLVED`.

### P2, headline eligibility

A P1 observation is P2 when it additionally satisfies every remaining parent and child requirement on the calculation date.

Fields required: the canonical region; the availability state with its evidence grade and observation time; the price with its currency, billing unit and source-effective time where stated; the mandatory fee components; the tax basis; the host bundle; the capacity-source identity with its attribution basis; and the source grade and observation type.

Criteria: the native region **maps to a canonical country** under a current versioned mapping; the availability state is **Available, or Limited**, established at **Grade 3 or stronger**, and at this child's minimum topology where the source's answer is quantity-conditional; the price and availability evidence are **within their permitted ages**, with availability re-observed this cycle; the normalized price is built from mandatory components only; the tax basis is **not established as inclusive**; the bundle satisfies the envelope once its level exists; the observation resolves to exactly one capacity source; and the observation type is a **current accessible offer**.

Failures: `REGION_UNRESOLVED`; `AVAILABILITY_UNKNOWN`; `UNAVAILABLE`; `WAITLISTED`; `QUOTE_REQUIRED`; `AVAILABILITY_EVIDENCE_INSUFFICIENT`; `PRICE_STALE`; `AVAILABILITY_STALE`; `BUNDLE_OUT_OF_ENVELOPE`; `TAX_BASIS_INCLUSIVE`; `SOURCE_INSUFFICIENT`; `SOURCE_CONFLICT`.

**P2 is currently empty**, which is what launch blocked means.

## Exclusion, Status, and Diagnostic Vocabulary

Three kinds of label are kept separate, because collapsing them is how a benchmark loses the ability to explain itself. An **exclusion reason** says why an observation did not enter a population. A **status** describes the observation or the published value. A **diagnostic** records a quality or coverage property of something that was not excluded.

### Exclusion reasons

Identity: `WRONG_HARDWARE`, `HARDWARE_VARIANT_UNRESOLVED`, `FRACTIONAL_OR_SHARED_DEVICE`.

Product and commercial form: `WRONG_SERVICE_PRODUCT`, `WRONG_PROCUREMENT_MODE`, `PREEMPTIBLE`, `PROMOTIONAL_PRICE`, `MINIMUM_TOPOLOGY_UNKNOWN`, `WHOLE_NODE_REQUIRED`, `TENANCY_UNRESOLVED`.

Region: `REGION_UNRESOLVED`.

Availability: `AVAILABILITY_UNKNOWN`, `UNAVAILABLE`, `WAITLISTED`, `QUOTE_REQUIRED`, `AVAILABILITY_EVIDENCE_INSUFFICIENT`.

Freshness: `PRICE_STALE`, `AVAILABILITY_STALE`.

Price integrity: `BUNDLE_OUT_OF_ENVELOPE`, `TAX_BASIS_INCLUSIVE`, `UNIT_UNRESOLVED`, `CURRENCY_RATE_UNAVAILABLE`.

Source: `SOURCE_INSUFFICIENT`, `SOURCE_UNRETRIEVABLE`, `SOURCE_CONFLICT`, `COLLECTION_NOT_PERMITTED`.

### Statuses

Observation and published-value statuses are inherited from the family unchanged: **Published**, **Delayed**, **Unavailable**, **Corrected**, **Superseded** for a published date; and **Valid**, **Stale**, **Ineligible**, **Unavailable**, **Conflicted** for an input.

### Diagnostics

`TAX_BASIS_UNRESOLVED`, on an observation that remains eligible. `OPERATOR_UNDETERMINED`, expected on every observation at launch. `ENUMERATION_INCOMPLETE`, on any observation from a venue whose population cannot be fully enumerated. `MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED`, on any marketplace observation until a cross-time study closes it. `AVAILABILITY_GRADE_3`, distinguishing a region-level capacity assertion from an offer-level state. `SOURCE_EFFECTIVE_TIME_ABSENT`, where the source states no effective time. `PRICE_CARRIED`, with the carry age.

A diagnostic never silently removes an observation. Where a diagnostic's share is gated, the gate is named in [Publication Gates](#docs-publication-gates) and failing it produces a Delayed or Unavailable value with the failing gate named, never a value computed from the residual set.

## Ingestion Field Contract

This is the conceptual field contract a future ingestion system must satisfy. **It is not a schema, and no database table, type, or migration is defined here.** Its purpose is to state, before any backend exists, which facts must be stored so that the rules above can be evaluated and so that the unresolved parameters can later be measured without redesigning the system.

Each field carries one classification. **Required raw** must be produced by collection. **Required derived** is calculated during normalization from raw fields and its inputs are retained. **Optional diagnostic** is useful and never determines eligibility. **Nullable by methodology** may be absent with no consequence. **Nullable but blocks P2** may be absent in raw data, and P2 cannot proceed while it is.

**Identity and provenance.** Source identity, required raw. Source class and access class, required raw. Provider identity, required raw. Seller identity, required raw. Marketplace identity, nullable by methodology. Operator identity, **nullable by methodology**, with its attribution basis and evidence; its absence is a diagnostic and never blocks P2. Provider offer identifier, required raw. Provider product or stock-keeping-unit identifier, required raw. Raw source reference sufficient to re-examine the source, required raw.

**Time.** Collection timestamp, required raw. Source-effective timestamp, **nullable by methodology**, never defaulted to the collection timestamp. Availability observation timestamp, **required derived**, defined as the time the availability evidence was re-observed. Calculation date, required derived.

**Price.** Native price, required raw. Native currency, required raw. Billing unit and granularity, required raw. Normalized price in index currency per accelerator-hour, required derived. Mandatory fee components itemized, required raw where the source decomposes them and nullable otherwise. Usage-dependent charges, optional diagnostic. Minimum spend or commitment, nullable by methodology. Promotional indicators, optional diagnostic. Tax basis, **nullable but flagged**; an established inclusive basis blocks P2 while an unestablished basis does not.

**Hardware.** Accelerator vendor, model and architecture, required raw. Form factor, **nullable but blocks P2**. Device memory, **nullable but blocks P2**. Identity evidence grade, required derived. Accelerator count in the offer, required raw.

**Topology.** Minimum purchasable accelerator count, **nullable but blocks P2**. Machine or node accelerator total, optional diagnostic. Whole-node requirement flag, required derived. Machine-occupancy fraction where a source exposes one, optional diagnostic, **never read as a device fraction**.

**Geography.** Native region identifier, **nullable but blocks P2**. Finest disclosed geography, nullable by methodology and always retained where present. Canonical region, required derived. Region mapping version and confidence, required derived.

**Availability.** Raw availability signal as the source expressed it, **nullable but blocks P2**. Canonical availability state, required derived. Availability evidence grade, required derived. Quantity at which availability was established, required derived where the source's answer is quantity-conditional.

**Commercial form.** Procurement mode, **nullable but blocks P2**. Preemptibility, **nullable but blocks P2**. Price formation, optional diagnostic. Service product, **nullable but blocks P2**. Tenancy evidence and its grade, **nullable but blocks P2**.

**Bundle.** Virtual CPU allocation, host memory, local storage, and intra-node and inter-node interconnect, each per accelerator: **nullable but blocks P2 once the envelope level exists**, and optional diagnostic until then.

**Derived participant records.** Seller-level representative price with the reduction rule applied and the eligible offer set considered, required derived. Capacity-source identity with attribution status, contributing seller observations, and the collapse rule applied, required derived. Input status and exclusion reason, required derived.

**Two methodology requirements still have no reliable observable counterpart, and the contract represents both as absences rather than inventing values.** A seller-stated availability-change time exists nowhere and is not a field. A source-effective price time exists at two sources in thirteen and is nullable.

## Lineage Requirements

The family requires that every published value be traceable. This child states what must be retained for an H100 observation to be reproduced later, given that the sources are not archival and expose no price history.

The chain to be reconstructible is: the published value, to the calculation run, to the final capacity-source observations, to the seller-level observations, to the normalized offers, to the raw offers, to the source retrieval, to the retained source evidence.

For any historical date it must be answerable which hardware identity rule and evidence grade applied to each observation; **which region mapping version was in force, with the evidence and confidence for the specific native identifier**; which availability evidence grade and raw signal supported each observation, and at what quantity the availability answer was obtained; how minimum topology was established and from which field; which tenancy evidence established exclusivity; which seller-reduction rule was applied and over exactly which eligible offer set, **including whether that set was known to be complete**; how sellers resolved into capacity sources and under which attribution basis; which mandatory components entered the price and which charges were excluded; what the tax basis was and how it was established; and which family and child versions and parameter set governed the result.

Three retention requirements follow specifically from this research. **The eligible offer set behind every seller-level reduction is retained**, not only the selected price, because a reduction rule cannot be re-evaluated against alternatives otherwise and the ratification study depends on it. **The enumeration-completeness status of the source is retained** with each such set. **The raw availability signal is retained in the source's own vocabulary** alongside the canonical state, because a future change to the mapping must not be able to rewrite what the seller actually said.

A historical value never changes because a mapping, a taxonomy, or a parameter changed later. Any series computed for dates before first live publication is labelled reconstructed research history, and this research suggests such a reconstruction is **not feasible** for this child: price surfaces are not archival, and the one archival structure found is a dated catalog at a source that is not headline-eligible on availability.

## Source Classes

The classes a future ingestion system must model, drawn from what was actually observed rather than from a general taxonomy. This is conceptual; no registry is implemented here.

- **Offer interface**: returns individual offers with per-offer price, quantity, location and availability state. Preferred for availability, multi-offer structure and marketplace seller identity.
- **Catalog and price interface**: returns products with prices, often region-resolved, sometimes with effective dates. Preferred for price, currency, billing unit and region. Cannot evidence availability.
- **Availability interface**: returns capacity by region or datacenter, sometimes conditional on quantity. Preferred for availability at Grade 3.
- **Product reference documentation**: establishes bundle composition, topology and stock-keeping-unit definitions. Preferred for minimum topology where no field exists.
- **Hardware reference documentation**: establishes accelerator identity independently of any seller's naming. Preferred for identity, and the only admissible basis for it.
- **Provider terms and billing documentation**: establishes tax basis, mandatory fees and tenancy statements. Preferred for those three.
- **Price surface**: a published page. For this child, **discovery and corroboration only**, since it cannot meet the availability minimum.

Each methodology requirement has a preferred class, and an observation records which class supplied each field so that the source-quality distribution the family requires can be computed.

## Whole-Node Sibling

The research established that the two best-structured, unauthenticated, region-resolved price sources in this market publish H100 capacity as **whole eight-accelerator instances**, one of them across 24 regions with per-meter effective dates, the other across a 106-region dated catalog. A third seller publishes a whole-node price with the accelerator count stated.

**A separate whole-node child would be well supported by data that this per-accelerator child cannot use.** Dividing a node price by eight is arithmetic, not comparability, and the family prohibits crossing a topology class.

**Researching a whole-node sibling is recommended as future work. It is not created here**, and no part of this child is widened to absorb those sources. Naming it now matters only so that the decision is recorded as deliberate: the hyperscaler segment is excluded from this child because it sells a different product, not because it was overlooked.

## Published Surface

The future published surface, with no values:

UCPI-H100-SXM, for a canonical country region: price in United States dollars per H100 SXM accelerator-hour; one-day percentage change, annotated or withheld under the rule in [Composition Changes](#docs-composition-changes); procurement mode on-demand; topology per-accelerator allocation; service tier as specified; the capacity-source participant count; the availability evidence-grade composition and the Available-versus-Limited split; the observability-gap count of economically present but unobservable sellers; the undetermined-operator share; the price distribution; the carried price share; the unresolved-tax-basis share; the enumeration-completeness status of contributing sources; the as-of date; the status; and the family and child versions with the parameter set.


## Research Market Snapshot

> **Research snapshot only. These observations were collected on 12 September 2026 to validate the methodology. They are not published UCPI values, not a UCPI history, and not a provider list. No seller named here is proposed for inclusion in a production series.**

Eleven sellers and venues were examined. One publishes no price and is ineligible as quote-required. One is a marketplace whose platform-level median is an aggregate rather than an observation. **Nine individual sellers produced identity-qualified observations, forming P0.**

### P0, identity-qualified seller observations

Nine observations, in dollars per accelerator-hour: $3.20, $3.49, $3.85, $3.90, $3.9492, $3.99, $3.99, $4.41 and $6.16. Median **$3.9492**, interquartile range **$0.14**, tenth percentile $3.43, ninetieth percentile $4.76, spread **1.93 times**.

> **P0 identity-qualified research-universe statistics. This is not the selected child's price distribution.** P0 deliberately contains observations that fail the child's topology and service-product requirements.

Leave-one-out over P0 moves the median by at most **0.62%**. That measures only the robustness of a nine-observation median to removing one row. It does **not** justify any participant threshold, does not demonstrate regional robustness, and does not account for the marketplace aggregation problem.

**Correction to the first draft.** The first draft reported ten observations spanning $2.02 to $6.16 with a median of $3.9246, an interquartile range of $0.41 and a spread of 3.05 times. That population wrongly included the marketplace platform median as a tenth participant. Removing it changes the median by only 0.63%, to $3.9492, but collapses the spread to 1.93 times and the interquartile range to $0.14. **The platform aggregate was carrying most of the apparent dispersion**, so the first draft overstated how widely this market's advertised prices vary.

### P1, selected-product advertised-rental candidates

Applying minimum purchasable topology and service-product classification to P0:

**Confirmed eligible, three sellers**: one pricing per accelerator with host resources stated per GPU at $3.20; one per-accelerator listing with per-GPU host resources at $3.49; one stating virtual CPU and memory per GPU-hour at $3.85.

**Unresolved, four sellers**: one whose displayed per-GPU rate carries eight-node-scale host resources beside a size selector the rendered page does not expose, at $3.99; one labelled HGX with no accelerator count, at $3.90; one cluster product whose minimum is not stated, at $3.99; and one whose accelerator-count field is present but carries no readable value, at $4.41.

**Excluded on verified grounds, two sellers**: a whole-node-only product at a stated accelerator count of eight, whose $6.16 is a derived per-accelerator figure from a $49.24 node price, excluded because per-GPU arithmetic does not override topology comparability; and a serverless product at $3.9492, whose own pricing page states that the buyer "never pay[s] for idle resources, just actual compute time", excluded because autoscaled execution is not a persistent full-device rental even though its per-second rate converts arithmetically to an hourly one.

**No distribution statistics are reported for P1.** With three confirmed members, a median, an interquartile range and percentiles would convey precision the sample does not contain. The three confirmed prices are $3.20, $3.49 and $3.85.

### P2, final UCPI-eligible population

**Empty.** Region, availability evidence, minimum topology for four sellers, freshness, operator attribution and every numerical gate remain unresolved. No observation satisfies all parent and child requirements, which is what launch blocked means.

### Identity-rule sensitivity, recomputed

On P0, admitting only explicit SXM designations gives four observations with a median of $3.7196; admitting the HGX mapping as well gives nine with a median of $3.9492, a difference of **6.2%**.

**The first draft reported 12.5% for this sensitivity.** That figure was computed on the ten-row population containing the marketplace aggregate and is superseded. The identity rule still materially affects both the level and the coverage, by rather less than first reported.

### Exclusions that exercise family rules

A seller publishing "contact for pricing" across every tier, ineligible as quote-required. A bare "H100" at $2.50 and an "H100 NVLink" at $2.60 from a seller that separately lists H100 SXM at $3.20, both `HARDWARE_VARIANT_UNRESOLVED`. A promotional instance rate with a stated expiry, excluded as promotional while the seller's ordinary rate was used. And a managed inference endpoint at $5.50 for the same hardware the seller rents at $3.90, excluded as a different service product. That last pair is instructive: without the family's product definition they would be two observations of one thing.

## Findings for the Parent Methodology

The family methodology was not modified by this work. **No parent amendment is currently required.** The first draft requested two, and re-reading the parent shows that neither is a gap in its rules.

**Marketplace participant identity: amendment withdrawn.** The first draft claimed the family does not say whether a marketplace contributes one participant or many. It does. The family already defines a marketplace as a venue rather than a participant, and defines the capacity source as the operator where determinable and the seller otherwise. A venue is neither. The real problem is narrower and is a **data-resolution requirement**: individual host offers must be mapped to seller or operator identities before marketplace listings can participate. That is work, not ambiguity, and the request for an amendment is withdrawn.

**Executability: no amendment yet.** The current result is that public marketing price surfaces are inadequate for availability verification, which is a finding about sources rather than about the family's economic object. The required next step is the ordering-interface study. Only if that study shows accessible status is structurally unrecoverable across a representative market should the family reconsider what it publishes for this asset class. Weakening the parent now, on the strength of price pages alone, would be premature.

A broad advertised-price H100 series may well be useful in its own right. It would be a **different output measuring a different economic object**, and its usefulness would not justify quietly redefining UCPI. It is not designed here.

**Re-tested after the source and parameter-closure studies: still no parent amendment required.** Every decision in this amendment was expressible within the family methodology as written, and in several places the parent's existing rules decided the answer rather than merely permitting it. The separation of source quality from observation type is what made it possible to exclude the two best-structured price sources from the headline without calling them poor sources. The availability state vocabulary absorbed every observed source shape. The three freshness dimensions were vindicated by a measured difference of orders of magnitude between price and availability dynamics. The capacity-source definition with seller fallback is what makes a market with zero operator disclosure measurable at all. The structural floor and the prohibition on choosing region breadth to satisfy gates together settled the region taxonomy against the child's own interest in coverage.

**One observation is offered without requesting an amendment.** The family's seller-reduction discussion assumes the set of eligible offers within a cell is known. This research found a venue where it demonstrably is not: the interface caps its own responses, misreports truncation, and returns different subsets for different orderings. The child handles this with a source diagnostic and by retaining the eligible offer set behind every reduction. If incomplete enumeration proves common across venues rather than particular to one, the family may wish to address estimator bias under partial enumeration directly at its next amendment. **That is a suggestion for future family work, not a defect requiring one now**, and no parent rule was worked around to accommodate it.

**Executability: the amendment the first draft contemplated is not needed.** That draft warned that if availability proved structurally unrecoverable, the family would have to decide whether it publishes advertised prices or nothing. The research resolved the question in the family's favour: availability is recoverable, in discriminating machine-readable form, at several sellers. The binding constraint is access, which is operational, not the economic object, which is intact.

## Decision Matrix

Each entry records the evidence, the decision, confidence, and two separate questions: whether it blocks **merging this draft** and whether it blocks **launching the child**. Those are different, and the first draft's single blocker column conflated them. Nothing below blocks merging.

- **Hardware identity.** Evidence: NVIDIA specifies H100 SXM at 80GB with HGX and DGX server platforms, distinct from NVL at 94GB on partner systems. Decision: resolved. Confidence: high. Launch blocker: no.
- **Grade B, HGX designation.** Evidence: NVIDIA reference architecture documentation states eight H100 SXM GPUs sit on an H100 baseboard, mapping HGX H100 to SXM directly rather than by inference. Decision: resolved, an official HGX H100 designation qualifies. Confidence: high. Launch blocker: no. Sensitivity: admitting Grade B moves the P0 median 6.2% and doubles coverage.
- **Machine-readable identity.** Evidence: one specialist cloud's published specification exposes a product description naming SXM5 and 80GB directly. Decision: the strongest identity grade is satisfiable from a machine-readable field, not only from prose. Confidence: high. Launch blocker: no.
- **Topology class and the minimum-topology rule.** Evidence: minimum purchasable quantity is recoverable from a source field at most sellers, through a marketplace's per-machine minimum, an instance type's accelerator count, an explicit minimum-pod field, or a stock-keeping-unit definition. Decision: resolved as a rule; the count must come from a field and never from the quoted denominator. Confidence: high. Launch blocker: **no as a rule**, yes for any seller where no such field is obtained.
- **Machine fraction versus device fraction.** Evidence: an offer's accelerator count divided by the machine-occupancy fraction reproduced the machine total exactly for 35 of 35 machines, with uniform 80GB device memory throughout. Decision: resolved, a machine fraction is never read as a fractional device. Confidence: high. Launch blocker: no.
- **Service product.** Evidence: a serverless product bills only for active compute and a managed inference endpoint prices the same hardware 41% above the seller's own rental. Decision: resolved, full-device rental only. Confidence: high. Launch blocker: no.
- **Procurement mode.** Evidence: on-demand present across every price-publishing seller; the marketplace exposes an explicit bid flag distinguishing interruptible offers. Decision: resolved, on-demand non-preemptible, and directly observable at the venue tested. Confidence: high. Launch blocker: no.
- **Tenancy.** Evidence: the marketplace's official Concepts documentation defines an instance as an isolated environment "with exclusive access to the GPUs you rented"; no other primary source from that venue contradicts it, and its documentation set contains no partitioned or time-shared accelerator concept. Decision: resolved as a rule, Explicit and Documented grades only; **that venue grades Documented and satisfies the requirement**, correcting an earlier Ambiguous classification that rested on the wrong page. Confidence: high. Launch blocker: **no**.
- **Region taxonomy.** Evidence: 7.8% of marketplace offers carry a genuine subnational identifier; the venue's documented location filter is a country code; country is derivable at every other region-exposing source; a macro taxonomy would take publishable regions from one to three while merging prices 31% apart. Decision: **resolved, country by ISO 3166-1 alpha-2**. Confidence: high. Launch blocker: **no**.
- **Region mapping.** Evidence: five distinct native shapes observed, one of which publishes only a continental grouping. Decision: resolved, a versioned mapping with evidence, confidence and effective interval, and an explicit refusal case producing `REGION_UNRESOLVED`. Confidence: high. Launch blocker: **no**.
- **Availability evidence scale.** Evidence: six classes observed across thirteen sellers, of which three can express absence and two structurally cannot. Decision: **resolved**, a six-grade scale ordered by the discriminating test. Confidence: high. Launch blocker: **no**.
- **Availability minimum.** Evidence: Grade 2 exists at one venue only; Grades 4 and 5 can never report absence. Decision: **resolved at Grade 3**, admitting Limited with its share published. Confidence: medium-high. Launch blocker: **no**. Consequence: the two best-structured price sources in the market are not headline-eligible.
- **Source access and eligibility.** Evidence: three of the richest sources are key-gated. Decision: resolved, three populations separated; access is never an economic attribute; an observability-gap diagnostic is published. Confidence: high. Launch blocker: no methodologically; **yes operationally**.
- **Seller reduction.** Evidence: six comparable cells recovered for the first time; median above minimum by up to 18.95% and 3.71% on average; the regional value was unchanged in the one region reaching the structural floor, which is coincidence at three participants; catalogue-breadth bias confirmed with machine count as its driver; the venue's interface cannot enumerate its own population, which biases any minimum upward. Decision: **family default retained, provisionally and unratified**, with a new enumeration diagnostic. Confidence: none on the rule, by construction; high on the findings. Launch blocker: **yes**.
- **Bundle envelope.** Evidence: marketplace dispersion of 7.0, 18.3 and 8.7 times against 1.62 and 2.05 among disclosing specialist clouds; a two-sided band drawn from the latter admits 9% of the former; a floor at 16 virtual CPUs and 125GB takes the one qualifying country to a single participant. Decision: **form resolved as a one-sided floor with an economic rationale; level unresolved**. Confidence: medium on form, none on level. Launch blocker: **yes**.
- **Operator attribution.** Evidence: zero of thirteen sellers disclose an operator; one venue demonstrably knows its certified operators and does not publish them. Decision: **resolved, a published diagnostic and never a gate**, with the double-counting risk disclosed as a standing limitation. Confidence: high. Launch blocker: **no**.
- **Marketplace seller identifier.** Evidence: documented as a host user identifier on a separate account, one account may hold several machines; stable across every response within one session; cross-time stability untested. Decision: provisional fallback key with `MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED`. Confidence: medium. Launch blocker: **yes**, for marketplace participation.
- **Price freshness architecture.** Evidence: two sources in thirteen expose an effective time; the rest expose none. Decision: resolved, source-effective and observed times distinguished, absence recorded as absence and never defaulted to retrieval time. Confidence: high. Launch blocker: **no**.
- **Availability freshness architecture.** Evidence: no availability-change timestamp exists anywhere; the last candidate proved to be a forward-looking offer expiry. Decision: resolved, re-observation time with its semantics stated explicitly. Confidence: high. Launch blocker: **no**.
- **Numerical freshness ages.** Evidence: 100% of one hyperscaler's current H100 prices had stood at least 196 days, median 955 days, changing only on month boundaries; specialist clouds expose no effective dates; availability observed at one instant. Decision: **unresolved**, with one ordering constraint adopted. Confidence: none on the values. Launch blocker: **yes**.
- **Carry.** Evidence: availability can change with no price change, and is offer-addressable. Decision: reference data carried on version; price carried within an unresolved limit; **an Available state is not carried**, proposed conservatively with its operational cost stated. Confidence: medium. Launch blocker: **yes** for the price limit.
- **Tax basis.** Evidence: one explicit exclusive-of-tax statement, most sellers silent. Decision: resolved, evidence by general terms; an established inclusive basis is disqualifying; an unestablished basis is flagged and eligible, with its share gated. Confidence: medium. Launch blocker: **yes** for the gate value only.
- **Mandatory fees.** Evidence: a venue's advertised hourly total equalled base plus included storage exactly, deviation zero across 116 offers, with transfer priced per gigabyte. Decision: resolved, included storage in, usage-dependent transfer out, promotional and bid fields never used. Confidence: high. Launch blocker: **no**.
- **Publication gates.** Evidence: four gates are satisfied by construction once the eligibility rules above apply; the remaining four need regional participant counts and grade compositions that no production collection has yet produced. Decision: four closed structurally, four unresolved numerically. Confidence: high on the structural four. Launch blocker: **yes** for the numeric four.
- **Percentage change and composition.** Evidence: participant sets are small and the identity rule alone moves the median 6.2%. Decision: resolved, six composition events enumerated, with publication, annotation and withholding conditions fixed. Confidence: high. Launch blocker: no.
- **Currency.** Evidence: every identity-qualified observation was USD. Decision: resolved for this sample, USD index currency. Confidence: high for the sample. Launch blocker: no.
- **Percentile convention.** Evidence: a methodology choice. Decision: resolved, Hyndman and Fan type 7 stated in closed form. Confidence: high. Launch blocker: no.
- **Whole-node sibling.** Evidence: two unauthenticated, region-resolved, timestamped hyperscaler price sources publish only eight-accelerator instances. Decision: recommended as future research; not created, and not absorbed into this child. Confidence: high. Launch blocker: no.


## Launch Blockers

**Resolved for this draft**: hardware identity and its evidence grades, including that the strongest grade is satisfiable from a machine-readable field; topology class and the minimum-topology observation rule; the distinction between a machine fraction and a device fraction; the service-product boundary; procurement mode; the tenancy rule, which grades are eligible, and **the marketplace's grade, which is Documented on the venue's own statement that an instance has exclusive access to the accelerators it rents**; **the canonical region taxonomy and its mapping contract**; **the availability evidence scale and the minimum grade**, with the raw-to-canonical state mapping; the separation of the economic, source-observable and calculable populations; operator attribution as a diagnostic rather than a gate; the price and availability freshness architecture; the carry rule for reference data and availability; the mandatory-fee rules; the tax-basis rule; index currency; billing-granularity conversion; the exact percentile convention; the composition-change events and the percentage-change rule; four publication gates closed by construction; the three-stage eligibility criteria; the exclusion, status and diagnostic vocabulary; the ingestion field contract; and the lineage retention requirements.

**Requires further empirical observation before launch**, each with the study that would close it:

- **The seller-reduction rule.** Requires the minimum, the median and a canonical selection compared across several venues and several days, including specialist-cloud cells, with enumeration completeness measured per venue.
- **The bundle envelope level.** Requires evidence of the host allocation actually needed to use an H100 SXM for ordinary workloads. This is a hardware and workload question, not a price question, and it cannot be answered from the price data alone.
- **Numerical freshness ages and the price carry limit.** Requires repeated observation at a stated cadence over a stated period, per seller and per dimension, distinguishing genuinely static prices from stale ones and separately measuring how quickly availability changes.
- **Cross-time stability of the marketplace seller identifier.** Requires repeated observation of the same venue over days, testing whether an identifier persists, whether one seller holds several, and whether one survives a hardware change.
- **Four numerical publication gates**: the minimum participant count above the structural floor, the maximum share on the weakest admitted availability grade, the maximum carried price share, and the maximum unresolved-tax-basis share. Each requires regional participant counts and grade compositions from production collection.
- **Minimum purchasable topology for the specific sellers where no source field has yet been obtained**, three of which are key-gated and four of which remain unresearched.

**Requires licensing and operational work**:

- **Provider API access.** Three of the richest sources require keys, and without them availability cannot be evidenced for much of the specialist-cloud segment.
- **A permitted and reproducible collection path per source.** **No source enters production until Urdais has one**, and no seller is named as a production constituent before that prerequisite is met. This is an operational launch prerequisite, and the methodology takes no position on any provider's terms.
- **Historical reconstruction**, which this research suggests is not feasible: price surfaces are not archival, and the single archival structure found belongs to a source that is not headline-eligible on availability.

**Requires a parent decision**: none.

**Study limitation worth stating plainly.** The empirical work in this amendment rests on **one marketplace at one instant**, plus published specifications and unauthenticated catalog interfaces at four other providers. The marketplace's hosts are individual accounts rather than companies, its bundles are far more heterogeneous than the specialist-cloud segment, and its interface cannot enumerate its own population. Findings drawn from it are stated as findings about one venue, and none is presented as a market-wide rate.

**This child does not claim launch readiness.** It does now claim that its rules are defined and implementable, which is a different and weaker claim, and the two are kept apart deliberately.


## Sources and Evidence

Every source below was retrieved and read on **12 September 2026**. Prices are recorded to make the study auditable, not to propose any seller for inclusion; see the research-snapshot warning above.

### Primary hardware documentation

- **NVIDIA**, [H100 Tensor Core GPU product specifications](https://www.nvidia.com/en-us/data-center/h100/). Establishes the H100 SXM specification of 80GB, 3.35TB/s, up to 700W, SXM form factor, 900GB/s NVLink, and server options "HGX H100 (4-8 GPUs), DGX H100 (8 GPUs)"; and the distinct H100 NVL at 94GB, 3.9TB/s, 350-400W, PCIe dual-slot, 600GB/s NVLink, "Partner systems (1-8 GPUs)". Supports the hardware identity, the Grade B derivation, and the topology finding. Limitation: the current table lists SXM and NVL; the H100 PCIe 80GB variant is not shown on it and was not separately verified here.
- **NVIDIA**, [H100 NVL GPU Product Brief](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/h100/PB-11773-001_v01.pdf), PB-11773-001_v01, March 2024, retrieved in full. Confirms NVL as a separately documented product. Supports excluding NVL from this child.
- **NVIDIA**, [HGX AI Factory reference architecture, Components](https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory-h100-h200-b200/latest/components.html). States "Eight H100, H200 or B200 SXM GPUs on a H100, H200 or B200 baseboard" and that HGX H100 eight-GPU baseboards combine third-generation NVSwitch with fourth-generation NVLink. **This is the primary support for the Grade B rule**, replacing the first draft's indirect derivation from the server-options column, and it also supports the multi-GPU platform wording.

### Seller price surfaces

Each entry records the label the seller publishes, the per-accelerator-hour figure used, and what the source establishes. All figures are on-demand unless stated.

- **Vast.ai**, [pricing](https://vast.ai/pricing) and [hosting overview](https://docs.vast.ai/host/hosting-overview). The pricing page publishes "H100 SXM" with both a floor and a platform median, $1.73 and $2.02. The host documentation states that "Hosts sell GPU resources on the marketplace", that hosts set the pricing on offers they create, and that "a rental contract is created each time a client accepts your offer by renting an instance". **This is the primary support for removing the platform median from the participant population**: the participant is the host behind an offer, and a platform median already aggregates across participants. Establishes Grade A identity, a live capacity signal, per-listing geography, and the floor-versus-typical gap. Correction: the first draft used the platform median as one participant, which these documents show is wrong.
- **Hyperstack**, [GPU pricing](https://www.hyperstack.cloud/gpu-pricing). Publishes "NVIDIA H100 SXM" 80GB at $3.20 with up to 24 pCPU and 240GB RAM per GPU, billed per minute, alongside "NVIDIA H100 NVLink" at $2.60 and a bare "NVIDIA H100" at $2.50. Establishes Grade A identity, bundle figures, and, decisively, that one seller uses three different H100 labels at three prices, which is the empirical basis for the identity evidence rule.
- **RunPod**, [pricing](https://www.runpod.io/pricing). Publishes "H100 SXM" 80GB at $3.49 on its Secure Cloud tier with 20 vCPU and 125GB RAM, with per-hour and per-second billing toggles and a separate Community Cloud tier. Establishes Grade A identity, bundle figures, and service-tier variation within one seller.
- **Nebius**, [prices](https://nebius.com/prices). Publishes "NVIDIA HGX H100" at $3.85 on-demand and $2.15 preemptible, with 16 vCPU and 200GB RAM per GPU-hour. Establishes Grade B identity, bundle figures, and an on-demand-to-preemptible ratio.
- **Crusoe**, [cloud pricing](https://crusoe.ai/cloud/pricing/). Publishes "NVIDIA H100 80GB HGX" at $3.90/GPU-hr on-demand, spot by contact, and separately a managed inference deployment on the same hardware at $5.50/hr. Establishes Grade B identity and that the same hardware sold as a different service product carries a materially different price.
- **Modal**, [pricing](https://modal.com/pricing). Publishes "Nvidia H100 SXM5" at $0.001097 per second, converting arithmetically to $3.9492 per accelerator-hour, and states that with Modal "you always pay for what you use and nothing more. You never pay for idle resources, just actual compute time", with autoscaling on request volume. Establishes Grade A identity and per-second conversion, and **establishes that the product is serverless execution rather than persistent full-device rental**, which is why it is excluded from P1. The arithmetic conversion is valid; the economic comparability is not.
- **Lambda**, [pricing](https://lambda.ai/pricing). Publishes "NVIDIA H100 SXM" 80GB at $3.99 per GPU-hour with a 1X, 2X, 4X and 8X size selector, explicitly exclusive of sales tax, VAT and GST, with reserved capacity by contact, alongside a separate cluster product quoted in quantity tiers. **Correction: the host resources shown with the retrieved row, 208 vCPU and 1800 GiB, are eight-node scale, so the figure corresponds to the 8X selection, and the first draft's per-accelerator division of them was wrong.** Repeated attempts to read the 1X, 2X and 4X prices from the rendered page failed, so per-size prices are not established here. This seller is the most promising candidate for the seller-reduction experiment and requires the ordering interface. Topology unresolved for P1.
- **Together AI**, [pricing](https://www.together.ai/pricing). Publishes "NVIDIA HGX H100" per GPU per hour: clusters at $1.99 preemptible, $3.99 on-demand, and reserved tiers of $3.69, $3.45 and $3.19 by commitment length; and an instance rate of $3.99 pay-as-you-go beside a $5.49 promotional rate with a stated expiry. Establishes Grade B identity, single-tenant exclusivity, the procurement-mode price spread within one seller, and a live promotional-pricing case.
- **DigitalOcean**, [GPU Droplet pricing](https://www.digitalocean.com/pricing/gpu-droplets). Publishes "NVIDIA HGX H100" at $4.41 per GPU-hour on-demand with 80GB GPU memory, 20 vCPU, 240 GiB memory and NVMe storage, and a 12-month reserved rate of $3.26. Establishes Grade B identity and bundle figures.
- **CoreWeave**, [pricing](https://www.coreweave.com/pricing). Publishes "NVIDIA HGX H100" with a stated GPU count of 8 at $49.24/hr on-demand and $19.71 spot, with a derived $6.16 per GPU, and 128 vCPU, 2048GB RAM and 61.44TB local storage per node, in separate United States and Europe tables. Establishes Grade B identity, **whole-node-only topology confirmed by the stated accelerator count**, bundle figures, and that region exposure on a public price surface is possible. Excluded from P1 on topology.
- **Voltage Park**, [pricing](https://www.voltagepark.com/pricing). Publishes "contact for pricing" across on-demand Ethernet (1-1016 GPUs), on-demand 3200 Gbps InfiniBand (8-1016 GPUs), and long-term reserve. Establishes a quote-required observation, ineligible under the family, and that fabric type is itself a product distinction.

### Sources examined and not used for price evidence

- **AWS**, [EC2 P5 instances](https://aws.amazon.com/ec2/instance-types/p5/). Confirms P5 instances are powered by H100 GPUs and deployed in UltraClusters. No per-accelerator price is published on this page, so no observation was taken.
- **Microsoft Azure**, [Linux virtual machine pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/). Exposes NDsrH100v5 and related series with an explicit region selector. Recorded as evidence that hyperscalers expose region where specialist clouds largely do not; no observation was taken, because extracting a comparable per-accelerator figure requires resolving instance composition beyond this study's scope.
- **Google Cloud** and **Oracle Cloud** pricing pages were opened but did not yield a directly comparable per-accelerator H100 SXM figure without deeper navigation, and no observation was taken from either.

Third-party comparison sites and search results were used only to identify sellers to research directly, and none is cited as price evidence.

**Sources re-opened for this correction** were the NVIDIA HGX reference architecture components page, the Vast.ai hosting documentation, the Modal pricing page, and the Lambda, CoreWeave, Hyperstack, Nebius, DigitalOcean and RunPod price surfaces. Each correction above rests on a source read during this pass rather than on the independent review's summary of it.

### Sources added by the 0.1.1 amendment

Every source below was retrieved and read on **13 September 2026**. The amendment rests on these directly, not on the research documents' paraphrase of them.

**Verified by direct call.** A marketplace offer search endpoint, thirteen unauthenticated requests all returning HTTP 200, including an accelerator-filtered query returning 64 records, an availability-filtered query returning 16, and eight quantity-partitioned queries. These established the comparable cells, the machine-fraction arithmetic, the price composition, the geographic resolution, and the interface's inability to enumerate its own population. A hyperscaler retail price interface, HTTP 200 unauthenticated, returning 138 H100 meters across 24 regions with per-meter effective dates, which supplied the only measurement of how long a published price stands. A bulk price catalog index, HTTP 200, 106 regions under a single dated catalog version with a whole-catalog publication timestamp. A specialist cloud's published interface specification, HTTP 200 unauthenticated, read for its instance-type schema; and that same provider's live endpoint, **HTTP 401**, confirming the documented key requirement, which was recorded and not satisfied.

**Documentation read.** The marketplace's offer-search reference, for its field definitions, its country-code location filter, and the absence of any documented result limit or pagination mechanism. Its hosting documentation, for host accounts, the host-to-machine relationship, and the meaning of an offer's end date. Its [Concepts documentation](https://docs.vast.ai/guides/concepts.md), which defines an instance as an isolated environment "with exclusive access to the GPUs you rented" and is **the primary support for grading that venue's tenancy Documented**; it is cited with its link because it decides a grade. Its security documentation, for container-level isolation, which is silent on accelerator assignment and was the basis of the superseded Ambiguous grade. Its certified-datacenter documentation, for the requirements that programme imposes. A second specialist cloud's catalog reference, for its availability expansion, its four ordinal availability values, its product contexts, and its quantity parameter.

**Not retrieved, and recorded as limitations.** Three providers' interfaces require API keys that Urdais does not hold, and no attempt was made to obtain or bypass them. Four providers from the first source study remain without an established H100-bearing endpoint. Region values for one key-gated catalog were not obtained.

**Research artifacts.** Two internal research documents accompany this specification and are held alongside it rather than published: the UCPI-H100-SXM Production Data Source Study, and the UCPI-H100-SXM Launch-Parameter Closure Study. They contain the full query records, the per-cell price tables, the sensitivity computations, and the field-semantics tests summarized above. Neither is a methodology page and neither is routed.

## Version History

**0.1.1-draft, 13 September 2026**: launch-parameter closure. Following two research passes, a source study of provider APIs and ordering interfaces and then the first H100-specific empirical experiment, this amendment closes the majority of the child's open parameters and narrows the remainder.

Resolved: the canonical region taxonomy at country level, with a versioned mapping contract carrying an explicit refusal case; the availability evidence scale, ordered by whether a signal can express absence rather than by granularity, with the minimum set at a product-and-region capacity assertion and the raw-to-canonical state mapping fixed; the separation of the economic, source-observable and calculable populations, with access established as never an economic attribute; the minimum-topology observation rule, and the ingestion trap that a machine-occupancy fraction is not a device fraction; which tenancy evidence grades are eligible; operator attribution as a published diagnostic rather than a publication gate, with the double-counting risk disclosed; the price and availability freshness architecture, including that a source-effective time is recorded as absent rather than defaulted to retrieval time, and that an availability observation time means re-observation and not a seller event; the carry rule per dimension; the mandatory-fee and tax-basis rules; the composition-change events and the conditions under which percentage change is published, annotated or withheld; four publication gates closed by construction; the bundle envelope's form as a one-sided floor; and, newly added, deterministic P0, P1 and P2 criteria, an exclusion, status and diagnostic vocabulary, a conceptual ingestion field contract, lineage retention requirements, source classes, and a recommendation to research a whole-node sibling separately.

Retained as unresolved, deliberately: the bundle envelope level, because setting it would decide whether the child publishes; the seller-reduction rule, now tested for the first time on six comparable cells and still unratified; the numerical freshness ages and the price carry limit; the cross-time stability of the marketplace seller identifier; and four numerical publication gates.

Findings that went against coverage were kept: the two best-structured price sources in the market are not headline-eligible because they cannot evidence availability. One finding was corrected in the other direction before merge: the marketplace's tenancy grade was raised from Ambiguous to Documented after its official Concepts page was read, which states that an instance has exclusive access to the accelerators it rents. That removes marketplace tenancy from the launch blockers and changes no rule.

The family methodology was re-tested and **not modified**, and no parent amendment is requested. Launch remains blocked. No production effective date.

**0.1.0-draft, 12 September 2026**: initial child specification and empirical market study, amended the same day following independent review. The review found no fault in the UCPI architecture or in the launch-blocked conclusion, and identified a real defect in the empirical record: the first draft computed statistics across a single ten-row population that mixed a marketplace platform aggregate, whole-node products, a serverless product and per-accelerator rentals. The amendment separates evidence into three populations; removes the platform aggregate as a participant, which collapses the reported spread from 3.05 to 1.93 times; classifies topology by minimum purchasable quantity rather than quoted denominator, withdrawing the 8.7% subgroup statistic as wrongly classified; excludes serverless and managed-inference products on service-product grounds; corrects the identity-rule sensitivity from 12.5% to 6.2%; softens the untestable seller-reduction claim to unsettled; upgrades the Grade B rule to direct NVIDIA documentation; narrows the single-GPU-server wording; fixes an exact percentile convention; and withdraws both requested parent amendments. Launch remains blocked. No production effective date.

### Research history

Recorded in full rather than smoothed, because how a specification reached its conclusions is part of what makes it auditable.

The initial broad price-page study established the three-stage evidence structure and concluded that the public price surface does not carry the required fields. Independent review then corrected the population semantics of that study, separating a platform aggregate from participant observations and reclassifying topology by minimum purchasable quantity. A source study of provider APIs and ordering interfaces found that the missing fields largely exist in machine-readable form and moved the binding constraint from discovery to access. That study was itself corrected before merge: an unfiltered 64-row marketplace sample had been treated as H100 evidence when it contained two H100 SXM rows, so the availability rate, multi-offer count and operator-identity claim drawn from it were withdrawn and the venue's host identifier was reclassified as a seller identifier rather than operator identity. This amendment then performed the targeted H100-filtered experiment that the corrected study named as its own prerequisite.
