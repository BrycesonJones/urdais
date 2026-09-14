-- Wave-1 token-pricing identities for Anthropic, xAI, and OpenAI.
--
-- Phase 1 created the tables and identity rules and explicitly stored no
-- catalog. That was insufficient for ingestion: parsers need stable
-- provider-native ids to resolve, and aliases must exist so latest pointers
-- are not inserted as models. This migration seeds those identities only.
-- It does not seed token_price_observations, does not change source-interface
-- rights, and does not add schema.

insert into reference.models (
  id, provider_id, provider_model_id, display_name, model_family, version, lifecycle_status
) values
  ('99999999-a002-4000-8000-000000000001', '77777777-0000-4000-8000-000000000002', 'claude-fable-5-1', 'Claude Fable 5.1', 'Claude', '5.1', 'current'),
  ('99999999-a002-4000-8000-000000000002', '77777777-0000-4000-8000-000000000002', 'claude-opus-5', 'Claude Opus 5', 'Claude', '5', 'current'),
  ('99999999-a002-4000-8000-000000000003', '77777777-0000-4000-8000-000000000002', 'claude-sonnet-5', 'Claude Sonnet 5', 'Claude', '5', 'current'),
  ('99999999-a002-4000-8000-000000000004', '77777777-0000-4000-8000-000000000002', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'Claude', '4.5-20251001', 'current'),
  ('99999999-a004-4000-8000-000000000001', '77777777-0000-4000-8000-000000000004', 'grok-4.6', 'Grok 4.6', 'Grok', '4.6', 'current'),
  ('99999999-a004-4000-8000-000000000002', '77777777-0000-4000-8000-000000000004', 'grok-4.5', 'Grok 4.5', 'Grok', '4.5', 'current'),
  ('99999999-a004-4000-8000-000000000003', '77777777-0000-4000-8000-000000000004', 'grok-4.3', 'Grok 4.3', 'Grok', '4.3', 'current'),
  ('99999999-a004-4000-8000-000000000004', '77777777-0000-4000-8000-000000000004', 'grok-4.20-0309-reasoning', 'Grok 4.20 Reasoning (0309)', 'Grok', '4.20-0309-reasoning', 'current'),
  ('99999999-a004-4000-8000-000000000005', '77777777-0000-4000-8000-000000000004', 'grok-4.20-0309-non-reasoning', 'Grok 4.20 Non-reasoning (0309)', 'Grok', '4.20-0309-non-reasoning', 'current'),
  ('99999999-a004-4000-8000-000000000006', '77777777-0000-4000-8000-000000000004', 'grok-build-0.1', 'Grok Build 0.1', 'Grok', '0.1', 'current'),
  ('99999999-a004-4000-8000-000000000007', '77777777-0000-4000-8000-000000000004', 'grok-4.20-multi-agent-0309', 'Grok 4.20 Multi-agent (0309)', 'Grok', '4.20-multi-agent-0309', 'current'),
  ('99999999-a001-4000-8000-000000000001', '77777777-0000-4000-8000-000000000001', 'gpt-6-astra', 'GPT-6 Astra', 'GPT', '6', 'current'),
  ('99999999-a001-4000-8000-000000000002', '77777777-0000-4000-8000-000000000001', 'gpt-5.6-sol', 'GPT-5.6 Sol', 'GPT', '5.6', 'current'),
  ('99999999-a001-4000-8000-000000000003', '77777777-0000-4000-8000-000000000001', 'gpt-5.6-terra', 'GPT-5.6 Terra', 'GPT', '5.6', 'current'),
  ('99999999-a001-4000-8000-000000000004', '77777777-0000-4000-8000-000000000001', 'gpt-5.6-luna', 'GPT-5.6 Luna', 'GPT', '5.6', 'current'),
  ('99999999-a001-4000-8000-000000000005', '77777777-0000-4000-8000-000000000001', 'gpt-5.6-cyber', 'GPT-5.6 Cyber', 'GPT', '5.6', 'current'),
  ('99999999-a001-4000-8000-000000000006', '77777777-0000-4000-8000-000000000001', 'gpt-5.3-codex', 'GPT-5.3 Codex', 'Codex', '5.3', 'current'),
  ('99999999-a001-4000-8000-000000000007', '77777777-0000-4000-8000-000000000001', 'gpt-rosalind-research', 'GPT-Rosalind Research', 'GPT-Rosalind', null, 'current');

insert into reference.model_aliases (
  id, provider_id, alias, target_model_id, alias_kind, notes
) values
  (
    '99999999-b002-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000002',
    'claude-haiku-4-5',
    '99999999-a002-4000-8000-000000000004',
    'family_alias',
    'Dateless Haiku 4.5 id is an alias of the dated snapshot, not a floating latest pointer.'
  ),
  (
    '99999999-b001-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000001',
    'gpt-daybreak-blue-latest',
    '99999999-a001-4000-8000-000000000002',
    'latest_pointer',
    'Daybreak blue pointer; retargetable. Not a historical identity.'
  ),
  (
    '99999999-b001-4000-8000-000000000002',
    '77777777-0000-4000-8000-000000000001',
    'gpt-daybreak-red-latest',
    '99999999-a001-4000-8000-000000000005',
    'latest_pointer',
    'Daybreak red pointer; retargetable. Not a historical identity.'
  );

do $$
declare
  n integer;
begin
  select count(*) into n from reference.models;
  if n <> 18 then raise exception 'expected 18 wave-1 models, found %', n; end if;
  select count(*) into n from reference.model_aliases;
  if n <> 3 then raise exception 'expected 3 wave-1 aliases, found %', n; end if;
  select count(*) into n from pipeline.token_price_observations;
  if n <> 0 then raise exception 'token price observations were seeded; quotes come from ingestion'; end if;
  select count(*) into n from reference.source_interfaces
    where slug in ('anthropic-api-pricing-docs', 'xai-models-docs', 'openai-api-pricing-docs')
      and (production_access_state <> 'research_usable'
        or terms_review_state <> 'under_review'
        or data_use_terms_state <> 'under_review');
  if n <> 0 then raise exception 'wave-1 token sources were silently rights-promoted'; end if;
end
$$;
