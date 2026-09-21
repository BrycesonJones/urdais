-- PD-4B: the capacity domain's invariants, and the walls around it.
begin;

-- Vocabulary, geography seeds and the fact that the GPU compute domain is a different place.
do $$
declare n integer;
begin
  select count(*) into n from reference.capacity_quantity_kinds where origin = 'urdais_derived';
  if n <> 1 then raise exception 'exactly one quantity kind is an Urdais conclusion, found %', n; end if;
  select count(*) into n from reference.source_use_purposes where code like '%grid_capacity%' or code like '%deliverable_capacity%' or code like '%delivery_gap%';
  if n <> 4 then raise exception 'expected four PD-4 use purposes, found %', n; end if;
  -- The compute domain still exists, separately, and shares no table with this one.
  if to_regclass('pipeline.capacity_observations') is null then raise exception 'compute capacity domain missing'; end if;
  if to_regclass('pipeline.grid_capacity_components') is null then raise exception 'grid capacity domain missing'; end if;
  -- And no grid table was named in a way that collides with it.
  select count(*) into n from information_schema.tables
   where table_schema in ('reference','pipeline') and table_name in ('capacity_components','capacity_vintages','capacity_results');
  if n <> 0 then raise exception 'a bare capacity_* name was introduced for grid data'; end if;
end $$;

-- Localities live outside grid_areas, and an interface's ends must belong to its market.
do $$
declare pjm uuid; ercot uuid; emaac uuid; pseg uuid; iface uuid; n integer;
begin
  select id into pjm from reference.grid_areas where eia_ba_code = 'PJM';
  select id into ercot from reference.grid_areas where eia_ba_code = 'ERCO';
  insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
    values (pjm, 'lda', 'EMAAC', 'Eastern Mid-Atlantic Area Council', '2026-01-01T00:00:00Z') returning id into emaac;
  insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
    values (pjm, 'lda', 'PSEG', 'Public Service Electric and Gas', '2026-01-01T00:00:00Z') returning id into pseg;

  -- The seven-market universe is untouched by adding localities.
  select count(*) into n from reference.grid_areas;
  if n <> 7 then raise exception 'adding localities changed the grid area set to %', n; end if;
  select count(*) into n from reference.grid_area_memberships;
  if n <> 7 then raise exception 'adding localities changed universe membership to %', n; end if;

  -- One live locality per market, kind and native key.
  begin
    insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
      values (pjm, 'lda', 'EMAAC', 'duplicate', '2026-01-01T00:00:00Z');
    raise exception 'a duplicate live locality was accepted';
  exception when unique_violation then null;
  end;

  insert into reference.grid_interfaces (grid_area_id, from_subarea_id, to_subarea_id, interface_kind, native_key, native_label, effective_from)
    values (pjm, pseg, emaac, 'internal_transfer', 'PSEG-EMAAC', 'PSEG into EMAAC', '2026-01-01T00:00:00Z')
    returning id into iface;

  -- An interface cannot borrow a locality from another market.
  begin
    insert into reference.grid_interfaces (grid_area_id, from_subarea_id, interface_kind, native_key, native_label, effective_from)
      values (ercot, emaac, 'import', 'BAD', 'wrong market', '2026-01-01T00:00:00Z');
    raise exception 'an interface took an end from another market';
  exception when check_violation then null;
  end;
  -- Nor can both ends be the same locality, nor neither end exist.
  begin
    insert into reference.grid_interfaces (grid_area_id, from_subarea_id, to_subarea_id, interface_kind, native_key, native_label, effective_from)
      values (pjm, emaac, emaac, 'internal_transfer', 'SELF', 'self', '2026-01-01T00:00:00Z');
    raise exception 'an interface joined a locality to itself';
  exception when check_violation then null;
  end;
  begin
    insert into reference.grid_interfaces (grid_area_id, interface_kind, native_key, native_label, effective_from)
      values (pjm, 'import', 'NOWHERE', 'no ends', '2026-01-01T00:00:00Z');
    raise exception 'an interface with no ends was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Vintages, components, constraints and derived results.
do $$
declare
  pjm uuid; iface_src uuid; grant_id uuid; retrieval uuid; emaac uuid; iface uuid;
  v2026 uuid := '98000000-0000-4000-8900-000000000001';
  v2027 uuid := '98000000-0000-4000-8900-000000000002';
  scen uuid := '98000000-0000-4000-8a00-000000000001';
  raw_id uuid; cap_id uuid; req_id uuid; con_id uuid; result uuid; draft_mv uuid; approved_mv uuid; n integer;
begin
  select id into pjm from reference.grid_areas where eia_ba_code = 'PJM';
  select id into emaac from reference.grid_subareas where native_key = 'EMAAC';
  select id into iface from reference.grid_interfaces where native_key = 'PSEG-EMAAC';
  select id into iface_src from reference.source_interfaces where slug = 'pjm-load-forecast-report';
  select id into grant_id from reference.permission_grants where source_interface_id = iface_src;
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface_src, 'pd4b-fixture', '2026-09-23T09:00:00Z', '2026-09-23T09:00:01Z', 'GET',
          'https://www.pjm.com/', 200, repeat('a', 64), 1, 'complete', 'production', grant_id)
  returning id into retrieval;

  insert into pipeline.grid_capacity_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     release_kind, published_at, retrieved_at, rights_classification, publication_state, quality_status)
  values (v2026, pjm, iface_src, retrieval, 'bra-2026-2027', 'PJM 2026/2027 Base Residual Auction',
          'auction_result', '2026-07-01T00:00:00Z', '2026-09-23T09:00:00Z',
          'ambiguous_requires_legal_review', 'published', 'accepted');
  insert into pipeline.grid_capacity_scenarios (id, vintage_id, native_scenario_key, native_scenario_label, is_reference)
    values (scen, v2026, 'base', 'Base case', true);

  -- A later auction is a new release, not a correction of the previous one.
  insert into pipeline.grid_capacity_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     release_kind, published_at, retrieved_at, rights_classification)
  values (v2027, pjm, iface_src, retrieval, 'bra-2027-2028', 'PJM 2027/2028 Base Residual Auction',
          'auction_result', '2027-07-01T00:00:00Z', '2027-09-23T09:00:00Z', 'ambiguous_requires_legal_review');
  begin
    update pipeline.grid_capacity_vintages
       set superseded_by_id = v2027, superseded_at = now(), supersession_reason = 'newer auction', supersession_kind = 'reissue'
     where id = v2026;
    raise exception 'a new annual release superseded the previous release';
  exception when check_violation then null;
  end;
  select count(*) into n from pipeline.grid_capacity_vintages where grid_area_id = pjm and superseded_by_id is null;
  if n <> 2 then raise exception 'expected two live PJM capacity vintages, found %', n; end if;

  insert into pipeline.raw_grid_capacity_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_term,
     native_value, native_unit, raw_payload, extraction_method, extraction_version, document_section, clause_reference)
  values (retrieval, 0, repeat('b', 64), 'EMAAC', '2026/2027', 'Capacity Emergency Transfer Limit',
          '7500', 'MW', '{}', 'tariff_clause', 'pd4b/1', 'Manual 20 Section 4.2', 'M-20 §4.2(b)')
  returning id into raw_id;

  -- A tariff clause is a locator; an extraction claiming that method without one is refused.
  begin
    insert into pipeline.raw_grid_capacity_records
      (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_term,
       native_value, native_unit, raw_payload, extraction_method, extraction_version)
    values (retrieval, 90, repeat('c', 64), 'EMAAC', '2026/2027', 'CETL', '1', 'MW', '{}', 'tariff_clause', 'x/1');
    raise exception 'a tariff extraction was accepted without a section or clause';
  exception when check_violation then null;
  end;

  -- Capability and requirement coexist and stay distinct.
  insert into pipeline.grid_capacity_components
    (id, vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
     source_term, period_basis, target_year, value, unit, capacity_basis)
  values (gen_random_uuid(), v2026, scen, pjm, raw_id, 'capability', 'procured_capacity',
          'Cleared UCAP', 'delivery_year', 2026, 135000, 'MW', 'ucap') returning id into cap_id;
  insert into pipeline.grid_capacity_components
    (id, vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
     source_term, period_basis, target_year, value, unit, capacity_basis)
  values (gen_random_uuid(), v2026, scen, pjm, raw_id, 'requirement', 'reserve_requirement',
          'Reliability Requirement', 'delivery_year', 2026, 130000, 'MW', 'ucap') returning id into req_id;
  select count(*) into n from pipeline.grid_capacity_components where vintage_id = v2026;
  if n <> 2 then raise exception 'capability and requirement did not coexist: %', n; end if;

  -- A component may not be a derived quantity, and may not be a network constraint.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (v2026, scen, pjm, raw_id, 'derived_quantity', 'other', 'deliverable', 'delivery_year', 2026, 1, 'MW', 'ucap');
    raise exception 'a derived quantity was stored as a source-published component';
  exception when check_violation then null;
  end;
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (v2026, scen, pjm, raw_id, 'constraint', 'transfer_capability', 'CETL', 'delivery_year', 2026, 1, 'MW', 'ucap');
    raise exception 'a network constraint was stored as a capacity component';
  exception when check_violation then null;
  end;
  -- A locality must be inside the market the component names.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, grid_subarea_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (v2026, scen, (select id from reference.grid_areas where eia_ba_code = 'ERCO'), emaac, raw_id,
            'capability', 'procured_capacity', 'x', 'delivery_year', 2026, 1, 'MW', 'ucap');
    raise exception 'a PJM locality was attached to an ERCOT component';
  exception when check_violation then null;
  end;
  -- A seasonal period must name its season.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (v2026, scen, pjm, raw_id, 'capability', 'procured_capacity', 'x', 'seasonal', 2026, 1, 'MW', 'ucap');
    raise exception 'a seasonal component was accepted without a season';
  exception when check_violation then null;
  end;

  -- Constraints live in the shared layer, pinned to quantity_kind constraint.
  insert into pipeline.grid_constraint_values
    (vintage_id, scenario_id, grid_area_id, grid_interface_id, grid_subarea_id, raw_record_id,
     constraint_kind, direction, source_term, period_basis, target_year, value, unit)
  values (v2026, scen, pjm, iface, emaac, raw_id, 'cetl', 'import',
          'Capacity Emergency Transfer Limit', 'delivery_year', 2026, 7500, 'MW')
  returning id into con_id;
  begin
    update pipeline.grid_constraint_values set quantity_kind = 'capability' where id = con_id;
    raise exception 'a constraint row was relabelled a capability';
  exception when check_violation or restrict_violation then null;
  end;

  -- Derived results: methodology required, and a draft may not publish.
  select id into draft_mv from reference.methodology_versions where version = '0.1.0-draft'
    and methodology_id = (select id from reference.methodologies where slug = 'deliverable-capacity');
  begin
    insert into pipeline.deliverable_capacity_results
      (methodology_version_id, grid_area_id, period_basis, target_year, value, unit, capacity_basis,
       calculation_status, publication_state)
    values (draft_mv, pjm, 'delivery_year', 2026, 1000, 'MW', 'ucap', 'validated', 'published');
    raise exception 'a draft methodology published a deliverable capacity result';
  exception when check_violation then null;
  end;

  insert into pipeline.deliverable_capacity_results
    (methodology_version_id, grid_area_id, period_basis, target_year, value, unit, capacity_basis,
     calculation_status, publication_state)
  values (draft_mv, pjm, 'delivery_year', 2026, 1000, 'MW', 'ucap', 'draft', 'internal_only')
  returning id into result;

  -- An unvalidated calculation cannot even be a publication candidate.
  begin
    update pipeline.deliverable_capacity_results set publication_state = 'publication_candidate' where id = result;
    raise exception 'an unvalidated result became a publication candidate';
  exception when check_violation then null;
  end;

  -- Inputs are frozen row ids, one reference each, and are append-only.
  insert into pipeline.deliverable_capacity_result_inputs (result_id, input_kind, component_id, input_role)
    values (result, 'component', cap_id, 'cleared capacity');
  insert into pipeline.deliverable_capacity_result_inputs (result_id, input_kind, constraint_id, input_role)
    values (result, 'constraint', con_id, 'transfer limit');
  select count(*) into n from pipeline.deliverable_capacity_result_inputs where result_id = result;
  if n <> 2 then raise exception 'expected two frozen inputs, found %', n; end if;
  begin
    insert into pipeline.deliverable_capacity_result_inputs (result_id, input_kind, component_id, constraint_id, input_role)
      values (result, 'component', cap_id, con_id, 'both');
    raise exception 'an input referenced a component and a constraint at once';
  exception when check_violation then null;
  end;
  begin
    update pipeline.deliverable_capacity_result_inputs set input_role = 'edited' where result_id = result;
    raise exception 'a frozen input set was editable';
  exception when restrict_violation then null;
  end;

  -- The walls: capacity evidence cannot enter the planning or operational stores, and vice versa.
  begin
    insert into pipeline.power_observations
      (raw_power_record_id, grid_area_id, power_metric_id, period_start, period_end, temporal_resolution,
       value_mw, unit, value_status, source_effective_at, retrieved_at, quality_status)
    values (raw_id, pjm, (select id from reference.power_metrics where code = 'actual_load'),
            '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'hourly', 1, 'MW', 'observed',
            '2026-01-01T00:00:00Z', '2026-09-23T09:00:00Z', 'accepted');
    raise exception 'a capacity record entered the operational store';
  exception when check_violation or foreign_key_violation then null;
  end;
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values ((select id from pipeline.planning_forecast_vintages limit 1),
            (select id from pipeline.planning_forecast_scenarios limit 1), pjm, raw_id,
            'balancing_authority', 'annual', 2026, 1, 'MW', 'coincident_peak', 'unspecified', 'net', 'unspecified');
    raise exception 'a capacity record entered the planning store';
  exception when check_violation or foreign_key_violation or not_null_violation then null;
  end;
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (v2026, scen, pjm, (select id from pipeline.raw_planning_forecast_records limit 1),
            'capability', 'procured_capacity', 'x', 'delivery_year', 2026, 1, 'MW', 'ucap');
    raise exception 'a planning record became capacity evidence';
  exception when foreign_key_violation or not_null_violation then null;
  end;
end $$;

rollback;
