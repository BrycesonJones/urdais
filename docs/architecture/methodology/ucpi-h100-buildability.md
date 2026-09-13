# UCPI-H100-SXM Buildability Reassessment

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026, after the Phase 4 source investigation and outreach sequence. This is a decision gate, not an implementation. It changes no methodology, no registry classification and no provider permission state.

## Headline

**UCPI-H100-SXM is potentially buildable. Source coverage is insufficient, and the reason is structural rather than only contractual.**

Phase 4 framed the obstacle as licensing. That is real but incomplete. Re-reading the methodology against the source evidence shows a second obstacle that no licence would remove: **the two sources most likely to grant permission would each contribute exactly one capacity source, and the family's structural floor already refuses to publish a region with one participant.** Licensing and market structure are separate walls, and clearing one does not clear the other.

The encouraging half is that the constraint is about the *sourcing model*, not the economic question. A compute price index is demonstrably measurable; a competitor measures one. What Phase 4 has established is that the model Urdais started with, aggregating published interfaces, is the wrong shape for the rights environment this market has.

## 1. What the methodology actually requires

Extracted from the merged parent and child. Nothing here is invented.

### Hard requirements

Violating any of these means the published figure no longer represents the defined product.

| Requirement | Source | Note |
|---|---|---|
| Economic object is a **current accessible offer** | Parent, observation types | Advertised non-accessible prices are a different object the family rejected as a target |
| Availability evidenced at **Grade 3 or stronger** | Child | Must be a signal that can express "not obtainable" |
| Participant unit is the **capacity source**: operator where determinable, seller otherwise | Parent | Not the data source, and not the venue |
| Regional median across capacity sources, **equal participant weighting** | Parent | |
| Canonical region is the **country** | Child | Supra-national groupings are `REGION_UNRESOLVED` |
| **Per-accelerator allocation** class, minimum topology from a source field | Child | Never inferred from the quoted denominator |
| Tenancy **Explicit or Documented** | Child | Ambiguous and Unknown are excluded |
| Full 80GB SXM device, on-demand, non-preemptible | Child | |
| **A region with exactly one eligible participant has no market price** | Parent, publication gates | Explicitly "structural rather than parametric and **applies now**" |
| Permitted and reproducible **collection path** per source | Parent, licensing | No source enters production without it |
| Population reproducible, raw retained, reduction offer set retained | Parent, lineage | |

### Governance choices the administrator may set

The bundle envelope level; the seller-reduction rule among the family's permitted candidates; the three freshness ages and the carry policy; the four numerical publication gates; whether `Limited` is admitted, which the child answered yes.

### Missing decisions the methodology genuinely does not answer

Named rather than filled.

1. **The minimum participant count above the structural floor.** Explicitly unresolved. Two participants clears the floor and is almost certainly not a market.
2. **There is no minimum-independent-*source* rule at all.** The methodology governs participants, not data sources. It therefore does not say whether one venue supplying many capacity sources is equivalent to many venues supplying one each. That gap is decisive for the marketplace case and is the single most important open question this reassessment surfaces.
3. **Whether a vertically integrated provider is one participant.** Implied by the capacity-source definition but never stated, and it determines the answer to the single-source question below.
4. Marketplace seller-identifier stability, already recorded as a launch blocker.

## 2. Buildability matrix

Capacity-source counts are derived from the definition, not assumed. A vertically integrated cloud sells its own inventory and is one seller with no determinable separate operator, so it contributes **one** capacity source per region. A marketplace exposes many independent hosts, each a seller, so it contributes **many**.

| Scenario | Rights | Capacity sources / region | Availability | Population | Verdict |
|---|---|---|---|---|---|
| **Runpod only** | Pending | **1** | Grade 3 available | Definable | **Structurally insufficient.** Fails the floor regardless of licensing |
| **Lambda only** | Pending | **1** | Grade 3 available | Definable | **Structurally insufficient.** Same |
| **Runpod + Lambda** | Both pending | 2 where regions coincide | Grade 3 both | Definable | **Potentially publishable after conditions.** Clears the floor; N=2 makes every participant pivotal, and the unresolved minimum must be set first |
| **Vast only** | Blocked | Many (18 hosts observed) | Grade 2, strongest found | **Not definable** | **Structurally unsuitable.** Enumeration failure defeats reproducibility |
| **Runpod + Vast** | Both blocked | Many | Mixed | Not definable | Inherits Vast's population defect |
| **Lambda + Vast** | Both blocked | Many | Mixed | Not definable | Same |
| **All three** | All blocked | Many | Mixed | Not definable | Same |
| **No per-accelerator provider** | n/a | 0 | n/a | n/a | **Legally unavailable.** Current state |
| **Future independent sources** | Unknown | Depends | Depends | Depends | The only path that reaches a defensible index |

Two conclusions fall out of the matrix rather than out of judgement.

**No single provider makes this publishable.** Not because one provider is distasteful, but because the family already refuses a region with one participant, and a vertically integrated cloud is one participant.

**The only source that clears the floor on its own is the only one that cannot define its population.** Vast supplies many independent hosts, which is structurally what the index needs, and its interface cannot enumerate them. That is measured, not suspected.

## 3. If only one provider grants permission

### Scenario A, Runpod only

Runpod's catalog endpoint returns GPU types with pricing and availability aggregated per datacenter. Runpod is the seller; no separate operator is determinable, including for Community Cloud hosts, whom Runpod does not individually identify. **One capacity source per region.** The structural floor produces `Unavailable`.

**Not publishable.**

### Scenario B, Lambda only

Lambda is vertically integrated and sells its own inventory. **One capacity source per region.** Same result.

**Not publishable.**

### The distinction the question turns on

The prompt's framing is exactly right and the methodology supports it: *one source containing many independent sellers* and *one vertically integrated provider* are not the same concentration problem.

A marketplace with 18 independent hosts genuinely contains 18 capacity sources whose prices are set independently. That is a market being observed through one window. A single cloud's price sheet is one price-setter, however many datacenters it operates. The structural floor catches the second and not the first, correctly.

But the methodology has **no rule about the window**. It never asks how many independent *sources* a value must rest on. A UCPI value resting entirely on one venue would inherit that venue's outages, sampling behaviour, ranking, commercial incentives and terms, and the published diagnostics would not show it, because they count participants rather than venues.

**Recommended minimum viable source universe**, for the administrator to decide and not adopted here:

- **At least two independent data sources**, so that no single venue's failure or behaviour determines the value.
- **At least three capacity sources per published region**, one above the structural floor, so the median is not the mean of two and no single participant is pivotal.
- **A definable population per source**, so the reduction rule is well posed.

Under that shape, Runpod plus Lambda would still be one participant each and would not qualify. **Marketplaces or partner networks are structurally necessary, not merely convenient.**

## 4. Whole-node sibling

The whole-node market is coherent. `8 × H100 SXM` is close to a de facto standard configuration: Azure `Standard_ND96isr_H100_v5`, AWS `p5.48xlarge`, CoreWeave's HGX H100 eight-GPU node and Lambda's `gpu_8x_h100_sxm5` are the same physical product sold four ways. Azure exposes it across 24 regions with per-meter effective dates, unauthenticated; AWS across a 106-region dated catalog, unauthenticated. Both have a **settled collection permission**, which no per-accelerator source has.

That is three or four distinct capacity sources with clean rights and a standardized product, which clears the structural floor comfortably.

**It does not escape the availability problem, and that is the decisive point.** Azure and AWS expose no capacity signal at all, placing them at Grade 4. The Grade 3 minimum is a child parameter and a sibling could in principle set its own, but the *parent* fixes the economic object as a **current accessible offer**, and a catalog entry that never reports absence cannot evidence accessibility. A whole-node sibling built on Azure and AWS alone would measure advertised prices, which is the object the family explicitly rejected.

**Verdict: warrants further research, not warranted now.** The research question is narrow and answerable: does any whole-node seller expose a discriminating capacity signal? CoreWeave, Lambda and the neoclouds are the candidates. If at least two do, the sibling becomes viable. If none do, the sibling has the same defect as the child for a different reason, and that is worth knowing before it is specified.

This decision is independent of UCPI-H100-SXM's status and should not be used to rescue it.

## 5. Source classes not yet exhausted

Phase 4 examined one class: published provider interfaces. Five others exist and were not investigated.

**Compute exchanges and secondary markets.** SF Compute operates reserved capacity with resale, where customers "reserve compute and resell what you don't", with API and CLI access. Resale between tenants produces **executed prices between independent counterparties**. The site displays an aggregate "average gpu/hr" figure, which implies the underlying transaction data exists. Not a spot market in its own description, and it publishes no index.

**Aggregators and brokers that take the transaction.** Prime Intellect brokers clusters from "50+ providers" and runs a spot market with sell-back of idle GPUs; Shadeform aggregates GPU cloud pricing and availability across providers. These are high leverage: **one agreement could yield many providers' observations**, and because the broker is a counterparty it holds executed prices rather than posted ones. Shadeform returned HTTP 403 to our request and was not inspected further.

**Licensed index and data vendors.** Silicon Data publishes rental and resale price indices across H100, H200, A100, B200 and MI300X, claims over 3.5 million datapoints and up to eight years of history "across clouds, brokers, and multiple GPU design houses", and distributes through Bloomberg and Refinitiv. The parent admits licensed specialist datasets at source grade 6 **only where the dataset's methodology is disclosed, assessed and recorded, and never where it is proprietary and unverifiable**. Silicon Data's public pages disclose no methodology, so licensing it would require that assessment before any observation could be used. It is also worth noting that buying a competitor's index as an input does not produce an independent benchmark.

**Direct provider partnerships.** Providers supply permitted observations under agreement. Rights come by construction rather than by negotiation against a hostile clause.

**Datacenter operators, owners and lessors.** Upstream of the clouds, and the layer at which operator identity, which no public source discloses, actually exists. This would also close the operator-attribution gap that currently sits at zero of thirteen.

**Buy-side procurement and invoice records.** Anonymized executed rentals from GPU buyers rather than sellers, which removes the seller's incentive to shape what is reported.

## 6. Ornn as comparator

First-party materials, retrieved 13 September 2026. These are the competitor's representations, not audited facts.

Ornn describes OCPI as *"a family of transaction-based indices tracking clearing prices for rented GPU compute in USD per GPU-hour"*, sourced *"from partnered cloud providers, datacenter operators, owners, and lessors"* as *"invoice-level records of executed trades rather than survey submissions"*. Only *"executed, paid transactions"* qualify, and they are explicit about why: *"A posted rate can sit far above where deals actually clear."*

Each print is *"the volume-weighted winsorized mean of executed transaction prices for a GPU type over a rolling one-hour window"*. They state *"on the order of 150 providers contribute to each index and roughly a thousand transactions are observed per day"*. Eligibility requires verified counterparties with *"compute must have been successfully transferred between two different counterparties, preventing wash trades"*, periodic re-verification, trade finality with *"indicative or offered prices are excluded"*, no minimum trade size, and provider-reliability exclusion. Regions pool into six continental buckets and *"all eligible trades pool into one global, volume-weighted distribution"*. Provider identities are confidential because *"disclosure would create incentives for contributors to modify their behavior"*.

**The answer to the central question is unambiguous. Ornn did not find unrestricted public data. It moved upstream and built a contractual supply network.** Roughly 150 contributing providers is not an artefact of clever collection; it is business development.

### How this differs from Urdais's Phase 4 approach

| | Ornn | Urdais as specified |
|---|---|---|
| Object | Clearing price of executed trades | Current accessible offer |
| Input | Invoice-level executed transactions | Published and API offers |
| Acquisition | Partnered contribution | Public and API collection |
| Weighting | Volume-weighted | Equal-participant |
| Geography | Six continental buckets, pooled globally | Country, regional-first, no global series |
| Cadence | Rolling one-hour | Daily |
| Participants | ~150 contributing providers | 0 approved |

The two measure genuinely different objects and both are legitimate. UCPI's answer to "what does the specified product cost across those offering it" is not inferior to "what did compute clear at"; it is a different question.

**But one thing in the parent now looks empirically wrong.** The parent rejected the transaction-weighted clearing price as a target on the ground that it *"is the ideal, and is not observable: compute transactions are private, contracts are negotiated, and no consolidated tape exists."* A competitor observes roughly a thousand of them a day. The premise was true of *public* data and false of *partnered* data, and the parent did not draw that distinction.

**This is reported, not acted on.** It does not require changing UCPI's target, because the parent already contemplates a transaction-price sibling as open work under "Transaction-price sibling feasibility". What it does mean is that the sibling's feasibility should no longer be assessed on the assumption that the data cannot be obtained.

## 7. Quoted prices versus executed transactions

**Offers.** Easier to obtain technically, and they measure publication rather than clearing. They carry stale inventory, strategic pricing and uncertain executable capacity, which is precisely why the child requires discriminating availability evidence. Phase 4 established that they are also **hard to license**, because a posted price is the provider's own commercial signalling and providers restrict its reuse tightly.

**Executed transactions.** A genuine clearing signal, supporting volume weighting and resistant to advertised-price distortion. They require partnership, carry confidentiality obligations, and are unobtainable without a network. They are also, on Phase 4's evidence, **no harder to license than offers**, because a partner who agrees to contribute agrees to both.

**Recommendation.** Keep UCPI's current object. The accessible-offer question is worth answering and is differentiated from Ornn. But **pursue partnership sourcing regardless of which statistic is the target**, because it is the only route that scales past the licensing wall, and because a partner can supply both offers and transactions under one agreement. A transaction-price sibling then becomes a natural second product rather than a pivot.

Moving the *existing child* to transaction data would change what it measures and require redesign of the observation model, the weighting and the participant definition. That is a new instrument, not an amendment.

## 8. Source acquisition strategy

| | Launch feasibility | Legal complexity | BD cost | Representativeness | Moat |
|---|---|---|---|---|---|
| **A. Licensed public-provider observations** | Low. Two providers is still two participants | High per provider, low leverage | Moderate, repeated | Weak | None |
| **B. Partner-supplied observations** | Medium | Rights by construction | High | Good | Moderate |
| **C. Transaction-data network** | Low initially, high once built | Confidentiality-heavy | Highest | Strongest | Strong |
| **D. Hybrid** | Medium | Mixed | Staged | Improves over time | Builds |

**MVP strategy.** Pursue the pending three to conclusion, because the answers are cheap and closing them is informative either way. **In parallel, approach one aggregator or broker**, which is the highest-leverage single conversation available: one agreement can yield many providers' data, the counterparty holds executed prices, and a broker's commercial interest in price transparency is better aligned with an index than a seller's is. Marketplaces and brokers are also the only sources that satisfy the structural floor on their own.

**Long-term strategy.** Model D converging on C. The network is the product. Ornn's roughly 150 contributing providers is the asset, not its winsorized mean, and a network Urdais builds is equally a moat.

**One caution.** Urdais currently has little to trade. A provider or broker gains nothing from contributing to an index with no readership. The sequencing question worth resolving early is what Urdais offers a first partner: attribution, benchmarking access, early data, or simply being the reference the market quotes. That is a commercial design problem and it should not be discovered during the first negotiation.

## 9. Decision

### UCPI-H100-SXM: **B, potentially buildable, source coverage insufficient**

The product definition is sound and the economic question is measurable. What is missing is specific and nameable.

**Conditions to move to collector implementation:**

1. **At least two independent data sources with rights on both axes.** Not one, on the structural grounds in section 3.
2. **At least three capacity sources per intended published region.** Requires either a marketplace, a broker, or three separate clouds, and the minimum must be set as a methodology decision first.
3. **A definable population per source.** Vast fails this today; any marketplace partner must answer it before it counts.
4. **Grade 3 availability from each contributing source.**
5. **Regional overlap**, so the qualifying participants sit in the same country.
6. Then the unresolved parameters the child already names: bundle envelope level, seller-reduction ratification, freshness ages, four numerical gates.

Conditions 1 to 3 are new to this reassessment. The rest were already recorded as launch blockers.

### Whole-node sibling: **warrants further research**

Clean rights and a standardized product, and no discriminating availability signal at the two providers that make it attractive. One narrow research question decides it: does any whole-node seller expose a capacity signal at Grade 3 or better?

## 10. What this reassessment does not conclude

It does not conclude that the product is dead. It does not recommend weakening the availability minimum, the structural floor or the accessible-offer object to make the current data fit; each exists for a reason Phase 2 measured. It does not treat Ornn's operation as proof that Urdais can obtain the same counterparties or rights. And it does not change any methodology, classification or permission state, all of which remain exactly as Phase 4 left them.
