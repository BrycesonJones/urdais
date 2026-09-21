-- IQ-6: the derived analytics layer, and the methodology it is bound to.
--
-- Two tables and one promotion. A calculation run records what was computed, from which
-- methodology version, over which canonical inputs; a metric result records one number with the
-- sample it rests on, the coverage it excluded, and whether it may be shown at all.
--
-- The shape is driven by what this product must never do. A metric here cannot exist without a
-- methodology version, a sample size and a publication decision, because every one of those
-- absences is a way to publish something indefensible: a completion rate with no cohort, a median
-- over four projects, or an SPP figure that should never have left the building.

-- ------------------------------------------------------------------ vocabulary

create table reference.interconnection_metric_definitions (
  code            text primary key
                    constraint interconnection_metric_definitions_code_lower
                    check (code = lower(btrim(code)) and code <> ''),
  label           text not null
                    constraint interconnection_metric_definitions_label_nonempty check (btrim(label) <> ''),
  family          text not null
                    constraint interconnection_metric_definitions_family_allowed
                    check (family in ('stock', 'flow', 'cohort', 'age', 'mix', 'load')),
  unit            text not null
                    constraint interconnection_metric_definitions_unit_allowed
                    check (unit in ('requests', 'MW', 'ratio', 'years')),
  -- How far this metric may be compared across markets. Tier C is never put on one axis with
  -- another market's value.
  comparability   text not null
                    constraint interconnection_metric_definitions_comparability_allowed
                    check (comparability in ('A', 'B', 'C', 'none')),
  -- False for a metric the methodology names but does not approve. It still appears in the API,
  -- with a status saying why, because a silent absence reads as a zero.
  is_live         boolean not null,
  deferred_reason text,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint interconnection_metric_definitions_deferred_has_reason
    check (is_live or deferred_reason is not null)
);

comment on table reference.interconnection_metric_definitions is
  'The metrics the approved methodology names, live or deferred. A deferred metric is published as a named metric with a reason, never as a blank.';

insert into reference.interconnection_metric_definitions
  (code, label, family, unit, comparability, is_live, deferred_reason, notes) values
  ('active_request_count', 'Active projects', 'stock', 'requests', 'A', true, null,
   'Canonical stable requests whose latest observation is non-terminal, eligible subtype, generation family.'),
  ('active_request_count_by_technology', 'Active projects by technology', 'mix', 'requests', 'A', true, null,
   'Count-based and multi-label: a hybrid is one project tagged with each technology it names, so shares sum above 100%.'),
  ('active_mw', 'Active capacity', 'stock', 'MW', 'C', true, null,
   'Market-specific, naming the publisher''s own field. Never compared across markets and never totalled.'),
  ('queue_age_years', 'Queue age', 'age', 'years', 'A', true, null,
   'Observation date minus the publisher''s request date, on active requests. Median, p75 and p90; never a mean.'),
  ('annual_entries', 'Projects entering the queue', 'flow', 'requests', 'A', true, null,
   'Basis is recorded per market: an application date where the publisher states one, otherwise the first vintage in which Urdais observed the request.'),
  ('annual_withdrawals', 'Projects withdrawn', 'flow', 'requests', 'A', true, null,
   'Source-reported withdrawals only. A request that stops appearing has not withdrawn.'),
  ('project_completion_rate', 'Project completion rate', 'cohort', 'ratio', 'B', true, null,
   'Of eligible requests entering a mature cohort, the share that reached operation on explicit evidence.'),
  ('time_to_operation_years', 'Time to operation', 'cohort', 'years', 'B', true, null,
   'Actual commercial operation date minus request date, both explicit. Median, p75 and p90.'),
  ('explicit_ai_data_center_load', 'AI data-centre load', 'load', 'requests', 'C', true, null,
   'From the publisher''s own end-use code only. A market publishing no classification has an unknown AI load, not a zero one.'),
  ('mw_completion_rate', 'Capacity completion rate', 'cohort', 'ratio', 'none', false,
   'The two markets that support a project completion rate are exactly the two with no agreed MW field, so a capacity version cannot be derived from the project version. Deferred for every market.',
   'Named so the absence is visible. Never computed, never a placeholder.');

-- ------------------------------------------------------------------ calculation runs

create table pipeline.interconnection_analytics_runs (
  id                      uuid primary key default gen_random_uuid(),
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  calculated_at           timestamptz not null,
  -- Digest of the canonical inputs this run read. An unchanged digest means an unchanged answer,
  -- which is what makes a rerun a no-op instead of a second copy of the same numbers.
  input_digest            text not null
                            constraint interconnection_runs_digest_format check (input_digest ~ '^[0-9a-f]{64}$'),
  -- The snapshots the run drew on, so a published figure can name its evidence.
  snapshot_ids            uuid[] not null
                            constraint interconnection_runs_snapshots_present check (array_length(snapshot_ids, 1) > 0),
  request_count           integer not null
                            constraint interconnection_runs_requests_nonneg check (request_count >= 0),
  observation_count       integer not null
                            constraint interconnection_runs_observations_nonneg check (observation_count >= 0),
  run_status              text not null
                            constraint interconnection_runs_status_allowed
                            check (run_status in ('validated', 'failed')),
  notes                   text,
  created_at              timestamptz not null default now(),
  unique (methodology_version_id, input_digest)
);

comment on table pipeline.interconnection_analytics_runs is
  'One derived-analytics calculation. Identified by the methodology version and a digest of the canonical inputs, so recomputing unchanged inputs resolves to the run already recorded.';

create index interconnection_runs_calculated_idx
  on pipeline.interconnection_analytics_runs (calculated_at desc);

create trigger interconnection_analytics_runs_append_only
  before update or delete on pipeline.interconnection_analytics_runs
  for each row execute function pipeline.forbid_mutation();

-- ------------------------------------------------------------------ metric results

create table pipeline.interconnection_metric_results (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references pipeline.interconnection_analytics_runs (id) on delete restrict,
  metric_code       text not null references reference.interconnection_metric_definitions (code) on delete restrict,
  grid_area_id      uuid not null references reference.grid_areas (id) on delete restrict,

  -- What the value is about, where a metric is sliced. Null for a whole-market figure.
  dimension_kind    text
                      constraint interconnection_results_dimension_allowed
                      check (dimension_kind is null or dimension_kind in
                             ('technology', 'statistic', 'cohort_year', 'period_year', 'end_use')),
  dimension_value   text,

  -- A value exists only when the status says one may. Every other status carries null, never zero.
  status            text not null
                      constraint interconnection_results_status_allowed
                      check (status in ('live', 'not_available', 'insufficient_sample',
                                        'insufficient_maturity', 'rights_blocked',
                                        'methodology_deferred', 'source_unavailable')),
  value             numeric
                      constraint interconnection_results_value_finite
                      check (value is null or value <> 'NaN'::numeric),
  unit              text not null
                      constraint interconnection_results_unit_allowed
                      check (unit in ('requests', 'MW', 'ratio', 'years')),
  -- The publisher's own field, where the value came from one. A market-specific MW must say it.
  native_field      text,
  -- Which entry basis produced this figure, where the metric has one.
  basis             text
                      constraint interconnection_results_basis_allowed
                      check (basis is null or basis in ('source_reported_application_date', 'snapshot_first_seen')),

  sample_size       integer not null
                      constraint interconnection_results_sample_nonneg check (sample_size >= 0),
  -- How many canonical requests the metric's own population held, and how many it excluded.
  population_size   integer not null
                      constraint interconnection_results_population_nonneg check (population_size >= 0),
  excluded_count    integer not null default 0
                      constraint interconnection_results_excluded_nonneg check (excluded_count >= 0),
  coverage          jsonb not null default '{}'::jsonb
                      constraint interconnection_results_coverage_object check (jsonb_typeof(coverage) = 'object'),

  publication_state text not null
                      constraint interconnection_results_publication_allowed
                      check (publication_state in ('publishable', 'internal_only')),
  rights_reason     text,
  created_at        timestamptz not null default now(),

  unique nulls not distinct (run_id, metric_code, grid_area_id, dimension_kind, dimension_value),

  -- A live metric has a value; everything else does not. This is the rule that stops an absent
  -- number becoming a zero on a chart.
  constraint interconnection_results_live_has_value
    check ((status = 'live') = (value is not null)),
  -- A blocked metric may never carry a number at all, whatever its status says.
  constraint interconnection_results_blocked_has_no_value
    check (publication_state = 'publishable' or status <> 'live' or value is not null),
  constraint interconnection_results_rights_blocked_is_internal
    check (status <> 'rights_blocked' or publication_state = 'internal_only'),
  constraint interconnection_results_dimension_pairs
    check ((dimension_kind is null) = (dimension_value is null))
);

comment on table pipeline.interconnection_metric_results is
  'One derived value, or one stated reason there is none. A result without a live status carries no number, so an absence can never be rendered as a zero.';

create index interconnection_results_run_idx
  on pipeline.interconnection_metric_results (run_id, metric_code);
create index interconnection_results_metric_idx
  on pipeline.interconnection_metric_results (metric_code, grid_area_id);

create trigger interconnection_metric_results_append_only
  before update or delete on pipeline.interconnection_metric_results
  for each row execute function pipeline.forbid_mutation();

-- A result computed from a market whose terms forbid publication may not be marked publishable.
-- The check runs against the rights determination in force rather than against a copied flag.
create or replace function pipeline.check_interconnection_result_rights()
returns trigger language plpgsql as $$
declare blocked boolean;
begin
  if new.publication_state <> 'publishable' then return new; end if;
  -- Snapshots carry both the market and the source interface it came from, so the check works
  -- from the moment a market has been ingested rather than only once requests exist.
  select exists (
    select 1
      from pipeline.interconnection_queue_snapshots q
      join reference.source_use_permissions sup on sup.source_interface_id = q.source_interface_id
      join reference.source_use_purposes u on u.code = sup.purpose_code
     where q.grid_area_id = new.grid_area_id and u.is_public
       and (sup.disposition <> 'permitted'
            or sup.rights_classification = 'unsuitable_without_permission')
  ) into blocked;
  if blocked then
    raise exception 'market % may not publish a derived metric: its source terms block public display',
      new.grid_area_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger interconnection_metric_results_rights_check
  before insert on pipeline.interconnection_metric_results
  for each row execute function pipeline.check_interconnection_result_rights();

-- ------------------------------------------------------------------ methodology 1.0.0

-- The draft is superseded and keeps its hash: that digest records the document as it stood when
-- it was drafted, which is the point of recording one at all. Its successor carries the lineage.
update reference.methodology_versions mv
   set status = 'superseded'
  from reference.methodologies m
 where m.id = mv.methodology_id
   and m.slug = 'interconnection-queue-analytics' and mv.version = '0.1.0-draft';

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from)
values
  ('97000000-0000-4000-8000-000000000022', '97000000-0000-4000-8000-000000000020',
   '1.0.0', 'approved', 'docs/methodology/interconnection-queue-analytics.md',
   '391ccc7e4f9dd3ef5777d7bc8b2f1b75518d0fe4c022b5ce3f81da111068d754', date '2026-09-21')
on conflict (methodology_id, version) do nothing;

do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv.status = 'approved'
     and mv.version = '1.0.0' and mv.content_hash is not null and mv.effective_from is not null;
  if n <> 1 then raise exception 'expected one approved analytics methodology version, found %', n; end if;

  -- Capacity completion is named and deferred, not quietly absent.
  select count(*) into n from reference.interconnection_metric_definitions
   where code = 'mw_completion_rate' and not is_live and deferred_reason is not null;
  if n <> 1 then raise exception 'the capacity completion rate is not registered as deferred'; end if;

  -- No metric definition claims a cross-market MW comparison.
  select count(*) into n from reference.interconnection_metric_definitions
   where unit = 'MW' and comparability in ('A', 'B');
  if n <> 0 then raise exception 'an MW metric claims cross-market comparability'; end if;

  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain'; end if;
end $$;

alter table reference.interconnection_metric_definitions enable row level security;
alter table pipeline.interconnection_analytics_runs enable row level security;
alter table pipeline.interconnection_metric_results enable row level security;
