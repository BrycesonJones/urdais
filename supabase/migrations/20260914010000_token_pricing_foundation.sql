-- Token-pricing foundation: reuse the source registry for model-API providers,
-- add model identity tables, and add an append-only observation table for
-- published API token prices. No prices, no models, and no retrievals are
-- seeded. Phase 2 collectors write observations; this migration only makes
-- that write path possible.
--
-- Reuse:
--   reference.providers          one row per lab (kind model_api_provider)
--   reference.source_interfaces  the official pricing/docs page Urdais will read
--   pipeline.source_retrievals   Phase 2 lineage; nullable on observations until then
--
-- Not reused:
--   reference.instruments / pipeline.normalized_observations
--   Those are UCPI compute-price publications. A published API list price is a
--   different economic object and must not be forced through GPU offer fields.
--
-- Not created:
--   a blended-price table. Blended is derived in application code from input
--   and output quotes under an explicit weight version.

alter table reference.providers drop constraint providers_kind_allowed;
alter table reference.providers add constraint providers_kind_allowed
  check (provider_kind in ('cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider', 'other'));

comment on column reference.providers.provider_kind is
  'cloud_provider, marketplace and hardware_vendor are compute-market roles. model_api_provider is a first-party frontier-model API lab. other remains the residual.';

create table reference.models (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references reference.providers (id) on delete restrict,
  provider_model_id   text not null
                        constraint models_provider_model_id_nonempty check (btrim(provider_model_id) <> ''),
  display_name        text not null
                        constraint models_display_name_nonempty check (btrim(display_name) <> ''),
  model_family        text not null
                        constraint models_family_nonempty check (btrim(model_family) <> ''),
  version             text,
  lifecycle_status    text not null
                        constraint models_lifecycle_allowed
                        check (lifecycle_status in ('current', 'deprecated', 'legacy', 'retired')),
  created_at          timestamptz not null default now(),
  unique (provider_id, provider_model_id)
);

comment on table reference.models is
  'A stable provider-native model identity. The key is (provider, provider_model_id). Display names may change; latest-pointer aliases do not belong here.';

create table reference.model_aliases (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references reference.providers (id) on delete restrict,
  alias            text not null
                     constraint model_aliases_alias_nonempty check (btrim(alias) <> ''),
  target_model_id  uuid references reference.models (id) on delete restrict,
  alias_kind       text not null
                     constraint model_aliases_kind_allowed
                     check (alias_kind in ('latest_pointer', 'family_alias', 'legacy_name')),
  notes            text,
  created_at       timestamptz not null default now(),
  unique (provider_id, alias),
  constraint model_aliases_latest_is_pointer
    check (alias_kind <> 'latest_pointer' or alias ~* '(^|[._-])latest$')
);

comment on table reference.model_aliases is
  'Provider-native aliases and latest pointers. They are not historical identities; a pointer may be retargeted without rewriting model rows.';

create table pipeline.token_price_observations (
  id                              uuid primary key default gen_random_uuid(),
  model_id                        uuid not null references reference.models (id) on delete restrict,
  pricing_dimension               text not null
                                    constraint token_price_observations_dimension_allowed
                                    check (pricing_dimension in (
                                      'input', 'output', 'cached_input', 'cache_write', 'cache_read'
                                    )),
  source_native_price             numeric not null
                                    constraint token_price_observations_native_price_nonnegative
                                    check (source_native_price >= 0),
  source_native_currency          char(3) not null
                                    constraint token_price_observations_native_currency_format
                                    check (source_native_currency ~ '^[A-Z]{3}$'),
  source_native_denominator_tokens integer not null
                                    constraint token_price_observations_native_denominator_positive
                                    check (source_native_denominator_tokens > 0),
  canonical_price_usd_per_1m      numeric
                                    constraint token_price_observations_canonical_nonnegative
                                    check (canonical_price_usd_per_1m is null or canonical_price_usd_per_1m >= 0),
  fx_source                       text,
  fx_rate                         numeric
                                    constraint token_price_observations_fx_rate_positive
                                    check (fx_rate is null or fx_rate > 0),
  fx_as_of                        date,
  fx_quoted_as                    text
                                    constraint token_price_observations_fx_quoted_allowed
                                    check (fx_quoted_as is null or fx_quoted_as in ('native_per_usd', 'usd_per_native')),
  region                          text,
  service_tier                    text not null default 'standard'
                                    constraint token_price_observations_tier_allowed
                                    check (service_tier in (
                                      'standard', 'batch', 'fast', 'priority', 'flex', 'peak', 'off_peak'
                                    )),
  context_tier                    text,
  cache_ttl                       text
                                    constraint token_price_observations_cache_ttl_allowed
                                    check (cache_ttl is null or cache_ttl in ('5m', '1h')),
  source_interface_id             uuid not null references reference.source_interfaces (id) on delete restrict,
  source_retrieval_id             uuid references pipeline.source_retrievals (id) on delete restrict,
  source_effective_at             timestamptz,
  retrieved_at                    timestamptz not null,
  created_at                      timestamptz not null default now(),
  constraint token_price_observations_empty_region_is_null
    check (region is null or btrim(region) <> ''),
  constraint token_price_observations_empty_context_is_null
    check (context_tier is null or btrim(context_tier) <> ''),
  -- USD quotes always have a canonical value and never an FX rate.
  -- Non-USD quotes keep canonical null until an explicit FX source is recorded.
  constraint token_price_observations_fx_consistent check (
    (source_native_currency = 'USD'
      and fx_source is null and fx_rate is null and fx_as_of is null and fx_quoted_as is null
      and canonical_price_usd_per_1m is not null)
    or
    (source_native_currency <> 'USD'
      and (
        (canonical_price_usd_per_1m is null
          and fx_source is null and fx_rate is null and fx_as_of is null and fx_quoted_as is null)
        or
        (canonical_price_usd_per_1m is not null
          and fx_source is not null and btrim(fx_source) <> ''
          and fx_rate is not null and fx_as_of is not null and fx_quoted_as is not null)
      ))
  )
);

comment on table pipeline.token_price_observations is
  'One published first-party API token price for one model, one dimension, and one facet set. Append-only. Blended prices are not stored.';

comment on column pipeline.token_price_observations.pricing_dimension is
  'Source-native token class. blended is not a legal value.';
comment on column pipeline.token_price_observations.canonical_price_usd_per_1m is
  'USD per 1 million tokens after explicit normalization. Null only when the native currency is not USD and no FX source has been recorded.';
comment on column pipeline.token_price_observations.service_tier is
  'How the request is served. standard and batch (and peak/off-peak, fast, flex, priority) are distinct rows.';
comment on column pipeline.token_price_observations.context_tier is
  'Provider-native context window band, e.g. prompt_lt_200k. Null means the source published one rate for the full window.';

create unique index token_price_observations_retrieval_facet_idx
  on pipeline.token_price_observations (
    coalesce(source_retrieval_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_id,
    pricing_dimension,
    coalesce(region, ''),
    service_tier,
    coalesce(context_tier, ''),
    coalesce(cache_ttl, '')
  );

create index token_price_observations_model_time_idx
  on pipeline.token_price_observations (model_id, retrieved_at desc);

create trigger token_price_observations_append_only
  before update or delete on pipeline.token_price_observations
  for each row execute function pipeline.forbid_mutation();

alter table reference.models                    enable row level security;
alter table reference.model_aliases             enable row level security;
alter table pipeline.token_price_observations   enable row level security;

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('77777777-0000-4000-8000-000000000001', 'openai',    'OpenAI',            'model_api_provider', 'https://openai.com'),
  ('77777777-0000-4000-8000-000000000002', 'anthropic', 'Anthropic',         'model_api_provider', 'https://www.anthropic.com'),
  ('77777777-0000-4000-8000-000000000003', 'google',    'Google',            'model_api_provider', 'https://ai.google.dev'),
  ('77777777-0000-4000-8000-000000000004', 'xai',       'xAI',               'model_api_provider', 'https://x.ai'),
  ('77777777-0000-4000-8000-000000000005', 'deepseek',  'DeepSeek',          'model_api_provider', 'https://www.deepseek.com'),
  ('77777777-0000-4000-8000-000000000006', 'alibaba',   'Alibaba Cloud',     'model_api_provider', 'https://www.alibabacloud.com')
on conflict (slug) do nothing;

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes
) values
(
  '88888888-0000-4000-8000-000000000001',
  '77777777-0000-4000-8000-000000000001',
  'openai-api-pricing-docs', 'OpenAI API pricing',
  'product_reference_documentation', 'https://platform.openai.com/docs/pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing. Phase 1 research: docs/research/token-pricing/providers/openai.md'
),
(
  '88888888-0000-4000-8000-000000000002',
  '77777777-0000-4000-8000-000000000002',
  'anthropic-api-pricing-docs', 'Anthropic Claude API pricing',
  'product_reference_documentation', 'https://docs.anthropic.com/en/docs/about-claude/pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing. Phase 1 research: docs/research/token-pricing/providers/anthropic.md'
),
(
  '88888888-0000-4000-8000-000000000003',
  '77777777-0000-4000-8000-000000000003',
  'google-gemini-api-pricing-docs', 'Gemini Developer API pricing',
  'product_reference_documentation', 'https://ai.google.dev/gemini-api/docs/pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing for the Gemini Developer API. Vertex AI is a second surface: docs/research/token-pricing/providers/google.md'
),
(
  '88888888-0000-4000-8000-000000000004',
  '77777777-0000-4000-8000-000000000004',
  'xai-models-docs', 'xAI models and text API pricing',
  'product_reference_documentation', 'https://docs.x.ai/docs/models',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing. Phase 1 research: docs/research/token-pricing/providers/xai.md'
),
(
  '88888888-0000-4000-8000-000000000005',
  '77777777-0000-4000-8000-000000000005',
  'deepseek-api-pricing-docs', 'DeepSeek API models and pricing',
  'product_reference_documentation', 'https://api-docs.deepseek.com/quick_start/pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing in USD. Peak/off-peak and cache-hit/miss are facets. docs/research/token-pricing/providers/deepseek.md'
),
(
  '88888888-0000-4000-8000-000000000006',
  '77777777-0000-4000-8000-000000000006',
  'alibaba-model-studio-pricing-docs', 'Alibaba Cloud Model Studio model pricing',
  'product_reference_documentation', 'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party HTML pricing. International vs regional list prices must not be collapsed. docs/research/token-pricing/providers/alibaba-qwen.md'
);

do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.token_price_observations;
  if n <> 0 then raise exception 'token price observations were seeded; Phase 1 stores no quotes'; end if;
  select count(*) into n from reference.models;
  if n <> 0 then raise exception 'models were seeded; Phase 1 stores identity rules, not a live catalog'; end if;
  select count(*) into n from reference.source_interfaces
    where slug like '%pricing%' and provider_id in (
      select id from reference.providers where provider_kind = 'model_api_provider'
    ) and production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a token-pricing source was production-approved'; end if;
end
$$;
