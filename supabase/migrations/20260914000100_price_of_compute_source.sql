-- Price of Compute: a licensed provider-level listed-price dataset, and the
-- UCPI-H100-SXM-LISTED sibling that can admit it.
--
-- Source rights, from the publisher's own API page and OpenAPI description,
-- retrieved 2026-09-14T00:44Z and preserved under docs/research/price-of-compute:
--   "Every price on this site, including full history, as JSON. Free up to
--    1,000 requests/day — no key below the limit, attribution required."
--   "Attribution. Free use requires a visible link: 'Data: Price of Compute'."
--   "Terms. Data provided as-is; listed prices, not guaranteed availability.
--    Don't hammer the endpoints; cache responses 1h+."
--   footer: "data free with attribution · 'Data: Price of Compute — priceofcompute.com'"
--   OpenAPI: "1,000 requests/day per IP. Attribution required: 'Data: Price of
--    Compute — priceofcompute.com'."
-- Collection is expressly offered through the documented API with a stated
-- limit; data use is granted generally ("free use", "data free with
-- attribution") conditioned on visible attribution. Both axes are permitted on
-- that evidence and the interface is production-approved. The permission basis
-- is the publisher's terms, recorded as a grant of kind provider_terms.
--
-- Source quality: grade 6, a licensed specialist dataset whose methodology is
-- disclosed (canonical SKU mapping, per-provider medians, pricing-type
-- separation, hourly collection, no interpolation); the assessment is recorded
-- in docs/architecture/sources/price-of-compute.md. It is not a grade-7
-- comparison site, because its methodology is published and assessable.
--
-- Runpod, Lambda and Vast are untouched. Their direct interfaces remain blocked;
-- the sellers behind them may appear here as participants through this source,
-- because this source's terms, not theirs, govern our use of its dataset.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('44444444-0000-4000-8000-000000000007', 'price-of-compute', 'Price of Compute', 'other', 'https://priceofcompute.com');

insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  production_access_state, terms_review_state, data_use_terms_state, written_agreement_required, notes, terms_evidence, metadata) values
  ('55555555-0000-4000-8000-000000000007', '44444444-0000-4000-8000-000000000007',
   'price-of-compute-prices', 'Price of Compute prices API', 'catalog_price_interface',
   'https://priceofcompute.com/api/v1/prices/{sku}', true, 'public_unauthenticated',
   'production_approved', 'permitted', 'permitted', false,
   'Licensed provider-level listed-price dataset. GET /api/v1/prices/{sku} returns latest daily medians per pricing type and current per-provider rows: provider, pricing_type, usd_per_gpu_hr, region (where known), observed_at. The response carries the attribution string. The dataset is listed prices, not accessible offers, so it is admissible to UCPI-H100-SXM-LISTED and not to UCPI-H100-SXM. The aggregator is the technical source; each provider row is a candidate observation of the underlying seller.',
   '{"reviewed_on": "2026-09-14", "documents": [{"title": "The Price of Compute API", "url": "https://www.priceofcompute.com/api", "retrieved_on": "2026-09-14T00:44Z", "clauses": [{"axis": "collection", "text": "Every price on this site, including full history, as JSON. Free up to 1,000 requests/day — no key below the limit, attribution required."}, {"axis": "data_use", "text": "Attribution. Free use requires a visible link: \"Data: Price of Compute\". That link is how a free API stays free."}, {"axis": "terms", "text": "Data provided as-is; listed prices, not guaranteed availability. Don''t hammer the endpoints; cache responses 1h+."}, {"axis": "data_use", "text": "data free with attribution · \"Data: Price of Compute — priceofcompute.com\"", "note": "site footer"}]}, {"title": "Price of Compute OpenAPI", "url": "https://priceofcompute.com/api/v1/openapi.json", "retrieved_on": "2026-09-14T00:44Z", "clauses": [{"axis": "both", "text": "Free GPU rental and LLM token price data. USD per GPU-hour, per-provider daily medians then cross-provider median. 1,000 requests/day per IP. Attribution required: ''Data: Price of Compute — priceofcompute.com''."}]}], "attribution_required": "Data: Price of Compute — priceofcompute.com", "attribution_url": "https://priceofcompute.com", "rate_limit": "1,000 requests/day per IP; cache responses 1h+", "note": "The terms do not name indices or benchmarks; the grant is a general free-use grant conditioned on attribution, and Urdais records that reading rather than a narrower one."}'::jsonb,
   '{"source_quality_grade": 6, "methodology_url": "https://www.priceofcompute.com/methodology", "methodology_assessed": "docs/architecture/sources/price-of-compute.md", "cache_max_age_seconds": 3600, "daily_request_limit": 1000, "urdais_cadence": "one request per calculation day for the H100 SXM SKU"}'::jsonb);

insert into reference.permission_grants (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use, granted_on, effective_from, evidence) values
  ('77777777-0000-4000-8000-000000000101', '55555555-0000-4000-8000-000000000007', 'provider_terms',
   'https://www.priceofcompute.com/api and https://priceofcompute.com/api/v1/openapi.json, retrieved 2026-09-14T00:44Z, preserved under docs/research/price-of-compute',
   true, true, '2026-09-14', '2026-09-14T00:00:00Z',
   'API page: "Free up to 1,000 requests/day — no key below the limit, attribution required." "Free use requires a visible link: \"Data: Price of Compute\"." "Data provided as-is; listed prices, not guaranteed availability. Don''t hammer the endpoints; cache responses 1h+." Footer: "data free with attribution". OpenAPI: "1,000 requests/day per IP. Attribution required: ''Data: Price of Compute — priceofcompute.com''."');

-- The underlying sellers the dataset names, as market entities. Legal names only where evidenced tonight.
insert into reference.market_entities (id, slug, name, legal_name, notes) values
  ('66666666-0000-4000-8000-000000000003', 'hyperstack',     'Hyperstack',      'NexGen Cloud Limited', 'Hyperstack Terms and Conditions: "References to ''NexGen'' ... are to NexGen Cloud Limited"; registered office London EC2V 7NG. Per-accelerator H100 SXM listing with per-GPU host resources (Phase 1 research, 12 September 2026).'),
  ('66666666-0000-4000-8000-000000000004', 'nebius',         'Nebius',          null, 'Legal entity not yet evidenced (terms page not retrieved). Per-GPU-hour HGX H100 on-demand listing (Phase 1 research, 12 September 2026).'),
  ('66666666-0000-4000-8000-000000000005', 'voltagepark',    'Voltage Park',    'Voltage Park, Inc.', 'Terms of Service name Voltage Park, Inc. On-demand offered from 1 to 1016 GPUs (Phase 1 research, 12 September 2026); a flat published rate now appears in the licensed dataset.'),
  ('66666666-0000-4000-8000-000000000006', 'denvr',          'Denvr',           null, 'Legal entity and minimum topology not yet evidenced.'),
  ('66666666-0000-4000-8000-000000000007', 'datacrunch',     'Verda',           null, 'Formerly DataCrunch. Legal entity and minimum topology not yet evidenced.'),
  ('66666666-0000-4000-8000-000000000008', 'massedcompute',  'Massed Compute',  null, 'Reseller of rented capacity per the dataset''s provider notes; operator undetermined. Legal entity and minimum topology not yet evidenced.'),
  ('66666666-0000-4000-8000-000000000009', 'coreweave',      'CoreWeave',       null, 'Whole-node H100 HGX product at a stated count of 8 (Phase 1 research); per-accelerator figures are node prices divided by eight.'),
  ('66666666-0000-4000-8000-000000000010', 'azure',          'Microsoft Azure', null, 'ND H100 v5 is an eight-accelerator instance; per-accelerator figures are node prices divided by eight. Dataset region eastus.'),
  ('66666666-0000-4000-8000-000000000011', 'vast',           'Vast.ai',         null, 'Marketplace. The dataset''s provider row is a platform-level figure across independent hosts and is not a seller observation.'),
  ('66666666-0000-4000-8000-000000000012', 'ovh',            'OVHcloud',        null, 'Not an H100 SXM seller in the dataset on first retrieval.'),
  ('66666666-0000-4000-8000-000000000013', 'vultr',          'Vultr',           null, 'Not an H100 SXM seller in the dataset on first retrieval.'),
  ('66666666-0000-4000-8000-000000000014', 'hotaisle',       'Hot Aisle',       null, 'AMD Instinct specialist; not an H100 seller.'),
  ('66666666-0000-4000-8000-000000000015', 'salad',          'SaladCloud',      null, 'Marketplace of consumer cards on household machines; not an H100 seller.'),
  ('66666666-0000-4000-8000-000000000016', 'thundercompute', 'Thunder Compute', null, 'Reseller of virtualized GPUs over the network; not an H100 SXM seller in the dataset.');

insert into reference.entity_roles (entity_id, role, evidence) values
  ('66666666-0000-4000-8000-000000000003', 'seller', 'Hyperstack bills the customer for its cloud instances (Phase 1 research).'),
  ('66666666-0000-4000-8000-000000000004', 'seller', 'Nebius bills the customer for on-demand instances (Phase 1 research).'),
  ('66666666-0000-4000-8000-000000000005', 'seller', 'Voltage Park bills the customer for on-demand capacity (Phase 1 research).'),
  ('66666666-0000-4000-8000-000000000006', 'seller', 'Named as an on-demand provider by the licensed dataset.'),
  ('66666666-0000-4000-8000-000000000007', 'seller', 'Named as an on-demand provider by the licensed dataset.'),
  ('66666666-0000-4000-8000-000000000008', 'seller', 'Named as a reseller by the licensed dataset; the buyer contracts with the reseller.'),
  ('66666666-0000-4000-8000-000000000009', 'seller', 'CoreWeave bills the customer (Phase 1 research).'),
  ('66666666-0000-4000-8000-000000000010', 'seller', 'Microsoft bills the customer for Azure instances.'),
  ('66666666-0000-4000-8000-000000000011', 'marketplace', 'Vast.ai hosting documentation: hosts sell resources on the marketplace and set their own prices (Phase 2 research).');

-- The dataset's provider slugs, mapped to the sellers they denote.
insert into reference.native_identifiers (source_interface_id, identifier_type, native_value, market_entity_id, stability_status, stability_evidence, notes)
select '55555555-0000-4000-8000-000000000007', 'seller_id', v.slug, e.id, 'provisional', 'Observed in GET /api/v1/providers on 2026-09-14T00:44Z; cross-time stability not yet observed.', v.note
from (values
  ('runpod', 'runpod', 'Secure Cloud and Community Cloud priced separately upstream as different pricing types.'),
  ('lambda', 'lambda', null),
  ('hyperstack', 'hyperstack', null),
  ('nebius', 'nebius', null),
  ('voltagepark', 'voltagepark', null),
  ('denvr', 'denvr', null),
  ('datacrunch', 'datacrunch', 'Displayed upstream as Verda.'),
  ('massedcompute', 'massedcompute', null),
  ('coreweave', 'coreweave', null),
  ('azure', 'azure', null),
  ('vast', 'vast', 'Platform-level figure, excluded as a service-product mismatch.'),
  ('ovh', 'ovh', null),
  ('vultr', 'vultr', null),
  ('hotaisle', 'hotaisle', null),
  ('salad', 'salad', null),
  ('thundercompute', 'thundercompute', null)
) as v(slug, entity_slug, note)
join reference.market_entities e on e.slug = v.entity_slug;

-- The sibling instrument and its first draft specification.
insert into reference.instruments (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status) values
  ('22222222-0000-4000-8000-000000000002', 'UCPI-H100-SXM-LISTED', 'UCPI-H100-SXM-LISTED', 'compute_price',
   '11111111-0000-4000-8000-000000000001', 'USD / H100 SXM accelerator-hour (listed)', 'USD', 'proposed');

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000201', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000112',
   '0.1.0-draft', 'draft', 'docs/methodology/ucpi-h100-sxm-listed.md', 'ab190da7906197b0420bf1bb1e0ad4821c112599b55b6e053a04f85dd2aefbb9');

-- Guards: exactly this source is cleared; nothing about the direct interfaces moved; nothing is live.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 1 then raise exception 'expected exactly one production-approved source, found %', n; end if;
  if not exists (select 1 from reference.source_interfaces where slug = 'runpod-gpu-types' and terms_review_state = 'not_permitted' and data_use_terms_state = 'not_permitted' and production_access_state = 'production_blocked') then
    raise exception 'Runpod state moved'; end if;
  if not exists (select 1 from reference.source_interfaces where slug = 'lambda-instance-types' and terms_review_state = 'under_review' and data_use_terms_state = 'not_permitted' and production_access_state = 'production_blocked') then
    raise exception 'Lambda state moved'; end if;
  if not exists (select 1 from reference.source_interfaces where slug = 'vast-ai-offer-search' and production_access_state = 'production_blocked') then
    raise exception 'Vast state moved'; end if;
  select count(*) into n from reference.instruments where lifecycle_status = 'live';
  if n <> 0 then raise exception 'an instrument is live'; end if;
  select count(*) into n from reference.entity_roles where role = 'operator';
  if n <> 0 then raise exception 'an operator role was seeded'; end if;
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a publication exists'; end if;
end
$$;
