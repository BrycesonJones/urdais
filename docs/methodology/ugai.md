# Urdais Global AI Index (UGAI)

**Status: proposed methodology, version 0.1.0-draft.** Prepared 12 September 2026. No production base date, index level, constituent list, index shares, divisor, or return series is established by this document. Nothing here describes live infrastructure.

This proposal follows the principles of the [Urdais methodology framework](/docs/methodology) and consumes the [Urdais AI Equity Universe](/docs/methodology/ai-equity-universe), the shared parent primitive. Rules expressed as requirements describe the proposed design, subject to approval. Parameters marked **unresolved** are launch requirements, not defaults. UGAI production publication is blocked until the parent universe has a production version and the items in [Open Questions / Empirical Validation Required](#docs-open-questions--empirical-validation-required) are closed in a versioned release.

## Purpose and Scope

The Urdais Global AI Index measures the equity-market performance of the publicly traded companies comprising the Urdais AI Equity Universe. It is calculated from a dated, versioned parent universe snapshot (membership, representative securities, and base weights), the official closing prices of those securities, and a daily reference exchange rate, and it is published as a time series with percentage changes over defined periods.

UGAI answers the product question "How is the global AI economy performing?" through one specific lens: the market-value performance of public equity that the parent methodology has admitted as materially exposed to the AI economy. It is an equity-market representation of the public AI economy, not a measure of the AI economy itself. Explicitly, UGAI does not measure AI industry revenue, AI's contribution to GDP, compute consumption, token usage, model capability, physical infrastructure production, private-company valuations, or the profitability of AI adoption inside non-member businesses. Because admitted companies may carry substantial non-AI business, and because market prices embed expectations, discount rates, and flows unrelated to AI, UGAI's level and changes must not be presented as a valuation of AI activity. This limitation is part of the published definition, not a footnote.

UGAI does not decide which companies are AI companies, which listing represents a company, what a company's exposure tier is, or what its base weight is. Those decisions belong to the parent methodology. UGAI defines what happens after a valid parent snapshot exists: how the snapshot becomes index holdings, how those holdings are valued daily, how corporate actions and universe changes are absorbed without fictitious returns, how the result is converted to the index currency, and how the series is published, versioned, corrected, and reconstructed.

## Primary Question

> How is the global AI economy performing?

UGAI's answer is the percentage change in the index level over a stated period, computed from a defined constituent portfolio. "Performing" therefore means equity-market performance of admitted public companies. The index is not adjusted for the share of each company's business that is AI-related; the parent universe's evidence requirements govern admission, and capitalization governs weight. Two consequences are disclosed with every use of the series: diversified members contribute their whole admitted equity value, and market moves driven by factors other than AI are included.

## Parent Universe Inheritance

UGAI consumes the following from each parent universe version, without modification:

- **Universe version identifier** and its effective timestamp and publication timestamp.
- **Constituent companies**: the admitted membership of that version.
- **Representative securities**: one listing per company, with the identifiers and price currency the parent recorded.
- **Base weights** `w_i`: the parent's issuer-capped, accessible free-float weights, summing to one across members.
- **Classifications**: activity tags and exposure tiers, carried for attribution and reporting only; they do not affect calculation.
- **Company identity continuity** across corporate actions, as determined by the parent's corporate-action and exceptional-event rules, including event snapshots that remove a member between scheduled reviews. An event snapshot is consumed for membership, identity, and removal timing; its renormalized event-snapshot weights are not a UGAI reset input (see [Universe Versions and Rebalances](#docs-universe-versions-and-rebalances)).

A parent version is consumed only after it is published as valid. UGAI never selects from a draft, backfilled, or corrected parent snapshot for a date on which that snapshot was not yet the published version; a parent correction produces a UGAI correction under [Corrections and Restatements](#docs-corrections-and-restatements), not a silent recomputation. If the parent methodology or its taxonomy changes, historical UGAI observations remain tied to the parent methodology version and universe version that were effective at the time. UGAI carries its own methodology version independently (see [Methodology Versioning](#docs-methodology-versioning)).

The parent's quarterly reconstitution is the only source of scheduled membership change. UGAI performs no eligibility review of its own.

## Return Series

Three series types were evaluated:

- **Price return** measures constituent price movement only. It is the form in which equity markets are ordinarily quoted, requires no dividend assumptions, and is directly comparable across market indices. It omits distributions, so it understates the return an investor would have earned.
- **Gross total return** reinvests ordinary cash distributions across the index on their ex-dates with no tax deduction. It measures the full economic return of the constituent portfolio before taxes and is investor-independent, but it is not directly achievable by any taxed investor.
- **Net total return** reinvests distributions after an assumed withholding tax. The assumed rates depend on the investor's jurisdiction and treaty position; providers publish several variants for that reason. No single net series is universally canonical.

**Selected proposal.** Urdais publishes two series from the same holdings and divisor:

1. **UGAI** (the headline, price return). The published level, percentage changes, and time series labelled "UGAI" are the price-return series. Rationale: the product's primary display is percentage change over periods, which users compare with quoted market indices; the headline should therefore carry the same economic content as those quotes and no dividend or tax assumption.
2. **UGAI Total Return** (companion, gross total return). Published alongside the headline, labelled distinctly, for users who need the full pre-tax economic performance of the constituent portfolio.

No net-return series is proposed for launch. A net series would require a stated reference investor and a maintained withholding-rate table; that is a possible future extension, listed under open questions, and it would be an additional labelled series rather than a redefinition of the headline. Local-currency and currency-hedged variants are likewise out of scope.

The price-return and gross-total-return series may diverge according to the distribution characteristics of the constituent universe, which are not known before a production universe exists. They are therefore maintained as distinct series with distinct identifiers, and neither may be substituted for the other in publication or history.

## Index Calculation

UGAI is a divisor-based, base-weighted aggregative index (the Laspeyres form used by the researched providers): the index level is the market value of a fixed portfolio of index shares divided by a divisor that is adjusted only for non-market events.

Notation, for calculation day `t` and constituent representative security `i`:

- `q_i,t`: index shares of security `i` effective for day `t` (constant between resets and events; see [Index Shares](#docs-index-shares)).
- `P_i,t`: the raw official closing price published for representative security `i` for day `t` by its exchange or the approved market-data source, expressed in the security's stated price currency and units, or the carried price defined in [Missing Data and Market Disruptions](#docs-missing-data-and-market-disruptions). It is the observed close as published, not a historically back-adjusted series. UGAI never rewrites an observed close; every corporate-action effect enters through the index-share and divisor adjustments defined in [Corporate Actions](#docs-corporate-actions).
- `X_i,t`: the reference exchange rate for day `t`, expressed as USD per one unit of the price currency of `i` (see [Currency](#docs-currency)).
- `MV_t = Σ_i q_i,t × P_i,t × X_i,t`: index market value in USD.
- `D_t`: the divisor effective for day `t`.

The price-return level is:

`UGAI_t = MV_t / D_t`

The level for day `t` depends only on quantities and divisor known before the open of day `t` and on prices and exchange rates observed for day `t`. All corporate-action, universe, and divisor changes are applied after the close of day `t − 1` so that they are effective for day `t`; none is applied intraday.

The **as-of weight** of a constituent on any day is `w_i,t = q_i,t × P_i,t × X_i,t / MV_t`. It equals the parent base weight only at the close on which index shares were last set at a scheduled reset, and drifts thereafter. As-of weights are the constituent weights UGAI publishes for an observation date; they are distinct from the parent's base weights and from the parent's event-snapshot weights (see [Universe Versions and Rebalances](#docs-universe-versions-and-rebalances)).

Calculation uses unrounded values throughout. Published levels are rounded for display; a rounded value is never an input to a subsequent calculation.

## Index Shares

The parent universe produces an allocation, for example 8%, 6%, 4%, and so on. UGAI translates that allocation into operational quantities once per reset and then holds the quantities fixed, so that weights evolve with prices.

At a reset effective for day `s + 1` (that is, applied after the close of day `s`), with the incoming parent base weights `w_i` and the closing values of day `s`:

`q_i,s+1 = w_i × MV_s / (P_i,s × X_i,s)`

where `MV_s` is the index market value at the close of day `s` under the outgoing composition. By construction the incoming portfolio has the same market value as the outgoing one at the same prices, so the reset itself produces no change in the index level and no divisor change beyond the rounding treatment below. A security added by the reset starts from `q = 0`; a security removed ends at `q = 0`.

Index shares are stored at a fixed decimal precision that is an **unresolved** operational parameter. Whatever the precision, the divisor absorbs the rounding so that the index level is continuous:

`D_s+1 = D_s × Σ_i q_i,s+1 × P_i,s × X_i,s / MV_s`

Index shares are not shares outstanding, not free-float shares, and not a claim about any company's share count. They are the quantities that reproduce the parent's base weights at the reset close, and they change only at scheduled resets, at parent event snapshots (where only the removed security's index shares change, to zero), and through the corporate-action share adjustments defined below. Changes in a company's shares outstanding or free float between resets do not change `q_i`; they reach UGAI only through the parent's next base-weight snapshot. This is a deliberate simplification relative to providers that update index shares for large issuance between reviews; its cost (a temporarily stale representation of a company's float) and its benefit (index shares are fully determined by the parent snapshot and announced corporate-action terms) are both disclosed. Revisiting it is an open question.

## Weight Drift

Between resets, constituent weights drift with relative price and currency movements and are not corrected. If a constituent's target weight at the reset was 8% and its price subsequently rises so that its as-of weight is 10.4%, UGAI carries 10.4% until the next scheduled reset. No daily, weekly, or threshold-triggered re-weighting occurs, and the parent's issuer cap is not re-applied between resets. A market index that continuously forced weights back to targets would embed a trading rule and would not represent the market-value evolution of the admitted portfolio.

The cap therefore binds only at scheduled resets. Between resets, published concentration statistics report as-of weights; the base weights that produced them remain available from the parent snapshot. An exceptional parent deletion between resets does not interrupt drift: the deleted member leaves, surviving index shares are unchanged, and surviving as-of weights continue from their drifted state (see [Universe Versions and Rebalances](#docs-universe-versions-and-rebalances)).

## Universe Versions and Rebalances

Two distinct processes must not be conflated:

- **Universe reconstitution** is the parent's quarterly review of membership, classifications, representative securities, and base weights. It produces a new universe version with an announcement timestamp and an effective timestamp. UGAI does not perform it.
- **UGAI rebalance** (the scheduled reset) is the operational reset of index shares to the new base weights, applied after the close of the last calculation day before the parent effective timestamp, using that day's closing prices and exchange rates as in [Index Shares](#docs-index-shares).

Each scheduled parent version therefore produces exactly one scheduled UGAI reset, on the parent's quarterly cadence. At the reset:

1. Departing securities are removed at their closing price on the implementation day; index shares go to zero.
2. Incoming securities are added with index shares computed from their closing price on the implementation day.
3. Continuing securities have index shares recomputed from the new base weights, including any change of representative security the parent has decided.
4. The divisor is set so that the level is unchanged at the implementation close.

Parent **event snapshots** (exceptional deletions and other between-review events the parent methodology defines) change UGAI membership but do not trigger an unscheduled rebalance of surviving UGAI holdings. The event snapshot is authoritative for membership, company identity, and removal timing. At the parent's effective time, applied after the close of the last calculation day before it:

1. The affected securities are removed at the parent's decision price; their index shares go to zero. No replacements are inserted.
2. The divisor is reduced by the removed market value so that the removal produces no fictitious return (see [Additions and Deletions](#docs-additions-and-deletions)).
3. Surviving index shares are unchanged. Surviving as-of weights continue from their existing drifted state; they are not reset to the parent's event-snapshot weights.
4. The next scheduled quarterly reset restores the parent's target weights for the version then effective.

The parent methodology renormalizes the surviving base weights and reapplies its issuer cap in the event snapshot. Those event-snapshot weights are the parent's canonical allocation for downstream consumers whose methodologies call for them; they are not a UGAI reset input. Holding surviving index shares fixed does not reproduce them, because UGAI's weights will already have drifted through price and exchange-rate movement since the last reset, and the parent's cap reapplication is not a proportional operation. Reproducing them would be an unscheduled rebalance, which this methodology does not perform.

Four quantities are therefore distinct and must not be conflated:

- **Parent base weights:** the scheduled parent version's capped allocation, and UGAI's only reset input.
- **Parent event-snapshot weights:** the parent's renormalized allocation after an exceptional deletion, consumed by UGAI for membership, identity, and timing only.
- **UGAI index shares:** the fixed quantities set at the last scheduled reset, changed only by corporate-action share adjustments and by removals.
- **UGAI as-of weights:** the drifted weights implied by index shares at an observation date's closing prices and exchange rates, which are the weights UGAI publishes.

The parent's announcement must precede the UGAI reset. If a parent version is announced without enough lead time to implement it by its effective timestamp, UGAI continues on the previous version and implements at the earliest close after the announcement, and the delay is published; the minimum lead time is an **unresolved** parameter shared with the parent's operational calendar.

## Currency

UGAI is calculated and published in **USD**. Selection rationale: the parent's capitalization inputs are already normalized to USD; USD is the currency in which global equity benchmarks are most commonly compared; and a single index currency keeps one canonical series. USD is a reporting choice, not a claim that constituents trade in USD; each constituent is valued in its own price currency and converted.

Conversion uses one reference exchange-rate observation per currency per calculation day, `X_i,t`, expressed as USD per unit of price currency, taken at a single global reference time. The proposed convention is a recognized end-of-day fixing at a fixed time (the researched providers use a 16:00 London closing spot fixing); the exact source, fixing time, licensing, and fallback rules are **unresolved** launch parameters. The same observation converts prices, dividends, and corporate-action cash amounts dated `t`. Bid, ask, or mid conventions must be specified with the source and applied consistently; orientation (USD per unit, never inverted per currency) must be validated on ingestion.

If a fixing for day `t` is not published for a currency, the last published fixing is carried forward and the observation is flagged stale (see [Missing Data and Market Disruptions](#docs-missing-data-and-market-disruptions)). A currency redenomination is applied as a unit change in the price currency: the observed prices and the exchange rate change by reciprocal factors on the effective date, index shares are unchanged, and the divisor is unchanged. Observed closes are retained as published in each unit; the redenomination factor is recorded against the security's price history, not applied to stored closes, so that pre- and post-event prices remain comparable.

Because constituent markets close at different times, a price observed at a local close and an exchange rate observed at the reference time are not simultaneous. This is the standard convention of the researched global indices and is accepted here; it is disclosed as a limitation rather than corrected with estimated rates.

## Global Market Timing and Calendar

A UGAI calculation day `t` is a calendar date. The value published for `t` uses, for each constituent, the official closing price of its listing's session dated `t` in the exchange's local calendar, and the reference exchange rate dated `t`. Asian, European, and American sessions dated `t` all belong to the same UGAI day even though they close at different UTC times. The level for `t` can be calculated only after the last constituent market with a session on `t` has closed and the reference exchange rates for `t` are available; it is never calculated from a partially closed set of markets.

Proposed calendar: UGAI is calculated on every Monday to Friday on which the reference exchange-rate fixing is published, and is not calculated on weekends. On a calculation day when a constituent's exchange is closed for a local holiday, that constituent's most recent official close is carried forward and marked as a valid prior close, and the exchange rate for `t` is still applied. A day on which no constituent market held a session is still a calculation day if the fixing exists, and is flagged as having no price activity. Exact treatment of half-days, unscheduled closures, and the days on which the fixing is not published is **unresolved**.

Look-ahead is prohibited: the value for `t` uses no price, exchange rate, corporate-action term, or universe version whose publication time is after the calculation cutoff for `t`. A corporate action known only after that cutoff is applied prospectively or corrected under the correction rules; it is not inserted into the already published `t`.

## Dividends

Dividend treatment is a methodology rule, not an implementation detail; it determines the difference between the two series.

- **Ordinary cash dividends** (regular distributions, including regular capital repayments the issuer treats as part of its distribution policy) are not reflected in the price-return series. In UGAI Total Return they are reinvested across the whole index on the ex-date, gross of withholding tax, converted at `X_i,t` for the ex-date `t`:

  `DP_t = Σ_i q_i,t × d_i,t × X_i,t / D_t`

  where `d_i,t` is the gross ordinary cash dividend per share of `i` going ex on `t` (zero otherwise), and

  `UGAI_TR_t = UGAI_TR_t−1 × (UGAI_t + DP_t) / UGAI_t−1`

  Reinvestment is across the index, not into the paying security, so index shares do not change.
- **Special cash dividends and capital repayments outside the regular policy** are treated as capital events in both series: the adjusted reference price is the cum-price less the gross amount, and the divisor is reduced so that the ex-date price drop attributable to the distribution does not lower the index level (see [Corporate Actions](#docs-corporate-actions)). The observed ex-date close is not altered. They are not additionally reinvested in the total-return series.
- **Classification** of a distribution as ordinary or special follows the issuer's own characterization corroborated by the exchange or corporate-action source; where they conflict, the parent's source hierarchy applies and the decision is recorded.
- **Undeclared amounts**: if the amount is not confirmed by the ex-date, no estimate is applied; when confirmed, the dividend points are applied on the next calculation day as a labelled late reinvestment, without restating earlier levels. Whether to permit vendor or prior-period estimates is an open question.
- **Retracted or changed dividends** produce a negative or positive adjustment on the day the change is known, applied to the total-return series only.
- **Scrip, optional, and stock dividends** follow the corporate-action rules below; a cash election with a default is applied at the default.

No withholding-tax table is required for launch because no net series is published.

## Corporate Actions

Company identity, membership, and representative-security decisions are the parent's. UGAI's task is to preserve economic continuity: a corporate action must change the index level only to the extent it changes the market value an index holder would experience. Adjustments are applied after the close of the day before the ex-date or effective date, so they are effective for the ex-date. The event, terms, source, effective time, adjusted quantities, and divisor change are recorded for every action.

Observed prices are never rewritten. `P_i,t` remains the raw official close on every day, including the ex-date. Where a treatment below refers to an adjusted price, that value is the **adjusted reference price**: a methodology-derived quantity computed from the cum-price and the action terms, used only to establish the post-event market value at the cum close and hence the index-share and divisor adjustments. It is recorded against the corporate action, not stored as a price, and it does not replace an observed close. The same applies to a theoretical ex-price or an entitlement value where an action requires one. Index continuity is therefore the sum of four separately recorded components: the raw official close, the UGAI corporate-action treatment (the derived reference values), the index-share adjustment, and the divisor adjustment. UGAI must not consume a vendor's historically back-adjusted price series and then apply these adjustments again; where a source delivers adjusted prices, the unadjusted official close must be recoverable and is the value ingested.

For each action, the treatment is stated as: adjusted reference price, index-share adjustment, divisor adjustment. Let `A` shares held receive `B` new shares, `S` be a subscription price, and `P` the cum-price (the raw official close before the ex-date).

- **Stock split, reverse split, bonus issue, stock dividend in the same security:** `q × (A + B) / A` (or the split ratio); adjusted reference price `P × A / (A + B)`; market value unchanged at the cum close; **no divisor change**.
- **Ordinary cash dividend:** no price or share adjustment; **no divisor change**; total-return reinvestment as above.
- **Special cash dividend, capital repayment:** adjusted reference price `P − amount`; index shares unchanged; **divisor decreases** by `q × amount × X / UGAI`.
- **Rights issue or entitlement offer (in the money, `S < P`):** treated as fully subscribed. Adjusted reference price `(A × P + B × S) / (A + B)`; `q × (A + B) / A`; **divisor increases** by the subscription value `q × (B / A) × S × X / UGAI`. Out-of-the-money or unpriced rights: no adjustment. Rights lines are not added as separate holdings.
- **Stock distribution of another listed security, spin-off, demerger:** the distributing company's adjusted reference price is its cum-price less the value of the distribution. The distributed security is not a universe member and is not admitted by UGAI; to avoid a fictitious loss, it is held as a **temporary distribution line** valued at the first available official price (or the value implied by the distributing company's cum/ex price drop until it trades), with no divisor change on the ex-date. The distribution line is removed at its closing price at the next scheduled reset, or earlier if it ceases to trade, with a divisor reduction; if the parent admits the new company at that reset, the line is replaced by ordinary index shares. A distribution that will not list, or for which no value can be established, is removed at zero with the distributing company's reference-price reduction reversed to the extent evidenced; the maximum holding period for an unpriced line is **unresolved**.
- **Merger or acquisition of a member:** the target is removed at the parent's effective time at its last official close, or at the offer terms if it is not trading; **divisor decreases** by its market value. If the acquirer is a member and consideration includes acquirer shares, the acquirer's index shares increase by the shares an index holder of the target would receive at the terms, and the divisor adjustment nets the two effects. A non-member acquirer's shares are not added. Cash consideration is not reinvested in the price-return series and is not treated as a dividend.
- **Share issuance, buybacks, placements, lock-up expiries, cancellations:** no index-share change between resets; captured at the next parent base-weight snapshot.
- **Representative-security substitution for the same economic claim** (share-class conversion, depositary receipt to underlying, listing migration decided by the parent): the incoming line takes `q × conversion ratio`, priced so that market value is continuous at the switch close; **no divisor change** if value is preserved at the terms, otherwise the divisor absorbs the difference. Price currency changes flow through `X`.
- **Ticker, name, identifier, or exchange change without a change of claim:** identity preserved; no economic adjustment; listing details updated.
- **Delisting, cancellation, liquidation, bankruptcy:** removed at the parent's effective time at the last official close, or at the parent's decision price (which may be a nominal zero) if no reliable price exists; **divisor decreases** accordingly. Liquidation distributions received before removal are treated as capital repayments.
- **Trading halts and suspensions:** the last official close is carried and flagged; no adjustment until the parent decides removal or trading resumes.

Any action not listed is treated by analogy to the closest listed case with the objective stated above. A treatment for an unlisted or novel corporate action must be documented and justified against the economic-continuity principle and, where practicable, published before application. If the treatment is expected to recur or establishes a new general rule, it must subsequently be incorporated into the methodology through a versioned methodology amendment under [Methodology Versioning](#docs-methodology-versioning); an operational precedent does not become a rule by repetition. No action is applied on estimated terms except where this document says so explicitly.

## Additions and Deletions

A membership change is not an investment return. Whether at a scheduled reset or a parent event snapshot:

1. The outgoing composition is valued at the implementation close: `MV_before`.
2. Departing securities are removed and incoming securities added at the same closing prices and exchange rates, producing `MV_after`.
3. The divisor is adjusted so that `MV_before / D_before = MV_after / D_after`.

The level at the implementation close is therefore identical before and after the change, and the next day's return reflects only price and exchange-rate movements of the new composition. A security added at a reset enters at its closing price, not at any earlier or announced price; a security removed leaves at its closing price or the parent's decision price. No index jump is created or suppressed. At a parent event snapshot there are no incoming securities and surviving index shares are not recomputed; the only quantity change is the removed security's index shares going to zero.

## Divisor

The divisor is the scaling factor that converts the index market value into a readable level and, more importantly, absorbs every change in market value that is not investment performance. It exists so that the level is continuous across events that alter the composition or quantities of the portfolio without altering what an index holder actually earned.

The divisor changes, after the close and effective for the next day, when:

- a security is added or removed (resets, event snapshots, distribution-line removals);
- index shares change in a way that changes market value at constant prices (rights issues, share consideration in mergers, index-share rounding at resets);
- a capital event adjusts a price without an offsetting share change (special dividends, capital repayments, spin-off price reductions when the distributed value is not held).

The divisor does not change for market price movements, exchange-rate movements, ordinary dividends, splits and other value-neutral share and price adjustments, or weight drift.

General rule, with all values at the closing prices and exchange rates of day `t`:

`D_t+1 = D_t × MV_t^after / MV_t^before`

Equivalently, in additive form, `D_t+1 = D_t + ΔMV_t / UGAI_t`, where `ΔMV_t` is the net change in market value introduced by the events effective for `t + 1`. Several events on the same day are combined into one divisor change.

Example (values illustrative, not a claim about any company): suppose `UGAI_t = 1,250.00`, `MV_t = USD 2,500,000,000,000`, so `D_t = 2,000,000,000`. A parent event snapshot removes a security with market value USD 50,000,000,000 at the close of `t`. Then `MV_t^after = 2,450,000,000,000` and `D_t+1 = 2,000,000,000 × 2,450 / 2,500 = 1,960,000,000`. The level at the close remains `2,450,000,000,000 / 1,960,000,000 = 1,250.00`. If the security had instead simply fallen 100% in price during day `t`, the divisor would not change and the level would fall; that is performance.

The divisor is stored to full precision with each observation, and the sequence of divisor changes, each with its cause and inputs, is part of the published lineage.

## Base Value and Base Date

**Base value:** 1,000.00 on the base date. Rationale: levels are displayed to two decimal places, so the smallest displayed change is 0.01 index points. At a level of 100 that is 0.01%, one basis point; at a level of 1,000 it is 0.001%, one tenth of a basis point. A base of 1,000 therefore gives finer displayed percentage resolution than a base of 100 at launch levels. The value is otherwise economically arbitrary and carries no information; percentage changes are computed from unrounded levels regardless of the base. The initial divisor is `MV_base / 1,000`.

**Base date:** a launch parameter, **unresolved**, to be fixed only when a validated historical dataset exists. It is not selected for cosmetic reasons. Conditions for selecting it:

- point-in-time parent universe versions reproducible for every reset from the base date onward, using only information available at each historical publication time;
- official closing prices, corporate-action terms, dividend records, and reference exchange rates with adequate history, licensing, and audit trail for every historical constituent, including delisted and acquired companies;
- free-float and capitalization inputs consistent with the parent's rules for each historical snapshot;
- demonstrated absence of survivorship bias (historical constituents, not current ones) and of look-ahead bias (historical announcement times);
- a documented gap analysis for any market or period where inputs are missing.

Any series computed for dates before UGAI's first live publication is labelled backtested or reconstructed history, carries its information limitations, and is never presented as live history. Live history begins at the first published observation.

## Publication

**Proposed initial frequency: end-of-day.** One official observation per calculation day, computed after the last constituent session dated `t` has closed and the reference exchange rates for `t` are available. Intraday indicative and real-time values are possible future extensions and are not part of this proposal; nothing here should be built to support them.

Each observation carries:

- the **calculation timestamp** (when the value was computed) and the **publication timestamp** (when it was released), both in UTC;
- the **market-data cutoff** used: the latest price and exchange-rate observation times admitted;
- the applicable UGAI methodology version, parent methodology version, universe version, and parameter set;
- its status (see [Index Status](#docs-index-status)).

The target publication time relative to the last constituent close, and the latest acceptable publication time before the next day's earliest constituent open, are **unresolved**. A value not publishable by the deadline is published as delayed or unavailable rather than computed from an incomplete price set.

## Published Values and Percentage Changes

UGAI publishes, for the headline and the total-return series:

- the latest level, to two decimals for display;
- percentage change over defined periods (one day, week to date, month to date, year to date, one year, and since base), computed from unrounded levels of the relevant observations and shown to a stated precision;
- the historical time series of levels and daily percentage changes;
- the methodology version, universe version, and last-updated timestamp;
- as-of constituent weights for the observation date, and the parent base weights and universe version from which the index shares were last set.

Percentage change is the primary market signal. Point change (the arithmetic difference between levels) is not a defined product signal: it depends on the arbitrary base value and is not comparable across indices or over time. The level is retained for continuity and for computing changes.

## Historical Integrity and Lineage

Every published observation must be traceable through:

UGAI Observation → UGAI Methodology Version → AI Equity Universe Version → Index Shares and Divisor → Prices, Exchange Rates, Corporate Actions, Dividends → Original Sources

For any historical date, it must be possible to list the constituents, their index shares, closing prices and sources, exchange rates and source, the divisor and the divisor changes since the previous reset, the dividends reinvested, and the status of every input (observed, carried, stale). A historical level must never change because a company's classification, the parent taxonomy, or the parent's parameters changed later; those changes take effect at their own effective dates.

Retain, for each input, the source, publication or access timestamp, and vintage. Retain rejected and superseded inputs alongside the ones used. Reproducibility depends on licensed retention rights for historical market data; where retention is not permitted, the limitation is recorded and the affected observations are marked as not independently reproducible.

## Corrections and Restatements

Distinguish the following, each with its own record:

- **Data correction:** an input (price, exchange rate, dividend, share count, corporate-action term) was wrong or missing at calculation time and a corrected value is later available.
- **Methodology error:** the rules were applied incorrectly (wrong adjustment, missed event, wrong divisor).
- **Vendor correction:** a licensed source revises a previously delivered value.
- **Late corporate-action correction:** an action's terms or timing became known after the affected observation was published.
- **Index restatement:** republication of previously published observations with corrected values.

These are not: an ordinary reset (planned change), new information effective prospectively (a newly announced dividend applied on its ex-date), or a methodology amendment (a versioned rule change with a future effective date).

Proposed handling: an error detected within the correction window is corrected by restatement of the affected observations, each restated value carrying the original value, the reason, the detection and republication timestamps, and the status **Corrected**, while the original remains retrievable as **Superseded**. Outside the correction window, history is ordinarily left as published and the error is corrected prospectively through a divisor or dividend-point adjustment on the next calculation day, with a published notice, so that the series remains continuous from the correction forward; an ordinary error does not reopen published history once the window has closed.

An **exceptional historical restatement** may nevertheless be made where the error materially compromises the integrity, interpretability, or reproducibility of the historical series, such that prospective correction alone would leave the published history materially misleading or non-replicable (for example, a divisor applied to the wrong composition over an extended period, or observations that cannot be reproduced from their recorded lineage). This is a high bar, not a discretion to tidy small errors. Any exceptional restatement must be documented publicly; identify the affected observations; preserve the original published values as **Superseded**; record the reason and the approval; and publish the corrected values as a distinct restatement event with the status **Corrected**. The hierarchy is therefore: inside the window, ordinary restatement; outside the window, prospective correction; and only for an integrity or reproducibility failure, exceptional restatement.

The length of the correction window, and the materiality threshold below which a prospective adjustment is used regardless of timing, are **unresolved**. Under every treatment, history is never silently overwritten and the pre-correction publication metadata is retained.

## Missing Data and Market Disruptions

Inputs can be absent for different reasons, which must be recorded and treated differently:

- **Valid prior close (market holiday):** the constituent's exchange had no session on `t`. Carry the last official close; mark as valid prior close; not an error.
- **Stale observation:** the exchange held a session on `t` but no official close was received, or the exchange rate fixing was not published, by the calculation cutoff. Carry the last official value; mark stale; publish the observation as delayed if stale inputs exceed the tolerance.
- **Missing observation:** the source has no value for `t` and none can be carried (for example a new listing with no prior close). Do not impute; the observation is unavailable until resolved.
- **Suspended security:** the exchange has halted trading. Carry the last official close, mark suspended, and apply no adjustment until the parent's exceptional review decides continuation or removal.
- **Data-provider outage:** inputs are unavailable across many securities or currencies. Publish delayed or unavailable; do not substitute alternative sources without a documented fallback rule.
- **Unresolved corporate action:** terms or effective date are unconfirmed at the cutoff. Do not apply an estimated adjustment; if the ex-date passes unadjusted, correct under the correction rules once confirmed.
- **Reference-data conflict:** identifier, currency, or ratio conflicts between sources. Withhold the affected security's update, flag it, and resolve under the parent's source hierarchy.

Arbitrary imputation is prohibited. The stale-input tolerance (by count and by weight) that converts a published observation into a delayed one, and the duration after which a stale price triggers escalation, are **unresolved**.

## Index Status

Each observation carries one status:

- **Published:** computed from a complete admitted input set and released on schedule.
- **Delayed:** not yet released, or released after the deadline, because inputs were stale or incomplete; the last published observation remains the latest valid value with its original date.
- **Unavailable:** no valid observation can be produced for the day; the gap is recorded rather than filled.
- **Corrected:** restated after publication; carries the original value and reason.
- **Superseded:** the original version of a corrected observation, retained for lineage.

Downstream displays must distinguish these states and must not present a delayed or unavailable day as a zero change.

## Data Requirements

Conceptual objects UGAI requires. These describe information, not storage:

- **UGAIObservation:** date, series (headline or total return), level, daily change, status, calculation and publication timestamps, market-data cutoff, UGAI methodology version, parent methodology version, universe version, parameter set, divisor.
- **UGAIConstituentSnapshot:** for a date, each constituent's company and security identity, index shares, raw official closing price and currency, exchange rate, USD market value, as-of weight, parent base weight, input statuses, and any distribution line held.
- **IndexShare:** a security's index shares with effective interval and the reset, event, or corporate action that set them.
- **IndexDivisor:** the divisor with effective interval and, for each change, the cause, the before and after market values, and the inputs.
- **SecurityPrice:** raw official closing price per listing per day as published, currency and units, source, timestamp, and session status (traded, holiday, halted); stored unadjusted, with no back-adjustment applied.
- **FXObservation:** reference rate per currency per day, orientation, source, fixing time, and status (published, carried).
- **CorporateAction:** issuer, security, type, terms, cum and ex dates, effective time, source, confirmation status, the UGAI treatment applied, and any adjusted reference price, theoretical ex-price, or entitlement value derived for it.
- **Dividend:** security, amount, currency, classification (ordinary or special), ex-date, confirmation status, and reinvestment record.
- **UniverseVersion:** reference to the parent version consumed, with its effective and publication timestamps.
- **MethodologyVersion:** UGAI methodology and parameter-set identifiers with effective dates and change records.

## Source Specification

UGAI will require these source families. Authoritative or licensed structured data is required for production; scraping retail finance websites is not an acceptable production data model.

- **Parent AI Equity Universe data:** published universe versions with membership, representative securities, base weights, and event snapshots.
- **Security reference data:** identifiers (ISIN, exchange MIC, local ticker), price currency, receipt ratios, listing status, and identity changes, from exchanges, depositaries, or a licensed reference-data provider.
- **Local equity prices:** official closing prices per listing from the exchange or a licensed market-data provider, with session status.
- **Corporate actions and dividends:** issuer and exchange notices and a licensed corporate-action feed, reconciled under the parent's source hierarchy.
- **Exchange rates:** a licensed end-of-day fixing at the reference time.
- **Exchange calendars:** trading days, holidays, and scheduled half-days per venue.
- **Shares outstanding and free float:** not consumed daily; they enter through the parent's base weights at resets.

## Data Quality Rules

Before an observation is published, at minimum:

- **Security identity:** each constituent maps to exactly one representative security, one listing, and one price currency; no duplicate economic claim.
- **Price currency and units:** the price currency matches the reference data; unit conventions (for example pence versus pounds) are validated.
- **Stale prices:** sessions marked traded have an official close; carried prices are flagged with their age.
- **Exchange-rate orientation:** each rate is USD per unit of price currency; inverted or absent rates block publication.
- **Split and action adjustments:** pre- and post-action raw closes, derived reference values, and index shares are consistent with the terms; market value is continuous across value-neutral events; no ingested close is a back-adjusted value.
- **Duplicate listings:** no security appears twice; distribution lines are identified as such.
- **Corporate-action timing:** adjustments are effective on the ex-date and not before or after.
- **Weights:** as-of weights sum to one; base weights at a scheduled reset match the parent snapshot.
- **Divisor continuity:** the level before and after every after-close change is identical at constant prices.
- **Implausible moves:** a constituent or index daily change outside a tolerance is held for review before publication.
- **Missing observations:** counts and weights of carried, stale, or missing inputs are within tolerance.

Numerical tolerances for implausible moves, stale-input limits, and reconciliation differences require production data and are **unresolved**.

## Methodology Versioning

UGAI has its own methodology version, independent of the parent's. Each observation identifies:

- `ugai_methodology_version`
- `ai_equity_universe_methodology_version`
- `universe_version`
- the UGAI parameter set (base date, fixing convention, tolerances, correction window) once resolved.

A change to UGAI's rules, parameters, or calendar is announced with a prospective effective date and a documented rationale and impact assessment; it does not alter observations before that date. A change to the parent methodology reaches UGAI only through a new universe version and does not by itself change UGAI's version. Editing this public page is not a production change.

Version history: **0.1.0-draft, 12 September 2026**, initial research-backed proposal, amended in review on 12 September 2026 before merge (exceptional-deletion mechanics, base-value rationale, return-series divergence wording, raw official close definition, novel-action governance, as-of weight terminology, MSCI special-dividend precedent wording, exceptional historical restatement rule); no production effective date.

## Relationship to UAVI

[UAVI](/docs/methodology/uavi), the proposed Urdais AI Volatility Index, is a sibling output. It inherits constituent base weights from the parent AI Equity Universe snapshot, applies its own options-eligibility filter, and renormalizes the surviving base weights, exactly as the parent methodology specifies. UAVI inherits the canonical AI Equity Universe base weights, not UGAI's index shares or as-of (drifted) weights. UAVI does not consume UGAI's as-of weights, index shares, divisor, or price series unless a future UAVI methodology explicitly decides otherwise. UGAI is not an input to UAVI, and UGAI's daily price movements must not become an implicit dependency of UAVI through shared data structures. No options methodology is defined here.

## Open Questions / Empirical Validation Required

No production observation may be published under this draft. The following require production data, licensing decisions, or historical testing, and are recorded here rather than resolved by assumption:

- **Production base date:** selected only after the conditions in [Base Value and Base Date](#docs-base-value-and-base-date) are met.
- **Exchange-rate fixing:** source, fixing time, bid/ask/mid convention, licensing, and fallback rules.
- **Calendar and timestamps:** the exact calculation cutoff, publication target and deadline, treatment of days without a fixing, half-days, and unscheduled closures.
- **Stale-price and stale-rate tolerances:** counts, weights, and durations that convert a publication into delayed or unavailable status, and the escalation path for prolonged suspensions.
- **Correction window and materiality threshold:** the period within which restatement is used and the size below which prospective adjustment applies.
- **Index-share precision:** decimal precision of stored index shares and the resulting divisor rounding treatment.
- **Dividend confirmation:** whether estimated amounts may ever be applied, and the late-reinvestment procedure.
- **Distribution lines:** valuation hierarchy and maximum holding period for unpriced spin-off lines.
- **Index shares between resets:** whether large between-reset issuance should adjust index shares before the next parent snapshot, with the resulting divisor rules.
- **Reset lead time:** the minimum interval between parent announcement and UGAI implementation, shared with the parent calendar.
- **Data providers:** licensed sources for prices, corporate actions, exchange rates, and calendars, with historical retention rights adequate for reproducibility.
- **Additional series:** whether and under which reference-investor convention a net total return series, local-currency series, or hedged series should be added as labelled companions.

Parent-universe parameters that remain unresolved (the material exposure threshold, the issuer cap, investability minima, the access register) are not repeated here; UGAI depends on them only through the published parent versions.

## Research Precedents

Primary sources retrieved and checked on 12 September 2026 are summarized below. Each entry states the provider's rule, its relevance to UGAI, and the decision taken for this proposal. The cited editions are precedents, not incorporated rules.

### S&P Dow Jones Indices, Index Mathematics Methodology

The [Index Mathematics Methodology](https://www.spice-indices.com/idpfiles/spice-assets/resources/public/documents/methodology-index-math.pdf) (November 2014 edition as retrieved; a current edition is maintained on the provider's site) defines the capitalization-weighted level as the sum of price times index shares divided by a divisor, describes the divisor as the scaling factor adjusted "after the close" so that additions, deletions, share-count changes, special dividends, and rights offerings do not change the level, gives the multiplicative and additive divisor-adjustment forms, and builds total return from daily index dividend points converted through the price-index divisor. **Adopt:** divisor form, after-close adjustment, multiplicative and additive equivalence, dividend-points construction of total return. **Modify:** index shares derive from parent base weights rather than float shares outstanding. **Reject:** capped-index buffer mechanics between rebalances, which would re-impose the cap on drifted weights.

### MSCI, Index Calculation Methodology

The [MSCI Index Calculation Methodology](https://www.msci.com/indexes/documents/methodology/0_MSCI_Index_Calculation_Methodology_20250826.pdf), August 2025, sections 1–2 and Appendix X, calculates a chain-linked Laspeyres price index from end-of-day number of shares, inclusion factors, a price adjustment factor, and an exchange rate expressed as foreign currency per USD, and provides the equivalent divisor formulation. Daily total return reinvests regular cash distributions on the ex-date (section 2.2). Special cash dividends affect the price index only when unusually large, at or above 5% of the security's price when confirmed, through a price adjustment factor; smaller special dividends are reinvested in the total-return indexes only, and a special dividend paid for three consecutive years enters the security's yield calculation rather than the price index. Capital repayments deemed extraordinary relative to the company's distribution policy receive the price adjustment regardless of size (sections 2.2.4–2.2.5). Gross series reinvest before tax; net series apply the maximum withholding rate for non-resident institutional investors. Appendix III records use of 16:00 London closing spot rates for all markets; Appendix VII specifies official exchange closing prices per market. **Adopt:** ex-date reinvestment, the regular-versus-special distribution split, official closing prices, a single global fixing time. **Modify:** UGAI applies the capital-event treatment to every special dividend and non-regular capital repayment regardless of size, rather than MSCI's 5% threshold and recurrence rule, so that the distinction rests on the issuer's characterization alone; USD-per-unit orientation; one series pair rather than local, USD, gross, and net variants. **Reject for launch:** net series tied to a reference-investor withholding table.

### FTSE Russell, Corporate Actions and Events Guide for Market Capitalisation Weighted Indices

The [guide](https://www.lseg.com/content/dam/ftse-russell/en_us/documents/policy-documents/corporate-actions-and-events-guide.pdf), v7.0, August 2026, sections 2, 4, and 5, applies mandatory actions on the ex-date, tabulates divisor and price-adjustment treatment by event, reinvests ordinary dividends on the ex-date, adjusts rights only when priced at a discount at the cum close and assumes full subscription, uses temporary lines for highly dilutive rights and spin-offs, values spin-offs by a stated hierarchy (when-issued price first), deletes targets at the last traded price or offer terms, removes non-trading bankrupt constituents at a nominal price, and updates shares and float quarterly with intra-quarter thresholds for large offerings. **Adopt:** ex-date timing, in-the-money rights test with full subscription, spin-off valuation hierarchy and temporary line, target deletion rule, nominal-price removal when no price exists. **Modify:** distribution lines are held only until the next parent reset because membership is the parent's decision. **Reject for launch:** intra-quarter share and float updates and dividend estimation from the prior period.

### Nasdaq, Calculation Manual, Corporate Actions and Events Manual, and Index Methodology Guide

The [Calculation Manual – Equities & Commodities](https://indexes.nasdaq.com/docs/calculation_manual_equities_and_commodities.pdf) (20 May 2026) defines index security market value as index shares times price times spot rate, the price-return divisor as start-of-day market value over the prior level, gross total return through index dividend points with the dividend converted at the prior day's spot rate, net total return by country-of-incorporation withholding, and end-of-day exchange rates as the 16:00 UK closing spot rate; halted securities carry the last sale price. The [Corporate Actions and Events Manual – Equities](https://indexes.nasdaq.com/docs/corporate_actions_and_events_manual_equities.pdf) (20 May 2026) applies actions before the open on the ex-date, adjusts start-of-day price for special dividends with a divisor change, treats splits as offsetting share and price changes, removes acquired securities on completion with notice, reviews suspensions exceeding 40 business days, and removes bankrupt constituents at the last price or zero. The [Index Methodology Guide](https://indexes.nasdaqomx.com/docs/Nasdaq_Index_Methodology_Guide.pdf) (31 July 2026) calculates daily except on market holidays, uses the last sale price at market close, and announces historical corrections to clients. **Adopt:** index-share representation, halted-security carry-forward, announced corrections. **Modify:** dividends converted at the ex-date rate for consistency with prices; suspension review left to the parent. **Reject:** vendor dividend estimates for launch.

### STOXX, Calculation Guide

The [STOXX Calculation Guide](https://www.stoxx.com/document/Indices/Common/Indexguide/stoxx_calculation_guide.pdf), April 2026, sections 4, 7, 8, and 12, calculates a Laspeyres index with a unique divisor per index, derives the divisor change from the difference between closing and adjusted closing market capitalization, uses WMR closing spot rates for end-of-day levels with regional close windows, carries the previous close when a stock does not trade or the exchange is closed, implements all actions on the ex-date with published price and share adjustment formulas (including rights and stock distributions), deletes suspended stocks after ten consecutive days without an announced resumption, removes bankrupt or delisted stocks at the traded price or a near-zero value, and corrects calculation errors within the dissemination day or on the next day, restating only when performance can no longer be replicated. **Adopt:** divisor change from closing versus adjusted closing capitalization, ex-date implementation, carry-forward pricing, rule-based correction with limited restatement. **Modify:** correction window left unresolved rather than set at a fixed time of day. **Reject:** ten-day automatic suspension deletion, since removal is the parent's decision.

### Solactive, Global Artificial Intelligence Technologies Index Guideline

The [guideline](https://www.solactive.com/downloads/Guideline-Solactive-SOLAITC.pdf), v1.0, 8 October 2024, sections 1.3–1.4 and 4, sets an initial level of 1000, converts closing prices with the 16:00 London WM/Refinitiv rate and carries the last available rate when none is published, carries the most recent closing or trading price when a component has no current price, and publishes price, net total return (with a stated withholding rate), and gross total return versions calculated under the provider's separate equity index methodology. **Adopt:** base value 1,000, carried fixing when none is published, separately labelled return versions. **Modify:** USD rather than EUR index currency. **Reject for launch:** the net series and its fixed withholding assumption.
