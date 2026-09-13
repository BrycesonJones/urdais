# UCPI Market-Breadth Amendment

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. Records the evaluation behind UCPI 0.1.1-draft and UCPI-H100-SXM 0.1.2-draft, which resolve the participant-count publication rule above the family's structural floor. It changes no source classification, approves no provider, and collects nothing.

## Question

Can a regional price derived from exactly two independent eligible capacity sources be published, usefully and defensibly, if the methodology labels it and publishes the thin-market diagnostics alongside it?

**Answer: yes, with four modifications to the rule as proposed.** The proposed label cannot be `Limited`, because that word is already the family's availability state; the qualifier is named **Minimum** breadth. The Normal-breadth boundary at three participants is adopted because it is structural, not because three is adequate. The participant count ceases to be a numerical suppression gate above the floor, which is a deliberate change to the parent recorded in its version history. And dispersion diagnostics are withheld at two participants because they would disclose the two prices individually.

## 1. The methodology before the amendment

Established from the merged parent (0.1.0-draft) and child (0.1.1-draft), not from the buildability reassessment.

| Rule | Where | Effect on N=2 |
|---|---|---|
| Participant unit is the capacity source: operator where determinable, seller otherwise | Parent, Capacity-Source Identity | Two vertically integrated clouds are two participants |
| Regional value is the median, equal participant weighting, even-`N` convention is the mean of the two central observations | Parent, Regional Aggregation | At N=2 the value is the midpoint |
| "A region with no eligible participant observation has no value, and a region with exactly one has no market price. Both produce Unavailable." Structural, applies now | Parent, Publication Gates | N=2 clears the floor |
| "A minimum final aggregation-participant count" listed among the numerical gates, value unresolved | Parent, Publication Gates; child, Open and numerical | N=2 was neither published nor refused; the gate was simply unset |
| Diagnostics "exist so a user can tell the difference between a price supported by fifteen participants and one supported by two" | Parent, Coverage and Composition | The parent already contemplated a two-participant value being published with diagnostics |
| The child twice calls the floor "the family's two-participant structural floor" | Child, Geographic Taxonomy and Seller-Level Reduction | The child already read two as the first market count |
| Equal-weight concentration measures are not published: with `N` equal weights they restate `N` | Parent, Coverage and Composition | No concentration diagnostic is added at N=2 either |
| Publication statuses: Published, Delayed, Unavailable, Corrected, Superseded, "with the same meanings used across Urdais outputs" | Parent, Status Model; defined in UGAI | No qualified-publication status exists Urdais-wide |
| `Limited` is an availability state: "where it can be obtained subject to a stated constraint"; the child admits it to the headline and publishes the Available-versus-Limited split | Parent, Availability and Executability; child, Availability Evidence | Using `Limited` for breadth would collide with a diagnostic published beside it |
| Percentile reporting at small counts left to the child, "no minimum count is invented here" | Parent, Percentile population | Unaddressed at N=2 |

So the question was open in exactly one place: the count above one. Everything else needed was already present.

## 2. What `Limited` means, and why it is not reused

`Limited` currently means limited **availability** of one input: the seller asserts capacity exists under a stated constraint, mapped from an ordinal capacity level at the child's minimum topology. It is one of six availability states and it is admitted to the headline. The child publishes, with every value, the share of eligible observations resting on `Limited` rather than `Available`.

Reusing the word for breadth would put "breadth: Limited" beside "Limited share: 50%" on the same surface, describing two unrelated things. The task's own instruction was not to overload silently, and the collision is not silent, so the qualifier is named differently. Of the three options considered:

1. **Extend the definition of `Limited`.** Rejected. Availability is a property of an input; breadth is a property of a value. One word cannot carry both without the reader having to know which object it attaches to.
2. **A separate breadth qualifier accompanying the status.** Adopted. The status stays `Published`, which is true, and a mandatory qualifier with two values, **Minimum** and **Normal**, says how many parties formed the price. The parent now states explicitly that `Limited` is reserved for availability.
3. **A new headline status.** Rejected. The five statuses are shared across Urdais outputs. A sixth for one family would fragment a vocabulary that UGAI and UAVI also use, and a two-participant value is in fact published, not delayed and not unavailable.

The diagnostic code that carries the qualifier machine-readably is `MARKET_BREADTH_MINIMUM`, following the child's existing `NOUN_PROPERTY` pattern (`AVAILABILITY_GRADE_3`, `PRICE_CARRIED`). The user-facing sentence it supports is: *minimum market breadth, this value is calculated from two independent eligible capacity sources, the smallest number that constitutes a market under this methodology.*

## 3. What the N=2 statistic is

With participants at $2.00 and $3.00 per accelerator-hour, the regional value is $2.50 under the even-`N` convention. It legitimately means: **the midpoint of the two independent eligible capacity-source prices observed in this country**. It must not be described as a clearing price, an exhaustive market price, or the typical price of a market of unknown size.

Properties, stated against N=1, N=3 and larger counts:

| | N=1 | N=2 | N=3 | Large N |
|---|---|---|---|---|
| Is it a market price? | No, it is one party's price | Yes, the smallest possible | Yes | Yes |
| What is the median? | The participant | The mean of both | The middle participant | A genuine order statistic |
| Does the parent's median rationale (an extreme cannot move it) hold? | n/a | **No**, there is no middle distinct from the extremes | Yes, first count at which it does | Yes |
| Pivotal participants | The only one | **Both**: a change of Δ in either price moves the value by Δ/2, and removing either produces Unavailable | The middle one moves it one for one, but only inside the bracket of the other two; an extreme cannot move it past the middle | None individually |
| Can one participant dominate? | Trivially | Neither dominates; each has exactly half the influence | The middle participant, within a bound | No |
| Manipulation resistance | None | **None beyond transparency**; a participant knows it moves the value by half its own move | Bounded | Increasing |
| Representativeness | None | Two of an unknown economic universe | Three of an unknown universe | Improves with the observability-gap diagnostic |
| Do dispersion diagnostics carry information? | n/a | **They are the two prices**: every type-7 quantile is a point on the segment between them | Weakly | Yes |
| Preferable to no value? | No | **Yes, if labelled**: a buyer learns that two independent sources offer the product in that country, and at what level | Yes | Yes |

The decisive rows are the third and fourth. The parent chose a median over a mean because "a mean would let one such value move the published price substantially". At N=2 the median *is* the mean. That is not a reason to refuse the value, since two independent price setters form a price where one does not, but it is a reason the value must say what it is. Three is the smallest count at which the median has a middle, which is why Normal breadth begins there. Neither boundary is drawn from coverage data; both come from the arithmetic.

**Sensitivity in the example.** Participant B moves from $3.00 to $3.50: the value moves from $2.50 to $2.75, a 10% move in the published level from a 16.7% move in one participant's price. At N=3 with a third participant at $2.60, B's move leaves the value at $2.60 unchanged.

## 4. Independence

The two participants at Minimum breadth must be **independent capacity sources** under the existing collapse rule. No new entity system is introduced; the parent's Seller entity already carries "legal identity", and the amendment states the consequence: two trading names, brands, tiers or catalogues under one legal entity or common control are one seller.

| Case | Count | Why |
|---|---|---|
| Two unrelated vertically integrated clouds | 2 | Distinct sellers by legal identity, operators undetermined, seller fallback |
| Two regions or datacenters of one provider | 1 | Same seller; and in any case different regions are different cells |
| Two brands under common control | 1 | One legal identity |
| Two records of one seller through two interfaces | 1 | Seller-level reduction already yields one observation per seller per cell |
| Reseller and its disclosed underlying operator | 1 | Operator determinable on evidence, so the reseller collapses onto the operator |
| Two sellers of one determinable operator's capacity | 1 | Collapse rule |
| Two sellers who in fact share hardware without disclosing it | **2, wrongly** | The standing limitation of seller fallback; undetectable and never inferred from prices |

The last row is the honest cost. At N=2 it is at its most consequential, because the value presented as a market could be one operator's price twice. The existing undetermined-operator share is published with every value and will read 100% at launch, so the limitation is visible rather than hidden.

## 5. The rule as adopted

| Participants | Status | Breadth | Notes |
|---|---|---|---|
| 0 | Unavailable | — | Condition named `NO_ELIGIBLE_PARTICIPANT` |
| 1 | Unavailable | — | Condition named `SINGLE_PARTICIPANT`; participant-level diagnostic permitted |
| 2 | Published | **Minimum** | `MARKET_BREADTH_MINIMUM`; both participants pivotal; dispersion withheld; all other gates apply |
| ≥ 3 | Published | Normal | All other gates apply |

Against the proposal, four modifications:

1. **Not `Limited`.** For the reason in section 2.
2. **Three is structural, not adequate.** The proposal's "N ≥ 3 → ordinary eligibility" is adopted because three is where the median becomes a median, not because three participants are enough. The parent says so and publishes the count so a user may apply their own threshold.
3. **The participant count stops being a numerical gate above the floor.** The proposal implied this; the amendment states it. The parent's gate list previously included "a minimum final aggregation-participant count" with an unresolved value. Keeping that gate alongside the breadth rule would be incoherent: a child that later set the gate at five would suppress N=3 and N=4 while publishing N=2 at Minimum breadth. The count therefore governs the qualifier, and the other gates (undetermined-operator share, carried share, evidence-grade share, source quality, comparability share) remain numerical and unresolved. This is a change to the parent's rules and is recorded in its version history with rationale.
4. **Dispersion is withheld at N=2.** Not in the proposal. With two observations, percentiles and the interquartile range are the two participant prices under another description. The level, the count and the qualifier are published; the quantiles are computed and retained for lineage.

The proposal's higher thresholds from the buildability reassessment, at least three capacity sources per region and at least two data sources, are **not adopted**, for the reasons in sections 3 and 9.

## 6. Mandatory disclosures at Minimum breadth

Everything the family already publishes with every value continues to apply. The items marked new are added by the amendment.

| Disclosure | Status |
|---|---|
| Final aggregation-participant count | Existing |
| Independent capacity-source count | Existing, it is the same number after collapse |
| Market-breadth qualifier: Minimum | **New** |
| `MARKET_BREADTH_MINIMUM` diagnostic | **New** |
| Statement that every participant is pivotal | **New** |
| Contributing-source count and largest-source participant share | **New**, see section 9 |
| Availability evidence-grade composition and Available-versus-Limited split | Existing |
| Fresh and carried shares, price carry age | Existing |
| Undetermined-operator share | Existing, 100% at launch |
| Observability-gap count | Existing, child |
| Canonical country, as-of date, status, family and child versions, parameter set | Existing |
| Composition change since the previous observation, now stating breadth before and after | Existing, extended |
| Percentiles and interquartile range | **Withheld** at Minimum breadth, and the withholding is disclosed |
| Concentration measure | **Not added**; the parent's reasoning that equal-weight concentration restates `N` holds exactly at N=2, where it would read 50/50 by construction |

## 7. Everything else still applies

Minimum breadth is a disclosure of how many parties formed the price and exempts nothing. A two-participant value must still satisfy: H100 SXM identity at Grade A, B or C; per-accelerator allocation class with minimum topology from a source field; Explicit or Documented tenancy; on-demand, non-preemptible, non-promotional; permitted collection and permitted index use for every contributing source; availability at Grade 3 or stronger, re-observed this cycle, at minimum topology where the answer is quantity-conditional; price within `price_max_age`; a definable population, with `ENUMERATION_INCOMPLETE` disclosed where not; a stable participant identity; canonical country mapping under a current versioned mapping; the seller-reduction rule; the bundle envelope once its level exists; tax basis not established as inclusive; retained raw offers and reduction sets; and the three remaining numerical gates once set. The launch blockers that remain are unchanged by this amendment except for the removal of the participant-count gate from the numerical set.

## 8. The two-provider scenario, hypothetically

Assume, contrary to the current registry, that both of the two specialist clouds with pending requests later hold explicit permission on both axes. Neither is approved by this analysis, no data is collected, and no classification is changed.

**Could they produce a Minimum-breadth UCPI-H100-SXM value?** Yes, in each country where both have eligible, fresh, comparable H100 SXM capacity on the same calculation date, and only there. Under the pre-amendment rules the same two providers could not have produced a value at all, because the count gate above one was unset. The amendment removes exactly that one obstacle. Every other condition below stands, and each is drawn from recorded evidence rather than assumed.

| Condition | Evidence on record | State |
|---|---|---|
| Both independent capacity sources | Distinct sellers by legal identity per their own terms documents; no evidence of common control or of either reselling the other; operators undetermined for both, so seller fallback applies | Satisfied on the evidence, with the standing limitation that a third-party host on one provider's community tier could in principle be the other provider without Urdais being able to tell |
| Grade 3 availability at minimum topology | One exposes `regions_with_capacity_available`, a required array that can be empty; the other exposes NONE/LOW/MEDIUM/HIGH per datacenter with a `count` parameter defaulting to 1 | Both Grade 3 by the child's mapping; neither yet observed live, both key-gated |
| Minimum topology from a source field | `specs.gpus` on instance types; `minPodGpuCount` | Field exists at both; whether a one-accelerator H100 SXM instance type is currently offered at the first provider is unverified, the live endpoint returned 401 |
| Canonical country mapping | Region code plus description, for example `us-west-1` and "California, USA", mapped at high confidence; datacenter identifiers documented as types but values not retrieved | Resolved for one, **unresolved** for the other until its datacenter values are obtained |
| Regional overlap | Not measured. Both are known from public materials to operate in the United States; no other overlap is established | **Must be observed, not assumed.** A value exists only where both are eligible in the same country on the same day |
| Tenancy Explicit or Documented | Not established for either in the research to date | **Open**; requires a seller statement or product documentation for the specific product |
| Service tier classification | One provider sells two tiers, one of them through third-party hosts; both tiers are the same seller and reduce to one observation | Tier eligibility depends on the tenancy evidence above |
| Tax basis | One states prices exclusive of sales tax, VAT and GST; the other unestablished | One resolved, one `TAX_BASIS_UNRESOLVED` and eligible |
| Freshness ages, price carry limit, bundle envelope level, seller-reduction rule | Unresolved launch blockers | **Open**, unchanged |
| Individual price display under licence | Both outreach messages asked whether individual prices may be displayed. At N=2 the level plus public knowledge of one price determines the other, and any dispersion figure would be the two prices | **A term to settle in each agreement**; the amendment withholds dispersion regardless |
| Permission on both axes | Pending for both | **Hypothetical here; not granted** |

**What this means.** A two-cloud launch is methodologically possible under the amended rules and operationally still some distance away. It would produce a small number of country series, each labelled Minimum breadth, each with an undetermined-operator share of 100% and a contributing-source count of two. That is an honest first number, not a broad one, and the label says so.

## 9. Breadth is counted in capacity sources, not interfaces

The buildability reassessment recommended, provisionally, at least two independent data sources. The amendment does not adopt it as a gate, and records why.

Twenty independent hosts observed through one lawful and reproducible venue are twenty price setters. Two vertically integrated clouds observed through two interfaces are two. Counting interfaces would call the second broader than the first, which is backwards. Economic independence lives in the capacity source; the interface is how Urdais looks.

Single-venue dependence is nonetheless a real operational and behavioural risk: outage, sampling, ordering, ranking incentives and terms all arrive through the venue. The amendment therefore **discloses** it, as the **contributing-source count** and the **largest-source participant share** on every value, and does not **gate** on it. A child may adopt an interface-count gate only with a documented argument that interface concentration, rather than participant concentration, is what would make its value unrepresentative. That keeps economic breadth and technical concentration in separate columns, which is what a user needs to weigh them.

## 10. Upgrade and downgrade

Deterministic, per calculation date, no hysteresis. From three to two: Minimum breadth that day, annotated as a participant exit with breadth before and after. From two to one: Unavailable with `SINGLE_PARTICIPANT`. From one to two: Minimum breadth, percentage change withheld because the predecessor was Unavailable. From two to three: Normal breadth, annotated as an entry. No version change is needed for any of these; the child's version records this amendment itself. A waiting period was considered and rejected because it would misdescribe the market on the date it applied, in one direction or the other.

## 11. Manipulation and pivotal participants

Stated plainly: at N=2 both participants are pivotal and the value has no manipulation resistance beyond transparency. Existing protections are real but modest. Eligibility requires the price to be a current accessible offer at Grade 3 availability, so a participant moving the index must actually change the price at which it sells and bear the commercial consequence. Equal weighting caps either participant's influence at exactly half. Freshness rules prevent a withdrawn price from lingering. Validation rules, not the median, are the family's primary defence against bad data at every `N`. What the amendment adds is disclosure: the count, the qualifier, the pivotal statement, and the composition record. At two participants that is the correct level of claim, and the methodology does not pretend to more.

## 12. Implementation

Files changed by this amendment:

- `docs/methodology/ucpi.md`, 0.1.0-draft to 0.1.1-draft: Seller identity clarified as legal identity; Regional Aggregation states the N=2 consequence; Coverage and Composition gains Market breadth and Source concentration; Percentile population and Missing Data updated; Publication Gates rewritten around the structural participant rule with independence and transition rules; Published Values, Status Model, Conceptual Data Requirements, Open Questions and Methodology Versioning updated.
- `docs/methodology/ucpi-h100-sxm.md`, 0.1.1-draft to 0.1.2-draft: adopts the rule in the child's terms; three numerical gates remain; `MARKET_BREADTH_MINIMUM`, `NO_ELIGIBLE_PARTICIPANT` and `SINGLE_PARTICIPANT` added to the vocabulary; Published Surface, Composition Changes, Decision Matrix, Launch Blockers, Findings for the Parent and Version History updated.
- `src/lib/ucpi/market-breadth.ts` and its test: a reference implementation of the participant-count rule, the even-`N` median and the capacity-source collapse, so that N=0, 1, 2 and 3+, every transition, and the independence cases are executable assertions. It is not a calculation engine.
- `src/lib/docs/catalog.test.ts`: version assertions updated; a guard that routed methodology pages contain no markdown tables.
- `supabase/migrations/20260913110000_market_breadth_versions.sql`: records the two new draft versions in `reference.methodology_versions` and `reference.instrument_spec_versions` with content hashes, and asserts that no provider classification moved and no source became production-approved. No publication-layer table is created; the breadth qualifier is a Phase 6 column.
- `supabase/tests/010_methodology_lineage.sql`: asserts the new version rows alongside the old.
- `supabase/tests/080_reprocessing.sql` and `supabase/tests/100_lineage_consistency.sql`: their hypothetical future H100 spec version was literally named `0.1.2-draft`, which is now real; the fixture is renamed `9.9.0-draft` so it can never collide with a seeded version. No assertion depended on the string.
- `docs/architecture/methodology/ucpi-h100-buildability.md`: a note that its provisional source-count recommendation is superseded by this decision.

Not done, by instruction and by design: no collector, no production observation, no outreach, no change to any provider's permission state, no provider approved, no publication-layer schema.
