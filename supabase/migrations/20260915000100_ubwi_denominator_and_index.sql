-- UBWI Production V1, part 2: the denominator, the numerator and the index.
--
-- The design intent is that the methodology's least intuitive rules are constraints in
-- the database rather than conventions in the application:
--
--   * Bitcoin sits inside its own denominator, and the arithmetic is checked.
--   * The observed components sum to the vintage's observed subtotal, and that is checked.
--   * A component that includes consumer durables without stripping them cannot enter a
--     published denominator at all.
--   * A published point is immutable; a correction is a supersession, never an edit.
--   * A percentage change exists only across a boundary where one is meaningful.
--
-- The UCPI calculation calendar is deliberately *not* inherited. UCPI's cutoff and
-- publication deadline are arithmetic constraints on a daily UTC window; UBWI's numerator
-- is instantaneous and its denominator is annual, so a calendar copied from UCPI would be
-- a constraint on nothing. UBWI therefore carries its own run table.
--
-- Nothing is seeded and nothing is published by this migration.

-- ---------------------------------------------------------------- denominator

create table pipeline.wealth_vintages (
  id                             uuid primary key default gen_random_uuid(),
  estimation_rule_id             uuid not null references reference.wealth_estimation_rules (id) on delete restrict,
  -- The latest date for which the observed set is complete. Per-component dates are
  -- displayed rather than harmonised away.
  reference_date                 date not null,
  compiled_at                    timestamptz not null,

  observed_wealth_usd            numeric not null
                                   constraint wealth_vintages_observed_positive check (observed_wealth_usd > 0),
  imputed_wealth_usd             numeric not null
                                   constraint wealth_vintages_imputed_nonnegative check (imputed_wealth_usd >= 0),
  total_wealth_usd               numeric not null
                                   constraint wealth_vintages_total_positive check (total_wealth_usd > 0),

  -- The residual model, stored so it is auditable rather than one opaque number.
  observed_ratio                 numeric not null
                                   constraint wealth_vintages_observed_ratio_positive check (observed_ratio > 0),
  tail_calibration               numeric not null
                                   constraint wealth_vintages_calibration_positive check (tail_calibration > 0),
  central_tail_ratio             numeric not null
                                   constraint wealth_vintages_tail_ratio_positive check (central_tail_ratio > 0),
  unobserved_gdp_usd             numeric not null
                                   constraint wealth_vintages_unobserved_gdp_positive check (unobserved_gdp_usd > 0),
  world_gdp_usd                  numeric not null
                                   constraint wealth_vintages_world_gdp_positive check (world_gdp_usd > 0),
  world_gdp_source               text not null,

  -- Three coverage figures, never collapsed into one. The rights-cleared figure is the
  -- one that describes what Urdais may actually publish.
  observed_economy_count         integer not null
                                   constraint wealth_vintages_count_positive check (observed_economy_count > 0),
  observed_gdp_coverage          numeric not null
                                   constraint wealth_vintages_observed_coverage_range check (observed_gdp_coverage > 0 and observed_gdp_coverage <= 1),
  rights_cleared_gdp_coverage    numeric not null
                                   constraint wealth_vintages_cleared_coverage_range check (rights_cleared_gdp_coverage > 0 and rights_cleared_gdp_coverage <= 1),
  observed_wealth_coverage       numeric not null
                                   constraint wealth_vintages_wealth_coverage_range check (observed_wealth_coverage > 0 and observed_wealth_coverage <= 1),
  imputed_share_of_wealth        numeric not null
                                   constraint wealth_vintages_imputed_share_range check (imputed_share_of_wealth >= 0 and imputed_share_of_wealth < 1),

  -- Human capital is outside the concept entirely. Required true for any vintage that
  -- may serve as a denominator.
  excludes_human_capital         boolean not null default true
                                   constraint wealth_vintages_excludes_human_capital check (excludes_human_capital),
  notes                          text,
  created_at                     timestamptz not null default now(),

  -- The rights-cleared figure can never exceed what is observed at all.
  constraint wealth_vintages_cleared_within_observed
    check (rights_cleared_gdp_coverage <= observed_gdp_coverage),
  -- Observed plus imputed is the total. The residual is recorded, never absorbed.
  constraint wealth_vintages_parts_sum_to_total
    check (abs(observed_wealth_usd + imputed_wealth_usd - total_wealth_usd) <= total_wealth_usd * 1e-9),
  -- The imputation is the rule applied to the unobserved GDP, not a free number.
  constraint wealth_vintages_imputation_follows_rule
    check (abs(central_tail_ratio * unobserved_gdp_usd - imputed_wealth_usd) <= imputed_wealth_usd * 1e-9 + 1),
  -- The stated imputed share agrees with the two subtotals.
  constraint wealth_vintages_imputed_share_agrees
    check (abs(imputed_wealth_usd / total_wealth_usd - imputed_share_of_wealth) <= 1e-9)
);

comment on table pipeline.wealth_vintages is
  'One constructed Total Global Wealth estimate excluding Bitcoin: a sum over directly observed national balance sheets plus a modelled residual for the rest of the world. The vintage is an aggregation Urdais performs, not a number Urdais reads.';

create table pipeline.wealth_vintage_components (
  id                          uuid primary key default gen_random_uuid(),
  vintage_id                  uuid not null references pipeline.wealth_vintages (id) on delete restrict,
  economy_code                char(3) not null
                                constraint wealth_components_economy_format check (economy_code ~ '^[A-Z]{3}$'),

  -- A date, not a year: Australia's national balance sheet is as at 30 June.
  reference_date              date not null,
  value_national_currency     numeric not null,
  currency                    char(3) not null
                                constraint wealth_components_currency_format check (currency ~ '^[A-Z]{3}$'),
  value_usd                   numeric not null
                                constraint wealth_components_value_positive check (value_usd > 0),

  -- FX lineage. An end-period stock needs an end-period fixing at or before its own
  -- reference date; the wrong basis is worth up to 6.6 % per country.
  fx_basis                    text not null
                                constraint wealth_components_fx_basis_allowed check (fx_basis in ('end_period', 'period_average')),
  fx_rate_lcu_per_usd         numeric not null
                                constraint wealth_components_fx_positive check (fx_rate_lcu_per_usd > 0),
  fx_fixing_date              date,
  fx_source_interface_id      uuid references reference.source_interfaces (id) on delete restrict,

  -- Source lineage. Required, because two harmonised routes can disagree: France's net
  -- foreign position differs by EUR 379 bn between the OECD and Eurostat.
  source_interface_id         uuid not null references reference.source_interfaces (id) on delete restrict,
  source_series               text not null
                                constraint wealth_components_series_present check (btrim(source_series) <> ''),
  source_retrieval_id         uuid references pipeline.source_retrievals (id) on delete restrict,
  source_type                 text not null
                                constraint wealth_components_source_type_allowed check (source_type in ('primary', 'harmonized')),
  source_frequency            text not null default 'annual'
                                constraint wealth_components_frequency_allowed check (source_frequency in ('annual', 'quarterly', 'other')),
  period_selection_rule       text,
  acquisition_mode            text not null default 'automated'
                                constraint wealth_components_acquisition_allowed check (acquisition_mode in ('automated', 'manual_verified')),
  verification_evidence       text,

  observation_status          text not null
                                constraint wealth_components_status_allowed check (observation_status in ('observed', 'imputed')),
  rights_status               text not null
                                constraint wealth_components_rights_allowed check (rights_status in ('cleared', 'under_review', 'blocked')),

  land_treatment              text not null
                                constraint wealth_components_land_allowed check (land_treatment in ('included', 'partially_included', 'excluded', 'unknown')),
  consumer_durables_treatment text not null
                                constraint wealth_components_durables_allowed check (consumer_durables_treatment in ('excluded', 'included_and_stripped', 'included_not_stripped')),
  consumer_durables_stripped_usd numeric,
  consumer_durables_source_series text,

  gdp_usd_2024                numeric not null
                                constraint wealth_components_gdp24_positive check (gdp_usd_2024 > 0),
  gdp_usd_reference_year      numeric not null
                                constraint wealth_components_gdp_ref_positive check (gdp_usd_reference_year > 0),
  note                        text,
  superseded_by_id            uuid references pipeline.wealth_vintage_components (id) on delete restrict
                                deferrable initially deferred,
  superseded_at               timestamptz,
  supersession_reason         text,
  created_at                  timestamptz not null default now(),

  -- The USD figure is the national figure at the recorded rate. Checked, not trusted.
  constraint wealth_components_conversion_checks
    check (abs(value_national_currency / fx_rate_lcu_per_usd - value_usd) <= abs(value_usd) * 1e-9),
  -- An end-period fixing must not postdate the stock it converts.
  constraint wealth_components_fixing_not_after_reference
    check (fx_basis <> 'end_period' or fx_fixing_date is null or fx_fixing_date <= reference_date),
  -- A non-annual source needs a stored selection rule, or whichever script runs will
  -- re-derive one. Canada publishes four observations a year.
  constraint wealth_components_selection_rule_when_subannual
    check (source_frequency = 'annual' or period_selection_rule is not null),
  -- A manual verification must actually be one.
  constraint wealth_components_manual_needs_evidence
    check (acquisition_mode <> 'manual_verified'
           or (verification_evidence is not null and btrim(verification_evidence) <> '')),
  -- Consumer durables are outside the SNA asset boundary. Including them un-stripped is
  -- prohibited outright; stripping them requires the amount and the source line.
  constraint wealth_components_durables_never_unstripped
    check (consumer_durables_treatment <> 'included_not_stripped'),
  constraint wealth_components_durables_stripped_shape
    check (consumer_durables_treatment <> 'included_and_stripped'
           or (consumer_durables_stripped_usd is not null and consumer_durables_source_series is not null)),
  constraint wealth_components_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null))
);

comment on table pipeline.wealth_vintage_components is
  'One directly observed national balance sheet inside a vintage, with its own compiler series, reference date, FX lineage, rights state and asset-boundary treatment. At most one selected component per economy per vintage; a disagreeing route is stored as superseded rather than discarded.';

-- One live component per economy per vintage. A second route is kept, but superseded.
create unique index wealth_components_selected_idx
  on pipeline.wealth_vintage_components (vintage_id, economy_code)
  where superseded_by_id is null;

create index wealth_components_vintage_idx
  on pipeline.wealth_vintage_components (vintage_id, economy_code);

-- An economy Urdais does not observe but must name on the published surface. The gate is
-- on the disclosure, not on the observation: China does not compile the thing being
-- measured, and requiring that it did would be a permanent refusal rather than a standard.
create table pipeline.wealth_vintage_unobserved_economies (
  vintage_id          uuid not null references pipeline.wealth_vintages (id) on delete restrict,
  economy_code        char(3) not null
                        constraint wealth_unobserved_economy_format check (economy_code ~ '^[A-Z]{3}$'),
  economy_name        text not null,
  gdp_share_of_world  numeric not null
                        constraint wealth_unobserved_share_range check (gdp_share_of_world > 0 and gdp_share_of_world < 1),
  reason              text not null
                        constraint wealth_unobserved_reason_present check (btrim(reason) <> ''),
  primary key (vintage_id, economy_code)
);

comment on table pipeline.wealth_vintage_unobserved_economies is
  'Economies above the disclosure threshold that the vintage does not observe, with the reason. Publication is refused where a qualifying economy has no row here.';

-- Observed components must sum to the vintage's observed subtotal. This is the constraint
-- that makes the denominator auditable rather than asserted.
create or replace function pipeline.check_vintage_observed_subtotal()
returns trigger
language plpgsql
as $$
declare
  component_sum numeric;
  stated numeric;
  vintage uuid;
begin
  vintage := coalesce(new.vintage_id, old.vintage_id);
  select coalesce(sum(value_usd), 0) into component_sum
    from pipeline.wealth_vintage_components
   where vintage_id = vintage and superseded_by_id is null and observation_status = 'observed';
  select observed_wealth_usd into stated from pipeline.wealth_vintages where id = vintage;
  if stated is not null and component_sum > 0
     and abs(component_sum - stated) > stated * 1e-9 then
    raise exception 'observed components sum to % but the vintage states %; the residual must be recorded, never absorbed',
      component_sum, stated
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

comment on function pipeline.check_vintage_observed_subtotal() is
  'Enforces that the observed leg of a vintage is exactly the sum of its selected observed components.';

create constraint trigger wealth_components_subtotal_check
  after insert or update on pipeline.wealth_vintage_components
  deferrable initially deferred
  for each row execute function pipeline.check_vintage_observed_subtotal();

-- ---------------------------------------------------------------- numerator

create table pipeline.btc_market_observations (
  id                        uuid primary key default gen_random_uuid(),
  observed_at               timestamptz not null,
  -- A supply figure without its height is not reproducible.
  block_height              bigint not null
                              constraint btc_observations_height_positive check (block_height > 0),
  height_confirmed_by       text[] not null
                              constraint btc_observations_height_sources check (array_length(height_confirmed_by, 1) >= 2),
  supply_btc                numeric(20, 8) not null
                              constraint btc_observations_supply_positive check (supply_btc > 0),
  supply_construction       text not null
                              constraint btc_observations_supply_construction_allowed
                              check (supply_construction in ('claimed_issuance', 'nominal_schedule', 'vendor_reported')),
  supply_source_interface_id uuid not null references reference.source_interfaces (id) on delete restrict,
  price_rule                text not null default 'median_of_venues'
                              constraint btc_observations_price_rule_allowed check (price_rule = 'median_of_venues'),
  venue_count               integer not null
                              constraint btc_observations_venue_minimum check (venue_count >= 3),
  median_price_usd          numeric not null
                              constraint btc_observations_price_positive check (median_price_usd > 0),
  market_cap_usd            numeric not null
                              constraint btc_observations_market_cap_positive check (market_cap_usd > 0),
  retrieved_at              timestamptz not null,
  created_at                timestamptz not null default now(),
  -- Supply times price is the market capitalization. Arithmetic the database verifies.
  constraint btc_observations_market_cap_agrees
    check (abs(supply_btc * median_price_usd - market_cap_usd) <= market_cap_usd * 1e-9)
);

comment on table pipeline.btc_market_observations is
  'One instantaneous Bitcoin market capitalization: issued supply at a stated chain height times the median of at least three independent venue tickers. No lost-coin adjustment is applied, because no lost-coin estimate is deterministic.';

create table pipeline.btc_venue_quotes (
  observation_id      uuid not null references pipeline.btc_market_observations (id) on delete restrict,
  venue_interface_id  uuid not null references reference.source_interfaces (id) on delete restrict,
  price_usd           numeric not null
                        constraint btc_quotes_price_positive check (price_usd > 0),
  retrieved_at        timestamptz not null,
  -- True for the reading the median selected.
  selected            boolean not null default false,
  primary key (observation_id, venue_interface_id)
);

comment on table pipeline.btc_venue_quotes is
  'The per-venue rows behind an observation. This is what makes the median auditable rather than asserted, and what makes a numerator restatable years later.';

-- Exactly one venue row is the selected median.
create unique index btc_venue_quotes_selected_idx
  on pipeline.btc_venue_quotes (observation_id) where selected;

-- ---------------------------------------------------------------- the index

create table pipeline.ubwi_calculations (
  id                          uuid primary key default gen_random_uuid(),
  instrument_id               uuid not null references reference.instruments (id) on delete restrict,
  instrument_spec_version_id  uuid not null references reference.instrument_spec_versions (id) on delete restrict,
  methodology_version_id      uuid not null references reference.methodology_versions (id) on delete restrict,
  gate_version_id             uuid not null references reference.ubwi_publication_gates (id) on delete restrict,
  btc_observation_id          uuid not null references pipeline.btc_market_observations (id) on delete restrict,
  wealth_vintage_id           uuid not null references pipeline.wealth_vintages (id) on delete restrict,

  run_kind                    text not null default 'production'
                                constraint ubwi_calculations_kind_allowed check (run_kind in ('production', 'simulation', 'correction')),
  calculated_at               timestamptz not null,
  calculator_identity         text,

  numerator_usd               numeric not null
                                constraint ubwi_calculations_numerator_positive check (numerator_usd > 0),
  denominator_usd             numeric not null
                                constraint ubwi_calculations_denominator_positive check (denominator_usd > 0),
  ubwi_percent                numeric not null
                                constraint ubwi_calculations_percent_range check (ubwi_percent > 0 and ubwi_percent <= 100),

  observed_share_percent      numeric not null
                                constraint ubwi_calculations_observed_share_range check (observed_share_percent > 0 and observed_share_percent < 100),
  modeled_share_percent       numeric not null
                                constraint ubwi_calculations_modeled_share_range check (modeled_share_percent >= 0 and modeled_share_percent < 100),

  sensitivity_low_percent     numeric not null
                                constraint ubwi_calculations_low_positive check (sensitivity_low_percent > 0),
  sensitivity_high_percent    numeric not null,

  gate_passed                 boolean not null,
  gate_findings               jsonb not null default '[]'::jsonb,

  previous_calculation_id     uuid references pipeline.ubwi_calculations (id) on delete restrict,
  percentage_change           numeric,
  change_withheld_reason      text,
  created_at                  timestamptz not null default now(),

  -- The ratio is the ratio.
  constraint ubwi_calculations_ratio_agrees
    check (abs(numerator_usd / denominator_usd * 100 - ubwi_percent) <= 1e-9),
  -- The three shares of Total Global Wealth are exhaustive.
  constraint ubwi_calculations_shares_exhaustive
    check (abs(observed_share_percent + modeled_share_percent + ubwi_percent - 100) <= 1e-6),
  constraint ubwi_calculations_sensitivity_ordered
    check (sensitivity_high_percent >= sensitivity_low_percent),
  constraint ubwi_calculations_value_within_sensitivity
    check (ubwi_percent >= sensitivity_low_percent and ubwi_percent <= sensitivity_high_percent),
  -- A gate that refused must say why.
  constraint ubwi_calculations_failure_has_findings
    check (gate_passed or jsonb_array_length(gate_findings) > 0),
  -- A percentage change exists only against a real predecessor, and is withheld
  -- otherwise with a stated reason. There is no such thing as a change from nothing.
  constraint ubwi_calculations_change_shape
    check ((previous_calculation_id is null and percentage_change is null and change_withheld_reason is not null)
           or (previous_calculation_id is not null and percentage_change is not null and change_withheld_reason is null)
           or (previous_calculation_id is not null and percentage_change is null and change_withheld_reason is not null))
);

comment on table pipeline.ubwi_calculations is
  'One UBWI calculation. Bitcoin sits inside its own denominator and the arithmetic is checked here rather than trusted. A percentage change is null until a second real observation exists under the same methodology and model version.';

create index ubwi_calculations_time_idx
  on pipeline.ubwi_calculations (instrument_id, calculated_at desc);

-- Bitcoin is inside the denominator: the denominator is the vintage total plus the
-- numerator. This is the UBWI equivalent of the UCPI calendar check.
create or replace function pipeline.check_ubwi_denominator()
returns trigger
language plpgsql
as $$
declare
  vintage_total numeric;
  expected numeric;
begin
  select total_wealth_usd into vintage_total
    from pipeline.wealth_vintages where id = new.wealth_vintage_id;
  expected := vintage_total + new.numerator_usd;
  if abs(expected - new.denominator_usd) > new.denominator_usd * 1e-9 then
    raise exception 'denominator % is not the vintage total % plus the numerator %: Bitcoin must sit inside its own denominator',
      new.denominator_usd, vintage_total, new.numerator_usd
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ubwi_calculations_denominator_check
  before insert on pipeline.ubwi_calculations
  for each row execute function pipeline.check_ubwi_denominator();

-- A change may only be published across a boundary where it means something.
create or replace function pipeline.check_ubwi_change_boundary()
returns trigger
language plpgsql
as $$
declare
  prev record;
begin
  if new.previous_calculation_id is null then return new; end if;
  select methodology_version_id, wealth_vintage_id into prev
    from pipeline.ubwi_calculations where id = new.previous_calculation_id;
  if new.percentage_change is not null
     and (prev.methodology_version_id <> new.methodology_version_id
          or prev.wealth_vintage_id <> new.wealth_vintage_id) then
    raise exception 'a percentage change may not cross a methodology or vintage boundary; withhold it and state the reason'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ubwi_calculations_change_boundary_check
  before insert on pipeline.ubwi_calculations
  for each row execute function pipeline.check_ubwi_change_boundary();

create table pipeline.ubwi_sensitivity_scenarios (
  calculation_id       uuid not null references pipeline.ubwi_calculations (id) on delete restrict,
  scenario_key         text not null,
  label                text not null,
  tail_ratio           numeric not null
                         constraint ubwi_scenarios_ratio_positive check (tail_ratio > 0),
  imputed_wealth_usd   numeric not null
                         constraint ubwi_scenarios_imputed_nonnegative check (imputed_wealth_usd >= 0),
  total_wealth_usd     numeric not null
                         constraint ubwi_scenarios_total_positive check (total_wealth_usd > 0),
  ubwi_percent         numeric not null
                         constraint ubwi_scenarios_percent_range check (ubwi_percent > 0 and ubwi_percent <= 100),
  is_central           boolean not null default false,
  primary key (calculation_id, scenario_key)
);

comment on table pipeline.ubwi_sensitivity_scenarios is
  'The named assumptions the published range spans. Not a confidence interval: no distribution is assumed and none is available. An alternative denominator produces a diagnostic, not a second UBWI.';

create unique index ubwi_scenarios_central_idx
  on pipeline.ubwi_sensitivity_scenarios (calculation_id) where is_central;

-- ---------------------------------------------------------------- publication

create table pipeline.ubwi_publications (
  id                    uuid primary key default gen_random_uuid(),
  calculation_id        uuid not null unique references pipeline.ubwi_calculations (id) on delete restrict,
  published_at          timestamptz not null,
  -- Set at publication. A point that is not frozen is not published.
  frozen_at             timestamptz not null,
  publisher_identity    text,
  -- Resolved at publication time so a historical point renders as it was published.
  published_value_percent   numeric not null
                              constraint ubwi_publications_percent_range check (published_value_percent > 0 and published_value_percent <= 100),
  published_total_wealth_usd numeric not null
                              constraint ubwi_publications_total_positive check (published_total_wealth_usd > 0),
  published_market_cap_usd  numeric not null
                              constraint ubwi_publications_cap_positive check (published_market_cap_usd > 0),
  published_observed_share  numeric not null,
  published_modeled_share   numeric not null,
  published_low_percent     numeric not null,
  published_high_percent    numeric not null,
  methodology_version       text not null,
  residual_model_version    text not null,
  superseded_by_id      uuid references pipeline.ubwi_publications (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),
  constraint ubwi_publications_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null))
);

comment on table pipeline.ubwi_publications is
  'The release of a UBWI calculation, frozen at publication. The value, both shares, the range and the version identifiers are copied here so a historical point renders as it was published rather than as today''s reference data would render it. Corrections are supersessions, never edits.';

create unique index ubwi_publications_current_idx
  on pipeline.ubwi_publications (calculation_id) where superseded_by_id is null;

-- A simulation is never published, and a calculation the gate refused is never published.
create or replace function pipeline.check_ubwi_publication()
returns trigger
language plpgsql
as $$
declare
  c record;
begin
  select run_kind, gate_passed, ubwi_percent into c
    from pipeline.ubwi_calculations where id = new.calculation_id;
  if c.run_kind = 'simulation' then
    raise exception 'a simulation run is never published' using errcode = 'check_violation';
  end if;
  if not c.gate_passed then
    raise exception 'the publication gate refused this calculation; it may not be published'
      using errcode = 'check_violation';
  end if;
  if abs(c.ubwi_percent - new.published_value_percent) > 1e-9 then
    raise exception 'the published value % disagrees with the calculation %', new.published_value_percent, c.ubwi_percent
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ubwi_publications_check
  before insert on pipeline.ubwi_publications
  for each row execute function pipeline.check_ubwi_publication();

-- ---------------------------------------------------------------- append-only

create trigger wealth_vintages_append_only
  before update or delete on pipeline.wealth_vintages
  for each row execute function pipeline.forbid_mutation();
create trigger wealth_components_supersede_only
  before update or delete on pipeline.wealth_vintage_components
  for each row execute function pipeline.allow_only_supersession();
create trigger wealth_unobserved_append_only
  before update or delete on pipeline.wealth_vintage_unobserved_economies
  for each row execute function pipeline.forbid_mutation();
create trigger btc_market_observations_append_only
  before update or delete on pipeline.btc_market_observations
  for each row execute function pipeline.forbid_mutation();
create trigger btc_venue_quotes_append_only
  before update or delete on pipeline.btc_venue_quotes
  for each row execute function pipeline.forbid_mutation();
create trigger ubwi_calculations_append_only
  before update or delete on pipeline.ubwi_calculations
  for each row execute function pipeline.forbid_mutation();
create trigger ubwi_sensitivity_scenarios_append_only
  before update or delete on pipeline.ubwi_sensitivity_scenarios
  for each row execute function pipeline.forbid_mutation();
create trigger ubwi_publications_supersede_only
  before update or delete on pipeline.ubwi_publications
  for each row execute function pipeline.allow_only_supersession();

revoke update, delete, truncate on
  pipeline.wealth_vintages,
  pipeline.wealth_vintage_unobserved_economies,
  pipeline.btc_market_observations,
  pipeline.btc_venue_quotes,
  pipeline.ubwi_calculations,
  pipeline.ubwi_sensitivity_scenarios
  from service_role;
revoke delete, truncate on
  pipeline.wealth_vintage_components,
  pipeline.ubwi_publications
  from service_role;

alter table pipeline.wealth_vintages                     enable row level security;
alter table pipeline.wealth_vintage_components           enable row level security;
alter table pipeline.wealth_vintage_unobserved_economies enable row level security;
alter table pipeline.btc_market_observations             enable row level security;
alter table pipeline.btc_venue_quotes                    enable row level security;
alter table pipeline.ubwi_calculations                   enable row level security;
alter table pipeline.ubwi_sensitivity_scenarios          enable row level security;
alter table pipeline.ubwi_publications                   enable row level security;

-- Nothing is published at bootstrap.
do $$
declare n integer;
begin
  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists at bootstrap'; end if;
  select count(*) into n from pipeline.ubwi_calculations;
  if n <> 0 then raise exception 'a UBWI calculation exists at bootstrap'; end if;
end
$$;
