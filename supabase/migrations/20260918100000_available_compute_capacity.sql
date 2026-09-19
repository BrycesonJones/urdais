-- Available Compute Capacity: observed market supply.
--
-- This is a dataset, not an index. It answers one question — how much rentable
-- AI compute is visibly available right now — and it answers it only from what
-- a source explicitly states.
--
-- The rule the schema exists to enforce is that a price is not a capacity.
-- A seller publishing an hourly rate for an H100 has told Urdais what an H100
-- costs, not that one can be had. Those are different observations of different
-- things, and conflating them would let a price feed silently become a supply
-- figure. So capacity observations are their own rows with their own
-- constraints, siblings of pipeline.normalized_observations off the same raw
-- offer rather than a column added to it:
--
--   source_retrievals -> raw_offers -+-> normalized_observations   (what it costs)
--                                    \-> capacity_observations     (what is there)
--
-- The measurement hierarchy is a check constraint, not a convention, because
-- the failure it prevents is silent. A source that says "available" without a
-- number must not be storable as the number 1, and a source that says nothing
-- must not be storable as the number 0. Tier is declared per row and the
-- columns legal for that tier are the only ones that may be populated.

-- ---------------------------------------------------------------------------
-- What each source interface can actually tell us.
-- ---------------------------------------------------------------------------

-- Machine-readable form of the source audit. The UI's coverage statement and
-- the aggregation's admissibility both read this table rather than a constant
-- in code, so that adding a source is a migration and not a deploy.
create table reference.capacity_signal_capabilities (
  id                          uuid primary key default gen_random_uuid(),
  source_interface_id         uuid not null unique
                                references reference.source_interfaces (id) on delete restrict,

  -- The best tier this interface can support, established by reading it or its
  -- documentation. 1 exact quantity, 2 quantity range, 3 availability state,
  -- 4 nothing usable.
  max_measurement_tier        smallint not null
                                constraint capacity_capabilities_tier_range
                                check (max_measurement_tier between 1 and 4),

  supports_exact_quantity     boolean not null default false,
  supports_quantity_range     boolean not null default false,
  supports_availability_state boolean not null default false,
  supports_region             boolean not null default false,
  supports_configuration      boolean not null default false,

  -- The unit a quantity would arrive in. Null where the interface carries no
  -- quantity at all; a count of nodes is not a count of accelerators.
  quantity_unit               text
                                constraint capacity_capabilities_unit_allowed
                                check (quantity_unit is null or quantity_unit in ('accelerator', 'node', 'instance')),

  -- How long an observation from this interface may still be called current.
  -- Per interface because collection cadence and volatility differ; there is no
  -- single right answer for a daily price mirror and a live inventory API.
  freshness_horizon_seconds   integer
                                constraint capacity_capabilities_horizon_positive
                                check (freshness_horizon_seconds is null or freshness_horizon_seconds > 0),

  -- The evidence. What was read, what it said, and what it did not say.
  assessment                  text not null,
  assessment_document_path    text,
  assessed_at                 timestamptz not null default now(),

  -- The tier claim and the boolean flags must agree. A capability table that
  -- can disagree with itself is worse than none.
  constraint capacity_capabilities_tier_matches_flags check (
    (max_measurement_tier = 1 and supports_exact_quantity)
    or (max_measurement_tier = 2 and supports_quantity_range and not supports_exact_quantity)
    or (max_measurement_tier = 3 and supports_availability_state and not supports_quantity_range and not supports_exact_quantity)
    or (max_measurement_tier = 4 and not supports_exact_quantity and not supports_quantity_range and not supports_availability_state)
  ),
  -- A quantity-bearing interface states its unit; a tier-3 or tier-4 one has none to state.
  constraint capacity_capabilities_quantity_has_unit check (
    (max_measurement_tier <= 2) = (quantity_unit is not null)
  )
);

comment on table reference.capacity_signal_capabilities is
  'What capacity signal each source interface exposes, established by reading it. Drives coverage reporting and admissibility. Separate from permission: a capable source may still be barred.';

comment on column reference.capacity_signal_capabilities.max_measurement_tier is
  'Best supported tier. 1 exact quantity, 2 range, 3 availability state only, 4 no usable capacity signal.';

create index capacity_capabilities_tier_idx
  on reference.capacity_signal_capabilities (max_measurement_tier);

-- ---------------------------------------------------------------------------
-- The observations themselves.
-- ---------------------------------------------------------------------------

create table pipeline.capacity_observations (
  id                          uuid primary key default gen_random_uuid(),

  -- Lineage. Every capacity observation descends from one raw offer, which
  -- descends from one retrieval, which names its interface and its permission
  -- grant. There is no route into this table that bypasses that chain.
  raw_offer_id                uuid not null references pipeline.raw_offers (id) on delete restrict,
  methodology_version_id      uuid not null references reference.methodology_versions (id) on delete restrict,
  collector_identity          text,

  -- Identity, reusing the canonical entities. No second identity system.
  seller_entity_id            uuid references reference.market_entities (id) on delete restrict,
  operator_entity_id          uuid references reference.market_entities (id) on delete restrict,
  marketplace_entity_id       uuid references reference.market_entities (id) on delete restrict,
  -- Operator where determinable, seller otherwise. The unit of deduplication:
  -- two interfaces reporting the same capacity source are one supply, not two.
  capacity_source_entity_id   uuid references reference.market_entities (id) on delete restrict,

  canonical_region_code       char(2) references reference.canonical_regions (code) on delete restrict,
  region_mapping_id           uuid references reference.region_mappings (id) on delete restrict,
  -- The region exactly as the source spelled it, kept even when it maps.
  source_native_region        text,

  -- Normalized hardware identity, plus the grade of the evidence behind it.
  normalized_gpu_type         text,
  gpu_vendor                  text,
  gpu_model                   text,
  form_factor                 text,
  gpu_memory_gb               numeric
                                constraint capacity_observations_memory_positive
                                check (gpu_memory_gb is null or gpu_memory_gb > 0),
  hardware_identity_grade     text
                                constraint capacity_observations_identity_grade_allowed
                                check (hardware_identity_grade is null or hardware_identity_grade in ('A', 'B', 'C', 'insufficient')),
  gpus_per_unit               integer
                                constraint capacity_observations_gpus_per_unit_positive
                                check (gpus_per_unit is null or gpus_per_unit > 0),
  service_tier                jsonb,

  -- The measurement. measurement_type is the tier, and it governs which of the
  -- value columns below may be populated.
  measurement_type            text not null
                                constraint capacity_observations_measurement_allowed
                                check (measurement_type in ('exact_quantity', 'quantity_range', 'availability_state', 'unknown')),

  -- Tier 1. Zero is a real and useful observation — a source that says it has
  -- none available has told us something — so this is >= 0, and the thing that
  -- means "we do not know" is a null column with measurement_type 'unknown',
  -- never a zero.
  available_quantity          integer
                                constraint capacity_observations_quantity_nonnegative
                                check (available_quantity is null or available_quantity >= 0),

  -- Tier 2.
  quantity_min                integer
                                constraint capacity_observations_min_nonnegative
                                check (quantity_min is null or quantity_min >= 0),
  quantity_max                integer
                                constraint capacity_observations_max_nonnegative
                                check (quantity_max is null or quantity_max >= 0),

  -- What a quantity counts. Summing accelerators and nodes into one total is
  -- the arithmetic this column exists to prevent.
  quantity_unit               text
                                constraint capacity_observations_unit_allowed
                                check (quantity_unit is null or quantity_unit in ('accelerator', 'node', 'instance')),

  -- Tier 3, and the categorical reading of tiers 1 and 2 where the source gives one.
  availability_state          text
                                constraint capacity_observations_state_allowed
                                check (availability_state is null or availability_state in ('available', 'limited', 'waitlisted', 'sold_out', 'quote_required', 'unknown')),
  availability_evidence_grade smallint
                                constraint capacity_observations_grade_range
                                check (availability_evidence_grade is null or availability_evidence_grade between 1 and 6),

  -- Provenance of the reading: the source's own words and the field they came
  -- from, so the normalization can be checked rather than trusted.
  source_native_value         text,
  source_native_field         text,

  -- Time. observed_at is when the source was read; availability_observed_at is
  -- when the availability itself was true, where the source says. No source
  -- found in the Phase 1 study states the latter, so it is nullable and the
  -- freshness policy rests on collection time.
  observed_at                 timestamptz not null,
  source_effective_at         timestamptz,
  availability_observed_at    timestamptz,
  retrieved_at                timestamptz not null,

  -- Corrections supersede; nothing here is edited or deleted, and a re-run
  -- writes a new row rather than overwriting the last. The series is the point.
  superseded_by_id            uuid references pipeline.capacity_observations (id) on delete restrict,
  superseded_at               timestamptz,
  supersession_reason         text,

  created_at                  timestamptz not null default now(),

  -- The measurement hierarchy, enforced. Each tier may populate its own
  -- columns and no others.
  constraint capacity_observations_tier_shape check (
    case measurement_type
      when 'exact_quantity' then
        available_quantity is not null
        and quantity_min is null and quantity_max is null
        and quantity_unit is not null
      when 'quantity_range' then
        quantity_min is not null and quantity_max is not null
        and quantity_max >= quantity_min
        and available_quantity is null
        and quantity_unit is not null
      when 'availability_state' then
        available_quantity is null and quantity_min is null and quantity_max is null
        and quantity_unit is null
        and availability_state is not null
        and availability_state <> 'unknown'
      when 'unknown' then
        available_quantity is null and quantity_min is null and quantity_max is null
        and quantity_unit is null
        and (availability_state is null or availability_state = 'unknown')
      else false
    end
  ),
  -- A quantity is a claim, and a claim needs evidence behind it.
  constraint capacity_observations_quantity_needs_evidence check (
    measurement_type not in ('exact_quantity', 'quantity_range')
    or availability_evidence_grade is not null
  ),
  -- Supersession is all-or-nothing.
  constraint capacity_observations_supersession_complete check (
    (superseded_by_id is null and superseded_at is null)
    or (superseded_by_id is not null and superseded_at is not null)
  ),
  constraint capacity_observations_not_self_superseded check (superseded_by_id is null or superseded_by_id <> id)
);

comment on table pipeline.capacity_observations is
  'One observation of available compute supply, from one raw offer. Sibling of normalized_observations: that table holds what compute costs, this one holds what is there. A price row can never become a capacity row because it is a different row.';

comment on column pipeline.capacity_observations.measurement_type is
  'The measurement tier. exact_quantity, quantity_range, availability_state (no number known), or unknown (no usable signal).';

comment on column pipeline.capacity_observations.available_quantity is
  'Tier 1 only. Zero means the source reported none available, which is an observation. Not knowing is measurement_type unknown with this column null.';

comment on column pipeline.capacity_observations.quantity_unit is
  'What a quantity counts. Accelerator counts and node counts are not addable; aggregation converts only where gpus_per_unit is known.';

comment on column pipeline.capacity_observations.capacity_source_entity_id is
  'Operator where determinable, seller otherwise. The deduplication key: two interfaces reporting one capacity source describe one supply.';

create index capacity_observations_observed_idx
  on pipeline.capacity_observations (observed_at desc) where superseded_by_id is null;
create index capacity_observations_gpu_idx
  on pipeline.capacity_observations (normalized_gpu_type, observed_at desc) where superseded_by_id is null;
create index capacity_observations_region_idx
  on pipeline.capacity_observations (canonical_region_code, observed_at desc) where superseded_by_id is null;
create index capacity_observations_source_entity_idx
  on pipeline.capacity_observations (capacity_source_entity_id, observed_at desc) where superseded_by_id is null;
create index capacity_observations_raw_offer_idx
  on pipeline.capacity_observations (raw_offer_id);

alter table reference.capacity_signal_capabilities enable row level security;
alter table pipeline.capacity_observations         enable row level security;
