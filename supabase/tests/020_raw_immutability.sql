-- Raw evidence is append-only for every role, and lineage cannot cascade away.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'public_unauthenticated');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url, response_status, response_hash, record_count, enumeration_assessment)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:1', '2026-09-13T04:00:00Z', '2026-09-13T04:00:01Z', 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), 1, 'unknown');
insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price, native_currency)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{"x":1}', '2026-09-13T04:00:00Z', 1.5, 'USD');

do $$
declare
  ok boolean;
  before_hash text;
  after_hash text;
begin
  select record_hash into before_hash from pipeline.raw_offers where id = 'dddddddd-0000-4000-8000-000000000001';

  -- UPDATE on a raw offer is rejected, even as superuser.
  ok := false;
  begin
    update pipeline.raw_offers set native_price = 99 where id = 'dddddddd-0000-4000-8000-000000000001';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'raw offer UPDATE was permitted'; end if;

  -- DELETE on a raw offer is rejected.
  ok := false;
  begin
    delete from pipeline.raw_offers where id = 'dddddddd-0000-4000-8000-000000000001';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'raw offer DELETE was permitted'; end if;

  -- UPDATE / DELETE on a retrieval are rejected.
  ok := false;
  begin
    update pipeline.source_retrievals set record_count = 2 where id = 'cccccccc-0000-4000-8000-000000000001';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'retrieval UPDATE was permitted'; end if;
  ok := false;
  begin
    delete from pipeline.source_retrievals where id = 'cccccccc-0000-4000-8000-000000000001';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'retrieval DELETE was permitted'; end if;

  -- The interface behind the evidence cannot be deleted out from under it.
  ok := false;
  begin
    delete from reference.source_interfaces where id = 'bbbbbbbb-0000-4000-8000-000000000011';
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'source interface with retrievals was deletable'; end if;

  -- Nothing changed.
  select record_hash into after_hash from pipeline.raw_offers where id = 'dddddddd-0000-4000-8000-000000000001';
  if before_hash <> after_hash then raise exception 'raw offer changed'; end if;

  -- Idempotent re-insert of the same retrieval row is a no-op conflict, not a duplicate.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
    values ('cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{"x":1}', '2026-09-13T04:00:00Z');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate (retrieval, row_ordinal) was accepted'; end if;

  -- The same idempotency key cannot create a second retrieval.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, enumeration_assessment)
    values ('bbbbbbbb-0000-4000-8000-000000000011', 'test:1', '2026-09-13T05:00:00Z', 'GET', 'https://example.invalid/offers', 'unknown');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate idempotency key was accepted'; end if;

  -- An identical observation at a different time is a different row on purpose.
  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
  values ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:2', '2026-09-14T04:00:00Z', 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), 'unknown');
  insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price, native_currency)
  values ('cccccccc-0000-4000-8000-000000000002', 0, repeat('b', 64), '{"x":1}', '2026-09-14T04:00:00Z', 1.5, 'USD');
  if (select count(*) from pipeline.raw_offers where record_hash = repeat('b', 64)) <> 2 then
    raise exception 'repeated identical observation across retrievals was not retained';
  end if;

  raise notice 'raw immutability: ok';
end $$;

rollback;
