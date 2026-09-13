-- Normalized observations and their supporting evidence.
--
-- A normalized observation is Urdais's interpretation of one raw offer under one
-- instrument specification version. The same raw offer may be interpreted again
-- under a later version, or re-interpreted under the same version after a
-- correction; the earlier row is superseded, never edited or deleted. Phase 5
-- writes these rows; Phase 3 defines only what they hold.

create table pipeline.normalized_observations (
  id                              uuid primary key default gen_random_uuid(),
  raw_offer_id                    uuid not null references pipeline.raw_offers (id) on delete restrict,
  instrument_id                   uuid not null references reference.instruments (id) on delete restrict,
  instrument_spec_version_id      uuid not null references reference.instrument_spec_versions (id) on delete restrict,
  methodology_version_id          uuid not null references reference.methodology_versions (id) on delete restrict,
  normalizer_identity             text,

  -- Identity: canonical entities, kept distinct. Operator is NULL unless evidenced.
  seller_entity_id                uuid references reference.market_entities (id) on delete restrict,
  operator_entity_id              uuid references reference.market_entities (id) on delete restrict,
  operator_attribution_basis      text,
  marketplace_entity_id           uuid references reference.market_entities (id) on delete restrict,
  -- Capacity source: operator where determinable, seller otherwise. Derived, stored for lineage.
  capacity_source_entity_id       uuid references reference.market_entities (id) on delete restrict,

  -- Geography: canonical country plus the mapping version that produced it.
  canonical_region_code           char(2) references reference.canonical_regions (code) on delete restrict,
  region_mapping_id               uuid references reference.region_mappings (id) on delete restrict,

  -- Time, copied from the raw offer for indexing and kept semantically distinct.
  observed_at                     timestamptz not null,
  source_effective_at             timestamptz,
  availability_observed_at        timestamptz,

  -- Price, exact.
  normalized_price                numeric
                                    constraint normalized_observations_price_nonnegative
                                    check (normalized_price is null or normalized_price >= 0),
  normalized_currency             char(3) not null default 'USD'
                                    constraint normalized_observations_currency_format check (normalized_currency ~ '^[A-Z]{3}$'),
  normalized_unit                 text not null default 'accelerator_hour'
                                    constraint normalized_observations_unit_allowed check (normalized_unit in ('accelerator_hour')),
  price_conversion                jsonb,
  tax_basis                       text
                                    constraint normalized_observations_tax_basis_allowed
                                    check (tax_basis is null or tax_basis in ('exclusive', 'inclusive', 'unresolved')),
  tax_basis_evidence              text,
  mandatory_fee_interpretation    jsonb,
  usage_dependent_charges         jsonb,
  minimum_commitment              jsonb,
  promotional_indicators          jsonb,

  -- Hardware identity.
  hardware_identity_grade         text
                                    constraint normalized_observations_identity_grade_allowed
                                    check (hardware_identity_grade is null or hardware_identity_grade in ('A', 'B', 'C', 'insufficient')),
  full_device                     boolean,

  -- Topology.
  gpu_count                       integer
                                    constraint normalized_observations_gpu_count_positive check (gpu_count is null or gpu_count > 0),
  minimum_gpu_count               integer
                                    constraint normalized_observations_min_gpu_count_positive check (minimum_gpu_count is null or minimum_gpu_count > 0),
  minimum_topology_source_field   text,
  whole_node_required             boolean,
  machine_gpu_total               integer
                                    constraint normalized_observations_machine_total_positive check (machine_gpu_total is null or machine_gpu_total > 0),
  machine_fraction                numeric
                                    constraint normalized_observations_machine_fraction_range
                                    check (machine_fraction is null or (machine_fraction > 0 and machine_fraction <= 1)),
  topology_class                  text
                                    constraint normalized_observations_topology_allowed
                                    check (topology_class is null or topology_class in ('per_accelerator_allocation', 'whole_node', 'unknown')),

  -- Commercial form.
  procurement_mode                text
                                    constraint normalized_observations_procurement_allowed
                                    check (procurement_mode is null or procurement_mode in ('on_demand', 'interruptible', 'reserved', 'negotiated', 'unknown')),
  preemptible                     boolean,
  price_formation                 text
                                    constraint normalized_observations_formation_allowed
                                    check (price_formation is null or price_formation in ('posted', 'auction', 'dynamic', 'unknown')),
  service_product                 text
                                    constraint normalized_observations_service_product_allowed
                                    check (service_product is null or service_product in ('full_device_rental', 'serverless', 'managed_inference', 'other', 'unknown')),
  tenancy_grade                   text
                                    constraint normalized_observations_tenancy_allowed
                                    check (tenancy_grade is null or tenancy_grade in ('explicit', 'documented', 'ambiguous', 'shared_or_fractional', 'unknown')),

  -- Availability under the family vocabulary and the child's evidence scale.
  availability_state              text
                                    constraint normalized_observations_availability_allowed
                                    check (availability_state is null or availability_state in ('available', 'limited', 'waitlisted', 'sold_out', 'quote_required', 'unknown')),
  availability_evidence_grade     smallint
                                    constraint normalized_observations_availability_grade_range
                                    check (availability_evidence_grade is null or availability_evidence_grade between 1 and 6),
  availability_quantity           integer
                                    constraint normalized_observations_availability_quantity_positive
                                    check (availability_quantity is null or availability_quantity > 0),

  -- Bundle, per accelerator. Optional diagnostic until the envelope level exists.
  vcpu_per_accelerator            numeric
                                    constraint normalized_observations_vcpu_nonnegative check (vcpu_per_accelerator is null or vcpu_per_accelerator >= 0),
  host_memory_gb_per_accelerator  numeric
                                    constraint normalized_observations_memory_nonnegative check (host_memory_gb_per_accelerator is null or host_memory_gb_per_accelerator >= 0),
  storage_gb_per_accelerator      numeric
                                    constraint normalized_observations_storage_nonnegative check (storage_gb_per_accelerator is null or storage_gb_per_accelerator >= 0),
  intra_node_interconnect         text,
  inter_node_fabric               text,
  bundle_extra                    jsonb,

  -- Family classification of the evidence.
  observation_type                text
                                    constraint normalized_observations_type_allowed
                                    check (observation_type is null or observation_type in (
                                      'current_accessible_offer', 'firm_written_quote', 'concluded_transaction',
                                      'advertised_non_accessible_price', 'indicative_or_list_price'
                                    )),
  source_quality_grade            smallint
                                    constraint normalized_observations_source_grade_range
                                    check (source_quality_grade is null or source_quality_grade between 1 and 8),

  -- Supersession. The only mutable columns, and only once. The self-reference is
  -- deferred so a correction can be performed in one transaction: mark the old
  -- row superseded by the new id, then insert the new row; the one-current index
  -- is satisfied at the insert and the FK is checked at commit.
  superseded_by_id                uuid references pipeline.normalized_observations (id) on delete restrict
                                    deferrable initially deferred,
  superseded_at                   timestamptz,
  supersession_reason             text,

  created_at                      timestamptz not null default now(),

  constraint normalized_observations_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint normalized_observations_availability_time_with_state
    check (availability_state is null or availability_state = 'unknown' or availability_observed_at is not null),
  constraint normalized_observations_region_with_mapping
    check (canonical_region_code is null or region_mapping_id is not null)
);

comment on table pipeline.normalized_observations is
  'One interpretation of one raw offer under one instrument specification version. Reprocessing under a later version adds a row; correcting under the same version supersedes the prior row. Rows are never edited except to be superseded.';
comment on column pipeline.normalized_observations.availability_observed_at is
  'The time Urdais last directly re-observed the availability evidence. Explicitly not the time availability changed.';
comment on column pipeline.normalized_observations.capacity_source_entity_id is
  'Derived: operator_entity_id where determinable, seller_entity_id otherwise.';

-- One current interpretation per raw offer per spec version. Superseded rows do
-- not count, so re-normalizing under the same version is a supersede-then-insert.
create unique index normalized_observations_current_per_spec_idx
  on pipeline.normalized_observations (raw_offer_id, instrument_spec_version_id)
  where superseded_by_id is null;

create index normalized_observations_instrument_time_idx
  on pipeline.normalized_observations (instrument_id, observed_at desc)
  where superseded_by_id is null;
create index normalized_observations_region_time_idx
  on pipeline.normalized_observations (instrument_id, canonical_region_code, observed_at desc)
  where superseded_by_id is null and canonical_region_code is not null;
create index normalized_observations_seller_time_idx
  on pipeline.normalized_observations (seller_entity_id, observed_at desc)
  where superseded_by_id is null and seller_entity_id is not null;
create index normalized_observations_raw_offer_idx
  on pipeline.normalized_observations (raw_offer_id);

create trigger normalized_observations_supersede_only
  before update or delete on pipeline.normalized_observations
  for each row execute function pipeline.allow_only_supersession();

-- Evidence that supports a normalized assertion and lives outside the offer
-- itself: hardware documentation, tenancy statements, billing terms.
create table pipeline.observation_evidence (
  id                          uuid primary key default gen_random_uuid(),
  normalized_observation_id   uuid not null references pipeline.normalized_observations (id) on delete restrict,
  evidence_role               text not null
                                constraint observation_evidence_role_allowed check (evidence_role in (
                                  'hardware_identity', 'tenancy', 'topology', 'tax_basis', 'region_mapping',
                                  'bundle', 'availability', 'mandatory_fees', 'procurement_mode', 'service_product',
                                  'operator_attribution'
                                )),
  evidence_retrieval_id       uuid not null references pipeline.source_retrievals (id) on delete restrict,
  evidence_excerpt            text,
  notes                       text,
  created_at                  timestamptz not null default now(),
  unique (normalized_observation_id, evidence_role, evidence_retrieval_id)
);

comment on table pipeline.observation_evidence is
  'Links a normalized observation to a retrieval that supports one of its assertions, with the role the evidence plays.';

create index observation_evidence_retrieval_idx on pipeline.observation_evidence (evidence_retrieval_id);

create trigger observation_evidence_append_only
  before update or delete on pipeline.observation_evidence
  for each row execute function pipeline.forbid_mutation();

revoke delete, truncate on pipeline.normalized_observations from service_role;
revoke update, delete, truncate on pipeline.observation_evidence from service_role;

alter table pipeline.normalized_observations enable row level security;
alter table pipeline.observation_evidence    enable row level security;
