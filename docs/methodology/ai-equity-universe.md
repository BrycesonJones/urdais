# Urdais AI Equity Universe

**Status: proposed methodology, version 0.1.1-draft.** Prepared 12 September 2026; amended by post-merge audit on 12 September 2026. No production effective date, constituent list, or production base weights are established by this document.

This proposal follows the principles of the [Urdais methodology framework](/docs/methodology). It is a shared primitive rather than a published output, so the framework's output template applies to the outputs that consume it (UGAI and UAVI), not to this document. Rules expressed as requirements describe the proposed design, subject to approval. Parameters explicitly marked **unresolved** are not defaults or discretionary overrides. Publication of a production universe is blocked until the launch requirements in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required) are resolved in a versioned release.

## Purpose and Scope

The Urdais AI Equity Universe is the shared set of publicly traded companies with evidenced, material commercial exposure to the global AI economy, together with their representative securities and base weights. It is a shared methodology primitive, not a market index or a recommendation to invest.

[UGAI](/docs/methodology/ugai), the Urdais Global AI Index, will use this universe and its base weighting methodology for equity-performance measurement. UAVI, the Urdais AI Volatility Index, will inherit the same constituent base weights, apply its own options-eligibility filter, and renormalize the surviving weights. No options requirement is imposed on the parent universe.

The intended measurement is the investable public equity of companies materially participating in AI supply and commercialization. It is not a measure of AI revenue, economic value added, model capability, private-company valuations, or the productivity gains of every business adopting AI. Supply-chain revenues can overlap across different companies; this is not an additive estimate of the size of the AI economy.

Technology, semiconductor, cloud, robotics, or infrastructure classifications do not confer automatic membership. Internal use of AI and repeated references to an AI strategy do not establish a qualifying business.

## Decision Model

Membership and weights result from three separate decisions:

1. **AI relevance:** qualifying activities and sufficient evidence of company-level material exposure.
2. **Security and investability eligibility:** an eligible, accessible equity claim with adequate float, liquidity, history, and reliable data.
3. **Weighting:** a reproducible allocation across admitted companies.

AI relevance cannot compensate for an ineligible security. Size or liquidity cannot compensate for insufficient AI exposure. Classification identifies the activity; it does not bypass either gate. There is no target constituent count, country quota, or requirement to include a familiar company.

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

## AI Economy Classification

Qualifying AI activity supplies systems that learn from data to perform inference, prediction, generation, perception, or adaptive decision-making, or supplies demonstrably attributable infrastructure for those systems. A conventional rules engine, generic automation, or a product label is insufficient evidence.

The proposed activity taxonomy has five groups. These are Urdais design choices, informed by the value-chain approaches in the [research appendix](#docs-research-precedents), with stricter attribution at the product and segment level.

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

## Material AI Exposure

### Evidence-based revenue test

The proposed primary admission measure is the share of consolidated external revenue attributable to qualifying commercial activity during the latest completed fiscal year available at the review evidence cutoff.

For company i, define:

`r_i = Q_i / R_i`

`R_i` is positive consolidated external revenue. `Q_i` is qualifying external revenue from the same reporting period and consolidation perimeter, with intragroup transactions eliminated and `0 ≤ Q_i ≤ R_i`. Where disclosures support only an interval, retain lower and upper bounds and use the substantiated lower bound `r_i_lower` for admission.

The proposed rule is `r_i_lower ≥ τ`, where `τ` is an **unresolved material-exposure threshold**, constrained to `0 < τ ≤ 50%`. No value is adopted for production in this draft. Select it only after testing disclosure coverage, borderline classifications, diversified-company treatment, and historical stability. A provider's relevance-score cutoff is not a valid substitute for an AI revenue threshold.

**Canonical period and interim evidence.** The canonical quantitative measure for admission and retention is `r_i_lower` for the latest completed fiscal year available at the review evidence cutoff, with numerator and denominator from that same period and consolidation perimeter. The completed fiscal year is used for every company regardless of how often it reports, so that companies are compared over the same period length and seasonality does not enter the comparison. Filed interim reports and reconciled issuer operating disclosures (tier 3 of the [Source Hierarchy](#docs-source-hierarchy)) do not replace that measure, even where a qualifying numerator and a consolidated denominator are both available for the same interim period: a three-, six-, or nine-month ratio for one issuer is not comparable with another issuer's completed-year ratio, and admitting or removing on it would make membership depend on reporting cadence. Interim evidence may: update the record of business composition; corroborate or challenge the existing attribution; identify a material acquisition, disposal, spin-off, restructuring, or change of consolidation perimeter; trigger a classification review or an exceptional eligibility review; and establish that the prior completed-year measure is no longer structurally comparable or valid. Where the prior completed-year period remains structurally valid, retain its `r_i_lower` unchanged until the next completed fiscal year is available, and record the interim evidence separately against the company. Where a material event has made the prior period structurally invalid and no comparable completed-year measure exists for the changed company, the determination becomes **insufficient evidence** under [Missing and pre-commercial exposure](#docs-missing-and-pre-commercial-exposure) and the review/removal policy applies. In neither case construct annualized quarterly or half-year revenue, pro forma exposure, management-estimate or guidance percentages, or analyst estimates. A reproducible trailing-twelve-month measure built only from filed data is a research question recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required); it is not adopted and would require a versioned amendment.

### Attribution rules

- Prefer separately disclosed qualifying product or segment revenue reconciled to financial statements. Record the specific products, reporting period, numerator, denominator, and source locations.
- A whole segment may count only where its entire revenue-generating activity satisfies the taxonomy. Broad labels such as cloud, datacenter, digital, or advanced semiconductor manufacturing are insufficient.
- For mixed segments, count only the substantiated qualifying portion. Unallocated revenue remains unknown; do not classify it as definitively non-AI or assign a guessed percentage.
- Product documentation establishes technical relevance, not revenue magnitude. Evidence of delivered products and customer demand can corroborate attribution; backlog, bookings, annualized run rates, capex plans, and forecast revenue cannot replace realized annual revenue.
- A product-dependence argument must establish both qualifying functionality and the associated revenue boundary. An optional AI feature does not justify attributing the entire bundle. If the allocation cannot be evidenced, the disputed portion does not enter the lower bound.
- Assets, capex, installed capacity, and R&D spending may support the classification narrative but do not independently confer membership. They are not comparable revenue proxies across software, manufacturing, and infrastructure businesses.

This intentionally favors demonstrable exposure over broad thematic association. It can underrepresent companies with substantial but undisclosed AI activity, including diversified companies. That limitation must be measured and disclosed; it must not be repaired through undocumented analyst exceptions. A possible absolute-revenue admission route is a research question, not an active alternative rule.

### Missing and pre-commercial exposure

Companies with insufficient attribution evidence, missing consolidated revenue, or no positive revenue remain research candidates. A prospective pure play is not admitted on management's stated ambition alone. If disclosure cannot establish the threshold, the decision is **insufficient evidence**, not a conclusion that the company has no AI exposure.

A material acquisition or disposal after the reported period triggers reassessment. Do not combine incompatible pre- and post-transaction revenue perimeters. Where compatible published evidence is unavailable, record the uncertainty and apply the review/removal policy rather than manufacture a pro forma estimate.

## Exposure Tiers

Use two evidence-based labels for admitted companies:

- **Majority exposure verified:** `r_i_lower > 50%`.
- **Material exposure verified:** `τ ≤ r_i_lower ≤ 50%`; a majority has not been established by the evidence used for admission. This does not assert that the true AI share is below 50%.

The 50% boundary means a demonstrated majority, not near-total purity. It is a proposed descriptive boundary with a relevant STOXX precedent; it does not establish the unresolved minimum for material membership. The labels are mutually exclusive and do not alter weights.

Record evidence coverage separately. “Enabler” describes a role in the supply chain, not a weaker exposure tier. A chip supplier or cooling specialist can have either degree of exposure. No subjective tier multiplier, separate tier quota, or “AI leader” exception is proposed.

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

## Geographic Scope and Market Access

Developed and emerging markets are both in scope. Country domicile alone neither admits nor excludes a company. Assess the selected listing and its access route for reliable regulation, settlement, custody, pricing, reference data, and ability to acquire and dispose of the equity through a documented institutional access route.

Before launch, publish a versioned country/exchange/segment eligibility register identifying each venue by MIC, access route, decision, rationale, evidence date, and effective interval. The initial register is **unresolved**. Unsupported venues are not implicitly eligible. Market classifications may inform the register but cannot replace the underlying checks or change historical eligibility automatically when a provider updates its classifications.

Foreign listings and depositary receipts may represent companies domiciled elsewhere if the claim and access route are sound. Record incorporation, main operating geography, trading venue, and access restrictions separately. Do not treat an ADR as U.S. business exposure.

Applicable investment restrictions, sanctions, binding foreign ownership limits, capital controls, or inability to settle can make a company or route ineligible. The launch register must specify the reference investor/access assumptions and applicable jurisdictional restrictions; there is no universal claim of accessibility for every investor. Use authoritative regulatory evidence for restrictions. An alternative listing cannot circumvent an issuer-level prohibition.

Where reliable prices, ownership data, identifiers, or corporate-action records are unavailable, classify the exclusion as a coverage or access limitation. Publish the resulting geographic gaps. “Global” describes the target scope, not a claim of exhaustive representation.

## Investability and Liquidity

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

Review all members against the same substantive AI and security rules. Remove at the next scheduled review when the evidenced lower bound falls below the threshold, `r_i_lower < τ`; when evidence no longer supports admission, including an **insufficient evidence** determination for a member whose prior measure is no longer structurally valid; or when an investability screen fails. The removal condition is stated on `r_i_lower`, the substantiated lower bound established by the review evidence, not on the company's true AI revenue share, which is unobservable. A fall in `r_i_lower` may reflect a changed business, changed disclosure, or a stricter attribution, and the recorded rationale must say which. If a separate exposure-retention threshold is later approved, that threshold replaces `τ` in this condition for existing members while admission continues to use `τ`.

Entry/retention buffers for investability are unresolved. Whether a distinct exposure-retention threshold is needed is an open empirical question rather than a settled design: a member whose `r_i_lower` fluctuates around `τ` through ordinary reporting noise, seasonality, or disclosure revisions could enter and exit repeatedly. A candidate structure to test is `τ_retention < τ_entry`, but no buffer, numerical value, or hysteresis rule is adopted here; the item is recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required). No subjective exception is proposed.

Permanent loss of the equity claim, a binding access prohibition, or no surviving eligible listing triggers exceptional removal at the applicable event time. Evidence of a completed disposal ending all qualifying activity also triggers an exceptional review rather than waiting for the next annual report.

A short trading halt or provider outage is not a permanent business exit. Record the condition, distinguish market closure from missing data, and apply the approved tolerance and escalation policy. Those tolerances are unresolved: do not silently carry stale observations into a new valid snapshot. Pending resolution, identify the current calculation as unavailable or delayed and preserve the last valid version with its original date. Recovery does not retrospectively erase the incident.

## Classification Review

Review activity tags, exposure tiers, and evidence at every quarterly reconstitution and upon material disclosures. A general cloud company may qualify after attributable AI commercial activity becomes material; it does not qualify merely after changing its description. A former specialist absorbed into a conglomerate must be assessed within the surviving company's consolidation perimeter.

Differentiate changed facts, newly available evidence about earlier facts, and a change in the taxonomy itself. Give each an announcement time and effective time. Apply newly available evidence prospectively unless a separately labeled correction is warranted. Store the old rationale and classification; do not rewrite past membership using today's interpretation.

## Downstream Weight Renormalization

For each valid parent weight snapshot, `Σ_i w_i = 1` and `w_i ≥ 0`.

For a downstream eligible subset E, let `S_E = Σ over j in E [w_j]`. If `S_E > 0`:

`v_i = w_i / S_E` for i in E; `v_i = 0` otherwise.

Then `Σ_i v_i = 1`. Filtering preserves the relative base weights of surviving members. If the subset is empty or has zero total base weight, the normalized allocation is undefined; do not substitute equal weights or reuse a different universe version without disclosure.

UAVI begins with the canonical universe base weights, applies its own options-eligibility filter, and renormalizes the surviving constituents. It does not independently select an AI equity universe or replace the inherited weights. Options rules and calculations are left entirely to the UAVI methodology. The canonical base weights available for a given date are those of the scheduled weight snapshot effective on that date or of a valid event weight snapshot effective at that date (see [Corporate Actions and Exceptional Events](#docs-corporate-actions-and-exceptional-events)); which of these a downstream output consumes for a particular calculation date is specified by that output's methodology, not here. A valid membership state can exist for a date on which no current weight snapshot exists; on such a date the renormalization above has no valid input. Do not reuse a superseded weight snapshot as though it were current, and do not fabricate weights; the downstream output applies its own delayed or unavailable rules. The parent guarantees that every published weight snapshot, scheduled or event, satisfies the sum-to-one and issuer-cap conditions.

Renormalization can produce weights above the parent issuer cap. Do not automatically recap a downstream subset: doing so would change the specified relative-weight inheritance. Any downstream departure would require its own explicit methodology decision. Record the parent version, excluded membership, exclusion reasons, surviving base-weight mass, and resulting weights.

## Historical Membership and Lineage

Membership must be reproducible for a historical effective time and for what was known as of a historical publication time. Preserve both dimensions. A backfilled filing or corrected vendor record must not masquerade as information available before its release.

Each universe version must be able to answer which companies belonged, why each qualified, which representative security and classification applied, what base weight it carried or that weights were unavailable and why, and which methodology/parameter version governed it. Maintain additions, removals, unchanged decisions, exclusions, and replacements with effective intervals and reasons. Rejected and insufficient-evidence candidates must also be retained to make selection auditable.

Conceptual lineage is:

Universe Version → Universe Events → Membership State → Weight Snapshot (where valid) → Company Membership → AI Classification → Eligibility Evidence → Security / Market Data → Original Sources

In practice this is a linked evidence structure: exposure evidence supports relevance; listing and market data support investability and weighting. Preserve both branches. Retain source publication/access timestamps, reporting periods, immutable source references or permissible archived copies with hashes, original-language evidence, translation provenance, input vintages, reviewed attribution, overrides/corrections, and decision authorship. Reproducibility depends on lawful historical source retention; an unavailable license or overwritten source is a documented limitation, not an assumption of completeness.

This methodology specifies those requirements; it does not define a database schema, classifier, or data pipeline.

## Source Hierarchy

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

Version history: **0.1.0-draft, 12 September 2026** — initial research-backed proposal; no production effective date. **0.1.1-draft, 12 September 2026** — post-merge audit against the cited primary sources: Solactive eligible-region description corrected to include Canada; exceptional event-snapshot weights formalized as a capped proportional re-allocation of surviving pre-event base weights, with the UGAI non-rebalance relationship stated; annual admission measure reconciled with interim evidence; exposure-retention buffering moved to empirical validation; multi-share-class return-representativeness validation added; removal condition stated on `r_i_lower`; STOXX cap timing clarified; universe events separated from event weight snapshots so that an infeasible capped allocation leaves parent weights, not the membership state, unavailable; completed fiscal year retained as the canonical exposure period, with interim evidence limited to review, corroboration, and invalidation. No production effective date. Approval of this document and closure of launch requirements must precede a production version.

## Open Questions / Empirical Validation Required

No production memberships or base weights may be released under this draft. The following decisions must be recorded in an approved parameter/methodology release, with evidence rather than unexplained defaults:

- **Material revenue threshold τ:** build a reviewed sample across the five activity groups, regions, and company sizes using actual filings. Test lower-bound coverage, borderline decisions, and how diversified issuers compare with specialists. Do not choose thresholds to obtain a predetermined constituent list or attractive returns.
- **Disclosure bias and an absolute-exposure alternative:** measure omission of economically important AI businesses with low revenue shares or poor disclosure. Evaluate whether an absolute qualifying-revenue route can be audited without admitting incidental participation. No such route, asset/capex substitute, or subjective waiver is active now.
- **Issuer cap c:** compare capped and uncapped distributions over point-in-time samples. Assess single-company and diversified-group dominance, effective constituent count, activity/country effects, small-issuer capacity, and infeasible cases, including universe events after which `|S| × c < 1` leaves parent weights unavailable until the next scheduled reset. Approve a cap only if its representational benefit is defensible.
- **Investability minima and buffers:** evaluate accessible float capitalization, typical and average traded value, free-float percentage, foreign headroom, trading frequency, and suspension history across markets. Estimate capacity of the selected representative security, including companies whose other share classes contribute to issuer capitalization. Set entry/retention buffers and test turnover at the boundaries.
- **Exposure-retention buffer:** using point-in-time filings, measure membership churn for companies whose `r_i_lower` lies near candidate values of `τ`, separating ordinary reporting noise, seasonality, and disclosure revisions from real business change. Test whether a retention threshold below the entry threshold (`τ_retention < τ_entry`) materially improves stability, and what share of companies retained under such a rule would no longer have material evidenced exposure. Adopt a buffer only if it improves stability without retaining immaterial exposure; otherwise keep the single-threshold rule. Nasdaq's differing entry and retention capitalization levels illustrate buffering for an investability screen, not a precedent for an AI-revenue buffer.
- **Trailing-twelve-month exposure measure:** evaluate whether a rolling completed-period measure can be constructed for every member solely from filed interim and annual disclosures on a consistent consolidation perimeter, reproducibly and comparably across issuers with different reporting cadences. This is distinct from annualizing a quarter or half-year, extrapolating guidance, or estimating missing periods, none of which is permitted. The completed fiscal year remains the canonical period unless a versioned amendment adopts such a measure.
- **Multi-share-class representativeness:** for every issuer with more than one eligible class contributing to `M_i`, test economic-right equivalence, convertibility, price spreads, return correlation and divergence, liquidity divergence, representative-listing capacity, and the tracking distortion of mapping issuer capitalization to a single-security return, as specified in [Free Float and Capitalization](#docs-free-float-and-capitalization). Choose among the remedies listed there only on that evidence.
- **Market eligibility and investor assumptions:** approve the dated venue/access register, reference institutional investor assumptions, jurisdictional restrictions, and treatment of partially accessible equity. Test emerging-market data coverage explicitly.
- **Operational calendar and data conventions:** finalize cutoff/effective timestamps, notice period, holiday handling, FX fixing, float methodology, stale-price and outage tolerances, calculation precision, and sources with adequate historical rights. Test cross-market timing and event cases before claiming reproducibility.
- **Quarterly workload and newly public coverage:** use historical disclosure and listing dates to test the proposed quarterly full review and three-month record. Quantify admission delay and review effort before considering any fast-entry amendment.

The validation exercise should retain the rejected candidates and missing-data cases, include historical delistings and restructurings, and avoid survivorship and look-ahead bias. It requires real point-in-time company and market data. This draft includes no constituent dataset or empirical validation results.

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
