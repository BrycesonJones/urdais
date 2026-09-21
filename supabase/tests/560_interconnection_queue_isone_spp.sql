-- IQ-4: request subtypes, the quantity guard, and SPP's publication block.
begin;

do $$
declare
  n integer;
  area uuid; iface uuid; retrieval uuid; snap uuid; raw_a uuid; req uuid; obs uuid;
begin
  -- ------------------------------------------------------------------ seven markets registered
  select count(*) into n from reference.source_interfaces where source_class = 'interconnection_queue';
  if n <> 7 then raise exception 'expected seven queue interfaces, found %', n; end if;

  select count(*) into n from reference.interconnection_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where s.source_class = 'interconnection_queue';
  if n <> 7 then raise exception 'expected a currentness monitor for each queue source, found %', n; end if;

  -- ------------------------------------------------------------------ SPP is blocked
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug = 'spp-generator-interconnection-queue' and u.is_public
     and sup.disposition <> 'prohibited';
  if n <> 0 then raise exception 'an SPP public purpose is not prohibited'; end if;

  -- Internal retention and calculation remain permitted: the block is on publication only.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug = 'spp-generator-interconnection-queue' and not u.is_public
     and sup.disposition <> 'permitted';
  if n <> 0 then raise exception 'SPP internal retention or calculation was blocked as well'; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'spp-generator-interconnection-queue'
     and sup.rights_classification <> 'unsuitable_without_permission';
  if n <> 0 then raise exception 'SPP was relabelled'; end if;

  -- No permission grant confers publication on SPP.
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'spp-generator-interconnection-queue' and g.covers_index_use;
  if n <> 0 then raise exception 'an SPP grant claims index use'; end if;

  -- ISO-NE stays ambiguous, publishable under founder-accepted risk, with its question open.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug = 'iso-ne-interconnection-queue' and u.is_public
     and (sup.rights_classification <> 'ambiguous_requires_legal_review'
          or sup.disposition <> 'permitted' or sup.unresolved_issue is null
          or sup.attribution_required is not true);
  if n <> 0 then raise exception 'the ISO-NE queue source lost its classification, grant or question'; end if;

  -- ------------------------------------------------------------------ subtype vocabulary
  select count(*) into n from reference.interconnection_request_subtypes;
  if n <> 6 then raise exception 'expected six request subtypes, found %', n; end if;

  select count(*) into n from reference.interconnection_request_subtypes
   where code = 'capacity_rights' and is_new_capability;
  if n <> 0 then raise exception 'capacity rights are marked as new capability'; end if;

  -- An unmapped kind must never count as new capability.
  select count(*) into n from reference.interconnection_request_subtypes
   where code = 'unknown' and is_new_capability;
  if n <> 0 then raise exception 'an unknown request subtype counts as new capability'; end if;

  -- ------------------------------------------------------------------ the quantity guard
  select id into area from reference.grid_areas where slug = 'iso-ne';
  select id into iface from reference.source_interfaces where slug = 'iso-ne-interconnection-queue';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, raw_artifact_ref, record_count,
     enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose)
  values (iface, 'iq4-test', now(), now(), 'GET', 'https://example.test/q', 200,
          repeat('a', 64), 10, 'test/q', 1, 'complete', 'test', 'iq4-test', 'research')
  returning id into retrieval;

  insert into pipeline.interconnection_queue_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, is_latest, record_count)
  values (iface, area, retrieval, 'iq4-test', repeat('a', 64), now(), 'current', false, 1)
  returning id into snap;

  insert into pipeline.raw_interconnection_queue_records
    (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_queue_id, locator, payload,
     extraction_version)
  values (snap, retrieval, repeat('a', 64), repeat('b', 64), '1090',
          '{"ordinal":1}'::jsonb, '{"QP":"1090"}'::jsonb, 'test/1')
  returning id into raw_a;

  insert into pipeline.interconnection_requests
    (grid_area_id, source_interface_id, native_queue_id, first_seen_snapshot_id, first_seen_at)
  values (area, iface, '1090', snap, now())
  returning id into req;

  -- A capacity-rights observation: its MW may not occupy a new-generation kind.
  insert into pipeline.interconnection_request_observations
    (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
     observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
     request_subtype, native_request_type, is_latest)
  values (req, snap, snap, raw_a, raw_a, 1, repeat('c', 64), '{"serv":"CNR"}'::jsonb,
          'study', 'generation', 'capacity_rights', 'G CNR', true)
  returning id into obs;

  for n in 1..1 loop
    begin
      insert into pipeline.interconnection_request_quantities
        (observation_id, native_field, quantity_kind, value, unit, locator)
      values (obs, 'Summer MW', 'summer_mw', 838.2, 'MW', '{}'::jsonb);
      raise exception 'a capacity-rights request was allowed to carry summer_mw';
    exception when check_violation then null; end;
  end loop;

  begin
    insert into pipeline.interconnection_request_quantities
      (observation_id, native_field, quantity_kind, value, unit, locator)
    values (obs, 'Net MW', 'net_mw_to_grid', 0, 'MW', '{}'::jsonb);
    raise exception 'a capacity-rights request was allowed to carry net_mw_to_grid';
  exception when check_violation then null; end;

  -- The kinds it may carry are accepted.
  insert into pipeline.interconnection_request_quantities
    (observation_id, native_field, quantity_kind, value, unit, locator)
  values (obs, 'Net MW', 'capacity_service_mw', 0, 'MW', '{}'::jsonb);
  insert into pipeline.interconnection_request_quantities
    (observation_id, native_field, quantity_kind, value, unit, locator)
  values (obs, 'Summer MW', 'other_mw', 838.2, 'MW', '{}'::jsonb);

  -- And an ordinary new-generation request is unaffected.
  insert into pipeline.interconnection_request_observations
    (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
     observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
     request_subtype, is_latest)
  values (req, snap, snap, raw_a, raw_a, 2, repeat('d', 64), '{"serv":"NR"}'::jsonb,
          'study', 'generation', 'new_generation', false)
  returning id into obs;
  insert into pipeline.interconnection_request_quantities
    (observation_id, native_field, quantity_kind, value, unit, locator)
  values (obs, 'Summer MW', 'summer_mw', 1200, 'MW', '{}'::jsonb);

  -- The subtype is evidence and may not be edited in place.
  begin
    update pipeline.interconnection_request_observations
       set request_subtype = 'new_generation' where id = obs and request_subtype <> 'new_generation';
    update pipeline.interconnection_request_observations
       set request_subtype = 'capacity_rights' where id = obs;
    raise exception 'a request subtype was edited';
  exception when others then null; end;

  -- An invented subtype is refused.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
       request_subtype, is_latest)
    values (req, snap, snap, raw_a, raw_a, 3, repeat('e', 64), '{"x":"y"}'::jsonb,
            'study', 'generation', 'made_up_kind', false);
    raise exception 'an unregistered request subtype was accepted';
  exception when foreign_key_violation then null; end;

  -- ------------------------------------------------------------------ prior invariants hold
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%'
     and column_name in ('capacity_mw', 'queue_mw', 'mw');
  if n <> 0 then raise exception 'a generic MW column exists in the queue domain'; end if;

  select count(*) into n from information_schema.tables
   where table_schema = 'pipeline' and table_name like '%presence%';
  if n <> 0 then raise exception 'a presence table exists; raw records already record presence'; end if;

  raise notice 'interconnection queue iso-ne and spp: ok';
end $$;

rollback;
