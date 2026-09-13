-- Legal identity, service tier and permission reference behave as the
-- methodology requires, and the database refuses production collection the
-- registry has not cleared.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'cloud_provider');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-catalog', 'Test catalog', 'catalog_price_interface', 'https://example.invalid/catalog', true, 'api_key'),
       ('bbbbbbbb-0000-4000-8000-000000000012', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-other', 'Test other', 'availability_interface', 'https://example.invalid/avail', true, 'api_key');

do $$
declare
  ok boolean;
  n integer;
  iface uuid := 'bbbbbbbb-0000-4000-8000-000000000011';
  other uuid := 'bbbbbbbb-0000-4000-8000-000000000012';
  parent_entity uuid := '99999999-0000-4000-8000-000000000001';
  child_entity uuid := '99999999-0000-4000-8000-000000000002';
  grant_id uuid := '77777777-0000-4000-8000-000000000001';
begin
  -- Gap A: legal identity ---------------------------------------------------
  insert into reference.market_entities (id, slug, name, legal_name, legal_identifier)
  values (parent_entity, 'holding-co', 'Brand A', 'Holding Co, Inc.', 'US-DE-0000001');
  insert into reference.market_entities (id, slug, name, legal_name, controlling_entity_id)
  values (child_entity, 'subsidiary', 'Brand B', 'Subsidiary LLC', parent_entity);

  -- A legal identifier without a legal name is meaningless and rejected.
  ok := false;
  begin
    insert into reference.market_entities (slug, name, legal_identifier) values ('bad', 'Bad', 'X-1');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'legal identifier without legal name was accepted'; end if;

  -- An entity cannot control itself.
  ok := false;
  begin
    update reference.market_entities set controlling_entity_id = parent_entity where id = parent_entity;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'self-control was accepted'; end if;

  -- Gap B: service tier -----------------------------------------------------
  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
  values ('cccccccc-0000-4000-8000-000000000001', iface, 'p:1', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('a', 64), 'complete');
  insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_service_tier, native_service_fields)
  values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{}', now(), 'SECURE', '{"reliability":"High redundancy"}');
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at, service_tier)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000114', '11111111-0000-4000-8000-000000000112', now(),
          '{"tier_label":"SECURE","operator_class":"first_party_datacenter","interruption_policy":"none"}');

  -- A non-object service tier is rejected.
  ok := false;
  begin
    insert into pipeline.normalized_observations (raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at, service_tier)
    values ('dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000114', '11111111-0000-4000-8000-000000000112', now(), '"SECURE"');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'scalar service tier was accepted'; end if;

  -- Gap C: permission reference and the production gate ---------------------
  -- A research retrieval needs no grant (the default purpose).
  select count(*) into n from pipeline.source_retrievals where retrieval_purpose = 'research';
  if n <> 1 then raise exception 'default retrieval purpose is not research'; end if;

  -- A production retrieval without a grant is rejected at the constraint.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
    values (iface, 'p:nogrant', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('c', 64), 'complete', 'production');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'production retrieval without a permission grant was accepted'; end if;

  insert into reference.permission_grants (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use, effective_from, evidence)
  values (grant_id, iface, 'written_permission', 'test-thread-1', true, true, now() - interval '1 day', 'test evidence');

  -- A production retrieval with a grant on a source that is not production-approved is rejected by the trigger.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
    values (iface, 'p:notapproved', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('d', 64), 'complete', 'production', grant_id);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'production retrieval from a non-approved interface was accepted'; end if;

  -- A grant from a different interface is rejected.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, permission_grant_id)
    values (other, 'p:wrongiface', now(), 'GET', 'https://example.invalid/avail', 200, repeat('e', 64), 'complete', grant_id);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'grant from another interface was accepted'; end if;

  -- A grant not yet in force at request time is rejected.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, permission_grant_id)
    values (iface, 'p:early', now() - interval '2 days', 'GET', 'https://example.invalid/catalog', 200, repeat('f', 64), 'complete', grant_id);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'grant not in force was accepted'; end if;

  -- Once the registry clears both axes and approves, a production retrieval under the grant is accepted.
  update reference.source_interfaces
     set terms_review_state = 'permitted', data_use_terms_state = 'permitted', production_access_state = 'production_approved'
   where id = iface;
  insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface, 'p:ok', now(), 'GET', 'https://example.invalid/catalog', 200, repeat('9', 64), 'complete', 'production', grant_id);
  select count(*) into n from pipeline.source_retrievals where retrieval_purpose = 'production';
  if n <> 1 then raise exception 'approved production retrieval was not recorded'; end if;

  raise notice 'production ingestion fields: ok';
end $$;

rollback;
