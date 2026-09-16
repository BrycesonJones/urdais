-- Model Frontier: benchmark capability against provider list price per 1M tokens.
--
-- Everything here follows the Phase 3A research under docs/research/model-frontier/, which is
-- the implementation contract. Five decisions in that contract are load bearing, and each one
-- is a constraint in this file rather than a comment:
--
--   1. The plotted unit is a canonical priced SKU *plus the source-declared configuration*.
--      Epoch identifies a run as model + reasoning effort, so `gpt-6-astra_max` and
--      `gpt-6-astra_low` are two observations of one purchasable model. They are never
--      collapsed and no representative effort is chosen, which is why the observation table
--      keys on the raw identifier and the link table carries the configuration beside it.
--
--   2. Identity is exact or absent. The link table stores the source identifier verbatim and
--      only `evidenced` rows may reach a chart. Nothing normalises a join key -- no case
--      folding, no suffix stripping, no preview-to-GA inference -- because a wrong link
--      silently moves a point on a public chart, which is worse than a missing point.
--
--   3. Price is selected by name, never by magnitude. `model_price_selections` records the
--      provider's *declared* standard product, and a trigger refuses a selection that does
--      not resolve to exactly one input and one output row. There is deliberately no
--      tie-break: an ambiguous selection excludes the model.
--
--   4. Capability and price carry separate dates. There is no synthetic single as-of, because
--      Urdais holds one price observation date and capability results spanning months.
--
--   5. Only Epoch-administered benchmarks are eligible. Epoch's bundle marks externally
--      sourced files with an `_external.csv` suffix and states they retain their original
--      licensing; V1 ingests none of them, so one licensor covers every row here.

-- ------------------------------------------------------------------ reference: the source
--
-- Epoch AI is a research organisation, not a market participant. It never appears as a lab,
-- a provider of models, or a party to any price -- it is the measurer, in the same way
-- OpenRouter is the observer and never a lab in UTVI.
alter table reference.providers
  drop constraint providers_kind_allowed,
  add constraint providers_kind_allowed
    check (provider_kind in (
      'cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider',
      'statistical_compiler', 'spot_venue', 'chain_data', 'oracle_network',
      'inference_marketplace',
      'research_organization',
      'other'
    ));

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface',
    'catalog_price_interface',
    'availability_interface',
    'product_reference_documentation',
    'hardware_reference_documentation',
    'provider_terms_documentation',
    'price_surface',
    'news_feed',
    'statistical_dataset',
    'exchange_rate_series',
    'chain_data_interface',
    'spot_price_interface',
    'usage_dataset_interface',
    -- Published model-evaluation results: measured capability, not price and not quantity.
    'benchmark_dataset_interface'
  ));

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('3f000000-0000-4000-8000-000000000001', 'epoch-ai', 'Epoch AI', 'research_organization', 'https://epoch.ai')
on conflict (slug) do nothing;

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes)
values
  ('3f000000-0000-4000-8000-000000000002', '3f000000-0000-4000-8000-000000000001',
   'epoch-ai-benchmark-data', 'Epoch AI Capabilities & Benchmarking data bundle',
   'benchmark_dataset_interface', 'https://epoch.ai/data/benchmark_data.zip', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'The published CSV bundle, not the rendered dashboard. Its own README carries the CC BY 4.0 grant and the required citation, so the licence travels with the data. Files suffixed _external.csv are externally sourced and retain their original licensing; V1 ingests only the unsuffixed, Epoch-administered files.')
on conflict (slug) do nothing;

-- The dated terms evidence behind the two permitted axes. Recorded rather than excluded,
-- because in this case the evidence genuinely exists and is short: the grant is stated in the
-- artifact Urdais downloads, which is a stronger position than a terms page read once.
update reference.source_interfaces
   set terms_evidence = jsonb_build_object(
     'reviewed_on', '2026-09-16',
     'scope_note', 'Two distinct populations inside one bundle. Files without the _external.csv suffix are benchmarks Epoch administers itself, using its own harness under documented settings, so Epoch is the author of those measurements and holds the rights it licenses. Files with the suffix are collected from other projects and the bundle states they retain their original licensing; Urdais ingests none of them, so one licensor covers every row published.',
     'commercial_note', 'CC BY 4.0 permits commercial use and redistribution against a single condition, attribution. Model Frontier republishes per-model scores in a commercial product, which is exactly what the licence grants, and renders the required citation on every surface carrying a frontier.',
     'documents', jsonb_build_array(
       jsonb_build_object(
         'title', 'Epoch AI benchmark data bundle README.md',
         'url', 'https://epoch.ai/data/benchmark_data.zip',
         'version_date', '2026-09-16',
         'retrieved_on', '2026-09-16',
         'clauses', jsonb_build_array(
           jsonb_build_object('axis', 'data_use', 'section', 'Licensing',
             'text', 'Epoch AI''s data is free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license.',
             'note', 'The grant ships inside the downloaded artifact, so it cannot drift from the data it covers. The ingestion refuses a bundle whose README no longer states it.'),
           jsonb_build_object('axis', 'attribution', 'section', 'Citation',
             'text', 'Epoch AI, ''Capabilities & Benchmarking''. Published online at epoch.ai. Retrieved from ''https://epoch.ai/benchmarks'' [online resource].',
             'note', 'Frozen onto every retrieval and rendered with the chart. A value whose citation cannot be rendered does not serve.'))),
       jsonb_build_object(
         'title', 'Epoch AI — Data | Benchmarking',
         'url', 'https://epoch.ai/benchmarks/use-this-data',
         'version_date', '2026-09-16',
         'retrieved_on', '2026-09-16',
         'clauses', jsonb_build_array(
           jsonb_build_object('axis', 'scope', 'section', 'External data',
             'text', 'This hub also includes data sourced from external projects, which retains its original licensing.',
             'note', 'The reason V1 ingests only Epoch-administered files. Eligibility is decided by the _external.csv filename convention, which makes it mechanical rather than a judgement.'))))
   )
 where slug = 'epoch-ai-benchmark-data';

-- CC BY 4.0 grants exactly what Model Frontier needs -- reproduction and redistribution,
-- commercial use included -- against one condition, attribution. Recorded as the grant the
-- retrievals run under, in the same shape as OpenRouter's.
insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   granted_on, effective_from, evidence)
values
  ('3f000000-0000-4000-8000-000000000003', '3f000000-0000-4000-8000-000000000002',
   'provider_terms', 'Epoch AI benchmark data bundle README.md, CC BY 4.0', true, true,
   date '2026-09-16', timestamptz '2026-09-16T00:00:00Z',
   'README.md inside benchmark_data.zip, retrieved 2026-09-16: "Epoch AI''s data is free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license." The same file gives the required citation: "Epoch AI, ''Capabilities & Benchmarking''. Published online at epoch.ai." For its internally administered benchmarks Epoch is the author of the measurements, so it holds the rights it licenses.')
on conflict (id) do nothing;

-- ------------------------------------------------------------------ retrievals

create table pipeline.capability_retrievals (
  id                     uuid primary key default gen_random_uuid(),
  source_retrieval_id    uuid not null unique references pipeline.source_retrievals (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  -- The bundle is served from one stable path with no version in the URL, so the only
  -- deterministic identity it has is the hash of the bytes. That is what makes an unchanged
  -- re-read recognisable as unchanged rather than as a second observation.
  bundle_content_hash    text not null
                           constraint capability_retrievals_bundle_hash_format
                           check (bundle_content_hash ~ '^[0-9a-f]{64}$'),
  bundle_byte_length     integer
                           constraint capability_retrievals_bundle_length_positive
                           check (bundle_byte_length is null or bundle_byte_length > 0),
  -- Frozen from the bundle's own README, not from configuration, so a stored row can be
  -- cited exactly as the licensor asked at the moment it was retrieved.
  source_citation        text not null
                           constraint capability_retrievals_citation_nonempty
                           check (btrim(source_citation) <> ''),
  source_license         text not null
                           constraint capability_retrievals_license_nonempty
                           check (btrim(source_license) <> ''),
  retrieved_at           timestamptz not null,
  outcome                text not null
                           constraint capability_retrievals_outcome_allowed
                           check (outcome in ('succeeded', 'http_error', 'malformed', 'transport_error')),
  outcome_detail         text,
  benchmark_file_count   integer
                           constraint capability_retrievals_file_count_nonneg
                           check (benchmark_file_count is null or benchmark_file_count >= 0),
  row_count              integer
                           constraint capability_retrievals_row_count_nonneg
                           check (row_count is null or row_count >= 0),
  created_at             timestamptz not null default now(),

  constraint capability_retrievals_success_has_counts
    check (outcome <> 'succeeded' or (benchmark_file_count is not null and row_count is not null)),
  constraint capability_retrievals_failure_has_detail
    check (outcome = 'succeeded' or outcome_detail is not null)
);

comment on table pipeline.capability_retrievals is
  'One read of the Epoch benchmark bundle. Identity is the hash of the bytes, because the bundle is served from a single unversioned path; an unchanged re-read produces the same hash and writes no new observations.';

create index capability_retrievals_hash_idx on pipeline.capability_retrievals (bundle_content_hash);
create index capability_retrievals_retrieved_idx on pipeline.capability_retrievals (retrieved_at desc);

-- ------------------------------------------------------------------ observations

create table pipeline.capability_observations (
  id                        uuid primary key default gen_random_uuid(),
  capability_retrieval_id   uuid not null references pipeline.capability_retrievals (id) on delete restrict,
  source_interface_id       uuid not null references reference.source_interfaces (id) on delete restrict,

  -- The benchmark as Urdais names it, and as the source named it. Both, because the source's
  -- own name carries the version in it ("FrontierMath-Tiers-1-3-v2-Private") and a benchmark
  -- whose question set was replaced is a different test, not a later reading of the same one.
  benchmark_slug            text not null
                              constraint capability_observations_benchmark_slug_format
                              check (benchmark_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_benchmark_name     text not null
                              constraint capability_observations_source_benchmark_nonempty
                              check (btrim(source_benchmark_name) <> ''),
  source_benchmark_file     text not null
                              constraint capability_observations_source_file_nonempty
                              check (btrim(source_benchmark_file) <> ''),
  -- V1 ingests only Epoch-administered files. The column exists so the rule is enforced in
  -- the data rather than remembered by a collector.
  is_source_administered    boolean not null default true
                              constraint capability_observations_administered_only
                              check (is_source_administered),

  -- Verbatim, exactly as published. Never parsed into, never rewritten.
  source_model_identifier   text not null
                              constraint capability_observations_identifier_nonempty
                              check (btrim(source_model_identifier) <> ''),
  -- The configuration the source declared, or null where it declared none. Null renders as
  -- "(as published)" and is never filled in with a guess.
  source_configuration      text
                              constraint capability_observations_configuration_nonempty
                              check (source_configuration is null or btrim(source_configuration) <> ''),
  source_organization       text,

  score                     numeric not null,
  score_min                 numeric not null default 0,
  score_max                 numeric not null,
  capability_as_of          date not null,

  source_citation           text not null
                              constraint capability_observations_citation_nonempty
                              check (btrim(source_citation) <> ''),
  source_license            text not null
                              constraint capability_observations_license_nonempty
                              check (btrim(source_license) <> ''),
  row_content_hash          text not null
                              constraint capability_observations_row_hash_format
                              check (row_content_hash ~ '^[0-9a-f]{64}$'),

  superseded_by_id          uuid references pipeline.capability_observations (id) on delete restrict
                              deferrable initially deferred,
  superseded_at             timestamptz,
  supersession_reason       text,
  created_at                timestamptz not null default now(),

  constraint capability_observations_score_within_bounds
    check (score >= score_min and score <= score_max),
  constraint capability_observations_bounds_ordered
    check (score_max > score_min),
  constraint capability_observations_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)),

  unique (capability_retrieval_id, benchmark_slug, source_model_identifier)
);

comment on table pipeline.capability_observations is
  'One published benchmark result for one source-declared model configuration. The source identifier is stored verbatim and the configuration beside it, because a reasoning-effort run is an observation of a purchasable model under settings, not a separate product. Append-only; a revised result supersedes.';

-- One live result per benchmark and source identifier. The invariant the read layer depends on.
create unique index capability_observations_active_idx
  on pipeline.capability_observations (benchmark_slug, source_model_identifier)
  where superseded_by_id is null;

create index capability_observations_retrieval_idx on pipeline.capability_observations (capability_retrieval_id);
create index capability_observations_benchmark_idx on pipeline.capability_observations (benchmark_slug, capability_as_of desc);

-- ------------------------------------------------------------------ identity bridge

create table reference.capability_model_links (
  id                       uuid primary key default gen_random_uuid(),
  source_interface_id      uuid not null references reference.source_interfaces (id) on delete restrict,
  -- The join key, verbatim. Equality against this column is the only join permitted.
  source_model_identifier  text not null
                             constraint capability_model_links_identifier_nonempty
                             check (btrim(source_model_identifier) <> ''),
  model_id                 uuid references reference.models (id) on delete restrict,
  source_configuration     text,
  link_state               text not null
                             constraint capability_model_links_state_allowed
                             check (link_state in ('evidenced', 'ambiguous', 'unmapped', 'not_applicable')),
  -- Why this link is asserted, in words, sufficient for a later reader to check it.
  evidence                 text not null
                             constraint capability_model_links_evidence_nonempty
                             check (btrim(evidence) <> ''),
  linked_by                text not null,
  linked_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),

  unique (source_interface_id, source_model_identifier),

  -- Only an evidenced link names a model, and every evidenced link must.
  constraint capability_model_links_evidenced_has_model
    check (link_state <> 'evidenced' or model_id is not null),
  constraint capability_model_links_unevidenced_has_no_model
    check (link_state = 'evidenced' or model_id is null)
);

comment on table reference.capability_model_links is
  'Maps a source model identifier, verbatim, to a canonical Urdais model. Only evidenced links may be plotted. ambiguous, unmapped and not_applicable keep the observation and refuse the join, which is the same asymmetry UTVI applies to lab identity and for the same reason: a wrong link silently moves a point on a public chart.';

create index capability_model_links_model_idx on reference.capability_model_links (model_id) where model_id is not null;
create index capability_model_links_state_idx on reference.capability_model_links (link_state);

-- ------------------------------------------------------------------ price selection

create table reference.model_price_selections (
  id             uuid primary key default gen_random_uuid(),
  model_id       uuid not null unique references reference.models (id) on delete restrict,
  -- Named product characteristics. Never a price, never an aggregate, never "latest wins".
  service_tier   text not null,
  context_tier   text,
  region         text,
  rationale      text not null
                   constraint model_price_selections_rationale_nonempty
                   check (btrim(rationale) <> ''),
  effective_from date not null,
  created_at     timestamptz not null default now()
);

comment on table reference.model_price_selections is
  'The named standard product whose price represents a model on Model Frontier: service tier, the provider-declared base context tier, and the provider-declared base region. Selection is by name so that no rule can prefer a cheaper row; a selection resolving to zero or several rows excludes the model rather than being tie-broken.';

-- A selection that does not resolve to exactly one input and one output row is not a
-- selection. Refusing it here means an ambiguous model can never be silently plotted at
-- whichever price happened to sort first.
create or replace function reference.check_model_price_selection()
returns trigger
language plpgsql
as $$
declare
  n_in integer;
  n_out integer;
begin
  select count(*) filter (where o.pricing_dimension = 'input'),
         count(*) filter (where o.pricing_dimension = 'output')
    into n_in, n_out
    from pipeline.token_price_observations o
   where o.model_id = new.model_id
     and o.service_tier is not distinct from new.service_tier
     and o.context_tier is not distinct from new.context_tier
     and o.region is not distinct from new.region;

  if n_in <> 1 or n_out <> 1 then
    raise exception 'price selection for model % resolves to % input and % output rows; exactly one of each is required',
      new.model_id, n_in, n_out using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger model_price_selections_resolve_exactly_one
  before insert or update on reference.model_price_selections
  for each row execute function reference.check_model_price_selection();

-- ------------------------------------------------------------------ methodology governance

insert into reference.methodologies (id, slug, name, document_path) values
  ('3f000000-0000-4000-8000-000000000010', 'model-frontier', 'Urdais Model Frontier',
   'docs/methodology/model-frontier.md')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ price selection rule
--
-- The table above is deliberately left empty by this migration. Its rows derive from
-- `pipeline.token_price_observations`, which is production data: a migration that seeded it
-- would embed production state in schema, would be untestable on a fresh harness, and would
-- disagree with any catalogue change made after it ran. Population is an operator step, run
-- by `npm run frontier:select-prices`, and the rule it applies is:
--
--   service tier   'standard'. Named, not cheapest: batch is materially cheaper and is a
--                  different product with different latency guarantees, so a cheapest-wins
--                  rule would systematically select it. A provider publishing no standard
--                  tier -- DeepSeek, whose catalogue is peak/off-peak -- yields no eligible
--                  price and is excluded, exactly as Token Price already refuses it.
--
--   context tier   the provider's declared base tier: short_context (OpenAI),
--                  prompt_lte_200k (Google), prompt_lt_200k (xAI), or none where the
--                  provider publishes one price for the model.
--
--   region         the provider's declared base region: none where one price is quoted
--                  globally, 'international' for Alibaba and Moonshot. Anthropic is null --
--                  its published table is the global list, its documentation states the
--                  first-party API is "global by default", and region 'us' is the
--                  inference_geo data-residency option at a 1.1x multiplier, an opt-in
--                  variant rather than the base product. claude-haiku-4-5-20251001 has no
--                  'us' row at all, so a 'us' rule would unprice a model for lacking a
--                  surcharge.
--
-- The trigger enforces the part that matters regardless of who writes the row: a selection
-- resolving to anything other than exactly one input and one output observation is refused,
-- so an ambiguous model can never be plotted at whichever price happened to sort first.

-- Model Frontier methodology 1.0.0, approved. The read surface refuses to serve while the
-- governing version is a draft, so this row is the activation switch and nothing else is --
-- the same discipline UTVI applies, and the reason a half-built chart cannot reach a reader.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('3f000000-0000-4000-8000-000000000011', '3f000000-0000-4000-8000-000000000010',
   '1.0.0', 'approved', 'docs/methodology/model-frontier.md',
   -- sha256 of docs/methodology/model-frontier.md at this commit.
   'bb41d02152e5e8f7e233168bd68c96a70870c51c259fa80a16608974ef617caf', date '2026-09-16')
on conflict (methodology_id, version) do nothing;

do $$
begin
  if not exists (select 1 from reference.methodology_versions v
                  join reference.methodologies m on m.id = v.methodology_id
                 where m.slug = 'model-frontier' and v.status = 'approved'
                   and v.effective_from is not null) then
    raise exception 'Model Frontier has no approved methodology version with an effective date';
  end if;
end $$;

-- Row level security, as every table in both schemas carries. These hold licensed source
-- data and the reference layers that join it to a price; none is reachable by a public role.
alter table pipeline.capability_retrievals    enable row level security;
alter table pipeline.capability_observations  enable row level security;
alter table reference.capability_model_links  enable row level security;
alter table reference.model_price_selections  enable row level security;
