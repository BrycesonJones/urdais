# UCPI-H100-SXM Child Specification

**Status: proposed child specification, version 0.1.0-draft. Launch blocked.** Prepared 12 September 2026. No production value, price series, provider list, or history is established by this document. Every price appearing here is research evidence gathered to test the methodology, never a published value.

This is the first child of the [Urdais Compute Price Index family](/docs/methodology/ucpi) and the first application of that family methodology to a real compute product. It is therefore two things at once: a specification for measuring one product, and an empirical test of whether the family's architecture survives contact with the market.

**The headline result of that test is that the architecture holds and the data does not.** The family's rules proved sound and, in two places, decisive. But the public price surfaces on which this study was conducted do not carry the region, availability, multi-offer, or operator information the family requires, so several launch parameters cannot be resolved from this evidence and are recorded as unresolved with the experiment each one needs. This child does not claim launch readiness.

## Relationship to the UCPI Family

This specification inherits the family methodology and adds only what H100 SXM requires. It does not restate parent rules, and it does not modify them: where the research suggested a parent rule needs revision, that is recorded in [Findings for the Parent Methodology](#docs-findings-for-the-parent-methodology) rather than worked around here.

**Inherited unchanged**: the economic object and the exact statistic; the capacity-source identity and collapse rule; seller-level reduction as a concept; the regional median and its even-`N` convention; the source-quality and observation-type framework; availability semantics; reconfirmation semantics; the procurement taxonomy; bundle and topology principles; the prohibition on synthetic decomposition and on fractional normalization; price-component principles; the aggregation population for percentiles; publication statuses; corrections; lineage; and versioning.

**Fixed by this child**: hardware identity and the evidence required to establish it; topology class; procurement mode; tenancy requirement; the service dimensions that are requirements rather than metadata; index currency; and the percentile interpolation convention.

**Unresolved after this research**: the region taxonomy; the availability evidence minimum; the seller-reduction rule; freshness and carry limits; the bundle envelope; all numerical publication gates; and operator attribution. Each is listed in [Launch Blockers](#docs-launch-blockers) with the specific study required.

## Primary Question

> What is the market-accessible rental price of the defined H100 SXM compute product within a given region?

Under the family methodology the statistic will be the regional median across final capacity-source observations of each participant's lowest-priced qualifying accessible offer.

## Hardware Identity

An accelerator called "H100" is not necessarily an H100 SXM, and the research found a single seller using three different "H100" labels at three different prices on one page. Identity is therefore established from NVIDIA's own product documentation, not from a seller's product name.

From NVIDIA's [H100 product specifications](https://www.nvidia.com/en-us/data-center/h100/), retrieved 12 September 2026, the H100 SXM is specified as 80GB of GPU memory with 3.35TB/s of memory bandwidth, up to 700W thermal design power, SXM form factor, 900GB/s NVLink bandwidth, and server options of "HGX H100 (4-8 GPUs), DGX H100 (8 GPUs)". The H100 NVL on the same table is a materially different product: 94GB, 3.9TB/s, 350-400W, PCIe dual-slot air-cooled, 600GB/s NVLink, and server options of "Partner systems (1-8 GPUs)". The [H100 NVL product brief](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/h100/PB-11773-001_v01.pdf), March 2024, documents that product separately.

The canonical identity for this child is therefore: vendor NVIDIA; architecture Hopper; model H100; form factor SXM; GPU memory 80GB; full physical device, not a partition. An offer failing any of these is not this product.

H200, GH200, H100 NVL, H100 PCIe, and any partitioned H100 are different instruments. They are out of scope and are not price-compared with this child under any normalization.

### Establishing SXM from seller evidence

A seller's label alone is frequently insufficient, so the child defines a graded evidence rule.

**Grade A, explicit designation**: the seller states SXM or SXM5. Observed for five of ten researched sellers.

**Grade B, HGX derivation**: the seller states HGX H100. This establishes SXM by NVIDIA's own product structure, because the H100 SXM's documented server options are HGX and DGX systems while the H100 NVL's are partner systems, so an HGX H100 baseboard carries SXM modules. Observed for five of ten sellers. This is a derivation from primary documentation, not an inference from price or from node size.

**Grade C, documented SKU mapping**: official instance documentation that identifies the underlying part.

**Insufficient**: a bare "H100" with no form factor, an "H100 NVLink" label that does not distinguish SXM from an NVL-based system, and any inference from price level or from the fact that an offer is sold in eights. These are excluded with reason `HARDWARE_VARIANT_UNRESOLVED`.

**This rule is outcome-determining and is recorded as such.** In the research sample, admitting Grade A only gives five participants and a median of $3.49; admitting Grades A and B gives ten participants and a median of $3.92, 12.5% higher. A rule that looks like bookkeeping moves the headline by more than a tenth. **The child adopts Grades A, B, and C**, because Grade B is a documented derivation rather than a guess, and because excluding half the market to avoid a derivation NVIDIA's own documentation supports would make the measure less representative, not more rigorous.

## Topology Class

NVIDIA documents no single-GPU SXM server. The SXM module is mounted on an HGX or DGX baseboard of four to eight accelerators, so **every single-accelerator H100 SXM offer in the market is an allocation from a multi-accelerator host**, not a standalone device. This is a structural fact about the product, and it shapes what can be compared.

The research found both commercial forms in active supply. Some sellers offer per-accelerator allocations from HGX hosts. Others sell only whole eight-accelerator nodes: one seller's entire H100 line is an eight-GPU HGX system priced per node, and another's InfiniBand tier begins at eight accelerators. A third offers one, two, four, and eight-accelerator instances of the same product.

Splitting the sample by topology class gives a median of $3.67 per accelerator-hour for per-accelerator allocations against $3.99 for whole-node and cluster products, a difference of 8.7%. The sample is too small for that gap to be conclusive, but its direction and size are consistent with whole-node products carrying a premium for dedicated interconnect and host resources.

**The child specifies the per-accelerator allocation class**, being an offer of one or more full H100 SXM accelerators allocated from an HGX host where the seller prices per accelerator and the buyer is not required to take a whole node. The whole-node class is a legitimate sibling series and is not merged into this one; per the family, dividing a node price by eight is arithmetic, not comparability. That sibling is not specified here.

## Procurement Mode

**On-demand, non-preemptible.** The research found this mode present across every researched seller that publishes a price at all, while interruptible and reserved pricing was narrower and more heterogeneous: one seller published a preemptible rate roughly half its on-demand rate, another published four separate reserved tiers by commitment length spanning 20%, and several publish reserved pricing only on request.

Interruptible capacity is excluded because it is a different product bearing interruption risk. Reserved and committed capacity is excluded because its price is inseparable from a commitment term and because it is frequently quote-only. Negotiated contracts are excluded as unobservable. Each is a candidate sibling series.

Promotional pricing is excluded by the family, and the research encountered a live instance: one seller published a headline instance rate labelled as a promotion with a stated expiry date, alongside its ordinary rate. The ordinary rate is the observation; the promotional rate is recorded and counted as a diagnostic.

## Tenancy, Virtualization, and Service Tier

The child requires **exclusive use of the full physical accelerator**. A virtual machine that passes through an entire H100 SXM qualifies; a shared or partitioned accelerator does not. Bare metal is not required, because the research found exclusive full-device access delivered through virtual machines across most of the market and no evidence that the hypervisor boundary is what moves price.

Fractional and time-shared products are excluded, per the family, and are not normalized into accelerator-hours.

The child makes requirements of: full-device exclusivity; non-preemptibility; and the accelerator identity above. It records as metadata, not requirements: host CPU and memory allocation; local storage; intra-node NVLink presence; inter-node fabric and its bandwidth; provisioning latency; and support terms.

That division is deliberately conservative, because **the research cannot yet show which service dimensions move price**. Separating the effect of inter-node InfiniBand from the effect of seller pricing strategy requires observations that vary one dimension at a time, which a single-day snapshot across ten sellers does not provide. Promoting any of these to a requirement without that evidence would discard offers on a guess.

## Bundle Envelope

Host bundles were recorded where sellers disclose them. Per accelerator, virtual CPU counts ranged from 16 to 26, a factor of 1.62, and host memory from 125GB to 256GB, a factor of 2.05. Four of ten sellers did not disclose the bundle on the price surface at all.

**No bundle envelope is fixed.** The observed virtual CPU range is tight enough that an envelope looks feasible, but the memory range is not, and with 40% of the sample not disclosing bundles at all, any envelope would be drawn through a fog. Setting one now would exclude sellers on the basis of what they happen to publish rather than what they supply.

The child therefore accepts bundle heterogeneity within the per-accelerator allocation class as **named accepted heterogeneity**, publishes the bundle dispersion of every observation, and records the envelope as unresolved pending a study that obtains bundles for the non-disclosing sellers. Synthetic decomposition remains prohibited: no imputed price is subtracted for CPU, memory, storage, or network.

## Geographic Taxonomy

**This is the first launch blocker, and it is a data problem rather than a design problem.**

The family makes regional series primary. Resolving a region taxonomy requires knowing which region each observation belongs to. In the research sample, **two of ten sellers exposed region on their public price surface**: one published separate United States and Europe price tables, and one marketplace exposes per-listing geography. The remaining eight published a single price with no region dimension, in at least two cases while advertising presence in dozens of regions.

A region-blind price cannot be assigned to a region without inventing the assignment, and inventing it would put a fabricated attribute into the identity of the observation. Three responses were considered. Publishing a region-blind series would contradict the family's regional-first architecture and would silently average across regions with different economics. Assigning region by seller headquarters or by guess would fabricate. Restricting the child to region-exposing sellers would leave two participants, which the family's own structural gate already rejects as not a market.

**No region taxonomy is adopted.** The experiment required is a study of seller APIs and consoles rather than marketing pages, because region is frequently a parameter of the ordering interface even where it is absent from the price table. Until that study establishes that region is recoverable for a workable majority of sellers, this child cannot publish.

## Availability Evidence

**This is the second launch blocker, and it is more serious than the first.**

The family requires that an eligible observation be accessible, not merely advertised. In the research sample, **one of ten sellers exposed a live capacity signal**. The remaining nine published a price with no indication whatsoever of whether anything was available at it. One seller published no price at all, offering "contact for pricing" across every tier, which the family already makes ineligible as quote-required.

The evidence grades observed were therefore: live allocatable capacity visible, one seller; explicit seller availability statement, none; price published with no capacity signal, nine; price absent and quote required, one.

Requiring the strongest grade admits one participant. Accepting the weakest grade admits nine, but that grade is precisely "a price appeared on a page", which is the advertised-price object the family explicitly rejected as a target. **The child cannot adopt either, and so adopts neither.**

The experiment required is an API and ordering-interface study to determine, per seller, whether an availability or capacity signal is obtainable at all, and whether an order for the specified configuration would be accepted. If that study finds that most of the market cannot evidence availability, the honest conclusion may be that a compute price benchmark on this product measures advertised prices or measures nothing, and the family would then need to decide which of those it is willing to publish. That is a parent-level question and is flagged as one.

## Seller-Level Reduction

**The family's central open question could not be tested, and the reason is itself a finding.**

The family permits three candidate reduction rules and asks the first child to compare the seller minimum, the seller median, and a canonical-zone selection. Testing them requires sellers with multiple qualifying offers in one region cell.

**Every seller in the research sample published exactly one price for the qualifying product.** There were no multi-offer cells, so the minimum, the median, and any zone selection are identical for every participant and the comparison is vacuous. The catalogue-breadth bias the family worried about did not appear, because the public price surface does not expose the breadth.

This does not mean the bias is absent. It means the surface that would reveal it, per-region and per-zone pricing, is the same surface that is hidden. The experiment required is identical to the region study: once per-region prices are recoverable, the multi-offer cells will exist and the three rules can be compared.

The rule therefore remains the family default, the seller minimum, **provisionally and untested**, and this child does not ratify it.

## Capacity-Source Attribution

The family makes the capacity source the aggregation participant: the infrastructure operator where reliably determinable, the seller otherwise.

**No seller in the research sample disclosed its infrastructure operator on its price surface.** The operator attribution rate from this source class is zero, no collapse events were observed, and the capacity source therefore equals the seller for every observation. The undetermined-operator share is 100%.

That is a real result rather than a failure of effort: specialist clouds present themselves as the operator, and whether they own, lease, or resell the underlying hardware is not published. The family's prohibition on inferring operator identity from price, geography, or configuration similarity means this cannot be closed by analysis.

The marketplace in the sample is a special case worth recording. It aggregates many independent hosts, so treating the marketplace as one participant understates the number of distinct capacity sources behind it, while treating each host as a participant would let one venue dominate the participant count. Neither is obviously right, and the family does not currently say which applies. This is raised in [Findings for the Parent Methodology](#docs-findings-for-the-parent-methodology).

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

The family's regional median applies unchanged, including the even-`N` convention. This child fixes the **percentile interpolation convention as linear interpolation between the two nearest ordered observations**, computed over the same final capacity-source population that produces the median, so that the headline and the distribution describe the same participants. Linear interpolation is chosen because it is the convention that requires no additional parameter and behaves continuously as participants enter and leave, which matters when participant counts are small.

## Publication Gates

**No numerical gate is adopted.** Every gate the family requires depends on quantities this research could not measure: participant counts per region depend on the unresolved region taxonomy; operator coverage is zero from this source class; carried and stale shares depend on unresolved freshness limits; and the availability evidence composition is the unresolved second blocker.

The one gate that can be examined is the minimum participant count, and the research gives a partial answer. Across the full sample of ten participants, removing any single participant moved the median by 0.63%, which indicates that at ten the statistic is robust. That result does not extend downward: with three participants the median is the middle observation and removing one moves it to an endpoint, and with two the family already refuses to publish. The sample offers no evidence distinguishing a minimum of three from four or five, because the region taxonomy that would produce regional participant counts does not exist yet.

The child therefore proposes no minimum above the family's structural floor and records that setting one requires regional participant counts from the region study. Choosing a number now would be choosing it for the reason the family explicitly forbids.

## Composition Changes

The family requires composition disclosure, and this research suggests it will matter here. The participants are few, the hardware-identity rule alone moves the median by 12.5% depending on which grades are admitted, and the topology split moves it by 8.7%. A benchmark with those sensitivities must show users when its composition changed.

The child adopts the family requirement and adds that **a daily percentage change must be annotated where the participant set changed**, where the prior observation was Delayed or Unavailable, or where the specification version changed. A composition-driven move is not presented as a market-price move.

## Published Surface

The future published surface, with no values:

UCPI-H100-SXM, for a canonical region: price in USD per H100 SXM accelerator-hour; one-day percentage change with a composition-changed annotation where applicable; procurement mode on-demand; topology per-accelerator allocation; service tier as specified; the capacity-source participant count; the availability evidence composition; the price distribution; the carried share; the as-of date; the status; and the family and child versions.

## Research Market Snapshot

> **Research snapshot only. These observations were collected on 12 September 2026 to validate the methodology. They are not published UCPI values, not a UCPI history, and not a provider list. No seller named here is proposed for inclusion in a production series.**

Ten sellers published a qualifying-class price for a product whose SXM identity could be established at Grade A or B. Prices per accelerator-hour ranged from $2.02 to $6.16, a spread of 3.05 times, with a median of $3.92 and an interquartile range of $0.41. The distribution is tight in the middle and long in both tails: the tenth percentile was $3.08 and the ninetieth $4.59, while the extremes sat well outside both.

Sellers researched, with the label each publishes: a marketplace publishing H100 SXM with both a floor and a platform median; two sellers publishing H100 SXM per accelerator; one publishing H100 SXM5 on a per-second serverless basis; one publishing H100 SXM in one, two, four and eight-accelerator instances; and five publishing HGX H100, of which one sells whole eight-accelerator nodes exclusively, one prices per accelerator from an HGX host, one sells clusters, one sells droplets, and one publishes quote-only pricing across all tiers.

Excluded observations, with reasons, each of which exercises a family rule: a seller publishing "contact for pricing" across every tier, ineligible as quote-required; a bare "H100" at $2.50 from a seller that separately lists H100 SXM at $3.20, excluded as `HARDWARE_VARIANT_UNRESOLVED`; an "H100 NVLink" at $2.60 from the same seller, excluded for the same reason; a promotional instance rate with a stated expiry, excluded as promotional while its ordinary rate was used; and a managed inference endpoint at $5.50 for the same hardware, excluded as a different service product rather than a compute rental.

That last exclusion is worth noting: the same seller offers the same accelerator at $3.90 as a rental and $5.50 as a managed endpoint. Without the family's product definition those would be two observations of one thing.

## Findings for the Parent Methodology

The family methodology was not modified by this work. Two findings are recorded for a separate amendment workflow.

**Marketplace participant identity is underspecified.** The family defines the capacity source as the operator where determinable and the seller otherwise, which resolves resale but not aggregation. A marketplace hosting many independent suppliers is one seller exposing many capacity sources, and the family does not say whether it contributes one participant or many. Treating it as one understates the distinct supply behind it; treating each host as a participant lets one venue dominate the count. This child treated it as one participant for research purposes and records that the family should decide the rule.

**The executability requirement may be unsatisfiable for this asset class.** The family requires accessible rather than advertised prices, which is correct in principle and which one seller in ten can currently evidence. If an API study confirms that availability is not recoverable for most of the market, the family faces a genuine choice between publishing an advertised-price object under a different and honest name, restricting to the small set that can evidence accessibility, or not publishing this product. That decision belongs to the parent.

Neither finding is worked around in this child.

## Decision Matrix

Each row records a family open question, what the H100 evidence showed, the decision, the confidence in it, and whether it blocks launch. This is the substantive output of the study.

- **Hardware identity and evidence.** Evidence: NVIDIA documents SXM at 80GB with HGX and DGX server options, distinct from NVL at 94GB on partner systems; one seller published three different "H100" labels at three prices. Decision: **resolved**, Grades A, B and C admitted, bare labels excluded. Confidence: high, grounded in primary documentation. Blocker: no.
- **Topology class.** Evidence: no single-GPU SXM server exists; both per-accelerator allocations and whole-node sales are in active supply; the two classes differ by 8.7% in the sample. Decision: **resolved**, per-accelerator allocation class specified, whole-node left as a sibling. Confidence: medium, the gap is directionally sensible but the sample is small. Blocker: no.
- **Procurement mode.** Evidence: on-demand present across every price-publishing seller; interruptible roughly half price at one seller; reserved spanning 20% across four tiers at another; several quote-only. Decision: **resolved**, on-demand non-preemptible. Confidence: high. Blocker: no.
- **Tenancy and virtualization.** Evidence: exclusive full-device access delivered through virtual machines across most of the market; no evidence the hypervisor boundary moves price. Decision: **resolved**, full-device exclusivity required, bare metal not required. Confidence: medium-high. Blocker: no.
- **Service-tier requirements.** Evidence: insufficient to isolate which dimensions move price from a single-day cross-section. Decision: **partially resolved**, only exclusivity, non-preemptibility and identity are requirements; the rest are metadata. Confidence: deliberately conservative. Blocker: no, but revisit.
- **Bundle envelope.** Evidence: 16 to 26 virtual CPUs per accelerator, a 1.62 times range; 125GB to 256GB host memory, a 2.05 times range; 40% of sellers did not disclose. Decision: **unresolved**, heterogeneity accepted and published. Confidence: low, the non-disclosure rate is the problem. Blocker: no, but it widens the claim.
- **Region taxonomy.** Evidence: two of ten sellers expose region on the public price surface. Decision: **unresolved**. Confidence: the finding is solid, the parameter is not. Blocker: **yes**.
- **Availability evidence minimum.** Evidence: one of ten sellers exposes a live capacity signal; nine publish price with none; one is quote-only. Decision: **unresolved**, neither the strong nor the weak grade is adoptable. Confidence: high in the finding. Blocker: **yes, and the most serious**.
- **Seller-reduction rule.** Evidence: every seller published exactly one qualifying price, so no multi-offer cell exists and the three candidate rules are identical. Decision: **untested**, family default retained provisionally and not ratified. Confidence: none, by construction. Blocker: **yes**.
- **Operator attribution and collapse.** Evidence: no seller disclosed its infrastructure operator; attribution rate zero; no collapse events; undetermined share 100%. Decision: **unresolved**, capacity source equals seller in this sample. Confidence: high in the finding. Blocker: **yes** for any gate that depends on operator coverage.
- **Freshness and carry.** Evidence: a single snapshot cannot measure update cadence; most sellers expose no price-effective timestamp; marketplace and static pages plainly differ by orders of magnitude. Decision: **unresolved**, no value proposed. Confidence: none. Blocker: **yes**.
- **Minimum participant gate.** Evidence: at ten participants, removing any one moved the median by 0.63%; no evidence distinguishes three from four or five, because regional counts do not exist. Decision: **unresolved** above the family's structural floor. Confidence: partial, robustness demonstrated only at ten. Blocker: **yes**.
- **Other publication gates.** Evidence: each depends on a quantity above that is itself unresolved. Decision: **unresolved**. Blocker: **yes**.
- **Tax convention.** Evidence: one seller explicitly excludes transaction taxes; most state nothing. Decision: **partially resolved**, family rule applies and unestablished basis is flagged; whether it disqualifies is unresolved. Confidence: medium. Blocker: no, but the flagged share is large.
- **Currency and FX.** Evidence: every qualifying observation was USD. Decision: **resolved for now**, USD index currency, no conversion arises. Confidence: high for this sample. Blocker: no.
- **Percentile convention.** Evidence: a methodology choice rather than an empirical one. Decision: **resolved**, linear interpolation over the final participant population. Confidence: high. Blocker: no.
- **Composition handling.** Evidence: identity rule moves the median 12.5%, topology 8.7%; the measure is composition-sensitive. Decision: **resolved**, composition disclosure required and percentage change annotated. Confidence: high. Blocker: no.

## Launch Blockers

**Resolved for this draft**: hardware identity and its evidence grades; topology class; procurement mode; tenancy and full-device exclusivity; the requirement-versus-metadata split for service dimensions; index currency; billing-granularity conversion; and the percentile interpolation convention.

**Requires further empirical observation**: the region taxonomy and whether region is recoverable per seller; the availability evidence minimum and whether any common grade exists; the seller-reduction rule, untestable until multi-offer cells are visible; price, availability, and reference-data freshness limits and the carry policy, requiring a repeated-observation study; the bundle envelope, requiring bundles for non-disclosing sellers; every numerical publication gate, which depends on regional participant counts; operator attribution, currently zero from public surfaces; and the tax-basis disqualification rule.

**Requires licensing and operational work**: lawful collection and retention terms per seller; API access where region and availability are recoverable only through an ordering interface; and whether historical reconstruction is feasible at all, which this research suggests it is not, since seller pricing pages are not archival and expose no price history.

**Requires a parent decision**: marketplace participant identity, and whether an executability requirement this asset class may not be able to satisfy should be relaxed, narrowed, or treated as a reason not to publish.

**This child does not claim launch readiness.** The single most important experiment is an API and ordering-interface study across the researched sellers, because region, availability, multi-offer structure, and in some cases bundle composition are all recoverable from the same place, and all four blockers move together.

## Sources and Evidence

Every source below was retrieved and read on **12 September 2026**. Prices are recorded to make the study auditable, not to propose any seller for inclusion; see the research-snapshot warning above.

### Primary hardware documentation

- **NVIDIA**, [H100 Tensor Core GPU product specifications](https://www.nvidia.com/en-us/data-center/h100/). Establishes the H100 SXM specification of 80GB, 3.35TB/s, up to 700W, SXM form factor, 900GB/s NVLink, and server options "HGX H100 (4-8 GPUs), DGX H100 (8 GPUs)"; and the distinct H100 NVL at 94GB, 3.9TB/s, 350-400W, PCIe dual-slot, 600GB/s NVLink, "Partner systems (1-8 GPUs)". Supports the hardware identity, the Grade B derivation, and the topology finding. Limitation: the current table lists SXM and NVL; the H100 PCIe 80GB variant is not shown on it and was not separately verified here.
- **NVIDIA**, [H100 NVL GPU Product Brief](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/h100/PB-11773-001_v01.pdf), PB-11773-001_v01, March 2024, retrieved in full. Confirms NVL as a separately documented product. Supports excluding NVL from this child.

### Seller price surfaces

Each entry records the label the seller publishes, the per-accelerator-hour figure used, and what the source establishes. All figures are on-demand unless stated.

- **Vast.ai**, [pricing](https://vast.ai/pricing). Publishes "H100 SXM" with both a floor and a platform median, $1.73 and $2.02; the median was used. Establishes Grade A identity, a live capacity signal, per-listing geography, and that a marketplace's floor and typical price differ materially. Limitation: a platform median is a different statistic from a single seller's price, which is the marketplace participant-identity question raised for the parent.
- **Hyperstack**, [GPU pricing](https://www.hyperstack.cloud/gpu-pricing). Publishes "NVIDIA H100 SXM" 80GB at $3.20 with up to 24 pCPU and 240GB RAM per GPU, billed per minute, alongside "NVIDIA H100 NVLink" at $2.60 and a bare "NVIDIA H100" at $2.50. Establishes Grade A identity, bundle figures, and, decisively, that one seller uses three different H100 labels at three prices, which is the empirical basis for the identity evidence rule.
- **RunPod**, [pricing](https://www.runpod.io/pricing). Publishes "H100 SXM" 80GB at $3.49 on its Secure Cloud tier with 20 vCPU and 125GB RAM, with per-hour and per-second billing toggles and a separate Community Cloud tier. Establishes Grade A identity, bundle figures, and service-tier variation within one seller.
- **Nebius**, [prices](https://nebius.com/prices). Publishes "NVIDIA HGX H100" at $3.85 on-demand and $2.15 preemptible, with 16 vCPU and 200GB RAM per GPU-hour. Establishes Grade B identity, bundle figures, and an on-demand-to-preemptible ratio.
- **Crusoe**, [cloud pricing](https://crusoe.ai/cloud/pricing/). Publishes "NVIDIA H100 80GB HGX" at $3.90/GPU-hr on-demand, spot by contact, and separately a managed inference deployment on the same hardware at $5.50/hr. Establishes Grade B identity and that the same hardware sold as a different service product carries a materially different price.
- **Modal**, [pricing](https://modal.com/pricing). Publishes "Nvidia H100 SXM5" at $0.001097 per second, converting to $3.9492 per accelerator-hour. Establishes Grade A identity and per-second billing conversion.
- **Lambda**, [pricing](https://lambda.ai/pricing). Publishes "NVIDIA H100 SXM" 80GB at $3.99 per GPU-hour in 1X, 2X, 4X and 8X instances with 208 vCPU, 1800 GiB RAM and 22 TiB storage per node, explicitly exclusive of sales tax, VAT and GST, with reserved capacity by contact. Establishes Grade A identity, per-accelerator bundle figures, the tax-basis convention, and multiple topology options from one seller.
- **Together AI**, [pricing](https://www.together.ai/pricing). Publishes "NVIDIA HGX H100" per GPU per hour: clusters at $1.99 preemptible, $3.99 on-demand, and reserved tiers of $3.69, $3.45 and $3.19 by commitment length; and an instance rate of $3.99 pay-as-you-go beside a $5.49 promotional rate with a stated expiry. Establishes Grade B identity, single-tenant exclusivity, the procurement-mode price spread within one seller, and a live promotional-pricing case.
- **DigitalOcean**, [GPU Droplet pricing](https://www.digitalocean.com/pricing/gpu-droplets). Publishes "NVIDIA HGX H100" at $4.41 per GPU-hour on-demand with 80GB GPU memory, 20 vCPU, 240 GiB memory and NVMe storage, and a 12-month reserved rate of $3.26. Establishes Grade B identity and bundle figures.
- **CoreWeave**, [pricing](https://www.coreweave.com/pricing). Publishes "NVIDIA HGX H100" as an 8-GPU node at $49.24/hr on-demand and $19.71 spot, stated as $6.16 per GPU, with 128 vCPU, 2048GB RAM and 61.44TB local storage per node, in separate United States and Europe tables. Establishes Grade B identity, whole-node-only topology, bundle figures, and that region exposure on a public price surface is possible.
- **Voltage Park**, [pricing](https://www.voltagepark.com/pricing). Publishes "contact for pricing" across on-demand Ethernet (1-1016 GPUs), on-demand 3200 Gbps InfiniBand (8-1016 GPUs), and long-term reserve. Establishes a quote-required observation, ineligible under the family, and that fabric type is itself a product distinction.

### Sources examined and not used for price evidence

- **AWS**, [EC2 P5 instances](https://aws.amazon.com/ec2/instance-types/p5/). Confirms P5 instances are powered by H100 GPUs and deployed in UltraClusters. No per-accelerator price is published on this page, so no observation was taken.
- **Microsoft Azure**, [Linux virtual machine pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/). Exposes NDsrH100v5 and related series with an explicit region selector. Recorded as evidence that hyperscalers expose region where specialist clouds largely do not; no observation was taken, because extracting a comparable per-accelerator figure requires resolving instance composition beyond this study's scope.
- **Google Cloud** and **Oracle Cloud** pricing pages were opened but did not yield a directly comparable per-accelerator H100 SXM figure without deeper navigation, and no observation was taken from either.

Third-party comparison sites and search results were used only to identify sellers to research directly, and none is cited as price evidence.

## Version History

**0.1.0-draft, 12 September 2026**: initial child specification and empirical market study. Launch blocked pending the parameters above. No production effective date.
