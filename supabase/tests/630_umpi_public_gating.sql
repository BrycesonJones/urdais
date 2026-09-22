-- UMPI Phase 6: what the database guarantees about a publicly readable value.
--
-- The public read layer's gate is a query: a UMPI value reaches an anonymous reader only when it
-- is the current publication for its month, in `published` state, under a methodology version
-- that is approved and already in force. Each of those four exclusions is proved here against a
-- real row, so that widening the query in `src/lib/umpi/read/load.ts` breaks a test rather than
-- quietly widening what the public sees.
begin;

do $$
declare
  ppi_id uuid; ppi_src uuid; bok_if uuid; run_id uuid;
  obs_jan uuid; obs_feb uuid; obs_mar uuid; obs_apr uuid; m date;
  mv_draft uuid; mv_live uuid; mv_future uuid;
  live_pub uuid; successor uuid; n integer; lvl numeric;
begin
  select id into ppi_id from reference.umpi_series where series_code = 'UMPI-KR-DRAM-PPI';
  select ss.id, ss.source_interface_id into ppi_src, bok_if
    from reference.umpi_source_series ss where ss.series_id = ppi_id;
  select mv.id into mv_live from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.version = '1.0.0';
  select mv.id into mv_draft from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.version = '0.1.0-draft';

  -- A version approved but not yet in force, to prove the effective-date half of the gate.
  mv_future := gen_random_uuid();
  insert into reference.methodology_versions
    (id, methodology_id, version, status, document_path, content_hash, effective_from)
  select mv_future, mv.methodology_id, '9.0.0-future', 'approved', mv.document_path,
         repeat('f', 64), current_date + 400
    from reference.methodology_versions mv where mv.id = mv_live;

  insert into pipeline.umpi_ingestion_runs
    (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
     retrieval_mode, requested_from_month, requested_to_month, started_at)
  values (ppi_id, ppi_src, bok_if, mv_live, 'public-gating-test', 'api',
          date '2026-01-01', date '2026-04-01', now())
  returning id into run_id;

  -- A publication is dated by its observation, so each month under test needs one.
  for m in select generate_series(date '2026-01-01', date '2026-04-01', interval '1 month')::date loop
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_if, run_id, mv_live, 'bok_index_level', m, now(), 1,
            'index_2020_equals_100', 496.840000, '2020=100',
            md5(m::text) || md5(m::text), '{}'::jsonb);
  end loop;
  select id into obs_jan from pipeline.umpi_observations where series_id = ppi_id and reference_month = date '2026-01-01';
  select id into obs_feb from pipeline.umpi_observations where series_id = ppi_id and reference_month = date '2026-02-01';
  select id into obs_mar from pipeline.umpi_observations where series_id = ppi_id and reference_month = date '2026-03-01';
  select id into obs_apr from pipeline.umpi_observations where series_id = ppi_id and reference_month = date '2026-04-01';

  -- ------------------------------------------------------------ one published, current, in-force

  live_pub := gen_random_uuid();
  insert into pipeline.umpi_publications
    (id, series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest, publication_state)
  values (live_pub, ppi_id, mv_live, obs_jan, date '2026-01-01', 496.840000, '2020=100',
          'no_prior_month', 1, now(), 'Source: Bank of Korea', '1.0.0', repeat('8', 64), 'published');

  -- ------------------------------------------------------------------- three rows that must not

  -- Derived but withheld: the row exists and is current, and publication_state alone excludes it.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest, publication_state)
  values (ppi_id, mv_live, obs_feb, date '2026-02-01', 500.000000, '2020=100', 'no_prior_month', 1,
          now(), 'Source: Bank of Korea', '1.0.0', repeat('a', 64), 'internal_only');

  -- Published, but governed by the superseded draft: an unapproved methodology never reaches air.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest, publication_state)
  values (ppi_id, mv_draft, obs_mar, date '2026-03-01', 501.000000, '2020=100', 'no_prior_month', 1,
          now(), 'Source: Bank of Korea', '0.1.0-draft', repeat('b', 64), 'published');

  -- Published under a version approved but not yet effective: approval is not the same as in force.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest, publication_state)
  values (ppi_id, mv_future, obs_apr, date '2026-04-01', 502.000000, '2020=100', 'no_prior_month', 1,
          now(), 'Source: Bank of Korea', '9.0.0-future', repeat('c', 64), 'published');

  -- The gate, exactly as the read layer issues it. Four rows exist; one is public.
  select count(*) into n from pipeline.umpi_publications p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
   where p.series_id = ppi_id and p.superseded_by_id is null and p.publication_state = 'published'
     and mv.status = 'approved' and mv.effective_from <= current_date;
  if n <> 1 then raise exception 'the public gate admitted % of 4 rows, expected 1', n; end if;
  select count(*) into n from pipeline.umpi_publications where series_id = ppi_id;
  if n <> 4 then raise exception 'expected 4 stored rows, found %', n; end if;

  -- ------------------------------------------------------------------------------- supersession

  -- A recalculation supersedes rather than edits. The predecessor stays `published` and stays
  -- stored, and disappears from the public set the moment it is superseded.
  successor := gen_random_uuid();
  update pipeline.umpi_publications
     set superseded_by_id = successor, superseded_at = now(), supersession_reason = 'recalculated'
   where id = live_pub;
  insert into pipeline.umpi_publications
    (id, series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
     attribution_text, calculation_version, inputs_digest, publication_state)
  values (successor, ppi_id, mv_live, obs_jan, date '2026-01-01', 497.000000, '2020=100',
          'no_prior_month', 1, now(), 'Source: Bank of Korea', '1.0.0', repeat('9', 64), 'published');

  select p.published_level into lvl from pipeline.umpi_publications p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
   where p.series_id = ppi_id and p.superseded_by_id is null and p.publication_state = 'published'
     and mv.status = 'approved' and mv.effective_from <= current_date;
  if lvl <> 497.000000 then raise exception 'the public read returned % rather than the successor', lvl; end if;
  select count(*) into n from pipeline.umpi_publications
   where id = live_pub and publication_state = 'published' and superseded_by_id is not null;
  if n <> 1 then raise exception 'the superseded predecessor was edited or removed'; end if;

  -- One current publication per series-month, enforced by the database and not by the writer.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at,
       attribution_text, calculation_version, inputs_digest, publication_state)
    values (ppi_id, mv_live, obs_jan, date '2026-01-01', 498.000000, '2020=100', 'no_prior_month', 1,
            now(), 'Source: Bank of Korea', '1.0.0', repeat('d', 64), 'published');
    raise exception 'a second live publication for one series-month was accepted';
  exception when unique_violation then
    null;
  end;

  raise notice 'umpi public gating: ok';
end $$;

rollback;

-- ---------------------------------------------------------------------------------------------
-- The committed database after approval: the methodology is in force, and approving it published
-- nothing and changed nothing about what Urdais is permitted to collect.

do $$
declare n integer; s text; d date;
begin
  select mv.version, mv.effective_from into s, d
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.status = 'approved';
  if s is distinct from '1.0.0' then raise exception 'the approved UMPI methodology is %, expected 1.0.0', s; end if;
  if d is distinct from date '2026-09-22' then raise exception 'the effective date is %, expected 2026-09-22', d; end if;

  -- Both series derive under the approved version, so a publication cannot cite a stale one.
  select count(*) into n from reference.umpi_series s2
    join reference.methodology_versions mv on mv.id = s2.methodology_version_id
   where mv.version <> '1.0.0';
  if n <> 0 then raise exception '% UMPI series are not on the approved methodology', n; end if;

  -- Approval is a statement about calculation, not about rights. The BOK ambiguity that the
  -- founder accepted is still recorded as ambiguous.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug = 'bok-ecos-producer-price-commodity'
     and sup.effective_to is null
     and sup.rights_classification = 'ambiguous_requires_legal_review';
  if n < 1 then raise exception 'the BOK rights ambiguity is no longer recorded'; end if;

  -- The deferred spot methodology was not swept along with it.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi' and mv.status <> 'draft';
  if n <> 0 then raise exception 'the deferred UMPI spot methodology left draft'; end if;

  -- Migrations approve; they never publish.
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'migrations created % publication(s)', n; end if;

  raise notice 'umpi public gating state: ok';
end $$;
