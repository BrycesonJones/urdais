-- UMPI Phase 8: the operational record.
--
-- Phases 3-7 made UMPI correct. This makes it safe to leave running: a recurring check that
-- notices a new official month on its own, and enough durable evidence afterwards to answer
-- "is what a reader is looking at still current, and if not, where did it stop?".
--
-- Three tables, following the shape `interconnection_source_monitors` / `_source_checks` already
-- established for a monitored source, with one deliberate difference.
--
-- **Staleness here is a reference month, not an age in hours.** Those tables carry
-- `stale_after_hours`, which is right for a source that regenerates continuously: if PJM's queue
-- file has not changed in a week, something is wrong. It is wrong for a monthly statistic. A
-- successful check an hour ago tells you nothing about currentness if the month it found was
-- August and it is late October, and an hours-based threshold would report perfect health for a
-- product two months behind. So the monitor records when a reference month is *due* — the day of
-- the following month the agency normally publishes on, plus a grace window for holiday slippage
-- — and freshness is computed by comparing months, informed by the check evidence rather than
-- replaced by it.
--
-- `umpi_operational_runs` is the heartbeat: one row per scheduled execution, whether or not
-- anything changed. Without it a stopped scheduler is indistinguishable from a quiet month, which
-- is the failure mode that lets a product go stale unnoticed.
--
-- `umpi_source_checks` is the per-series evidence within a run: what the source said it had, what
-- changed, whether derivation advanced, and the freshness the run concluded.

-- ------------------------------------------------------------------------- release policy

create table reference.umpi_source_monitors (
  id                        uuid primary key default gen_random_uuid(),
  series_id                 uuid not null references reference.umpi_series (id) on delete restrict,
  source_interface_id       uuid not null references reference.source_interfaces (id) on delete restrict,
  -- Reference month M is normally published on this day of month M+1.
  release_day_of_month      integer not null
                              constraint umpi_monitors_release_day_valid
                              check (release_day_of_month between 1 and 28),
  -- Days past that before absence is a fault rather than a wait.
  grace_days                integer not null
                              constraint umpi_monitors_grace_nonnegative check (grace_days >= 0),
  -- How many recent months a routine check re-reads, to notice a revision.
  revision_lookback_months  integer not null
                              constraint umpi_monitors_lookback_positive check (revision_lookback_months >= 1),
  -- How old the newest check may be before currentness stops being evaluable.
  max_check_age_hours       integer not null
                              constraint umpi_monitors_check_age_positive check (max_check_age_hours > 0),
  -- The observed release dates these numbers were derived from. Not optional: changing one
  -- changes when Urdais claims its own data is late.
  rationale                 text not null
                              constraint umpi_monitors_rationale_nonempty check (btrim(rationale) <> ''),
  created_at                timestamptz not null default now(),
  unique (series_id)
);

comment on table reference.umpi_source_monitors is
  'Per-series release policy: when a reference month is due, how long past that is still a wait, '
  'and how stale an operational check may be before currentness becomes unknown. Staleness is a '
  'reference month, never an age in hours.';

-- --------------------------------------------------------------------------- the heartbeat

create table pipeline.umpi_operational_runs (
  id              uuid primary key default gen_random_uuid(),
  trigger         text not null
                    constraint umpi_ops_trigger_allowed check (trigger in ('cron', 'manual')),
  started_at      timestamptz not null,
  completed_at    timestamptz,
  -- `success_no_change` is the ordinary outcome for a monthly product on most days, and is
  -- explicitly not a failure: there is nothing new for eleven months of every twelve.
  outcome         text
                    constraint umpi_ops_outcome_allowed
                    check (outcome in ('success_no_change', 'success_changed', 'partial_failure', 'failed')),
  -- The family summary the run concluded. Null until the run completes.
  freshness_state text
                    constraint umpi_ops_freshness_allowed
                    check (freshness_state in
                      ('fresh', 'awaiting_release', 'stale', 'source_unavailable', 'derivation_failed', 'unknown')),
  -- Set when a run declined to do anything because another run held the lock. Such a run is not
  -- a failure and must not be read as one, but it is also not evidence that a check happened.
  skipped_reason  text,
  created_at      timestamptz not null default now(),
  constraint umpi_ops_completed_has_outcome
    check ((completed_at is null) = (outcome is null))
);

create index umpi_operational_runs_recent on pipeline.umpi_operational_runs (started_at desc);

comment on table pipeline.umpi_operational_runs is
  'One row per scheduled UMPI execution, whether or not anything changed. Proves the scheduler '
  'ran: without it a stopped cron is indistinguishable from a quiet month.';

-- ------------------------------------------------------------------- per-series evidence

create table pipeline.umpi_source_checks (
  id                      uuid primary key default gen_random_uuid(),
  operational_run_id      uuid not null references pipeline.umpi_operational_runs (id) on delete restrict,
  series_id               uuid not null references reference.umpi_series (id) on delete restrict,
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  checked_at              timestamptz not null,
  -- Whether the source answered and parsed. A source that answers "no data for that month yet"
  -- is reachable: that is the ordinary reply before a release, not a failure.
  reachable               boolean not null,
  -- The narrow window this check read, so a later reader knows what was and was not looked at.
  requested_from_month    date,
  requested_to_month      date,
  -- The newest reference month the source reported holding.
  source_latest_month     date,
  -- What the check changed, if anything.
  observations_written    integer not null default 0
                            constraint umpi_checks_written_nonnegative check (observations_written >= 0),
  observations_revised    integer not null default 0
                            constraint umpi_checks_revised_nonnegative check (observations_revised >= 0),
  derivation_ran          boolean not null default false,
  publications_written    integer not null default 0
                            constraint umpi_checks_publications_nonnegative check (publications_written >= 0),
  -- The newest reference month with a current public publication, after this check.
  published_month         date,
  freshness_state         text not null
                            constraint umpi_checks_freshness_allowed
                            check (freshness_state in
                              ('fresh', 'awaiting_release', 'stale', 'source_unavailable', 'derivation_failed', 'unknown')),
  freshness_reason        text not null
                            constraint umpi_checks_reason_nonempty check (btrim(freshness_reason) <> ''),
  -- Where a failure occurred, and what kind. Null on a clean check.
  failure_stage           text
                            constraint umpi_checks_stage_allowed
                            check (failure_stage is null or failure_stage in
                              ('source', 'parse', 'ingest', 'derive', 'publish', 'freshness')),
  failure_class           text,
  -- A short, sanitized summary. Never a response body, a session cookie or a credentialed URL:
  -- the ingestion layer already redacts those and this column must not reintroduce them.
  failure_detail          text
                            constraint umpi_checks_detail_bounded
                            check (failure_detail is null or length(failure_detail) <= 500),
  created_at              timestamptz not null default now(),
  constraint umpi_checks_window_ordered
    check (requested_from_month is null or requested_to_month is null
           or requested_from_month <= requested_to_month),
  constraint umpi_checks_failure_paired
    check ((failure_stage is null) = (failure_class is null))
);

create index umpi_source_checks_series_recent
  on pipeline.umpi_source_checks (series_id, checked_at desc);

comment on table pipeline.umpi_source_checks is
  'Per-series evidence from one operational run: the window read, what the source held, what '
  'changed, and the freshness concluded. Failure detail is sanitized and length-bounded.';

-- ----------------------------------------------------------------------------- the policies
--
-- Bank of Korea PPI releases observed at the 19th-22nd of the following month (2025-06 on 22 Jul
-- 2025, 2025-07 on 21 Aug 2025, 2026-05 on 19 Jun 2026, 2026-06 on 22 Jul 2026), reaching ECOS at
-- 08:00 KST and marked preliminary, so recent months revise.
--
-- Korea Customs item-level monthly trade statistics were observed holding August 2026 on
-- 22 September 2026. Urdais has fewer observed release dates for this source, so its policy is
-- set later and looser than the observed behaviour: the cost of an over-tight rule is a false
-- claim that Urdais's own data is late.

insert into reference.umpi_source_monitors
  (series_id, source_interface_id, release_day_of_month, grace_days,
   revision_lookback_months, max_check_age_hours, rationale)
select s.id, ss.source_interface_id, 22, 7, 3, 48,
       'Bank of Korea PPI releases observed on the 19th-22nd of the following month '
       '(2025-06 on 22 Jul 2025, 2025-07 on 21 Aug 2025, 2026-05 on 19 Jun 2026, 2026-06 on 22 Jul 2026). '
       'Due on the 22nd with a week of grace for public-holiday slippage; preliminary at first '
       'release, so three recent months are re-read for revisions.'
  from reference.umpi_series s
  join reference.umpi_source_series ss on ss.series_id = s.id
 where s.series_code = 'UMPI-KR-DRAM-PPI'
on conflict (series_id) do nothing;

insert into reference.umpi_source_monitors
  (series_id, source_interface_id, release_day_of_month, grace_days,
   revision_lookback_months, max_check_age_hours, rationale)
select s.id, ss.source_interface_id, 20, 10, 3, 48,
       'Korea Customs item-level monthly trade statistics observed holding August 2026 on '
       '22 September 2026. Urdais holds fewer observed release dates for this source than for the '
       'Bank of Korea, so the due day is set at the 20th with ten days of grace: late enough that a '
       'normal month is never called late, early enough that a genuinely missed month is caught '
       'within about five weeks. Recent months revise as declarations are amended.'
  from reference.umpi_series s
  join reference.umpi_source_series ss on ss.series_id = s.id
 where s.series_code = 'UMPI-KR-DRAM-EXPORT-UV'
on conflict (series_id) do nothing;

do $$
declare n integer;
begin
  select count(*) into n from reference.umpi_source_monitors;
  if n <> 2 then raise exception 'expected a release policy for each UMPI series, found %', n; end if;
end $$;

-- ------------------------------------------------------------------------------- exposure
--
-- Neither schema is API-exposed and neither table gets a policy. The operational record is read
-- by the scheduler and the production check through the server-side connection, and the public
-- read model derives freshness rather than selecting these rows.

-- A run is opened before the work and completed after it, so it keeps `update` — the same
-- allowance `umpi_ingestion_runs` has and for the same reason. A check is written once when the
-- series has been evaluated and is never revised, so it does not.
revoke delete, truncate on pipeline.umpi_operational_runs from service_role;
revoke update, delete, truncate on pipeline.umpi_source_checks from service_role;

alter table reference.umpi_source_monitors enable row level security;
alter table pipeline.umpi_operational_runs enable row level security;
alter table pipeline.umpi_source_checks enable row level security;
