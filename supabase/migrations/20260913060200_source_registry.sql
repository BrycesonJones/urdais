-- Source registry: providers and their interfaces.
--
-- A provider (a company or publisher) is not a source. A source interface is
-- one concrete thing Urdais reads: an offer API, a price catalog, an
-- availability endpoint, a documentation page, a billing-terms page.
--
-- Access class and production-access state are operational metadata about how
-- Urdais reaches a source. They never determine economic eligibility.

create table reference.providers (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                   constraint providers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null,
  provider_kind  text not null
                   constraint providers_kind_allowed
                   check (provider_kind in ('cloud_provider', 'marketplace', 'hardware_vendor', 'other')),
  website        text,
  created_at     timestamptz not null default now()
);

comment on table reference.providers is
  'An external company or publisher that operates one or more source interfaces. Not a production constituent: no provider is seeded in Phase 3.';

create table reference.source_interfaces (
  id                       uuid primary key default gen_random_uuid(),
  provider_id              uuid not null references reference.providers (id) on delete restrict,
  slug                     text not null unique
                             constraint source_interfaces_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                     text not null,
  source_class             text not null
                             constraint source_interfaces_class_allowed check (source_class in (
                               'offer_interface',
                               'catalog_price_interface',
                               'availability_interface',
                               'product_reference_documentation',
                               'hardware_reference_documentation',
                               'provider_terms_documentation',
                               'price_surface'
                             )),
  canonical_url            text not null,
  is_machine_readable      boolean not null default false,
  access_class             text not null
                             constraint source_interfaces_access_allowed check (access_class in (
                               'public_unauthenticated',
                               'api_key',
                               'account_authentication',
                               'documentation',
                               'sales_only',
                               'unknown'
                             )),
  production_access_state  text not null default 'research_usable'
                             constraint source_interfaces_production_state_allowed check (production_access_state in (
                               'research_usable',
                               'production_review_pending',
                               'production_approved',
                               'production_blocked'
                             )),
  terms_review_state       text not null default 'not_reviewed'
                             constraint source_interfaces_terms_state_allowed check (terms_review_state in (
                               'not_reviewed',
                               'under_review',
                               'permitted',
                               'not_permitted'
                             )),
  is_active                boolean not null default true,
  notes                    text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  -- A source cannot be production-approved unless its terms have been reviewed
  -- and found permissive. Methodology: "A source cannot enter production unless
  -- Urdais has a permitted and reproducible collection path."
  constraint source_interfaces_approval_requires_permitted_terms
    check (production_access_state <> 'production_approved' or terms_review_state = 'permitted'),
  constraint source_interfaces_blocked_when_terms_forbid
    check (terms_review_state <> 'not_permitted' or production_access_state = 'production_blocked')
);

comment on table reference.source_interfaces is
  'One concrete interface Urdais reads from a provider. Access and production-approval state are operational metadata, never eligibility attributes.';

create index source_interfaces_provider_idx on reference.source_interfaces (provider_id);
create index source_interfaces_class_idx on reference.source_interfaces (source_class) where is_active;

alter table reference.providers          enable row level security;
alter table reference.source_interfaces  enable row level security;
