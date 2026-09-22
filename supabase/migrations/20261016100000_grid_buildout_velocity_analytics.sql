-- Grid Buildout Velocity GBV-3: methodology 1.0.0, and where its outputs live.
--
-- GBV-2 deliberately left two ambiguities unresolved in storage: ERCOT's optional mileage columns,
-- and CAISO project identifiers that appear on several owner sheets. This migration registers the
-- methodology version that resolves them, and adds the tables that record what a calculation did.
--
-- The resolution is analytical, not canonical. No GBV-2 row is altered, merged or deleted by this
-- migration or by anything downstream of it: pipeline.buildout_project_resolutions records that N
-- canonical occurrences were counted as one analytical project, and points at every one of them,
-- so a published count can be traced back to the rows the publisher actually printed.

-- ---------------------------------------------------------------- methodology

insert into reference.methodologies (id, slug, name, document_path) values
  ('9b000000-0000-4000-8500-000000000001'::uuid, 'grid-buildout-velocity',
   'Urdais Grid Buildout Velocity', 'docs/methodology/grid-buildout-velocity.md')
on conflict (slug) do nothing;

-- The digest binds the approved rules to the bytes that were approved. Authorisation reads this
-- row; it never reads the file. A filesystem check is what broke Transmission Headroom's first
-- production cron, where docs/ is absent from the serverless bundle.
insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash, effective_from)
select m.id, '1.0.0', 'approved', 'docs/methodology/grid-buildout-velocity.md',
       '89e3089018d86e10d06e9b05c7b52f336494007ec2e1bde414816859ca5e1894',
       timestamptz '2026-09-22T00:00:00Z'
from reference.methodologies m where m.slug = 'grid-buildout-velocity'
on conflict do nothing;

-- ---------------------------------------------------------------- metric vocabulary

create table reference.buildout_metric_definitions (
  code            text primary key
                    constraint buildout_metric_definitions_code_format check (code ~ '^m[1-9][0-9]*_[a-z_]+$'),
  display_name    text not null,
  market          text not null
                    constraint buildout_metric_definitions_market check (market in ('ercot', 'caiso')),
  unit            text not null
                    constraint buildout_metric_definitions_unit check (unit in ('projects', 'days')),
  is_distribution boolean not null default false,
  sample_floor    integer
                    constraint buildout_metric_definitions_floor_positive check (sample_floor is null or sample_floor > 0),
  description     text not null,
  created_at      timestamptz not null default now()
);

comment on table reference.buildout_metric_definitions is
  'The five metrics methodology 1.0.0 publishes. Market is part of the definition because the two markets measure different things and are never combined.';

insert into reference.buildout_metric_definitions
  (code, display_name, market, unit, is_distribution, sample_floor, description) values
  ('m1_projects_entering_service', 'Projects entering service', 'ercot', 'projects', false, null,
   'Count of ERCOT projects in service by list membership whose actual in-service date falls in the period. Sentinel-dated completions cannot be placed in a period and are excluded and counted.'),
  ('m2_active_backlog', 'Active backlog', 'ercot', 'projects', false, null,
   'Point-in-time count of projects under construction, planned or proposed as of the snapshot. A stock, never differenced into a rate.'),
  ('m3_completions_decomposition', 'Completions by service level and works character', 'ercot', 'projects', false, 5,
   'Counts only. Works character is decided by whether each optional mileage column was reported, before any comparison to zero; the unclassified class is never suppressed.'),
  ('m4_schedule_slip', 'Schedule slip against approved in-service date', 'caiso', 'days', true, 12,
   'Current expected in-service minus the date recorded at transmission-plan approval, over analytical projects, published as a distribution and never as a single headline.'),
  ('m5_cancellations', 'Cancellations with published reasons', 'caiso', 'projects', false, null,
   'Counts of cancelled analytical projects with the publisher''s verbatim reason text. No reason taxonomy is invented, and 1.0.0 publishes no on-hold figure.');

-- ---------------------------------------------------------------- runs and results

create table pipeline.buildout_analytics_runs (
  id                     uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  input_digest           text not null
                           constraint buildout_analytics_runs_digest_format check (input_digest ~ '^[0-9a-f]{64}$'),
  ercot_snapshot_id      uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  caiso_snapshot_id      uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  calculated_at          timestamptz not null,
  run_status             text not null default 'validated'
                           constraint buildout_analytics_runs_status check (run_status in ('validated', 'failed')),
  ercot_projects         integer not null
                           constraint buildout_analytics_runs_ercot_nonneg check (ercot_projects >= 0),
  caiso_projects         integer not null
                           constraint buildout_analytics_runs_caiso_nonneg check (caiso_projects >= 0),
  coverage               jsonb not null
                           constraint buildout_analytics_runs_coverage_object check (jsonb_typeof(coverage) = 'object'),
  created_at             timestamptz not null default now()
);

-- One run per (methodology version, evidence). Re-running against unchanged evidence resolves to
-- the run already recorded instead of writing a second identical one.
create unique index buildout_analytics_runs_identity_idx
  on pipeline.buildout_analytics_runs (methodology_version_id, input_digest);

comment on table pipeline.buildout_analytics_runs is
  'One calculation of the Grid Buildout metrics. The input digest is built from snapshot identity and the analytical population, so identical evidence yields an identical digest.';

create trigger buildout_analytics_runs_append_only
  before update or delete on pipeline.buildout_analytics_runs
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_metric_results (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references pipeline.buildout_analytics_runs (id) on delete restrict,
  metric      text not null references reference.buildout_metric_definitions (code) on delete restrict,
  payload     jsonb not null
                constraint buildout_metric_results_payload_object check (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz not null default now()
);

create unique index buildout_metric_results_identity_idx
  on pipeline.buildout_metric_results (run_id, metric);

comment on table pipeline.buildout_metric_results is
  'One metric output per run, stored as the validated payload. Nothing reaches this table that failed its output contract.';

create trigger buildout_metric_results_append_only
  before update or delete on pipeline.buildout_metric_results
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- duplicate resolution evidence

create table pipeline.buildout_project_resolutions (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references pipeline.buildout_analytics_runs (id) on delete restrict,
  market            text not null
                      constraint buildout_project_resolutions_market check (market in ('ercot', 'caiso')),
  analytical_key    text not null
                      constraint buildout_project_resolutions_key_nonempty check (btrim(analytical_key) <> ''),
  native_id         text not null
                      constraint buildout_project_resolutions_native_nonempty check (btrim(native_id) <> ''),
  -- The canonical occurrence this row points at. One row per contributor, so a group of three is
  -- three rows and every one of them is recoverable.
  project_id        uuid not null references pipeline.buildout_projects (id) on delete restrict,
  occurrence        integer not null
                      constraint buildout_project_resolutions_occurrence_positive check (occurrence >= 1),
  contributing_owner text,
  is_primary        boolean not null,
  group_size        integer not null
                      constraint buildout_project_resolutions_group_positive check (group_size >= 1),
  disagreements     jsonb not null default '[]'::jsonb
                      constraint buildout_project_resolutions_disagreements_array check (jsonb_typeof(disagreements) = 'array'),
  created_at        timestamptz not null default now()
);

create unique index buildout_project_resolutions_identity_idx
  on pipeline.buildout_project_resolutions (run_id, analytical_key, project_id);

create index buildout_project_resolutions_group_idx
  on pipeline.buildout_project_resolutions (run_id, analytical_key)
  where group_size > 1;

comment on table pipeline.buildout_project_resolutions is
  'Which canonical occurrences were counted as one analytical project, under which run. Only ERCOT keeps a one-to-one mapping; CAISO co-owned projects resolve many-to-one and every contributor is listed here. No canonical row is modified by this resolution.';

create trigger buildout_project_resolutions_append_only
  before update or delete on pipeline.buildout_project_resolutions
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- invariants

create or replace function pipeline.buildout_analytics_violations()
returns table (violation text, detail text, occurrences bigint)
language sql
stable
as $$
  -- A published figure must come from the approved methodology version, not merely a registered one.
  select 'run_on_unapproved_methodology',
         'an analytics run cites a methodology version that is not approved',
         count(*)
    from pipeline.buildout_analytics_runs r
    join reference.methodology_versions mv on mv.id = r.methodology_version_id
   where mv.status <> 'approved'
  having count(*) > 0

  union all
  -- A run must name two different snapshots: the markets are never the same source.
  select 'run_reuses_one_snapshot',
         'an analytics run cites the same snapshot for both markets',
         count(*)
    from pipeline.buildout_analytics_runs
   where ercot_snapshot_id = caiso_snapshot_id
  having count(*) > 0

  union all
  -- A resolution group must have exactly one primary, or value selection was ambiguous.
  select 'resolution_group_primary_count',
         'a resolution group does not have exactly one primary occurrence',
         count(*)
    from (
      select run_id, analytical_key
        from pipeline.buildout_project_resolutions
       group by run_id, analytical_key
      having count(*) filter (where is_primary) <> 1) bad
  having count(*) > 0

  union all
  -- The recorded group size must match the number of contributors actually recorded.
  select 'resolution_group_size_mismatch',
         'a resolution group size disagrees with its recorded contributors',
         count(*)
    from (
      select run_id, analytical_key
        from pipeline.buildout_project_resolutions
       group by run_id, analytical_key, group_size
      having count(*) <> min(group_size)) bad
  having count(*) > 0

  union all
  -- Exact-identifier resolution only: every contributor shares the group's native id.
  select 'resolution_group_mixes_identifiers',
         'a resolution group contains more than one native identifier',
         count(*)
    from (
      select run_id, analytical_key
        from pipeline.buildout_project_resolutions
       group by run_id, analytical_key
      having count(distinct native_id) > 1) bad
  having count(*) > 0

  union all
  -- ERCOT never resolves occurrences together; its repeats are one publisher reusing a number.
  select 'ercot_occurrences_resolved_together',
         'an ERCOT analytical project groups more than one canonical occurrence',
         count(*)
    from pipeline.buildout_project_resolutions
   where market = 'ercot' and group_size > 1
  having count(*) > 0

  union all
  -- A resolution must point at a project that really belongs to the market it claims.
  select 'resolution_market_mismatch',
         'a resolution cites a project from another market',
         count(*)
    from pipeline.buildout_project_resolutions res
    join pipeline.buildout_projects p on p.id = res.project_id
    join reference.grid_areas ga on ga.id = p.grid_area_id
   where ga.slug <> res.market
  having count(*) > 0

  union all
  -- Every stored metric must be one the methodology defines.
  select 'result_without_definition',
         'a metric result names a metric the methodology does not define',
         count(*)
    from pipeline.buildout_metric_results r
   where not exists (select 1 from reference.buildout_metric_definitions d where d.code = r.metric)
  having count(*) > 0;
$$;

comment on function pipeline.buildout_analytics_violations() is
  'Invariants for the analytical layer, chiefly that duplicate resolution stayed exact-identifier and CAISO-only, and that no figure rests on an unapproved methodology. Expected to be empty.';

-- ---------------------------------------------------------------- security

alter table reference.buildout_metric_definitions enable row level security;
alter table pipeline.buildout_analytics_runs enable row level security;
alter table pipeline.buildout_metric_results enable row level security;
alter table pipeline.buildout_project_resolutions enable row level security;
