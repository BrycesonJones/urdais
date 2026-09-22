-- UMPI Phase 5: what the database guarantees about derived values.
--
-- The TypeScript tests prove the arithmetic and the withholding rules. This proves the
-- structural guarantees underneath them: one live publication per month, a base that is
-- auditable to its input rows, a withheld change that names no comparison, and the fact that
-- derivation creates no public exposure.
begin;

do $$
declare
  ppi_id   uuid; uv_id uuid; ppi_src uuid; uv_src uuid; mv_id uuid;
  bok_if   uuid; kcs_if uuid; run_id uuid;
  obs_a    uuid; obs_b uuid; base_id uuid; pub_a uuid; pub_b uuid;
  n        integer;
begin
  select id into ppi_id from reference.umpi_series where series_code = 'UMPI-KR-DRAM-PPI';
  select id into uv_id  from reference.umpi_series where series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  select mv.id into mv_id from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id where m.slug = 'umpi-kr-dram';
  select ss.id, ss.source_interface_id into ppi_src, bok_if from reference.umpi_source_series ss where ss.series_id = ppi_id;
  select ss.id, ss.source_interface_id into uv_src, kcs_if from reference.umpi_source_series ss where ss.series_id = uv_id;

  insert into pipeline.umpi_ingestion_runs
    (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
     retrieval_mode, requested_from_month, requested_to_month, started_at)
  values (ppi_id, ppi_src, bok_if, mv_id, 'derive:test:1', 'api', date '2026-06-01', date '2026-06-01', now())
  returning id into run_id;

  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     index_level, index_base_label, provenance_hash, raw_payload)
  values (ppi_id, ppi_src, bok_if, run_id, mv_id, 'bok_index_level', date '2026-06-01', now(), 1,
          'index_2020_equals_100', 496.840000, '2020=100', repeat('1', 64), '{}'::jsonb)
  returning id into obs_a;

  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     export_value_usd, export_weight_kg, provenance_hash, raw_payload)
  values (uv_id, uv_src, kcs_if, run_id, mv_id, 'kcs_trade_month', date '2026-06-01', now(), 1,
          'usd_and_kg', 1000000.00, 10000.000, repeat('2', 64), '{}'::jsonb)
  returning id into obs_b;

  -- --------------------------------------------------------------- base input provenance

  insert into pipeline.umpi_index_bases
    (series_id, methodology_version_id, base_label, base_from_month, base_to_month,
     base_value_usd, base_weight_kg, base_unit_value, month_count, inputs_digest, computed_at)
  values (uv_id, mv_id, '2020 calendar-year aggregate = 100', date '2020-01-01', date '2020-12-01',
          12000000.00, 120000.000, 100.0000000000, 12, repeat('3', 64), now())
  returning id into base_id;

  insert into pipeline.umpi_index_base_inputs
    (index_base_id, observation_id, reference_month, export_value_usd, export_weight_kg)
  values (base_id, obs_b, date '2020-01-01', 1000000.00, 10000.000);

  -- A base names each month once. A second row for the same month would double-count it.
  begin
    insert into pipeline.umpi_index_base_inputs
      (index_base_id, observation_id, reference_month, export_value_usd, export_weight_kg)
    values (base_id, obs_a, date '2020-01-01', 1.00, 1.000);
    raise exception 'a base accepted two inputs for one month';
  exception when unique_violation then null;
  end;

  -- A base input with no weight has no unit value and may not contribute.
  begin
    insert into pipeline.umpi_index_base_inputs
      (index_base_id, observation_id, reference_month, export_value_usd, export_weight_kg)
    values (base_id, obs_a, date '2020-02-01', 1.00, 0);
    raise exception 'a base accepted an input with no weight';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------- publication records

  -- A computed change must name the month it was measured against. Run before any live row
  -- exists for the month, so the constraint under test is the one that fires.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_change, source_vintage_ordinal, vintage_published_at,
       attribution_text, calculation_version, inputs_digest)
    values (ppi_id, mv_id, obs_a, date '2026-06-01', 500.0, '2020=100', 0.01, 1, now(),
            'Source: Bank of Korea', '1.0.0', repeat('b', 64));
    raise exception 'a computed change was accepted without a comparison observation';
  exception when check_violation then null;
  end;

  -- Series A: agency level, no base, no mix warning, change withheld with its reason and no
  -- comparison month recorded.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest)
  values (ppi_id, mv_id, obs_a, date '2026-06-01', 496.840000, '2020=100', 'no_prior_month', 1, now(),
          'Source: Bank of Korea', '1.0.0', repeat('a', 64))
  returning id into pub_a;

  -- Series B: derived level, names its base, carries its mix warning.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, index_base_id, reference_month,
     published_level, base_label, mom_withheld_reason, unit_value_usd_per_kg,
     source_vintage_ordinal, vintage_published_at, attribution_text, mix_warning,
     calculation_version, inputs_digest)
  values (uv_id, mv_id, obs_b, base_id, date '2026-06-01', 100.000000,
          '2020 calendar-year aggregate = 100', 'no_prior_month', 100.0000000000, 1, now(),
          'Source: Korea Customs Service, HSK 8542321010',
          'UMPI-KR DRAM Export UV is a trade unit-value index, not a pure price index.',
          '1.0.0', repeat('c', 64))
  returning id into pub_b;

  -- ------------------------------------------------------- one live publication per month

  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
       attribution_text, calculation_version, inputs_digest)
    values (ppi_id, mv_id, obs_a, date '2026-06-01', 999.0, '2020=100', 'no_prior_month', 1, now(),
            'Source: Bank of Korea', '1.0.0', repeat('d', 64));
    raise exception 'two live publications were accepted for one series-month';
  exception when unique_violation then null;
  end;

  -- The identical calculation cannot be stored twice, whatever else differs.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
       attribution_text, calculation_version, inputs_digest, superseded_by_id, superseded_at,
       supersession_reason)
    values (ppi_id, mv_id, obs_a, date '2026-06-01', 496.840000, '2020=100', 'no_prior_month', 1, now(),
            'Source: Bank of Korea', '1.0.0', repeat('a', 64), pub_a, now(), 'duplicate attempt');
    raise exception 'a duplicate inputs digest was accepted for one series-month';
  exception when unique_violation then null;
  end;

  -- A recalculation supersedes and the predecessor is frozen.
  update pipeline.umpi_publications
     set superseded_by_id = pub_b, superseded_at = now(), supersession_reason = 'recalculated'
   where id = pub_a;

  begin
    update pipeline.umpi_publications set published_level = 1 where id = pub_a;
    raise exception 'a superseded publication was edited';
  exception when restrict_violation then null;
  end;
  begin
    delete from pipeline.umpi_publications where id = pub_b;
    raise exception 'a publication was deleted';
  exception when restrict_violation then null;
  end;

  -- Superseding freed the month, so the recalculated row may now be written.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest)
  values (ppi_id, mv_id, obs_a, date '2026-06-01', 497.000000, '2020=100', 'no_prior_month', 1, now(),
          'Source: Bank of Korea', '1.0.0', repeat('e', 64));

  select count(*) into n from pipeline.umpi_publications
   where series_id = ppi_id and reference_month = date '2026-06-01' and superseded_by_id is null;
  if n <> 1 then raise exception 'expected one live publication after recalculation, found %', n; end if;

  -- Derivation writes internal records only. Nothing is publicly exposed by this phase.
  select count(*) into n from pipeline.umpi_publications where publication_state <> 'internal_only';
  if n <> 0 then raise exception '% publication(s) left internal_only in a derivation-only phase', n; end if;

  raise notice 'umpi derivation: ok';
end $$;

rollback;

-- The committed database: structures exist, nothing derived, methodology still a draft.
do $$
declare n integer; s text;
begin
  select count(*) into n from pipeline.umpi_index_bases;
  if n <> 0 then raise exception 'migrations created % index base(s)', n; end if;
  select count(*) into n from pipeline.umpi_index_base_inputs;
  if n <> 0 then raise exception 'migrations created % base input(s)', n; end if;
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'migrations created % publication(s)', n; end if;

  -- Phase 5 wrote internal records under a draft, and the draft's status was the gate. Phase 6
  -- approved 1.0.0, so the gate moved onto the row: derivation decides publication_state, and a
  -- row it marks internal_only stays invisible no matter what the methodology says. Derivation
  -- must never approve a methodology itself.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.status = 'approved' and mv.version = '1.0.0';
  if n <> 1 then raise exception 'the approved UMPI methodology 1.0.0 is missing'; end if;
  select count(*) into n from pipeline.umpi_publications where publication_state not in ('internal_only', 'published');
  if n <> 0 then raise exception '% publication(s) carry an unknown publication_state', n; end if;

  raise notice 'umpi derivation state: ok';
end $$;
