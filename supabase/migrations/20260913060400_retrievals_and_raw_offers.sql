-- Source retrievals and immutable raw offers.
--
-- A retrieval is one interaction with a source interface, inserted once, after
-- the response (or error) is known. A raw offer is one record from that
-- response, kept exactly as the source expressed it. Both are append-only for
-- every role; the trigger raises on UPDATE and DELETE.
--
-- Enumeration completeness is first-class: Phase 2 found an interface that
-- returned incomplete subsets while its own truncation flag said otherwise.

create table pipeline.source_retrievals (
  id                        uuid primary key default gen_random_uuid(),
  source_interface_id       uuid not null references reference.source_interfaces (id) on delete restrict,
  -- Collector-supplied deterministic key so a retried write is a no-op.
  idempotency_key           text not null unique,
  requested_at              timestamptz not null,
  completed_at              timestamptz,
  request_method            text not null
                              constraint source_retrievals_method_allowed
                              check (request_method in ('GET', 'POST', 'manual_read')),
  request_url               text not null,
  request_parameters        jsonb not null default '{}'::jsonb,
  response_status           integer
                              constraint source_retrievals_status_range
                              check (response_status is null or (response_status between 100 and 599)),
  response_content_type     text,
  response_hash             text
                              constraint source_retrievals_hash_format
                              check (response_hash is null or response_hash ~ '^[0-9a-f]{64}$'),
  response_byte_length      bigint
                              constraint source_retrievals_length_nonnegative
                              check (response_byte_length is null or response_byte_length >= 0),
  response_body             jsonb,
  raw_artifact_ref          text,
  record_count              integer
                              constraint source_retrievals_count_nonnegative
                              check (record_count is null or record_count >= 0),
  source_pagination         jsonb,
  -- What the source itself claimed about completeness, if it claimed anything.
  source_claimed_complete   boolean,
  -- What Urdais concluded. Never buried in JSON.
  enumeration_assessment    text not null
                              constraint source_retrievals_enumeration_allowed check (enumeration_assessment in (
                                'complete',
                                'incomplete',
                                'unknown',
                                'claimed_complete_observed_incomplete'
                              )),
  enumeration_evidence      text,
  error                     jsonb,
  collector_identity        text,
  created_at                timestamptz not null default now(),
  constraint source_retrievals_completed_after_requested
    check (completed_at is null or completed_at >= requested_at),
  -- The contradiction state is only meaningful when the source did claim completeness.
  constraint source_retrievals_contradiction_requires_claim
    check (enumeration_assessment <> 'claimed_complete_observed_incomplete' or source_claimed_complete is true),
  -- A large body lives in an artifact; a structured body lives inline; either is fine, but a
  -- successful retrieval must retain one of them or a hash, or it is not evidence.
  constraint source_retrievals_success_retains_evidence
    check (response_status is null or response_status >= 400 or response_hash is not null)
);

comment on table pipeline.source_retrievals is
  'One interaction with a source interface, recorded once after completion. Append-only. enumeration_assessment is Urdais''s own conclusion about whether the response enumerated the population, kept separate from what the source claimed.';

create index source_retrievals_interface_time_idx
  on pipeline.source_retrievals (source_interface_id, requested_at desc);

create trigger source_retrievals_append_only
  before update or delete on pipeline.source_retrievals
  for each row execute function pipeline.forbid_mutation();

-- Now that retrievals exist, region mapping evidence can point at one.
alter table reference.region_mappings
  add constraint region_mappings_evidence_retrieval_fkey
  foreign key (evidence_retrieval_id) references pipeline.source_retrievals (id) on delete restrict;

create table pipeline.raw_offers (
  id                          uuid primary key default gen_random_uuid(),
  retrieval_id                uuid not null references pipeline.source_retrievals (id) on delete restrict,
  row_ordinal                 integer not null
                                constraint raw_offers_ordinal_nonnegative check (row_ordinal >= 0),
  source_native_offer_id      text,
  source_native_product_id    text,
  record_hash                 text not null
                                constraint raw_offers_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  raw_payload                 jsonb not null,
  raw_artifact_ref            text,

  -- Time. source_effective_at is what the source says; it has no default and is
  -- never derived from observed_at. availability_observed_at is when the
  -- availability fields on this row were observed, where the row carries any.
  observed_at                 timestamptz not null,
  source_effective_at         timestamptz,
  availability_observed_at    timestamptz,

  -- Product identity as the source states it.
  native_product_label        text,
  native_vendor               text,
  native_gpu_model            text,
  native_architecture         text,
  native_form_factor          text,
  native_gpu_memory_mb        integer
                                constraint raw_offers_gpu_memory_positive check (native_gpu_memory_mb is null or native_gpu_memory_mb > 0),

  -- Commercial identity as the source states it.
  native_seller_id            text,
  native_operator_id          text,
  native_marketplace_id       text,
  native_host_id              text,
  native_machine_id           text,

  -- Price, exact. Nullable because quote-only offers carry none.
  native_price                numeric
                                constraint raw_offers_price_nonnegative check (native_price is null or native_price >= 0),
  native_currency             char(3)
                                constraint raw_offers_currency_format check (native_currency is null or native_currency ~ '^[A-Z]{3}$'),
  native_billing_unit         text,
  native_price_components     jsonb,
  native_tax_fields           jsonb,
  native_fee_fields           jsonb,
  native_promotional_fields   jsonb,
  native_bid_fields           jsonb,
  native_minimum_spend        jsonb,

  -- Product structure as the source states it.
  native_procurement_mode     text,
  native_commitment           text,
  native_preemptible          boolean,
  native_tenancy_fields       jsonb,
  native_gpu_count            integer
                                constraint raw_offers_gpu_count_positive check (native_gpu_count is null or native_gpu_count > 0),
  native_minimum_gpu_count    integer
                                constraint raw_offers_min_gpu_count_positive check (native_minimum_gpu_count is null or native_minimum_gpu_count > 0),
  native_topology             text,
  native_machine_gpu_total    integer
                                constraint raw_offers_machine_total_positive check (native_machine_gpu_total is null or native_machine_gpu_total > 0),
  -- A machine-occupancy fraction where a source exposes one. Never a device fraction.
  native_machine_fraction     numeric
                                constraint raw_offers_machine_fraction_range
                                check (native_machine_fraction is null or (native_machine_fraction > 0 and native_machine_fraction <= 1)),

  -- Geography as the source states it, finest disclosed level retained.
  native_region               text,
  native_geolocation          text,
  native_geography_extra      jsonb,

  -- Availability as the source states it.
  native_availability_value   text,
  native_availability_fields  jsonb,

  -- Bundle as the source states it.
  native_vcpu                 numeric
                                constraint raw_offers_vcpu_nonnegative check (native_vcpu is null or native_vcpu >= 0),
  native_host_memory_mb       numeric
                                constraint raw_offers_host_memory_nonnegative check (native_host_memory_mb is null or native_host_memory_mb >= 0),
  native_storage_gb           numeric
                                constraint raw_offers_storage_nonnegative check (native_storage_gb is null or native_storage_gb >= 0),
  native_network              jsonb,
  native_nvlink               jsonb,
  native_bundle_extra         jsonb,

  created_at                  timestamptz not null default now(),

  -- Idempotency: a retry re-inserting the same retrieval's rows is a no-op.
  -- Identical observations at different times are different rows on purpose.
  unique (retrieval_id, row_ordinal),
  constraint raw_offers_availability_observed_with_value
    check (native_availability_value is null or availability_observed_at is not null)
);

comment on table pipeline.raw_offers is
  'One record from one retrieval, as the source expressed it. Append-only for every role. Every native_* column is nullable because source reality is sparse; typed columns exist for methodology-critical facts, raw_payload keeps the whole record.';
comment on column pipeline.raw_offers.source_effective_at is
  'When the source itself says the price took effect. NULL when the source states nothing. Never defaulted to observed_at.';
comment on column pipeline.raw_offers.availability_observed_at is
  'When Urdais observed the availability fields on this row. Not an availability-change time and not a provider event time.';
comment on column pipeline.raw_offers.native_machine_fraction is
  'Fraction of a machine''s accelerators this offer comprises, where a source exposes one. It is not a device fraction and must never be read as one.';

create index raw_offers_retrieval_idx on pipeline.raw_offers (retrieval_id, row_ordinal);
create index raw_offers_observed_idx on pipeline.raw_offers (observed_at desc);
create index raw_offers_native_offer_idx on pipeline.raw_offers (source_native_offer_id) where source_native_offer_id is not null;
create index raw_offers_native_seller_idx on pipeline.raw_offers (native_seller_id, observed_at desc) where native_seller_id is not null;
create index raw_offers_native_host_idx on pipeline.raw_offers (native_host_id, observed_at desc) where native_host_id is not null;
create index raw_offers_record_hash_idx on pipeline.raw_offers (record_hash);

create trigger raw_offers_append_only
  before update or delete on pipeline.raw_offers
  for each row execute function pipeline.forbid_mutation();

-- Belt and braces on top of the trigger: even service_role holds no UPDATE or
-- DELETE privilege on evidence tables.
revoke update, delete, truncate on pipeline.source_retrievals from service_role;
revoke update, delete, truncate on pipeline.raw_offers from service_role;

alter table pipeline.source_retrievals enable row level security;
alter table pipeline.raw_offers        enable row level security;
