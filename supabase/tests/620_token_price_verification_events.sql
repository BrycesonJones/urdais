-- Human verification events: append-only, idempotent, and unable to name a model
-- for a provider that has none designated.
--
-- The table exists because an unchanged review wrote nothing anywhere: no price
-- observation (nothing moved), no benchmark point (nothing recalculated) and no
-- retrieval (the artifact is byte-identical, and a manual retrieval is keyed by
-- hash). Those rules are all correct and none of them was relaxed; the event
-- that actually happened is recorded here instead.
begin;

do $$
declare
  ok         boolean;
  n          integer;
  provider   uuid;
  iface      uuid;
  model      uuid;
  event      uuid;
begin
  select si.provider_id, si.id into provider, iface
    from reference.source_interfaces si where si.slug = 'xai-models-docs';
  if provider is null then raise exception 'the xAI source interface is missing'; end if;

  select id into model from reference.models where provider_model_id = 'grok-4.7';
  if model is null then raise exception 'grok-4.7 identity is missing'; end if;

  -- RLS is on, like every other table in these schemas.
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'pipeline' and c.relname = 'token_price_verifications' and c.relrowsecurity;
  if n <> 1 then raise exception 'token_price_verifications does not have row level security'; end if;

  insert into pipeline.token_price_verifications (
    id, provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
    verification_purpose, observed_state, benchmark_model_id, methodology_version
  ) values (
    'bbbbbbbb-0000-4000-8000-000000000001', provider, iface,
    'token-verification:xai:2026-09-22T09:15:00.000Z:test', 'Urdais operator',
    '2026-09-22T09:15:00Z', 'Read docs.x.ai/docs/models and confirmed grok-4.7 at 2 input / 6 output under 200k prompt tokens.',
    'production', 'value', model, '1.3'
  ) returning id into event;

  -- Replaying the same attestation records it once. This is what lets an operator
  -- re-run a verification without stacking duplicate evidence.
  insert into pipeline.token_price_verifications (
    provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
    verification_purpose, observed_state, benchmark_model_id, methodology_version
  ) values (
    provider, iface, 'token-verification:xai:2026-09-22T09:15:00.000Z:test', 'Urdais operator',
    '2026-09-22T09:15:00Z', 'the same statement again', 'production', 'value', model, '1.3'
  ) on conflict (idempotency_key) do nothing;

  select count(*) into n from pipeline.token_price_verifications
   where idempotency_key = 'token-verification:xai:2026-09-22T09:15:00.000Z:test';
  if n <> 1 then raise exception 'a replayed attestation was recorded % times', n; end if;

  -- A later review is a new event even though no price moved, which is the entire
  -- reason freshness cannot be read from the price data.
  insert into pipeline.token_price_verifications (
    provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
    verification_purpose, observed_state, benchmark_model_id, methodology_version
  ) values (
    provider, iface, 'token-verification:xai:2026-09-29T09:15:00.000Z:test', 'Urdais operator',
    '2026-09-29T09:15:00Z', 'Weekly re-read; every published rate unchanged.', 'production', 'value', model, '1.3'
  );
  select count(*) into n from pipeline.token_price_verifications where provider_id = provider;
  if n <> 2 then raise exception 'a later review did not record its own event, found %', n; end if;

  -- A withholding designates no model, so an attestation about one must not name a
  -- model either: writing a plausible id would manufacture the designation the
  -- methodology declined to make.
  ok := false;
  begin
    insert into pipeline.token_price_verifications (
      provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
      verification_purpose, observed_state, benchmark_model_id, methodology_version
    ) values (
      provider, iface, 'token-verification:withheld-with-a-model', 'Urdais operator',
      '2026-09-22T09:15:00Z', 'checked', 'production', 'withheld', model, '1.3'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a withholding attestation was allowed to name a designated model'; end if;

  -- And a value attestation must name one.
  ok := false;
  begin
    insert into pipeline.token_price_verifications (
      provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
      verification_purpose, observed_state, benchmark_model_id, methodology_version
    ) values (
      provider, iface, 'token-verification:value-without-a-model', 'Urdais operator',
      '2026-09-22T09:15:00Z', 'checked', 'production', 'value', null, '1.3'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a value attestation was allowed with no designated model'; end if;

  -- There is one acquisition mode, because there is one way a verification happens.
  ok := false;
  begin
    insert into pipeline.token_price_verifications (
      provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
      acquisition_mode, verification_purpose, observed_state, benchmark_model_id, methodology_version
    ) values (
      provider, iface, 'token-verification:automated', 'a scraper',
      '2026-09-22T09:15:00Z', 'fetched', 'automated', 'production', 'value', model, '1.3'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an automated acquisition was recorded as a human verification'; end if;

  -- An unsigned attestation is not one.
  ok := false;
  begin
    insert into pipeline.token_price_verifications (
      provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
      verification_purpose, observed_state, benchmark_model_id, methodology_version
    ) values (
      provider, iface, 'token-verification:unsigned', '   ',
      '2026-09-22T09:15:00Z', 'checked', 'production', 'value', model, '1.3'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an attestation with no verifier was accepted'; end if;

  -- Evidence is append-only. A statement that can be edited afterwards is not evidence,
  -- and unlike a benchmark there is no supersession path: a mistaken verification is
  -- answered by making a new, correct one.
  ok := false;
  begin
    update pipeline.token_price_verifications set evidence = 'something else' where id = event;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a verification event accepted an update'; end if;

  ok := false;
  begin
    delete from pipeline.token_price_verifications where id = event;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a verification event accepted a delete'; end if;

  -- Nothing here is a price, and nothing here moves a source's rights.
  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name = 'token_price_verifications'
     and column_name in ('price_usd_per_1m', 'canonical_price_usd_per_1m', 'production_access_state');
  if n <> 0 then raise exception 'a verification event carries a price or a rights column'; end if;

  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
   where p.provider_kind = 'model_api_provider' and si.production_access_state <> 'research_usable';
  if n <> 0 then raise exception 'a token-pricing source left research_usable, found %', n; end if;

  raise notice 'token price verification events: ok';
end
$$;

rollback;
