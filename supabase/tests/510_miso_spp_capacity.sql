-- PD-4E: the two markets Urdais may hold but may not publish, and the rules that keep it so.
begin;

-- MISO and SPP are refused, not merely undetermined, and there is no grant anywhere that could
-- be cited to change that by accident.
do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy')
     and production_access_state = 'production_blocked'
     and terms_review_state = 'not_permitted'
     and data_use_terms_state = 'not_permitted';
  if n <> 3 then raise exception 'expected three blocked MISO/SPP capacity interfaces, found %', n; end if;

  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy');
  if n <> 0 then raise exception '% permission grant(s) exist for a source whose terms were refused', n; end if;

  -- Public display is prohibited, which is a determination and not an absence of one.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy')
     and u.is_public
     and (sup.disposition <> 'prohibited' or sup.rights_classification <> 'unsuitable_without_permission');
  if n <> 0 then raise exception '% MISO/SPP public determination(s) are not prohibited-and-unsuitable', n; end if;
end $$;

-- The accepted-risk state exists for ambiguity, not for refusal. A source whose terms were
-- reviewed and refused cannot be promoted into it, in either market.
do $$
begin
  begin
    update reference.source_interfaces
       set production_access_state = 'production_approved_under_accepted_risk'
     where slug = 'miso-lole-study';
    raise exception 'a refused MISO source was approved under accepted risk';
  exception when check_violation then null;
  end;
  begin
    update reference.source_interfaces
       set production_access_state = 'production_approved_under_accepted_risk'
     where slug = 'spp-summer-resource-adequacy';
    raise exception 'a refused SPP source was approved under accepted risk';
  exception when check_violation then null;
  end;
end $$;

-- A production retrieval from a blocked source is refused by the database, not only by the code.
do $$
declare iface uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'miso-lole-study';
  begin
    insert into pipeline.source_retrievals
      (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
       response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose)
    values (iface, 'test|capacity|blocked-production', now(), now(), 'GET', 'https://example.invalid/x.pdf',
            200, repeat('f', 64), 'complete', 'test', 'production');
    raise exception 'a production retrieval from a blocked source was accepted';
  exception when check_violation then null;
  end;

  -- Research collection is what internal-only retention looks like, and it is permitted.
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose)
  values (iface, 'test|capacity|internal-research', now(), now(), 'GET', 'https://example.invalid/x.pdf',
          200, repeat('f', 64), 'complete', 'test', 'research');
end $$;

-- MISO's zones are localities of the resource-zone kind, and its limits are constraints. A
-- capacity import limit may not be filed as a component under any name.
do $$
declare area uuid; zone uuid; iface uuid; src uuid; retr uuid; vint uuid; scen uuid; raw uuid;
begin
  select id into area from reference.grid_areas where slug = 'miso';
  select id into src from reference.source_interfaces where slug = 'miso-cil-cel-results';
  insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
  values (area, 'lrz', 'TEST-LRZ', 'Test Local Resource Zone', now()) returning id into zone;
  insert into reference.grid_interfaces
    (grid_area_id, to_subarea_id, interface_kind, native_key, native_label, effective_from)
  values (area, zone, 'import', 'TEST-LRZ-IMPORT', 'Test import', now()) returning id into iface;

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose)
  values (src, 'test|capacity|miso-shape', now(), now(), 'GET', 'https://example.invalid/cil.pdf',
          200, repeat('a', 64), 'complete', 'test', 'research')
  returning id into retr;

  insert into pipeline.grid_capacity_vintages
    (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     release_kind, published_at, retrieved_at, rights_classification, publication_state)
  values (area, src, retr, 'test-cil', 'Test CIL', 'study', now(), now(),
          'unsuitable_without_permission', 'internal_only')
  returning id into vint;

  insert into pipeline.grid_capacity_scenarios (vintage_id, native_scenario_key, native_scenario_label)
  values (vint, 'final', 'Final') returning id into scen;

  insert into pipeline.raw_grid_capacity_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_term,
     native_value, native_unit, raw_payload, extraction_method, extraction_version, pdf_page, artifact_ref)
  values (retr, 0, repeat('b', 64), 'TEST-LRZ', 'Summer', 'CIL', '7044', 'MW', '{}'::jsonb,
          'pdf_table', 'test/1.0.0', 7, 'miso/cil')
  returning id into raw;

  insert into pipeline.grid_constraint_values
    (vintage_id, scenario_id, grid_area_id, grid_interface_id, grid_subarea_id, raw_record_id,
     constraint_kind, direction, source_term, period_basis, target_year, target_season, value, unit)
  values (vint, scen, area, iface, zone, raw, 'cil', 'import', 'Capacity Import Limit (CIL)',
          'planning_year', 2026, 'summer', 7044, 'MW');

  -- The same limit as a component is refused, whatever it is called.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, grid_subarea_id, raw_record_id, quantity_kind,
       component_kind, source_term, period_basis, target_year, target_season, value, unit, capacity_basis)
    values (vint, scen, area, zone, raw, 'constraint', 'other', 'Capacity Import Limit (CIL)',
            'planning_year', 2026, 'summer', 7044, 'MW', 'ucap');
    raise exception 'a capacity import limit was accepted into the component layer';
  exception when check_violation then null;
  end;

  -- A seasonal planning-year requirement must name its season, so four seasons cannot collapse.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, grid_subarea_id, raw_record_id, quantity_kind,
       component_kind, source_term, period_basis, target_year, value, unit, capacity_basis)
    values (vint, scen, area, zone, raw, 'requirement', 'local_reliability_requirement', 'LRR',
            'planning_year', 2026, 21000, 'MW', 'ucap');
    -- Planning-year rows are not required to name a season, so this one is allowed; the four
    -- seasonal rows stay distinct because the season is part of the live-row identity.
    null;
  end;
end $$;

rollback;
