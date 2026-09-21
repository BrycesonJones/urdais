-- IQ-6: the derived analytics layer and the rules that keep its numbers honest.
begin;

do $$
declare
  n integer; mv uuid; area uuid; spp_area uuid; run uuid;
begin
  -- ------------------------------------------------------------------ methodology
  select mv2.id into mv from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv2.version = '1.0.0' and mv2.status = 'approved';
  if mv is null then raise exception 'the analytics methodology 1.0.0 is not approved'; end if;

  select count(*) into n from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv2.version = '1.0.0'
     and (mv2.content_hash is null or mv2.effective_from is null);
  if n <> 0 then raise exception 'the approved version has no hash or no effective date'; end if;

  -- The draft it supersedes is retired, and keeps its own digest: that hash records the document
  -- as it stood when it was drafted, which is what makes the lineage auditable.
  select count(*) into n from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv2.version = '0.1.0-draft'
     and (mv2.status <> 'superseded' or mv2.content_hash is null);
  if n <> 0 then raise exception 'the superseded draft is not retired or lost its digest'; end if;

  -- ------------------------------------------------------------------ metric definitions
  select count(*) into n from reference.interconnection_metric_definitions
   where code = 'mw_completion_rate' and not is_live and deferred_reason is not null;
  if n <> 1 then raise exception 'capacity completion is not registered as deferred with a reason'; end if;

  -- No MW metric may claim cross-market comparability. This is what stops a headline total.
  select count(*) into n from reference.interconnection_metric_definitions
   where unit = 'MW' and comparability in ('A', 'B');
  if n <> 0 then raise exception 'an MW metric claims cross-market comparability'; end if;

  -- ------------------------------------------------------------------ result invariants
  select id into area from reference.grid_areas where slug = 'pjm';
  select id into spp_area from reference.grid_areas where slug = 'spp';

  -- A market has metric results only after it has been ingested, so the fixture gives both
  -- markets the snapshot the rights guard reads.
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, response_byte_length, raw_artifact_ref, record_count,
     enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose)
  select s.id, 'iq6-test-'||s.slug, now(), now(), 'GET', 'https://example.test/q', 200,
         repeat('b', 64), 10, 'test/q', 1, 'complete', 'test', 'iq6-test', 'research'
    from reference.source_interfaces s
   where s.slug in ('pjm-planning-queues', 'spp-generator-interconnection-queue');

  insert into pipeline.interconnection_queue_snapshots
    (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
     observed_at, currentness_status, is_latest, record_count)
  select s.id, a2.id, sr.id, 'iq6-test-'||s.slug, repeat('b', 64), now(), 'current', false, 1
    from reference.source_interfaces s
    join pipeline.source_retrievals sr on sr.source_interface_id = s.id and sr.idempotency_key = 'iq6-test-'||s.slug
    join reference.grid_areas a2 on a2.slug = case s.slug when 'pjm-planning-queues' then 'pjm' else 'spp' end
   where s.slug in ('pjm-planning-queues', 'spp-generator-interconnection-queue');

  insert into pipeline.interconnection_analytics_runs
    (methodology_version_id, calculated_at, input_digest, snapshot_ids,
     request_count, observation_count, run_status)
  values (mv, now(), repeat('a', 64),
          array(select id from pipeline.interconnection_queue_snapshots
                 where native_snapshot_key like 'iq6-test-%'),
          10, 10, 'validated')
  returning id into run;

  -- A live result must carry a value.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'active_request_count', area, 'live', null, 'requests', 1, 1, 'publishable');
    raise exception 'a live result with no value was accepted';
  exception when check_violation then null; end;

  -- And a result that is not live must not carry one: an absence is never a zero.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'active_request_count', area, 'insufficient_sample', 0, 'requests', 1, 1, 'publishable');
    raise exception 'a non-live result carrying a value was accepted';
  exception when check_violation then null; end;

  -- A rights-blocked result is never publishable.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'active_request_count', area, 'rights_blocked', null, 'requests', 1, 1, 'publishable');
    raise exception 'a rights-blocked result was marked publishable';
  exception when check_violation then null; end;

  -- SPP may not publish a derived metric at all, whatever the caller asks for.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'active_request_count', spp_area, 'live', 536, 'requests', 536, 1016, 'publishable');
    raise exception 'an SPP derived metric was accepted as publishable';
  exception when check_violation then null; end;

  -- Internally it is allowed, which is how the canonical layer stays complete.
  insert into pipeline.interconnection_metric_results
    (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state, rights_reason)
  values (run, 'active_request_count', spp_area, 'rights_blocked', null, 'requests', 536, 1016,
          'internal_only', 'the source terms exclude commercial publication');

  -- A publishable market is accepted.
  insert into pipeline.interconnection_metric_results
    (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
  values (run, 'active_request_count', area, 'live', 2781, 'requests', 2781, 9200, 'publishable');

  -- One result per metric, market and dimension.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'active_request_count', area, 'live', 9999, 'requests', 1, 1, 'publishable');
    raise exception 'a duplicate metric result was accepted';
  exception when unique_violation then null; end;

  -- A dimension must be named in full or not at all.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, dimension_kind, status, value, unit,
       sample_size, population_size, publication_state)
    values (run, 'queue_age_years', area, 'statistic', 'live', 5, 'years', 10, 10, 'publishable');
    raise exception 'a dimension kind with no value was accepted';
  exception when check_violation then null; end;

  -- An invented metric or status is refused.
  begin
    insert into pipeline.interconnection_metric_results
      (run_id, metric_code, grid_area_id, status, value, unit, sample_size, population_size, publication_state)
    values (run, 'made_up_metric', area, 'live', 1, 'requests', 1, 1, 'publishable');
    raise exception 'an unregistered metric was accepted';
  exception when foreign_key_violation then null; end;

  -- Results and runs are evidence: neither is edited or deleted.
  begin
    update pipeline.interconnection_metric_results set value = 1 where run_id = run;
    raise exception 'a metric result was edited';
  exception when others then null; end;
  begin
    delete from pipeline.interconnection_analytics_runs where id = run;
    raise exception 'a calculation run was deleted';
  exception when others then null; end;

  -- A run is identified by its methodology and its inputs, so an unchanged rerun is a no-op.
  begin
    insert into pipeline.interconnection_analytics_runs
      (methodology_version_id, calculated_at, input_digest, snapshot_ids,
       request_count, observation_count, run_status)
    values (mv, now(), repeat('a', 64),
            array(select id from pipeline.interconnection_queue_snapshots
                   where native_snapshot_key like 'iq6-test-%'), 10, 10, 'validated');
    raise exception 'a duplicate run for the same methodology and inputs was accepted';
  exception when unique_violation then null; end;

  -- ------------------------------------------------------------------ prior invariants
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain'; end if;

  raise notice 'interconnection queue analytics: ok';
end $$;

rollback;
