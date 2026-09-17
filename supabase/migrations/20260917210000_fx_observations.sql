-- FX for UGAI: one rate per currency per calculation day, with its arithmetic on the record.
--
-- The methodology fixes the orientation and leaves the fixing open. `X_i,t` is "USD per one unit
-- of the price currency", validated on ingestion and "never inverted per currency" -- while the
-- source, fixing time, licensing and fallback rules are stated as unresolved launch parameters.
-- Both facts are represented here: the orientation is a constraint, and the fixing convention is
-- a draft parameter that production determination is gated on.
--
-- The column that earns its place is `derivation`. No source publishes what UGAI needs:
--
--   USD per EUR   ECB publishes it directly            -> direct
--   USD per JPY   ECB publishes EUR per JPY            -> cross via EUR, two component rows
--   USD per TWD   CBC publishes TWD per USD            -> inverted, one component row
--
-- A stored 0.00642 with no record of how it was reached cannot be audited, and an inversion
-- applied twice produces a number that still looks like an exchange rate. So a derived row points
-- at the source rows it came from, and a trigger refuses a derivation whose components are absent
-- or whose arithmetic does not reproduce the stored rate.

create table pipeline.fx_observations (
  id                    uuid primary key default gen_random_uuid(),

  -- The pair, always read as: `rate` units of base_currency per one unit of quote_currency.
  base_currency         char(3) not null
                          constraint fx_base_format check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency        char(3) not null
                          constraint fx_quote_format check (quote_currency ~ '^[A-Z]{3}$'),
  rate                  numeric not null
                          -- NaN compares greater than every numeric and equals itself, so a bare
                          -- `> 0` admits it. Infinity likewise passes `> 0`.
                          constraint fx_rate_positive
                          check (rate > 0 and rate <> 'NaN'::numeric
                                 and rate <> 'Infinity'::numeric),

  -- Spelled out rather than implied. A calculation that multiplies where it should divide
  -- produces a plausible number, and the only defence is that the orientation was never a
  -- convention anyone had to remember.
  orientation           text not null default 'base_per_quote'
                          constraint fx_orientation_allowed
                          check (orientation in ('base_per_quote')),

  fixing_date           date not null,
  -- What the source said the fixing was as of, where it says. Distinct from when Urdais read it.
  fixing_timestamp      timestamptz,
  retrieved_at          timestamptz not null,

  -- How this row was produced, and from what.
  derivation            text not null
                          constraint fx_derivation_allowed
                          check (derivation in ('identity', 'direct', 'inverted', 'cross')),
  cross_via_currency    char(3)
                          constraint fx_cross_via_format
                          check (cross_via_currency is null or cross_via_currency ~ '^[A-Z]{3}$'),
  -- For 'inverted': the single source row. For 'cross': the two legs, base-side and quote-side.
  component_base_id     uuid references pipeline.fx_observations (id) on delete restrict,
  component_quote_id    uuid references pipeline.fx_observations (id) on delete restrict,

  -- Methodology says a missing fixing is carried forward and flagged. Carrying is therefore a
  -- first-class state rather than a silent copy, and it names the date it came from.
  rate_status           text not null default 'published'
                          constraint fx_rate_status_allowed
                          check (rate_status in ('published', 'carried')),
  carried_from_date     date,

  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  permission_grant_id   uuid references reference.permission_grants (id) on delete restrict,
  source_payload        jsonb,
  attribution           text,

  observation_purpose   text not null default 'research'
                          constraint fx_purpose_allowed
                          check (observation_purpose in ('research', 'production')),
  idempotency_key       text not null unique,

  superseded_by_id      uuid references pipeline.fx_observations (id) on delete restrict
                          deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),

  constraint fx_no_self_pair check (base_currency <> quote_currency or derivation = 'identity'),
  constraint fx_identity_is_unity
    check (derivation <> 'identity' or (rate = 1 and base_currency = quote_currency)),
  constraint fx_cross_names_its_bridge
    check ((derivation = 'cross') = (cross_via_currency is not null)),
  constraint fx_cross_has_two_components
    check (derivation <> 'cross' or (component_base_id is not null and component_quote_id is not null)),
  constraint fx_inverted_has_one_component
    check (derivation <> 'inverted' or component_quote_id is not null),
  -- A published rate comes from a source; a derived one comes from other rows. Only an identity
  -- rate comes from neither, because 1 USD per USD is arithmetic rather than an observation.
  constraint fx_published_names_a_source
    check (derivation <> 'direct' or (source_interface_id is not null and permission_grant_id is not null)),
  constraint fx_carried_names_its_origin
    check ((rate_status = 'carried') = (carried_from_date is not null)),
  constraint fx_carried_is_backdated
    check (carried_from_date is null or carried_from_date < fixing_date),
  constraint fx_supersession_is_complete
    check ((superseded_by_id is null) = (superseded_at is null))
);

comment on table pipeline.fx_observations is
  'One reference rate per currency per calculation day, always USD per one unit of the price currency as the methodology requires. Source-published legs and the rates derived from them are both rows: a derived rate points at its components and its arithmetic is re-checked on insert, because an inversion applied twice still looks like an exchange rate.';
comment on column pipeline.fx_observations.orientation is
  'Always base_per_quote: `rate` units of base per one unit of quote. Spelled out rather than conventional, because a calculation that divides where it should multiply produces a plausible number and nothing else catches it.';
comment on column pipeline.fx_observations.rate_status is
  'published or carried. The methodology permits carrying the last published fixing forward when one is not published for a currency, and requires it to be flagged; carried_from_date names the day it came from so a stale input is visible rather than inferred.';

create unique index fx_observations_current_idx
  on pipeline.fx_observations (base_currency, quote_currency, fixing_date, observation_purpose)
  where superseded_by_id is null;
create index fx_observations_date_idx on pipeline.fx_observations (fixing_date, quote_currency);

-- ------------------------------------------------------------------ the derivation gate

create or replace function pipeline.check_fx_observation()
returns trigger
language plpgsql
set search_path = pg_catalog, pipeline, reference, public
as $$
declare
  leg_base record;
  leg_quote record;
  expected numeric;
  grt record;
begin
  -- Rights, where a source is named.
  if new.permission_grant_id is not null then
    select g.source_interface_id, g.covers_collection, g.covers_storage,
           g.covers_index_calculation, g.attribution_required
      into grt from reference.permission_grants g where g.id = new.permission_grant_id;
    if grt.source_interface_id <> new.source_interface_id then
      raise exception 'the permission grant belongs to a different source interface'
        using errcode = 'check_violation';
    end if;
    if not grt.covers_collection or not grt.covers_storage then
      raise exception 'the permission grant does not cover collection and storage'
        using errcode = 'check_violation';
    end if;
    if grt.attribution_required and btrim(coalesce(new.attribution, '')) = '' then
      raise exception 'this licence makes attribution a condition and none was recorded'
        using errcode = 'check_violation';
    end if;
    -- An FX rate is an index input, so a production rate needs the calculation right and not
    -- merely permission to have collected the number.
    if new.observation_purpose = 'production' and not grt.covers_index_calculation then
      raise exception 'a production FX observation requires a grant covering index calculation'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Derived rates must reproduce. This is the check that catches a double inversion, a leg from
  -- the wrong day, and a cross assembled from the wrong pair.
  if new.derivation = 'inverted' then
    select base_currency, quote_currency, rate, fixing_date into leg_quote
      from pipeline.fx_observations where id = new.component_quote_id;
    if leg_quote.base_currency <> new.quote_currency or leg_quote.quote_currency <> new.base_currency then
      raise exception 'an inverted rate must invert the % per % leg, not % per %',
        new.base_currency, new.quote_currency, leg_quote.base_currency, leg_quote.quote_currency
        using errcode = 'check_violation';
    end if;
    if leg_quote.fixing_date <> new.fixing_date then
      raise exception 'the component leg is dated % and this rate is dated %',
        leg_quote.fixing_date, new.fixing_date using errcode = 'check_violation';
    end if;
    expected := 1 / leg_quote.rate;

  elsif new.derivation = 'cross' then
    -- Both legs are published against the bridge currency: base per bridge, and quote per bridge.
    -- USD per JPY = (USD per EUR) / (JPY per EUR).
    select base_currency, quote_currency, rate, fixing_date into leg_base
      from pipeline.fx_observations where id = new.component_base_id;
    select base_currency, quote_currency, rate, fixing_date into leg_quote
      from pipeline.fx_observations where id = new.component_quote_id;
    if leg_base.base_currency <> new.base_currency or leg_base.quote_currency <> new.cross_via_currency then
      raise exception 'the base leg must be % per %, not % per %',
        new.base_currency, new.cross_via_currency, leg_base.base_currency, leg_base.quote_currency
        using errcode = 'check_violation';
    end if;
    if leg_quote.base_currency <> new.quote_currency or leg_quote.quote_currency <> new.cross_via_currency then
      raise exception 'the quote leg must be % per %, not % per %',
        new.quote_currency, new.cross_via_currency, leg_quote.base_currency, leg_quote.quote_currency
        using errcode = 'check_violation';
    end if;
    if leg_base.fixing_date <> new.fixing_date or leg_quote.fixing_date <> new.fixing_date then
      raise exception 'a cross rate must be assembled from legs of its own fixing date'
        using errcode = 'check_violation';
    end if;
    expected := leg_base.rate / leg_quote.rate;
  else
    return new;
  end if;

  -- A relative tolerance, because the stored rate is rounded for publication and the components
  -- are not. Tight enough that a wrong operation cannot hide inside it.
  if abs(new.rate - expected) > expected * 1e-9 then
    raise exception 'derived rate % does not reproduce from its components (expected %)',
      new.rate, expected using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.check_fx_observation() is
  'Trigger: enforces the rights gate where a source is named, and re-derives every inverted and cross rate from its recorded components. A rate that does not reproduce is refused, which is what catches a double inversion, a leg taken from the wrong day, and a cross assembled from the wrong pair.';

create trigger fx_observations_gates before insert on pipeline.fx_observations
  for each row execute function pipeline.check_fx_observation();
create trigger fx_observations_append_only before update or delete on pipeline.fx_observations
  for each row execute function pipeline.allow_only_supersession();

alter table pipeline.fx_observations enable row level security;

-- ------------------------------------------------------------------- traded value
--
-- Liquidity lives on the price observation rather than in a parallel table: it is the same
-- listing, the same session, the same retrieval and the same source payload, and a second table
-- keyed identically would only create a way for the two to disagree about whether a session
-- happened. TWSE publishes TradeValue and TradeVolume in the row the close comes from, under the
-- grant already reviewed, so no new right is claimed.
--
-- Existing rows keep nulls. That is honest: those sessions were collected before volume was, and
-- a null means "not captured", which the trading-frequency measure must treat as missing rather
-- than as zero.

alter table pipeline.price_observations
  add column traded_value      numeric
    constraint price_observations_traded_value_non_negative
    check (traded_value is null
           or (traded_value >= 0 and traded_value <> 'NaN'::numeric)),
  add column traded_volume     numeric
    constraint price_observations_traded_volume_non_negative
    check (traded_volume is null
           or (traded_volume >= 0 and traded_volume <> 'NaN'::numeric)),
  add column traded_value_currency char(3)
    constraint price_observations_traded_value_currency_format
    check (traded_value_currency is null or traded_value_currency ~ '^[A-Z]{3}$');

alter table pipeline.price_observations
  add constraint price_observations_traded_value_is_denominated
    check (traded_value is null or traded_value_currency is not null),
  -- Only a session that traded can report turnover. A holiday with a traded value would be the
  -- same class of fabrication as a holiday with a price.
  add constraint price_observations_turnover_only_when_traded
    check (session_status = 'traded' or (traded_value is null and traded_volume is null));

comment on column pipeline.price_observations.traded_value is
  'Session turnover in traded_value_currency, from the same source row as the close. Null means not captured, never zero: the methodology requires known zero-volume sessions to count as zero while missing data stays missing and does not disappear from the denominator, and those are different facts.';
