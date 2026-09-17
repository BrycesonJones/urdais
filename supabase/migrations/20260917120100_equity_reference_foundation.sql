-- Equity reference foundation: the security master UGAI needs before it can hold a universe.
--
-- Nothing here is UGAI-specific. These are issuers, securities, listings, identifiers and the
-- relationships between them -- the vocabulary any equity product needs -- and UGAI's tiers,
-- weights, prices and eligibility are deliberately absent. A later slice adds those against
-- this foundation rather than inside it.
--
-- Four shapes the methodology forces, each of which would be awkward to retrofit:
--
--   1. Issuer, security and listing are three things, not one. `ai-equity-universe.md` admits a
--      company, prices one security, and observes that security on one venue. Collapsing any
--      pair makes "one issuer -> one membership -> one representative security" unrepresentable:
--      a company with an ordinary line and an ADR is one membership and two securities, and a
--      security cross-listed on two venues is one security and two listings.
--
--   2. Currency belongs in two places and they are not the same. A security is denominated in
--      one currency; a listing trades and closes in one. They usually agree and the cases where
--      they do not are exactly the ones that produce silent errors -- which is also why the unit
--      convention (pence against pounds) is recorded on the listing rather than assumed.
--
--   3. Identifiers change and must stay attached to what they identified at the time. A ticker
--      is reassigned, an ISIN survives a rename, a FIGI does not move when a company is renamed.
--      Identifiers are therefore effective-dated rows, not columns, and a ticker is never an
--      identity -- only a label.
--
--   4. A depositary receipt and its underlying ordinary share are the same economic claim and
--      the same issuer. The relationship table enforces that: a DR edge whose two securities
--      belong to different issuers is rejected, because it would let one company enter a
--      universe twice.
--
-- Effective dating throughout, because the parent methodology requires membership to be
-- reproducible "for a historical effective time and for what was known as of a historical
-- publication time". A schema that only knows the present cannot answer either question.

-- ------------------------------------------------------------------------------ venues

create table reference.venues (
  id                  uuid primary key default gen_random_uuid(),

  -- ISO 10383. The market identifier code is the venue's identity; the name is a label.
  mic                 char(4) not null unique
                        constraint venues_mic_format check (mic ~ '^[A-Z0-9]{4}$'),
  -- The operating MIC where this is a segment of a larger market, e.g. XNAS under XNAS.
  operating_mic       char(4)
                        constraint venues_operating_mic_format
                        check (operating_mic is null or operating_mic ~ '^[A-Z0-9]{4}$'),
  name                text not null
                        constraint venues_name_nonempty check (btrim(name) <> ''),
  country_code        char(2) not null references reference.iso_countries (code) on delete restrict,

  -- The currency the venue ordinarily trades in. A listing carries its own price currency,
  -- because a venue can quote more than one and the listing is what gets priced.
  default_currency    char(3) not null
                        constraint venues_currency_format check (default_currency ~ '^[A-Z]{3}$'),
  -- IANA zone. Needed to resolve a local session date to an instant, which is what makes a
  -- calculation day comparable across venues that close at different times.
  timezone            text not null
                        constraint venues_timezone_nonempty check (btrim(timezone) <> ''),

  -- Whether Urdais can operate here. Separate from whether the methodology admits issuers
  -- listed here: `ai-equity-universe.md` keeps thematic eligibility independent of launch
  -- availability, and this column is the availability half.
  support_state       text not null default 'research'
                        constraint venues_support_state_allowed
                        check (support_state in ('research', 'supported', 'unsupported', 'blocked')),
  -- How far a public end-of-day price source has been taken for this venue.
  price_source_state  text not null default 'none'
                        constraint venues_price_source_state_allowed
                        check (price_source_state in ('none', 'identified', 'implemented', 'unavailable')),
  -- The venue's own data rights, which are a different question from a vendor's.
  rights_state        text not null default 'not_reviewed'
                        constraint venues_rights_state_allowed
                        check (rights_state in ('not_reviewed', 'under_review', 'permitted', 'not_permitted')),

  notes               text,
  created_at          timestamptz not null default now(),

  -- A venue cannot be supported while its data rights are known to forbid it.
  constraint venues_support_requires_rights
    check (support_state <> 'supported' or rights_state <> 'not_permitted')
);

comment on table reference.venues is
  'Trading venues by ISO 10383 MIC. support_state, price_source_state and rights_state are operational facts about Urdais''s reach, never about whether the methodology admits issuers listed here.';
comment on column reference.venues.operating_mic is
  'The operating MIC where this row is a market segment of a larger venue. Null where the venue is itself the operating market.';
comment on column reference.venues.timezone is
  'IANA zone, used to resolve a local session date to an instant. Venues on the same calculation day close at different times, and the methodology accepts that rather than correcting it.';
comment on column reference.venues.support_state is
  'Whether Urdais can operate here: research, supported, unsupported, blocked. The launch-availability half of the eligibility/availability separation.';
comment on column reference.venues.price_source_state is
  'How far a public end-of-day price source has been taken for this venue. unavailable records that one was sought and not found, which is a finding rather than an absence.';

create index venues_country_idx on reference.venues (country_code);
create index venues_supported_idx on reference.venues (support_state) where support_state = 'supported';

-- ----------------------------------------------------------------------------- issuers

create table reference.issuers (
  id               uuid primary key default gen_random_uuid(),

  -- Urdais's own stable key for the company. Deliberately not a vendor identifier and not a
  -- ticker: identity across mergers, renames and relistings is a determination Urdais makes,
  -- and a key owned by someone else would make that determination theirs.
  issuer_key       text not null unique
                     constraint issuers_key_format check (issuer_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  canonical_name   text not null
                     constraint issuers_name_nonempty check (btrim(canonical_name) <> ''),

  -- Where the company is incorporated. Distinct from where it operates and from where its
  -- securities trade; the methodology records all three separately and warns against treating
  -- an ADR as exposure to the country of the receipt.
  domicile_country text references reference.iso_countries (code) on delete restrict,

  -- ISO 17442, where the company has one. Nullable: many listed issuers outside the EU do not.
  lei              char(20)
                     constraint issuers_lei_format check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),

  status           text not null default 'active'
                     constraint issuers_status_allowed
                     check (status in ('active', 'inactive')),
  active_from      date,
  active_to        date,

  notes            text,
  created_at       timestamptz not null default now(),

  constraint issuers_interval_ordered
    check (active_from is null or active_to is null or active_to >= active_from),
  -- An inactive issuer has an end date; an active one does not.
  constraint issuers_inactive_has_end
    check (status <> 'inactive' or active_to is not null),
  constraint issuers_active_has_no_end
    check (status <> 'active' or active_to is null)
);

comment on table reference.issuers is
  'The consolidated operating company whose business exposure the parent methodology assesses. One issuer is at most one universe membership, whatever its securities and listings.';
comment on column reference.issuers.issuer_key is
  'Urdais''s own stable company key. Identity across mergers, renames and relistings is Urdais''s determination, so the key is Urdais''s; vendor identifiers map onto it rather than the reverse.';
comment on column reference.issuers.domicile_country is
  'Country of incorporation. Recorded separately from operating geography and from listing venue, because a foreign listing does not relocate the business.';

create index issuers_name_idx on reference.issuers (lower(canonical_name));
create index issuers_domicile_idx on reference.issuers (domicile_country);

-- --------------------------------------------------------------------------- securities

create table reference.securities (
  id                        uuid primary key default gen_random_uuid(),
  issuer_id                 uuid not null references reference.issuers (id) on delete restrict,

  security_type             text not null
                              constraint securities_type_allowed
                              check (security_type in (
                                'ordinary_share',
                                'non_voting_ordinary_share',
                                'preferred_share',
                                'depositary_receipt',
                                'tracking_stock',
                                'other'
                              )),
  -- The issuer's own class label where it has one: 'A', 'B', 'C'. Null where undifferentiated.
  share_class               text,

  -- What the security itself is denominated in. The listing carries the currency it trades in;
  -- they usually agree, and the cases where they do not are the ones that go wrong silently.
  denomination_currency     char(3)
                              constraint securities_denomination_currency_format
                              check (denomination_currency is null or denomination_currency ~ '^[A-Z]{3}$'),

  -- A receipt is the same economic claim as its underlying, held through a depositary. The
  -- ratio is how many underlying shares one receipt represents, and it is required for a
  -- receipt because a price without it is uninterpretable.
  is_depositary_receipt     boolean not null default false,
  receipt_ratio_numerator   integer
                              constraint securities_receipt_numerator_positive
                              check (receipt_ratio_numerator is null or receipt_ratio_numerator > 0),
  receipt_ratio_denominator integer
                              constraint securities_receipt_denominator_positive
                              check (receipt_ratio_denominator is null or receipt_ratio_denominator > 0),

  status                    text not null default 'active'
                              constraint securities_status_allowed
                              check (status in ('active', 'suspended', 'delisted', 'inactive')),
  active_from               date,
  active_to                 date,

  notes                     text,
  created_at                timestamptz not null default now(),

  constraint securities_interval_ordered
    check (active_from is null or active_to is null or active_to >= active_from),
  -- The flag and the type say the same thing, so they may not disagree.
  constraint securities_receipt_flag_matches_type
    check (is_depositary_receipt = (security_type = 'depositary_receipt')),
  -- A receipt carries a complete ratio; a non-receipt carries none.
  constraint securities_receipt_ratio_complete
    check (
      (is_depositary_receipt
        and receipt_ratio_numerator is not null and receipt_ratio_denominator is not null)
      or (not is_depositary_receipt
        and receipt_ratio_numerator is null and receipt_ratio_denominator is null)
    )
);

comment on table reference.securities is
  'A specific equity claim of an issuer: an ordinary line, a share class, or a depositary receipt. Distinct from the listing, because one security can trade on more than one venue.';
comment on column reference.securities.denomination_currency is
  'The currency the security is denominated in. The currency it is priced in lives on the listing; the two usually agree and the exceptions are where unit errors hide.';
comment on column reference.securities.receipt_ratio_numerator is
  'Underlying shares represented by one receipt, as numerator over denominator. Required for a depositary receipt: a receipt price is uninterpretable without it.';

create index securities_issuer_idx on reference.securities (issuer_id);
create index securities_type_idx on reference.securities (security_type);

-- ----------------------------------------------------------------------------- listings

create table reference.listings (
  id              uuid primary key default gen_random_uuid(),
  security_id     uuid not null references reference.securities (id) on delete restrict,
  venue_id        uuid not null references reference.venues (id) on delete restrict,

  ticker          text not null
                    constraint listings_ticker_nonempty check (btrim(ticker) <> ''),
  -- What this line is quoted and closed in. The methodology validates this against reference
  -- data on ingestion because an inverted or mis-scaled price is silent.
  price_currency  char(3) not null
                    constraint listings_price_currency_format check (price_currency ~ '^[A-Z]{3}$'),
  -- Pence against pounds, cents against dollars. Recorded rather than assumed: the minor-unit
  -- case is the one that produces a hundredfold error nobody notices.
  price_unit      text not null default 'major'
                    constraint listings_price_unit_allowed check (price_unit in ('major', 'minor')),

  listing_status  text not null default 'active'
                    constraint listings_status_allowed
                    check (listing_status in ('active', 'suspended', 'delisted', 'pending')),
  -- The issuer-designated primary line, which is one of the representative-security
  -- tie-breaks. Not a claim about liquidity.
  is_primary      boolean not null default false,

  effective_from  date not null,
  effective_to    date,

  notes           text,
  created_at      timestamptz not null default now(),

  constraint listings_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  unique (security_id, venue_id, effective_from)
);

comment on table reference.listings is
  'A security''s trading line on a venue, effective-dated. One security cross-listed on two venues is two listings and one security, which is what keeps it one membership.';
comment on column reference.listings.price_unit is
  'Whether the quoted price is in major or minor units. Recorded rather than assumed, because the minor-unit case produces a hundredfold error that no range check catches.';
comment on column reference.listings.is_primary is
  'The issuer-designated primary listing. One of the representative-security tie-breaks, and not a statement about traded value.';

create index listings_security_idx on reference.listings (security_id);
create index listings_venue_idx on reference.listings (venue_id);
create index listings_ticker_idx on reference.listings (venue_id, upper(ticker));

-- At most one current primary listing per security. Historical primaries are unconstrained,
-- because a security's primary line can move and the old row stays true of its own interval.
create unique index listings_one_current_primary_per_security
  on reference.listings (security_id)
  where is_primary and effective_to is null;

-- A venue and ticker identify at most one current line. A reassigned ticker is a new row with
-- its own interval, which is why the constraint is on current rows only.
create unique index listings_one_current_ticker_per_venue
  on reference.listings (venue_id, upper(ticker))
  where effective_to is null;

-- ------------------------------------------------------------------ security identifiers

create table reference.security_identifiers (
  id               uuid primary key default gen_random_uuid(),
  security_id      uuid not null references reference.securities (id) on delete restrict,

  identifier_type  text not null
                     constraint security_identifiers_type_allowed
                     check (identifier_type in (
                       'isin', 'figi', 'composite_figi', 'share_class_figi',
                       'sedol', 'cusip', 'local_code', 'other'
                     )),
  identifier_value text not null
                     constraint security_identifiers_value_nonempty check (btrim(identifier_value) <> ''),

  -- Where the identifier came from, on the registry's usual standard: cite, do not store.
  source_note      text,
  evidence_url     text,

  effective_from   date not null,
  effective_to     date,
  created_at       timestamptz not null default now(),

  constraint security_identifiers_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  -- ISIN is twelve characters, two of them a country prefix; FIGI is twelve alphanumerics.
  constraint security_identifiers_isin_format
    check (identifier_type <> 'isin' or identifier_value ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  constraint security_identifiers_figi_format
    check (identifier_type not in ('figi', 'composite_figi', 'share_class_figi')
           or identifier_value ~ '^BBG[A-Z0-9]{8}[0-9]$'),
  unique (security_id, identifier_type, identifier_value, effective_from)
);

comment on table reference.security_identifiers is
  'Effective-dated identifiers for a security. Identifiers are rows rather than columns because they change and must stay attached to what they identified at the time. A ticker is a label on a listing, never an identity.';
comment on column reference.security_identifiers.identifier_type is
  'FIGI is the methodology''s canonical internal identifier; ISIN and SEDOL are reconciliation keys. SEDOL is licensed separately by its issuer and is recorded as reconciliation-only, never as a primary key.';

create index security_identifiers_security_idx on reference.security_identifiers (security_id);
create index security_identifiers_lookup_idx on reference.security_identifiers (identifier_type, identifier_value);

-- One ISIN identifies one security. FIGI is deliberately excluded from this constraint:
-- share-class and composite FIGIs are shared across listings by design, and a uniqueness rule
-- would reject correct data.
create unique index security_identifiers_one_current_isin
  on reference.security_identifiers (identifier_value)
  where identifier_type = 'isin' and effective_to is null;

-- ---------------------------------------------------------------- security relationships

create table reference.security_relationships (
  id                 uuid primary key default gen_random_uuid(),
  from_security_id   uuid not null references reference.securities (id) on delete restrict,
  to_security_id     uuid not null references reference.securities (id) on delete restrict,

  relationship_type  text not null
                       constraint security_relationships_type_allowed
                       check (relationship_type in (
                         'depositary_receipt_of',
                         'share_class_sibling_of',
                         'successor_of'
                       )),

  evidence_note      text,
  effective_from     date not null,
  effective_to       date,
  created_at         timestamptz not null default now(),

  constraint security_relationships_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  constraint security_relationships_no_self_edge
    check (from_security_id <> to_security_id),
  unique (from_security_id, to_security_id, relationship_type, effective_from)
);

comment on table reference.security_relationships is
  'Edges between securities: a receipt and its underlying, sibling share classes, and succession across a corporate event. Same-issuer edges are enforced by trigger, because a receipt and its underlying belonging to different issuers would let one company enter a universe twice.';

create index security_relationships_from_idx on reference.security_relationships (from_security_id);
create index security_relationships_to_idx on reference.security_relationships (to_security_id);

-- A depositary receipt edge points from the receipt to its underlying, and both belong to the
-- same issuer. A share-class sibling edge joins two lines of the same issuer, neither of which
-- is a receipt. A succession edge is the one case where the issuers legitimately differ.
create or replace function reference.check_security_relationship()
returns trigger
language plpgsql
as $$
declare
  from_sec record;
  to_sec   record;
begin
  select issuer_id, is_depositary_receipt into from_sec
    from reference.securities where id = new.from_security_id;
  select issuer_id, is_depositary_receipt into to_sec
    from reference.securities where id = new.to_security_id;

  if new.relationship_type = 'depositary_receipt_of' then
    if not from_sec.is_depositary_receipt then
      raise exception 'a depositary_receipt_of edge must start at a depositary receipt'
        using errcode = 'check_violation';
    end if;
    if to_sec.is_depositary_receipt then
      raise exception 'a depositary_receipt_of edge must end at an underlying security, not another receipt'
        using errcode = 'check_violation';
    end if;
    if from_sec.issuer_id <> to_sec.issuer_id then
      raise exception 'a depositary receipt and its underlying must belong to the same issuer: one company is one membership'
        using errcode = 'check_violation';
    end if;

  elsif new.relationship_type = 'share_class_sibling_of' then
    if from_sec.issuer_id <> to_sec.issuer_id then
      raise exception 'share class siblings must belong to the same issuer'
        using errcode = 'check_violation';
    end if;
    if from_sec.is_depositary_receipt or to_sec.is_depositary_receipt then
      raise exception 'a depositary receipt is not a share class sibling; use depositary_receipt_of'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function reference.check_security_relationship() is
  'Trigger: validates security relationship edges. A receipt edge runs receipt -> underlying within one issuer; a sibling edge joins two non-receipt lines of one issuer; succession is the only type permitted to cross issuers.';

create trigger security_relationships_shape_check
  before insert or update on reference.security_relationships
  for each row execute function reference.check_security_relationship();

-- ------------------------------------------------------------------ issuer relationships

create table reference.issuer_relationships (
  id                 uuid primary key default gen_random_uuid(),
  parent_issuer_id   uuid not null references reference.issuers (id) on delete restrict,
  child_issuer_id    uuid not null references reference.issuers (id) on delete restrict,

  relationship_type  text not null default 'parent_of'
                       constraint issuer_relationships_type_allowed
                       check (relationship_type in ('parent_of', 'successor_of')),
  -- Where a controlling stake is evidenced. The parent methodology removes controlling stakes
  -- from a listed subsidiary's free float, so the number is a float input, not decoration.
  ownership_percent  numeric
                       constraint issuer_relationships_ownership_range
                       check (ownership_percent is null
                              or (ownership_percent > 0 and ownership_percent <= 100)),

  evidence_note      text,
  effective_from     date not null,
  effective_to       date,
  created_at         timestamptz not null default now(),

  constraint issuer_relationships_interval_ordered
    check (effective_to is null or effective_to >= effective_from),
  constraint issuer_relationships_no_self_edge
    check (parent_issuer_id <> child_issuer_id),
  unique (parent_issuer_id, child_issuer_id, relationship_type, effective_from)
);

comment on table reference.issuer_relationships is
  'Parent and successor edges between issuers. A separately listed subsidiary is its own issuer with its own membership; recording the parent is what lets the controlling stake be removed from the subsidiary''s free float rather than counted as public.';

create index issuer_relationships_parent_idx on reference.issuer_relationships (parent_issuer_id);
create index issuer_relationships_child_idx on reference.issuer_relationships (child_issuer_id);

-- --------------------------------------------------------------------------------- RLS
--
-- Same model as every other table in these schemas: RLS on, no policies, anon and
-- authenticated hold no privileges at any level, service_role reaches them by platform design.
-- Default privileges from the foundation migration already cover grants and revocations.

alter table reference.venues                 enable row level security;
alter table reference.issuers                enable row level security;
alter table reference.securities             enable row level security;
alter table reference.listings               enable row level security;
alter table reference.security_identifiers   enable row level security;
alter table reference.security_relationships enable row level security;
alter table reference.issuer_relationships   enable row level security;
