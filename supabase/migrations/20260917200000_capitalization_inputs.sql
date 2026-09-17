-- Shares, ownership, free float, accessibility and corporate actions.
--
-- These are the inputs an accessible free-float market capitalization is built from, and the
-- reason they are five tables rather than one is that they disagree about almost everything:
-- what they are keyed on, how often they change, what a revision means, and what it means for
-- one to be missing. A single equity_fundamentals row would have to pick one answer for all of
-- them and would be wrong four times.
--
-- The rule the whole slice exists to enforce:
--
--   UNKNOWN FREE FLOAT STAYS UNKNOWN. It never becomes 1.0.
--
-- A missing float factor is not a full-float security. Treating absence as 1.0 is the single
-- most consequential silent error available here, because it inflates exactly the issuers Urdais
-- knows least about, and it looks like a complete index. So float carries an explicit state and
-- the factor column is null unless that state says a factor was established. There is no default.
--
-- The chain the later calculation must be able to walk, without any step collapsing into another:
--
--   total shares -> free float -> accessible free float
--
-- Each is a separate table with separate evidence. A future calculation that cannot explain why
-- accessible float is below free float for a given security has no business publishing a weight.

-- ------------------------------------------------------------------- shares outstanding

create table pipeline.share_observations (
  id                    uuid primary key default gen_random_uuid(),
  security_id           uuid not null references reference.securities (id) on delete restrict,

  -- Which count this is. The most important column in the table: "shares" is ambiguous and the
  -- ambiguity is expensive. An EPS denominator is a weighted average over a period and is not a
  -- point-in-time capitalization count; authorized shares are a ceiling nobody has issued; issued
  -- includes treasury and outstanding does not. A number whose type is not known is not usable,
  -- so there is no default and no 'unspecified'.
  share_count_type      text not null
                          constraint share_observations_type_allowed
                          check (share_count_type in (
                            'issued',
                            'outstanding',
                            'treasury',
                            'authorized',
                            'diluted_weighted_average',
                            'privately_placed',
                            'preferred'
                          )),
  share_count           numeric not null
                          constraint share_observations_count_positive
                          -- NaN compares greater than every numeric and equals itself, so a bare
                          -- `> 0` admits it. The explicit comparison is the one that works.
                          check (share_count > 0 and share_count <> 'NaN'::numeric),
  -- Always 'shares'. Recorded rather than assumed because a source that publishes thousands of
  -- shares, or paid-in capital instead of a count, is a real and silent failure mode.
  count_unit            text not null default 'shares'
                          constraint share_observations_unit_allowed
                          check (count_unit in ('shares')),

  -- The two dates, which are not the same and must never be conflated. effective_date is the
  -- date the count was true of; as_reported_date is when the source said so. A filing published
  -- in August reporting a count as of 21 August answers "what was true in August", and a filing
  -- published in November restating it answers the same question differently. Point-in-time
  -- reconstruction needs both.
  effective_date        date not null,
  as_reported_date      date,

  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid not null references reference.permission_grants (id) on delete restrict,
  source_retrieval_id   uuid references pipeline.source_retrievals (id) on delete restrict,
  source_concept        text,
  source_payload        jsonb,
  attribution           text,
  capture_method        text not null default 'automated_retrieval'
                          constraint share_observations_capture_allowed
                          check (capture_method in ('automated_retrieval', 'manual_capture')),
  captured_by           text,

  observation_purpose   text not null default 'research'
                          constraint share_observations_purpose_allowed
                          check (observation_purpose in ('research', 'production')),
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.share_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint share_observations_reported_after_effective
    check (as_reported_date is null or as_reported_date >= effective_date),
  constraint share_observations_manual_names_capturer
    check (capture_method <> 'manual_capture' or captured_by is not null),
  constraint share_observations_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.share_observations is
  'Effective-dated share counts. share_count_type is mandatory and has no default, because "shares" is ambiguous in exactly the way that matters: an EPS denominator is a weighted average over a period, authorized shares are a ceiling, issued includes treasury and outstanding does not. A count whose type is unknown is not a capitalization input.';
comment on column pipeline.share_observations.effective_date is
  'The date the count was true of. Distinct from as_reported_date, which is when the source said so -- the pair is what lets a historical calculation use the count that was knowable then rather than the one known now.';

-- One live observation per security, count type, effective date and purpose. A restatement
-- supersedes rather than competing, and it does not overwrite what was believed before.
create unique index share_observations_current_idx
  on pipeline.share_observations (security_id, share_count_type, effective_date, observation_purpose)
  where superseded_by_id is null;
create index share_observations_security_idx
  on pipeline.share_observations (security_id, effective_date desc);

-- ------------------------------------------------------------------- holder-level ownership

create table pipeline.ownership_observations (
  id                    uuid primary key default gen_random_uuid(),
  issuer_id             uuid not null references reference.issuers (id) on delete restrict,
  security_id           uuid references reference.securities (id) on delete restrict,

  -- Where the holder is a parent already modelled in the security master, the row points at that
  -- relationship instead of restating it. Phase 5.1 built issuer_relationships with an
  -- ownership_percent for exactly this, and two places holding the same stake would eventually
  -- disagree.
  issuer_relationship_id uuid references reference.issuer_relationships (id) on delete restrict,

  holder_name           text not null
                          constraint ownership_holder_name_nonempty check (btrim(holder_name) <> ''),
  holder_kind           text not null
                          constraint ownership_holder_kind_allowed
                          check (holder_kind in (
                            'parent_company', 'government', 'strategic_corporate',
                            'insider_director', 'insider_officer', 'major_shareholder',
                            'treasury', 'employee_plan', 'other'
                          )),

  -- Either a count or a percentage; a source publishes one or the other and converting between
  -- them needs a share count that may not exist for the same date.
  shares_held           numeric
                          constraint ownership_shares_positive
                          check (shares_held is null
                                 or (shares_held > 0 and shares_held <> 'NaN'::numeric)),
  percent_held          numeric
                          constraint ownership_percent_range
                          check (percent_held is null
                                 or (percent_held > 0 and percent_held <= 100
                                     and percent_held <> 'NaN'::numeric)),

  effective_date        date not null,
  as_reported_date      date,

  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid not null references reference.permission_grants (id) on delete restrict,
  source_payload        jsonb,
  attribution           text,
  notes                 text,
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.ownership_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint ownership_has_a_quantity
    check (shares_held is not null or percent_held is not null),
  constraint ownership_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.ownership_observations is
  'Holder-level stakes that bear on free float: controlling blocks, government and strategic holdings, insider holdings, treasury. These are float *inputs*, never a float factor -- a set of disclosed holders is almost never the complete non-float population, and summing an incomplete list into a factor would manufacture precision the evidence does not support.';
comment on column pipeline.ownership_observations.issuer_relationship_id is
  'Where the holder is a parent already modelled in reference.issuer_relationships, this points at it rather than restating the stake. Two records of one controlling block would eventually disagree.';

create unique index ownership_observations_current_idx
  on pipeline.ownership_observations (issuer_id, holder_name, holder_kind, effective_date)
  where superseded_by_id is null;
create index ownership_observations_issuer_idx on pipeline.ownership_observations (issuer_id, effective_date desc);

-- ----------------------------------------------------------------------------- free float

create table pipeline.float_observations (
  id                    uuid primary key default gen_random_uuid(),
  security_id           uuid not null references reference.securities (id) on delete restrict,
  effective_date        date not null,

  -- The state is mandatory and the factor is not. This is the inversion that keeps an unknown
  -- float unknown: there is no column default, no coalesce, and no code path that reaches a
  -- number without a state that says a number was established.
  float_state           text not null
                          constraint float_observations_state_allowed
                          check (float_state in (
                            'established',      -- a factor was determined on admissible evidence
                            'unknown',          -- nobody has looked, or looking found nothing
                            'unavailable',      -- looked for; no defensible public source exists
                            'under_review',     -- evidence exists and has not been accepted yet
                            'not_applicable'    -- only where the methodology says so, with a citation
                          )),
  free_float_factor     numeric
                          constraint float_observations_factor_range
                          check (free_float_factor is null
                                 or (free_float_factor >= 0 and free_float_factor <= 1
                                     and free_float_factor <> 'NaN'::numeric)),

  -- How a factor was arrived at, where there is one. 'derived_from_holdings' is deliberately
  -- listed and deliberately hard to use: the constraint below requires a methodology citation,
  -- because deriving a factor from a disclosed-holder list is an estimate and the parent
  -- methodology has not authorised one.
  determination_method  text
                          constraint float_observations_method_allowed
                          check (determination_method is null or determination_method in (
                            'published_by_venue', 'published_by_regulator',
                            'issuer_disclosure', 'derived_from_holdings'
                          )),
  methodology_reference text,
  basis                 text,

  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid references reference.permission_grants (id) on delete restrict,
  source_payload        jsonb,
  attribution           text,
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.float_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  -- The biconditional that does the work. A factor exists if and only if the state is
  -- 'established', so an unknown float cannot carry a number and an established one cannot
  -- omit it. There is no arrangement of these columns that yields a silent 1.0.
  constraint float_observations_factor_iff_established
    check ((float_state = 'established') = (free_float_factor is not null)),
  -- An established factor names its method and its evidence, and a source-backed one names the
  -- grant it was collected under.
  constraint float_observations_established_is_evidenced
    check (float_state <> 'established'
           or (determination_method is not null and basis is not null)),
  constraint float_observations_source_names_grant
    check (source_interface_id is null or permission_grant_id is not null),
  -- A derived factor is an estimate, and an estimate needs the methodology to have permitted it.
  constraint float_observations_derivation_needs_methodology
    check (determination_method is distinct from 'derived_from_holdings'
           or methodology_reference is not null),
  -- So does declaring the concept inapplicable to a security.
  constraint float_observations_not_applicable_needs_methodology
    check (float_state <> 'not_applicable' or methodology_reference is not null),
  constraint float_observations_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.float_observations is
  'Free float as a point-in-time determination with an explicit state. The factor column is null unless float_state is ''established'', so an absent float is representable and a defaulted one is not: there is no column default and no code path that produces 1.0 from silence. Treating unknown float as full float would inflate precisely the issuers Urdais knows least about, while looking like a complete index.';
comment on column pipeline.float_observations.float_state is
  'unknown (nobody has looked, or looking found nothing), unavailable (looked for and no defensible public source exists), under_review (evidence not yet accepted), established (a factor was determined), not_applicable (only with a methodology citation). Four of the five carry no number.';

create unique index float_observations_current_idx
  on pipeline.float_observations (security_id, effective_date)
  where superseded_by_id is null;

-- --------------------------------------------------------------------- accessibility

create table pipeline.accessibility_observations (
  id                    uuid primary key default gen_random_uuid(),
  security_id           uuid not null references reference.securities (id) on delete restrict,
  effective_date        date not null,

  accessibility_state   text not null
                          constraint accessibility_state_allowed
                          check (accessibility_state in (
                            'established',        -- limits and usage are known
                            'no_limit_evidenced', -- searched; no statutory or exchange limit found
                            'unknown',            -- not established either way
                            'under_review'
                          )),

  -- Kept apart on purpose. A single "accessible factor" column would make it impossible to say
  -- why accessible float sits below free float, and that explanation is the whole reason these
  -- rows exist rather than a number.
  foreign_ownership_limit_percent   numeric
                          constraint accessibility_limit_range
                          check (foreign_ownership_limit_percent is null
                                 or (foreign_ownership_limit_percent > 0
                                     and foreign_ownership_limit_percent <= 100
                                     and foreign_ownership_limit_percent <> 'NaN'::numeric)),
  foreign_ownership_current_percent numeric
                          constraint accessibility_current_range
                          check (foreign_ownership_current_percent is null
                                 or (foreign_ownership_current_percent >= 0
                                     and foreign_ownership_current_percent <= 100
                                     and foreign_ownership_current_percent <> 'NaN'::numeric)),
  foreign_headroom_percent          numeric
                          constraint accessibility_headroom_range
                          check (foreign_headroom_percent is null
                                 or (foreign_headroom_percent >= 0
                                     and foreign_headroom_percent <= 100
                                     and foreign_headroom_percent <> 'NaN'::numeric)),

  limit_basis           text
                          constraint accessibility_limit_basis_allowed
                          check (limit_basis is null or limit_basis in (
                            'statutory', 'exchange_rule', 'regulator_rule', 'issuer_charter'
                          )),
  basis                 text,

  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid references reference.permission_grants (id) on delete restrict,
  source_payload        jsonb,
  attribution           text,
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.accessibility_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  -- A stated limit says where it comes from. "There is a cap" without a source is a rumour.
  constraint accessibility_limit_names_its_basis
    check (foreign_ownership_limit_percent is null or limit_basis is not null),
  -- Headroom cannot exceed the limit it is headroom against.
  constraint accessibility_headroom_within_limit
    check (foreign_headroom_percent is null or foreign_ownership_limit_percent is null
           or foreign_headroom_percent <= foreign_ownership_limit_percent),
  -- An established row asserts something; an unknown one asserts nothing, and must not carry
  -- numbers that would later read as established facts.
  constraint accessibility_unknown_carries_no_figures
    check (accessibility_state <> 'unknown'
           or (foreign_ownership_limit_percent is null
               and foreign_ownership_current_percent is null
               and foreign_headroom_percent is null)),
  constraint accessibility_source_names_grant
    check (source_interface_id is null or permission_grant_id is not null),
  constraint accessibility_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.accessibility_observations is
  'Foreign ownership limits and usage, kept separate from free float and from each other. No accessible-float factor is computed here: Phase 5.5 decides how a limit and its headroom affect investability, and collapsing them into one number now would destroy the ability to say why accessible float sits below free float for a given security.';
comment on column pipeline.accessibility_observations.accessibility_state is
  'no_limit_evidenced means a search found no statutory or exchange limit, which is a finding. unknown means nothing was established either way, and carries no figures -- an unknown accessibility is never treated as unrestricted.';

create unique index accessibility_observations_current_idx
  on pipeline.accessibility_observations (security_id, effective_date)
  where superseded_by_id is null;

-- ------------------------------------------------------------------- corporate actions

create table pipeline.corporate_actions (
  id                    uuid primary key default gen_random_uuid(),
  issuer_id             uuid not null references reference.issuers (id) on delete restrict,
  -- Security and listing are nullable because the scope genuinely differs: a merger is an issuer
  -- event, a split is a security event, a ticker change is a listing event.
  security_id           uuid references reference.securities (id) on delete restrict,
  listing_id            uuid references reference.listings (id) on delete restrict,

  action_type           text not null
                          constraint corporate_actions_type_allowed
                          check (action_type in (
                            'stock_split', 'reverse_split', 'stock_dividend', 'bonus_issue',
                            'cash_dividend', 'special_dividend', 'rights_issue',
                            'spin_off', 'merger', 'acquisition', 'delisting',
                            'listing_change', 'share_class_conversion',
                            'share_issuance', 'share_repurchase', 'share_cancellation'
                          )),
  action_state          text not null default 'announced'
                          constraint corporate_actions_state_allowed
                          check (action_state in ('announced', 'amended', 'effective', 'cancelled')),

  announcement_date     date,
  ex_date               date,
  record_date           date,
  payment_date          date,
  effective_date        date,

  -- Ratio terms as a pair, never as a decimal. A 3-for-2 split is exactly 3/2 and a stored
  -- 1.5 has already lost the information needed to reproduce the issuer's own wording.
  ratio_numerator       numeric
                          constraint corporate_actions_ratio_numerator_positive
                          check (ratio_numerator is null
                                 or (ratio_numerator > 0 and ratio_numerator <> 'NaN'::numeric)),
  ratio_denominator     numeric
                          constraint corporate_actions_ratio_denominator_positive
                          check (ratio_denominator is null
                                 or (ratio_denominator > 0 and ratio_denominator <> 'NaN'::numeric)),

  -- A dividend of zero is a real announcement and is not the same as no dividend, so the floor
  -- is zero rather than a positive minimum.
  cash_amount           numeric
                          constraint corporate_actions_cash_non_negative
                          check (cash_amount is null
                                 or (cash_amount >= 0 and cash_amount <> 'NaN'::numeric)),
  cash_currency         char(3)
                          constraint corporate_actions_currency_format
                          check (cash_currency is null or cash_currency ~ '^[A-Z]{3}$'),
  share_amount          numeric
                          constraint corporate_actions_share_amount_positive
                          check (share_amount is null
                                 or (share_amount > 0 and share_amount <> 'NaN'::numeric)),

  -- Structured terms, so that the decisive numbers are queryable rather than buried in prose.
  terms                 jsonb not null default '{}'::jsonb,
  notes                 text,

  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid not null references reference.permission_grants (id) on delete restrict,
  source_retrieval_id   uuid references pipeline.source_retrievals (id) on delete restrict,
  source_payload        jsonb,
  attribution           text,
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.corporate_actions (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint corporate_actions_no_self_supersession
    check (superseded_by_id is null or superseded_by_id <> id),
  constraint corporate_actions_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null)),
  -- Cash needs a currency. An amount without one is not an amount.
  constraint corporate_actions_cash_is_denominated
    check (cash_amount is null or cash_currency is not null),
  -- A ratio is a pair or it is nothing.
  constraint corporate_actions_ratio_is_complete
    check ((ratio_numerator is null) = (ratio_denominator is null)),
  -- Date coherence, only where both are present. Record date precedes payment; ex-date is on or
  -- before record date in every market Urdais covers.
  constraint corporate_actions_record_before_payment
    check (record_date is null or payment_date is null or payment_date >= record_date),
  constraint corporate_actions_ex_before_record
    check (ex_date is null or record_date is null or record_date >= ex_date),
  constraint corporate_actions_announced_before_ex
    check (announcement_date is null or ex_date is null or ex_date >= announcement_date)
);

comment on table pipeline.corporate_actions is
  'The corporate-action ledger. Records the event as the source announced it and applies nothing: a split here does not and must not rewrite pipeline.price_observations, which hold raw official closes. This table supplies the explicit transformation inputs a later calculation layer applies at read time.';
comment on column pipeline.corporate_actions.ratio_numerator is
  'Ratios are stored as a numerator and denominator pair, never as a decimal. A 3-for-2 split stored as 1.5 has already lost the issuer''s own terms.';
comment on column pipeline.corporate_actions.action_state is
  'announced, amended, effective or cancelled. A cancelled action is superseded and cannot remain the live record for its event, which the partial index below enforces.';

-- One live record per source event. A correction or cancellation supersedes rather than
-- competing, so history stays readable and the current picture stays single-valued.
create unique index corporate_actions_current_idx
  on pipeline.corporate_actions (issuer_id, action_type, coalesce(ex_date, effective_date, announcement_date),
                                 coalesce(security_id, issuer_id))
  where superseded_by_id is null and action_state <> 'cancelled';
create index corporate_actions_issuer_idx on pipeline.corporate_actions (issuer_id, ex_date desc);
create index corporate_actions_security_idx on pipeline.corporate_actions (security_id, ex_date desc);

-- ------------------------------------------------------------------------ the rights gate
--
-- One function for all five families. They carry the same provenance columns and the same
-- question is asked of each: was this admissible under a grant that actually covers it?
--
-- search_path is pinned explicitly. A trigger function that resolves its own references through
-- a mutable search_path can be made to call something else entirely by whoever controls the
-- session, and the advisor flags it for that reason.

create or replace function pipeline.check_capitalization_rights()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  grt record;
  iface record;
  purpose text;
begin
  -- Float and accessibility may record a determination with no source at all -- "nobody
  -- publishes this" is a finding that no grant underwrites.
  if new.permission_grant_id is null then
    return new;
  end if;

  select g.source_interface_id, g.covers_collection, g.covers_storage,
         g.covers_index_calculation, g.attribution_required
    into grt
    from reference.permission_grants g where g.id = new.permission_grant_id;

  if grt.source_interface_id <> new.source_interface_id then
    raise exception 'the permission grant belongs to a different source interface'
      using errcode = 'check_violation';
  end if;
  if not grt.covers_collection then
    raise exception 'the permission grant does not cover collection' using errcode = 'check_violation';
  end if;
  if not grt.covers_storage then
    raise exception 'the permission grant does not cover storage' using errcode = 'check_violation';
  end if;
  if grt.attribution_required and btrim(coalesce(new.attribution, '')) = '' then
    raise exception 'this licence makes attribution a condition and none was recorded'
      using errcode = 'check_violation';
  end if;

  -- Only share observations carry a purpose today; the others are research-only until a
  -- calculation needs them, and inventing a production path they cannot yet use would be a
  -- gate nobody tests.
  begin
    purpose := to_jsonb(new) ->> 'observation_purpose';
  exception when others then
    purpose := null;
  end;
  if purpose = 'production' then
    select s.production_access_state into iface
      from reference.source_interfaces s where s.id = new.source_interface_id;
    if iface.production_access_state <> 'production_approved' then
      raise exception 'source interface is % and cannot serve a production observation',
        iface.production_access_state using errcode = 'check_violation';
    end if;
    if not grt.covers_index_calculation then
      raise exception 'a production observation requires a grant covering index calculation'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function pipeline.check_capitalization_rights() is
  'Shared rights gate for the capitalization families: the grant must belong to the named interface, cover collection and storage, and supply any attribution its licence makes a condition. A row with no grant is permitted only where the family allows a sourceless determination, which is how "nobody publishes this" is recorded.';

create trigger share_observations_rights before insert on pipeline.share_observations
  for each row execute function pipeline.check_capitalization_rights();
create trigger ownership_observations_rights before insert on pipeline.ownership_observations
  for each row execute function pipeline.check_capitalization_rights();
create trigger float_observations_rights before insert on pipeline.float_observations
  for each row execute function pipeline.check_capitalization_rights();
create trigger accessibility_observations_rights before insert on pipeline.accessibility_observations
  for each row execute function pipeline.check_capitalization_rights();
create trigger corporate_actions_rights before insert on pipeline.corporate_actions
  for each row execute function pipeline.check_capitalization_rights();

-- Append-only throughout. Supersession is the only permitted change, on all five.
create trigger share_observations_append_only before update or delete on pipeline.share_observations
  for each row execute function pipeline.allow_only_supersession();
create trigger ownership_observations_append_only before update or delete on pipeline.ownership_observations
  for each row execute function pipeline.allow_only_supersession();
create trigger float_observations_append_only before update or delete on pipeline.float_observations
  for each row execute function pipeline.allow_only_supersession();
create trigger accessibility_observations_append_only before update or delete on pipeline.accessibility_observations
  for each row execute function pipeline.allow_only_supersession();
create trigger corporate_actions_append_only before update or delete on pipeline.corporate_actions
  for each row execute function pipeline.allow_only_supersession();

alter table pipeline.share_observations enable row level security;
alter table pipeline.ownership_observations enable row level security;
alter table pipeline.float_observations enable row level security;
alter table pipeline.accessibility_observations enable row level security;
alter table pipeline.corporate_actions enable row level security;
