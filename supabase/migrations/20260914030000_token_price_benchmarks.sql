-- Derived Urdais Token Price observations, frozen as first-class artifacts.
--
-- The benchmark is computed from two canonical leg observations under a
-- methodology version (docs/methodology/token-price.md). Computing it on read
-- is enough while nothing is published, but a published number must not change
-- because a raw source row was later corrected, migrated or damaged. This table
-- freezes each calculation with its full lineage: the designated model, the
-- methodology version, the two leg observations it consumed and their prices,
-- and the calculation timestamp.
--
-- Immutability is the same discipline the rest of the pipeline uses. Rows are
-- never edited and never deleted. A correction is a new row, and the superseded
-- row is marked as such and then frozen, so the record of what Urdais published
-- and when survives the correction.
--
-- Idempotence: recalculating the same state produces the same lineage, and the
-- unique index below makes a repeat write a no-op rather than a second point.

create table pipeline.token_price_benchmarks (
  id                        uuid primary key default gen_random_uuid(),
  provider_id               uuid not null references reference.providers (id) on delete restrict,

  -- The methodology and the designation that produced this value. Both are
  -- effective-dated in the specification; the values recorded here are the ones
  -- actually in force at calculation time, so a later change cannot reinterpret it.
  methodology_version       text not null
                              constraint token_price_benchmarks_version_format
                              check (methodology_version ~ '^[0-9]+\.[0-9]+$'),
  benchmark_model_id        uuid not null references reference.models (id) on delete restrict,

  calculation_status        text not null
                              constraint token_price_benchmarks_status_allowed
                              check (calculation_status in ('value', 'withheld')),
  withheld_reason           text
                              constraint token_price_benchmarks_reason_allowed
                              check (withheld_reason is null or withheld_reason in (
                                'NO_CONSTITUENT_DESIGNATED', 'NO_METHODOLOGY_VERSION_IN_FORCE',
                                'INPUT_LEG_UNAVAILABLE', 'OUTPUT_LEG_UNAVAILABLE',
                                'NO_CALCULATION_EVENT_WITH_BOTH_LEGS'
                              )),

  price_usd_per_1m          numeric
                              constraint token_price_benchmarks_price_nonnegative
                              check (price_usd_per_1m is null or price_usd_per_1m >= 0),
  currency                  char(3) not null default 'USD'
                              constraint token_price_benchmarks_currency_format check (currency ~ '^[A-Z]{3}$'),
  unit                      text not null default 'USD / 1M tokens'
                              constraint token_price_benchmarks_unit_allowed check (unit = 'USD / 1M tokens'),

  -- Lineage: the exact leg observations consumed, and the prices they carried at
  -- the time. The prices are recorded here as well as referenced, so the value
  -- stays explicable even if a leg row is later superseded.
  input_observation_id      uuid references pipeline.token_price_observations (id) on delete restrict,
  output_observation_id     uuid references pipeline.token_price_observations (id) on delete restrict,
  input_price_usd_per_1m    numeric
                              constraint token_price_benchmarks_input_nonnegative
                              check (input_price_usd_per_1m is null or input_price_usd_per_1m >= 0),
  output_price_usd_per_1m   numeric
                              constraint token_price_benchmarks_output_nonnegative
                              check (output_price_usd_per_1m is null or output_price_usd_per_1m >= 0),
  input_observed_at         timestamptz,
  output_observed_at        timestamptz,

  -- The moment the state of both legs first supported this value: the later of
  -- the two leg observations. A real source time, never a rounded date.
  calculated_at             timestamptz not null,
  calculator_identity       text,
  created_at                timestamptz not null default now(),

  superseded_by_id          uuid references pipeline.token_price_benchmarks (id) on delete restrict
                              deferrable initially deferred,
  superseded_at             timestamptz,
  supersession_reason       text,

  constraint token_price_benchmarks_value_shape check (
    calculation_status <> 'value' or (
      price_usd_per_1m is not null
      and input_observation_id is not null and output_observation_id is not null
      and input_price_usd_per_1m is not null and output_price_usd_per_1m is not null
      and input_observed_at is not null and output_observed_at is not null
      and withheld_reason is null
    )
  ),
  constraint token_price_benchmarks_withheld_shape check (
    calculation_status <> 'withheld' or (
      price_usd_per_1m is null
      and input_observation_id is null and output_observation_id is null
      and input_price_usd_per_1m is null and output_price_usd_per_1m is null
      and withheld_reason is not null
    )
  ),
  -- The calculation is the later of its two legs; neither leg may postdate it.
  constraint token_price_benchmarks_calculated_after_legs check (
    calculation_status <> 'value' or (calculated_at >= input_observed_at and calculated_at >= output_observed_at)
  ),
  constraint token_price_benchmarks_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

comment on table pipeline.token_price_benchmarks is
  'A frozen Urdais Token Price calculation: one derived value with the methodology version, designated model and leg observations that produced it. Append-only; a correction is a new row that supersedes the old one, never an edit.';
comment on column pipeline.token_price_benchmarks.calculated_at is
  'The later of the two leg observation times: the moment both legs first supported this value. Never rounded to a date boundary.';
comment on column pipeline.token_price_benchmarks.input_price_usd_per_1m is
  'The leg price as consumed, recorded alongside the reference so the value stays explicable if the leg row is later superseded.';

-- Idempotence: the same lineage under the same methodology is one point, however
-- many times the calculator runs.
create unique index token_price_benchmarks_lineage_idx
  on pipeline.token_price_benchmarks (
    provider_id,
    methodology_version,
    benchmark_model_id,
    coalesce(input_observation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(output_observation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where superseded_by_id is null;

create index token_price_benchmarks_series_idx
  on pipeline.token_price_benchmarks (provider_id, calculated_at desc)
  where superseded_by_id is null;

create trigger token_price_benchmarks_supersede_only
  before update or delete on pipeline.token_price_benchmarks
  for each row execute function pipeline.allow_only_supersession();

alter table pipeline.token_price_benchmarks enable row level security;

do $$
declare n integer;
begin
  select count(*) into n from pipeline.token_price_benchmarks;
  if n <> 0 then raise exception 'the derived benchmark table is seeded with no rows'; end if;
end
$$;
