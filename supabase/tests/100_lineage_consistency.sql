-- Lineage consistency is database-enforced: a normalized observation's
-- instrument, spec version and methodology version must be one spec-version
-- row, and an assessment must carry the same versions as its observation.
-- Canonical regions must be ISO 3166-1 countries.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'api_key');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:1', now(), 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), 'unknown');
insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{}', now());

-- A second methodology version, a second instrument under UCPI, and a second
-- H100 spec version, all valid on their own.
insert into reference.methodology_versions (id, methodology_id, version, status, document_path)
values ('11111111-0000-4000-8000-000000000102', '11111111-0000-4000-8000-000000000001', '0.2.0-draft', 'draft', 'docs/methodology/ucpi.md');
insert into reference.instruments (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status)
values ('33333333-0000-4000-8000-000000000001', 'UCPI-TEST-OTHER', 'Test other instrument', 'compute_price', '11111111-0000-4000-8000-000000000001', 'USD / accelerator-hour', 'USD', 'proposed');
insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path)
values ('33333333-0000-4000-8000-000000000101', '33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000101', '0.1.0-draft', 'draft', 'x.md'),
       ('22222222-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000101', '0.1.2-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md');

do $$
declare
  ok boolean;
  raw uuid := 'dddddddd-0000-4000-8000-000000000001';
  h100 uuid := '22222222-0000-4000-8000-000000000001';
  other_instrument uuid := '33333333-0000-4000-8000-000000000001';
  spec_h100_011 uuid := '22222222-0000-4000-8000-000000000101';
  spec_h100_012 uuid := '22222222-0000-4000-8000-000000000102';
  mver_010 uuid := '11111111-0000-4000-8000-000000000101';
  mver_020 uuid := '11111111-0000-4000-8000-000000000102';
  obs uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  n integer;
begin
  -- 1. Wrong instrument with the H100 spec version: rejected.
  ok := false;
  begin
    insert into pipeline.normalized_observations (raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
    values (raw, other_instrument, spec_h100_011, mver_010, now());
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'normalized observation with a mismatched instrument was accepted'; end if;

  -- 2. Correct instrument and spec, wrong methodology version: rejected.
  ok := false;
  begin
    insert into pipeline.normalized_observations (raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
    values (raw, h100, spec_h100_011, mver_020, now());
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'normalized observation with a mismatched methodology version was accepted'; end if;

  -- Consistent triple: accepted.
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
  values (obs, raw, h100, spec_h100_011, mver_010, now());

  -- 3. Assessment naming a different spec version than its observation: rejected.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec_h100_012, mver_010, now(), true, false, false, 'ineligible');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'assessment with a spec version different from its observation was accepted'; end if;

  -- 4. Assessment naming a different methodology version than its observation: rejected.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec_h100_011, mver_020, now(), true, false, false, 'ineligible');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'assessment with a methodology version different from its observation was accepted'; end if;

  -- Consistent assessment: accepted.
  insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
  values (obs, spec_h100_011, mver_010, now(), true, false, false, 'ineligible');

  -- The constraints are declared, not incidental.
  if not exists (select 1 from pg_constraint where conname = 'normalized_observations_lineage_consistent' and contype = 'f') then
    raise exception 'normalized_observations lineage FK is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eligibility_assessments_lineage_consistent' and contype = 'f') then
    raise exception 'eligibility_assessments lineage FK is missing';
  end if;

  -- ISO 3166-1 membership.
  select count(*) into n from reference.iso_countries;
  if n <> 249 then raise exception 'expected 249 ISO 3166-1 alpha-2 codes, found %', n; end if;
  if exists (select 1 from reference.iso_countries where code in ('EU', 'UK', 'XK', 'AA', 'ZZ')) then
    raise exception 'a reserved or user-assigned code is present in iso_countries';
  end if;
  if not exists (select 1 from reference.iso_countries where code in ('US', 'GB', 'DE', 'JP', 'AU', 'FR', 'NL', 'CZ', 'IN', 'TW', 'TH', 'SI')) then
    raise exception 'expected countries are missing from iso_countries';
  end if;

  -- A well-formed, non-reserved, but unassigned pair cannot become a canonical region.
  ok := false;
  begin
    insert into reference.canonical_regions (code, name) values ('ZQ', 'not a country');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'unassigned code ZQ was adopted as a canonical region'; end if;

  -- A real country can.
  insert into reference.canonical_regions (code, name) values ('US', 'United States');

  raise notice 'lineage consistency: ok';
end $$;

rollback;
