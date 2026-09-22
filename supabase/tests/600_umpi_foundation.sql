-- UMPI Phase 3: the foundation holds the two canonical series, refuses an incomplete source
-- identity, vintages a revision without losing the prior print, and publishes nothing.
begin;

do $$
declare
  n            integer;
  s            text;
  ppi_id       uuid;
  uv_id        uuid;
  ppi_src      uuid;
  uv_src       uuid;
  mv_id        uuid;
  bok_iface    uuid;
  kcs_iface    uuid;
  run_id       uuid;
  obs_v1       uuid;
  obs_v2       uuid;
  base_id      uuid;
  pub_id       uuid;
begin
  select id into ppi_id from reference.umpi_series where series_code = 'UMPI-KR-DRAM-PPI';
  select id into uv_id  from reference.umpi_series where series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  if ppi_id is null or uv_id is null then raise exception 'the two canonical UMPI series are not registered'; end if;

  select mv.id into mv_id from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.version = '0.1.0-draft';
  if mv_id is null then raise exception 'the UMPI methodology draft is not registered'; end if;

  select id into bok_iface from reference.source_interfaces where slug = 'bok-ecos-producer-price-commodity';
  select id into kcs_iface from reference.source_interfaces where slug = 'kcs-item-country-trade';
  select id into ppi_src from reference.umpi_source_series where series_id = ppi_id;
  select id into uv_src  from reference.umpi_source_series where series_id = uv_id;

  -- ---------------------------------------------------------------- canonical identities

  -- The price index and the unit-value index are different kinds, and the row cannot lie about it.
  select series_kind into s from reference.umpi_series where id = ppi_id;
  if s <> 'official_price_index' then raise exception 'Series A is not an official price index, found %', s; end if;
  select series_kind into s from reference.umpi_series where id = uv_id;
  if s <> 'derived_unit_value_index' then raise exception 'Series B is not a derived unit-value index, found %', s; end if;

  -- Only the derived series carries a Urdais base, and only it carries the mix warning.
  select count(*) into n from reference.umpi_series
   where (level_is_urdais_derived and base_owner <> 'urdais')
      or (mix_warning_required <> (series_kind = 'derived_unit_value_index'));
  if n <> 0 then raise exception '% series row(s) describe an incoherent product', n; end if;

  -- Both publish index points monthly with a MoM change. No USD/chip, no 1D, anywhere.
  select count(*) into n from reference.umpi_series
   where published_unit <> 'index_points' or observation_cadence <> 'monthly' or change_label <> 'MoM';
  if n <> 0 then raise exception '% series row(s) do not publish monthly index points with MoM', n; end if;

  -- ------------------------------------------------- BOK identity is the triple, not the item

  select bok_stat_code || '/' || bok_item_code || '/' || bok_cycle into s
    from reference.umpi_source_series where id = ppi_src;
  if s <> '404Y016/30911201AA/M' then raise exception 'Series A source identity is %, expected 404Y016/30911201AA/M', s; end if;

  -- An item code without its table and cycle is not an identity, and the schema says so.
  begin
    insert into reference.umpi_source_series
      (series_id, source_interface_id, identity_kind, bok_item_code, source_native_unit, effective_from_month)
    values (ppi_id, bok_iface, 'bok_ecos_series', '30911201AA', 'index_2020_equals_100', date '2026-01-01');
    raise exception 'a BOK source identity was accepted without its stat code and cycle';
  exception when check_violation then null;
  end;

  -- The deferred export price index is refused outright: 30911201AA also means DRAM there.
  begin
    insert into reference.umpi_source_series
      (series_id, source_interface_id, identity_kind, bok_stat_code, bok_item_code, bok_cycle,
       source_native_unit, effective_from_month)
    values (ppi_id, bok_iface, 'bok_ecos_series', '402Y016', '30911201AA', 'M',
            'index_2020_equals_100', date '2026-01-01');
    raise exception 'the deferred BOK export price index 402Y016 was accepted';
  exception when check_violation then null;
  end;

  -- A customs identity needs its HS code and its dataset, and may not carry BOK fields.
  -- Phase 3 bound Series B to dataset 15100475; Phase 4 established that this is the
  -- country-dimension operation and corrected the binding to the aggregate-by-item 15101609.
  -- The commodity is unchanged, which is the part the methodology names.
  select hs_code || '/' || dataset_id into s from reference.umpi_source_series where id = uv_src;
  if s <> '8542321010/15101609' then raise exception 'Series B source identity is %, expected 8542321010/15101609', s; end if;
  begin
    insert into reference.umpi_source_series
      (series_id, source_interface_id, identity_kind, hs_code, source_native_unit, effective_from_month)
    values (uv_id, kcs_iface, 'kcs_trade_commodity', '8542321010', 'usd_and_kg', date '2026-01-01');
    raise exception 'a customs source identity was accepted without its dataset';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------------- raw evidence

  insert into pipeline.umpi_ingestion_runs
    (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
     retrieval_mode, requested_from_month, requested_to_month, started_at)
  values (ppi_id, ppi_src, bok_iface, mv_id, 'test-run-1', 'api', date '2026-06-01', date '2026-08-01', now())
  returning id into run_id;

  -- A BOK observation stores the agency level and its base, and no trade fields.
  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     index_level, index_base_label, provenance_hash, raw_payload)
  values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-06-01', now(), 1,
          'index_2020_equals_100', 100.000000, '2020=100', repeat('a', 64), '{"fixture": true}'::jsonb)
  returning id into obs_v1;

  -- A BOK observation may not smuggle trade fields in, and a customs one may not carry a level.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, export_value_usd, export_weight_kg, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-07-01', now(), 1,
            'index_2020_equals_100', 101.0, '2020=100', 5.0, 5.0, repeat('b', 64), '{}'::jsonb);
    raise exception 'a BOK observation was accepted carrying customs fields';
  exception when check_violation then null;
  end;

  -- A non-positive index level is not a measurement.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-07-01', now(), 1,
            'index_2020_equals_100', 0, '2020=100', repeat('c', 64), '{}'::jsonb);
    raise exception 'a non-positive index level was accepted';
  exception when check_violation then null;
  end;

  -- Customs evidence keeps USD and kg side by side. The ratio is derived later and never replaces them.
  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     export_value_usd, export_weight_kg, provenance_hash, raw_payload)
  values (uv_id, uv_src, kcs_iface, run_id, mv_id, 'kcs_trade_month', date '2026-06-01', now(), 1,
          'usd_and_kg', 1000000.00, 2000.000, repeat('d', 64), '{"fixture": true}'::jsonb);

  select count(*) into n from pipeline.umpi_observations
   where series_id = uv_id and export_value_usd is not null and export_weight_kg is not null;
  if n <> 1 then raise exception 'customs USD and kg were not both retained'; end if;

  -- Negative trade figures are rejected rather than coerced.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       export_value_usd, export_weight_kg, provenance_hash, raw_payload)
    values (uv_id, uv_src, kcs_iface, run_id, mv_id, 'kcs_trade_month', date '2026-07-01', now(), 1,
            'usd_and_kg', -1.00, 2000.000, repeat('e', 64), '{}'::jsonb);
    raise exception 'a negative export value was accepted';
  exception when check_violation then null;
  end;

  -- A reference period that is not a month is not a reference month.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-07-15', now(), 1,
            'index_2020_equals_100', 101.0, '2020=100', repeat('f', 64), '{}'::jsonb);
    raise exception 'a mid-month reference period was accepted';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ idempotence and vintage

  -- The same month retrieved again with the same payload is the same evidence, not a second row.
  begin
    insert into pipeline.umpi_observations
      (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
       observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
       index_level, index_base_label, provenance_hash, raw_payload)
    values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-06-01', now(), 2,
            'index_2020_equals_100', 100.000000, '2020=100', repeat('a', 64), '{"fixture": true}'::jsonb);
    raise exception 'an identical payload was accepted as a second vintage';
  exception when unique_violation then null;
  end;

  -- A revised official value is a new vintage that supersedes the first. The first survives.
  insert into pipeline.umpi_observations
    (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
     observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
     index_level, index_base_label, provenance_hash, raw_payload)
  values (ppi_id, ppi_src, bok_iface, run_id, mv_id, 'bok_index_level', date '2026-06-01', now(), 2,
          'index_2020_equals_100', 105.500000, '2020=100', repeat('9', 64), '{"fixture": true, "revised": true}'::jsonb)
  returning id into obs_v2;

  update pipeline.umpi_observations
     set superseded_by_id = obs_v2, superseded_at = now(), supersession_reason = 'official revision'
   where id = obs_v1;

  select index_level into s from pipeline.umpi_observations where id = obs_v1;
  if s::numeric <> 100.000000 then raise exception 'the prior vintage was not preserved, found %', s; end if;

  -- "Latest" has exactly one definition, and the view is it.
  select count(*) into n from pipeline.umpi_current_observations
   where source_series_id = ppi_src and reference_month = date '2026-06-01';
  if n <> 1 then raise exception 'the current-vintage view returned % rows for one month', n; end if;
  select index_level into s from pipeline.umpi_current_observations
   where source_series_id = ppi_src and reference_month = date '2026-06-01';
  if s::numeric <> 105.500000 then raise exception 'the current vintage is %, expected the revision', s; end if;

  -- A superseded row is frozen, and no observation is ever deleted.
  begin
    update pipeline.umpi_observations set quality_status = 'suspect' where id = obs_v1;
    raise exception 'a superseded observation was edited';
  exception when restrict_violation then null;
  end;
  begin
    delete from pipeline.umpi_observations where id = obs_v2;
    raise exception 'an observation was deleted';
  exception when restrict_violation then null;
  end;

  -- ------------------------------------------------------------------------- publication

  insert into pipeline.umpi_index_bases
    (series_id, methodology_version_id, base_label, base_from_month, base_to_month,
     base_value_usd, base_weight_kg, base_unit_value, month_count, inputs_digest, computed_at)
  values (uv_id, mv_id, '2020 calendar-year aggregate = 100', date '2020-01-01', date '2020-12-01',
          12000000.00, 30000.000, 400.0000000000, 12, repeat('1', 64), now())
  returning id into base_id;

  -- A price-index point must not name a Urdais base, and must not carry a mix warning.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, index_base_id, reference_month,
       published_level, base_label, mom_withheld_reason, source_vintage_ordinal,
       vintage_published_at, attribution_text)
    values (ppi_id, mv_id, obs_v2, base_id, date '2026-06-01', 105.5, '2020=100',
            'no_prior_month', 2, now(), 'Source: Bank of Korea');
    raise exception 'a republished agency level was accepted with a Urdais base';
  exception when restrict_violation then null;
  end;

  -- A unit-value point must carry its mix warning. Every time.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, index_base_id, reference_month,
       published_level, base_label, mom_withheld_reason, source_vintage_ordinal,
       vintage_published_at, attribution_text)
    select uv_id, mv_id, o.id, base_id, date '2026-06-01', 110.0,
           '2020 calendar-year aggregate = 100', 'no_prior_month', 1, now(),
           'Source: Korea Customs Service, HSK 8542321010'
      from pipeline.umpi_observations o where o.series_id = uv_id;
    raise exception 'a unit-value point was published without its mix warning';
  exception when restrict_violation then null;
  end;

  -- A valid price-index point: no base, no mix warning, and a withheld change with its reason.
  insert into pipeline.umpi_publications
    (series_id, methodology_version_id, observation_id, reference_month, published_level,
     base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at, attribution_text)
  values (ppi_id, mv_id, obs_v2, date '2026-06-01', 105.5, '2020=100', 'no_prior_month', 2, now(),
          'Source: Bank of Korea')
  returning id into pub_id;

  -- A change is a number or a stated refusal. Never both, never neither, never a filler zero.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_change, mom_withheld_reason, source_vintage_ordinal, vintage_published_at, attribution_text)
    values (ppi_id, mv_id, obs_v2, date '2026-06-01', 106.0, '2020=100', 0.01, 'no_prior_month', 3, now(),
            'Source: Bank of Korea');
    raise exception 'a publication carried both a change and a withholding reason';
  exception when check_violation then null;
  end;

  -- A publication may not cite an observation from another month.
  begin
    insert into pipeline.umpi_publications
      (series_id, methodology_version_id, observation_id, reference_month, published_level,
       base_label, mom_withheld_reason, source_vintage_ordinal, vintage_published_at, attribution_text)
    values (ppi_id, mv_id, obs_v2, date '2026-07-01', 106.0, '2020=100', 'no_prior_month', 3, now(),
            'Source: Bank of Korea');
    raise exception 'a publication cited an observation from a different month';
  exception when restrict_violation then null;
  end;

  -- Attribution travels with the published point; it is not optional and not blank.
  select attribution_text into s from pipeline.umpi_publications where id = pub_id;
  if s is null or btrim(s) = '' then raise exception 'a published point carries no attribution'; end if;

  raise notice 'umpi foundation: ok';
end $$;

rollback;

-- ------------------------------------------------------- state of the committed database
--
-- Outside the transaction above: the foundation as migrations left it. Phase 3 registers
-- identity and rights and stops.

do $$
declare n integer; s text;
begin
  -- The draft is a draft, with no effective date. Nothing is publishable under it.
  select mv.status into s from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram';
  if s <> 'draft' then raise exception 'the UMPI methodology is registered as %, expected draft', s; end if;
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.effective_from is not null;
  if n <> 0 then raise exception 'the UMPI draft carries an effective date'; end if;

  -- No series is live, and nothing has been ingested or published.
  select count(*) into n from reference.umpi_series where publication_state <> 'not_initialized';
  if n <> 0 then raise exception '% UMPI series are initialized; Phase 3 starts none', n; end if;
  select count(*) into n from pipeline.umpi_observations;
  if n <> 0 then raise exception 'the foundation holds % observation(s)', n; end if;
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'the foundation holds % publication(s)', n; end if;
  select count(*) into n from pipeline.umpi_index_bases;
  if n <> 0 then raise exception 'the foundation holds % index base(s); the production base must be derived from official observations', n; end if;

  -- Phase 3 asserted that no UMPI source was production-approved, because none had been
  -- collected from. Phase 4A promoted both after a live smoke and an exact rerun, so the
  -- assertion now checks the thing that still matters: approval requires permitted terms on
  -- both axes, which the schema enforces and which no migration may route around.
  select count(*) into n from reference.source_interfaces
   where (slug like 'bok-%' or slug like 'kcs-%')
     and production_access_state = 'production_approved'
     and (terms_review_state <> 'permitted' or data_use_terms_state <> 'permitted');
  if n <> 0 then raise exception '% UMPI source(s) are approved without permitted terms', n; end if;

  -- No UMPI series draws on a proprietary memory-price vendor. TrendForce exists in the registry
  -- as a *news* provider from earlier work, which is a different thing entirely and is left
  -- alone; what matters is that no UMPI source identity points at it or at any peer.
  select count(*) into n from reference.umpi_source_series ss
    join reference.source_interfaces si on si.id = ss.source_interface_id
    join reference.providers p on p.id = si.provider_id
   where p.slug in ('trendforce', 'dramexchange', 'china-flash-market', 'cfm', 'motie', 'wsts', 'silicon-data');
  if n <> 0 then raise exception '% UMPI source identit(ies) draw on a proprietary vendor', n; end if;

  -- Positively: every UMPI source is an official statistical or customs interface.
  select count(*) into n from reference.umpi_source_series ss
    join reference.source_interfaces si on si.id = ss.source_interface_id
   where si.source_class not in ('official_statistical_series', 'official_trade_statistics');
  if n <> 0 then raise exception '% UMPI source identit(ies) are not official-data interfaces', n; end if;

  -- And no TrendForce interface was quietly repurposed into a price surface.
  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
   where p.slug = 'trendforce' and si.source_class <> 'news_feed';
  if n <> 0 then raise exception '% TrendForce interface(s) are no longer news feeds', n; end if;

  -- Both UMPI series bind to a source identity, and neither binds to the deferred export index.
  select count(*) into n from reference.umpi_series se
    left join reference.umpi_source_series ss on ss.series_id = se.id
   where ss.id is null;
  if n <> 0 then raise exception '% UMPI series have no source identity', n; end if;
  select count(*) into n from reference.umpi_source_series where bok_stat_code = '402Y016';
  if n <> 0 then raise exception 'the deferred export price index is registered'; end if;

  -- Rights are recorded per purpose, with attribution, in the shared model.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug in ('bok-ecos-producer-price-commodity', 'kcs-item-country-trade')
     and sup.disposition = 'permitted' and sup.attribution_required;
  if n < 8 then raise exception 'expected the reviewed UMPI rights positions with attribution, found %', n; end if;

  -- No credential is stored anywhere in the registry rows.
  select count(*) into n from reference.source_interfaces
   where (slug like 'bok-%' or slug like 'kcs-%')
     and (metadata::text ~* '(secret|password|serviceKey=|api_key"\s*:\s*"[A-Za-z0-9]{8})');
  if n <> 0 then raise exception '% UMPI source row(s) look like they contain a credential', n; end if;

  raise notice 'umpi foundation state: ok';
end $$;
