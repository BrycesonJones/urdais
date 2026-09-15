-- Wave-1 token-pricing identities exist; rights are unchanged; quotes are not
-- seeded; production retrievals remain refused.
begin;

do $$
declare
  ok boolean;
  n integer;
  iface uuid;
  retrieval uuid := 'aaaaaaaa-0000-4000-8000-000000000101';
begin
  select count(*) into n from reference.models m
    join reference.providers p on p.id = m.provider_id
    where p.slug = 'anthropic';
  if n <> 4 then raise exception 'expected 4 Anthropic models, found %', n; end if;
  select count(*) into n from reference.models m
    join reference.providers p on p.id = m.provider_id
    where p.slug = 'xai';
  if n <> 7 then raise exception 'expected 7 xAI models, found %', n; end if;
  select count(*) into n from reference.models m
    join reference.providers p on p.id = m.provider_id
    where p.slug = 'openai';
  if n <> 7 then raise exception 'expected 7 OpenAI models, found %', n; end if;

  if not exists (
    select 1 from reference.models
    where provider_model_id = 'claude-haiku-4-5-20251001'
  ) then raise exception 'dated Haiku identity missing'; end if;
  if exists (
    select 1 from reference.models
    where provider_model_id in ('claude-haiku-4-5', 'gpt-daybreak-blue-latest', 'gpt-daybreak-red-latest')
  ) then raise exception 'an alias was seeded as a model'; end if;

  if not exists (
    select 1 from reference.model_aliases
    where alias = 'claude-haiku-4-5' and alias_kind = 'family_alias'
  ) then raise exception 'Haiku family alias missing'; end if;
  if not exists (
    select 1 from reference.model_aliases
    where alias = 'gpt-daybreak-blue-latest' and alias_kind = 'latest_pointer'
  ) then raise exception 'OpenAI daybreak blue alias missing'; end if;

  select count(*) into n from pipeline.token_price_observations;
  if n <> 0 then raise exception 'token prices were seeded'; end if;

  -- Every token-pricing source, both waves. A source added without its rights
  -- being covered here is a source nobody is watching.
  select count(*) into n from reference.source_interfaces
    where slug in ('anthropic-api-pricing-docs', 'xai-models-docs', 'openai-api-pricing-docs',
                   'google-gemini-api-pricing-docs', 'deepseek-api-pricing-docs', 'alibaba-model-studio-pricing-docs',
                   'moonshot-kimi-api-pricing-docs')
      and production_access_state = 'research_usable'
      and terms_review_state = 'under_review'
      and data_use_terms_state = 'under_review';
  if n <> 7 then raise exception 'token source rights drifted, found % matching rows', n; end if;

  -- The designated Wave-3 benchmark model exists.
  select count(*) into n from reference.models m join reference.providers p on p.id = m.provider_id
   where p.slug = 'moonshot' and m.provider_model_id = 'kimi-k3';
  if n <> 1 then raise exception 'the designated Moonshot benchmark model is missing'; end if;

  -- Wave-2 identities exist and are attached to the right providers.
  select count(*) into n from reference.models m join reference.providers p on p.id = m.provider_id
   where p.slug = 'google' and m.provider_model_id = 'gemini-3.1-pro-preview';
  if n <> 1 then raise exception 'the designated Google benchmark model is missing'; end if;
  select count(*) into n from reference.models m join reference.providers p on p.id = m.provider_id
   where p.slug = 'alibaba' and m.provider_model_id = 'qwen3.8-max';
  if n <> 1 then raise exception 'the designated Alibaba benchmark model is missing'; end if;
  select count(*) into n from reference.models m join reference.providers p on p.id = m.provider_id
   where p.slug = 'deepseek' and m.provider_model_id = 'deepseek-v4-pro';
  if n <> 1 then raise exception 'the DeepSeek model is missing; it is collected even though its benchmark is withheld'; end if;

  select id into iface from reference.source_interfaces where slug = 'anthropic-api-pricing-docs';

  ok := false;
  begin
    insert into pipeline.source_retrievals (
      id, source_interface_id, idempotency_key, requested_at, request_method, request_url,
      response_status, response_hash, enumeration_assessment, retrieval_purpose
    ) values (
      retrieval, iface, 'token-pricing-wave1-prod:1', now(), 'GET',
      'https://docs.anthropic.com/en/docs/about-claude/pricing',
      200, repeat('b', 64), 'unknown', 'production'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'production retrieval against an under_review token source was accepted'; end if;

  insert into pipeline.source_retrievals (
    id, source_interface_id, idempotency_key, requested_at, request_method, request_url,
    response_status, response_hash, enumeration_assessment, retrieval_purpose,
    collector_identity, request_parameters
  ) values (
    retrieval, iface, 'token-pricing-wave1-research:1', now(), 'manual_read',
    'https://docs.anthropic.com/en/docs/about-claude/pricing',
    200, repeat('c', 64), 'unknown', 'research',
    'tokens-ingest/anthropic@tokens.anthropic.pricing.html.v1',
    '{"parserId":"tokens.anthropic.pricing.html.v1"}'::jsonb
  );

  insert into pipeline.token_price_observations (
    model_id, pricing_dimension, source_native_price, source_native_currency,
    source_native_denominator_tokens, canonical_price_usd_per_1m,
    service_tier, source_interface_id, source_retrieval_id, retrieved_at
  ) values (
    '99999999-a002-4000-8000-000000000003',
    'input', 2, 'USD', 1000000, 2, 'standard', iface, retrieval, '2026-09-14T03:10:00Z'
  );

  raise notice 'token pricing wave1 models: ok';
end
$$;

rollback;
