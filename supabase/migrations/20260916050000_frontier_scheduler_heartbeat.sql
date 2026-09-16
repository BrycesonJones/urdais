-- The Model Frontier scheduler heartbeat.
--
-- Capability ingestion is idempotent by content: a run whose bundle hashes to the last
-- ingested one writes no retrieval, no observation, no link and no price selection. That is
-- the right behaviour for *data* and the wrong behaviour for *operations*, because it makes a
-- healthy quiet week and a scheduler that stopped three weeks ago look identical from the
-- database -- which is precisely the silent-staleness failure the freshness gate exists to
-- catch, and the same shape as the one that hid Token Price sitting on a single row.
--
-- So every scheduled run records one row here, whether or not it ingested anything. This is
-- the one deliberate exception to "an unchanged run writes nothing", and it is narrow: the
-- row carries no capability data, no score, no identity and no price. It says a job ran, what
-- it found, and whether the source had moved.
--
-- The three states the gate distinguishes are columns rather than inferences:
--
--   the row exists          the scheduler ran            (scheduler freshness)
--   bundle_content_hash     the source was fetched       (source freshness)
--   source_changed          observations were ingested   (capability rollover)

create table pipeline.capability_check_runs (
  id                     uuid primary key default gen_random_uuid(),
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  ran_at                 timestamptz not null,
  -- 'scheduled' is the cron; 'operator' is someone running the script by hand. Kept apart so
  -- an operator run can never be mistaken for evidence that the schedule is alive.
  trigger                text not null
                           constraint capability_check_runs_trigger_allowed
                           check (trigger in ('scheduled', 'operator')),
  outcome                text not null
                           constraint capability_check_runs_outcome_allowed
                           check (outcome in ('unchanged', 'ingested', 'failed')),
  -- Null only on a failure that never got as far as hashing the bundle.
  bundle_content_hash    text
                           constraint capability_check_runs_hash_format
                           check (bundle_content_hash is null or bundle_content_hash ~ '^[0-9a-f]{64}$'),
  source_changed         boolean not null default false,
  -- Set only when the run ingested, so a heartbeat can be tied to what it wrote.
  capability_retrieval_id uuid references pipeline.capability_retrievals (id) on delete restrict,
  observations_created   integer
                           constraint capability_check_runs_created_nonneg
                           check (observations_created is null or observations_created >= 0),
  observations_revised   integer
                           constraint capability_check_runs_revised_nonneg
                           check (observations_revised is null or observations_revised >= 0),
  detail                 text,
  created_at             timestamptz not null default now(),

  -- An unchanged run is by definition one that did not change the source, and it may not
  -- claim a retrieval it never made.
  constraint capability_check_runs_unchanged_ingested_nothing
    check (outcome <> 'unchanged'
           or (source_changed = false and capability_retrieval_id is null)),
  -- An ingesting run must name what it wrote, or the heartbeat is not evidence of anything.
  constraint capability_check_runs_ingested_has_retrieval
    check (outcome <> 'ingested'
           or (source_changed = true and capability_retrieval_id is not null)),
  constraint capability_check_runs_failure_has_detail
    check (outcome <> 'failed' or detail is not null)
);

comment on table pipeline.capability_check_runs is
  'One scheduled or operator Model Frontier capability check. Written on every run, including runs that ingested nothing, because otherwise a healthy unchanged source and a scheduler that has stopped are indistinguishable. Carries no capability data: it records that a job ran, what it found, and whether the source moved.';

create index capability_check_runs_recent_idx
  on pipeline.capability_check_runs (ran_at desc);
-- The query the freshness check makes: when did the *schedule* last run successfully?
create index capability_check_runs_scheduled_idx
  on pipeline.capability_check_runs (trigger, ran_at desc)
  where outcome <> 'failed';

alter table pipeline.capability_check_runs enable row level security;
