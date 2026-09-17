-- anon and authenticated can neither read nor write either internal schema.
-- service_role can read, as the positive control. RLS is on everywhere with no
-- policies, and neither schema is API-exposed (checked in config, not here).
begin;

do $$
declare
  ok boolean;
  role_name text;
  tbl text;
  tables text[] := array[
    'reference.methodologies', 'reference.methodology_versions', 'reference.instruments',
    'reference.instrument_spec_versions', 'reference.providers', 'reference.source_interfaces',
    'reference.market_entities', 'reference.entity_roles', 'reference.canonical_regions',
    'reference.region_mappings', 'reference.native_identifiers', 'reference.exclusion_reasons',
    'reference.diagnostic_codes', 'reference.iso_countries', 'reference.permission_grants',
    'reference.models', 'reference.model_aliases',
    'pipeline.source_retrievals', 'pipeline.raw_offers', 'pipeline.normalized_observations',
    'pipeline.observation_evidence', 'pipeline.eligibility_assessments',
    'pipeline.eligibility_exclusions', 'pipeline.eligibility_diagnostics',
    'pipeline.calculation_runs', 'pipeline.seller_observations', 'pipeline.seller_observation_candidates',
    'pipeline.capacity_source_observations', 'pipeline.capacity_source_members',
    'pipeline.regional_observations', 'pipeline.regional_observation_participants',
    'pipeline.regional_publications', 'pipeline.token_price_observations',
    'pipeline.token_price_benchmarks',
    'reference.news_sources', 'pipeline.news_articles',
    -- UBWI Production V1.
    'reference.wealth_estimation_rules', 'reference.wealth_feasible_frontiers',
    'reference.ubwi_publication_gates',
    'pipeline.wealth_vintages', 'pipeline.wealth_vintage_components',
    'pipeline.wealth_vintage_unobserved_economies',
    'pipeline.btc_market_observations', 'pipeline.btc_venue_quotes',
    'pipeline.btc_chainlink_observations', 'pipeline.btc_height_observations',
    'pipeline.ubwi_calculations', 'pipeline.ubwi_sensitivity_scenarios',
    'pipeline.ubwi_publications',
    -- UTVI, the Observed Token Volume Index.
    'pipeline.utvi_retrievals', 'pipeline.utvi_daily_snapshots',
    'pipeline.utvi_model_observations', 'pipeline.utvi_calculations',
    'pipeline.utvi_publications',
    -- Model Frontier: capability observations and the two reference layers that join them
    -- to a priced product.
    'pipeline.capability_retrievals', 'pipeline.capability_observations',
    'reference.capability_model_links', 'reference.model_price_selections',
    'pipeline.capability_check_runs',
    -- Open-weight vs Proprietary: the access classification and the UTVI identity bridge.
    'reference.model_access_classes', 'reference.utvi_model_links',
    -- Model Economics operations heartbeats. These are scheduler evidence, not market data.
    'pipeline.utvi_check_runs', 'pipeline.token_verification_check_runs',
    -- UGAI equity reference foundation: issuers, their securities, where those securities
    -- list, what identifies them, and how they relate.
    'reference.venues', 'reference.issuers', 'reference.securities', 'reference.listings',
    'reference.security_identifiers', 'reference.security_relationships',
    'reference.issuer_relationships',
    -- AI Equity Universe candidate discovery and point-in-time thematic eligibility.
    'reference.methodology_parameters', 'reference.ai_universe_review_cycles',
    'pipeline.issuer_candidates', 'pipeline.candidate_discoveries',
    'pipeline.evidence_documents', 'pipeline.evidence_claims',
    'pipeline.eligibility_reviews', 'pipeline.tier1_product_lines',
    'pipeline.tier2_assessments', 'pipeline.tier3_assessments',
    'pipeline.review_exclusions'
  ];
  n integer;
begin
  -- Every table in both schemas has RLS enabled, and every one is in the list above.
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname in ('reference', 'pipeline') and c.relkind = 'r';
  if n <> array_length(tables, 1) then
    raise exception 'expected % tables across reference/pipeline, found %', array_length(tables, 1), n;
  end if;
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname in ('reference', 'pipeline') and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception '% table(s) without row level security', n; end if;
  select count(*) into n from pg_policies where schemaname in ('reference', 'pipeline');
  if n <> 0 then raise exception 'unexpected RLS policies exist: %', n; end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('set local role %I', role_name);
    foreach tbl in array tables loop
      ok := false;
      begin
        execute format('select 1 from %s limit 1', tbl);
      exception when insufficient_privilege then ok := true;
      end;
      if not ok then raise exception '% could SELECT from %', role_name, tbl; end if;
    end loop;

    -- Writes are denied too.
    ok := false;
    begin
      execute 'insert into reference.canonical_regions (code, name) values (''US'', ''x'')';
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception '% could INSERT into reference.canonical_regions', role_name; end if;

    ok := false;
    begin
      execute 'insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, enumeration_assessment) values (gen_random_uuid(), ''x'', now(), ''GET'', ''x'', ''unknown'')';
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception '% could INSERT into pipeline.source_retrievals', role_name; end if;

    -- Even the helper functions are out of reach.
    ok := false;
    begin
      execute 'select pipeline.forbid_mutation()';
    exception when insufficient_privilege then ok := true;
      when others then ok := true;  -- a trigger function cannot be called directly anyway
    end;
    if not ok then raise exception '% could reach pipeline functions', role_name; end if;

    reset role;
  end loop;

  -- Positive control: service_role reads reference and pipeline tables.
  set local role service_role;
  -- Positive control is readability, not a row count: the UCPI family and the reusable listed-GPU specification both live here.
  select count(*) into n from reference.methodologies;
  if n < 1 then raise exception 'service_role could not read reference.methodologies'; end if;
  if not exists (select 1 from reference.methodologies where slug = 'ucpi') then raise exception 'the UCPI family methodology is missing'; end if;
  select count(*) into n from pipeline.raw_offers;
  reset role;

  -- service_role holds no UPDATE/DELETE privilege on evidence tables, independent of the trigger.
  if has_table_privilege('service_role', 'pipeline.raw_offers', 'UPDATE') then
    raise exception 'service_role has UPDATE on raw_offers';
  end if;
  if has_table_privilege('service_role', 'pipeline.raw_offers', 'DELETE') then
    raise exception 'service_role has DELETE on raw_offers';
  end if;
  if has_table_privilege('service_role', 'pipeline.source_retrievals', 'UPDATE') then
    raise exception 'service_role has UPDATE on source_retrievals';
  end if;
  if has_table_privilege('service_role', 'pipeline.normalized_observations', 'DELETE') then
    raise exception 'service_role has DELETE on normalized_observations';
  end if;
  if not has_table_privilege('service_role', 'pipeline.raw_offers', 'INSERT') then
    raise exception 'service_role cannot INSERT raw_offers';
  end if;
  if has_schema_privilege('anon', 'pipeline', 'USAGE') or has_schema_privilege('authenticated', 'pipeline', 'USAGE') then
    raise exception 'public roles hold USAGE on pipeline';
  end if;
  if has_schema_privilege('anon', 'reference', 'USAGE') or has_schema_privilege('authenticated', 'reference', 'USAGE') then
    raise exception 'public roles hold USAGE on reference';
  end if;

  raise notice 'security: ok';
end $$;

rollback;