-- Derived Token Price observations are frozen: append-only, idempotent by
-- lineage, corrected only by supersession, and shaped so a withheld calculation
-- carries no value and a value carries its full lineage.
begin;

do $$
declare
  ok boolean;
  provider uuid;
  model uuid;
  iface uuid;
  retrieval uuid := 'dddddddd-1111-4000-8000-000000000001';
  input_obs uuid := 'eeeeeeee-1111-4000-8000-000000000001';
  output_obs uuid := 'eeeeeeee-1111-4000-8000-000000000002';
  first_row uuid := 'ffffffff-1111-4000-8000-000000000001';
  correction uuid := 'ffffffff-1111-4000-8000-000000000002';
  n integer;
begin
  select id into provider from reference.providers where slug = 'anthropic';
  select m.id into model from reference.models m where m.provider_model_id = 'claude-fable-5-1';
  select id into iface from reference.source_interfaces where slug like 'anthropic%' limit 1;
  if provider is null or model is null or iface is null then raise exception 'wave-1 anthropic fixtures missing'; end if;

  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
  values (retrieval, iface, 'bench:test', '2026-09-14T03:10:00Z', 'GET', 'https://example.invalid/pricing', 200, repeat('a', 64), 'unknown', 'research');

  insert into pipeline.token_price_observations (id, model_id, pricing_dimension, source_native_price, source_native_currency, source_native_denominator_tokens, canonical_price_usd_per_1m, service_tier, source_interface_id, source_retrieval_id, retrieved_at)
  values
    (input_obs,  model, 'input',  10, 'USD', 1000000, 10, 'standard', iface, retrieval, '2026-09-14T03:10:00Z'),
    (output_obs, model, 'output', 50, 'USD', 1000000, 50, 'standard', iface, retrieval, '2026-09-14T03:10:00Z');

  -- A value carries its full lineage.
  insert into pipeline.token_price_benchmarks (
    id, provider_id, methodology_version, benchmark_model_id, calculation_status,
    price_usd_per_1m, input_observation_id, output_observation_id,
    input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at,
    calculated_at, calculator_identity
  ) values (
    first_row, provider, '1.1', model, 'value',
    30, input_obs, output_obs, 10, 50, '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z',
    '2026-09-14T03:10:00Z', 'urdais-token-price/1.1'
  );

  -- A value without its legs is rejected.
  ok := false;
  begin
    insert into pipeline.token_price_benchmarks (provider_id, methodology_version, benchmark_model_id, calculation_status, price_usd_per_1m, calculated_at)
    values (provider, '1.1', model, 'value', 30, '2026-09-14T04:00:00Z');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a value was accepted without leg lineage'; end if;

  -- A withheld calculation carries a reason and no value.
  ok := false;
  begin
    insert into pipeline.token_price_benchmarks (provider_id, methodology_version, benchmark_model_id, calculation_status, price_usd_per_1m, withheld_reason, calculated_at)
    values (provider, '1.1', model, 'withheld', 30, 'INPUT_LEG_UNAVAILABLE', '2026-09-14T04:00:00Z');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a withheld calculation carried a price'; end if;
  insert into pipeline.token_price_benchmarks (provider_id, methodology_version, benchmark_model_id, calculation_status, withheld_reason, calculated_at)
  values (provider, '1.1', model, 'withheld', 'OUTPUT_LEG_UNAVAILABLE', '2026-09-14T05:00:00Z');

  -- The calculation may not predate a leg it consumed.
  ok := false;
  begin
    insert into pipeline.token_price_benchmarks (provider_id, methodology_version, benchmark_model_id, calculation_status, price_usd_per_1m, input_observation_id, output_observation_id, input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at, calculated_at)
    values (provider, '1.1', model, 'value', 30, input_obs, output_obs, 10, 50, '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z', '2026-09-14T02:00:00Z');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a calculation predated the legs it consumed'; end if;

  -- Idempotence: the same lineage under the same methodology is one point.
  ok := false;
  begin
    insert into pipeline.token_price_benchmarks (provider_id, methodology_version, benchmark_model_id, calculation_status, price_usd_per_1m, input_observation_id, output_observation_id, input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at, calculated_at)
    values (provider, '1.1', model, 'value', 30, input_obs, output_obs, 10, 50, '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'recalculating the same lineage created a second point'; end if;

  -- A frozen row is never edited in place, not even its price.
  ok := false;
  begin
    update pipeline.token_price_benchmarks set price_usd_per_1m = 31 where id = first_row;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a published benchmark was edited in place'; end if;

  ok := false;
  begin
    delete from pipeline.token_price_benchmarks where id = first_row;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a published benchmark was deleted'; end if;

  -- A correction is a new row; the old one is marked superseded and then frozen.
  update pipeline.token_price_benchmarks
     set superseded_by_id = correction, superseded_at = '2026-09-20T00:00:00Z', supersession_reason = 'leg observation corrected upstream'
   where id = first_row;
  insert into pipeline.token_price_benchmarks (
    id, provider_id, methodology_version, benchmark_model_id, calculation_status,
    price_usd_per_1m, input_observation_id, output_observation_id,
    input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at, calculated_at
  ) values (
    correction, provider, '1.1', model, 'value',
    32, input_obs, output_obs, 12, 52, '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z', '2026-09-14T03:10:00Z'
  );

  select count(*) into n from pipeline.token_price_benchmarks where superseded_by_id is null and calculation_status = 'value';
  if n <> 1 then raise exception 'expected exactly one current value after the correction, found %', n; end if;
  select count(*) into n from pipeline.token_price_benchmarks where calculation_status = 'value';
  if n <> 2 then raise exception 'the superseded value was not retained, found % value rows', n; end if;

  -- A superseded row is frozen for good.
  ok := false;
  begin
    update pipeline.token_price_benchmarks
       set superseded_by_id = first_row, superseded_at = now(), supersession_reason = 'again'
     where id = first_row;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a superseded benchmark was superseded twice'; end if;

  raise notice 'token price benchmarks: ok';
end $$;

rollback;
