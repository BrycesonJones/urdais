-- PD-5A: what a delivery gap may and may not be.
begin;

-- One approved version, with a hash and an effective date, and determinations for exactly the two
-- sources that feed the only approved pairing.
do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'power-delivery-gap' and mv.status = 'approved'
     and mv.content_hash is not null and mv.effective_from is not null;
  if n <> 1 then raise exception 'expected one approved delivery gap version, found %', n; end if;

  select count(*) into n from reference.source_use_permissions
   where purpose_code = 'public_derived_delivery_gap_display';
  if n <> 2 then raise exception 'expected two delivery gap determinations, found %', n; end if;

  -- A market that produces no gap has no determination, and an absent determination reads as
  -- blocked rather than as permitted.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where sup.purpose_code = 'public_derived_delivery_gap_display' and s.slug not like 'ercot-%';
  if n <> 0 then raise exception '% delivery gap determination(s) exist outside ERCOT', n; end if;
end $$;

-- The table computes nothing it is not told, and refuses a result that disagrees with its inputs.
do $$
declare area uuid; approved uuid; dscen uuid; cscen uuid; gap uuid;
begin
  select id into area from reference.grid_areas where slug = 'ercot';
  select mv.id into approved from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'power-delivery-gap' and mv.version = '1.0.0';
  select s.id into dscen from pipeline.planning_forecast_scenarios s limit 1;
  select s.id into cscen from pipeline.grid_capacity_scenarios s limit 1;
  if dscen is null or cscen is null then return; end if;

  -- A gap that is not the difference of its own stated inputs is refused outright.
  begin
    insert into pipeline.delivery_gap_results
      (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
       period_basis, target_year, target_season, peak_type,
       demand_value, capacity_value, gap_value, unit, capacity_basis,
       calculation_status, publication_state)
    values (approved, area, dscen, cscen, 'seasonal', 2026, 'summer', 'coincident_peak',
            94650.257, 104849.985, 999, 'MW', 'accredited', 'validated', 'internal_only');
    raise exception 'a gap was accepted that is not the difference of its inputs';
  exception when check_violation then null;
  end;

  -- A gap is an amount of power, never a rate.
  begin
    insert into pipeline.delivery_gap_results
      (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
       period_basis, target_year, target_season, peak_type,
       demand_value, capacity_value, gap_value, unit, capacity_basis,
       calculation_status, publication_state)
    values (approved, area, dscen, cscen, 'seasonal', 2026, 'summer', 'coincident_peak',
            10, 4, 6, 'percent', 'accredited', 'validated', 'internal_only');
    raise exception 'a gap was accepted as a percentage';
  exception when check_violation then null;
  end;

  -- A seasonal gap must name its season, so summer and winter cannot collapse into one row.
  begin
    insert into pipeline.delivery_gap_results
      (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
       period_basis, target_year, peak_type,
       demand_value, capacity_value, gap_value, unit, capacity_basis,
       calculation_status, publication_state)
    values (approved, area, dscen, cscen, 'seasonal', 2026, 'coincident_peak',
            10, 4, 6, 'MW', 'accredited', 'validated', 'internal_only');
    raise exception 'a seasonal gap was accepted without a season';
  exception when check_violation then null;
  end;

  -- An unvalidated gap may not be offered for publication.
  begin
    insert into pipeline.delivery_gap_results
      (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
       period_basis, target_year, target_season, peak_type,
       demand_value, capacity_value, gap_value, unit, capacity_basis,
       calculation_status, publication_state)
    values (approved, area, dscen, cscen, 'seasonal', 2026, 'summer', 'coincident_peak',
            10, 4, 6, 'MW', 'accredited', 'draft', 'publication_candidate');
    raise exception 'an unvalidated gap was offered for publication';
  exception when check_violation then null;
  end;

  -- A valid one is accepted, and summer and winter coexist as separate rows.
  insert into pipeline.delivery_gap_results
    (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
     period_basis, target_year, target_season, peak_type,
     demand_value, capacity_value, gap_value, unit, capacity_basis,
     calculation_status, publication_state)
  values (approved, area, dscen, cscen, 'seasonal', 2026, 'summer', 'coincident_peak',
          94650.257, 104849.985, 94650.257 - 104849.985, 'MW', 'accredited', 'validated', 'publication_candidate')
  returning id into gap;

  insert into pipeline.delivery_gap_results
    (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
     period_basis, target_year, target_season, peak_type,
     demand_value, capacity_value, gap_value, unit, capacity_basis,
     calculation_status, publication_state)
  values (approved, area, dscen, cscen, 'seasonal', 2026, 'winter', 'coincident_peak',
          90192, 95388.422, 90192 - 95388.422, 'MW', 'accredited', 'validated', 'publication_candidate');

  -- An input names one row and one kind, never both and never neither.
  begin
    insert into pipeline.delivery_gap_result_inputs (result_id, input_kind, input_role)
    values (gap, 'planning_point', 'demand with no row');
    raise exception 'a gap input was accepted with no row behind it';
  exception when check_violation then null;
  end;
end $$;

-- A gap under a methodology version that is not approved may not be published.
do $$
declare area uuid; draft uuid; dscen uuid; cscen uuid;
begin
  select id into area from reference.grid_areas where slug = 'ercot';
  select mv.id into draft from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '0.1.0-draft';
  select s.id into dscen from pipeline.planning_forecast_scenarios s limit 1;
  select s.id into cscen from pipeline.grid_capacity_scenarios s limit 1;
  if dscen is null or cscen is null then return; end if;
  begin
    insert into pipeline.delivery_gap_results
      (methodology_version_id, grid_area_id, demand_scenario_id, capacity_scenario_id,
       period_basis, target_year, target_season, peak_type,
       demand_value, capacity_value, gap_value, unit, capacity_basis,
       calculation_status, publication_state)
    values (draft, area, dscen, cscen, 'seasonal', 2026, 'summer', 'coincident_peak',
            10, 4, 6, 'MW', 'accredited', 'validated', 'published');
    raise exception 'a gap under a superseded methodology version was published';
  exception when check_violation then null;
  end;
end $$;

rollback;
