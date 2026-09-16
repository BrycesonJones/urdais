-- Let a deliberate withholding be written down.
--
-- `pipeline.token_price_benchmarks` was built for this: it already carries
-- `calculation_status in ('value','withheld')`, a nullable `withheld_reason`, and a
-- `withheld_shape` check requiring a withheld row to hold no price and no legs. What it
-- could not do was accept the one withholding Urdais actually has.
--
-- Two things blocked it, and both are corrected here additively.
--
-- 1. `reason_allowed` listed five codes, all describing a missing input --
--    NO_CONSTITUENT_DESIGNATED, NO_METHODOLOGY_VERSION_IN_FORCE, INPUT_LEG_UNAVAILABLE,
--    OUTPUT_LEG_UNAVAILABLE, NO_CALCULATION_EVENT_WITH_BOTH_LEGS. DeepSeek's withholding is
--    not a missing input: every leg was collected. It is that no leg is a *standard* rate,
--    because every DeepSeek price is peak or off-peak and the methodology has no
--    time-weighting rule to combine them. The code has named that NO_STANDARD_SERVICE_TIER
--    since the withholding was recorded; the database simply would not accept it.
--
-- 2. `benchmark_model_id` was NOT NULL. A withheld provider may have no designated model at
--    all -- DeepSeek has none, which is the whole point -- and naming some plausible
--    DeepSeek model to satisfy the column would manufacture the designation the methodology
--    declined to make. The column becomes nullable, and `value_shape` gains the NOT NULL it
--    was relying on the column for, so a published value still cannot exist without one.
--
-- No existing row changes. Both replaced checks are strictly wider for withheld rows and
-- identical for value rows, so the six frozen values re-validate unchanged.
--
-- Rollback: re-adding NOT NULL to `benchmark_model_id` requires first deleting any withheld
-- row with a null model, and narrowing `reason_allowed` requires deleting any row carrying
-- NO_STANDARD_SERVICE_TIER. Both are `delete from pipeline.token_price_benchmarks where
-- calculation_status = 'withheld'`, which destroys recorded decisions -- so rolling back
-- loses exactly what this migration exists to preserve.

alter table pipeline.token_price_benchmarks
  alter column benchmark_model_id drop not null;

-- A published value still requires a designated model, a price, both legs and no reason.
-- Identical to the previous constraint except for the model clause the column used to carry.
alter table pipeline.token_price_benchmarks
  drop constraint token_price_benchmarks_value_shape;

alter table pipeline.token_price_benchmarks
  add constraint token_price_benchmarks_value_shape check (
    calculation_status <> 'value'
    or (
      benchmark_model_id is not null
      and price_usd_per_1m is not null
      and input_observation_id is not null
      and output_observation_id is not null
      and input_price_usd_per_1m is not null
      and output_price_usd_per_1m is not null
      and input_observed_at is not null
      and output_observed_at is not null
      and withheld_reason is null
    )
  );

-- The five existing codes, plus the one the withholding register already uses.
alter table pipeline.token_price_benchmarks
  drop constraint token_price_benchmarks_reason_allowed;

alter table pipeline.token_price_benchmarks
  add constraint token_price_benchmarks_reason_allowed check (
    withheld_reason is null
    or withheld_reason in (
      'NO_CONSTITUENT_DESIGNATED',
      'NO_METHODOLOGY_VERSION_IN_FORCE',
      'INPUT_LEG_UNAVAILABLE',
      'OUTPUT_LEG_UNAVAILABLE',
      'NO_CALCULATION_EVENT_WITH_BOTH_LEGS',
      'NO_STANDARD_SERVICE_TIER'
    )
  );

-- One withholding per provider, reason and methodology version. This is what makes the
-- repair re-runnable: a second run inserts nothing rather than stacking duplicate decisions.
-- Partial, so it constrains withholdings only and leaves the value rows' own history alone.
create unique index if not exists token_price_benchmarks_one_withholding
  on pipeline.token_price_benchmarks (provider_id, withheld_reason, methodology_version)
  where calculation_status = 'withheld' and superseded_by_id is null;

do $$
declare
  values_before integer;
begin
  select count(*) into values_before
    from pipeline.token_price_benchmarks
   where calculation_status = 'value';
  -- The frozen values are the published record. This migration must not have touched them.
  if exists (
    select 1 from pipeline.token_price_benchmarks
     where calculation_status = 'value' and benchmark_model_id is null
  ) then
    raise exception 'a published benchmark lost its designated model';
  end if;
  raise notice 'token price withholding record: % frozen values re-validated unchanged', values_before;
end $$;

comment on column pipeline.token_price_benchmarks.withheld_reason is
  'Structured reason a benchmark was withheld. NO_STANDARD_SERVICE_TIER means every collected leg is a peak or off-peak rate and none is the ordinary standard rate the methodology requires, which is DeepSeek''s case: the legs exist and the headline is withheld anyway. Never freeform prose -- the explanation lives in docs/methodology/token-price.md under the methodology version the row carries.';

comment on column pipeline.token_price_benchmarks.benchmark_model_id is
  'The designated constituent model. Required for a published value; null is permitted only on a withheld row, where it means no model was designated at all rather than that one was forgotten.';
