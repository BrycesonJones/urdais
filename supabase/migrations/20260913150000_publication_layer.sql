-- Publication layer: the objects the family defines conceptually between the
-- eligible normalized observation and the published regional value.
--
--   calculation run -> seller-level observations -> capacity-source observations
--                   -> regional observations -> publication
--
-- Every published-value candidate reconstructs back through these rows to
-- normalized observations, raw offers, source retrievals, source interfaces,
-- permission grants, and the methodology and child versions that governed it.
-- The methodology's structural invariants are constraints here, not
-- conventions: a region with one participant has no value, two participants
-- publish only at Minimum breadth with dispersion withheld, three or more at
-- Normal, the window is the UTC day, and the publication deadline is the next
-- cutoff. Rows are append-only; a regional observation is corrected by
-- supersession, never edited. Nothing is seeded and nothing is published.

create table pipeline.calculation_runs (
  id                          uuid primary key default gen_random_uuid(),
  instrument_id               uuid not null references reference.instruments (id) on delete restrict,
  instrument_spec_version_id  uuid not null references reference.instrument_spec_versions (id) on delete restrict,
  methodology_version_id      uuid not null references reference.methodology_versions (id) on delete restrict,
  calculation_date            date not null,
  window_start                timestamptz not null,
  cutoff                      timestamptz not null,
  publication_deadline        timestamptz not null,
  calculated_at               timestamptz not null,
  calculator_identity         text,
  run_kind                    text not null default 'production'
                                constraint calculation_runs_kind_allowed check (run_kind in ('production', 'simulation', 'correction')),
  notes                       text,
  created_at                  timestamptz not null default now(),
  -- The family's calendar, as arithmetic.
  constraint calculation_runs_window_is_utc_day check (
    window_start = (calculation_date::timestamp at time zone 'UTC')
    and cutoff = window_start + interval '1 day'
    and publication_deadline = cutoff + interval '1 day'
  ),
  constraint calculation_runs_calculated_after_cutoff check (calculated_at >= cutoff)
);

comment on table pipeline.calculation_runs is
  'One execution of the regional calculation for one instrument version and one calculation date. The window, cutoff and deadline are the family''s UTC calendar and are checked, not trusted. A simulation run can never be published.';

create index calculation_runs_spec_date_idx
  on pipeline.calculation_runs (instrument_spec_version_id, calculation_date, calculated_at desc);

create table pipeline.seller_observations (
  id                                uuid primary key default gen_random_uuid(),
  run_id                            uuid not null references pipeline.calculation_runs (id) on delete restrict,
  seller_entity_id                  uuid not null references reference.market_entities (id) on delete restrict,
  canonical_region_code             char(2) not null references reference.canonical_regions (code) on delete restrict,
  canonical_quantity                integer not null
                                      constraint seller_observations_quantity_positive check (canonical_quantity > 0),
  representative_price              numeric not null
                                      constraint seller_observations_price_positive check (representative_price > 0),
  selected_normalized_observation_id uuid not null references pipeline.normalized_observations (id) on delete restrict,
  considered_count                  integer not null
                                      constraint seller_observations_considered_positive check (considered_count >= 1),
  canonical_count                   integer not null
                                      constraint seller_observations_canonical_range check (canonical_count >= 1 and canonical_count <= considered_count),
  reduction_rule                    text not null default 'canonical_quantity_then_minimum'
                                      constraint seller_observations_rule_allowed check (reduction_rule = 'canonical_quantity_then_minimum'),
  created_at                        timestamptz not null default now(),
  unique (run_id, seller_entity_id, canonical_region_code)
);

comment on table pipeline.seller_observations is
  'The seller-level representative price for one seller in one country on one run: the lowest accessible price at the seller''s smallest offered quantity. The candidate set behind it is retained in seller_observation_candidates.';

create table pipeline.seller_observation_candidates (
  seller_observation_id      uuid not null references pipeline.seller_observations (id) on delete restrict,
  normalized_observation_id  uuid not null references pipeline.normalized_observations (id) on delete restrict,
  at_canonical_quantity      boolean not null,
  selected                   boolean not null,
  primary key (seller_observation_id, normalized_observation_id),
  constraint seller_candidates_selected_is_canonical check (not selected or at_canonical_quantity)
);

comment on table pipeline.seller_observation_candidates is
  'Every eligible offer considered by a seller-level reduction, with whether it sat at the canonical quantity and whether it was selected. Lineage the ratification study depends on.';

create table pipeline.capacity_source_observations (
  id                          uuid primary key default gen_random_uuid(),
  run_id                      uuid not null references pipeline.calculation_runs (id) on delete restrict,
  capacity_source_entity_id   uuid not null references reference.market_entities (id) on delete restrict,
  canonical_region_code       char(2) not null references reference.canonical_regions (code) on delete restrict,
  representative_price        numeric not null
                                constraint capacity_source_price_positive check (representative_price > 0),
  attribution_status          text not null
                                constraint capacity_source_attribution_allowed
                                check (attribution_status in ('operator_determined', 'seller_fallback', 'common_control')),
  collapse_rule               text not null default 'lowest_accessible_channel'
                                constraint capacity_source_collapse_allowed check (collapse_rule = 'lowest_accessible_channel'),
  source_interface_count      integer not null
                                constraint capacity_source_interfaces_positive check (source_interface_count >= 1),
  created_at                  timestamptz not null default now(),
  unique (run_id, capacity_source_entity_id, canonical_region_code)
);

comment on table pipeline.capacity_source_observations is
  'The final aggregation participant: the operator where determinable, the seller otherwise, the controlling entity where common control is evidenced. Its price is the lowest accessible channel among its members.';

create table pipeline.capacity_source_members (
  capacity_source_observation_id  uuid not null references pipeline.capacity_source_observations (id) on delete restrict,
  seller_observation_id           uuid not null unique references pipeline.seller_observations (id) on delete restrict,
  primary key (capacity_source_observation_id, seller_observation_id)
);

comment on table pipeline.capacity_source_members is
  'Which seller-level observations collapsed into which capacity source. A seller observation belongs to exactly one capacity source per run.';

create table pipeline.regional_observations (
  id                                uuid primary key default gen_random_uuid(),
  run_id                            uuid not null references pipeline.calculation_runs (id) on delete restrict,
  instrument_id                     uuid not null references reference.instruments (id) on delete restrict,
  calculation_date                  date not null,
  canonical_region_code             char(2) not null references reference.canonical_regions (code) on delete restrict,
  outcome                           text not null
                                      constraint regional_observations_outcome_allowed check (outcome in ('value', 'unavailable')),
  structural_condition              text
                                      constraint regional_observations_condition_allowed
                                      check (structural_condition is null or structural_condition in ('NO_ELIGIBLE_PARTICIPANT', 'SINGLE_PARTICIPANT')),
  market_breadth                    text
                                      constraint regional_observations_breadth_allowed
                                      check (market_breadth is null or market_breadth in ('minimum', 'normal')),
  price_level                       numeric
                                      constraint regional_observations_price_positive check (price_level is null or price_level > 0),
  currency                          char(3) not null default 'USD'
                                      constraint regional_observations_currency_format check (currency ~ '^[A-Z]{3}$'),
  unit                              text not null default 'accelerator_hour'
                                      constraint regional_observations_unit_allowed check (unit = 'accelerator_hour'),
  participant_count                 integer not null
                                      constraint regional_observations_participants_nonnegative check (participant_count >= 0),
  contributing_source_count         integer not null
                                      constraint regional_observations_sources_nonnegative check (contributing_source_count >= 0),
  largest_source_participant_share  numeric
                                      constraint regional_observations_share_range
                                      check (largest_source_participant_share is null or (largest_source_participant_share > 0 and largest_source_participant_share <= 1)),
  dispersion_published              boolean not null,
  p10                               numeric,
  p50                               numeric,
  p90                               numeric,
  iqr                               numeric,
  percentage_change_1d              numeric,
  change_disposition                text
                                      constraint regional_observations_change_allowed
                                      check (change_disposition is null or change_disposition in ('published', 'annotated', 'withheld')),
  undetermined_operator_share       numeric
                                      constraint regional_observations_undetermined_range
                                      check (undetermined_operator_share is null or (undetermined_operator_share >= 0 and undetermined_operator_share <= 1)),
  limited_availability_share        numeric
                                      constraint regional_observations_limited_range
                                      check (limited_availability_share is null or (limited_availability_share >= 0 and limited_availability_share <= 1)),
  weakest_grade_share               numeric
                                      constraint regional_observations_grade_range
                                      check (weakest_grade_share is null or (weakest_grade_share >= 0 and weakest_grade_share <= 1)),
  tax_basis_unresolved_share        numeric
                                      constraint regional_observations_tax_range
                                      check (tax_basis_unresolved_share is null or (tax_basis_unresolved_share >= 0 and tax_basis_unresolved_share <= 1)),
  superseded_by_id                  uuid references pipeline.regional_observations (id) on delete restrict
                                      deferrable initially deferred,
  superseded_at                     timestamptz,
  supersession_reason               text,
  created_at                        timestamptz not null default now(),

  -- The family's structural participant rule.
  constraint regional_observations_unavailable_shape check (
    outcome <> 'unavailable' or (
      price_level is null and participant_count <= 1 and structural_condition is not null
      and market_breadth is null and dispersion_published = false
      and p10 is null and p50 is null and p90 is null and iqr is null
      and percentage_change_1d is null
    )
  ),
  constraint regional_observations_value_shape check (
    outcome <> 'value' or (
      price_level is not null and participant_count >= 2 and structural_condition is null
      and market_breadth is not null
      and contributing_source_count >= 1 and contributing_source_count <= participant_count
      and largest_source_participant_share is not null
    )
  ),
  constraint regional_observations_condition_matches_count check (
    structural_condition is null
    or (structural_condition = 'NO_ELIGIBLE_PARTICIPANT' and participant_count = 0)
    or (structural_condition = 'SINGLE_PARTICIPANT' and participant_count = 1)
  ),
  -- Two participants publish at Minimum breadth with dispersion withheld; three or more at Normal.
  constraint regional_observations_minimum_breadth check (
    participant_count <> 2 or (
      market_breadth = 'minimum' and dispersion_published = false
      and p10 is null and p50 is null and p90 is null and iqr is null
    )
  ),
  constraint regional_observations_normal_breadth check (
    participant_count < 3 or market_breadth = 'normal'
  ),
  constraint regional_observations_dispersion_when_published check (
    not dispersion_published or (p10 is not null and p50 is not null and p90 is not null and iqr is not null)
  ),
  -- A withheld change carries no number; a published or annotated one carries one.
  constraint regional_observations_change_consistent check (
    (change_disposition is null and percentage_change_1d is null)
    or (change_disposition = 'withheld' and percentage_change_1d is null)
    or (change_disposition in ('published', 'annotated') and percentage_change_1d is not null)
  ),
  constraint regional_observations_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

comment on table pipeline.regional_observations is
  'The UCPI child observation for one country and one calculation date under one run. outcome value carries a price level and a market-breadth qualifier; outcome unavailable names the structural condition. Corrected by supersession only. The headline status is derived: Unavailable from outcome, Published or Delayed from regional_publications against the run deadline, Corrected and Superseded from supersession.';

create unique index regional_observations_current_idx
  on pipeline.regional_observations (instrument_id, canonical_region_code, calculation_date)
  where superseded_by_id is null;

create index regional_observations_series_idx
  on pipeline.regional_observations (instrument_id, canonical_region_code, calculation_date desc)
  where superseded_by_id is null;

-- A regional observation must agree with its run.
create or replace function pipeline.check_regional_observation_run()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  select instrument_id, calculation_date into r from pipeline.calculation_runs where id = new.run_id;
  if r.instrument_id <> new.instrument_id or r.calculation_date <> new.calculation_date then
    raise exception 'regional observation disagrees with its run on instrument or calculation date'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger regional_observations_run_check
  before insert on pipeline.regional_observations
  for each row execute function pipeline.check_regional_observation_run();

create trigger regional_observations_supersede_only
  before update or delete on pipeline.regional_observations
  for each row execute function pipeline.allow_only_supersession();

create table pipeline.regional_observation_participants (
  regional_observation_id         uuid not null references pipeline.regional_observations (id) on delete restrict,
  capacity_source_observation_id  uuid not null references pipeline.capacity_source_observations (id) on delete restrict,
  primary key (regional_observation_id, capacity_source_observation_id)
);

comment on table pipeline.regional_observation_participants is
  'The composition of a regional observation: exactly the capacity-source observations that entered its median. Participant prices stay here and are never part of the published surface at Minimum breadth.';

create table pipeline.regional_publications (
  id                        uuid primary key default gen_random_uuid(),
  regional_observation_id   uuid not null unique references pipeline.regional_observations (id) on delete restrict,
  published_at              timestamptz not null,
  publication_status        text not null
                              constraint regional_publications_status_allowed check (publication_status in ('published', 'delayed')),
  publisher_identity        text,
  created_at                timestamptz not null default now()
);

comment on table pipeline.regional_publications is
  'The release of a regional observation. Published if released before the run''s publication deadline, Delayed otherwise; the status is checked against the deadline, not trusted. A simulation run cannot be published.';

create or replace function pipeline.check_regional_publication()
returns trigger
language plpgsql
as $$
declare
  deadline timestamptz;
  kind text;
begin
  select r.publication_deadline, r.run_kind into deadline, kind
    from pipeline.regional_observations o join pipeline.calculation_runs r on r.id = o.run_id
   where o.id = new.regional_observation_id;
  if kind = 'simulation' then
    raise exception 'a simulation run is never published' using errcode = 'check_violation';
  end if;
  if (new.published_at < deadline and new.publication_status <> 'published')
     or (new.published_at >= deadline and new.publication_status <> 'delayed') then
    raise exception 'publication status % disagrees with the deadline %', new.publication_status, deadline
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger regional_publications_check
  before insert on pipeline.regional_publications
  for each row execute function pipeline.check_regional_publication();

-- Append-only everywhere except supersession on regional observations.
create trigger calculation_runs_append_only
  before update or delete on pipeline.calculation_runs
  for each row execute function pipeline.forbid_mutation();
create trigger seller_observations_append_only
  before update or delete on pipeline.seller_observations
  for each row execute function pipeline.forbid_mutation();
create trigger seller_observation_candidates_append_only
  before update or delete on pipeline.seller_observation_candidates
  for each row execute function pipeline.forbid_mutation();
create trigger capacity_source_observations_append_only
  before update or delete on pipeline.capacity_source_observations
  for each row execute function pipeline.forbid_mutation();
create trigger capacity_source_members_append_only
  before update or delete on pipeline.capacity_source_members
  for each row execute function pipeline.forbid_mutation();
create trigger regional_observation_participants_append_only
  before update or delete on pipeline.regional_observation_participants
  for each row execute function pipeline.forbid_mutation();
create trigger regional_publications_append_only
  before update or delete on pipeline.regional_publications
  for each row execute function pipeline.forbid_mutation();

revoke update, delete, truncate on pipeline.calculation_runs,
  pipeline.seller_observations, pipeline.seller_observation_candidates,
  pipeline.capacity_source_observations, pipeline.capacity_source_members,
  pipeline.regional_observation_participants, pipeline.regional_publications
  from service_role;
revoke delete, truncate on pipeline.regional_observations from service_role;

alter table pipeline.calculation_runs                  enable row level security;
alter table pipeline.seller_observations               enable row level security;
alter table pipeline.seller_observation_candidates     enable row level security;
alter table pipeline.capacity_source_observations      enable row level security;
alter table pipeline.capacity_source_members           enable row level security;
alter table pipeline.regional_observations             enable row level security;
alter table pipeline.regional_observation_participants enable row level security;
alter table pipeline.regional_publications             enable row level security;

-- Nothing is published and nothing external changed.
do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.regional_observations;
  if n <> 0 then raise exception 'a regional observation exists at bootstrap'; end if;
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
  select count(*) into n from reference.instruments where symbol = 'UCPI-H100-SXM' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UCPI-H100-SXM is no longer launch_blocked'; end if;
end
$$;
