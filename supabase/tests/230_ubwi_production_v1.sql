-- UBWI Production V1: the schema carries the methodology's hardest rules as constraints,
-- not as conventions. This file proves each one refuses what it is supposed to refuse.
--
-- It rolls itself back, like every other file here.
begin;

do $$
declare
  ok boolean;
  n integer;
  rule_id uuid := 'b0b0b0b0-0000-4000-8000-000000000005';
  gate_id uuid := 'b0b0b0b0-0000-4000-8000-000000000007';
  frontier_id uuid := 'b0b0b0b0-0000-4000-8000-000000000006';
  instrument_id uuid := 'b0b0b0b0-0000-4000-8000-000000000003';
  spec_id uuid := 'b0b0b0b0-0000-4000-8000-000000000004';
  mv_id uuid := 'b0b0b0b0-0000-4000-8000-000000000002';
  fed uuid;
  ecb uuid;
  bok uuid;
  oecd uuid;
  chain uuid;
  venue_a uuid;
  venue_b uuid;
  venue_c uuid;
  vintage uuid;
  btc uuid;
  calc uuid;
begin
  select id into fed   from reference.source_interfaces where slug = 'federal-reserve-z1';
  select id into ecb   from reference.source_interfaces where slug = 'ecb-euro-reference-rates';
  select id into bok   from reference.source_interfaces where slug = 'bok-ecos-national-balance-sheet';
  select id into oecd  from reference.source_interfaces where slug = 'oecd-sdmx-national-accounts';
  select id into chain from reference.source_interfaces where slug = 'blockchain-info-supply';
  select id into venue_a from reference.source_interfaces where slug = 'coinbase-spot';
  select id into venue_b from reference.source_interfaces where slug = 'bitstamp-ticker';
  select id into venue_c from reference.source_interfaces where slug = 'kraken-ticker';

  -- ------------------------------------------------------------------ reference data
  if fed is null or ecb is null or bok is null then raise exception 'UBWI source interfaces missing'; end if;

  -- Every denominator and FX source is in exactly one of two honest states: permitted on
  -- both axes with a successfully retrieved artifact behind it, or unreviewed with no
  -- artifact and no claim. Anything between the two -- a permitted axis with nothing to
  -- rest on, or a retained artifact that never produced a state -- is the failure this
  -- rejects. Stats NZ sits in the second state: a registered candidate whose licence
  -- could not be read, recorded rather than assumed either way.
  select count(*) into n from reference.source_interfaces
   where source_class in ('statistical_dataset', 'exchange_rate_series')
     and not (
       (terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
        and terms_artifact_hash is not null and terms_artifact_status = 200)
       or
       (terms_review_state = 'not_reviewed' and data_use_terms_state = 'not_reviewed'
        and terms_artifact_hash is null)
     );
  if n <> 0 then raise exception '% denominator/FX source(s) are in neither an evidenced nor an honestly-unreviewed state', n; end if;

  -- The unreviewed ones supply nothing, so the count of evidenced compilers is what the
  -- observed set actually rests on.
  select count(*) into n from reference.source_interfaces
   where source_class in ('statistical_dataset', 'exchange_rate_series')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  -- Eleven at Production V1; thirteen from Phase 2E, which admitted Taiwan and with it
  -- both DGBAS's National Wealth Statistics and the CBC's exchange rates, the second FX
  -- source the observed set has ever had.
  if n <> 13 then raise exception 'expected 13 evidenced denominator/FX sources, found %', n; end if;

  -- Phase 2D retrieved the numerator venues' terms. Every one now rests on a retained,
  -- hashed, successfully retrieved artifact -- and not one of them is permitted on both
  -- axes, because none grants the use a published numerator makes.
  select count(*) into n from reference.source_interfaces
   where source_class in ('chain_data_interface', 'spot_price_interface')
     and (terms_artifact_hash is null or terms_artifact_status <> 200 or terms_retrieved_at is null);
  if n <> 0 then raise exception '% numerator source(s) carry no retained terms artifact', n; end if;

  select count(*) into n from reference.source_interfaces
   where source_class in ('chain_data_interface', 'spot_price_interface')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  if n <> 0 then raise exception '% numerator source(s) read cleared on both axes, which no artifact supports', n; end if;

  -- One source, one document. Four at Production V1, five from Phase 2E, which added the
  -- Chainlink feed. A hash cited twice would mean one of them was never retrieved.
  select count(distinct terms_artifact_hash) into n from reference.source_interfaces
   where source_class in ('chain_data_interface', 'spot_price_interface');
  if n <> 5 then raise exception 'expected 5 distinct numerator terms artifacts, found %', n; end if;

  -- Coinbase is the one interface whose terms forbid the retrieval itself, so it is the
  -- one whose retrieval axis is blocked rather than merely unresolved.
  select count(*) into n from reference.source_interfaces
   where slug = 'coinbase-spot' and terms_review_state = 'not_permitted'
     and production_access_state = 'production_blocked' and written_agreement_required is true;
  if n <> 1 then raise exception 'Coinbase must be blocked on retrieval with written permission as its remedy'; end if;

  -- The Bank of Korea is cleared to publish and not automated. Two different questions.
  if not exists (select 1 from reference.source_interfaces
                  where id = bok and terms_review_state = 'permitted'
                    and data_use_terms_state = 'permitted'
                    and automated_retrieval_available = false) then
    raise exception 'BOK should be rights-cleared with automated retrieval unavailable';
  end if;

  -- ------------------------------------------------------------------ rights invariant
  -- A transient refusal cannot revoke a grant: the state may not move while the retained
  -- artifact is unchanged.
  ok := false;
  begin
    update reference.source_interfaces
       set data_use_terms_state = 'not_permitted'
     where id = oecd;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a rights state moved without a new terms artifact'; end if;

  -- Recording that a recheck was attempted is allowed, and changes nothing else.
  update reference.source_interfaces
     set terms_last_rechecked_at = now(), terms_review_flag = true
   where id = oecd;
  if not exists (select 1 from reference.source_interfaces
                  where id = oecd and terms_review_state = 'permitted'
                    and data_use_terms_state = 'permitted') then
    raise exception 'a failed recheck changed the rights state';
  end if;

  -- ------------------------------------------------------------------ gate vs frontier
  -- A coverage floor above the measured frontier is a permanent refusal, and is refused.
  ok := false;
  begin
    insert into reference.ubwi_publication_gates
      (version, frontier_id, max_imputed_share, min_rights_cleared_coverage,
       max_vintage_age_years, max_vintage_dispersion_years, major_economy_disclosure_share)
    values ('9.9.9', frontier_id, 0.25, 0.70, 4, 4, 0.03);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a gate threshold above the feasible frontier was accepted'; end if;

  -- ------------------------------------------------------------------ a vintage
  insert into pipeline.wealth_vintages (
    id, estimation_rule_id, reference_date, compiled_at,
    observed_wealth_usd, imputed_wealth_usd, total_wealth_usd,
    observed_ratio, tail_calibration, central_tail_ratio,
    unobserved_gdp_usd, world_gdp_usd, world_gdp_source,
    observed_economy_count, observed_gdp_coverage, rights_cleared_gdp_coverage,
    observed_wealth_coverage, imputed_share_of_wealth
  ) values (
    gen_random_uuid(), rule_id, date '2025-12-31', now(),
    1000, 500, 1500,
    5.0, 0.8, 4.0,
    125, 1000, 'test',
    2, 0.6, 0.6, 0.6, 500.0 / 1500.0
  ) returning id into vintage;

  -- The parts must sum to the total.
  ok := false;
  begin
    insert into pipeline.wealth_vintages (
      estimation_rule_id, reference_date, compiled_at,
      observed_wealth_usd, imputed_wealth_usd, total_wealth_usd,
      observed_ratio, tail_calibration, central_tail_ratio,
      unobserved_gdp_usd, world_gdp_usd, world_gdp_source,
      observed_economy_count, observed_gdp_coverage, rights_cleared_gdp_coverage,
      observed_wealth_coverage, imputed_share_of_wealth
    ) values (
      rule_id, date '2025-12-31', now(),
      1000, 500, 9999,
      5.0, 0.8, 4.0, 125, 1000, 'test', 2, 0.6, 0.6, 0.6, 500.0 / 9999.0
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a vintage whose parts do not sum to its total was accepted'; end if;

  -- Rights-cleared coverage can never exceed observed coverage.
  ok := false;
  begin
    insert into pipeline.wealth_vintages (
      estimation_rule_id, reference_date, compiled_at,
      observed_wealth_usd, imputed_wealth_usd, total_wealth_usd,
      observed_ratio, tail_calibration, central_tail_ratio,
      unobserved_gdp_usd, world_gdp_usd, world_gdp_source,
      observed_economy_count, observed_gdp_coverage, rights_cleared_gdp_coverage,
      observed_wealth_coverage, imputed_share_of_wealth
    ) values (
      rule_id, date '2025-12-31', now(),
      1000, 500, 1500, 5.0, 0.8, 4.0, 125, 1000, 'test', 2, 0.5, 0.9, 0.6, 500.0 / 1500.0
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'rights-cleared coverage above observed coverage was accepted'; end if;

  -- ------------------------------------------------------------------ components
  -- Consumer durables included but not stripped is prohibited outright.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'USA', date '2025-12-31', 1000, 'USD', 1000,
      'end_period', 1.0, date '2025-12-31', ecb,
      fed, 'Z.1 FL892090005', 'primary', 'observed', 'cleared',
      'included', 'included_not_stripped', 100, 100
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a component including consumer durables un-stripped was accepted'; end if;

  -- An end-period fixing may not postdate the stock it converts.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'DEU', date '2024-12-31', 1000, 'EUR', 1000,
      'end_period', 1.0, date '2025-06-30', ecb,
      fed, 'series', 'harmonized', 'observed', 'cleared',
      'included', 'excluded', 100, 100
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an FX fixing after the reference date was accepted'; end if;

  -- The USD value must be the national value at the recorded rate.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'JPN', date '2024-12-31', 1000, 'JPY', 12345,
      'end_period', 100.0, date '2024-12-31', ecb,
      fed, 'series', 'primary', 'observed', 'cleared',
      'included', 'excluded', 100, 100
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a component whose USD value contradicts its FX rate was accepted'; end if;

  -- A quarterly source needs a stored period selection rule.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, source_frequency,
      observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'CAN', date '2025-12-31', 1000, 'CAD', 1000,
      'end_period', 1.0, date '2025-12-31', ecb,
      fed, 'series', 'primary', 'quarterly', 'observed', 'cleared',
      'included', 'excluded', 100, 100
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a quarterly component without a selection rule was accepted'; end if;

  -- A manual verification must carry its evidence.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, acquisition_mode,
      observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'KOR', date '2025-12-31', 1000, 'KRW', 1000,
      'end_period', 1.0, date '2025-12-31', ecb,
      bok, 'ECOS 291Y505', 'primary', 'manual_verified', 'observed', 'cleared',
      'included', 'excluded', 100, 100
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a manual verification without evidence was accepted'; end if;

  -- Two valid components that sum to the vintage's observed subtotal.
  insert into pipeline.wealth_vintage_components (
    vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
    fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
    source_interface_id, source_series, source_type, observation_status, rights_status,
    land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
  ) values
  (vintage, 'USA', date '2025-12-31', 600, 'USD', 600,
   'end_period', 1.0, null, null,
   fed, 'Z.1 FL892090005 less LM155111005', 'primary', 'observed', 'cleared',
   'partially_included', 'excluded', 100, 100),
  (vintage, 'DEU', date '2024-12-31', 400, 'EUR', 400,
   'end_period', 1.0, date '2024-12-31', ecb,
   fed, 'nama_10_nfa_bs', 'harmonized', 'observed', 'cleared',
   'included', 'excluded', 100, 100);

  -- One selected component per economy per vintage.
  ok := false;
  begin
    insert into pipeline.wealth_vintage_components (
      vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
      fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
      source_interface_id, source_series, source_type, observation_status, rights_status,
      land_treatment, consumer_durables_treatment, gdp_usd_2024, gdp_usd_reference_year
    ) values (
      vintage, 'USA', date '2025-12-31', 1, 'USD', 1,
      'end_period', 1.0, null, null,
      fed, 'a second route', 'harmonized', 'observed', 'cleared',
      'partially_included', 'excluded', 100, 100
    );
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two selected components for one economy were accepted'; end if;

  insert into pipeline.wealth_vintage_unobserved_economies
    (vintage_id, economy_code, economy_name, gdp_share_of_world, reason)
  values (vintage, 'CHN', 'China', 0.167724, 'No market-valued national balance sheet is published.');

  -- ------------------------------------------------------------------ numerator
  insert into pipeline.btc_market_observations (
    observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
    supply_source_interface_id, price_rule, venue_count, price_usd, market_cap_usd, retrieved_at
  ) values (
    now(), 967044, array['mempool.space', 'blockchain.info'], 100.0, 'claimed_issuance',
    chain, 'median_of_venues', 3, 10.0, 1000.0, now()
  ) returning id into btc;

  -- Supply times price is the market capitalization, and it is checked.
  ok := false;
  begin
    insert into pipeline.btc_market_observations (
      observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
      supply_source_interface_id, price_rule, venue_count, price_usd, market_cap_usd, retrieved_at
    ) values (
      now(), 967045, array['mempool.space', 'blockchain.info'], 100.0, 'claimed_issuance',
      chain, 'median_of_venues', 3, 10.0, 999999.0, now()
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a market capitalization contradicting supply x price was accepted'; end if;

  -- Fewer than three venues is not a median.
  ok := false;
  begin
    insert into pipeline.btc_market_observations (
      observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
      supply_source_interface_id, price_rule, venue_count, price_usd, market_cap_usd, retrieved_at
    ) values (
      now(), 967046, array['mempool.space', 'blockchain.info'], 100.0, 'claimed_issuance',
      chain, 'median_of_venues', 2, 10.0, 1000.0, now()
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a two-venue numerator was accepted'; end if;

  insert into pipeline.btc_venue_quotes (observation_id, venue_interface_id, price_usd, retrieved_at, selected)
  values (btc, venue_a, 10.5, now(), false),
         (btc, venue_b, 10.0, now(), true),
         (btc, venue_c, 9.5,  now(), false);

  -- Only one venue row may be the selected median.
  ok := false;
  begin
    update pipeline.btc_venue_quotes set selected = true where observation_id = btc and venue_interface_id = venue_a;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'the venue quote table permitted a mutation'; end if;

  -- ------------------------------------------------------------------ calculation
  -- Bitcoin must sit inside its own denominator: 1500 + 1000 = 2500.
  ok := false;
  begin
    insert into pipeline.ubwi_calculations (
      instrument_id, instrument_spec_version_id, methodology_version_id, gate_version_id,
      btc_observation_id, wealth_vintage_id, calculated_at,
      numerator_usd, denominator_usd, ubwi_percent,
      observed_share_percent, modeled_share_percent,
      sensitivity_low_percent, sensitivity_high_percent,
      gate_passed, gate_findings, change_withheld_reason
    ) values (
      instrument_id, spec_id, mv_id, gate_id, btc, vintage, now(),
      1000, 1500, 1000.0 / 1500.0 * 100,
      1000.0 / 1500.0 * 100, 500.0 / 1500.0 * 100,
      1.0, 99.0, true, '[]'::jsonb, 'first observation'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a denominator excluding Bitcoin was accepted'; end if;

  insert into pipeline.ubwi_calculations (
    instrument_id, instrument_spec_version_id, methodology_version_id, gate_version_id,
    btc_observation_id, wealth_vintage_id, calculated_at,
    numerator_usd, denominator_usd, ubwi_percent,
    observed_share_percent, modeled_share_percent,
    sensitivity_low_percent, sensitivity_high_percent,
    gate_passed, gate_findings, change_withheld_reason
  ) values (
    instrument_id, spec_id, mv_id, gate_id, btc, vintage, now(),
    1000, 2500, 40.0,
    40.0, 20.0,
    30.0, 50.0, false,
    '[{"code": "IMPUTED_SHARE_ABOVE_CEILING"}]'::jsonb,
    'no previous observation exists'
  ) returning id into calc;

  -- A refused calculation may never be published.
  ok := false;
  begin
    insert into pipeline.ubwi_publications (
      calculation_id, published_at, frozen_at, published_value_percent,
      published_total_wealth_usd, published_market_cap_usd,
      published_observed_share, published_modeled_share,
      published_low_percent, published_high_percent,
      methodology_version, residual_model_version
    ) values (
      calc, now(), now(), 40.0, 2500, 1000, 40.0, 20.0, 30.0, 50.0, '1.0.0', '1.0.0'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a gate-refused calculation was published'; end if;

  -- A change from nothing is not a change.
  ok := false;
  begin
    insert into pipeline.ubwi_calculations (
      instrument_id, instrument_spec_version_id, methodology_version_id, gate_version_id,
      btc_observation_id, wealth_vintage_id, calculated_at,
      numerator_usd, denominator_usd, ubwi_percent,
      observed_share_percent, modeled_share_percent,
      sensitivity_low_percent, sensitivity_high_percent,
      gate_passed, gate_findings, percentage_change
    ) values (
      instrument_id, spec_id, mv_id, gate_id, btc, vintage, now(),
      1000, 2500, 40.0, 40.0, 20.0, 30.0, 50.0, true, '[]'::jsonb, 1.5
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a percentage change without a predecessor was accepted'; end if;

  -- A calculation is append-only.
  ok := false;
  begin
    update pipeline.ubwi_calculations set ubwi_percent = 99 where id = calc;
  exception when others then ok := true;
  end;
  if not ok then raise exception 'a calculation was mutable'; end if;

  raise notice 'ubwi production v1: ok';
end $$;

rollback;
