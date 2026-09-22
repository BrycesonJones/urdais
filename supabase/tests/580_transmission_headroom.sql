-- TH-2: the canonical transmission evidence model and the constraints that keep it honest.
--
-- The tests that matter here are the ones that try to write something wrong and expect to be
-- refused. A margin assembled from two different entities, a sentinel limit turned into a number,
-- an absence stored as a zero: each should fail at the database, not in review.
begin;

do $$
declare
  n integer;
  ny_iface uuid; er_iface uuid; ny_area uuid; er_area uuid;
  retrieval uuid; snap uuid; raw1 uuid; raw2 uuid;
  iface_a uuid; iface_b uuid; elem uuid; calc uuid;
  flow_a uuid; flow_b uuid; lim_pos uuid; lim_neg uuid; lim_sent uuid;
begin
  -- ------------------------------------------------------------------ registration
  select id into ny_iface from reference.source_interfaces where slug = 'nyiso-external-limits-flows';
  select id into er_iface from reference.source_interfaces where slug = 'ercot-sced-binding-constraints';
  if ny_iface is null or er_iface is null then
    raise exception 'the transmission source interfaces are not registered';
  end if;

  -- Rights are recorded per interface and are NOT inherited from the queue product. NYISO is
  -- ambiguous and stays ambiguous; ERCOT carries an affirmative grant.
  select count(*) into n from reference.source_use_permissions
   where source_interface_id = ny_iface and rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'a NYISO transmission permission was relabelled away from ambiguous'; end if;

  select count(*) into n from reference.source_use_permissions
   where source_interface_id = er_iface
     and rights_classification <> 'reusable_with_attribution_or_conditions';
  if n <> 0 then raise exception 'an ERCOT transmission permission lost its affirmative grant'; end if;

  -- Every public purpose must name its attribution, because neither publisher dictates wording and
  -- a public number with no source line is the failure mode.
  select count(*) into n from reference.source_use_permissions p
    join reference.source_use_purposes u on u.code = p.purpose_code
   where p.source_interface_id in (ny_iface, er_iface) and u.is_public
     and (p.attribution_text is null or btrim(p.attribution_text) = '');
  if n <> 0 then raise exception 'a public transmission purpose carries no attribution text'; end if;

  -- ERCOT's retention window is the thing that makes a missed sweep unrecoverable, so staleness
  -- has to fire well inside it.
  select count(*) into n from reference.transmission_source_monitors
   where source_interface_id = er_iface and (retention_hours is null or stale_after_hours >= retention_hours);
  if n <> 0 then raise exception 'the ERCOT monitor would go stale no earlier than its data expires'; end if;

  -- ------------------------------------------------------------------ fixtures
  select id into ny_area from reference.grid_areas where slug = 'nyiso';
  select id into er_area from reference.grid_areas where slug = 'ercot';
  select id into calc from reference.transmission_calculation_versions where version = '0.1.0';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     request_parameters, response_status, response_content_type, response_hash, response_byte_length,
     raw_artifact_ref, record_count, enumeration_assessment, enumeration_evidence,
     collector_identity, retrieval_purpose)
  values (ny_iface, 'th2-test-retrieval', now(), now(), 'GET', 'https://example.invalid/t.csv',
          '{}'::jsonb, 200, 'text/csv', repeat('a', 64), 10, 'test/t.csv', 2, 'complete',
          'test fixture', 'urdais-test', 'research')
  returning id into retrieval;

  insert into pipeline.transmission_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, record_count)
  values (ny_iface, ny_area, retrieval, 'th2-test', repeat('a', 64), now(), 'current', 2)
  returning id into snap;

  insert into pipeline.raw_transmission_records
    (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_entity_key, native_timestamp,
     row_ordinal, locator, payload, extraction_version)
  values (snap, retrieval, repeat('a', 64), repeat('b', 64), '23314', '09/20/2026 00:00', 1,
          '{}'::jsonb, '{}'::jsonb, 'test')
  returning id into raw1;
  insert into pipeline.raw_transmission_records
    (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_entity_key, native_timestamp,
     row_ordinal, locator, payload, extraction_version)
  values (snap, retrieval, repeat('a', 64), repeat('c', 64), '23312', '09/20/2026 00:00', 2,
          '{}'::jsonb, '{}'::jsonb, 'test')
  returning id into raw2;

  insert into pipeline.transmission_interfaces
    (source_interface_id, grid_area_id, native_id, native_name, first_seen_at, last_seen_at)
  values (ny_iface, ny_area, 'TEST-A', 'Test A', now(), now()) returning id into iface_a;
  insert into pipeline.transmission_interfaces
    (source_interface_id, grid_area_id, native_id, native_name, first_seen_at, last_seen_at)
  values (ny_iface, ny_area, 'TEST-B', 'Test B', now(), now()) returning id into iface_b;

  -- The subtype is unresolved in TH-2 and the constraint keeps a guess from slipping in.
  begin
    update pipeline.transmission_interfaces set subtype = 'external_tie' where id = iface_a;
    raise exception 'an interface subtype was accepted while the question is unresolved';
  exception when check_violation then null;
  end;

  insert into pipeline.transmission_flow_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, timestamp_zone_status, flow_mw,
     flow_direction, native_field, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', '09/20/2026 00:00', 'assumed_market_local',
          100, 'positive', 'Flow (MWH)', 'MWH', 1)
  returning id into flow_a;
  insert into pipeline.transmission_flow_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, timestamp_zone_status, flow_mw,
     flow_direction, native_field, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw2, 'interface', iface_b, iface_b, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', '09/20/2026 00:00', 'assumed_market_local',
          50, 'positive', 'Flow (MWH)', 'MWH', 2)
  returning id into flow_b;

  -- A flow whose sign contradicts its label is refused: a reader must be able to trust either one.
  begin
    insert into pipeline.transmission_flow_observations
      (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
       contingency_kind, observed_at, native_timestamp, timestamp_zone_status, flow_mw,
       flow_direction, native_field, unit_as_published, row_ordinal)
    values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
            timestamptz '2026-09-20T05:00:00Z', 'x', 'assumed_market_local',
            -100, 'positive', 'Flow (MWH)', 'MWH', 3);
    raise exception 'a negative flow was stored as a positive direction';
  exception when check_violation then null;
  end;

  insert into pipeline.transmission_limit_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
     limit_state, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', '09/20/2026 00:00', 'Positive Limit (MWH)',
          'positive', 500, 'real', 'MWH', 1)
  returning id into lim_pos;
  insert into pipeline.transmission_limit_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
     limit_state, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw2, 'interface', iface_b, iface_b, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', '09/20/2026 00:00', 'Positive Limit (MWH)',
          'positive', 400, 'real', 'MWH', 2)
  returning id into lim_neg;

  -- ------------------------------------------------------------------ the sentinel rule
  -- Exact magnitude. This is the constraint that protects the 4,074 real -9899 observations in the
  -- NYISO archive from a threshold rule that would have erased them.
  insert into pipeline.transmission_limit_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
     limit_state, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', '09/20/2026 00:00', 'Negative Limit (MWH)',
          'negative', -9999, 'sentinel', 'MWH', 1)
  returning id into lim_sent;

  -- -9899 is a real limit and must be storable as one.
  insert into pipeline.transmission_limit_observations
    (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
     contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
     limit_state, unit_as_published, row_ordinal)
  values (ny_iface, snap, raw2, 'interface', iface_b, iface_b, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', 'x', 'Negative Limit (MWH)',
          'negative', -9899, 'real', 'MWH', 2);

  -- Calling -9899 a sentinel is refused.
  begin
    insert into pipeline.transmission_limit_observations
      (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
       contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
       limit_state, unit_as_published, row_ordinal)
    values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
            timestamptz '2026-09-20T06:00:00Z', 'x', 'Negative Limit (MWH)',
            'negative', -9899, 'sentinel', 'MWH', 9);
    raise exception 'a real -9899 limit was accepted as a sentinel';
  exception when check_violation then null;
  end;

  -- And calling an exact -9999 real is refused in the other direction.
  begin
    insert into pipeline.transmission_limit_observations
      (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, entity_id,
       contingency_kind, observed_at, native_timestamp, native_field, direction, limit_mw,
       limit_state, unit_as_published, row_ordinal)
    values (ny_iface, snap, raw1, 'interface', iface_a, iface_a, 'not_applicable',
            timestamptz '2026-09-20T07:00:00Z', 'x', 'Negative Limit (MWH)',
            'negative', -9999, 'real', 'MWH', 10);
    raise exception 'an exact sentinel was accepted as a real limit';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ margin invariants
  insert into pipeline.transmission_margins
    (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
     observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
     state, headroom_mw)
  values (ny_iface, calc, 'interface', iface_a, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', flow_a, lim_pos, 'positive',
          'Positive Limit (MWH)', 'ok', 400);

  -- An absence may not carry a number.
  begin
    insert into pipeline.transmission_margins
      (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
       observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
       state, headroom_mw)
    values (ny_iface, calc, 'interface', iface_b, 'not_applicable',
            timestamptz '2026-09-20T04:00:00Z', flow_b, lim_neg, 'positive',
            'Positive Limit (MWH)', 'unmonitored_direction', 0);
    raise exception 'an unmonitored direction was stored with a headroom of zero';
  exception when check_violation then null;
  end;

  -- And a computed margin may not be null.
  begin
    insert into pipeline.transmission_margins
      (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
       observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
       state, headroom_mw)
    values (ny_iface, calc, 'interface', iface_b, 'not_applicable',
            timestamptz '2026-09-20T04:00:00Z', flow_b, lim_neg, 'positive',
            'Positive Limit (MWH)', 'ok', null);
    raise exception 'an ok margin was stored without a value';
  exception when check_violation then null;
  end;

  -- The orphan-calculation guard: a margin may not borrow another entity's flow. The composite
  -- foreign key refuses it outright rather than leaving it to review.
  begin
    insert into pipeline.transmission_margins
      (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
       observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
       state, headroom_mw)
    values (ny_iface, calc, 'interface', iface_b, 'not_applicable',
            timestamptz '2026-09-20T04:00:00Z', flow_a, lim_neg, 'positive',
            'Positive Limit (MWH)', 'ok', 300);
    raise exception 'a margin borrowed a flow observation belonging to another entity';
  exception when foreign_key_violation then null;
  end;

  -- Nor another instant.
  begin
    insert into pipeline.transmission_margins
      (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
       observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
       state, headroom_mw)
    values (ny_iface, calc, 'interface', iface_a, 'not_applicable',
            timestamptz '2026-09-20T09:00:00Z', flow_a, lim_pos, 'positive',
            'Positive Limit (MWH)', 'ok', 400);
    raise exception 'a margin was stored against an instant its flow does not belong to';
  exception when foreign_key_violation then null;
  end;

  -- Zero flow determines no direction, so it may hold no limit.
  begin
    insert into pipeline.transmission_margins
      (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
       observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
       state, headroom_mw)
    values (ny_iface, calc, 'interface', iface_b, 'not_applicable',
            timestamptz '2026-09-20T04:00:00Z', flow_b, lim_neg, 'undetermined',
            'Positive Limit (MWH)', 'zero_flow_direction_undetermined', null);
    raise exception 'a zero-flow margin was stored holding a limit it could not have selected';
  exception when check_violation then null;
  end;

  -- Negative headroom is valid and must survive.
  insert into pipeline.transmission_margins
    (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
     observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
     state, headroom_mw)
  values (ny_iface, calc, 'interface', iface_b, 'not_applicable',
          timestamptz '2026-09-20T04:00:00Z', flow_b, lim_neg, 'positive',
          'Positive Limit (MWH)', 'ok', -25);
  select count(*) into n from pipeline.transmission_margins
   where entity_id = iface_b and headroom_mw < 0;
  if n <> 1 then raise exception 'a negative margin did not survive storage'; end if;

  -- ------------------------------------------------------------------ append-only evidence
  -- The append-only trigger raises restrict_violation; the assert_failure raised on the success
  -- path is deliberately a different code, so it escapes this handler and fails the suite.
  begin
    update pipeline.raw_transmission_records set payload = '{"x":1}'::jsonb where id = raw1;
    raise exception 'raw evidence was mutated' using errcode = 'assert_failure';
  exception when restrict_violation then null;
  end;

  begin
    delete from pipeline.transmission_margins where entity_id = iface_a;
    raise exception 'a derived margin was deleted' using errcode = 'assert_failure';
  exception when restrict_violation then null;
  end;

  -- ------------------------------------------------------------------ domain invariants
  select count(*) into n from pipeline.transmission_domain_violations();
  if n <> 0 then raise exception 'the transmission domain reports % violation kinds', n; end if;

  -- ------------------------------------------------------------------ separation of markets
  -- Nothing in the schema offers a place to put a cross-market total: a margin is always bound to
  -- one entity, and an entity is always bound to one source interface.
  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name = 'transmission_margins'
     and column_name in ('entity_id', 'source_interface_id') and is_nullable = 'YES';
  if n <> 0 then raise exception 'a margin may exist without an entity or a source'; end if;
end $$;

rollback;
