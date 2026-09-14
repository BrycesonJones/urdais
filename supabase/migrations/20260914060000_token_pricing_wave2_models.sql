-- Wave-2 token-pricing identities for Google, DeepSeek and Alibaba.
--
-- Identity seeds only, mirroring src/lib/tokens/catalog.ts. No price is seeded
-- here: quotes come from ingesting a retained first-party artifact, exactly as
-- they do for Wave 1. No source-interface rights change, and the three Wave-2
-- interfaces stay research_usable with both review axes under_review, so
-- automated production retrieval from them remains refused.
--
-- DeepSeek is seeded even though Urdais publishes no headline value for it.
-- Its prices are collected as canonical observations; only the benchmark is
-- withheld, because DeepSeek publishes no standard rate and the methodology
-- selects the standard tier. Collecting a provider and publishing a provider
-- are different decisions and the schema records the first without implying
-- the second.

insert into reference.models (
  id, provider_id, provider_model_id, display_name, model_family, version, lifecycle_status
) values
  ('99999999-a003-4000-8000-000000000001', '77777777-0000-4000-8000-000000000003', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'Gemini', '3.1', 'current'),
  ('99999999-a003-4000-8000-000000000002', '77777777-0000-4000-8000-000000000003', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'Gemini', '2.5', 'current'),
  ('99999999-a003-4000-8000-000000000003', '77777777-0000-4000-8000-000000000003', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 'Gemini', '3.8', 'current'),
  ('99999999-a003-4000-8000-000000000004', '77777777-0000-4000-8000-000000000003', 'gemini-3.7-flash', 'Gemini 3.7 Flash', 'Gemini', '3.7', 'current'),
  ('99999999-a003-4000-8000-000000000005', '77777777-0000-4000-8000-000000000003', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'Gemini', '3.6', 'current'),
  ('99999999-a003-4000-8000-000000000006', '77777777-0000-4000-8000-000000000003', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'Gemini', '3.5', 'current'),
  ('99999999-a003-4000-8000-000000000007', '77777777-0000-4000-8000-000000000003', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'Gemini', '3.5', 'current'),
  ('99999999-a005-4000-8000-000000000001', '77777777-0000-4000-8000-000000000005', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek', 'V4-Pro-0813', 'current'),
  ('99999999-a005-4000-8000-000000000002', '77777777-0000-4000-8000-000000000005', 'deepseek-flash', 'DeepSeek Flash', 'DeepSeek', 'V4.1-Flash', 'current'),
  ('99999999-a006-4000-8000-000000000001', '77777777-0000-4000-8000-000000000006', 'qwen3.8-max', 'Qwen3.8-Max', 'Qwen', '3.8', 'current'),
  ('99999999-a006-4000-8000-000000000002', '77777777-0000-4000-8000-000000000006', 'qwen3.8-max-0902', 'Qwen3.8-Max (0902)', 'Qwen', '3.8-0902', 'current'),
  ('99999999-a006-4000-8000-000000000003', '77777777-0000-4000-8000-000000000006', 'qwen3.8-27b', 'Qwen3.8-27B', 'Qwen', '3.8-27b', 'current'),
  ('99999999-a006-4000-8000-000000000004', '77777777-0000-4000-8000-000000000006', 'qwen3.7-max-2026-06-08', 'Qwen3.7-Max (2026-06-08)', 'Qwen', '3.7-2026-06-08', 'current'),
  ('99999999-a006-4000-8000-000000000005', '77777777-0000-4000-8000-000000000006', 'qwen3.7-max-2026-05-20', 'Qwen3.7-Max (2026-05-20)', 'Qwen', '3.7-2026-05-20', 'current'),
  ('99999999-a006-4000-8000-000000000006', '77777777-0000-4000-8000-000000000006', 'qwen3.6-max-preview', 'Qwen3.6-Max Preview', 'Qwen', '3.6-preview', 'current'),
  ('99999999-a006-4000-8000-000000000007', '77777777-0000-4000-8000-000000000006', 'qwen3-max', 'Qwen3-Max', 'Qwen', '3', 'current');

insert into reference.model_aliases (
  id, provider_id, alias, target_model_id, alias_kind, notes
) values
  (
    '99999999-b006-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000006',
    'qwen3.7-max',
    '99999999-a006-4000-8000-000000000005',
    'family_alias',
    'Published as "Currently equivalent to qwen3.7-max-2026-05-20". A pointer to a dated snapshot, not a separate identity.'
  ),
  (
    '99999999-b005-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000005',
    'deepseek-v4-flash',
    '99999999-a005-4000-8000-000000000002',
    'legacy_name',
    'Retired name still accepted; requests are served by DeepSeek-V4.1-Flash and billed at the Flash price.'
  ),
  (
    '99999999-b005-4000-8000-000000000002',
    '77777777-0000-4000-8000-000000000005',
    'deepseek-v4-flash-vision-exp',
    '99999999-a005-4000-8000-000000000002',
    'legacy_name',
    'Retired name still accepted; requests are served by DeepSeek-V4.1-Flash and billed at the Flash price.'
  );

do $$
declare
  n integer;
begin
  select count(*) into n from reference.models;
  if n <> 34 then raise exception 'expected 34 models after wave 2, found %', n; end if;
  select count(*) into n from reference.model_aliases;
  if n <> 6 then raise exception 'expected 6 aliases after wave 2, found %', n; end if;

  -- Ingestion writes prices; a migration never does. Scoped to the identities
  -- this migration seeds, because a production database already holds Wave-1
  -- observations and asserting a globally empty table would fail there.
  select count(*) into n
    from pipeline.token_price_observations o
    join reference.models m on m.id = o.model_id
    join reference.providers p on p.id = m.provider_id
   where p.slug in ('google', 'deepseek', 'alibaba');
  if n <> 0 then raise exception 'wave-2 token price observations were seeded; quotes come from ingestion, found %', n; end if;

  -- Nothing here grants a collection right.
  select count(*) into n from reference.source_interfaces
    where slug in ('google-gemini-api-pricing-docs', 'deepseek-api-pricing-docs', 'alibaba-model-studio-pricing-docs')
      and (production_access_state <> 'research_usable'
        or terms_review_state <> 'under_review'
        or data_use_terms_state <> 'under_review');
  if n <> 0 then raise exception 'a wave-2 token source was silently rights-promoted'; end if;

  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
   where p.provider_kind = 'model_api_provider' and si.production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a model-api source was production-approved'; end if;
end
$$;
