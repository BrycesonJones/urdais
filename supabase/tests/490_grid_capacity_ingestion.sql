-- PD-4C: the registry the capacity sources are collected under, and the two vocabulary gaps the
-- live artifacts exposed.
begin;

-- Three capacity interfaces, each with a determination for every purpose, and none of them
-- quietly promoted past what the rights review concluded.
do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where source_class = 'power_system_capacity_assessment';
  if n <> 3 then raise exception 'expected three capacity interfaces, found %', n; end if;

  select count(*) into n from reference.source_use_permissions u
    join reference.source_interfaces s on s.id = u.source_interface_id
   where s.source_class = 'power_system_capacity_assessment' and u.effective_to is null;
  if n <> 15 then raise exception 'expected fifteen capacity determinations, found %', n; end if;

  -- Every capacity interface can be collected from, and every one of them has a grant in force.
  select count(*) into n from reference.source_interfaces s
   where s.source_class = 'power_system_capacity_assessment'
     and s.production_access_state not in ('production_approved', 'production_approved_under_accepted_risk');
  if n <> 0 then raise exception '% capacity interface(s) are not approved for collection', n; end if;

  select count(*) into n from reference.source_interfaces s
   where s.source_class = 'power_system_capacity_assessment'
     and not exists (select 1 from reference.permission_grants g
                      where g.source_interface_id = s.id and g.effective_from <= now()
                        and (g.effective_to is null or g.effective_to > now()));
  if n <> 0 then raise exception '% capacity interface(s) have no grant in force', n; end if;

  -- The accepted-risk state is Urdais policy and never a rights conclusion: a source approved
  -- under it still has an open terms review.
  select count(*) into n from reference.source_interfaces
   where source_class = 'power_system_capacity_assessment'
     and production_access_state = 'production_approved_under_accepted_risk'
     and terms_review_state <> 'under_review';
  if n <> 0 then raise exception '% accepted-risk capacity interface(s) claim a concluded review', n; end if;
end $$;

-- The use a capacity source is read for is retention and analysis, not index membership. Before
-- PD-4C this class fell to the index-use branch and every collection failed.
do $$
declare iface uuid; grant_id uuid;
begin
  select s.id, g.id into iface, grant_id
    from reference.source_interfaces s
    join reference.permission_grants g on g.source_interface_id = s.id
   where s.slug = 'ercot-capacity-demand-reserves' limit 1;

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose,
     permission_grant_id)
  values (iface, 'test|capacity|grant-covers-internal-use', now(), now(), 'GET',
          'https://example.invalid/cdr.xlsx', 200, repeat('a', 64), 'complete', 'test', 'production', grant_id);
end $$;

-- An external tie may name a counterparty and no locality; an internal interface still may not
-- lead nowhere, and a locality still may not face itself.
do $$
declare area uuid; zone uuid;
begin
  select id into area from reference.grid_areas where slug = 'iso-ne';
  insert into reference.grid_subareas (grid_area_id, subarea_kind, native_key, native_label, effective_from)
  values (area, 'capacity_zone', 'TEST-ZONE', 'Test zone', now()) returning id into zone;

  insert into reference.grid_interfaces
    (grid_area_id, interface_kind, native_key, native_label, external_counterparty, effective_from)
  values (area, 'external_tie', 'TEST-TIE', 'Test external tie', 'Neighbouring System', now());

  begin
    insert into reference.grid_interfaces
      (grid_area_id, interface_kind, native_key, native_label, effective_from)
    values (area, 'internal_transfer', 'TEST-NOWHERE', 'Interface to nowhere', now());
    raise exception 'an interface with no end and no counterparty was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into reference.grid_interfaces
      (grid_area_id, from_subarea_id, to_subarea_id, interface_kind, native_key, native_label, effective_from)
    values (area, zone, zone, 'internal_transfer', 'TEST-SELF', 'Zone to itself', now());
    raise exception 'an interface from a locality to itself was accepted';
  exception when check_violation then null;
  end;

  -- Only a tie that leaves the market may name a counterparty.
  begin
    insert into reference.grid_interfaces
      (grid_area_id, from_subarea_id, interface_kind, native_key, native_label, external_counterparty, effective_from)
    values (area, zone, 'internal_transfer', 'TEST-INTERNAL-PARTY', 'Internal', 'Somewhere', now());
    raise exception 'an internal interface was allowed to name an external counterparty';
  exception when check_violation then null;
  end;
end $$;

-- The vocabulary distinguishes a gross requirement from a net one, and three local studies from
-- each other. Without these codes the second value of each pair collides with the first.
do $$
declare n integer;
begin
  select count(*) into n from reference.capacity_component_kinds
   where code in ('net_reserve_requirement', 'local_sourcing_requirement',
                  'transmission_security_requirement', 'tie_benefit');
  if n <> 4 then raise exception 'expected four added component kinds, found %', n; end if;
end $$;

-- A tie benefit may name the interface it is credited for; a locality-scoped quantity may not.
do $$
declare area uuid; zone uuid; iface uuid; src uuid; retr uuid; vint uuid; scen uuid; raw uuid;
begin
  select id into area from reference.grid_areas where slug = 'iso-ne';
  select id into src from reference.source_interfaces where slug = 'iso-ne-icr-related-values';
  select id into zone from reference.grid_subareas where native_key = 'TEST-ZONE';
  select id into iface from reference.grid_interfaces where native_key = 'TEST-TIE';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, enumeration_assessment, collector_identity, retrieval_purpose)
  values (src, 'test|capacity|component-shape', now(), now(), 'GET', 'https://example.invalid/icr.xlsx',
          200, repeat('b', 64), 'complete', 'test', 'research')
  returning id into retr;

  insert into pipeline.grid_capacity_vintages
    (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     release_kind, published_at, retrieved_at, rights_classification)
  values (area, src, retr, 'test-vintage', 'Test', 'requirement_filing', now(), now(),
          'ambiguous_requires_legal_review')
  returning id into vint;

  insert into pipeline.grid_capacity_scenarios (vintage_id, native_scenario_key, native_scenario_label)
  values (vint, 'test', 'Test') returning id into scen;

  insert into pipeline.raw_grid_capacity_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_term,
     native_value, native_unit, raw_payload, extraction_method, extraction_version,
     workbook_sheet, workbook_cell)
  values (retr, 0, repeat('c', 64), 'ISO-NE', '2026', 'Tie Benefits', '1009', 'MW', '{}'::jsonb,
          'workbook_cell', 'test/1.0.0', 'S', 'V21')
  returning id into raw;

  insert into pipeline.grid_capacity_components
    (vintage_id, scenario_id, grid_area_id, grid_interface_id, raw_record_id, quantity_kind,
     component_kind, source_term, period_basis, target_year, value, unit, capacity_basis)
  values (vint, scen, area, iface, raw, 'capability', 'tie_benefit', 'Tie Benefits',
          'capacity_commitment_period', 2026, 1009, 'MW', 'icap');

  -- A reserve requirement is about a place, not a boundary, and may not claim one.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, grid_interface_id, raw_record_id, quantity_kind,
       component_kind, source_term, period_basis, target_year, value, unit, capacity_basis)
    values (vint, scen, area, iface, raw, 'requirement', 'reserve_requirement', 'ICR',
            'capacity_commitment_period', 2026, 31059, 'MW', 'icap');
    raise exception 'a reserve requirement was allowed to name an interface';
  exception when check_violation then null;
  end;

  -- A network limit belongs in the constraint layer and is refused here whatever it is called.
  begin
    insert into pipeline.grid_capacity_components
      (vintage_id, scenario_id, grid_area_id, raw_record_id, quantity_kind, component_kind,
       source_term, period_basis, target_year, value, unit, capacity_basis)
    values (vint, scen, area, raw, 'constraint', 'other', 'MCL',
            'capacity_commitment_period', 2026, 8595, 'MW', 'icap');
    raise exception 'a constraint was accepted into the component layer';
  exception when check_violation then null;
  end;
end $$;

rollback;
