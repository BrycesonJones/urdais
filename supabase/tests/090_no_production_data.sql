-- The bootstrapped database holds Urdais-owned reference rows and nothing else:
-- no provider, no source, no entity, no region, no observation, no live value.
begin;

do $$
declare
  n integer;
  tbl text;
  -- reference.providers and reference.source_interfaces are deliberately NOT here:
  -- Phase 4A records reviewed sources with their terms classification. Knowing a
  -- source exists is not observing it, and is not constituency. Everything that
  -- would represent an observation, a market participant or an adopted region
  -- must still be empty.
  -- Launch enablement seeds stable reference data (legal entities, seller roles, canonical
  -- countries, product identifiers, evidenced region mappings). Those tables are checked in
  -- 140_provider_reference_data.sql; everything observed or permissive must still be empty.
  -- Wave-1 token-pricing seeds stable model identities and aliases (checked in
  -- 190_token_pricing_wave1.sql). Those are catalog rows, not observations.
  must_be_empty text[] := array[
    'pipeline.source_retrievals', 'pipeline.raw_offers', 'pipeline.normalized_observations',
    'pipeline.observation_evidence', 'pipeline.eligibility_assessments',
    'pipeline.eligibility_exclusions', 'pipeline.eligibility_diagnostics',
    -- Implementation readiness: the publication layer exists and holds nothing.
    'pipeline.calculation_runs', 'pipeline.seller_observations', 'pipeline.seller_observation_candidates',
    'pipeline.capacity_source_observations', 'pipeline.capacity_source_members',
    'pipeline.regional_observations', 'pipeline.regional_observation_participants',
    'pipeline.regional_publications',
    'pipeline.token_price_observations',
    -- Scheduler heartbeats are runtime operational evidence and migrations seed none.
    'pipeline.utvi_check_runs', 'pipeline.token_verification_check_runs',
    -- News articles come from ingestion. A bootstrapped database has none.
    'pipeline.news_articles'
  ];
begin
  foreach tbl in array must_be_empty loop
    execute format('select count(*) from %s', tbl) into n;
    if n <> 0 then raise exception '% holds % row(s); Phase 3 seeds no external or observed data', tbl, n; end if;
  end loop;

  -- UBWI went live in methodology 1.2.0, when its last external numerator rights
  -- dependency was removed and the gate passed on its own unchanged thresholds. Every
  -- other instrument is still pre-launch, and this assertion is narrowed to UBWI by name
  -- rather than dropped: a second instrument going live silently is exactly what it exists
  -- to catch. Note that `live` is a statement about the instrument, not about any value --
  -- the gate is still evaluated at publication time and can still refuse.
  -- UTVI went live with methodology 1.0.0 and UBWI with 1.2.0. No *compute* instrument has,
  -- which is what this file is about, so the assertion is narrowed by name rather than dropped.
  select count(*) into n from reference.instruments
   where lifecycle_status = 'live' and symbol not in ('UBWI', 'UTVI');
  if n <> 0 then raise exception 'a compute instrument is marked live'; end if;

  -- UBWI's methodology is approved for production: the document is finished and carries an
  -- effective date. That is a statement about the methodology, not about any value. The
  -- promise this file keeps is that a *bootstrapped* database holds no observed or
  -- published data: migrations seed none, and the assertions below check that directly
  -- rather than inferring it from a version status or a lifecycle flag.
  -- UCPI-LISTED-GPU 1.0.0 is approved for the same reason: the listed-price
  -- specification is finished and carries an effective date. It admits no
  -- observation and publishes no value on its own; the pipeline assertions below
  -- are what establish that a bootstrapped database holds neither.
  -- UTVI 1.0.0 is approved for the same class of reason as the two above: the methodology is
  -- finished, it carries an effective date, and its approval is what lets the index publish.
  -- Model Frontier 1.0.0 and Open-weight vs Proprietary 1.0.0 are approved on the same footing:
  -- both derive entirely at read time from rows other products collect, so approving either
  -- seeds no observation and publishes no value by itself.
  -- Note that this file is about a *bootstrapped* database holding no production data, and
  -- the pipeline assertions below are what establish that; an approved methodology on its own
  -- seeds no observation and no value.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where mv.status <> 'draft' and m.slug not in ('ubwi', 'ucpi-listed-gpu', 'utvi', 'model-frontier', 'open-weight-proprietary');
  if n <> 0 then raise exception 'a non-draft methodology version exists outside UBWI, UCPI-LISTED-GPU, UTVI, Model Frontier and Open-weight vs Proprietary'; end if;
  -- The accessible-price UCPI family is not approved by anything.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where mv.status <> 'draft' and m.slug = 'ucpi';
  if n <> 0 then raise exception 'the accessible-price UCPI family has a non-draft version'; end if;
  select count(*) into n from reference.instrument_spec_versions sv
    join reference.instruments i on i.id = sv.instrument_id
   where sv.status <> 'draft' and i.symbol not in ('UBWI', 'UTVI') and i.symbol not like 'UCPI-%-LISTED';
  if n <> 0 then raise exception 'a non-draft spec version exists outside UBWI, UTVI and the listed children'; end if;
  -- Exactly the five listed children are approved, and each at 1.0.0.
  select count(*) into n from reference.instrument_spec_versions sv
    join reference.instruments i on i.id = sv.instrument_id
   where sv.status = 'approved' and i.symbol like 'UCPI-%-LISTED' and sv.version = '1.0.0';
  if n <> 5 then raise exception 'expected five approved listed children at 1.0.0, found %', n; end if;
  -- The accessible-price child has no approved specification version.
  select count(*) into n from reference.instrument_spec_versions sv
    join reference.instruments i on i.id = sv.instrument_id
   where sv.status <> 'draft' and i.symbol = 'UCPI-H100-SXM';
  if n <> 0 then raise exception 'the accessible-price child has a non-draft spec version'; end if;

  -- UBWI specifically: live from methodology 1.2.0, and still nothing published. Those are
  -- two different facts and the second is the one this file is about. `live` says the
  -- instrument may publish when its gate passes; it does not seed a value, and the
  -- assertions below check that no calculation and no publication exist regardless.
  select count(*) into n from reference.instruments where symbol = 'UBWI' and lifecycle_status <> 'live';
  if n <> 0 then raise exception 'UBWI must be live from methodology 1.2.0'; end if;
  select count(*) into n from pipeline.ubwi_calculations;
  if n <> 0 then raise exception 'a UBWI calculation exists'; end if;
  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists'; end if;
  select count(*) into n from pipeline.wealth_vintages;
  if n <> 0 then raise exception 'a wealth vintage exists'; end if;

  -- Exactly one compute-market source is cleared for production collection: the
  -- licensed Price of Compute dataset, on written terms. No direct provider
  -- interface is. News feeds are a separate population with a separate data-use
  -- question, reviewed in 220_news_ingestion.sql; they are excluded here so this
  -- assertion keeps saying what it has always said about the compute market.
  -- UTVI's usage dataset is a third population with its own data-use question, answered by a
  -- public CC BY grant and reviewed in 290_utvi_observed_token_volume.sql. Excluded here for
  -- the same reason news feeds are, so this assertion keeps saying what it has always said
  -- about the compute market.
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved'
     and source_class not in ('news_feed', 'usage_dataset_interface', 'benchmark_dataset_interface',
                              'equity_eod_price_interface');
  if n <> 1 then raise exception 'expected exactly one production-approved compute source, found %', n; end if;
  -- No *compute-market* provider interface is cleared on both axes. The UBWI denominator
  -- and FX sources are: they were reviewed in Phases 2B and 2C and each is anchored to a
  -- retained, hashed terms artifact, which the constraint on those source classes
  -- requires. Clearing a source's terms is not publishing anything, and the assertions
  -- above already prove nothing is published.
  -- UTVI's usage dataset is a fourth reviewed population. Its clearance rests on a public
  -- licence rather than a retained bilateral artifact: OpenRouter publishes the dataset under
  -- CC BY 4.0, including commercially, which is the grant recorded against it. Reviewed in
  -- docs/architecture/sources/openrouter-datasets.md and exercised in 290.
  select count(*) into n from reference.source_interfaces
   where terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
     and slug <> 'price-of-compute-prices' and source_class <> 'news_feed'
     and source_class not in ('statistical_dataset', 'exchange_rate_series', 'usage_dataset_interface',
                              -- Epoch's benchmark bundle is cleared on both axes by its own
                              -- CC BY 4.0 grant, stated in the bundle README. Reviewed in
                              -- docs/research/model-frontier/ and exercised in 300.
                              'benchmark_dataset_interface',
                              -- TWSE's OpenAPI is cleared on both axes by the Taiwan Open
                              -- Government Data License, which the API declares in its own
                              -- service metadata and which grants derivative works for any
                              -- purpose subject to attribution. Reviewed in
                              -- docs/architecture/ugai-production-foundation.md and exercised
                              -- in 330. Nasdaq, reviewed in the same pass, is refused on both
                              -- axes and is blocked -- so this class is not a blanket pass.
                              'equity_eod_price_interface');
  if n <> 0 then raise exception '% direct source(s) cleared on both terms axes without review', n; end if;

  -- Every UBWI source that is cleared shows the artifact its state rests on.
  select count(*) into n from reference.source_interfaces
   where source_class in ('statistical_dataset', 'exchange_rate_series')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
     and (terms_artifact_hash is null or terms_artifact_status <> 200 or terms_retrieved_at is null);
  if n <> 0 then raise exception '% UBWI source(s) cleared without a retained terms artifact', n; end if;

  -- The publication layer exists (implementation readiness) and no value has been published.
  if not exists (select 1 from information_schema.tables where table_schema = 'pipeline' and table_name = 'regional_observations') then
    raise exception 'the publication layer is missing';
  end if;
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a UCPI value has been published'; end if;

  -- No retrieval of any purpose is seeded; the one permission grant is the licensed dataset's terms.
  select count(*) into n from pipeline.source_retrievals where retrieval_purpose <> 'research';
  if n <> 0 then raise exception 'a non-research retrieval exists'; end if;
  select count(*) into n from reference.permission_grants g join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class not in ('news_feed', 'usage_dataset_interface', 'benchmark_dataset_interface',
                                  'regulatory_filing_repository',
                                  'equity_eod_price_interface')
     and (si.slug <> 'price-of-compute-prices' or g.grant_kind <> 'provider_terms');
  if n <> 0 then raise exception 'a permission grant exists for a direct provider interface'; end if;
  -- No operator attribution and no tenancy evidence were seeded.
  select count(*) into n from reference.entity_roles where role = 'operator';
  if n <> 0 then raise exception 'an operator role exists'; end if;

  raise notice 'no production data: ok';
end $$;

rollback;