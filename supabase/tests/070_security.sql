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
    'pipeline.review_exclusions',
    -- Tier 1 Route P, the AI-integrated platform test added by methodology 0.4.0-draft.
    'pipeline.tier1_platform_assessments',
    -- UGAI end-of-day equity closes.
    'pipeline.price_observations',
    -- UGAI capitalization inputs: shares, holder-level ownership, free float, accessibility
    -- and the corporate-action ledger. Five tables rather than one because they disagree about
    -- what they are keyed on, how often they change, and what a missing value means.
    'pipeline.share_observations', 'pipeline.ownership_observations',
    'pipeline.float_observations', 'pipeline.accessibility_observations',
    'pipeline.corporate_actions',
    -- UGAI pre-weighting machinery: FX, representative-security selection and investability.
    'pipeline.fx_observations',
    'pipeline.representative_security_selections', 'pipeline.representative_security_candidates',
    'pipeline.investability_evaluations', 'pipeline.investability_criteria',
    -- UGAI universe snapshots and capped weights.
    'pipeline.universe_snapshots', 'pipeline.snapshot_constituents',
    'pipeline.snapshot_constituent_inputs',
    -- UGAI calculation engine: index shares, divisor, daily level, publication readiness.
    'pipeline.ugai_index_shares', 'pipeline.ugai_divisors', 'pipeline.ugai_calculations',
    'pipeline.ugai_constituent_calculations', 'pipeline.ugai_publication_checks',
    -- UAVI options foundation: the US venue register, the volatility-instrument mapping, contract
    -- identity, the official-snapshot quote, and the resolved risk-free rate.
    'reference.options_venues', 'reference.option_contracts',
    'pipeline.uavi_volatility_instruments', 'pipeline.option_quote_observations',
    'pipeline.risk_free_rate_observations',
    -- UAVI calculation engine: constituent volatility, the two strips behind it, the surviving
    -- strikes, the headline, its constituents and its publication readiness.
    'pipeline.uavi_constituent_variances', 'pipeline.uavi_option_strips',
    'pipeline.uavi_strip_components', 'pipeline.uavi_calculations',
    'pipeline.uavi_constituent_calculations', 'pipeline.uavi_publication_checks',
    -- Available Compute Capacity: observed supply, and what each source can report.
    'reference.capacity_signal_capabilities', 'pipeline.capacity_observations',
    -- The map's facility foundation: the canonical facility, its other names, its
    -- source documents and what each one supports, its sourced facts, and the
    -- evidenced edges between facilities.
    'reference.facilities', 'reference.facility_aliases',
    'reference.facility_evidence', 'reference.facility_evidence_claims',
    'reference.facility_facts', 'reference.facility_relationships',
    -- Power Delivery: physical grid identity, versioned aggregation membership and hourly evidence.
    'reference.grid_operators', 'reference.grid_areas', 'reference.grid_universes',
    'reference.grid_universe_versions', 'reference.grid_area_memberships', 'reference.power_metrics',
    'pipeline.raw_power_records', 'pipeline.power_observations', 'pipeline.power_ingestion_runs',
    -- Power Delivery PD-3: the source-rights model and the planning-demand domain, which is
    -- deliberately a separate set of tables from the hourly operational store above.
    'reference.source_rights_classifications', 'reference.source_use_purposes',
    'reference.source_use_permissions', 'pipeline.retrieval_rights_snapshots',
    'pipeline.planning_forecast_vintages', 'pipeline.planning_forecast_scenarios',
    'pipeline.raw_planning_forecast_records', 'pipeline.planning_forecast_points',
    -- PD-3D: where to look for a newer release, and the evidence of each look.
    'reference.planning_source_monitors', 'pipeline.planning_source_checks',
    -- PD-4: the grid capacity domain. Distinct from pipeline.capacity_observations above, which
    -- is rentable GPU supply and shares nothing with it but a word.
    'reference.capacity_quantity_kinds', 'reference.capacity_component_kinds', 'reference.capacity_bases',
    'reference.grid_subareas', 'reference.grid_interfaces',
    'pipeline.grid_capacity_vintages', 'pipeline.grid_capacity_scenarios',
    'pipeline.raw_grid_capacity_records', 'pipeline.grid_capacity_components',
    'pipeline.grid_constraint_values', 'pipeline.deliverable_capacity_results',
    'pipeline.deliverable_capacity_result_inputs',
    -- PD-5A: the delivery gap and the two rows behind each one.
    'pipeline.delivery_gap_results', 'pipeline.delivery_gap_result_inputs',
    -- Interconnection Queue: a separate domain from capacity, and locked down the same way.
    'reference.interconnection_lifecycle_stages', 'reference.interconnection_request_classes',
    'reference.interconnection_quantity_kinds', 'reference.interconnection_technologies',
    'reference.interconnection_source_monitors',
    'pipeline.interconnection_queue_snapshots', 'pipeline.raw_interconnection_queue_records',
    'pipeline.interconnection_requests', 'pipeline.interconnection_request_observations',
    'pipeline.interconnection_request_quantities', 'pipeline.interconnection_request_resources',
    'pipeline.interconnection_queue_deferrals', 'pipeline.interconnection_source_checks',
    'reference.interconnection_load_end_uses', 'reference.interconnection_request_subtypes',
    'reference.interconnection_metric_definitions',
    'pipeline.interconnection_analytics_runs', 'pipeline.interconnection_metric_results',
    -- Transmission Headroom (TH-2)
    'reference.transmission_entity_kinds', 'reference.transmission_contingency_kinds',
    'reference.transmission_limit_states', 'reference.transmission_margin_states',
    'reference.transmission_deferral_reasons', 'reference.transmission_calculation_versions',
    'reference.transmission_source_monitors',
    'pipeline.transmission_snapshots', 'pipeline.raw_transmission_records',
    'pipeline.transmission_interfaces', 'pipeline.transmission_elements',
    'pipeline.transmission_flow_observations', 'pipeline.transmission_limit_observations',
    'pipeline.transmission_margins', 'pipeline.transmission_deferrals',
    -- Transmission Headroom analytics (TH-3)
    'reference.transmission_metric_definitions',
    'pipeline.transmission_analytics_runs', 'pipeline.transmission_metric_results'
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
