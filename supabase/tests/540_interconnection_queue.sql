-- IQ-2: the canonical interconnection queue foundation.
--
-- The invariants that matter most here are the ones that keep queue data from becoming capacity
-- data, and the ones that keep a canonical row from existing without the evidence behind it.
begin;

do $$
declare
  n integer;
  area uuid;
  iface uuid;
  retrieval uuid;
  snap uuid;
  raw_a uuid;
  req uuid;
  obs uuid;
begin
  -- ------------------------------------------------------------------ the domain wall
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then
    raise exception 'a foreign key joins the queue domain to the capacity domain (% found)', n;
  end if;

  -- There is no generic capacity column anywhere in the queue domain, by construction.
  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%'
     and column_name in ('capacity_mw', 'queue_mw', 'mw');
  if n <> 0 then raise exception 'a generic MW column exists in the queue domain'; end if;

  -- ------------------------------------------------------------------ vocabularies
  select count(*) into n from reference.interconnection_lifecycle_stages;
  if n <> 9 then raise exception 'expected nine lifecycle stages, found %', n; end if;

  select count(*) into n from reference.interconnection_lifecycle_stages where is_terminal;
  if n <> 2 then raise exception 'expected two terminal stages, found %', n; end if;

  -- Unknown must never be terminal: an unmapped status would silently empty the active stock.
  select count(*) into n from reference.interconnection_lifecycle_stages
   where code = 'unknown' and is_terminal;
  if n <> 0 then raise exception 'the unknown stage is terminal'; end if;

  select count(*) into n from reference.interconnection_quantity_kinds where not is_project_level;
  if n <> 1 then raise exception 'expected exactly one component-level quantity kind, found %', n; end if;

  -- ------------------------------------------------------------------ sources and rights
  select count(*) into n from reference.source_interfaces where source_class = 'interconnection_queue';
  if n <> 3 then raise exception 'expected three queue interfaces, found %', n; end if;

  select count(*) into n from reference.source_use_purposes
   where code in ('interconnection_queue_retention', 'interconnection_queue_calculation',
                  'public_interconnection_queue_display',
                  'public_interconnection_queue_derived_metric_display');
  if n <> 4 then raise exception 'expected four queue rights purposes, found %', n; end if;

  -- All three sources are ambiguous and none was quietly relabelled as cleared.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'interconnection_queue'
     and sup.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'a queue source is recorded as something other than ambiguous'; end if;

  -- Ambiguous still publishes under the founder-accepted-risk policy, and the open question stays.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'interconnection_queue'
     and sup.purpose_code = 'public_interconnection_queue_display'
     and (sup.disposition <> 'permitted' or sup.unresolved_issue is null
          or sup.attribution_required is not true);
  if n <> 0 then raise exception 'a queue source publishes without attribution or without its open question'; end if;

  -- Each source has its own cadence; a single shared threshold would be wrong for all three.
  select count(distinct stale_after_hours) into n from reference.interconnection_source_monitors;
  if n < 2 then raise exception 'every queue source shares one staleness threshold'; end if;

  -- ------------------------------------------------------------------ canonical invariants
  select id into area from reference.grid_areas where slug = 'pjm';
  select id into iface from reference.source_interfaces where slug = 'pjm-planning-queues';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, raw_artifact_ref, record_count,
     enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose)
  values (iface, 'iq2-test', now(), now(), 'GET', 'https://example.test/q', 200,
          repeat('a', 64), 10, 'test/q', 1, 'complete', 'test', 'iq2-test', 'research')
  returning id into retrieval;

  insert into pipeline.interconnection_queue_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, is_latest, record_count)
  -- Not latest: this fixture must not collide with whatever the database already holds.
  values (iface, area, retrieval, 'test-1', repeat('a', 64), now(), 'current', false, 1)
  returning id into snap;

  insert into pipeline.raw_interconnection_queue_records
    (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_queue_id, locator, payload,
     extraction_version)
  values (snap, retrieval, repeat('a', 64), repeat('b', 64), 'A01', '{"ordinal":1}'::jsonb,
          '{"ProjectNumber":"A01"}'::jsonb, 'test/1')
  returning id into raw_a;

  insert into pipeline.interconnection_requests
    (grid_area_id, source_interface_id, native_queue_id, first_seen_snapshot_id, first_seen_at)
  values (area, iface, 'A01', snap, now())
  returning id into req;

  -- One request per market and native id.
  begin
    insert into pipeline.interconnection_requests
      (grid_area_id, source_interface_id, native_queue_id, first_seen_snapshot_id, first_seen_at)
    values (area, iface, 'A01', snap, now());
    raise exception 'a duplicate canonical request identity was accepted';
  exception when unique_violation then null; end;

  -- Identity is immutable: a request is never edited or deleted.
  begin
    update pipeline.interconnection_requests set native_queue_id = 'A02' where id = req;
    raise exception 'a canonical request identity was edited';
  exception when others then null; end;

  insert into pipeline.interconnection_request_observations
    (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
     observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
     requested_on, proposed_in_service_on)
  values (req, snap, snap, raw_a, raw_a, 1, repeat('c', 64), '{"Status":"Active"}'::jsonb,
          'study', 'generation', date '2020-01-01', date '2019-01-01')
  returning id into obs;

  -- A withdrawal date may not sit on a non-withdrawn observation.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
       withdrawn_on, is_latest)
    values (req, snap, snap, raw_a, raw_a, 99, repeat('d', 64), '{"Status":"Active"}'::jsonb,
            'study', 'generation', date '2021-01-01', false);
    raise exception 'a withdrawal date was accepted on a non-withdrawn observation';
  exception when check_violation then null; end;

  -- An operational observation must carry evidence; a bare stage is not enough.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class, is_latest)
    values (req, snap, snap, raw_a, raw_a, 98, repeat('e', 64), '{"Status":"?"}'::jsonb,
            'operational', 'generation', false);
    raise exception 'an operational observation was accepted with no evidence';
  exception when check_violation then null; end;

  -- Native status is never empty: the publisher's own words are always retained.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class, is_latest)
    values (req, snap, snap, raw_a, raw_a, 97, repeat('f', 64), '{}'::jsonb, 'study', 'generation', false);
    raise exception 'an observation with no native status was accepted';
  exception when check_violation then null; end;

  -- An observation may be confirmed, never edited.
  update pipeline.interconnection_request_observations set last_snapshot_id = snap where id = obs;
  begin
    update pipeline.interconnection_request_observations set lifecycle_stage = 'withdrawn' where id = obs;
    raise exception 'an observation lifecycle stage was edited';
  exception when others then null; end;
  begin
    delete from pipeline.interconnection_request_observations where id = obs;
    raise exception 'an observation was deleted';
  exception when others then null; end;

  -- A component quantity names a component; a project quantity does not.
  insert into pipeline.interconnection_request_quantities
    (observation_id, native_field, quantity_kind, value, unit, locator)
  values (obs, 'MWEnergy', 'energy_service_mw', 100, 'MW', '{}'::jsonb);
  begin
    insert into pipeline.interconnection_request_quantities
      (observation_id, native_field, quantity_kind, value, unit, resource_ordinal, locator)
    values (obs, 'MWCapacity', 'capacity_service_mw', 50, 'MW', 1, '{}'::jsonb);
    raise exception 'a project-level quantity was accepted against a component';
  exception when check_violation then null; end;
  begin
    insert into pipeline.interconnection_request_quantities
      (observation_id, native_field, quantity_kind, value, unit, locator)
    values (obs, 'MW-1', 'component_mw', 50, 'MW', '{}'::jsonb);
    raise exception 'a component quantity was accepted with no component';
  exception when check_violation then null; end;

  -- One value per named field per observation.
  begin
    insert into pipeline.interconnection_request_quantities
      (observation_id, native_field, quantity_kind, value, unit, locator)
    values (obs, 'MWEnergy', 'energy_service_mw', 999, 'MW', '{}'::jsonb);
    raise exception 'a duplicate quantity identity was accepted';
  exception when unique_violation then null; end;

  -- An unknown unit is refused rather than coerced to MW.
  begin
    insert into pipeline.interconnection_request_quantities
      (observation_id, native_field, quantity_kind, value, unit, locator)
    values (obs, 'Something', 'other_mw', 1, 'kW', '{}'::jsonb);
    raise exception 'an unknown unit was accepted';
  exception when check_violation then null; end;

  -- Every enum is a reference value, not free text.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class, is_latest)
    values (req, snap, snap, raw_a, raw_a, 96, repeat('1', 64), '{"S":"x"}'::jsonb,
            'invented_stage', 'generation', false);
    raise exception 'an invented lifecycle stage was accepted';
  exception when foreign_key_violation then null; end;

  -- Raw evidence is immutable.
  begin
    update pipeline.raw_interconnection_queue_records set native_queue_id = 'B' where id = raw_a;
    raise exception 'a raw queue record was edited';
  exception when others then null; end;

  raise notice 'interconnection queue: ok';
end $$;

rollback;
