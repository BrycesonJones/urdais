-- UAVI: the options foundation -- venue register, volatility instruments, contracts, quotes, rates.
--
-- UAVI is the sibling of UGAI over the same parent universe, and the two differ in what they need
-- from the world. UGAI needs one close per constituent per day. UAVI needs an entire option
-- surface per constituent per day, from a market whose data is licensed contract by contract, and
-- then needs a risk-free rate for each expiration on it. This migration supplies the vocabulary
-- for that and deliberately supplies no data, because none is licensed.
--
-- Five decisions shape what follows.
--
--   1. The measurement basis is US-listed options, frozen by methodology 0.2.0-draft. That is a
--      narrowing from 0.1.0-draft's global venue register, and it buys one snapshot instant, one
--      trading calendar and one rate currency. It costs coverage, and coverage is published.
--
--   2. A volatility instrument is not a price representative. The parent picks a representative
--      security on equity-investability grounds and explicitly ignores options; the option market
--      may be on another line of the same issuer. So the mapping is its own effective-dated
--      determination with its own evidence -- never a column on the parent's selection, and never
--      a lookup buried in calculation code.
--
--   3. The receipt route is same-issuer or nothing. A depositary receipt mapped to a different
--      issuer would publish one company's volatility as another's, so the trigger refuses it
--      rather than a reviewer being expected to notice. The same trigger refuses an unsponsored
--      programme and a receipt with no fixed ratio.
--
--   4. Contract identity and quote observation are separated exactly as reference.listings and
--      pipeline.price_observations are. A contract is a thing with venue-specified terms; a quote
--      is an observation of it at an instant, under a licence, with provenance. Collapsing them
--      would make a term change indistinguishable from a quote change.
--
--   5. The rate is an input to the calculation, never a thing the calculation fetches. The curve
--      family is an unresolved launch parameter, so this stores a *resolved* continuously
--      compounded rate per maturity with the curve that produced it named on the row. The
--      mathematics receives a number and knows nothing about where it came from.
--
-- Nothing here is seeded with market data. The venue register is empty, there are no contracts,
-- no quotes and no rates, and that is the honest state: no OPRA or vendor agreement exists.

-- ============================================================= the methodology itself

insert into reference.methodologies (slug, name, document_path) values
  ('uavi', 'Urdais AI Volatility Index', 'docs/methodology/uavi.md')
on conflict (slug) do nothing;

-- 0.2.0-draft, the Phase 1 launch contract. 0.1.0-draft is deliberately NOT registered: it was
-- never approved, never published under, and its aggregation form -- a weighted root mean square
-- -- is not what this code computes. Registering it now against a document that no longer says
-- what it said would attach a content hash to text it never described, which is the one thing
-- the version table exists to prevent.
insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash)
select m.id, '0.2.0-draft', 'draft', 'docs/methodology/uavi.md',
       '216cfd98b35ddbf5ef2a980d6d610e57d327c5d871314f64a660054695d9c862'
  from reference.methodologies m where m.slug = 'uavi'
on conflict (methodology_id, version) do nothing;

-- ============================================================= the parameter set
--
-- Split into two groups, and the split is the point. The launch contract froze a set of values,
-- and those are approved rows with a named decision behind them. A second set remains genuinely
-- unresolved and stays draft, so that "is the USD curve family settled?" is a query rather than a
-- reading of prose. Nothing defaults, and no constant in the calculation layer may disagree with
-- a row here: src/lib/uavi/parameters.ts carries the same values and a test asserts the match.

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status,
   effective_from, approved_by, approved_on, rationale)
select mv.id, v.k, v.num, v.txt, 'approved', date '2026-09-17',
       'Urdais founder decision, UAVI Phase 1 launch contract', date '2026-09-17', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
  cross join (values
    ('aggregation_form', null::numeric, 'weighted_arithmetic_mean_of_constituent_volatility',
     'The headline is 100 x sum(v_i * sigma_i,30): the square root is taken per constituent, before weighting. Recorded as a parameter and not only as prose because the alternative form, 100 x sqrt(sum(v_i * sigma^2_i)), is what version 0.1.0-draft specified and is what an implementation drifts back toward. The value is the thing a test and a database trigger both check against.'),
    ('horizon_minutes', 43200, null,
     'N30. The constant-maturity horizon in calendar minutes: 30 x 24 x 60. Calendar time, not trading time, per the volatility-benchmark precedent.'),
    ('annualization_minutes', 525600, null,
     'N365. The annualization constant in calendar minutes: 365 x 24 x 60.'),
    ('near_term_min_dte', 10, null,
     'Lower bound of the Near Term window, in days to expiration, inclusive. Frozen at the precedent value: 0.1.0-draft marked it unresolved because non-US venues list sparser maturities, and the US-only venue scope removes that objection.'),
    ('near_term_max_dte', 30, null,
     'Upper bound of the Near Term window, inclusive. The pair must strictly bracket 30 days, so the Near Term is at or below it and the Next Term strictly above.'),
    ('next_term_max_dte', 120, null,
     'Upper bound of the Next Term window, inclusive. Variance is never extrapolated beyond it.'),
    ('min_otm_contracts_per_side', 3, null,
     'Minimum valid out-of-the-money contracts per wing per strip. A strip computed from one or two live wings is dominated by its truncation error and is not an estimate.'),
    ('zero_bid_run_length', 2, null,
     'Consecutive zero-bid out-of-the-money contracts that terminate a wing. Every strike further from K0 in that direction is then excluded, including any with a non-zero bid.'),
    ('snapshot_time_local', null, '15:45:00.000',
     'The official snapshot instant, local time. Every contributing quote is the NBBO at or before it, and every time to expiration is measured in minutes from it.'),
    ('snapshot_timezone', null, 'America/New_York',
     'The zone the snapshot instant is expressed in. A named zone and never a fixed UTC offset: the offset moves twice a year and a frozen one would shift the snapshot by an hour relative to the market for part of each year.'),
    ('min_covered_parent_weight', 0.80, null,
     'Publication gate. The covered set must represent at least 80 percent of parent base weight. Frozen, and not to be lowered so that a thin universe publishes.'),
    ('min_covered_issuer_count', 8, null,
     'Publication gate. At least 8 covered issuers, counted as issuers and not securities. Frozen for the same reason.'),
    ('concentration_publication_gate', null, 'none',
     'There is deliberately no concentration gate in V1. max(v_i) and the effective constituent count are computed, stored and published as diagnostics and cannot withhold a headline. 0.1.0-draft proposed both as gates; no evidence establishes a threshold for either, and a concentration limit on a renormalized parent inheritance would re-impose a cap the parent methodology declines to reapply after filtering.'),
    ('constituent_variance_carry', null, 'prohibited',
     'No same-day and no prior-date carry of a constituent variance, under any circumstance. A constituent without a valid variance at the official snapshot is uncovered and its parent weight moves to uncovered coverage. This is a deliberate modification of the constituent-volatility precedent, which permits a bounded pull-forward.'),
    ('option_venue_scope', null, 'us_listed',
     'Contracts are eligible only from US options venues. The scope is settled; the enumeration of venues within it is not, and lives in reference.options_venues, which is empty.')
  ) as v(k, num, txt, why)
 where mv.version = '0.2.0-draft';

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, text_value, status, rationale)
select mv.id, v.k, v.txt, 'draft', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
  cross join (values
    ('usd_rate_curve_family', 'UNRESOLVED',
     'The USD risk-free curve family, its interpolation method and bounds, its observation time relative to the 15:45 snapshot, and its compounding and day-count conventions. VALIDATE IN LIVE PIPELINE. The candidates differ in what they measure, in publication latency against a 15:45 instant, and in licensing; choosing one now on implementation convenience is the decision this methodology forbids. While this row is draft no production rate observation may be recorded.'),
    ('quote_freshness_tolerance', 'UNRESOLVED',
     'How old a last-NBBO-at-or-before-the-instant may be before its strip is unusable. Requires live-vendor validation. Until resolved, quote age is recorded and published as a diagnostic and no observation is withheld for staleness -- a threshold nobody has measured is not a rule.'),
    ('publication_deadline', 'UNRESOLVED',
     'The time by which an observation for date t must be released before it is Delayed. Without it the delayed lifecycle state has no threshold to be past and is unreachable.'),
    ('correction_window', 'UNRESOLVED',
     'The window within which an error is corrected by restatement rather than prospectively, and the materiality threshold for an exceptional historical restatement.')
  ) as v(k, txt, why)
 where mv.version = '0.2.0-draft';

-- ============================================================= the US options venue register
--
-- reference.venues already models a trading venue by MIC with its country, currency, timezone and
-- rights position, and an options exchange is one. What it does not carry is the option-specific
-- terms a calculation depends on: which expiration series the venue lists as standard, what the
-- exact expiration instant is, and whether Urdais has admitted the venue at all. Those go here,
-- one row per admitted venue, rather than into reference.venues, because they are meaningless for
-- an equity-only venue and a nullable block of option columns on every venue row would be worse.
--
-- The register is EMPTY and its emptiness is load-bearing: an unregistered venue is not
-- implicitly eligible, so with no rows no contract can qualify and no constituent can be covered.
-- That is the correct state. Urdais holds no options data agreement.

create table reference.options_venues (
  id                      uuid primary key default gen_random_uuid(),
  venue_id                uuid not null references reference.venues (id) on delete restrict,

  -- Which expiration series this venue lists as standard, and which it lists at all. Recorded as
  -- the venue's own enumeration rather than as a third-Friday assumption: the expiration
  -- selection rule prefers standard expirations and falls back to the nearest qualifying weekly,
  -- and both terms are venue-defined facts rather than a calendar convention code can assume.
  standard_series         text[] not null
                            constraint options_venues_standard_series_nonempty
                            check (cardinality(standard_series) >= 1),
  weekly_series_listed    boolean not null default false,

  -- The exact local time at which a contract on this venue expires or settles, and the zone it is
  -- expressed in. Time to expiration is computed in minutes from the snapshot instant to this,
  -- never from an integer day count, and never from an assumed common settlement hour.
  expiration_time_local   time not null,
  expiration_timezone     text not null
                            constraint options_venues_tz_nonempty check (btrim(expiration_timezone) <> ''),
  exercise_style          text not null
                            constraint options_venues_exercise_allowed
                            check (exercise_style in ('american', 'european')),
  settlement_style        text not null
                            constraint options_venues_settlement_allowed
                            check (settlement_style in ('physical', 'cash')),

  -- Whether Urdais has admitted the venue, and on what evidence. 'registered' is the only state
  -- from which a contract may contribute; everything else is a finding.
  admission_state         text not null default 'under_review'
                            constraint options_venues_admission_allowed
                            check (admission_state in ('under_review', 'registered', 'refused', 'withdrawn')),
  admission_evidence_url  text,
  admission_basis         text not null
                            constraint options_venues_basis_nonempty check (btrim(admission_basis) <> ''),

  effective_from          date not null,
  effective_to            date,
  created_at              timestamptz not null default now(),

  unique (venue_id, effective_from),
  constraint options_venues_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  -- A registered venue names the document that admitted it. An admission without evidence is an
  -- assumption wearing a state name.
  constraint options_venues_registered_is_evidenced
    check (admission_state <> 'registered' or btrim(coalesce(admission_evidence_url, '')) <> '')
);

comment on table reference.options_venues is
  'The US options venue register. Empty, and the emptiness is a rule rather than a gap: an unregistered venue is not implicitly eligible, so while this table holds no rows no option contract can qualify and every parent member is uncovered. Option-specific terms live here rather than on reference.venues because they are meaningless for an equity-only venue.';
comment on column reference.options_venues.expiration_time_local is
  'The venue-specified expiration or settlement instant, local. Time to expiration is minutes from the snapshot instant to this, never an integer day count and never an assumed common settlement hour across venues or series.';
comment on column reference.options_venues.standard_series is
  'The venue''s own enumeration of its standard expiration series. Deliberately not a third-Friday rule in code: the convention holds on some venues and not others, and encoding it globally misclassifies expirations on venues that key expiration elsewhere.';

create index options_venues_admitted_idx
  on reference.options_venues (admission_state) where admission_state = 'registered';

-- ============================================================= volatility instruments
--
-- The mapping from a parent issuer to the one security UAVI measures its volatility on.
--
-- The waterfall is ordered and the order is the whole point: the parent representative security
-- first, a sponsored same-issuer US-listed receipt second, uncovered otherwise -- and where both
-- qualify the representative wins unconditionally. `preference_rank` makes the order data rather
-- than code, so a future issuer with both lines has its ordering recorded rather than recomputed,
-- and so the rule "representative beats receipt" cannot be reversed by a liquidity comparison
-- somewhere downstream. If liquidity could reverse it, a constituent's measured volatility would
-- move because its option markets moved relative to each other rather than because its volatility
-- did, and the series would carry that as signal.

create table pipeline.uavi_volatility_instruments (
  id                        uuid primary key default gen_random_uuid(),
  issuer_id                 uuid not null references reference.issuers (id) on delete restrict,

  -- The security whose options UAVI reads, and the US listing that establishes it as US-listed.
  -- The listing is recorded for identity and evidence; the option contracts carry their own
  -- options venue, which is a different venue from the equity line's.
  volatility_security_id    uuid not null references reference.securities (id) on delete restrict,
  volatility_listing_id     uuid not null references reference.listings (id) on delete restrict,

  -- The parent's representative security at the time of determination, recorded so that a later
  -- representative substitution is visible as a reason to re-derive rather than as a silent drift.
  representative_security_id uuid references reference.securities (id) on delete restrict,
  selection_id              uuid references pipeline.representative_security_selections (id) on delete restrict,

  mapping_type              text not null
                              constraint uavi_vi_type_allowed
                              check (mapping_type in ('representative', 'adr')),
  -- 1 is the representative route, 2 the receipt route. Stored rather than derived from
  -- mapping_type so that the ordering is inspectable data, and constrained to agree with it.
  preference_rank           smallint not null
                              constraint uavi_vi_rank_allowed check (preference_rank in (1, 2)),

  -- Receipt facts. Required for the receipt route and forbidden otherwise, so a representative
  -- mapping cannot quietly acquire a ratio that nothing would ever apply.
  is_sponsored              boolean,
  receipt_ratio_numerator   integer
                              constraint uavi_vi_ratio_num_positive
                              check (receipt_ratio_numerator is null or receipt_ratio_numerator > 0),
  receipt_ratio_denominator integer
                              constraint uavi_vi_ratio_den_positive
                              check (receipt_ratio_denominator is null or receipt_ratio_denominator > 0),

  mapping_state             text not null default 'candidate'
                              constraint uavi_vi_state_allowed
                              check (mapping_state in ('candidate', 'verified', 'withdrawn')),
  -- Why this security, from what. Never empty: a mapping without a basis is an assertion.
  basis                     text not null
                              constraint uavi_vi_basis_nonempty check (btrim(basis) <> ''),
  evidence_url              text,
  methodology_version_id    uuid not null references reference.methodology_versions (id) on delete restrict,

  effective_from            date not null,
  effective_to              date,

  superseded_by_id          uuid references pipeline.uavi_volatility_instruments (id) on delete restrict
                              deferrable initially deferred,
  superseded_at             timestamptz,
  supersession_reason       text,
  created_at                timestamptz not null default now(),

  constraint uavi_vi_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  constraint uavi_vi_rank_matches_type
    check ((mapping_type = 'representative') = (preference_rank = 1)),
  -- The receipt route carries sponsorship and a complete fixed ratio; the representative route
  -- carries neither. A ratio on a representative mapping would be a number nothing consumes.
  constraint uavi_vi_receipt_facts_match_type
    check (
      (mapping_type = 'adr'
        and is_sponsored is not null
        and receipt_ratio_numerator is not null and receipt_ratio_denominator is not null)
      or (mapping_type = 'representative'
        and is_sponsored is null
        and receipt_ratio_numerator is null and receipt_ratio_denominator is null)
    ),
  constraint uavi_vi_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.uavi_volatility_instruments is
  'One issuer''s volatility instrument: the security whose US-listed options UAVI measures. Separate from the parent''s representative-security selection because the parent picks on equity-investability grounds and explicitly ignores options, so the two can legitimately differ. preference_rank stores the waterfall order as data, which is what stops "representative beats receipt" being reversible by a liquidity comparison downstream.';
comment on column pipeline.uavi_volatility_instruments.mapping_state is
  'candidate: the mapping is recorded and its evidence is incomplete. verified: identity, same-issuer, US listing and, for a receipt, sponsorship and a fixed ratio are all established. Verification is about the mapping, never about whether qualifying options exist today -- that is a per-session test against option data, because option classes come and go and a date-dependent fact cannot be frozen in an effective-dated row.';

-- One current mapping per issuer per route. An issuer may legitimately hold both a representative
-- and a receipt mapping at once, which is the case the waterfall exists to resolve; what it may
-- not hold is two of the same route.
create unique index uavi_vi_one_current_per_route
  on pipeline.uavi_volatility_instruments (issuer_id, mapping_type)
  where superseded_by_id is null and effective_to is null;
create index uavi_vi_issuer_idx on pipeline.uavi_volatility_instruments (issuer_id, preference_rank);

create or replace function pipeline.check_uavi_volatility_instrument()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  sec record;
  lst record;
  ven record;
  rep record;
begin
  select issuer_id, is_depositary_receipt, security_type,
         receipt_ratio_numerator, receipt_ratio_denominator
    into sec from reference.securities where id = new.volatility_security_id;

  -- The condition that makes a receipt mapping safe at all. A receipt over a different issuer's
  -- shares would publish one company's volatility under another company's weight, and no review
  -- step reliably catches that, so it is refused here.
  if sec.issuer_id <> new.issuer_id then
    raise exception 'the volatility instrument belongs to a different issuer: one issuer is one membership and one volatility'
      using errcode = 'check_violation';
  end if;

  if new.mapping_type = 'adr' then
    if not sec.is_depositary_receipt then
      raise exception 'an adr mapping must select a depositary receipt; this security is %', sec.security_type
        using errcode = 'check_violation';
    end if;
    if new.is_sponsored is not true then
      raise exception 'an adr mapping requires a sponsored depositary programme'
        using errcode = 'check_violation';
    end if;
    -- The ratio recorded on the mapping must be the ratio the security master holds. Two places
    -- for one number is two chances to disagree, so they are checked rather than trusted.
    if sec.receipt_ratio_numerator is distinct from new.receipt_ratio_numerator
       or sec.receipt_ratio_denominator is distinct from new.receipt_ratio_denominator then
      raise exception 'the recorded receipt ratio %:% does not match the security master''s %:%',
        new.receipt_ratio_numerator, new.receipt_ratio_denominator,
        sec.receipt_ratio_numerator, sec.receipt_ratio_denominator
        using errcode = 'check_violation';
    end if;
  elsif sec.is_depositary_receipt then
    raise exception 'a representative mapping must not select a depositary receipt; use mapping_type adr'
      using errcode = 'check_violation';
  end if;

  -- The listing must be a listing of that security, and it must be in the United States. The
  -- measurement basis is US-listed options, so a mapping to a line that does not list in the US
  -- cannot produce a qualifying contract and must not be representable as though it could.
  select security_id, venue_id, listing_status into lst from reference.listings where id = new.volatility_listing_id;
  if lst.security_id is distinct from new.volatility_security_id then
    raise exception 'the listing does not belong to the selected volatility security'
      using errcode = 'check_violation';
  end if;
  select country_code into ven from reference.venues where id = lst.venue_id;
  if ven.country_code <> 'US' then
    raise exception 'the volatility instrument must be US-listed; this listing is on a % venue', ven.country_code
      using errcode = 'check_violation';
  end if;

  -- A representative mapping must actually name the parent's representative. Otherwise "route 1"
  -- would be a label rather than a claim, and an arbitrary security could enter through it.
  if new.mapping_type = 'representative' then
    if new.representative_security_id is distinct from new.volatility_security_id then
      raise exception 'a representative mapping must select the parent''s representative security itself'
        using errcode = 'check_violation';
    end if;
    if new.selection_id is not null then
      select selected_security_id into rep
        from pipeline.representative_security_selections where id = new.selection_id;
      if rep.selected_security_id is distinct from new.volatility_security_id then
        raise exception 'the cited representative-security selection resolved to a different security'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A verified mapping rests on an active listing. A delisted or pending line is evidence of
  -- nothing about a current option market.
  if new.mapping_state = 'verified' and lst.listing_status <> 'active' then
    raise exception 'a verified mapping requires an active listing; this one is %', lst.listing_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function pipeline.check_uavi_volatility_instrument() is
  'Trigger: the volatility instrument must belong to the same issuer, be US-listed, and match its route -- a receipt route requires a sponsored programme and a ratio identical to the security master''s, a representative route requires the parent''s own representative security and refuses a receipt. The same-issuer check is the one that matters most: a receipt over another issuer would publish one company''s volatility under another''s weight.';

create trigger uavi_volatility_instruments_gates
  before insert on pipeline.uavi_volatility_instruments
  for each row execute function pipeline.check_uavi_volatility_instrument();
create trigger uavi_volatility_instruments_append_only
  before update or delete on pipeline.uavi_volatility_instruments
  for each row execute function pipeline.allow_only_supersession();

-- ============================================================= option contracts
--
-- Contract identity and venue-specified terms. The analogue of reference.listings: a thing that
-- exists with terms, distinct from any observation of its price.
--
-- The multiplier and deliverable come from reference data and are never inferred from a symbol.
-- An adjusted series is representable and is excluded from calculation rather than being absent
-- from the database -- the cost of excluding adjusted contracts is a published coverage figure,
-- and a coverage cost that cannot be counted cannot be published.

create table reference.option_contracts (
  id                       uuid primary key default gen_random_uuid(),

  underlying_security_id   uuid not null references reference.securities (id) on delete restrict,
  options_venue_id         uuid not null references reference.options_venues (id) on delete restrict,

  -- The vendor's or venue's contract identifier, e.g. an OCC-style symbol. Urdais's key is the
  -- uuid; this is what the source called it, retained for reconciliation.
  contract_symbol          text not null
                             constraint option_contracts_symbol_nonempty check (btrim(contract_symbol) <> ''),
  option_right             text not null
                             constraint option_contracts_right_allowed check (option_right in ('call', 'put')),
  strike                   numeric not null
                             -- NaN compares greater than every numeric and equals itself, so a
                             -- bare > 0 admits it; Infinity passes it too. Both are spelled out.
                             constraint option_contracts_strike_positive
                             check (strike > 0 and strike <> 'NaN'::numeric and strike <> 'Infinity'::numeric),
  strike_currency          char(3) not null
                             constraint option_contracts_currency_format check (strike_currency ~ '^[A-Z]{3}$'),

  expiration_date          date not null,
  -- The exact instant, resolved from the venue's expiration time and zone. Stored because minutes
  -- to expiration is computed against it and a day count would be a different, wrong number.
  expiration_timestamp     timestamptz not null,

  exercise_style           text not null
                             constraint option_contracts_exercise_allowed
                             check (exercise_style in ('american', 'european')),
  settlement_style         text not null
                             constraint option_contracts_settlement_allowed
                             check (settlement_style in ('physical', 'cash')),
  contract_multiplier      numeric not null
                             constraint option_contracts_multiplier_positive
                             check (contract_multiplier > 0 and contract_multiplier <> 'NaN'::numeric),
  deliverable_note         text,

  -- Standard or adjusted, and never a default. An adjusted series after a corporate action may
  -- deliver a non-standard quantity, cash, or a second security, and treating one as standard is
  -- a silent error in the strike dimension that no range check catches.
  series_state             text not null
                             constraint option_contracts_series_allowed
                             check (series_state in ('standard', 'adjusted')),
  adjustment_event_note    text,
  corporate_action_id      uuid references pipeline.corporate_actions (id) on delete restrict,

  -- Which expiration series the venue lists this under, checked against the venue's enumeration.
  expiration_series        text not null
                             constraint option_contracts_series_label_nonempty
                             check (btrim(expiration_series) <> ''),

  source_interface_id      uuid references reference.source_interfaces (id) on delete restrict,
  permission_grant_id      uuid references reference.permission_grants (id) on delete restrict,

  effective_from           date not null,
  effective_to             date,
  created_at               timestamptz not null default now(),

  unique (options_venue_id, contract_symbol, effective_from),
  constraint option_contracts_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  constraint option_contracts_adjusted_is_explained
    check (series_state <> 'adjusted'
           or (btrim(coalesce(adjustment_event_note, '')) <> '' or corporate_action_id is not null))
);

comment on table reference.option_contracts is
  'Option contract identity and venue-specified terms -- the analogue of reference.listings for options. The multiplier and deliverable come from reference data and are never inferred from a symbol. An adjusted series is representable and excluded from calculation rather than absent from the database, because the coverage cost of excluding adjusted contracts is a published figure and a cost that cannot be counted cannot be published.';
comment on column reference.option_contracts.expiration_timestamp is
  'The exact expiration instant, resolved from the venue''s expiration time and zone. Minutes to expiration is computed against this. An integer day count is a different and wrong number, and the methodology says so explicitly.';
comment on column reference.option_contracts.series_state is
  'standard or adjusted, with no default. An adjusted series may deliver a non-standard quantity, cash, or a second security after a corporate action; admitting one as standard is a silent error in the strike dimension that no range check catches.';

create index option_contracts_underlying_idx
  on reference.option_contracts (underlying_security_id, expiration_date, option_right, strike);
create index option_contracts_expiry_idx on reference.option_contracts (expiration_timestamp);

create or replace function pipeline.check_option_contract()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  ovenue record;
begin
  select ov.admission_state, ov.standard_series, ov.weekly_series_listed,
         ov.exercise_style, ov.settlement_style, v.country_code
    into ovenue
    from reference.options_venues ov
    join reference.venues v on v.id = ov.venue_id
   where ov.id = new.options_venue_id;

  if ovenue.country_code <> 'US' then
    raise exception 'methodology 0.2.0-draft admits US options venues only; this venue is in %', ovenue.country_code
      using errcode = 'check_violation';
  end if;
  -- Terms come from the venue specification, so a contract that disagrees with its own venue's
  -- specification is a reference-data conflict rather than an exotic contract.
  if new.exercise_style <> ovenue.exercise_style then
    raise exception 'the contract is % but its venue specifies % exercise', new.exercise_style, ovenue.exercise_style
      using errcode = 'check_violation';
  end if;
  if new.settlement_style <> ovenue.settlement_style then
    raise exception 'the contract settles % but its venue specifies %', new.settlement_style, ovenue.settlement_style
      using errcode = 'check_violation';
  end if;
  if not (new.expiration_series = any (ovenue.standard_series)) and not ovenue.weekly_series_listed then
    raise exception 'the venue lists no series %, and lists no weeklies', new.expiration_series
      using errcode = 'check_violation';
  end if;

  -- The expiration instant must fall on the expiration date in the venue's own zone. This is the
  -- guard against a timestamp built with a hard-coded offset: under daylight saving an instant
  -- constructed as "date + 16:00 UTC-5" lands on the wrong side of midnight for half the year.
  if (new.expiration_timestamp at time zone (select expiration_timezone from reference.options_venues
                                              where id = new.options_venue_id))::date
     <> new.expiration_date then
    raise exception 'the expiration instant % does not fall on % in the venue''s own zone',
      new.expiration_timestamp, new.expiration_date using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function pipeline.check_option_contract() is
  'Trigger: the contract''s venue must be US and registered-shaped, its exercise and settlement styles must match the venue specification rather than contradict it, its series must be one the venue lists, and its expiration instant must fall on its expiration date in the venue''s own zone -- which is the guard against a timestamp built from a hard-coded UTC offset that lands a day early for half the year.';

create trigger option_contracts_gates
  before insert on reference.option_contracts
  for each row execute function pipeline.check_option_contract();
create trigger option_contracts_no_mutation
  before update or delete on reference.option_contracts
  for each row execute function pipeline.forbid_mutation();

-- ============================================================= option quote observations
--
-- One NBBO per contract per session, at or before the frozen snapshot instant.
--
-- bid and ask are nullable and their absence is a fact rather than a gap to be filled: a missing
-- side is precisely what makes a quote invalid, and a row that could not represent it would force
-- the collector to decide what "no bid" means. The validity predicate is NOT stored as a boolean,
-- because two implementations of it -- one here, one in the calculator -- is one too many; the
-- calculator applies it and the constraint below only refuses what is impossible in any reading.
--
-- Vendor implied volatility and Greeks are recorded as diagnostics and are never inputs. The
-- methodology is explicit that a vendor-published 30-day implied volatility is never the
-- canonical input, so they live in a jsonb bag that no calculation path reads.

create table pipeline.option_quote_observations (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references reference.option_contracts (id) on delete restrict,

  session_date          date not null,
  -- The instant the quote was current as of. Compared against the session's official snapshot
  -- instant by trigger: a quote after it is look-ahead within the session and is refused.
  quote_timestamp       timestamptz not null,
  -- The official snapshot instant this row was collected for, resolved from the local time and
  -- named zone for this session date. Stored rather than recomputed so that a historical row
  -- carries the instant it actually used, including across a daylight-saving change.
  snapshot_timestamp    timestamptz not null,
  -- true where the vendor supplied a packet stamped at the instant; false where this is the most
  -- recent NBBO at or before it, reconstructed from a tape. The two are not equivalent and the
  -- freshness question only arises for the second.
  is_snapshot_packet    boolean not null,

  bid                   numeric
                          constraint option_quote_bid_finite
                          check (bid is null or (bid >= 0 and bid <> 'NaN'::numeric and bid <> 'Infinity'::numeric)),
  ask                   numeric
                          constraint option_quote_ask_finite
                          check (ask is null or (ask >= 0 and ask <> 'NaN'::numeric and ask <> 'Infinity'::numeric)),

  -- Diagnostics only. Nothing in the official calculation reads this column, and the methodology
  -- requires that a vendor implied volatility never be the canonical input.
  diagnostics           jsonb,

  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid not null references reference.permission_grants (id) on delete restrict,
  attribution           text,

  observation_purpose   text not null default 'research'
                          constraint option_quote_purpose_allowed
                          check (observation_purpose in ('research', 'production')),
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.option_quote_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint option_quote_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.option_quote_observations is
  'One NBBO per contract per session, at or before the frozen 15:45 New York instant. bid and ask are nullable because a missing side is exactly what makes a quote invalid, and a row unable to represent one would force the collector to decide what "no bid" means. Validity is deliberately not stored as a boolean: the calculator owns that predicate, and two implementations of it is one too many.';
comment on column pipeline.option_quote_observations.is_snapshot_packet is
  'true where the vendor supplied a packet stamped at the official instant; false where this is the most recent NBBO at or before it, reconstructed from a tape. Not equivalent, and the freshness question arises only for the second.';
comment on column pipeline.option_quote_observations.diagnostics is
  'Vendor implied volatility, Greeks, volume, open interest and quote sizes. Retained for cross-checks and never read by any calculation path: the methodology requires that a vendor-published implied volatility is never the canonical input.';

create unique index option_quote_observations_current_idx
  on pipeline.option_quote_observations (contract_id, session_date, observation_purpose)
  where superseded_by_id is null;
create index option_quote_observations_session_idx
  on pipeline.option_quote_observations (session_date, contract_id);

create or replace function pipeline.check_option_quote_observation()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  ctr record;
  grt record;
begin
  -- Look-ahead within the session. A quote current after the official instant did not exist at
  -- the instant UAVI claims to measure, and admitting it would let the index see the future by
  -- however many minutes the vendor's clock happened to run ahead.
  if new.quote_timestamp > new.snapshot_timestamp then
    raise exception 'the quote is timestamped % which is after the official snapshot instant %',
      new.quote_timestamp, new.snapshot_timestamp using errcode = 'check_violation';
  end if;
  -- A snapshot packet is stamped AT the instant by definition; a tape reconstruction is at or
  -- before it. A packet stamped earlier is a reconstruction that has been mislabelled.
  if new.is_snapshot_packet and new.quote_timestamp <> new.snapshot_timestamp then
    raise exception 'a snapshot packet must be stamped at the official instant, not at %', new.quote_timestamp
      using errcode = 'check_violation';
  end if;

  select expiration_timestamp, expiration_date into ctr
    from reference.option_contracts where id = new.contract_id;
  -- A quote on an expired contract. The strip selection would never choose it, and a row that
  -- exists is a row something can select, so it is refused at the boundary instead.
  if ctr.expiration_timestamp <= new.snapshot_timestamp then
    raise exception 'the contract expired at %, at or before this snapshot instant %',
      ctr.expiration_timestamp, new.snapshot_timestamp using errcode = 'check_violation';
  end if;

  -- Rights, checked here rather than in the collector, exactly as price observations are. Option
  -- quote data is licensed contract by contract and storing it is itself an exercise of a grant.
  select g.source_interface_id, g.covers_collection, g.covers_storage, g.covers_index_calculation,
         g.attribution_required, g.attribution_text
    into grt from reference.permission_grants g where g.id = new.permission_grant_id;
  if grt.source_interface_id <> new.source_interface_id then
    raise exception 'the permission grant does not cover the interface this quote was collected from'
      using errcode = 'check_violation';
  end if;
  if not grt.covers_collection or not grt.covers_storage then
    raise exception 'the permission grant does not cover collection and storage of option quotes'
      using errcode = 'check_violation';
  end if;
  if new.observation_purpose = 'production' and not grt.covers_index_calculation then
    raise exception 'a production option quote requires a grant covering index calculation'
      using errcode = 'check_violation';
  end if;
  if grt.attribution_required and btrim(coalesce(new.attribution, '')) = '' then
    raise exception 'the licence makes attribution a condition of the grant and none is recorded'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function pipeline.check_option_quote_observation() is
  'Trigger: refuses a quote timestamped after the official snapshot instant (look-ahead within the session), a mislabelled snapshot packet, a quote on an already-expired contract, and any quote whose permission grant does not cover the interface, collection, storage, index calculation for production rows, or a required attribution.';

create trigger option_quote_observations_gates
  before insert on pipeline.option_quote_observations
  for each row execute function pipeline.check_option_quote_observation();
create trigger option_quote_observations_append_only
  before update or delete on pipeline.option_quote_observations
  for each row execute function pipeline.allow_only_supersession();

-- ============================================================= risk-free rates
--
-- A resolved, continuously compounded USD rate for one maturity date.
--
-- The column that earns its place is `curve_family`, and the reason is the same one fx_observations
-- records a derivation: a stored 0.0412 with no record of which curve produced it, at what
-- observation time, on what compounding basis, cannot be audited and cannot be reproduced. The
-- curve family is an unresolved launch parameter, so the trigger refuses a production rate while
-- it stays draft -- the parameter's unresolved status reaches into the data rather than sitting in
-- a document nobody queries.
--
-- The calculation layer receives `continuous_rate` and nothing else. It does not know what a curve
-- is, does not interpolate, and does not fetch.

create table pipeline.risk_free_rate_observations (
  id                    uuid primary key default gen_random_uuid(),

  currency              char(3) not null
                          constraint rfr_currency_format check (currency ~ '^[A-Z]{3}$'),
  -- The date the rate is an input for, and the maturity it discounts to. Both, because one curve
  -- observation serves many maturities and one maturity is served on many dates.
  observation_date      date not null,
  maturity_date         date not null,
  observation_timestamp timestamptz not null,

  -- Continuously compounded, as the variance formula requires. Converted once at ingestion from
  -- whatever basis the curve publishes, with that basis recorded, so no downstream consumer has
  -- to know or guess which convention it received.
  continuous_rate       numeric not null
                          -- Negative rates are used as observed and never floored: flooring would
                          -- bias every implied forward in the affected period.
                          constraint rfr_rate_finite
                          check (continuous_rate <> 'NaN'::numeric
                                 and continuous_rate <> 'Infinity'::numeric
                                 and continuous_rate <> '-Infinity'::numeric
                                 and continuous_rate > -1 and continuous_rate < 1),

  curve_family          text not null
                          constraint rfr_curve_nonempty check (btrim(curve_family) <> ''),
  source_basis          text not null
                          constraint rfr_basis_nonempty check (btrim(source_basis) <> ''),
  interpolation_method  text not null
                          constraint rfr_interp_nonempty check (btrim(interpolation_method) <> ''),
  -- Whether the maturity sat inside the published curve's tenor range. An extrapolated rate is
  -- representable and flagged rather than silently indistinguishable from an interpolated one.
  is_extrapolated       boolean not null default false,

  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid references reference.permission_grants (id) on delete restrict,
  attribution           text,

  observation_purpose   text not null default 'research'
                          constraint rfr_purpose_allowed
                          check (observation_purpose in ('research', 'production')),
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.risk_free_rate_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint rfr_maturity_after_observation
    check (maturity_date > observation_date),
  constraint rfr_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.risk_free_rate_observations is
  'A resolved, continuously compounded rate for one maturity date. Continuously compounded at rest because that is what the variance formula consumes, converted once at ingestion with the source basis recorded, so no downstream consumer has to guess which convention it received. The calculation layer receives continuous_rate and nothing else: it holds no curve, no interpolation and no network access.';
comment on column pipeline.risk_free_rate_observations.curve_family is
  'Which published curve produced this rate. Recorded for the reason fx_observations records a derivation: a stored 0.0412 with no record of its curve, observation time and compounding basis cannot be audited or reproduced.';
comment on column pipeline.risk_free_rate_observations.continuous_rate is
  'Negative rates are stored as observed and never floored. Flooring would bias every implied forward computed in the affected period, which is a silent error in the forward and therefore in K0 and the wing split.';

create unique index rfr_current_idx
  on pipeline.risk_free_rate_observations (currency, observation_date, maturity_date, observation_purpose)
  where superseded_by_id is null;
create index rfr_maturity_idx on pipeline.risk_free_rate_observations (observation_date, maturity_date);

create or replace function pipeline.check_risk_free_rate_observation()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  param record;
begin
  -- The unresolved parameter, reaching into the data. UAVI V1 prices US-listed contracts in USD
  -- and the methodology prohibits applying one currency's curve to another's options; a non-USD
  -- rate has no consumer and its presence would suggest otherwise.
  if new.observation_purpose = 'production' then
    if new.currency <> 'USD' then
      raise exception 'UAVI V1 consumes USD rates only; this observation is in %', new.currency
        using errcode = 'check_violation';
    end if;
    select p.status into param
      from reference.methodology_parameters p
      join reference.methodology_versions mv on mv.id = p.methodology_version_id
      join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
     where p.parameter_key = 'usd_rate_curve_family'
     order by case p.status when 'approved' then 0 else 1 end
     limit 1;
    if param.status is distinct from 'approved' then
      raise exception 'the USD rate curve family is an unresolved launch parameter (%); no production rate may rest on it',
        coalesce(param.status, 'absent') using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_risk_free_rate_observation() is
  'Trigger: a production rate must be USD and must rest on an approved usd_rate_curve_family parameter. The parameter is unresolved by design, so this refuses every production rate today -- which is the unresolved status reaching into the data rather than sitting in a document nobody queries.';

create trigger risk_free_rate_observations_gates
  before insert on pipeline.risk_free_rate_observations
  for each row execute function pipeline.check_risk_free_rate_observation();
create trigger risk_free_rate_observations_append_only
  before update or delete on pipeline.risk_free_rate_observations
  for each row execute function pipeline.allow_only_supersession();

alter table reference.options_venues                  enable row level security;
alter table reference.option_contracts                enable row level security;
alter table pipeline.uavi_volatility_instruments      enable row level security;
alter table pipeline.option_quote_observations        enable row level security;
alter table pipeline.risk_free_rate_observations      enable row level security;
