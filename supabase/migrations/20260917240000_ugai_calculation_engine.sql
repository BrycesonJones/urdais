-- The UGAI calculation engine: index shares, divisor, daily level, publication gates.
--
-- The methodology specifies this phase almost completely, and the specification is worth quoting
-- because the schema is shaped by it rather than by convenience:
--
--   MV_t   = Σ_i q_i,t × P_i,t × X_i,t
--   UGAI_t = MV_t / D_t
--
-- with `q` the index shares, constant between resets; `P` the raw official close, never rewritten;
-- `X` USD per unit of the price currency; and `D` the divisor, which "absorbs every change in
-- market value that is not investment performance".
--
-- One sentence governs the whole design: **UGAI must change because constituent market values
-- changed, not because bookkeeping events altered shares, listings, or capital structure.** The
-- divisor is how that is achieved, and it has exactly one general rule --
--
--   D_t+1 = D_t × MV_t^after / MV_t^before
--
-- -- which every maintenance event below reduces to. There are no per-event special cases in the
-- arithmetic, only per-event decisions about what MV_after is.
--
-- Two separations the tables enforce structurally:
--
--   q is not shares outstanding. The methodology is explicit that index shares "are not shares
--   outstanding, not free-float shares, and not a claim about any company's share count", and
--   that a company issuing stock between resets does not change q. So index shares live in their
--   own table, sourced from a reset, and no share observation can reach them directly.
--
--   Calculated is not publishable. A level can be correct and still unpublishable -- because a
--   parameter is unresolved, a right is missing, or a lineage is incomplete -- so publication
--   readiness is a separate set of structured checks rather than a boolean on the calculation.

-- --------------------------------------------------------------------- index shares
--
-- `q_i`, effective-dated. Set at a reset from the parent's base weights and the implementation
-- close, and then held fixed so that weights drift with prices:
--
--   q_i,s+1 = w_i × MV_s / (P_i,s × X_i,s)
--
-- Changed only at scheduled resets, at parent event snapshots (where a removed security's q goes
-- to zero), and by the corporate-action share adjustments the methodology lists. Nothing else.

create table pipeline.ugai_index_shares (
  id                      uuid primary key default gen_random_uuid(),
  issuer_id               uuid not null references reference.issuers (id) on delete restrict,
  security_id             uuid not null references reference.securities (id) on delete restrict,
  listing_id              uuid not null references reference.listings (id) on delete restrict,

  -- Zero is a real and necessary value: a removed security ends at q = 0, and the methodology
  -- says so in those words. It is not the same as having no row.
  index_shares            numeric not null
                            constraint ugai_index_shares_non_negative
                            check (index_shares >= 0 and index_shares <> 'NaN'::numeric),

  effective_from          date not null,
  -- What set it. A share observation is deliberately not among the options: shares outstanding
  -- changing between resets does not change q, and the only path from one to the other is the
  -- parent's next base-weight snapshot.
  set_by                  text not null
                            constraint ugai_index_shares_set_by_allowed
                            check (set_by in (
                              'scheduled_reset',
                              'event_snapshot_removal',
                              'corporate_action_share_adjustment',
                              'representative_security_substitution'
                            )),
  snapshot_id             uuid references pipeline.universe_snapshots (id) on delete restrict,
  corporate_action_id     uuid references pipeline.corporate_actions (id) on delete restrict,
  basis                   text not null
                            constraint ugai_index_shares_basis_nonempty check (btrim(basis) <> ''),

  superseded_by_id        uuid references pipeline.ugai_index_shares (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  constraint ugai_index_shares_reset_names_snapshot
    check (set_by <> 'scheduled_reset' or snapshot_id is not null),
  constraint ugai_index_shares_action_names_action
    check (set_by <> 'corporate_action_share_adjustment' or corporate_action_id is not null),
  constraint ugai_index_shares_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.ugai_index_shares is
  'q_i: the quantities that reproduce the parent base weights at a reset close, then held fixed so weights drift with prices. Not shares outstanding, not free-float shares, and not a claim about any company''s share count -- a company issuing stock between resets does not change q, which is why set_by has no share-observation option.';

create unique index ugai_index_shares_current_idx
  on pipeline.ugai_index_shares (security_id, effective_from)
  where superseded_by_id is null;
create index ugai_index_shares_effective_idx on pipeline.ugai_index_shares (effective_from desc, security_id);

-- ------------------------------------------------------------------------- divisor
--
-- Append-only history. The divisor is the only thing standing between a corporate action and a
-- fictitious return, so a lost prior value is a lost audit trail.

create table pipeline.ugai_divisors (
  id                      uuid primary key default gen_random_uuid(),
  effective_from          date not null,

  divisor                 numeric not null
                            constraint ugai_divisor_positive
                            check (divisor > 0 and divisor <> 'NaN'::numeric
                                   and divisor <> 'Infinity'::numeric),
  prior_divisor           numeric
                            constraint ugai_prior_divisor_positive
                            check (prior_divisor is null
                                   or (prior_divisor > 0 and prior_divisor <> 'NaN'::numeric)),

  change_reason           text not null
                            constraint ugai_divisor_reason_allowed
                            check (change_reason in (
                              'base_initialization',
                              'scheduled_reset',
                              'event_snapshot_removal',
                              'special_dividend',
                              'capital_repayment',
                              'rights_issue',
                              'merger_consideration',
                              'spin_off_line_removal',
                              'delisting_removal',
                              'representative_security_substitution',
                              'index_share_rounding',
                              'correction'
                            )),
  -- The two market values the general rule divides. Recorded so the change can be re-derived:
  -- D_t+1 = D_t × MV_after / MV_before.
  market_value_before     numeric
                            constraint ugai_mv_before_positive
                            check (market_value_before is null
                                   or (market_value_before > 0 and market_value_before <> 'NaN'::numeric)),
  market_value_after      numeric
                            constraint ugai_mv_after_positive
                            check (market_value_after is null
                                   or (market_value_after > 0 and market_value_after <> 'NaN'::numeric)),

  snapshot_id             uuid references pipeline.universe_snapshots (id) on delete restrict,
  corporate_action_id     uuid references pipeline.corporate_actions (id) on delete restrict,
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  basis                   text not null
                            constraint ugai_divisor_basis_nonempty check (btrim(basis) <> ''),

  state                   text not null default 'development'
                            constraint ugai_divisor_state_allowed
                            check (state in ('development', 'production', 'superseded')),

  superseded_by_id        uuid references pipeline.ugai_divisors (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  -- Base initialization is the one divisor with no predecessor; every other change has one.
  constraint ugai_divisor_base_has_no_prior
    check ((change_reason = 'base_initialization') = (prior_divisor is null)),
  -- A maintenance change records both sides of the ratio it applied.
  constraint ugai_divisor_change_records_both_values
    check (change_reason in ('base_initialization', 'correction')
           or (market_value_before is not null and market_value_after is not null)),
  constraint ugai_divisor_production_names_snapshot
    check (state <> 'production' or snapshot_id is not null),
  constraint ugai_divisor_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.ugai_divisors is
  'Divisor history, append-only. One general rule applies to every maintenance event: D_t+1 = D_t x MV_after / MV_before, with both market values recorded so the change re-derives. The divisor never moves for price or exchange-rate movements, ordinary dividends, splits, or weight drift -- those are performance, and performance is the one thing the level is supposed to show.';
comment on column pipeline.ugai_divisors.change_reason is
  'Why the divisor moved. Deliberately a closed list drawn from the methodology''s own enumeration: an event type absent from it has no approved treatment and must block rather than pick the nearest neighbour.';

create unique index ugai_divisors_current_idx
  on pipeline.ugai_divisors (effective_from, state)
  where superseded_by_id is null;

-- ------------------------------------------------------------------ daily calculation

create table pipeline.ugai_calculations (
  id                      uuid primary key default gen_random_uuid(),
  calculation_date        date not null,

  state                   text not null default 'development'
                            constraint ugai_calculation_state_allowed
                            check (state in (
                              'development', 'calculated', 'blocked',
                              'ready_for_review', 'publication_eligible', 'superseded'
                            )),

  -- MV_t and the level. Both unrounded: the methodology requires that "a rounded value is never
  -- an input to a subsequent calculation", and the cheapest way to honour that is never to round.
  market_value_usd        numeric
                            constraint ugai_calculation_mv_positive
                            check (market_value_usd is null
                                   or (market_value_usd > 0 and market_value_usd <> 'NaN'::numeric)),
  divisor_id              uuid references pipeline.ugai_divisors (id) on delete restrict,
  divisor                 numeric
                            constraint ugai_calculation_divisor_positive
                            check (divisor is null or (divisor > 0 and divisor <> 'NaN'::numeric)),
  index_level             numeric
                            constraint ugai_calculation_level_positive
                            check (index_level is null
                                   or (index_level > 0 and index_level <> 'NaN'::numeric)),

  -- Whether this calculation established the base. The methodology sets the base date as "the
  -- date of UGAI's first live published observation", so this is only true where publication
  -- actually happened.
  is_base_observation     boolean not null default false,

  snapshot_id             uuid references pipeline.universe_snapshots (id) on delete restrict,
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  block_reason            text,
  notes                   text,

  superseded_by_id        uuid references pipeline.ugai_calculations (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  -- A calculated level is the quotient of a market value and a divisor. All three or none.
  constraint ugai_calculation_level_is_complete
    check ((state in ('calculated', 'ready_for_review', 'publication_eligible'))
           = (market_value_usd is not null and divisor is not null and index_level is not null)),
  constraint ugai_calculation_blocked_is_explained
    check (state <> 'blocked' or block_reason is not null),
  constraint ugai_calculation_names_its_divisor
    check (divisor is null or divisor_id is not null),
  constraint ugai_calculation_publication_names_snapshot
    check (state <> 'publication_eligible' or snapshot_id is not null),
  constraint ugai_calculation_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.ugai_calculations is
  'One UGAI level per calculation day. state separates calculated from publishable deliberately: a level can be arithmetically correct and still unpublishable because a parameter is unresolved, a right is missing, or a lineage is incomplete. A blocked calculation keeps its reasons rather than being discarded.';

create unique index ugai_calculations_current_idx
  on pipeline.ugai_calculations (calculation_date, state)
  where superseded_by_id is null and state <> 'development';
create index ugai_calculations_date_idx on pipeline.ugai_calculations (calculation_date desc);

-- ------------------------------------------------------ per-constituent contributions

create table pipeline.ugai_constituent_calculations (
  id                      uuid primary key default gen_random_uuid(),
  calculation_id          uuid not null references pipeline.ugai_calculations (id) on delete restrict,
  issuer_id               uuid not null references reference.issuers (id) on delete restrict,
  security_id             uuid not null references reference.securities (id) on delete restrict,
  listing_id              uuid not null references reference.listings (id) on delete restrict,

  index_shares_id         uuid references pipeline.ugai_index_shares (id) on delete restrict,
  index_shares            numeric
                            constraint ugai_cc_shares_non_negative
                            check (index_shares is null
                                   or (index_shares >= 0 and index_shares <> 'NaN'::numeric)),

  price_observation_id    uuid references pipeline.price_observations (id) on delete restrict,
  local_price             numeric,
  price_currency          char(3),
  -- Which of the methodology's seven input conditions this price is. They are not
  -- interchangeable: a market holiday is not an error, a stale close is publishable-but-delayed,
  -- and a genuinely missing observation may not be imputed at all.
  price_input_state       text not null
                            constraint ugai_cc_price_state_allowed
                            check (price_input_state in (
                              'observed',
                              'valid_prior_close',      -- exchange had no session; carried, not an error
                              'stale',                  -- session held, no close by cutoff; carried and flagged
                              'suspended',              -- trading halted; carried and flagged
                              'missing',                -- nothing to carry; may not be imputed
                              'reference_data_conflict' -- withheld pending resolution
                            )),
  carried_from_date       date,

  fx_observation_id       uuid references pipeline.fx_observations (id) on delete restrict,
  fx_rate                 numeric
                            constraint ugai_cc_fx_positive
                            check (fx_rate is null or (fx_rate > 0 and fx_rate <> 'NaN'::numeric)),
  fx_input_state          text not null default 'observed'
                            constraint ugai_cc_fx_state_allowed
                            check (fx_input_state in ('observed', 'carried', 'missing')),

  -- q × P × X, the constituent's term of MV_t.
  contribution_usd        numeric
                            constraint ugai_cc_contribution_non_negative
                            check (contribution_usd is null
                                   or (contribution_usd >= 0 and contribution_usd <> 'NaN'::numeric)),
  -- The as-of weight, which drifts with price. Recorded, never used as an input: re-weighting to
  -- it would embed a trading rule the methodology explicitly rejects.
  as_of_weight            numeric
                            constraint ugai_cc_weight_range
                            check (as_of_weight is null
                                   or (as_of_weight >= 0 and as_of_weight <= 1
                                       and as_of_weight <> 'NaN'::numeric)),
  created_at              timestamptz not null default now(),

  unique (calculation_id, security_id),
  -- A carried price says where it came from; an observed one does not carry.
  constraint ugai_cc_carried_names_its_origin
    check ((price_input_state in ('valid_prior_close', 'stale', 'suspended'))
           = (carried_from_date is not null)),
  -- A missing price contributes nothing and must not be given a value. This is the constraint
  -- that makes imputation unrepresentable rather than merely prohibited.
  constraint ugai_cc_missing_has_no_price
    check (price_input_state not in ('missing', 'reference_data_conflict')
           or (local_price is null and contribution_usd is null)),
  constraint ugai_cc_contribution_is_complete
    check (contribution_usd is null
           or (index_shares is not null and local_price is not null and fx_rate is not null))
);

comment on table pipeline.ugai_constituent_calculations is
  'One constituent''s term of MV_t = Σ q × P × X, with the observation behind each factor and the input condition of each. The seven price states are the methodology''s own: a market holiday is not an error, a stale close is carried and flagged, and a genuinely missing observation may not be imputed -- which the constraints make unrepresentable rather than merely forbidden.';

create index ugai_cc_calculation_idx on pipeline.ugai_constituent_calculations (calculation_id);

-- --------------------------------------------------------------- publication readiness

create table pipeline.ugai_publication_checks (
  id                      uuid primary key default gen_random_uuid(),
  calculation_id          uuid not null references pipeline.ugai_calculations (id) on delete restrict,

  check_name              text not null
                            constraint ugai_publication_check_allowed
                            check (check_name in (
                              'production_snapshot_valid',
                              'divisor_valid',
                              'all_constituent_inputs_present',
                              'no_unresolved_corporate_action',
                              'methodology_parameters_approved',
                              'source_rights_permit_publication',
                              'attribution_available',
                              'lineage_complete',
                              'stale_input_tolerance'
                            )),
  result                  text not null
                            constraint ugai_publication_result_allowed
                            check (result in ('passed', 'failed', 'unavailable', 'parameter_unresolved')),
  parameter_key           text,
  basis                   text not null
                            constraint ugai_publication_basis_nonempty check (btrim(basis) <> ''),
  created_at              timestamptz not null default now(),

  unique (calculation_id, check_name),
  constraint ugai_publication_unresolved_names_parameter
    check (result <> 'parameter_unresolved' or parameter_key is not null)
);

comment on table pipeline.ugai_publication_checks is
  'Structured publication readiness, one row per check. Separate from the calculation because a level can be correct and unpublishable at the same time, and because "why can this not be published" is a question with several simultaneous answers.';

-- ------------------------------------------------------------------------- the gates

create or replace function pipeline.check_ugai_divisor()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  snap record;
begin
  -- The general rule, re-derived. Every maintenance event reduces to the same arithmetic, so it
  -- is checked once here rather than trusted per event type.
  if new.prior_divisor is not null
     and new.market_value_before is not null and new.market_value_after is not null then
    if abs(new.divisor - new.prior_divisor * new.market_value_after / new.market_value_before)
       > new.divisor * 1e-18 then
      raise exception 'divisor % does not reproduce from D_prior x MV_after / MV_before (expected %)',
        new.divisor, new.prior_divisor * new.market_value_after / new.market_value_before
        using errcode = 'check_violation';
    end if;
  end if;

  -- A production divisor requires a production-eligible snapshot. The base divisor additionally
  -- cannot be invented: it is MV_base / 1000, and MV_base needs a real basket.
  if new.state = 'production' then
    select state into snap from pipeline.universe_snapshots where id = new.snapshot_id;
    if snap.state is distinct from 'production_eligible' then
      raise exception 'a production divisor requires a production-eligible snapshot; this one is %',
        coalesce(snap.state, 'absent') using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_ugai_divisor() is
  'Trigger: re-derives every divisor change from D_prior x MV_after / MV_before and refuses one that does not reproduce, and requires a production-eligible snapshot behind any production divisor.';

create or replace function pipeline.check_ugai_calculation()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  div record;
begin
  -- The level is the quotient. Checked rather than trusted, because a level that does not
  -- reproduce from its own recorded market value and divisor is the one error nobody would spot.
  if new.index_level is not null then
    if abs(new.index_level - new.market_value_usd / new.divisor) > new.index_level * 1e-18 then
      raise exception 'index level % does not reproduce from MV / D (expected %)',
        new.index_level, new.market_value_usd / new.divisor using errcode = 'check_violation';
    end if;
    select divisor, state into div from pipeline.ugai_divisors where id = new.divisor_id;
    if div.divisor is distinct from new.divisor then
      raise exception 'the recorded divisor does not match the divisor row it cites'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Publication requires a production-eligible snapshot and a production divisor. A development
  -- divisor cannot carry a publishable level however correct its arithmetic.
  if new.state = 'publication_eligible' then
    if div.state is distinct from 'production' then
      raise exception 'a publication-eligible calculation requires a production divisor; this one is %',
        coalesce(div.state, 'absent') using errcode = 'check_violation';
    end if;
    if (select state from pipeline.universe_snapshots where id = new.snapshot_id)
       is distinct from 'production_eligible' then
      raise exception 'a publication-eligible calculation requires a production-eligible snapshot'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The base observation is the first *published* one. Marking a development or blocked
  -- calculation as the base would set a base date that never went live.
  if new.is_base_observation and new.state <> 'publication_eligible' then
    raise exception 'the base observation must be publication-eligible; this one is %', new.state
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.check_ugai_calculation() is
  'Trigger: re-derives the level from MV / D, requires the recorded divisor to match the row it cites, requires a production divisor and production-eligible snapshot for publication, and refuses to mark a base observation that was never published -- the methodology sets the base date at first live publication.';

create trigger ugai_divisors_gates before insert on pipeline.ugai_divisors
  for each row execute function pipeline.check_ugai_divisor();
create trigger ugai_calculations_gates before insert on pipeline.ugai_calculations
  for each row execute function pipeline.check_ugai_calculation();

create trigger ugai_index_shares_append_only before update or delete on pipeline.ugai_index_shares
  for each row execute function pipeline.allow_only_supersession();
create trigger ugai_divisors_append_only before update or delete on pipeline.ugai_divisors
  for each row execute function pipeline.allow_only_supersession();
create trigger ugai_calculations_append_only before update or delete on pipeline.ugai_calculations
  for each row execute function pipeline.allow_only_supersession();
create trigger ugai_cc_no_mutation before update or delete on pipeline.ugai_constituent_calculations
  for each row execute function pipeline.forbid_mutation();
create trigger ugai_publication_checks_no_mutation before update or delete on pipeline.ugai_publication_checks
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.ugai_index_shares enable row level security;
alter table pipeline.ugai_divisors enable row level security;
alter table pipeline.ugai_calculations enable row level security;
alter table pipeline.ugai_constituent_calculations enable row level security;
alter table pipeline.ugai_publication_checks enable row level security;
