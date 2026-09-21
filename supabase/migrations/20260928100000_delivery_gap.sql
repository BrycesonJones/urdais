-- PD-5A: the delivery gap, and the small number of places it may be taken.
--
-- A gap is forecast demand minus an approved planning capacity, and it exists only where the two
-- sides describe the same thing: the same market, the same season of the same year, the same peak
-- definition, the same load and resource scope. PD-5A found exactly one market where all of that
-- holds, which is why this schema is built to record a pairing rather than to compute one from
-- whatever rows happen to be current.
--
-- Both sides are frozen by row id. A gap that cannot be reconstructed from the exact demand point
-- and the exact capacity result it came from is a gap nobody can check, and this is the number
-- most likely to be quoted back at Urdais.

create table pipeline.delivery_gap_results (
  id                      uuid primary key default gen_random_uuid(),
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  grid_area_id            uuid not null references reference.grid_areas (id) on delete restrict,
  -- Null throughout V1. A locational gap needs locational capacity, which no market publishes in
  -- a form this pipeline holds.
  grid_subarea_id         uuid references reference.grid_subareas (id) on delete restrict,

  -- Both scenarios, because a gap is a statement about one demand case against one capacity case
  -- and the two come from different studies. Naming only one would hide half of what was assumed.
  demand_scenario_id      uuid not null references pipeline.planning_forecast_scenarios (id) on delete restrict,
  capacity_scenario_id    uuid not null references pipeline.grid_capacity_scenarios (id) on delete restrict,

  period_basis            text not null
                            constraint delivery_gap_results_period_basis_allowed
                            check (period_basis in ('calendar', 'delivery_year', 'capability_year',
                                                    'capacity_commitment_period', 'planning_year', 'seasonal')),
  target_year             integer not null
                            constraint delivery_gap_results_year_range check (target_year between 1990 and 2200),
  target_season           text
                            constraint delivery_gap_results_season_allowed
                            check (target_season in ('winter', 'spring', 'summer', 'fall')),
  -- The peak the demand side measured. A coincident peak and a non-coincident one are different
  -- questions, and a gap against the wrong one is a different number wearing the same name.
  peak_type               text not null
                            constraint delivery_gap_results_peak_type_nonempty check (btrim(peak_type) <> ''),

  demand_value            numeric not null
                            constraint delivery_gap_results_demand_finite check (demand_value <> 'NaN'::numeric),
  capacity_value          numeric not null
                            constraint delivery_gap_results_capacity_finite check (capacity_value <> 'NaN'::numeric),
  -- Positive means forecast demand exceeds approved planning capacity.
  gap_value               numeric not null
                            constraint delivery_gap_results_gap_finite check (gap_value <> 'NaN'::numeric),

  -- A gap is an amount of power. A rate is something a publisher says, never a conclusion here.
  unit                    text not null
                            constraint delivery_gap_results_unit_allowed check (unit in ('MW', 'GW')),
  capacity_basis          text not null references reference.capacity_bases (code) on delete restrict,

  calculation_status      text not null
                            constraint delivery_gap_results_calculation_status_allowed
                            check (calculation_status in ('draft', 'validated', 'failed')),
  publication_state       text not null default 'internal_only'
                            constraint delivery_gap_results_publication_state_allowed
                            check (publication_state in ('internal_only', 'publication_candidate', 'published', 'withdrawn')),
  calculation_notes       text,

  superseded_by_id        uuid references pipeline.delivery_gap_results (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  constraint delivery_gap_results_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint delivery_gap_results_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  -- The arithmetic is checked by the database, so a result cannot disagree with its own inputs.
  constraint delivery_gap_results_is_the_difference
    check (gap_value = demand_value - capacity_value),
  constraint delivery_gap_results_seasonal_names_a_season
    check (period_basis <> 'seasonal' or target_season is not null),
  constraint delivery_gap_results_publication_requires_validation
    check (publication_state in ('internal_only', 'withdrawn') or calculation_status = 'validated')
);

comment on table pipeline.delivery_gap_results is
  'Forecast demand minus approved planning capacity, for the pairings a methodology version approves. Positive means demand exceeds capacity. It is not transmission headroom, not operational headroom, and not a resource adequacy surplus against a requirement.';

create unique index delivery_gap_results_current_idx
  on pipeline.delivery_gap_results
  (methodology_version_id, grid_area_id, grid_subarea_id, demand_scenario_id, capacity_scenario_id,
   period_basis, target_year, target_season, peak_type, unit)
  nulls not distinct
  where superseded_by_id is null;
create index delivery_gap_results_market_idx
  on pipeline.delivery_gap_results (grid_area_id, target_year, target_season);

create trigger delivery_gap_results_supersede_only
  before update or delete on pipeline.delivery_gap_results
  for each row execute function pipeline.allow_only_supersession();

-- A gap may not be published under a methodology version that is not approved, and a locality it
-- names must sit inside its market.
create or replace function pipeline.check_delivery_gap_publication()
returns trigger language plpgsql as $$
declare status text; owner uuid;
begin
  if new.publication_state in ('publication_candidate', 'published') then
    select mv.status into status from reference.methodology_versions mv where mv.id = new.methodology_version_id;
    if status <> 'approved' then
      raise exception 'a delivery gap under a % methodology version may not be published', status
        using errcode = 'check_violation';
    end if;
  end if;
  if new.grid_subarea_id is not null then
    select grid_area_id into owner from reference.grid_subareas where id = new.grid_subarea_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'locality % is not inside market %', new.grid_subarea_id, new.grid_area_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger delivery_gap_results_publication_check
  before insert or update on pipeline.delivery_gap_results
  for each row execute function pipeline.check_delivery_gap_publication();

-- ------------------------------------------------------------------ the two frozen inputs

create table pipeline.delivery_gap_result_inputs (
  id                  uuid primary key default gen_random_uuid(),
  result_id           uuid not null references pipeline.delivery_gap_results (id) on delete restrict,
  input_kind          text not null
                        constraint delivery_gap_inputs_kind_allowed
                        check (input_kind in ('planning_point', 'capacity_result')),
  planning_point_id   uuid references pipeline.planning_forecast_points (id) on delete restrict,
  capacity_result_id  uuid references pipeline.deliverable_capacity_results (id) on delete restrict,
  input_role          text not null
                        constraint delivery_gap_inputs_role_nonempty check (btrim(input_role) <> ''),
  created_at          timestamptz not null default now(),
  constraint delivery_gap_inputs_one_reference check (
    (input_kind = 'planning_point' and planning_point_id is not null and capacity_result_id is null) or
    (input_kind = 'capacity_result' and capacity_result_id is not null and planning_point_id is null)
  ),
  unique (result_id, planning_point_id, capacity_result_id)
);

comment on table pipeline.delivery_gap_result_inputs is
  'The exact demand point and capacity result behind one gap. A published gap must be reconstructible from these two row ids and its approved methodology version alone.';

create index delivery_gap_inputs_result_idx on pipeline.delivery_gap_result_inputs (result_id);
create trigger delivery_gap_result_inputs_append_only
  before update or delete on pipeline.delivery_gap_result_inputs
  for each row execute function pipeline.forbid_mutation();

-- ----------------------------------------------------------------------- methodology

insert into reference.methodologies (id, slug, name, document_path) values
  ('97000000-0000-4000-8000-000000000010', 'power-delivery-gap',
   'Urdais Power Delivery Gap', 'docs/methodology/power-delivery-gap.md')
on conflict (slug) do nothing;

-- Approved, because one market survives every compatibility test. A methodology that covers one
-- market honestly is worth more than one that covers seven by relaxing what "comparable" means.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from)
values
  ('97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000010',
   '1.0.0', 'approved', 'docs/methodology/power-delivery-gap.md',
   'e760d5dd42cc828f3351a9f9f15b06672a237fa06a34dd6e6e211ab1aff1c8eb', date '2026-09-21')
on conflict (methodology_id, version) do nothing;

-- The purpose exists from PD-4B; what it lacked was any determination. One is added for each of
-- the two ERCOT sources that feed the only approved pairing. No determination is created for any
-- other source: nobody has reviewed delivery-gap display for a market that produces no gap, and
-- an absent determination correctly reads as blocked rather than as permitted.
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, 'public_derived_delivery_gap_display', 'reusable_with_attribution_or_conditions', 'permitted',
       true, v.attribution,
       'Credit ERCOT as the source of both the demand forecast and the capacity report, and state that the gap is an Urdais calculation.',
       'Counsel to confirm that ERCOT Terms of Use section 5 reaches a derived difference of two ERCOT figures displayed in a commercial product.',
       'https://www.ercot.com/help/terms', 'Urdais research', date '2026-09-21',
       timestamptz '2026-09-21T00:00:00Z',
       'Added by PD-5A for the only approved delivery gap pairing. ERCOT section 5 permits raw public data to be used in compilations, charts and analyses; a delivery gap is such an analysis.'
from (values
  ('ercot-long-term-load-forecast',
   'Demand: Electric Reliability Council of Texas, Inc., Long-Term Load Forecast. Gap calculated by Urdais.'),
  ('ercot-capacity-demand-reserves',
   'Capacity: Electric Reliability Council of Texas, Inc., Capacity, Demand and Reserves Report. Gap calculated by Urdais.')
) as v(slug, attribution)
join reference.source_interfaces s on s.slug = v.slug;

do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'power-delivery-gap' and mv.status = 'approved' and mv.content_hash is not null
     and mv.effective_from is not null;
  if n <> 1 then raise exception 'expected one approved delivery gap version with a hash and a date, found %', n; end if;

  -- Exactly two determinations, both ERCOT. A determination for a market with no gap would be a
  -- review nobody performed.
  select count(*) into n from reference.source_use_permissions
   where purpose_code = 'public_derived_delivery_gap_display';
  if n <> 2 then raise exception 'expected two delivery gap display determinations, found %', n; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where sup.purpose_code = 'public_derived_delivery_gap_display' and s.slug not like 'ercot-%';
  if n <> 0 then raise exception '% delivery gap determination(s) exist outside ERCOT', n; end if;

  -- Approving a methodology creates no gaps. They are calculated.
  select count(*) into n from pipeline.delivery_gap_results;
  if n <> 0 then raise exception 'approving a methodology created % gap result(s)', n; end if;
end $$;

-- Row level security, as every table in both schemas carries. Nothing is granted to the public
-- roles; these tables are read server-side only, like the rest of the pipeline.
alter table pipeline.delivery_gap_results      enable row level security;
alter table pipeline.delivery_gap_result_inputs enable row level security;
