# Urdais AI Equity Universe

**Status: proposed methodology, version 0.4.0-draft.** Prepared 12 September 2026; amended by post-merge audit on 12 September 2026; restructured on 17 September 2026 around a tiered exposure framework, replacing the universal revenue-share admission gate; **amended on 17 September 2026 to recognize AI-integrated platform companies under Tier 1, after the first production review found that the Tier 1 and E5 rules together rejected an economically central integrated AI platform.** No production effective date, constituent list, or production base weights are established by this document.

This proposal follows the principles of the [Urdais methodology framework](/docs/methodology). It is a shared primitive rather than a published output, so the framework's output template applies to the outputs that consume it (UGAI and UAVI), not to this document. Rules expressed as requirements describe the proposed design, subject to approval. Parameters explicitly marked **unresolved** are not defaults or discretionary overrides, and parameters marked **convention** are stated values that empirical work has not calibrated. Publication of a production universe is blocked until the launch requirements in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required) are resolved in a versioned release.

## Purpose and Scope

The Urdais AI Equity Universe is the shared set of publicly traded companies with a **material, economically meaningful role in the AI value chain**, together with their representative securities and base weights. It is a shared methodology primitive, not a market index or a recommendation to invest.

[UGAI](/docs/methodology/ugai), the Urdais Global AI Index, will use this universe and its base weighting methodology for equity-performance measurement. [UAVI](/docs/methodology/uavi), the Urdais AI Volatility Index, will inherit the same constituent base weights, apply its own options-eligibility filter, and renormalize the surviving weights. No options requirement is imposed on the parent universe.

The intended measurement is the investable public equity of companies that supply, operate, or commercialize artificial intelligence. It is not a measure of AI revenue, economic value added, model capability, compute prices, private-company valuations, AI's contribution to GDP, or the productivity gains of every business adopting AI. Supply-chain revenues can overlap across different companies; this is not an additive estimate of the size of the AI economy.

Technology, semiconductor, cloud, robotics, datacenter, or infrastructure classifications do not confer automatic membership. Internal use of AI, an AI feature inside an existing product, repeated references to an AI strategy, membership of a third party's AI index, and share-price behaviour do not establish a qualifying business. The universe is intended to be broad, and it is not intended to be a technology universe: the governing question throughout is whether the issuer supplies AI, not whether it benefits from AI.

### What changed in 0.3.0-draft, and why

Versions 0.1.x admitted a company only where it disclosed qualifying AI revenue reaching a threshold share of consolidated revenue (`r_i_lower ≥ τ`). Empirical testing against real filings established that almost no diversified issuer discloses an AI-only revenue numerator, that the threshold therefore had no discriminating power, and that the rule produced a universe too small to carry a valid capped weight vector. The universal revenue-share gate is **superseded**. It is replaced by three rules-based exposure tiers, each asking a question the market's existing disclosure can answer. Revenue-share evidence is retained where it exists, in the narrower roles described in [Materiality](#docs-materiality). The supporting research is recorded under `docs/research/ugai/`; the changelog entry is in [Governance and Versioning](#docs-governance-and-versioning).

## Decision Model

Membership and weights result from three separate decisions, applied in this order and never merged:

1. **Thematic eligibility:** a qualifying role in the AI value chain under exactly one exposure tier, with sufficient evidence that the role is material to the issuer.
2. **Security and investability eligibility:** an eligible, accessible equity claim with adequate float, liquidity, history, and reliable data.
3. **Weighting:** a reproducible allocation across admitted companies, from accessible free-float capitalization and an issuer cap.

The full pipeline is therefore: thematic eligibility → security and investability eligibility → representative security → accessible free-float market capitalization → issuer cap → downstream index calculation.

Thematic eligibility cannot compensate for an ineligible security. Size or liquidity cannot compensate for an absent qualifying role. Classification identifies the activity; it does not bypass either gate. There is no target constituent count, country quota, or requirement to include a familiar company.

**The exposure tier affects eligibility only. It never affects weight.** No tier multiplier, tier budget, tier-specific cap, or fixed tier allocation exists, and no measure of an issuer's degree of AI exposure multiplies its capitalization. A tier records *how* an issuer qualified; it carries no economic magnitude and must not be given one. The reasons are stated in [Interface to UGAI Weighting](#docs-interface-to-ugai-weighting).

## Conceptual Entity Model

These are methodological concepts, not database definitions:

- **Company:** the consolidated operating issuer whose business exposure is assessed, with a persistent identity independent of name or ticker.
- **Security:** a specific equity claim or depositary receipt, including its rights, share class, and underlying company.
- **Listing:** a security's trading line on an exchange, with currency, identifiers, trading calendar, and status.
- **Exchange and country:** the regulated venue and separately recorded incorporation, principal operations, and listing jurisdictions. A foreign listing does not relocate the business.
- **Business segment and AI activity:** reported operations and the qualifying products or services within them.
- **AI classification:** versioned activity assignments, exposure tier, evidence coverage, and rationale.
- **Universe membership:** a company's effective membership interval, representative security, decision, and applicable eligibility evidence.
- **Universe weight:** the company's base allocation in a dated weight snapshot, including the underlying capitalization and capping inputs.
- **Universe event:** a dated, versioned record of an exceptional change between scheduled reviews: the membership or identity change, the representative security where applicable, the reason, the announcement or publication time, and the effective time. Its validity depends only on the underlying membership or identity facts.
- **Membership state:** the set of member companies, with their representative securities, in force at a given time. It is produced by a scheduled reconstitution and modified by universe events.
- **Weight snapshot:** a dated canonical base-weight allocation over a membership state. A **scheduled weight snapshot** results from a quarterly reset; an **event weight snapshot** results from re-allocation after a universe event and exists only where a valid capped allocation can be produced (see [Corporate Actions and Exceptional Events](#docs-corporate-actions-and-exceptional-events)). A membership state can therefore be current while no current weight snapshot exists.
- **Methodology version:** the rules and parameter release governing a decision. A **universe version** identifies a particular membership state and, where one exists, its weight snapshot under those rules.

A company may have several activities and securities but has at most one membership per membership state and one base weight per weight snapshot.

## AI Value-Chain Scope

Qualifying AI activity supplies systems that learn from data to perform inference, prediction, generation, perception, or adaptive decision-making, or supplies infrastructure embodied in those systems. A conventional rules engine, generic automation, or a product label is insufficient evidence.

The activity taxonomy has five groups. These are Urdais design choices, informed by the value-chain approaches in the [research appendix](#docs-research-precedents), with stricter attribution at the product and segment level. **The taxonomy answers "is this activity AI?" It does not answer "is this issuer eligible?"** — that is the tier tests' work, and an activity tag never admits an issuer on its own.

The scope covers the chain from the supply of AI compute through to the sale of AI capability, and stops deliberately short at three edges: the **tools** used to manufacture qualifying components, the **facilities** that house and power AI compute, and the **internal use** of AI inside an issuer's own operations. Those edges are stated as rules in [Exclusions](#docs-exclusions) and applied in the boundary sections that follow.

### Models and development systems

Commercial model development and licensing; training, evaluation, deployment, and model-operation tools; and data preparation services specifically supplied for AI workloads. Generic databases and analytics products qualify only to the extent their qualifying AI business is evidenced.

### AI applications

Products sold to customers whose principal contracted functionality depends on learned inference or generation, including qualifying software and autonomous or robotic systems. Adding an optional AI feature does not make all revenue from a legacy product eligible. Internal recommendations, advertising optimization, or employee productivity tools do not by themselves qualify the company's underlying advertising, retail, or service revenue.

### AI compute services

Commercial provision of attributable training or inference capacity, managed AI platforms, and AI-specific cloud services. General cloud revenue is not assumed to be AI revenue; ownership of accelerators alone does not establish the share used for qualifying commercial activity.

### Compute components and systems

Accelerators and relevant processors, memory, networking, interconnects, servers, manufacturing, packaging, and equipment where revenue can be tied to qualifying AI products or workloads. General semiconductor, memory, networking, or fabrication revenue is not automatically included. A supplier's relationship with an AI company is insufficient without evidence about the supplied activity.

### Physical AI infrastructure

Facilities, cooling, electrical systems, and other equipment or services attributable to AI compute deployments. Generic datacenter ownership, broad electricity demand, construction exposure, or a customer announcing AI investment does not qualify all associated business. Operating real-estate companies may qualify under the same exposure tests; a legal REIT designation neither admits nor excludes them.

Assign all supported activity tags. Assign the primary tag to the group with the largest evidenced qualifying revenue; retain a multi-activity designation if the evidence cannot support a ranking. Do not guess a primary tag. Count each revenue item once when determining company-level exposure, even when it supports several activity tags. Category mappings and changes must be versioned.

## Eligibility Architecture

An issuer is thematically eligible where it satisfies **both** prongs of **exactly one** exposure tier:

- **A qualifying role.** The issuer supplies, operates, or commercializes something whose economic purpose is the production, provision, or delivery of artificial intelligence capability.
- **Materiality to the issuer.** That activity is material to the issuer, on evidence admissible under the [Evidence Hierarchy](#docs-evidence-hierarchy).

Neither prong suffices alone. Many issuers benefit from AI demand; comparatively few supply AI. The two-prong requirement is what keeps the universe broad without making it a technology universe.

The three tiers are alternative **routes to eligibility**, not a ranking and not economic sectors:

- **Tier 1, AI-native or AI-integrated platform.** The issuer qualifies because its core commercial identity is the supply of AI — either because all its material activity is AI supply, or because its commercial platform is materially organized around deploying, operating, or enabling AI for customers. This is a whole-issuer test.
- **Tier 2, AI infrastructure and enabling.** The issuer qualifies because it supplies something embodied in AI compute systems, or performs the manufacture of such a component. This is a product test.
- **Tier 3, AI platform and application.** The issuer qualifies because it commercially provides AI capability to others, or sells a material AI product line. This is a business-line test.

**A qualifying issuer does not need to disclose an AI-only revenue percentage.** If it satisfies the mechanical rules of its tier, it is eligible. Revenue-share evidence remains admissible and useful, in the roles set out in [Materiality](#docs-materiality), but it is no longer a gate. There is exactly one primary eligibility system.

## Tier 1 — AI-native and AI-integrated platforms

An issuer qualifies under Tier 1 where its **core commercial identity is the supply of AI**. There are two routes to that conclusion and an issuer needs only one.

- **Route N — AI-native.** All material commercial activity consists of supplying AI products or services.
- **Route P — AI-integrated platform.** The issuer's commercial platform is materially organized around deploying, operating, or enabling AI or ML systems for customers, even where the AI capability is integrated with non-AI data, orchestration, deployment, or workflow software and is not separately reported as revenue.

Route P exists because Route N alone asks, in substance, whether nearly every product line is *itself* labelled an AI product. That question misdescribes a real and economically central class of issuer: the company whose platform exists to put AI into production, whose data, ontology, deployment, and workflow components are the machinery that makes the AI operable, and whose AI capability is therefore integrated into the platform rather than sold beside it. **Integration is not disqualifying. Incidental AI is.** The line between the two is drawn by **E5** and by Route P's own conditions, not by whether the issuer bills for the AI separately.

The routes are alternatives, not a sequence: an issuer is not required to fail Route N before Route P is considered, and satisfying either makes it Tier 1.

### Route N — AI-native

The test is **material commercial activity**, not literally every product or service line. An issuer does not fail because it also sells an ancillary tool that exists to deliver its qualifying offering. All four conditions must hold, each recorded with a citation:

1. **Enumeration from the filing.** Every commercial product, platform, or service line named in the issuer's latest statutory annual filing is enumerated and individually mapped to a group in the [AI Value-Chain Scope](#docs-ai-value-chain-scope). **The issuer's name, self-description, branding, and marketing are inadmissible.**
2. **No material non-qualifying line.** No enumerated non-qualifying line may be a reportable segment, be named in the filing as a principal revenue source, or be separately disclosed at a scale the issuer treats as material.
3. **Ancillary-support test.** A non-qualifying line that is *not* separately disclosed is presumed ancillary **only where the issuer's own filing presents it as supporting or delivering the issuer's qualifying products**. Where the filing presents it as an independent business, or does not characterize it at all, Tier 1 **fails**; it does not pass by default. The absence of a disclosure is not evidence that the activity is small.
4. **Services test.** Where services are a material share of revenue, the issuer must evidence that they implement, tune, integrate, or supply data for *its own* qualifying products. **General systems integration, IT modernization, staffing, and managed IT services fail this test.** A gross margin characteristic of labour-based services rather than software is a trigger for the test, not a disqualifier on its own.

**Safe harbour.** Where the issuer discloses qualifying revenue of **at least 75%** of consolidated external revenue for the latest completed fiscal year, on establishing evidence, conditions 1–4 are deemed satisfied and the enumeration exercise is not required. The 75% figure is a **convention**, not an empirically calibrated threshold: research testing found only one sampled issuer whose disclosed ratio fell between a low single-digit percentage and 100%, so the sample could not calibrate it. Its only effect is procedural — the safe harbour is a shortcut, never a gate, and an issuer below it is assessed on conditions 1–4 exactly as if the safe harbour did not exist.

Conditions 3 and 4 exist because each corrected a real failure found in testing: a genuinely AI-native issuer was rejected for an undisclosed deployment tool that its own filing presented as supporting its platforms, and a self-described AI issuer was admitted whose disclosed contracts were government IT services.

### Route P — AI-integrated platform

An issuer qualifies under Route P where its commercial platform is materially organized around deploying, operating, or enabling AI or ML systems for customers. All five conditions must hold, each recorded with a citation to primary evidence. The issuer's name, self-description, branding, marketing, and third-party classification are inadmissible throughout (**E6**).

1. **Customer-facing AI capability.** The issuer commercially provides AI or ML capability to customers. Use of AI within the issuer's own operations, or to improve the issuer's own existing product, never counts (**E4**).
2. **Platform centrality.** AI is materially integrated into the commercial platform's architecture or value proposition. A cosmetic feature, an assistant attached to an otherwise unrelated product, a limited optional add-on, and an internal productivity tool each fail this condition.
3. **Operational role.** The platform materially enables at least one of: deploying AI or ML systems; operating them; training or adapting models; inference; learned decision systems; data or ontology infrastructure directly supporting AI operation; orchestration of AI agents or models; AI-enabled operational workflows.
4. **Commercial scale.** Primary evidence establishes that the platform is commercially deployed. **Separately reported AI revenue is not required** where the AI capability is structurally integrated into the platform and separate accounting for it does not exist. Admissible evidence includes material customer deployments, disclosed customer adoption, platform-wide integration, contractual availability, usage evidence, and recognized revenue from the integrated platform. Branding alone never suffices (**E6**), and forward-looking measures never establish (**E8**).
5. **Unrelated-business guard.** The AI capability must be material to the platform business being assessed, rather than one AI product inside a large unrelated software business. Where the AI capability is peripheral to the issuer's broader commercial identity, **Route P fails and Tier 3 is the appropriate route**.

Conditions 2 and 5 do different work and both are load-bearing. Condition 2 asks whether AI is central to the platform. Condition 5 asks whether that platform is central to the issuer. Without condition 5, Route P would admit any diversified software company that happens to operate one integrated AI platform; without condition 2, it would admit any platform with an AI feature attached. **Route P is not available as a way around an unresolved `τ_B`**: an issuer that fails condition 5 is assessed under Tier 3 on Tier 3's conditions, including the Route B gate, and the inconvenience of that gate is not a reason to reach for Tier 1.

Route P requires no revenue share and reinstates no threshold. Revenue evidence may support condition 4 and is never mandatory for it.

## Tier 2 — AI Infrastructure and Enabling

An issuer qualifies under Tier 2 where it supplies a **component, subsystem, or production capability embodied in, or directly performing the manufacture of, AI compute systems**, and that activity is material to the issuer.

An **AI compute system** is the accelerated compute system on which AI training or inference runs: the accelerator, its memory, the interconnect fabric joining accelerators, and the integrated system containing them.

The governing question is one of **embodiment, one step**:

> Is the issuer's qualifying product materially embodied in an AI computing system, or directly used as a component or service to construct one — rather than a tool or general-purpose input used further upstream?

### Prong A — embodiment

The issuer supplies at least one of:

1. an AI accelerator or AI ASIC (GPU, XPU, TPU, NPU, or inference accelerator);
2. memory designed for accelerator bandwidth, such as high-bandwidth memory and its successors — **not** commodity DRAM or NAND;
3. interconnect embodied in AI clusters: AI fabric switching silicon or systems, high-speed optical transceivers at AI-cluster rates, silicon photonics for accelerator scale-up or scale-out, retimers, and AI connectivity silicon;
4. an integrated accelerated-compute system, server, or rack-scale AI system;
5. **the fabrication or advanced packaging of (1)–(3)** — the issuer physically manufactures the component, as distinct from supplying the tools used to manufacture it.

### Prong B — materiality to the issuer

The qualifying activity is material, evidenced from an establishing source by at least one of:

1. disclosed revenue for the qualifying product family; or
2. the qualifying family sitting in a reportable segment material to the issuer, **together with** the issuer's own attribution of that segment's demand or growth principally to accelerated-compute or AI end-markets; or
3. disclosed capacity, wafer, or production allocation to the qualifying activity; or
4. the issuer identifying the qualifying activity as a principal driver of results **in its statutory filing**.

Realized disclosures only. Guidance, targets, backlog, bookings, pipeline, and total-addressable-market statements never satisfy Prong B, and may corroborate at most.

### What Tier 2 does not admit

- **AI end-market demand is not sufficient.** Demand belongs to the customer. A supply relationship with an AI company says nothing about the supplied activity.
- **Technological criticality is not sufficient.** An input can be indispensable to AI and remain outside the tier. Criticality is a property of the supply chain; embodiment is a property of the product. Admitting criticality alone would admit the whole manufacturing toolchain, then the materials behind the tools, and the universe would become a semiconductor universe.
- **A general-purpose product inside an AI system is not sufficient.** A general-purpose processor sold into an accelerated server remains a general-purpose processor.

The detailed inclusions and exclusions are in the [Semiconductor and Compute-Infrastructure Boundary](#docs-semiconductor-and-compute-infrastructure-boundary).

## Tier 3 — AI Platform and Application

A diversified issuer qualifies under Tier 3 through one of two routes. Internal use of AI never qualifies, and an AI feature bundled into an existing product never qualifies.

### Route A — AI platform, compute, and developer services

The issuer makes commercially available to external customers, at scale, access to **AI models, AI training or inference compute, model-serving platforms, AI cloud services, or AI development and deployment services** that those customers use to build or operate their own AI workloads.

All three conditions must hold:

1. **Generally available.** The offering is generally available, not a free or limited preview.
2. **Separately contracted.** It is separately contracted or metered, such that a customer can buy it as such.
3. **Disclosed at scale**, on an indicator of **rank 2 or better** in the scale-evidence hierarchy below.

**Scale-evidence hierarchy.** Route A requires an indicator of commercial scale, and indicators are not interchangeable. Ranked strongest first:

- **Rank 1 — admissible.** Recognized AI-specific revenue for the completed fiscal year.
- **Rank 2 — admissible.** Recognized AI-specific revenue for a disclosed shorter period within the completed fiscal year; or recurring revenue, annual recurring revenue, or an annualized figure or run rate **derived from recognized revenue**.
- **Rank 3 — corroborating only, never sufficient.** Bookings, or contracted commercial volume, where the measure is clearly defined and reconcilable.
- **Rank 4 — corroborating only, never sufficient.** Gross billing or gross merchandise measures; consumption metrics; customer, seat, or deployment counts.

Rank 3 and rank 4 indicators may support an admission established at rank 1 or 2. **Neither may establish Route A materiality on its own.** Gross billing is specifically insufficient: it precedes revenue recognition and can include amounts never recognized, so it is not equivalent to a disclosed revenue line. Revenue, recurring revenue, bookings, and billings must be distinguished by name in the evidence record, never collapsed into a single notion of "AI revenue".

An annualized figure or run rate derived from recognized revenue is admissible **here**, as evidence that a business exists at commercial scale. It remains inadmissible as the numerator of a revenue-share ratio, because a run rate is not commensurable with a period denominator. The distinction is between evidencing scale and computing a ratio.

### Route B — AI application business

The issuer sells a separately priced AI product or product line that is **material to the issuer**, evidenced by a disclosed AI-specific revenue or recurring-revenue figure reaching the Route B materiality floor `τ_B`, expressed as a share of consolidated external revenue.

Route B's qualifying requirements are settled. All must hold:

- the AI product or product line is **separately priced and separately commercialized**, such that a customer can buy it as such;
- **AI-specific revenue or recurring revenue is disclosed** for it, on an establishing source;
- internal use of AI does not qualify (**E4**);
- an AI capability bundled into an existing product, priced within that product, does not qualify however large the host product is **where the AI is incidental to that product** (**E5**); where the capability is instead structurally integrated into the issuer's platform, the applicable test is [Tier 1 Route P](#docs-route-p--ai-integrated-platform) or Tier 3 on this section's own conditions, not E5;
- strategic importance, forecasts, management commentary, customer or seat counts, and general product adoption do not substitute for materiality evidence (**E6**, **E8**).

**The Route B materiality floor `τ_B` is unresolved.** Research establishes that a low-single-digit AI application business is insufficient to establish material AI exposure for a diversified issuer: an issuer disclosing a substantial, separately monetized AI line at roughly 2% of consolidated revenue is not thereby materially an AI business. It does not establish where the boundary should sit. No sampled issuer fell between roughly 5% and 30% of revenue, so the sample is too sparse near the boundary to locate it.

**A 10% share of consolidated external revenue is the current research candidate, not an approved threshold.** It is recorded so that the parameter to be tested is unambiguous, and it carries no present force.

**Production use of Route B is blocked until `τ_B` is empirically tested against a wider point-in-time sample and approved in a versioned methodology release.** No production membership may rest on Route B while the floor is unresolved. This differs deliberately from the Tier 1 safe harbour, which may stand as a stated convention because it is procedural — an issuer below it is assessed on the four Tier 1 conditions regardless — whereas `τ_B` decides admission directly, and an unapproved admission threshold is not a defensible basis for membership.

`τ_B` applies **only to Tier 3 Route B materiality**. It is not a universal exposure threshold, it governs no other tier or route, and it does not reinstate the superseded universal revenue-share gate: an issuer that discloses no AI revenue at all remains fully eligible under Tier 1, Tier 2, or Tier 3 Route A.

Route B exists so that an application business of genuine scale to its issuer is not excluded merely because it is not a platform. It is not a route for AI features.

### What distinguishes a business line from a feature

A **feature** improves the issuer's existing product and is bundled into that product's price. A **business line** is separately contracted and separately priced, and a customer can buy it as such. Strategic importance, management commentary, customer enthusiasm, and forecast opportunity never establish a business line.

## Materiality

Materiality is required under every tier, and the evidence that best establishes it differs by tier because the categories do not share a reporting structure.

- **Tier 1** — The enumeration itself: all material commercial activity qualifies, so materiality follows from conditions 1–4, or from the safe harbour
- **Tier 2** — Prong B: disclosed product-family revenue, segment materiality with issuer attribution, disclosed capacity allocation, or identification as a principal driver in the statutory filing
- **Tier 3** — Route A's rank-2-or-better scale indicator, or Route B's disclosed revenue share against `τ_B`, which is unresolved and therefore blocks production Route B admission

### Where revenue-share evidence is still used

The revenue-share measure `r_i = Q_i / R_i` is retained, in three narrower roles. `R_i` is positive consolidated external revenue; `Q_i` is qualifying external revenue from the same reporting period and consolidation perimeter, with intragroup transactions eliminated and `0 ≤ Q_i ≤ R_i`. Where disclosures support only an interval, retain lower and upper bounds and use the substantiated lower bound `r_i_lower`.

1. **Tier 1 safe harbour** — `r_i_lower ≥ 75%` deems the Tier 1 conditions satisfied.
2. **Tier 3 Route B materiality** — `r_i_lower ≥ τ_B` for the separately priced AI product line, where `τ_B` is the **unresolved** Route B materiality floor defined in [Route B — AI application business](#docs-route-b--ai-application-business). `τ_B` governs Tier 3 Route B and nothing else. Because it is unresolved, this role is defined but not yet usable in production.
3. **Published diagnostic** — where an issuer discloses qualifying revenue, `r_i_lower` is published as constituent attribution. It informs the reader and affects neither membership nor weight.

**`r_i_lower` is not a universal admission gate and no universal threshold `τ` exists.** An issuer that discloses no AI revenue at all may be fully eligible under its tier.

**Canonical period.** Where a revenue measure is used, the canonical period is the latest completed fiscal year available at the review evidence cutoff, with numerator and denominator from that same period and consolidation perimeter. The completed fiscal year is used for every company regardless of how often it reports, so that companies are compared over the same period length and seasonality does not enter the comparison.

**Sum of disclosed quarterly actuals.** Where an issuer discloses a qualifying figure quarterly rather than annually, the sum of the four disclosed quarters of the measured completed fiscal year may be used, provided all four are disclosed on a consistent definition, each from an establishing source, and the sum is reconciled against consolidated revenue for the same year. A single missing or redefined quarter makes the year unmeasurable. This is aggregation of actuals, not annualization, and it remains subject to every prohibition below.

**Interim evidence.** Filed interim reports and reconciled issuer operating disclosures do not replace a completed-year measure, even where a qualifying numerator and a consolidated denominator are both available for the same interim period: a three-, six-, or nine-month ratio for one issuer is not comparable with another issuer's completed-year ratio. Interim evidence may: update the record of business composition; corroborate or challenge the existing attribution; identify a material acquisition, disposal, spin-off, restructuring, or change of consolidation perimeter; trigger a classification review or an exceptional eligibility review; and establish that a prior determination is no longer structurally valid. Where the prior completed-year period remains structurally valid, retain its `r_i_lower` unchanged until the next completed fiscal year is available, and record the interim evidence separately against the company. Where a material event has made the prior period structurally invalid and no comparable measure exists for the changed company, the determination becomes **insufficient evidence** under [Missing and pre-commercial exposure](#docs-missing-and-pre-commercial-exposure) and the review/removal policy applies.

**Prohibited in every role.** Do not construct annualized quarterly or half-year revenue, pro forma exposure, management-estimate or guidance percentages, or analyst estimates. Do not treat annual recurring revenue, capital expenditure, backlog, bookings, pipeline, or an announced investment as revenue. Do not treat a customer's AI demand as the supplier's AI revenue. Do not substitute strategic importance for economic evidence. A reproducible trailing-twelve-month measure built only from filed data is a research question recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required); it is not adopted and would require a versioned amendment.

### Attribution rules

These govern any revenue figure used as evidence, in whichever role. They do not reinstate a revenue gate.

- Prefer separately disclosed qualifying product or segment revenue reconciled to financial statements. Record the specific products, reporting period, numerator, denominator, and source locations.
- **A whole segment may count as a revenue figure only where its entire revenue-generating activity satisfies the taxonomy.** Broad labels such as cloud, datacenter, digital, high-performance computing, or advanced semiconductor manufacturing are insufficient, and **a segment's name never establishes qualification** — a segment titled for AI whose contents are not separately broken out is a mixed segment like any other.
- **A segment that cannot supply a revenue figure can still evidence a qualifying product family.** This is the distinction that makes the tiers workable: a multi-workload segment is refused as a numerator under this rule while the specialized product family inside it satisfies Tier 2 Prong A, with Prong B met by segment materiality plus the issuer's own attribution. The mixed-segment rule constrains *revenue arithmetic*; it does not constrain *product identification*.
- For mixed segments, count only the substantiated qualifying portion. Unallocated revenue remains unknown; do not classify it as definitively non-AI or assign a guessed percentage.
- Product documentation establishes technical relevance, not revenue magnitude. Evidence of delivered products and customer demand can corroborate attribution; backlog, bookings, annualized run rates, capex plans, and forecast revenue cannot replace realized annual revenue.
- A product-dependence argument must establish both qualifying functionality and the associated revenue boundary. An optional AI feature does not justify attributing the entire bundle. If the allocation cannot be evidenced, the disputed portion does not enter the lower bound.
- Assets, capex, installed capacity, and R&D spending may support the classification narrative but do not independently confer membership. They are not comparable revenue proxies across software, manufacturing, and infrastructure businesses.

This intentionally favors demonstrable exposure over broad thematic association. It can underrepresent companies with substantial but undisclosed AI activity, including diversified companies. That limitation must be measured and disclosed; it must not be repaired through undocumented analyst exceptions.

### Missing and pre-commercial exposure

Companies that satisfy no tier on admissible evidence, that have missing consolidated revenue, or that have no positive consolidated external revenue remain research candidates. A prospective pure play is not admitted on management's stated ambition alone. Where disclosure cannot establish a tier, the decision is **insufficient evidence**, not a conclusion that the company has no AI exposure.

A material acquisition or disposal after the reported period triggers reassessment. Do not combine incompatible pre- and post-transaction revenue perimeters. Where compatible published evidence is unavailable, record the uncertainty and apply the review/removal policy rather than manufacture a pro forma estimate.

## Evidence Hierarchy

Sources fall into three classes. The class determines what a source may do, never whether it is interesting.

**Establishing — may satisfy a tier test.** Audited annual reports; Form 10-K; Form 20-F; equivalent statutory annual filings. Also, subject to the conditions below: furnished Form 8-K earnings exhibits, Form 6-K filings, and official annual or periodic results releases issued by the issuer, including official operating metrics that are clearly defined and reconcilable.

**Corroborating — may support, challenge, or trigger a review; never sufficient alone.** Investor presentations; management commentary; prepared remarks and oral statements on earnings calls; product documentation, datasheets, and technical specifications.

**Discovery only — never evidence.** Analyst research; press and news coverage; ETF and index membership; third-party thematic classifications and scores; generative-AI summaries; keyword frequency; management strategy statements.

### Conditions on a furnished or released figure

A figure from a furnished exhibit or an official results release may establish a tier test only where **all** hold: it states a figure for the period being measured; it **reconciles** to consolidated revenue in the same document or in the subsequent statutory filing; it is a **realized** figure, not guidance, a target, a backlog, a booking, or a pro forma; it appears in **the document's own text or tables**, not solely inside a quoted executive remark; and the document is retained with its hash and retrieval timestamp.

The penultimate condition does the decisive work. It separates an issuer's own dated statement of a completed period — prepared under the same disclosure controls as the filing it reconciles to — from an executive's remark that happens to be transcribed into the same release. **An oral management statement alone never establishes a quantitative qualification.**

### Variation by tier

The required class does not vary. What varies is which prong a class may satisfy.

- **Qualifying role** — Tier 1: Establishing source — the enumeration comes from the filing · Tier 2: Establishing source for the product's existence; **corroborating sources admissible for its technical characterization** · Tier 3: Establishing source — the offering must be shown to be sold
- **Materiality** — Tier 1: Establishing source · Tier 2: Establishing source (Prong B) · Tier 3: Establishing source (Route A rank 2+, or Route B share against the unresolved `τ_B`)

The single relaxation is Tier 2's technical characterization. Whether a product is an accelerator, high-bandwidth memory, or an AI-cluster transceiver is a technical fact that filings state imprecisely and datasheets state exactly. Product documentation may therefore characterize a product, while an establishing source must still show that the product exists and is material. **Product documentation never establishes materiality**, which is where a softer standard would actually bite.

## Exclusions

These are rules, not presumptions, and each one blocks a specific way the universe could dilute into a technology universe. An issuer excluded by any of them is not eligible, whatever its other attributes.

- **E1** — **Customer demand.** AI end-market demand for an issuer's general-purpose product never qualifies it. The qualifying test concerns the product, not the customer. A supply relationship with an AI company is not evidence about the supplied activity.
- **E2** — **Tools.** Supplying equipment, materials, chemicals, or design software and IP used to *manufacture* qualifying components does not qualify. The tool is not embodied in the AI computing system.
- **E3** — **Facilities.** Supplying land, buildings, colocation, electricity, or general building services — including heating, ventilation, cooling, switchgear, transformers, and backup power — to sites that host AI compute does not qualify.
- **E4** — **Internal use.** Using AI within the issuer's own operations, or to improve the issuer's own existing product, never qualifies.
- **E5** — **Incidental features.** Embedding AI capability in an existing product, priced within that product, does not qualify **where the AI is incidental to that product**. E5 reaches *incidental integration* — an AI capability added to an otherwise unrelated product — and does not reach *structural integration*, where the AI capability is part of the platform's core architecture and customer value proposition. **Bundling is therefore not, by itself, a ground for exclusion**: a capability integrated across an issuer's whole platform may be evidence of structural integration rather than evidence of a feature. Structural integration is assessed under [Tier 1 Route P](#docs-route-p--ai-integrated-platform) or Tier 3 on the conditions stated there, and is never established by the fact of bundling alone.
- **E6** — **Branding and third-party classification.** An issuer's name, self-description, marketing, ETF or index membership, thematic score, analyst classification, and share-price behaviour never qualify.
- **E7** — **Deterministic automation.** Programmed automation without material dependence on learned perception or learned policy does not qualify.
- **E8** — **Forward-looking statements.** Guidance, targets, backlog, bookings, pipeline, total-addressable-market statements, and forecasts never establish eligibility. They may corroborate.
- **E9** — **Pre-commercial.** An issuer with no positive consolidated external revenue is a research candidate, not a member.

E1 and E2 exclude issuers that are genuinely central to AI and will attract challenge. That is the cost of a boundary that does not move, and the reasoning is recorded in [Limitations](#docs-limitations).

## Value-Chain Attribution

**A tier and a value-chain layer are different things, and the methodology records both.**

- The **primary eligibility tier** records *how* the issuer qualified. Exactly one per issuer. It determines membership.
- The **value-chain layer** records *what economic function the issuer performs*. One or more per issuer. It determines nothing.

The distinction is necessary because Tier 1 is a whole-issuer test while Tier 2 is a product test, so two issuers selling the same kind of product can qualify by different routes: an undiversified accelerator designer satisfies Tier 1 because its entire business qualifies, while a diversified accelerator designer satisfies Tier 2 because only its accelerator family does. Both perform the same economic function. **Publishing the tier as though it were an economic sector would therefore misdescribe the universe**, and the more AI-native hardware issuers the universe admits, the more misleading it becomes.

Value-chain layers:

- **Compute and infrastructure** — Supplying components, systems, or manufacture embodied in AI compute systems
- **Platform** — Providing AI models, compute, or developer services to others
- **Application** — Selling AI products to end customers
- **Autonomy** — Supplying systems whose behaviour depends on learned perception or policy

Tier 1, Tier 2, and Tier 3 are **not** published as economic sectors, categories, or quality rankings. Where the universe publishes a breakdown of what it contains, it publishes value-chain layers. Where it publishes how each member qualified, it publishes tiers. Neither affects weight.

### Primary-tier assignment

Deterministic, applied in order:

1. **Tier 1** if the issuer satisfies the Tier 1 whole-issuer test by either route.
2. Otherwise **Tier 2** if its largest qualifying activity is infrastructure or enabling activity.
3. Otherwise **Tier 3** if its largest qualifying activity is platform or application activity.

"Largest qualifying activity" is measured by disclosed revenue where disclosed, and otherwise by the principal business presented in the issuer's own segment structure. Tier 1 takes precedence because it is a whole-issuer test and cannot be satisfied simultaneously with a partial-business test in a way that leaves the outcome ambiguous.

#### The Tier 1 Route P and Tier 3 boundary

Both Tier 1 Route P and Tier 3 concern issuers that commercially provide AI capability to others, so the boundary is stated explicitly. It turns on **whether AI defines the platform identity**, not on size, diversification alone, or which gate is easier to pass.

- **Tier 1 Route P** applies where AI is central to the platform identity, the platform is commercially organized around enabling, deploying, or operating AI, and the non-AI components principally support that same integrated platform.
- **Tier 3** applies where the issuer is more diversified, AI is one material business line or service among others, and AI does not define the overall platform identity.

A diversified issuer whose AI offering is one line among several is Tier 3 even where that line is large, and an issuer whose entire platform exists to operate AI is Tier 1 Route P even where it reports no AI-specific revenue at all. **Route P may not be used to avoid an unresolved parameter.** Where the honest answer is Tier 3, the issuer is Tier 3, and if that leaves it inadmissible while `τ_B` is unresolved, it is inadmissible.

**An issuer has exactly one primary tier and is counted exactly once.** Where an issuer performs qualifying activity across layers — a platform operator that also designs its own captive accelerators, for example — the additional activity is recorded as a secondary value-chain layer and never as a second membership, a second tier, or a second contribution to universe size.

### Universe accounting invariant

Every candidate issuer carries exactly one mutually exclusive status:

- **Eligible** — Satisfies a tier's both prongs on admissible evidence
- **Pending** — A specific named condition is unresolved and identified
- **Contested** — Evidence is in tension and a determination has not been reached
- **Insufficient evidence** — Disclosure cannot establish a tier; not a finding that the issuer lacks AI exposure
- **Rejected** — An exclusion applies, or a tier test fails on the evidence

**Only issuers with status `Eligible` enter a tier subtotal or a universe count.** A non-eligible issuer may carry a candidate tier for analysis; it never counts. Two identities must be asserted wherever a universe or research count is published:

```
Tier 1 + Tier 2 + Tier 3 = total Eligible
Eligible + Pending + Contested + Insufficient evidence + Rejected = total assessed
```

This applies to production universe reviews and to research records alike. It exists because a research sample was published in which a `Pending` issuer carried a tentative tier label, was correctly excluded from the eligible total, and was incorrectly included in a tier subtotal — an error the first identity would have caught.

## Robotics and Autonomous Systems

A robotic or autonomous system qualifies where its **principal contracted functionality materially depends on learned perception or learned policy** — where the system's behaviour in variable or unstructured conditions derives from data rather than from pre-programmed trajectories, fixed rule sets, or real-time human direction.

Two clarifications make the rule operable:

- **Dependence, not purity.** Real systems mix learned components with deterministic scheduling and control. The test is whether the contracted functionality materially depends on the learned component, not whether the system is wholly learned. A test asking whether AI is the system's "core value" would not be objectively assessable.
- **Teleoperation is not autonomy.** A system whose actions are directed by a human operator in real time does not depend on learned policy, however sophisticated its mechanics.

"Robotics" is not an admission category. Industrial arms executing programmed trajectories, motion control, and programmable logic automation are excluded under **E7**, and a robotic system marketed for its intelligence is assessed on its disclosed functionality rather than its description. Conversely, a system in a category not usually called robotics qualifies where the dependence test is met.

Where an issuer's autonomous system is its entire business, Tier 1 applies and the value-chain layer is *Autonomy*. Where it is one business among several, Tier 2 or Tier 3 applies according to the primary-tier rule.

## Semiconductor and Compute-Infrastructure Boundary

Qualification attaches to evidenced supply of a qualifying product, never to a position in a supply chain and never to a customer's identity.

**Generally qualifying, where Prong B materiality is met:** AI accelerators; custom AI ASICs and XPUs; high-bandwidth memory; AI-cluster networking and interconnect; integrated accelerated-compute systems, servers, and rack-scale AI systems; **fabrication of qualifying AI chips**; **advanced packaging of qualifying AI chips**.

**Not automatically qualifying, absent product-level attribution that satisfies both prongs:** lithography; generic semiconductor capital equipment; deposition, etch, metrology, and packaging *equipment*; electronic design automation and licensable processor IP not dedicated to qualifying products; generic central processing units, including server processors sold into accelerated systems; commodity DRAM and NAND; power semiconductors; general servers; general networking; generic datacenter equipment; generic electrical infrastructure; and **generic foundry exposure without qualifying evidence**.

Three anti-patterns, stated because each has been argued:

1. **A supply relationship with an accelerator vendor is not evidence.** It describes a customer, not the supplied activity (**E1**).
2. **Enabling AI is not supplying AI.** An input can be necessary to every AI chip and remain a tool (**E2**). Necessity is not attribution.
3. **A general-purpose processor in an accelerated server is still a general-purpose processor.**

The boundary sits at the tool line because that is the only division in the chain that is both objective and stable. Every alternative — "critical", "advanced", "AI-exposed" — requires a judgement that expands under pressure and in a predictable direction: admit the lithography and deposition vendors and there is no principled ground to exclude the materials and photoresist suppliers behind them, and the universe becomes a semiconductor universe. The division is also explicable in one sentence: **a foundry that fabricates the accelerator die supplies a part of the AI computer; a vendor that sells the foundry its machines does not.** The distinction is between performing the manufacture and supplying the means of manufacture, and it is applied identically to every issuer.

Memory illustrates the same principle within a single issuer: high-bandwidth memory exists to feed accelerators and is embodied in them, so it qualifies; commodity memory is general-purpose and does not. An issuer qualifies on its high-bandwidth memory business, not on being a memory manufacturer.

## Cloud and Platform Boundary

General cloud revenue is not AI revenue. A diversified cloud or platform issuer qualifies only through **Tier 3 Route A** — a generally available, separately contracted AI offering disclosed at rank 2 or better — or through **Route B**, which is unusable in production while `τ_B` is unresolved, or by satisfying Tier 1.

No share of a general cloud business may be estimated or apportioned to AI. Where an issuer publishes only a growth rate, a strategic statement, or an annualized figure not derived from recognized revenue, Route A is not satisfied.

**Tier 2 and Tier 3 can both be reachable for the same issuer**, and the resolution is deterministic rather than discretionary: selling *access to* AI compute as a metered service is platform activity and therefore Tier 3; supplying *hardware embodied in* AI compute systems is Tier 2. An issuer doing both takes its primary tier from its largest qualifying activity under the primary-tier rule, with the other recorded as a secondary value-chain layer. Captive component design that serves only the issuer's own platform is not a merchant business and does not displace the platform as the primary role.

## Datacenter and Energy Boundary

Electricity, utility service, power generation, datacenter colocation, datacenter real estate, cooling, transformers, backup power, switchgear, and general electrical equipment **do not qualify merely because AI customers create demand for them** (**E1**, **E3**).

**A customer relationship to AI does not transform the supplier's business into AI exposure.** Large, disclosed, AI-driven commercial arrangements — a long-term power purchase agreement with a hyperscaler, a datacenter lease to an AI operator — evidence a customer, not a qualifying product. A commodity supplier whose product is fungible across all uses cannot satisfy Prong A whatever its contract book shows.

A company in these categories qualifies only where a **specific business or product independently satisfies a tier's both prongs**. The narrow case that can: thermal or power-delivery products **dedicated to accelerated-compute deployments**, such as direct-to-chip or immersion liquid cooling for accelerator racks, where the dedication is evidenced and Prong B materiality is met from an establishing source. A dedicated product whose revenue the issuer does not disclose is **insufficient evidence**, not an admission.

## Photonics and Networking Boundary

Interconnect qualifies under Tier 2 Prong A3 where the product is **deployed inside AI compute clusters**. The distinguishing question is the deployment location, which is objectively determinable: is the product installed within the compute cluster joining accelerators, or does it carry traffic between sites and users?

**Qualifying, where material:**
- AI fabric switching silicon and systems, scale-up and scale-out
- High-speed optical transceivers at AI-cluster rates sold into AI datacenters
- Silicon photonics and co-packaged optics for accelerator interconnect
- Retimers, AI connectivity silicon, and active cabling for accelerator fabrics

**Not qualifying:**
- Carrier, transport, and long-haul networking; optical line systems
- Telecom access and metro optics
- Enterprise campus switching and wireless
- Consumer and industrial connectivity

Generic telecom and enterprise networking does not qualify. A diversified optical component manufacturer with both datacenter and telecommunications businesses qualifies only where the AI-datacenter family satisfies Prong B on an establishing source — the same embodiment and materiality logic applied everywhere else, not a separate standard for this industry.

## Security Eligibility

Eligible representations are listed common or ordinary equity and sponsored, exchange-traded ADRs or GDRs with a verified underlying ordinary-equity claim and receipt ratio. Non-voting ordinary shares may qualify if they provide the relevant residual economic ownership rights.

Exclude preferred equity, debt and convertible instruments, warrants, rights, derivatives, tracking stocks, OTC-only securities, ETFs, closed-end investment funds, passive investment vehicles, pre-combination SPACs, and shells. A completed de-SPAC is assessed as a newly public operating business. Operating holding companies are assessed on consolidated operations; ownership of a stake in an AI company alone is not a qualifying activity.

Different listings, receipts, and ordinary classes of the same company do not create additional memberships. Independently listed operating subsidiaries may be distinct companies with minority shareholders; record parent-child ownership and remove controlling stakes from free float. Do not portray such economic links as independent underlying demand or sum their revenues into an AI market-size measure.

### Representative security selection

Apply security type, market access, data, and liquidity screens to each candidate listing before selecting a representative:

1. Retain the incumbent representative if it remains eligible, avoiding switches driven by small liquidity differences.
2. For a new company or an ineligible incumbent, choose the eligible listing with the greatest average daily traded value over the same three complete calendar months used in the liquidity screen, converted to USD using the prescribed daily FX observations.
3. Resolve an exact tie by preferring ordinary equity over a receipt, then the issuer-designated primary listing, then ascending ISIN and exchange MIC. Record the selection inputs and tie-break decision.

Do not prefer a U.S. listing because it has options. Receipt availability, conversion constraints, custody, and underlying access must be evidenced. A suspended line cannot win selection on stale historical turnover. Alternative listings can preserve representation only if they independently pass the rules.

**One issuer, one membership, one representative security**, in every case:

- **Multiple eligible ordinary classes** — One membership. Issuer capitalization may aggregate eligible classes; the weight attaches to the single representative security. The multi-class representativeness validation in [Free Float and Capitalization](#docs-free-float-and-capitalization) must be completed before production.
- **Local ordinary line and a depositary receipt** — The same economic claim, so one membership. Ordinary equity is preferred on tie-break, but the receipt may win on traded value. A receipt never relocates the business and never makes an otherwise inaccessible market accessible.
- **Dual listing of one issuer on two venues** — One membership. Traded value decides. Both venues must independently pass venue eligibility.
- **Parent and separately listed subsidiary** — Potentially two distinct companies with minority shareholders. Record parent–child ownership, remove the controlling stake from the subsidiary's free float, and never sum their revenues or portray the link as independent demand.
- **Tracking securities** — Excluded by [Security Eligibility](#docs-security-eligibility).

**For an issuer whose eligible lines sit in different jurisdictions, the representative-security selection materially determines the trading venue, the price currency and therefore the applicable reference exchange rate, the market-data and index-creation licences required, and the access route the reference investor must use.** It does not create an additional membership, an additional weight, or an additional tier. Because the selection is consequential for the venue register rather than for the issuer's identity, the register and the selection must be maintained consistently: a selection that resolves to a venue the register does not support produces an availability constraint under [Thematic eligibility is independent of launch availability](#docs-thematic-eligibility-is-independent-of-launch-availability), not a change of representative security to a more convenient line. No specific listing is selected by this document.

## Geographic Scope and Market Access

Developed and emerging markets are both in scope. Country domicile alone neither admits nor excludes a company. Assess the selected listing and its access route for reliable regulation, settlement, custody, pricing, reference data, and ability to acquire and dispose of the equity through a documented institutional access route.

Before launch, publish a versioned country/exchange/segment eligibility register identifying each venue by MIC, access route, decision, rationale, evidence date, and effective interval. The initial register is **unresolved**. Unsupported venues are not implicitly eligible. Market classifications may inform the register but cannot replace the underlying checks or change historical eligibility automatically when a provider updates its classifications.

Foreign listings and depositary receipts may represent companies domiciled elsewhere if the claim and access route are sound. Record incorporation, main operating geography, trading venue, and access restrictions separately. Do not treat an ADR as U.S. business exposure.

Applicable investment restrictions, sanctions, binding foreign ownership limits, capital controls, or inability to settle can make a company or route ineligible. The launch register must specify the reference investor/access assumptions and applicable jurisdictional restrictions; there is no universal claim of accessibility for every investor. Use authoritative regulatory evidence for restrictions. An alternative listing cannot circumvent an issuer-level prohibition.

Where reliable prices, ownership data, identifiers, or corporate-action records are unavailable, classify the exclusion as a coverage or access limitation. Publish the resulting geographic gaps. “Global” describes the target scope, not a claim of exhaustive representation.

### Thematic eligibility is independent of launch availability

**An issuer's tier qualification is determined without reference to whether Urdais can currently include it in a published index.** The two determinations are recorded separately and must never be merged:

- **Thematic eligibility** asks only whether the issuer satisfies a tier's both prongs on admissible evidence. Jurisdiction, venue, data rights, and licensing are irrelevant to it.
- **Launch availability** asks whether Urdais holds the market-data rights, index-creation rights, display rights, float data, foreign-access support, and custody and settlement support to carry the issuer in a published index.

An issuer may therefore be **methodology-eligible and not currently includable**, because market-data rights are unavailable, exchange or index-creation rights are unresolved, investment access is insufficient, custody or settlement requirements fail, or foreign-ownership restrictions prevent practical access. Such an issuer is recorded as eligible with its availability constraint stated, and **the resulting coverage gap is published** rather than resolved by declaring the issuer ineligible.

**Licensing constraints are not eligibility criteria.** Admitting or excluding an issuer on the basis of what Urdais can license would make the universe a function of Urdais's commercial position rather than of the issuer's role in the AI value chain, and would make the published methodology unfalsifiable. Testing confirmed the separation holds in practice: the framework identified eligible issuers in markets whose venues are not licensable at launch, and identified ineligible issuers in markets that are.

## Investability and Liquidity

Every parameter in this section is a **provisional methodology parameter**. The numerical minima have not been empirically optimized, because the float and liquidity inputs required to test them are licensed data Urdais does not yet hold. They are stated so the design is complete and testable, not because they are calibrated, and they are to be re-tested against the eligible universe once those inputs are licensed.

Measure liquidity on the selected listing without adding turnover from separate listings, receipts, or share classes. Use three complete calendar months ending at the market-data cutoff. For each scheduled local exchange session, use reported traded value or consistently defined price-times-volume data, with documented auction and off-book treatment. Convert daily values to USD before aggregation.

Retain average daily traded value, median daily traded value, the share of scheduled sessions with trading, suspension history, and missing-price observations. Known zero-volume or suspended scheduled sessions count as zero; holidays are omitted. Missing data remain missing and do not silently become zero or disappear from the denominator.

The proposed screens require positive, reliably measured investable capitalization and free float, a complete three-month listing/trading record, and compliance with minimum capitalization, traded-value, trading-frequency, and data-completeness requirements. **Numerical minima, suspension tolerances, and entry/retention buffers are unresolved.** The three-month record is a proposed operational convention, aligned with the comparison window; it is not evidence that a specific liquidity threshold is adequate.

Use both typical-session and average activity to identify episodic trading spikes. Total market capitalization is retained for context, but the proposed size gate uses accessible free-float capitalization. Do not add a second total-cap minimum without demonstrating what failure it prevents. Free-float percentage and foreign headroom are separately evaluated rather than assumed adequate because the company is large.

No minimum price or profitability screen is proposed: share denomination and accounting profits do not establish liquidity or AI relevance. No options-liquidity or options-availability screen belongs here.

## Free Float and Capitalization

Use accessible free-float-adjusted market capitalization, rather than total company capitalization, as the weighting input. Strategic or unavailable equity should not carry the same weight as public equity available through the defined access route. This follows the investability principle in the FTSE comparison without importing its full ruleset.

Conceptually exclude treasury shares, controlling and strategic stakes, government strategic holdings, insider holdings, cross-holdings intended for control, and legally locked or otherwise non-tradable shares. Do not exclude a non-strategic investment manager's holdings merely because it is a large shareholder. Avoid deducting the same stake twice when ownership categories overlap. Unknown ownership is a data gap, not automatically float.

For company i at snapshot reference time t:

`M_i(t) = Σ over eligible distinct ordinary classes k [P_ik(t) × N_ik(t) × f_ik(t) × X_ik(t)]`

`P` is the class price in local currency, `N` outstanding shares of that class, `f` the accessible free-float factor after overlapping strategic and foreign-access restrictions are reconciled, and `X` USD per unit of local currency. Each class must have an accessible eligible listing and reliable independent valuation. Do not price an unlisted or ineligible class by assuming it is interchangeable with a listed class.

Count each underlying class once. An ADR/GDR and its underlying shares are the same claim for this purpose: adjust the observed price for the verified receipt ratio and do not add depositary shares to underlying shares outstanding. Use the accessible underlying share pool only where conversion and access support it; otherwise the accessible pool requires separate substantiation. Foreign ownership limits constrain `f`; remaining headroom is also an eligibility check, not a second unexamined haircut.

The issuer weight is assigned to the single representative security. Aggregating class capitalization does not aggregate executable liquidity into that line. Empirical validation must assess the capacity of that representative under the resulting issuer weight.

Aggregation also raises a representation question for downstream consumers: the issuer's weight reflects the capitalization of every eligible class, while a downstream return or volatility series observes only the representative security. Where classes differ materially in economic or dividend rights, voting structure that affects valuation, convertibility or interchangeability, foreign-access restrictions, liquidity, or persistent price premia and discounts, one security may not represent the return on the capitalization that set the weight. Before production, validation must test, for every multi-class issuer: economic-right equivalence across the aggregated classes; convertibility or interchangeability; the size and persistence of price spreads; return correlation and divergence between classes; liquidity divergence; the capacity of the representative listing under the issuer weight; and the tracking distortion that mapping issuer-level capitalization to a single-security return would introduce in a downstream output. Possible remedies, none adopted here, include aggregating only economically equivalent classes, restricting which classes contribute to issuer capitalization, changing the representative-security rule, or constructing an issuer-level composite return. The one-company, one-membership architecture and the single representative security are retained unless that evidence requires a change through a versioned amendment.

Record price, shares, float, FX, source timestamps, and adjustments separately. The exact FX source/fixing, ownership-vendor reconciliation, stale-price tolerance, and accessible-pool conventions must be resolved before production. A global snapshot uses the most recent eligible local close at or before the stated reference timestamp, never a subsequent close; documented local holidays are distinguished from data outages.

## Base Weighting Methodology

**Selected proposal: issuer-capped, accessible free-float market-cap weighting, without an exposure or volatility multiplier.** The issuer cap is unresolved, so no production base weights can be claimed yet.

Alternatives were evaluated against the purpose of a shared public-equity universe:

- **Equal weighting** treats economic sizes as equal and transfers large allocations to small issuers. It is easy to explain but is not a neutral representation of investable equity size.
- **Total market-cap weighting** represents the whole listed business but also weights strategic and inaccessible holdings. It does not address diversified-company dominance.
- **Uncapped free-float weighting** is the clearest public-equity-size reference. Preserve it as a diagnostic, but it can leave the shared measure largely determined by a few diversified issuers.
- **Capped free-float weighting** preserves relative economic scale among uncapped companies while explicitly limiting single-issuer dominance. It is the recommended compromise, subject to concentration and capacity testing.
- **Revenue/exposure weighting or an exposure-times-cap hybrid** can strengthen thematic focus, but mixes accounting attribution uncertainty into every weight. Revenue fractions are not fractions of enterprise value; estimating them more finely does not necessarily improve the measure.
- **Tier quotas, equal weights within categories, or volatility adjustments** introduce additional views about the desired portfolio. Those views are not the objective of this shared primitive.

Admission addresses thematic relevance; capitalization addresses public equity scale. Neither solves the other. The selected design includes non-AI business value within admitted diversified companies and deliberately departs from market proportions when caps bind. Both effects must be disclosed, not described as a purified valuation of AI.

### Weight definition

For admitted companies with positive `M_i`, compute the uncapped reference `u_i = M_i / Σ_j M_j`. At each base-weight reset, choose the capped allocation:

`w_i = min(c, λ × M_i)`, with `Σ_i w_i = 1`.

Here `c` is the approved common issuer cap, with `0 < c ≤ 1`, and `λ > 0` is the scaling factor that allocates the remaining mass proportionally among uncapped issuers. Equivalently, cap overweight issuers and repeatedly redistribute excess in proportion to uncapped capitalization until the constraints hold. The resulting weights are unique when feasible, including the boundary where all issuers are capped.

Use unrounded values for calculations. Display rounding must not become the next calculation's input. The empty universe or a non-positive capitalization total has no valid weight vector. With n positive-weight companies, `n × c ≥ 1` is necessary for feasibility. If it fails, do not silently relax the cap, add ineligible companies, or fall back to equal weights; withhold a new production snapshot and publish the reason.

## Concentration Controls

Apply the cap at company/issuer level after duplicate listings and share classes have been consolidated. Do not add activity, country, sector, or exposure-tier quotas in this proposal. Those would require a defensible target distribution for the AI economy that is not yet established.

An issuer cap can stop one diversified business from determining most of the measure, but cannot by itself prevent a group of diversified firms from dominating it. Publish uncapped and capped top-issuer concentrations, aggregate diversified-exposure weight, country/activity distributions, and the effective number of constituents `1 / Σ_i w_i²` during validation.

The cap size must be selected from evidence, not fund-regulatory conventions alone. Test plausible values around researched precedents against the uncapped reference, including their effects on small-company capacity, turnover, and thematic representation. If no defensible cap achieves the stated compromise, revise the proposal before launch. There is no numerical cap, group cap, or emergency cap override in this draft.

Base caps apply when snapshots are reset. They are not a promise about downstream weights after filtering or market movement.

### Cap feasibility as a publication gate

Because every weight is capped at `c` and the weights must sum to one, a valid capped allocation requires at least `1/c` positive-weight companies. Research testing confirmed that both candidate cap values are feasible against the eligible universe the tiered framework produces, with better than twofold headroom; under the superseded revenue-share gate neither was feasible, which is what made the eligibility redesign necessary rather than merely desirable.

**No production snapshot may be published unless `n × c ≥ 1`**, where `n` is the count of issuers with status `Eligible` under the [universe accounting invariant](#docs-universe-accounting-invariant). Where it fails, withhold the snapshot and publish the reason, exactly as [Weight definition](#docs-weight-definition) requires. Constituent count is therefore a feasibility precondition and not a presentational target: the gate exists to prevent a universe too narrow to weight from being published with a relaxed cap instead.

**The cap is not to be loosened in order to make a snapshot feasible.** A cap adjusted to accommodate a universe is not a concentration control. Where feasibility fails, the correct responses are to withhold, or to re-examine eligibility on the evidence — never to widen `c`.

The cap value `c` is an **unresolved** launch parameter. Research recommends holding a value in the 8%–10% range, with 8% preferred as the tighter control, and both are arithmetically feasible; **no value is approved for production by this document**, because selection requires the capped-versus-uncapped concentration test on point-in-time float data that is not yet licensed.

### Secondary concentration constraints

A secondary constraint of the 5/10/40 form — no single weight above 10%, and weights above 5% not exceeding 40% in aggregate — is **published as a diagnostic and is not binding.** It is measured and disclosed alongside the effective constituent count `1 / Σ_i w_i²` and the uncapped and capped top-issuer concentrations.

It is not adopted as a constraint because it originates in a fund-regulatory diversification requirement rather than an index-representativeness one, and because no failure of the single issuer cap has been demonstrated that it would remedy. The AI universe is expected to remain top-heavy, so the measurement is worth publishing; adopting a constraint whose failure mode has not been observed is not. Making it binding requires approval and evidence that the issuer cap alone is insufficient.

## Reconstitution and Rebalancing

**Proposed cadence: quarterly in March, June, September, and December.** Reconstitution reassesses membership, classifications, and representative securities. Rebalancing recalculates capitalization inputs and base weights. Perform both quarterly, with ongoing monitoring for material business changes and mandatory corporate events.

Quarterly full reviews are a deliberate Urdais choice to reduce the delay in recognizing AI business evolution without discretionary daily additions. They may increase evidence-review workload and turnover; both must be tested before approval.

For each cycle, publish an annual calendar specifying the evidence cutoff, market-data cutoff, announcement timestamp, and effective timestamp. Evidence must be publicly available by the evidence cutoff; all market inputs must be observed by the market-data cutoff. Both cutoffs precede the announcement, which precedes effectiveness. Exact dates, global holiday handling, and the minimum announcement interval are **unresolved launch requirements**.

A dated weight snapshot remains the canonical allocation until superseded by a scheduled reset or a valid event weight snapshot, or until a universe event leaves parent weights unavailable (see [Corporate Actions and Exceptional Events](#docs-corporate-actions-and-exceptional-events)). It is not a continuously recalculated live portfolio weight. Downstream products must identify the universe version they consume; their return and between-reset portfolio mechanics belong in their own methodologies.

## IPOs and Newly Public Companies

Use scheduled quarterly entry only in the initial proposal. An IPO, direct listing, completed de-SPAC, or newly eligible operating company must satisfy the same exposure, access, data, and three-month history requirements by the cutoffs. No fast entry or size-based waiver is authorized.

This can delay a significant new company by more than one quarter when sufficient history or disclosed evidence is unavailable. The trade-off is intentional: market excitement cannot substitute for comparable evidence. FTSE demonstrates that fast entry can be rule-bound; that does not establish suitable Urdais thresholds. Revisit a fast-entry regime only with historical IPO data and a separately approved amendment.

## Corporate Actions and Exceptional Events

Preserve the event announcement, terms, effective time, predecessor/successor identities, decision, and affected universe versions. These rules govern shared membership and base-weight snapshots, not an index's return treatment.

- **Ticker, name, exchange, and identifier changes:** preserve company identity. Revalidate the listing; a cosmetic change does not add or remove the business.
- **Stock splits and consolidations:** maintain consistent price/share units. An economically neutral split alone does not trigger a new economic allocation.
- **Share-class changes and receipt conversions:** preserve the underlying company, eliminate duplicate claims, and reselect the representative if required. Do not infer continuity when economic ownership rights change materially.
- **Mergers and acquisitions:** remove a disappearing company at the event's effective time. Reassess any surviving member against the changed business perimeter. An ineligible or non-member acquirer does not inherit admission merely by acquiring a member.
- **Spin-offs:** maintain distinct predecessor/successor identities. The new company is a research candidate and enters only through the scheduled process; it is not automatically admitted. Reassess the parent's remaining business. Handling distributed securities in a downstream index is outside this methodology.
- **Delisting, cancellation, or liquidation:** remove the company if no eligible representation survives. Do not carry a cancelled security as a current member.
- **Bankruptcy and major restructurings:** commence an exceptional eligibility review on authoritative notice. Remove on liquidation, cancellation, or loss of access/eligible representation; a restructuring filing alone is not equivalent to cancellation. Unresolved going-concern or successor-claim evidence blocks an updated valid snapshot where it is needed.
- **New issuance, lock-up expiry, or changed ownership:** incorporate ordinary share/float updates at the scheduled reset. Mandatory conversions and loss of eligibility are handled at the event time. A price change alone does not reset base weights.

**Universe events and event weight snapshots.** An exceptional deletion, or any other exceptional membership or identity change under the rules above, produces two separable outputs. The first is a **universe event**: a dated, versioned record of the membership or identity change, the affected company and representative security, the reason, the announcement time, and the effective time, together with the resulting membership state. A universe event is published as valid once the underlying membership or identity facts are established under this methodology; its validity does not depend on whether a new weight vector can be produced. The second is an **event weight snapshot**: the canonical parent base-weight allocation over the surviving membership. Let `S` be the surviving membership, `w_i` the pre-event canonical base weight of surviving company `i` in the weight snapshot being superseded, and `c` the approved issuer cap. The event weight snapshot is:

`w'_i = min(c, λ × w_i)` for `i ∈ S`, with `λ > 0` chosen so that `Σ_{i∈S} w'_i = 1`.

Equivalently: remove the deleted companies; take the surviving pre-event base weights as the proportional inputs; redistribute the deleted weight among survivors in proportion to those inputs; and reapply the issuer cap iteratively, redistributing any excess above `c` proportionally among uncapped survivors, until every weight satisfies the cap and the weights sum to one. Use unrounded values. No new capitalization, price, or float observation enters the event weight snapshot; it re-allocates the superseded snapshot's weights only. Because the cap can bind for survivors that were uncapped before the event, holding survivors in their pre-event proportions does not in general reproduce `w'`. The solution is unique when feasible. Feasibility requires a non-empty `S` and `|S| × c ≥ 1`.

**When no valid event weight snapshot exists.** If `|S| × c < 1`, or no valid capped allocation can otherwise be produced, the universe event and the new membership state are still published as valid. The event weight snapshot is withheld, and parent base weights are marked **unavailable** for the effective interval beginning at the event time; the last valid weight snapshot is preserved historically with its original date and is not presented as current. Publish the reason. Do not relax the cap, add replacement or ineligible companies, fall back to equal weights, or manufacture weights. Weights become available again at the next scheduled reset, or at an earlier valid event weight snapshot if a later universe event makes one feasible. For example, with `c = 5%` and twenty members the scheduled snapshot is feasible; if one member delists, the nineteen survivors cannot carry a capped allocation (`19 × 5% < 1`), yet the delisting is a valid universe event and the membership state changes at the effective time.

Do not insert replacements between reviews. A security substitution for the same continuing economic claim preserves the company weight and is not a re-allocation in this sense. Other material changes requiring new capitalization or allocation evidence block an event weight snapshot until reliable inputs and an announced treatment are available; they do not block the universe event that records the membership or identity facts. Every exception produces a dated notice; a previously valid snapshot remains historical rather than being silently presented as current.

**Downstream consumption.** A universe event supplies membership, identity, effective time, and event information; an event weight snapshot supplies canonical base weights. Neither dictates downstream portfolio mechanics. A downstream methodology that needs only the membership change can consume the universe event whether or not an event weight snapshot exists. In particular, [UGAI](/docs/methodology/ugai) removes the deleted member at the effective time with a divisor adjustment, leaves surviving index shares unchanged, lets its as-of weights continue to drift, and does not re-weight to `w'` before its next scheduled reset; an unavailable event weight snapshot therefore does not by itself make UGAI unavailable. A downstream methodology that requires current canonical base weights, such as UAVI's filtered renormalization, has no valid parent weights to consume while they are unavailable and is delayed, unavailable, or otherwise governed by its own publication rules, which are defined in that methodology, not here. Nothing in this section requires an unscheduled downstream rebalance.

## Removal and Temporary Failures

Review all members against the same substantive tier and security rules used for admission. **A member is removed at the next scheduled review where it no longer satisfies any tier** — that is, where its qualifying role has ended, or where materiality under its tier's prong is no longer evidenced, or where the determination has become **insufficient evidence** because the evidence that supported admission is no longer structurally valid — or where an investability screen fails.

Requalification is assessed on the evidence available at the review, not on the issuer's unobservable true AI exposure. A member whose tier qualification lapses may do so because its business changed, because its disclosure changed, or because a stricter attribution was applied at review, and **the recorded rationale must state which of the three it was.** That distinction matters: a business that is unchanged but has stopped disclosing is a different fact from a business that has exited AI, and conflating them would make membership a function of reporting practice alone.

Entry and retention buffers for investability are unresolved. Whether tier requalification needs hysteresis is an open empirical question rather than a settled design: a member sitting near a materiality boundary could enter and exit repeatedly through ordinary reporting noise, seasonality, or disclosure revisions. No buffer, numerical value, or hysteresis rule is adopted here; the item is recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required). No subjective exception is proposed.

A member whose primary tier changes without ceasing to qualify is **not** removed. The tier is re-recorded with its effective date, membership continues uninterrupted, and no weight consequence arises — the tier never entered the weight.

Permanent loss of the equity claim, a binding access prohibition, or no surviving eligible listing triggers exceptional removal at the applicable event time. Evidence of a completed disposal ending all qualifying activity also triggers an exceptional review rather than waiting for the next annual report.

A short trading halt or provider outage is not a permanent business exit. Record the condition, distinguish market closure from missing data, and apply the approved tolerance and escalation policy. Those tolerances are unresolved: do not silently carry stale observations into a new valid snapshot. Pending resolution, identify the current calculation as unavailable or delayed and preserve the last valid version with its original date. Recovery does not retrospectively erase the incident.

## Classification Review

At every quarterly reconstitution, and upon a material disclosure, review each member's **qualifying role, tier prong evidence, primary tier, value-chain layers, and activity tags**. Reassessment answers three questions in order: does a qualifying role still exist; is it still material under the member's tier prong; and is the primary tier still correct under the assignment rule. A change to the third alone is a re-recording, not a removal (see [Removal and Temporary Failures](#docs-removal-and-temporary-failures)).

**Membership is not continuously reactive.** Tier qualification changes at scheduled reviews and at the defined exceptional events, never on management commentary, a product announcement, a rebranding, an analyst reclassification, or a share-price move. A new AI product announced between reviews is evidence to be assessed at the next review, not an admission. This is deliberate: a universe that responded to announcements would be a sentiment index.

Review activity tags, exposure tiers, and evidence at every quarterly reconstitution and upon material disclosures. A general cloud company may qualify after attributable AI commercial activity becomes material; it does not qualify merely after changing its description. A former specialist absorbed into a conglomerate must be assessed within the surviving company's consolidation perimeter.

Differentiate changed facts, newly available evidence about earlier facts, and a change in the taxonomy itself. Give each an announcement time and effective time. Apply newly available evidence prospectively unless a separately labeled correction is warranted. Store the old rationale and classification; do not rewrite past membership using today's interpretation.

## Interface to UGAI Weighting

What a published universe version supplies to [UGAI](/docs/methodology/ugai), and what it does not.

**Supplied for calculation:** the universe version identifier with its effective and publication timestamps; the admitted membership; one representative security per member with identifiers and price currency; and the base weights `w_i`, being the issuer-capped accessible free-float weights summing to one.

**Supplied for attribution and reporting only, never entering calculation:** each member's primary eligibility tier; its value-chain layers; its activity tags; its evidence record; and `r_i_lower` where disclosed.

**The eligibility model is broader than it was. The weighting model is unchanged.** Weight is determined by accessible free-float market capitalization and the issuer cap, and by nothing else. Specifically:

- **No tier multiplier.** A Tier 1 member and a Tier 3 member of equal accessible free-float capitalization carry equal base weight.
- **No exposure multiplier.** An issuer's degree of AI exposure, however evidenced, never scales its weight. A member for whom AI is a minority of revenue carries its whole admitted equity value, and this is disclosed rather than corrected.
- **No tier budget, tier quota, or tier-specific cap.**

The reasons are three, and they are methodological rather than aesthetic. A tier records how an issuer qualified and therefore carries no economic magnitude that could be multiplied. Weighting by tier would require a defensible target distribution across layers of the AI value chain, which does not exist. And a multiplier would break the property that makes the index auditable: that a member's as-of weight is reproducible from its index shares, price, and exchange rate alone, with no classification input. A tier boundary would otherwise become a weight discontinuity, giving every contested classification a financial consequence.

## Downstream Weight Renormalization

For each valid parent weight snapshot, `Σ_i w_i = 1` and `w_i ≥ 0`.

For a downstream eligible subset E, let `S_E = Σ over j in E [w_j]`. If `S_E > 0`:

`v_i = w_i / S_E` for i in E; `v_i = 0` otherwise.

Then `Σ_i v_i = 1`. Filtering preserves the relative base weights of surviving members. If the subset is empty or has zero total base weight, the normalized allocation is undefined; do not substitute equal weights or reuse a different universe version without disclosure.

[UAVI](/docs/methodology/uavi) begins with the canonical universe base weights, applies its own options-eligibility filter, and renormalizes the surviving constituents. It does not independently select an AI equity universe or replace the inherited weights. Options rules and calculations are left entirely to the UAVI methodology. The canonical base weights available for a given date are those of the scheduled weight snapshot effective on that date or of a valid event weight snapshot effective at that date (see [Corporate Actions and Exceptional Events](#docs-corporate-actions-and-exceptional-events)); which of these a downstream output consumes for a particular calculation date is specified by that output's methodology, not here. A valid membership state can exist for a date on which no current weight snapshot exists; on such a date the renormalization above has no valid input. Do not reuse a superseded weight snapshot as though it were current, and do not fabricate weights; the downstream output applies its own delayed or unavailable rules. The parent guarantees that every published weight snapshot, scheduled or event, satisfies the sum-to-one and issuer-cap conditions.

Renormalization can produce weights above the parent issuer cap. Do not automatically recap a downstream subset: doing so would change the specified relative-weight inheritance. Any downstream departure would require its own explicit methodology decision. Record the parent version, excluded membership, exclusion reasons, surviving base-weight mass, and resulting weights.

## Historical Membership and Lineage

Membership must be reproducible for a historical effective time and for what was known as of a historical publication time. Preserve both dimensions. A backfilled filing or corrected vendor record must not masquerade as information available before its release.

Each universe version must be able to answer which companies belonged, why each qualified, which representative security and classification applied, what base weight it carried or that weights were unavailable and why, and which methodology/parameter version governed it. Maintain additions, removals, unchanged decisions, exclusions, and replacements with effective intervals and reasons. Rejected and insufficient-evidence candidates must also be retained to make selection auditable.

Conceptual lineage is:

Universe Version → Universe Events → Membership State → Weight Snapshot (where valid) → Company Membership → AI Classification → Eligibility Evidence → Security / Market Data → Original Sources

In practice this is a linked evidence structure: exposure evidence supports relevance; listing and market data support investability and weighting. Preserve both branches. Retain source publication/access timestamps, reporting periods, immutable source references or permissible archived copies with hashes, original-language evidence, translation provenance, input vintages, reviewed attribution, overrides/corrections, and decision authorship. Reproducibility depends on lawful historical source retention; an unavailable license or overwritten source is a documented limitation, not an assumption of completeness.

This methodology specifies those requirements; it does not define a database schema, classifier, or data pipeline.

## Source Hierarchy for Reference, Ownership and Event Facts

**Thematic eligibility evidence is governed by the [Evidence Hierarchy](#docs-evidence-hierarchy), not by this section.** This section governs every other factual claim the universe depends on: company and security identity, listing status, equity rights, receipt ratios, ownership and free float, corporate-action terms, prices, and liquidity. The two are consistent — establishing, corroborating, and discovery map onto ranks 1–2, 3, and 5 below — and where they overlap for a given claim, the Evidence Hierarchy's conditions on a furnished or released figure prevail.

Use sources appropriate to the claim, with a documented resolution for conflicts:

1. **Regulatory filings, audited financial statements, and audited segment disclosures:** preferred for identity, ownership, consolidated revenue, and reported business composition.
2. **Official exchange, regulator, issuer corporate-action, and depositary notices:** authoritative for listing status, equity rights, receipt ratios, and event terms; a later official event notice can supersede an older annual report for those facts.
3. **Filed interim reports and reconciled issuer operating disclosures:** may update the evidence, with period and audit status explicit. Official product documentation substantiates functionality, not undisclosed revenue.
4. **Documented market/reference data providers and independent specialist research:** supply standardized prices, float, liquidity, cross-checks, or research leads. Preserve the underlying source and estimation method where available; a vendor score is not proof of eligibility.
5. **News, presentations, commentary, and marketing:** discovery and corroboration only where stronger evidence is absent; they cannot independently establish material revenue attribution.

Prefer a later authoritative correction for the specific fact over an older source. Escalate unresolved contradictions and withhold the affected determination rather than averaging conflicting values. Generative-AI summaries, keyword frequency, analyst enthusiasm, and management strategy statements cannot serve as admission evidence. Automated tools may assist discovery, but this methodology requires a traceable evidence decision, not an opaque classifier output.

## Data Quality and Publication Requirements

Before a production snapshot is valid, require:

- Stable company-to-security-to-listing identity, valid identifiers, underlying receipt mapping, and no duplicate economic claim.
- A reconciled revenue period and consolidation perimeter, attributable qualifying lower bound, dated evidence, classification rationale, and an independently checked admission decision.
- Correct price currency and units, class share counts, float/access inputs, FX orientation, and corporate-action adjustments. Do not combine post-split shares with pre-split prices.
- Reproducible liquidity windows, venue calendars, zero-versus-missing distinctions, listing status, and suspension flags.
- Dated country, exchange, ownership, and access evidence consistent with the reference investor assumptions.
- Valid positive capitalization for weighted members; finite, non-negative weights; sum-to-one and issuer-cap compliance at the relevant snapshot; and successful capping feasibility checks.
- Published effective and knowledge cutoffs, methodology and universe versions, change notices, coverage limitations, and a complete audit path.

Exact freshness limits, numeric reconciliation/rounding tolerances, market-data provider contracts, and source-retention rights are unresolved launch requirements. A failed critical identity, eligibility, or weight check blocks the affected new production snapshot; it does not authorize unrecorded imputation. Downstream users must distinguish valid, delayed, unavailable, superseded, and corrected releases. Membership state and weight availability are published as distinct statuses: a valid universe event with unavailable weights is neither a failed release nor a valid weight snapshot.

## Governance and Versioning

Keep one accountable methodology owner and an independent check of admission, removal, and parameter decisions. Record the reviewer, evidence, rationale, conflicts, and approval date without creating a separate committee structure for every classification.

Version the methodology, taxonomy, parameter set, and market eligibility register. Material changes require a documented rationale, impact assessment, announcement, and prospective effective date. Editing this public page is not an implicit production methodology change. Provider updates are research inputs and do not automatically amend Urdais rules.

Preserve as-published snapshots. Corrections identify the original release, corrected release, affected dates, and cause; new information is distinguished from an error in applying information previously available. Any reconstructed pre-launch history must be labeled as research/backtest history with its information limitations. No backtest or live membership is created here.

Version history: **0.1.0-draft, 12 September 2026** — initial research-backed proposal; no production effective date. **0.1.1-draft, 12 September 2026** — post-merge audit against the cited primary sources: Solactive eligible-region description corrected to include Canada; exceptional event-snapshot weights formalized as a capped proportional re-allocation of surviving pre-event base weights, with the UGAI non-rebalance relationship stated; annual admission measure reconciled with interim evidence; exposure-retention buffering moved to empirical validation; multi-share-class return-representativeness validation added; removal condition stated on `r_i_lower`; STOXX cap timing clarified; universe events separated from event weight snapshots so that an infeasible capped allocation leaves parent weights, not the membership state, unavailable; completed fiscal year retained as the canonical exposure period, with interim evidence limited to review, corroboration, and invalidation. No production effective date.

**0.4.0-draft, 17 September 2026 — eligibility semantics change: Tier 1 recognizes AI-integrated platform companies, and E5 is narrowed from integration to incidence.** The first production eligibility review, run against real statutory filings, rejected an issuer whose entire platform exists to deploy and operate AI, on two grounds that together proved to be a rule defect rather than a correct result: its data, ontology, and deployment components were mapped as non-qualifying software, and its AI platform was excluded under E5 because the filing described it as integrated across the issuer's other platforms rather than sold separately. The combination meant an issuer could be penalised precisely *because* its AI was structurally integrated, which inverts the economic question the universe is meant to ask. Three changes follow. **Tier 1 gains a second route**: Route N is the existing AI-native whole-issuer enumeration, unchanged in every condition, and Route P admits an issuer whose commercial platform is materially organized around deploying, operating, or enabling AI or ML systems for customers, on five conditions — customer-facing AI capability, platform centrality, operational role, commercial scale, and an unrelated-business guard. Route P requires **no** separately reported AI revenue where the capability is structurally integrated and separate accounting does not exist; it reinstates no revenue-share threshold. **E5 is narrowed** from excluding bundled AI capability generally to excluding AI that is *incidental* to its host product, with bundling expressly removed as a ground for exclusion on its own; structural integration is assessed under Tier 1 Route P or Tier 3 on their own conditions. **The Tier 1 Route P and Tier 3 boundary is stated explicitly**, turning on whether AI defines the platform identity, with Route P expressly unavailable as a way around the unresolved `τ_B`. No fourth tier is created and the three-tier architecture is intact. Tier 2 embodiment and its tooling exclusion, the Tier 3 Route A scale hierarchy, the unresolved `τ_B` and its 10% research-candidate status, the unresolved issuer cap, value-chain layer separation, one primary tier per issuer, and the eligibility/availability separation are all unchanged. No production effective date.

**0.3.0-draft, 17 September 2026 — breaking conceptual change: the universal revenue-threshold eligibility gate is replaced by a tiered material AI exposure framework.** Admission no longer requires an issuer to disclose qualifying AI revenue reaching a threshold share of consolidated revenue (`r_i_lower ≥ τ`). Empirical testing against real issuer filings established that almost no diversified issuer discloses an AI-only numerator, that the threshold consequently had no discriminating power across candidate values, and that the rule produced an eligible set too small to satisfy the cap feasibility condition — so the gate was not merely strict, it was unpublishable. In its place: three exposure tiers, each with a two-prong role-and-materiality test; Tier 1 on a whole-issuer enumeration with an ancillary-support rule, a services test, and a 75% safe-harbour convention; Tier 2 on embodiment in AI compute systems at one step, excluding the manufacturing toolchain; Tier 3 on a platform route with a ranked scale-evidence hierarchy, and an application route (Route B) whose materiality floor `τ_B` is **unresolved**, with 10% retained as the current research candidate and production Route B admission blocked until `τ_B` is approved. Also added: nine numbered exclusions; a separated value-chain attribution dimension distinct from the eligibility tier; a deterministic primary-tier assignment rule with exactly one tier per issuer; a universe accounting invariant with mutually exclusive statuses; a robotics and autonomy rule on learned-perception dependence; explicit semiconductor, cloud, datacenter–energy, and photonics–networking boundaries; an explicit separation of thematic eligibility from launch availability; a cap feasibility publication gate; 5/10/40 as a published diagnostic; and a Limitations section. `τ` is removed as a parameter; revenue-share evidence is retained in three named narrower roles, of which only the Tier 1 safe harbour carries a stated value. The superseded reasoning is preserved in this changelog and in the research record under `docs/research/ugai/`; the active methodology retains no parallel eligibility system. No production effective date.

Approval of this document and closure of launch requirements must precede a production version.

## Open Questions / Empirical Validation Required

No production memberships or base weights may be released under this draft. The following decisions must be recorded in an approved parameter/methodology release, with evidence rather than unexplained defaults:

- **Tier 1 safe-harbour share (convention, currently 75%):** test against a wider sample of undiversified issuers whether the safe harbour captures the issuers it is meant to shortcut. Only one sampled issuer's disclosed ratio has fallen between a low single-digit percentage and 100%, so the value is uncalibrated. It is procedural only — an issuer below it is assessed on the four Tier 1 conditions — so the cost of a wrong value is review effort, not a wrong admission.
- **Tier 3 Route B materiality floor `τ_B` — an unresolved production parameter, not a calibration check on an active rule.** Research establishes that low-single-digit exposure is insufficient: a separately monetized AI line at roughly 2% of consolidated revenue does not make a diversified issuer materially an AI business. **10% is the current research candidate.** The observed sample is too sparse near the boundary to approve it — no sampled issuer fell between roughly 5% and 30% of revenue — so the sample bounds the floor from below and locates nothing. Wider point-in-time testing across diversified issuers with disclosed AI application revenue is required, at a range of candidate values rather than at 10% alone, before any value is approved in a versioned release. **No production Route B membership may rely on an unapproved threshold**, so Route B is defined and unusable in production until `τ_B` is approved. Unlike the Tier 1 safe harbour, which is procedural and may stand as a convention, a wrong value here changes admissions directly.
- **Tier requalification hysteresis:** using point-in-time filings, measure how often members near a tier materiality boundary would enter and exit through ordinary reporting noise, seasonality, or disclosure revision rather than real business change. Adopt a retention buffer only if it improves stability without retaining immaterial exposure; otherwise keep single-threshold requalification. Nasdaq's differing entry and retention capitalization levels illustrate buffering for an investability screen, not a precedent for a thematic buffer.
- **Residual disclosure bias:** the tiered framework substantially reduces the dependence on revenue disclosure that made the superseded gate unworkable, but it does not eliminate it — Prong B and both Route A and Route B still require an establishing disclosure. Measure which economically important AI businesses remain omitted for want of disclosure rather than for want of a qualifying role, with particular attention to jurisdictions where disclosure is constrained by law or by commercial sensitivity. No asset, capital-expenditure, or subjective waiver substitute is active, and none is proposed.
- **Robotics and autonomy boundary breadth:** the learned-perception dependence test admits warehouse and logistics automation as a category, because such systems use learned vision to handle physical variability. Test whether that breadth is intended. The stricter alternative — requiring the learned component to be the primary source of the system's economic value — was rejected as not objectively assessable, so tightening the rule requires a different formulation rather than a different threshold.
- **Issuer cap c:** compare capped and uncapped distributions over point-in-time samples. Assess single-company and diversified-group dominance, effective constituent count, activity/country effects, small-issuer capacity, and infeasible cases, including universe events after which `|S| × c < 1` leaves parent weights unavailable until the next scheduled reset. Approve a cap only if its representational benefit is defensible.
- **Investability minima and buffers:** evaluate accessible float capitalization, typical and average traded value, free-float percentage, foreign headroom, trading frequency, and suspension history across markets. Estimate capacity of the selected representative security, including companies whose other share classes contribute to issuer capitalization. Set entry/retention buffers and test turnover at the boundaries.
- **Trailing-twelve-month exposure measure:** evaluate whether a rolling completed-period measure can be constructed for every member solely from filed interim and annual disclosures on a consistent consolidation perimeter, reproducibly and comparably across issuers with different reporting cadences. This is distinct from annualizing a quarter or half-year, extrapolating guidance, or estimating missing periods, none of which is permitted. The completed fiscal year remains the canonical period unless a versioned amendment adopts such a measure.
- **Multi-share-class representativeness:** for every issuer with more than one eligible class contributing to `M_i`, test economic-right equivalence, convertibility, price spreads, return correlation and divergence, liquidity divergence, representative-listing capacity, and the tracking distortion of mapping issuer capitalization to a single-security return, as specified in [Free Float and Capitalization](#docs-free-float-and-capitalization). Choose among the remedies listed there only on that evidence.
- **Market eligibility and investor assumptions:** approve the dated venue/access register, reference institutional investor assumptions, jurisdictional restrictions, and treatment of partially accessible equity. Test emerging-market data coverage explicitly.
- **Operational calendar and data conventions:** finalize cutoff/effective timestamps, notice period, holiday handling, FX fixing, float methodology, stale-price and outage tolerances, calculation precision, and sources with adequate historical rights. Test cross-market timing and event cases before claiming reproducibility.
- **Quarterly workload and newly public coverage:** use historical disclosure and listing dates to test the proposed quarterly full review and three-month record. Quantify admission delay and review effort before considering any fast-entry amendment.

The validation exercise should retain the rejected candidates and missing-data cases, include historical delistings and restructurings, and avoid survivorship and look-ahead bias. It requires real point-in-time company and market data. This draft includes no constituent dataset or empirical validation results.

## Limitations

These are properties of the design, disclosed as part of it. None is a defect to be repaired by weakening an evidence rule.

**This universe does not measure AI economic activity.** It measures the investable public equity of issuers with an evidenced qualifying role. It is not AI revenue, AI value added, AI's contribution to GDP, compute prices, model capability, or the size of the AI economy. Supply-chain revenues overlap across members, so member revenues must never be summed into a market-size estimate.

**Private AI companies are outside the universe entirely.** Some of the most consequential AI companies are not listed. The universe cannot see them, and their absence is structural rather than a coverage gap that better data would close.

**Companies can have economically important AI activity and still not qualify.** Three groups are systematically affected: issuers whose qualifying activity is real but undisclosed at the granularity the tiers require; issuers whose relationship to AI is as a consumer of it or an investor in it rather than a supplier of it, including some of the largest spenders on AI compute; and issuers supplying the tools, materials, facilities, or energy on which AI depends. Each exclusion follows from a stated rule, and each will be argued against. The disclosure of those rules is the answer, not an exception to them.

**Infrastructure exposure is harder to classify than AI-native software.** A Tier 1 determination rests on an enumeration the filing supplies directly. A Tier 2 determination rests on identifying a product family inside a segment the issuer reports for other purposes, and on the issuer's own attribution of that segment's demand. The second is more judgement-bound than the first, within documented rules, and the resulting determinations are correspondingly less uniform.

**Diversified issuer classification requires judgement within the rules.** The tiers are mechanical but not mechanical in the sense of requiring no reading: deciding whether a product family is specialized for accelerated compute, or whether a disclosed offering is generally available and separately contracted, requires a reasoned determination on cited evidence. Every such determination is recorded with its rationale, its evidence, and its reviewer, so that it can be contested on the record.

**AI disclosure practice differs materially across jurisdictions**, and not in the direction commonly assumed. Testing found issuers outside the United States disclosing AI-specific revenue lines that comparable United States issuers do not disclose at all. The framework does not assume a filing convention, and it must not be amended to favour one. But where disclosure is constrained by law, by export control, or by commercial sensitivity, the framework will under-admit, and that under-admission is geographically concentrated rather than randomly distributed.

**Infrastructure exposure may be geographically concentrated.** The activity that satisfies Tier 2 — accelerator design, high-bandwidth memory, advanced fabrication and packaging, AI cluster interconnect — is listed in a small number of markets, and the tool exclusion (**E2**) removes several large issuers that would otherwise have broadened that concentration. Some non-United States infrastructure exposure, including Chinese exposure, may therefore be underrepresented for disclosure reasons. Publish the concentration; do not correct it by relaxing the evidence rules.

**The thematically eligible universe may exceed the launchable universe.** Eligibility is determined without reference to licensing, so the published index may carry fewer members than the universe admits, for the reasons in [Thematic eligibility is independent of launch availability](#docs-thematic-eligibility-is-independent-of-launch-availability). The gap is published as a coverage limitation of the index, not concealed by narrowing the universe.

**No production constituent universe exists.** The research samples recorded under `docs/research/ugai/` are methodology pressure-tests: they were assembled to stress the tier boundaries, they deliberately over-sample difficult cases, and their eligibility determinations were made outside a licensed data environment and partly on retrieved rather than directly read filings. **They must never be used as a constituent list, a starting universe, or a source of weights.** A production universe requires a point-in-time review under the approved methodology, in a licensed data environment, with the evidence record and independent check this document requires.

## Research Precedents

Primary sources retrieved and checked on 12 September 2026, and re-verified against the same editions for 0.1.1-draft, are summarized below; the figures quoted were read from the cited editions, not from marketing material. The cited editions are research precedents, not incorporated Urdais rules or assertions that all provider products share those rules. Providers revise these documents; a later edition does not change what this draft relied on. Adopt/modify/reject refers to this proposal, not production approval.

### Nasdaq CTA Artificial Intelligence and Robotics

The [Nasdaq methodology](https://indexes.nasdaq.com/docs/methodology_NQROBO.pdf), 2024 edition (Security Eligibility Criteria, Constituent Selection, Constituent Weighting, and Index Calendar sections), separates enablers, engagers, and enhancers using CTA's AI Intensity Ratings. It permits one security per issuer, retains an eligible incumbent, and otherwise selects by three-month average daily traded value. It specifies USD 500 million entry / 450 million retention free-float capitalization, USD 3 million three-month average daily traded value, and 20% float. Membership is reconstituted semiannually in March and September and weights are rebalanced quarterly; it is a modified equal-weight index with fixed category allocations of 25% enablers, 60% engagers, and 15% enhancers.

**Modify:** adopt the separation of business roles from security screens and incumbent continuity, but use Urdais's activity evidence and quarterly full reviews. **Reject:** fixed role allocations as a neutral measure of economic size. The numerical screens are comparison points, not Urdais thresholds.

### MSCI ACWI IMI Robotics & AI

The [November 2024 methodology](https://www.msci.com/indexes/documents/methodology/2_MSCI_ACWI_IMI_Robotics__AI_Index_Methodology_20241113.pdf), sections 2–3, selects from the MSCI ACWI IMI parent index the stocks with a Relevance Score of 25% or more (stocks with a missing score are excluded), weights them by the product of Relevance Score and parent-index weight, and caps issuer weight at 5%. It reviews semiannually in May and November. The separate [Thematic Relevance Score methodology](https://www.msci.com/indexes/documents/methodology/2_MSCI_Thematic_Relevance_Score_Methodology_20220519.pdf), May 2022, sections 1–3, defines the score as a measure of economic association built from selected business-segment revenue plus discounted SIC-code-linked revenue, with the discount derived from relevant-word frequency in the company description. It states that the score "is not an explicit measurement or estimate of the proportion of revenue that the company derives from business activities exposed to the theme."

**Adopt:** distinct relevance and investability stages and explicit issuer concentration controls. **Reject for this proposal:** importing the 25% score as a revenue cutoff or treating an estimated association score as an auditable AI revenue fraction. **Modify:** retain exposure for admission and disclosure rather than multiplying every base weight by a score.

### S&P Kensho

The [S&P Kensho Indices methodology](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-kensho-indices.pdf), April 2026, Business Activity Focus, pp. 21–22, distinguishes the AI Enablers index from the broader Enablers & Adopters design, whose adopters qualify by disclosing AI investment, offerings, or positioning in their annual regulatory filing. Its AI Enablers scope lists hardware (GPUs, CPUs, ASICs, FPGAs, accelerators), AI software and model developers, infrastructure services and big-data technology, AI development frameworks and platforms, and data curation and management. Eligible companies are identified at each annual reconstitution by an automated scan of annual filings for maintained search terms (p. 11).

**Modify:** organize Urdais around supplied AI capabilities and attributable infrastructure. **Reject:** extending membership to ordinary internal adopters without qualifying commercial exposure. Filing text can locate evidence but does not alone prove company-level materiality. Urdais does not copy the provider's sector eligibility lists.

### FTSE Global Equity Index Series

The [FTSE GEIS Ground Rules](https://www.lseg.com/content/dam/ftse-russell/en_us/documents/ground-rules/ftse-global-equity-index-series-ground-rules.pdf), v14.3, August 2026, sections 4–8, provide country/venue rules, free-float and foreign-ownership adjustments with a minimum foreign headroom requirement, semiannual liquidity testing on the monthly median of daily trading volume, and explicit review and IPO-entry rules. Its fast-entry process admits IPOs above a published fast entry level set at the semiannual reviews, rather than by discretionary prominence.

**Adopt conceptually:** distinguish business domicile from eligible representation; adjust for investability; retain dated rules for events and reviews. **Modify:** one representative security, Urdais-specific liquidity tests and an independently approved access register. **Reject for initial launch:** fast entry without a validated Urdais history, evidence, and capacity policy. The research supports specifying these rules, not borrowing another universe's size thresholds unchanged.

### Solactive Global Artificial Intelligence Technologies

The [Solactive guideline](https://www.solactive.com/downloads/Guideline-Solactive-SOLAITC.pdf), v1.0, 8 October 2024, sections 2–3, uses thematic screening with its ARTIS natural-language-processing algorithm followed by a review that removes companies without business operations consistent with the theme, restricts the universe to listings in three eligible regions (section 2.1): the United States; Japan; and a named group of European countries plus Canada (Austria, Belgium, Canada, Denmark, Finland, France, Germany, Ireland, Italy, Netherlands, Norway, Portugal, Spain, Sweden, Switzerland, and the United Kingdom), and weights components by free-float capitalization divided by realized volatility, subject to a 9.5% single-component cap and a 40% aggregate limit on components above 4.5%.

**Adopt conceptually:** thematic discovery must be followed by business validation and investability checks. **Reject:** its restricted geography and low-volatility objective for the shared Urdais parent. A volatility tilt would answer a different measurement question. Its concentration controls illustrate a design choice, not an empirically justified Urdais cap.

### STOXX Global Artificial Intelligence

The provider's [official index methodology summary](https://stoxx.com/index/stxail/?factsheet=true), Key facts and Methodology sections, describes selecting, from the STOXX World AC All Cap parent, companies with revenue exposure above 50% to AI-related RBICS sectors (AI Applications, Big Data, Semiconductor/Chip, and Cloud Computing), a EUR 2 million three-month average daily traded value screen, retention of the top 75% by free-float capitalization, weighting by market capitalization adjusted by revenue exposure, and capping constraints applied when weights are set: no single component above 8% and no more than 35% in aggregate for components above 4.5%. Composition is reviewed annually and the weighting cap factors are recalculated quarterly. As in any cap-factor design, the constraints hold at each recalculation; between recalculations the cap factors are fixed, so observed constituent weights move with market prices and can exceed those levels until the next reset. This source is a provider summary rather than the full rulebook, to which it refers for the calculation formula.

**Adopt:** concentration limits applied at weight resets rather than continuously, consistent with the Urdais rule that caps constrain base-weight snapshots, not downstream weights after market movement. **Modify:** use a majority boundary for an evidenced exposure label, while requiring narrower qualifying-activity attribution. **Reject:** assuming an AI-related industry revenue category proves every product in that category is AI-specific, and weighting by revenue exposure for the shared parent (see [Base Weighting Methodology](#docs-base-weighting-methodology)). The precedent motivates a majority label; it does not resolve the lower threshold needed for a broader global universe.
