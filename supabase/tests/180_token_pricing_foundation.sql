-- Token-pricing foundation: taxonomy, identity, USD/1M normalization, and
-- separation of input/output, cache, batch, and context-tier quotes.
-- No production prices remain after rollback.
begin;

do $$
declare
  ok boolean;
  n integer;
  provider uuid;
  iface uuid;
  model uuid;
  retrieval uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
begin
  select id into provider from reference.providers where slug = 'anthropic' and provider_kind = 'model_api_provider';
  if provider is null then raise exception 'anthropic model_api_provider was not seeded'; end if;
  select count(*) into n from reference.providers where provider_kind = 'model_api_provider';
  if n <> 6 then raise exception 'expected 6 model API providers, found %', n; end if;
  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
    where p.provider_kind = 'model_api_provider' and si.is_machine_readable = false
      and si.production_access_state = 'research_usable'
      and si.terms_review_state = 'under_review'
      and si.data_use_terms_state = 'under_review';
  if n <> 6 then raise exception 'expected 6 research-usable token pricing interfaces, found %', n; end if;
  select count(*) into n from reference.models;
  if n <> 18 then raise exception 'expected 18 wave-1 models, found %', n; end if;
  select count(*) into n from pipeline.token_price_observations;
  if n <> 0 then raise exception 'token prices were seeded'; end if;

  select id into iface from reference.source_interfaces where slug = 'anthropic-api-pricing-docs';

  -- latest pointers cannot be models; they belong on model_aliases.
  insert into reference.models (id, provider_id, provider_model_id, display_name, model_family, version, lifecycle_status)
  values ('99999999-0000-4000-8000-000000000001', provider, 'claude-foundation-test', 'Claude foundation test', 'Claude', 'test', 'current')
  returning id into model;

  insert into reference.model_aliases (provider_id, alias, target_model_id, alias_kind)
  values (provider, 'claude-sonnet-5-latest', model, 'latest_pointer');

  ok := false;
  begin
    insert into reference.model_aliases (provider_id, alias, alias_kind)
    values (provider, 'sonnet', 'latest_pointer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a latest_pointer alias that is not a latest id was accepted'; end if;

  ok := false;
  begin
    insert into reference.models (provider_id, provider_model_id, display_name, model_family, lifecycle_status)
    values (provider, 'claude-foundation-test', 'Claude Sonnet', 'Claude', 'current');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate native model id was accepted'; end if;

  insert into pipeline.source_retrievals (
    id, source_interface_id, idempotency_key, requested_at, request_method, request_url,
    response_status, response_hash, enumeration_assessment
  ) values (
    retrieval, iface, 'token-pricing-test:1', now(), 'GET',
    'https://docs.anthropic.com/en/docs/about-claude/pricing',
    200, repeat('a', 64), 'unknown'
  );

  -- USD/1M input and output coexist; blended is rejected.
  insert into pipeline.token_price_observations (
    model_id, pricing_dimension, source_native_price, source_native_currency,
    source_native_denominator_tokens, canonical_price_usd_per_1m,
    service_tier, source_interface_id, source_retrieval_id, retrieved_at
  ) values
    (model, 'input',  2, 'USD', 1000000, 2, 'standard', iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'output', 10, 'USD', 1000000, 10, 'standard', iface, retrieval, '2026-09-14T03:10:00Z');

  ok := false;
  begin
    insert into pipeline.token_price_observations (
      model_id, pricing_dimension, source_native_price, source_native_currency,
      source_native_denominator_tokens, canonical_price_usd_per_1m,
      source_interface_id, retrieved_at
    ) values (model, 'blended', 6, 'USD', 1000000, 6, iface, now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'blended was accepted as a source dimension'; end if;

  -- Cache, batch, and long-context are distinct rows.
  insert into pipeline.token_price_observations (
    model_id, pricing_dimension, source_native_price, source_native_currency,
    source_native_denominator_tokens, canonical_price_usd_per_1m,
    service_tier, context_tier, cache_ttl, source_interface_id, source_retrieval_id, retrieved_at
  ) values
    (model, 'cached_input', 0.20, 'USD', 1000000, 0.20, 'standard', null, null, iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'cache_write',  2.50, 'USD', 1000000, 2.50, 'standard', null, '5m', iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'cache_write',  4.00, 'USD', 1000000, 4.00, 'standard', null, '1h', iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'cache_read',   0.20, 'USD', 1000000, 0.20, 'standard', null, null, iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'input',        1.00, 'USD', 1000000, 1.00, 'batch',    null, null, iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'input',        2.00, 'USD', 1000000, 2.00, 'standard', 'prompt_lt_200k',  null, iface, retrieval, '2026-09-14T03:10:00Z'),
    (model, 'input',        4.00, 'USD', 1000000, 4.00, 'standard', 'prompt_gte_200k', null, iface, retrieval, '2026-09-14T03:10:00Z');

  -- Non-USD without FX cannot carry a canonical USD value.
  ok := false;
  begin
    insert into pipeline.token_price_observations (
      model_id, pricing_dimension, source_native_price, source_native_currency,
      source_native_denominator_tokens, canonical_price_usd_per_1m,
      source_interface_id, retrieved_at
    ) values (model, 'input', 14, 'CNY', 1000000, 2, iface, now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'CNY was silently converted to a canonical USD price'; end if;

  insert into pipeline.token_price_observations (
    model_id, pricing_dimension, source_native_price, source_native_currency,
    source_native_denominator_tokens, canonical_price_usd_per_1m,
    region, source_interface_id, source_retrieval_id, retrieved_at
  ) values (model, 'input', 14, 'CNY', 1000000, null, 'unconverted', iface, retrieval, '2026-09-14T03:10:00Z');

  insert into pipeline.token_price_observations (
    model_id, pricing_dimension, source_native_price, source_native_currency,
    source_native_denominator_tokens, canonical_price_usd_per_1m,
    fx_source, fx_rate, fx_as_of, fx_quoted_as, region,
    source_interface_id, source_retrieval_id, retrieved_at
  ) values (
    model, 'output', 14, 'CNY', 1000000, 2,
    'example-fx-research', 7, '2026-09-14', 'native_per_usd', 'converted',
    iface, retrieval, '2026-09-14T03:10:00Z'
  );

  -- Duplicate facet on the same retrieval is rejected.
  ok := false;
  begin
    insert into pipeline.token_price_observations (
      model_id, pricing_dimension, source_native_price, source_native_currency,
      source_native_denominator_tokens, canonical_price_usd_per_1m,
      source_interface_id, source_retrieval_id, retrieved_at
    ) values (model, 'input', 2, 'USD', 1000000, 2, iface, retrieval, now());
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'duplicate input/standard observation on one retrieval was accepted'; end if;

  -- Append-only: updates are forbidden.
  ok := false;
  begin
    update pipeline.token_price_observations set canonical_price_usd_per_1m = 0 where model_id = model;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'token_price_observations accepted an update'; end if;

  raise notice 'token pricing foundation: ok';
end
$$;

rollback;
