-- Durable scheduler evidence for the two Model Economics jobs that previously only left logs.
--
-- UTVI and Token Price already have correct acquisition semantics: UTVI may collect on a
-- schedule, while Token Price may only be verified by a person and its cron is a read-only
-- watchdog. What was missing was durable proof that the schedules themselves were alive.
-- These tables record operations facts only. They contain no market data and grant no new
-- collection right.

create table pipeline.utvi_check_runs (
  id                uuid primary key default gen_random_uuid(),
  ran_at            timestamptz not null,
  trigger           text not null
                      constraint utvi_check_runs_trigger_allowed
                      check (trigger in ('scheduled', 'operator')),
  outcome           text not null
                      constraint utvi_check_runs_outcome_allowed
                      check (outcome in ('succeeded', 'failed')),
  collection_date   date,
  settlement_date   date,
  summary           jsonb not null default '{}'::jsonb,
  detail            text,
  created_at        timestamptz not null default now(),

  constraint utvi_check_runs_success_has_dates
    check (outcome <> 'succeeded' or (collection_date is not null and settlement_date is not null)),
  constraint utvi_check_runs_failure_has_detail
    check (outcome <> 'failed' or detail is not null)
);

comment on table pipeline.utvi_check_runs is
  'One UTVI scheduled or operator run. Operational heartbeat only: records that the job ran and its summarized outcome; UTVI observations, calculations and publications remain in their existing ledgers.';

create index utvi_check_runs_recent_idx
  on pipeline.utvi_check_runs (ran_at desc);
create index utvi_check_runs_scheduled_idx
  on pipeline.utvi_check_runs (trigger, ran_at desc)
  where outcome = 'succeeded';

alter table pipeline.utvi_check_runs enable row level security;

create table pipeline.token_verification_check_runs (
  id                   uuid primary key default gen_random_uuid(),
  ran_at               timestamptz not null,
  trigger              text not null
                         constraint token_verification_check_runs_trigger_allowed
                         check (trigger in ('scheduled', 'operator')),
  outcome              text not null
                         constraint token_verification_check_runs_outcome_allowed
                         check (outcome in ('current', 'review_due', 'failed')),
  checked_at           timestamptz,
  review_interval_days integer
                         constraint token_verification_check_runs_interval_positive
                         check (review_interval_days is null or review_interval_days > 0),
  latest_verified_at   timestamptz,
  review_due           text[] not null default '{}',
  never_verified       text[] not null default '{}',
  summary              jsonb not null default '{}'::jsonb,
  detail               text,
  created_at           timestamptz not null default now(),

  constraint token_verification_check_runs_success_has_check
    check (outcome = 'failed' or (checked_at is not null and review_interval_days is not null)),
  constraint token_verification_check_runs_failure_has_detail
    check (outcome <> 'failed' or detail is not null)
);

comment on table pipeline.token_verification_check_runs is
  'One Token Price verification-watchdog execution. Operational heartbeat only: it records verification age and whether human review is due. It never represents automated price collection or a provider read.';

create index token_verification_check_runs_recent_idx
  on pipeline.token_verification_check_runs (ran_at desc);
create index token_verification_check_runs_scheduled_idx
  on pipeline.token_verification_check_runs (trigger, ran_at desc)
  where outcome <> 'failed';

alter table pipeline.token_verification_check_runs enable row level security;
