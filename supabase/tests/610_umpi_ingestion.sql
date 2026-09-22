-- UMPI Phase 4: the write path against a real database.
--
-- The TypeScript store tests prove the decision logic against a fake; this proves the
-- guarantees the database itself enforces — that a rerun cannot duplicate, that a revision
-- becomes a vintage, that a prior vintage is frozen, and that ingestion creates no publication.
begin;

do $$
declare
  ppi_id    uuid;
  uv_id     uuid;
  ppi_src   uuid;
  uv_src    uuid;
  mv_id     uuid;
  bok_if    uuid;
  kcs_if    uuid;
  run_a     uuid;
  run_b     uuid;
  ret_a     uuid;
  v1        uuid;
  v2        uuid;
  n         integer;
  level     numeric;
begin
  select id into ppi_id from reference.umpi_series where series_code = 'UMPI-KR-DRAM-PPI';
  select id into uv_id  from reference.umpi_series where series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  select mv.id into mv_id from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id where m.slug = 'umpi-kr-dram';
  select ss.id, ss.source_interface_id into ppi_src, bok_if
    from reference.umpi_source_series ss where ss.series_id = ppi_id;
  select ss.id, ss.source_interface_id into uv_src, kcs_if
    from reference.umpi_source_series ss where ss.series_id = uv_id;

  -- ------------------------------------------------ Series B reads the aggregate operation

  select count(*) into n from reference.umpi_source_series ss
    join reference.source_interfaces i on i.id = ss.source_interface_id
   where ss.series_id = uv_id and ss.dataset_id = '15101609' and i.slug = 'kcs-item-trade-gw';
  if n <> 1 then raise exception 'Series B is not bound to the aggregate-by-item Customs dataset'; end if;

  select count(*) into n from reference.umpi_source_series where dataset_id = '15100475';
  if n <> 0 then raise exception 'a UMPI series is still bound to the country-dimension dataset'; end if;

  -- ------------------------------------------------------------- retrieval and run records

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
     request_url, request_parameters, response_status, response_hash, record_count,
     enumeration_assessment, enumeration_evidence, collector_identity)
  values (bok_if, 'test:retrieval:1', now(), now(), 'GET',
          'https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M/202606/202606/30911201AA',
          '{"statCode":"404Y016"}'::jsonb, 200, repeat('a', 64), 1,
          'complete', 'fixture', 'umpi-source-ingestion/1')
  returning id into ret_a;

  -- A stored request URL never carries a key.
  select count(*) into n from pipeline.source_retrievals
   where id = ret_a and request_url like '%REDACTED%' and request_url not like '%serviceKey=_%';
  if n <> 1 then raise exception 'the stored request URL is not redacted'; end if;

  insert into pipeline.umpi_ingestion_runs
    (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
     retrieval_mode, requested_from_month, requested_to_month, started_at, payload_digest, rows_received)
  values (ppi_id, ppi_src, bok_if, mv_id, 'test:run:1', 'api', date '2026-06-01', date '2026-06-01',
          now(), repeat('a', 64), 1)
  returning id into run_a;

  -- A run key is unique: a retried run is the same run, not a second one.
  begin
    insert into pipeline.umpi_ingestion_runs
      (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
       retrieval_mode, requested_from_month, requested_to_month, started_at)
    values (ppi_id, ppi_src, bok_if, mv_id, 'test:run:1', 'api', date '2026-06-01', date '2026-06-01', now());
    raise exception 'a duplicate run idempotency key was accepted';
  exception when unique_violation then null;
  end;

  -- ------------------------------------------------------------------ first insert, then rerun

  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, source_retrieval_id, ingestion_run_id,
     methodology_version_id, observation_kind, reference_month, retrieved_at, vintage_ordinal,
     source_native_unit, index_level, index_base_label, provenance_hash, raw_payload)
  values (ppi_id, ppi_src, bok_if, ret_a, run_a, mv_id, 'bok_index_level', date '2026-06-01', now(), 1,
          'index_2020_equals_100', 100.000000, '2020=100', repeat('1', 64), '{"fixture":true}'::jsonb)
  returning id into v1;

  -- The exact same evidence cannot be stored twice, whatever the vintage ordinal says.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_if, run_a, mv_id, 'bok_index_level', date '2026-06-01', now(), 2,
            'index_2020_equals_100', 100.000000, '2020=100', repeat('1', 64), '{"fixture":true}'::jsonb);
    raise exception 'an identical provenance hash was accepted as a second vintage';
  exception when unique_violation then null;
  end;

  -- ---------------------------------------------------------------------- official revision

  insert into pipeline.umpi_ingestion_runs
    (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
     retrieval_mode, requested_from_month, requested_to_month, started_at, payload_digest, rows_received)
  values (ppi_id, ppi_src, bok_if, mv_id, 'test:run:2', 'api', date '2026-06-01', date '2026-06-01',
          now(), repeat('b', 64), 1)
  returning id into run_b;

  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     index_level, index_base_label, provenance_hash, raw_payload)
  values (ppi_id, ppi_src, bok_if, run_b, mv_id, 'bok_index_level', date '2026-06-01', now(), 2,
          'index_2020_equals_100', 101.000000, '2020=100', repeat('2', 64), '{"fixture":true,"revised":true}'::jsonb)
  returning id into v2;

  update pipeline.umpi_observations
     set superseded_by_id = v2, superseded_at = now(), supersession_reason = 'official revision'
   where id = v1;

  -- The prior vintage is preserved exactly as retrieved.
  select index_level into level from pipeline.umpi_observations where id = v1;
  if level <> 100.000000 then raise exception 'the prior vintage changed to %', level; end if;

  -- And it is frozen.
  begin
    update pipeline.umpi_observations set quality_status = 'suspect' where id = v1;
    raise exception 'a superseded observation was edited';
  exception when restrict_violation then null;
  end;

  -- The current view resolves the revision, deterministically and singly.
  select count(*) into n from pipeline.umpi_current_observations
   where source_series_id = ppi_src and reference_month = date '2026-06-01';
  if n <> 1 then raise exception 'the current view returned % rows for one month', n; end if;
  select index_level into level from pipeline.umpi_current_observations
   where source_series_id = ppi_src and reference_month = date '2026-06-01';
  if level <> 101.000000 then raise exception 'the current vintage is %, expected the revision', level; end if;

  -- Run accounting: the revision run recorded one revision and no insert.
  update pipeline.umpi_ingestion_runs
     set completed_at = now(), rows_inserted = 0, rows_unchanged = 0, rows_revised = 1,
         rows_rejected = 0, error_count = 0, idempotence_state = 'changed'
   where id = run_b;

  -- A run that changed nothing cannot claim to have written something.
  begin
    update pipeline.umpi_ingestion_runs
       set idempotence_state = 'no_change', rows_inserted = 1 where id = run_a;
    raise exception 'a no_change run was allowed to report an insert';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------- customs evidence

  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     export_value_usd, export_weight_kg, provenance_hash, raw_payload)
  values (uv_id, uv_src, kcs_if, run_a, mv_id, 'kcs_trade_month', date '2026-06-01', now(), 1,
          'usd_and_kg', 1000000.00, 10000.000, repeat('3', 64), '{"fixture":true}'::jsonb);

  -- Raw USD and kg are both retained; the ratio is not stored in their place.
  select count(*) into n from pipeline.umpi_observations
   where series_id = uv_id and export_value_usd = 1000000.00 and export_weight_kg = 10000.000;
  if n <> 1 then raise exception 'the raw customs inputs were not both retained'; end if;

  -- ------------------------------------------------------- ingestion creates no product

  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'ingestion created % publication(s); that is Phase 5', n; end if;
  select count(*) into n from pipeline.umpi_index_bases;
  if n <> 0 then raise exception 'ingestion created % index base(s); that is Phase 5', n; end if;

  raise notice 'umpi ingestion: ok';
end $$;

rollback;

-- The committed database after Phase 4 migrations: identity corrected, still nothing ingested.
do $$
declare n integer; ds text;
begin
  select ss.dataset_id into ds from reference.umpi_source_series ss
    join reference.umpi_series s on s.id = ss.series_id
   where s.series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  if ds is distinct from '15101609' then raise exception 'Series B dataset is %, expected 15101609', ds; end if;

  select count(*) into n from pipeline.umpi_observations;
  if n <> 0 then raise exception 'Phase 4 migrations created % observation(s)', n; end if;
  select count(*) into n from pipeline.umpi_ingestion_runs;
  if n <> 0 then raise exception 'Phase 4 migrations created % run(s)', n; end if;
  select count(*) into n from pipeline.source_retrievals;
  if n <> 0 then raise exception 'Phase 4 migrations created % retrieval(s)', n; end if;

  -- Neither interface is promoted by a migration. Promotion follows a live run, not code.
  select count(*) into n from reference.source_interfaces
   where (slug like 'bok-%' or slug like 'kcs-%') and production_access_state = 'production_approved';
  if n <> 0 then raise exception '% UMPI source(s) were promoted by a migration', n; end if;

  raise notice 'umpi ingestion state: ok';
end $$;
