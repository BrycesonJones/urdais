-- Exact numerics with sane bounds, sparse source nulls allowed, and no
-- timestamp substitution.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'api_key');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:1', '2026-09-13T04:00:00Z', 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), 'unknown');

do $$
declare
  ok boolean;
  r uuid := 'cccccccc-0000-4000-8000-000000000001';
  stored_price numeric;
  eff timestamptz;
  col_default text;
begin
  -- Price precision is exact: a marketplace-style repeating decimal survives untouched.
  insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price, native_currency, native_billing_unit)
  values ('dddddddd-0000-4000-8000-000000000001', r, 0, repeat('b', 64), '{}', '2026-09-13T04:00:00Z', 1.468888888888889, 'USD', 'per_hour');
  select native_price into stored_price from pipeline.raw_offers where id = 'dddddddd-0000-4000-8000-000000000001';
  if stored_price <> 1.468888888888889 then raise exception 'price lost precision: %', stored_price; end if;
  if (select data_type from information_schema.columns where table_schema = 'pipeline' and table_name = 'raw_offers' and column_name = 'native_price') <> 'numeric' then
    raise exception 'native_price is not numeric';
  end if;
  if (select data_type from information_schema.columns where table_schema = 'pipeline' and table_name = 'normalized_observations' and column_name = 'normalized_price') <> 'numeric' then
    raise exception 'normalized_price is not numeric';
  end if;

  -- Negative price rejected.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price)
    values (r, 1, repeat('c', 64), '{}', now(), -1);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'negative price was accepted'; end if;

  -- Zero or negative GPU counts rejected.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_gpu_count)
    values (r, 2, repeat('c', 64), '{}', now(), 0);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'gpu_count 0 was accepted'; end if;

  -- A machine fraction above one is nonsense.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_machine_fraction)
    values (r, 3, repeat('c', 64), '{}', now(), 1.5);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'machine fraction > 1 was accepted'; end if;

  -- Malformed currency rejected; quote-only (null price) allowed.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_currency)
    values (r, 4, repeat('c', 64), '{}', now(), 'usd');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'lowercase currency was accepted'; end if;
  insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price, native_availability_value, availability_observed_at)
  values (r, 5, repeat('c', 64), '{"price":"contact us"}', now(), null, 'quote_required', now());

  -- Source reality is sparse: a row with almost nothing is still a valid raw record.
  insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
  values (r, 6, repeat('d', 64), '{"label":"H100"}', '2026-09-13T04:00:00Z');

  -- source_effective_at stays NULL when not supplied. No default, no substitution.
  select source_effective_at into eff from pipeline.raw_offers where retrieval_id = r and row_ordinal = 6;
  if eff is not null then raise exception 'source_effective_at was defaulted to %', eff; end if;
  select column_default into col_default from information_schema.columns
   where table_schema = 'pipeline' and table_name = 'raw_offers' and column_name = 'source_effective_at';
  if col_default is not null then raise exception 'source_effective_at has a column default: %', col_default; end if;
  select column_default into col_default from information_schema.columns
   where table_schema = 'pipeline' and table_name = 'raw_offers' and column_name = 'availability_observed_at';
  if col_default is not null then raise exception 'availability_observed_at has a column default: %', col_default; end if;
  select column_default into col_default from information_schema.columns
   where table_schema = 'pipeline' and table_name = 'normalized_observations' and column_name = 'source_effective_at';
  if col_default is not null then raise exception 'normalized source_effective_at has a column default'; end if;

  -- An availability value must carry the time it was observed.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_availability_value)
    values (r, 7, repeat('e', 64), '{}', now(), 'true');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'availability value without availability_observed_at was accepted'; end if;

  -- A source that does state an effective time keeps it distinct from observed_at.
  insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, source_effective_at)
  values (r, 8, repeat('f', 64), '{}', '2026-09-13T04:00:00Z', '2026-03-01T00:00:00Z');
  if (select source_effective_at from pipeline.raw_offers where retrieval_id = r and row_ordinal = 8) = '2026-09-13T04:00:00Z' then
    raise exception 'source_effective_at collapsed into observed_at';
  end if;

  -- Fee and tax fields are retained as the source gave them, not interpreted here.
  insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, native_price, native_currency,
    native_price_components, native_fee_fields, native_tax_fields, native_promotional_fields, native_bid_fields)
  values (r, 9, repeat('9', 64), '{}', now(), 2.9355555555555557, 'USD',
    '{"dph_base":2.9333333333333336,"storage_total_cost":0.0022222222222222222}',
    '{"inet_down_cost":0.0026041666666666665,"inet_up_cost":0.00390625}',
    null,
    '{"discount_rate":0.0}',
    '{"min_bid":2.934}');

  raise notice 'numeric and timestamps: ok';
end $$;

rollback;
