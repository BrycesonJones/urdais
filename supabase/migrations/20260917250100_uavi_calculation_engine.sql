-- The UAVI calculation engine: strips, constituent volatility, the headline, publication gates.
--
-- The methodology fixes the arithmetic completely, and one line of it decides the shape of this
-- whole migration:
--
--   sigma_i,30 = sqrt(sigma^2_i,30)
--   UAVI_t     = 100 x SUM over covered i of ( v_i,t x sigma_i,30,t )
--
-- **The square root is taken per constituent, before weighting.** Version 0.1.0-draft specified
-- the opposite -- weight the variances, sum, take one square root at the end -- and that form,
-- 100 x sqrt(SUM v_i sigma^2_i), is what an implementation drifts back toward, because it is what
-- the one institutional analogue publishes and what most of the literature describes. The two
-- agree only where every constituent volatility is equal, and the arithmetic mean is otherwise
-- strictly smaller. A regression would therefore produce a number that is plausible, wrong, and
-- invisible.
--
-- So it is not defended by a comment. pipeline.check_uavi_level() re-derives the headline from the
-- constituent rows as the weighted arithmetic mean and refuses a row that does not reproduce; a
-- level computed by the root-mean-square form fails that check by construction. The same trigger
-- re-derives the renormalized weights sum to one, the maximum weight, and the effective
-- constituent count, because each of those is a published figure that nothing else re-checks.
--
-- Three separations the tables make structural.
--
--   Constituent variance is NOT keyed to a headline calculation. The methodology is explicit that
--   where parent weights are unavailable "constituent-level variances may still be computed,
--   recorded, and published as inputs, since they do not depend on weights; only the aggregate is
--   withheld". A variance row keyed on (issuer, session date) can exist with no calculation at
--   all, which is exactly the state UAVI is in.
--
--   Covered is not the same as calculated is not the same as publishable. An issuer can have a
--   valid variance and still not be covered; a headline can be arithmetically correct and still
--   fail a gate. Each is a separate column or a separate table, never a single boolean.
--
--   Every uncovered issuer keeps a row. The uncovered parent weight and the distribution of its
--   reasons are published figures, and a member that silently vanishes from the constituent table
--   cannot be counted in either.

-- ============================================================= constituent variance
--
-- One issuer's 30-day implied volatility for one session, and everything needed to reproduce it.
--
-- sigma_30 is stored as decimal volatility, not percent: 0.426 rather than 42.60. The x100 is
-- applied once, at the headline, and a percent stored here would be multiplied twice by anything
-- that forgot. variance_30 is stored beside it and the trigger checks that one is the square of
-- the other, so a unit slip cannot survive the insert.

create table pipeline.uavi_constituent_variances (
  id                      uuid primary key default gen_random_uuid(),
  session_date            date not null,
  issuer_id               uuid not null references reference.issuers (id) on delete restrict,

  -- The instrument actually used, and the mapping that chose it. Both, because "which security"
  -- and "by which route, on what evidence" are different questions and a historical observation
  -- must answer the second as well as the first.
  volatility_instrument_id uuid references pipeline.uavi_volatility_instruments (id) on delete restrict,
  volatility_security_id   uuid references reference.securities (id) on delete restrict,
  mapping_type             text
                             constraint uavi_cv_mapping_allowed
                             check (mapping_type is null or mapping_type in ('representative', 'adr')),

  status                  text not null
                            constraint uavi_cv_status_allowed
                            check (status in (
                              'valid',      -- a variance computed under these rules
                              'uncovered',  -- an input or a screen was not satisfied; reason required
                              'invalid'     -- a computation produced a non-finite or negative result
                            )),
  -- The methodology's own vocabulary, one code per category. Deliberately a closed list: a reason
  -- absent from it has no approved treatment, and free text as a publication input is not
  -- auditable.
  uncovered_reason        text
                            constraint uavi_cv_reason_allowed
                            check (uncovered_reason is null or uncovered_reason in (
                              'no_volatility_instrument',
                              'option_data_missing',
                              'near_expiry_missing',
                              'next_expiry_missing',
                              'invalid_forward',
                              'invalid_k0',
                              'insufficient_puts',
                              'insufficient_calls',
                              'invalid_atm_quotes',
                              'invalid_variance',
                              'adjusted_contract_only',
                              'rate_missing',
                              'stale_quotes',
                              'reference_data_conflict',
                              'underlying_halted'
                            )),

  -- Decimal volatility and its square. 0.426, never 42.60.
  sigma_30                numeric
                            constraint uavi_cv_sigma_range
                            check (sigma_30 is null
                                   or (sigma_30 >= 0 and sigma_30 < 100
                                       and sigma_30 <> 'NaN'::numeric)),
  variance_30             numeric
                            constraint uavi_cv_variance_non_negative
                            check (variance_30 is null
                                   or (variance_30 >= 0 and variance_30 <> 'NaN'::numeric
                                       and variance_30 <> 'Infinity'::numeric)),

  -- The two terms the 30-day figure interpolates between, retained so the interpolation itself is
  -- reproducible without re-reading the strips.
  near_expiration         date,
  next_expiration         date,
  near_variance           numeric
                            constraint uavi_cv_near_var_non_negative
                            check (near_variance is null
                                   or (near_variance >= 0 and near_variance <> 'NaN'::numeric)),
  next_variance           numeric
                            constraint uavi_cv_next_var_non_negative
                            check (next_variance is null
                                   or (next_variance >= 0 and next_variance <> 'NaN'::numeric)),
  near_minutes            numeric
                            constraint uavi_cv_near_minutes_positive
                            check (near_minutes is null or near_minutes > 0),
  next_minutes            numeric
                            constraint uavi_cv_next_minutes_positive
                            check (next_minutes is null or next_minutes > 0),

  snapshot_timestamp      timestamptz not null,
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  source_interface_id     uuid references reference.source_interfaces (id) on delete restrict,
  notes                   text,

  superseded_by_id        uuid references pipeline.uavi_constituent_variances (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  -- A valid variance carries the whole chain: both terms, both expirations, both minute counts,
  -- the variance and its root. Anything short of that is not reproducible and is not valid.
  constraint uavi_cv_valid_is_complete
    check ((status = 'valid')
           = (sigma_30 is not null and variance_30 is not null
              and near_expiration is not null and next_expiration is not null
              and near_variance is not null and next_variance is not null
              and near_minutes is not null and next_minutes is not null
              and volatility_instrument_id is not null and volatility_security_id is not null
              and mapping_type is not null)),
  -- An uncovered constituent says why. Without the reason, "uncovered" and "not attempted" are
  -- the same row, and the published distribution of reasons is unbuildable.
  constraint uavi_cv_uncovered_is_explained
    check ((uncovered_reason is not null) = (status in ('uncovered', 'invalid'))),
  -- The bracket the methodology requires: N_1 <= N30 < N_2. Checked here as well as in the
  -- calculator, because an interpolation outside it is an extrapolation wearing the same formula.
  constraint uavi_cv_terms_bracket_the_horizon
    check (near_minutes is null or next_minutes is null
           or (near_minutes <= 43200 and next_minutes > 43200)),
  constraint uavi_cv_expirations_ordered
    check (near_expiration is null or next_expiration is null or next_expiration > near_expiration),
  constraint uavi_cv_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.uavi_constituent_variances is
  'One issuer''s 30-day implied volatility for one session. Deliberately NOT keyed to a headline calculation: the methodology states that where parent weights are unavailable the constituent variances may still be computed and published, and only the aggregate is withheld. A row here can therefore exist with no calculation at all, which is the state UAVI is in.';
comment on column pipeline.uavi_constituent_variances.sigma_30 is
  'Decimal volatility: 0.426, never 42.60. The x100 is applied once at the headline, and a percent stored here would be multiplied twice by anything that forgot. variance_30 sits beside it and the trigger checks one is the square of the other, so a unit slip cannot survive the insert.';
comment on column pipeline.uavi_constituent_variances.uncovered_reason is
  'A closed list from the methodology''s own vocabulary. A reason absent from it has no approved treatment, and free text as a publication input is not auditable.';

-- One issuer, one variance, one session. This is what makes a duplicate daily row unrepresentable
-- rather than merely discouraged, and it is also the idempotency guarantee: a rerun either
-- supersedes or collides.
create unique index uavi_cv_current_idx
  on pipeline.uavi_constituent_variances (session_date, issuer_id)
  where superseded_by_id is null;
create index uavi_cv_session_idx on pipeline.uavi_constituent_variances (session_date, status);

-- ============================================================= option strips
--
-- One expiration's VIX-style term variance, with every derived quantity that produced it.
--
-- The methodology requires that a strip retain "its selected contracts, their quotes and
-- timestamps, F_j, K0_j, r_j, T_j, the strike set with each delta-K_k, the computed variance, and
-- the strip's quality status, so that the figure is reproducible from the recorded inputs". Each
-- clause of that sentence is a column here or a row in the components table below.

create table pipeline.uavi_option_strips (
  id                      uuid primary key default gen_random_uuid(),
  constituent_variance_id uuid not null references pipeline.uavi_constituent_variances (id) on delete restrict,

  term                    text not null
                            constraint uavi_strip_term_allowed check (term in ('near', 'next')),
  expiration_date         date not null,
  expiration_timestamp    timestamptz not null,
  -- Minutes from the official snapshot instant to expiration, and the annualized fraction. Both,
  -- because the interpolation weights use minutes and the variance formula uses the fraction, and
  -- deriving one from the other at read time is where a 365-vs-360 slip enters.
  minutes_to_expiration   numeric not null
                            constraint uavi_strip_minutes_positive
                            check (minutes_to_expiration > 0 and minutes_to_expiration <> 'NaN'::numeric),
  time_to_expiration      numeric not null
                            constraint uavi_strip_time_positive
                            check (time_to_expiration > 0 and time_to_expiration <> 'NaN'::numeric),

  -- The option-implied forward, never a spot price. The methodology is explicit that this is a
  -- derived quantity recorded with its inputs and never an observed one.
  forward_price           numeric
                            constraint uavi_strip_forward_positive
                            check (forward_price is null
                                   or (forward_price > 0 and forward_price <> 'NaN'::numeric
                                       and forward_price <> 'Infinity'::numeric)),
  k0                      numeric
                            constraint uavi_strip_k0_positive
                            check (k0 is null or (k0 > 0 and k0 <> 'NaN'::numeric)),
  -- The strike parity was solved at, and the call and put mids there. Retained because the
  -- forward is the quantity most sensitive to an American early-exercise premium and a reviewer
  -- asking "why is this forward here" needs the two prices that produced it.
  parity_strike           numeric
                            constraint uavi_strip_parity_positive
                            check (parity_strike is null or parity_strike > 0),
  parity_call_mid         numeric,
  parity_put_mid          numeric,

  risk_free_rate_id       uuid references pipeline.risk_free_rate_observations (id) on delete restrict,
  continuous_rate         numeric
                            constraint uavi_strip_rate_finite
                            check (continuous_rate is null
                                   or (continuous_rate > -1 and continuous_rate < 1
                                       and continuous_rate <> 'NaN'::numeric)),

  otm_put_count           integer not null default 0
                            constraint uavi_strip_put_count_non_negative check (otm_put_count >= 0),
  otm_call_count          integer not null default 0
                            constraint uavi_strip_call_count_non_negative check (otm_call_count >= 0),
  included_strike_count   integer not null default 0
                            constraint uavi_strip_strike_count_non_negative check (included_strike_count >= 0),

  term_variance           numeric
                            constraint uavi_strip_variance_finite
                            check (term_variance is null
                                   or (term_variance <> 'NaN'::numeric
                                       and term_variance <> 'Infinity'::numeric
                                       and term_variance <> '-Infinity'::numeric)),

  strip_status            text not null
                            constraint uavi_strip_status_allowed
                            check (strip_status in ('valid', 'invalid')),
  failure_reason          text
                            constraint uavi_strip_failure_allowed
                            check (failure_reason is null or failure_reason in (
                              'option_data_missing', 'invalid_forward', 'invalid_k0',
                              'insufficient_puts', 'insufficient_calls', 'invalid_atm_quotes',
                              'invalid_variance', 'adjusted_contract_only', 'rate_missing',
                              'stale_quotes', 'reference_data_conflict'
                            )),

  -- The American-exercise diagnostics the methodology requires on every contributing strip. None
  -- is an exclusion criterion in this version, and the comment says so, because a diagnostic that
  -- quietly became a filter would change the measure without changing the methodology.
  exercise_style          text
                            constraint uavi_strip_exercise_allowed
                            check (exercise_style is null or exercise_style in ('american', 'european')),
  ex_dividend_in_window   boolean,
  diagnostics             jsonb,

  created_at              timestamptz not null default now(),

  unique (constituent_variance_id, term),
  -- A valid strip has a forward, a K0, a rate, a variance and enough contracts on both wings.
  -- The 3-per-side minimum is repeated here rather than left to the calculator because it is the
  -- condition that separates an estimate from a truncation artefact.
  constraint uavi_strip_valid_is_complete
    check ((strip_status = 'valid')
           = (forward_price is not null and k0 is not null and continuous_rate is not null
              and term_variance is not null and otm_put_count >= 3 and otm_call_count >= 3)),
  constraint uavi_strip_invalid_is_explained
    check ((failure_reason is not null) = (strip_status = 'invalid')),
  -- A valid strip's variance is non-negative. A negative one is a fault and must arrive as
  -- invalid with `invalid_variance`, never as a valid strip carrying a negative number that a
  -- square root downstream would turn into a non-real result.
  constraint uavi_strip_valid_variance_non_negative
    check (strip_status <> 'valid' or term_variance >= 0),
  -- K0 is the greatest listed strike at or below the forward, so it can never exceed it.
  constraint uavi_strip_k0_at_or_below_forward
    check (k0 is null or forward_price is null or k0 <= forward_price)
);

comment on table pipeline.uavi_option_strips is
  'One expiration''s VIX-style term variance with every derived quantity behind it. Minutes and the annualized fraction are both stored: the interpolation weights use minutes and the variance formula uses the fraction, and deriving one from the other at read time is where a day-count slip enters.';
comment on column pipeline.uavi_option_strips.forward_price is
  'The option-implied forward from put-call parity, never a spot price. A derived quantity recorded with its inputs and never presented as observed -- and the quantity most sensitive to an American early-exercise premium, which is why the parity strike and its two mids are retained beside it.';
comment on column pipeline.uavi_option_strips.diagnostics is
  'Exercise style, ex-dividend timing within the strip''s life, moneyness structure of the surviving strikes. Diagnostics in this version and not exclusion criteria: no exclusion rule may be adopted from them without evidence that it removes more error than coverage.';

create index uavi_strips_variance_idx on pipeline.uavi_option_strips (constituent_variance_id);

-- ----------------------------------------------------------- surviving strikes

-- One row per surviving strike, with the delta-K it contributed and the quote it used. This is
-- what makes "reproducible from the recorded inputs" true rather than aspirational: a reviewer can
-- re-run the sum from these rows alone.
create table pipeline.uavi_strip_components (
  id                    uuid primary key default gen_random_uuid(),
  strip_id              uuid not null references pipeline.uavi_option_strips (id) on delete restrict,

  contract_id           uuid references reference.option_contracts (id) on delete restrict,
  quote_observation_id  uuid references pipeline.option_quote_observations (id) on delete restrict,

  strike                numeric not null
                          constraint uavi_sc_strike_positive
                          check (strike > 0 and strike <> 'NaN'::numeric),
  -- 'put' below K0, 'call' above it, 'atm_average' at K0 itself -- where Q(K) is the average of
  -- the call and put mids and the row therefore corresponds to two contracts rather than one.
  leg                   text not null
                          constraint uavi_sc_leg_allowed check (leg in ('put', 'call', 'atm_average')),
  bid                   numeric constraint uavi_sc_bid_non_negative check (bid is null or bid >= 0),
  ask                   numeric constraint uavi_sc_ask_non_negative check (ask is null or ask >= 0),
  quote_mid             numeric not null
                          constraint uavi_sc_mid_positive
                          check (quote_mid > 0 and quote_mid <> 'NaN'::numeric),
  delta_k               numeric not null
                          constraint uavi_sc_delta_k_positive
                          check (delta_k > 0 and delta_k <> 'NaN'::numeric),
  -- delta_k / strike^2 x e^(rT) x Q(K): this strike's contribution to the sum, stored so the
  -- total can be checked against its parts rather than recomputed from scratch.
  contribution          numeric not null
                          constraint uavi_sc_contribution_finite
                          check (contribution <> 'NaN'::numeric and contribution <> 'Infinity'::numeric),
  quote_timestamp       timestamptz,
  created_at            timestamptz not null default now(),

  -- One strike contributes once per strip. A duplicated strike would double a term of the sum and
  -- produce a variance that is simply too large, with nothing about it looking wrong.
  unique (strip_id, strike),
  -- Only the K0 row may be an average of two legs, and it is the only row permitted to carry a
  -- leg that does not identify a single contract.
  constraint uavi_sc_atm_is_unique_per_strip
    check (leg <> 'atm_average' or contract_id is null)
);

comment on table pipeline.uavi_strip_components is
  'One surviving strike, its delta-K, the quote it used and the term it contributed. This is what makes "reproducible from the recorded inputs" true rather than aspirational: the sum can be re-run from these rows alone. The unique constraint on (strip, strike) is what stops a duplicated strike doubling a term of the sum, which produces a variance that is simply too large and looks entirely ordinary.';

create index uavi_strip_components_strip_idx on pipeline.uavi_strip_components (strip_id, strike);

-- ============================================================= the headline

create table pipeline.uavi_calculations (
  id                      uuid primary key default gen_random_uuid(),
  calculation_date        date not null,

  state                   text not null default 'development'
                            constraint uavi_calc_state_allowed
                            check (state in (
                              'development', 'calculated', 'blocked',
                              'ready_for_review', 'publication_eligible', 'superseded'
                            )),

  -- The level in annualized volatility points: 42.60, not 0.426. Unrounded; the methodology
  -- requires that a rounded value never become an input to a subsequent calculation, and rounding
  -- happens at publication.
  index_level             numeric
                            constraint uavi_calc_level_range
                            check (index_level is null
                                   or (index_level >= 0 and index_level < 10000
                                       and index_level <> 'NaN'::numeric)),

  -- Coverage. W_t, the covered parent weight, distinct from the covered set whose size is the
  -- count beside it -- the launch contract writes both as C_t and they are different objects.
  covered_parent_weight   numeric
                            constraint uavi_calc_coverage_range
                            check (covered_parent_weight is null
                                   or (covered_parent_weight >= 0 and covered_parent_weight <= 1
                                       and covered_parent_weight <> 'NaN'::numeric)),
  covered_issuer_count    integer
                            constraint uavi_calc_covered_count_non_negative
                            check (covered_issuer_count is null or covered_issuer_count >= 0),
  uncovered_issuer_count  integer
                            constraint uavi_calc_uncovered_count_non_negative
                            check (uncovered_issuer_count is null or uncovered_issuer_count >= 0),

  -- Concentration diagnostics. NOT gates in V1, deliberately: 0.1.0-draft proposed both as gates,
  -- no evidence establishes a threshold for either, and a concentration limit on a renormalized
  -- parent inheritance would re-impose a cap the parent methodology declines to reapply after
  -- filtering. They are computed, stored, published, and cannot withhold a headline.
  max_renormalized_weight numeric
                            constraint uavi_calc_max_weight_range
                            check (max_renormalized_weight is null
                                   or (max_renormalized_weight > 0 and max_renormalized_weight <= 1
                                       and max_renormalized_weight <> 'NaN'::numeric)),
  effective_issuer_count  numeric
                            constraint uavi_calc_neff_positive
                            check (effective_issuer_count is null
                                   or (effective_issuer_count >= 1 and effective_issuer_count <> 'NaN'::numeric)),

  -- The parent, by identity. A UAVI observation that cannot name the snapshot and weight vector
  -- it consumed is not reproducible, and the parent is the input most likely to be restated.
  snapshot_id             uuid references pipeline.universe_snapshots (id) on delete restrict,
  snapshot_timestamp      timestamptz not null,
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,

  block_reason            text,
  -- Which structured failure withheld the headline, where one did. Parent codes and gate codes
  -- are kept in one closed list because the surface needs a single answer to "why is there no
  -- number", and a free-text reason is not an answer anything can branch on.
  unavailable_reason      text
                            constraint uavi_calc_unavailable_reason_allowed
                            check (unavailable_reason is null or unavailable_reason in (
                              'parent_not_production',
                              'parent_weights_missing',
                              'parent_weights_invalid',
                              'coverage_below_threshold',
                              'issuer_count_below_threshold',
                              'no_covered_constituents',
                              'no_option_data_source'
                            )),
  notes                   text,

  superseded_by_id        uuid references pipeline.uavi_calculations (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),

  -- A level exists only alongside the coverage figures that justify it. A headline without its
  -- coverage is exactly the "value computed from a residual set presented as if complete" the
  -- methodology forbids.
  constraint uavi_calc_level_is_complete
    check ((state in ('calculated', 'ready_for_review', 'publication_eligible'))
           = (index_level is not null and covered_parent_weight is not null
              and covered_issuer_count is not null and max_renormalized_weight is not null
              and effective_issuer_count is not null)),
  constraint uavi_calc_blocked_is_explained
    check (state <> 'blocked' or block_reason is not null),
  -- A withheld headline carries no level, and a level carries no withholding reason. This makes
  -- "unavailable, and here is a number anyway" unrepresentable.
  constraint uavi_calc_unavailable_carries_no_level
    check (unavailable_reason is null or index_level is null),
  constraint uavi_calc_publication_names_snapshot
    check (state <> 'publication_eligible' or snapshot_id is not null),
  constraint uavi_calc_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.uavi_calculations is
  'One UAVI headline per calculation date, in annualized volatility points. max_renormalized_weight and effective_issuer_count are diagnostics and not gates: V1 has exactly two gates, covered parent weight and covered issuer count, and a concentration limit on a renormalized parent inheritance would re-impose a cap the parent methodology deliberately declines to reapply after filtering.';
comment on column pipeline.uavi_calculations.index_level is
  'Annualized volatility points: 42.60, not 0.426. The x100 happens here and nowhere else. Unrounded at rest, because the methodology requires that a rounded value never become an input to a subsequent calculation.';
comment on column pipeline.uavi_calculations.unavailable_reason is
  'The structured answer to "why is there no number". Parent conditions and gate failures share one closed list because the public surface needs a single answer it can branch on, and free text is not one.';

create unique index uavi_calculations_current_idx
  on pipeline.uavi_calculations (calculation_date, state)
  where superseded_by_id is null and state <> 'development';
-- At most one publishable headline per date, regardless of state bookkeeping. This is the
-- duplicate-daily-row guard that the index above does not give on its own.
create unique index uavi_calculations_one_publishable_per_date
  on pipeline.uavi_calculations (calculation_date)
  where superseded_by_id is null and state = 'publication_eligible';
create index uavi_calculations_date_idx on pipeline.uavi_calculations (calculation_date desc);

-- ----------------------------------------------- per-constituent contributions

-- Every parent member gets a row: covered with its weights and contribution, or uncovered with
-- its parent weight and reason. The uncovered rows are not bookkeeping -- the uncovered parent
-- weight and the distribution of reasons are published figures, and a member that vanished from
-- this table could not appear in either.
create table pipeline.uavi_constituent_calculations (
  id                       uuid primary key default gen_random_uuid(),
  calculation_id           uuid not null references pipeline.uavi_calculations (id) on delete restrict,
  issuer_id                uuid not null references reference.issuers (id) on delete restrict,

  constituent_variance_id  uuid references pipeline.uavi_constituent_variances (id) on delete restrict,
  volatility_security_id   uuid references reference.securities (id) on delete restrict,
  mapping_type             text
                             constraint uavi_cc_mapping_allowed
                             check (mapping_type is null or mapping_type in ('representative', 'adr')),

  -- w_i, the canonical parent base weight, taken from the snapshot and never recomputed.
  parent_weight            numeric not null
                             constraint uavi_cc_parent_weight_range
                             check (parent_weight >= 0 and parent_weight <= 1
                                    and parent_weight <> 'NaN'::numeric),
  -- v_i = w_i / W_t, over the covered set only. Null for an uncovered member, which is the
  -- difference between "weight zero" and "not in the denominator".
  renormalized_weight      numeric
                             constraint uavi_cc_renorm_weight_range
                             check (renormalized_weight is null
                                    or (renormalized_weight > 0 and renormalized_weight <= 1
                                        and renormalized_weight <> 'NaN'::numeric)),
  sigma_30                 numeric
                             constraint uavi_cc_sigma_range
                             check (sigma_30 is null
                                    or (sigma_30 >= 0 and sigma_30 < 100 and sigma_30 <> 'NaN'::numeric)),
  -- v_i x sigma_i,30. These sum to UAVI/100 exactly, which is the decomposition the methodology
  -- promises and the deferred trigger below verifies.
  weight_contribution      numeric
                             constraint uavi_cc_contribution_non_negative
                             check (weight_contribution is null
                                    or (weight_contribution >= 0 and weight_contribution <> 'NaN'::numeric)),

  is_covered               boolean not null,
  uncovered_reason         text,
  created_at               timestamptz not null default now(),

  -- One issuer, one row, one calculation.
  unique (calculation_id, issuer_id),
  -- A covered member has the whole chain; an uncovered one has none of it and says why instead.
  constraint uavi_cc_covered_is_complete
    check (is_covered = (renormalized_weight is not null and sigma_30 is not null
                         and weight_contribution is not null
                         and constituent_variance_id is not null)),
  constraint uavi_cc_uncovered_is_explained
    check (is_covered = (uncovered_reason is null))
);

comment on table pipeline.uavi_constituent_calculations is
  'One row per parent member per calculation -- covered with its weights and contribution, uncovered with its parent weight and reason. The uncovered rows are not bookkeeping: the uncovered parent weight and the distribution of reasons are published figures, and a member that vanished from this table could appear in neither.';
comment on column pipeline.uavi_constituent_calculations.renormalized_weight is
  'v_i = w_i / W_t, over the covered set only. Null rather than zero for an uncovered member, because "weight zero" and "not in the denominator" are different facts and only the second is true here.';
comment on column pipeline.uavi_constituent_calculations.weight_contribution is
  'v_i x sigma_i,30 in decimal volatility. These sum to index_level / 100 exactly. That identity is the arithmetic aggregation form, and pipeline.check_uavi_level() enforces it at commit.';

create index uavi_cc_calculation_idx on pipeline.uavi_constituent_calculations (calculation_id, is_covered);

-- ----------------------------------------------- publication readiness

create table pipeline.uavi_publication_checks (
  id              uuid primary key default gen_random_uuid(),
  calculation_id  uuid not null references pipeline.uavi_calculations (id) on delete restrict,

  check_name      text not null
                    constraint uavi_publication_check_allowed
                    check (check_name in (
                      'parent_snapshot_production',
                      'parent_weights_valid',
                      'covered_parent_weight_gate',
                      'covered_issuer_count_gate',
                      'option_data_source_admitted',
                      'risk_free_rate_available',
                      'methodology_parameters_approved',
                      'source_rights_permit_publication',
                      'lineage_complete'
                    )),
  result          text not null
                    constraint uavi_publication_result_allowed
                    check (result in ('passed', 'failed', 'unavailable', 'parameter_unresolved')),
  parameter_key   text,
  basis           text not null
                    constraint uavi_publication_basis_nonempty check (btrim(basis) <> ''),
  created_at      timestamptz not null default now(),

  unique (calculation_id, check_name),
  constraint uavi_publication_unresolved_names_parameter
    check (result <> 'parameter_unresolved' or parameter_key is not null)
);

comment on table pipeline.uavi_publication_checks is
  'Structured publication readiness, one row per check, on the four-outcome model UGAI established. Separate from the calculation because "why can this not be published" has several simultaneous answers and a single boolean loses all but one of them.';

-- ============================================================= the gates

create or replace function pipeline.check_uavi_constituent_variance()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  interpolated numeric;
  w1 numeric; w2 numeric;
  n30  constant numeric := 43200;
  n365 constant numeric := 525600;
begin
  -- sigma is the square root of the variance. Checked rather than trusted, because a percent
  -- stored where a decimal belongs -- 42.60 for 0.426 -- passes every range check on this table
  -- and is wrong by two orders of magnitude at the headline.
  if new.sigma_30 is not null and new.variance_30 is not null then
    if abs(new.variance_30 - new.sigma_30 * new.sigma_30) > greatest(new.variance_30, 1e-12) * 1e-9 then
      raise exception 'variance % is not the square of sigma % (expected %)',
        new.variance_30, new.sigma_30, new.sigma_30 * new.sigma_30 using errcode = 'check_violation';
    end if;
  end if;

  -- The 30-day interpolation, re-derived from the two terms. In VARIANCE space, time-weighted,
  -- annualized by N365/N30 -- the methodology forbids interpolating quoted volatilities directly,
  -- and a direct-volatility interpolation lands close enough to look right and never reproduces.
  if new.status = 'valid' then
    if new.next_minutes = new.near_minutes then
      raise exception 'the two terms share a minute count, so the interpolation denominator is zero'
        using errcode = 'check_violation';
    end if;
    -- N30 and N365 as numerics, deliberately. Written as bare integer literals, 525600 / 43200
    -- is integer division in PostgreSQL and evaluates to 12 rather than 12.1666..., which
    -- understates every constituent variance by about 1.4 percent -- small enough to look like a
    -- rounding difference and large enough to be wrong.
    w1 := (new.next_minutes - n30) / (new.next_minutes - new.near_minutes);
    w2 := (n30 - new.near_minutes) / (new.next_minutes - new.near_minutes);
    interpolated := ((new.near_minutes / n365) * new.near_variance * w1
                   + (new.next_minutes / n365) * new.next_variance * w2) * (n365 / n30);
    if abs(new.variance_30 - interpolated) > greatest(abs(interpolated), 1e-12) * 1e-9 then
      raise exception 'the 30-day variance % does not reproduce from its two terms (expected %)',
        new.variance_30, interpolated using errcode = 'check_violation';
    end if;
  end if;

  -- The mapping must belong to this issuer. Guards the failure the whole same-issuer rule exists
  -- for, at the last point before a volatility is attributed to a company.
  if new.volatility_instrument_id is not null then
    if (select issuer_id from pipeline.uavi_volatility_instruments where id = new.volatility_instrument_id)
       is distinct from new.issuer_id then
      raise exception 'the volatility instrument belongs to a different issuer than this variance'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_uavi_constituent_variance() is
  'Trigger: sigma must be the square root of the stored variance -- which catches a percent stored where a decimal belongs, a slip that passes every range check and is wrong by two orders of magnitude at the headline -- and the 30-day variance must reproduce from its two terms by the time-weighted interpolation in variance space. A direct-volatility interpolation lands close enough to look right and never reproduces.';

-- The arithmetic-aggregation guard, deferred to commit because it reads the constituent rows that
-- are inserted after the calculation they belong to.
--
-- This is the check that makes a regression to the root-mean-square form impossible rather than
-- merely discouraged. 100 x sqrt(SUM v_i sigma^2_i) does not equal 100 x SUM v_i sigma_i unless
-- every constituent volatility is equal, so a level computed the old way fails here by
-- construction, on any real constituent set.
create or replace function pipeline.check_uavi_level()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  calc record;
  agg record;
begin
  select * into calc from pipeline.uavi_calculations where id = new.id;
  -- The row may have been superseded, or this may be a blocked attempt with nothing to check.
  if calc is null or calc.index_level is null then return null; end if;

  select coalesce(sum(weight_contribution), 0)          as contribution_sum,
         coalesce(sum(renormalized_weight), 0)          as weight_sum,
         coalesce(sum(renormalized_weight * renormalized_weight), 0) as weight_sq_sum,
         coalesce(max(renormalized_weight), 0)          as max_weight,
         count(*) filter (where is_covered)             as covered_count,
         count(*) filter (where not is_covered)         as uncovered_count,
         coalesce(sum(parent_weight) filter (where is_covered), 0) as covered_weight
    into agg
    from pipeline.uavi_constituent_calculations
   where calculation_id = new.id;

  if agg.covered_count = 0 then
    raise exception 'a UAVI level of % was recorded with no covered constituents', calc.index_level
      using errcode = 'check_violation';
  end if;

  -- THE aggregation check. UAVI = 100 x SUM(v_i x sigma_i). Arithmetic, not root mean square.
  if abs(calc.index_level - 100 * agg.contribution_sum)
     > greatest(calc.index_level, 1e-9) * 1e-9 then
    raise exception 'UAVI % is not 100 x the sum of constituent contributions (expected %); the weighted arithmetic mean is the aggregation form and a root-mean-square value fails here by construction',
      calc.index_level, 100 * agg.contribution_sum using errcode = 'check_violation';
  end if;

  -- Renormalized weights sum to one. If they do not, the denominator was wrong and every
  -- contribution above is wrong with it.
  if abs(agg.weight_sum - 1) > 1e-9 then
    raise exception 'the renormalized weights sum to % rather than 1', agg.weight_sum
      using errcode = 'check_violation';
  end if;

  -- The published diagnostics, re-derived. They are not gates, which is precisely why nothing
  -- else would notice if they were wrong.
  if abs(calc.max_renormalized_weight - agg.max_weight) > 1e-9 then
    raise exception 'the recorded maximum renormalized weight % does not match the constituents (%)',
      calc.max_renormalized_weight, agg.max_weight using errcode = 'check_violation';
  end if;
  if agg.weight_sq_sum <= 0 then
    raise exception 'the sum of squared renormalized weights is not positive' using errcode = 'check_violation';
  end if;
  if abs(calc.effective_issuer_count - 1 / agg.weight_sq_sum) > 1e-6 then
    raise exception 'the recorded effective constituent count % does not match 1 / sum(v^2) (%)',
      calc.effective_issuer_count, 1 / agg.weight_sq_sum using errcode = 'check_violation';
  end if;
  if calc.covered_issuer_count <> agg.covered_count then
    raise exception 'the recorded covered issuer count % does not match the constituent rows (%)',
      calc.covered_issuer_count, agg.covered_count using errcode = 'check_violation';
  end if;
  if abs(calc.covered_parent_weight - agg.covered_weight) > 1e-9 then
    raise exception 'the recorded covered parent weight % does not match the constituent rows (%)',
      calc.covered_parent_weight, agg.covered_weight using errcode = 'check_violation';
  end if;

  -- The two frozen gates. A publication-eligible calculation must satisfy both, and they are
  -- checked here as well as in the calculator because a gate with one implementation is a gate
  -- someone can route around.
  if calc.state = 'publication_eligible' then
    -- The same 1e-12 tolerance the calculator applies. The gate is a threshold on a real number
    -- and the value arriving here is a floating-point sum of parent weights: eight issuers at a
    -- genuine 0.1 each sum to 0.7999999999999999, and a bare comparison would refuse a universe
    -- covering exactly 80 percent for reasons of binary representation. The two implementations
    -- must agree about the same universe, so the tolerance is stated in both.
    if calc.covered_parent_weight < 0.80 - 1e-12 then
      raise exception 'covered parent weight % is below the frozen 0.80 gate', calc.covered_parent_weight
        using errcode = 'check_violation';
    end if;
    if calc.covered_issuer_count < 8 then
      raise exception 'covered issuer count % is below the frozen gate of 8', calc.covered_issuer_count
        using errcode = 'check_violation';
    end if;
    if calc.snapshot_id is null
       or (select state from pipeline.universe_snapshots where id = calc.snapshot_id)
          is distinct from 'production_eligible' then
      raise exception 'a publication-eligible UAVI requires a production-eligible parent snapshot'
        using errcode = 'check_violation';
    end if;
  end if;
  return null;
end;
$$;

comment on function pipeline.check_uavi_level() is
  'Deferred constraint trigger: re-derives the headline from the constituent rows as 100 x SUM(v_i x sigma_i) and refuses a level that does not reproduce. This is what makes a regression to version 0.1.0-draft''s root-mean-square form impossible rather than merely discouraged -- the two forms agree only where every constituent volatility is equal, so an RMS level fails by construction on any real constituent set. Also re-derives the weight sum, the concentration diagnostics and the covered figures, and enforces the two frozen publication gates.';

create trigger uavi_constituent_variances_gates
  before insert on pipeline.uavi_constituent_variances
  for each row execute function pipeline.check_uavi_constituent_variance();

create constraint trigger uavi_calculations_level_check
  after insert on pipeline.uavi_calculations
  deferrable initially deferred
  for each row execute function pipeline.check_uavi_level();

create trigger uavi_constituent_variances_append_only
  before update or delete on pipeline.uavi_constituent_variances
  for each row execute function pipeline.allow_only_supersession();
create trigger uavi_calculations_append_only
  before update or delete on pipeline.uavi_calculations
  for each row execute function pipeline.allow_only_supersession();
create trigger uavi_option_strips_no_mutation
  before update or delete on pipeline.uavi_option_strips
  for each row execute function pipeline.forbid_mutation();
create trigger uavi_strip_components_no_mutation
  before update or delete on pipeline.uavi_strip_components
  for each row execute function pipeline.forbid_mutation();
create trigger uavi_constituent_calculations_no_mutation
  before update or delete on pipeline.uavi_constituent_calculations
  for each row execute function pipeline.forbid_mutation();
create trigger uavi_publication_checks_no_mutation
  before update or delete on pipeline.uavi_publication_checks
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.uavi_constituent_variances     enable row level security;
alter table pipeline.uavi_option_strips             enable row level security;
alter table pipeline.uavi_strip_components          enable row level security;
alter table pipeline.uavi_calculations              enable row level security;
alter table pipeline.uavi_constituent_calculations  enable row level security;
alter table pipeline.uavi_publication_checks        enable row level security;
