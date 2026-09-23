-- Grid Buildout Velocity GBV-5: the operational run ledger.
--
-- Every other Grid Buildout table is, by construction, a record of success: a snapshot exists
-- because an artifact was retrieved and parsed, an analytics run exists because a calculation
-- passed its output contract. That is the right shape for evidence and the wrong shape for
-- operations, because it means a failed attempt currently leaves no trace at all.
--
-- The distinction this table exists to hold is between the latest *attempt* and the latest
-- *successful publication*. An unattended pipeline that conflates them turns one bad workbook or
-- one transient parser failure into a broken public product: the read model would have nothing to
-- serve, or worse, would serve something half-written. Keeping them apart means a failure is
-- loudly observable here while the last known good publication stays authoritative and simply
-- ages, which the freshness gate then reports honestly.
--
-- Nothing in this migration touches canonical data, analytics, or methodology 1.0.0. It records
-- what the scheduler did; it never decides what the product means.

create table pipeline.buildout_job_runs (
  id              uuid primary key default gen_random_uuid(),
  -- What invoked the run, so a manual recovery is distinguishable from a scheduled one.
  trigger         text not null
                    constraint buildout_job_runs_trigger check (trigger in ('scheduled', 'manual')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null
                    constraint buildout_job_runs_status
                    check (status in ('running', 'succeeded', 'failed', 'skipped_locked')),
  -- Where a failure happened. Null on success, and the first thing a diagnosis needs.
  failed_phase    text
                    constraint buildout_job_runs_phase
                    check (failed_phase is null or failed_phase in
                      ('ingest', 'methodology_guard', 'analytics', 'validation', 'persistence')),
  -- A coarse class for alerting, kept separate from the message so grouping survives rewording.
  error_class     text,
  error_detail    text,
  -- The analytics run this attempt resolved to, whether it created it or reused an existing one.
  -- Null whenever the attempt never got far enough to have one.
  analytics_run_id uuid references pipeline.buildout_analytics_runs (id) on delete restrict,
  -- True only when this attempt left an approved, validated publication current.
  published       boolean not null default false,
  methodology_version text,
  -- Per-source ingest outcome, and the counts a reader needs to tell a no-op from real work.
  ingest_summary  jsonb not null default '{}'::jsonb
                    constraint buildout_job_runs_ingest_object check (jsonb_typeof(ingest_summary) = 'object'),
  notes           text,
  created_at      timestamptz not null default now(),
  -- A finished run has an end; a running one does not.
  constraint buildout_job_runs_completion check (
    (status = 'running') = (completed_at is null)),
  -- Only a succeeded run may claim it published, and a publication needs the run it published.
  constraint buildout_job_runs_published_succeeded check (
    not published or (status = 'succeeded' and analytics_run_id is not null)),
  -- A failure names its phase; a success does not have one.
  constraint buildout_job_runs_failure_phase check (
    (status = 'failed') = (failed_phase is not null))
);

comment on table pipeline.buildout_job_runs is
  'Every Grid Buildout scheduler attempt, successful or not. The latest row is the latest attempt; the latest row with published = true is the latest successful publication. Those are different questions and the freshness gate asks the second one.';

comment on column pipeline.buildout_job_runs.published is
  'True only where this attempt left a validated analytics run current. A failed or partial attempt never sets it, so a bad run cannot displace the last known good publication.';

-- Reading "when did we last publish successfully" is the freshness gate's hot path.
create index buildout_job_runs_published_idx
  on pipeline.buildout_job_runs (completed_at desc)
  where published;

create index buildout_job_runs_recent_idx
  on pipeline.buildout_job_runs (started_at desc);

-- Not append-only, deliberately and unlike every other Grid Buildout table: a run is claimed as
-- 'running' and then closed out in place, so the row is a lifecycle rather than an observation.
-- Its immutability guarantee is narrower and lives in the constraints above.

-- ---------------------------------------------------------------- invariants

create or replace function pipeline.buildout_operations_violations()
returns table (violation text, detail text, occurrences bigint)
language sql
stable
as $$
  -- The rule this whole table exists for: a publication must point at a validated run.
  select 'published_run_not_validated',
         'a job run claims publication of an analytics run that is not validated',
         count(*)
    from pipeline.buildout_job_runs j
    join pipeline.buildout_analytics_runs r on r.id = j.analytics_run_id
   where j.published and r.run_status <> 'validated'
  having count(*) > 0

  union all
  select 'failed_run_claims_publication',
         'a failed or running attempt claims it published',
         count(*)
    from pipeline.buildout_job_runs
   where published and status <> 'succeeded'
  having count(*) > 0

  union all
  -- A run left 'running' long after any plausible execution is a crashed invocation, not work in
  -- progress. maxDuration is 300s; an hour is far beyond it.
  select 'abandoned_running_job',
         'a job run has been running for over an hour and was never closed out',
         count(*)
    from pipeline.buildout_job_runs
   where status = 'running' and started_at < now() - interval '1 hour'
  having count(*) > 0

  union all
  select 'completed_without_end',
         'a finished job run carries no completion time',
         count(*)
    from pipeline.buildout_job_runs
   where status <> 'running' and completed_at is null
  having count(*) > 0;
$$;

comment on function pipeline.buildout_operations_violations() is
  'Operational invariants, chiefly that only a succeeded attempt may claim publication and only of a validated run. Expected to be empty.';

-- ---------------------------------------------------------------- security

alter table pipeline.buildout_job_runs enable row level security;
