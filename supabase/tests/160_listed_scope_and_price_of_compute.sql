-- The licensed listed-price source is cleared on written terms with both axes
-- covered; the LISTED sibling exists as a draft; region scope is enforced on
-- the publication layer; the direct interfaces did not move.
begin;

do $$
declare
  n integer;
  iface uuid;
  grant_id uuid;
  inst uuid;
  spec uuid;
  mver uuid;
  run uuid := 'aaaaaaaa-1111-4000-8000-000000000160';
  ok boolean;
begin
  select id into iface from reference.source_interfaces where slug = 'price-of-compute-prices';
  if iface is null then raise exception 'price-of-compute-prices interface missing'; end if;

  -- Both axes permitted on terms evidence, approved, no written agreement needed, grade 6 recorded.
  if not exists (select 1 from reference.source_interfaces where id = iface and terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
                   and production_access_state = 'production_approved' and written_agreement_required = false and access_class = 'public_unauthenticated'
                   and (metadata->>'source_quality_grade')::int = 6 and terms_evidence ? 'documents') then
    raise exception 'Price of Compute interface state is not the cleared, evidenced state';
  end if;
  select id into grant_id from reference.permission_grants where source_interface_id = iface and grant_kind = 'provider_terms' and covers_collection and covers_index_use;
  if grant_id is null then raise exception 'no provider_terms grant covering both axes'; end if;
  -- Scoped to the compute market by class. News feeds were already excluded; UTVI's usage
  -- dataset is excluded for the same reason, being a token-volume source rather than a
  -- compute-price one. Narrowed by name rather than dropped.
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class not in ('news_feed', 'usage_dataset_interface', 'benchmark_dataset_interface',
                                 'regulatory_filing_repository',
                                  'equity_eod_price_interface');
  if n <> 1 then raise exception 'expected one compute-market grant, found %', n; end if;

  -- The attribution string is recorded verbatim in the evidence.
  if position('Data: Price of Compute' in (select terms_evidence::text from reference.source_interfaces where id = iface)) = 0 then
    raise exception 'attribution requirement not recorded'; end if;

  -- Sixteen provider slugs mapped, none marked stable; the marketplace carries a marketplace role, not a seller role.
  select count(*) into n from reference.native_identifiers where source_interface_id = iface and identifier_type = 'seller_id';
  if n <> 16 then raise exception 'expected 16 provider identifiers, found %', n; end if;
  select count(*) into n from reference.native_identifiers where source_interface_id = iface and stability_status = 'stable';
  if n <> 0 then raise exception 'an identifier was marked stable without a cross-time study'; end if;
  if exists (select 1 from reference.entity_roles r join reference.market_entities e on e.id = r.entity_id where e.slug = 'vast' and r.role = 'seller') then
    raise exception 'the marketplace was given a seller role'; end if;
  -- Legal names only where evidenced.
  if not exists (select 1 from reference.market_entities where slug = 'hyperstack' and legal_name = 'NexGen Cloud Limited') then raise exception 'Hyperstack legal name'; end if;
  if not exists (select 1 from reference.market_entities where slug = 'voltagepark' and legal_name = 'Voltage Park, Inc.') then raise exception 'Voltage Park legal name'; end if;
  if not exists (select 1 from reference.market_entities where slug = 'nebius' and legal_name is null) then raise exception 'Nebius legal name was asserted without evidence'; end if;

  -- The sibling: proposed, one draft spec with a hash, under the current parent draft.
  select i.id into inst from reference.instruments i where i.symbol = 'UCPI-H100-SXM-LISTED' and i.lifecycle_status = 'proposed';
  if inst is null then raise exception 'UCPI-H100-SXM-LISTED missing or not proposed'; end if;
  select sv.id, sv.methodology_version_id into spec, mver from reference.instrument_spec_versions sv
    join reference.methodology_versions mv on mv.id = sv.methodology_version_id
   where sv.instrument_id = inst and sv.version = '0.1.0-draft' and sv.status = 'draft' and mv.version = '0.1.2-draft' and sv.content_hash ~ '^[0-9a-f]{64}$';
  if spec is null then raise exception 'sibling spec 0.1.0-draft under UCPI 0.1.2-draft missing'; end if;
  -- The identity amendment: 0.1.1-draft exists under the same parent, with its own hash, and the new exclusion code is in the vocabulary.
  select count(*) into n from reference.instrument_spec_versions sv join reference.methodology_versions mv on mv.id = sv.methodology_version_id
   where sv.instrument_id = inst and sv.version = '0.1.1-draft' and sv.status = 'draft' and mv.version = '0.1.2-draft' and sv.content_hash ~ '^[0-9a-f]{64}$'
     and sv.content_hash <> (select content_hash from reference.instrument_spec_versions where id = spec);
  if n <> 1 then raise exception 'sibling spec 0.1.1-draft missing or hash unchanged'; end if;
  if not exists (select 1 from reference.exclusion_reasons where code = 'SELLER_LEGAL_IDENTITY_UNRESOLVED' and stage = 'P1') then
    raise exception 'SELLER_LEGAL_IDENTITY_UNRESOLVED missing from the vocabulary'; end if;
  if not exists (select 1 from reference.market_entities where slug = 'nebius' and legal_name is null and notes like '%Nebius B.V.%') then
    raise exception 'Nebius legal identity was asserted, or the evidence note is missing'; end if;

  -- Direct interfaces unchanged.
  if not exists (select 1 from reference.source_interfaces where slug = 'runpod-gpu-types' and production_access_state = 'production_blocked' and terms_review_state = 'not_permitted') then raise exception 'Runpod moved'; end if;
  if not exists (select 1 from reference.source_interfaces where slug = 'lambda-instance-types' and production_access_state = 'production_blocked' and terms_review_state = 'under_review') then raise exception 'Lambda moved'; end if;

  -- Region scope: a listed row must have no country; a country row must have one.
  insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at, run_kind)
  values (run, inst, spec, mver, '2026-09-14', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-16T00:00:00Z', '2026-09-15T00:01:00Z', 'simulation');

  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, region_scope, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values (run, inst, '2026-09-14', 'US', 'listed_provider_wide', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a listed observation carried a country'; end if;

  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, region_scope, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values (run, inst, '2026-09-14', null, 'country', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a country observation lacked a country'; end if;

  -- A listed value carries its attribution and one current row per date.
  insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, region_scope, source_attributions, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, p10, p50, p90, iqr)
  values (run, inst, '2026-09-14', null, 'listed_provider_wide', array['Data: Price of Compute — priceofcompute.com'], 'value', 'normal', 3.99, 5, 1, 1.0, true, 2.59, 3.99, 4.34, 0.60);
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, region_scope, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values (run, inst, '2026-09-14', null, 'listed_provider_wide', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two current listed observations for one date were accepted'; end if;

  -- A simulation run's value can never be published.
  ok := false;
  begin
    insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
    select id, '2026-09-15T00:02:00Z', 'published' from pipeline.regional_observations where run_id = run and outcome = 'value';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a simulation value was published'; end if;

  raise notice 'listed scope and price of compute: ok';
end $$;

rollback;
