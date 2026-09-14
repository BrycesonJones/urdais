-- The publication layer encodes the family's structural rules as constraints:
-- the UTC window, one participant has no value, two publish at Minimum with
-- dispersion withheld, three or more at Normal, publication status follows
-- the deadline, simulations are never published, rows are append-only.
begin;

insert into reference.canonical_regions (code, name) values ('US', 'United States') on conflict (code) do nothing;
insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'cloud_provider');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-catalog', 'Test catalog', 'catalog_price_interface', 'https://example.invalid/catalog', true, 'api_key');
-- The test interface is approved under a full grant so the production run's candidates have production lineage.
update reference.source_interfaces set terms_review_state = 'permitted', data_use_terms_state = 'permitted', production_access_state = 'production_approved'
 where id = 'bbbbbbbb-0000-4000-8000-000000000011';
insert into reference.permission_grants (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use, effective_from, evidence)
values ('77777777-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'written_permission', 'test-thread', true, true, '2026-09-01T00:00:00Z', 'test');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'q:1', '2026-09-13T10:00:00Z', 'GET', 'https://example.invalid/catalog', 200, repeat('a', 64), 'complete', 'production', '77777777-0000-4000-8000-000000000001');
insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{}', '2026-09-13T10:00:01Z'),
       ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 1, repeat('c', 64), '{}', '2026-09-13T10:00:01Z');
insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
values ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000114', '11111111-0000-4000-8000-000000000112', '2026-09-13T10:00:01Z'),
       ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000114', '11111111-0000-4000-8000-000000000112', '2026-09-13T10:00:01Z');
insert into reference.market_entities (id, slug, name, legal_name)
values ('99999999-0000-4000-8000-000000000001', 'seller-a', 'Seller A', 'Seller A, Inc.'),
       ('99999999-0000-4000-8000-000000000002', 'seller-b', 'Seller B', 'Seller B, Ltd.');

do $$
declare
  ok boolean;
  n integer;
  inst uuid := '22222222-0000-4000-8000-000000000001';
  spec uuid := '22222222-0000-4000-8000-000000000114';
  mver uuid := '11111111-0000-4000-8000-000000000112';
  run uuid := 'aaaaaaaa-1111-4000-8000-000000000001';
  sim uuid := 'aaaaaaaa-1111-4000-8000-000000000002';
  so_a uuid := 'aaaaaaaa-2222-4000-8000-000000000001';
  so_b uuid := 'aaaaaaaa-2222-4000-8000-000000000002';
  cs_a uuid := 'aaaaaaaa-3333-4000-8000-000000000001';
  cs_b uuid := 'aaaaaaaa-3333-4000-8000-000000000002';
  ro uuid := 'aaaaaaaa-4444-4000-8000-000000000001';
  ro_unavail uuid := 'aaaaaaaa-4444-4000-8000-000000000002';
  ro_sim uuid := 'aaaaaaaa-4444-4000-8000-000000000003';
begin
  -- The window must be the UTC day; a wrong cutoff is rejected.
  ok := false;
  begin
    insert into pipeline.calculation_runs (instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at)
    values (inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-13T23:59:59Z', '2026-09-14T23:59:59Z', '2026-09-14T00:01:00Z');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a non-UTC-day window was accepted'; end if;

  -- Calculation before the cutoff is rejected.
  ok := false;
  begin
    insert into pipeline.calculation_runs (instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at)
    values (inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-13T23:00:00Z');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'calculation before the cutoff was accepted'; end if;

  insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at, run_kind)
  values (run, inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-14T00:01:00Z', 'production'),
         (sim, inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-14T00:01:00Z', 'simulation');

  -- Seller-level observations with their candidate sets.
  insert into pipeline.seller_observations (id, run_id, seller_entity_id, canonical_region_code, canonical_quantity, representative_price, selected_normalized_observation_id, considered_count, canonical_count)
  values (so_a, run, '99999999-0000-4000-8000-000000000001', 'US', 1, 2.69, 'eeeeeeee-0000-4000-8000-000000000001', 2, 2),
         (so_b, run, '99999999-0000-4000-8000-000000000002', 'US', 1, 4.29, 'eeeeeeee-0000-4000-8000-000000000002', 1, 1);
  insert into pipeline.seller_observation_candidates values
    (so_a, 'eeeeeeee-0000-4000-8000-000000000001', true, true),
    (so_b, 'eeeeeeee-0000-4000-8000-000000000002', true, true);

  -- A selected candidate must be at the canonical quantity.
  ok := false;
  begin
    insert into pipeline.seller_observation_candidates values (so_a, 'eeeeeeee-0000-4000-8000-000000000002', false, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a selected non-canonical candidate was accepted'; end if;

  insert into pipeline.capacity_source_observations (id, run_id, capacity_source_entity_id, canonical_region_code, representative_price, attribution_status, source_interface_count)
  values (cs_a, run, '99999999-0000-4000-8000-000000000001', 'US', 2.69, 'seller_fallback', 1),
         (cs_b, run, '99999999-0000-4000-8000-000000000002', 'US', 4.29, 'seller_fallback', 1);
  insert into pipeline.capacity_source_members values (cs_a, so_a), (cs_b, so_b);

  -- Two participants: Minimum breadth, midpoint, dispersion withheld.
  insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, change_disposition)
  values (ro, run, inst, '2026-09-13', 'US', 'value', 'minimum', 3.49, 2, 2, 0.5, false, 'withheld');
  insert into pipeline.regional_observation_participants values (ro, cs_a), (ro, cs_b);

  -- Two participants at Normal breadth is impossible.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published)
    values (run, inst, '2026-09-13', 'US', 'value', 'normal', 3.49, 2, 2, 0.5, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'N=2 at Normal breadth was accepted'; end if;

  -- Dispersion at two participants is impossible.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, p10, p50, p90, iqr)
    values (run, inst, '2026-09-13', 'US', 'value', 'minimum', 3.49, 2, 2, 0.5, true, 2.85, 3.49, 4.13, 0.8);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'dispersion at N=2 was accepted'; end if;

  -- One participant cannot carry a value.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published)
    values (run, inst, '2026-09-13', 'US', 'value', 'minimum', 3.49, 1, 1, 1, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'N=1 with a value was accepted'; end if;

  -- Three participants at Minimum breadth is impossible.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, p10, p50, p90, iqr)
    values (run, inst, '2026-09-13', 'US', 'value', 'minimum', 3.49, 3, 3, 0.34, true, 2.9, 3.49, 4.0, 0.6);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'N=3 at Minimum breadth was accepted'; end if;

  -- One current observation per instrument, country and date.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values (run, inst, '2026-09-13', 'US', 'unavailable', 'SINGLE_PARTICIPANT', 1, 1, false);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a second current observation for the same country and date was accepted'; end if;

  -- An Unavailable observation names its condition and carries no price (different date to avoid the unique index).
  insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at)
  values ('aaaaaaaa-1111-4000-8000-000000000003', inst, spec, mver, '2026-09-12', '2026-09-12T00:00:00Z', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-13T00:01:00Z');
  insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
  values (ro_unavail, 'aaaaaaaa-1111-4000-8000-000000000003', inst, '2026-09-12', 'US', 'unavailable', 'SINGLE_PARTICIPANT', 1, 1, false);

  -- The condition must match the count.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values ('aaaaaaaa-1111-4000-8000-000000000003', inst, '2026-09-12', 'US', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 1, 1, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a mismatched structural condition was accepted'; end if;

  -- A regional observation must agree with its run's date.
  ok := false;
  begin
    insert into pipeline.regional_observations (run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
    values (run, inst, '2026-09-11', 'US', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a regional observation disagreeing with its run was accepted'; end if;

  -- Publication status follows the deadline and is not trusted.
  ok := false;
  begin
    insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
    values (ro, '2026-09-14T00:05:00Z', 'delayed');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a timely release marked delayed was accepted'; end if;
  ok := false;
  begin
    insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
    values (ro, '2026-09-15T00:00:00Z', 'published');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a release at the deadline marked published was accepted'; end if;

  -- A simulation run is never published.
  insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
  values (ro_sim, sim, inst, '2026-09-13', 'US', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false)
  on conflict do nothing;
  -- (the unique index blocks a second current US/2026-09-13 row, so use a different country for the simulation)
  insert into reference.canonical_regions (code, name) values ('DE', 'Germany') on conflict (code) do nothing;
  insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, outcome, structural_condition, participant_count, contributing_source_count, dispersion_published)
  values ('aaaaaaaa-4444-4000-8000-000000000004', sim, inst, '2026-09-13', 'DE', 'unavailable', 'NO_ELIGIBLE_PARTICIPANT', 0, 0, false);
  ok := false;
  begin
    insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
    values ('aaaaaaaa-4444-4000-8000-000000000004', '2026-09-14T00:05:00Z', 'published');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a simulation run was published'; end if;

  -- A timely production release is accepted, once.
  insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
  values (ro, '2026-09-14T00:05:00Z', 'published');
  ok := false;
  begin
    insert into pipeline.regional_publications (regional_observation_id, published_at, publication_status)
    values (ro, '2026-09-14T00:06:00Z', 'published');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a second publication of the same observation was accepted'; end if;

  -- Append-only: no edits, no deletes, except supersession on regional observations.
  ok := false;
  begin
    update pipeline.regional_observations set price_level = 9.99 where id = ro;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a regional observation price was edited'; end if;
  ok := false;
  begin
    delete from pipeline.calculation_runs where id = sim;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a calculation run was deleted'; end if;
  ok := false;
  begin
    update pipeline.seller_observations set representative_price = 1 where id = so_a;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a seller observation was edited'; end if;

  -- Supersession works and the superseding row takes the current slot.
  insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at, run_kind)
  values ('aaaaaaaa-1111-4000-8000-000000000004', inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-14T06:00:00Z', 'correction');
  update pipeline.regional_observations
     set superseded_by_id = 'aaaaaaaa-4444-4000-8000-000000000005', superseded_at = '2026-09-14T06:00:00Z', supersession_reason = 'input correction'
   where id = ro;
  insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, outcome, market_breadth, price_level, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, change_disposition)
  values ('aaaaaaaa-4444-4000-8000-000000000005', 'aaaaaaaa-1111-4000-8000-000000000004', inst, '2026-09-13', 'US', 'value', 'minimum', 3.50, 2, 2, 0.5, false, 'withheld');
  select count(*) into n from pipeline.regional_observations where canonical_region_code = 'US' and calculation_date = '2026-09-13' and superseded_by_id is null;
  if n <> 1 then raise exception 'expected one current US observation after supersession, found %', n; end if;

  raise notice 'publication layer: ok';
end $$;

rollback;
