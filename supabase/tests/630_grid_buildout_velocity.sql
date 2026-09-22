-- GBV-2: the canonical buildout evidence model and the constraints that keep it honest.
--
-- The tests that matter are the ones that try to write something wrong and expect refusal. A
-- completion date hiding behind an unknown quality, a driver class resting on a keyword, an
-- absence stored as a zero, an evidence chain that crosses snapshots: each should fail at the
-- database rather than in review.
begin;

do $$
declare
  n integer;
  er_iface uuid; ca_iface uuid; er_area uuid; ca_area uuid;
  retrieval uuid; snap uuid; other_snap uuid;
  raw1 uuid; raw2 uuid; raw_other uuid;
  proj1 uuid; proj2 uuid;
begin
  -- ------------------------------------------------------------------ registration
  select id into er_iface from reference.source_interfaces where slug = 'ercot-tpit-transmission-projects';
  select id into ca_iface from reference.source_interfaces where slug = 'caiso-tdf-approved-tpp-projects';
  if er_iface is null or ca_iface is null then
    raise exception 'the grid buildout source interfaces are not registered';
  end if;

  -- The TPIT interface is registered in its own right, not inherited from the headroom product's
  -- ERCOT row, which describes a different file under different retrieval terms.
  if er_iface = (select id from reference.source_interfaces where slug = 'ercot-sced-binding-constraints') then
    raise exception 'TPIT is sharing an interface with the SCED binding-constraints feed';
  end if;

  select id into er_area from reference.grid_areas where slug = 'ercot';
  select id into ca_area from reference.grid_areas where slug = 'caiso';

  -- Only headline driver classes may reach a published metric, and interconnection is not one.
  select count(*) into n from reference.buildout_driver_classes
   where code in ('generator_interconnection', 'load_interconnection', 'asset_condition', 'unknown')
     and is_headline;
  if n <> 0 then raise exception 'an excluded driver class is marked headline'; end if;

  -- Sheet membership must outrank a status string in the vocabulary itself.
  select count(*) into n from reference.buildout_lifecycle_bases
   where code = 'source_list_membership' and is_authoritative;
  if n <> 1 then raise exception 'source list membership is not marked authoritative'; end if;
  select count(*) into n from reference.buildout_lifecycle_bases
   where code = 'native_status_text' and is_authoritative;
  if n <> 0 then raise exception 'a native status string is marked authoritative'; end if;

  -- Both ERCOT mileage kinds must be flagged optional at source, which is what forbids reading a
  -- blank as a zero downstream.
  select count(*) into n from reference.buildout_quantity_kinds
   where code in ('circuit_miles_new', 'circuit_miles_rebuilt') and not is_optional_at_source;
  if n <> 0 then raise exception 'a mileage kind is marked mandatory at source'; end if;

  -- ------------------------------------------------------------------ fixture
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, record_count, collector_identity,
     retrieval_purpose, source_claimed_complete, enumeration_assessment)
  values (er_iface, repeat('a', 64), now(), now(), 'GET', 'https://example.invalid/tpit.xlsx',
          200, repeat('b', 64), 10, 2, 'test', 'research', null, 'complete')
  returning id into retrieval;

  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (er_iface, er_area, retrieval, 'tpit-test', repeat('c', 64),
          'https://example.invalid/tpit.xlsx', 100, now(), 2)
  returning id into snap;

  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (er_iface, er_area, retrieval, 'tpit-other', repeat('d', 64),
          'https://example.invalid/tpit.xlsx', 100, now(), 0)
  returning id into other_snap;

  insert into pipeline.raw_buildout_records (snapshot_id, native_list, row_ordinal, native_id, payload)
  values (snap, 'completed', 1, '400001', '{"projectNumber":"400001"}'::jsonb) returning id into raw1;
  insert into pipeline.raw_buildout_records (snapshot_id, native_list, row_ordinal, native_id, payload)
  values (snap, 'completed', 2, '400002', '{"projectNumber":"400002"}'::jsonb) returning id into raw2;
  insert into pipeline.raw_buildout_records (snapshot_id, native_list, row_ordinal, native_id, payload)
  values (other_snap, 'completed', 1, '400001', '{"projectNumber":"400001"}'::jsonb) returning id into raw_other;

  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (er_iface, er_area, '400001', 1, snap) returning id into proj1;
  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (er_iface, er_area, '400002', 1, snap) returning id into proj2;

  -- The same native identifier may repeat, distinguished only by occurrence. This is ERCOT's five
  -- Future rows, kept rather than merged.
  begin
    insert into pipeline.buildout_projects
      (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
    values (er_iface, er_area, '400001', 1, snap);
    raise exception 'a duplicate (native_id, occurrence) was accepted';
  exception when unique_violation then null;
  end;
  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (er_iface, er_area, '400001', 2, snap);

  -- ------------------------------------------------------------------ the sentinel rule
  --
  -- A completed row whose date ERCOT has not supplied stays in service. Lifecycle and date quality
  -- are separate axes and neither overwrites the other.
  insert into pipeline.buildout_lifecycle_observations
    (project_id, snapshot_id, raw_record_id, lifecycle_state, basis, native_status, native_list)
  values (proj2, snap, raw2, 'in_service', 'source_list_membership', 'Planned', 'completed');

  insert into pipeline.buildout_milestones
    (project_id, snapshot_id, raw_record_id, kind, observed_date, date_precision, date_quality,
     native_value, source_field)
  values (proj2, snap, raw2, 'actual_in_service', null, 'none', 'sentinel_unknown', '2958101',
          'Actual In-Service Date (Month/Yr)');

  -- A date may not hide behind a quality that says there is none.
  begin
    insert into pipeline.buildout_milestones
      (project_id, snapshot_id, raw_record_id, kind, observed_date, date_precision, date_quality,
       native_value, source_field)
    values (proj1, snap, raw1, 'actual_in_service', date '2025-01-24', 'month', 'sentinel_unknown',
            '2958101', 'Actual In-Service Date (Month/Yr)');
    raise exception 'a sentinel milestone was allowed to carry a date';
  exception when check_violation then null;
  end;

  -- And a reported quality may not be empty.
  begin
    insert into pipeline.buildout_milestones
      (project_id, snapshot_id, raw_record_id, kind, observed_date, date_precision, date_quality,
       native_value, source_field)
    values (proj1, snap, raw1, 'approved', null, 'month', 'reported', null, 'Date RPG Review Completed');
    raise exception 'a reported milestone was allowed with no date';
  exception when check_violation then null;
  end;

  -- The same kind may repeat only across vintage labels, which is what CAISO's prior in-service
  -- columns are.
  insert into pipeline.buildout_milestones
    (project_id, snapshot_id, raw_record_id, kind, vintage_label, observed_date, date_precision,
     date_quality, native_value, source_field)
  values (proj1, snap, raw1, 'target_in_service_prior_vintage', 'Jan 2022', date '2024-01-01',
          'day', 'reported', '44562', 'Previous In-Service Jan 2022 TDF');
  insert into pipeline.buildout_milestones
    (project_id, snapshot_id, raw_record_id, kind, vintage_label, observed_date, date_precision,
     date_quality, native_value, source_field)
  values (proj1, snap, raw1, 'target_in_service_prior_vintage', 'Jan 2025', date '2025-06-01',
          'day', 'reported', '45809', 'Previous In-Service Jan 2025 TDF');
  begin
    insert into pipeline.buildout_milestones
      (project_id, snapshot_id, raw_record_id, kind, vintage_label, observed_date, date_precision,
       date_quality, native_value, source_field)
    values (proj1, snap, raw1, 'target_in_service_prior_vintage', 'Jan 2025', date '2025-06-01',
            'day', 'reported', '45809', 'Previous In-Service Jan 2025 TDF');
    raise exception 'a vintage milestone was duplicated';
  exception when unique_violation then null;
  end;

  -- ------------------------------------------------------------------ blank is not zero
  insert into pipeline.buildout_quantities
    (project_id, snapshot_id, raw_record_id, kind, value_numeric, native_value, is_reported)
  values (proj1, snap, raw1, 'circuit_miles_new', 0, '0', true);
  insert into pipeline.buildout_quantities
    (project_id, snapshot_id, raw_record_id, kind, value_numeric, native_value, is_reported)
  values (proj2, snap, raw2, 'circuit_miles_new', null, null, false);

  begin
    insert into pipeline.buildout_quantities
      (project_id, snapshot_id, raw_record_id, kind, value_numeric, native_value, is_reported)
    values (proj1, snap, raw1, 'circuit_miles_rebuilt', 3.2, '3.2', false);
    raise exception 'an unreported quantity was allowed to carry a value';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ driver evidence
  insert into pipeline.buildout_project_observations
    (project_id, snapshot_id, raw_record_id, native_list, title, driver_class, driver_basis, driver_evidence)
  values (proj1, snap, raw1, 'completed', 'Alpha', 'generator_interconnection', 'publisher_identifier', '23INR0419');

  begin
    insert into pipeline.buildout_project_observations
      (project_id, snapshot_id, raw_record_id, native_list, title, driver_class, driver_basis)
    values (proj2, snap, raw2, 'completed', 'Bravo Solar', 'generator_interconnection', 'text_signal_only');
    raise exception 'a driver class was accepted on a text signal alone';
  exception when check_violation then null;
  end;

  insert into pipeline.buildout_project_observations
    (project_id, snapshot_id, raw_record_id, native_list, title, driver_class, driver_basis)
  values (proj2, snap, raw2, 'completed', 'Bravo Solar', 'unknown', 'text_signal_only');

  -- ------------------------------------------------------------------ lifecycle vocabulary
  begin
    insert into pipeline.buildout_lifecycle_observations
      (project_id, snapshot_id, raw_record_id, lifecycle_state, basis, native_list)
    values (proj1, snap, raw1, 'in_service', 'unmapped', 'completed');
    raise exception 'an unmapped basis produced a class other than unknown';
  exception when check_violation then null;
  end;

  insert into pipeline.buildout_lifecycle_observations
    (project_id, snapshot_id, raw_record_id, lifecycle_state, basis, native_status, native_list)
  values (proj1, snap, raw1, 'in_service', 'source_list_membership', 'Planned', 'completed');

  -- ------------------------------------------------------------------ append-only
  begin
    update pipeline.buildout_milestones set observed_date = date '2030-01-01' where project_id = proj1;
    raise exception 'a milestone was updated in place';
  exception when restrict_violation then null;
  end;
  begin
    delete from pipeline.raw_buildout_records where id = raw1;
    raise exception 'a raw record was deleted';
  exception when restrict_violation then null;
  end;

  -- ------------------------------------------------------------------ invariants hold
  select count(*) into n from pipeline.buildout_domain_violations();
  if n <> 0 then raise exception 'a valid fixture reports % domain violation(s)', n; end if;

  -- Now break the evidence chain deliberately: a canonical row citing a raw row from another
  -- snapshot resolves both foreign keys and is still wrong.
  insert into pipeline.buildout_quantities
    (project_id, snapshot_id, raw_record_id, kind, value_numeric, native_value, is_reported)
  values (proj1, snap, raw_other, 'service_level_kv', 138, '138', true);
  select count(*) into n from pipeline.buildout_domain_violations()
   where violation = 'quantity_raw_snapshot_mismatch';
  if n <> 1 then raise exception 'a cross-snapshot evidence chain was not detected'; end if;

  -- And a payload carrying contact data must be caught even though nothing in the schema forbids
  -- the key itself.
  insert into pipeline.raw_buildout_records (snapshot_id, native_list, row_ordinal, native_id, payload)
  values (snap, 'completed', 99, 'x', '{"Primary Email Address":"person@example.invalid"}'::jsonb);
  select count(*) into n from pipeline.buildout_domain_violations()
   where violation = 'personal_contact_ingested';
  if n <> 1 then raise exception 'ingested contact data was not detected'; end if;

  raise notice 'grid buildout velocity: schema invariants hold';
end $$;

rollback;
