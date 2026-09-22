-- Transmission Headroom TH-3: the methodology, the metric registry and the derived analytics layer.
--
-- TH-2 canonicalised the evidence. This adds the layer that turns it into published statistics, and
-- the rules that keep those statistics from saying more than the sources support.
--
-- Three things are structural rather than conventional:
--
--   Every result binds to exactly one market. There is no column in which a cross-market total
--   could be stored, which is how "no combined headroom figure" stops being a promise and becomes
--   a property of the schema.
--
--   Only a live result carries a number. The other statuses -- stale source, insufficient sample,
--   deferred, rights-blocked -- carry a reason and a null, so an absence cannot be rendered as a
--   zero anywhere downstream.
--
--   An entity-scoped metric must name its entity and a market-scoped one must not, so a
--   point-in-time distribution can never be quietly stored as though it belonged to one interface.

-- ---------------------------------------------------------------- methodology

insert into reference.methodologies (id, slug, name, document_path) values
  ('92000000-0000-4000-8500-000000000001'::uuid, 'transmission-headroom',
   'Urdais Transmission Headroom', 'docs/methodology/transmission-headroom.md')
on conflict (slug) do nothing;

insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash, effective_from)
select m.id, '1.0.0', 'approved', 'docs/methodology/transmission-headroom.md',
       '965a5b70651879ad303316fbde86762faafdb9536d9c2c70b5b3dbd31df43ce6',
       timestamptz '2026-09-22T00:00:00Z'
from reference.methodologies m where m.slug = 'transmission-headroom'
on conflict do nothing;

-- ---------------------------------------------------------------- metric registry

create table reference.transmission_metric_definitions (
  code            text primary key,
  market_slug     text not null
                    references reference.grid_areas (slug) on delete restrict,
  label           text not null,
  family          text not null
                    constraint transmission_metric_family_allowed
                    check (family in ('headroom', 'utilization', 'distribution', 'count', 'history')),
  unit            text not null
                    constraint transmission_metric_unit_allowed
                    check (unit in ('MW', 'percent', 'observations', 'entities')),
  -- Entity-scoped metrics describe one interface or constraint; market-scoped ones describe a
  -- point-in-time distribution over all of them. Storing one as the other is the mistake this
  -- distinction exists to prevent.
  scope           text not null
                    constraint transmission_metric_scope_allowed
                    check (scope in ('entity', 'market')),
  -- Entity-weighted point-in-time, or observation-weighted history. Never both.
  weighting       text
                    constraint transmission_metric_weighting_allowed
                    check (weighting is null or weighting in ('entity_point_in_time', 'observation_history')),
  minimum_entities integer
                    constraint transmission_metric_floor_nonneg
                    check (minimum_entities is null or minimum_entities >= 0),
  is_live         boolean not null default true,
  deferred_reason text,
  notes           text,
  created_at      timestamptz not null default now(),

  -- Every market-scoped distribution needs a floor; a per-entity value does not.
  constraint transmission_metric_distribution_has_floor check (
    family <> 'distribution' or minimum_entities is not null),
  -- A metric that is not live must say why, and one that is live must not pretend to be deferred.
  constraint transmission_metric_deferred_has_reason check (
    is_live = (deferred_reason is null))
);

comment on table reference.transmission_metric_definitions is
  'Every metric this product may publish, bound to exactly one market. There is deliberately no cross-market row: NYISO interface headroom and ERCOT constraint margin describe different populations and are never combined.';

comment on column reference.transmission_metric_definitions.minimum_entities is
  'The floor below which a distribution is withheld. 10 for a median, 12 for a decile: below 12 a tail percentile interpolates between fewer than two entities. A floor of 20 was rejected because NYISO publishes nineteen interfaces in total, so it would suppress a complete population rather than a sparse one.';

insert into reference.transmission_metric_definitions
  (code, market_slug, label, family, unit, scope, weighting, minimum_entities, is_live, deferred_reason, notes) values
  -- NYISO
  ('interface_headroom_mw', 'nyiso', 'Interface headroom', 'headroom', 'MW', 'entity', null, null, true, null,
   'Direction selected from the sign of flow before any absolute value is taken.'),
  ('interface_utilization_pct', 'nyiso', 'Interface utilization', 'utilization', 'percent', 'entity', null, null, true, null,
   'abs(flow) / abs(selected limit). Never computed against a sentinel, a zero denominator or an undetermined direction. Values above 100% are preserved.'),
  ('interface_headroom_median_mw', 'nyiso', 'Median interface headroom', 'distribution', 'MW', 'market', 'entity_point_in_time', 10, true, null,
   'One latest eligible observation per interface, so a high-frequency entity cannot dominate.'),
  ('interface_headroom_p10_mw', 'nyiso', 'Interface headroom, 10th percentile', 'distribution', 'MW', 'market', 'entity_point_in_time', 12, true, null, null),
  ('interface_headroom_p25_mw', 'nyiso', 'Interface headroom, 25th percentile', 'distribution', 'MW', 'market', 'entity_point_in_time', 12, true, null, null),
  ('interface_utilization_median_pct', 'nyiso', 'Median interface utilization', 'distribution', 'percent', 'market', 'entity_point_in_time', 10, true, null, null),
  ('interface_utilization_p90_pct', 'nyiso', 'Interface utilization, 90th percentile', 'distribution', 'percent', 'market', 'entity_point_in_time', 12, true, null, null),
  ('interface_negative_headroom_observations', 'nyiso', 'Observations with negative headroom', 'count', 'observations', 'market', 'observation_history', null, true, null,
   'Counted over retained history, not a point in time.'),
  ('interfaces_at_limit_count', 'nyiso', 'Interfaces at their limit', 'count', 'entities', 'market', 'entity_point_in_time', null, false,
   'Zero headroom on a scheduled HVDC or merchant tie is routine full scheduling, not congestion, and the source publishes no way to separate those ties from free-flowing AC interfaces. Deferred until the subtype question is source-backed.', null),

  -- ERCOT
  ('constraint_margin_mw', 'ercot', 'Constraint margin', 'headroom', 'MW', 'entity', null, null, true, null,
   'Limit minus Value. ERCOT publishes the flow already oriented, so no direction is selected and none is labelled.'),
  ('constraint_utilization_pct', 'ercot', 'Constraint utilization', 'utilization', 'percent', 'entity', null, null, true, null,
   'Value / Limit. Never computed from a limit beyond the plausibility bound. Values above 100% are preserved.'),
  ('constraint_margin_median_mw', 'ercot', 'Median tracked-constraint margin', 'distribution', 'MW', 'market', 'entity_point_in_time', 10, true, null,
   'Spans base-case and post-contingency constraints; the coverage payload reports the split.'),
  ('constraint_margin_p10_mw', 'ercot', 'Tracked-constraint margin, 10th percentile', 'distribution', 'MW', 'market', 'entity_point_in_time', 12, true, null, null),
  ('constraint_margin_p25_mw', 'ercot', 'Tracked-constraint margin, 25th percentile', 'distribution', 'MW', 'market', 'entity_point_in_time', 12, true, null, null),
  ('constraint_utilization_median_pct', 'ercot', 'Median tracked-constraint utilization', 'distribution', 'percent', 'market', 'entity_point_in_time', 10, true, null, null),
  ('constraint_utilization_p90_pct', 'ercot', 'Tracked-constraint utilization, 90th percentile', 'distribution', 'percent', 'market', 'entity_point_in_time', 12, true, null, null),
  ('binding_tracked_constraints', 'ercot', 'Binding tracked constraints', 'count', 'entities', 'market', 'entity_point_in_time', null, true, null,
   'From the source shadow price, never from a margin of zero: 47 canonical observations carry a zero margin and a zero shadow price.'),
  ('constraint_negative_margin_observations', 'ercot', 'Observations with negative margin', 'count', 'observations', 'market', 'observation_history', null, true, null, null),
  ('ercot_network_headroom_mw', 'ercot', 'ERCOT network headroom', 'headroom', 'MW', 'market', null, null, false,
   'NP6-86-CD publishes only the constraints dispatch was actively tracking, so the denominator is invisible and no network-wide figure can be derived from it. Not a sample-size problem and not resolvable by more retrieval.', null);

-- ---------------------------------------------------------------- runs

create table pipeline.transmission_analytics_runs (
  id                      uuid primary key default gen_random_uuid(),
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  calculation_version_id  uuid not null references reference.transmission_calculation_versions (id) on delete restrict,
  -- A digest of the canonical margins the run read. Identical inputs under an identical
  -- methodology resolve to the run already recorded rather than producing a second copy.
  input_digest            text not null
                            constraint transmission_run_digest_format check (input_digest ~ '^[0-9a-f]{64}$'),
  calculated_at           timestamptz not null,
  run_status              text not null
                            constraint transmission_run_status_allowed
                            check (run_status in ('validated', 'failed')),
  margin_count            integer not null
                            constraint transmission_run_margin_nonneg check (margin_count >= 0),
  notes                   text,
  created_at              timestamptz not null default now(),

  unique (methodology_version_id, input_digest)
);

comment on table pipeline.transmission_analytics_runs is
  'One calculation over one frozen set of canonical margins. The digest is what makes a rerun a no-op instead of a second set of identical numbers.';

create trigger transmission_analytics_runs_append_only
  before update or delete on pipeline.transmission_analytics_runs
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- results

create table pipeline.transmission_metric_results (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references pipeline.transmission_analytics_runs (id) on delete restrict,
  metric_code         text not null references reference.transmission_metric_definitions (code) on delete restrict,
  -- Exactly one market. There is nowhere to put a figure spanning both.
  market_slug         text not null references reference.grid_areas (slug) on delete restrict,
  source_interface_id uuid not null references reference.source_interfaces (id) on delete restrict,
  -- Set for an entity-scoped metric, null for a market-scoped one.
  entity_id           uuid,
  entity_label        text,
  contingency_kind    text references reference.transmission_contingency_kinds (code) on delete restrict,

  -- The instant the underlying observation was published, for a current value.
  observed_at         timestamptz,
  status              text not null
                        constraint transmission_result_status_allowed
                        check (status in ('live', 'not_available', 'insufficient_sample',
                                          'source_stale', 'rights_blocked', 'methodology_deferred')),
  value               numeric(16, 4),
  unit                text not null,
  sample_size         integer not null default 0
                        constraint transmission_result_sample_nonneg check (sample_size >= 0),
  coverage            jsonb not null default '{}'::jsonb
                        constraint transmission_result_coverage_object check (jsonb_typeof(coverage) = 'object'),
  publication_state   text not null
                        constraint transmission_result_publication_allowed
                        check (publication_state in ('publishable', 'internal_only')),
  rights_reason       text,
  created_at          timestamptz not null default now(),

  -- Exactly one status carries a number.
  constraint transmission_result_live_has_value check ((status = 'live') = (value is not null)),
  -- A blocked result is never publishable, whatever anything downstream believes.
  constraint transmission_result_blocked_is_internal check (
    status <> 'rights_blocked' or publication_state = 'internal_only'),
  -- Scope is honoured: an entity metric names its entity, a market metric does not.
  constraint transmission_result_entity_scope check (
    (entity_id is null) = (entity_label is null))
);

-- Expression-bearing, so an index rather than a table constraint. The coalesces matter: nulls are
-- distinct in a unique index, so without them a market-scoped metric could be written twice.
create unique index transmission_results_identity_idx
  on pipeline.transmission_metric_results
  (run_id, metric_code, market_slug,
   coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(contingency_kind, ''));

comment on constraint transmission_result_live_has_value on pipeline.transmission_metric_results is
  'An absence is never a zero. A stale source, a population under its floor and a deferred metric each carry a reason and a null.';

create index transmission_results_run_idx on pipeline.transmission_metric_results (run_id, market_slug);
create index transmission_results_metric_idx on pipeline.transmission_metric_results (metric_code, market_slug);

create trigger transmission_metric_results_append_only
  before update or delete on pipeline.transmission_metric_results
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- scope invariant
--
-- A check constraint cannot see the registry, so the scope rule is a trigger.

create or replace function pipeline.check_transmission_result_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pipeline, reference
as $$
declare
  want_scope text;
  want_market text;
  want_live boolean;
begin
  select scope, market_slug, is_live into want_scope, want_market, want_live
    from reference.transmission_metric_definitions where code = new.metric_code;

  if want_market <> new.market_slug then
    raise exception 'metric % belongs to % and cannot be stored against %',
      new.metric_code, want_market, new.market_slug using errcode = 'check_violation';
  end if;

  if want_scope = 'entity' and new.entity_id is null then
    raise exception 'metric % is entity-scoped and needs an entity', new.metric_code
      using errcode = 'check_violation';
  end if;
  if want_scope = 'market' and new.entity_id is not null then
    raise exception 'metric % is market-scoped and must not name an entity', new.metric_code
      using errcode = 'check_violation';
  end if;

  -- A metric the methodology does not approve may be recorded, but only as deferred and never
  -- with a number.
  if not want_live and new.status <> 'methodology_deferred' then
    raise exception 'metric % is not approved and may only be recorded as methodology_deferred',
      new.metric_code using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger transmission_metric_results_scope_check
  before insert on pipeline.transmission_metric_results
  for each row execute function pipeline.check_transmission_result_scope();

-- ---------------------------------------------------------------- security

alter table reference.transmission_metric_definitions enable row level security;
alter table pipeline.transmission_analytics_runs enable row level security;
alter table pipeline.transmission_metric_results enable row level security;
