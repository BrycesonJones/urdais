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
