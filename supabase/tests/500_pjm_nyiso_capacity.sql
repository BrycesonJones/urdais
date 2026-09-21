-- PD-4D: the two things PJM and NYISO state that PD-4B could not hold, and the rules that keep
-- their quantities from being confused with each other.
begin;

-- Five of the six capacity sources are ambiguous and stay that way; only ERCOT carries a grant.
-- Approving a source for collection is an Urdais policy act and never a rights conclusion.
do $$
declare n integer; cls text;
begin
  select count(*) into n from reference.source_interfaces s
   where s.source_class = 'power_system_capacity_assessment'
     and s.production_access_state = 'production_approved_under_accepted_risk';
  if n <> 5 then raise exception 'expected five accepted-risk capacity interfaces, found %', n; end if;

  for cls in
    select distinct sup.rights_classification from reference.source_use_permissions sup
      join reference.source_interfaces s on s.id = sup.source_interface_id
     where s.slug in ('pjm-rpm-planning-parameters', 'pjm-bra-results', 'nyiso-lcr-study')
  loop
    if cls <> 'ambiguous_requires_legal_review' then
      raise exception 'a PD-4D source was classified %, not ambiguous_requires_legal_review', cls;
    end if;
  end loop;

  -- A public display determination must carry attribution, because a requirement quoted without
  -- its source and case is ambiguous between two different numbers.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug in ('pjm-rpm-planning-parameters', 'pjm-bra-results', 'nyiso-lcr-study')
     and sup.purpose_code = 'public_raw_grid_capacity_value_display'
     and (sup.attribution_required is not true or sup.attribution_text is null);
  if n <> 0 then raise exception '% PD-4D public determination(s) carry no attribution', n; end if;

  -- Every capacity source has a currentness monitor.
  select count(*) into n from reference.source_interfaces s
   where s.source_class = 'power_system_capacity_assessment'
     and not exists (select 1 from reference.planning_source_monitors m where m.source_interface_id = s.id);
  if n <> 0 then raise exception '% capacity interface(s) have no monitor', n; end if;

  -- No source that needs an account was registered.
  select count(*) into n from reference.source_interfaces
   where canonical_url ilike '%dataminer%' or slug ilike '%dataminer%' or name ilike '%data miner%';
  if n <> 0 then raise exception 'a PJM Data Miner interface was registered'; end if;
end $$;

-- A requirement may be stated as a proportion of forecast peak. A derived Urdais result may not:
-- a conclusion about deliverable capacity is an amount of power.
do $$
declare area uuid; zone uuid; src uuid; retr uuid; vint uuid; scen uuid; raw uuid;
begin
  select id into area from reference.grid_areas where slug = 'nyiso';
  select id into src from reference.source_interfaces where slug = 'nyiso-lcr-study';
  insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
  values (area, 'locality', 'TEST-J', 'Test Locality J', now()) returning id into zone;

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose)
  values (src, 'test|capacity|rates', now(), now(), 'GET', 'https://example.invalid/lcr.pdf',
          200, repeat('d', 64), 'complete', 'test', 'research')
  returning id into retr;

  insert into pipeline.grid_capacity_vintages
    (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     release_kind, published_at, retrieved_at, rights_classification)
  values (area, src, retr, 'test-lcr', 'Test LCR', 'study', now(), now(), 'ambiguous_requires_legal_review')
  returning id into vint;

  insert into pipeline.grid_capacity_scenarios (vintage_id, native_scenario_key, native_scenario_label)
  values (vint, 'chpe_in', 'CHPE-In') returning id into scen;

  insert into pipeline.raw_grid_capacity_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_term,
     native_value, native_unit, raw_payload, extraction_method, extraction_version, pdf_page, artifact_ref)
  values (retr, 0, repeat('e', 64), 'NYC', '2026-2027', 'LCR', '86.4', 'percent', '{}'::jsonb,
          'pdf_table', 'test/1.0.0', 7, 'nyiso/lcr')
  returning id into raw;

  -- A locational requirement stated as a percentage is storable.
  insert into pipeline.grid_capacity_components
    (vintage_id, scenario_id, grid_area_id, grid_subarea_id, raw_record_id, quantity_kind,
     component_kind, source_term, period_basis, target_year, value, unit, capacity_basis)
  values (vint, scen, area, zone, raw, 'requirement', 'local_reliability_requirement', 'LCR',
          'capability_year', 2026, 86.4, 'percent', 'icap');

  -- A transmission security floor stated as a percentage is storable as a constraint.
  declare iface uuid;
  begin
    insert into reference.grid_interfaces
      (grid_area_id, to_subarea_id, interface_kind, native_key, native_label, effective_from)
    values (area, zone, 'import', 'TEST-J-IMPORT', 'Test import', now()) returning id into iface;
    insert into pipeline.grid_constraint_values
      (vintage_id, scenario_id, grid_area_id, grid_interface_id, grid_subarea_id, raw_record_id,
       constraint_kind, direction, source_term, period_basis, target_year, value, unit)
    values (vint, scen, area, iface, zone, raw, 'tsl', 'import', 'TSL floor',
            'capability_year', 2026, 86.4, 'percent');
  end;

  -- A derived Urdais conclusion may not be a rate.
  declare mv uuid;
  begin
    select id into mv from reference.methodology_versions limit 1;
    if mv is not null then
      begin
        insert into pipeline.deliverable_capacity_results
          (methodology_version_id, grid_area_id, period_basis, target_year, value, unit,
           capacity_basis, calculation_status)
        values (mv, area, 'capability_year', 2026, 86.4, 'percent', 'icap', 'draft');
        raise exception 'a derived deliverable capacity result was accepted as a percentage';
      exception when check_violation then null;
      end;
    end if;
  end;
end $$;

-- PJM's transfer objective and its transfer limit are different kinds of thing and live in
-- different layers. The objective may not be filed as a constraint kind, and the limit may not be
-- filed as a component.
do $$
declare n integer;
begin
  select count(*) into n from reference.capacity_component_kinds where code = 'capacity_transfer_requirement';
  if n <> 1 then raise exception 'the capacity transfer requirement kind is missing'; end if;

  -- CETL has been a constraint kind since PD-4B; nothing here moved it.
  select count(*) into n from pg_constraint
   where conname = 'grid_constraint_values_kind_allowed' and pg_get_constraintdef(oid) like '%cetl%';
  if n <> 1 then raise exception 'cetl is no longer an allowed constraint kind'; end if;
end $$;

rollback;
