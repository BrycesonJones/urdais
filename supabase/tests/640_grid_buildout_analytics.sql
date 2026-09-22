-- GBV-3: methodology 1.0.0 registration, and the invariants the analytical layer must hold.
--
-- The rule this file exists to protect is that resolution stayed exactly what the methodology
-- says: CAISO-only, exact-identifier, and never a merge of canonical rows. The checks try to
-- write the things that would quietly break that and expect to be refused or detected.
begin;

do $$
declare
  n integer;
  mv uuid; er_snap uuid; ca_snap uuid; run uuid;
  er_iface uuid; ca_iface uuid; er_area uuid; ca_area uuid; retrieval uuid;
  p1 uuid; p2 uuid; p3 uuid;
begin
  -- ------------------------------------------------------------------ methodology registration
  select mv2.id into mv from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'grid-buildout-velocity' and mv2.version = '1.0.0';
  if mv is null then raise exception 'grid buildout methodology 1.0.0 is not registered'; end if;

  select count(*) into n from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'grid-buildout-velocity' and mv2.version = '1.0.0'
     and mv2.status = 'approved'
     and mv2.content_hash = '89e3089018d86e10d06e9b05c7b52f336494007ec2e1bde414816859ca5e1894';
  if n <> 1 then
    raise exception 'grid buildout 1.0.0 is not approved with the digest the code expects';
  end if;

  -- Approval is what authorises a calculation, so it must seed no results of its own.
  select count(*) into n from pipeline.buildout_analytics_runs;
  if n <> 0 then raise exception 'migrations seeded % analytics run(s)', n; end if;
  select count(*) into n from pipeline.buildout_metric_results;
  if n <> 0 then raise exception 'migrations seeded % metric result(s)', n; end if;

  -- All five metrics are defined, each bound to one market.
  select count(*) into n from reference.buildout_metric_definitions;
  if n <> 5 then raise exception 'expected 5 metric definitions, found %', n; end if;
  select count(*) into n from reference.buildout_metric_definitions where market not in ('ercot', 'caiso');
  if n <> 0 then raise exception 'a metric is defined for a market outside the 1.0.0 universe'; end if;

  -- ------------------------------------------------------------------ fixture
  select id into er_iface from reference.source_interfaces where slug = 'ercot-tpit-transmission-projects';
  select id into ca_iface from reference.source_interfaces where slug = 'caiso-tdf-approved-tpp-projects';
  select id into er_area from reference.grid_areas where slug = 'ercot';
  select id into ca_area from reference.grid_areas where slug = 'caiso';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, record_count, collector_identity,
     retrieval_purpose, source_claimed_complete, enumeration_assessment)
  values (er_iface, repeat('e', 64), now(), now(), 'GET', 'https://example.invalid/a.xlsx',
          200, repeat('f', 64), 10, 1, 'test', 'research', null, 'complete')
  returning id into retrieval;

  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (er_iface, er_area, retrieval, 'tpit-t', repeat('1', 64), 'https://example.invalid/a.xlsx', 10, now(), 1)
  returning id into er_snap;
  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (ca_iface, ca_area, retrieval, 'tpp-t', repeat('2', 64), 'https://example.invalid/b.xlsx', 10, now(), 1)
  returning id into ca_snap;

  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (ca_iface, ca_area, '1718-R-11', 1, ca_snap) returning id into p1;
  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (ca_iface, ca_area, '1718-R-11', 2, ca_snap) returning id into p2;
  insert into pipeline.buildout_projects
    (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
  values (er_iface, er_area, '110733', 1, er_snap) returning id into p3;

  insert into pipeline.buildout_analytics_runs
    (methodology_version_id, input_digest, ercot_snapshot_id, caiso_snapshot_id,
     calculated_at, ercot_projects, caiso_projects, coverage)
  values (mv, repeat('a', 64), er_snap, ca_snap, now(), 1, 1, '{}'::jsonb)
  returning id into run;

  -- A CAISO group of two: both contributors recorded, exactly one primary.
  insert into pipeline.buildout_project_resolutions
    (run_id, market, analytical_key, native_id, project_id, occurrence, contributing_owner,
     is_primary, group_size)
  values (run, 'caiso', 'caiso:1718-R-11', '1718-R-11', p1, 1, 'PG&E', true, 2),
         (run, 'caiso', 'caiso:1718-R-11', '1718-R-11', p2, 2, 'SCE', false, 2);

  -- ERCOT stays one-to-one.
  insert into pipeline.buildout_project_resolutions
    (run_id, market, analytical_key, native_id, project_id, occurrence, contributing_owner,
     is_primary, group_size)
  values (run, 'ercot', 'ercot:110733#1', '110733', p3, 1, 'Oncor', true, 1);

  select count(*) into n from pipeline.buildout_analytics_violations();
  if n <> 0 then raise exception 'a valid fixture reports % analytics violation(s)', n; end if;

  -- ------------------------------------------------------------------ what must be caught
  --
  -- ERCOT occurrences grouped together: the publisher reused a number, and that is not one project.
  insert into pipeline.buildout_project_resolutions
    (run_id, market, analytical_key, native_id, project_id, occurrence, contributing_owner,
     is_primary, group_size)
  values (run, 'ercot', 'ercot:110733-bad', '110733', p3, 1, 'Oncor', true, 2);
  select count(*) into n from pipeline.buildout_analytics_violations()
   where violation = 'ercot_occurrences_resolved_together';
  if n <> 1 then raise exception 'an ERCOT resolution group was not detected'; end if;

  -- A group whose members do not share the identifier it claims: resolution is exact-equality only.
  insert into pipeline.buildout_project_resolutions
    (run_id, market, analytical_key, native_id, project_id, occurrence, contributing_owner,
     is_primary, group_size)
  values (run, 'caiso', 'caiso:mixed', '1718-R-11', p1, 1, 'PG&E', true, 2),
         (run, 'caiso', 'caiso:mixed', '2223-R-02', p2, 2, 'SCE', false, 2);
  select count(*) into n from pipeline.buildout_analytics_violations()
   where violation = 'resolution_group_mixes_identifiers';
  if n <> 1 then raise exception 'a mixed-identifier group was not detected'; end if;

  -- Append-only: a recorded resolution is evidence and is never edited.
  begin
    update pipeline.buildout_project_resolutions set is_primary = false where run_id = run;
    raise exception 'a resolution was updated in place';
  exception when restrict_violation then null;
  end;
  begin
    delete from pipeline.buildout_analytics_runs where id = run;
    raise exception 'an analytics run was deleted';
  exception when restrict_violation then null;
  end;

  -- A run may not claim a metric the methodology does not define.
  begin
    insert into pipeline.buildout_metric_results (run_id, metric, payload)
    values (run, 'm9_invented_metric', '{}'::jsonb);
    raise exception 'a metric outside the methodology was accepted';
  exception when foreign_key_violation then null;
  end;

  raise notice 'grid buildout analytics: methodology 1.0.0 registered and invariants hold';
end $$;

rollback;
