# UBWI Phase 1 Source Study and Candidate Calculation

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. No production value, ingestion contract, schema, or collector is created by this document. Every figure below is evidence about sources; none is a published Urdais value.

This study supports [UBWI 0.1.0-draft](/docs/methodology/ubwi). Its question was whether a denominator exists that can bear the weight of the index's claim: a defensible estimate of presently existing global net wealth rather than a sum of overlapping claims.

## Headline Result

**The accounting framework is settled and the arithmetic is sound. The source layer is not.**

The framework question has a clean answer with an authoritative citation, and it disposes of the double-counting problem by identity rather than by adjustment. The denominator that the framework requires — world net worth at market value, in United States dollars at market exchange rates, current, global, decomposable and redistributable — **is published by nobody**.

Four things follow.

**One.** The best construction Urdais can reproduce and decompose is a two-source derived aggregate, and it is a **lower bound** on the true denominator for a reason with a known sign. It yields a candidate UBWI of **0.2843 %** at a Bitcoin market capitalization of **$1.586 trillion** observed 14 September 2026 at 17:24:20Z. An independent, primary-sourced market-value estimate for a year later gives **0.2637 %**, and the two agree to within 7.9 % on the denominator — which is the strongest single piece of evidence that the framework is sound.

**Two.** Reasonable alternative denominators move UBWI between **0.2637 %** and **0.4727 %** — a factor of 1.79. The numerator's own uncertainty, measured as dispersion across spot venues at one instant, is **1.1 basis points of the price**. All of the uncertainty in UBWI is in the denominator, and the sensitivity range is not decoration.

**Three.** The one dataset that is genuinely global, genuinely open, and structurally decomposable is the World Bank's wealth accounts, and it **cannot be the denominator**, because its valuation basis is replacement cost and discounted resource rent rather than market value. The proof is arithmetic: the world's real estate at market value is **117.8 %** of that dataset's entire non-human wealth total.

**Four.** **The launch blocker is rights, on both viable denominators.** The open database that implements the required concept publishes no licence at all: its terms-of-use page does not resolve and its repository carries no licence file. The proprietary report that measures the concept best states on its copyright page that any use of its material without specific permission is strictly prohibited. Neither is a data problem; both are the same class of blocker that has held other Urdais outputs, a usable source with unestablished or refused rights.

## Method and Evidence Standard

Every figure below was retrieved on 14 September 2026 unless a different retrieval date is stated, from a named source with a URL. Endpoints marked verified were called directly and their responses read. Search results were used only to locate documentation and are never cited as evidence.

Where a figure was computed by Urdais rather than published by the source, it is labelled **own computation** and the inputs are given so the computation can be repeated. Several documents could not be retrieved from this environment; they are recorded as unretrieved and **no figure from them is used**, in either the study or the candidate. One publisher's HTML pages were unreachable while its media-hosted PDFs served correctly on retry, which is noted where it matters because the first conclusion drawn from the failure was wrong.

## Part 1 — The Accounting Framework

### The identity that removes double counting

The 2008 System of National Accounts, chapter 13, paragraph 13.4:

> "Net worth is defined as the value of all the assets owned by an institutional unit or sector less the value of all its outstanding liabilities. For the economy as a whole, the balance sheet shows the sum of non-financial assets and net claims on the rest of the world. This sum is often referred to as national wealth."

The 2025 SNA carries the same sentence at 14.4 with the term extended to "national wealth or national net worth".

Sum that over every economy. The second term is a claim of one economy on another, so across the closed world system it vanishes. What remains is **the world's stock of non-financial assets**. Every bond, loan, deposit, banknote and share has cancelled, because each is an asset to one unit and a liability to another.

This is why a list of asset-class market values cannot be added. It is not that the addition is imprecise; it is that the addition counts the same wealth several times over — the factory once as a factory, again as the equity claim on the company that owns it, and a third time as the bond that financed it.

The World Inequality Database publishes the identity directly as the technical definition of its national wealth series, retrieved from its own metadata file:

> `[Market-value national wealth ] = [National non-financial assets] + [Net foreign assets]`

McKinsey Global Institute states the same thing in plain language in *Out of balance: What's next for growth, wealth, and debt?* (October 2025, p. 8):

> "Globally, net worth, also referred to as wealth, is equal to real assets; all financial assets have a corresponding liability, and thus cancel out and do not count toward global wealth."

> "At the national level, net worth is equal to real assets plus net financial positions with the rest of the world."

**The magnitude of the double counting is worth stating, because it is not a rounding matter.** The same report puts the world's gross balance sheet at end-2024 at "$1.7 quadrillion in total assets, consisting of $620 trillion in real assets, $570 trillion in financial assets outside the financial sector, and $520 trillion within the financial sector", against a consolidated net worth of $600 trillion. **Consolidation removes a factor of 2.8.** Anyone who adds asset-class market values together is, in the limit, publishing the $1.7 quadrillion.

### The two exceptions, and why they are small

**Monetary gold bullion** is the one financial asset with no counterpart liability. The 2025 SNA, paragraph 4.109:

> "The gold bullion component of monetary gold is the only case of a financial asset with no counterpart liability; its external character arises from the historical role of gold in the international financial system."

**Crypto assets without a corresponding liability** are the other, and the 2025 SNA puts them on the non-financial side rather than the financial one. Paragraph 4.117:

> "Non-produced non-financial assets, excluding non-produced natural capital, are of three types; contracts, leases and licences; crypto assets without a corresponding liability designed to act as a medium of exchange; and purchased goodwill and marketing assets. […] Crypto assets without a corresponding liability designed to act as a medium of exchange are considered as non-produced assets, because the miners solving cryptographic puzzles, and (partly) receiving crypto assets in return, are considered to be producers of validation services, not as producers of the assets themselves."

Paragraph 4.82 records their creation as an other change in the volume of assets rather than as production.

**This is consequential for UBWI and not merely pedantic.** Bitcoin is inside the asset boundary of the current international standard. UBWI is therefore a share of a whole that contains its own numerator, and the denominator must be constructed so that it does. No currently published world-wealth vintage contains crypto, because none was compiled under the 2025 SNA, so Bitcoin is added explicitly.

### Human capital, and the SNA's own reason for excluding it

2025 SNA paragraph 4.121:

> "Human capital is also not treated by the SNA/BPM as an asset in the integrated framework of national accounts; see paragraphs 1.77 and 1.78. However, as explained in chapter 34/35, it is encouraged to compile extended accounts on education and training, including experimental estimates of the value of human capital."

Paragraph 4.322 explains why the experimental estimates stay experimental: the net-present-value method requires agreement on which income to use and on forecasts "over quite lengthy periods of time", and the alternative cost method requires assumed service lives, depreciation patterns, and a valuation of unpaid study time. The SNA makes "no firm recommendation […] on the preferred method".

That is the brief's reason for excluding human capital, stated by the standard-setter. It is also, empirically, the majority of any comprehensive wealth measure: **60.6 %** of the World Bank's 2020 world total (own computation, below).

**Consumer durables** are excluded on the same authority, 2025 SNA 4.120: outside the asset boundary, reported as a memorandum item only.

### Framework comparison

| Framework | What it measures | Double counting | Government wealth | Valuation | Verdict |
|---|---|---|---|---|---|
| **National balance sheets (SNA)** | Consolidated net worth of all resident sectors | **Removed by identity** | **Included** | Market where prices exist | **Chosen** |
| Household net worth | Net worth of the household sector only | Removed within the sector | **Excluded by design** | Market | Cross-check only |
| Comprehensive wealth | Produced + natural + human + net foreign | Removed, but human capital dominates | Included | Replacement cost and discounted rent, **not market** | Structural cross-check and floor |
| Asset-class aggregation | Sum of asset-class market values | **Not removed. This is the error.** | Incoherent | Mixed | **Rejected** |

The decisive property of the first row is that consolidation is an accounting identity, not an estimate. In the other rows, whatever double counting exists has to be netted out by judgement, and the judgement is not published.

### Residual uncertainty the framework cannot remove

**The world does not balance.** Summing every economy's foreign assets and liabilities should give zero. Own computation from the World Bank wealth accounts for 2020 gives gross foreign assets $180.55 tn against gross foreign liabilities $188.17 tn, a net of **−$7.62 tn**, or **−0.9 %** of that dataset's world total. That is the world statistical discrepancy: unrecorded cross-border positions, offshore holdings, and compiler differences.

**Coverage is uneven.** The economies that publish market-value balance sheets are disproportionately high income; the rest are modelled.

**Valuation basis is not uniform** across compilers for dwellings, land, unlisted equity or natural resources.

**Purchasing-power and market-exchange-rate totals differ by three quarters.** For 2023 the world's GDP was $188.52 tn at purchasing power parity and $107.35 tn at market exchange rates (World Bank, indicators `NY.GDP.MKTP.PP.CD` and `NY.GDP.MKTP.CD`, World aggregate, series last updated 13 July 2026). The choice of conversion is a first-order decision, not a technicality.

## Part 2 — Denominator Source Feasibility

### Source scorecard

| Source | Concept | Coverage | Latest vintage | Units | Licence | Verdict |
|---|---|---|---|---|---|---|
| **WID.world** `mnweal` | Market-value national wealth, SNA identity | World aggregate published | **2023** | **PPP USD** | **None found** | **V1 basis; rights blocker** |
| **World Bank CWON 2024** | Comprehensive wealth, decomposable | **151 economies** | **2020** | Current USD, MER | **CC BY 4.0 (dataset)** | Floor and structural cross-check |
| OECD balance sheets | SNA non-financial and financial balance sheets | 37 non-financial / 43 financial | 2025 | National currency | Unverified | Sub-global cross-check |
| IMF GFS / PSBS | Public sector balance sheets | 31–55 | 2018 vintage | USD | Unverified | Public sector only |
| UBS Global Wealth Report | Household net worth | 56 markets, >92 % of wealth | **end-2025** | Current USD, MER | **Prior written permission required** | Cross-check, not usable in production |
| Savills | World real-estate market value | Global | **end-2024** | Current USD | Proprietary | Non-additive cross-check |
| World Gold Council | Above-ground gold stock and value | Global | **end-Q2 2026** | Current USD | Free, redistribution restricted | Non-additive cross-check |
| **McKinsey Global Institute** | Global net worth, market value | **21 economies, ~71 % of world GDP, extrapolated** | **end-2024** | Current USD, MER | **Proprietary; "any use … strictly prohibited"** | **Primary market-value cross-check; cannot be a production input** |

### WID.world — the concept fits, the licence does not exist

The World Inequality Database publishes, for the aggregate region `WO` (the World), a series named **"Market-value national wealth"** whose technical definition is the SNA identity verbatim. The world file and its metadata were downloaded directly (`https://wid.world/bulk_download/WID_data_WO.csv`, 11,211,309 bytes; `https://wid.world/bulk_download/WID_metadata_WO.csv`, 588,794 bytes; server `last-modified` 9 September 2026). Values read from those files:

| Series | Concept | 2023 value | First year |
|---|---|---:|---|
| `mnweali999` | Market-value national wealth | **977.003 tn** | 1980 |
| `mpweali999` | Net private wealth | 829.012 tn | 1980 |
| `mhweali999` | Net personal (household) wealth | 790.251 tn | 1980 |
| `miweali999` | Net non-profit wealth | 38.709 tn | 1980 |
| `mgweali999` | Net public (government) wealth | 147.991 tn | 1980 |
| `mnninci999` | Net national income | 158.281 tn | 1800 |
| `wwealni999` | Wealth-to-income ratio | 6.1689 | 1995 |

**The sector decomposition is exact.** Private ($829.012 tn) plus public ($147.991 tn) equals national ($977.003 tn) to the third decimal in trillions. Personal plus non-profit gives $828.960 tn against a published private total of $829.012 tn, a residual of $0.052 tn, or **0.0054 %**. That is a decomposition that sums, from one source, with no overlap — which is exactly what the additive component panel of the published surface needs.

**The units are purchasing-power dollars, and the metadata does not say so.** The metadata `unit` field reads `USD`. The arithmetic says otherwise: world net national income for 2023 is given as $158.28 tn, against a world GDP at market exchange rates of $107.35 tn. Net national income cannot exceed gross domestic product. Against world GDP at purchasing power parity of $188.52 tn it is 84.0 %, which is the expected relationship after consumption of fixed capital. WID's own documentation confirms that cross-country comparisons use a purchasing-power-parity round. **Any use of this series against a market-priced numerator requires conversion, and the incomplete unit label is a trap worth recording.**

WID also states that its series include "corrections for offshore wealth and offshore capital income, so that series on foreign capital income inflows and outflows are consistent at the global level (summing to zero)" — a global-consistency property that no other candidate source claims.

**Licence: unresolved, and this is the blocker.** WID presents itself as open access, but `https://wid.world/terms-of-use/` returns 404, the download pages carry no licence string, and the project's public repository carries no licence file. No production value may be published from WID until its terms are established in writing. Methodology note of record: World Inequality Lab Technical Note 2021/13, *Estimation of Global Wealth Aggregates in WID.world* (Bauluz, Blanchet, Martínez-Toledano and Sodano, November 2021).

### World Bank CWON 2024 — open and global, but not a market value

The Changing Wealth of Nations 2024, fifth edition, published October 2024, covers **151 economies, 1995–2020**, annual. The **dataset** is CC BY 4.0 (the report PDF's rights page is more restrictive; cite the dataset). World Bank API source 59; series `lastupdated` 8 October 2024.

The World Bank publishes shares and per-capita figures, not a world dollar total. **Own computation**, summing every economy with data, current US dollars, reference year 2020:

| Component | Indicator | 2020, current US$ | Share | n |
|---|---|---:|---:|---:|
| Human capital | `NW.HCA.TO.CD` | **515.00 tn** | 60.7 % | 150 |
| Produced capital, incl. urban land | `NW.PCA.TO.IN.CD` | 274.65 tn | 32.4 % | 149 |
| Renewable natural capital | `NW.NCA.TOTL.TO.CD` | 48.79 tn | 5.7 % | 150 |
| Non-renewable natural capital | `NW.NCA.SSOI.TO.CD` | 18.12 tn | 2.1 % | 150 |
| Net foreign assets | `NW.NFA.TO.CD` − `NW.NFL.TO.CD` | **−7.62 tn** | −0.9 % | 150 |
| **Total** | `NW.TOW.TO.CD` | **848.94 tn** | 100 % | 150 |

**The identity reconciles exactly**: 515.00 + 274.65 + 48.79 + 18.12 − 7.62 = 848.94, against a published total of 848.94. The computed human-capital share of 60.7 % matches the report's stated 60 %. The sum is faithful.

**Denominator on this basis, human capital stripped: 848.94 − 515.00 = $333.94 tn (2020).**

Two traps found and recorded. `NW.NFA.TO.CD` is labelled "Foreign assets" and is **gross**; the net figure requires subtracting `NW.NFL.TO.CD`. And the same indicators exist in a `real chained 2019 US$` variant without the `.CD` suffix, whose world sums differ (produced capital 268.4 tn, natural 75.7 tn, human 537.3 tn); using them against a current-dollar numerator would be a silent error.

**Why this cannot be the denominator.** Produced capital here is a perpetual-inventory replacement cost and natural capital a discounted resource rent. Neither is a market price. The proof that this matters is one division: **world real estate at market value is $393.3 tn, which is 117.8 % of the entire $333.94 tn non-human total.** A measure of all non-human wealth that is smaller than the world's buildings and land is not a market valuation. It is a floor.

### UBS Global Wealth Report — well defined, wrong scope, blocked licence

GWR 2026, seventeenth edition, published 30 June 2026, reference year end-2025. Total household net worth **$517.69 tn** across 56 markets representing more than 92 % of world wealth. The definition is clean and says exactly what UBWI needs to hear about two of its exclusions (GWR 2026, p. 38):

> "Net worth or 'wealth' is defined as the value of financial assets and real assets (principally housing) owned by private individuals, less their debts. Private pension fund assets are included, but not entitlements to state pensions unless they are fully funded. Human capital is excluded altogether, along with assets and debts owned by the state (which cannot easily be assigned to individuals)."

That last clause is the disqualification. A measure that excludes state assets and state debts cannot be a measure of all presently existing wealth.

Three further findings. The **aggregate financial / non-financial / debt decomposition has not been published since the 2023 Databook** (reference year 2022: financial $262.3 tn, non-financial $251.1 tn, debt $59.0 tn, net $454.4 tn — derived from published per-adult values times published adult counts), and the Databook was discontinued after that edition. The **series breaks at 2023**, when coverage moved from 217 markets to a 56-market sample. And UBS revises history every year, so every vintage is a restatement.

**Licence: blocked.** "This document may not be redistributed or reproduced in whole or in part without the prior written permission of UBS", with the UBS terms of use separately prohibiting systematic retrieval to compile a database. There is no self-service path.

**A data-quality defect was found and is recorded here because it affects anyone reusing this edition.** The GWR 2026 methodology table on p. 37 prints Americas 185,040 / Latin America 10,373 / North America 174,667 USD bn — byte-identical to the corresponding GWR 2025 table for end-2024. EMEA and APAC reconcile against the published shares and the pyramid total of 517.69 tn; the Americas rows do not, and the printed rows sum 25,270 USD bn short of the pyramid total. **Do not use GWR 2026's Americas rows.**

### McKinsey Global Institute — the right concept, measured, and unlicensable

MGI's global balance sheet is the closest published analogue to the denominator UBWI wants. The 74-page report PDF was retrieved in full and read (`out-of-balance-whats-next-for-growth-wealth-and-debt.pdf`, HTTP 200, 10,506,133 bytes), as was the 2021 predecessor (196 pages, 6,334,908 bytes). MGI's HTML pages were unreachable throughout; the media-hosted PDFs served correctly to a request with full browser headers and retries. **The first attempt concluded the source was unretrievable and that conclusion was wrong.**

**Out of balance: What's next for growth, wealth, and debt?**, McKinsey Global Institute, **October 2025**. Authors: Mischke, Anderson, White, Smit, Birshan, Leung, Johansson, Govindarajan, Greenberg.

> "Global net worth has mirrored the rise of the global balance sheet, nearly quadrupling from $160 trillion in 2000 to $600 trillion in 2024, or from 4.7 to 5.4 times GDP."

| Block, end-2024 | Assets | Liabilities |
|---|---:|---:|
| Real assets / net worth | $620 tn (5.6× GDP) | **$600 tn (5.4× GDP) — net worth** |
| Financial, held by households, governments, non-financial corporations | $570 tn | $580 tn |
| Financial, held by the financial sector | $520 tn | $530 tn |

Real estate is **69 %** of the real-asset block for 2024. The 2021 predecessor covered ten economies and put net worth at $510 tn for 2020, with the section heading "In a world increasingly powered by intangibles, real estate accounts for two-thirds of global net worth".

**Coverage is the methodological weakness.** Footnote 2, p. 8:

> "The 'global' figure reflects a GDP-weighted average of 21 countries: Australia, Belgium, Canada, China, Czech Republic, Denmark, Finland, France, Germany, Ireland, Italy, Japan, Korea, Mexico, the Netherlands, Poland, Romania, Spain, Sweden, the United Kingdom, and the United States. They account for about 71 percent of global GDP as of 2024."

So "global" is an extrapolation from 21 economies by GDP weights, and footnote 4 concedes that the asset and liability sides do not tie because of it. The report is also explicit that the sides do not balance exactly for that reason.

**Licence: prohibitive.** Page 2, verbatim: "Confidential and proprietary. Any use of this material without specific permission of McKinsey & Company is strictly prohibited." There is no Creative Commons or other open grant, notwithstanding MGI's stated policy of sharing results publicly free of charge. **Short quotation with attribution, as above, is not the same thing as using the figures as an index input**, and MGI is therefore a cross-check, not a candidate denominator, unless written permission is obtained.

**One hazard recorded.** MGI's headline concept differs between editions — an earlier edition headlines global net worth, a later one household net worth — and the two must never be chained into one series. Its widely quoted "$1.7 quadrillion" is the **gross, unconsolidated** total, which is precisely what a denominator must not be.

### Other denominator-relevant sources

**OECD** publishes annual balance sheets for non-financial assets (`OECD.SDD.NAD:DSD_NASEC10@DF_TABLE9B`, **37 countries, 1970–2025**) and financial balance sheets (`DSD_NASEC20@DF_T720R_A`, **43 areas, 1950–2025**) through an unauthenticated SDMX API. Deep and machine-readable, but 37 economies is not the world, and the terms of use page was not retrievable. Right tool for cross-checking the economies that publish real balance sheets.

**IMF** publishes no global net wealth figure. Its public-sector balance sheet database covers 55 countries, 25 with time series, on a 2018 vintage. The Global Debt Database covers 190 economies back to 1950 but is **gross debt only, with no asset side**, so it cannot yield net worth. The October 2018 Fiscal Monitor's public-wealth figures could not be retrieved (imf.org returned 403 to every attempt) and are therefore not used.

**Penn World Table 11.0** covers 185 countries to 2023 but reports capital stock in constant national prices and PPP, with no summable current-dollar world total.

## Part 3 — Non-Additive Cross-Checks

**These rows overlap each other and must never be summed.** They are recorded to show the composition of world wealth and to test the denominator for plausibility.

| Asset class | Value | Reference date | Source | Retrieval |
|---|---:|---|---|---|
| World real estate, total | **$393.3 tn** | end-2024 | Savills | Retrieved directly |
| — residential | $286.9 tn | end-2024 | Savills (total less commercial and agricultural) | Derived |
| — commercial | $58.5 tn | end-2024 | Savills | Retrieved directly |
| — agricultural land | $47.9 tn | end-2024 | Savills | Retrieved directly |
| Produced capital incl. urban land | $274.65 tn | 2020 | World Bank CWON 2024 | Own computation |
| Natural capital, total | $66.91 tn | 2020 | World Bank CWON 2024 | Own computation |
| Above-ground gold stock | 222,600 t, **$29.0 tn** | end-Q2 2026 | World Gold Council | Reported |
| Listed equity market capitalization | $164.49 tn | end-July 2026 | World Federation of Exchanges, sum of three regional rows | Derived |
| Debt securities outstanding | >$150 tn | end-2024 | BIS Quarterly Review, 15 September 2025 | Reported |
| Above-ground silver stock | 19.3 bn oz | end-2023 | The Silver Institute / Precious Metals Insights | Reported |
| Art and collectibles held by UHNW individuals | $2.56 tn | 2024 | Deloitte Private / ArtTactic | Reported |

Savills' own published comparison — that property surpasses the combined value of global equities and debt, and that all the gold ever mined is a small fraction of real estate's worth — is retrieved from the source page and is consistent with the table.

### Overlaps, stated explicitly

- **Savills agricultural land ($47.9 tn) and CWON renewable natural capital ($48.79 tn)** are near-identical in magnitude and measure overlapping ground by incompatible methods: market prices against discounted resource rents. Not additive.
- **Savills real estate and CWON produced capital including urban land** both contain the world's dwellings, commercial structures and the land beneath them. Not additive.
- **Listed equity market capitalization is a claim on assets already counted** as produced capital and natural capital. Adding it double-counts every listed company.
- **Debt securities outstanding are liabilities of their issuers.** Adding them counts the financed asset a second time.
- **Broad money is a liability of the banking system.** No central bank or international organisation publishes a global M2 or M3 aggregate; every widely circulated figure traces to content farms rather than to a compiler. Not used.
- **Private-markets assets under management is a fund-management measure**, not the value of unlisted businesses, and a quarter to a third of it is real estate and infrastructure already inside the real-estate and produced-capital rows. There is **no credible global estimate of total unlisted business equity value**, and none is substituted.
- **No credible estimate of the world stock of collectibles exists.** The Deloitte figure covers holdings of roughly 121,000 ultra-high-net-worth individuals, not the world; the Knight Frank luxury index is a price index and cannot be levelled into a total. The brief permitted collectibles "if data quality is strong enough". It is not.

### Four figures that circulate and should not be cited

Recorded so they are not reintroduced later: a "$397.7 tn" world real-estate total, which appears to be a digit transposition of an earlier Savills end-2022 figure and is supported by no Savills release; above-ground gold of "205,000–210,000 t", which comes from search-optimised pages and contradicts the World Gold Council's own 222,600 t; any "global M2" total, for the reason above; and any chaining of MGI's global-net-worth and household-net-worth headlines into one series.

## Part 4 — Numerator Source Feasibility

### Supply

Retrieved 14 September 2026 at 17:24:20Z, block height **966,998**, confirmed independently by `mempool.space/api/blocks/tip/height` and `blockchain.info/q/getblockcount`.

| Source | Endpoint | Value (BTC) |
|---|---|---:|
| Blockchain.com | `blockchain.info/q/totalbc` | **20,084,328.00000000** |
| Blockchair | `api.blockchair.com/bitcoin/stats`, `circulation` | 20,084,349.16655096 |
| Coin Metrics community, `SplyCur` | daily close 13 September 2026 | 20,083,913.63013637 |

**Own cross-check against the issuance schedule.** Summing the scheduled subsidy over blocks 0 to 966,998 — 210,000 blocks at 50 BTC, then 25, 12.5, 6.25, then 126,999 blocks at 3.125 — gives **20,084,371.875 BTC**. The Blockchain.com figure is **43.875 BTC below** the nominal schedule, which is the expected direction and order of magnitude for documented unclaimed coinbase rewards. The Blockchair figure sits between the two.

The three sources span **43.9 BTC, about 2 parts per million**. Immaterial at UBWI's precision, but the methodology fixes the construction anyway so that a source substitution cannot move the series silently.

### Price

Three independent venues, all retrieved between 17:24:20Z and 17:24:30Z on 14 September 2026:

| Venue | Endpoint | Price (USD) |
|---|---|---:|
| Coinbase | `api.coinbase.com/v2/prices/BTC-USD/spot` | 78,963.895 |
| Bitstamp | `www.bitstamp.net/api/v2/ticker/btcusd/`, `last` | **78,972.31** (median) |
| Kraken | `api.kraken.com/0/public/Ticker?pair=XBTUSD`, last trade | 78,972.50 |

**Dispersion: $8.61, or 1.1 basis points.** That is the entire numerator uncertainty from venue choice.

An independent retrieval two minutes earlier, at 17:22:46Z, returned Coinbase 78,818.30, Kraken 78,807.10, Bitstamp 78,819.91 and CoinGecko 78,868 — a 7.7 basis point spread at that instant, and a price roughly 0.2 % below the 17:24 reading. The numerator is instantaneous and the timestamp is load-bearing.

### Published market-capitalization series and their terms

Surveyed and rejected as numerator sources:

- **CoinGecko** forbids the use outright: "You are not allowed to duplicate, reproduce, copy, store, derive from or translate any Data", and separately prohibits redistribution of API access. "Derive from" covers an index numerator.
- **Blockchain.com** prohibits storage: "You shall not commercialize (i.e., sell, rent, or lease), copy, store or cache the Blockchain Content". Its market-cap chart is also formed from "the daily average market price across major exchanges", with the exchanges unenumerated, so the price leg is not reproducible.
- **CoinMarketCap** computes price by "an algorithm that factors the 'trustability' or 'confidence' from the distribution of prices reported by an exchange" — proprietary and undisclosed weights. Its commercial terms could not be retrieved in full and are recorded as unverified.
- **Coin Metrics** is the only provider with a fully documented price construction: a volume-weighted median over a sixty-minute trailing window, rules-based constituent selection from its coverage universe with disclosed exclusion thresholds, top six venues, quarterly review. Its community tier serves `PriceUSD`, `SplyCur` and `CapMrktCurUSD` without a key, and blocks `CapMrktFFUSD` and `SplyFF` with a 403. The community licence is **CC BY-NC 4.0** — non-commercial — which rules it out for a published Urdais value. Note also that the company was acquired in 2025, so the counterparty on any licence is no longer the entity named on the methodology documents.

**Conclusion: the numerator is built from public venue tickers read directly by Urdais.** That removes the licensing dependency entirely and makes the construction Urdais's own, which is the same posture the compute-price outputs take toward vendor aggregates.

### Lost coins

| Source | Estimate | Method | Reproducible | Scheduled |
|---|---|---|---|---|
| Chainalysis | 2.3–3.7 M BTC | Per-segment assumed loss rates over wallet-clustered supply | No | No |
| Glassnode `probably_lost` | Coins inactive since July 2010 | Hard dormancy cut-off | Yes, but the cut-off is arbitrary | Daily, paid |
| Glassnode `provably_lost` | Unclaimed coinbase, burn addresses, `OP_RETURN` | Deterministic on-chain | **Yes** | Daily, paid, not redistributable |
| Coin Metrics `SplyFF` | ≈14.3 M free float, 22 % below current supply | Five-year dormancy plus insider and vesting exclusions | Dormancy leg only | Gated |
| Various dormancy studies | up to 5.6 M unmoved for ten years | Varying thresholds | Partly | No |

The published range spans **2.3 M to 5.6 M BTC**, about a sixth of supply, and every estimate reduces to an undefended choice of dormancy threshold. Coin Metrics' own documentation concedes that for Bitcoin specifically there are no provably lost, burned, foundation or vested tokens to exclude — so its 22 % haircut is the threshold and nothing else. Dormant coins are also not irreversibly lost; fork events have reawakened them.

**No adjustment is defensible.** The one deterministic construction is paid and non-redistributable, and is small enough to be immaterial.

### Historical depth

| Series | Source | First usable point |
|---|---|---|
| Supply | `api.blockchain.info/charts/total-bitcoins?timespan=all` | 3 January 2009, genesis |
| Price | `api.blockchain.info/charts/market-price?timespan=all` | First non-zero 18 August 2010 at $0.07; zeros before that are placeholders |
| Price and supply, daily | Coin Metrics community | **27 July 2010**, contiguous daily, eight decimals |

Bitcoin history is not the constraint on reconstruction depth. **Multi-venue** history is: the three-venue median the methodology requires cannot be formed for the era in which price discovery sat on a single venue that later failed.

## Part 5 — Candidate Calculation

**This is a labelled candidate computed as a simulation. It is not a published Urdais value, and no publication may occur under a draft methodology.**

### Numerator

```
supply                20,084,328.00000000 BTC   (blockchain.info /q/totalbc, height 966,998)
venue prices (USD)    78,963.895  |  78,972.31  |  78,972.50
median price          78,972.31 USD            (Bitstamp)

market cap = 20,084,328.00000000 × 78,972.31
           = 1,586,105,776,957.68 USD
           = 1.586106 trillion USD
```

Observation instant: **2026-09-14T17:24:20Z** to **2026-09-14T17:24:30Z**.

### Denominator

The denominator must implement the definition — market-value national wealth — so the World Bank comprehensive-wealth total is not used for it, despite being the only open global dataset. MGI measures the right concept but forbids the use. The V1 construction is therefore WID's world market-value national wealth converted from purchasing-power to market exchange rates by the world's own PPP-to-MER GDP factor: it implements the definition, it is decomposable into sectors that sum, and every step is arithmetic Urdais performs itself.

```
W_ppp   (WID mnweali999, WO, 2023)              977,002,853,040,128 USD PPP
GDP_ppp (World Bank NY.GDP.MKTP.PP.CD, WLD, 2023) 188,524,797,806,804 int$
GDP_mer (World Bank NY.GDP.MKTP.CD,   WLD, 2023) 107,348,614,073,350 USD

ppp factor = 188,524,797,806,804 / 107,348,614,073,350
           = 1.7561921915

W_mer = 977,002,853,040,128 / 1.75619219152645326889
      = 556,318,868,603,403.39 USD  (556.319 trillion, reference year 2023)
```

Consistency check on the source: $977.003 tn / $158.281 tn gives a wealth-to-income ratio of 6.1726, against WID's own published ratio of 6.1689 — a 0.06 % difference attributable to vintage alignment between the two series, and recorded rather than smoothed.

**Additive components** — the sector decomposition, which sums to the total by construction:

| Component | 2023 share of world net worth | MER value |
|---|---:|---:|
| Net personal (household) wealth | 80.8852 % | **$449.980 tn** |
| Net non-profit wealth | 3.9620 % | **$22.041 tn** |
| Net public (government) wealth | 15.1475 % | **$84.268 tn** |
| Unexplained residual | 0.0054 % | **$0.030 tn** |
| **World net worth, 2023 vintage** | **100 %** | **$556.319 tn** |
| Bitcoin adjustment, 2026-09-14T17:24Z | — | **$1.586 tn** |
| **Total Global Wealth** | — | **$557.905 tn** |

The Bitcoin term is added because the 2023 vintage predates the 2025 SNA asset boundary and therefore contains no crypto assets.

### UBWI

```
TGW  = 556,318,868,603,403.39 + 1,586,105,776,957.68
     = 557,904,974,380,361.07 USD

UBWI = 1,586,105,776,957.68 / 557,904,974,380,361.07 × 100
     = 0.2842967619...  %

published to four decimal places:  UBWI = 0.2843 %
```

For comparison, leaving Bitcoin out of its own denominator gives 0.285107 %. The difference is 0.0008 percentage points, or 0.28 % of the value — immaterial, and made anyway because the definition requires it.

### Sensitivity

| Denominator basis | Reference date | W | UBWI |
|---|---|---:|---:|
| MGI global net worth (market value, 21 economies extrapolated, **unlicensable**) | end-2024 | $600.00 tn | **0.2637 %** |
| **V1: WID world market-value national wealth, MER-converted** | 2023 | **$556.32 tn** | **0.2843 %** |
| UBS household net worth only (excludes the state) | end-2025 | $517.69 tn | 0.3054 % |
| Savills world real estate only (one asset class) | end-2024 | $393.30 tn | 0.4017 % |
| CWON comprehensive wealth less human capital (replacement cost) | 2020 | $333.94 tn | 0.4727 % |
| WID world wealth left in PPP dollars (**wrong unit**, shown to size the error) | 2023 | $977.00 tn | 0.1621 % |

**The defensible range is 0.2637 % to 0.4727 %, a factor of 1.79.** The last row is not a candidate; it is there because using the WID series without conversion is the most likely mistake a future implementer will make, and it would understate the published value by more than 40 %.

**The range spans different concepts, and that is the point.** Only the first two rows measure the quantity UBWI defines. The third measures households alone, the fourth one asset class, the fifth wealth at replacement cost. They are in the table because a reader is entitled to know how much of UBWI's value is a fact about Bitcoin and how much is a choice about what wealth means. Within the concept UBWI actually defines, the range narrows to **0.2637 % to 0.2843 %**, and 0.2843 % is its upper end for the reason given next.

**The direction of the V1 basis's error is known.** The PPP-to-MER factor is GDP-weighted, and wealth is more concentrated in high-income economies than income is, where the factor is near one. Applying a world-average factor of 1.756 therefore over-deflates. $556.32 tn is a **lower bound on the denominator**, so **0.2843 % is an upper bound on UBWI**.

That prediction is testable, and it holds. MGI's independently constructed market-value estimate for a year later is $600 tn, **7.9 % above** the V1 denominator — the right sign and a plausible magnitude for one year of nominal growth plus the conversion bias. Two frameworks built from different data by different compilers, reconciled to within 8 %, is the best evidence available that the definition is measurable rather than merely stateable.

**The most defensible single statement of the result is therefore not a point but a range: Bitcoin is between a quarter and a half of one percent of presently existing global net wealth, and most probably near the lower end of that range, around 0.26 % to 0.29 %.**

### Plausibility cross-checks on the candidate denominator

| Check | Result |
|---|---|
| MGI market-value net worth ÷ V1 denominator | **+7.9 %**, the predicted sign and a plausible magnitude given the one-year vintage gap |
| Savills world real estate ÷ V1 denominator | **70.7 %**, against MGI's independently measured real-estate share of real assets of **69 %** for end-2024. Two different sources, two different methods, 1.7 percentage points apart |
| Savills world real estate ÷ MGI net worth | 65.6 % |
| Savills world real estate ÷ CWON non-human total | **117.8 %** — above 100 %, which is the proof that CWON is not a market valuation |
| Above-ground gold ÷ V1 denominator | 5.21 % |
| Bitcoin market cap ÷ above-ground gold value | **5.47 %** |
| Measured world net foreign position (CWON 2020) | −$7.62 tn, −0.9 % of that total |

## Part 6 — Historical Reconstruction Feasibility

| Input | Available from | Constraint |
|---|---|---|
| Bitcoin supply | 2009, genesis | None |
| Bitcoin price, single venue | August 2010 | Venue later failed; not independently reproducible |
| Bitcoin price, three independent venues | ~2013 | **Binding constraint** |
| WID world market-value national wealth | 1980 (world aggregate), ratios from 1995 | Coverage thins going back |
| CWON comprehensive wealth | 1995 | 2020 vintage, non-market valuation |
| UBS household net worth | 2000 | Breaks at 2023; annually restated |

**Recommended minimum viable start date: 31 December 2013**, annual, one point per denominator vintage year.

2010 to 2012 points are computable but rest on a single venue and would be a different construction published under the same name. Nothing before 2013 is backfilled, and no point is created for a year in which either leg fails.

Each historical point uses the world-wealth vintage in force for its own reference date. Applying today's denominator backwards would manufacture a series that never existed.

## Part 7 — Product Representation

One headline value, no variants.

**Headline**: UBWI as a percentage to four decimal places; Bitcoin market capitalization; Total Global Wealth; denominator vintage with reference date, source and publication date; Bitcoin observation timestamp; calculation timestamp; status; methodology version.

**Two component panels beneath, never merged.** The additive panel carries the sector decomposition, the Bitcoin adjustment and the residual, and reconciles to the denominator. The non-additive panel carries the asset-class cross-checks, each with its own source, reference date and valuation basis, under a standing statement that the rows overlap and must not be added. The second panel is the one that answers "what does global wealth mean here", and it is the reason the index is inspectable rather than merely asserted.

**Sensitivity is part of the product, not an appendix.** A reader who sees 0.2843 % without seeing that the defensible range runs to 0.4727 % has been given false precision.

**A product defect is recorded here.** The Urdais market catalog currently carries UBWI as an index with mock values in points (`src/data/mock/market-detail.ts`, latest value 1342.57 pts). UBWI has no level, no base date and no points. That placeholder must be replaced before any UBWI surface ships, and it is out of scope for this study.

## Part 8 — Data Architecture

Proposed, not implemented. See [the UBWI data architecture proposal](../architecture/ubwi-data-architecture.md). No migration is created by this phase, because the methodology is not resolved and the denominator source is not cleared; creating tables now would be exactly the premature infrastructure the development rules prohibit.

## Open Questions

1. **WID's licence.** Unpublished. Blocks production. Must be established in writing.
2. **Whether Urdais should construct its own world aggregate** from country-level balance sheets rather than depend on a single database's world row, and under what coverage rule.
3. **Whether a wealth-weighted PPP-to-MER conversion is constructible** from open data, which would remove the known bias in the V1 denominator.
4. **Whether OECD's terms permit production use**, which would give a high-quality cross-check for about forty economies.
5. **Whether a redistributable measure of non-Bitcoin crypto capitalization exists**, without which the denominator is knowingly incomplete.
6. **The venue set for the numerator median**, its selection rule, and how a venue is added or removed without moving the series.
7. **Whether McKinsey would grant written permission** to use its global net worth figure as an index input. It measures the right concept at the right valuation basis and is the most current market-value estimate available; only its terms stand in the way.
8. **Whether MGI's 21-economy GDP-weighted extrapolation is an acceptable coverage basis** for a denominator, even with permission. Seventy-one percent of world GDP is not the world, and the extrapolation weights by income rather than by wealth.

## Sources and Evidence

All retrieved 14 September 2026 unless stated.

**Verified by direct call.** [Blockchain.com total supply](https://blockchain.info/q/totalbc) and [block count](https://blockchain.info/q/getblockcount); [mempool.space tip height](https://mempool.space/api/blocks/tip/height); [Coinbase spot price](https://api.coinbase.com/v2/prices/BTC-USD/spot); [Kraken ticker](https://api.kraken.com/0/public/Ticker?pair=XBTUSD); [Bitstamp ticker](https://www.bitstamp.net/api/v2/ticker/btcusd/); [Blockchair stats](https://api.blockchair.com/bitcoin/stats); [Coin Metrics community API](https://community-api.coinmetrics.io/v4); [World Bank indicator API](https://api.worldbank.org/v2/), source 59 wealth accounts and WDI GDP series; [WID world data file](https://wid.world/bulk_download/WID_data_WO.csv) and [WID world metadata file](https://wid.world/bulk_download/WID_metadata_WO.csv); OECD SDMX public endpoints.

**Documents read.** [McKinsey Global Institute, *Out of balance: What's next for growth, wealth, and debt?*, October 2025](https://www.mckinsey.com/~/media/mckinsey/mckinsey%20global%20institute/our%20research/out%20of%20balance%20whats%20next%20for%20growth%20wealth%20and%20debt/out-of-balance-whats-next-for-growth-wealth-and-debt.pdf), 74 pages, read in full; and [MGI, *The rise and rise of the global balance sheet*, 2021](https://www.mckinsey.com/~/media/mckinsey/industries/financial%20services/our%20insights/the%20rise%20and%20rise%20of%20the%20global%20balance%20sheet%20how%20productively%20are%20we%20using%20our%20wealth/mgi-the-rise-and-rise-of-the-global-balance-sheet-full-report-vf.pdf), 196 pages. [2025 SNA chapter 4](https://unstats.un.org/unsd/nationalaccount/snaupdate/2025/2025SNA_CH04_V11.pdf), paragraphs 4.82, 4.109, 4.117, 4.120, 4.121, 4.126, 4.322 — text extracted from the PDF streams directly. [2008 SNA chapter 13](https://unstats.un.org/unsd/statcom/doc08/BG-SNA-Chapter13.pdf), paragraph 13.4. [2025 SNA chapter 14 draft](https://unstats.un.org/unsd/nationalaccount/snaupdate/2025/2025SNA_CH14_V5.pdf), paragraph 14.4. [Savills, how much is global real estate worth](https://impacts.savills.com/market-trends/how-much-is-global-real-estate-worth.html). [UBS Global Wealth Report 2026](https://www.ubs.com/global/en/wealthmanagement/insights/global-wealth-report.html) and the 2023 Global Wealth Databook. [World Gold Council, how much gold](https://www.gold.org/goldhub/data/how-much-gold). [WFE market statistics](https://focus.world-exchanges.org/issue/september-2026/market-statistics). [BIS Quarterly Review, 15 September 2025](https://www.bis.org/publ/qtrpdf/r_qt2509e.htm). [World Bank, The Changing Wealth of Nations](https://www.worldbank.org/en/publication/the-changing-wealth-of-nations) and its [CC BY 4.0 data catalog entry](https://datacatalog.worldbank.org/search/dataset/0042066/wealth-accounting). [World Inequality Lab Technical Note 2021/13](https://wid.world/document/estimation-of-global-wealth-aggregates-in-wid-world-world-inequality-lab-technical-note-2021-13/). [WID codes dictionary](https://wid.world/codes-dictionary/). Terms pages for [CoinGecko](https://www.coingecko.com/en/api_terms), [Blockchain.com](https://www.blockchain.com/legal/api-terms) and Coin Metrics community data.

**Attempted and not retrieved.** All McKinsey HTML pages, repeated timeouts (the media-hosted PDFs above did serve, on retry, with full browser headers); `imf.org` and `elibrary.imf.org`, HTTP 403, so the October 2018 Fiscal Monitor public-wealth figures are **not used**; `wid.world/terms-of-use/`, HTTP 404, which is itself the licence finding; OECD terms of use, HTTP 403; Savills press release, HTTP 403, though the Impacts article carrying the same figures was retrieved. **No figure from an unretrieved document is used in the candidate.**

## Research History

**14 September 2026**: initial Phase 1 source study. Conclusion: the framework is settled by the SNA national-wealth identity; the denominator is feasible but has no source that is simultaneously global, current, market-valued and cleared for redistribution; the candidate is 0.2843 % with a defensible range of 0.2637 % to 0.4727 %; and the binding launch blocker is source rights, on the open database that implements the required concept and on the proprietary report that measures it best.

Three findings were corrected before this study was finalised. Two claim less than the first draft did; one claims more.

The World Bank wealth accounts were initially treated as the denominator, on the strength of being the only open, global, decomposable dataset. They are not a market valuation, and the disproof is internal to the evidence collected: the world's real estate at market value exceeds that dataset's entire non-human wealth total. They are reclassified as a floor and a structural cross-check.

The WID world series was initially read at face value as United States dollars, because its own metadata says so. Arithmetic against world GDP shows it is purchasing-power dollars. Using it unconverted would have published 0.1621 % instead of 0.2843 %.

McKinsey's global balance sheet was first recorded as unretrievable, and every figure from it was withdrawn and the candidate rebuilt without it. That was wrong: the HTML pages are bot-gated, but the media-hosted report PDFs serve correctly to a request with full browser headers and retries, and both the 2025 report and its 2021 predecessor were subsequently read in full. The figures are reinstated as primary evidence, the anti-double-counting section now quotes the report's own statement of the identity, and MGI enters the sensitivity table as the market-value cross-check that corroborates the V1 denominator to within 8 %. It remains unusable as a production input, for licensing reasons rather than evidentiary ones. **A retrieval failure is not a finding about a source; it is a finding about the retrieval.**
