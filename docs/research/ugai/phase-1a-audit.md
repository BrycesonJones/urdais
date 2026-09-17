# UGAI Phase 1A — internal methodology and codebase audit, 16 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It establishes no methodology, publishes no value, approves no parameter, and grants no source right. It records what UGAI is inside the Urdais repository on 16 September 2026, measured against the methodology as written, and what must be decided before implementation.

**Headline finding: UGAI is already defined, and it is not the index the Phase 1A brief assumed.** The repository contains a 422-line researched methodology (`docs/methodology/ugai.md`, 0.1.0-draft, 12 September 2026) defining UGAI as a **divisor-based, capitalization-weighted equity index** over publicly traded AI companies. It is not a composite of token usage, compute prices, GPU capacity, energy demand, or memory prices. That methodology explicitly and repeatedly excludes those phenomena from UGAI by name. The brief's candidate-dimension inventory (its sections 4 and 5), performed as written, would not refine UGAI — it would replace it with a different product.

**Second finding: UGAI is on the public site right now, with a fabricated twelve-year history, and the homepage does not label it.** `urdais.com` serves a UGAI level of `184.21 pts`, a `+1.14%` daily move, and 4,400 synthetic daily closes running back to 19 August 2014, on a homepage rail that also carries UBWI's real published value. This contradicts the methodology's own first sentence and is the most urgent item in this audit. It is a disclosure defect, not a methodology defect, and it can be fixed in a day without resolving anything else in this document.

**Third finding: the binding blocker is the parent universe, not UGAI.** UGAI performs no eligibility selection of its own; it consumes a published `AI Equity Universe` version. That parent is 0.1.1-draft with ten unresolved empirical parameters, no constituent dataset, and no validation results. UGAI cannot compute a single observation until the parent has a production version. UGAI is therefore the most data-expensive and most licensing-dependent product Urdais has proposed, and it is the only one that cannot be advanced by building anything in this repository.

---

## Audit limitations

- **Production and development databases were not read.** A read-only probe of `reference.methodologies`, `reference.instruments`, and `pg_stat_user_tables` was attempted and refused by policy (`Production Reads`). Every database claim below is therefore derived from the 57 migrations in `supabase/migrations/`, which are the authoritative applied schema for both UrdaisProd and UrdaisDev. This is sufficient to establish that no UGAI table, instrument, or methodology row exists, because no migration creates one. It is not sufficient to rule out rows inserted outside the migration set. **Recommend a confirming read of `reference.methodologies`, `reference.instruments`, and `reference.methodology_versions` in both projects before Phase 2 opens.**
- Two findings in this document were verified by executing repository code against the real modules rather than by reading it: the mock UGAI series (section B) and the weekday-calendar range defect (section E.6).

---

## A. Executive summary

### What UGAI appears to be today

Three different UGAIs coexist in the repository, and they disagree with each other.

| Layer | What UGAI is there | Status |
|---|---|---|
| **Methodology** (`docs/methodology/ugai.md`) | A Laspeyres, divisor-based, capitalization-weighted **equity index**: index shares × official closing prices × FX ÷ divisor, over the AI Equity Universe. Base value 1,000.00. Price return headline plus a gross-total-return companion. USD. End-of-day, Mon–Fri. | 0.1.0-draft. Publication explicitly prohibited. |
| **Backend** | Nothing. No table, no instrument row, no methodology row, no calculation code, no cron, no API. | Absent. |
| **Frontend** | A market with a 184.21 pts level, a +1.14% daily change, 4,400 synthetic daily closes back to August 2014, 672 synthetic 15-minute points, and all six chart ranges enabled. | Mock, unlabelled on the homepage. |

The methodology is strong — it is the most rigorous document in `docs/methodology/`, with five provider precedents (S&P DJI, MSCI, FTSE Russell, Nasdaq, STOXX, Solactive) read and individually adopted, modified, or rejected. It does not need to be rewritten. It needs its twelve unresolved launch parameters resolved, its parent universe productionized, and its front end told the truth.

### The largest blockers, in order

1. **The parent universe has no production version.** `docs/methodology/ai-equity-universe.md` is 0.1.1-draft. Ten parameters are unresolved, including the material-exposure threshold `τ`, the issuer cap `c`, every investability minimum, and the venue/access eligibility register. No constituent list exists. No validation has been run. UGAI consumes membership, representative securities, and base weights from this document and defines nothing of its own. **Until this is resolved, UGAI has no constituents and cannot produce a value under any implementation.**
2. **Urdais has no equity market data of any kind, and no relationship that would supply it.** Not prices, not FX fixings, not corporate actions, not dividends, not exchange calendars, not security reference data, not shares outstanding, not free float. Zero of the seven source families UGAI requires are present in the schema or the source registry. The methodology states that scraping retail finance sites is not an acceptable production data model, which is correct and which makes this a licensing and budget decision, not an engineering one.
3. **The parent universe additionally requires point-in-time company filings.** Admission turns on `r_i_lower`, the substantiated lower bound of qualifying AI revenue as a share of consolidated external revenue, from the latest completed fiscal year, attributed at product or segment level, for every candidate company, worldwide. This is manual evidence work at a scale Urdais has not previously attempted — the whole UBWI numerator effort is smaller.
4. **The public site currently misrepresents UGAI.** See section B. This is independent of 1–3 and should be fixed first.
5. **No honest history is available at launch, and the site currently shows twelve years of it.** Reconstructing history requires point-in-time universe versions free of survivorship and look-ahead bias, plus historical prices and corporate actions for delisted and acquired constituents, with retention rights. Section J recommends launching with zero history.

### What is not a blocker

The calculation itself. The methodology's arithmetic is fully specified, deterministic, and testable today with synthetic inputs. Index shares, divisor mechanics, corporate-action treatments, additions and deletions, and the two return series are all closed. There are no open questions in the mathematics — only in the parameters and the data.

---

## B. Current implementation map

### B.1 Documentation

| File | Lines | What it is |
|---|---|---|
| `docs/methodology/ugai.md` | 422 | The UGAI methodology, 0.1.0-draft, prepared 12 September 2026, amended in review the same day. |
| `docs/methodology/ai-equity-universe.md` | 391 | The parent primitive, 0.1.1-draft. Shared with UAVI. |
| `docs/methodology/uavi.md` | 571 | The sibling volatility index, also draft, also consuming the parent. |
| `docs/methodology.md` | 89 | The framework. Names UGAI as "the first proposed index methodology". |
| `docs/FRONTEND_PRD.md:307,411` | — | UGAI listed as a public Urdais index. No definition. |
| `docs/BACKEND_PRD.md:324,832` | — | UGAI listed as a derived index. No definition. |
| `docs/architecture/methodology/ucpi-market-breadth-amendment.md` | — | Two incidental mentions; no UGAI content. |

There is **no** UGAI architecture document, no source study, no ingestion contract, no buildability assessment, and no launch-readiness document. Every other live Urdais product has at least one (`docs/architecture/ucpi-h100-backend-foundation.md`, `ubwi-data-architecture.md`, `utvi-data-architecture.md`, `token-production-operations.md`). UGAI has none. This is consistent with it never having been implemented.

### B.2 Code

UGAI appears in exactly six source files, and in only two of them does it do anything.

| File | Line | What |
|---|---|---|
| `src/lib/docs/catalog.ts` | 36–42 | Registers `methodology/ugai` in the public docs catalog, section "Methodology", directly after the parent universe. This is correct and should stay. |
| `src/data/market-catalog.ts` | 36 | `entry("UGAI", "Urdais Global AI Index")` — symbol, name, route. **No `description`, no `question`**, unlike UBWI and UACI. The detail page therefore shows no definition for UGAI. |
| `src/data/mock/market-detail.ts` | 513–518 | `UGAI_MARKET` — the fabricated series. See B.3. |
| `src/data/mock/market-detail.ts` | 584–593 | `MARKETS` array includes `UGAI_MARKET` in position 2. |
| `src/data/mock/indices.ts` | 19–20 | `INDEX_SNAPSHOTS` derives the homepage watchlist rows from `MARKETS`, excluding only UCPI. UGAI is therefore a homepage row. |
| `src/data/mock/market-detail.test.ts`, `src/data/market-catalog.test.ts`, `src/lib/docs/catalog.test.ts`, `src/lib/ubwi/read/surface.test.tsx` | — | Tests. See B.6. |

There is **no** `src/lib/ugai/`, no calculation module, no read model, no adapter, no source client. Compare `src/lib/ucpi/`, `src/lib/ubwi/`, `src/lib/utvi/`, `src/lib/tokens/`, `src/lib/frontier/`, `src/lib/open-weight/`, `src/lib/market-share/`, `src/lib/news/` — every other product has one.

### B.3 The mock series, measured

Executed against the real module (`findMarket("ugai")`):

```
symbol: UGAI | name: Urdais Global AI Index | unit: pts
description: undefined | question: undefined
daily points: 4400 | first: 2014-08-19 = 106.1578 | last: 2026-09-04 = 184.21
intraday points: 672
snapshot: { value: 184.21, changePercent: 1.14, asOf: 2026-09-04 }
availableRanges: ["1D","1W","1M","3M","6M","1Y"]
provenance: undefined
total since start: +73.5%
```

Generated by `buildIndexMarket("UGAI", "pts", { seed: 20140601, latestValue: 184.21, latestDailyReturn: 0.0114, points: 4400, volatility: 0.011, drift: 0.0004 }, { seed: 4_400_000, days: 7, volatility: 0.006 })` — a seeded mulberry32 geometric random walk with positive drift, plus a Brownian-bridge intraday tail (`src/data/mock/series-generator.ts`).

Every one of those numbers is invented. Specific contradictions with the methodology:

- **Level.** The methodology sets base value **1,000.00** with a documented rationale (finer displayed percentage resolution at two decimals). The mock shows **184.21**. A reader cannot reconcile the published methodology with the published number.
- **History.** The methodology says the base date is an unresolved launch parameter, selectable only once a validated historical dataset exists, and that any pre-launch series must be labelled backtested. The mock asserts **12.04 years** of continuous daily history and a **+73.5%** total return.
- **Intraday.** The methodology states the proposed frequency is end-of-day and that "nothing here should be built to support" intraday values. The mock carries **672 fifteen-minute points**.
- **Calendar.** The methodology calculates Mon–Fri only. The mock generates a point every calendar day including weekends.
- **Currency and unit.** The methodology publishes in USD. The mock unit is `pts`, which is defensible for an index level but is never stated anywhere the reader can see, because `market-catalog.ts` gives UGAI no description.

### B.4 Where it renders

| Surface | Route | Demo label? |
|---|---|---|
| Homepage "Urdais Indices" rail | `/` | **No.** `src/components/market/index-row.tsx` renders symbol, name, value, unit, and coloured percentage change, with no provenance affordance of any kind. |
| Index detail page | `/markets/ugai` | **Yes.** `src/components/market-detail/market-header.tsx:47` computes `showDemoBadge = instrument.provenance === undefined ? token === undefined : instrument.provenance === "demo"`. UGAI's instrument has no `provenance` and no token identity, so the badge renders. |
| Header search | all pages | Symbol and name only, via `searchMarketCatalog`. No value. Not misleading. |
| `/markets` | — | Opens on UCPI, not UGAI. UGAI reachable only by navigation. |

The asymmetry is the problem. The homepage row is the surface most people see, it is the surface that carries no label, and it is the surface that sits UGAI's invented 184.21 directly alongside UBWI's real published percentage — a row deliberately wired to production in `src/app/page.tsx` precisely so that it would never be mock. The file that builds the rail says so itself (`src/data/mock/indices.ts`): adding UBWI there "would mean giving a production index a mock value, which is precisely the demo-data problem this file still has for the others."

Additionally, the detail page prints `Updated {formatUpdatedAt(snapshot.asOf)}` from `MOCK_AS_OF = 2026-09-04T16:00Z` — **11 days stale as of today**, rendered in the same style as a real timestamp, and frozen, so it grows staler every day without changing.

### B.5 Database, API, cron

- **Tables:** none. 57 migrations create 60 tables across `reference` and `pipeline`. Grepping their names for `ugai|equity|securit|universe|listing|divisor|corporate|fx|constituent|weight` returns nothing relevant. There is no securities table, no listings table, no prices table, no FX table, no corporate-actions table, no dividends table, no index-shares table, no divisor table, no universe-membership table, and no weights table.
- **Instrument / methodology rows:** none. `reference.methodologies` is seeded with `ucpi`, `ucpi-listed-gpu`, `ubwi`, `utvi`, `model-frontier`, `open-weight-proprietary`. There is no `ugai` row and no `ai-equity-universe` row. `reference.instruments` contains only `compute_price` and `index` category rows, none of them UGAI.
- **API:** no UGAI endpoint. The only public data routes are `src/app/api/utvi/route.ts` and `src/app/api/tokens/prices/route.ts`. Neither mentions UGAI. No route serves the market catalog or the index rail — those are server-rendered from the mock module.
- **Cron:** no UGAI job. `vercel.json` schedules six: `news` (00:00), `ucpi` (01:00), `utvi` (02:00), `frontier` (03:40), `ubwi` (06:00), `token-verification` (07:00).

### B.6 Tests

Four files mention UGAI. None tests a calculation, because there is none.

| File | What it asserts |
|---|---|
| `src/lib/docs/catalog.test.ts:297–332` | UGAI is registered under Methodology at `methodology/ugai.md`, sits directly after the parent universe, links to the parent, the framework and UAVI, and has exactly one `#` heading. Genuinely useful; keep. |
| `src/data/market-catalog.test.ts:20` | Catalog order is exactly `["UCPI","UGAI","UAVI","UMPI","UPPI","UEPI","UACI","UBWI"]`. |
| `src/data/mock/market-detail.test.ts:9,33,42` | `MARKETS` order; UGAI's comparison options; `INDEX_SNAPSHOTS` order is `["UGAI","UAVI","UMPI","UPPI","UEPI","UACI"]`. |
| `src/lib/ubwi/read/surface.test.tsx:249` | Asserts the same six-symbol `INDEX_SNAPSHOTS` list, with the comment that "the mock indices legitimately use `pts` and carry movement". |

That last comment is itself an encoded assumption worth retiring: a mock index carrying an unlabelled movement on the homepage is not legitimate, and the UBWI work that wrote that line is the precedent for saying so.

---

## C. Existing methodology assumptions

### C.1 Decided explicitly, in the methodology, and not in question

These are settled design choices with written rationale. Phase 2 should treat them as given unless Bryceson reopens one.

| Decision | Value |
|---|---|
| Measured concept | Equity-market performance of admitted public AI companies. Not the AI economy itself. |
| Index form | Divisor-based base-weighted aggregative (Laspeyres): `UGAI_t = MV_t / D_t`, `MV_t = Σ q_i,t · P_i,t · X_i,t`. |
| Constituent selection | **Delegated entirely to the parent universe.** UGAI performs no eligibility review. |
| Weighting | Inherited parent base weights (issuer-capped, accessible free float) translated once per reset into fixed index shares. |
| Normalization | None in the statistical sense. Units are homogeneous (currency), so USD conversion via one daily fixing is the only normalization. No z-scores, rebasing, or growth-rate standardization — those are composite-index tools and do not apply. |
| Weight drift | Not corrected between resets. The cap binds only at scheduled resets. |
| Base value | 1,000.00, with rationale. |
| Base date | **Unresolved.** Conditional on a validated historical dataset. |
| Currency | USD, one reference fixing per currency per day, USD-per-unit orientation. |
| Series published | Two: `UGAI` (price return, headline) and `UGAI Total Return` (gross). No net, local-currency, or hedged series. |
| Rebalance cadence | Quarterly, driven by the parent's reconstitution. Exactly one scheduled UGAI reset per scheduled parent version. |
| Event handling | Parent event snapshots change membership only; no unscheduled rebalance of survivors. |
| Publication cadence | End-of-day, one observation per calculation day. Explicitly not intraday. |
| Calendar | Mon–Fri on which the FX fixing publishes. |
| Prices | Raw official closes, never back-adjusted. Corporate actions enter through index shares and the divisor only. |
| Missing data | Seven named categories with distinct treatments. Arbitrary imputation prohibited. |
| Status model | Published / Delayed / Unavailable / Corrected / Superseded. |
| Corrections | Restate inside the window; correct prospectively outside it; exceptional historical restatement only for integrity or reproducibility failure. |
| Versioning | UGAI carries its own methodology version, independent of the parent's. Each observation records four version identifiers. |
| Relationship to UAVI | UAVI consumes the parent, never UGAI. UGAI is not an input to UAVI. |

### C.2 Unresolved, and named as such in the methodology (12 items)

Production base date; FX fixing source/time/convention/licensing/fallback; calculation cutoff, publication target and deadline, half-days, unscheduled closures, days without a fixing; stale-price and stale-rate tolerances and escalation; correction window and materiality threshold; index-share decimal precision; dividend-confirmation and late-reinvestment procedure; distribution-line valuation hierarchy and maximum holding period; whether between-reset issuance adjusts index shares; reset lead time; licensed data providers with adequate retention rights; whether to add net / local / hedged companion series.

### C.3 Unresolved in the parent, and therefore binding on UGAI (10 items)

Material revenue threshold `τ`; disclosure bias and any absolute-exposure alternative; issuer cap `c`; investability minima and entry/retention buffers; exposure-retention buffer; whether a filed-data-only TTM measure is constructible; multi-share-class representativeness; the venue/access eligibility register and reference-investor assumptions; the operational calendar and data conventions; quarterly workload and newly-public coverage.

### C.4 Assumptions encoded implicitly in the product, and wrong

| Encoded where | Assumption | Why it is wrong |
|---|---|---|
| `market-detail.ts:513` | UGAI has a continuous ~12-year daily history. | No base date is selected; no history exists. |
| `market-detail.ts:513` | UGAI has an intraday tail. | The methodology forbids building for intraday. |
| `market-detail.ts:513` | UGAI's level is ~184. | The methodology sets base 1,000. |
| `series-generator.ts` | UGAI is quoted every calendar day. | Mon–Fri only. |
| `market-ranges.ts` | UGAI supports 1D/1W/1M/3M/6M/1Y. | At launch it supports none. Post-launch, 1D breaks every Monday (section E.6). |
| `market-catalog.ts:36` | UGAI needs no published definition or question. | UGAI's definition includes its limitations "as part of the published definition, not a footnote". |
| `index-row.tsx` | A homepage index row needs no provenance affordance. | It now shares a rail with a production row. |
| `types/market.ts:96` | `IndexSnapshot` cannot express provenance or a withheld state. | `MarketInstrumentDetail` has `provenance` (line 172); `IndexSnapshot` does not. That type gap is the direct cause of the unlabelled homepage row. |

---

## D. Data availability matrix

### D.1 What UGAI, as defined, actually needs

This is the real matrix. "In Urdais now" means present in the schema or source registry.

| Input family | What it is | In Urdais now? | Sourceability | Cadence | History available | Bias / risk |
|---|---|---|---|---|---|---|
| **Parent universe versions** (membership, representative securities, base weights, event snapshots) | The constituent set | **No** — no table, no methodology row | Internal. Urdais must build it. Requires τ, c, investability minima, venue register, and per-company filing evidence | Quarterly | None. Point-in-time reconstruction required for any backtest | The single hardest input. Evidence-based revenue attribution across five activity groups, worldwide, from filings |
| **Official closing prices** per listing | `P_i,t` | **No** | Licensed market data or direct exchange feeds. Scraping explicitly ruled out by the methodology | Daily per venue | Vendor-dependent; needs delisted and acquired names | Must be unadjusted closes; a back-adjusted vendor series would silently double-apply corporate actions |
| **FX reference fixings** | `X_i,t` | **No** | Licensed EOD fixing (precedents use 16:00 London) | Daily | Generally good | Orientation errors invert a whole currency; must be validated on ingestion |
| **Corporate actions** | splits, rights, spin-offs, mergers, delistings | **No** | Licensed corporate-action feed reconciled against issuer and exchange notices | Event-driven | Poor for delisted names | The largest source of silent index error in every provider precedent |
| **Dividends** with ordinary/special classification | Total-return series | **No** | Same feed, plus issuer characterization | Event-driven | Moderate | Classification disputes decide which series a distribution hits |
| **Security reference data** (ISIN, MIC, ticker, currency, receipt ratio, listing status) | Identity | **No** | Licensed reference data, exchanges, depositaries | Continuous | Weak for identity changes | Identity breaks are how history becomes irreproducible |
| **Exchange calendars** | Sessions, holidays, half-days | **No** | Licensed or venue-published | Annual + ad hoc | Good | Drives the valid-prior-close vs stale distinction |
| **Shares outstanding and free float** | Parent base weights | **No** | Filings plus an ownership vendor | Quarterly | Moderate | Float is the least reproducible number in the chain |
| **Company filings for `r_i_lower`** | Admission evidence | **No** | Public filings, manual attribution | Annual | Good for survivors, poor for delisted | Survivorship bias enters here first |

**Nine required input families. Zero present. No Urdais source registry entry, permission grant, or terms-review record exists for any of them** (`reference.source_interfaces`, `reference.permission_grants`, `docs/architecture/sources/`).

Honest classification, as the brief requires:

- **Data we actually possess:** none of it.
- **Data we can realistically obtain:** FX fixings and exchange calendars (cheap, widely licensed). Company filings for `r_i_lower` (free, but expensive in labour). Security reference data (licensable).
- **Data we would like to have:** full global official closes and a reconciled corporate-action feed with historical retention rights. Obtainable, but this is a paid market-data relationship with real recurring cost, and the retention rights needed for reproducibility are usually a separate and more expensive term.
- **Data currently unavailable or commercially impractical:** point-in-time historical free-float and ownership data for delisted constituents across emerging markets, at a quality that would survive the parent's own survivorship and look-ahead tests. This is the input that makes a long backtest impractical rather than merely expensive.

### D.2 The brief's candidate dimensions, assessed honestly

The brief asked for an inventory of token activity, compute prices, GPU capacity, energy, memory, and so on. **None of these belongs in UGAI as defined.** Assessed here because the brief asked, and because they would matter to a *different* product — recorded in section F.2 as an explicit alternative for Bryceson.

| Dimension | What it measures | In Urdais now? | Sourceability | Cadence | History | Bias / risk | Already owned by |
|---|---|---|---|---|---|---|---|
| Observed token volume | Tokens/day on one marketplace | **Yes, live** | One marketplace's dataset | Daily | 621 days backfilled | One venue, not the market. Its own methodology defers its universe claim to the source | **UTVI 1.0.0** |
| Model market share | Share of that same volume | **Yes, live** | Derived from UTVI | Daily | With UTVI | Not independent of UTVI | **Market Share 1.1.0** |
| Listed GPU rental price | USD/accelerator-hour, listed | **Yes, live** | Provider list pages, permissioned | Daily | From 16 Sep 2026 | Listed ≠ transacted | **UCPI-LISTED-GPU 1.0.0** |
| Accessible GPU offer price | Transactable compute price | Schema yes, **zero observations** | Providers; Runpod refused, others partial | Daily | None | Launch-blocked | **UCPI-H100-SXM** |
| Token list prices | USD per million tokens | **Yes, 6 providers** | Provider pages, manual | **Manual only, no cron** | Flat series by design | All sources research_usable / under_review; DeepSeek withheld | **Token Price** |
| Model capability vs price | Frontier of capability against list price | **Yes, live** | Capability sources + list prices | Daily cron | From 16 Sep 2026 | Benchmark choice is a judgement | **Model Frontier** |
| Open-weight vs proprietary | Access classification | **Yes** | Publisher licences | Event-driven | — | Noncommercial folds to Unclassified | **Open-weight 1.0.1** |
| Memory prices | DRAM/HBM pricing | **No** | Researched; **approved nothing** | — | — | SK hynix bars robots and non-commercial use | UMPI — mock only |
| Photonics prices | Optical module pricing | **No** | Tender research only | — | — | — | UPPI — mock only |
| Energy / power demand | Grid capacity, load | **No** | News sources only | — | — | — | UEPI — mock only |
| Accelerator hardware price | Capital-asset pricing | **No** | Not researched | — | — | Basket and weights unsettled | UACI — mock only |
| GPU capacity / datacenter buildout | Physical deployment | **No** | Not researched | — | — | Disclosure-driven, highly uneven | — |
| AI investment / capex | Spend | **No** | Not researched | — | — | Announcement ≠ deployment | — |
| Enterprise adoption proxies | Usage | **No** | Not researched | — | — | Survey-based, not reproducible | — |

**Read across that table: of fourteen candidate activity dimensions, four are live, one is manual and flat, one is schema-only with zero observations, and eight do not exist.** A composite index built today would be a blend of one marketplace's token volume, one listed GPU price series, and a capability frontier — three series from three venues, two of them under three weeks old. That is not a global AI activity index. It is a thin, US-and-marketplace-weighted proxy with two weeks of history.

**The brief also mixes incommensurable phenomena.** Token volume is a quantity, compute price is a price, capability is an ordinal score, capacity is a stock, investment is a flow. Combining a price index and a volume index into one number produces something that rises both when AI gets more expensive and when more of it is consumed, and falls when either falls — a figure whose direction cannot be interpreted. The existing methodology anticipated exactly this and chose a single homogeneous phenomenon instead. **That choice was correct and should be preserved.**

---

## E. Methodological risks

### E.1 Concentration — the material risk, and it is unmitigated

UGAI is capitalization-weighted over companies with material AI exposure. Today that population's accessible free-float capitalization is dominated by a handful of issuers. The parent applies one control: a common issuer cap `c` — **whose value is unresolved**. The parent states plainly that the cap "cannot by itself prevent a group of diversified firms from dominating" the measure, and proposes no country, sector, activity, or exposure-tier quota, on the correct ground that Urdais has no defensible target distribution for the AI economy.

Compounding this, the cap binds **only at scheduled quarterly resets**. Between resets, weights drift with prices and are not corrected, and the cap is not re-applied. A constituent capped at `c` in September can carry materially more than `c` by December. The methodology defends this correctly — forcing weights back continuously would embed a trading rule — but the consequence is that published as-of concentration can exceed the stated cap for up to a quarter, and this must be disclosed on the surface, not only in the document.

**Recommendation: the cap cannot be chosen from precedent.** The parent already requires testing capped against uncapped distributions on point-in-time samples, measuring single-issuer and diversified-group dominance and the effective constituent count `1/Σw_i²`. That test requires the constituent dataset that does not yet exist. It is the first empirical work Phase 2+ must fund.

### E.2 Double counting — low within UGAI, high if UGAI ever consumes another Urdais index

**Within UGAI:** structurally low. UGAI measures exactly one phenomenon (the market value of a fixed portfolio) through one instrument per company. The parent enforces one company, one membership, one representative security, consolidates duplicate listings and share classes, and counts each revenue item once when determining exposure. The genuine residual exposures are:

- **Supply-chain overlap.** A chip designer, its foundry, its memory supplier, its packaging house, and its cloud customer can all be members, and the same end-demand dollar appears in several of their revenues. The parent addresses this explicitly: it is not additive, and "this is not an additive estimate of the size of the AI economy." For an equity index this is not an error — these are five separate claims on five separate cash-flow streams — but it becomes an error the moment anyone reads the level as AI market size. That reading must be blocked on the surface.
- **Parent/subsidiary listings.** The parent requires recording ownership and removing controlling stakes from float, and forbids portraying such links as independent demand.
- **Diversified members' non-AI business.** Admitted companies contribute their whole admitted equity value. Disclosed, deliberate, and must stay disclosed.

**Across products:** the risk is severe and easy to introduce. If UGAI ever took UCPI as an input, it would mix a compute price into an equity index and pick up compute prices twice, since GPU-provider constituents' equity prices already embed compute pricing expectations. The same argument applies to UTVI, Token Price, and Model Frontier. **Recommendation: UGAI consumes exactly one Urdais artefact — the AI Equity Universe — and nothing else, ever. Record this as a methodology invariant, not a convention.**

### E.3 Geographic bias — "Global" is a claim Urdais cannot yet support

The parent is honest about this already: *"'Global' describes the target scope, not a claim of exhaustive representation."* That sentence is doing real work and must survive into UGAI's published surface, because UGAI carries the word in its name.

Specific risks, in order of severity:

1. **Chinese AI ecosystem.** The largest defensibility problem. Many significant Chinese AI companies are unlisted, listed on venues whose access route Urdais has not evaluated, or subject to foreign-ownership limits and capital controls that the parent's access rules may render ineligible. The parent requires a versioned venue/access register keyed to a stated reference investor — **unresolved**. UBWI hit the same wall from the other direction: China is recorded as a hard ceiling on that product's coverage (`docs/research/ubwi-china-source-study.md`). A UGAI that excludes most of the Chinese AI economy on access grounds and still calls itself Global has a naming problem, not a coverage footnote.
2. **Private-company exclusion.** UGAI is a public-equity index by construction. Several of the most consequential AI companies in the world are private. UGAI cannot see them and must say so.
3. **Disclosure-regime bias.** Admission requires evidenced product- or segment-level revenue attribution. Jurisdictions and issuers with thinner segment disclosure will fail `r_i_lower` even with substantial real AI business. The parent names this: the design "can underrepresent companies with substantial but undisclosed AI activity," a limitation that "must be measured and disclosed" and "must not be repaired through undocumented analyst exceptions." Because disclosure quality correlates with jurisdiction, **a revenue-evidence threshold is a geographic filter wearing a financial disguise.** This is the subtlest risk in the whole design and the easiest to overlook.
4. **Emerging-market data coverage.** Prices, float, ownership, and corporate actions are weakest exactly where the register is hardest to write. The parent already requires testing this explicitly.
5. **USD reporting and non-simultaneous pricing.** Local closes converted at one global fixing are not simultaneous. Standard, accepted by every precedent, and disclosed rather than corrected. Not a defensibility problem, but it belongs in the published limitations.

**Minimum conditions for "Global" to be defensible:**
- A versioned venue/access register covering, and stating a decision for, each major AI economy — at minimum the US, China (mainland and Hong Kong), Taiwan, South Korea, Japan, and the EU — with the reference investor and jurisdictional restrictions named.
- Published coverage gaps: for each major economy, what was admitted, what was excluded, and under which rule (exposure, access, data, liquidity).
- A measured disclosure-bias assessment, per the parent's own open question, quantifying what the evidence threshold omits and where.
- A published statement that UGAI covers listed equity only.

**If the register cannot admit a defensible share of the Chinese AI economy, do not weaken the access rules to keep the name.** Narrow the claim instead: publish as an accessible-developed-market index with an explicit scope statement, or rename. The brief is right that "Global" must be earned. On current evidence it is not yet earned, and this is a naming decision for Bryceson, listed in section J.

### E.4 Missing and stale data

The methodology already answers this well, distinguishing seven cases: valid prior close (holiday — not an error), stale observation (session held, no close received), missing observation (nothing to carry — do not impute), suspended security (carry and flag until the parent decides), provider outage (publish delayed or unavailable), unresolved corporate action (no estimated adjustment), and reference-data conflict (withhold that security, flag, escalate). Arbitrary imputation is prohibited. Nothing is forward-filled indefinitely: carrying is always flagged with its age, and prolonged staleness escalates.

The gaps are **numerical and operational, not conceptual**: the stale-input tolerance by count and by weight that converts Published into Delayed, the duration that triggers escalation, and the implausible-move tolerance that holds an observation for review. All three require production data, and all three are correctly marked unresolved.

One addition Phase 2 should make explicit, because the brief raises it and the methodology does not name it directly: **a revised historical input from a vendor is already covered ("vendor correction"), but the *cumulative* effect of many small prospective corrections is not.** If corrections outside the window are always handled prospectively through the divisor, the series slowly accumulates divergence from a clean recomputation. Recommend a periodic reconciliation — recompute the series from lineage, compare to published, and report the drift — rather than a policy that permits silent accumulation.

### E.5 Historical-series integrity

**What history could UGAI honestly publish today? None.**

- **Earliest defensible base date: not determinable, and not determinable by inspection of this repository.** It is a function of two things Urdais does not have: point-in-time parent universe versions, and licensed historical market data with retention rights. The methodology lists five conditions for selecting it and every one is unmet.
- **Which components have reliable historical series?** None are in Urdais. Externally, official closes and FX fixings are the most obtainable; corporate actions for delisted names and point-in-time free float are the least.
- **Which exist only prospectively?** The parent universe, entirely. There has never been an AI Equity Universe version, so there is no membership history and no weight history.
- **Would backtesting require reconstructed data?** Yes, and reconstruction is the hard part — not the prices, the **membership**. A backtest needs the universe as it would have been decided at each historical quarterly review, using only evidence available at that review's cutoff. Using today's constituent list backwards produces survivorship bias; using today's filings for historical reviews produces look-ahead bias. The parent forbids both and requires demonstrating their absence.
- **What reconstructed history could be labelled responsibly?** In principle, a clearly labelled backtest carrying its information limitations — the methodology already provides that vocabulary. In practice, only after the parent can reproduce point-in-time versions, which is a large, manual, evidence-bound exercise. It should not be attempted before UGAI is live.
- **Should UGAI launch with limited history?** **Yes — with none.** Launch forward-only at 1,000.00 on the base date, and let ranges become available as real observations accumulate, exactly as UBWI and the low-frequency range machinery already do. This is the one recommendation in this audit with no meaningful counter-argument: the alternative is a 4,400-point fabrication, which is what the site serves today.

### E.6 A concrete defect the existing range contract has for UGAI — confirmed

UGAI's calendar is Mon–Fri. The range-availability rule in `src/lib/market-ranges.ts` requires a window's base observation to fall within one further window back (`earliestAcceptableBase`) — the rule introduced deliberately to stop an ancient point from standing in as a "1 day" base. For a Monday observation, the 1D window opens on Sunday, the last observation at or before Sunday is Friday's close, and the earliest acceptable base is Saturday. Friday is earlier than Saturday, so **the base is rejected and the 1-day range disappears**.

Verified by executing the real module against a synthetic Mon–Fri series of 356 observations:

```
Monday   2026-09-14 | pts 356 | ranges ["1W","1M","3M","6M","1Y"] | 1D null
Tuesday  2026-09-15 | pts 357 | ranges ["1D","1W","1M","3M","6M","1Y"] | 1D -0.0999%
Friday   2026-09-11 | pts 358 | ranges ["1D","1W","1M","3M","6M","1Y"] | 1D -0.0999%
```

**Consequence: UGAI's headline signal — the one-day percentage change, which the methodology names as the primary market signal — would be withheld on every Monday, and after every market holiday.** Roughly a fifth of publication days.

This is not a bug in `market-ranges.ts`. That rule is correct for the daily-or-more-frequent series it was written for (UBWI and UTVI both publish seven days a week, so neither ever hits it). UGAI is the first weekday-only Urdais series, and the contract has no concept of a trading calendar. **Phase 2 must resolve this deliberately** — the honest options are a calendar-aware base bound (previous *scheduled session*, not previous calendar day) or an explicit 1D definition of "change from the previous published observation". Copying weekend points to unlock the button would be fabrication and is the wrong fix, for the reason the file itself already records about UBWI.

---

## F. Proposed methodology architecture

### F.1 Recommended: keep the existing concept unchanged

> **UGAI measures the equity-market performance of the publicly traded companies comprising the Urdais AI Equity Universe.**

That sentence is already written, already researched against five index providers, and already carries its own limitations as part of the published definition. **Recommend adopting it as-is.** The brief's instruction not to invent a definition is satisfied by not replacing the one that exists.

| Element | Recommendation | Status |
|---|---|---|
| Measurable concept | As above. Equity-market performance, not AI economic activity. | Already decided |
| Component families | One: admitted constituent equities, via the parent. No second family. | Already decided |
| Normalization | Currency conversion only, at one daily reference fixing. No statistical standardization — units are homogeneous. | Already decided |
| Weighting | Parent issuer-capped accessible free-float base weights → fixed index shares at each reset. | Already decided; `c` unresolved in parent |
| Base value | 1,000.00 | Already decided |
| Base date | **Set to the first live publication date.** No backfill, no reconstruction at launch. | **Needs approval** |
| Calculation cadence | End-of-day, Mon–Fri, after the last constituent session and the FX fixing for the date. | Already decided; cutoff times unresolved |
| Rebalance cadence | Quarterly, parent-driven. Event snapshots change membership only. | Already decided |
| Missing-data policy | The seven-case treatment as written; no imputation. | Already decided; tolerances unresolved |
| Methodology versioning | Four version identifiers per observation: UGAI methodology, parent methodology, universe version, UGAI parameter set. | Already decided; needs a storage home |
| Series at launch | **Headline price-return only. Defer `UGAI Total Return` to a second phase.** | **Needs approval** |

Two recommendations above depart from or sharpen the draft, and both narrow scope:

- **Base date = first live publication.** The draft leaves it open pending a validated historical dataset. That dataset is years and a market-data budget away. Setting the base at first publication makes UGAI launchable, and a labelled backtest can be added later as a distinct, separately versioned series if the data ever supports one. This also retires the fabricated history question permanently.
- **Drop the total-return companion from launch scope.** It needs a dividend feed with ordinary/special classification and issuer characterization — a second licensed feed, a second reconciliation process, and a second series to correct. The price-return headline is what the product displays. Adding the companion later is additive and breaks nothing.

### F.2 The alternative concept, stated so it can be rejected on the record

If Bryceson wants UGAI to mean a **composite index of AI economic activity** — which is what the Phase 1A brief assumed — then this is a different product, and the audit's position is:

- It should not be called UGAI or reuse that symbol, because a published methodology already binds that name to an equity index and would have to be retired rather than amended.
- It cannot be built today. Per section D.2, four dimensions are live, two of them derived from a single marketplace, and two of those four are under three weeks old.
- It would require solving the unit-commensurability problem (mixing prices, volumes, capability scores, and stocks), which the existing methodology deliberately avoided.
- Its "Global" claim would be weaker than the equity version's, not stronger: one token marketplace and a handful of Western GPU providers.

**Recommendation: reject the composite reframing. Keep UGAI as the equity index, and if a composite AI-activity measure is wanted, scope it separately once four or more independent, multi-venue, production dimensions exist with a year of history each.** Recorded in section J for decision.

---

## G. Backend gap analysis

### G.1 Reusable as-is

| Asset | Why it fits |
|---|---|
| `reference.methodologies` + `reference.methodology_versions` | Version identity, status (`draft`/`approved`/`superseded`/`retired`), `document_path`, `content_hash`, `effective_from`/`to`, and a constraint that **a draft can never carry an effective date**. This is exactly the guard UGAI needs while it stays 0.1.0-draft. UGAI and the parent universe each need one methodology row and a version row. |
| `reference.instruments` category `'index'` | Added for UBWI (`20260915000000_ubwi_index_foundation.sql:22–24`). UGAI fits the enum without a migration to it. |
| `src/lib/market-ranges.ts` low-frequency path | `lowFrequencyWindowPoints`, `isLowFrequencyRangeAvailable`, `lowFrequencyAvailableRanges`, `lowFrequencyPeriodReturn`, `lowFrequencyPeriodPerformance` — written for a once-daily index with no intraday tail, which is precisely UGAI. Needs the calendar fix in E.6. |
| The UBWI surface pattern (`src/lib/ubwi/read/surface.ts`, `publication-store.ts`, `publication-history.ts`, `src/components/ubwi/`) | A production index that renders a withheld state with a disclosure instead of a number, and draws its chart only from frozen production publications within one methodology regime. This is the closest existing precedent to what UGAI needs at launch and should be the template. |
| `reference.ubwi_publication_gates` pattern | Named, versioned, numeric publication preconditions stored as data and enforced before publishing. UGAI's stale-input tolerances, implausible-move limits, and minimum-constituent conditions want exactly this shape. |
| `reference.source_interfaces`, `reference.permission_grants`, `reference.providers`, `reference.market_entities`, `reference.iso_countries` | Source registry and terms machinery, reusable for market-data vendors. |
| `src/lib/db/connection.ts` | The pooled executor pattern. |
| The cron + `CRON_SECRET` + heartbeat pattern | `20260916050000_frontier_scheduler_heartbeat.sql` and the six existing routes. |

### G.2 Cannot be reused, with reasons

| Asset | Why not |
|---|---|
| `pipeline.calculation_runs` | Hardwired to the UCPI family's UTC-day calendar by CHECK constraint: `window_start = calculation_date at UTC`, `cutoff = window_start + 1 day`, `publication_deadline = cutoff + 1 day`. UGAI's cutoff is "after the last constituent session dated `t` closes and the FX fixing for `t` is available", and its deadline is "before the next earliest constituent open" — neither expressible in that arithmetic. Relaxing the constraint would weaken a guard UCPI depends on. **UGAI needs its own run table.** This matches the established pattern: UBWI and UTVI each got `*_calculations` / `*_publications` rather than reusing this. |
| `pipeline.normalized_observations`, `raw_offers`, `seller_observations`, `capacity_source_observations`, `regional_observations`, `regional_publications` | Modelled on compute offers — seller, region, quantity, price-per-accelerator-hour. No equity concept fits. |
| `pipeline.eligibility_assessments`, `eligibility_exclusions` | Shaped for offer eligibility, not company admission with revenue-attribution evidence. |
| `reference.instruments.output_unit` | Comment states it is "the economic unit of the published value, **never an index level**." UGAI publishes an index level in points against a base of 1,000. A comment, not a constraint, so not a hard block — but the stated intent conflicts and Phase 2 should resolve it explicitly rather than quietly writing `pts` into a column documented to forbid it. |

### G.3 What must be built (do not build it yet)

Nine conceptual objects the methodology names, none of which exists:

`UGAIObservation` · `UGAIConstituentSnapshot` · `IndexShare` · `IndexDivisor` · `SecurityPrice` (raw, unadjusted, with session status) · `FXObservation` (rate, orientation, fixing time, published/carried) · `CorporateAction` (terms, cum/ex dates, treatment applied, derived reference price) · `Dividend` (classification, reinvestment record) · `UniverseVersion` reference.

Plus, for the parent, a further set covering companies, securities, listings, classifications, exposure evidence, membership states, weight snapshots, and universe events.

**This is the largest single schema addition in Urdais's history — larger than UCPI's foundation — and none of it should be written before the parent universe's `τ` and `c` are approved, because those parameters determine whether there is a constituent set to model at all.**

### G.4 Reproducibility assessment

The methodology's required chain is:

`UGAI Observation → UGAI Methodology Version → Universe Version → Index Shares and Divisor → Prices, FX, Corporate Actions, Dividends → Original Sources`

**Can the current architecture preserve it? No — the middle four links have no storage whatsoever.** The two ends exist in pattern form (`methodology_versions` at the top; `source_interfaces` and `permission_grants` at the bottom). Everything between is absent.

Three architecture gaps that would make historical values permanently irreproducible if got wrong at the start, flagged now because they are cheap to design for and impossible to retrofit:

1. **Raw closes must be stored unadjusted, with session status, and must never be overwritten.** The methodology is emphatic: observed prices are never rewritten, and a vendor's back-adjusted series must not be ingested. If the schema ever stores an adjusted price in the price column, every historical level behind it becomes unverifiable.
2. **The divisor must be stored per observation at full precision, with each change's cause, before/after market values, and inputs.** A divisor series without its change reasons cannot be audited, and the divisor is the one number that absorbs everything that is not performance.
3. **Vintage must be a first-class dimension.** Every input needs source, publication/access timestamp, and vintage, with rejected and superseded inputs retained alongside the used ones — so that "what did we know on date `t`" is answerable separately from "what is true about date `t`". Retention depends on licensing; where retention is not permitted, the affected observations must be marked not independently reproducible rather than silently presented as reproducible. **This should be a term in the market-data negotiation, not an afterthought.**

---

## H. Frontend / API implications

No UI changes in this phase. What would need to change, in priority order:

**Immediate — the disclosure defect (recommend doing this before anything else, independent of all methodology work):**

1. `src/data/mock/indices.ts` / `src/components/market/index-row.tsx` — the homepage rail shows UGAI's invented 184.21 with a coloured +1.14% and no label, beside UBWI's real value. Either give `IndexSnapshot` a provenance field and label mock rows, or remove the mock indices from the rail. UBWI's own precedent (`market-detail.ts:571`) is the model: it was stripped of its synthetic walk because the comment was honest about being a demo while the page was not.
2. `src/types/market.ts:96` — `IndexSnapshot` cannot express provenance or a withheld state, while `MarketInstrumentDetail` can (line 172). That type gap is the direct cause of item 1.
3. `src/data/mock/market-detail.ts:513–518` — the 4,400-point history, 672 intraday points, and 184.21 level. Follow the `UBWI_MARKET` precedent: an empty family and a disclosed state.
4. `MOCK_AS_OF` — the detail page renders "Updated 4 September 2026" in real-timestamp styling, 11 days stale and growing.

**On methodology approval:**

5. `src/data/market-catalog.ts:36` — UGAI needs a `description` and `question`. Its published definition includes its limitations, so the surface must carry "an equity-market representation of the public AI economy, not a measure of the AI economy itself," and must not present the level as a valuation of AI activity.
6. `src/lib/market-ranges.ts` — the weekday-calendar defect in E.6, before UGAI publishes a second observation.
7. Range controls and `PeriodPerformance` — must show only ranges real history supports, and must never render a Delayed or Unavailable day as a zero change. The low-frequency helpers already behave correctly; they must be the path UGAI uses.
8. Status rendering — Published / Delayed / Unavailable / Corrected / Superseded have no UI vocabulary today. Five states, at least three visually distinct.
9. Two series — headline and total return must be distinctly labelled and never substituted for one another, if the companion is ever added.
10. Methodology link, universe version, and last-updated must appear on the surface, per the publication requirements.
11. As-of constituent weights must be published alongside the parent base weights and the universe version they came from, and the drift disclosure must be visible where concentration is shown.
12. A new `/api/ugai` route, following the `src/app/api/utvi/route.ts` contract — validate the response against its own contract and answer 500 rather than serve an unchecked number; return a null snapshot with a reason while the methodology is draft.

---

## I. Invariants the implementation must enforce

Not a security review; these are the methodology-integrity invariants the brief asks for.

**Publication gates**
- No observation may be published under a `draft` methodology version. Enforceable in the schema today — the pattern exists at `20260915040000_ucpi_approved_version_publication_guard.sql`. UGAI needs the same guard from its first migration.
- No observation from a partially closed market set. The level for `t` requires the last constituent session dated `t` to have closed and the FX fixing for `t` to exist.
- No publication with stale inputs beyond tolerance — publish Delayed instead.
- No publication where as-of weights do not sum to one, or base weights at a scheduled reset do not match the parent snapshot.
- No publication when a parent version is draft, backfilled, or was not the published version for that date.
- No publication from a `simulation` run. Precedent exists in `calculation_runs.run_kind`.

**Calculation integrity**
- Divisor continuity: the level immediately before and after every after-close change must be identical at constant prices. Assert it, do not assume it.
- Look-ahead prohibition: no input whose publication time is after the cutoff for `t` may enter `t`.
- Corporate actions effective on the ex-date, never earlier or later.
- Raw closes immutable and never back-adjusted; adjusted reference prices recorded against the action, not the price.
- Unrounded values throughout; a rounded value never feeds a subsequent calculation.
- FX orientation validated on ingestion (USD per unit, never inverted). An inverted rate silently corrupts a whole currency.
- One representative security per constituent; no duplicate economic claim; distribution lines identified as such.

**Operational**
- Idempotent ingestion: the same price, action, or fixing delivered twice must not create two observations. Natural keys on (security, date, source) and (currency, date, source).
- Single-writer calculation per date: concurrent cron execution must not produce two observations for one date, nor a partial run that publishes. Advisory lock plus an append-only, all-or-nothing publication row.
- No partial runs: a failed calculation leaves no publishable artefact.
- Append-only publications; corrections by supersession, never by editing a row. This is already Urdais practice (`regional_observations`, UBWI, UTVI) and is doubly important here because **an approved methodology version is never edited in place — it is superseded, and `content_hash` is never re-pointed.**
- Implausible-value quarantine: a constituent or index daily change outside tolerance holds the observation for review before publication.
- Impossible-value rejection: non-positive prices, non-positive index shares, a zero or negative divisor, negative weights, weights not summing to one.
- Source authenticity: every price, action, and fixing traceable to an identified interface with a recorded permission grant, per existing Urdais practice.
- Version consistency: an observation's four version identifiers must be mutually consistent, and a UGAI version change must never alter observations before its effective date.

---

## J. Phase 2 recommendation

**Do not implement UGAI in Phase 2.** Nothing buildable in this repository advances it, because the constituent set does not exist and no amount of schema work creates one.

**Recommended Phase 2, in this order:**

**Phase 2A — UGAI demo-data remediation (small, self-contained, no methodology dependency).**
Remove the fabricated UGAI series and label or remove the remaining mock index rows. Follow the `UBWI_MARKET` precedent exactly. Give `IndexSnapshot` the provenance or withheld-state vocabulary it lacks. This is the only item in this audit that is both urgent and unblocked, it touches no methodology, and it closes a live public-integrity defect. It would also naturally cover UAVI, UMPI, UPPI, UEPI, and UACI, which have the same problem — **six unlabelled mock index rows on the homepage, not one.**

**Phase 2B — AI Equity Universe parameter research (the actual critical path).**
The two parameters that gate everything: the material-exposure threshold `τ` and the issuer cap `c`. Both require a reviewed company sample across the five activity groups, regions, and size bands, built from real filings, tested for borderline decisions, diversified-issuer treatment, and historical stability. Output: a research document and a recommended parameter release, not code. Until `τ` and `c` are approved there is no constituent list, and until there is a constituent list there is nothing to weight, price, or publish.

**Phase 2C — market-data source study (can run in parallel with 2B).**
Which vendors can supply official unadjusted closes, corporate actions, dividends, FX fixings, calendars, and security reference data for the venues the universe will plausibly admit; at what cost; and **with what historical retention rights**, since reproducibility depends on retention and retention is usually a separate commercial term. Output: a source study in the established `docs/research/` / `docs/architecture/sources/` form, with terms review. This determines whether UGAI is affordable, which is currently unknown.

**Not Phase 2:** the schema, the calculation engine, the cron, the API, any migration, and any base-date selection. All of it is premature until 2B and 2C land.

---

## K. Decision register

| # | Decision | Current evidence | Recommendation | Confidence | Requires Bryceson approval? |
|---|---|---|---|---|---|
| 1 | Is UGAI an equity index or a composite AI-activity index? | `docs/methodology/ugai.md` defines an equity index and excludes activity measures by name; 391-line parent universe built for it; UAVI depends on the same parent | **Keep the equity index. Reject the composite reframing.** | High | **Yes — the brief assumed otherwise** |
| 2 | Remove the fabricated UGAI series from the public site | 4,400 synthetic closes to Aug 2014, level 184.21 vs methodology base 1,000, unlabelled homepage row beside UBWI's real value | **Remove now, as Phase 2A, independent of all methodology work** | High | **Yes — it is a public change** |
| 3 | Scope 2A to all six mock index rows, not just UGAI | UAVI, UMPI, UPPI, UEPI, UACI have identical unlabelled mock rows | Fix all six together | High | Yes |
| 4 | Base date | Methodology leaves it open pending a validated historical dataset that does not exist | **First live publication date. No backfill, no reconstruction.** | High | **Yes** |
| 5 | Launch history | Point-in-time universe reconstruction is survivorship- and look-ahead-exposed and needs data Urdais lacks | **Launch with zero history; ranges unlock as observations accumulate** | High | Yes |
| 6 | Total-return companion at launch | Needs a second licensed dividend feed with ordinary/special classification | **Defer. Headline price return only.** | Medium-high | **Yes — narrows the draft** |
| 7 | Can UGAI defend "Global"? | Parent already says Global is target scope, not exhaustive representation; China is an access-and-disclosure wall, as UBWI independently found; private companies invisible | **Not yet defensible. Decide at universe approval: publish the venue register and coverage gaps, or narrow the claim / rename. Do not weaken access rules to keep the name.** | Medium | **Yes** |
| 8 | Does UGAI ever consume another Urdais index? | Equity prices already embed compute and token pricing expectations | **Never. One input: the AI Equity Universe. Record as a methodology invariant.** | High | No — confirms the draft |
| 9 | Weekday-calendar range defect | Confirmed by execution: 1D unavailable every Monday for a Mon–Fri series | **Fix `market-ranges.ts` with a calendar-aware base bound, or define 1D as change from the previous published observation. Never synthesise weekend points.** | High | Yes — it is a methodology-visible definition |
| 10 | UGAI's own run/observation tables vs reusing `calculation_runs` | `calculation_runs` CHECK-constrains the UTC-day calendar; UBWI and UTVI each got their own tables | **Own tables. Do not relax UCPI's guard.** | High | No — architecture, and not yet due |
| 11 | `instruments.output_unit` documented as "never an index level" | UGAI publishes a level in points | Resolve explicitly when UGAI is registered; do not quietly contradict the comment | Medium | No |
| 12 | Phase 2 shape | Nothing buildable advances UGAI; `τ` and `c` gate everything | **2A remediation; 2B universe `τ`/`c` research; 2C market-data source study. No schema, no engine, no cron, no migration.** | High | **Yes** |
| 13 | Confirming database read | Production reads refused during this audit; migrations show no UGAI artefacts | Confirm `reference.methodologies`, `instruments`, `methodology_versions` in UrdaisProd and UrdaisDev before Phase 2 opens | High | Yes — needs permission |

---

## Appendix — answers to the Phase 1A questions

1. **Catalog/UI concept or real backend computation?** Catalog and UI only. Zero backend computation. The methodology, however, is substantial and researched — UGAI is far better *specified* than it is implemented.
2. **Existing methodology document?** Yes — `docs/methodology/ugai.md`, 422 lines, 0.1.0-draft, 12 September 2026, with five provider precedents adopted/modified/rejected individually, plus its 391-line parent `ai-equity-universe.md` at 0.1.1-draft.
3. **Current or historical UGAI values?** Yes, on the public site: 4,400 daily closes from 19 August 2014 (106.1578) to 4 September 2026 (184.21), 672 intraday points, +73.5% total.
4. **Where do they come from?** Mock. A seeded mulberry32 geometric random walk with positive drift plus a Brownian-bridge intraday tail (`market-detail.ts:513`, `series-generator.ts`). Not seed data, not hardcoded values, not ingested — generated at render time, deterministically.
5. **Does any frontend present UGAI as live or historically measured?** Yes. The homepage rail shows the level and a coloured daily change with **no** label. The `/markets/ugai` detail page does show a "Demo data" badge, but also renders a full chart, six enabled ranges, period returns, and "Updated 4 September 2026".
6. **Does the API expose UGAI?** No. Only `/api/utvi` and `/api/tokens/prices` exist; neither mentions UGAI.
7. **Database observations or time series?** No. No UGAI table, no instrument row, no methodology row, no equity/price/FX/corporate-action/universe tables at all. (Established from the migration set; production read refused — see Audit limitations.)
8. **Scheduled jobs?** No. Six crons exist; none is UGAI.
9. **Tests mentioning UGAI?** Four files, all structural: docs-catalog registration and links, catalog ordering, mock market ordering, and comparison options. No calculation test, because there is no calculation.
10. **Implicit assumptions encoded?** Eight, tabulated in C.4. The most consequential: that UGAI has twelve years of daily history, that its level is ~184 rather than the methodology's base of 1,000, that it has an intraday tail the methodology forbids building, that it is quoted every calendar day rather than Mon–Fri, and that a homepage index row needs no provenance affordance.

**Anything that could mislead a user into believing UGAI contains real historical observations:** the unlabelled homepage row; the 4,400-point chart; the six enabled range buttons and their period returns; the "+1.14% today"; the frozen "Updated 4 September 2026"; the absence of any published definition for UGAI in the market catalog; and the placement of all of it beside UBWI's genuinely published value in the same rail.
