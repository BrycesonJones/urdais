# UBWI Data Architecture Proposal

**Status: internal architecture artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026 alongside [UBWI 0.1.0-draft](/docs/methodology/ubwi) and the [Phase 1 source study](../research/ubwi-phase1-source-study.md).

**No migration is created by this phase, and none should be.** The methodology is a draft, the denominator source is not cleared for production, and the development rules prohibit introducing tables before the slice that needs them. This document says what the tables should be when that slice arrives, and — more usefully — which existing Urdais patterns UBWI should reuse and which it must not.

## What UBWI Reuses Unchanged

The lineage, source-registry and calculation-run patterns already in `reference` and `pipeline` fit UBWI without modification, and reusing them is what keeps a second index family from becoming a second platform.

| Existing object | Use for UBWI |
|---|---|
| `reference.methodologies`, `reference.methodology_versions` | The UBWI methodology document and its versions. The draft-has-no-effective-date constraint is exactly the rule UBWI needs, since nothing may publish under 0.1.0-draft. |
| `reference.instruments`, `reference.instrument_spec_versions` | UBWI as an instrument. **One schema change is required**: `instruments_category_allowed` currently admits only `compute_price` and must admit `index`. |
| `reference.providers`, `reference.source_interfaces` | Statistical compilers and spot venues as providers; their datasets, bulk files and tickers as source interfaces. `provider_kind` needs `statistical_compiler` and `spot_venue`. The existing terms-review and production-access-state constraints already encode the rule that blocks UBWI today: a source cannot be production-approved unless its terms are reviewed and permitted, and WID's are not. |
| `pipeline.source_retrievals` | Every denominator file download and every venue ticker call, with its response and timestamp. |
| `pipeline.calculation_runs` | One UBWI calculation. The `run_kind` distinction between `production`, `simulation` and `correction` is what makes the 14 September candidate a labelled simulation rather than an accident waiting to be promoted. The UCPI window/cutoff/deadline check does **not** apply and must not be inherited. |
| `pipeline.forbid_mutation()`, `pipeline.allow_only_supersession()` | Append-only raw evidence; corrections by supersession, never by edit. |

## What UBWI Must Not Force-Fit

**`pipeline.normalized_observations` and the UCPI publication layer are wrong for UBWI.** They are built around a compute offer: a seller, a region, a quantity, a price per accelerator-hour, an availability grade, a capacity-source collapse. UBWI has no seller, no region series, no participant count and no market breadth. Pushing a world-wealth vintage through those columns would leave most of them null and the rest lying.

**`pipeline.token_price_observations` is equally wrong**, for the same kind of reason: it is shaped by a model, a pricing dimension and a service tier.

**The UCPI calculation calendar must not be inherited.** UCPI's cutoff and publication deadline are arithmetic constraints on a daily UTC window. UBWI's numerator is instantaneous and its denominator is annual. A calendar constraint copied from UCPI would be a constraint on nothing.

**There is no market-breadth analogue.** UBWI has one numerator and one denominator. Participant counting, dispersion withholding and source concentration do not translate. The honest analogue of market breadth for UBWI is the **denominator sensitivity range**, and it belongs in the published surface as a range, not as a breadth qualifier.

## Proposed New Objects

Seven tables. The design intent is that the methodology's two hardest rules — no double counting, and Bitcoin inside its own denominator — are **constraints in the database**, not conventions in the application, exactly as the UCPI calendar is.

### `reference.wealth_frameworks`

The accounting framework a vintage is compiled under: `sna_national_balance_sheet`, `household_net_worth`, `comprehensive_wealth`, `asset_class_aggregate`. Carries whether the framework is admissible as a denominator at all — `asset_class_aggregate` never is — so that an inadmissible framework cannot be attached to a published calculation.

### `reference.wealth_components`

The component taxonomy, versioned as reference data: slug, display name, the SNA asset class it maps to, and an `aggregation_role` of `additive` or `cross_check`. Sector components (personal, non-profit, government) and the Bitcoin adjustment are additive; asset-class figures (real estate, produced capital, natural capital, gold, listed equity) are cross-check. **The role is a property of the component, not of the row that uses it**, so a real-estate figure cannot be made additive by an ingestion mistake.

### `pipeline.wealth_vintages`

One published world-wealth estimate. Columns that matter:

- `framework_id`, `source_interface_id`, `source_retrieval_id`
- `reference_date` — the year-end the estimate describes
- `published_at` — when the compiler published it
- `total_usd`, `currency`, and `valuation_basis` (`market_value`, `replacement_cost`, `resource_rent_npv`, `mixed`)
- `exchange_rate_basis` (`market`, `ppp`) and, where a conversion was applied, `conversion_factor`, `conversion_source` and `conversion_note`
- `economy_count`, `coverage_share_of_world_gdp`, `coverage_note`
- `excludes_human_capital` (boolean, **required true** for any vintage used as a denominator), and `human_capital_stripped_usd` where a total was decomposed
- `includes_crypto_assets` (boolean) — drives whether the Bitcoin adjustment is added
- `is_admissible_for_publication`, derived from the source's terms-review state

Two constraints carry methodology:

- a vintage whose `exchange_rate_basis` is `ppp` may not be used as a denominator unless a conversion is recorded, which is the trap the source study found and would otherwise be repeated;
- a vintage may not be marked admissible unless its source interface is `production_approved`, mirroring the existing source-registry rule.

### `pipeline.wealth_vintage_components`

Per-vintage component values: `vintage_id`, `component_id`, `value_usd`, `share_of_total`, `reference_date`, `source_interface_id`, `note`.

**The anti-double-counting rule lives here.** A check constraint, or a trigger where a cross-row sum is needed, enforces that the `additive` components of a vintage reconcile to `wealth_vintages.total_usd` within a stated tolerance, with any shortfall recorded explicitly in a `residual_usd` column rather than absorbed. `cross_check` components are never summed and never reconciled; the schema's job is to make it impossible to sum them by accident.

### `pipeline.btc_market_observations`

One instantaneous numerator observation: `supply_btc` (numeric, eight decimals), `block_height`, `supply_construction` (`claimed_issuance`, `nominal_schedule`, `vendor_reported`), `supply_source_interface_id`, `price_usd`, `price_rule` (`median_of_venues`), `venue_count`, `observed_at`, `retrieved_at`, and a derived `market_cap_usd`.

Constraints: `venue_count >= 3`; `market_cap_usd = supply_btc * price_usd` within tolerance; `block_height` not null, because a supply figure without its height is not reproducible.

### `pipeline.btc_venue_quotes`

The per-venue rows behind an observation: `observation_id`, `venue_provider_id`, `price_usd`, `venue_timestamp`, `retrieved_at`, `selected` (true for the median). Append-only. This is the table that makes a numerator restatable years later, and it is the reason the median is auditable rather than asserted.

### `pipeline.ubwi_calculations`

The join: `run_id`, `instrument_spec_version_id`, `methodology_version_id`, `btc_observation_id`, `wealth_vintage_id`, `denominator_usd`, `numerator_usd`, `ubwi_percent`, `calculated_at`, and `previous_calculation_id`.

Three constraints carry the methodology's least intuitive rules:

- **Bitcoin inside its own denominator.** `denominator_usd = wealth_vintage.total_usd + numerator_usd` where the vintage does not already include crypto, and `= wealth_vintage.total_usd` where it does. This is the UBWI equivalent of the UCPI calendar check: arithmetic the database verifies rather than trusts.
- **The ratio is the ratio.** `ubwi_percent = numerator_usd / denominator_usd * 100` within tolerance, and `0 <= ubwi_percent <= 100`.
- **Change withheld across a boundary.** A percentage change may be non-null only where `previous_calculation_id` refers to a calculation with the same `wealth_vintage_id` and the same `methodology_version_id`. Across either boundary the column is null and a `change_withheld_reason` is set.

A sensitivity panel, if stored rather than computed on read, belongs in a small child table keyed on the calculation and an alternative vintage, never as extra columns on the calculation itself — because an alternative denominator produces a diagnostic, not a second UBWI.

## Publication

The published surface follows the existing separation between pipeline and published data. A published UBWI point carries the value, both timestamps, the vintage identity, the methodology version, the status, and the two component panels resolved at publication time so that a historical point renders as it did when it was published rather than as today's reference data would render it.

**No publication table should be created before a denominator source is cleared.** The current state is that none is, and a schema that permits publication is a schema that invites it.

## Sequencing

1. Resolve source rights on a denominator. Nothing below is worth building first.
2. Extend `instruments_category_allowed` to admit `index`, and `provider_kind` to admit the two new kinds. One small migration.
3. Numerator only: `btc_market_observations` and `btc_venue_quotes`, with venue interfaces registered. This is independently useful, has no licensing dependency, and can be exercised against real data immediately.
4. Denominator: `wealth_frameworks`, `wealth_components`, `wealth_vintages`, `wealth_vintage_components`, with the reconciliation constraint.
5. `ubwi_calculations`, with the three arithmetic constraints, and simulation runs only.
6. Publication, after methodology approval and an effective date.

Steps 3 and 4 are independent and can be built in either order. Step 5 must not be built before both.

---

## Phase 2A Amendment — the denominator is a set of countries, not a row

Added 14 September 2026 alongside [the Phase 2A source study](../research/ubwi-phase2a-denominator-source-study.md). **Still no migration, and still none should be.** The denominator source chain is not cleared: four of the five sources behind the Phase 2A candidate have terms that have never been retrieved, and 45.2 % of that candidate is imputed. What follows is what the model must become *when* a slice needs it, revised because Phase 2A changed the shape of the problem.

### What changed

Phase 1 assumed a denominator vintage was **one published world total** from one compiler, decomposed into three sectors. That is how WID and McKinsey publish, and it is why `pipeline.wealth_vintages` carried a single `total_usd` with a sector-level child table.

Phase 2A found that no such total exists under usable rights, and that the only constructible denominator is **a sum over economies**, each from its own compiler, in its own currency, at its own reference date, on its own valuation conventions, with an imputed residual for the rest of the world. The vintage is now an aggregation Urdais performs, not a number Urdais reads.

Three consequences follow, and each of them is a place where a constraint has to carry methodology that application code would otherwise be trusted with.

### `pipeline.wealth_vintage_components` gains an economy dimension

The existing design keys components on `(vintage_id, component_id)` where a component is a sector. That stays — sector decomposition is still how the additive panel is displayed for any economy that publishes one — but it is no longer the primary axis. The primary axis is the economy.

Columns the per-economy row needs, beyond those already proposed:

- `economy_code` — ISO 3166-1 alpha-3, referencing the existing ISO country reference data rather than a new list;
- `source_interface_id` and `source_retrieval_id` — **per economy**, because the United States comes from the Federal Reserve and Germany from Destatis and neither is the interface the other uses. This is the column that makes the rights state per-country rather than per-vintage;
- `reference_date` — per economy. The Phase 2A candidate spans 2017 to 2025 and the spread is the second-largest error in it;
- `value_national_currency`, `currency`, `fx_rate`, `fx_basis` (`period_average` | `period_end`), `fx_source_interface_id`, `fx_reference_date`;
- `is_estimated` (boolean) and, where true, `estimation_rule_version_id` and the inputs the rule consumed;
- `land_treatment` — `included` | `partially_included` | `excluded`. The United States is `partially_included`: private land sits inside real estate at market value, public land is excluded by the compiler's own footnote. Germany is `included`. A component that cannot state this cannot be compared with one that can;
- `corporate_valuation_basis` — `market_equity_derived` | `capital_stock_estimate` | `book` | `mixed`. The US derives corporate tangible assets from the market value of equity; others do not, and the two respond differently to the same equity shock;
- `consumer_durables_treatment` — `excluded` | `included_and_stripped` | `included_not_stripped`, with `consumer_durables_stripped_usd` required when the second. **`included_not_stripped` must be rejected for any component entering a published denominator**, because the methodology excludes consumer durables on the authority of 2025 SNA 4.120.

### The reconciliation constraint moves up a level

Phase 1's rule was that additive sector components reconcile to `wealth_vintages.total_usd`. The Phase 2A rule is stricter and has two levels:

1. **economy components sum to the vintage total**, observed plus imputed, with any residual recorded in an explicit column rather than absorbed;
2. **where an economy also has sector components, those sum to that economy's own total** — but only where the compiler publishes them, which most do not.

Level 2 is optional per economy. Level 1 is not optional, and it is the constraint that makes the denominator auditable.

### The vintage carries its own coverage, and coverage gates publication

New columns on `pipeline.wealth_vintages`:

- `observed_economy_count` and `observed_gdp_coverage_share` — the share of world GDP at market exchange rates held by the directly observed set, computed from a named, rights-clean GDP source and retained with its vintage;
- `observed_wealth_coverage_share` — the same on a structural wealth weight, retained because it differs materially from the GDP share (57.26 % against 48.72 % in the Phase 2A candidate) and because the difference is itself informative;
- `imputed_share_of_total` — the imputed residual as a share of the vintage total;
- `imputation_rule_version_id`.

**One constraint carries the whole Phase 2A decision**: a vintage may not be marked admissible for publication where `imputed_share_of_total` exceeds a configured ceiling. The source study recommends 25 %; the Phase 2A candidate is 45.2 % and would be refused. This is the UBWI analogue of the UCPI calendar check — arithmetic the database verifies rather than trusts, and the reason a future implementer cannot quietly ship a denominator that is mostly a model.

### `reference.wealth_estimation_rules`

The imputation rule is reference data with a version, not application code, for the same reason methodology versions are: a value computed under one rule must remain explicable after the rule changes, and history is never restated.

A rule row carries its slug, its description, the ratio basis it uses (`observed_set_wealth_to_gdp`, with a calibration factor and the source of that calibration), and its effective date. The Phase 2A central case would be one such row: observed-set ratio 5.675, calibration factor 0.772 sourced from CWON 2020, applied to the World Bank GDP residual.

The rule is deliberately simple. The backtest in the source study found that regional and income-group refinements do not reliably beat a single world ratio — regional grouping is worse at six of eleven cut-points — so the schema should not invite elaborations that add opacity without accuracy.

### Sources are registered per interface, and the two axes already work

No new rights vocabulary is needed. `reference.providers` gains statistical compilers and central banks under the `statistical_compiler` kind already proposed; `reference.source_interfaces` carries one row per dataset, and the existing `terms_review_state` / `data_use_terms_state` pair expresses the Phase 2A finding exactly.

That finding is worth stating in schema terms because it is the difference between this phase and the last: Phase 1's blockers were `not_permitted`, and Phase 2A's are `not_reviewed`. The constraint that refuses `production_approved` unless both axes read `permitted` already blocks both, correctly, and without conflating them.

### What is still not force-fitted

Unchanged from the Phase 1 proposal, and reconfirmed: no market breadth, no seller, no region series, no participant counting, no capacity-source collapse, and no UCPI calculation calendar. The honest analogue of market breadth for UBWI remains the denominator sensitivity range, and Phase 2A adds a second: the observed coverage share. Both belong on the published surface, not as qualifiers on an observation.

### Revised sequencing

1. Resolve **coverage** before rights. This is the change. Phase 1 sequenced rights first because rights were the blocker; Phase 2A found that permission cannot create a balance sheet China does not compile, and that the cheapest coverage gains — Eurostat's query problem, Australia's net foreign position — cost no permission at all.
2. Resolve terms for the Federal Reserve, the OECD, Destatis and Eurostat. Four retrievals and one outreach draft, not four negotiations.
3. Numerator only: `btc_market_observations` and `btc_venue_quotes`. Still independently useful, still carries no licensing dependency, still exercisable against real data today.
4. Denominator, with the per-economy model above and the coverage-ceiling constraint.
5. `ubwi_calculations`, simulation runs only.
6. Publication, after methodology approval, an effective date, and a coverage share that clears the ceiling.

---

## Phase 2B Amendment — rights are per-country, dates are not years, and routes disagree

Added 14 September 2026 alongside [the Phase 2B study](../research/ubwi-phase2b-coverage-expansion.md) and [the China source study](../research/ubwi-china-source-study.md). **Still no migration, and still none should be.** The per-economy model proposed in the Phase 2A amendment is preserved unchanged; what follows are three revisions it could not have anticipated and one sequencing change, each forced by a specific finding rather than by design preference.

### What changed

Phase 2A's rights position was that four of five sources had terms nobody had read. Phase 2B read them. **Rights-cleared coverage went from 0 % to 47.66 % of world GDP with no outreach sent**, and the OECD interface is now eligible for `production_approved` on both axes. The Phase 2A sequencing note — *"resolve coverage before rights"* — was right, and it was right for a reason that has now been demonstrated twice: the rights work was cheap, and finishing it did not move the coverage number at all.

### `source_interfaces.terms_state` cannot be a single value per interface

**Eurostat licenses the same dataset differently by country.** Its copyright notice authorises commercial reuse with attribution and requires no written licence, then excludes from commercial reuse *"data for countries other than: Member States of the European Union (EU), Member States of the European Free Trade Association (EFTA), official EU acceding and candidate countries"*.

One `nama_10_nfa_bs` extract therefore contains rows Urdais may publish commercially and rows it may not, distinguished by `geo`. A single interface-level `data_use_terms_state` would have to be set to the most restrictive value and would block France to protect the United Kingdom, or be set to the most permissive and would be wrong.

**Proposed:** `reference.source_interfaces` keeps the interface-level pair as the default, and gains an optional child table of **per-dimension terms exceptions** — interface, dimension name, value set, and the two axis states for that subset. The reconciliation rule is that a component's effective rights state is the most restrictive of the interface default and any exception matching its dimension values. The existing constraint refusing `production_approved` unless both axes read `permitted` then operates on the *effective* state, which is where it should have been operating all along.

### `reference_date` must be a date, not a year

**Australia's national balance sheet is as at 30 June.** Every other economy in the observed set is a calendar year-end. A `reference_year` integer would force one of two silent errors: treating a 30 June stock as a 31 December stock, or selecting the wrong end-period FX fixing for it — and Phase 2B measured the FX selection error at up to 6.6 % per country.

**Proposed:** `pipeline.wealth_vintage_components.reference_date` is a `date`, and the FX record carries `fx_fixing_date` alongside `fx_basis`, `fx_source` and `fx_rate`, with a constraint that `fx_fixing_date` is the last quoted fixing at or before `reference_date` when `fx_basis = 'end_period'`. The vintage's own stated reference date remains the latest year for which the observed set is complete, and the per-economy date is displayed rather than harmonised away.

### A component must record its interface, because two routes can disagree

**France's net foreign position differs by €379 bn between the OECD and Eurostat** — −52,518 against −431,822 EUR million for 2022 — while the two agree to 1.5 % on the non-financial asset stock. Harmonised sources are not automatically consistent sources.

**Proposed:** `source_interface_id` is **required, not optional**, on every component row, and the schema permits at most one `selected` component per `(vintage, economy, component)` while allowing others to be stored as `superseded` with a reason. That turns a disagreement into a visible, queryable artifact instead of an arbitrary choice made once inside a script. It is the same discipline as the Phase 2A rule that the registry carries the series identifier rather than the concept name, applied one level up.

### Fields the per-economy record needs, consolidated

Carried from the Phase 2A amendment and extended. Each is a required field on `pipeline.wealth_vintage_components`, and each exists because a specific finding would otherwise be invisible:

| Field | Forced by |
|---|---|
| `observation_status` (`observed` / `imputed`) | 38 % of the candidate denominator is a model |
| `rights_status` (`cleared` / `under_review` / `blocked`) | Germany and Italy are observed but not cleared; the three coverage figures must never collapse |
| `source_type` (`primary` / `harmonized`) | OECD and Eurostat are harmonisation layers over national compilers |
| `source_interface_id` (**required**) | France's two routes disagree |
| `reference_date` (**date**) | Australia is at 30 June |
| `valuation_basis` | US corporates are valued from equity prices; others from perpetual inventory |
| `land_treatment` (`included` / `partially_included` / `excluded`) | Land is 47 % of Australian non-financial assets and 0 % of US public land |
| `nfa_treatment` | The net-foreign-position term has a route-dependent value |
| `consumer_durables_treatment` + stripped amount | US includes them; ABS, CBS, Eurostat and Destatis do not |
| `is_estimated`, `estimation_rule_version` | The imputation rule is versioned reference data, not code |
| `coverage_weight` | Needed to compute all three coverage shares from the components themselves |

`pipeline.wealth_vintages` carries **three** coverage columns, not one: `observed_gdp_coverage_share`, `rights_cleared_gdp_coverage_share` and `imputed_share_of_total`. A constraint that refuses publication above a configured imputed-share ceiling should read the **rights-cleared** figure, because that is the one that describes what Urdais may actually publish.

### The publication gate belongs in the schema, and is not ready to be written

[Phase 2B proposes a gate](../research/ubwi-phase2b-coverage-expansion.md) — imputed share ≤ 25 %, rights-cleared observed coverage ≥ 70 %, composition band ≤ 10 pp, maximum vintage age and dispersion ≤ 4 years, and every economy above 3 % of world GDP observed. **It proposes it and does not adopt it**, and the schema should not encode it yet, for one reason and one only: the gate would block publication today and would go on blocking it indefinitely, so writing it into a constraint buys nothing and freezes a set of thresholds the evidence describes as a smooth curve rather than a cliff.

What *is* settled enough to record now is the **shape**: the gate is a bound on the imputed share and on the published uncertainty band, plus a named-economy requirement — not a single coverage percentage. Phase 2B re-tested a coverage percentage at seven levels and found no natural break at any of them.

### Revised sequencing

1. **Rights: done for the routes that matter**, and the interface records can be written when the slice arrives — World Bank, Federal Reserve, OECD, Eurostat (with per-country exceptions), ABS, CBS and Istat all `permitted` on both axes.
2. **Close the two remaining rights gaps by retrieval, not outreach**: Germany from GENESIS-Online under DL-DE/BY-2.0, Italy's financial leg from Banca d'Italia's AgID open data. Neither needs a message sent.
3. **Coverage is the blocker and it has a ceiling.** 62.93 % of world GDP without China, against a proposed 70 % gate. No amount of schema work changes this, and no slice should be built on the assumption that it will change.
4. Numerator only: `btc_market_observations` and `btc_venue_quotes`. Unchanged across three phases — still independently useful, still no licensing dependency, still exercisable against real data today. **This remains the only part of UBWI that is ready to build.**
5. Denominator, with the per-economy model above.
6. `ubwi_calculations`, simulation runs only.
7. Publication, after methodology approval, an effective date, and a gate the evidence supports.
