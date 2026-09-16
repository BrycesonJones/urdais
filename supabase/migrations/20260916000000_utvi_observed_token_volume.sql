-- UTVI: the Observed Token Volume Index, from OpenRouter's rankings-daily dataset.
--
-- Everything here is shaped by what Phase 1A measured against the live authenticated
-- endpoint, not by what its documentation implies. Six of those measurements are load
-- bearing and each one is a constraint rather than a comment:
--
--   1. The source row has three fields: date, model_permaslug, total_tokens. There is no
--      prompt_tokens, no completion_tokens, no rank and no model name. So there are no leg
--      columns here. A nullable column the source can never fill is a claim that it might.
--
--   2. `meta.as_of` changes on every request whether the data moved or not. It is therefore
--      not a revision detector and must never drive supersession. `response_hash` is.
--
--   3. `end_date` is silently clamped to the last completed UTC day. Only the echoed
--      `meta.start_date`/`meta.end_date` say what was actually served, so requested and
--      actual windows are stored separately and the actual one governs.
--
--   4. The just-closed day keeps accruing, at roughly sixteen parts per million per day;
--      days closed twenty-five hours or more did not move. Hence a settlement state, and
--      hence supersession per date rather than per retrieval: one 366-day read revises only
--      its newest date, so a per-retrieval active flag would discard 365 settled days to
--      record one changed one.
--
--   5. The `other` row can legitimately be absent when the tail is empty. Row count is
--      therefore never an invariant, and its absence is not a failure.
--
--   6. `category` and `language_type` return a sampled dataset whose token totals arrive as
--      genuine fractions -- an estimate wearing an observation's field name. A production
--      retrieval may not carry those parameters, and the database says so rather than
--      trusting a collector to remember.
--
-- What this migration does NOT do: publish anything. The methodology is 0.1.1-draft, drafts
-- carry no effective date, and a trigger requires an approved methodology version before a
-- publication row can exist. Publication is therefore structurally disabled until the
-- methodology is approved, which is a governance decision and not a code change.

-- ---------------------------------------------------------------- vocabularies

-- A model marketplace is not a lab. OpenRouter serves other people's models and must never
-- be aggregated as their author, so it gets its own provider kind.
alter table reference.providers
  drop constraint providers_kind_allowed,
  add constraint providers_kind_allowed
    check (provider_kind in (
      'cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider',
      'statistical_compiler', 'spot_venue', 'chain_data', 'oracle_network',
      'inference_marketplace',
      'other'
    ));

comment on column reference.providers.provider_kind is
  'cloud_provider, marketplace and hardware_vendor are compute-market roles. model_api_provider is a first-party frontier-model API lab. inference_marketplace is a platform that serves other labs'' models and observes the traffic; it is never a lab. other remains the residual.';

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
    -- A platform's own aggregate usage dataset: observed quantities, not prices.
    'usage_dataset_interface'
  ));

-- A token count has no currency, and writing 'USD' on one would be a false statement about
-- the published value rather than a harmless default. Existing rows are unaffected.
alter table reference.instruments
  alter column output_currency drop not null;

comment on column reference.instruments.output_currency is
  'The currency of the published value, or null when the value is not denominated in money. A token-volume quantity has no currency; a price does.';

-- ---------------------------------------------------------------- retrievals

-- One authenticated read of the dataset. Wraps pipeline.source_retrievals rather than
-- replacing it: that table already carries the idempotency key, the response hash, the
-- retrieval purpose and the permission-grant requirement that a production read must satisfy.
create table pipeline.utvi_retrievals (
  id                     uuid primary key default gen_random_uuid(),
  source_retrieval_id    uuid not null unique references pipeline.source_retrievals (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,

  -- What Urdais asked for.
  requested_start_date   date not null,
  requested_end_date     date not null,
  -- What the source says it served. Authoritative: the endpoint clamps silently.
  actual_start_date      date,
  actual_end_date        date,

  -- The source's own generation timestamp. Retained because the required attribution
  -- interpolates it, and for no other purpose: it is not a revision detector.
  source_as_of           timestamptz,
  -- meta.version. A change here is a contract event, not a data revision.
  dataset_version        text,

  retrieved_at           timestamptz not null,
  row_count              integer
                           constraint utvi_retrievals_row_count_nonnegative
                           check (row_count is null or row_count >= 0),
  outcome                text not null
                           constraint utvi_retrievals_outcome_allowed
                           check (outcome in ('succeeded', 'http_error', 'malformed', 'transport_error')),
  outcome_detail         text,
  created_at             timestamptz not null default now(),

  constraint utvi_retrievals_requested_window_ordered
    check (requested_end_date >= requested_start_date),
  constraint utvi_retrievals_actual_window_ordered
    check (actual_start_date is null or actual_end_date is null or actual_end_date >= actual_start_date),
  -- The source floor, measured: an end_date before it is rejected outright.
  constraint utvi_retrievals_actual_start_at_or_after_floor
    check (actual_start_date is null or actual_start_date >= date '2025-01-01'),
  -- A successful read resolved its window and said when it was generated.
  constraint utvi_retrievals_success_has_actual_window
    check (outcome <> 'succeeded'
           or (actual_start_date is not null and actual_end_date is not null
               and source_as_of is not null and row_count is not null)),
  -- A failure has a reason on the row, not only in a log.
  constraint utvi_retrievals_failure_has_detail
    check (outcome = 'succeeded' or outcome_detail is not null)
);

comment on table pipeline.utvi_retrievals is
  'One read of OpenRouter rankings-daily. Requested and actual windows are separate because the endpoint clamps end_date to the last completed UTC day and only meta says so. source_as_of is retained for attribution and is never a revision detector. Append-only.';

create index utvi_retrievals_window_idx
  on pipeline.utvi_retrievals (source_interface_id, actual_start_date, actual_end_date);
create index utvi_retrievals_retrieved_idx
  on pipeline.utvi_retrievals (retrieved_at desc);

-- ---------------------------------------------------------------- daily snapshots

-- One date, as one retrieval saw it. This is also the coverage record: a date with no row
-- here has no coverage, which is a different statement from a date whose sum is zero, and
-- the distinction is the whole reason the table exists.
--
-- Supersession is per date, not per retrieval, because a wide window read twice revises only
-- its newest day.
create table pipeline.utvi_daily_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  utvi_retrieval_id       uuid not null references pipeline.utvi_retrievals (id) on delete restrict,
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  observation_date        date not null
                            constraint utvi_daily_snapshots_at_or_after_floor
                            check (observation_date >= date '2025-01-01'),

  coverage_state          text not null
                            constraint utvi_daily_snapshots_coverage_allowed
                            check (coverage_state in (
                              -- A retrieval succeeded and the date carried rows.
                              'covered_observed',
                              -- A retrieval succeeded and the date carried no rows at all.
                              -- Held as a refusal, not a zero: see the check below.
                              'covered_no_rows',
                              -- The response did not satisfy the daily contract.
                              'malformed'
                            )),

  -- The canonical daily total: the sum of every returned row for the date, residual included.
  -- Numeric rather than bigint because the source returns decimal strings and its sampled
  -- datasets return true fractions; numeric refuses to quietly round either.
  total_tokens            numeric
                            constraint utvi_daily_snapshots_total_nonnegative
                            check (total_tokens is null or total_tokens >= 0),
  -- The total minus the residual: the denominator any attributed breakdown must use.
  attributed_tokens       numeric
                            constraint utvi_daily_snapshots_attributed_nonnegative
                            check (attributed_tokens is null or attributed_tokens >= 0),
  -- The `other` row. Volume outside the daily top 50, with no model and no lab.
  residual_tokens         numeric
                            constraint utvi_daily_snapshots_residual_nonnegative
                            check (residual_tokens is null or residual_tokens >= 0),
  named_row_count         integer
                            constraint utvi_daily_snapshots_named_count_nonnegative
                            check (named_row_count is null or named_row_count >= 0),
  -- Measured: legitimately false when the tail is empty. Never an error.
  residual_row_present    boolean,

  -- SHA-256 over this date's rows alone, canonically ordered. The revision detector, and the
  -- reason a wide re-read can tell which single day moved.
  date_content_hash       text
                            constraint utvi_daily_snapshots_hash_format
                            check (date_content_hash is null or date_content_hash ~ '^[0-9a-f]{64}$'),

  -- Provisional until the date has stopped moving; final afterwards. Never 'final' by
  -- assumption -- a later revision may still supersede a final snapshot, and must.
  settlement_state        text not null default 'provisional'
                            constraint utvi_daily_snapshots_settlement_allowed
                            check (settlement_state in ('provisional', 'final')),

  observed_at             timestamptz not null,
  superseded_by_id        uuid references pipeline.utvi_daily_snapshots (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  unique (utvi_retrieval_id, observation_date),

  constraint utvi_daily_snapshots_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)),

  -- An observed date carries its arithmetic. A date that is not observed carries none of it,
  -- so `sum of nothing = 0` cannot be written down as if it were a measurement.
  constraint utvi_daily_snapshots_observed_has_arithmetic
    check (coverage_state <> 'covered_observed'
           or (total_tokens is not null and attributed_tokens is not null
               and residual_tokens is not null and named_row_count is not null
               and residual_row_present is not null and date_content_hash is not null
               and named_row_count > 0)),
  constraint utvi_daily_snapshots_unobserved_has_no_arithmetic
    check (coverage_state = 'covered_observed'
           or (total_tokens is null and attributed_tokens is null and residual_tokens is null)),
  -- total = attributed + residual, exactly. Not approximately.
  constraint utvi_daily_snapshots_total_decomposes
    check (total_tokens is null or total_tokens = attributed_tokens + residual_tokens),
  -- No residual row means no residual volume.
  constraint utvi_daily_snapshots_residual_presence_agrees
    check (residual_row_present is null
           or residual_row_present
           or residual_tokens = 0)
);

comment on table pipeline.utvi_daily_snapshots is
  'One UTC date as one retrieval saw it, and the coverage record for that date. A date with no row here has no coverage: absence is not a zero. Supersession is per date because a wide window re-read revises only its newest day. date_content_hash is the revision detector; the source''s as_of is not.';

-- Exactly one live snapshot per date. This is what makes "the current value for D" a
-- database fact rather than an application convention.
create unique index utvi_daily_snapshots_active_idx
  on pipeline.utvi_daily_snapshots (observation_date)
  where superseded_by_id is null;

create index utvi_daily_snapshots_retrieval_idx
  on pipeline.utvi_daily_snapshots (utvi_retrieval_id);
create index utvi_daily_snapshots_settlement_idx
  on pipeline.utvi_daily_snapshots (settlement_state, observation_date)
  where superseded_by_id is null;

-- ---------------------------------------------------------------- model observations

-- One source row, verbatim, with whatever identity Urdais could defensibly resolve.
create table pipeline.utvi_model_observations (
  id                       uuid primary key default gen_random_uuid(),
  daily_snapshot_id        uuid not null references pipeline.utvi_daily_snapshots (id) on delete restrict,
  observation_date         date not null,

  -- The source's identifier, exactly as returned, variant suffix included. Never rewritten.
  source_model_permaslug   text not null
                             constraint utvi_model_observations_permaslug_nonempty
                             check (btrim(source_model_permaslug) <> ''),
  -- The namespace segment, stored as read. A grouping key, not a lab identity: measured
  -- counterexamples include one lab under two namespaces, a namespace that is a model family
  -- belonging to a different lab, and the serving platform appearing as an author.
  source_namespace         text,
  -- The `:variant` suffix where present. Only ':free' has been observed.
  source_variant           text,
  source_total_tokens      numeric not null
                             constraint utvi_model_observations_tokens_nonnegative
                             check (source_total_tokens >= 0),
  -- The reserved aggregate tail row.
  is_residual              boolean not null default false,

  -- Resolved identity. Null is a real answer, not an omission.
  model_id                 uuid references reference.models (id) on delete restrict,
  lab_provider_id          uuid references reference.providers (id) on delete restrict,
  serving_platform_id      uuid not null references reference.providers (id) on delete restrict,
  lab_attribution_state    text not null
                             constraint utvi_model_observations_attribution_allowed
                             check (lab_attribution_state in (
                               -- Mapped to a lab on recorded evidence.
                               'evidenced',
                               -- The author is deliberately undisclosed by the source.
                               'undisclosed',
                               -- A namespace exists but Urdais has not established the lab.
                               'unmapped',
                               -- The row is the aggregate tail: no model, no lab, by construction.
                               'not_applicable'
                             )),
  -- The rendered CC BY citation for the retrieval this row came from, carried on the data.
  source_attribution       text not null
                             constraint utvi_model_observations_attribution_nonempty
                             check (btrim(source_attribution) <> ''),
  quality_flags            text[] not null default '{}'::text[],
  created_at               timestamptz not null default now(),

  unique (daily_snapshot_id, source_model_permaslug),

  -- The tail row has no model and no lab, and nothing else may claim to be the tail.
  constraint utvi_model_observations_residual_has_no_identity
    check (not is_residual or (model_id is null and lab_provider_id is null
                               and lab_attribution_state = 'not_applicable')),
  constraint utvi_model_observations_named_is_applicable
    check (is_residual or lab_attribution_state <> 'not_applicable'),
  -- An evidenced attribution names a lab; the other states must not.
  constraint utvi_model_observations_evidenced_has_lab
    check (lab_attribution_state <> 'evidenced' or lab_provider_id is not null),
  constraint utvi_model_observations_unevidenced_has_no_lab
    check (lab_attribution_state = 'evidenced' or lab_provider_id is null)
);

comment on table pipeline.utvi_model_observations is
  'One row of the source dataset, verbatim, with resolved identity where evidence supports it. There are no input/output token columns because the source exposes none and never will. A null lab with state undisclosed or unmapped is an honest answer that keeps the volume while refusing the attribution. Append-only.';

create index utvi_model_observations_date_idx
  on pipeline.utvi_model_observations (observation_date, source_model_permaslug);
create index utvi_model_observations_model_idx
  on pipeline.utvi_model_observations (model_id) where model_id is not null;
create index utvi_model_observations_lab_idx
  on pipeline.utvi_model_observations (lab_provider_id, observation_date) where lab_provider_id is not null;

-- The snapshot's date and its rows' dates are one date.
create or replace function pipeline.check_utvi_observation_date()
returns trigger
language plpgsql
as $$
declare
  snapshot_date date;
begin
  select observation_date into snapshot_date
    from pipeline.utvi_daily_snapshots where id = new.daily_snapshot_id;
  if snapshot_date is distinct from new.observation_date then
    raise exception 'observation date % does not match its snapshot''s date %',
      new.observation_date, snapshot_date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger utvi_model_observations_date_agrees
  before insert on pipeline.utvi_model_observations
  for each row execute function pipeline.check_utvi_observation_date();

-- ---------------------------------------------------------------- calculations

create table pipeline.utvi_calculations (
  id                          uuid primary key default gen_random_uuid(),
  instrument_id               uuid not null references reference.instruments (id) on delete restrict,
  instrument_spec_version_id  uuid not null references reference.instrument_spec_versions (id) on delete restrict,
  methodology_version_id      uuid not null references reference.methodology_versions (id) on delete restrict,
  -- The snapshot the value was computed from. A calculation without coverage cannot exist,
  -- because this column is not nullable.
  daily_snapshot_id           uuid not null references pipeline.utvi_daily_snapshots (id) on delete restrict,

  calculation_date            date not null,
  calculated_at               timestamptz not null,
  calculator_identity         text,
  run_kind                    text not null default 'production'
                                constraint utvi_calculations_kind_allowed
                                check (run_kind in ('production', 'simulation', 'correction')),

  -- UTVI itself: tokens per day.
  total_observed_tokens       numeric not null
                                constraint utvi_calculations_total_positive
                                check (total_observed_tokens > 0),
  -- The two residuals, kept apart because they are different holes. One has no model at
  -- all; the other has a model whose lab Urdais will not guess.
  model_residual_tokens       numeric not null
                                constraint utvi_calculations_model_residual_nonnegative
                                check (model_residual_tokens >= 0),
  lab_residual_tokens         numeric not null
                                constraint utvi_calculations_lab_residual_nonnegative
                                check (lab_residual_tokens >= 0),
  attributed_tokens           numeric not null
                                constraint utvi_calculations_attributed_nonnegative
                                check (attributed_tokens >= 0),

  eligible_row_count          integer not null
                                constraint utvi_calculations_eligible_positive
                                check (eligible_row_count > 0),
  excluded_row_count          integer not null default 0
                                constraint utvi_calculations_excluded_nonnegative
                                check (excluded_row_count >= 0),
  exclusions                  jsonb not null default '[]'::jsonb,

  coverage_state              text not null,
  settlement_state            text not null
                                constraint utvi_calculations_settlement_allowed
                                check (settlement_state in ('provisional', 'final')),
  -- The hash of the rows this value came from, copied so a value can be tied to its evidence
  -- without a join through a superseded chain.
  source_content_hash         text not null
                                constraint utvi_calculations_hash_format
                                check (source_content_hash ~ '^[0-9a-f]{64}$'),
  created_at                  timestamptz not null default now(),

  -- The sum decomposes exactly, in both directions.
  constraint utvi_calculations_total_decomposes
    check (total_observed_tokens = attributed_tokens + model_residual_tokens),
  -- The lab residual is part of the attributed volume, never on top of it.
  constraint utvi_calculations_lab_residual_within_attributed
    check (lab_residual_tokens <= attributed_tokens),
  -- Only an observed date produces a value at all.
  constraint utvi_calculations_requires_observed_coverage
    check (coverage_state = 'covered_observed')
);

comment on table pipeline.utvi_calculations is
  'One computation of UTVI for one UTC date from one daily snapshot. Carries both residuals separately: the model residual is volume with no model, the lab residual is volume with a model whose lab is not evidenced. Append-only; a revision is a new row.';

create index utvi_calculations_date_idx
  on pipeline.utvi_calculations (instrument_id, calculation_date, calculated_at desc);
create index utvi_calculations_snapshot_idx
  on pipeline.utvi_calculations (daily_snapshot_id);

-- A calculation must agree with the snapshot it claims to come from, and must not read a
-- snapshot that has already been superseded.
create or replace function pipeline.check_utvi_calculation()
returns trigger
language plpgsql
as $$
declare
  s record;
begin
  select observation_date, coverage_state, settlement_state, total_tokens, attributed_tokens,
         residual_tokens, date_content_hash, superseded_by_id
    into s
    from pipeline.utvi_daily_snapshots where id = new.daily_snapshot_id;

  if s.superseded_by_id is not null then
    raise exception 'snapshot % is superseded and may not back a new calculation', new.daily_snapshot_id
      using errcode = 'check_violation';
  end if;
  if s.observation_date is distinct from new.calculation_date then
    raise exception 'calculation date % does not match its snapshot''s date %',
      new.calculation_date, s.observation_date using errcode = 'check_violation';
  end if;
  if s.coverage_state is distinct from new.coverage_state then
    raise exception 'calculation coverage % disagrees with snapshot coverage %',
      new.coverage_state, s.coverage_state using errcode = 'check_violation';
  end if;
  if s.settlement_state is distinct from new.settlement_state then
    raise exception 'calculation settlement % disagrees with snapshot settlement %',
      new.settlement_state, s.settlement_state using errcode = 'check_violation';
  end if;
  if s.date_content_hash is distinct from new.source_content_hash then
    raise exception 'calculation content hash disagrees with its snapshot''s hash'
      using errcode = 'check_violation';
  end if;
  if s.total_tokens is distinct from new.total_observed_tokens then
    raise exception 'calculated total % disagrees with the snapshot total %',
      new.total_observed_tokens, s.total_tokens using errcode = 'check_violation';
  end if;
  if s.attributed_tokens is distinct from new.attributed_tokens
     or s.residual_tokens is distinct from new.model_residual_tokens then
    raise exception 'calculated decomposition disagrees with the snapshot'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger utvi_calculations_agree_with_snapshot
  before insert on pipeline.utvi_calculations
  for each row execute function pipeline.check_utvi_calculation();

-- ---------------------------------------------------------------- publications

create table pipeline.utvi_publications (
  id                       uuid primary key default gen_random_uuid(),
  calculation_id           uuid not null references pipeline.utvi_calculations (id) on delete restrict,
  calculation_date         date not null,
  published_at             timestamptz not null,
  publisher_identity       text,

  -- Frozen at publication so a historical point renders as it was published.
  value_tokens_per_day     numeric not null
                             constraint utvi_publications_value_positive
                             check (value_tokens_per_day > 0),
  published_model_residual numeric not null
                             constraint utvi_publications_model_residual_nonnegative
                             check (published_model_residual >= 0),
  published_lab_residual   numeric not null
                             constraint utvi_publications_lab_residual_nonnegative
                             check (published_lab_residual >= 0),
  settlement_state         text not null
                             constraint utvi_publications_settlement_allowed
                             check (settlement_state in ('provisional', 'final')),
  methodology_version      text not null,
  -- The universe this value observed, in words, frozen with the value. Coverage is part of
  -- what was published, so a later change of universe cannot rewrite an old point's meaning.
  universe_descriptor      text not null
                             constraint utvi_publications_universe_nonempty
                             check (btrim(universe_descriptor) <> ''),
  source_attribution       text not null
                             constraint utvi_publications_attribution_nonempty
                             check (btrim(source_attribution) <> ''),
  source_content_hash      text not null
                             constraint utvi_publications_hash_format
                             check (source_content_hash ~ '^[0-9a-f]{64}$'),
  revision_number          integer not null default 1
                             constraint utvi_publications_revision_positive
                             check (revision_number >= 1),

  superseded_by_id         uuid references pipeline.utvi_publications (id) on delete restrict
                             deferrable initially deferred,
  superseded_at            timestamptz,
  supersession_reason      text,
  created_at               timestamptz not null default now(),

  constraint utvi_publications_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null))
);

comment on table pipeline.utvi_publications is
  'The release of one UTVI calculation, frozen at publication. The universe descriptor is frozen with the value because coverage is part of what was published. Corrections are supersessions, never edits.';

-- One live public point per date. The invariant the read layer depends on.
create unique index utvi_publications_active_date_idx
  on pipeline.utvi_publications (calculation_date)
  where superseded_by_id is null;

create index utvi_publications_date_idx
  on pipeline.utvi_publications (calculation_date, published_at desc);

-- The publication gate, in the database.
--
-- Four refusals, each of which exists because the alternative is a published number that
-- means something other than it appears to. The methodology check is the one that matters
-- today: 0.1.1-draft is a draft, so nothing can be published at all yet, and that is the
-- intended state rather than an obstacle to route around.
create or replace function pipeline.check_utvi_publication()
returns trigger
language plpgsql
as $$
declare
  c record;
  m record;
begin
  select run_kind, calculation_date, total_observed_tokens, model_residual_tokens,
         lab_residual_tokens, settlement_state, source_content_hash, methodology_version_id
    into c
    from pipeline.utvi_calculations where id = new.calculation_id;

  if c.run_kind = 'simulation' then
    raise exception 'a simulation run is never published' using errcode = 'check_violation';
  end if;

  select status, version, effective_from into m
    from reference.methodology_versions where id = c.methodology_version_id;

  if m.status <> 'approved' then
    raise exception 'methodology version % is %, not approved: no value may be published under it',
      m.version, m.status using errcode = 'check_violation';
  end if;
  if m.effective_from is null then
    raise exception 'methodology version % has no effective date and cannot support a publication',
      m.version using errcode = 'check_violation';
  end if;
  if c.calculation_date < m.effective_from then
    raise exception 'calculation date % precedes the effective date % of methodology version %',
      c.calculation_date, m.effective_from, m.version using errcode = 'check_violation';
  end if;

  if c.calculation_date is distinct from new.calculation_date then
    raise exception 'publication date % disagrees with the calculation date %',
      new.calculation_date, c.calculation_date using errcode = 'check_violation';
  end if;
  if c.total_observed_tokens is distinct from new.value_tokens_per_day then
    raise exception 'published value % disagrees with the calculated value %',
      new.value_tokens_per_day, c.total_observed_tokens using errcode = 'check_violation';
  end if;
  if c.model_residual_tokens is distinct from new.published_model_residual
     or c.lab_residual_tokens is distinct from new.published_lab_residual then
    raise exception 'published residuals disagree with the calculation' using errcode = 'check_violation';
  end if;
  if c.settlement_state is distinct from new.settlement_state then
    raise exception 'published settlement state disagrees with the calculation'
      using errcode = 'check_violation';
  end if;
  if c.source_content_hash is distinct from new.source_content_hash then
    raise exception 'published content hash disagrees with the calculation'
      using errcode = 'check_violation';
  end if;
  if m.version is distinct from new.methodology_version then
    raise exception 'published methodology version % disagrees with the calculation''s %',
      new.methodology_version, m.version using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger utvi_publications_check
  before insert on pipeline.utvi_publications
  for each row execute function pipeline.check_utvi_publication();

-- ---------------------------------------------------------------- estimated-dataset refusal

-- The sampled datasets are reached by two query parameters and return fractional token
-- totals. A production retrieval that carried either would be recording an estimate in a
-- table whose whole purpose is observations, so the database refuses it.
create or replace function pipeline.check_utvi_retrieval_parameters()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  select retrieval_purpose, request_parameters into r
    from pipeline.source_retrievals where id = new.source_retrieval_id;

  if r.request_parameters ? 'category' or r.request_parameters ? 'language_type' then
    raise exception 'category and language_type read a sampled, estimated dataset and may not back a UTVI retrieval'
      using errcode = 'check_violation';
  end if;
  if coalesce(r.request_parameters ->> 'period', 'day') <> 'day' then
    raise exception 'UTVI reads the daily grain only; period=% returns an incomplete trailing bucket',
      r.request_parameters ->> 'period' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger utvi_retrievals_reject_estimated_parameters
  before insert on pipeline.utvi_retrievals
  for each row execute function pipeline.check_utvi_retrieval_parameters();

-- ---------------------------------------------------------------- append-only

create trigger utvi_retrievals_append_only
  before update or delete on pipeline.utvi_retrievals
  for each row execute function pipeline.forbid_mutation();

-- Snapshots carry a settlement state that legitimately changes from provisional to final, so
-- the generic supersession-only trigger is too strict; this one permits exactly two updates.
create or replace function pipeline.allow_utvi_snapshot_updates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'utvi_daily_snapshots rows are never deleted: supersede them instead'
      using errcode = 'restrict_violation';
  end if;

  -- Settling a live snapshot: provisional becomes final and nothing else moves.
  if old.superseded_by_id is null and new.superseded_by_id is null
     and old.settlement_state = 'provisional' and new.settlement_state = 'final'
     and to_jsonb(new) - 'settlement_state' = to_jsonb(old) - 'settlement_state' then
    return new;
  end if;

  -- Superseding a live snapshot: the three supersession columns are set together and
  -- nothing else moves. A final snapshot may still be superseded, because a late revision
  -- is a fact about the source rather than a permission Urdais grants itself.
  if old.superseded_by_id is null
     and new.superseded_by_id is not null and new.superseded_at is not null
     and new.supersession_reason is not null
     and to_jsonb(new) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason'
         = to_jsonb(old) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason' then
    return new;
  end if;

  raise exception 'the only permitted updates on utvi_daily_snapshots are settling a provisional snapshot and superseding a live one'
    using errcode = 'restrict_violation';
end;
$$;

comment on function pipeline.allow_utvi_snapshot_updates() is
  'Permits exactly two updates on a daily snapshot: provisional to final, and marking a live snapshot superseded. Everything else, including any change to the arithmetic, is rejected.';

create trigger utvi_daily_snapshots_restricted_updates
  before update or delete on pipeline.utvi_daily_snapshots
  for each row execute function pipeline.allow_utvi_snapshot_updates();

create trigger utvi_model_observations_append_only
  before update or delete on pipeline.utvi_model_observations
  for each row execute function pipeline.forbid_mutation();
create trigger utvi_calculations_append_only
  before update or delete on pipeline.utvi_calculations
  for each row execute function pipeline.forbid_mutation();
create trigger utvi_publications_supersede_only
  before update or delete on pipeline.utvi_publications
  for each row execute function pipeline.allow_only_supersession();

-- ---------------------------------------------------------------- row level security

alter table pipeline.utvi_retrievals        enable row level security;
alter table pipeline.utvi_daily_snapshots   enable row level security;
alter table pipeline.utvi_model_observations enable row level security;
alter table pipeline.utvi_calculations      enable row level security;
alter table pipeline.utvi_publications      enable row level security;

-- ---------------------------------------------------------------- reference data

-- The serving platform. Not a lab, and the provider kind says so.
insert into reference.providers (id, slug, name, provider_kind, website) values
  ('7c000000-0000-4000-8000-000000000001', 'openrouter', 'OpenRouter', 'inference_marketplace', 'https://openrouter.ai')
on conflict (slug) do nothing;

-- The CC BY 4.0 grant is the permission basis, and it is a public licence rather than a
-- bilateral permission, which is why both axes read permitted without correspondence.
insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence, metadata
) values (
  '7c000000-0000-4000-8000-000000000002',
  '7c000000-0000-4000-8000-000000000001',
  'openrouter-datasets-rankings-daily',
  'OpenRouter rankings-daily usage dataset',
  'usage_dataset_interface',
  'https://openrouter.ai/api/v1/datasets/rankings-daily',
  true,
  'api_key',
  'production_approved',
  'permitted',
  'permitted',
  false,
  'Daily per-model token totals, top 50 plus an aggregate tail row. Characterized against the live authenticated endpoint on 16 September 2026; see docs/research/utvi/source-characterization.md. Read only through the documented API: the rankings HTML page and third-party mirrors are never data sources.',
  '{"reviewed_on": "2026-09-16", "documents": [{"title": "OpenRouter Datasets SDK reference", "url": "https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README.md", "retrieved_on": "2026-09-16T00:12Z", "clauses": [{"axis": "both", "text": "Public OpenRouter usage datasets. Data returned by these endpoints is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): reuse and republish it, including commercially, with attribution to OpenRouter."}]}, {"title": "Daily token totals for top 50 models", "url": "https://openrouter.ai/docs/api/api-reference/datasets/daily-token-totals-for-top-50-models", "retrieved_on": "2026-09-16T00:12Z", "clauses": [{"axis": "data_use", "text": "When republishing or quoting this dataset, OpenRouter must be cited as: \"Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.\""}, {"axis": "collection", "text": "Authenticate with any valid OpenRouter API key (same key used for inference). Rate-limited to 30 requests/minute per key and 500 requests/day per account."}, {"axis": "data_use", "text": "Token counts come from each upstream provider''s own tokenizer, so a token in one row is not directly comparable to a token in another row from a different provider."}]}, {"title": "OpenRouter Terms of Service", "url": "https://openrouter.ai/terms", "retrieved_on": "2026-09-16T00:12Z", "clauses": [{"axis": "collection", "text": "Section 7, Prohibited Conduct: develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins, add-ons or any other automated technology) to scrape or copy any information on the Site or the Services.", "note": "Assessed as separating two routes to the same numbers and permitting one: the documented, authenticated, rate-limited API whose output is licensed. The HTML rankings page and third-party mirrors are never data sources."}, {"axis": "data_use", "text": "Section 7, Prohibited Conduct: access the Site or Service for purposes of reselling API access to Models or otherwise developing a competing service.", "note": "Assessed as not triggered. Urdais publishes a derived index; it does not resell model access, route inference, or re-serve the dataset."}]}], "attribution_required": "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.", "attribution_url": "https://openrouter.ai/rankings", "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "rate_limit": "30 requests/minute per key; 500 requests/day per account", "note": "The citation interpolates meta.as_of from the response payload, so a static credit line cannot discharge it; as_of is persisted per retrieval and carried onto every derived row. Assessed in docs/architecture/sources/openrouter-datasets.md."}'::jsonb,
  '{"dataset_version": "v1", "history_floor": "2025-01-01", "max_window_days": 366, "grain": "day", "characterized": "docs/research/utvi/source-characterization.md", "urdais_cadence": "two requests per day: the day that just closed, and the day before it for settlement confirmation", "forbidden_parameters": ["category", "language_type"], "forbidden_parameters_reason": "both read a sampled, upsampled dataset whose token totals arrive as fractions"}'::jsonb
) on conflict (slug) do nothing;

insert into reference.permission_grants (
  id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
  granted_on, effective_from, evidence
) values (
  '7c000000-0000-4000-8000-000000000003',
  '7c000000-0000-4000-8000-000000000002',
  'provider_terms',
  'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
  true,
  true,
  date '2026-09-16',
  timestamptz '2026-09-16 00:00:00+00',
  'OpenRouter documents the datasets endpoints as: "Public OpenRouter usage datasets. Data returned by these endpoints is licensed under CC BY 4.0: reuse and republish it, including commercially, with attribution to OpenRouter." CC BY 4.0 section 2(a)(1)(B) grants the right to reproduce and share Adapted Material, which a derived index is. Required citation: "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}." Retrieved 2026-09-16 from https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README.md and the endpoint reference.'
) on conflict (id) do nothing;

insert into reference.methodologies (id, slug, name, document_path) values
  ('7c000000-0000-4000-8000-000000000010', 'utvi', 'Urdais Observed Token Volume Index', 'docs/methodology/utvi.md')
on conflict (slug) do nothing;

-- A draft, and therefore no effective date. The publication trigger reads this row and
-- refuses every publication while it says 'draft'.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash) values
  ('7c000000-0000-4000-8000-000000000011', '7c000000-0000-4000-8000-000000000010',
   '0.1.1-draft', 'draft', 'docs/methodology/utvi.md',
   '2e0a4ed4b5627cc750925a2da0e7f4245755dc8c1bb99d864a06509158cdfcc6')
on conflict (methodology_id, version) do nothing;

-- The instrument. No currency: a token count is not money. Launch-blocked because the
-- methodology is a draft.
insert into reference.instruments
  (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status) values
  ('7c000000-0000-4000-8000-000000000012', 'UTVI', 'Urdais Observed Token Volume Index', 'index',
   '7c000000-0000-4000-8000-000000000010', 'tokens_per_day', null, 'launch_blocked')
on conflict (symbol) do nothing;

-- UTVI has one instrument and no children, so the spec version is the methodology document
-- itself. Its hash is that file's, salted with the spec identity, following UBWI's convention
-- so that the family-wide cross-spec uniqueness check stays meaningful.
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('7c000000-0000-4000-8000-000000000013', '7c000000-0000-4000-8000-000000000012',
   '7c000000-0000-4000-8000-000000000011', '0.1.1-draft', 'draft', 'docs/methodology/utvi.md',
   'd7ba8b4d352d6c1fcebdee75336386b1f960cb393a3fe60ed8bb244b6b6a9dff')
on conflict (instrument_id, version) do nothing;

-- Labs observed in the source's namespaces on 16 September 2026 that Urdais did not already
-- carry. Each is a model author, not a serving platform. Namespaces with no established
-- legal identity are deliberately absent: an unmapped namespace keeps its volume and loses
-- its attribution, which is the honest trade.
insert into reference.providers (slug, name, provider_kind, website) values
  ('tencent',          'Tencent',               'model_api_provider', 'https://cloud.tencent.com'),
  ('zhipu-ai',         'Z.ai (Zhipu AI)',       'model_api_provider', 'https://z.ai'),
  ('xiaomi',           'Xiaomi',                'model_api_provider', 'https://www.mi.com'),
  ('minimax',          'MiniMax',               'model_api_provider', 'https://www.minimax.io'),
  ('meta',             'Meta',                  'model_api_provider', 'https://ai.meta.com'),
  ('stepfun',          'StepFun',               'model_api_provider', 'https://www.stepfun.com'),
  ('upstage',          'Upstage',               'model_api_provider', 'https://www.upstage.ai'),
  ('cohere',           'Cohere',                'model_api_provider', 'https://cohere.com'),
  ('perplexity',       'Perplexity',            'model_api_provider', 'https://www.perplexity.ai'),
  ('bytedance',        'ByteDance',             'model_api_provider', 'https://www.bytedance.com'),
  ('baai',             'Beijing Academy of Artificial Intelligence', 'model_api_provider', 'https://www.baai.ac.cn'),
  ('thinking-machines','Thinking Machines',     'model_api_provider', 'https://thinkingmachines.ai'),
  ('poolside',         'Poolside',              'model_api_provider', 'https://poolside.ai')
on conflict (slug) do nothing;

comment on table pipeline.utvi_calculations is
  'One computation of UTVI for one UTC date from one daily snapshot. Carries both residuals separately: the model residual is volume with no model, the lab residual is volume with a model whose lab is not evidenced. Append-only; a revision is a new row. Publication requires an approved methodology version, which 0.1.1-draft is not.';
