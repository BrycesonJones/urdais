-- Enumeration completeness is first-class on the retrieval and reaches the
-- diagnostic layer without living in JSON.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'api_key');

do $$
declare
  ok boolean;
  iface uuid := 'bbbbbbbb-0000-4000-8000-000000000011';
  n integer;
begin
  -- All four states persist.
  insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
  values (iface, 'e:complete',   now(), 'GET', 'https://example.invalid/offers', 200, repeat('1', 64), 'complete'),
         (iface, 'e:incomplete', now(), 'GET', 'https://example.invalid/offers', 200, repeat('2', 64), 'incomplete'),
         (iface, 'e:unknown',    now(), 'GET', 'https://example.invalid/offers', 200, repeat('3', 64), 'unknown');

  -- The Phase 2 case: the source claimed completeness (truncated:false) and was wrong.
  insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, request_parameters,
    response_status, response_hash, record_count, source_pagination, source_claimed_complete, enumeration_assessment, enumeration_evidence)
  values (iface, 'e:contradiction', now(), 'GET', 'https://example.invalid/offers', '{"limit":500}',
    200, repeat('4', 64), 64, '{"truncated":false}', true, 'claimed_complete_observed_incomplete',
    'limit 500 requested, 64 returned; a differently ordered query returned 22 other records');

  select count(*) into n from pipeline.source_retrievals where enumeration_assessment = 'claimed_complete_observed_incomplete';
  if n <> 1 then raise exception 'contradiction state did not persist'; end if;

  -- The contradiction state is meaningless without a claim, and is rejected.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, source_claimed_complete, enumeration_assessment)
    values (iface, 'e:bad', now(), 'GET', 'https://example.invalid/offers', 200, repeat('5', 64), null, 'claimed_complete_observed_incomplete');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'contradiction state without a source claim was accepted'; end if;

  -- An invented state is rejected.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
    values (iface, 'e:bad2', now(), 'GET', 'https://example.invalid/offers', 200, repeat('6', 64), 'probably_fine');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'invented enumeration state was accepted'; end if;

  -- The column is typed, not JSON.
  if (select data_type from information_schema.columns where table_schema = 'pipeline' and table_name = 'source_retrievals' and column_name = 'enumeration_assessment') <> 'text' then
    raise exception 'enumeration_assessment is not a typed column';
  end if;

  -- A successful retrieval must retain evidence (a hash at minimum).
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, enumeration_assessment)
    values (iface, 'e:noevidence', now(), 'GET', 'https://example.invalid/offers', 200, 'unknown');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'successful retrieval without response hash was accepted'; end if;

  -- A failed retrieval needs no hash; its error is retained.
  insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, error, enumeration_assessment)
  values (iface, 'e:failed', now(), 'GET', 'https://example.invalid/offers', 403, '{"message":"forbidden"}', 'unknown');

  -- The ENUMERATION_INCOMPLETE diagnostic exists for the assessment layer to reference.
  if not exists (select 1 from reference.diagnostic_codes where code = 'ENUMERATION_INCOMPLETE') then
    raise exception 'ENUMERATION_INCOMPLETE diagnostic is missing';
  end if;

  raise notice 'enumeration: ok';
end $$;

rollback;
