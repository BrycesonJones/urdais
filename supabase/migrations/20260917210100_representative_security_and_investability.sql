-- Representative-security selection, and investability evaluated without guessing.
--
-- Two subsystems that must not be allowed to contaminate each other.
--
-- Selection answers "which line would UGAI use?" and is decided by the methodology alone: retain
-- an eligible incumbent, else the greatest three-month average daily traded value in USD, else a
-- stated tie-break. Availability answers "can Urdais actually operate that line?" and is decided
-- by rights and data. The methodology is explicit that these are different questions and that the
-- second never reopens the first: a selection resolving to an unsupported venue "produces an
-- availability constraint ... not a change of representative security to a more convenient line."
--
-- So the selection row carries both, in separate columns, and nothing in this schema can express
-- "we picked the other listing because we had data for it."
--
-- Investability is evaluated per criterion, never as one boolean. The methodology defines the
-- screens and states that the "numerical minima, suspension tolerances, and entry/retention
-- buffers are unresolved", so a criterion can come back `parameter_unresolved` -- which is a
-- different thing from failing, and a different thing again from `unavailable` when the input
-- itself is missing. Collapsing those three into "false" is how a universe quietly admits issuers
-- nobody measured.

-- ------------------------------------------------------- representative security selection

create table pipeline.representative_security_selections (
  id                    uuid primary key default gen_random_uuid(),
  issuer_id             uuid not null references reference.issuers (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  effective_date        date not null,

  selection_state       text not null
                          constraint rep_selection_state_allowed
                          check (selection_state in (
                            'selected',                 -- one line won under the methodology
                            'undeterminable',           -- the deciding input is missing
                            'no_eligible_security'      -- nothing passed the security screens
                          )),
  selected_security_id  uuid references reference.securities (id) on delete restrict,
  selected_listing_id   uuid references reference.listings (id) on delete restrict,

  -- Which rule decided it. 'greatest_traded_value' is the ordinary path; the tie-breaks apply
  -- only on an exact tie, which the methodology is specific about.
  selection_rule        text
                          constraint rep_selection_rule_allowed
                          check (selection_rule is null or selection_rule in (
                            'incumbent_retained',
                            'greatest_traded_value',
                            'tiebreak_ordinary_over_receipt',
                            'tiebreak_issuer_designated_primary',
                            'tiebreak_ascending_isin',
                            'tiebreak_ascending_mic',
                            'sole_eligible_security'
                          )),
  selection_basis       text,

  -- Availability, kept apart from selection on purpose. A selected line that Urdais cannot price,
  -- or whose venue the register does not support, is an availability constraint on the selection
  -- -- never a reason to select something else.
  availability_state    text not null default 'unassessed'
                          constraint rep_availability_state_allowed
                          check (availability_state in (
                            'available', 'constrained', 'unassessed'
                          )),
  availability_reason   text,

  superseded_by_id      uuid references pipeline.representative_security_selections (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  -- A selection names what it selected; a non-selection names nothing.
  constraint rep_selected_has_a_security
    check ((selection_state = 'selected')
           = (selected_security_id is not null and selected_listing_id is not null)),
  constraint rep_selected_has_a_rule
    check (selection_state <> 'selected' or selection_rule is not null),
  -- A non-selection explains itself, because "we could not decide" is only useful with a reason.
  constraint rep_non_selection_is_explained
    check (selection_state = 'selected' or selection_basis is not null),
  -- A constrained selection says what constrains it. This is the column that carries "selected
  -- but unavailable" rather than letting it degrade into a different selection.
  constraint rep_constrained_is_explained
    check (availability_state <> 'constrained' or availability_reason is not null),
  constraint rep_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.representative_security_selections is
  'One issuer, one membership, one representative security. selection_state records the methodology''s answer and availability_state records whether Urdais can operate it -- separately, because the methodology states that a selection resolving to an unsupported venue produces an availability constraint and not a change of representative security to a more convenient line.';
comment on column pipeline.representative_security_selections.availability_state is
  'Deliberately not an input to selection. A selected line Urdais cannot price is ''constrained'', and the selection stands; there is no state in this table that means "we chose the line we had data for".';

create unique index rep_selections_current_idx
  on pipeline.representative_security_selections (issuer_id, effective_date)
  where superseded_by_id is null;
create index rep_selections_issuer_idx
  on pipeline.representative_security_selections (issuer_id, effective_date desc);

-- Every line that was considered, not only the winner. Without this the selection is an
-- assertion: "greatest traded value" is only checkable against the set it was greatest of.
create table pipeline.representative_security_candidates (
  id                    uuid primary key default gen_random_uuid(),
  selection_id          uuid not null references pipeline.representative_security_selections (id) on delete restrict,
  security_id           uuid not null references reference.securities (id) on delete restrict,
  listing_id            uuid not null references reference.listings (id) on delete restrict,

  security_screen_state text not null
                          constraint rep_candidate_screen_allowed
                          check (security_screen_state in ('eligible', 'excluded')),
  exclusion_reason      text,

  -- The deciding measure, and its state. An unmeasured candidate is not a candidate with zero
  -- turnover, and the methodology is explicit that a suspended line "cannot win selection on
  -- stale historical turnover".
  traded_value_state    text not null default 'unavailable'
                          constraint rep_candidate_tv_state_allowed
                          check (traded_value_state in ('measured', 'unavailable', 'stale')),
  adtv_usd              numeric
                          constraint rep_candidate_adtv_non_negative
                          check (adtv_usd is null
                                 or (adtv_usd >= 0 and adtv_usd <> 'NaN'::numeric)),
  adtv_window_start     date,
  adtv_window_end       date,
  is_receipt            boolean not null default false,
  is_issuer_primary     boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),

  unique (selection_id, listing_id),
  constraint rep_candidate_excluded_is_explained
    check (security_screen_state <> 'excluded' or exclusion_reason is not null),
  constraint rep_candidate_measured_has_a_value
    check ((traded_value_state = 'measured') = (adtv_usd is not null)),
  constraint rep_candidate_measured_has_a_window
    check (traded_value_state <> 'measured'
           or (adtv_window_start is not null and adtv_window_end is not null
               and adtv_window_end > adtv_window_start))
);

comment on table pipeline.representative_security_candidates is
  'Every line considered for a selection, with the traded value that decided it and the state of that measurement. A candidate whose turnover was never measured is recorded as unavailable rather than as zero, because zero would silently lose the comparison and look like a decision.';

create index rep_candidates_selection_idx on pipeline.representative_security_candidates (selection_id);

-- ------------------------------------------------------------------ investability

create table pipeline.investability_evaluations (
  id                    uuid primary key default gen_random_uuid(),
  issuer_id             uuid not null references reference.issuers (id) on delete restrict,
  security_id           uuid references reference.securities (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  effective_date        date not null,

  -- Which parameters the evaluation ran against. A production determination may only use approved
  -- ones; development may run against research candidates and must say so, which is what stops a
  -- convenient development result being read later as a finding.
  parameter_basis       text not null
                          constraint investability_parameter_basis_allowed
                          check (parameter_basis in ('approved', 'research_candidate')),
  evaluation_purpose    text not null default 'research'
                          constraint investability_purpose_allowed
                          check (evaluation_purpose in ('research', 'production')),

  -- Four outcomes, not two. `unavailable` means an input is missing; `parameter_unresolved`
  -- means the methodology has not set the threshold. Neither is a failure, and treating either
  -- as one would admit or exclude an issuer nobody actually measured.
  overall_result        text not null
                          constraint investability_result_allowed
                          check (overall_result in (
                            'investable', 'not_investable', 'unavailable', 'parameter_unresolved'
                          )),
  summary               text,

  superseded_by_id      uuid references pipeline.investability_evaluations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint investability_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.investability_evaluations is
  'An investability determination against a stated parameter basis. Thematic eligibility is untouched by it: an eligible issuer may be investable, not investable, or unassessable, and the third never becomes a rejection.';

create unique index investability_current_idx
  on pipeline.investability_evaluations (issuer_id, effective_date, evaluation_purpose)
  where superseded_by_id is null;

create table pipeline.investability_criteria (
  id                    uuid primary key default gen_random_uuid(),
  evaluation_id         uuid not null references pipeline.investability_evaluations (id) on delete restrict,

  criterion             text not null
                          constraint investability_criterion_allowed
                          check (criterion in (
                            'accessible_float_capitalization',
                            'free_float_percentage',
                            'traded_value',
                            'trading_frequency',
                            'listing_record',
                            'data_completeness',
                            'foreign_headroom',
                            'price_availability',
                            'fx_availability'
                          )),
  result                text not null
                          constraint investability_criterion_result_allowed
                          check (result in ('passed', 'failed', 'unavailable', 'parameter_unresolved')),

  observed_value        numeric
                          constraint investability_observed_finite
                          check (observed_value is null or observed_value <> 'NaN'::numeric),
  threshold_value       numeric
                          constraint investability_threshold_finite
                          check (threshold_value is null or threshold_value <> 'NaN'::numeric),
  parameter_key         text,
  basis                 text not null
                          constraint investability_criterion_basis_nonempty
                          check (btrim(basis) <> ''),
  created_at            timestamptz not null default now(),

  unique (evaluation_id, criterion),
  -- A pass or a fail is a comparison, so both sides of it must be present. This is what stops a
  -- criterion being marked passed on an absent threshold.
  constraint investability_decided_has_both_sides
    check (result not in ('passed', 'failed')
           or (observed_value is not null and threshold_value is not null)),
  -- An unresolved parameter names the parameter it was waiting for.
  constraint investability_unresolved_names_parameter
    check (result <> 'parameter_unresolved' or parameter_key is not null),
  -- An unavailable criterion has no comparison to report.
  constraint investability_unavailable_has_no_observation
    check (result <> 'unavailable' or observed_value is null)
);

comment on table pipeline.investability_criteria is
  'One row per screen per evaluation. passed and failed each require both an observation and a threshold, so a criterion cannot be marked passed against a threshold that does not exist; parameter_unresolved names the parameter it waited for, and unavailable carries no observation at all.';

create index investability_criteria_eval_idx on pipeline.investability_criteria (evaluation_id);

-- --------------------------------------------------------------------- the gates

create or replace function pipeline.check_investability_evaluation()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
begin
  -- A production determination may only rest on approved parameters. Running development
  -- evaluations against research candidates is expected and useful; promoting one by relabelling
  -- it is the thing this refuses.
  if new.evaluation_purpose = 'production' and new.parameter_basis <> 'approved' then
    raise exception 'a production investability determination may not use % parameters',
      new.parameter_basis using errcode = 'check_violation';
  end if;
  -- And a production determination cannot conclude anything while a parameter is unresolved.
  if new.evaluation_purpose = 'production' and new.overall_result = 'parameter_unresolved' then
    raise exception 'a production determination cannot rest on an unresolved parameter'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.check_investability_evaluation() is
  'Trigger: production investability determinations require approved parameters. Development evaluation against research candidates is permitted and must declare itself, so that a convenient development result cannot later be read as a finding.';

create trigger investability_evaluations_gates before insert on pipeline.investability_evaluations
  for each row execute function pipeline.check_investability_evaluation();

create trigger rep_selections_append_only
  before update or delete on pipeline.representative_security_selections
  for each row execute function pipeline.allow_only_supersession();
create trigger investability_evaluations_append_only
  before update or delete on pipeline.investability_evaluations
  for each row execute function pipeline.allow_only_supersession();
create trigger rep_candidates_no_mutation
  before update or delete on pipeline.representative_security_candidates
  for each row execute function pipeline.forbid_mutation();
create trigger investability_criteria_no_mutation
  before update or delete on pipeline.investability_criteria
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.representative_security_selections enable row level security;
alter table pipeline.representative_security_candidates enable row level security;
alter table pipeline.investability_evaluations enable row level security;
alter table pipeline.investability_criteria enable row level security;
