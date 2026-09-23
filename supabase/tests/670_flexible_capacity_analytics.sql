-- FC-3: the Flexible Capacity analytical layer.
--
-- The tests that matter are the ones that try to store something wrong and expect refusal. A
-- figure that spent more than its budget, a result on an incomplete peak day, a gap above the
-- threshold it claims to have applied, a result belonging to a failed run, a rewritten answer:
-- each should fail at the database rather than in review.
begin;

do $$
declare
  n integer;
  method uuid;
  v100 uuid; v110 uuid;
begin
  -- -------------------------------------------------------------- methodology 1.1.0
  select id into method from reference.methodologies where slug = 'flexible-capacity';
  if method is null then raise exception 'the flexible-capacity methodology is not registered'; end if;

  select id into v100 from reference.methodology_versions
   where methodology_id = method and version = '1.0.0';
  select id into v110 from reference.methodology_versions
   where methodology_id = method and version = '1.1.0';
  if v100 is null or v110 is null then raise exception 'both 1.0.0 and 1.1.0 must be registered'; end if;

  -- An approved version is never edited in place: 1.0.0 is superseded and kept, not re-pointed.
  select count(*) into n from reference.methodology_versions
   where id = v100 and status = 'superseded' and effective_to is not null;
  if n <> 1 then raise exception '1.0.0 was not superseded'; end if;

  select count(*) into n from reference.methodology_versions
   where id = v110 and status = 'approved';
  if n <> 1 then raise exception '1.1.0 is not approved'; end if;

  -- Exactly one approved version at a time, or "the approved methodology" is ambiguous.
  select count(*) into n from reference.methodology_versions
   where methodology_id = method and status = 'approved';
  if n <> 1 then raise exception '% approved flexible-capacity versions exist, expected 1', n; end if;

  -- The digests differ: they are different documents describing different rules.
  select count(*) into n from reference.methodology_versions a
    join reference.methodology_versions b on b.id = v110
   where a.id = v100 and a.content_hash = b.content_hash;
  if n <> 0 then raise exception '1.0.0 and 1.1.0 share a content hash'; end if;

  -- -------------------------------------------------------------- the three resolutions
  -- Publication was blocked in 1.0.0 by three unresolved parameters. 1.1.0 resolves all three,
  -- and none of them is resolved by inventing a number.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110 and status <> 'approved';
  if n <> 0 then raise exception '% parameters of 1.1.0 are not approved', n; end if;

  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110
     and lower(btrim(coalesce(text_value, ''))) = 'unresolved';
  if n <> 0 then raise exception '% parameters of 1.1.0 still read unresolved', n; end if;

  -- The two inventories are out of scope, not valued. A numeric value here would be an invention.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110
     and parameter_key in ('demand_response_inventory', 'deployed_storage_inventory')
     and status = 'approved'
     and text_value = 'not_used_in_methodology_1_1_0'
     and numeric_value is null;
  if n <> 2 then raise exception 'the two inventory parameters are not registered as out of scope'; end if;

  -- The gap threshold is resolved and carries a reason.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110 and parameter_key = 'maximum_contiguous_gap_hours'
     and status = 'approved' and btrim(coalesce(rationale, '')) <> '';
  if n <> 1 then raise exception 'maximum_contiguous_gap_hours is not resolved with a rationale'; end if;

  -- The peak-day rule survives the new gap rule rather than being replaced by it.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110 and parameter_key = 'peak_region_coverage_rule'
     and text_value = 'local_calendar_day_of_observed_peak' and status = 'approved';
  if n <> 1 then raise exception 'the peak-region rule is missing from 1.1.0'; end if;

  -- Storage is still off, and still off as a decision.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = v110 and parameter_key = 'battery_enabled'
     and text_value = 'false' and status = 'approved';
  if n <> 1 then raise exception 'battery_enabled is not registered false in 1.1.0'; end if;
end $$;

-- ================================================================ the analytical tables

do $$
declare
  n integer;
  v110 uuid; area uuid; run uuid; other_run uuid; result_id uuid;
  digest_a text := repeat('a', 64);
  digest_b text := repeat('b', 64);
  mhash text;
begin
  select mv.id, mv.content_hash into v110, mhash
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'flexible-capacity' and mv.version = '1.1.0';
  select id into area from reference.grid_areas where slug = 'ercot';

  insert into pipeline.flexible_capacity_analytics_runs
    (methodology_version_id, methodology_content_hash, run_kind, run_status,
     markets, local_years, alpha_scenarios, started_at, completed_at)
  values (v110, mhash, 'production', 'validated',
          array['ercot'], array[2025], array[0.005]::numeric[], now(), now())
  returning id into run;

  -- ------------------------------------------------------------ a well-formed result
  insert into pipeline.flexible_capacity_scenario_results (
    run_id, grid_area_id, methodology_version_id, methodology_content_hash,
    local_year, period_start, period_end, expected_observation_count,
    observations_digest, input_digest,
    peak_reference_mw, peak_reference_at, peak_region_local_date,
    peak_region_expected_hours, peak_region_present_hours,
    mean_load_mw, observation_count, missing_observation_count, coverage_ratio,
    max_contiguous_gap_hours,
    alpha, equivalent_full_load_hours, peak_reference_rule, peak_region_rule,
    rebound_model, modeled_load_shape, battery_enabled,
    minimum_annual_coverage, maximum_contiguous_gap_hours,
    headroom_mw, curtailed_energy_mwh, curtailment_budget_mwh,
    curtailment_clock_hours, curtailment_event_count,
    mean_curtailment_event_hours, max_curtailment_event_hours, calculated_at)
  values (
    run, area, v110, mhash,
    2025, timestamptz '2025-01-01T06:00Z', timestamptz '2026-01-01T06:00Z', 8760,
    digest_a, digest_b,
    83597, timestamptz '2025-08-18T23:00Z', date '2025-08-18',
    24, 24,
    52000, 8760, 0, 1.0,
    0,
    0.005, 43.8, 'modeled_period_observed_peak', 'local_calendar_day_of_observed_peak',
    'no_rebound', 'flat', false,
    0.995, 1,
    3591, 157285.0, 157285.8, 118, 25, 4.72, 7, now())
  returning id into result_id;

  -- ------------------------------------------------------------ append-only
  -- The sentinel raise uses its own sqlstate, so the handler cannot swallow the very failure it
  -- is there to report.
  begin
    update pipeline.flexible_capacity_scenario_results set headroom_mw = 9999 where id = result_id;
    raise exception using errcode = 'ZZ001', message = 'a scenario result was rewritten in place';
  exception
    when sqlstate 'ZZ001' then raise;
    when others then null;
  end;

  begin
    delete from pipeline.flexible_capacity_scenario_results where id = result_id;
    raise exception using errcode = 'ZZ002', message = 'a scenario result was deleted';
  exception
    when sqlstate 'ZZ002' then raise;
    when others then null;
  end;

  -- ------------------------------------------------------------ one row per question
  begin
    insert into pipeline.flexible_capacity_scenario_results (
      run_id, grid_area_id, methodology_version_id, methodology_content_hash,
      local_year, period_start, period_end, expected_observation_count,
      observations_digest, input_digest,
      peak_reference_mw, peak_reference_at, peak_region_local_date,
      peak_region_expected_hours, peak_region_present_hours,
      mean_load_mw, observation_count, missing_observation_count, coverage_ratio,
      max_contiguous_gap_hours,
      alpha, equivalent_full_load_hours, peak_reference_rule, peak_region_rule,
      rebound_model, modeled_load_shape, battery_enabled,
      minimum_annual_coverage, maximum_contiguous_gap_hours,
      headroom_mw, curtailed_energy_mwh, curtailment_budget_mwh,
      curtailment_clock_hours, curtailment_event_count,
      mean_curtailment_event_hours, max_curtailment_event_hours, calculated_at)
    values (
      run, area, v110, mhash,
      2025, timestamptz '2025-01-01T06:00Z', timestamptz '2026-01-01T06:00Z', 8760,
      digest_a, digest_b,
      83597, timestamptz '2025-08-18T23:00Z', date '2025-08-18', 24, 24,
      52000, 8760, 0, 1.0, 0,
      0.005, 43.8, 'modeled_period_observed_peak', 'local_calendar_day_of_observed_peak',
      'no_rebound', 'flat', false, 0.995, 1,
      4000, 100, 175200, 10, 2, 5, 5, now());
    raise exception using errcode = 'ZZ003', message = 'a second answer was stored for one input digest';
  exception
    when sqlstate 'ZZ003' then raise;
    when unique_violation then null;
  end;
end $$;

-- ================================================================ what may not be stored

-- Each of these should be refused by a constraint. A helper keeps the cases readable: it inserts a
-- result built from a valid baseline with one field replaced, and fails if the insert succeeds.
do $$
declare
  v110 uuid; area uuid; run uuid; mhash text; i integer := 0;
  bad record;
begin
  select mv.id, mv.content_hash into v110, mhash
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'flexible-capacity' and mv.version = '1.1.0';
  select id into area from reference.grid_areas where slug = 'ercot';
  insert into pipeline.flexible_capacity_analytics_runs
    (methodology_version_id, methodology_content_hash, run_kind, run_status,
     markets, local_years, alpha_scenarios, started_at, completed_at)
  values (v110, mhash, 'production', 'validated',
          array['ercot'], array[2025], array[0.005]::numeric[], now(), now())
  returning id into run;

  for bad in
    select * from (values
      -- curtailed energy above the budget
      ('overspent budget',      300000::numeric, 157285.8::numeric, 24, 24, 8760, 0, 1, 118::integer, 0.005::numeric),
      -- an incomplete peak day
      ('incomplete peak day',   157285,          157285.8,          24, 23, 8760, 0, 1, 118,          0.005),
      -- a gap longer than the threshold the row claims to have applied
      ('gap above threshold',   157285,          157285.8,          24, 24, 8760, 0, 1, 118,          0.005),
      -- more curtailed hours than the period holds
      ('clock hours too many',  157285,          157285.8,          24, 24, 8760, 0, 1, 9000,         0.005),
      -- zero alpha with positive headroom
      ('zero alpha, headroom',  0,               0,                 24, 24, 8760, 0, 1, 0,            0)
    ) as t(label, energy, budget, peak_expected, peak_present, obs, missing, gap, clock, alpha)
  loop
    i := i + 1;
    begin
      insert into pipeline.flexible_capacity_scenario_results (
        run_id, grid_area_id, methodology_version_id, methodology_content_hash,
        local_year, period_start, period_end, expected_observation_count,
        observations_digest, input_digest,
        peak_reference_mw, peak_reference_at, peak_region_local_date,
        peak_region_expected_hours, peak_region_present_hours,
        mean_load_mw, observation_count, missing_observation_count, coverage_ratio,
        max_contiguous_gap_hours,
        alpha, equivalent_full_load_hours, peak_reference_rule, peak_region_rule,
        rebound_model, modeled_load_shape, battery_enabled,
        minimum_annual_coverage, maximum_contiguous_gap_hours,
        headroom_mw, curtailed_energy_mwh, curtailment_budget_mwh,
        curtailment_clock_hours, curtailment_event_count,
        mean_curtailment_event_hours, max_curtailment_event_hours, calculated_at)
      values (
        run, area, v110, mhash,
        2025, timestamptz '2025-01-01T06:00Z', timestamptz '2026-01-01T06:00Z', bad.obs,
        repeat('c', 64), lpad(i::text, 64, '0'),
        83597, timestamptz '2025-08-18T23:00Z', date '2025-08-18',
        bad.peak_expected, bad.peak_present,
        52000, bad.obs - bad.missing, bad.missing, 1.0,
        bad.gap,
        bad.alpha, bad.alpha * bad.obs, 'modeled_period_observed_peak', 'local_calendar_day_of_observed_peak',
        'no_rebound', 'flat', false,
        0.995, case when bad.label = 'gap above threshold' then 0 else 48 end,
        case when bad.label = 'zero alpha, headroom' then 3591 else 3591 end,
        bad.energy, bad.budget,
        bad.clock, 25, 4.72, 7, now());
      raise exception using errcode = 'ZZ004',
        message = 'the database accepted a result it should refuse: ' || bad.label;
    exception
      when sqlstate 'ZZ004' then raise;
      when check_violation then null;
    end;
  end loop;
end $$;

-- ================================================================ invariants

do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.flexible_capacity_violations();
  if n <> 0 then raise exception 'flexible capacity violations are not empty: %', n; end if;
end $$;

rollback;
