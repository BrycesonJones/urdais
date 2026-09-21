-- PD-3D: monitors, check evidence, and the invariants currentness rests on.
begin;

-- Seven monitors, four watchable, and none of them contradicting the registry.
do $$
declare n integer;
begin
  -- Scoped by source class: the monitor table is shared with the capacity sources, which have
  -- their own monitors and their own counts.
  select count(*) into n from reference.planning_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where s.source_class = 'power_system_planning_forecast';
  if n <> 7 then raise exception 'expected seven planning monitors, found %', n; end if;
  select count(*) into n from reference.planning_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where s.source_class = 'power_system_planning_forecast' and m.monitoring_state = 'active';
  if n <> 4 then raise exception 'expected four active monitors, found %', n; end if;

  -- Every planning source interface has a monitor: a market with no data must say why.
  select count(*) into n from reference.source_interfaces s
   where s.source_class = 'power_system_planning_forecast'
     and not exists (select 1 from reference.planning_source_monitors m where m.source_interface_id = s.id);
  if n <> 0 then raise exception '% planning interface(s) have no monitor', n; end if;

  -- A blocked monitor states its kind and reason; an active one claims neither.
  if exists (select 1 from reference.planning_source_monitors
              where monitoring_state = 'blocked' and (blocked_kind is null or blocked_reason is null)) then
    raise exception 'a blocked monitor does not say why';
  end if;
end $$;

-- A monitor cannot be both active and blocked, in either direction.
do $$
declare iface uuid; area uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'ercot-long-term-load-forecast';
  begin
    update reference.planning_source_monitors set monitoring_state = 'blocked'
     where source_interface_id = iface;
    raise exception 'a monitor became blocked without a reason';
  exception when check_violation then null;
  end;
  begin
    update reference.planning_source_monitors set blocked_kind = 'rights', blocked_reason = 'fixture'
     where source_interface_id = iface;
    raise exception 'an active monitor accepted a blocker';
  exception when check_violation then null;
  end;
  -- One monitor per source interface.
  select grid_area_id into area from reference.planning_source_monitors where source_interface_id = iface;
  begin
    insert into reference.planning_source_monitors
      (source_interface_id, grid_area_id, discovery_url, discovery_method, expected_cadence,
       check_interval, monitoring_state)
    values (iface, area, 'https://example.invalid/', 'html_listing', 'annual', interval '30 days', 'active');
    raise exception 'a second monitor was accepted for one source';
  exception when unique_violation then null;
  end;
end $$;

-- Check evidence: a success names a release, a failure names the problem, and neither is editable.
do $$
declare iface uuid; check_id uuid; n integer;
begin
  select id into iface from reference.source_interfaces where slug = 'ercot-long-term-load-forecast';

  insert into pipeline.planning_source_checks
    (source_interface_id, checked_at, outcome, checker_version, checked_url, response_status,
     discovered_vintage_key, discovered_published_at, discovered_published_at_precision,
     discovered_artifact_url, evidence)
  values (iface, '2026-09-22T09:00:00Z', 'succeeded', 'test/1',
          'https://www.ercot.com/gridinfo/load/forecast', 200, 'ltlf-2025-04-adjusted',
          '2025-04-08T00:00:00Z', 'day',
          'https://www.ercot.com/files/docs/2025/04/08/Summer-and-Winter-Peaks.xlsx',
          '{"finalised_report":"2025_LTLF_Report.docx"}')
  returning id into check_id;

  insert into pipeline.planning_source_checks
    (source_interface_id, checked_at, outcome, checker_version, checked_url, response_status, error, evidence)
  values (iface, '2026-09-22T10:00:00Z', 'failed', 'test/1',
          'https://www.ercot.com/gridinfo/load/forecast', 503, 'HTTP 503', '{}');

  select count(*) into n from pipeline.planning_source_checks where source_interface_id = iface;
  if n <> 2 then raise exception 'expected both checks retained, found %', n; end if;

  -- A success that names no release is not a success.
  begin
    insert into pipeline.planning_source_checks
      (source_interface_id, checked_at, outcome, checker_version, checked_url, evidence)
    values (iface, '2026-09-22T11:00:00Z', 'succeeded', 'test/1', 'https://example.invalid/', '{}');
    raise exception 'a successful check was accepted without a discovered vintage';
  exception when check_violation then null;
  end;

  -- A failure that says nothing is not evidence.
  begin
    insert into pipeline.planning_source_checks
      (source_interface_id, checked_at, outcome, checker_version, checked_url, evidence)
    values (iface, '2026-09-22T11:00:00Z', 'failed', 'test/1', 'https://example.invalid/', '{}');
    raise exception 'a failed check was accepted without an error';
  exception when check_violation then null;
  end;

  -- A success carrying an error is a contradiction.
  begin
    insert into pipeline.planning_source_checks
      (source_interface_id, checked_at, outcome, checker_version, checked_url,
       discovered_vintage_key, error, evidence)
    values (iface, '2026-09-22T11:00:00Z', 'succeeded', 'test/1', 'https://example.invalid/',
            'ltlf-2025-04-adjusted', 'but it failed', '{}');
    raise exception 'a check was both successful and in error';
  exception when check_violation then null;
  end;

  -- Evidence is append-only: a later check is a new row, never an edit to the last one.
  begin
    update pipeline.planning_source_checks set discovered_vintage_key = 'ltlf-2026-04-adjusted' where id = check_id;
    raise exception 'a recorded check was editable';
  exception when restrict_violation then null;
  end;
  begin
    delete from pipeline.planning_source_checks where id = check_id;
    raise exception 'a recorded check was deletable';
  exception when restrict_violation then null;
  end;
end $$;

-- The comparison currentness rests on: what the source offers against what is live.
do $$
declare iface uuid; area uuid; retrieval uuid; grant_id uuid; live text; known text;
begin
  select id into iface from reference.source_interfaces where slug = 'ercot-long-term-load-forecast';
  select id into area from reference.grid_areas where eia_ba_code = 'ERCO';
  select id into grant_id from reference.permission_grants where source_interface_id = iface;
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface, 'pd3d-fixture', '2026-09-22T09:00:00Z', '2026-09-22T09:00:01Z', 'GET',
          'https://www.ercot.com/', 200, repeat('a', 64), 1, 'complete', 'production', grant_id)
  returning id into retrieval;
  insert into pipeline.planning_forecast_vintages
    (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, retrieved_at, rights_classification, publication_state, quality_status)
  values (area, iface, retrieval, 'ltlf-2025-04-adjusted', '2025 LTLF',
          '2025-04-08T00:00:00Z', '2026-09-22T09:00:00Z',
          'reusable_with_attribution_or_conditions', 'published', 'accepted');

  insert into pipeline.planning_source_checks
    (source_interface_id, checked_at, outcome, checker_version, checked_url,
     discovered_vintage_key, evidence)
  values (iface, '2026-09-22T12:00:00Z', 'succeeded', 'test/1', 'https://www.ercot.com/',
          'ltlf-2025-04-adjusted', '{}');

  select v.native_vintage_key into live from pipeline.planning_forecast_vintages v
   where v.source_interface_id = iface and v.grid_area_id = area and v.superseded_by_id is null
   order by v.published_at desc limit 1;
  select c.discovered_vintage_key into known from pipeline.planning_source_checks c
   where c.source_interface_id = iface and c.outcome = 'succeeded'
   order by c.checked_at desc limit 1;
  if live is distinct from known then
    raise exception 'the served vintage % does not match the latest known %', live, known;
  end if;
end $$;

rollback;
