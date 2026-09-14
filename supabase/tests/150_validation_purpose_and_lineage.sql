-- Validation retrievals need the same permission basis as production, and a
-- production run can only be built from production retrievals.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'cloud_provider');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-catalog', 'Test catalog', 'catalog_price_interface', 'https://example.invalid/catalog', true, 'api_key');
insert into reference.market_entities (id, slug, name, legal_name) values ('99999999-0000-4000-8000-000000000001', 'seller-a', 'Seller A', 'Seller A, Inc.');

do $$
declare
  ok boolean;
  iface uuid := 'bbbbbbbb-0000-4000-8000-000000000011';
  grant_id uuid := '77777777-0000-4000-8000-000000000001';
  narrow_grant uuid := '77777777-0000-4000-8000-000000000002';
  inst uuid := '22222222-0000-4000-8000-000000000001';
  spec uuid := '22222222-0000-4000-8000-000000000114';
  mver uuid := '11111111-0000-4000-8000-000000000112';
  run uuid := 'aaaaaaaa-1111-4000-8000-000000000001';
  so uuid := 'aaaaaaaa-2222-4000-8000-000000000001';
begin
  -- A validation retrieval without a grant is rejected at the constraint.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
    values (iface, 'v:nogrant', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('a', 64), 'complete', 'validation');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'validation retrieval without a grant was accepted'; end if;

  insert into reference.permission_grants (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use, effective_from, evidence)
  values (grant_id, iface, 'written_permission', 'test-thread', true, true, now() - interval '1 day', 'test'),
         (narrow_grant, iface, 'written_permission', 'test-thread-2', true, false, now() - interval '1 day', 'collection only');

  -- A validation retrieval on a non-approved interface is rejected by the trigger.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
    values (iface, 'v:notapproved', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('b', 64), 'complete', 'validation', grant_id);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'validation retrieval from a non-approved interface was accepted'; end if;

  update reference.source_interfaces
     set terms_review_state = 'permitted', data_use_terms_state = 'permitted', production_access_state = 'production_approved'
   where id = iface;

  -- A grant covering only one axis cannot back a production or validation retrieval.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
    values (iface, 'p:narrow', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('c', 64), 'complete', 'production', narrow_grant);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a collection-only grant backed a production retrieval'; end if;

  -- Validation and production retrievals under a full grant on an approved interface are accepted.
  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values ('cccccccc-0000-4000-8000-000000000001', iface, 'v:ok', '2026-09-13T10:00:00Z', 'GET', 'https://example.invalid/catalog', 200, repeat('d', 64), 'complete', 'validation', grant_id),
         ('cccccccc-0000-4000-8000-000000000002', iface, 'p:ok', '2026-09-13T11:00:00Z', 'GET', 'https://example.invalid/catalog', 200, repeat('e', 64), 'complete', 'production', grant_id);

  insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
  values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('1', 64), '{}', '2026-09-13T10:00:01Z'),
         ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 0, repeat('2', 64), '{}', '2026-09-13T11:00:01Z');
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', inst, spec, mver, '2026-09-13T10:00:01Z'),
         ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', inst, spec, mver, '2026-09-13T11:00:01Z');

  insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at, run_kind)
  values (run, inst, spec, mver, '2026-09-13', '2026-09-13T00:00:00Z', '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', '2026-09-14T00:01:00Z', 'production');
  insert into pipeline.seller_observations (id, run_id, seller_entity_id, canonical_region_code, canonical_quantity, representative_price, selected_normalized_observation_id, considered_count, canonical_count)
  values (so, run, '99999999-0000-4000-8000-000000000001', 'US', 1, 3.0, 'eeeeeeee-0000-4000-8000-000000000002', 1, 1);

  -- A validation retrieval's observation cannot be a candidate in a production run.
  ok := false;
  begin
    insert into pipeline.seller_observation_candidates values (so, 'eeeeeeee-0000-4000-8000-000000000001', true, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a validation retrieval fed a production run'; end if;

  -- A production retrieval's observation can.
  insert into pipeline.seller_observation_candidates values (so, 'eeeeeeee-0000-4000-8000-000000000002', true, true);

  raise notice 'validation purpose and lineage: ok';
end $$;

rollback;
