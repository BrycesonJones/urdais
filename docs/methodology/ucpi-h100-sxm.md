# UCPI-H100-SXM Child Specification

**Status: proposed child specification, version 0.1.0-draft. Launch blocked.** Prepared 12 September 2026. No production value, price series, provider list, or history is established by this document. Every price appearing here is research evidence gathered to test the methodology, never a published value.

This is the first child of the [Urdais Compute Price Index family](/docs/methodology/ucpi) and the first application of that family methodology to a real compute product. It is therefore two things at once: a specification for measuring one product, and an empirical test of whether the family's architecture survives contact with the market.

**The headline result of that test is that the architecture holds and the data does not.** The family's rules proved sound and, in several places, decisive. But the public price surfaces on which this study was conducted do not carry the region, availability, minimum-topology, multi-offer, or operator information the family requires, so several launch parameters cannot be resolved from this evidence and are recorded as unresolved with the experiment each one needs. This child does not claim launch readiness.

**Evidence is reported in three separate populations**, because the first draft of this study mixed them and drew statistics across the mixture. See [Evidence Populations](#docs-evidence-populations).

## Relationship to the UCPI Family

This specification inherits the family methodology and adds only what H100 SXM requires. It does not restate parent rules, and it does not modify them: where the research suggested a parent rule needs revision, that is recorded in [Findings for the Parent Methodology](#docs-findings-for-the-parent-methodology) rather than worked around here.

**Inherited unchanged**: the economic object and the exact statistic; the capacity-source identity and collapse rule; seller-level reduction as a concept; the regional median and its even-`N` convention; the source-quality and observation-type framework; availability semantics; reconfirmation semantics; the procurement taxonomy; bundle and topology principles; the prohibition on synthetic decomposition and on fractional normalization; price-component principles; the aggregation population for percentiles; publication statuses; corrections; lineage; and versioning.

**Fixed by this child**: hardware identity and the evidence required to establish it; topology class; procurement mode; tenancy requirement; the service dimensions that are requirements rather than metadata; index currency; and the percentile interpolation convention.

**Unresolved after this research**: the region taxonomy; the availability evidence minimum; the seller-reduction rule; freshness and carry limits; the bundle envelope; all numerical publication gates; and operator attribution. Each is listed in [Launch Blockers](#docs-launch-blockers) with the specific study required.

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

**Grade A, explicit designation**: the seller states SXM or SXM5. Observed for five of ten researched sellers.

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

**Minimum purchasable topology is therefore a third data gap of the same character as region and availability**: it is an ordering-interface attribute that the price surface frequently does not expose.

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

## Bundle Envelope

Host bundles were recorded where sellers disclose them. Per accelerator, virtual CPU counts ranged from 16 to 26, a factor of 1.62, and host memory from 125GB to 256GB, a factor of 2.05. Four of ten sellers did not disclose the bundle on the price surface at all.

**No bundle envelope is fixed.** The observed virtual CPU range is tight enough that an envelope looks feasible, but the memory range is not, and with 40% of the sample not disclosing bundles at all, any envelope would be drawn through a fog. Setting one now would exclude sellers on the basis of what they happen to publish rather than what they supply.

The child therefore accepts bundle heterogeneity within the per-accelerator allocation class as **named accepted heterogeneity** for research purposes, publishes the bundle dispersion of every observation, and records the envelope as unresolved pending a study that obtains bundles for the non-disclosing sellers. Synthetic decomposition remains prohibited: no imputed price is subtracted for CPU, memory, storage, or network.

**The family requires a child to declare a bundle envelope, so this is a launch requirement rather than an optional refinement.** It does not block merging this draft, and it does block launch. The first draft classified it as non-blocking, which conflated the two.

## Geographic Taxonomy

**This is the first launch blocker, and it is a data problem rather than a design problem.**

The family makes regional series primary. Resolving a region taxonomy requires knowing which region each observation belongs to, and three different questions must be separated.

**Does the price surface carry a region-specific price?** For two of the examined venues, yes: one publishes separate United States and Europe price tables, and the marketplace exposes per-listing geography. The rest publish a single rate with no region dimension.

**Do official documents reveal where the product exists?** Frequently yes, and this study did not systematically audit them. Several sellers advertise presence in many regions while publishing one rate, and provider documentation and console region lists were not examined. A single advertised rate applied across regions is **not** the same as region unknown, and the first draft's wording did not draw that line clearly enough.

**Is current regional availability recoverable?** This requires the ordering interface, and is the same gap as availability.

The blocking finding is therefore narrower than the first draft implied: **region is not recoverable from the public price surface for most sellers, and whether it is recoverable from documentation and ordering interfaces has not been tested.** That test is part of the required experiment.

A region-blind price cannot be assigned to a region without inventing the assignment, and inventing it would put a fabricated attribute into the identity of the observation. Three responses were considered. Publishing a region-blind series would contradict the family's regional-first architecture and would silently average across regions with different economics. Assigning region by seller headquarters or by guess would fabricate. Restricting the child to region-exposing sellers would leave two participants, which the family's own structural gate already rejects as not a market.

**No region taxonomy is adopted.** The experiment required is a study of seller APIs and consoles rather than marketing pages, because region is frequently a parameter of the ordering interface even where it is absent from the price table. Until that study establishes that region is recoverable for a workable majority of sellers, this child cannot publish.

## Availability Evidence

**This is the second launch blocker, and it is more serious than the first.**

The family requires that an eligible observation be accessible, not merely advertised. Across the eleven venues examined, **one exposed a live capacity signal**, and it is the marketplace whose per-offer listings carry availability. Every one of the nine individual sellers published a price with no indication whatsoever of whether anything was available at it, and one published no price at all, offering "contact for pricing" across every tier, which the family already makes ineligible as quote-required.

The evidence grades observed were therefore: live allocatable capacity visible, one venue; explicit seller availability statement, none; price published with no capacity signal, nine sellers; price absent and quote required, one seller.

Requiring the strongest grade admits essentially no individual seller. Accepting the weakest grade admits nine, but that grade is precisely "a price appeared on a page", which is the advertised-price object the family explicitly rejected as a target. **The child cannot adopt either, and so adopts neither.**

The experiment required is an API and ordering-interface study to determine, per seller, whether an availability or capacity signal is obtainable at all, and whether an order for the specified configuration would be accepted. If that study finds that most of the market cannot evidence availability, the honest conclusion may be that a compute price benchmark on this product measures advertised prices or measures nothing, and the family would then need to decide which of those it is willing to publish. That is a parent-level question and is flagged as one.

## Seller-Level Reduction

The family permits three candidate reduction rules and asks the first child to compare the seller minimum, the seller median, and a canonical-zone selection. Testing them requires multiple qualifying prices **inside one fully comparable cell**, meaning the same region, service tier, procurement mode and topology class for one seller.

**The first draft stated that every seller published exactly one qualifying price and that the test was therefore impossible. That claim was too strong and is corrected.** Several sellers do publish multiple catalogue offers: one lists one, two, four and eight-accelerator configurations of the same product; several publish on-demand beside preemptible and reserved rates; one publishes two differently operated cloud tiers. Those are multiple offers, but they are not multiple offers inside one comparable cell, because each differs on a dimension the child or the family uses to define the cell.

The corrected finding is narrower and still blocking: **the public market exposes multiple catalogue offers for some sellers, but this study did not recover multiple prices inside a single fully comparable region, service, mode and topology cell, so the family's seller-reduction rule remains unsettled.** The multi-configuration seller is the most promising case, and its per-size prices could not be extracted from the rendered price surface, which is the same ordering-interface gap that blocks region, availability and minimum topology.

The rule therefore remains the family default, the seller minimum, **provisionally and unratified**. No sensitivity between minimum and median could be computed, because no real cell containing both was recovered.

## Capacity-Source Attribution

The family makes the capacity source the aggregation participant: the infrastructure operator where reliably determinable, the seller otherwise.

**No seller in the research sample disclosed its infrastructure operator on its price surface.** The operator attribution rate from this source class is zero, no collapse events were observed, and the undetermined-operator share is 100%.

That is a real result rather than a failure of effort: specialist clouds present themselves as the operator, and whether they own, lease, or resell the underlying hardware is not published. The family's prohibition on inferring operator identity from price, geography, or configuration similarity means this cannot be closed by analysis.

**Counts are reported by stage, and a seller that has already failed topology or service classification is not called a capacity source.** From the research: eleven sellers and venues were examined; one published no price and is ineligible as quote-required; one is a marketplace whose treatment is below; nine produced identity-qualified seller observations forming P0; three of those are confirmed-eligible P1 candidates with four unresolved and two excluded; zero infrastructure operators were determined; and **zero final UCPI-eligible capacity sources exist**, because P2 is empty.

### Marketplace Treatment

The marketplace in the sample publishes a platform-wide median alongside a floor. **That median is an aggregate across many independent host offers and is not one capacity-source observation.** The venue's own host documentation is explicit that hosts sell the resources, that hosts set the pricing on the offers they create, and that "a rental contract is created each time a client accepts your offer by renting an instance". The participant is therefore the host behind an offer, not the venue, and a platform median already aggregates across participants before UCPI has applied any of its own rules.

**The first draft treated that platform median as one participant, which was wrong, and it is corrected.** The observation is removed from the participant population and retained only as market-structure evidence, where it remains genuinely useful: it shows that a venue's floor and its own typical price can differ by 17%, which is part of the empirical case against a cheapest-available target. Reconstructing the individual host offers from the dated snapshot was not possible because they were not retained, and inventing them was not an option.

The correction matters to the numbers. Removing the platform aggregate moves the P0 median from $3.9246 to $3.9492, a change of only 0.63%, but it collapses the reported spread from 3.05 times to **1.93 times** and the interquartile range from $0.41 to **$0.14**. The platform aggregate was carrying most of the apparent dispersion.

Marketplace listings are not excluded in principle. They enter once individual host offers can be mapped to capacity-source identities, which is a data-resolution requirement rather than a gap in the family's rules.

## Price, Unit, and Currency

The normalized unit is **United States dollars per H100 SXM accelerator-hour**, meaning the mandatory cost of one full dedicated accelerator for one hour under this child's specification.

**Every qualifying price observed was denominated in USD.** No non-USD qualifying observation was found, so no conversion arises in the current sample. The child nevertheless states the family requirement: native price and currency are always retained, and any future non-USD observation is converted under an approved rate convention which remains unresolved because no observation yet requires one.

Billing granularity varied and converts cleanly within the product: sellers billed per hour, per minute, and per second, and one serverless seller published a per-second rate that converts to $3.95 per accelerator-hour. Per-second and per-minute billing are unit changes, not product changes, and are admitted.

Tax basis is a genuine gap. One seller stated explicitly that prices exclude sales tax, value-added tax, and goods-and-services tax. Most stated nothing. The family requires prices exclusive of transaction taxes, so an observation whose basis cannot be established is flagged and its share published; whether an unestablished basis should be disqualifying is unresolved, and the share in this sample is too large to answer by assumption.

No mandatory fixed fee was found that would prevent clean hourly comparison within the specified class. No one-time activation or setup charge appeared on any qualifying offer, so the family's amortization prohibition did not bind. That is a finding about this class rather than a general one.

## Temporal Rules, Freshness, and Carry

The family proposes daily calculation, and nothing found here contradicts it, but nothing found here confirms it either.

**No freshness parameter can be set from this evidence.** A single snapshot cannot measure how often a price changes. Sellers largely do not expose price-effective timestamps, and the distinction the family draws between price freshness and availability freshness is exactly the distinction this sample cannot measure, since nine of ten sellers expose no availability state to age.

The experiment required is a repeated observation study over a period long enough to characterise update cadence per seller, distinguishing sellers whose prices are genuinely static from sellers whose prices are stale, and separately measuring how quickly availability changes where it is visible at all. The marketplace observation suggests those two rates differ by orders of magnitude: its prices move continuously while several static price pages showed no sign of recent change.

`price_max_age`, `availability_max_age`, `reference_data_max_age`, and the carry policy are all **unresolved**. No value is proposed, because any value proposed now would be invented.

Whether weekends should produce observations is likewise unresolved and depends on the same study: if provider pages are static across weekends while the marketplace moves, a weekend value would mix a live signal with eight unchanged ones, and whether that is a price or an artifact is an empirical question.

## Regional Aggregation and Dispersion

The family's regional median applies unchanged, including the even-`N` convention.

This child fixes an **exact quantile convention**, because "linear interpolation" alone is implementation-dependent and two implementations could publish different percentiles from identical inputs. For `N` observations sorted ascending as `x_1 … x_N` and a quantile `q` in `[0, 1]`, let

`h = (N − 1) q`, `f = floor(h)`

and the quantile is

`Q(q) = x_(f+1) + (h − f) × (x_(f+2) − x_(f+1))`

taking `Q(q) = x_N` when `f + 1 = N`. This is the Hyndman and Fan type 7 definition, equivalently the conventional linear interpolation used by common numerical libraries. It is computed over the same final participant population that produces the median, on unrounded normalized prices. The convention is fixed now and is not to be changed to alter a published number.

## Publication Gates

**No numerical gate is adopted.** Every gate the family requires depends on quantities this research could not measure: participant counts per region depend on the unresolved region taxonomy; operator coverage is zero from this source class; carried and stale shares depend on unresolved freshness limits; and the availability evidence composition is the unresolved second blocker.

The one gate that can be examined is the minimum participant count, and the research gives a partial answer. Across the full sample of ten participants, removing any single participant moved the median by 0.63%, which indicates that at ten the statistic is robust. That result does not extend downward: with three participants the median is the middle observation and removing one moves it to an endpoint, and with two the family already refuses to publish. The sample offers no evidence distinguishing a minimum of three from four or five, because the region taxonomy that would produce regional participant counts does not exist yet.

The child therefore proposes no minimum above the family's structural floor and records that setting one requires regional participant counts from the region study. Choosing a number now would be choosing it for the reason the family explicitly forbids.

## Composition Changes

The family requires composition disclosure, and this research suggests it will matter here. The participant sets are small, and the hardware-identity rule alone moves the identity-qualified median by 6.2% depending on which grades are admitted. A benchmark with that sensitivity must show users when its composition changed.

The child adopts the family requirement and adds that **a daily percentage change must be annotated where the participant set changed**, where the prior observation was Delayed or Unavailable, or where the specification version changed. A composition-driven move is not presented as a market-price move.

## Published Surface

The future published surface, with no values:

UCPI-H100-SXM, for a canonical region: price in USD per H100 SXM accelerator-hour; one-day percentage change with a composition-changed annotation where applicable; procurement mode on-demand; topology per-accelerator allocation; service tier as specified; the capacity-source participant count; the availability evidence composition; the price distribution; the carried share; the as-of date; the status; and the family and child versions.

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

## Decision Matrix

Each entry records the evidence, the decision, confidence, and two separate questions: whether it blocks **merging this draft** and whether it blocks **launching the child**. Those are different, and the first draft's single blocker column conflated them. Nothing below blocks merging.

- **Hardware identity.** Evidence: NVIDIA specifies H100 SXM at 80GB with HGX and DGX server platforms, distinct from NVL at 94GB on partner systems. Decision: resolved. Confidence: high. Merge blocker: no. Launch blocker: no.
- **Grade B, HGX designation.** Evidence: NVIDIA reference architecture documentation states eight H100 SXM GPUs sit on an H100 baseboard, mapping HGX H100 to SXM directly rather than by inference. Decision: resolved, an official HGX H100 designation qualifies. Confidence: high, upgraded from the first draft's indirect derivation. Merge blocker: no. Launch blocker: no. Sensitivity: admitting Grade B moves the P0 median 6.2% and doubles coverage.
- **Topology class.** Evidence: classification must use minimum purchasable topology, not the quoted denominator; on that basis three of nine sellers are confirmed per-accelerator, one whole-node, one serverless, and four unclassifiable from the price surface. Decision: per-accelerator class specified; the first draft's 8.7% subgroup statistic is withdrawn as wrongly classified. Confidence: the rule is high, the classification coverage is low. Merge blocker: no. Launch blocker: **yes**, for the four unclassified sellers.
- **Service product.** Evidence: a serverless product bills only for active compute and a managed inference endpoint prices the same hardware 41% above the seller's own rental. Decision: resolved, full-device rental only. Confidence: high. Merge blocker: no. Launch blocker: no.
- **Procurement mode.** Evidence: on-demand present across every price-publishing seller; interruptible roughly half price at one; reserved spanning 20% across four tiers at another. Decision: resolved, on-demand non-preemptible. Confidence: high. Merge blocker: no. Launch blocker: no.
- **Tenancy.** Evidence: exclusive full-device access delivered through virtual machines across most of the market. Decision: resolved in rule, full-device exclusivity required without requiring bare metal; per-observation evidence grading is specified below. Confidence: medium. Merge blocker: no. Launch blocker: **yes**, until exclusivity is evidenced per observation rather than assumed.
- **Marketplace treatment.** Evidence: venue documentation states hosts sell the resources, set the prices, and that a rental contract arises when a client accepts a host's offer. Decision: resolved, a platform median is an aggregate and not a participant; the first draft's inclusion is corrected. Confidence: high. Merge blocker: no. Launch blocker: **yes** if marketplace listings are to contribute, since host-level mapping is required first.
- **Bundle envelope.** Evidence: 16 to 26 virtual CPUs and 125GB to 256GB per accelerator among disclosing sellers, with 40% not disclosing. Decision: unresolved; the family requires a child to declare one. Confidence: low. Merge blocker: no. Launch blocker: **yes**.
- **Region.** Evidence: two of the examined venues carry region-specific prices; official documentation and consoles were not audited; a single advertised rate across regions is not the same as region unknown. Decision: unresolved. Confidence: high in the price-surface finding, untested beyond it. Merge blocker: no. Launch blocker: **yes**.
- **Availability evidence.** Evidence: one venue exposes a live capacity signal; the rest publish price with none; one is quote-only. Decision: unresolved, neither the strong nor the weak grade is adoptable. Confidence: high. Merge blocker: no. Launch blocker: **yes, the most serious**.
- **Seller reduction.** Evidence: multiple catalogue offers exist for several sellers, but none inside one fully comparable cell; the most promising multi-configuration seller does not expose per-size prices on the rendered page. Decision: unsettled; family default retained provisionally and not ratified. Confidence: none, by construction. Merge blocker: no. Launch blocker: **yes**.
- **Operator attribution.** Evidence: no seller disclosed its operator; attribution rate zero, undetermined share 100%. Decision: unresolved. Confidence: high in the finding. Merge blocker: no. Launch blocker: **yes** for any gate depending on operator coverage.
- **Freshness and carry.** Evidence: a single snapshot cannot measure update cadence; most sellers expose no price-effective timestamp. Decision: unresolved, no value proposed. Confidence: none. Merge blocker: no. Launch blocker: **yes**.
- **Publication gates.** Evidence: each depends on a quantity above. The only partial result is that a nine-observation P0 median moves at most 0.62% on leave-one-out, which says nothing about a threshold. Decision: unresolved above the family's structural floor. Merge blocker: no. Launch blocker: **yes**.
- **Tax basis.** Evidence: one seller states an exclusive-of-tax convention; most are silent, and silence was not confirmed to mean pre-tax. Decision: family rule applies, unestablished basis flagged; whether it disqualifies is unresolved. Confidence: medium. Merge blocker: no. Launch blocker: **yes** if the flagged share stays material.
- **Currency.** Evidence: every identity-qualified observation was USD. Decision: resolved for this sample, USD index currency. Confidence: high for the sample. Merge blocker: no. Launch blocker: no.
- **Percentile convention.** Evidence: a methodology choice. Decision: resolved, Hyndman and Fan type 7 stated in closed form over the final participant population. Confidence: high. Merge blocker: no. Launch blocker: no.
- **Composition handling.** Evidence: the identity rule alone moves the P0 median 6.2%; participant sets are small. Decision: resolved, composition disclosure required and percentage change annotated. Confidence: high. Merge blocker: no. Launch blocker: no.

## Launch Blockers

**Resolved for this draft**: hardware identity and its evidence grades, with the HGX mapping now resting on direct NVIDIA documentation; topology class as a rule, classified by minimum purchasable topology; service-product boundary excluding serverless and managed inference; procurement mode; the tenancy rule; index currency; billing-granularity conversion; the exact percentile convention; and composition disclosure.

**Requires further empirical observation before launch**: minimum purchasable topology for the four sellers it could not be established for; the region taxonomy, and whether region is recoverable from documentation and ordering interfaces rather than price pages; the availability evidence minimum; per-observation tenancy exclusivity evidence; the seller-reduction rule, still unsettled because no fully comparable multi-price cell was recovered; freshness limits for price, availability and reference data, and the carry policy; the bundle envelope, which the family requires a child to declare; operator attribution; host-level mapping if marketplace listings are to contribute; the tax-basis disqualification rule; and every numerical publication gate.

**Requires licensing and operational work**: lawful collection and retention terms per seller; ordering-interface or API access; and whether historical reconstruction is feasible at all, which this research suggests it is not, since price surfaces are not archival and expose no price history.

**Requires a parent decision**: none at present. Both amendments requested in the first draft are withdrawn, for the reasons in [Findings for the Parent Methodology](#docs-findings-for-the-parent-methodology).

**Study limitation worth stating plainly.** The researched sample is predominantly specialist GPU clouds plus one marketplace. Hyperscaler offerings were examined but not normalized into the sample, because extracting a comparable per-accelerator figure from them requires resolving instance composition, quantity, topology, region and commitment structure. P0 and P1 should therefore be described as **researched public specialist-cloud price surfaces**, not as the H100 market. Hyperscalers may form a materially different price and product island, and testing that is further work.

**This child does not claim launch readiness.** The single most valuable experiment remains an ordering-interface and API study across the researched sellers, because region, availability, minimum topology, multi-offer structure and bundle composition are all recoverable from the same place, and five blockers move together.

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

## Version History

**0.1.0-draft, 12 September 2026**: initial child specification and empirical market study, amended the same day following independent review. The review found no fault in the UCPI architecture or in the launch-blocked conclusion, and identified a real defect in the empirical record: the first draft computed statistics across a single ten-row population that mixed a marketplace platform aggregate, whole-node products, a serverless product and per-accelerator rentals. The amendment separates evidence into three populations; removes the platform aggregate as a participant, which collapses the reported spread from 3.05 to 1.93 times; classifies topology by minimum purchasable quantity rather than quoted denominator, withdrawing the 8.7% subgroup statistic as wrongly classified; excludes serverless and managed-inference products on service-product grounds; corrects the identity-rule sensitivity from 12.5% to 6.2%; softens the untestable seller-reduction claim to unsettled; upgrades the Grade B rule to direct NVIDIA documentation; narrows the single-GPU-server wording; fixes an exact percentile convention; and withdraws both requested parent amendments. Launch remains blocked. No production effective date.
