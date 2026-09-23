-- GBV-5: the operational ledger, and the one rule it exists to enforce.
--
-- A failed attempt must never be able to claim it published. Everything below tries to write a
-- row that would blur "latest attempt" into "latest successful publication" and expects refusal,
-- because that blur is what turns one bad workbook into a broken public product.
begin;

do $$
declare
  n integer;
  mv uuid; er_iface uuid; ca_iface uuid; er_area uuid; ca_area uuid;
  retrieval uuid; er_snap uuid; ca_snap uuid; good_run uuid; job uuid;
begin
  select mv2.id into mv from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'grid-buildout-velocity' and mv2.version = '1.0.0' and mv2.status = 'approved';
  if mv is null then raise exception 'grid buildout 1.0.0 is not approved'; end if;

  -- Activation seeds no operational history of its own.
  select count(*) into n from pipeline.buildout_job_runs;
  if n <> 0 then raise exception 'migrations seeded % job run(s)', n; end if;

  select id into er_iface from reference.source_interfaces where slug = 'ercot-tpit-transmission-projects';
  select id into ca_iface from reference.source_interfaces where slug = 'caiso-tdf-approved-tpp-projects';
  select id into er_area from reference.grid_areas where slug = 'ercot';
  select id into ca_area from reference.grid_areas where slug = 'caiso';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, record_count, collector_identity,
     retrieval_purpose, source_claimed_complete, enumeration_assessment)
  values (er_iface, repeat('9', 64), now(), now(), 'GET', 'https://example.invalid/a.xlsx',
          200, repeat('8', 64), 10, 1, 'test', 'research', null, 'complete')
  returning id into retrieval;

  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (er_iface, er_area, retrieval, 'tpit-ops', repeat('3', 64), 'https://example.invalid/a.xlsx', 10, now(), 1)
  returning id into er_snap;
  insert into pipeline.buildout_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     artifact_url, artifact_bytes, observed_at, record_count)
  values (ca_iface, ca_area, retrieval, 'tpp-ops', repeat('4', 64), 'https://example.invalid/b.xlsx', 10, now(), 1)
  returning id into ca_snap;

  insert into pipeline.buildout_analytics_runs
    (methodology_version_id, input_digest, ercot_snapshot_id, caiso_snapshot_id,
     calculated_at, run_status, ercot_projects, caiso_projects, coverage)
  values (mv, repeat('c', 64), er_snap, ca_snap, now(), 'validated', 1, 1, '{}'::jsonb)
  returning id into good_run;

  -- ------------------------------------------------------------------ the happy path
  insert into pipeline.buildout_job_runs (trigger, status) values ('scheduled', 'running')
  returning id into job;
  update pipeline.buildout_job_runs
     set status = 'succeeded', completed_at = now(), published = true, analytics_run_id = good_run
   where id = job;

  select count(*) into n from pipeline.buildout_operations_violations();
  if n <> 0 then raise exception 'a valid ledger reports % operational violation(s)', n; end if;

  -- ------------------------------------------------------------------ what must be refused
  --
  -- A failed attempt claiming publication is the exact blur this table exists to prevent.
  begin
    insert into pipeline.buildout_job_runs
      (trigger, status, completed_at, published, analytics_run_id, failed_phase, error_class)
    values ('scheduled', 'failed', now(), true, good_run, 'analytics', 'unexpected');
    raise exception 'a failed run was allowed to claim publication';
  exception when check_violation then null;
  end;

  -- A publication with no run behind it cannot be traced to any numbers.
  begin
    insert into pipeline.buildout_job_runs (trigger, status, completed_at, published)
    values ('scheduled', 'succeeded', now(), true);
    raise exception 'a publication without an analytics run was accepted';
  exception when check_violation then null;
  end;

  -- A failure must name its phase, or a diagnosis starts with a guess.
  begin
    insert into pipeline.buildout_job_runs (trigger, status, completed_at)
    values ('scheduled', 'failed', now());
    raise exception 'a failure without a phase was accepted';
  exception when check_violation then null;
  end;

  -- And a success must not name one.
  begin
    insert into pipeline.buildout_job_runs (trigger, status, completed_at, failed_phase)
    values ('scheduled', 'succeeded', now(), 'ingest');
    raise exception 'a succeeded run was allowed to name a failed phase';
  exception when check_violation then null;
  end;

  -- A finished run has an end; a running one does not.
  begin
    insert into pipeline.buildout_job_runs (trigger, status) values ('scheduled', 'succeeded');
    raise exception 'a finished run without a completion time was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into pipeline.buildout_job_runs (trigger, status, completed_at)
    values ('scheduled', 'running', now());
    raise exception 'a running job was allowed a completion time';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ detected, not constrained
  --
  -- Publishing a run that is not validated resolves both foreign keys and is still wrong.
  insert into pipeline.buildout_analytics_runs
    (methodology_version_id, input_digest, ercot_snapshot_id, caiso_snapshot_id,
     calculated_at, run_status, ercot_projects, caiso_projects, coverage)
  values (mv, repeat('d', 64), er_snap, ca_snap, now(), 'failed', 0, 0, '{}'::jsonb);
  insert into pipeline.buildout_job_runs
    (trigger, status, completed_at, published, analytics_run_id)
  select 'scheduled', 'succeeded', now(), true, id
    from pipeline.buildout_analytics_runs where run_status = 'failed' limit 1;
  select count(*) into n from pipeline.buildout_operations_violations()
   where violation = 'published_run_not_validated';
  if n <> 1 then raise exception 'publishing an unvalidated run was not detected'; end if;

  -- A crashed invocation left running forever is an incident, not work in progress.
  insert into pipeline.buildout_job_runs (trigger, status, started_at)
  values ('scheduled', 'running', now() - interval '3 hours');
  select count(*) into n from pipeline.buildout_operations_violations()
   where violation = 'abandoned_running_job';
  if n <> 1 then raise exception 'an abandoned running job was not detected'; end if;

  raise notice 'grid buildout operations: ledger invariants hold';
end $$;

rollback;
