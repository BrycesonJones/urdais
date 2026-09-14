# Urdais Bitcoin Wealth Index (UBWI)

**Status: proposed methodology, version 0.1.0-draft. Not launched.** Prepared 14 September 2026 under the [Urdais methodology framework](/docs/methodology). No production value has been published under this document, and none may be: the denominator has no source that is simultaneously global, current, market-valued and cleared for redistribution. A value computed under this document today is a **labelled candidate**, never a publication.

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

## Denominator Vintage Policy

Comprehensive world-wealth estimates are annual, refer to a year-end, and are published six to eighteen months after the period they describe. Bitcoin is continuous. UBWI must therefore hold three timestamps apart and publish all three:

- **the Bitcoin observation timestamp**, the instant the numerator was observed;
- **the denominator vintage**, identified by its reference date, its publishing source, and its publication date;
- **the index calculation timestamp**, the instant UBWI was computed.

**Between denominator updates the denominator is held fixed at the latest published vintage.** Urdais does not interpolate a denominator, nowcast it, extrapolate it by an asset-price proxy, or roll it forward by a growth assumption. UBWI between vintages moves only with Bitcoin. This is the correct behaviour for a share of a stock that is genuinely measured once a year: a denominator that moved daily would be a model, and the product would then be reporting the model rather than the measurement.

**A new vintage takes effect from its own publication date forward.** Values already published are not restated when a vintage is superseded, because they were correct statements of the best measurement available when they were made. Errors are corrected under the revision policy; superseded vintages are not errors.

**Percentage change is withheld across a vintage boundary.** A vintage change moves the denominator by several percent in one step, and a change computed across that step would describe the arrival of a statistical publication rather than any movement in Bitcoin or in wealth. Change is therefore computed only between values sharing the same denominator vintage and the same methodology version, and is withheld across either boundary rather than shown as a jump or as zero.

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

No UBWI value is published unless all of the following hold:

- an approved version of this methodology, with an effective date;
- a denominator vintage from a source whose terms permit production use and redistribution of the derived value;
- a numerator formed from at least three independent venues within the retrieval window;
- the denominator vintage's own reference date, publication date and coverage recorded;
- the additive component panel reconciling to the denominator total within a stated tolerance, with any residual shown.

Where any gate fails, **no value is published and no substitute is shown**. A previously valid value continues to be displayed with its own original timestamp under the last-known-good rule, and the failure is reported separately.

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

These are unresolved and block launch.

1. **Source rights for the denominator.** Both candidate sources are blocked. The open multi-economy database that implements the identity publishes no licence: its terms-of-use page does not resolve and its repository carries no licence file. The proprietary research report that measures the concept best states that any use of its material without specific permission is strictly prohibited. Until one of the two is cleared in writing, no production value may be published.
2. **Which world aggregate to use, and whether to construct one.** No compiler publishes a world market-value national-wealth total at market exchange rates. Whether Urdais should construct one from country-level balance sheets, and under what coverage rule, is a methodology decision this version does not make.
3. **The purchasing-power to market-exchange-rate conversion.** The V1 conversion is an economy-weighted GDP factor with a known bias. Whether a wealth-weighted conversion is constructible from open data is unresolved.
4. **Whether a second, comprehensive-wealth-based denominator should be published as a declared floor.** The temptation is real and the prohibition on multiple headline variants is also real; if it is published at all it is a diagnostic, not a second UBWI.
5. **Non-Bitcoin crypto assets in the denominator.** Required by the asset boundary, currently unmeasured under a redistributable licence.
6. **The venue set for the numerator median**, and the rule for adding or removing a venue without moving the series.

## Relationship to the Urdais Product Surface

UBWI appears in the Urdais market catalog as an index symbol. Its unit is a percentage of Total Global Wealth. Any existing representation of UBWI as a points series with a base value is placeholder data and does not reflect this methodology.

## Methodology Version

**0.1.0-draft, 14 September 2026.** Status: draft. No production effective date. A draft carries no effective date, and publishing under a draft is prohibited.

## Version History

**0.1.0-draft, 14 September 2026**: initial methodology. Fixes the primary question and the percentage unit; defines the numerator as claimed issued supply times a three-venue median spot price with no lost-coin adjustment; defines Total Global Wealth as consolidated world net worth on the SNA national-wealth identity, excluding human capital and consumer durables, including government assets and liabilities, natural capital, valuables and monetary gold, and including crypto assets without a corresponding liability; states the anti-double-counting rule and its four prohibitions; selects national balance sheets over household net worth, comprehensive wealth and asset-class aggregation, with reasons; places Bitcoin inside its own denominator; fixes the vintage policy, the three timestamps and the withholding of change across a vintage boundary; sets the historical reconstruction start at 31 December 2013 on a numerator constraint; defines the published surface with separate additive and non-additive component panels; and records the source-rights blocker that prevents publication. No production effective date.
