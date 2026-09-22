-- Grok 4.7: the identity behind xAI's designation change of 22 September 2026.
--
-- The operator's manual review of docs.x.ai/docs/models on 22 September 2026
-- found Grok 4.7 published as the current general-purpose Grok, at the same
-- $2 input / $6 output under 200k prompt tokens that Grok 4.6 carries. Under
-- docs/methodology/token-price.md that is a constituent change: the designated
-- model is the provider's current broadly available flagship, and it has moved.
--
-- The identity is seeded here; nothing else. No price is written, because a
-- price comes from ingesting a retained first-party artifact through the
-- operator verification, never from a migration. The designation itself is
-- effective-dated in src/lib/tokens/read/benchmark.ts under methodology 1.3,
-- and Grok 4.6 stays exactly where it is: its frozen benchmark, its
-- observations and its lineage are untouched, and the published history is
-- assembled segment by segment across the boundary rather than rewritten.
--
-- Grok 4.6 keeps `lifecycle_status = 'current'` deliberately. The operator's
-- review found it still published with a live price, and marking it retired
-- would assert a first-party fact nobody attested to.

insert into reference.models (
  id, provider_id, provider_model_id, display_name, model_family, version, lifecycle_status
) values
  ('99999999-a004-4000-8000-000000000008', '77777777-0000-4000-8000-000000000004', 'grok-4.7', 'Grok 4.7', 'Grok', '4.7', 'current')
on conflict (id) do nothing;

do $$
declare
  n integer;
begin
  select count(*) into n from reference.models m
    join reference.providers p on p.id = m.provider_id
   where p.slug = 'xai' and m.provider_model_id = 'grok-4.7';
  if n <> 1 then raise exception 'grok-4.7 was not seeded exactly once, found %', n; end if;

  -- Ingestion writes prices; a migration never does.
  select count(*) into n
    from pipeline.token_price_observations o
    join reference.models m on m.id = o.model_id
   where m.provider_model_id = 'grok-4.7';
  if n <> 0 then raise exception 'grok-4.7 observations were seeded; quotes come from a verified artifact, found %', n; end if;

  -- The predecessor's record is untouched. A designation change never rewrites
  -- the value it succeeds.
  select count(*) into n
    from pipeline.token_price_observations o
    join reference.models m on m.id = o.model_id
   where m.provider_model_id = 'grok-4.6';
  raise notice 'grok-4.6 retains % canonical observation(s), unchanged', n;

  -- Nothing here grants a collection right.
  select count(*) into n from reference.source_interfaces
   where slug = 'xai-models-docs'
     and production_access_state = 'research_usable'
     and terms_review_state = 'under_review'
     and data_use_terms_state = 'under_review';
  if n <> 1 then raise exception 'the xai source rights changed; a model seed must never move them'; end if;
end
$$;
