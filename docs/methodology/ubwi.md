# Urdais Bitcoin Wealth Index (UBWI)

**Version 1.0.0, 15 September 2026.** Status: approved for production. Prepared under the [Urdais methodology framework](/docs/methodology). UBWI is an **estimate calibrated to observed economies, not a census of world wealth**: roughly two fifths of its denominator is a disclosed, versioned model, and every surface carrying the value says so. This version defines the production construction and the publication gate. **No UBWI value is published as of this version's effective date**, because the gate refuses the current denominator on its imputed-share ceiling; the gate is not relaxed to produce a number.

## Purpose and Scope

UBWI answers one question and no other.

> **What share of all presently existing global wealth is represented by Bitcoin?**

$$\text{UBWI} = \frac{\text{Bitcoin Market Capitalization}}{\text{Total Global Wealth}} \times 100$$

The published statistic is **a percentage of Total Global Wealth**. It is not an index level, carries no base date and no base value, and is never expressed in points. Any presentation of UBWI as a points series is wrong and must be corrected.

## What UBWI Is Not

UBWI is not a measure of Bitcoin holder concentration, address distribution, ownership dispersion, or wealth inequality among holders. It is not Bitcoin's share of money, of monetary aggregates, or of any "investable assets" universe. It is not a valuation model, a fair-value estimate, or a forecast. Each of those is a different economic object; none of them may be published under this name.

## The Numerator: Bitcoin Market Capitalization

### Definition

The Bitcoin market capitalization is **issued Bitcoin supply multiplied by a reference price in United States dollars**, both observed at a single instant.

$$\text{BTC market cap} = S_t \times P_t$$

### Supply

$S_t$ is **the quantity of bitcoin issued on the Bitcoin blockchain as of the best block known at time $t$**, expressed in BTC to eight decimal places, together with the block height it was taken at. The block height is recorded on every observation and is the reproducibility key: a supply figure without its height cannot be checked.

Three supply constructions circulate and they disagree:

- the **nominal subsidy schedule**, the sum over blocks of the scheduled subsidy;
- **claimed issuance**, the sum of amounts actually taken in coinbase outputs, which is lower wherever a miner under-claimed;
- **third-party "circulating supply"**, republished by market-data vendors from undisclosed constructions.

UBWI uses **claimed issuance**. The observed dispersion between published sources is about two parts per million, which is immaterial at the precision UBWI publishes, but the definition is fixed anyway so that a source change cannot silently move the series.

### Lost coins

**No lost-coin adjustment is made.** Supply is used unadjusted.

This is a decision, not an oversight. Published estimates of lost Bitcoin span roughly 2.3 million to 5.6 million BTC — a range wider than a sixth of supply — and every one of them reduces to a choice of dormancy threshold (five years, seven years, ten years, or "inactive since July 2010") for which no source states a derivation. Dormant coins are not provably lost: fork and airdrop events have reawakened long-dormant outputs. The only deterministic component, provably unspendable output (unclaimed coinbase, burn addresses, `OP_RETURN`), is small enough to be immaterial here and is not available under a redistributable licence.

A free-float or lost-coin-adjusted numerator would therefore embed an unfalsifiable assumption in a series whose whole purpose is to be inspectable. If a lost-coin estimate ever acquires a documented, deterministic, scheduled and reproducible construction, admitting it becomes a versioned methodology change and does not restate history.

### Price

$P_t$ is **the median of the last-traded United States dollar price for bitcoin across at least three independent spot venues, retrieved within a sixty-second window**. The venue set is named in the specification, each venue's price and retrieval timestamp are retained, and the median is taken across venues, not across time.

Three properties matter. The median is robust to a single venue printing a stale or erroneous quote. An odd venue count avoids an interpolation convention. And the whole construction is Urdais's own: it depends on no vendor's undisclosed weighting and on no vendor's redistribution permission.

A **directly published market-capitalization series is not used.** The surveyed vendors either do not disclose how their price is formed, or forbid the use Urdais would make of it, or both; one publishes a reproducible construction under a non-commercial licence. Where a vendor series is retained, it is retained as a comparison diagnostic and never as the numerator.

If fewer than three venues return a price within the window, the numerator is **withheld** and no UBWI value is computed for that instant. Urdais does not fall back to two venues, to a single venue, or to a vendor aggregate.

### Update frequency

The numerator is observed at least daily and may be observed more often. Each observation carries its own instant. The numerator is the only part of UBWI that moves between denominator vintages.

## The Denominator: Total Global Wealth

**"Total Global Wealth" is the formal term.** "Global wealth supply" is not used anywhere in Urdais.

### Definition

> **Total Global Wealth is the consolidated net worth of the world economy: the market value of all non-financial assets owned by resident institutional units of every economy, plus monetary gold bullion, plus crypto assets that carry no corresponding liability, less nothing further — because at world scale every remaining financial asset is another unit's liability and the two cancel.**

This is the national-accounts definition of national wealth, summed to the world. The 2008 System of National Accounts states it at paragraph 13.4:

> "Net worth is defined as the value of all the assets owned by an institutional unit or sector less the value of all its outstanding liabilities. For the economy as a whole, the balance sheet shows the sum of non-financial assets and net claims on the rest of the world. This sum is often referred to as national wealth."

The 2025 SNA carries the same sentence at paragraph 14.4, with "national wealth or national net worth".

Summing that identity over every economy removes the second term, because one economy's claim on the rest of the world is another economy's liability to it. What survives is the world's stock of non-financial assets. The World Inequality Database publishes exactly this identity for its national wealth series: *"[Market-value national wealth] = [National non-financial assets] + [Net foreign assets]"*.

### The anti-double-counting rule

**Asset-class market values are never summed.** This rule is the reason the definition is written the way it is, and it is stated here so that any future component list can be checked against it.

Four specific prohibitions follow.

The consequence is large, not marginal. A published global balance sheet for end-2024 puts the world's gross assets at $1.7 quadrillion and its consolidated net worth at $600 trillion: **consolidation removes a factor of about 2.8**. A denominator built by addition would be wrong by that order.

**Debt claims are not wealth.** A bond, a loan, a deposit and a banknote are assets of the holder and liabilities of the issuer. Adding the world's debt securities outstanding to the world's real assets counts the financed asset twice. Global broad money is a liability of the banking system and is excluded for the same reason.

**Corporate equity is not added to corporate assets.** A listed company's market capitalization is a claim on the same factories, inventory, cash and intellectual property that appear in the non-financial asset stock. Counting both duplicates the company. In the market-value national-wealth construction the duplication is resolved in the other direction from the one people expect: corporate net worth is consolidated into the sectors that hold the equity, so household and government wealth carry the market value of the businesses, and the businesses are not counted again.

**Household-net-worth frameworks and national-balance-sheet frameworks are not mixed.** A household-sector measure excludes government assets and government debt by construction; a national measure includes both. Adding a household total to a government total taken from a different framework produces neither, and adding either to an asset-class aggregate produces a number with no accounting meaning. A denominator is taken from one framework at a time.

**A component that overlaps another component is not additive.** Global real-estate market value, produced capital, natural capital and agricultural land all overlap each other under different valuation bases. Where UBWI displays such figures they are displayed as **cross-checks, explicitly marked non-additive**, and they never enter the denominator sum.

### Inclusions

Within the definition, and therefore inside the denominator whenever the chosen source measures them:

- **residential and commercial real estate**, at market value, including the land beneath it;
- **produced capital**: machinery, equipment, structures, infrastructure, inventories, and intellectual property products recognised as assets;
- **land, subsoil assets, timber, fisheries and other natural capital** within the SNA asset boundary, that is, natural resources over which ownership rights are enforced and from which economic benefits accrue;
- **valuables**: precious metals held as a store of value, gemstones, art and antiques. Monetary gold bullion is included as the single financial asset with no counterpart liability; non-monetary gold and silver are valuables;
- **businesses, public and private**, through the consolidated treatment above, never as an equity market capitalization added on top of the assets;
- **crypto assets without a corresponding liability**, which the 2025 SNA places inside the asset boundary as non-produced non-financial assets (paragraph 4.117), on the reasoning that miners "are considered to be producers of validation services, not as producers of the assets themselves". Bitcoin is such an asset.

### Exclusions

**Human capital is excluded.** It is the discounted value of expected future labour income, not a presently held asset, and its valuation is dominated by assumptions about discount rates, earnings growth and horizons. The SNA excludes it from the asset boundary for the same reason: *"Human capital is also not treated by the SNA/BPM as an asset in the integrated framework of national accounts"* (2025 SNA 4.121). Where a source publishes a comprehensive-wealth total that includes human capital, the human-capital component is stripped out and the stripping is shown.

Also excluded:

- **consumer durables**, which the SNA holds outside the asset boundary and reports only as a memorandum item;
- **gross financial claims**, for the reason given above;
- **natural resources of no economic value**, and environmental assets over which no ownership rights are enforced;
- **contingent and constructive liabilities**, and unfunded state pension entitlements, consistently with the SNA treatment. Funded pension assets are included through the sector that holds them.

### Government and public assets

Government assets and government liabilities are **inside** the denominator. Total Global Wealth is a national measure, not a private one: public infrastructure, public land and state-owned enterprise capital are presently existing wealth, and government debt is a liability of the public sector and an asset of whoever holds it, so it cancels globally exactly as private debt does. Net public wealth, positive or negative, is published as a denominator component.

This is the principal reason a household-net-worth source cannot be used unmodified as the denominator: it excludes state assets and state debts by design.

### Bitcoin inside its own denominator

Because the 2025 SNA places Bitcoin inside the asset boundary, Bitcoin is part of Total Global Wealth, and UBWI is a genuine share rather than a ratio to something Bitcoin sits outside of. The denominator is therefore

$$\text{TGW}_t = W_v + \text{BTC market cap}_t$$

where $W_v$ is the published world-wealth vintage $v$, which — because every currently published vintage predates national implementation of the 2025 SNA — contains no crypto assets. UBWI is bounded in $[0, 100]$ by construction.

Adding Bitcoin lowers UBWI by about a quarter of one percent of its own value at present magnitudes. The adjustment is immaterial and is made anyway, because the alternative is a statistic that claims to be a share of a whole that excludes its own numerator.

**Crypto assets other than Bitcoin are not added to the denominator.** They belong there under the same paragraph, they are not measured here, and their omission biases UBWI upward. This is a named limitation, quantified with every published value once a redistributable measure of non-Bitcoin crypto capitalization exists.

## Production Denominator Construction

**Total Global Wealth is constructed, not read.** No compiler publishes a world national-wealth
total at market value and market exchange rates under terms that permit redistribution, and the
research that established this is recorded in the Phase 1 to Phase 2C source studies. UBWI therefore
builds its denominator as

$$\text{Total Global Wealth} = \text{Observed Rights-Cleared Wealth} + \text{Modeled Residual Wealth} + \text{Bitcoin Market Capitalization}$$

### Observed wealth

The observed leg is the sum of national balance sheets for the economies Urdais can both observe and
publish. Each component carries its compiler's own series identifier, its own reference date, its own
currency and FX conversion, its land and consumer-durables treatment, and its rights state. Components
are summed, never averaged, and no component is bridged, interpolated or rolled forward.

**Observed does not mean harmonised.** Two harmonisation layers over the same national compiler can
disagree materially — France's net foreign position differs by EUR 379 bn between the OECD and
Eurostat — so a component records the interface it actually came from, and a disagreeing route is
retained as superseded rather than silently discarded.

### Modeled residual wealth, and why modelling is structurally necessary

The economies Urdais does not observe are not a research backlog. **They are economies that do not
compile the thing being measured.** China does not publish a national balance sheet with a
market-valued net-worth total; neither does India. No permission, retrieval or budget creates a
statistic a national statistical office does not produce. Phase 2C measured the feasible frontier —
the rights-cleared coverage reachable from balance sheets that exist today — at **55.72 % of world
GDP**, and a counterfactual ceiling of 62.93 % that would require nineteen further statistical
offices to begin valuing land.

A denominator that included only observed economies would not be world wealth; it would be the wealth
of the rich world, presented as the world's. Modelling the remainder is therefore the honest option,
provided the model is versioned, disclosed, and never called an observation.

**The rule.** Unobserved world GDP at market exchange rates is valued at the observed set's own
wealth-to-GDP ratio, scaled by a calibration factor measuring how much poorer per unit of output the
unobserved world is in the one cross section where both are measured comparably — the World Bank's
Changing Wealth of Nations, 2020:

$$\text{Modeled Residual Wealth} = k \cdot R \cdot \text{Unobserved World GDP}$$

where $R$ is the observed-set wealth-to-GDP ratio computed from the components themselves and $k$ is
the CWON tail calibration. The rule is deliberately simple. Phase 2A backtested regional and
income-group refinements and found they do not reliably beat a single world ratio — regional grouping
is worse at six of eleven cut-points — so the model does not invite elaborations that add opacity
without accuracy.

**The imputation rule is versioned reference data, not application code**, so a value computed under
one rule stays explicable after the rule changes. History is never restated.

### The modelled share is disclosed, always

The observed and modelled shares of Total Global Wealth are published beside the value, in those
words. **Modelled wealth is never described as observed**, and the headline is never shown without
its modelled share and its sensitivity range.

## Accounting Framework

Four candidate frameworks were compared. The comparison is recorded in the Phase 1 source study; the conclusion is stated here because it determines everything above.

**National balance sheets on the SNA basis are the chosen framework.** They are the only framework in which the consolidation is an accounting identity rather than an adjustment: the double-counting is removed by construction, not by netting one estimate against another. They cover every sector, so government wealth is included. They value assets at market where market prices exist. And the residual they leave — the world's measured net foreign position, which should be zero and is not — is a published, quantified statistical discrepancy rather than a hidden one.

**Household net worth** is rejected as the primary framework. It is well measured and internally consistent, and it is the basis of the most widely cited global wealth figures, but it excludes government assets and debts by definition and so cannot answer a question about *all* presently existing wealth. It is retained as a cross-check.

**Comprehensive wealth frameworks** — produced capital plus natural capital plus human capital plus net foreign assets — are rejected as the primary framework for two reasons: human capital dominates them, so the measure is mostly the thing UBWI must exclude; and their produced capital is a perpetual-inventory replacement cost and their natural capital a discounted resource rent, neither of which is a market value. They are retained as a structural cross-check on composition, and as a floor.

**Asset-class aggregation** — adding real estate to equities to bonds to gold — is rejected outright. It is the double-counting error the anti-double-counting rule exists to prevent, and no weighting of the components repairs it.

### Where unavoidable uncertainty remains

Four sources of uncertainty survive the framework choice and cannot be assumed away.

**The world does not balance.** Summing every economy's foreign assets and foreign liabilities should give zero. Measured, it gives a negative number on the order of one percent of world wealth. That residual is the accumulated effect of unrecorded cross-border positions, offshore holdings, and valuation and coverage differences between national compilers.

**Coverage is incomplete and uneven.** No compiler publishes market-value national balance sheets for every economy. The economies that do publish them are disproportionately high income, and the rest are modelled.

**Valuation basis is not uniform.** Dwellings and land are marked to market where a property price index exists and are otherwise modelled. Unlisted business equity is valued by analogy to listed equity in some national accounts and at book value in others. Natural capital is a discounted rent, not a price.

**Purchasing-power and market exchange rates give materially different totals.** The conversion applied to reach a market-exchange-rate denominator is itself a source of error, and its direction is known: see the vintage section.

## Foreign Exchange Policy

**End-period FX for end-period stocks.** A national balance sheet is a stock at an instant, and it is
converted at the last quoted reference-rate fixing at or before that component's own reference date.
Phase 2B measured the error from the wrong basis at up to **6.6 % for a single country**, which is
larger than several economies' entire contribution to the denominator.

**The fixing date is per component, not per vintage.** Australia's national balance sheet is as at
30 June; every other economy in the observed set is a calendar year-end. A single harmonised fixing
date would either treat a 30 June stock as a 31 December stock or select the wrong fixing for it.

**One FX source, rights-cleared, recorded per component.** Production V1 converts every
non-USD component at the European Central Bank's euro foreign exchange reference rates, whose terms
permit free use with accurate reproduction and citation of the ECB, and which require that any
modification be stated explicitly. Converting a stock to USD is such a modification and is disclosed
on every component's FX lineage. A source is never switched without recording the change.

## Denominator Vintage Policy

Comprehensive world-wealth estimates are annual, refer to a year-end, and are published six to eighteen months after the period they describe. Bitcoin is continuous. UBWI must therefore hold three timestamps apart and publish all three:

- **the Bitcoin observation timestamp**, the instant the numerator was observed;
- **the denominator vintage**, identified by its reference date, its publishing source, and its publication date;
- **the index calculation timestamp**, the instant UBWI was computed.

**Between denominator updates the denominator is held fixed at the latest published vintage.** Urdais does not interpolate a denominator, nowcast it, extrapolate it by an asset-price proxy, or roll it forward by a growth assumption. UBWI between vintages moves only with Bitcoin. This is the correct behaviour for a share of a stock that is genuinely measured once a year: a denominator that moved daily would be a model, and the product would then be reporting the model rather than the measurement.

**A new vintage takes effect from its own publication date forward.** Values already published are not restated when a vintage is superseded, because they were correct statements of the best measurement available when they were made. Errors are corrected under the revision policy; superseded vintages are not errors.

**Percentage change is withheld across a vintage boundary.** A vintage change moves the denominator by several percent in one step, and a change computed across that step would describe the arrival of a statistical publication rather than any movement in Bitcoin or in wealth. Change is therefore computed only between values sharing the same denominator vintage and the same methodology version, and is withheld across either boundary rather than shown as a jump or as zero.

## Major-Economy Treatment

**The requirement is disclosure, not observation.** An earlier proposal required every economy above
3 % of world GDP to be observed or the index would not publish. That is a permanent block on China,
which does not compile the statistic, and a rule that can never be satisfied is a decision never to
publish taken silently rather than a standard.

Instead: **every economy above the disclosure threshold that UBWI does not observe is named on the
published surface, with its GDP weight and the reason it is unobserved**, and the published
sensitivity range spans a plausible range of its wealth-to-GDP ratio. Phase 2C measured the China
band at 0.2440 %–0.2927 % — roughly 17 % of the value from one economy's assumed ratio — which is a
far more informative disclosure than any coverage percentage.

## Sensitivity Methodology

**The published range is not a confidence interval.** No distribution over world wealth is available
and none is assumed. The range is the span of four named, reproducible assumptions about the single
parameter that dominates the uncertainty — the wealth-to-GDP ratio of the world UBWI cannot observe:

- **Unobserved world as wealthy per unit GDP as the observed set**: tail ratio $R$.
- **Central, CWON-2020 calibrated tail**: tail ratio $k \cdot R$. This is the published value.
- **Low**: tail ratio $0.60 \cdot R$.
- **High**: tail ratio $1.15 \cdot R$.

Each scenario is stored with its ratio, its imputed subtotal, its Total Global Wealth and its
resulting UBWI, so the range is reproducible from the versioned assumptions alone. The central
scenario is the published value; the others are diagnostics and **an alternative denominator never
becomes a second UBWI**.

The range is published **with** the value, never in an appendix. Numerator uncertainty is not in it,
because it does not belong there: venue dispersion at the observation instant is of the order of one
basis point, three orders of magnitude smaller than the denominator's.

## Historical Reconstruction

**UBWI may be reconstructed annually, at year-end, from 31 December 2013.**

The binding constraint is the numerator, not the denominator. Bitcoin supply is reconstructible from the chain to the genesis block, and world-wealth vintages exist annually from the mid-1990s. But before 2013, Bitcoin price discovery was concentrated on a single venue that later failed, and a three-venue median cannot be formed from independently retrievable surviving sources. A price that cannot be formed under the methodology's own rule is not a price the methodology may use.

Points for 2010 to 2012 are computable from a single-venue price and are **not published**, because doing so would present a different construction under the same name. If a documented, retrievable multi-venue reconstruction of that era is established, admitting it is a versioned change.

**Nothing is backfilled.** No point exists for a year in which either the numerator rule or a denominator vintage cannot be satisfied. A gap is shown as a gap.

**History is assembled vintage by vintage.** Each historical point uses the world-wealth vintage in force for its own reference date, not the latest vintage applied backwards. Applying a current denominator to a past numerator would produce a series that never existed.

## Source Hierarchy

In descending order of preference for the denominator:

1. **A national-accounts compiler's own published world or multi-economy balance-sheet aggregate**, at market value, in United States dollars at market exchange rates. No such publication is known to exist.
2. **An open, documented, redistributable multi-economy database implementing the SNA national-wealth identity**, from which a world aggregate is constructed under a stated rule. This is the V1 basis.
3. **An official statistical agency, central bank, or international organisation dataset** covering a defined subset of economies, used for cross-checking and for composition.
4. **A published research estimate from a credible institution**, used as a cross-check only, never as the denominator, and never where its terms forbid the use.
5. **A commercial market-research estimate of a single asset class**, used only as a non-additive cross-check and only with attribution.

A source enters the denominator only with a permitted and reproducible collection path and permitted data use, recorded as a permission basis, exactly as for every other Urdais output. Where a source requires attribution, the attribution is carried on every published surface.

For the numerator the hierarchy is shorter: **public spot venue tickers read directly by Urdais** are preferred to any vendor aggregate, because the construction is then Urdais's own and carries no redistribution dependency.

## Published Surface

One value. There are no UBWI variants.

**Headline**: the UBWI percentage; the Bitcoin market capitalization in United States dollars; Total Global Wealth in United States dollars; the denominator vintage with its reference date, source and publication date; the Bitcoin observation timestamp; the index calculation timestamp; the status; and the methodology version.

**Beneath the headline, the denominator components**, so that a reader can see what "global wealth" means here. Two panels, and they are never merged:

- **Additive components**, which sum to Total Global Wealth: the sector decomposition of world net worth — net personal wealth, net non-profit wealth, net public wealth — plus the Bitcoin adjustment, plus the unexplained residual, shown rather than absorbed.
- **Non-additive cross-checks**, each with its own source, reference date and valuation basis, and each labelled as overlapping: world real-estate market value, produced capital, natural capital, above-ground gold, and any single-asset-class aggregate. This panel carries a standing statement that its rows overlap and must not be added.

**Percentage change** where it is defined, and the reason it is withheld where it is not.

UBWI is displayed as a percentage with four decimal places. It is never displayed as a level, never given a base date, and never charted against index-point series without its unit stated.

## Publication Gates

No UBWI value is published unless **all** of the following hold. The thresholds are configuration
checked against the measured feasible frontier, not literals chosen for how they sound.

- **Every directly observed constituent is rights-cleared.** Required, no exceptions.
- **Modelled share of the wealth denominator**: at most **40 %**.
- **Rights-cleared observed GDP coverage**: at least **52 %**.
- **No silently interpolated national wealth stock.** Required.
- **Vintage age at the calculation date**: at most **4 years**.
- **Vintage dispersion, oldest to newest**: at most **4 years**.
- **Consumer durables included but not stripped**: prohibited.
- **Sensitivity output available.** Required.
- **Methodology version explicit.** Required.
- **Denominator model version explicit.** Required.
- **Source lineage complete**, per component. Required.
- **FX lineage complete and end-period**, per component. Required.
- **Every unobserved economy above 3 % of world GDP disclosed.** Required.

**Why 40 % and 52 %, and why they are the same bound.** A gate must be set against the feasible
frontier. A threshold above it is not a high standard; it is a permanent refusal disguised as one.
Phases 2A and 2B both proposed a 25 % imputed-share ceiling, which requires **68.44 %** observed
coverage; a 35 % ceiling requires **57.31 %**. Both exceed the measured 55.72 % frontier, so either
would have made the index refuse every denominator the global statistical system can produce, forever,
while appearing to encode a quality rule. **≤ 40 % is the tightest satisfiable bound.** The 52 %
coverage floor is the same constraint stated in the other unit and moves with it; it is derived, not
chosen. A configured floor above the stored frontier is itself refused as a configuration error.

**The gate is never relaxed to make a calculation pass.** Where any gate fails, no value is published
and no substitute is shown. The failure is reported with the measured figure against the threshold.

## Update Cadence

**The numerator is re-observed on each production calculation**; it is instantaneous and its timestamp
is load-bearing. **The denominator is re-constructed when a constituent compiler publishes a new
balance sheet**, which is annual for every economy in the observed set except Canada, which publishes
quarterly and is selected by a stored rule: the latest published observation at or before 31 December
of the latest complete calendar year.

Between denominator vintages the denominator is held fixed and UBWI moves only with Bitcoin. Urdais
does not nowcast, interpolate or roll forward a denominator. **Percentage change is withheld across a
vintage or methodology boundary**, and is unavailable entirely until a second real observation exists:
there is no such thing as a change from nothing, and no historical UBWI is fabricated to create one.

## Revisions and Corrections

**A superseded vintage is not a correction.** When a new world-wealth vintage supersedes an earlier one, previously published UBWI values stand; the new vintage governs from its publication date.

**A correction is a new interpretation, never an edit.** Where an input is found to have been wrong — a misread supply figure, a venue price later repudiated, a denominator component mis-stripped — the affected values are superseded by new values carrying the correction reason, and the original values remain retrievable. Urdais does not silently restate a published number.

**A methodology change never rewrites history.** Values dated before a version's effective date remain those computed under the version in force at the time. Percentage change is withheld across the boundary.

## Known Limitations

Stated with every published value.

**The denominator is materially narrower than "all wealth".** It excludes human capital by design, and it excludes, by measurement failure rather than by design: crypto assets other than Bitcoin; collectibles and art outside what national compilers capture as valuables; informally held and undocumented assets, which are a larger share of wealth in lower-income economies; and the going-concern premium that markets place on businesses beyond the assets on their balance sheets, which the SNA recognises as an asset only when evidenced by a sale.

**The denominator is stale by construction.** Its reference date is a year-end one to two years before the Bitcoin observation. UBWI is therefore a ratio between a current numerator and a lagged denominator, and it is labelled as one.

**Coverage is uneven and partly modelled**, and the world's measured net foreign position does not net to zero.

**The exchange-rate conversion has a known direction of error.** Where a purchasing-power-denominated wealth aggregate is converted to market exchange rates using an economy-weighted factor, the conversion over-deflates, because wealth is more concentrated in high-income economies than income is. The resulting denominator is a lower bound and the resulting UBWI an upper bound.

**Uncertainty in the denominator is larger than any plausible uncertainty in the numerator.** The numerator's venue dispersion is of the order of a basis point. Reasonable denominator choices move UBWI by a factor approaching two. Any presentation that implies four-decimal precision in the underlying quantity, rather than in the arithmetic, is misleading, and the published sensitivity range exists to prevent that reading. The honest form of the answer is a range, not a point.

## Open Questions

Resolved since 0.1.0-draft: the denominator source-rights blocker (every constituent is now cleared
against a retained, hashed terms artifact); which world aggregate to use (none exists, so UBWI
constructs one); and the exchange-rate conversion (end-period reference rates per component, replacing
the purchasing-power conversion and its known bias).

Open, and each is recorded rather than worked around.

1. **The imputed-share ceiling is not met.** At the Production V1 observed set the modelled share is
   above 40 %, and the gate refuses publication. Closing it needs roughly one further percentage point
   of rights-cleared observed GDP coverage from balance sheets that include land. This is a coverage
   problem, not a rights problem.
2. **Six near-frontier economies** — Norway, Finland, Hungary, Israel, Latvia, Portugal — are worth
   1.73 pp of coverage between the achieved figure and the 55.72 % frontier. Finland entered this
   version; the others are each blocked on a matched net-foreign-position year or, for Norway, on a
   non-produced asset series that stops in 2014. Admitting one without its land valuation would mean
   treating fixed capital stock as national net wealth, which this methodology prohibits.
3. **The composition-sensitivity band** is approximately 16 pp against a proposed ≤ 15 pp target,
   reachable at roughly 58–60 % coverage.
4. **Numerator source terms have not been reviewed.** The venue tickers and the chain-supply endpoint
   are read directly, which removes the licensing dependency a vendor aggregate would carry, but no
   terms artifact has been retrieved and reviewed for any of them. They are recorded as `not_reviewed`
   rather than assumed permissive.
5. **An operational Bank of Korea ECOS API key** for production retrieval volumes. Korea's publication
   rights are cleared and its value is manually verified against the first-party table; only the
   automated collection path is pending. These are separate questions and only the second is open.
6. **Non-Bitcoin crypto assets in the denominator**, required by the asset boundary and still
   unmeasured under a redistributable licence.
7. **The venue set for the numerator median**, and the rule for adding or removing a venue without
   moving the series.

## Relationship to the Urdais Product Surface

UBWI appears in the Urdais market catalog as an index symbol. Its unit is a percentage of Total Global Wealth. Any existing representation of UBWI as a points series with a base value is placeholder data and does not reflect this methodology.

## Methodology Version

**1.0.0, 15 September 2026.** Status: approved for production, effective 15 September 2026. The
residual denominator model carries its own version, **1.0.0**, and a published value is immutable
under both: a correction is a new, superseding publication, never an edit.

## Version History

**1.0.0, 15 September 2026**: first production methodology. Defines Total Global Wealth as a
constructed hybrid of directly observed, rights-cleared national balance sheets and a versioned
modelled residual for economies that do not compile a comparable balance sheet, and states why that
modelling is structurally necessary rather than provisional. Adds the production denominator
construction, the residual model and its CWON-2020 calibration, the four-scenario sensitivity
methodology, the end-period per-component FX policy replacing the purchasing-power conversion, the
major-economy disclosure rule replacing the unsatisfiable major-economy observation rule, the concrete
publication gate with thresholds checked against a measured feasible frontier, the vintage age and
dispersion bounds, and the update cadence. Records that the Bank of Korea component is manually
verified and its automated retrieval pending, and that numerator source terms are unreviewed. Applies
the vintage rule, which removes New Zealand (2017) and Russia (2019) from the observed set rather than
bridging them. **No value is published under this version at its effective date**: the modelled share
is above the 40 % ceiling and the gate refuses.

**0.1.0-draft, 14 September 2026**: initial methodology. Fixed the primary question and the percentage
unit; defined the numerator as claimed issued supply times a three-venue median spot price with no
lost-coin adjustment; defined Total Global Wealth as consolidated world net worth on the SNA
national-wealth identity, excluding human capital and consumer durables, including government assets
and liabilities, natural capital, valuables and monetary gold, and including crypto assets without a
corresponding liability; stated the anti-double-counting rule and its four prohibitions; selected
national balance sheets over household net worth, comprehensive wealth and asset-class aggregation;
placed Bitcoin inside its own denominator; fixed the vintage policy, the three timestamps and the
withholding of change across a vintage boundary; set historical reconstruction at 31 December 2013 on
a numerator constraint; and recorded the source-rights blocker that then prevented publication.
