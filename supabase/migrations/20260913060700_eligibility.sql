-- Eligibility assessments, exclusions and diagnostics.
--
-- Phase 5 implements the evaluator; this is where its results live. An
-- assessment records the P0 / P1 / P2 outcome for one normalized observation
-- under one spec version. P2 implies P1 implies P0, enforced by CHECK. An
-- exclusion names the stage it failed and must agree with the assessment's
-- booleans, enforced by trigger. A diagnostic never implies ineligibility.

create table pipeline.eligibility_assessments (
  id                          uuid primary key default gen_random_uuid(),
  normalized_observation_id   uuid not null references pipeline.normalized_observations (id) on delete restrict,
  instrument_spec_version_id  uuid not null references reference.instrument_spec_versions (id) on delete restrict,
  methodology_version_id      uuid not null references reference.methodology_versions (id) on delete restrict,
  evaluator_identity          text,
  assessed_at                 timestamptz not null,
  calculation_date            date,
  p0                          boolean not null,
  p1                          boolean not null,
  p2                          boolean not null,
  input_status                text not null
                                constraint eligibility_assessments_input_status_allowed
                                check (input_status in ('valid', 'stale', 'ineligible', 'unavailable', 'conflicted')),
  -- Deferred for the same supersede-then-insert reason as normalized_observations.
  superseded_by_id            uuid references pipeline.eligibility_assessments (id) on delete restrict
                                deferrable initially deferred,
  superseded_at               timestamptz,
  supersession_reason         text,
  created_at                  timestamptz not null default now(),

  -- P2 => P1 => P0. The impossible combinations cannot be stored.
  constraint eligibility_assessments_p1_implies_p0 check (not p1 or p0),
  constraint eligibility_assessments_p2_implies_p1 check (not p2 or p1),
  -- A P2-eligible observation is a valid or stale input; an ineligible input is never P2.
  constraint eligibility_assessments_p2_status_consistent
    check ((p2 and input_status in ('valid', 'stale')) or (not p2 and input_status <> 'valid')),
  constraint eligibility_assessments_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

comment on table pipeline.eligibility_assessments is
  'The P0/P1/P2 outcome for one normalized observation under one spec version. P2 implies P1 implies P0. Superseded rather than edited.';

create unique index eligibility_assessments_current_idx
  on pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id)
  where superseded_by_id is null;

create index eligibility_assessments_calc_date_idx
  on pipeline.eligibility_assessments (instrument_spec_version_id, calculation_date)
  where superseded_by_id is null and p2;

create trigger eligibility_assessments_supersede_only
  before update or delete on pipeline.eligibility_assessments
  for each row execute function pipeline.allow_only_supersession();

create table pipeline.eligibility_exclusions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references pipeline.eligibility_assessments (id) on delete restrict,
  reason_code    text not null references reference.exclusion_reasons (code) on delete restrict,
  detail         jsonb,
  created_at     timestamptz not null default now(),
  unique (assessment_id, reason_code)
);

comment on table pipeline.eligibility_exclusions is
  'Named reasons an assessment failed a stage. The reason''s stage must be false on the assessment.';

create table pipeline.eligibility_diagnostics (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references pipeline.eligibility_assessments (id) on delete restrict,
  diagnostic_code  text not null references reference.diagnostic_codes (code) on delete restrict,
  detail           jsonb,
  created_at       timestamptz not null default now(),
  unique (assessment_id, diagnostic_code)
);

comment on table pipeline.eligibility_diagnostics is
  'Named properties recorded on an assessment. A diagnostic never makes an observation ineligible.';

-- An exclusion at stage S requires the assessment to have failed S.
create or replace function pipeline.check_exclusion_stage()
returns trigger
language plpgsql
as $$
declare
  reason_stage text;
  a record;
begin
  select stage into reason_stage from reference.exclusion_reasons where code = new.reason_code;
  select p0, p1, p2 into a from pipeline.eligibility_assessments where id = new.assessment_id;
  if reason_stage = 'P0' and a.p0 then
    raise exception 'exclusion % is a P0 failure but the assessment has p0 = true', new.reason_code
      using errcode = 'check_violation';
  elsif reason_stage = 'P1' and a.p1 then
    raise exception 'exclusion % is a P1 failure but the assessment has p1 = true', new.reason_code
      using errcode = 'check_violation';
  elsif reason_stage = 'P2' and a.p2 then
    raise exception 'exclusion % is a P2 failure but the assessment has p2 = true', new.reason_code
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger eligibility_exclusions_stage_check
  before insert on pipeline.eligibility_exclusions
  for each row execute function pipeline.check_exclusion_stage();

create trigger eligibility_exclusions_append_only
  before update or delete on pipeline.eligibility_exclusions
  for each row execute function pipeline.forbid_mutation();

create trigger eligibility_diagnostics_append_only
  before update or delete on pipeline.eligibility_diagnostics
  for each row execute function pipeline.forbid_mutation();

create index eligibility_exclusions_reason_idx on pipeline.eligibility_exclusions (reason_code);
create index eligibility_diagnostics_code_idx on pipeline.eligibility_diagnostics (diagnostic_code);

revoke delete, truncate on pipeline.eligibility_assessments from service_role;
revoke update, delete, truncate on pipeline.eligibility_exclusions from service_role;
revoke update, delete, truncate on pipeline.eligibility_diagnostics from service_role;

alter table pipeline.eligibility_assessments enable row level security;
alter table pipeline.eligibility_exclusions  enable row level security;
alter table pipeline.eligibility_diagnostics enable row level security;
