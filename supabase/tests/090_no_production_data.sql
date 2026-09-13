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
    'pipeline.eligibility_exclusions', 'pipeline.eligibility_diagnostics'
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

  -- No publication-layer tables exist yet; that is Phase 6.
  if exists (select 1 from information_schema.tables where table_schema in ('reference', 'pipeline')
             and table_name ~ '(calculation|participant|publication|series|ucpi_observation)') then
    raise exception 'a publication-layer table exists ahead of Phase 6';
  end if;

  raise notice 'no production data: ok';
end $$;

rollback;
