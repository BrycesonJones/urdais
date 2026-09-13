-- Methodology vocabulary: exclusion reasons and diagnostic codes.
--
-- These are the exact codes defined by UCPI-H100-SXM 0.1.1-draft, section
-- "Exclusion, Status, and Diagnostic Vocabulary", and its stage criteria. An
-- exclusion makes an observation ineligible at a named stage. A diagnostic
-- records a property of an observation that remains eligible. They are
-- different tables so they can never be confused.

create table reference.exclusion_reasons (
  code         text primary key
                 constraint exclusion_reasons_code_format check (code ~ '^[A-Z][A-Z0-9_]+$'),
  stage        text not null
                 constraint exclusion_reasons_stage_allowed check (stage in ('P0', 'P1', 'P2')),
  category     text not null
                 constraint exclusion_reasons_category_allowed check (category in (
                   'identity', 'product_and_commercial_form', 'region', 'availability',
                   'freshness', 'price_integrity', 'source'
                 )),
  description  text not null
);

comment on table reference.exclusion_reasons is
  'Named reasons an observation fails a stage. The stage is the first population the reason removes an observation from.';

insert into reference.exclusion_reasons (code, stage, category, description) values
  -- P0: identity qualification
  ('WRONG_HARDWARE',                     'P0', 'identity', 'The accelerator is a different model or generation.'),
  ('HARDWARE_VARIANT_UNRESOLVED',        'P0', 'identity', 'The form factor cannot be established: a bare model name, or a label that does not distinguish SXM from an NVL-based system.'),
  ('FRACTIONAL_OR_SHARED_DEVICE',        'P0', 'identity', 'The offer is a sub-device partition or a shared device.'),
  -- P1: selected-product eligibility
  ('WRONG_SERVICE_PRODUCT',              'P1', 'product_and_commercial_form', 'Not a persistent full-device rental: serverless execution, a managed inference endpoint, or another service product.'),
  ('WRONG_PROCUREMENT_MODE',             'P1', 'product_and_commercial_form', 'Not on-demand: reserved, committed, or negotiated.'),
  ('PREEMPTIBLE',                        'P1', 'product_and_commercial_form', 'Interruptible capacity the seller may reclaim.'),
  ('PROMOTIONAL_PRICE',                  'P1', 'product_and_commercial_form', 'A promotional, trial or subsidized rate rather than the ordinary commercial price.'),
  ('MINIMUM_TOPOLOGY_UNKNOWN',           'P1', 'product_and_commercial_form', 'The minimum purchasable accelerator count could not be established from a source field.'),
  ('WHOLE_NODE_REQUIRED',                'P1', 'product_and_commercial_form', 'The buyer must take a whole node; the offer belongs to a whole-node sibling, not this child.'),
  ('TENANCY_UNRESOLVED',                 'P1', 'product_and_commercial_form', 'Tenancy evidence grade is Ambiguous or Unknown; exclusivity was not established by statement or documentation.'),
  -- P2: headline eligibility
  ('REGION_UNRESOLVED',                  'P2', 'region', 'The native region does not map to a canonical country under a current mapping, including supra-national groupings.'),
  ('AVAILABILITY_UNKNOWN',               'P2', 'availability', 'The source discloses no availability state.'),
  ('UNAVAILABLE',                        'P2', 'availability', 'The availability state is Sold out.'),
  ('WAITLISTED',                         'P2', 'availability', 'Access requires queueing.'),
  ('QUOTE_REQUIRED',                     'P2', 'availability', 'No price is transactable without negotiation.'),
  ('AVAILABILITY_EVIDENCE_INSUFFICIENT', 'P2', 'availability', 'Availability evidence is weaker than Grade 3, the child''s minimum.'),
  ('PRICE_STALE',                        'P2', 'freshness', 'The price evidence is older than price_max_age.'),
  ('AVAILABILITY_STALE',                 'P2', 'freshness', 'The availability evidence was not re-observed within availability_max_age.'),
  ('BUNDLE_OUT_OF_ENVELOPE',             'P2', 'price_integrity', 'The host bundle falls outside the child''s declared envelope.'),
  ('TAX_BASIS_INCLUSIVE',                'P2', 'price_integrity', 'The price is established as inclusive of transaction tax.'),
  ('UNIT_UNRESOLVED',                    'P2', 'price_integrity', 'The billing unit could not be converted within the permitted class.'),
  ('CURRENCY_RATE_UNAVAILABLE',          'P2', 'price_integrity', 'No acceptable conversion rate exists for a non-index-currency price.'),
  ('SOURCE_INSUFFICIENT',                'P2', 'source', 'The source cannot supply the fields P2 requires; the seller is in the economic universe but outside the source-observable universe.'),
  ('SOURCE_UNRETRIEVABLE',               'P2', 'source', 'The source could not be retrieved.'),
  ('SOURCE_CONFLICT',                    'P2', 'source', 'Sources disagree irreconcilably for the same seller, region, instrument and grade.'),
  ('COLLECTION_NOT_PERMITTED',           'P2', 'source', 'Urdais does not hold a permitted and reproducible collection path for the source.');

create table reference.diagnostic_codes (
  code         text primary key
                 constraint diagnostic_codes_code_format check (code ~ '^[A-Z][A-Z0-9_]+$'),
  description  text not null
);

comment on table reference.diagnostic_codes is
  'Named properties recorded on observations that remain eligible. A diagnostic never removes an observation; where its share is gated, the gate is evaluated at publication.';

insert into reference.diagnostic_codes (code, description) values
  ('TAX_BASIS_UNRESOLVED',                       'The tax basis could not be established from the price surface or general terms; the observation remains eligible and its share is gated.'),
  ('OPERATOR_UNDETERMINED',                      'The infrastructure operator could not be reliably determined; the seller is the capacity source by fallback.'),
  ('ENUMERATION_INCOMPLETE',                     'The observation comes from a retrieval whose enumeration completeness was not established.'),
  ('MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED', 'The marketplace host identifier used as the seller-fallback key has not been shown stable across time.'),
  ('AVAILABILITY_GRADE_3',                       'Availability rests on a product-and-region capacity assertion rather than an offer-level state.'),
  ('SOURCE_EFFECTIVE_TIME_ABSENT',               'The source states no effective time for the price; source_effective_at is NULL.'),
  ('PRICE_CARRIED',                              'The price was carried from a prior cycle within price_max_age; the carry age is recorded in detail.');

alter table reference.exclusion_reasons enable row level security;
alter table reference.diagnostic_codes  enable row level security;
