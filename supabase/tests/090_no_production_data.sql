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
  must_be_empty text[] := array[
    'reference.market_entities',
    'reference.entity_roles', 'reference.canonical_regions', 'reference.region_mappings',
    'reference.native_identifiers',
    'pipeline.source_retrievals', 'pipeline.raw_offers', 'pipeline.normalized_observations',
    'pipeline.observation_evidence', 'pipeline.eligibility_assessments',
    'pipeline.eligibility_exclusions', 'pipeline.eligibility_diagnostics',
    -- Implementation readiness: the publication layer exists and holds nothing.
    'reference.permission_grants',
    'pipeline.calculation_runs', 'pipeline.seller_observations', 'pipeline.seller_observation_candidates',
    'pipeline.capacity_source_observations', 'pipeline.capacity_source_members',
    'pipeline.regional_observations', 'pipeline.regional_observation_participants',
    'pipeline.regional_publications'
  ];
begin
  foreach tbl in array must_be_empty loop
    execute format('select count(*) from %s', tbl) into n;
    if n <> 0 then raise exception '% holds % row(s); Phase 3 seeds no external or observed data', tbl, n; end if;
  end loop;

  select count(*) into n from reference.instruments where lifecycle_status = 'live';
  if n <> 0 then raise exception 'an instrument is marked live'; end if;

  select count(*) into n from reference.methodology_versions where status <> 'draft';
  if n <> 0 then raise exception 'a non-draft methodology version exists'; end if;
  select count(*) into n from reference.instrument_spec_versions where status <> 'draft';
  if n <> 0 then raise exception 'a non-draft spec version exists'; end if;

  -- No source is cleared for production collection, on either terms axis.
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source is production-approved'; end if;
  select count(*) into n from reference.source_interfaces
   where terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  if n <> 0 then raise exception '% source(s) already cleared on both terms axes without review', n; end if;

  -- The publication layer exists (implementation readiness) and no value has been published.
  if not exists (select 1 from information_schema.tables where table_schema = 'pipeline' and table_name = 'regional_observations') then
    raise exception 'the publication layer is missing';
  end if;
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a UCPI value has been published'; end if;

  -- No production retrieval and no permission grant exist.
  select count(*) into n from pipeline.source_retrievals where retrieval_purpose = 'production';
  if n <> 0 then raise exception 'a production retrieval exists'; end if;

  raise notice 'no production data: ok';
end $$;

rollback;
