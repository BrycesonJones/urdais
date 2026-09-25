-- UEPI-1: the specification registration, the seven benchmarks, and the three-layer path.
--
-- What is worth testing here is not that rows exist. It is that the guarantees the specification
-- rests on are enforced by the database rather than by the good behaviour of a future caller: that
-- a negative price is storable, that a partial day is not releasable, that raw evidence cannot be
-- rewritten, that a released value cannot claim an unapproved specification or a digest other than
-- the one that was approved, and that a series with no verified source payload cannot have a value
-- at all.
begin;

do $$
declare
  n integer;
  method uuid;
  version_id uuid;
  digest text;
  benchmark uuid;
  spp uuid;
  isone uuid;
  retrieval uuid;
  raw_id uuid;
  obs_id uuid;
  second_obs uuid;
  value_id uuid;
  source_iface uuid;
begin
  -- ------------------------------------------------------------ the frozen specification
  select id into method from reference.methodologies where slug = 'uepi';
  if method is null then raise exception 'the uepi specification is not registered'; end if;

  select id, content_hash into version_id, digest
    from reference.methodology_versions
   where methodology_id = method and methodology_versions.version = '1.0.0';
  if version_id is null then raise exception 'uepi 1.0.0 is not registered'; end if;
  if digest !~ '^[0-9a-f]{64}$' or digest = repeat('0', 64) then
    raise exception 'uepi 1.0.0 has no real document digest: %', digest;
  end if;

  select count(*) into n from reference.methodology_versions
   where methodology_id = method and status = 'approved';
  if n <> 1 then raise exception 'uepi should have exactly one approved version, found %', n; end if;

  -- ------------------------------------------------------------ the seven benchmarks
  select count(*) into n from reference.power_price_benchmarks;
  if n <> 7 then raise exception 'expected seven UEPI benchmarks, found %', n; end if;

  -- The construct split is the substance of the specification: three markets publish a delivered
  -- price, four publish only the system energy component. Collapsing them would be the error.
  select count(*) into n from reference.power_price_benchmarks where price_construct = 'delivered_price';
  if n <> 3 then raise exception 'expected three delivered-price benchmarks, found %', n; end if;
  select count(*) into n from reference.power_price_benchmarks where price_construct = 'system_energy_component';
  if n <> 4 then raise exception 'expected four system-energy benchmarks, found %', n; end if;

  -- MISO is the one market whose day never changes length, and its zone is what says so.
  select count(*) into n from reference.power_price_benchmarks
   where slug = 'uepi-miso' and operating_timezone = 'Etc/GMT+5' and observes_dst = false;
  if n <> 1 then raise exception 'MISO must be a fixed Eastern Standard offset that does not observe DST'; end if;

  -- Three publishable and four internal-only. ISO-NE joined the internal set when its payload was
  -- first observed (20261022100000): that migration recorded evidence, not a right, and the series
  -- is still refused by the publication gate.
  select count(*) into n from reference.power_price_benchmarks where publication_posture = 'publishable';
  if n <> 3 then raise exception 'expected three publishable series, found %', n; end if;
  select count(*) into n from reference.power_price_benchmarks where publication_posture = 'internal_only';
  if n <> 4 then raise exception 'expected four internal-only series, found %', n; end if;
  select count(*) into n from reference.power_price_benchmarks where publication_posture = 'not_built';
  if n <> 0 then raise exception 'expected no not-built series, found %', n; end if;

  -- The three markets whose terms forbid a derived publication, plus ISO-NE whose legal review has
  -- not run, must all be internal. A market may not become publishable by being readable.
  select count(*) into n from reference.power_price_benchmarks
   where slug in ('uepi-pjm', 'uepi-miso', 'uepi-spp', 'uepi-iso-ne') and publication_posture <> 'internal_only';
  if n <> 0 then raise exception '% market(s) that must stay internal are not', n; end if;

  -- ------------------------------------------------------------ rights determinations
  -- Every source has both a retention and a public-display determination, and the three sources
  -- whose terms forbid a derived publication are recorded as prohibited rather than merely absent.
  select count(*) into n from reference.source_use_permissions
   where purpose_code = 'public_derived_uepi_value_display';
  if n <> 7 then raise exception 'expected a display determination for all seven sources, found %', n; end if;

  select count(*) into n from reference.source_use_permissions
   where purpose_code = 'public_derived_uepi_value_display'
     and rights_classification = 'unsuitable_without_permission' and disposition = 'prohibited';
  if n <> 3 then raise exception 'expected PJM, MISO and SPP to be prohibited from display, found %', n; end if;

  -- An ambiguous determination without its open question is a shrug, and the table already
  -- refuses one; this asserts the three ambiguous display rows actually carry theirs.
  select count(*) into n from reference.source_use_permissions
   where purpose_code = 'public_derived_uepi_value_display'
     and rights_classification = 'ambiguous_requires_legal_review'
     and btrim(coalesce(unresolved_issue, '')) <> '';
  if n <> 3 then raise exception 'expected three ambiguous display determinations with an open question, found %', n; end if;

  -- ------------------------------------------------------------ nothing is seeded
  -- UEPI-1 builds the path and ingests nothing. A bootstrapped database holds no price, no
  -- observation and no released value, and the rows written below exist only inside this
  -- transaction, which rolls back.
  select count(*) into n from pipeline.raw_uepi_price_records;
  if n <> 0 then raise exception 'the migration seeded % raw price record(s)', n; end if;
  select count(*) into n from pipeline.uepi_price_observations;
  if n <> 0 then raise exception 'the migration seeded % price observation(s)', n; end if;
  select count(*) into n from pipeline.uepi_daily_values;
  if n <> 0 then raise exception 'the migration seeded % released value(s)', n; end if;
  select count(*) into n from pipeline.uepi_ingestion_runs;
  if n <> 0 then raise exception 'the migration seeded % ingestion run(s)', n; end if;

  -- ------------------------------------------------------------ a stored day, end to end
  select id into benchmark from reference.power_price_benchmarks where slug = 'uepi-nyiso';
  select source_interface_id into source_iface from reference.power_price_benchmarks where id = benchmark;

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
     request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
  values (source_iface, 'uepi-test-retrieval-1', now(), now(), 'GET',
          'http://mis.nyiso.com/public/csv/damlbmp/20260923damlbmp_zone.csv', 200,
          repeat('f', 64), 'complete', 'research')
  returning id into retrieval;

  insert into pipeline.raw_uepi_price_records
    (retrieval_id, benchmark_id, row_ordinal, record_hash, native_operating_date,
     native_interval_label, native_value, native_components, raw_payload)
  values (retrieval, benchmark, 0, repeat('a', 64), '09/23/2026', '09/23/2026 00:00', '29.19',
          jsonb_build_object('LBMP', '29.19', 'losses', '0.00', 'congestion', '0.00'),
          jsonb_build_object('row', 'WEST'))
  returning id into raw_id;

  -- A negative price must store. This is the case PD-2's non-negative constraint could not hold,
  -- and it is not hypothetical: SPP hourly MEC reached -15.26 on 12 April 2026.
  insert into pipeline.uepi_price_observations
    (raw_uepi_price_record_id, benchmark_id, operating_date, interval_start, interval_end,
     hour_ordinal, price_usd_per_mwh, price_construct, value_derivation, derivation_expression,
     retrieved_at, quality_status)
  values (raw_id, benchmark, date '2026-09-23', timestamptz '2026-09-23T04:00:00Z',
          timestamptz '2026-09-23T05:00:00Z', 1, -15.26, 'system_energy_component',
          'derived_residual', 'LBMP - Marginal Cost Losses + Marginal Cost Congestion',
          now(), 'accepted')
  returning id into obs_id;

  -- Raw evidence is never rewritten.
  begin
    update pipeline.raw_uepi_price_records set native_value = '99.99' where id = raw_id;
    raise exception 'a raw record was updated; it must be append-only';
  exception when restrict_violation then null;
  end;

  -- An observation carries the benchmark's own construct, not an adapter's opinion of the moment.
  begin
    insert into pipeline.uepi_price_observations
      (raw_uepi_price_record_id, benchmark_id, operating_date, interval_start, interval_end,
       hour_ordinal, price_usd_per_mwh, price_construct, value_derivation, derivation_expression,
       retrieved_at, quality_status)
    values (raw_id, benchmark, date '2026-09-23', timestamptz '2026-09-23T05:00:00Z',
            timestamptz '2026-09-23T06:00:00Z', 2, 30.0, 'delivered_price',
            'derived_residual', 'LBMP - Marginal Cost Losses + Marginal Cost Congestion',
            now(), 'accepted');
    raise exception 'an observation was stored with the wrong construct';
  exception when check_violation then null;
  end;

  -- A revision supersedes; it does not overwrite. Both rows survive and only one is current.
  insert into pipeline.raw_uepi_price_records
    (retrieval_id, benchmark_id, row_ordinal, record_hash, native_operating_date,
     native_interval_label, native_value, raw_payload)
  values (retrieval, benchmark, 1, repeat('b', 64), '09/23/2026', '09/23/2026 00:00', '-15.00',
          jsonb_build_object('row', 'WEST revised'))
  returning id into raw_id;

  -- The order is forced by the schema, and the force is the point: the partial unique index will
  -- not hold two current rows for one instant, so the old row must be marked superseded *before*
  -- its replacement exists. The self-reference is deferrable precisely so that is possible.
  second_obs := gen_random_uuid();
  update pipeline.uepi_price_observations
     set superseded_by_id = second_obs, superseded_at = now(), supersession_reason = 'source_revision'
   where id = obs_id;

  insert into pipeline.uepi_price_observations
    (id, raw_uepi_price_record_id, benchmark_id, operating_date, interval_start, interval_end,
     hour_ordinal, price_usd_per_mwh, price_construct, value_derivation, derivation_expression,
     retrieved_at, quality_status)
  values (second_obs, raw_id, benchmark, date '2026-09-23', timestamptz '2026-09-23T04:00:00Z',
          timestamptz '2026-09-23T05:00:00Z', 1, -15.00, 'system_energy_component',
          'derived_residual', 'LBMP - Marginal Cost Losses + Marginal Cost Congestion',
          now(), 'accepted');

  select count(*) into n from pipeline.uepi_price_observations
   where benchmark_id = benchmark and interval_start = timestamptz '2026-09-23T04:00:00Z';
  if n <> 2 then raise exception 'a revision must keep both rows, found %', n; end if;
  select count(*) into n from pipeline.uepi_price_observations
   where benchmark_id = benchmark and interval_start = timestamptz '2026-09-23T04:00:00Z'
     and superseded_by_id is null;
  if n <> 1 then raise exception 'exactly one row per instant may be current, found %', n; end if;

  -- ------------------------------------------------------------ release guarantees
  -- A partial day cannot be stored at all. There is no threshold below 100%.
  begin
    insert into pipeline.uepi_daily_values
      (benchmark_id, operating_date, value_usd_per_mwh, observation_count, expected_observation_count,
       hour_span_start, hour_span_end, input_digest, price_construct, methodology_version_id,
       specification_digest, released_at, release_kind)
    values (benchmark, date '2026-09-23', 29.19, 23, 24,
            timestamptz '2026-09-23T04:00:00Z', timestamptz '2026-09-24T04:00:00Z',
            repeat('c', 64), 'system_energy_component', version_id, digest, now(), 'scheduled');
    raise exception 'a partial day was released';
  exception when check_violation then null;
  end;

  -- A released value may not claim a digest other than the one its version was approved with.
  begin
    insert into pipeline.uepi_daily_values
      (benchmark_id, operating_date, value_usd_per_mwh, observation_count, expected_observation_count,
       hour_span_start, hour_span_end, input_digest, price_construct, methodology_version_id,
       specification_digest, released_at, release_kind)
    values (benchmark, date '2026-09-23', 29.19, 24, 24,
            timestamptz '2026-09-23T04:00:00Z', timestamptz '2026-09-24T04:00:00Z',
            repeat('c', 64), 'system_energy_component', version_id, repeat('d', 64), now(), 'scheduled');
    raise exception 'a value claiming the wrong specification digest was released';
  exception when check_violation then null;
  end;

  -- ISO-NE may now hold a value, because its payload has been observed. It still may not be
  -- displayed, which is a different gate and lives in the read path.
  select id into isone from reference.power_price_benchmarks where slug = 'uepi-iso-ne';
  insert into pipeline.uepi_daily_values
    (benchmark_id, operating_date, value_usd_per_mwh, observation_count, expected_observation_count,
     hour_span_start, hour_span_end, input_digest, price_construct, methodology_version_id,
     specification_digest, released_at, release_kind)
  values (isone, date '2026-09-23', 33.567500, 24, 24,
          timestamptz '2026-09-23T04:00:00Z', timestamptz '2026-09-24T04:00:00Z',
          repeat('c', 64), 'delivered_price', version_id, digest, now(), 'scheduled');

  -- The not-built refusal itself must keep working, so it is exercised against a benchmark put
  -- into that state rather than against whichever market happens to be there.
  update reference.power_price_benchmarks set publication_posture = 'not_built',
         hour_convention = 'unresolved' where id = isone;
  begin
    insert into pipeline.uepi_daily_values
      (benchmark_id, operating_date, value_usd_per_mwh, observation_count, expected_observation_count,
       hour_span_start, hour_span_end, input_digest, price_construct, methodology_version_id,
       specification_digest, released_at, release_kind)
    values (isone, date '2026-09-24', 40.0, 24, 24,
            timestamptz '2026-09-24T04:00:00Z', timestamptz '2026-09-25T04:00:00Z',
            repeat('d', 64), 'delivered_price', version_id, digest, now(), 'scheduled');
    raise exception 'a not-built series released a value';
  exception when check_violation then null;
  end;

  -- A negative daily value is releasable, because it is a real wholesale price.
  select id into spp from reference.power_price_benchmarks where slug = 'uepi-spp';
  insert into pipeline.uepi_daily_values
    (benchmark_id, operating_date, value_usd_per_mwh, observation_count, expected_observation_count,
     hour_span_start, hour_span_end, input_digest, price_construct, methodology_version_id,
     specification_digest, released_at, release_kind)
  values (spp, date '2026-04-12', -0.108300, 24, 24,
          timestamptz '2026-04-12T05:00:00Z', timestamptz '2026-04-13T05:00:00Z',
          repeat('e', 64), 'system_energy_component', version_id, digest, now(), 'scheduled')
  returning id into value_id;

  -- And a released value is never edited: a correction is a new row pointing at the old one.
  begin
    update pipeline.uepi_daily_values set value_usd_per_mwh = 1.0 where id = value_id;
    raise exception 'a released value was edited in place';
  exception when restrict_violation then null;
  end;
end;
$$;

rollback;
