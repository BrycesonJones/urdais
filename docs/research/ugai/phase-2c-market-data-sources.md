# UGAI Phase 2C — equity market data sources and historical rights study, 16 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It establishes no methodology, approves no source, records no permission grant, publishes no value, and commits Urdais to no vendor. It records what UGAI requires as data, what the market appears able to supply, and what the terms of supply appear to permit, as read on 16 September 2026.

**Scope note.** UGAI is a capitalization-weighted equity index of publicly traded AI companies (founder decision, reaffirmed). Nothing here revisits that. Nothing here revisits Phase 2A.

---

## Evidence provenance and how to read the quotations

This study distinguishes three kinds of statement, and the reader should hold them to different standards:

- **Fact (directly verified).** Quotations I extracted myself from the primary document, locally, and read in context. These are marked **[verified]**. They cover the Massive/Polygon Market Data Terms and the London Stock Exchange Market Data Policy Guidelines.
- **Fact (retrieved).** Statements and quotations obtained by fetching a vendor page through a retrieval summarizer rather than read by me end to end. Marked **[retrieved]**. Treat the substance as reliable and the exact wording as indicative. Every one is footnoted to its URL in section R, and every one that would change an architecture decision appears in section M as a question to put to the vendor in writing.
- **Interpretation** and **Recommendation**, always labelled as such.

**This document is not legal advice and contains none.** Where it says a clause "appears to prohibit" something, that is a reading of published terms by a non-lawyer, for the purpose of deciding what to ask a vendor and a solicitor. Every licensing conclusion that would gate an implementation decision is restated in section M as a question, not an answer.

---

## A. Executive conclusion

**UGAI cannot be sourced from a developer-tier market data API. The obstacle is not coverage, and it is not price. It is that UGAI's three defining requirements are the three things those licences most consistently forbid.**

UGAI must:

1. **Retain its inputs indefinitely.** Its own methodology requires that any published observation be reconstructible from the prices, shares, float, FX rates and corporate actions that produced it. That is a permanent retention requirement on the raw inputs, not on the output.
2. **Publish constituent-level detail.** The methodology commits to publishing as-of constituent weights alongside the level.
3. **Calculate an index and distribute it commercially.**

Against those, what the terms say:

- **Retention.** Massive (formerly Polygon.io) requires that on termination or suspension "for any reason", the customer "delete all Market Data in your possession" **[verified]**. Twelve Data requires all Data deleted within 30 days of termination, with certification on request **[retrieved]**. Tiingo draws the line precisely where it hurts most: "Derived Products that satisfy this Section may be retained after your subscription ends; Tiingo Data may not" **[retrieved]** — the index level survives, the inputs that explain it do not. A UGAI built on any of these becomes permanently unauditable the day the subscription lapses.
- **Index creation.** Massive's terms name it: the customer may not "use Market Data for non-display use or to create derivative works (including, without limitation, any index, indicative value, net asset value, investment product, financial contract ... settlement value or investment strategy) based on the Market Data unless you are licensed to do so" **[verified]**.
- **Constituent publication.** Two independent vendors impose a reconstruction test: Twelve Data permits derived data only where it "cannot be reverse-engineered to recreate the original Data" **[retrieved]**; Intrinio treats output as raw redistribution wherever a user "could infer or reconstruct the original data", and requires a display licence "whether data is raw, aggregated, **transformed**, or AI-generated" **[retrieved]**. Publishing a weight table beside a level is closer to that line than publishing a level alone.

**The decisive structural finding is that these prohibitions do not originate with the vendors.** The Massive document is a pass-through of exchange and SRO subscriber terms — it defines "Market Data" as NYSE and Authorizing SRO last sale and quotation information **[verified]**. Shopping for a more permissive developer vendor therefore does not solve the problem, because the restriction is upstream of all of them.

Upstream, it is licensed explicitly and separately. The London Stock Exchange's own policy carves derived-data licensing into categories, of which the first is an "**Indices/Benchmarks licence** — A licence for creation of Indices/Benchmarks as defined under the Benchmark Regulations", listed beside and distinct from "A licence for creation of Derived Data which is **not** Indices/Benchmarks" **[verified]**. Index creation is a named, separately licensed activity at the exchange layer.

**So the licensing stack has three layers, not one:**

| Layer | What it grants | Who grants it |
|---|---|---|
| 1. Vendor licence | Access to, and storage of, the vendor's data | Massive, Tiingo, EDI, LSEG, FactSet … |
| 2. Exchange derived-data / index licence | The right to calculate an index from that exchange's prices and distribute it | Each exchange, per exchange |
| 3. Exchange display / redistribution licence | The right to show constituent-level prices publicly | Each exchange, per exchange |

**Recommended architecture shape** (detail in K, shortlist in L): a **purchased — not rented — reference, corporate-actions, shares-outstanding and free-float dataset**, for which Exchange Data International is the leading candidate on the evidence assembled here; plus a **licensed end-of-day price source with derived-data and index rights negotiated exchange by exchange**; plus **central-bank FX**, extending interfaces Urdais already operates and has already rights-cleared for UBWI.

**Two findings that change the shape of the product, not just its plumbing:**

- **Cost scales with exchange count, because layers 2 and 3 are per-exchange.** Every additional market UGAI admits adds a licensing negotiation and a fee line. This puts the word "Global" in direct, quantifiable tension with the budget — a tension Phase 1A identified on coverage grounds and which turns out to bind harder on cost.
- **"Global" is less data-blocked than Phase 1A assumed.** EDI's coverage tables list shares-outstanding and free-float coverage for every market UGAI needs, mainland China included (Shanghai `XSHG`, Beijing `BJSE`), alongside Taiwan (`XTAI`), Korea (`XKRX`), Hong Kong (`XHKG`), Japan (`XJPX`) and Singapore (`XSES`) **[retrieved]**. The China wall is therefore an *investability and access* wall — the parent universe's venue register and foreign-ownership rules — not an absence of data. Phase 1A's finding should be narrowed accordingly.

**One regulatory clarification, because LSE's wording invites the wrong conclusion.** Publishing UGAI publicly does not by itself make Urdais a regulated benchmark administrator. Under the UK/EU Benchmarks Regulation, authorisation attaches when an index is *used* to determine amounts payable under a financial instrument or contract, or to measure a fund's performance **[retrieved]**. UGAI as an informational publication sits outside that. **Interpretation:** the exposure is prospective and asymmetric — if a third party ever references UGAI in a financial product, the obligation arrives with their decision, not Urdais's. Note also that LSE's *licence* category is defined by reference to the Benchmark Regulations' broad definition of "index", so the exchange licence may well be required even where regulatory authorisation is not. These are two different tests and must not be collapsed.

---

## B. Current backend capability map

### B.1 Verified against production

Phase 1A could not read production. **This phase did.** Read-only query against `UrdaisProd` (`cyqtaydtfuwaexjkuynq`) on 16 September 2026, via the Supabase MCP (see Q):

- **Methodologies present (6):** `model-frontier`, `open-weight-proprietary`, `ubwi`, `ucpi`, `ucpi-listed-gpu`, `utvi`. **No `ugai` row. No `ai-equity-universe` row.**
- **Instruments present (8):** `UBWI` (index, live), `UTVI` (index, live), and six `compute_price` rows (`UCPI-H100-SXM` launch_blocked; `UCPI-H100-SXM-LISTED`, `UCPI-H200-SXM-LISTED`, `UCPI-A100-SXM4-80GB-LISTED`, `UCPI-B200-LISTED`, `UCPI-RTX-5090-LISTED` proposed). **No UGAI instrument.**
- **Tables matching `ugai|equity|securit|universe|listing|divisor|corporate|constituent|weight|fx|dividend|split`: none.**

Phase 1A's conclusion is therefore confirmed rather than merely inferred: **UGAI does not exist in production in any form, and no equity-domain storage exists to put it in.**

### B.2 Equity-domain support in the codebase

Searched `src/`, `supabase/`, `scripts/` for every equity concept UGAI needs. Result: **nothing**. `ISIN` matched 28 files only as a substring of `isIn`/`raising`; `FIGI`, `CUSIP`, `SEDOL`, `shares_outstanding`, `free_float`, `adjusted_close`, `ohlcv`, `corporate_action`, `security_master`, `trading_calendar`, `exchange_mic`, `primary listing`, `delisting`, `spin_off`, `rights_issue` matched zero files each.

### B.3 What genuinely exists and is reusable

This is the useful half of the audit. Urdais has built more of the *discipline* UGAI needs than the *domain*.

| Asset | Why it matters to UGAI |
|---|---|
| `reference.methodologies` + `methodology_versions` | Version identity with `status`, `content_hash`, `effective_from/to`, and a constraint that a `draft` can carry no effective date. UGAI needs this from its first migration. |
| `reference.source_interfaces` | Two-axis gating: `terms_review_state` and `production_access_state`, with constraints that an interface cannot be `production_approved` unless terms are `permitted`, and must be `production_blocked` where terms are `not_permitted`. Exactly the right shape for vendor terms. |
| `reference.permission_grants` | A permission basis per interface, with `grant_kind` (`provider_terms`/`written_permission`/`agreement`/`order`), a `reference`, `evidence`, an `effective_from/to` interval, and a link to the retrieval that captured it. |
| `pipeline.source_retrievals` | `retrieval_purpose` (`research`/`production`) with a constraint that a production retrieval must name a permission grant. |
| The terms-artifact convention | Seen in `src/lib/ubwi/rights.ts`: `contentHash`, `byteLength`, `httpStatus`, `retrievedAt`, a **`decisiveClause` quoted verbatim**, and `attributionRequired`. This study was written to the same standard so its findings can be migrated into it later. |
| **FX lineage, already built and already rights-cleared** | `FxLineage` in `src/lib/ubwi/types.ts` carries `basis`, a rate, the `fixingDate` "actually used: the last quoted rate at or before the component's reference date", and a `sourceInterface`. Live interfaces: `ecb-euro-reference-rates` and `cbc-exchange-rates` (Taiwan). See I — this is a material head start. |
| `src/lib/market-ranges.ts` low-frequency path | Written for a once-daily index with no intraday tail, which is UGAI's publication shape. |
| The UBWI withheld-surface pattern | A production index that renders a disclosed withheld state instead of a number. UGAI will need it at launch. |

### B.4 The two gaps in the rights model itself

**This is the most important backend finding in the study, and it is not about equities at all.**

`reference.permission_grants` expresses rights as exactly **two booleans**: `covers_collection` and `covers_index_use`. That model was adequate for UCPI, UBWI and UTVI, whose sources are public statistical compilers and provider price pages. It cannot express what a commercial market-data agreement actually grants. Mapping 2C's required axes onto it:

| Required axis | Expressible today? |
|---|---|
| Access — may we retrieve it? | Yes (`covers_collection`) |
| **Storage — may we retain it, and for how long?** | **Absent** |
| Derived use — may we compute UGAI from it? | Partly (`covers_index_use`) |
| **Redistribution — may we publish the result, and at what granularity?** | **Not separable from `covers_index_use`** |
| **Post-termination retention — what survives the contract?** | **Absent.** `effective_to` says when a grant ends; nothing says what may be kept afterwards. |

**Interpretation:** the gap matters because the whole UGAI reproducibility claim lives in the two absent axes. A schema that cannot record "we may keep these inputs after this contract ends" cannot be relied on to tell a future operator whether a 2028 restatement of a 2027 print is lawful. Recorded in N; no change proposed here.

---

## C. Exact UGAI data requirements

Derived field by field from `docs/methodology/ugai.md` and its parent. Purpose columns: **L** live calculation · **H** historical reconstruction · **A** audit/reproducibility · **D** public API/display.

### Security and issuer identity

| Field | L | H | A | D | Notes |
|---|:-:|:-:|:-:|:-:|---|
| Issuer/company ID (persistent across name, ticker, venue changes) | ● | ● | ● | ● | Parent requires identity independent of name or ticker |
| Security ID + share class | ● | ● | ● | | One representative security per company |
| Ticker + MIC | ● | ● | ● | ● | Display only; never identity |
| ISIN | ● | ● | ● | | |
| FIGI | ● | ● | ● | | Recommended canonical — see J.5 |
| SEDOL | | | ● | | Reconciliation aid; licensed separately by LSEG |
| Primary-listing flag, listing status | ● | ● | ● | | |
| Receipt ratio (ADR/GDR → underlying) | ● | ● | ● | | Methodology requires verified ratio |
| Price currency + unit convention | ● | ● | ● | ● | Pence-vs-pounds errors are silent and total |

### Pricing

| Field | L | H | A | D | Notes |
|---|:-:|:-:|:-:|:-:|---|
| **Raw official exchange close, unadjusted** | ● | ● | ● | ● | Methodology: observed closes are never rewritten |
| Session status (traded / holiday / halted / suspended) | ● | ● | ● | | Drives valid-prior-close vs stale vs suspended |
| Price timestamp and source | ● | ● | ● | | |
| Vendor-adjusted close | | | | | **Must not be ingested as price** — see section 12 / L |

### Capitalization

| Field | L | H | A | D | Notes |
|---|:-:|:-:|:-:|:-:|---|
| Shares outstanding **with effective date** | | ● | ● | | Enters only at parent resets, but the *historical* value is required |
| Free-float factor **with effective date** | | ● | ● | | Hardest input — see H |
| Float-adjusted shares | | ● | ● | | Or derivable from the two above |
| Per-class shares for multi-class issuers | | ● | ● | | Parent aggregates eligible classes |
| Resulting issuer market cap | | ● | ● | ● | Parent weight input |

### Corporate actions

Splits · reverse splits · bonus issues · stock dividends · ordinary cash dividends · special dividends and capital repayments · rights issues (with subscription price and ratio) · spin-offs and stock distributions · mergers and acquisitions (with consideration terms) · share-class conversions and receipt conversions · listing migrations · ticker/name/identifier changes · delistings, cancellations, liquidations, bankruptcies · IPOs and de-SPACs · trading halts and suspensions.

Each requires: event type, **cum and ex dates**, effective time, terms (ratio, price, amount), **confirmation status**, issuer's own characterization for the ordinary/special split, and source. All four of L, H, A; the treatment applied is also D, because the methodology publishes lineage.

### FX

| Field | L | H | A | D | Notes |
|---|:-:|:-:|:-:|:-:|---|
| Daily reference rate, **USD per one unit of price currency** | ● | ● | ● | | Orientation is a publication gate |
| Fixing time and convention (bid/ask/mid) | ● | ● | ● | | |
| Published vs carried-forward status | ● | ● | ● | | |
| Redenomination factors | | ● | ● | | Applied as a unit change, not to stored closes |

### Calendars

Trading days, holidays, scheduled half-days and unscheduled closures per venue; plus the FX fixing publication calendar. All of L, H, A. **Note:** UGAI's calendar is Mon–Fri on days the fixing publishes — the interaction of *two* calendars (venue and fixing) is a data requirement in its own right, and the source of the Monday defect Phase 1A confirmed.

### Index administration (Urdais-internal, not purchased)

Constituent membership with effective intervals · parent base weights · UGAI index shares per security with the reset/event that set them · the divisor with every change, its cause, and its before/after market values · as-of weights per observation date · four version identifiers per observation (UGAI methodology, parent methodology, universe version, parameter set) · input status flags · announcement and effective timestamps.

---

## D. Provider comparison

**Coverage and technical capability only.** Rights are section E — and for several of these the rights answer overrides the capability answer entirely.

| Provider | Global equities | Official close | Corporate actions | Shares o/s | Free float | **Point-in-time history** | FX | Stable IDs | Shape fit for UGAI |
|---|---|---|---|---|---|---|---|---|---|
| **Exchange Data International (EDI)** | 170+ exchanges, all regions | Pricing sold as a service | Dedicated service; event ID/type/effective date/old-new ratios | **Yes, with `Update Date` and `Effective Date`, old & new figures** | **Yes, 170+ exchanges, per-market definitions** | **`PIT_SRF`: dated start/end records since Jan 2005; `PIT_EVT` links to corporate actions** | Not its product | ISIN, SEDOL, MIC, tickers, **FIGI**, GICS | **Strongest fit for the hard inputs** |
| LSEG / FactSet / S&P Capital IQ / Bloomberg / ICE / Morningstar | Comprehensive | Yes | Yes | Yes | Yes (incl. investability factors) | Generally yes | Yes (LSEG owns WMR) | Yes | Capable; terms and price are sales-gated and not public |
| Nasdaq Data Link | Publisher marketplace; varies per dataset (EDI publishes there) | Varies | Varies | Varies | Varies | Varies | Varies | Varies | A channel, not a single dataset |
| **Massive (ex-Polygon.io)** | US-centric | US consolidated/SRO | Splits, dividends | Limited | No | No | Limited | Tickers | **Rights-disqualified — see E** |
| Tiingo | US + some intl | EOD | Splits, dividends | Limited | No | No | No | Tickers | Inputs cannot be retained |
| Twelve Data | Broad intl claimed | EOD | Some | Some | No | No | Yes | Tickers | Deletion on termination |
| Intrinio | US-strong | Yes | Yes | Yes | Partial | Partial | No | Yes | Display licence captures transforms |
| EODHD | Broad intl claimed | EOD | Splits, dividends | Some | No | No | Yes | Tickers | No redistribution "original or repackaged" |
| Financial Modeling Prep | Broad | EOD | Some | Yes, incl. a shares-float endpoint | Claimed | Unclear | Some | Tickers | Display needs separate agreement |
| Finnhub / Alpha Vantage / Alpaca | Varies; US-centric | Varies | Partial | Partial | No | No | Some | Tickers | Not assessed in depth — no evidence they solve retention or index rights |
| **Databento** | US equities, futures | Venue feeds | No | No | No | Historical tick, not PIT reference | No | Venue IDs | Unusual venue-level derived-use rights, but **wrong data shape** — no actions, shares or float |
| **sec-api.io** | US only | No | No | Yes, incl. historical | **US public float from filings** | Filing-dated | No | CIK | Useful US-only float cross-check |

**Two cautions on this table.** First, "broad international coverage" in developer-API marketing routinely means *a price series exists for a ticker on that venue*, not that an official close, a reconciled corporate-action record, an effective-dated share count and a float factor all exist for it. Only the second claim is useful to UGAI, and only EDI and the institutional tier evidence it. Second, Databento is the clearest illustration of why rights and shape must be judged separately: it has the best redistribution posture of any provider here and is still unusable for UGAI, because an index over global listed equity cannot be built from US tick data with no corporate actions.

---

## E. Licensing / rights matrix

Five axes kept strictly separate, as the brief requires, plus proprietary-index use. **A — access · S — storage · DU — derived use (may we compute UGAI?) · R — redistribution (may we publish it?) · PT — post-termination retention · IDX — proprietary index construction.**

| Provider | A | S | DU | R | **PT** | **IDX** | Decisive language |
|---|---|---|---|---|---|---|---|
| **Massive (ex-Polygon)** | Paid | During term | **No** | **No** | **No** | **No** | "delete all Market Data in your possession" on termination or suspension for any reason; may not "create derivative works (including … any index …) unless you are licensed to do so" **[verified]** |
| **Tiingo** | Paid | Per plan | Partial | By permission + attribution | **Derived only** | **Ambiguous** | "Derived Products that satisfy this Section may be retained after your subscription ends; Tiingo Data may not" **[retrieved]** |
| **Twelve Data** | Paid | Term only | Yes if not reverse-engineerable | Add-on required | **No** — 30 days, certifiable | Not addressed | "Create Derived Data that cannot be reverse-engineered to recreate the original Data"; "All Data must be deleted within 30 days" **[retrieved]** |
| **Intrinio** | Paid | Not stated | Yes | **Display licence required** | **Not stated — ask** | Not addressed | Display licence applies "whether data is raw, aggregated, transformed, or AI-generated"; output treated as redistribution where a user "could infer or reconstruct the original data" **[retrieved]** |
| **EODHD** | Paid | Not stated | Not stated | **No** | Not stated — ask | Not addressed | Prohibits redistributing or displaying "whether in its original or repackaged form" **[retrieved]** |
| **FMP** | Paid | Not stated | Not stated | Separate agreement | Not stated — ask | Not addressed | Display/redistribution requires a "Data Display and Licensing Agreement" **[retrieved]** |
| **EDI** | **Purchased** | **Marketed as owned** | Positioned for index calculation | "We do not have onerous redistribution rules" | **Marketed as surviving** | Likely negotiable | "We do not rent data, we sell it"; brochure cites "the detailed security-level information required for accurate market analysis and **index calculations**" **[retrieved]** |
| Institutional tier | Paid | Negotiated | Negotiated | Negotiated | Negotiated | **Separately priced product** | Terms sales-gated; LSEG publicly offers "a range of models for the implementation and administration of fee liability for benchmark data" **[retrieved]** |
| **Exchanges (layer 2/3)** | n/a | n/a | Separate licence | Separate licence | n/a | **Own licence category** | LSE: "Indices/Benchmarks licence — A licence for creation of Indices/Benchmarks as defined under the Benchmark Regulations", distinct from derived data "which is not Indices/Benchmarks" **[verified]** |

### E.1 The three cross-cutting rights findings

1. **Post-termination retention is the binding constraint, and it is invisible in feature comparisons.** Every published developer-tier term that addresses termination requires deleting the source data. UGAI's reproducibility claim is a permanent obligation against inputs; a subscription that can end is therefore not a valid foundation for it. **A purchase is structurally different from a subscription, and this is the single most important sourcing criterion in the study.**

2. **The reconstruction test cuts directly at UGAI's published surface.** Twelve Data's "cannot be reverse-engineered" and Intrinio's "infer or reconstruct" both make the *granularity* of UGAI's publication a licensing question. A level alone is safe. A level plus as-of constituent weights plus a constituent list is a materially stronger reconstruction vector, especially for a concentrated index where a handful of names carry most of the weight. **Interpretation:** UGAI's transparency commitment and its input licences are in genuine tension, and the resolution is a negotiated redistribution right, not a methodology retreat. Flagged to Phase 2D in O.

3. **Prohibitions originate upstream, so vendor-shopping cannot fix them.** Massive's "Market Data" is NYSE/SRO information passed through **[verified]**; LSE licenses index creation as its own category **[verified]**. **Recommendation:** treat layer 2 as a first-class line item from the outset, not a surprise discovered after building.

---

## F. International coverage

EDI free-float and shares-outstanding coverage, read off the brochure's own country/MIC tables **[retrieved]**, against the markets the brief names:

| Market | Covered | MIC(s) seen |
|---|:-:|---|
| US | ● | `XNYS` (+ Nasdaq venues) |
| Canada | ● | `XCNQ` and others |
| UK | ● | `XLON` |
| EU — France / Netherlands / Germany / Italy / Spain / Ireland / Sweden / Denmark | ● | `XPAR` `XAMS` `XBER` `XMIL` `XMAD` `XDUB` `XSTO` `XCSE` |
| Switzerland | ● | `XSWX` |
| Japan | ● | `XJPX` |
| South Korea | ● | `XKRX`, `XKON` |
| Taiwan | ● | `XTAI`, ROCO |
| Hong Kong | ● | `XHKG` |
| Mainland China | ● | `XSHG` (Shanghai), `BJSE` (Beijing) |
| Singapore | ● | `XSES` |
| Australia | ● | `XASX` |

**Fact:** every market UGAI needs is covered for the two hardest reference inputs by a single vendor.

**Interpretation, and a correction to Phase 1A.** Phase 1A named the Chinese AI ecosystem as the primary threat to the word "Global" and implied it was partly a data problem. On this evidence it is not: shares and float data for Shanghai and Beijing listings is commercially available. The China constraint is **investability and access** — the parent universe's unresolved venue/access register, foreign-ownership limits, capital controls and the reference-investor assumption — plus, at layer 2, whether those exchanges will license index creation to a small independent publisher at all. That is a narrower and more accurate statement of the problem, and it belongs to the parent universe (2B), not to sourcing.

**What coverage does *not* mean.** Rights are per exchange at layers 2 and 3. **Recommendation:** never state UGAI's geographic scope as "wherever the vendor has data." State it as "wherever Urdais holds both the data and the licences", and expect those two sets to differ. A defensible early scope is likely narrower than the data permits.

---

## G. Corporate actions

UGAI's exposure here is asymmetric: a missed or misapplied action does not degrade the index, it silently falsifies it, and the error persists in every subsequent level because the divisor carries it forward.

Classified by what each action moves:

| Action | Price continuity | Index shares | Float/shares | Divisor |
|---|:-:|:-:|:-:|:-:|
| Split / reverse split / bonus / stock dividend | ● | ● | ● | — (value-neutral) |
| Ordinary cash dividend | — | — | — | — (total-return series only) |
| **Special dividend / capital repayment** | ● | — | — | **●** |
| **Rights issue (in the money)** | ● | ● | ● | **●** |
| **Spin-off / stock distribution** | ● | ● (temp line) | ● | **●** on line removal |
| **Merger / acquisition of a member** | ● | ● | ● | **●** |
| Share-class or receipt conversion | ● | ● | — | ● if value not preserved |
| Ticker / name / identifier change | — | — | — | — |
| Issuance / buyback / lock-up expiry | — | — | ● | — (enters at next reset) |
| **Delisting / cancellation / liquidation** | ● | ● | ● | **●** |
| Halt / suspension | carried + flagged | — | — | — |

**Where vendor data alone is insufficient.** Three cases, each identified by the methodology and each requiring issuer or exchange notices rather than a feed:

1. **The ordinary-vs-special dividend classification.** The methodology makes this turn on "the issuer's own characterization corroborated by the exchange". A vendor's single classification flag is not that evidence, and the distinction decides whether a distribution hits the divisor or only the total-return series.
2. **Unconfirmed terms at the cutoff.** The methodology forbids estimated adjustments. Acting requires knowing whether terms are *confirmed*, which is a status on the notice, not a value in a feed.
3. **Novel or unlisted actions.** The methodology requires a documented treatment justified against economic continuity, published before application where practicable. No feed supplies that.

**Recommendation:** a commercial corporate-actions feed is necessary and not sufficient. Budget for a reconciliation process against issuer and exchange notices, with a recorded decision per contested event — which is precisely the shape of `pipeline.observation_evidence` and the terms-artifact convention Urdais already uses. EDI's action records (event ID, type, effective date, old and new ratios, old and new shares outstanding **[retrieved]**) are the right primitives to reconcile *against*.

---

## H. Free float and the shares problem

**This is the hardest input, and it is hard for a reason that money does not fix.**

### H.1 Three different things are called "free float"

1. **Public float reported in filings.** Issuer-reported, jurisdiction-specific, sparse outside the US, and not defined consistently across regimes.
2. **Index-provider investability factors.** FTSE, MSCI and S&P each compute their own, under their own rules. These are *components of competing index products*. **Interpretation:** they are not realistically available as an input to a rival index, and building UGAI on a competitor's float factor would also make UGAI's weights a derivative of that competitor's methodology — which would break the parent's requirement that weights be reproducible from Urdais's own published rules.
3. **Vendor-estimated float.** EDI's stated method, where the exchange publishes none, is "deducting the number of shares held by the significant, controlling, or substantial shareholders … from the total number of shares outstanding", with a per-market definition of free-floating shares published for each market **[retrieved]**.

Category 3 is the only realistically licensable input, and category 2 is the one the index industry actually uses. **That gap is a permanent, disclosable limitation of UGAI, not a temporary sourcing problem.**

### H.2 Could Urdais compute float itself?

**Fact:** for US issuers, yes in principle — filings carry public float and share counts, and `sec-api.io` exposes both with history **[retrieved]**. Outside the US, ownership disclosure regimes differ in threshold, frequency, format and language.

**Operational burden, stated honestly.** Doing this properly means, per issuer per review: identifying every substantial holder, classifying each as strategic or non-strategic (the parent explicitly requires *not* excluding a non-strategic large investment manager), reconciling overlapping categories so no stake is deducted twice, applying foreign-ownership headroom, and recording the rationale — in the original language, with a dated source. The parent already forbids the shortcuts that would make this tractable: no guessed percentages, no undocumented analyst exceptions, unknown ownership recorded as a gap rather than assumed to be float.

**Recommendation:** licence float; do not compute it. Urdais's own UBWI experience is the precedent — that product's numerator work is smaller than this and still required a dedicated multi-phase effort, and its publication remains gated on coverage. **Interpretation:** a self-computed global float dataset is not a Phase 2D-scale task; it is a standing operations function, and proposing it would be the single fastest way to make UGAI never ship.

### H.3 Why current shares and float are insufficient

Stated plainly because the brief flags it as critical: a capitalization-weighted index's weight at a past reset is a function of the shares and float **as they stood at that reset**. Today's share count reflects every subsequent issuance, buyback, split and conversion. Using it to reconstruct a 2021 weight does not introduce noise — it introduces a *directional* error correlated with corporate activity, systematically overweighting companies that have since issued equity. The reconstructed series would be smooth, plausible, and wrong, with no internal signal that anything was amiss. **This is why `Effective Date` on EDI's shares records, and the dated start/end records of `PIT_SRF`, are not conveniences but requirements.**

---

## I. FX strategy

### I.1 Two viable routes

**Route 1 — the industry standard, licensed.** UGAI's own methodology already cites 16:00 London fixings as the convention used by MSCI, Nasdaq, STOXX and Solactive. That convention is the WM/Refinitiv closing spot rate, now administered within FTSE Russell / LSEG and **designated a Critical Benchmark under the UK Benchmark Regulation since November 2024** **[retrieved]**. Licensed via LSEG or ICE. Advantage: methodologically unimpeachable and directly comparable with every benchmark UGAI will be compared against. Cost: another commercial licence, and another retention/redistribution negotiation.

**Route 2 — central banks, which Urdais already operates.** `src/lib/ubwi/` already has two rights-cleared FX interfaces: `ecb-euro-reference-rates` and `cbc-exchange-rates` (Taiwan's central bank). The ECB's terms are already recorded with a verbatim decisive clause permitting free use with citation, and requiring that modification be stated explicitly — which is why UBWI discloses its conversion on every component.

### I.2 A concrete blocker in Route 2, found by checking

**Fact:** the ECB publishes euro reference rates for 32 currencies, updated around 16:00 CET each working day except TARGET closing days. The list includes JPY, KRW, HKD, CNY, SGD, AUD, CAD, CHF, GBP, SEK, DKK — **and does not include the Taiwan dollar** **[retrieved]**.

**Interpretation:** that omission is not marginal. Taiwan is central to any AI equity universe, and a UGAI that cannot convert a Taipei-listed constituent has a hole where its most important semiconductor exposure would sit. Two further frictions apply to the whole ECB route: the rates are euro-based, so USD-per-unit requires a cross through EUR/USD — a *modification* under ECB terms, which must be disclosed and which introduces cross-rate error into every non-euro constituent; and the ECB calendar is TARGET, not a global equity calendar, so fixing-absent days will not align with venue closures.

**Fact, and the mitigation:** Urdais already solved the Taiwan case once. `cbc-exchange-rates` exists in the repo precisely because UBWI needed a Taiwan rate the ECB does not publish.

### I.3 Recommendation

**Prefer Route 1 (a licensed single global fixing) for production, and treat Route 2 as the costed fallback** — a per-market central-bank patchwork extending the ECB and CBC interfaces already built. Route 1 buys methodological alignment and one calendar; Route 2 buys zero licence cost, permanent retention and citable public sources, at the price of a cross-rate disclosure and a per-currency operational surface. **Both must be priced before the methodology's unresolved "exchange-rate fixing" parameter can be closed** — this is a data-feasibility decision masquerading as a methodology parameter.

**Whichever route:** the FX source needs its own five-axis rights assessment. A licensed fixing that must be deleted on termination breaks reproducibility exactly as a licensed price feed does, and it is the easier one to overlook.

---

## J. Point-in-time data and historical reconstruction

### J.1 The two biases, concretely

- **Survivorship.** Reconstructing with today's constituent list omits every company that was admitted and later delisted, acquired or removed. Because removal correlates with failure, the reconstruction inherits an upward bias. An AI universe over 2020–2026 would silently drop the casualties and keep the winners.
- **Look-ahead.** Reconstructing with today's *evidence* — restated filings, revised vendor records, a current classification — means the historical universe is chosen using information nobody had at the time. The parent already forbids both and requires demonstrating their absence.

### J.2 What is actually available

**Fact:** EDI's `PIT_SRF` provides dated records with start and end dates, covering changes in securities coding and critical reference data "at any historical point since **January 2005**", across ~1.3 million securities, with ISIN, SEDOL, US local code, tickers, MIC, exchange codes, FIGI variants and GICS; `PIT_EVT` adds the corporate-action events that explain each change **[retrieved]**. Delivery includes S3, SFTP, API and Snowflake.

**Interpretation:** this is the single most encouraging finding of the study. A dated reference history back to 2005, with the events that caused each change, is the substrate a bias-free reconstruction requires. It does not by itself deliver historical *float* — EDI states historical data is purchasable per year "where available" **[retrieved]**, which is a coverage question to put in writing (M).

### J.3 What reconstruction still needs beyond data

Reconstruction is gated on something no vendor sells: **point-in-time parent universe versions.** UGAI admits companies on `r_i_lower`, the evidenced lower bound of qualifying AI revenue from the latest completed fiscal year available *at each historical review's evidence cutoff*. Reproducing that means re-running the parent's admission decision as of each past quarter, from filings as they read then. **No dataset supplies this, and no purchase shortens it.** It is manual evidence work, it belongs to 2B, and it — not market data — is the true constraint on Policy B or C in section 19.

### J.4 The three history policies, assessed against actual feasibility

The founder position is that reconstructed history is acceptable where every required input can be legitimately reconstructed under the published methodology and is clearly distinguished from live-published history. Assessed on that standard rather than on a presumption against backfill:

| | **A. Live-only from launch** | **B. Full reconstruction where complete PIT inputs exist** | **C. Partial reconstruction from the earliest complete date** |
|---|---|---|---|
| Market data required | Forward-only prices, FX, actions | PIT reference, PIT shares, **PIT float**, historical actions, historical FX, per market, for **delisted and acquired names too** | Same, but only from the date all of them are simultaneously complete |
| Contractual rights required | Access + storage + derived use + redistribution | All of A, plus **the right to purchase and retain history**, plus redistribution of historical derived values | Same as B |
| Purchasable today? | Yes, in principle | **Partly.** `PIT_SRF`/`PIT_EVT` from Jan 2005 is evidenced; historical **float** is "where available", per year — unquantified (M, Q21) | Yes — the date is an output of the coverage answer, not an assumption |
| **Non-purchasable blocker** | None | **PIT parent universe versions (J.3)** — manual, 2B-owned, unpurchasable at any price | Identical blocker, but over a shorter window |
| Bias exposure | None | High if any input silently falls back to current data (H.3) | Same risk, bounded by the start date |
| Honest labelling | "Live history begins at first publication" | Must be labelled backtested/reconstructed throughout | Same, with the boundary published |
| Time to ship | Immediate once sourcing lands | Long — gated on 2B evidence work, not on vendors | Medium |

**Recommendation: adopt A for launch and keep C explicitly open as a later, separately versioned series.** The reasoning is not a preference against backfill — it is that the binding constraint on B and C is not market data and cannot be bought. Historical prices, actions, FX and even point-in-time reference data are commercially available back to 2005; the missing input is the parent universe *as it would have been decided at each past quarterly review*, from filings as they read then. Until 2B produces a production universe and a repeatable review procedure, there is nothing to reconstruct *onto*, however good the market data is.

**What follows practically:** launching on A costs nothing in optionality provided the sourcing contract includes the right to purchase history later and to retain it (M, Q1–Q5, Q20–Q22). **That right is cheap to secure at signature and expensive to retrofit** — so the decision that must be made now is contractual, not editorial. Phase 1A's "base date = first live publication" recommendation stands, with the correction that it should be framed as *live history begins here*, not as *history is impossible*.

### J.5 Identifier strategy

**Recommendation: FIGI as the canonical internal security identifier, with a separate Urdais-issued issuer/company key above it.**

Reasoning: FIGI is openly licensed and permanent — it is not reassigned when a ticker changes — and EDI already emits FIGI variants alongside ISIN, SEDOL and MIC **[retrieved]**, so adopting it costs no extra vendor relationship. ISIN is retained as a reconciliation key but is issuer-and-security scoped rather than listing scoped, so it does not distinguish the listing UGAI actually prices. SEDOL is licensed by LSEG and should be treated as reconciliation-only, never as a primary key, to avoid a licensing dependency in the middle of the identity model. **Ticker plus MIC must never be an identity** — only a display label — because tickers are reassigned, and UGAI's history must survive that.

Above the security layer, the parent's requirement that company identity persist "independent of name or ticker" through mergers, spin-offs, conversions and relistings is not satisfied by any vendor identifier, because it encodes Urdais's own decisions about which successor continues a membership. **That key must be Urdais-issued, and vendor identifiers must map to it rather than the reverse.**

---

## K. Architecture options

| | **A. Single institutional** | **B. Single developer API** | **C. Primary + separate FX/reference** | **D. Filings/notices + commercial prices** | **E. Purchased reference + licensed prices + central-bank FX** |
|---|---|---|---|---|---|
| Coverage | Complete | Uneven; float and PIT absent | Good | Prices fine; float/PIT manual | Good |
| **Rights** | Negotiable, including index use | **Disqualifying** | Mixed; two negotiations | Public inputs strong; price licence still needed | **Strongest realistic** |
| Completeness | Highest | Fails on float, PIT, actions | Good | Fails on non-US float | Good, with float a purchased dataset |
| Reproducibility | Contract-dependent | **Impossible** (delete on termination) | Contract-dependent | High for public inputs | **High if purchased outright** |
| Operational complexity | Low | Low | Medium | **Very high** (standing float operation) | Medium |
| Vendor concentration | **Single point of failure** | Single | Two | Low | Two to three |
| Cost category | Highest | Lowest | Medium | Low licence, high labour | Medium |
| Implementation | Low | Low | Medium | High | Medium |
| **Verdict** | Viable; price and lock-in are the risks | **Rejected on rights** | Viable | Rejected for global float | **Recommended to price first** |

Layers 2 and 3 apply to **every** option and are not differentiators: any option that publishes a global index from exchange prices needs per-exchange index and display licences.

**Why B is rejected rather than merely disfavoured.** It fails the requirement the product cannot compromise. A UGAI whose inputs must be deleted when a subscription lapses cannot honour a restatement, cannot answer an audit of a past print, and cannot support the lineage its own methodology publishes. That is not a cheaper version of UGAI; it is a different and weaker product wearing its name.

**Why D is rejected for global float but retained in part.** Self-computed float is a standing operations function (H.2), not a phase. **Recommendation:** keep D's *cross-check* role — SEC filings as an independent verification of US float and share counts against the purchased dataset, which is cheap, and which gives Urdais a reproducibility story for its largest market that does not depend on a single vendor's estimate.

---

## L. Recommended shortlist

**No winner is nominated, because the deciding variables — price, and the answers in M — are unknown.** Four things to price, in order.

1. **EDI, for reference data, corporate actions, shares outstanding, free float, and `PIT_SRF`/`PIT_EVT`.** The only provider evidenced here that holds all the hard inputs, covers every required market, dates its records effectively, publishes a per-market float methodology, emits FIGI, and — decisively — markets itself as selling rather than renting, with "no onerous redistribution rules" **[retrieved]**. That posture is the one that makes permanent reproducibility possible. **It must be confirmed in the contract, not inferred from a brochure.**
2. **An end-of-day price source with negotiated derived-data, index and retention rights.** EDI's own pricing service is the natural first quote, because a single purchased relationship simplifies retention. Institutional alternatives (LSEG, FactSet, S&P, ICE, Morningstar) should be quoted alongside, since they license index construction as an established product.
3. **FX: a licensed 16:00 London fixing versus the central-bank patchwork.** Price both (I.3). The patchwork's marginal build cost is genuinely low because two interfaces already exist.
4. **Layer 2 and 3 exchange licences, for a deliberately short initial venue list.** Get real numbers for perhaps US, UK, Japan, Taiwan, Korea before assuming any broader scope is affordable. **Recommendation:** let the licensing quotes inform the parent's venue register, rather than settling the register first and discovering the bill afterwards.

**Not shortlisted, and why:** Massive (rights-disqualified, verbatim); Tiingo, Twelve Data, EODHD, FMP, Finnhub, Alpha Vantage, Alpaca (no evidence any solves retention, float or PIT); Databento (best rights posture, wrong data shape); index providers' own float factors (competitors' proprietary components, H.1).

---

## M. Vendor questions

Phrased for outreach. Send to every candidate; the answers, not the marketing, decide.

**Retention and post-termination — ask first, because a wrong answer ends the conversation**
1. Do we purchase this data or licence it for a term?
2. May we store the data we receive indefinitely, with no volume or duration cap?
3. **If our agreement ends, lapses or is terminated for any reason, may we retain the historical data already received?** If yes, for what purposes — internal recalculation, audit response, continued publication of index values already published?
4. Are we required to delete or certify deletion of any data on termination?
5. If retention does not survive termination, is a perpetual-licence or data-purchase option available, and at what price?

**Derived use and index construction**
6. May we use this data to calculate a proprietary equity index that we publish commercially?
7. Is index or benchmark creation licensed separately from ordinary derived-data use, and priced separately?
8. Does your licence distinguish display from non-display use, and which applies to a nightly index calculation?
9. Do you require the index to be made available on non-discriminatory terms, or impose conditions on how it is commercialised?

**Redistribution granularity — the constituent-weights question**
10. May we publish the index level publicly, including in a free public website and a public API?
11. **May we publish constituent-level detail — the constituent list and each constituent's as-of weight — alongside the level?**
12. Does a "cannot be reverse-engineered" or "cannot be reconstructed" condition apply to our output, and how do you assess it for an index that publishes its weights?
13. May we publish the closing price we used for a constituent on a given date, as part of index lineage or an audit response?
14. What attribution is required, and where must it appear?

**Exchange pass-through — layers 2 and 3**
15. Which of your data carries exchange or SRO pass-through terms, and which exchanges?
16. Do we need direct agreements with individual exchanges to create an index from their prices, or does your licence cover it?
17. Are exchange redistribution or index-creation fees triggered by our use, and are they billed by you or by the exchange?
18. Does coverage carry exchange-specific terms that differ by market — specifically for Japan, Korea, Taiwan, Hong Kong and mainland China?
19. Does an end-of-day-only, after-midnight publication qualify for a lower licence class than real-time?

**Point-in-time and history**
20. For which markets and dates is point-in-time shares-outstanding history available, and from what date?
21. For which markets and dates is point-in-time **free-float** history available, and from what date?
22. Are records effective-dated such that we can retrieve the value **as it was known on a past date**, distinct from the value now believed correct for that date?
23. When you revise a historical value, do we receive both the original and the correction, with the timestamps of each?
24. Is your free-float methodology published per market, and will you tell us when it changes?

**Prices and corporate actions**
25. Do you supply the **raw official exchange close, unadjusted**, with session status (traded, holiday, halted, suspended)?
26. Are corporate-action records delivered with confirmation status, and are unconfirmed terms distinguishable from confirmed ones?
27. Do you classify distributions as ordinary or special, and is the issuer's own characterization carried?

**Continuity**
28. What notice do you give of terms changes, and do changes apply retroactively to data already received?
29. If a dataset or an exchange is withdrawn, what happens to data already delivered?
30. What are your service-continuity and escrow arrangements?

---

## N. Backend gaps

No schema proposed. What implementation will require, smallest-first.

**1. Extend the rights model before anything else (B.4).** `permission_grants` needs to express storage, redistribution granularity, and post-termination retention as first-class facts, separably from `covers_index_use`. **This is the only gap worth closing before a vendor is chosen**, because it is what lets the vendor answers in M be recorded as evidence rather than prose — and because a UGAI whose rights basis is unrecorded is a UGAI nobody can later prove was lawful.

**2. An equity domain that does not exist at all.** Security master with issuer/security/listing separation and an Urdais-issued company key; identifier mappings (FIGI canonical, ISIN/SEDOL/MIC/ticker mapped); raw unadjusted closes with session status, stored immutably; FX observations with orientation, fixing time and published-vs-carried status; corporate actions with terms, cum/ex dates, confirmation status and the treatment applied; dividends with classification; effective-dated shares outstanding and float factors; exchange calendars.

**3. Index administration.** Universe versions consumed; index shares per security with the reset or event that set them; the divisor with every change, cause, and before/after market values; observations carrying four version identifiers, status, and the market-data cutoff.

**4. `pipeline.calculation_runs` cannot host UGAI.** Its CHECK constraint hardwires the UCPI UTC-day calendar (`cutoff = window_start + 1 day`, `deadline = cutoff + 1 day`). UGAI's cutoff is "after the last constituent session dated *t* closes and the fixing for *t* is available". **UGAI needs its own run table**, as UBWI and UTVI each did. Do not relax UCPI's guard.

**5. Three things that are cheap now and impossible to retrofit.** Raw closes must never be overwritten by an adjusted value; the divisor must be stored per observation with each change's cause and inputs; and **vintage must be a first-class dimension** — every input carrying source, publication/access timestamp and vintage, with superseded values retained beside the used ones, so "what did we know on date *t*" is answerable separately from "what is now believed true about date *t*". Retention rights (M, Q3) determine whether this is even permitted; where it is not, the affected observations must be marked not independently reproducible rather than silently presented as reproducible.

**6. `reference.instruments.output_unit`** is documented as "the economic unit of the published value, **never an index level**". UGAI publishes a level in points against a base of 1,000. A comment, not a constraint — but resolve it deliberately when UGAI is registered.

---

## O. Phase 2D inputs

Methodology decisions that **cannot** be closed until sourcing feasibility is known. Each is currently marked unresolved in `ugai.md`, and each is really a data question:

1. **Exchange-rate fixing** — source, time, bid/ask/mid, licensing, fallback. Blocked on I.3 pricing. The ECB's missing TWD makes this a coverage decision, not a preference.
2. **Base date** — blocked on whether point-in-time float history exists per market (M, Q21), and on 2B's point-in-time universe reconstruction.
3. **Calendar, cutoff, publication target and deadline** — blocked on when the chosen price and FX sources actually deliver, and on the *interaction* of venue and fixing calendars.
4. **Stale-price and stale-rate tolerances** — require observed delivery reliability.
5. **Index-share precision** — requires knowing the precision of delivered share counts.
6. **Dividend confirmation and late reinvestment** — blocked on whether confirmation status is delivered (M, Q26).
7. **Distribution-line valuation hierarchy** — blocked on whether when-issued prices are available for spin-offs.
8. **Correction window and materiality threshold** — blocked on vendor revision behaviour (M, Q23).
9. **Whether the total-return companion launches at all** — blocked on dividend-feed cost. Phase 1A recommended deferring it; nothing here changes that.
10. **NEW, and not currently in the methodology: the publication-granularity decision.** Whether UGAI may publish as-of constituent weights depends on negotiated redistribution rights (E.1 finding 2). The methodology currently commits to publishing them. **If that right cannot be obtained, this is a methodology amendment, not an implementation detail** — and it is the one place where a licence could force a change to UGAI's published transparency. Add it to `ugai.md`'s open questions.

---

## P. Blockers

**Methodological**
- The parent universe has no production version: `τ` and the issuer cap `c` are unresolved and no constituent list exists. **Still the binding blocker on UGAI overall.** Phase 2B.
- Point-in-time universe reconstruction is manual and unpurchasable (J.3) — this, not market data, gates any historical policy.
- The float-definition gap: index-grade investability factors are competitors' proprietary components, so UGAI's weights will rest on a vendor-estimated or self-computed float and must disclose it permanently (H.1).

**Technical**
- No equity domain exists in schema or code; nine required input families, zero present.
- The rights model cannot express storage, redistribution granularity or post-termination retention (B.4).
- `calculation_runs` is calendar-incompatible (N.4).
- The Mon–Fri 1D range defect Phase 1A confirmed remains open, deliberately (Phase 2A left it).

**Licensing**
- **Developer-tier APIs are disqualified** on post-termination deletion and index-creation prohibition **[verified for Massive]**.
- Layer 2 exchange index-creation licences are required per exchange **[verified for LSE]** and are unpriced.
- Whether constituent weights may be published is unresolved and may bind against the methodology (O.10).
- Whether EDI's "we sell it" posture survives contract review is unconfirmed.
- FX rights need their own assessment; a licensed fixing with deletion-on-termination breaks reproducibility as surely as a price feed does.

**Cost**
- **Licensing cost scales with exchange count**, so "Global" is a budget decision as much as a methodology one. This is the newest finding and the one most likely to reshape scope.
- Institutional-tier pricing is sales-gated and entirely unknown.
- Historical purchases (per-year float and PIT history) are an additional one-off.
- Self-computing float would substitute a permanent operations cost for a licence cost, at higher total cost and lower reproducibility (H.2).

**Regulatory (not in the brief's taxonomy, added because it is material)**
- UK/EU BMR does not apply to publishing UGAI as information, but attaches if a third party uses it as a benchmark in a financial instrument or to measure fund performance **[retrieved]**. Prospective, outside Urdais's control, and worth deciding a posture on before UGAI is public.

---

## Q. Production-read status

**Performed, on 16 September 2026.** Phase 1A's Bash-based probe was refused by policy (`Production Reads`); the Supabase MCP read was permitted and used, read-only, with no writes and no DDL.

- **Project:** `UrdaisProd`, ref `cyqtaydtfuwaexjkuynq` (us-east-1, Postgres 17.6.1.166), confirmed against `UrdaisDev` ref `scwwjoyouohfrwylalha`.
- **Query:** a single read-only `SELECT`/`UNION ALL` over `reference.methodologies`, `reference.instruments`, and `information_schema.tables`.
- **Result:** no `ugai` methodology row; no `ai-equity-universe` row; no UGAI instrument; no table matching `ugai|equity|securit|universe|listing|divisor|corporate|constituent|weight|fx|dividend|split`. Six methodologies and eight instruments exist, none of them UGAI.
- **Conclusion:** Phase 1A's backend finding is **confirmed against production**, not merely inferred from migrations. Since no UGAI table exists, no UGAI time-series row can exist.
- **Incidental observation, outside 2C's scope:** `UBWI` and `UTVI` are `lifecycle_status = live`, while all six UCPI instruments are `proposed` or `launch_blocked` — including `UCPI-H100-SXM-LISTED`, which publishes. Worth a glance from whoever owns UCPI operations; not pursued here.

---

## R. Source bibliography

Retrieved 16 September 2026.

**Verified directly (primary document extracted and read locally)**
- Polygon.io / Massive, *Market Data Terms of Service* (PDF) — https://massive.com/terms/market_data_terms.pdf — clause (c) Derived Works; clause (d) index/indicative value prohibition; §10 Effect of Termination; §1 Market Data definition (NYSE/Authorizing SRO).
- London Stock Exchange, *Market Data Policy Guidelines 2026* (PDF) — https://docs.londonstockexchange.com/sites/default/files/documents/market-data-policy-guidelines-2026_1.pdf — §4.1 four derived-data licence categories, incl. Indices/Benchmarks; §6 non-display categories; redistribution licence classes incl. Delayed/After Midnight.

**Retrieved (fetched and summarized; wording indicative)**
- Massive, *Massive for Businesses Terms of Service* — https://massive.com/legal/businesses-terms-of-service (last updated 2 Sep 2025).
- Tiingo, *Terms of Use* — https://app.tiingo.com/tos/ (last updated 5 Aug 2026) — §1.6 Data Storage, Retention, and Derived Products.
- Twelve Data, *Terms of Use* — https://twelvedata.com/terms (last updated 1 Jan 2026).
- Intrinio, *Terms of Service* — https://docs.intrinio.com/terms (last updated 3 Jun 2026).
- EODHD, *Terms and Conditions* — https://eodhd.com/financial-apis/terms-conditions.
- Financial Modeling Prep — https://site.financialmodelingprep.com/pricing-plans and /faqs; All Shares Float API — https://site.financialmodelingprep.com/developer/docs/stable/all-shares-float.
- Exchange Data International, *Shares Outstanding and Free Float* (PDF, V1.0, statistics valid to 16 Mar 2026) — https://www.exchange-data.com/wp-content/uploads/2026/05/EDI-Shares-Outstanding-and-Free-Float-V1.0.pdf
- Exchange Data International, *Free Float Service* — https://www.exchange-data.com/product/free-float-service-edi/
- Exchange Data International, *Securities Reference Data* (incl. `PIT_SRF`, `PIT_EVT`) — https://www.exchange-data.com/product/securities-reference-data/
- European Central Bank, *Euro foreign exchange reference rates* — https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html (32 currencies; ~16:00 CET; TARGET working days; **no TWD**).
- LSEG / FTSE Russell, *WMR FX Benchmarks* methodology and Critical Benchmark designation — https://www.lseg.com/content/dam/ftse-russell/en_us/documents/ground-rules/wmr-fx-methodology.pdf ; https://www.lseg.com/en/ftse-russell/latest-updates/wmr-closing-spot-rate-benchmarks-designated-critical
- LSEG, *Benchmark Index Regulation (UK & EU)* — https://www.lseg.com/en/data-analytics/financial-data/benchmarks/regulations-services ; benchmark administration transfer — https://lseg.com/en/ftse-russell/benchmarks/benchmark-regulation
- FCA, *UK Benchmarks Regulation* — https://www.fca.org.uk/markets/benchmarks/regulation
- Norton Rose Fulbright, *Benchmarks Regulation: has it flown under your radar?* — https://www.nortonrosefulbright.com/en/knowledge/publications/b33248fa/benchmarks-regulation-has-it-flown-under-your-radar (secondary, used only for the index-vs-benchmark distinction)
- CME Group, *Derived Data License Fees* 2023/2025/2026 — https://www.cmegroup.com/market-data/files/2026-derived-data-fees.pdf (cited as evidence that exchanges publish standing derived-data fee schedules; CME is not a UGAI venue)
- London Metal Exchange, *Derived data* — https://www.lme.com/market-data/market-data-licensing/derived-data (HTTP 403 on fetch; referenced from search result only)
- Databento — https://databento.com/equities ; https://databento.com/stocks ; *Introduction to market data licensing* — https://databento.com/blog/introduction-market-data-licensing
- FactSet, *Benchmarks & Indices: Data Solutions and Services* — https://www.factset.com/marketplace/catalog/product/factset-benchmarks-and-indices-data-solutions-and-services
- sec-api.io, *Outstanding Shares & Public Float API* — https://sec-api.io/docs/outstanding-shares-float-api
- Nasdaq Data Link, EDI publisher page — https://data.nasdaq.com/publishers/EDI
- Markets Media, *Complexities Expand in Market Data Licensing* — https://www.marketsmedia.com/complexities-expand-in-market-data-licensing/ (secondary; derived-data category structure)

**Not obtained.** Bloomberg, LSEG (data, as distinct from WMR/FTSE), FactSet, S&P Capital IQ, ICE and Morningstar publish no customer-facing licence terms; all are sales-gated. **No institutional-tier rights or price conclusion in this study should be read as evidenced** — those rows in D and E record capability and posture, not terms. Section M is the instrument for obtaining them.
