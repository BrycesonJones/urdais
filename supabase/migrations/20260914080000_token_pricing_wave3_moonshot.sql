-- Wave-3 token-pricing identities for Moonshot AI.
--
-- Adds the provider, its first-party source interface and its model identities,
-- mirroring src/lib/tokens/catalog.ts. No price is seeded: quotes come from
-- ingesting a retained first-party artifact, as they do for every other
-- provider.
--
-- The source interface enters at research_usable with both review axes
-- under_review, which is where every token-pricing source sits. Public
-- accessibility is not permission: nothing here licenses automated retrieval,
-- and the database trigger refuses a production retrieval from this interface
-- exactly as it does for the others. Publication of a manually verified reading
-- is a separate question and is unaffected.
--
-- Mistral AI is deliberately absent. Its designation is settled, Mistral Large 3,
-- and its published rates are methodology-compatible at an expected $1.00. What
-- is missing is an immutable identity: the pricing surface publishes only the
-- mutable pointer mistral-large-latest, and seeding a model row would have to
-- name an id that no first-party page states. The assertion below keeps that
-- absence deliberate rather than letting it drift into publication unnoticed.
-- See docs/research/token-pricing/wave3-moonshot-mistral.md.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('77777777-0000-4000-8000-000000000007', 'moonshot', 'Moonshot AI', 'model_api_provider', 'https://www.moonshot.ai')
on conflict (slug) do nothing;

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes
) values
(
  '88888888-0000-4000-8000-000000000007',
  '77777777-0000-4000-8000-000000000007',
  'moonshot-kimi-api-pricing-docs', 'Kimi API Platform model pricing',
  'product_reference_documentation', 'https://platform.moonshot.ai/docs/pricing',
  false, 'documentation', 'research_usable', 'under_review', 'under_review', null,
  'First-party pricing for the international Kimi API Platform, quoted in USD and served from platform.kimi.ai. The page renders its table client-side and the same path also serves first-party markdown with a .md suffix. Moonshot publishes a separate China list in CNY at different numbers for the same models; the two are distinct surfaces and are never mixed. Rights are unreviewed on both axes.'
);

insert into reference.models (
  id, provider_id, provider_model_id, display_name, model_family, version, lifecycle_status
) values
  ('99999999-a007-4000-8000-000000000001', '77777777-0000-4000-8000-000000000007', 'kimi-k3', 'Kimi K3', 'Kimi', 'K3', 'current'),
  ('99999999-a007-4000-8000-000000000002', '77777777-0000-4000-8000-000000000007', 'kimi-k2.6', 'Kimi K2.6', 'Kimi', 'K2.6', 'current'),
  ('99999999-a007-4000-8000-000000000003', '77777777-0000-4000-8000-000000000007', 'kimi-k2.7-code', 'Kimi K2.7 Code', 'Kimi', 'K2.7-code', 'current'),
  ('99999999-a007-4000-8000-000000000004', '77777777-0000-4000-8000-000000000007', 'kimi-k2.7-code-highspeed', 'Kimi K2.7 Code Highspeed', 'Kimi', 'K2.7-code-highspeed', 'current');

do $$
declare
  n integer;
begin
  select count(*) into n from reference.models;
  if n <> 38 then raise exception 'expected 38 models after wave 3, found %', n; end if;

  select count(*) into n from reference.providers where provider_kind = 'model_api_provider';
  if n <> 7 then raise exception 'expected 7 model API providers after wave 3, found %', n; end if;

  -- Ingestion writes prices; a migration never does. Scoped to the identities
  -- this migration seeds, because the database already holds earlier waves.
  select count(*) into n
    from pipeline.token_price_observations o
    join reference.models m on m.id = o.model_id
    join reference.providers p on p.id = m.provider_id
   where p.slug = 'moonshot';
  if n <> 0 then raise exception 'moonshot observations were seeded; quotes come from ingestion, found %', n; end if;

  -- Nothing here grants a collection right.
  select count(*) into n from reference.source_interfaces
    where slug = 'moonshot-kimi-api-pricing-docs'
      and production_access_state = 'research_usable'
      and terms_review_state = 'under_review'
      and data_use_terms_state = 'under_review';
  if n <> 1 then raise exception 'the moonshot source did not enter at unreviewed rights'; end if;

  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
   where p.provider_kind = 'model_api_provider' and si.production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a model-api source was production-approved'; end if;

  -- Mistral is designated but blocked on identity: nothing is seeded for it.
  select count(*) into n from reference.providers where slug = 'mistral';
  if n <> 0 then raise exception 'mistral was seeded before an immutable model identity was verified'; end if;
end
$$;
