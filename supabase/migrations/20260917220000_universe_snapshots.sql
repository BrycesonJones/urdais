-- Universe snapshots and capped weights.
--
-- The methodology's weighting input is exact:
--
--   M_i(t) = Σ over eligible distinct ordinary classes k [ P_ik × N_ik × f_ik × X_ik ]
--
-- where P is the class price in local currency, N is **outstanding** shares of that class, f is
-- "the accessible free-float factor after overlapping strategic and foreign-access restrictions
-- are reconciled", and X is USD per unit of local currency. Two things in that sentence decide
-- most of this migration.
--
-- N is outstanding. Not issued, and the difference is treasury stock. Taiwan publishes 已發行
-- (issued), so the one share count Urdais holds for its one priceable security is the wrong type
-- and the schema refuses it rather than normalising it away.
--
-- f is ONE factor. It is not free float multiplied by an accessibility factor: the methodology
-- requires the two to be *reconciled* so that an overlapping stake is not deducted twice, and it
-- describes that reconciliation conceptually without reducing it to an algorithm. So there is no
-- accessibility_factor column here and no product forming f. A snapshot needs an f that some
-- approved rule produced, and none exists.
--
-- Weights belong to the issuer and valuation comes from its classes. A snapshot constituent is
-- therefore one issuer, and the per-class valuation inputs sit in their own table, which is also
-- what makes the Σ auditable and what makes a dual listing structurally unable to produce two
-- weights for one company.

create table pipeline.universe_snapshots (
  id                      uuid primary key default gen_random_uuid(),

  -- The date the inputs are observed as of, and the date the membership takes effect. Kept apart
  -- because the methodology reviews before it applies: reconstitution is quarterly in March,
  -- June, September and December, and an evidence cutoff precedes an announcement which precedes
  -- effectiveness.
  as_of_date              date not null,
  effective_date          date,

  snapshot_kind           text not null
                            constraint snapshot_kind_allowed
                            check (snapshot_kind in (
                              'development',               -- a fixture or a dry run; never publishable
                              'scheduled_reconstitution',  -- the quarterly reset
                              'universe_event'             -- an exceptional between-review change
                            )),
  state                   text not null default 'development'
                            constraint snapshot_state_allowed
                            check (state in (
                              'development', 'ready_for_review', 'production_eligible',
                              'blocked', 'superseded'
                            )),

  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  -- The cap actually used. A production snapshot needs this to be an approved parameter, which
  -- the trigger enforces; a development run may name a draft and must then stay development.
  cap_parameter_id        uuid references reference.methodology_parameters (id) on delete restrict,
  cap_value               numeric
                            constraint snapshot_cap_range
                            check (cap_value is null
                                   or (cap_value > 0 and cap_value <= 1
                                       and cap_value <> 'NaN'::numeric)),
  review_cycle_id         uuid references reference.ai_universe_review_cycles (id) on delete restrict,

  -- Cap feasibility, recorded as the two counts the methodology names rather than as a verdict.
  -- Weight definition says "with n positive-weight companies, n × c ≥ 1 is necessary"; the
  -- publication gate says n is "the count of issuers with status Eligible". Those are different
  -- numbers whenever an eligible issuer cannot be valued, so both are stored and both must hold.
  eligible_issuer_count   integer
                            constraint snapshot_eligible_count_non_negative
                            check (eligible_issuer_count is null or eligible_issuer_count >= 0),
  weightable_issuer_count integer
                            constraint snapshot_weightable_count_non_negative
                            check (weightable_issuer_count is null or weightable_issuer_count >= 0),
  cap_feasible            boolean,

  -- Why no production snapshot could be formed. Required whenever the state is blocked, because
  -- "blocked" without a reason is indistinguishable from "not attempted".
  block_reason            text,
  notes                   text,

  superseded_by_id        uuid references pipeline.universe_snapshots (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  constraint snapshot_blocked_is_explained
    check (state <> 'blocked' or block_reason is not null),
  constraint snapshot_production_is_feasible
    check (state <> 'production_eligible'
           or (cap_feasible is true and cap_parameter_id is not null
               and effective_date is not null and weightable_issuer_count > 0)),
  -- A development run may be blocked, reviewed, or anything else a real run may be -- what it
  -- may never be is publishable.
  constraint snapshot_development_is_never_production
    check (snapshot_kind <> 'development' or state <> 'production_eligible'),
  constraint snapshot_effective_after_as_of
    check (effective_date is null or effective_date >= as_of_date),
  constraint snapshot_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.universe_snapshots is
  'An immutable point-in-time universe with its weights. Never a live query over current tables: the constituent rows and their lineage are frozen at formation, because a snapshot whose inputs can move is not a snapshot. A snapshot that could not be formed is still a row -- blocked, with the reason -- since "no production snapshot can be formed from the available inputs" is a valid output of this engine.';
comment on column pipeline.universe_snapshots.eligible_issuer_count is
  'The count the publication gate uses. Distinct from weightable_issuer_count, and deliberately: the methodology states the feasibility condition twice, once on positive-weight companies and once on issuers with status Eligible, and those diverge whenever an eligible issuer cannot be valued. Both are stored so a reviewer can see which gate bound.';

create unique index universe_snapshots_current_idx
  on pipeline.universe_snapshots (as_of_date, snapshot_kind)
  where superseded_by_id is null and snapshot_kind <> 'development';
create index universe_snapshots_state_idx on pipeline.universe_snapshots (state, as_of_date desc);

-- --------------------------------------------------------------------- constituents

create table pipeline.snapshot_constituents (
  id                      uuid primary key default gen_random_uuid(),
  snapshot_id             uuid not null references pipeline.universe_snapshots (id) on delete restrict,
  issuer_id               uuid not null references reference.issuers (id) on delete restrict,

  -- The four outcomes the brief and the methodology both insist on keeping apart. An eligible
  -- issuer Urdais cannot value is 'eligible_unavailable' and stays in the snapshot with its
  -- constraint stated: the methodology requires the coverage gap to be published rather than
  -- resolved by declaring the issuer ineligible, so it must not silently vanish.
  membership_state        text not null
                            constraint constituent_state_allowed
                            check (membership_state in (
                              'weighted',             -- valued and carries a weight
                              'eligible_unavailable', -- eligible, but an input is missing
                              'not_investable',       -- assessed and failed a screen
                              'excluded'              -- not eligible under the methodology
                            )),
  unavailable_reason      text,

  -- Lineage. Every determination that produced this row, by identity, so a reviewer can
  -- reproduce the weight without trusting the numbers beside it.
  eligibility_review_id   uuid references pipeline.eligibility_reviews (id) on delete restrict,
  selection_id            uuid references pipeline.representative_security_selections (id) on delete restrict,
  investability_id        uuid references pipeline.investability_evaluations (id) on delete restrict,
  representative_security_id uuid references reference.securities (id) on delete restrict,
  representative_listing_id  uuid references reference.listings (id) on delete restrict,

  -- M_i, in USD, summed across the issuer's eligible classes. Null unless weighted.
  accessible_market_cap_usd numeric
                            constraint constituent_market_cap_positive
                            check (accessible_market_cap_usd is null
                                   or (accessible_market_cap_usd > 0
                                       and accessible_market_cap_usd <> 'NaN'::numeric)),
  -- Stored unrounded. The methodology is explicit that display rounding must not become the next
  -- calculation's input, so rounding happens at publication and never here.
  uncapped_weight         numeric
                            constraint constituent_uncapped_range
                            check (uncapped_weight is null
                                   or (uncapped_weight > 0 and uncapped_weight <= 1
                                       and uncapped_weight <> 'NaN'::numeric)),
  capped_weight           numeric
                            constraint constituent_capped_range
                            check (capped_weight is null
                                   or (capped_weight > 0 and capped_weight <= 1
                                       and capped_weight <> 'NaN'::numeric)),
  cap_bound               boolean not null default false,
  created_at              timestamptz not null default now(),

  -- One issuer appears once in a snapshot. This is the constraint that makes a dual listing
  -- structurally unable to become two memberships, rather than a rule someone has to remember.
  unique (snapshot_id, issuer_id),

  -- A weighted constituent has a capitalization, both weights and its full lineage; anything
  -- else has none of them.
  constraint constituent_weighted_is_valued
    check ((membership_state = 'weighted')
           = (accessible_market_cap_usd is not null and uncapped_weight is not null
              and capped_weight is not null)),
  constraint constituent_weighted_names_its_security
    check (membership_state <> 'weighted'
           or (representative_security_id is not null and representative_listing_id is not null
               and eligibility_review_id is not null and selection_id is not null)),
  -- An unavailable constituent says what was missing. This is the row that publishes the
  -- coverage gap, and it is useless without the reason.
  constraint constituent_unavailable_is_explained
    check (membership_state <> 'eligible_unavailable' or unavailable_reason is not null),
  constraint constituent_capped_not_above_uncapped
    check (capped_weight is null or uncapped_weight is null
           or cap_bound or capped_weight <= uncapped_weight + 1e-27)
);

comment on table pipeline.snapshot_constituents is
  'One row per issuer per snapshot -- enforced by a unique constraint, which is what makes one issuer one membership structural rather than remembered. An eligible issuer that cannot be valued stays here as eligible_unavailable with its reason, because the methodology requires the coverage gap to be published rather than the issuer to be declared ineligible.';

create index snapshot_constituents_snapshot_idx on pipeline.snapshot_constituents (snapshot_id, membership_state);

-- ------------------------------------------------------------- per-class valuation inputs

create table pipeline.snapshot_constituent_inputs (
  id                      uuid primary key default gen_random_uuid(),
  constituent_id          uuid not null references pipeline.snapshot_constituents (id) on delete restrict,
  security_id             uuid not null references reference.securities (id) on delete restrict,
  listing_id              uuid not null references reference.listings (id) on delete restrict,

  -- The four factors of one term of the sum, each with the observation it came from. Stored
  -- beside their lineage so the product can be re-checked against the rows that produced it.
  price_observation_id    uuid references pipeline.price_observations (id) on delete restrict,
  local_price             numeric,
  price_currency          char(3),

  share_observation_id    uuid references pipeline.share_observations (id) on delete restrict,
  share_count             numeric,
  -- Recorded so a wrong type is visible rather than inferred. The gate below accepts only what
  -- the methodology's N means.
  share_count_type        text,

  float_observation_id    uuid references pipeline.float_observations (id) on delete restrict,
  -- f, the single reconciled accessible free-float factor. There is deliberately no separate
  -- accessibility factor and no column whose product forms this: the methodology requires float
  -- and foreign-access restrictions to be reconciled against double-counting, and does not
  -- reduce that reconciliation to arithmetic anyone could apply here.
  accessible_float_factor numeric
                            constraint input_float_factor_range
                            check (accessible_float_factor is null
                                   or (accessible_float_factor >= 0 and accessible_float_factor <= 1
                                       and accessible_float_factor <> 'NaN'::numeric)),
  accessibility_observation_id uuid references pipeline.accessibility_observations (id) on delete restrict,

  fx_observation_id       uuid references pipeline.fx_observations (id) on delete restrict,
  fx_rate                 numeric
                            constraint input_fx_positive
                            check (fx_rate is null
                                   or (fx_rate > 0 and fx_rate <> 'NaN'::numeric)),

  -- The economic date all four are aligned to. A post-split price with a pre-split share count
  -- doubles a market capitalization silently, which is why this is one column and not four.
  economic_date           date not null,
  class_market_cap_usd    numeric
                            constraint input_market_cap_positive
                            check (class_market_cap_usd is null
                                   or (class_market_cap_usd > 0
                                       and class_market_cap_usd <> 'NaN'::numeric)),
  input_state             text not null
                            constraint input_state_allowed
                            check (input_state in ('complete', 'incomplete')),
  missing_inputs          text[],
  created_at              timestamptz not null default now(),

  unique (constituent_id, security_id, listing_id),
  -- A complete term has all four factors, their lineage and its product; an incomplete one names
  -- what was missing.
  constraint input_complete_has_every_factor
    check ((input_state = 'complete')
           = (local_price is not null and share_count is not null
              and accessible_float_factor is not null and fx_rate is not null
              and class_market_cap_usd is not null)),
  constraint input_incomplete_names_gaps
    check (input_state <> 'incomplete'
           or (missing_inputs is not null and cardinality(missing_inputs) >= 1))
);

comment on table pipeline.snapshot_constituent_inputs is
  'One term of M_i = Σ_k [P × N × f × X], with the observation behind each factor. economic_date is single and shared because the failure this prevents is silent: a post-split price multiplied by a pre-split share count doubles a market capitalization and looks entirely ordinary.';
comment on column pipeline.snapshot_constituent_inputs.accessible_float_factor is
  'f: the accessible free-float factor after strategic and foreign-access restrictions are reconciled. Deliberately not float multiplied by an accessibility factor -- the methodology requires reconciliation against deducting an overlapping stake twice and does not reduce it to arithmetic, so no rule here may form f from its components.';

create index snapshot_inputs_constituent_idx on pipeline.snapshot_constituent_inputs (constituent_id);

-- ------------------------------------------------------------------------- the gates

create or replace function pipeline.check_universe_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  param record;
begin
  if new.cap_parameter_id is not null then
    select parameter_key, status, numeric_value, effective_from
      into param from reference.methodology_parameters where id = new.cap_parameter_id;
    if param.parameter_key <> 'issuer_cap' then
      raise exception 'the cap parameter must be issuer_cap, not %', param.parameter_key
        using errcode = 'check_violation';
    end if;
    if new.cap_value is distinct from param.numeric_value then
      raise exception 'the recorded cap % does not match parameter value %',
        new.cap_value, param.numeric_value using errcode = 'check_violation';
    end if;
    -- A production snapshot may only rest on an approved cap in force. A development run may
    -- name a draft and stays development; promoting it by relabelling is what this refuses.
    if new.state = 'production_eligible' then
      if param.status <> 'approved' then
        raise exception 'a production snapshot cannot use a % issuer cap', param.status
          using errcode = 'check_violation';
      end if;
      if param.effective_from is null or param.effective_from > new.as_of_date then
        raise exception 'the issuer cap is not in force on %', new.as_of_date
          using errcode = 'check_violation';
      end if;
    end if;
  elsif new.state = 'production_eligible' then
    raise exception 'a production snapshot must name the issuer cap it used'
      using errcode = 'check_violation';
  end if;

  -- Cap feasibility, on both counts the methodology names. n × c ≥ 1 is necessary; a production
  -- snapshot that fails it is withheld rather than published with a relaxed cap.
  if new.state = 'production_eligible' then
    if new.eligible_issuer_count is null or new.weightable_issuer_count is null then
      raise exception 'a production snapshot must record both issuer counts'
        using errcode = 'check_violation';
    end if;
    if new.eligible_issuer_count * new.cap_value < 1
       or new.weightable_issuer_count * new.cap_value < 1 then
      raise exception 'cap infeasible: % eligible and % weightable issuers at a cap of % cannot carry a full allocation',
        new.eligible_issuer_count, new.weightable_issuer_count, new.cap_value
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_universe_snapshot() is
  'Trigger: a production snapshot requires an approved issuer cap in force on its as-of date, a cap value matching the parameter it names, and n × c >= 1 on both the eligible and the weightable issuer counts. Development snapshots may name a draft cap and stay development.';

create or replace function pipeline.check_snapshot_input()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  obs record;
begin
  -- N is outstanding shares. Not issued -- the difference is treasury stock -- and not a weighted
  -- average, which is a period statistic rather than a point-in-time count. A share observation
  -- of the wrong type is refused here rather than normalised into the right one.
  if new.share_observation_id is not null then
    select share_count_type, share_count, effective_date into obs
      from pipeline.share_observations where id = new.share_observation_id;
    if obs.share_count_type <> 'outstanding' then
      raise exception 'the methodology values N as outstanding shares; this observation is %',
        obs.share_count_type using errcode = 'check_violation';
    end if;
    if new.share_count is distinct from obs.share_count then
      raise exception 'the recorded share count does not match the observation it cites'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Price, shares and FX must describe the same economic date. This is the split guard: a
  -- post-split price with a pre-split count doubles the capitalization and looks ordinary.
  if new.price_observation_id is not null then
    select trading_date, close_price, price_currency into obs
      from pipeline.price_observations where id = new.price_observation_id;
    if obs.trading_date <> new.economic_date then
      raise exception 'the price is dated % and the valuation is dated %',
        obs.trading_date, new.economic_date using errcode = 'check_violation';
    end if;
    if new.local_price is distinct from obs.close_price then
      raise exception 'the recorded price does not match the observation it cites'
        using errcode = 'check_violation';
    end if;
    if new.price_currency is distinct from obs.price_currency then
      raise exception 'the recorded price currency does not match the observation it cites'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.fx_observation_id is not null then
    select base_currency, quote_currency, rate, fixing_date into obs
      from pipeline.fx_observations where id = new.fx_observation_id;
    if obs.base_currency <> 'USD' then
      raise exception 'the FX observation must be USD per unit, not % per unit', obs.base_currency
        using errcode = 'check_violation';
    end if;
    if new.price_currency is not null and obs.quote_currency <> new.price_currency then
      raise exception 'the FX observation converts % but the price is in %',
        obs.quote_currency, new.price_currency using errcode = 'check_violation';
    end if;
    if new.fx_rate is distinct from obs.rate then
      raise exception 'the recorded FX rate does not match the observation it cites'
        using errcode = 'check_violation';
    end if;
  end if;

  -- f may only come from an established float determination. A float recorded unknown or
  -- unavailable cannot supply a factor, which is the 5.4 invariant reaching into the valuation.
  if new.accessible_float_factor is not null then
    if new.float_observation_id is null then
      raise exception 'an accessible float factor must cite the determination that established it'
        using errcode = 'check_violation';
    end if;
    select float_state into obs from pipeline.float_observations where id = new.float_observation_id;
    if obs.float_state <> 'established' then
      raise exception 'the cited float determination is %, so it establishes no factor',
        obs.float_state using errcode = 'check_violation';
    end if;
  end if;

  -- The product must reproduce. Re-checked rather than trusted, because every factor is stored
  -- beside its lineage precisely so the arithmetic can be audited.
  if new.input_state = 'complete' then
    if abs(new.class_market_cap_usd
           - (new.local_price * new.share_count * new.accessible_float_factor * new.fx_rate))
       > new.class_market_cap_usd * 1e-18 then
      raise exception 'the class market capitalization does not reproduce from its factors'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_snapshot_input() is
  'Trigger: every factor must match the observation it cites, share counts must be outstanding rather than issued or weighted-average, price and valuation must share an economic date, FX must be USD per unit of the price currency, f must come from an established float determination, and the product must reproduce from its factors.';

create trigger universe_snapshots_gates before insert on pipeline.universe_snapshots
  for each row execute function pipeline.check_universe_snapshot();
create trigger snapshot_inputs_gates before insert on pipeline.snapshot_constituent_inputs
  for each row execute function pipeline.check_snapshot_input();

create trigger universe_snapshots_append_only before update or delete on pipeline.universe_snapshots
  for each row execute function pipeline.allow_only_supersession();
create trigger snapshot_constituents_no_mutation before update or delete on pipeline.snapshot_constituents
  for each row execute function pipeline.forbid_mutation();
create trigger snapshot_inputs_no_mutation before update or delete on pipeline.snapshot_constituent_inputs
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.universe_snapshots enable row level security;
alter table pipeline.snapshot_constituents enable row level security;
alter table pipeline.snapshot_constituent_inputs enable row level security;
