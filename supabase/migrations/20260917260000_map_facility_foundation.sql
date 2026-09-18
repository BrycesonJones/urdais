-- The Urdais map's facility foundation: a sourced geographic database of the
-- physical infrastructure underlying the AI economy.
--
-- Until now the map drew a hard-coded demo list from the client bundle. This
-- migration gives facilities the same shape every other Urdais dataset has: a
-- canonical record, its evidence, and a publication decision that is separate
-- from both.
--
-- Three rules are in the schema because all three fail silently otherwise.
--
--   1. A record that exists is not a record that publishes. A facility Urdais
--      has researched but cannot place — no coordinates, or only a city
--      centroid — is a real row with real evidence. It simply never becomes a
--      dot. The alternative, which the demo data modelled, was an "Unmapped"
--      category on the public legend: a quality state wearing the clothes of an
--      infrastructure type. Publication is a column here, not a category there.
--
--   2. Shared coordinates are not a duplicate. LUMI sits inside CSC Kajaani and
--      reports the same latitude and longitude; so do JUPITER and Jülich,
--      Prometheus and New Albany, Horizon 1 and Childress. Those are eight
--      entities, not four. Nothing in this schema merges on position, and the
--      uniqueness constraints are on the research key alone.
--
--   3. A power station is not AI infrastructure because it is large. It earns
--      its place on this map only through a documented, evidenced supply
--      relationship to compute. That is a cross-row condition, so it is a
--      deferred constraint trigger rather than a check: at commit time, a
--      published power_infrastructure row without an evidenced
--      supplies_power_to edge into a compute facility is rejected.
--
-- Evidence is per claim, never per record. A company page that states an
-- address has not thereby stated a GPU count, and the claims table is what
-- keeps the second from inheriting the first's credibility.

-- ---------------------------------------------------------------------------
-- Shared predicates
-- ---------------------------------------------------------------------------

-- Map eligibility as one expression, referenced by the publication constraint
-- and by the public read query, so a write gate and a read filter can never
-- drift apart. A city centroid is a location, not a position: it is the
-- coordinate precision that puts a dot in the middle of a city that has
-- nothing there, so it is excluded here rather than in a caller's WHERE clause.
create or replace function reference.facility_is_map_eligible(
  p_latitude numeric,
  p_longitude numeric,
  p_coordinate_precision text
)
returns boolean
language sql
immutable
as $$
  select p_latitude is not null
     and p_longitude is not null
     and p_coordinate_precision in ('building', 'campus', 'street');
$$;

comment on function reference.facility_is_map_eligible(numeric, numeric, text) is
  'Whether a facility can be placed as a dot: a position exists and is better than a city centroid. Used by the publication constraint and by the public read model.';

-- The categories that count as compute for the power-infrastructure rule. A
-- power asset supplying another power asset is a grid fact, not an AI-economy
-- fact.
create or replace function reference.facility_is_compute_category(p_category text)
returns boolean
language sql
immutable
as $$
  select p_category in ('data_center', 'gpu_compute_cluster', 'semiconductor_fab');
$$;

comment on function reference.facility_is_compute_category(text) is
  'Whether a category is compute infrastructure for the purpose of the power-infrastructure publication rule.';

-- ---------------------------------------------------------------------------
-- The canonical facility
-- ---------------------------------------------------------------------------

create table reference.facilities (
  id                      uuid primary key default gen_random_uuid(),

  -- The stable identity a researcher assigns and an importer addresses. Every
  -- re-import of the same facility targets this key, which is why the importer
  -- can be idempotent without guessing at name similarity.
  research_key            text not null unique
                            constraint facilities_research_key_format
                            check (research_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  canonical_name          text not null
                            constraint facilities_name_not_blank check (btrim(canonical_name) <> ''),

  category                text not null
                            constraint facilities_category_allowed check (category in (
                              'data_center',
                              'gpu_compute_cluster',
                              'semiconductor_fab',
                              'power_infrastructure'
                            )),

  -- Owner and operator are different roles and frequently different companies:
  -- Applied Digital owns Polaris Forge 1, CoreWeave runs GPUs inside it. Both
  -- are free text as the source states them; neither is resolved to
  -- reference.market_entities yet, because a landlord/tenant pair wrongly
  -- collapsed into one entity is worse than an unresolved string.
  owner_name              text,
  operator_name           text,

  lifecycle_status        text
                            constraint facilities_lifecycle_allowed check (lifecycle_status is null or lifecycle_status in (
                              'announced',
                              'planned',
                              'under_construction',
                              'operational',
                              'expansion',
                              'suspended',
                              'cancelled',
                              'retired'
                            )),

  -- Location as published, not parsed into a postal model. The popup shows a
  -- line; nothing in Urdais routes to these addresses.
  street_address          text,
  locality                text,
  admin_area              text,
  country_name            text,
  -- ISO 3166-1 alpha-2, against the reference set rather than
  -- reference.canonical_regions: that table means "a UCPI region a price may be
  -- attributed to", which is a different claim from "the country a building
  -- stands in", and only five codes are adopted there.
  country_code            char(2) references reference.iso_countries (code) on delete restrict,

  latitude                numeric
                            constraint facilities_latitude_range
                            check (latitude is null or (latitude >= -90 and latitude <= 90)),
  longitude               numeric
                            constraint facilities_longitude_range
                            check (longitude is null or (longitude >= -180 and longitude <= 180)),
  coordinate_precision    text
                            constraint facilities_precision_allowed
                            check (coordinate_precision is null or coordinate_precision in ('building', 'campus', 'street', 'city')),
  -- How the position was arrived at: an official record, a geocoded published
  -- address, a named campus feature. Kept because a geocoder is not a fact
  -- source, and a pin's weight depends on which of these produced it.
  coordinate_method       text
                            constraint facilities_coordinate_method_allowed
                            check (coordinate_method is null or coordinate_method in (
                              'official_record',
                              'documented_address_geocode',
                              'campus_centroid',
                              'city_centroid'
                            )),
  coordinate_notes        text,

  announced_date          date,
  construction_start_date date,
  operational_date        date,

  -- The publication decision, which is not a fact about the facility.
  --   research        a canonical record; nothing public
  --   review_required a record an open question blocks
  --   published       approved to appear on the public map
  --   withdrawn       published once, deliberately removed
  publication_state       text not null default 'research'
                            constraint facilities_publication_state_allowed
                            check (publication_state in ('research', 'review_required', 'published', 'withdrawn')),

  confidence              text not null
                            constraint facilities_confidence_allowed check (confidence in ('high', 'medium', 'low')),

  -- Internal. Never served publicly; this is the reviewer's column.
  review_notes            text[] not null default '{}'::text[],

  last_verified_date      date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- A pair or neither. One coordinate is not a position.
  constraint facilities_coordinates_are_a_pair
    check ((latitude is null) = (longitude is null)),
  -- A position without a stated precision cannot be judged, so it cannot be held.
  constraint facilities_coordinates_have_precision
    check (latitude is null or coordinate_precision is not null),
  constraint facilities_precision_needs_coordinates_or_is_absent
    check (coordinate_precision is null or latitude is not null or coordinate_precision = 'city'),

  -- Publication's row-local conditions. The cross-row ones (evidence, and the
  -- power relationship) are enforced by the deferred triggers below.
  constraint facilities_published_requires_position
    check (publication_state <> 'published'
           or reference.facility_is_map_eligible(latitude, longitude, coordinate_precision)),
  constraint facilities_published_requires_verification_date
    check (publication_state <> 'published' or last_verified_date is not null),
  -- Low confidence is a research state by definition; it does not publish.
  constraint facilities_published_requires_confidence
    check (publication_state <> 'published' or confidence in ('high', 'medium')),
  -- A cancelled or retired site is not current infrastructure.
  constraint facilities_published_requires_live_lifecycle
    check (publication_state <> 'published'
           or lifecycle_status is null
           or lifecycle_status not in ('cancelled', 'retired'))
);

comment on table reference.facilities is
  'One physical infrastructure entity. A GPU cluster inside a data center is its own row and shares the host''s coordinates on purpose; nothing here deduplicates on position. publication_state, not category, decides what the public map shows.';

comment on column reference.facilities.research_key is
  'The stable identity an importer addresses. Re-importing the same key updates that facility; it is never matched by name or position.';
comment on column reference.facilities.publication_state is
  'Whether this record is approved for the public map. A researched facility with no coordinates is a legitimate row in the research state, never a fabricated dot and never a public "Unmapped" category.';
comment on column reference.facilities.coordinate_precision is
  'building | campus | street | city. A city centroid is a location, not a position, and is not map-eligible.';
comment on column reference.facilities.review_notes is
  'Internal, unresolved questions carried from research. Never served by the public read path.';

create index facilities_category_idx on reference.facilities (category);
create index facilities_published_idx on reference.facilities (category, last_verified_date desc)
  where publication_state = 'published';
create index facilities_country_idx on reference.facilities (country_code);

-- ---------------------------------------------------------------------------
-- Aliases and source-native identifiers
-- ---------------------------------------------------------------------------

create table reference.facility_aliases (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references reference.facilities (id) on delete cascade,
  alias         text not null
                  constraint facility_aliases_not_blank check (btrim(alias) <> ''),
  alias_kind    text not null default 'alias'
                  constraint facility_aliases_kind_allowed
                  check (alias_kind in ('alias', 'former_name', 'source_identifier')),
  -- Where a source identifier came from: a permit number's issuing body, a
  -- filing's registry. Null for a plain alias.
  alias_authority text,
  created_at    timestamptz not null default now(),
  constraint facility_aliases_unique unique (facility_id, alias_kind, alias)
);

comment on table reference.facility_aliases is
  'Other names a facility is published under, and identifiers a source assigns it. Deduplication input only: a matching alias raises a review candidate and never merges two rows.';

create index facility_aliases_alias_idx on reference.facility_aliases (lower(alias));

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------

-- A facility's evidence is a document, not a feed. The existing source registry
-- models interfaces Urdais reads repeatedly — an offer API, a price catalog —
-- and a county air permit fetched once is not one of those. So evidence carries
-- its own document identity and links into the registry only where a registered
-- interface genuinely produced it. Both links are optional and neither is
-- invented: no row here manufactures a provider record for a one-time PDF.
create table reference.facility_evidence (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references reference.facilities (id) on delete cascade,

  -- The publisher, as the document identifies itself. "Talen Energy", "North
  -- Dakota DEQ", "NIST CHIPS Program Office".
  publisher             text not null
                          constraint facility_evidence_publisher_not_blank check (btrim(publisher) <> ''),
  title                 text not null
                          constraint facility_evidence_title_not_blank check (btrim(title) <> ''),
  document_url          text not null
                          constraint facility_evidence_url_scheme check (document_url ~ '^https?://'),
  document_type         text not null
                          constraint facility_evidence_type_allowed check (document_type in (
                            'company_facility_page',
                            'company_press_release',
                            'sec_filing',
                            'government_record',
                            'permit',
                            'planning',
                            'utility_filing',
                            'industry_press'
                          )),
  published_on          date,

  -- Optional links into the existing provenance architecture, used where the
  -- document did come from a registered interface or a recorded fetch.
  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  retrieval_id          uuid references pipeline.source_retrievals (id) on delete restrict,

  -- Whether a person has checked this document against the claims below.
  verification_state    text not null default 'unverified'
                          constraint facility_evidence_verification_allowed
                          check (verification_state in ('unverified', 'human_verified', 'disputed')),
  verified_at           timestamptz,
  verification_notes    text,

  created_at            timestamptz not null default now(),

  constraint facility_evidence_verified_has_time
    check (verification_state <> 'human_verified' or verified_at is not null),
  -- The same document cited twice for one facility is a data error, not two
  -- pieces of evidence.
  constraint facility_evidence_unique_document unique (facility_id, document_url)
);

comment on table reference.facility_evidence is
  'One source document behind a facility. Carries its own document identity because most of these are fetched-once records rather than interfaces Urdais reads on a schedule; links into reference.source_interfaces and pipeline.source_retrievals where one genuinely applies.';

create index facility_evidence_facility_idx on reference.facility_evidence (facility_id);

create table reference.facility_evidence_claims (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references reference.facility_evidence (id) on delete cascade,

  -- Which part of the facility record this document supports. The point of the
  -- table: a press release that states an address has not stated a GPU count,
  -- and no query can accidentally treat it as if it had.
  claim_field   text not null
                  constraint facility_evidence_claims_field_allowed check (claim_field in (
                    'identity',
                    'location',
                    'coordinates',
                    'owner',
                    'operator',
                    'lifecycle_status',
                    'dates',
                    'capacity',
                    'compute_hardware',
                    'power',
                    'compute_relationship',
                    'contact'
                  )),
  -- What the source said, in its terms. Not a normalized value.
  statement     text not null
                  constraint facility_evidence_claims_statement_not_blank check (btrim(statement) <> ''),
  created_at    timestamptz not null default now(),
  constraint facility_evidence_claims_unique unique (evidence_id, claim_field, statement)
);

comment on table reference.facility_evidence_claims is
  'What one document supports, field by field. Evidence is never record-wide: a source supports the claims listed here and no others.';

create index facility_evidence_claims_evidence_idx on reference.facility_evidence_claims (evidence_id);
create index facility_evidence_claims_field_idx on reference.facility_evidence_claims (claim_field);

-- ---------------------------------------------------------------------------
-- Category-specific facts
-- ---------------------------------------------------------------------------

-- Megawatts, accelerator counts, process nodes, wafer sizes. These differ by
-- category and would be forty mostly-null columns on the facility, so they are
-- rows instead — and rows with a mandatory evidence link, which is the point.
-- The failure this prevents is the one the research package warns about in its
-- own methodology: attaching a GPU count or a MW figure to a facility whose
-- cited sources never stated either. Here a fact cannot exist without naming
-- the document it came from.
create table reference.facility_facts (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references reference.facilities (id) on delete cascade,
  fact_key      text not null
                  constraint facility_facts_key_format check (fact_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  -- Exactly one of these. A number that is really a list of process nodes, or a
  -- string that is really a megawatt figure, defeats both.
  numeric_value numeric,
  text_value    text,
  unit          text,
  -- Not nullable. A fact whose source is unknown is not a fact Urdais holds.
  evidence_id   uuid not null references reference.facility_evidence (id) on delete restrict,
  notes         text,
  created_at    timestamptz not null default now(),

  constraint facility_facts_one_value
    check ((numeric_value is null) <> (text_value is null)),
  constraint facility_facts_unit_belongs_to_a_number
    check (unit is null or numeric_value is not null),
  constraint facility_facts_text_not_blank
    check (text_value is null or btrim(text_value) <> ''),
  constraint facility_facts_unique unique (facility_id, fact_key)
);

comment on table reference.facility_facts is
  'Category-specific measured facts. evidence_id is NOT NULL on purpose: a megawatt or accelerator figure may not be stored unless a cited document states it.';

create index facility_facts_facility_idx on reference.facility_facts (facility_id);
create index facility_facts_key_idx on reference.facility_facts (fact_key);

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------

create table reference.facility_relationships (
  id                  uuid primary key default gen_random_uuid(),
  from_facility_id    uuid not null references reference.facilities (id) on delete cascade,
  to_facility_id      uuid not null references reference.facilities (id) on delete cascade,

  -- Directions are canonical, and each relationship is stored once. The
  -- research file lists many edges in both directions; an inverse is a way of
  -- reading a row, not a second row.
  --   hosted_by         from is the tenant or cluster; to is the campus
  --   same_campus       one site, two entities
  --   same_program      one company or programme, different sites
  --   supplies_power_to from generates; to consumes
  --   packaging_for     from packages or tests what to fabricates
  --   expansion_of      from is a later phase of to
  relationship_type   text not null
                        constraint facility_relationships_type_allowed check (relationship_type in (
                          'hosted_by',
                          'same_campus',
                          'same_program',
                          'supplies_power_to',
                          'packaging_for',
                          'expansion_of'
                        )),

  -- The document behind the edge. A relationship without evidence is an
  -- inference, and inferences do not gate publication.
  evidence_id         uuid references reference.facility_evidence (id) on delete restrict,
  notes               text,
  created_at          timestamptz not null default now(),

  constraint facility_relationships_not_self check (from_facility_id <> to_facility_id),
  constraint facility_relationships_unique unique (from_facility_id, to_facility_id, relationship_type)
);

comment on table reference.facility_relationships is
  'Directed, evidenced edges between facilities. Stored once in the canonical direction; an inverse is a reading, not a row. Never inferred from shared coordinates.';

create index facility_relationships_from_idx on reference.facility_relationships (from_facility_id);
create index facility_relationships_to_idx on reference.facility_relationships (to_facility_id);

-- The symmetric types describe an unordered pair, so the same pair must not be
-- storable in both directions.
create unique index facility_relationships_symmetric_pair_unique
  on reference.facility_relationships (
    least(from_facility_id, to_facility_id),
    greatest(from_facility_id, to_facility_id),
    relationship_type
  )
  where relationship_type in ('same_campus', 'same_program');

-- ---------------------------------------------------------------------------
-- The publication gates that span rows
-- ---------------------------------------------------------------------------

-- Deferred to commit, because an importer necessarily writes a facility before
-- its evidence and its edges. Checking at statement time would make a correct
-- transaction impossible and would push the rule back into application code,
-- which is exactly where it was not being enforced.
--
-- The work is per facility rather than over the whole published set: a batch
-- import fires this once per affected row, and a rule that rescanned every
-- published facility each time would be quadratic in the size of the map.
create or replace function reference.assert_facility_publishable(p_facility_id uuid)
returns void
language plpgsql
as $$
declare
  f record;
  n integer;
begin
  select * into f from reference.facilities where id = p_facility_id;
  -- Gone, or never published: there is nothing to defend.
  if f is null or f.publication_state <> 'published' then return; end if;

  -- A published facility stands on cited documents.
  select count(*) into n from reference.facility_evidence where facility_id = f.id;
  if n = 0 then
    raise exception 'facility % is published with no evidence', f.research_key
      using errcode = 'restrict_violation';
  end if;

  -- And on a document that placed it. A dot is a positional claim.
  select count(*) into n
    from reference.facility_evidence e
    join reference.facility_evidence_claims c on c.evidence_id = e.id
   where e.facility_id = f.id
     and c.claim_field in ('location', 'coordinates');
  if n = 0 then
    raise exception 'facility % is published with no source for its location', f.research_key
      using errcode = 'restrict_violation';
  end if;

  -- The power rule. Generation is on this map only where a document ties it to
  -- compute; a large plant near a data center is not evidence of one.
  if f.category = 'power_infrastructure' then
    select count(*) into n
      from reference.facility_relationships r
      join reference.facilities t on t.id = r.to_facility_id
     where r.from_facility_id = f.id
       and r.relationship_type = 'supplies_power_to'
       and r.evidence_id is not null
       and reference.facility_is_compute_category(t.category);
    if n = 0 then
      raise exception
        'power infrastructure % is published without an evidenced supplies_power_to relationship to a compute facility',
        f.research_key
        using errcode = 'restrict_violation';
    end if;
  end if;
end;
$$;

comment on function reference.assert_facility_publishable(uuid) is
  'Commit-time publication gates that span rows: a published facility has evidence, has a source for its location, and - when it is power infrastructure - an evidenced supply relationship into compute.';

create or replace function reference.facilities_publication_guard()
returns trigger
language plpgsql
as $$
begin
  perform reference.assert_facility_publishable(new.id);
  return null;
end;
$$;

create or replace function reference.facility_evidence_publication_guard()
returns trigger
language plpgsql
as $$
begin
  perform reference.assert_facility_publishable(coalesce(new.facility_id, old.facility_id));
  return null;
end;
$$;

-- Both endpoints, because an edge can be what justifies a publication (the
-- power rule reads the `from` side) and because recategorising the target can
-- invalidate one.
create or replace function reference.facility_relationship_publication_guard()
returns trigger
language plpgsql
as $$
begin
  perform reference.assert_facility_publishable(coalesce(new.from_facility_id, old.from_facility_id));
  perform reference.assert_facility_publishable(coalesce(new.to_facility_id, old.to_facility_id));
  return null;
end;
$$;

create constraint trigger facilities_publication_rules
  after insert or update on reference.facilities
  deferrable initially deferred
  for each row execute function reference.facilities_publication_guard();

-- Removing the evidence or the edge that justified a publication has to fail
-- as loudly as never having had it.
create constraint trigger facility_evidence_publication_rules
  after insert or update or delete on reference.facility_evidence
  deferrable initially deferred
  for each row execute function reference.facility_evidence_publication_guard();

-- A claim removed is a source no longer supporting what it supported, so the
-- claims table is guarded too: deleting the one claim that placed a facility
-- must not leave the facility published.
create or replace function reference.facility_claim_publication_guard()
returns trigger
language plpgsql
as $$
declare v_facility uuid;
begin
  select facility_id into v_facility from reference.facility_evidence
   where id = coalesce(new.evidence_id, old.evidence_id);
  if v_facility is not null then perform reference.assert_facility_publishable(v_facility); end if;
  return null;
end;
$$;

create constraint trigger facility_evidence_claims_publication_rules
  after insert or update or delete on reference.facility_evidence_claims
  deferrable initially deferred
  for each row execute function reference.facility_claim_publication_guard();

create constraint trigger facility_relationships_publication_rules
  after insert or update or delete on reference.facility_relationships
  deferrable initially deferred
  for each row execute function reference.facility_relationship_publication_guard();

-- ---------------------------------------------------------------------------
-- Housekeeping and security
-- ---------------------------------------------------------------------------

create or replace function reference.touch_facility_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger facilities_touch_updated_at
  before update on reference.facilities
  for each row execute function reference.touch_facility_updated_at();

alter table reference.facilities              enable row level security;
alter table reference.facility_aliases        enable row level security;
alter table reference.facility_evidence       enable row level security;
alter table reference.facility_evidence_claims enable row level security;
alter table reference.facility_facts          enable row level security;
alter table reference.facility_relationships  enable row level security;
