# Urdais AI Volatility Index (UAVI)

**Status: proposed methodology, version 0.1.0-draft.** Prepared 12 September 2026. No production value, constituent set, options reference mapping, parameter set, or history is established by this document. Nothing here describes live infrastructure.

This proposal follows the principles of the [Urdais methodology framework](/docs/methodology) and consumes the [Urdais AI Equity Universe](/docs/methodology/ai-equity-universe), the shared parent primitive, as a sibling of [UGAI](/docs/methodology/ugai). Rules expressed as requirements describe the proposed design, subject to approval. Parameters marked **unresolved** are launch requirements, not defaults. UAVI production publication is blocked until the parent universe has a production version, options data licensing is secured, and the items in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required) are closed in a versioned release.

## Purpose and Scope

UAVI measures the 30-calendar-day option-implied expected volatility of the publicly traded companies materially exposed to the global AI economy, using listed option prices on the option-eligible members of the Urdais AI Equity Universe.

Formally, UAVI is the **weighted root mean square of 30-calendar-day VIX-style implied volatility across option-eligible AI Equity Universe constituents**, expressed in annualized percentage points. It is computed from the constituent's own listed option quotes, its inherited parent base weight, and a currency-matched risk-free rate. It is not an index level, carries no base value or divisor, and is not rebased.

UAVI defines what happens after a valid parent snapshot exists: how a parent company maps to an option-underlying security representing the same economic claim in the same canonical currency, which option contracts and expirations are admitted, how each constituent's implied variance is computed and interpolated to a constant 30-day horizon, how constituents that fail those requirements are excluded, how the surviving parent weights are renormalized, and how the result is aggregated, published, versioned, and corrected. It does not decide which companies are AI companies or what their base weights are; those decisions belong to the parent methodology.

## Primary Question

> How much volatility does the market expect in AI?

UAVI's answer is an annualized volatility figure derived from option prices. "Expected" here means expected under the risk-neutral pricing measure that option prices reflect, not a statistical forecast of what volatility will occur: see [Interpretation](#docs-interpretation). "Volatility in AI" means the volatility of the individual admitted companies' equity, aggregated across the universe, not the volatility of a portfolio of them. That distinction is the subject of the next two sections and is part of the published definition, not a footnote.

## What UAVI Measures

For each eligible constituent, UAVI computes a **VIX-style 30-calendar-day implied-variance estimator** from listed out-of-the-money option mid-quotes, measured in the canonical currency of that company's ordinary-equity claim and built from the full strike strip rather than from any single option or any option-pricing model's volatility parameter.

**What that estimator does and does not claim.** Under the conditions that underlie variance replication, European-style exercise, no discrete cash flows over the option's life, and sufficiently complete strike coverage, this construction corresponds to the risk-neutral expected variance of the underlying's returns over the horizon. Applied directly to listed **American-style** single-stock options on underlyings that pay **discrete dividends**, it is an estimator of that economic quantity rather than an exact replication identity. The consequences are set out in [Options Contract Eligibility](#docs-options-contract-eligibility), and the estimator is retained deliberately; the qualification is on the interpretation, not on the construction.

**"Model-free" is used in one limited sense only**, where it appears: the production calculation aggregates listed option prices directly rather than first estimating volatility by inverting a parametric option-pricing model. It is not a claim that the resulting single-stock statistic is exactly a model-free risk-neutral expected variance, which would require assumptions not every contributing contract satisfies.

These constituent variance estimates are then combined using the constituent's inherited parent base weight, renormalized over the eligible set, and converted once to volatility units:

`UAVI_t = 100 × sqrt(Σ_{i∈E_t} v_i,t × σ²_i,30,t)`

The object being measured is therefore the **weighted average expected variance of admitted AI companies**, reported as its square root. A reading of 31.42 means the weighted root mean square annualized 30-day option-implied volatility across eligible constituents is 31.42%.

Variance is aggregated before the square root is taken because variance, not volatility, is the additive object here. The weighted average of constituent variances is the expected variance of a constituent drawn at random with probability `v_i`; the weighted average of constituent volatilities is not the volatility of anything. Averaging volatilities directly would produce a strictly smaller number with no corresponding risk-neutral expectation behind it, since by Jensen's inequality `Σ v_i σ_i ≤ sqrt(Σ v_i σ_i²)` whenever the volatilities differ.

## What UAVI Does Not Measure

**UAVI is not the implied volatility of UGAI.** UGAI is an index, not a tradable instrument, and no liquid listed options market exists on it. No honest option-implied measure of the UGAI portfolio can be constructed without such a market. If UGAI derivatives ever trade with adequate liquidity, a direct UGAI implied-volatility measure would be a separate, differently defined product; it would not be a revision of UAVI.

**UAVI is not portfolio variance and contains no correlation information.** The variance of a portfolio with non-negative weights `v` is

`σ²_P = Σ_i v_i² σ²_i + 2 Σ_{i<j} v_i v_j ρ_ij σ_i σ_j`

which depends on the pairwise correlations `ρ_ij`. UAVI estimates only the marginal implied variance of each constituent. It does not observe, estimate, or imply any `ρ_ij`, and no implied correlation is introduced anywhere in this methodology. Computing a portfolio volatility from UAVI's inputs would require a full correlation matrix that UAVI does not contain.

**UAVI is not a common-currency investor's volatility either.** As set out in [Options Reference Security](#docs-options-reference-security), each constituent variance is measured in the canonical currency of that company's ordinary-equity claim. An investor holding these companies and reporting in one currency experiences, in addition, exchange-rate variance, equity-to-exchange-rate covariance, and cross-currency covariance. None of those quantities appears anywhere in UAVI. Any statement about what such an investor would experience therefore requires inputs UAVI does not have, and UAVI cannot bound it.

A weighted root mean square of marginal volatilities does exceed a weighted average of them, and for a hypothetical portfolio built from the same marginal return processes, with non-negative weights, a valid correlation matrix, and no currency-translation process at all, `sqrt(Σ_i v_i σ²_i) ≥ σ_P` follows from the Cauchy-Schwarz and Jensen inequalities. That is mathematical context about the aggregation form, not a claim about any portfolio a person could hold, and it must not be published as a product claim. UAVI must never be presented as the expected volatility of an AI portfolio, of UGAI, or of "the AI market" as a single asset.

The difference between the weighted average constituent variance and the implied variance of a corresponding traded portfolio is precisely a dispersion measure. That is the economic object behind published dispersion indices. Urdais may define such a product in future; it would require a tradable portfolio's option-implied variance as its second term and is out of scope here.

UAVI is also not a directional measure. It does not indicate whether prices are expected to rise or fall, does not express a probability of a decline, and is not a sentiment or fear score. It does not measure realized volatility, AI industry fundamentals, or the volatility of private AI companies.

## Relationship to the AI Equity Universe

UAVI consumes the following from the parent universe, without modification:

- the **membership state** in force for the calculation date, with each company's identity and representative security;
- the **canonical base weights** `w_i` from the parent weight snapshot effective for that date, whether a scheduled weight snapshot or a valid event weight snapshot;
- the **universe version**, parent methodology version, and their effective and publication timestamps;
- **company identity continuity** across corporate actions and universe events, as the parent determines it.

A parent version is consumed only after it is published as valid. UAVI never selects from a draft, backfilled, or corrected parent snapshot for a date on which that snapshot was not the published version; a parent correction produces a UAVI correction under [Corrections and Restatements](#docs-corrections-and-restatements), not a silent recomputation. Historical UAVI observations remain tied to the parent methodology version and universe version effective at the time, and UAVI carries its own methodology version independently.

Options eligibility is not a parent concern. The parent universe admits companies on evidenced AI exposure and equity investability and selects its representative security without reference to options availability. UAVI applies its own options filter downstream, as the parent methodology specifies. No options requirement is imposed on the parent, and a company's failure to qualify for UAVI has no effect on its parent membership, its parent weight, or its treatment in UGAI.

## Relationship to UGAI

UGAI and UAVI are siblings, not a chain. **UGAI is not an input to UAVI.** UAVI does not consume UGAI's index shares, divisor, as-of (drifted) weights, price-return series, or total-return series, and UGAI's daily price movements must not become an implicit dependency of UAVI through shared data structures. The two outputs share only their parent.

The two also inherit from the parent differently, and the difference is deliberate. UGAI converts parent base weights into fixed index shares at a scheduled reset and then lets its weights drift with prices until the next reset; its published constituent weights are as-of weights. UAVI holds no position and has nothing to drift: it re-reads the current canonical parent base weights at every calculation and renormalizes them over its eligible set. A constituent's UAVI weight on a given date is therefore derived from the parent's base weights for that date, never from UGAI's as-of weights.

The two also respond differently to a parent universe event. UGAI can act on the event alone: it removes the deleted member, adjusts its divisor, and continues. UAVI requires a current parent weight vector, so when a universe event leaves parent weights unavailable, UAVI cannot calculate even though UGAI can. See [Parent Weight Unavailability](#docs-parent-weight-unavailability).

## Measurement Horizon

The canonical UAVI horizon is **30 calendar days**, constant. Each constituent's variance is interpolated to exactly 30 days from its observation time, so the published figure always refers to the same forward window length regardless of which option expirations happened to be listed.

Thirty calendar days is adopted from the volatility-benchmark precedent in the [research appendix](#docs-research-precedents), where it is the standard horizon for both index and constituent volatility measures, which makes UAVI readable alongside them. Annualization uses calendar time, not trading time, consistent with that precedent.

A term structure of UAVI at other horizons is a possible future extension. No other horizon is defined, computed, or implied by this document, and V1 methodology must not be complicated to accommodate one.

## Options Reference Security

The parent selects one representative security per company on equity-investability grounds and explicitly does not consider options availability. The most liquid listed options on a company may therefore trade on a different line. UAVI must resolve this mapping itself, and the resolution must not quietly change what is being measured.

**Measurement convention.** UAVI measures each company's equity volatility in the **canonical equity currency** of its underlying ordinary-equity claim. Every constituent variance entering an aggregation is measured on that basis, so that UAVI is one economically coherent object rather than a mixture of local-currency equity variances and foreign-currency variances that embed exchange-rate risk. Coverage is deliberately sacrificed to that coherence; the cost is measured in validation and published as excluded weight.

**The canonical equity currency is determined first, and independently of options.** It is a property of the company's ordinary-equity claim, fixed before any option market is examined, so that the meaning of a company's measured volatility cannot change because option data became available or unavailable on some venue. The rule is deterministic:

1. The **trading currency of the issuer-designated primary or home ordinary listing** of the economic share class represented by the parent membership, as established by the parent's security and reference-data record.
2. Where the issuer designates none unambiguously, the trading currency of the listing identified as the primary or home market by authoritative exchange or reference data, recorded with the source relied upon.
3. Where neither establishes a unique currency, the mapping is unresolved and the company is excluded for that date with reason `CANONICAL_CURRENCY_UNRESOLVED`.

The determination, the evidence for it, and its effective interval are recorded, and it is re-derived only when the underlying reference data change, not per calculation date.

The canonical equity currency is **never** selected by reference to option liquidity, strike coverage, a preference for any particular national market, receipt availability, data licensing convenience, or which venue happens to produce a valid variance on a given date. Each of those would let data availability silently redefine what a company's volatility means, which is the specific failure this rule exists to prevent. Where a company's ordinary class genuinely trades in more than one currency, the hierarchy above resolves it in favour of the issuer-designated home listing; it does not permit choosing the currency whose options are better.

**Selected proposal.** For each parent member, UAVI determines at most one **Options Reference Security**, by the following order, applied only among lines that represent the same economic claim in the canonical equity currency:

1. **The parent representative security**, where it is denominated in the canonical equity currency and eligible option contracts on it exist and qualify.
2. **An alternate line representing the same economic claim in the canonical equity currency**, where the representative security is not eligible under rule 1, whether because it carries no qualifying options or because it is not denominated in that currency. Admissible only where the alternate is the same share class listed on another venue in the canonical equity currency, or a receipt-to-ordinary pairing of that same class in that same currency with a verified fixed ratio, documented rights equivalence, and no restriction that severs the two prices. Those conditions are necessary but not sufficient: a mapping that relies on a receipt-to-ordinary pairing rather than on the same listed class becomes usable in production only once the approved equivalence criteria establish that the market-price wedge between the two lines is stable enough to treat them as one variance process, as required in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required). Until then the mapping is a candidate and the company is excluded with reason `REFERENCE_EQUIVALENCE_UNRESOLVED`. The mapping, its ratio, its evidence, its equivalence status, and its effective interval are recorded.
3. **Otherwise the company is excluded** from UAVI for that date, with reason `NO_CANONICAL_CURRENCY_OPTION_REFERENCE` where a qualifying option class exists but only outside the canonical equity currency, and `NO_OPTIONABLE_REFERENCE` where no qualifying option class exists at all.

Rule 1 and rule 2 are a single ordered test, not competing rules: the parent's representative security wins whenever it satisfies the currency condition, and the currency condition is a precondition to eligibility rather than a later override. Where the parent's representative is a foreign-currency receipt and a qualifying option class exists on the home ordinary line, rule 2 selects the home ordinary line, because the representative fails rule 1's currency condition. Where no such canonical-currency option class exists, the company is excluded rather than measured on the receipt.

**Dual-listed lines of the same class.** A share class may genuinely be listed on several venues. The order of operations is fixed and must not be reversed: the canonical equity currency is determined first from the ordinary-equity claim; only lines representing that same claim **and denominated in that currency** then compete to be the Options Reference Security; and the selection and tie-break rules below are applied within that eligible set alone. An alternate venue is therefore permitted, and may well be chosen, but only among lines that already share the measurement basis. A line in another currency never enters the comparison, however much better its options market.

**A different share class is never substituted merely because it has better options liquidity.** The parent methodology already records multi-share-class return representativeness as an unresolved empirical question; importing a different class's option prices would compound that unresolved issue with an unmeasured second one. This is a deliberate departure from providers whose constituent universes admit options on any listed class line.

### What a fixed ratio does and does not neutralize

The term-variance calculation is invariant to a **fixed, deterministic multiplicative rescaling** of the underlying. If every strike scales as `K → aK` and every option price as `Q → aQ` for a constant `a`, then each term `ΔK/K² × Q(K)` scales as `(aΔK)/(a²K²) × aQ(K) = ΔK/K² × Q(K)`, and `F/K0` is a ratio, so the computed variance is unchanged. This is why the variance formula requires no ratio adjustment and no scale input of any kind.

The result applies only where the mapping is a deterministic rescaling **of the same underlying economic currency process**: a denomination or unit change, or a fixed receipt-to-ordinary ratio between two lines quoted in the same currency. It does not extend to a stochastic wedge, and two cases must be separated.

- **A varying premium or discount** caused by conversion frictions, settlement timing, fees, access restrictions, capital controls, custody constraints, temporary segmentation, or persistent ownership segregation adds its own variance to the receipt's price process, and does so **even between two lines quoted in the same currency**. The screens in rule 2, a verified fixed ratio, rights equivalence, and functioning unsevered conversion, are **necessary conditions** for treating two lines as candidate representations of the same variance process. They are not by themselves proof that the observed market-price wedge is deterministic: a legal ratio constrains the claim, not the traded spread. Production use of a same-currency alternate line therefore requires the approved equivalence criteria described below to be satisfied on evidence; where they are not, the lines are not treated as the same stochastic process and the mapping is unresolved.
- **A currency difference is not neutralized by a fixed ratio at all.** For a receipt denominated in a different currency, `P_receipt ≈ a × X × P_ordinary`, where `a` is the deterministic ratio and `X` is a stochastic exchange rate. The receipt's return variance is therefore the equity variance **plus** the exchange-rate variance **plus** twice their covariance. The invariance result above says nothing about this case, because `a × X` is not a constant. Options on such a receipt imply the variance of a different economic object, and no ratio adjustment can convert one into the other.

This is why the currency condition sits inside the eligibility test rather than acting as a tie-break. A foreign-currency receipt is **not** a variance-equivalent substitute for the home ordinary line merely because its receipt ratio is fixed and verified, and it is never admitted on that basis. Where the canonical-currency option class does not exist, the company leaves the eligible set and its weight is reported as excluded.

The alternative convention, a consistent common-currency variance for every constituent, is not achievable from listed single-name options: it would require exchange-rate variance and equity-to-exchange-rate covariance inputs that UAVI deliberately does not use. UAVI is consequently **not** a measure of the volatility experienced by an investor holding the universe in a single reporting currency, and must not be described as one.

Where the selection rules leave a genuine tie, prefer the venue with the deeper qualifying strike coverage over the most recent complete comparison window, then the issuer-designated primary listing, then ascending exchange MIC. Record the inputs and the tie-break. Retain an eligible incumbent mapping rather than switching on a marginal difference, so that a constituent's measurement basis does not oscillate between venues.

## Options Contract Eligibility

A contract may contribute to a UAVI calculation only if it is a listed option on the constituent's Options Reference Security, on a venue in the approved options-venue register, with all of the following recorded and internally consistent: the underlying reference security and its identifiers; the venue; the contract identifier; call or put; the strike, in the same currency and units as the underlying quotes; the expiration date and the exact expiration or settlement timestamp from the contract specification; exercise style; settlement style and deliverable; contract multiplier; currency; and whether the contract is standard or has been adjusted for a corporate action.

**The deliverable must be the standard, unadjusted quantity of the reference security.** UAVI does not assume that an option symbol represents any particular number of shares; the multiplier and deliverable come from contract reference data. Contracts with adjusted strikes, non-standard multipliers, or non-standard deliverables, including packages containing cash or a second security after a corporate action, are excluded, and if no unadjusted series remains for a required expiration the constituent is excluded with reason `CONTRACT_ADJUSTMENT_UNRESOLVED`. This is more conservative than providers that continue calculating from adjusted classes until unadjusted series are listed, and the cost of the choice, a temporary exclusion after corporate actions, is disclosed and must be measured in validation.

Before launch, publish a versioned **options-venue register** identifying each admitted venue by MIC, with its standard expiration series, expiration and settlement timestamps, exercise and settlement conventions, quote dissemination and end-of-day snapshot definition, trading calendar, and the evidence and effective interval for its admission. The initial register is **unresolved**. Unregistered venues are not implicitly eligible. This mirrors the parent's market eligibility register and exists for the same reason: a global scope claim must be backed by venue-level evidence rather than assumed.

### Exercise style, discrete dividends, and the limits of the estimator

The variance-replication result behind this estimator is derived for European-style options on an underlying without discrete cash flows over the option's life, with sufficiently complete strike coverage. Listed single-name equity options are predominantly **American-style**, and their underlyings pay **discrete dividends**. Two consequences must be stated rather than glossed:

- **Put-call parity is an inequality for American options**, so the implied forward computed below is an approximation rather than an identity, and its error grows with the early-exercise premium.
- **Early exercise value and discrete dividends move option prices** away from their European counterparts, so every quantity the estimator derives from those prices is affected.

**The direction of the resulting error in the computed variance is not assumed.** It is tempting to reason that American prices are at least their European counterparts, so the variance must be biased upward. That reasoning does not carry, because the estimator is not a monotone function of the option prices alone. The same American quotes also determine the implied forward, and through it `K0`, the split between the put and call wings, and the subtracted correction term `(F/K0 − 1)²`. A forward displaced by an early-exercise premium can shift `K0` to a different listed strike, change which contracts are treated as out of the money, and move the correction term in the opposite direction to the price effect. The premium is also largest for deep in-the-money contracts, which this construction never uses, and small but non-zero across the out-of-the-money wings it does use. The net effect is a composition of offsetting sensitivities whose sign is an empirical question, not an algebraic one.

Accordingly, this methodology states the limitation without a sign: **the direction and magnitude of the estimation error introduced by American exercise features and discrete dividends are unresolved empirical questions**, to be measured per venue and per exercise convention before production, as recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required).

Two routes were evaluated for V1.

**Path A, the raw quote-strip estimator, is selected.** Constituent variance is computed directly from listed quotes under the VIX-style construction above. It is the direct constituent-volatility precedent, it is transparent and reproducible from the quotes alone, and it inverts no option-pricing model and requires no forecast inputs.

**Path B, de-Americanizing first, is not adopted for V1.** Under this route an American-style model would be used to derive European-equivalent prices or volatilities before the variance is constructed. It addresses early exercise and dividends explicitly, and it has institutional precedent: the provider behind the volatility-index construction uses a binomial model with forecast discrete dividends for implied volatility on listed American-style single-name options, reserving the parity-and-forward approach for European-style index options. That same precedent shows the cost. The approach depends on a pricing model, a rate curve, and a **forecast** dividend stream produced by a proprietary analyst-and-algorithm process extending years ahead. Adopting it would replace a quote-reproducible measure with one whose value depends on unobservable forecasts that Urdais would have to source, license, and defend, and would forfeit the direct quote reproducibility that makes the constituent measure auditable. Path B is recorded as the benchmark against which Path A's error is to be measured, not as the production construction.

Pending that work, UAVI records as diagnostics on every contributing strip: the exercise style; whether a known ex-dividend date falls within the strip's life and, where available, the amount; the venue; the moneyness structure of the surviving strikes; and, where a modelled American-style benchmark is available, the discrepancy against it. None of these is an exclusion criterion in this draft, and no exclusion rule may be adopted without evidence that it removes more error than coverage.

## Option Expiration Selection

For each constituent at each calculation, UAVI selects two option strips on the Options Reference Security: a **Near Term** strip and a **Next Term** strip. An **option strip** is the set of contracts on one reference security sharing one expiration.

The selected pair must **strictly bracket the 30-day horizon**: the Near Term expiration has no more than 30 days to expiration and the Next Term expiration has more than 30 days. UAVI therefore always interpolates between two observed terms and never extrapolates variance beyond the observed term structure. A single strip, however close to 30 days, is not sufficient.

Within that requirement:

1. Prefer **standard expirations**, meaning the venue's regular monthly expiration series as defined in its contract specifications and recorded in the options-venue register. The Near Term is the standard expiration with days to expiration in `[d_min, 30]`; the Next Term is the standard expiration with days to expiration in `(30, d_max]`.
2. If no standard expiration satisfies one of those bounds, use the venue's other eligible listed expiration closest to 30 days that satisfies it.
3. If either the Near Term or the Next Term cannot be filled, the constituent is excluded with reason `NO_NEAR_TERM` or `NO_NEXT_TERM`.

The window bounds `d_min` and `d_max` are adopted **provisionally** from the constituent-volatility precedent, which uses a near-term window of at least ten and at most thirty days and a next-term window of more than thirty and at most one hundred twenty days. They are marked **unresolved** for UAVI because that precedent governs a single national market with dense expiration listings, and venues outside it commonly list fewer maturities. Validation must measure how often each bound binds by venue before the values are approved; the bracketing requirement in the preceding paragraph is a rule, the numeric bounds are not yet.

"Standard expiration" is defined by venue and never by a hard-coded calendar convention. The third-Friday convention holds on some venues and not others, and encoding it globally would silently misclassify expirations on venues that expire on a different day, or that key expiration to a preceding business day. The register carries each venue's actual rule.

## Quote and Strip Validity

UAVI is computed from **quotes**, not from trades, and not from any vendor's published implied-volatility figure. Each contract's price is the midpoint of its bid and ask in the end-of-day snapshot for that venue, `Q(K)`.

A **valid quote** is a two-sided quote in which the ask is non-zero and the ask is greater than or equal to the bid. A quote that is missing a side, crossed, or non-positive on the ask is not valid. This is adopted directly from the constituent-volatility precedent. A **valid strip** is one containing at least one strike for which both the put and the call have a valid quote, which is the minimum needed to compute an implied forward.

Quotes must additionally satisfy the snapshot's freshness requirement for their venue: a quote carried from materially before the venue's end-of-day snapshot is marked stale, and a constituent whose strip depends on stale quotes beyond tolerance is excluded with reason `STALE_QUOTES`. The freshness tolerance is **unresolved** and must be set from observed quote-update behaviour per venue.

No maximum bid-ask spread threshold is adopted. A spread filter is a plausible quality control and an equally plausible way to silently delete the widest, most informative wings; whether one improves the measure is an empirical question, not a default. Open interest and trading volume are likewise recorded as **diagnostics** and are not eligibility thresholds: a contract with a firm two-sided quote carries price information whether or not it traded that day, and imposing a volume floor would bias the universe toward heavily traded names in a way the weighting already accounts for. Validation must test whether quote-based sufficiency alone admits strips whose variance is unstable, and only then consider adding a threshold.

### Strike filtering

Within each valid strip, the at-the-money strike `K0` is identified as described in the next section, and out-of-the-money contracts are the puts with strikes below `K0` and the calls with strikes above `K0`. Contracts are then filtered in sequence:

1. Moving outward from `K0` in each direction separately, once two consecutive out-of-the-money contracts have zero bids, that contract and **every contract further from `K0` in that direction** is excluded, including any with a non-zero bid.
2. Any remaining contract without a valid quote is excluded.
3. Any remaining contract with a zero bid is excluded.

The truncation is applied independently to the put wing below `K0` and the call wing above `K0`; exhausting one wing does not terminate the other. The surviving out-of-the-money contracts, together with the at-the-money strike, are the strip's valid options.

### Valid variance condition

A constituent has a **valid variance** at a calculation only if both its Near Term and Next Term strips are valid strips and **each strip contains at least three valid out-of-the-money calls and at least three valid out-of-the-money puts**, in addition to valid at-the-money quotes. A strip failing the call requirement yields `INSUFFICIENT_OTM_CALLS`, the put requirement `INSUFFICIENT_OTM_PUTS`, and a failure of the at-the-money quotes `INVALID_ATM_QUOTES`.

This condition is adopted from the constituent-volatility precedent substantially unchanged, because it is the part of that methodology that most directly addresses the failure mode UAVI faces: a strip variance computed with only one or two live wings is dominated by the truncation error term and is not a usable estimate. Whether three is the right count for venues with sparser strike listings than the precedent's market is recorded for validation.

## Implied Forward and K0

For each valid strip `j` on constituent `i`, the implied forward is computed by put-call parity at the strike where the absolute difference between the call and put mid-prices is smallest, provided that strike has valid quotes for both. Where several strikes tie, the lowest is used.

`F_j = K_j + e^(r_j × T_j) × (C_j − P_j)`

`K_j` is that strike, `C_j` and `P_j` its call and put mid-prices, `r_j` the continuously compounded rate for the strip's currency and maturity from [Risk-Free Rates](#docs-risk-free-rates), and `T_j` the annualized time to expiration from [VIX-Style Term Variance](#docs-vix-style-term-variance).

`K0_j` is the greatest listed strike less than or equal to `F_j`. Where no listed strike is at or below the implied forward, the strip cannot be used and the constituent is excluded.

As stated above, this relation is exact only for European-style contracts on an underlying with no discrete cash flows over the option's life, and is an approximation for the American-style contracts that dominate single-name options. The computed forward is recorded as a derived quantity with its inputs, never as an observed price.

## VIX-Style Term Variance

For each strip, the annualized time to expiration is computed in minutes from the observation timestamp to the contract's expiration or settlement timestamp as given by the venue's contract specification:

`T_j = N_j / N365`, where `N_j` is the number of minutes to expiration and `N365 = 525,600`

Expiration timestamps are taken from contract reference data per venue and series. UAVI does not assume a common settlement hour across venues, or across series within a venue, and does not compute time to expiration from integer day counts.

The term variance for strip `j` is:

`σ²_j = (2 / T_j) × Σ_k [ (ΔK_k / K_k²) × e^(r_j × T_j) × Q(K_k) ] − (1 / T_j) × (F_j / K0_j − 1)²`

where the sum runs over the strip's valid options, `Q(K_k)` is the mid-price of the put for strikes below `K0_j`, the mid-price of the call for strikes above `K0_j`, and the average of the call and put mid-prices at `K0_j` itself, and `ΔK_k` is half the difference between the strikes on either side of `K_k`, or the simple difference to its single neighbour at either end of the surviving strike range.

All strikes and prices in a strip are in one currency and one unit convention, and the expression is invariant to a common rescaling of both, so `σ²_j` is dimensionless and requires no currency conversion. Calculations use unrounded values throughout; a rounded value is never an input to a subsequent calculation.

Every strip retains its selected contracts, their quotes and timestamps, `F_j`, `K0_j`, `r_j`, `T_j`, the strike set with each `ΔK_k`, the computed variance, and the strip's quality status, so that the figure is reproducible from the recorded inputs.

**A vendor-published 30-day implied volatility is never the canonical input.** UAVI's constituent measure must be reproducible from option quotes under these rules. Vendor-computed implied volatility may be retained as a cross-check diagnostic and must be labelled as such.

## 30-Day Constant-Maturity Variance

The Near Term and Next Term variances are interpolated in **variance**, weighted by time to expiration, and annualized to the constant 30-day horizon:

`σ²_i,30 = { T_1 × σ²_i,1 × [(N_2 − N30) / (N_2 − N_1)] + T_2 × σ²_i,2 × [(N30 − N_1) / (N_2 − N_1)] } × N365 / N30`

where subscripts 1 and 2 denote the Near and Next Term strips, `N_1` and `N_2` are their minutes to expiration, `N30 = 43,200` is the number of minutes in 30 days, and `N365 = 525,600`.

Because selection requires `N_1 ≤ N30 < N_2`, both bracket weights lie in `[0, 1]` and the result is an interpolation. Quoted implied-volatility percentages are never interpolated; the interpolation is performed on time-weighted variance and converted to volatility only once, at aggregation.

A constituent for which this quantity is computed from strips satisfying the valid variance condition is said to have a **valid variance** for that calculation.

## Constituent Eligibility

A parent member enters the eligible set `E_t` for calculation date `t` only if all of the following hold: an Options Reference Security is determined; qualifying unadjusted option contracts on it exist on a registered venue; a bracketing Near Term and Next Term pair can be selected; both strips satisfy the valid variance condition; a currency-matched risk-free rate exists for both maturities; contract and security reference data are internally consistent; quotes satisfy the snapshot's validity and freshness rules; and no unresolved corporate action makes the mapping or the contracts unreliable.

A member failing any requirement is excluded from that calculation with a recorded reason. The reason codes are methodological categories, not identifiers: `NO_OPTIONABLE_REFERENCE`, `NO_CANONICAL_CURRENCY_OPTION_REFERENCE`, `CANONICAL_CURRENCY_UNRESOLVED`, `REFERENCE_EQUIVALENCE_UNRESOLVED`, `NO_NEAR_TERM`, `NO_NEXT_TERM`, `INSUFFICIENT_OTM_CALLS`, `INSUFFICIENT_OTM_PUTS`, `INVALID_ATM_QUOTES`, `STALE_QUOTES`, `RATE_UNAVAILABLE`, `CONTRACT_ADJUSTMENT_UNRESOLVED`, `REFERENCE_DATA_CONFLICT`, and `UNDERLYING_HALTED`. Exclusion from UAVI is never a statement about the company's parent membership or its AI exposure.

Exclusions are published in aggregate with the observation: the excluded parent weight and the distribution of reasons. A measure whose coverage falls for a reason that is never disclosed is not auditable.

## Parent Weight Inheritance and Renormalization

UAVI inherits the canonical parent base weights `w_i` effective for the calculation date, from the parent's scheduled weight snapshot or from a valid event weight snapshot effective at that date, as the parent methodology defines. UAVI does not recompute, adjust, smooth, or lag them.

Eligible parent-weight coverage is:

`C_t = Σ_{i∈E_t} w_i`

If `C_t > 0`, the UAVI weights are the inherited weights renormalized over the eligible set:

`v_i,t = w_i / C_t` for `i ∈ E_t`, and `v_i,t = 0` otherwise, so that `Σ_i v_i,t = 1`

This is the parent's downstream-filter rule applied unchanged, and it preserves the relative parent weights of the surviving constituents.

**The parent issuer cap is not reapplied after filtering.** Renormalization can lift a constituent's UAVI weight above the parent cap, and recapping would alter the relative-weight inheritance the parent methodology specifies. Any downstream recapping would be a distinct UAVI methodology decision requiring its own rationale and evidence; none is proposed. The resulting concentration is instead measured and published, and is one of the publication gates below.

## UAVI Aggregation

At each calculation, in order: read the current valid parent weight snapshot; determine the Options Reference Security for each member; assess option eligibility and form `E_t`; compute each eligible constituent's `σ²_i,30`; compute coverage `C_t`; renormalize to `v_i,t`; then

`V_t = Σ_{i∈E_t} v_i,t × σ²_i,30,t`

`UAVI_t = 100 × sqrt(V_t)`

Each constituent's variance contribution `v_i,t × σ²_i,30,t` is retained with the observation, so that the published figure decomposes exactly into constituent contributions. `V_t` is non-negative by construction when every `σ²_i,30` is non-negative; a negative constituent variance indicates a calculation or data fault, blocks that constituent, and is recorded as an error rather than floored at zero.

## Interpretation

A UAVI value of 30 means that the weighted root mean square of 30-day annualized option-implied volatility across eligible constituents is approximately 30%, each constituent measured in the canonical currency of its own ordinary-equity claim.

**A market price of variance risk, not a forecast.** Option-implied variance is the price at which variance risk is being transferred, not an unbiased forecast of subsequently realized variance. Empirical research on broad equity-index options often finds a positive variance risk premium, meaning implied variance has tended to exceed realized variance over long samples. UAVI does not assume that premium has any particular sign or magnitude for a given constituent, venue, or period, and no rule in this methodology depends on one. Published material must therefore not present UAVI as a prediction of what volatility will turn out to be, nor assert that it is systematically above what will be realized. The distinction is between what the market charges for volatility exposure and what volatility subsequently occurs; UAVI measures the former.

**Horizon scaling.** The identity `σ_30d ≈ σ_annual × sqrt(30 / 365)` converts an annualized volatility to a 30-day figure for a single constant-volatility process, so a UAVI of 30 corresponds to roughly 8.6% over 30 days for a constituent with that volatility. If this heuristic is used in explanatory material, it must carry the limitation with it: it describes a representative constituent, not the universe as a portfolio, and it does not mean that UGAI or any AI portfolio is expected to move by that amount. What a portfolio would do additionally depends on correlation, and for an investor reporting in a single currency on exchange-rate variance and covariance as well, none of which UAVI contains; see [What UAVI Does Not Measure](#docs-what-uavi-does-not-measure).

UAVI has no direction. A rise means the market is paying more for volatility exposure in these companies; it is not a forecast of losses.

## Global Timing and the End-of-Day Snapshot

UAVI V1 is an **end-of-day** measure: one official observation per calculation date, and no intraday, indicative, or real-time values. Nothing in this proposal should be built to support them. End-of-day publication is chosen deliberately over the intraday dissemination used by single-market constituent volatility measures, because UAVI spans venues in different time zones where no intraday instant exists at which all constituent option markets are open, and because it materially reduces licensing scope, quote noise, and synchronization risk.

A UAVI calculation date `t` is a calendar date. For each constituent, the inputs are that venue's designated end-of-day option quote snapshot for its session dated `t`, and the rates dated `t` for the option currency. Asian, European, and American sessions dated `t` belong to the same UAVI date even though they close at different times. The observation for `t` is computed only after the last contributing options market with a session dated `t` has closed and the required rates for `t` are available.

**Constituent observations are therefore not simultaneous**, and two consequences are disclosed rather than corrected. First, constituents observed at different venue closes are measured up to roughly a day apart within the same calendar date. Second, because each constituent's 30-day window starts at its own observation time, the windows differ by the same span; the horizon length is identical for every constituent but its start is not. This is the same calendar-date convention UGAI applies to closing prices, adopted here for cross-product consistency.

The alternative, a single global wall-clock instant, was evaluated and rejected for V1. At any chosen instant most venues are closed, so their inputs would be carried from an earlier close and be stale by construction, while the open venues would contribute intraday quotes, making the measure neither an end-of-day nor a synchronous one. The per-venue close convention at least makes every input the venue's own best-defined daily observation.

Every constituent's observation timestamp, venue, and snapshot identity are retained, and staleness is published rather than absorbed. Look-ahead is prohibited: the value for `t` uses no quote, rate, contract term, universe version, or weight snapshot whose publication time is after the calculation cutoff for `t`.

The exact end-of-day snapshot definition per venue, the calculation cutoff, and the publication deadline are **unresolved** launch parameters.

### Calculation dates

Proposed calendar: UAVI is calculated for a date on which at least one registered options venue held a session and the required rate observations are published. It is not calculated on dates when no registered venue held a session.

Where a constituent's options venue is closed for a local holiday while others trade, that constituent has no snapshot for `t` and is excluded for that date under the missing-variance rule below; its parent weight moves to excluded coverage. Where an options venue trades while the underlying's equity market is closed, or the reverse, the quotes are used or not according to the venue's own snapshot definition and the freshness rule, and the condition is recorded. A date on which coverage falls below the publication gate is published as Delayed or Unavailable rather than as a value computed from a residual set. Prices and variances are never fabricated for a closed market.

## Risk-Free Rates

The discount rate entering the implied forward and the variance sum must be denominated in **the currency of the option contracts** and matched to **the strip's maturity**. Different strips on the same constituent use different rates, and constituents in different currencies use different curves.

For each strip, the rate is the continuously compounded yield for the strip's expiration date, derived from an approved risk-free or near-risk-free reference curve for the option's currency, observed at or before the calculation cutoff for the date, and interpolated to the expiration date by a documented, reproducible method with documented bounds. The precedent for constructing such a rate, a published sovereign or administered benchmark curve interpolated by a bounded spline and converted to a continuously compounded basis, is adopted as a method; the source curve is not, because that precedent's curve is specific to the currency of its own options market.

Applying one currency's government curve to options denominated in another currency is prohibited. Negative rates are used as observed and are not floored, since flooring would bias implied forwards in the affected currencies.

If no approved rate exists for a strip's currency and maturity at the cutoff, the constituent is excluded with reason `RATE_UNAVAILABLE`. UAVI does not substitute a zero rate, a neighbouring currency's rate, or a stale curve beyond the approved tolerance.

The approved curve family per currency, the interpolation and extrapolation method and its bounds, the observation time per currency, the compounding and day-count conventions, and the staleness tolerance are **unresolved** launch parameters.

## Missing and Stale Variance

**Selected proposal: strict end-of-day validity.** If a constituent has no valid variance at its designated end-of-day snapshot for date `t`, it is excluded from that date's calculation with its reason recorded, and the surviving parent weights are renormalized. No variance is carried forward from earlier in the day or from a prior date.

**This is a Urdais modification of the precedent, not an inheritance from it.** The constituent-volatility precedent permits bounded pull-forward in both its live and its historical construction. In live calculation, where a constituent lacks a valid variance it may use that constituent's most recent valid variance from earlier in the same trading day, failing that the valid variance used at the prior trading day's close, and only otherwise excludes the constituent and reweights the remainder. In its back-tested history it likewise permits a bounded carry, from a calculation run two minutes before the equity close to the close itself, excluding the constituent only where neither point yields a valid variance. UAVI declines that allowance deliberately, for reasons specific to what UAVI is rather than because the precedent forbids it:

- pull-forward exists to keep a continuously disseminated intraday value alive between quote updates, and UAVI V1 publishes once per date, so there is no continuity to protect;
- a once-daily figure that silently mixes an earlier session's expectations into today's is harder to interpret than a figure with lower coverage, and coverage is published while temporal mixing would not be visible;
- the exclusion path is already defined, already published with its reason, and already reflected in the coverage statistic, so the conservative choice costs nothing that is not disclosed.

Coverage loss is therefore preferred to hidden temporal mixing. Whether measured snapshot quality makes a bounded same-day allowance necessary is an empirical question recorded in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required), and no carry may be introduced merely to avoid a coverage or composition effect elsewhere in this methodology.

Whether a limited same-day pull-forward becomes necessary, and whether any prior-date carry could ever be justified, are recorded as open questions to be answered from measured snapshot quality. If either is ever adopted, the constraints are fixed now: a carried variance must never be presented as current, its age and origin must be published with the observation, the share of coverage carried must be published, and no carry may be silent.

An excluded constituent returns to the eligible set as soon as it has a valid variance again; exclusion carries no penalty period.

## Coverage and Publication Gates

Because some parent members will always lack qualifying options, UAVI must publish how much of the parent universe it actually represents. Each observation carries:

- **eligible parent-weight coverage** `C_t`, the share of current parent base weight represented by eligible constituents;
- the **eligible constituent count**;
- the **excluded parent weight** and the distribution of exclusion reasons;
- the **largest renormalized constituent weight** `max_i v_i,t`;
- the **effective number of constituents** `N_eff = 1 / Σ_i v²_i,t`;
- the **share of coverage** carried or flagged stale, if any such treatment is ever adopted.

Coverage is more informative than constituent count alone: twenty-seven constituents representing 84% of parent weight and twenty-seven representing 30% are different measurements.

A headline value is published only when the measure still represents the parent universe. The gates are: a minimum eligible parent-weight coverage; a minimum eligible constituent count; a maximum largest renormalized weight; a minimum effective number of constituents; and a maximum stale share if staleness is ever permitted. **The numeric values of these gates are unresolved** and must be set from measured historical coverage rather than chosen so that the index publishes. Failing a gate produces a Delayed or Unavailable observation, with the failing gate published; it never produces a value computed from a residual set presented as if complete.

Two conditions are structural rather than parametric and apply now: if `E_t` is empty or `C_t = 0`, no value exists and the observation is Unavailable; and if no valid parent weight snapshot exists, the next section applies.

Not every diagnostic is a gate. Concentration and effective-constituent figures may be published for transparency even where they do not block publication, and validation must establish which of them actually predict an unrepresentative measure before they become thresholds.

## Parent Weight Unavailability

The parent methodology permits a valid membership state to exist with **no current weight snapshot**, when a universe event leaves the capped allocation infeasible. UGAI continues through such an interval because it needs only the membership event. UAVI cannot: its aggregation requires a current canonical weight vector.

**If no valid parent weight snapshot is effective for the calculation date, UAVI does not calculate a headline value and the observation status is Unavailable**, with the reason published and attributed to the parent condition. In that state UAVI must not reuse the superseded parent weight snapshot as though it were current, equal-weight the constituents, substitute UGAI's as-of weights or index shares, or reconstruct parent weights by any means of its own. Constituent-level variances may still be computed, recorded, and published as inputs, since they do not depend on weights; only the aggregate is withheld.

UAVI resumes when the parent publishes a valid weight snapshot, at the next scheduled reset or an earlier feasible event weight snapshot. The interval is recorded and is not retrospectively filled.

## Corporate Actions and Option Adjustments

Company membership, identity, and representative-security decisions are the parent's. UAVI holds no position, has no divisor, and computes no return, so it has no continuity to preserve across a corporate action. Its only question is whether the option contracts and the economic mapping between the company and its Options Reference Security remain valid. UGAI's return-index corporate-action rules do not apply here and are not duplicated.

Clearing organizations adjust outstanding option contracts for corporate actions by changing the exercise price, the unit of trading, the deliverable, or the number of contracts, with the objective of preserving the economic position of contract holders; complex events are decided case by case by an adjustment panel. The consequence for UAVI is that after such an event the listed series on a reference security may be a mixture of adjusted and unadjusted contracts with different deliverables.

- **Stock split, reverse split, stock dividend:** the mapping survives. Adjusted contracts are excluded until unadjusted series are listed for the required expirations; if that leaves either strip unfillable, the constituent is excluded for those dates.
- **Special dividend or capital repayment triggering a contract adjustment:** treated as above. UAVI makes no price adjustment of its own, since it measures variance, not return.
- **Merger or acquisition:** when the deliverable becomes cash or a package, the contracts no longer reference the constituent's equity and are excluded. The parent decides membership; UAVI excludes the constituent from the effective time regardless, until unadjusted contracts on a surviving eligible reference security exist.
- **Spin-off:** where the deliverable becomes a package of two securities, those contracts are excluded. The distributed company is not a UAVI constituent unless the parent admits it and it independently qualifies.
- **Receipt ratio change or termination of a depositary programme:** the Options Reference Security mapping is revalidated. A changed ratio is permissible only if it remains fixed and verified; an unresolved ratio excludes the constituent.
- **Representative-security substitution by the parent:** the mapping is re-derived under the selection order, retaining an eligible incumbent mapping where the parent's change does not affect it.
- **Delisting or cancellation:** the constituent is excluded from the effective time; the parent decides membership.
- **Trading halt in the underlying or suspension of the option class:** quotes are assessed under the validity and freshness rules; a constituent whose strips cannot satisfy them is excluded with `UNDERLYING_HALTED` and is not carried.
- **Parent universe event:** the membership state changes at the parent's effective time and UAVI uses the new membership from that date, subject to weight availability.

Every exclusion arising from a corporate action is recorded with the event, its terms, the affected contracts, and the effective time.

## Published Values

For each observation UAVI publishes the level to two decimals, the percentage change over defined periods computed from unrounded values, the horizon, the eligible constituent count, the eligible parent-weight coverage, the as-of date, the status, and the applicable version identifiers.

As with UGAI, **percentage change is the Urdais product signal**. The level is expressed in annualized volatility percentage points, so the arithmetic difference between two levels is a change in volatility points and is a legitimate analytical quantity; it is nonetheless not the headline product signal, and the two must be labelled distinctly rather than presented interchangeably. A move from 28.90 to 31.42 is a 2.52 volatility-point change and an 8.7% change in UAVI; the latter is the published signal.

Displays must show the status and the coverage alongside the value, must distinguish a Delayed or Unavailable date from a zero change, and must not present a UAVI level without its horizon.

## Historical Integrity and Lineage

Every published observation must be traceable through:

UAVI Observation → UAVI Methodology Version → AI Equity Universe Methodology Version → Universe Version → Parent Weight Snapshot → UAVI Eligible Constituent Snapshot → Constituent 30-Day Variance → Near and Next Term Variance → Selected Option Contracts and Quotes → Risk-Free Rate Inputs → Security and Contract Reference Data → Original Sources

For any historical date it must be possible to list the parent membership state and weight snapshot consumed, each member's eligibility outcome and exclusion reason, each eligible constituent's Options Reference Security and the basis for that mapping, the selected expirations, the contracts and quotes used with their timestamps and venues, the rates with their curves and observation times, each strip's derived forward, `K0`, time to expiration and variance, each constituent's 30-day variance and contribution, the coverage and concentration figures, and the status of every input.

A historical value must never change because a mapping rule, a venue register, or a parent parameter changed later; those take effect at their own effective dates. Retain rejected and superseded inputs alongside those used, with source, publication or access timestamp, and vintage.

Any series computed for dates before UAVI's first live publication is labelled **reconstructed** or **backtested** research history, carries its information limitations, and is never presented as live history. Point-in-time reconstruction must use the historical parent universe versions and weight availability, the option contracts and quotes as they stood, historical rates, historical venue calendars and specifications, and only information available at each historical time. Survivorship bias, from reconstructing with today's membership, and look-ahead bias, from using later-corrected quotes or contract data, must both be demonstrated absent. Reconstruction is feasible only to the extent that historical option quote and contract data are licensed and retained; see [Licensing and Reproducibility](#docs-licensing-and-reproducibility).

## Corrections and Restatements

Distinguish, each with its own record: an **input correction**, where a quote, rate, contract term, expiration timestamp, or reference datum was wrong or missing at calculation time; a **mapping error**, where an incorrect Options Reference Security was used; a **parent-input error**, where the wrong weight snapshot or membership state was consumed or a universe event was missed; a **calculation error**, where these rules were applied incorrectly; a **vendor correction**, where a licensed source revises a delivered value; and a **publication error**.

These are not: a change in eligibility between dates, a constituent legitimately excluded and later readmitted, or a methodology amendment with a future effective date.

Proposed handling follows the Urdais convention established for UGAI. An error detected within the correction window is corrected by restatement, each restated value carrying the original value, the reason, the detection and republication timestamps, and the status **Corrected**, with the original retained as **Superseded**. Outside the window, history is ordinarily left as published and the correction is applied prospectively with a published notice. An **exceptional historical restatement** may be made only where the error materially compromises the integrity, interpretability, or reproducibility of the historical series, such that leaving it would render the published history materially misleading or non-replicable; it must be publicly documented, identify the affected observations, preserve the originals as Superseded, record the reason and approval, and be published as a distinct restatement event. This is a high bar and not a discretion to tidy small errors.

The correction window and the materiality threshold are **unresolved**. History is never silently overwritten.

## Status Model

Observation status, one per published date: **Published**, computed from a complete admitted input set meeting the publication gates; **Delayed**, not yet released or released after the deadline because inputs were incomplete or a gate was not met at the deadline; **Unavailable**, no valid observation can be produced, including the parent-weight-unavailable case; **Corrected**, restated after publication; **Superseded**, the original of a corrected observation, retained for lineage.

Constituent input status is separate and never collapsed into the headline status: **Valid**, a variance computed under these rules at the designated snapshot; **Excluded**, with a reason code; **Stale**, computed from inputs older than the freshness requirement, where such treatment is permitted at all; **Invalid**, where a computation produced a non-finite or negative result and was blocked.

A date on which many constituents are Excluded but the gates are met is Published with reduced coverage, and the coverage figure carries that information. Constituent status is published in aggregate with every observation.

## Conceptual Data Requirements

These describe information UAVI requires, not storage or schemas.

- **OptionsReferenceSecurity:** parent company, the underlying ordinary-equity claim and the parent representative security; the **canonical equity currency**, the source and rationale establishing it, and its effective interval; the selected option-underlying security and venue, its option line currency, and whether that currency matches the canonical equity currency; the reference-line type (ordinary, same-class alternate listing, or receipt) and its relationship to the ordinary claim; whether any currency overlay separates the line from the canonical claim; equivalence basis and receipt or conversion ratio where applicable; the equivalence status of the mapping and the evidence supporting it, including any measured wedge behaviour relied upon; supporting evidence; mapping status; and the exclusion reason where the canonical currency is unresolved, where equivalence is unresolved, or where no qualifying option class exists in that currency.
- **OptionContract:** reference security, venue, contract identifier, call or put, strike with currency and units, expiration date and exact expiration or settlement timestamp, **exercise style**, settlement style, deliverable, multiplier, standard or adjusted status, and the adjustment event where adjusted.
- **OptionQuoteSnapshot:** contract, venue snapshot identity, observation timestamp, bid, ask, derived mid, quote validity, staleness flag, and source.
- **RiskFreeRateObservation:** currency, curve family and source, observation timestamp, target maturity date, interpolated continuously compounded rate, conventions, and status.
- **OptionStrip:** reference security, expiration, term designation (Near or Next), the contract set before and after filtering, valid option counts by side, implied forward, `K0`, time to expiration, quality status, and the diagnostics carried for the American-exercise question: the exercise style of the contracts, any known ex-dividend dates falling within the strip's life with amounts where available, the moneyness structure of the surviving strikes, and the discrepancy against a modelled American-style benchmark where one is available.
- **OptionExpiryVariance:** constituent, strip, term variance, rate, time to expiration, and the strip identity from which it was derived.
- **ConstituentImpliedVariance:** constituent, date, 30-day variance, the Near and Next expirations and their interpolation inputs, observation timestamp and venue, freshness, and quality status.
- **UAVIEligibilityAssessment:** parent member, parent weight, eligibility outcome, exclusion reason where excluded, and Options Reference Security where determined.
- **UAVIConstituentSnapshot:** parent weight, renormalized UAVI weight, 30-day variance, variance contribution, input statuses, and observation timestamp.
- **UAVIObservation:** date, level, percentage changes, eligible constituent count, parent-weight coverage, concentration and effective-constituent figures, status, UAVI methodology version, parent methodology version, universe version, weight snapshot identity, parameter set, and calculation and publication timestamps.
- **OptionsVenueRegister:** venue MIC, standard expiration series definition, expiration and settlement timestamp conventions, exercise and settlement styles, end-of-day snapshot definition, trading calendar, admission decision, evidence, and effective interval.

This methodology specifies the information required. It does not define a database schema, ingestion pipeline, or calculation service.

## Source Specification

UAVI will require these source families. Authoritative or licensed structured data is required for production; scraping retail option chains is not an acceptable production data model.

- **Parent AI Equity Universe data:** published universe versions, membership states, weight snapshots, and universe events.
- **Security reference data:** identifiers, listing status, share class and receipt mappings with verified ratios, and identity changes.
- **Option contract reference data:** the contract master per venue, with strikes, expiration and settlement timestamps, exercise and settlement styles, multipliers, deliverables, and adjustment status.
- **End-of-day option quotes:** bid and ask per contract per venue from the exchange or a licensed consolidated source, with snapshot timestamps.
- **Corporate action and option adjustment data:** issuer, exchange, and clearing-organization notices, reconciled under the parent's source hierarchy.
- **Risk-free reference curves:** an approved published curve per option currency, with observation timestamps.
- **Options venue specifications and calendars:** contract specifications, expiration conventions, trading days, holidays, and scheduled partial sessions per venue.
- **Underlying prices:** not required by the variance calculation, which is scale-invariant, but retained for validation, diagnostics, and reference checks.

Exchange rates are not an input to the variance calculation or to aggregation. They may be required for reference and reporting, and their absence must not be mistaken for an FX-free measurement of a foreign-currency receipt, as discussed in [Options Reference Security](#docs-options-reference-security).

## Data Quality Rules

Before an observation is published, at minimum: each constituent maps to exactly one Options Reference Security with a validated basis; contracts are unique, correctly paired by strike into calls and puts, and in the expected currency and units; strikes are ordered and `ΔK` is consistent with the surviving strike set; quotes are two-sided, non-crossed, and within the freshness tolerance; expiration timestamps come from contract reference data and are consistent with the venue register; the selected pair satisfies `N_1 ≤ N30 < N_2`; `K0` is a listed strike at or below the implied forward; each strip meets the valid variance condition; each term variance and each 30-day variance is finite and non-negative; a currency-matched rate exists for every strip; contract adjustment state is resolved for every contributing series; a valid parent weight snapshot is effective for the date; renormalized weights are non-negative and sum to one; coverage, concentration, and effective-constituent figures are computed and within the publication gates; and the lineage record is complete.

A failed critical check blocks the affected constituent or, where it concerns weights or coverage, the observation. It never authorizes imputation. Numerical tolerances for quote freshness, rate staleness, and reconciliation differences require production data and are **unresolved**.

## Licensing and Reproducibility

Listed option quote and contract data are licensed products, and both current use and historical retention are restricted and expensive, more so than the equity data UGAI requires and across more venues.

UAVI's reproducibility claim is therefore bounded by licensing, not only by these rules. An observation is independently reproducible only where the quotes, contract reference data, adjustment records, and rate observations used to produce it may lawfully be retained and re-examined. Where retention is not permitted for a venue or period, that limitation is recorded and the affected observations are marked as not independently reproducible. The same constraint bounds any reconstructed history: a backtest is feasible only over venues and periods for which historical option data are licensed and retained.

Securing this data for the intended venue set, with adequate historical rights, is a launch requirement and a genuine constraint on UAVI's achievable geographic scope. Coverage that cannot be licensed is a published limitation, not an assumption.

## Methodology Versioning

UAVI carries its own methodology version, independent of the parent's and of UGAI's. Each observation identifies `uavi_methodology_version`, `ai_equity_universe_methodology_version`, `universe_version`, the parent weight snapshot consumed, and the UAVI parameter set once resolved.

A change to UAVI's rules, parameters, venue register, or calendar is announced with a prospective effective date and a documented rationale and impact assessment; it does not alter observations before that date. A change to the parent methodology reaches UAVI only through a new universe version and does not by itself change UAVI's version. Editing this public page is not a production change.

Version history: **0.1.0-draft, 12 September 2026**, initial research-backed proposal, amended in review on 12 September 2026 before merge: the constituent-volatility precedent's pull-forward allowance described accurately and UAVI's strict no-carry rule reframed as a Urdais modification justified by its own publication model; the options reference rule restated as a single ordered test on the same economic claim in the canonical equity currency, with foreign-currency receipts excluded rather than substituted and the fixed-ratio invariance result scoped to deterministic same-currency rescaling; the portfolio upper-bound product claim withdrawn and replaced by the statement that portfolio volatility requires correlation and, for a common-currency investor, exchange-rate inputs that UAVI does not contain; the American-exercise and dividend limitation restated without an assumed error sign, with the raw quote-strip estimator retained for V1 and a modelled benchmark added to validation; and holiday-driven composition effects added as a validation item. Further amended on the same date after retrieving the November 2024 edition of the constituent-volatility precedent: that edition replaces the July 2023 edition as the primary source, its VIXEQ aggregation formula is recorded directly, its prose description of the object as a geometric average is noted as inconsistent with its own formula, its live and back-tested pull-forward allowances are both described accurately, UAVI's strict no-carry rule is retained as an explicit modification of them, and the canonical equity currency is given a deterministic determination rule applied before any options reference selection. Amended again on the same date following independent review: the constituent quantity is described as a VIX-style implied-variance estimator, with the exact variance-replication reading stated as conditional on assumptions that American-style single-stock contracts need not satisfy and "model-free" scoped to its narrow methodological sense; the variance-risk-premium interpretation is stated as an empirical tendency rather than a universal property; and the screens for a same-currency receipt-to-ordinary mapping are identified as necessary but not sufficient, with production use gated on approved equivalence criteria. No production effective date.

## Open Questions / Empirical Validation Required

No production observation may be published under this draft. The following require production data, licensing decisions, or historical testing, and are recorded here rather than resolved by assumption.

- **Options reference equivalence criteria:** the evidentiary standard that makes a same-currency receipt-to-ordinary pairing usable in production, beyond the necessary screens of ratio verification, rights equivalence, and functioning conversion. It must establish, on measured evidence, whether the market-price wedge between the two lines is stable enough for them to be treated as one variance process, accounting for conversion frictions, settlement timing, fees, access and custody constraints, capital controls, temporary segmentation, and persistent or time-varying premia and discounts. No numerical tolerance is adopted here; until criteria are approved, such mappings remain candidates and the affected companies are excluded under `REFERENCE_EQUIVALENCE_UNRESOLVED`.
- **American-style exercise and dividend sensitivity:** the direction and magnitude of the estimation error in the constituent estimator, measured by exercise style and venue, with no prior assumption about its sign; the sensitivity of computed variance to ex-dividend timing and amount within the strip horizon; whether strips spanning a material ex-dividend date should be excluded or flagged; and whether any venue's contract design makes the estimator unusable.
- **Modelled-American benchmark comparison:** compare the raw quote-strip estimator against a modelled American-style benchmark, such as a binomial construction with discrete dividends of the kind used by the volatility-index provider for single-name implied volatility, across representative names, venues, exercise conventions, and dividend patterns. The comparison establishes the error distribution and is the evidence required before any future move toward a model-based construction; it is not itself a production input.
- **Canonical-currency reference coverage cost:** the parent weight excluded because a qualifying option class exists only outside the canonical equity currency, measured by geography and activity group, and the share of the universe reachable under the canonical-currency rule. This is the measured price of the coherence the rule buys, and it must be published rather than assumed small.
- **Canonical-currency ambiguity:** how often issuer designation and authoritative reference data fail to establish a unique canonical equity currency, how much parent weight would be excluded under `CANONICAL_CURRENCY_UNRESOLVED`, and how many dual-listed same-class companies present genuine ambiguity rather than a resolvable designation. The rule is not to be loosened to reduce that exclusion; if the measured ambiguity is material, the remedy is a better-evidenced determination hierarchy approved by amendment, not a discretionary choice of currency.
- **Holiday and calendar composition effects:** because a constituent whose options venue is closed has no variance for that date and is excluded, UAVI's composition changes with the global holiday calendar, and its level and one-day percentage change can move when no constituent's volatility changed. Measure the excluded weight attributable to venue holidays, the frequency of composition shifts, their effect on the published level and on one-day changes, the geographic concentration of the surviving set on regional holidays, and whether recurring holiday patterns produce predictable artifacts. The holiday rule is not changed on this draft's reasoning alone, and no carry-forward may be introduced to suppress the effect; any remedy must come from this evidence.
- **Options venue register:** the admitted venues, their standard expiration series and settlement timestamps, snapshot definitions, and the evidence supporting each admission.
- **Expiration window bounds:** the near-term and next-term day bounds, measured by venue, given that the adopted provisional values come from a single market with unusually dense expiration listings.
- **End-of-day snapshot timing:** the snapshot definition per venue, the calculation cutoff, and the publication deadline, including the effect of the span between the earliest and latest contributing closes.
- **Quote quality tolerances:** freshness limits; whether any bid-ask spread filter improves the measure; and whether open interest or volume predict unstable variance well enough to justify a threshold.
- **Valid variance thresholds:** whether the adopted minimum of three valid out-of-the-money contracts per side is appropriate on venues with sparser strike listings.
- **Missing variance policy:** whether measured snapshot quality makes the strict end-of-day rule unworkable and, only then, what bounded same-day treatment would be acceptable and what it would cost in staleness.
- **Publication gates:** the minimum coverage and constituent count, maximum concentration, minimum effective constituents, and which diagnostics genuinely predict an unrepresentative measure.
- **Risk-free curves:** the approved curve family per currency, interpolation and extrapolation method and bounds, observation times, conventions, and staleness tolerance.
- **Contract adjustment treatment:** the measured coverage cost of excluding adjusted contracts outright, and whether any adjusted series can be normalized reliably enough to admit.
- **Data providers, licensing, and retention:** sources for option quotes, contract reference data, adjustments, calendars, and rates, with historical rights adequate for reproducibility, and the resulting achievable venue scope.
- **Correction window and materiality threshold.**
- **Reconstructed history feasibility:** whether a point-in-time history can be built at all under the available licences without survivorship or look-ahead bias.

Parent-universe parameters that remain unresolved are not repeated here; UAVI depends on them only through published parent versions.

### Validation programme

Before production, test on point-in-time historical samples: the share of parent weight with qualifying listed options, overall and by geography, activity group, and company size; the distribution of available expirations against the bracketing requirement; strike depth and the frequency with which each wing truncates; zero-bid patterns by venue and moneyness; how often the valid variance condition is met; quote freshness by venue; the effect of excluding invalid constituents on the aggregate and on concentration; renormalized concentration and effective constituent counts; what a same-day or prior-day carry policy would have changed; behaviour across parent event periods when weights were unavailable; the frequency and coverage cost of adjusted option contracts; and the licensing coverage actually obtainable. Retain excluded cases and their reasons, include delisted and restructured companies, and demonstrate the absence of survivorship and look-ahead bias. This draft contains no constituent set and no validation results.

## Research Precedents

Primary sources retrieved and checked on 12 September 2026 are summarized below; figures and rules were read from the cited editions. The cited editions are research precedents, not incorporated Urdais rules. Providers revise these documents; a later edition does not change what this draft relied on. Adopt, modify, and reject refer to this proposal, not to production approval.

### Cboe, Volatility Index Methodology: Cboe Volatility Index

The [VIX methodology](https://cdn.cboe.com/api/global/us_indices/governance/Volatility_Index_Methodology_Cboe_Volatility_Index.pdf), version 6.0, last revised 26 February 2026, defines a measure of 30-day expected volatility of the S&P 500 computed from SPX and SPXW option prices and U.S. Treasury yield curve rates in four steps: select the near- and next-term expirations, calculate the interest rates, calculate each term's variance, and combine them at a constant 30-day maturity. Option prices are the midpoint of the bid-ask spread; `K0` is the first strike at or immediately below the forward index level; contributing contracts are the out-of-the-money put below `K0`, the out-of-the-money call above, and both at `K0`; strikes beyond two consecutive zero-bid contracts are excluded even where a further contract has a non-zero bid; and the published index is the volatility multiplied by one hundred. Near- and next-term rates may differ.

**Adopt:** the model-free variance construction, mid-quote pricing, the `K0` definition, out-of-the-money-only contribution, the two-consecutive-zero-bid truncation, per-term rates, and the constant 30-day maturity expressed by multiplying volatility by one hundred. **Modify:** UAVI applies this to single-name options rather than index options, and derives its rates from the option's own currency rather than from one sovereign curve. **Reject for UAVI:** the intraday dissemination and the filtering regime built around it, and any assumption that index-option properties carry over to single-name contracts.

### Cboe, Volatility Index Mathematics Methodology

The [mathematics methodology](https://cdn.cboe.com/api/global/us_indices/governance/Cboe_Volatility_Index_Mathematics_Methodology.pdf) specifies the selection and rate construction that the product methodology references. Its Bracket Method defines near-term options as those in the candidate set with days to expiration at or below the constant maturity term, falling back to the nearest expiration where none qualifies, with the next term beyond it. Its interest-rate construction retrieves constant maturity Treasury yields for the most recent business day, applies a natural cubic spline bounded by the adjacent observed maturities to interpolate a bond-equivalent yield for any date, converts to an annualized percentage yield, and then to a continuously compounded rate, with a documented maturity-to-days mapping.

**Adopt:** minute-based time to expiration, bracketing the constant maturity term rather than extrapolating, and the general rate construction of taking a published benchmark curve, interpolating with documented bounds, and converting to a continuously compounded basis. **Modify:** UAVI requires the curve to match the option's currency, so the specific Treasury source is precedent for method only; and UAVI requires strict bracketing rather than permitting the nearest-expiration fallback, because a non-bracketing pair would make the 30-day figure an extrapolation. **Reject:** nothing material.

### S&P Dow Jones Indices and Cboe, Cboe S&P 500 Dispersion Index Methodology

The [Dispersion Index methodology](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-cboe-sp-500-dispersion-index.pdf), **November 2024 edition**, twenty-one pages, is the primary source for the constituent-volatility construction and is the closest institutional analogue to UAVI. It governs two published indices: the dispersion index and, as a sub-index, the **Cboe S&P 500 Constituent Volatility Index (VIXEQ)**. Retrieval is recorded in the note at the end of this entry.

**The VIXEQ aggregation (pages 6 to 7 and 11).** On each trading day the constituent volatility index calculates as

`VIXEQ = 100 × sqrt(Σ_{i=1}^{L} w_i × σ̂²_i,30)`

where `σ̂²_i,30` is a current or recent 30-day variance estimate for constituent `i` and `w_i` is that constituent's float-market-capitalization weight as a proportion of the total weight of the constituents whose variance is included in the calculation at that point in time, including any carrying a pulled-forward variance. This is the same aggregation form UAVI adopts: weight the constituent variances, sum, then take the square root once and scale by one hundred.

**A discrepancy in the provider's own wording, recorded because it matters.** The document's prose describes the index as measuring "a weighted geometric average of the expected volatility" of constituents. That label does not match the formula printed alongside it. A weighted geometric average of volatilities would be `exp(Σ w_i ln σ_i)`; the formula given is a weighted quadratic mean, that is a weighted root mean square. The two coincide only in the degenerate case where every constituent volatility is equal, and the quadratic mean is otherwise strictly larger. This methodology treats the printed formula as authoritative and describes the object as a weighted root mean square accordingly, which is also how the provider's public product page characterises it.

**Constituent machinery (pages 7 to 9).** Eligible contracts are standard monthly, standard quarterly, and Friday weekly calls and puts on basket members listed on U.S. exchanges. A **valid quote** is a two-sided quote whose ask is non-zero and at least the bid; a **valid strip** contains at least one strike with valid quotes for both the put and the call. Two valid strips with standard third-Friday expirations are selected as **Near Term**, at least ten and at most thirty days to expiry, and **Next Term**, more than thirty and at most one hundred twenty days; if no standard expiration qualifies, the closest eligible weekly Friday expiration to thirty days that satisfies the condition is used, and if either term cannot be filled the constituent is dropped. The implied forward is computed by put-call parity at the strike minimizing the absolute call-put mid-price difference, ties resolved to the lowest strike, with `T` measured in minutes. The at-the-money call, put, and strike `K_zero` are identified by taking the strike at or directly below the implied forward, with out-of-the-money calls above and puts below it. Contracts are then filtered: out-of-the-money calls at strikes **higher than two consecutive zero-bid out-of-the-money calls** are removed even where they have non-zero bids, and, stated separately, out-of-the-money puts at strikes **lower than two consecutive zero-bid out-of-the-money puts** likewise; remaining contracts without valid quotes and remaining zero-bid contracts are then removed.

The **Valid Variance Condition** requires both the Near Term and Next Term strips to be valid strips and each to have a valid quote for the at-the-money call and the at-the-money put, at least three valid out-of-the-money calls, and at least three valid out-of-the-money puts. Term variance is the model-free sum with `ΔK` taken as half the difference between neighbouring strikes, or the simple difference at a boundary, and `Q(K)` the put mid below the at-the-money strike, the call mid above it, and the average of the two at it. The 30-day figure is a time-weighted interpolation of the two term variances annualized by `N365 / N30`, with `N365 = 525,600`.

**Pull-forward, live calculations (pages 9 to 10).** Where a constituent lacks a valid variance, the methodology applies a three-step hierarchy: (a) the most recently available valid variance from earlier in that trading day, which may reach back to the market open; failing that (b) the valid variance used in the end-of-day calculation at the prior trading day's close; and failing both (c) exclusion of the constituent with the remaining weights reweighted. A carried value is termed a pulled-forward variance, and the maximum span is from the day's first calculation, when a prior-close value may be used, through that same day's close.

**Pull-forward, back-tested history (page 12).** For back-tested end-of-day levels covering 19 June 2014 to 26 September 2023, a single hypothetical calculation was run on data current at **2:58 PM Chicago time**, two minutes before the 3:00 PM Chicago equity close, and again at the close. A constituent without a valid variance at the close but with one at the 2:58 PM calculation had that earlier variance **pulled forward**; a constituent with neither was excluded and the remaining weights reweighted. The back-tested series therefore also permits a bounded carry, of roughly two minutes.

If no constituent has either a valid or a pulled-forward variance the index does not calculate and updates are suspended; if the volatility index suspends publication the constituent volatility index does too, and a suspension of either the dispersion or the constituent volatility index suspends the other.

**Adopt:** the aggregation form, weighting constituent variances, summing, and taking the square root once; the model-free constituent variance machinery and its `ΔK` and `Q(K)` conventions; the valid quote and valid strip definitions; the implied forward by put-call parity at the minimum call-put difference with the lowest-strike tie-break; the at-the-money strike at or directly below the forward; the per-wing zero-bid truncation stated separately for calls and puts; the Valid Variance Condition including valid at-the-money quotes and a minimum of three valid out-of-the-money contracts per side; the time-weighted variance interpolation to a constant thirty days; and, as the response where no usable constituent variance remains, exclusion of the constituent with the surviving weights renormalized.

**Modify:** weights are inherited AI Equity Universe base weights, filtered for UAVI eligibility and renormalized over the survivors, rather than capitalization weights computed inside the volatility product, so that weighting remains a parent decision and UAVI is not this index with AI constituents substituted mechanically; expiration conventions are defined per venue in a register rather than by a third-Friday rule, and the day bounds are provisional pending global evidence, since this precedent governs one dense national market and restricts eligibility to contracts listed on that market's exchanges; the options reference security is constrained to the same economic claim in the canonical equity currency; rates are matched to the option's currency rather than drawn from one sovereign curve; and UAVI publishes once daily rather than intraday.

**Reject:** the pull-forward allowance in both its live and back-tested forms, which UAVI declines in favour of strict end-of-day validity as a deliberate Urdais modification, for reasons set out in [Missing and Stale Variance](#docs-missing-and-stale-variance); the admission of options on any listed share-class line; the substitution of a foreign-currency representation for the home ordinary claim; and the continued use of adjusted option classes, which UAVI excludes pending unadjusted series.

**Retrieval note, recorded precisely.** The document above was retrieved on 12 September 2026 as an Internet Archive capture, dated 30 September 2025, of the publisher's canonical URL, and read in full; the quoted rules, formulas, and page numbers are from that document. The publisher's live URL refused every direct route attempted on the same date, returning HTTP 403 to plain requests, to a browser-based fetch, to headless and headed browser navigation with an established session, and to navigation from the provider's own linking page; the archive holds a later capture, from February 2026, which recorded only that same refusal page. A newer edition than November 2024 may therefore exist and was not inspected. Two protections follow: every rule above is attributed to the November 2024 edition rather than to "the current methodology", and no rule in this methodology depends on this precedent, since UAVI's strict no-carry rule is justified on its own publication model. The current edition must be obtained and this entry re-verified before production approval.

### Cboe, Cboe S&P 500 Constituent Volatility Index public descriptions

The provider's [Dispersion Index product page](https://www.cboe.com/us/indices/dispersion), retrieved 12 September 2026, states that the constituent volatility index "measures the market cap weighted 30-day implied volatility of a basket of S&P 500 constituent stocks", that "for each eligible S&P 500 constituent, a VIX like calculation is performed, and the results are then weighted by their market cap", and that "these market cap weighted equity variance calculations are summed and then converted to a final volatility value". The provider's 2024 launch announcement describes the same construction, states that the index "is a direct component in the calculation of the Cboe S&P 500 Dispersion Index", and gave an expected first publication date of 4 November; it is served from an investor-relations host that challenges automated clients, so it is recorded here as corroboration of the product page rather than as an independently citable rule source.

**Adopt:** nothing additional; the rules come from the methodology document above. **Modify:** nothing. **Reject:** nothing; these are descriptions rather than rules. They are recorded because the public wording, that constituent variance calculations "are summed and then converted to a final volatility value", matches the printed formula in the methodology and therefore corroborates reading that formula as a weighted root mean square rather than the geometric average the methodology's own prose label suggests.

### Listed equity option contract specifications, by venue

Eurex publishes contract specifications per underlying. Those for [ABB](https://www.eurex.com/ex-en/markets/equ/equ-opt/options/ABB-4023352), retrieved 12 September 2026, state a contract size of one hundred, American-style exercise "until the end of the Post-Trading Full Period (20:00 CET) on any trading day during the lifetime of the option", physical delivery of the underlying shares two exchange days after exercise, a last trading day of "the third Friday of each expiration month, if this is an exchange day; otherwise, the exchange day immediately preceding that day", quotation in the underlying's currency, and daily settlement prices established with a binomial model that accounts for dividend expectations and interest rates. Eurex's equity option product groups are not uniform: certain groups are European-style, exercisable only on the last trading day, while others, including this one, are American-style.

Cboe's [Equity Options Product Specifications](https://www.cboe.com/exchange-traded-stock/equity-options-spec/) page is the corresponding venue document for U.S. single-name options. It enumerates as separate specified terms the underlying and unit of trade, strike price intervals, strike prices, premium quotation, expiration date, expiration months, exercise style, settlement of option exercise, last trading day, and position and exercise limits.

**Verification limitation, stated rather than glossed.** The Cboe page's individual term values are loaded on interaction and were not present in the retrieved document, so this draft records which terms that venue specifies but does not restate their values. No UAVI rule depends on those values; the rule below depends only on the terms being venue-specified. Before production the values for every registered venue must be read from its specification and recorded in the options-venue register.

**Adopt:** the requirement that exercise style, settlement style, multiplier, deliverable, quotation currency, last trading day, and the exact expiration or settlement timestamp be read from each venue's own contract specification and recorded per venue and series. **Modify:** nothing; these are facts about venues, not rules to import. **Reject:** any global assumption that a listed option represents one hundred shares, expires on a third Friday, settles at a common hour, or shares an exercise style with contracts on another venue. The Eurex evidence that exercise style varies between product groups on a single venue, and that the expiration day falls back to the preceding exchange day, is the direct justification for defining standard expirations and settlement timestamps in a per-venue register rather than by a global calendar convention, and for recording exercise style as a diagnostic on every contributing strip.

### Cboe, American and European-Style Theoretical Options Calculation Methodology

The [theoretical options calculation methodology](https://cdn.cboe.com/api/global/us_indices/governance/Cboe_American_Style_Options_Implied_Volatility_Calculations_Methodology.pdf), last revised 30 June 2026, sets out how the same provider computes implied volatility when the contracts are American-style. For **listed American-style options on stocks and exchange-traded products** it calculates implied volatility with the **Cox-Ross-Rubinstein binomial options pricing model**, solving for the volatility at which the model price matches the observed price within a tolerance, using discrete dividends and a rate derived from constant maturity Treasury yields interpolated by cubic spline to the expiration date. The discrete dividends are **forecasts**, produced by a hybrid analyst and algorithm process that inspects dividend history, incorporates changes in issued share capital, identifies payment patterns, and projects individual forward amounts and dates two fiscal years ahead, with analysts reviewing forecast accuracy. For **listed European-style index options** the same document instead derives an implied discount factor and forward price from put-call parity across strikes near the money and calculates implied volatility under Black-Scholes. Option quotes are sourced from the consolidated national best bid and offer at fixed afternoon times.

**Adopt:** as the benchmark construction against which UAVI's quote-strip estimator is to be compared in validation, and as direct institutional evidence that this provider treats American-style single-name contracts as requiring different machinery from European-style index contracts, which is why UAVI states the American-exercise limitation explicitly rather than assuming the index-option case carries over. **Modify:** nothing is imported; UAVI's rates are currency-matched rather than Treasury-derived, and its quote snapshot is per venue at end of day. **Reject for V1:** using a modelled construction as UAVI's production estimator. Doing so would make each constituent variance depend on a proprietary dividend forecast extending years ahead, on a chosen pricing model, and on a rate curve, replacing a measure reproducible from quotes with one that is not. The forecast dependence visible in this document is the specific reason Path B is deferred rather than adopted; see [Options Contract Eligibility](#docs-options-contract-eligibility).

### The Options Clearing Corporation, contract adjustment framework

The clearing organization's adjustment provisions, currently in By-Laws Article VI Sections 11 and 11A with a proposed consolidation into a new Rules chapter under review by the securities regulator, provide that on a stock dividend, stock split, reverse split, rights offering, distribution, reorganization, recapitalization, reclassification, or similar event affecting an underlying security, the number of contracts, the unit of trading, the exercise price, and the underlying security may be adjusted, with complex events such as contested mergers, partial tenders, and spin-offs decided by an adjustment panel drawn from the listing exchanges. The [investor education materials](https://www.optionseducation.org/referencelibrary/faq/splits-mergers-spinoffs-bankruptcies) the organization operates, retrieved 12 September 2026, illustrate the outcomes: a two-for-one split halving the strike and doubling contracts; a reverse split leaving strike, contract count, and premium multiplier unchanged while changing the deliverable to a reduced share count; a spin-off producing a deliverable of shares in both companies; a cash merger producing a fixed cash deliverable with trading ordinarily ceasing; and adjusted series carrying a modified symbol, since "for any adjusted option there will be a numeral following the letters of the option symbol". The regulatory filings recording the proposed consolidation were read for the framework's location and the panel's role; the by-laws text itself was not retrieved, and no UAVI rule depends on its specific wording.

**Adopt:** the principle that after such an event a listed series may carry a non-standard deliverable, and the requirement that UAVI read the deliverable and adjustment state from contract reference data rather than infer it. **Modify:** nothing. **Reject:** using adjusted contracts in the variance calculation. UAVI excludes them and, where that leaves a strip unfillable, excludes the constituent, accepting a coverage cost in exchange for never computing a variance from a strip whose contracts reference different economic quantities. The specific distribution thresholds that trigger an adjustment are not relied upon by any UAVI rule and are not restated here.
