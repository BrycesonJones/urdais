-- Market entities, their roles, canonical geography, and versioned region mappings.
--
-- Seller, operator, marketplace and marketplace host are roles an entity may
-- hold, never one string. A capacity source is derived later (operator where
-- determinable, seller otherwise) and is not stored as a role.
--
-- Canonical region for UCPI-H100-SXM is the country, ISO 3166-1 alpha-2. Native
-- region values are preserved on raw offers; the mapping from native value to
-- canonical country is versioned, evidenced, and allowed to refuse.

create table reference.market_entities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
                constraint market_entities_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table reference.market_entities is
  'A commercial party in the compute market. Roles are attached separately; one entity may be a seller and a marketplace host, or a seller and an operator.';

create table reference.entity_roles (
  entity_id       uuid not null references reference.market_entities (id) on delete restrict,
  role            text not null
                    constraint entity_roles_role_allowed
                    check (role in ('seller', 'operator', 'marketplace', 'marketplace_host')),
  evidence        text,
  effective_from  timestamptz,
  effective_to    timestamptz,
  created_at      timestamptz not null default now(),
  primary key (entity_id, role),
  constraint entity_roles_interval_ordered
    check (effective_from is null or effective_to is null or effective_to > effective_from)
);

comment on table reference.entity_roles is
  'Roles held by a market entity. An operator role is only ever recorded on evidence; it is never inferred from price, geography or configuration similarity.';

create table reference.canonical_regions (
  code          char(2) primary key
                  constraint canonical_regions_code_format check (code ~ '^[A-Z]{2}$')
                  -- ISO 3166-1 alpha-2 user-assigned and exceptionally reserved codes are
                  -- not countries. "EU" in particular must never become a canonical region.
                  constraint canonical_regions_code_not_reserved check (
                    code !~ '^(Q[M-Z]|X[A-Z]|AA|AC|CP|CQ|DG|EA|EU|EZ|FX|IC|SU|TA|UK|UN|ZZ)$'
                  ),
  name          text not null,
  region_level  text not null default 'country'
                  constraint canonical_regions_level_allowed check (region_level = 'country'),
  created_at    timestamptz not null default now()
);

comment on table reference.canonical_regions is
  'Canonical UCPI regions. For UCPI-H100-SXM the level is country, ISO 3166-1 alpha-2. Reserved and user-assigned codes are rejected so a supra-national grouping can never be adopted as a region.';

create table reference.region_mappings (
  id                     uuid primary key default gen_random_uuid(),
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  native_region_value    text not null,
  canonical_region_code  char(2) references reference.canonical_regions (code) on delete restrict,
  mapping_status         text not null
                           constraint region_mappings_status_allowed check (mapping_status in ('mapped', 'unresolved')),
  confidence             text
                           constraint region_mappings_confidence_allowed check (confidence is null or confidence in ('high', 'medium', 'low')),
  evidence               text not null,
  evidence_retrieval_id  uuid,   -- FK to pipeline.source_retrievals added once that table exists
  version                integer not null default 1
                           constraint region_mappings_version_positive check (version > 0),
  effective_from         timestamptz not null,
  effective_to           timestamptz,
  created_at             timestamptz not null default now(),
  unique (source_interface_id, native_region_value, version),
  constraint region_mappings_interval_ordered
    check (effective_to is null or effective_to > effective_from),
  -- A mapped row names a country and a confidence; an unresolved row names neither.
  -- There is no third state and no "representative country".
  constraint region_mappings_status_consistent check (
    (mapping_status = 'mapped'     and canonical_region_code is not null and confidence is not null) or
    (mapping_status = 'unresolved' and canonical_region_code is null     and confidence is null)
  )
);

comment on table reference.region_mappings is
  'Versioned mapping from a source-native region value to a canonical country. A value that resolves only to a supra-national grouping is recorded as unresolved, never assigned to a representative country. Historical observations keep the mapping version that produced them.';

-- At most one current (open-ended) mapping per native value per interface.
create unique index region_mappings_one_current_idx
  on reference.region_mappings (source_interface_id, native_region_value)
  where effective_to is null;

create index region_mappings_lookup_idx
  on reference.region_mappings (source_interface_id, native_region_value, effective_from desc);

-- Source-native identifiers observed on interfaces, with their canonical mapping
-- and stability status. Marketplace host identity is provisional until a
-- cross-time study closes MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED.
create table reference.native_identifiers (
  id                   uuid primary key default gen_random_uuid(),
  source_interface_id  uuid not null references reference.source_interfaces (id) on delete restrict,
  identifier_type      text not null
                         constraint native_identifiers_type_allowed check (identifier_type in (
                           'host_id', 'machine_id', 'seller_id', 'operator_id', 'marketplace_id',
                           'offer_id', 'sku', 'instance_type', 'other'
                         )),
  native_value         text not null,
  market_entity_id     uuid references reference.market_entities (id) on delete restrict,
  stability_status     text not null default 'unresolved'
                         constraint native_identifiers_stability_allowed
                         check (stability_status in ('unresolved', 'provisional', 'stable', 'unstable')),
  stability_evidence   text,
  first_observed_at    timestamptz,
  last_observed_at     timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  unique (source_interface_id, identifier_type, native_value),
  constraint native_identifiers_observed_ordered
    check (first_observed_at is null or last_observed_at is null or last_observed_at >= first_observed_at),
  -- A stability claim needs evidence.
  constraint native_identifiers_stable_requires_evidence
    check (stability_status = 'unresolved' or stability_evidence is not null)
);

comment on table reference.native_identifiers is
  'Identifiers as a source expresses them, kept apart from canonical entity identity. stability_status answers whether the identifier persists over time; it starts unresolved and is only raised on evidence.';

create index native_identifiers_entity_idx on reference.native_identifiers (market_entity_id);

alter table reference.market_entities    enable row level security;
alter table reference.entity_roles       enable row level security;
alter table reference.canonical_regions  enable row level security;
alter table reference.region_mappings    enable row level security;
alter table reference.native_identifiers enable row level security;
