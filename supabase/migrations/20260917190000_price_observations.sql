-- Equity end-of-day closes: the canonical observation, and the gate it has to pass.
--
-- This is the first UGAI slice that touches market data rather than eligibility, and the
-- failure modes are different in kind. An eligibility mistake is visible in prose. A price
-- mistake is silent: a hundredfold unit error, a price attached to the wrong line of a
-- dual-listed issuer, or an adjusted close quietly standing in for an official one all look
-- exactly like a correct row. So most of what follows is refusal rather than storage.
--
-- Four decisions worth stating.
--
--   1. The stored price is the RAW OFFICIAL CLOSE as the venue published it. Not split-adjusted,
--      not dividend-adjusted, not total-return, not a consumer "adjusted close", not rescaled
--      into major units. Corporate actions arrive in a later slice and will adjust at read time
--      against these rows; a row that has already been adjusted cannot be un-adjusted.
--
--   2. The observation carries listing_id and nothing redundant. A listing already determines
--      its security, its venue, its price currency and its price unit, and copying those onto
--      the observation would create four ways for one row to contradict itself. They are
--      validated against the listing on insert instead, which is the only moment the
--      contradiction could be introduced.
--
--   3. Absence is recorded, never invented. A market holiday, a suspension with no official
--      close, and a source that could not be reached are three different facts, and each gets a
--      row with no price rather than a carried-forward or interpolated one. Missing-data policy
--      belongs to the UGAI calculation, which cannot apply a policy to a gap it cannot see.
--
--   4. Rights are checked here, not in the collector. `reference.permission_grants` already
--      models the axes and already carries covered_venues; a price row must name the grant it
--      was collected under, and the trigger refuses a grant that does not cover the axis, the
--      venue, or -- for a production observation -- an interface that has not been approved.

-- ------------------------------------------------------------------ attribution as a condition
--
-- Some licences make attribution a condition precedent rather than a courtesy. Taiwan's Open
-- Government Data License is explicit that failure to attribute voids the grant "ab initio",
-- which means an unattributed observation was never lawfully collected. That is a different
-- thing from a permissive grant with a credit line, and the registry could not previously say so.
alter table reference.permission_grants
  add column attribution_required boolean not null default false,
  add column attribution_text     text;

comment on column reference.permission_grants.attribution_required is
  'True where the licence makes attribution a condition of the grant rather than a courtesy. Where true, a derived observation that carries no attribution was not lawfully collected, and pipeline.check_price_observation() refuses it.';
comment on column reference.permission_grants.attribution_text is
  'The required credit, verbatim as the licensor specifies it. Never paraphrased: a required citation that has been improved is no longer the required citation.';

alter table reference.permission_grants
  add constraint permission_grants_attribution_is_stated
    check (not attribution_required or btrim(coalesce(attribution_text, '')) <> '');

-- --------------------------------------------------------------------- the observation

create table pipeline.price_observations (
  id                    uuid primary key default gen_random_uuid(),

  -- The listing is the identity. Ticker alone is never an identity: it is reassigned, it repeats
  -- across venues, and a dual-listed issuer has one ticker per line.
  listing_id            uuid not null references reference.listings (id) on delete restrict,
  trading_date          date not null,

  -- What the session was. 'traded' is the only status that carries a price.
  session_status        text not null
                          constraint price_observations_session_allowed
                          check (session_status in (
                            'traded',
                            'exchange_holiday',
                            'no_official_close',
                            'source_unavailable'
                          )),

  -- The official close exactly as published. numeric, not float: a binary float cannot hold
  -- 2380.00 or 0.0001 exactly, and a price that does not round-trip is not the published price.
  -- `> 0` alone is not enough. In Postgres a numeric NaN compares greater than every other
  -- value and is equal to itself, so `NaN > 0` is true and `NaN <> NaN` is false -- a naive
  -- positivity guard admits it and a naive self-inequality test never fires. The explicit
  -- comparison against 'NaN' is the one that works.
  close_price           numeric
                          constraint price_observations_price_positive
                          check (close_price is null
                                 or (close_price > 0 and close_price <> 'NaN'::numeric)),
  -- Validated against the listing on insert. Stored so the row is readable on its own and so a
  -- later change to reference data cannot silently restate what was observed.
  price_currency        char(3)
                          constraint price_observations_currency_format
                          check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  price_unit            text
                          constraint price_observations_unit_allowed
                          check (price_unit is null or price_unit in ('major', 'minor')),

  -- Provenance.
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid not null references reference.permission_grants (id) on delete restrict,
  source_retrieval_id   uuid references pipeline.source_retrievals (id) on delete restrict,
  -- What the source itself said the data was as of, where it says. Distinct from when Urdais read it.
  source_reported_at    timestamptz,
  retrieved_at          timestamptz not null,
  -- The source record as published, kept so a parse can be re-checked without a re-fetch. It is
  -- evidence, never an input: nothing reads a price back out of this column.
  source_payload        jsonb,
  -- The licence's required credit, rendered for this observation. Not optional where the grant
  -- makes it a condition.
  attribution           text,

  -- Research and production are different acts under the rights model, exactly as they are for
  -- pipeline.source_retrievals, and only production requires an approved interface.
  observation_purpose   text not null default 'research'
                          constraint price_observations_purpose_allowed
                          check (observation_purpose in ('research', 'production')),

  observation_kind      text not null default 'original'
                          constraint price_observations_kind_allowed
                          check (observation_kind in ('original', 'correction')),

  -- Collector-supplied deterministic key. The identity of an observation is what it describes --
  -- listing, date, source -- never when the script happened to run.
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.price_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  -- A price exists if and only if the session traded. This is the constraint that makes a
  -- fabricated holiday close unrepresentable rather than merely discouraged.
  constraint price_observations_price_iff_traded
    check ((session_status = 'traded') = (close_price is not null)),
  -- And a price carries its unit and currency, while a non-session carries neither.
  constraint price_observations_priced_row_is_denominated
    check ((close_price is null)
           or (price_currency is not null and price_unit is not null)),
  constraint price_observations_unpriced_row_is_bare
    check (close_price is not null
           or (price_currency is null and price_unit is null)),
  -- A correction says what it corrects.
  constraint price_observations_correction_is_explained
    check (observation_kind <> 'correction' or supersession_reason is not null
           or superseded_by_id is not null),
  constraint price_observations_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.price_observations is
  'One official end-of-day close for one listing on one trading date, exactly as the venue published it. Raw and unadjusted: corporate actions adjust at read time in a later slice, and a row that arrived pre-adjusted could never be recovered. A non-trading session is recorded as a row with no price, because the calculation cannot apply a missing-data policy to a gap it cannot see.';
comment on column pipeline.price_observations.listing_id is
  'The identity of the observation. A ticker is a label, not an identity: it is reassigned over time and repeats across venues, so resolution runs issuer to security to listing before a price is accepted.';
comment on column pipeline.price_observations.close_price is
  'The raw official close as published. Never split-adjusted, dividend-adjusted, total-return, or rescaled between major and minor units.';
comment on column pipeline.price_observations.price_unit is
  'major or minor, copied from the listing and validated against it. 100 GBX stays 100 with unit minor; it is not silently stored as GBP 1.00. The minor-unit case is the one that produces a hundredfold error nobody notices.';
comment on column pipeline.price_observations.source_payload is
  'The source record as published, retained so a parse can be re-checked without re-fetching. Evidence only -- no code reads a price back out of it.';
comment on column pipeline.price_observations.idempotency_key is
  'Deterministic identity of the observed fact: listing, trading date and source. Never the time the collector ran, which would make every retry a new observation.';

-- One live observation per listing, per date, per purpose. A correction supersedes rather than
-- competes, and research and production runs do not overwrite each other.
create unique index price_observations_current_idx
  on pipeline.price_observations (listing_id, trading_date, observation_purpose)
  where superseded_by_id is null;

create index price_observations_date_idx on pipeline.price_observations (trading_date);
create index price_observations_listing_idx on pipeline.price_observations (listing_id, trading_date desc);
create index price_observations_retrieval_idx on pipeline.price_observations (source_retrieval_id);

-- ---------------------------------------------------------------------------- the gate

create or replace function pipeline.check_price_observation()
returns trigger
language plpgsql
as $$
declare
  lst record;
  ven record;
  sec record;
  grt record;
  iface record;
begin
  select l.security_id, l.venue_id, l.ticker, l.price_currency, l.price_unit,
         l.listing_status, l.effective_from, l.effective_to
    into lst
    from reference.listings l where l.id = new.listing_id;

  select v.mic, v.support_state into ven from reference.venues v where v.id = lst.venue_id;
  select s.status, s.active_from, s.active_to into sec
    from reference.securities s where s.id = lst.security_id;

  -- The listing must have existed and been tradable on the date being priced. A price for a day
  -- before the line listed, or after it delisted, is not a late arrival -- it is a wrong row.
  if new.trading_date < lst.effective_from then
    raise exception 'listing % was not effective on %', lst.ticker, new.trading_date
      using errcode = 'check_violation';
  end if;
  if lst.effective_to is not null and new.trading_date > lst.effective_to then
    raise exception 'listing % had ended by %', lst.ticker, new.trading_date
      using errcode = 'check_violation';
  end if;
  if new.session_status = 'traded' and lst.listing_status <> 'active' then
    raise exception 'listing % is % and cannot have an official close', lst.ticker, lst.listing_status
      using errcode = 'check_violation';
  end if;
  if sec.active_from is not null and new.trading_date < sec.active_from then
    raise exception 'the security was not active on %', new.trading_date using errcode = 'check_violation';
  end if;
  if sec.active_to is not null and new.trading_date > sec.active_to then
    raise exception 'the security was not active on %', new.trading_date using errcode = 'check_violation';
  end if;

  -- Denomination must agree with the listing. This is the hundredfold-error guard, and it is
  -- deliberately an equality test rather than a plausibility range: a GBX price read as GBP is
  -- still a perfectly plausible-looking number.
  if new.close_price is not null then
    if new.price_currency <> lst.price_currency then
      raise exception 'price currency % does not match listing currency % for %',
        new.price_currency, lst.price_currency, lst.ticker using errcode = 'check_violation';
    end if;
    if new.price_unit <> lst.price_unit then
      raise exception 'price unit % does not match listing unit % for %',
        new.price_unit, lst.price_unit, lst.ticker using errcode = 'check_violation';
    end if;
  end if;

  -- Rights. The grant must belong to the interface the observation names, must cover collection
  -- and storage, and -- where it is venue-scoped -- must cover this listing's venue.
  select g.source_interface_id, g.covers_collection, g.covers_storage, g.covers_index_calculation,
         g.covered_venues, g.attribution_required, g.effective_from, g.effective_to
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
  if grt.covered_venues is not null and not (ven.mic = any (grt.covered_venues)) then
    raise exception 'the permission grant does not cover venue %', ven.mic
      using errcode = 'check_violation';
  end if;
  if grt.attribution_required and btrim(coalesce(new.attribution, '')) = '' then
    raise exception 'this licence makes attribution a condition and none was recorded'
      using errcode = 'check_violation';
  end if;

  -- A production observation additionally requires an interface that has cleared both axes of
  -- the terms review and been approved. Research may proceed without that, and may not be
  -- promoted by relabelling.
  if new.observation_purpose = 'production' then
    select s.production_access_state, s.terms_review_state, s.data_use_terms_state
      into iface from reference.source_interfaces s where s.id = new.source_interface_id;
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

comment on function pipeline.check_price_observation() is
  'Trigger: refuses a close that contradicts its listing (date outside the listing interval, wrong currency, wrong unit), that names a grant not covering collection, storage or the venue, that omits an attribution the licence makes a condition, or that claims production purpose on an unapproved interface.';

create trigger price_observations_gates
  before insert on pipeline.price_observations
  for each row execute function pipeline.check_price_observation();

-- Corrections supersede; nothing is edited and nothing is deleted. A corrected official close is
-- a new observation pointing at the one it replaces, and the original value stays readable --
-- which is the whole point, since "what did we believe on the day" is a question the index has to
-- be able to answer after the fact.
create trigger price_observations_append_only
  before update or delete on pipeline.price_observations
  for each row execute function pipeline.allow_only_supersession();

alter table pipeline.price_observations enable row level security;
