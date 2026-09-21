-- IQ-3: archive snapshots, load end use, and the invariants they add.
begin;

do $$
declare
  n integer;
  area uuid; iface uuid; retrieval uuid; snap uuid; raw_a uuid; req uuid; obs uuid;
begin
  -- ------------------------------------------------------------------ vocabularies and sources
  select count(*) into n from reference.interconnection_load_end_uses;
  if n <> 6 then raise exception 'expected six load end uses, found %', n; end if;

  select count(*) into n from reference.interconnection_load_end_uses where code = 'data_center_ai';
  if n <> 1 then raise exception 'the AI data centre end use is missing'; end if;

  select count(*) into n from reference.source_interfaces where source_class = 'interconnection_queue';
  if n <> 5 then raise exception 'expected five queue interfaces, found %', n; end if;

  -- ERCOT is the one queue source with an affirmative grant; the other four stay ambiguous.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'interconnection_queue'
     and sup.rights_classification = 'reusable_with_attribution_or_conditions';
  if n = 0 then raise exception 'no queue source carries the ERCOT grant'; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug in ('nyiso-interconnection-queue', 'pjm-planning-queues',
                    'miso-generator-interconnection-queue', 'caiso-public-queue-report')
     and sup.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'an ambiguous queue source was relabelled'; end if;

  -- Monthly publishers must not inherit a continuous feed's staleness threshold.
  select count(distinct m.stale_after_hours) into n from reference.interconnection_source_monitors m;
  if n < 2 then raise exception 'every queue source shares one staleness threshold'; end if;

  select count(*) into n from reference.interconnection_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where s.slug in ('ercot-gis-report', 'nyiso-interconnection-queue')
     and (m.expected_cadence <> 'monthly' or m.stale_after_hours < 720);
  if n <> 0 then raise exception 'a monthly queue source carries a sub-monthly threshold'; end if;

  -- ------------------------------------------------------------------ archive snapshots
  select id into area from reference.grid_areas where slug = 'ercot';
  select id into iface from reference.source_interfaces where slug = 'ercot-gis-report';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, raw_artifact_ref, record_count,
     enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose)
  values (iface, 'iq3-test', now(), now(), 'GET', 'https://example.test/gis', 200,
          repeat('c', 64), 10, 'test/gis', 1, 'complete', 'test', 'iq3-test', 'research')
  returning id into retrieval;

  -- An original and its correction share a report period and are both retained.
  insert into pipeline.interconnection_queue_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, is_latest, record_count, report_period, is_correction,
     native_document_id, archive_metadata)
  values (iface, area, retrieval, 'gis-2023-06', repeat('c', 64), now(), 'current', false, 1316,
          date '2023-06-01', false, '926762534', '{"friendlyName":"GIS_Report_June2023"}'::jsonb)
  returning id into snap;

  insert into pipeline.interconnection_queue_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, is_latest, record_count, report_period, is_correction,
     native_document_id)
  values (iface, area, retrieval, 'gis-2023-06-correction', repeat('d', 64), now(), 'current',
          false, 1317, date '2023-06-01', true, '927713161');

  select count(*) into n from pipeline.interconnection_queue_snapshots
   where source_interface_id = iface and report_period = date '2023-06-01';
  if n <> 2 then raise exception 'an original and its correction did not both survive, found %', n; end if;

  -- Archive metadata must be an object when present.
  begin
    insert into pipeline.interconnection_queue_snapshots
      (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
       observed_at, currentness_status, is_latest, record_count, archive_metadata)
    values (iface, area, retrieval, 'bad-metadata', repeat('e', 64), now(), 'current', false, 1,
            '"not an object"'::jsonb);
    raise exception 'non-object archive metadata was accepted';
  exception when check_violation then null; end;

  -- ------------------------------------------------------------------ presence, without a table
  --
  -- "Was request X in snapshot Y" is answered by the raw records, which already carry both.
  insert into pipeline.raw_interconnection_queue_records
    (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_queue_id, locator, payload,
     extraction_version)
  values (snap, retrieval, repeat('c', 64), repeat('f', 64), '19INR0176',
          '{"workbookSheet":"Project Details"}'::jsonb, '{"INR":"19INR0176"}'::jsonb, 'test/1')
  returning id into raw_a;

  select count(*) into n from pipeline.raw_interconnection_queue_records r
    join pipeline.interconnection_queue_snapshots q on q.id = r.snapshot_id
   where q.source_interface_id = iface and r.native_queue_id = '19INR0176';
  if n <> 1 then raise exception 'presence is not answerable from raw evidence'; end if;

  -- No presence table was added; the evidence is the record.
  select count(*) into n from information_schema.tables
   where table_schema = 'pipeline' and table_name like '%presence%';
  if n <> 0 then raise exception 'a presence table exists; raw records already record presence'; end if;

  -- ------------------------------------------------------------------ load end use
  insert into pipeline.interconnection_requests
    (grid_area_id, source_interface_id, native_queue_id, first_seen_snapshot_id, first_seen_at)
  values (area, iface, '19INR0176', snap, now())
  returning id into req;

  insert into pipeline.interconnection_request_observations
    (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
     observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
     native_end_use, load_end_use, is_latest)
  values (req, snap, snap, raw_a, raw_a, 1, repeat('1', 64), '{"fuel":"OTH"}'::jsonb,
          'study', 'load', 'DAT-AI', 'data_center_ai', true)
  returning id into obs;

  -- An end use belongs to a load request, never to a generator.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
       load_end_use, is_latest)
    values (req, snap, snap, raw_a, raw_a, 90, repeat('2', 64), '{"fuel":"SOL"}'::jsonb,
            'study', 'generation', 'data_center_ai', false);
    raise exception 'an end use was accepted on a generation request';
  exception when check_violation then null; end;

  -- An invented end use is refused.
  begin
    insert into pipeline.interconnection_request_observations
      (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
       observation_ordinal, observation_hash, native_status, lifecycle_stage, request_class,
       load_end_use, is_latest)
    values (req, snap, snap, raw_a, raw_a, 91, repeat('3', 64), '{"fuel":"SOL"}'::jsonb,
            'study', 'load', 'crypto_mining', false);
    raise exception 'an unregistered end use was accepted';
  exception when foreign_key_violation then null; end;

  -- The end use is evidence and may not be edited in place.
  begin
    update pipeline.interconnection_request_observations set load_end_use = 'data_center' where id = obs;
    raise exception 'a load end use was edited';
  exception when others then null; end;

  -- ------------------------------------------------------------------ IQ-2 invariants hold
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain'; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%'
     and column_name in ('capacity_mw', 'queue_mw', 'mw');
  if n <> 0 then raise exception 'a generic MW column exists in the queue domain'; end if;

  raise notice 'interconnection queue archive: ok';
end $$;

rollback;
