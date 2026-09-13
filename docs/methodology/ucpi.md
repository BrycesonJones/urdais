# Urdais Compute Price Index Family (UCPI)

**Status: proposed methodology, version 0.1.0-draft.** Prepared 12 September 2026. No production value, child specification, provider list, parameter set, or price history is established by this document. Nothing here describes live infrastructure.

This proposal follows the principles of the [Urdais methodology framework](/docs/methodology). It is a shared primitive rather than a published output: the framework's output template applies to the child instruments that consume it, not to this document. Rules expressed as requirements describe the proposed design, subject to approval. Parameters marked **unresolved** are launch requirements, not defaults. No UCPI child may be published until this family methodology has an approved version, a child specification exists, source licensing is secured, and the items in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required) are closed in a versioned release.

## Purpose and Scope

The Urdais Compute Price Index family measures what a precisely defined unit of market-accessible accelerated compute costs. It is a family, not a single index: each child instrument fixes one compute product and one commercial context, and this document defines the rules every child inherits.

This methodology owns the observation model, the identity framework for compute products and sellers, the source hierarchy, the normalization rules, the availability and eligibility framework, the aggregation architecture, the diagnostics, the publication statuses, corrections, lineage, and versioning. It does not define any particular piece of hardware. The first child, UCPI-H100-SXM, will be specified separately and will serve as the first empirical test of this architecture.

## Product Family Architecture

The family resolves into child instruments, each a separately specified and separately published series:

Urdais Compute Price Index family → UCPI-H100-SXM, UCPI-H200, UCPI-B200, UCPI-A100-SXM4, UCPI-RTX-5090, and future compute instruments.

**There is deliberately no headline index combining accelerators.** A single number averaging H100, H200, B200, A100, and consumer cards would have no stable economic meaning: those products differ in compute throughput, supported precisions, memory capacity and bandwidth, interconnect, workload suitability, power envelope, lifecycle stage, supply conditions, and cluster architecture. An average across them would move whenever the mix of observed products moved, independently of any price change, and would therefore fail the first requirement of a benchmark, that it represent the economic reality it claims to measure.

A quality-adjusted compute composite that expressed different accelerators in common performance units is a legitimate future research question. It would require an explicit, defended equivalence methodology, and it is not attempted here.

## Primary Measurement Question

> What does a defined unit of market-accessible compute cost?

Every word of that question carries weight. **Defined** means the compute product is pinned by a child specification before any price is compared; UCPI never assumes that compute is fungible. **Market-accessible** means the price must be one at which a buyer could actually obtain the product, not merely one that appears on a page. **Cost** means the mandatory cost of obtaining the defined product, not a headline rate that excludes unavoidable charges.

## What UCPI Measures

### The economic target

Five distinct price statistics could be called "the price of compute", and they are not interchangeable:

1. **The typical advertised price**: what sellers publish, whether or not anything is available at it.
2. **The typical executable offer price**: what a buyer approaching the market could actually transact at now.
3. **The capacity-weighted offer price**: the price attaching to the typical available unit of capacity.
4. **The transaction-weighted clearing price**: the price at which purchased compute actually cleared.
5. **The marginal cheapest available price**: the best price findable anywhere at that moment.

**UCPI targets the second: the typical executable offer price for the specified product.** That is the object the primary question describes, and it is the object a buyer can act on.

The other four are rejected as targets for specific reasons. The advertised price (1) measures publication, not the market: a price displayed beside no capacity is not formed by the competitive forces of supply and demand. The cheapest available price (5) is determined by whichever seller is currently most marginal, is the statistic most sensitive to a single erroneous observation, and answers a shopping question rather than a market question; market evidence in the [research appendix](#docs-research-precedents) shows a marketplace's own floor price and its own median differing by between seventeen and one hundred and three percent across accelerator models on a single day, so the choice between them is material rather than cosmetic. The capacity-weighted price (3) is the more economically complete object and is the natural future extension, but capacity is not reliably observable across providers and must not be fabricated. The transaction-weighted clearing price (4) is the ideal, and is not observable: compute transactions are private, contracts are negotiated, and no consolidated tape exists.

### The observable proxy, and the gap

Because the target is not directly observable in the way an exchange price is, UCPI states its proxy and its limits explicitly rather than blurring them.

The published statistic is a **robust central measure of the executable offer price for the specified product, taken one observation per eligible seller, across a defined region**. Each eligible seller contributes once, regardless of how many catalogue entries it publishes.

Three consequences follow and must be disclosed wherever UCPI is used.

- **UCPI is a seller-side accessibility statistic, not a volume-weighted market price.** It answers "what does the specified product cost across the sellers offering it" and not "what did the typical purchased accelerator-hour clear at". A seller with one available accelerator and a seller with ten thousand contribute equally, because their relative capacity is not reliably observable. Where most capacity concentrates with few sellers, the two questions can diverge materially, and the concentration diagnostics published with every observation exist so that a user can see when they are likely to.
- **UCPI is not an index level.** It is a price in currency per accelerator-hour. See [Published Values](#docs-published-values).
- **UCPI is not a cost model.** It measures the price of renting a defined product, not the cost of producing compute, the total cost of ownership of a deployment, or the cost of any workload.

## What UCPI Does Not Measure

UCPI does not measure model or token pricing. Prices charged for access to hosted models through an API are a different market layer, formed by different economics, and are outside this family entirely. A separate model-price methodology may later consume compute economics analytically; a token price is never a UCPI observation.

UCPI does not measure the price of compute in general. Each child measures one specified product, and a child's value must never be presented as the price of accelerated compute, of AI infrastructure, or of a vendor's product line.

UCPI does not measure performance, performance per currency unit, or value for money. It measures price for a specified product. Comparing two children to infer relative value requires a performance equivalence this family does not establish.

UCPI does not measure hardware acquisition prices, colocation or power costs, or the enterprise contract prices negotiated privately at scale, except to the extent such a contract is admitted as transaction evidence under the source hierarchy for a specification-matched product.

## Parent and Child Responsibility

The boundary is deliberate, and rules belong on one side of it only.

**This family methodology owns** the conceptual observation model; the identity frameworks for compute instruments, sellers, operators, and regions; the source hierarchy; the availability and executability framework; the procurement taxonomy; the service-tier framework; the principles for bundles, multi-accelerator offers, and fractional accelerators; price-component and currency normalization; temporal and freshness rules; the aggregation architecture; robustness principles; coverage and concentration diagnostics; missing-data behaviour; publication statuses; corrections; lineage; and versioning.

**A child specification owns** the exact hardware identity and its identity-defining attributes; the eligible service tiers; the single eligible procurement mode; the eligible regions and which series are published; any instrument-specific normalization; the numerical parameters this document leaves unresolved; the child's first publication date; and the child's own version history.

A rule that mentions a particular accelerator belongs in a child, not here. Nothing in this document is written to accommodate H100 specifically.

## Compute Instrument Identity

An accelerator model name does not define a comparable product. Two offers both labelled "H100" may differ in form factor, memory, interconnect, tenancy, minimum quantity, region, and service level, and the market evidence in the appendix shows a single provider publishing three distinct H100 variants at three distinct prices on one page.

A **compute instrument** is therefore defined by an explicit attribute set, and the child specification states which attributes are identity-defining for it. The family recognizes three categories of attribute, and the distinction matters because they are used differently.

**Identity-defining attributes** determine whether two offers are the same product at all. Differences here make offers incomparable and cannot be normalized away. They include the vendor; the accelerator family and model; the architecture generation; the form factor, which separates SXM, PCIe, NVL and equivalents; the accelerator memory capacity and type; whether the offer is a full physical device or a fractional partition; and whether the device is dedicated to one tenant or shared.

**Service and commercial attributes** determine the commercial context of an otherwise identical device. Differences here are not normalized away either, but they are handled by fixing them in the specification rather than by excluding the offer: the procurement mode, the service tier, the minimum quantity and node topology, the minimum commitment duration, and the region.

**Observation metadata** is recorded for lineage, diagnostics, and future research but does not by itself determine eligibility: the facility or availability zone, the bundled host resources, the billing granularity, the seller's catalogue identifiers, and the observed capacity where disclosed.

A child specification must state, for each identity-defining and commercial attribute, the required value or the permitted set. An attribute the child does not pin is an attribute along which its observations may vary, and every such attribute must be named as a known heterogeneity in the child's own limitations.

## Geographic Framework

Compute is not location-independent. Latency, power prices, data-sovereignty constraints, network access, local demand, and local capacity all affect price, so region is an economically meaningful dimension rather than metadata.

Regions are represented in a hierarchy from finest to coarsest: facility or availability zone; seller region label; metropolitan area; country; and canonical UCPI region. **Seller region labels are not comparable across sellers** and are never used directly for aggregation; each is mapped to a canonical UCPI region through a versioned mapping that records the evidence and effective interval for the mapping. The finest geography the source discloses is always retained even when the published series uses a coarser region, so that a future finer series can be constructed without re-collection.

The canonical region taxonomy is **unresolved** and must be approved with the first child. It must be coarse enough that eligible sellers exist within each region and fine enough that the offers within a region are plausibly substitutable for a buyer.

### Regional series are primary; a global series is deferred

**A child publishes regional series. A global series is not published until a defensible regional weighting basis exists.**

A global price is a weighted average across regions, and the weights are the whole of the economic content. Weighting regions equally would assert that a region with negligible capacity matters as much as one with most of it. Weighting by observation count would measure where sellers publish rather than where compute is. Weighting by capacity or by transactions would be defensible and requires data that is not currently available.

Publishing an unweighted global number would therefore embed an unexamined assumption in the most prominent figure Urdais produces for this market. The family declines to do so. This follows the same discipline applied elsewhere in Urdais: where a valid aggregation input does not exist, the aggregate is withheld rather than approximated. Whether region belongs inside a child's public identifier or is exposed as a dimension of one identifier is addressed in [Child Specification Requirements](#docs-child-specification-requirements).

## Seller, Operator, and Marketplace Identity

One physical accelerator can be offered through several commercial paths, and counting each as an independent market participant would overstate both the breadth of the market and the influence of whoever is being double-counted.

Three roles are distinguished. The **seller** is the counterparty with which a buyer would contract. The **infrastructure operator** owns or operates the physical hardware. The **marketplace** is a venue through which third-party sellers list capacity, and which may or may not itself be a seller.

Deduplication is performed at the level of the entity whose capacity is being offered, that is the operator where it is determinable, and the seller otherwise. Where a marketplace lists many third-party sellers, the family treats each distinct determinable operator as one participant rather than treating the marketplace as one participant or as many.

**UCPI does not claim reliable deduplication where the data does not support it.** Resale, white-labelling, and brokered capacity are frequently undisclosed. Every observation records the attribution basis, the share of eligible observations whose operator could not be determined is published as a diagnostic, and no inference of operator identity may be made from pricing similarity or from commercial speculation.

## Source Types and Hierarchy

The hierarchy adapts the benchmark-administration principle that inputs should be ranked, with concluded arm's-length transactions preferred and firm executable offers ranked above indicative information. It is adapted rather than copied because the compute market has almost no observable transactions, and a hierarchy that admitted only transactions would make the benchmark impossible rather than rigorous.

Ranked from strongest:

1. **Concluded transaction evidence**: an invoice or executed contract for a specification-matched product, where lawfully obtained and usable.
2. **Executable programmatic offer**: a seller API or machine-readable interface where the offer could be acted on at the observed price.
3. **Seller pricing page with contemporaneous availability evidence** for the specified configuration.
4. **Marketplace listing** that is executable at the observed price.
5. **Written seller quote** for a specified configuration, with its validity period.
6. **Licensed specialist dataset** whose own methodology is disclosed and assessable.
7. **Third-party aggregator or comparison site**, for discovery and corroboration only.
8. **Search results, press coverage, marketing material, and commentary**, for discovery only.

Tiers 1 through 5 may produce eligible observations. Tier 6 may produce eligible observations only where the dataset's methodology is disclosed, assessed, and recorded, and never where it is proprietary and unverifiable. **Tiers 7 and 8 never produce a production observation.** Search-engine snippets are not evidence of price.

Consistent with the benchmark principle that in a thin market a confirmed executable offer may carry more meaning than an isolated transaction, a tier 1 observation does not automatically override a tier 2 or 3 observation. A single negotiated contract at an unrepresentative price is not a better estimate of the executable market price than a set of contemporaneous firm offers. The hierarchy governs admissibility and recorded confidence; it does not mechanically override the aggregation rules.

Where sources conflict for the same seller, region, instrument, and tier, the higher tier prevails; where they conflict within a tier, the observation is flagged **Conflicted**, withheld from the calculation, and escalated rather than averaged.

## Raw Compute Offer

A raw offer is what a source says, recorded before any normalization and never overwritten. It captures the seller and, where determinable, the operator and marketplace; the source, its tier, and its retrieval evidence; the claimed compute instrument and every hardware attribute the source states; the region as the source labels it, with any finer facility identifier; the service tier and stated service-level attributes; the procurement mode; the price exactly as published, with its currency and billing unit; the minimum commitment duration; the minimum quantity and the node topology or bundle size in which the product is sold; all mandatory fees and whether tax is included; the bundled host resources; the availability state and the evidence for it; the observation timestamp and the effective timestamp of the price where the source discloses one; and the source provenance sufficient to re-examine it.

The raw offer is retained unchanged. Every later step produces a derived record that references it.

## Availability and Executability

**A posted price is not necessarily an actionable price.** Market evidence in the appendix includes an accelerator advertised at an hourly figure on a live marketplace beside the statement that there are no current offers, with the platform itself labelling the number a recent-market figure rather than a price. Treating such a number as the price of compute would misdescribe the market in exactly the direction that matters most: it would report cheap compute precisely when compute is unobtainable.

Availability is recorded as one of: **Available**, where the product can be obtained now; **Limited**, where it can be obtained subject to a stated constraint; **Waitlisted**, where access requires queueing; **Sold out**, where no capacity is offered; **Quote required**, where no price is transactable without negotiation; and **Unknown**, where the source discloses nothing.

Only Available, and Limited where the child admits it, may produce an eligible observation. Sold out, Waitlisted, and Quote required are ineligible for the price statistic. Unknown is ineligible for the headline but is retained.

The **advertised-versus-executable gap is itself market information** and is published rather than discarded. The count and price distribution of ineligible-but-advertised offers, particularly sold-out ones, is a scarcity signal: a widening gap between what is advertised and what is obtainable is precisely what a compute-market observer wants to see. Excluding those observations from the price while publishing them as a diagnostic preserves both the integrity of the statistic and the information.

An **availability evidence standard** grades how availability was established, from a programmatic confirmation that an order would be accepted, through an explicit contemporaneous status signal from the seller, to an inference from the absence of a sold-out indication. The minimum acceptable grade is a child parameter and is **unresolved**; the distribution of eligible observations across evidence grades must be published, because a child resting mostly on the weakest grade is making a weaker claim than one resting on the strongest, and users must be able to see which.

## Procurement Modes

Procurement modes are distinguished as: **on-demand**, available immediately without commitment and not subject to interruption; **spot or preemptible**, cheaper but interruptible at the seller's discretion; **reserved or committed**, priced against a commitment term; **negotiated or enterprise**, contracted privately; **auction or marketplace-dynamic**, where price is set by platform supply and demand; and **promotional, trial, or subsidized**, where the price is not the ordinary commercial price.

**Procurement mode is specification-defining. A child fixes exactly one mode, and modes are never blended into one series.** An on-demand hour, an interruptible hour, and an hour under a multi-year commitment are different products bearing different risk and different obligations, and a number averaging them would describe none of them. Where several modes are worth publishing for one instrument, they are published as sibling series that a user may compare deliberately, not merged into a single figure.

Promotional, trial, and subsidized prices are excluded from every child. They are not ordinary commercial prices, their availability is conditional in ways sources rarely disclose, and admitting them would let a marketing decision move a benchmark. They are recorded and counted as a diagnostic.

Dividing a committed-term price by the hours in the term produces an arithmetic hourly figure and does not produce an on-demand price. That arithmetic is permitted only within a series whose specification fixes that same commitment, and the resulting figure must always be published with the commitment that produced it.

## Service Tier and Service Level

Two prices for identical hardware are not comparable if one is a dedicated instance with an uptime commitment and the other is a shared, interruptible, best-effort instance. Market evidence in the appendix shows a single provider offering the same accelerators under two differently operated tiers on one page.

A **service tier** is a named bundle of service characteristics that a child requires. The family defines the dimensions a tier may constrain: tenancy, meaning dedicated or shared; interruption policy; uptime or availability commitment; provisioning and access model; support and replacement commitments; intra-node interconnect, such as NVLink or NVSwitch presence; inter-node fabric, such as InfiniBand or Ethernet and its bandwidth; attached storage and local disk; host CPU and memory allocation; virtualization and isolation model; and compliance or sovereignty attributes where they are economically material.

The family does not make every dimension a hard rule. It requires that a child declare, for each dimension, whether it is a **comparability requirement** that an offer must satisfy to be eligible, or **recorded metadata** that is preserved but not enforced. Dimensions treated as metadata become named heterogeneity in the child's limitations. Which dimensions must be requirements for a given instrument is an empirical question: it depends on whether they measurably move price, and that is tested before a child launches rather than assumed.

## Bundled Resources

Accelerator rentals are rarely sold as bare devices. The market evidence shows two sellers offering the same accelerator with materially different host bundles, one with roughly a hundred and twenty-five gigabytes of host memory and twenty virtual CPUs, another with roughly eighteen hundred gigabytes and over two hundred virtual CPUs across the node. The advertised price is therefore not a pure accelerator lease price in either case.

Four approaches were evaluated. **Accepting the bundle as part of the product** keeps prices auditable and observed, but compares products that differ. **Subtracting an estimated value for non-accelerator components** produces a purer accelerator price and requires inventing component prices that are not observed. **Standardizing bundle requirements** keeps comparability and reduces coverage. **Classifying incomparable bundles into separate series** is precise and fragments the measure.

**The family selects a combination of the first and third: bundles are accepted as part of the specified product, within bounds the child declares.** A child states the host-resource envelope it treats as ordinary for the instrument, offers outside that envelope are ineligible rather than adjusted, and the bundle composition of every eligible observation is retained and its dispersion published.

**Synthetic decomposition is prohibited.** UCPI does not subtract an imputed price for virtual CPUs, host memory, storage, or networking in order to derive an accelerator-only price. Doing so would replace an observed price with a modelled one whose value depends on component prices Urdais would have to invent, and would forfeit the property that every published figure traces to prices someone actually offered. Whether a defensible decomposition is possible is recorded as a research question, not adopted.

## Multi-Accelerator Offers and Node Topology

Sellers offer the same accelerator as a single device, as a multi-device instance, as a complete node, and as a cluster. The market evidence shows a seller quoting a cluster product per accelerator-hour at three different prices for sixteen, sixty-four, and two hundred and fifty-six or more accelerators, alongside single-device instance pricing for a different product.

Dividing a node price by its accelerator count is arithmetic. It is not economic equivalence, because it conceals the mandatory purchase quantity, the intra-node interconnect, the host resources, the network fabric, and any cluster premium or discount. An eight-accelerator node is not eight independent single-accelerator rentals, and the quantity tiers in the evidence show that sellers themselves price the difference.

**Per-accelerator normalization is permitted only within a declared topology class.** A child specification fixes the node topology and minimum quantity it measures, and division by accelerator count is then a unit conversion within a fixed product rather than a comparability claim across products. Minimum quantity and topology are always retained on the observation, never normalized away, and a child that admits more than one topology class must publish them as separate series.

## Shared and Fractional Accelerators

Fractional products, including hardware-partitioned instances, time-shared devices, and virtualized fractions, are offered alongside full devices; the market evidence shows a partitioned product listed in the same catalogue as full accelerators.

**A fractional or shared offer never enters a full-device child.** Multiplying a fraction's price to a notional full-device price assumes that partitions aggregate linearly into a device, which is not true of throughput, of memory bandwidth, or of the commercial product being sold. Full-device dedication is an identity-defining attribute, so a fractional offer is a different instrument, not a differently priced one.

Fractional compute is a legitimate future family member with its own specification and its own unit. It is out of scope here.

## Price Components

The price entering an observation is the **mandatory cost of obtaining the specified product for the specified duration**. That includes the compute rental charge, any mandatory platform, reservation, or support fee required to access the product, and any mandatory minimum spend, expressed on the same basis.

It excludes charges that depend on how the buyer uses the product rather than on obtaining it, including data egress, additional storage beyond the specified bundle, and optional support upgrades. It excludes optional extras entirely.

**Prices are recorded exclusive of transaction taxes**, with the tax treatment of the source recorded. Market evidence shows at least one seller publishing prices explicitly exclusive of sales tax, value-added tax, and goods-and-services tax, while others publish without stating a basis. Comparing a tax-inclusive price with a tax-exclusive one would introduce a jurisdictional artifact into a price comparison; where a source's tax basis cannot be established, the observation is flagged and its share published.

Credits, coupons, and promotional discounts are not applied. The ordinary commercial price is the observation, consistent with the exclusion of promotional procurement.

## Unit Normalization

The normalized unit is **currency per accelerator-hour**, and it means the mandatory cost of one full, dedicated physical accelerator of the specified instrument, for one hour, under the specified service tier, procurement mode, topology, and region.

That definition is narrow on purpose, and the constraints that make it meaningful are carried by the specification rather than by the arithmetic. Conversions are permitted where they are unit changes within a fixed product: per-second or per-minute billing converts to an hourly basis; a node price divides by accelerator count within a declared topology class; a committed-term price divides by the contracted hours within a series that fixes that commitment.

Conversions are prohibited where they would cross a product boundary: from a fractional device to a full device; from a shared device to a dedicated one; from one procurement mode to another; from one topology class to another; or from a quoted price whose mandatory quantity differs from the specification.

**Arithmetic convertibility is not economic comparability.** A monthly commitment divided by its hours yields an hourly number that describes a fundamentally different procurement product from an hour of on-demand access, and the family's response is to keep them in different series rather than to trust the division.

## Currency Normalization

Children normalize eligible prices to a stated index currency, expected to be USD. The native price and native currency are always retained, the conversion is always recorded with the rate and its source and timestamp, and a converted value never overwrites an observed one.

The rate source and fixing convention, the relationship between the fixing and the observation timestamp, the treatment of stale rates, whether triangulation is permitted where no direct rate exists, and rounding conventions are **unresolved** launch parameters. Where no acceptable rate exists for an observation, the observation is excluded rather than converted at a stale or substituted rate.

## Temporal Observation Rules

**Proposed initial frequency: daily.** One observation per child per calculation date. Real-time and intraday values are not proposed, and nothing here should be built to support them.

Compute prices do not update on a market calendar. Seller pages change irregularly and often without a disclosed timestamp; marketplace prices can move continuously; quoted and contracted prices arrive episodically. The family therefore distinguishes four times on every observation: the **observation timestamp**, when Urdais retrieved the source; the **effective timestamp**, when the price became effective where the source discloses it; the **calculation cutoff**, after which no input may enter that date's value; and the **publication timestamp**.

A calculation date is a calendar date. Because the market does not close, weekends and holidays are ordinary calculation dates, and any systematic weekend or holiday effect in seller updating behaviour is a measurement characteristic to be quantified in validation rather than corrected by assumption. **Look-ahead is prohibited**: a value for a date uses no input whose retrieval time is after that date's cutoff, and a later-discovered price is applied prospectively or through the correction rules, never inserted into a published date.

The calculation cutoff, the publication target, and the publication deadline are **unresolved**.

## Freshness and Staleness

A seller page that has not changed may mean the price is unchanged, or may mean nothing was published and nothing was checked. Many sources expose no update timestamp, so the family records what was actually established rather than inferring.

Each observation carries a freshness state: **Reconfirmed**, where the source was retrieved within the current cycle and the price was unchanged; **Newly observed**, where the price changed at this retrieval; **Carried**, where the source could not be retrieved this cycle and a prior value is being relied upon, with its age; **Source unavailable**, where retrieval failed and no value is relied upon; and **Withdrawn**, where the seller no longer offers the instrument.

Carried observations are permitted only within a maximum age that is **unresolved** and must be set from measured seller updating behaviour. **A carried observation is never presented as current**: its age is recorded, the share of an observation's coverage that is carried is published, and a child whose carried share exceeds its gate is not published as a normal value. Beyond the maximum age the observation becomes ineligible and the seller drops out of coverage rather than persisting indefinitely at a stale price.

## Seller-Level Aggregation

**The unit of observation is the seller, not the offer.** A seller publishing a hundred configurations must not carry a hundred times the influence of a seller publishing one; catalogue verbosity is an artifact of how a business structures its product page and carries no market information.

Eligible offers are therefore reduced to at most one **seller-level observation** per seller, per instrument, per region, per service tier, per procurement mode. Because the child specification has already pinned the product, the offers competing within such a cell describe the same product from the same seller.

**The proposed default rule is the lowest eligible offer price within the cell**, on the reasoning that the specification has fixed the product, so a lower price for an identical specification is simply the price at which that seller will supply it, which is the quantity the target statistic is about. Two alternatives are recognized and must be tested: the **median eligible offer within the cell**, which is less sensitive to a single cheap zone, and a **capacity-weighted price within the cell** where capacity is disclosed.

One asymmetry is recorded now rather than discovered later: where a seller offers the specified product in several zones within a region at several prices, the lowest-price rule selects the cheapest zone, and sellers with more zones therefore get more opportunities to present a low price. Whether that materially biases the seller-level observation is an empirical question listed for validation, and the rule may be replaced on that evidence.

## Regional Aggregation

The regional value is a **robust central measure across seller-level observations within the canonical region**, with each eligible seller weighted equally.

The proposed central measure is the **median across seller-level observations**. A median is chosen over a mean because the distribution of compute prices is not symmetric and contains legitimate extreme values at both ends: genuinely scarce capacity priced high, and marginal or distressed capacity priced low. A mean would let one such value move the published price substantially, while a median reports the middle of the market and is unaffected by how extreme the extremes are.

Equal seller weighting is a deliberate answer to a question, not a convenience. It asks what the specified product costs across the sellers who offer it. It does not ask what the typical available accelerator-hour costs, which would require capacity weights, nor what purchased compute cleared at, which would require transaction weights. The [What UCPI Measures](#docs-what-ucpi-measures) section states this limitation, and it must accompany the published value.

Alternatives are retained for validation rather than dismissed: capacity weighting where capacity becomes reliably observable, transaction weighting where transaction evidence becomes sufficient, and trimmed or winsorized means. None may be adopted without evidence that the required inputs exist and are reliable.

## Global Aggregation

No global value is published in this version. The reasoning is in [Geographic Framework](#docs-geographic-framework): a global price is a regional weighting, no defensible weighting basis currently exists, and an arbitrary one would be embedded in the most visible number produced.

When a basis does exist, the family will define it by amendment. The candidate bases, in order of preference on economic grounds, are observed regional capacity, observed regional transaction volume, and observed regional seller counts. Equal region weighting is not a candidate: it asserts a claim about regional importance that is certainly false.

Until then, a user comparing regions does so explicitly, using regional series that each state their own coverage.

## Weighting Philosophy

Weighting is not a technical detail, and the family states its philosophy plainly: **the economic question is chosen first, and the weighting follows from it.**

Equal-seller weighting asks what the typical seller charges for the specified product. Capacity weighting asks what the typical available unit of capacity costs. Transaction weighting asks what purchased compute cleared at. Cheapest-available asks what the best obtainable deal is. These are four different questions with four different answers, and a benchmark that does not say which one it is answering is not a benchmark.

UCPI answers the first, because it is the question the available data can support honestly, and it publishes the diagnostics that reveal where the first and second answers would diverge. Where data later supports the second, it will be added as a distinct series with its own name, not substituted silently into an existing one.

## Robustness and Outliers

Compute price distributions contain data errors, stale prices, reseller markups, scarcity premiums, and unusually cheap marginal capacity. Only the first two are defects. **Price dispersion is market information, and the methodology must not destroy it in the name of cleanliness.**

The family therefore prefers **explicit validation rules over statistical clipping**. An observation is excluded because a rule identifies it as invalid, for example a unit mismatch, a misidentified instrument, a region-mapping failure, a currency error, an expired quote, or an unresolvable source conflict, and the rule and its reason are recorded. An observation is not excluded merely for being far from the others.

Statistical dispersion measures are used as **diagnostics that trigger review**, not as automatic deletion. A robust dispersion measure such as the median absolute deviation may flag an observation for examination, and the outcome of that examination is recorded as either a validation failure with a reason or a confirmed genuine price that remains in the calculation.

The choice of a median as the central measure already provides the necessary resistance to a small number of bad values without deleting them. Trimming and winsorization are recorded as alternatives requiring evidence that they improve the measure, and no trimming fraction is adopted here.

## Coverage and Concentration

A price derived from too few sellers, or dominated by one, has stopped representing a market. Benchmark design principles require that sample adequacy, market size, and the distribution of activity among participants be considered in construction, and the family makes that concrete by publishing the relevant diagnostics with every observation rather than only assessing them internally.

Each published observation carries: the eligible seller count; the eligible operator count and the share of observations whose operator is undetermined; the largest seller's share and the **effective seller count**, computed as the reciprocal of the sum of squared seller shares; the eligible offer count before reduction to seller level; the price distribution as tenth, fiftieth, and ninetieth percentiles and the interquartile range; the source-tier distribution; the availability evidence-grade distribution; the carried and stale shares; the share of advertised-but-ineligible offers with their reasons, including sold-out offers; and, where measurable, capacity coverage.

These exist so a user can tell the difference between a price supported by fifteen sellers in a liquid region and a price supported by two, without inferring it from the number itself.

## Missing Data

Nothing is fabricated. Where inputs are absent, the family's response is to narrow the claim, not to fill the gap.

A seller that disappears from coverage leaves the calculation, and the change in seller count is published. A source that cannot be retrieved produces a carried observation within the freshness limit and an excluded one beyond it. A region that loses coverage below its gate produces a value that is not published as normal. Where only one eligible seller remains, no regional value is published, because a single seller's price is not a market price; it may be published as a seller-level diagnostic. An observation whose availability cannot be established is ineligible. Sources that conflict irreconcilably produce a Conflicted observation that is withheld and escalated. A price shown as requiring a quote is not a price.

**Carrying an observation forward is always visible.** Its age, its share of coverage, and its effect are published; a silent carry is prohibited in every case.

## Publication Gates

A child publishes a normal value only when the measure still represents its market. The gates are defined here as concepts; **their numerical values are unresolved** and must be set from measured coverage, not chosen so that a series publishes.

The gates are: a minimum eligible seller count; a minimum eligible operator count; a maximum largest-seller share; a minimum effective seller count; a maximum carried or stale share; a maximum share of observations resting on the weakest availability evidence grade; a minimum source-tier standard; and a maximum share of observations with unresolved bundle or comparability status.

Two conditions are structural rather than parametric and apply now: a region with no eligible seller-level observation has no value, and a region with exactly one has no market price. Both produce Unavailable.

Failing a gate produces a Delayed or Unavailable observation with the failing gate named. It never produces a value computed from a residual set and presented as if complete.

## Published Values

**A UCPI child publishes a price level, not a rebased index.** The published quantity is currency per accelerator-hour for the specified product.

Rebasing to an arbitrary base of one hundred was evaluated and rejected. Official price indices rebase because they chain heterogeneous matched specifications over long periods, where no single unit price is meaningful across the whole series. UCPI's unit is homogeneous by construction, because the child specification pins the product, so the level carries direct economic meaning that a buyer can act on, and converting it into an index number would discard that meaning and add an arbitrary base date without adding information.

Consistent with Urdais convention, **percentage change is the headline change signal**. The currency difference between two levels is a legitimate analytical quantity and is not the headline; the two are labelled distinctly and never presented interchangeably.

Each observation publishes the price level; percentage changes over defined periods computed from unrounded values; the instrument, region, procurement mode, and service tier that define it; the coverage and concentration diagnostics; the as-of date; the status; and the family methodology version, child specification version, and parameter set.

Dispersion is published alongside the level rather than as a separate product. Retaining the percentile distribution and cross-seller spread preserves the information that future scarcity, fragmentation, and regional basis analytics would require, without committing to those products now.

## Historical Integrity and Lineage

Every published value must be traceable through:

UCPI Child Observation → UCPI Family Methodology Version → UCPI Child Specification Version → Eligible Seller-Level Observations → Normalized Offers → Raw Compute Offers → Seller and Marketplace Sources

For any historical date it must be possible to answer which instrument definition applied; which sellers and operators were eligible and which were excluded with which reason; what offers existed and on what commercial terms; what region mapping and service-tier classification applied; what availability evidence supported each observation; what currency conversion was used; what aggregation rule applied; which methodology and specification versions governed the result; and what information was actually available at that time.

Retain raw offers, rejected and superseded observations, source retrieval evidence and vintages, and the mapping and classification decisions with their effective intervals. A historical value must never change because a mapping, a taxonomy, or a parameter changed later.

Any series computed for dates before a child's first live publication is labelled **reconstructed** research history, carries its limitations, and is never presented as live history. Reconstruction is feasible only where historical source evidence was lawfully retained; because seller pricing pages are not archival and rarely expose history, **a reconstructed UCPI history may not be feasible at all**, and that limitation is to be established rather than assumed.

## Corrections and Restatements

Distinguish, each with its own record: an **input correction**, where a price, currency, instrument identity, region mapping, availability state, or commercial term was wrong; a **classification error**, where procurement mode or service tier was misassigned; a **duplication error**, where one operator's capacity was counted more than once; a **staleness error**, where a withdrawn or stale offer was treated as current; a **calculation error**, where these rules were misapplied; and a **publication error**.

These are not: a genuine price change, a seller entering or leaving coverage, or a methodology amendment with a future effective date.

Handling follows the Urdais convention. Inside the correction window, restatement, with each restated value carrying the original value, the reason, the detection and republication timestamps, and the status **Corrected**, and the original retained as **Superseded**. Outside the window, history is ordinarily left as published and the correction applied prospectively with a notice. An **exceptional historical restatement** may be made only where an error materially compromises the integrity, interpretability, or reproducibility of the series; it must be publicly documented, identify the affected observations, preserve the originals, record the reason and approval, and be published as a distinct event. This is a high bar and not a licence to tidy small errors.

The correction window and materiality threshold are **unresolved**. History is never silently overwritten.

## Status Model

Observation status, one per published date: **Published**, **Delayed**, **Unavailable**, **Corrected**, and **Superseded**, with the same meanings used across Urdais outputs.

Input status is separate and never collapsed into the headline status: **Valid**, an observation meeting every eligibility rule; **Stale**, resting on a carried price within the freshness limit; **Ineligible**, excluded by a named rule with its reason; **Unavailable**, where the source could not be retrieved; and **Conflicted**, where sources disagree irreconcilably and the observation is withheld.

Both are published, because a value resting on many carried observations is making a weaker claim than one resting on freshly confirmed ones.

## Conceptual Data Requirements

These describe information the family requires. They are not database tables, and no schema is defined here.

- **ComputeInstrument**: vendor, family, model, architecture generation, form factor, memory capacity and type, full-device or fractional designation, the identity-defining attribute set, and effective interval.
- **Seller**: legal identity, seller type, marketplace relationship where applicable, geographic scope, and effective interval.
- **InfrastructureOperator**: identity where determinable, the evidence establishing it, the relationship to sellers, and an explicit undetermined state.
- **Marketplace**: venue identity, whether it is itself a seller, and how third-party sellers are identified on it.
- **Region**: canonical region identity, the seller region labels mapped to it, the finer facility identifiers retained, the mapping evidence, and effective interval.
- **ServiceTier**: tenancy, interruption policy, uptime commitment, provisioning model, support and replacement commitments, intra-node interconnect, inter-node fabric, storage, host resources, virtualization model, compliance attributes, and, for each, whether the child treats it as a requirement or as metadata.
- **ComputeOffer**: the raw offer as defined in [Raw Compute Offer](#docs-raw-compute-offer), retained unmodified.
- **NormalizedOffer**: the derived price on the normalized unit and currency, the conversions applied with their inputs, the preserved commercial constraints, and the normalization status.
- **EligibilityAssessment**: the eligibility outcome, the rule applied, the exclusion reason where excluded, the availability evidence grade, and the source tier.
- **SellerPriceObservation**: the seller-level representative price, the offers considered, the selection rule applied, and the input status.
- **UCPIChildSpecification**: the instrument definition, region definitions and published series, service-tier requirements, the single procurement mode, instrument-specific normalization, the parameter set, the publication gates, and the child's version.
- **UCPIObservation**: child identifier, region, price level, percentage changes, the full diagnostic set, status, family and child versions, parameter set, and the calculation and publication timestamps.
- **SourceReference**: source identity, tier, retrieval evidence and timestamp, licensing basis, and retention rights.
- **FXObservation**: currency pair, rate, source, fixing time, and status.
- **MethodologyVersion** and **CorrectionRecord**, with effective dates and change records.

## Source Specification

Production requires: seller pricing interfaces, preferring machine-readable and executable ones; marketplace listing data with availability; seller contract and quote documents where lawfully usable; transaction or invoice evidence where lawfully obtainable; hardware reference data sufficient to resolve instrument identity; region and facility reference data; currency rates; and licensed specialist datasets where their methodology is disclosed.

**Scraping is not a production data model where it is not permitted.** Whether a given source may be collected, stored, and retained is a licensing and terms question that must be resolved per source before that source contributes to a published value, and a source that cannot be lawfully retained cannot support a reproducible benchmark.

## Data Quality Rules

Before a value is published, at minimum: every observation resolves to exactly one instrument, seller, region, service tier, and procurement mode; instrument identity is established from stated hardware attributes rather than from a product name alone; units and billing granularity are validated and conversions are within their permitted class; currency and tax basis are established; mandatory fees are included and optional charges excluded; minimum quantity, topology, and commitment are recorded and consistent with the specification; availability state and evidence grade are recorded; freshness state and age are within limits; region mapping is current and evidenced; no operator is counted twice where attribution is determinable; seller-level reduction applied exactly one rule; the aggregation produced a finite positive price; every diagnostic is computed and every gate evaluated; and the lineage record is complete.

A failed critical check blocks the affected observation, or the published value where it concerns coverage or aggregation. It never authorizes imputation. Numerical tolerances require production data and are **unresolved**.

## Licensing and Reproducibility

UCPI's reproducibility claim is bounded by what may lawfully be retained. Seller pricing pages, marketplace listings, and specialist datasets carry terms that may restrict collection, storage, redistribution, and historical retention, and those terms differ by source and change over time.

An observation is independently reproducible only where the evidence behind it may be retained and re-examined. Where retention is not permitted for a source, the limitation is recorded and the affected observations are marked as not independently reproducible. Securing lawful collection and retention for the intended source set is a launch requirement and a genuine constraint on achievable coverage; coverage that cannot be licensed is a published limitation, not an assumption.

## Methodology Versioning

The family carries its own version, independent of any child. Each published observation identifies the family methodology version, the child specification version, and the child parameter set.

A change to family rules is announced with a prospective effective date, a documented rationale, and an impact assessment, and does not alter observations before that date. A change to a child specification affects that child only. Editing this public page is not a production change.

Version history: **0.1.0-draft, 12 September 2026**, initial research-backed proposal; no production effective date.

## Child Specification Requirements

A child specification is approved separately and must state: the instrument identity and every identity-defining attribute value; the service-tier requirements and which dimensions are requirements rather than metadata; the single procurement mode; the node topology class and minimum quantity; the host-resource envelope treated as ordinary; the canonical regions and which series are published; the minimum availability evidence grade; the freshness limit; the seller-level selection rule; the publication gates with numerical values; the currency and rate convention; the instrument-specific normalization, if any; the named heterogeneities the child accepts; and its own version and first publication date.

### Naming

Three identifiers are distinguished. The **public display name** is what a user sees, of the form UCPI followed by the instrument designation, for example UCPI-H100-SXM. The **canonical instrument identifier** carries every identity-defining and commercial attribute, including those not shown publicly, and is what a calculation and a lineage record reference. The **specification version** identifies the parameter set in force.

A public display name is therefore not sufficient to identify what is being measured, and a published value must always appear with its region, procurement mode, and service tier rather than relying on the name to convey them. Region, procurement mode, and service tier are **dimensions of a child rather than components of its display name**, so that a user filtering by region compares like with like within one specification; whether any of them should additionally appear in a display name is a presentation decision for the child, not a methodology decision. The concrete naming details are **unresolved** and settle with the first child.

## Open Questions / Empirical Validation Required

No production value may be published under this draft. The following require real observations, licensing decisions, or testing, and are recorded rather than resolved by assumption.

- **Canonical region taxonomy**: the region set, the mapping from seller labels, and whether offers within a proposed region are plausibly substitutable.
- **Global weighting basis**: whether regional capacity, transaction volume, or another defensible basis becomes available, and what a global series would measure if it did.
- **Seller-level selection rule**: whether lowest-eligible, median-eligible, or a capacity-weighted rule better represents a seller's accessible price, and the size of the multi-zone asymmetry the lowest-eligible rule introduces.
- **Regional central measure**: whether the median is the right central measure against alternatives, tested on observed distributions rather than assumed.
- **Publication gates**: the numerical values for seller and operator counts, concentration, effective seller count, carried and stale shares, and evidence-grade composition.
- **Availability evidence standard**: what grades are achievable across sellers, what share of the market can support the stronger grades, and what minimum a child can require without emptying itself.
- **Freshness limits**: measured seller updating behaviour, including any weekend and holiday pattern, and the maximum defensible carry age.
- **Service-tier requirements**: which dimensions measurably move price for a given instrument, and therefore which must be requirements rather than metadata.
- **Bundle envelope**: the observed dispersion of host resources for a given instrument, and whether a defensible ordinary envelope exists.
- **Topology and quantity**: the distribution of minimum quantities and topology classes, and whether separate series are needed.
- **Operator attribution**: what share of offers permits operator determination, and the measured extent of undetected duplication.
- **Source tiers and licensing**: which sources are lawfully collectable and retainable, what tier each supports, and the coverage achievable under those constraints.
- **Currency conventions**: rate source, fixing, staleness tolerance, and triangulation.
- **Calculation cutoff and publication timing.**
- **Correction window and materiality threshold.**
- **Reconstructed history feasibility**: whether any point-in-time history can be built at all under available retention rights, without survivorship or look-ahead bias.
- **Capacity weighting feasibility**: whether capacity is ever observable reliably enough to support a distinct capacity-weighted series.

### Validation programme

Before a child launches, test on real point-in-time observations: seller and operator coverage by region; instrument-identity consistency and how often a product name alone would mislead; the achievable availability verification rate and evidence-grade distribution; the procurement-mode and service-tier distribution; bundle heterogeneity; the distribution of minimum quantities and topologies; normalized price dispersion within and across sellers and regions; disagreement between sources for the same product; detectable seller and operator duplication; stale-price and revision frequency; outlier behaviour and how often statistical flags correspond to real defects; regional basis; seller concentration and effective seller count; whether capacity data exists in usable form; the sensitivity of the published value to the seller-level rule, the central measure, and the eligibility boundaries; weekend and holiday updating behaviour; and historical source-retention feasibility.

Parameters must not be chosen to make a child publish. A child that cannot pass defensible gates is not launched.

## Research Precedents

Primary sources retrieved and read on 12 September 2026 are summarized below. Each states what problem it informs and what this family adopts, modifies, or rejects. Market observations are recorded as evidence of market structure, not as a provider list, and no price quoted here is a Urdais value.

### IOSCO, Principles for Financial Benchmarks

The [Principles for Financial Benchmarks](https://www.iosco.org/library/pubdocs/pdf/ioscopd415.pdf), Final Report, July 2013, is the closest institutional precedent for administering a benchmark over a market without a consolidated tape. Principle 6 requires that benchmark design "achieve, and result in an accurate and reliable representation of the economic realities of the Interest it seeks to measure", taking into account the adequacy of the sample, the size and liquidity of the market, and "the distribution of trading among Market Participants (market concentration)". Principle 7 requires that data be "formed by the competitive forces of supply and demand" and "anchored by observable transactions entered into at arm's length", while clarifying that the principle "does not preclude the use of non-transactional data for such types of indices that are not designed to represent transactions and where the nature of the index is such that non-transactional data is used to reflect what the index is designed to measure". Principle 8 sets a hierarchy running from concluded arm's-length transactions in the underlying interest, through transactions in related markets, to "Firm (executable) bids and offers", and then other market information, and it notes that "there might be circumstances (e.g., a low liquidity market) when a confirmed bid or offer might carry more meaning than an outlier transaction". Principle 9 requires that the exercise of judgment be explained, while noting that a benchmark "based exclusively on executable quotes as contemplated by Principle 7 would not need to explain in each determination why it has been constructed with executable bids or offers, provided there is disclosure in the Methodology". Principle 12 requires the published methodology to state input selection, "priority given to certain data types, minimum data needed to determine a Benchmark", and the procedures governing determination under market stress.

**Adopt:** the ranked data hierarchy with executable offers admitted as a legitimate primary input; the requirement that a benchmark built on executable offers disclose that fact in the methodology, which is why [What UCPI Measures](#docs-what-ucpi-measures) states the target and the proxy explicitly; the treatment of market concentration as a design consideration, made concrete as published diagnostics; the requirement to state minimum data needed, made concrete as publication gates; and the point that a confirmed offer may outrank an outlier transaction, which is why the hierarchy governs admissibility rather than mechanically overriding aggregation. **Modify:** the hierarchy is rewritten in compute-market terms, since the compute equivalents of transactions and firm quotes are invoices, executable programmatic offers, and marketplace listings rather than dealer submissions. **Reject:** nothing material; this is a principles framework rather than a rule set, and it is used as such.

### U.S. Bureau of Labor Statistics, Producer Price Index for Data Processing and Related Services

The [BLS factsheet for NAICS 518210](https://www.bls.gov/ppi/factsheets/producer-price-index-for-the-data-processing-and-related-services-industry-naics-518210.htm), dated 7 November 2008, describes how an official statistical agency prices a heterogeneous computing service. Prices come from a probability-selected actual contract, companies provide "net transaction prices for a specified service" monthly, and "the price-determining characteristics are held constant while the service is repriced", with the same selected contract repriced each period.

**Adopt:** the matched-specification principle, which is the foundation of the parent-child architecture. Holding price-determining characteristics constant and repricing the same specified thing is exactly what a child specification does, and it is the reason UCPI pins the product before comparing prices rather than averaging across whatever is labelled similarly. **Modify:** UCPI cannot reprice one selected contract per seller, because it observes public offers rather than surveying billed contracts; it holds the specification constant across sellers instead of across time within one contract. **Reject:** the rebasing to an index number. An official index chains matched specifications over decades where no single unit price is meaningful across the series; UCPI's unit is homogeneous by construction, so it publishes the price level, as set out in [Published Values](#docs-published-values). The factsheet is also notably silent on quality change, which for accelerated compute is the dominant difficulty, and it offers no guidance there.

### Silicon Data, GPU rental price indices

The provider's [H100 rental price index page](https://www.silicondata.com/products/silicon-index/h100) and its [index-construction article](https://www.silicondata.com/blog/building-a-robust-gpu-index), dated 12 March 2026, describe the closest existing compute-price benchmark. The index is published daily in USD per GPU-hour under a neo-cloud ticker, drawn from neo-cloud providers, hyperscalers, colocation markets, and private rental platforms, with observations "standardized for machine specs, rental terms, platform performance, and geography, statistical outliers removed, and each day's value independently validated". The construction article describes roughly one hundred and fifty thousand daily verified pricing records across forty to fifty countries and regions and fifty to one hundred platforms, covering lease types from on-demand and spot to reserved terms of one to sixty months, and states that the provider "uses a proprietary framework to normalize the prices of heterogeneous physical units to a standard configuration". Neo-cloud and hyperscaler readings are kept separate.

**Adopt:** the unit of USD per GPU-hour; the recognition that normalization must address specification, term, and geography rather than price alone; and the segmentation of structurally different provider types into separate readings rather than one blended number, which supports the family's decision to separate procurement modes and to keep regions distinct. **Modify:** UCPI separates by procurement mode and region as specification dimensions rather than as post-hoc segments. **Reject:** the proprietary normalization framework, and the removal of statistical outliers as a construction step. The normalization framework is where the entire economic content of a compute benchmark sits, and a framework that is not published cannot be independently assessed or reproduced; that is precisely the gap this family is written to close. Automatic outlier removal is rejected for the reasons in [Robustness and Outliers](#docs-robustness-and-outliers): in a scarcity-driven market, extreme prices are frequently the most informative observations, and they should be validated against rules rather than deleted for being extreme. **Finding of fact worth recording:** the closest existing compute-price benchmark does not publish a reproducible methodology, so compute-specific methodological precedent is weak, and this family rests mainly on general benchmark-administration principles and on directly observed market structure.

### SemiAnalysis, H100 price index

The [H100 daily and contract pricing index](https://gpu-index.semianalysis.com/) collects prices "from hyperscale clouds, neoclouds, GPU marketplaces, and rental routers/aggregators" combined with "analyst-run contract-pricing surveys", across contract lengths from on-demand to five years. It is published hourly, constructed as "a composition-jump-resistant weighted mean of rental prices" with hyperscale clouds weighted more heavily than marketplaces, applies a "per-step move cap" circuit breaker rejecting implausible jumps, and forward-fills missing hourly data from the last accepted price.

**Adopt:** the recognition that composition change, rather than price change, is a primary risk in a compute index, which is why this family fixes the unit of observation at the seller and publishes composition diagnostics; and the use of analyst survey evidence for contract pricing, which corresponds to the quote and transaction tiers of the source hierarchy. **Modify:** weighting provider types differently is a defensible answer to a different question, and the family instead fixes the question first and weights sellers equally within a specification, publishing the diagnostics that reveal the difference. **Reject:** the per-step move cap and indefinite forward-fill for UCPI. A move cap suppresses exactly the large genuine price movements a compute benchmark exists to report, and it cannot distinguish a data error from a real scarcity event; the family uses validation rules with recorded reasons instead. Forward-fill without a disclosed age limit risks presenting a stale price as current, which [Freshness and Staleness](#docs-freshness-and-staleness) prohibits.

### Observed market structure

The following were retrieved directly on 12 September 2026 as evidence of how the market is actually structured. They are not a provider list, no seller named here is proposed for inclusion, and the figures are illustrative of structure only.

A major GPU cloud's [pricing page](https://www.runpod.io/pricing) presents the same accelerators under two differently operated tiers on one page, with per-hour and per-second billing toggles, and lists three distinct H100 variants at three distinct prices, an SXM variant with eighty gigabytes of accelerator memory, one hundred and twenty-five gigabytes of host memory and twenty virtual CPUs at $3.49 per hour; a PCIe variant with eighty gigabytes of accelerator memory but one hundred and eighty-eight gigabytes of host memory and sixteen virtual CPUs at $2.89; and an NVL variant with ninety-four gigabytes at $3.19. A hardware-partitioned product appears in the same catalogue alongside full devices. **This establishes** that an accelerator model name does not identify a product, that form factor and memory are identity-defining, that the host bundle varies across products from a single seller, that service tier varies within a seller, and that fractional products sit in the same catalogues as full devices.

Another provider's [pricing page](https://lambda.ai/pricing) lists an H100 SXM instance at $3.99 per GPU-hour bundled with two hundred and eight virtual CPUs, approximately eighteen hundred gibibytes of host memory and twenty-two tebibytes of storage, alongside a cluster product quoted per GPU-hour at three different prices for sixteen, sixty-four, and two hundred and fifty-six or more accelerators on terms of two weeks to one year, with reserved capacity available only by contacting the seller, and prices stated as exclusive of applicable sales tax, value-added tax, and goods-and-services tax. **This establishes** that host bundles differ by an order of magnitude between sellers for the same accelerator, that sellers price quantity tiers explicitly so per-accelerator division across topology classes is not neutral, that reserved pricing is frequently quote-only, and that tax basis differs and is sometimes stated and sometimes not.

A marketplace's [pricing page](https://vast.ai/pricing) publishes, for each accelerator, both a lowest available price and a median across the platform: for an H100 SXM, $1.73 and $2.02; for an H100 PCIe, $1.87 and $2.61; for an H200, $1.97 and $4.00. It describes prices as "set by supply and demand across 40+ data centers" across on-demand, interruptible, and reserved modes, and shows at least one accelerator with an approximate hourly figure labelled as a recent-market value beside the statement that there are no current offers. **This establishes**, from the market's own publication, that the cheapest available price and the typical price are materially different statistics, differing here by seventeen to one hundred and three percent on a single day, which is the empirical basis for rejecting cheapest-available as the economic target; and that prices are displayed for products with no current availability, which is the empirical basis for the executability requirement.

Taken together with the figures above, a single accelerator designation spans roughly $1.73 to $3.99 per accelerator-hour across three retrieved sellers on one day, under different tenancies, minimum quantities, bundles, and service tiers. That spread is not a price signal. It is the measurement problem this family exists to solve.

### Sources sought and not retrieved

Commodity price-assessment methodology, in which an administrator assesses a physical commodity price from a fragmented over-the-counter market using a defined standard specification and firm, repeatable bids and offers within a defined assessment window, is an obvious adjacent precedent for the executability and standard-specification questions. The primary methodology guide could not be retrieved on 12 September 2026, and nothing is attributed to it here. It should be obtained and assessed before this family is approved for production.
