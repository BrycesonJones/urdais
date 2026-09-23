-- UMPI Phase 8: what the database guarantees about the operational record.
--
-- The operational tables exist to answer one question honestly: is what a reader is looking at
-- still current, and if not, where did the chain stop? That answer is only as good as the
-- evidence behind it, so the schema has to refuse the shapes that would let a broken run look
-- like a healthy one -- a run that never finished but claims an outcome, a check that records a
-- state nobody defined, a failure with no stage, a release policy with no rationale.
begin;

do $$
declare
  ppi_id uuid; ppi_if uuid; run_id uuid; n integer;
begin
  select s.id, ss.source_interface_id into ppi_id, ppi_if
    from reference.umpi_series s
    join reference.umpi_source_series ss on ss.series_id = s.id
   where s.series_code = 'UMPI-KR-DRAM-PPI';

  -- ------------------------------------------------------------------- the heartbeat's shape

  insert into pipeline.umpi_operational_runs (trigger, started_at) values ('cron', now())
  returning id into run_id;

  -- An open run carries no outcome: it has not finished, and a row that claimed one would let a
  -- crashed run read as a completed one.
  select count(*) into n from pipeline.umpi_operational_runs
   where id = run_id and completed_at is null and outcome is null;
  if n <> 1 then raise exception 'an open run was not recorded as open'; end if;

  -- Completing without an outcome, or claiming an outcome without completing, is refused.
  begin
    update pipeline.umpi_operational_runs set completed_at = now() where id = run_id;
    raise exception 'a run completed with no outcome was accepted';
  exception when check_violation then null;
  end;
  begin
    update pipeline.umpi_operational_runs set outcome = 'success_no_change' where id = run_id;
    raise exception 'a run claimed an outcome without completing';
  exception when check_violation then null;
  end;

  update pipeline.umpi_operational_runs
     set completed_at = now(), outcome = 'success_no_change', freshness_state = 'fresh'
   where id = run_id;

  -- "Nothing changed" is a success, and the schema says so by listing it as an outcome rather
  -- than leaving a quiet month to be recorded as a failure.
  select count(*) into n from pipeline.umpi_operational_runs
   where id = run_id and outcome = 'success_no_change';
  if n <> 1 then raise exception 'success_no_change is not an accepted outcome'; end if;

  begin
    update pipeline.umpi_operational_runs set outcome = 'probably_fine' where id = run_id;
    raise exception 'an undefined run outcome was accepted';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ the check's evidence

  insert into pipeline.umpi_source_checks
    (operational_run_id, series_id, source_interface_id, checked_at, reachable,
     requested_from_month, requested_to_month, source_latest_month,
     published_month, freshness_state, freshness_reason)
  values (run_id, ppi_id, ppi_if, now(), true,
          date '2026-06-01', date '2026-08-01', date '2026-08-01',
          date '2026-08-01', 'fresh', 'the published month satisfies the expected month');

  -- Only the six defined states. A seventh would be a state no consumer knows how to render.
  begin
    insert into pipeline.umpi_source_checks
      (operational_run_id, series_id, source_interface_id, checked_at, reachable,
       freshness_state, freshness_reason)
    values (run_id, ppi_id, ppi_if, now(), true, 'probably_current', 'invented');
    raise exception 'an undefined freshness state was accepted';
  exception when check_violation then null;
  end;

  -- A freshness verdict always carries its reason: a state with no explanation is not evidence.
  begin
    insert into pipeline.umpi_source_checks
      (operational_run_id, series_id, source_interface_id, checked_at, reachable,
       freshness_state, freshness_reason)
    values (run_id, ppi_id, ppi_if, now(), true, 'stale', '   ');
    raise exception 'a freshness state with no reason was accepted';
  exception when check_violation then null;
  end;

  -- A failure names its stage and its class together, so an operator is never told that
  -- something failed without being told where.
  begin
    insert into pipeline.umpi_source_checks
      (operational_run_id, series_id, source_interface_id, checked_at, reachable,
       freshness_state, freshness_reason, failure_stage)
    values (run_id, ppi_id, ppi_if, now(), false, 'source_unavailable', 'unreachable', 'source');
    raise exception 'a failure stage with no class was accepted';
  exception when check_violation then null;
  end;

  -- The window a check read is ordered, so a window that reads backwards cannot be recorded.
  begin
    insert into pipeline.umpi_source_checks
      (operational_run_id, series_id, source_interface_id, checked_at, reachable,
       requested_from_month, requested_to_month, freshness_state, freshness_reason)
    values (run_id, ppi_id, ppi_if, now(), true,
            date '2026-08-01', date '2026-06-01', 'fresh', 'backwards');
    raise exception 'a backwards check window was accepted';
  exception when check_violation then null;
  end;

  -- Failure detail is bounded. This column must never become somewhere a response body, a
  -- session cookie or a credentialed URL is quietly archived.
  begin
    insert into pipeline.umpi_source_checks
      (operational_run_id, series_id, source_interface_id, checked_at, reachable,
       freshness_state, freshness_reason, failure_stage, failure_class, failure_detail)
    values (run_id, ppi_id, ppi_if, now(), false, 'source_unavailable', 'unreachable',
            'source', 'transport', repeat('x', 501));
    raise exception 'an unbounded failure detail was accepted';
  exception when check_violation then null;
  end;

  -- A check is written once and never revised: it is a record of what was true at a moment.
  begin
    update pipeline.umpi_source_checks set freshness_state = 'stale' where operational_run_id = run_id;
    -- Reached only if the role retains update; the revoke is asserted separately below.
    null;
  exception when insufficient_privilege then null;
  end;

  raise notice 'umpi operations: ok';
end $$;

rollback;

-- ---------------------------------------------------------------------------------------------
-- The committed database: a release policy for each series, carrying its evidence, and no
-- operational history invented by a migration.

do $$
declare n integer; r record;
begin
  select count(*) into n from reference.umpi_source_monitors;
  if n <> 2 then raise exception 'expected one release policy per UMPI series, found %', n; end if;

  -- Each policy is evidence-based. A grace window of zero would call a figure late the moment
  -- its release day passed, and a rationale is what stops these becoming tuning knobs.
  for r in select s.series_code, m.release_day_of_month, m.grace_days, m.revision_lookback_months,
                  m.max_check_age_hours, m.rationale
             from reference.umpi_source_monitors m
             join reference.umpi_series s on s.id = m.series_id loop
    if r.grace_days <= 0 then
      raise exception '% has no grace window; a release day that slips would read as staleness', r.series_code;
    end if;
    if r.revision_lookback_months < 2 then
      raise exception '% re-reads too few months to notice a revision', r.series_code;
    end if;
    if r.max_check_age_hours < 24 then
      raise exception '% would call a daily schedule stopped before a day had passed', r.series_code;
    end if;
    if length(btrim(r.rationale)) < 80 then
      raise exception '% carries no evidence for its release policy', r.series_code;
    end if;
  end loop;

  -- The two agencies publish on different days and are monitored independently: one policy
  -- across both would call one series late while the other was fine.
  select count(distinct release_day_of_month) into n from reference.umpi_source_monitors;
  if n <> 2 then raise exception 'both series share a release day; they do not share a calendar'; end if;

  -- Migrations configure; they never manufacture operational history.
  select count(*) into n from pipeline.umpi_operational_runs;
  if n <> 0 then raise exception 'migrations created % operational run(s)', n; end if;
  select count(*) into n from pipeline.umpi_source_checks;
  if n <> 0 then raise exception 'migrations created % source check(s)', n; end if;

  -- Neither operational table is readable by an anonymous client, and neither carries a policy:
  -- the operational record is read server-side, and the public surface derives freshness from it
  -- rather than selecting these rows.
  select count(*) into n from pg_policies
   where schemaname in ('pipeline', 'reference')
     and tablename in ('umpi_operational_runs', 'umpi_source_checks', 'umpi_source_monitors');
  if n <> 0 then raise exception '% policy/policies exist on the UMPI operational tables', n; end if;

  select count(*) into n from pg_tables
   where schemaname in ('pipeline', 'reference')
     and tablename in ('umpi_operational_runs', 'umpi_source_checks', 'umpi_source_monitors')
     and rowsecurity = false;
  if n <> 0 then raise exception '% UMPI operational table(s) do not have RLS enabled', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema in ('pipeline', 'reference')
     and table_name in ('umpi_operational_runs', 'umpi_source_checks', 'umpi_source_monitors')
     and grantee in ('anon', 'authenticated', 'public');
  if n <> 0 then raise exception '% anon grant(s) exist on the UMPI operational tables', n; end if;

  -- A source check is evidence and is never revised after the fact.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'pipeline' and table_name = 'umpi_source_checks'
     and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE');
  if n <> 0 then raise exception 'service_role can still revise or remove a source check'; end if;

  raise notice 'umpi operations state: ok';
end $$;
