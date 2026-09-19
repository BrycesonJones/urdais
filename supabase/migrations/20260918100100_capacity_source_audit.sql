-- Available Compute Capacity: methodology registration and the source audit.
--
-- The audit is data rather than prose because two different consumers need it:
-- the aggregation, which must refuse an ineligible source, and the public
-- surface, which must be able to say precisely why coverage is what it is.
-- A constant in application code could answer neither after a deploy.
--
-- The finding this migration records is that the intersection of "exposes a
-- capacity signal" and "Urdais is permitted to use it" is currently empty.
-- That is a fact about the compute market's interfaces and their terms, not a
-- gap in the implementation, and it is recorded here so that the surface can
-- state it from evidence.

insert into reference.methodologies (id, slug, name, document_path) values
  ('ac000000-0000-4000-8000-000000000010', 'available-compute-capacity',
   'Urdais Available Compute Capacity', 'docs/methodology/available-compute-capacity.md')
on conflict (slug) do nothing;

-- A draft, and therefore no effective date. Nothing publishes under it.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash) values
  ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000010',
   '0.1.0-draft', 'draft', 'docs/methodology/available-compute-capacity.md',
   '4df0c7fbd25ddac396bd0b77727a36a923ed4fe1b1d1d4e647acf923bc533018')
on conflict (methodology_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- The audit, one row per registered compute interface.
-- ---------------------------------------------------------------------------

-- Tier 1. The only interface found anywhere that explicitly encodes a quantity
-- per listing, and it is barred twice over: by its terms, and by its own
-- inability to enumerate the population a total would have to be drawn from.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 1, true, false, true, true, true, 'accelerator', 3600,
  'Every offer record carries a boolean rentable and a separate rented, alongside num_gpus, '
  'geolocation, host_id and machine_id, so a listing states its own quantity and a sum over '
  'rentable listings would be a genuine Tier 1 measurement. Two independent bars apply. The '
  'Terms of Use define Authorized Data to cover availability and capacity data, licence it for '
  'two enumerated purposes neither of which is a commercial market-information product, and '
  'separately reserve index and price-comparison database rights to the publisher. Separately '
  'from permission, Phase 2 measured that the interface caps responses at 64 records regardless '
  'of the requested limit while reporting truncated false, and returns different subsets for '
  'different orderings, so the population a total would be drawn from cannot be reproducibly '
  'defined even with permission.',
  'docs/research/ucpi-h100-sxm-source-study.md'
from reference.source_interfaces si where si.slug = 'vast-ai-offer-search'
on conflict (source_interface_id) do nothing;

-- Tier 3. The strongest availability shape in the market, refused in writing.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 3, false, false, true, true, true, null, 3600,
  'The catalog exposes a four-level per-datacenter availability signal, conditional on requested '
  'GPU count and country, plus minPodGpuCount and per-tier prices. The availability levels are '
  'categorical and no field states a quantity of available accelerators, so the ceiling is Tier 3. '
  'maxGpuCount and its per-tier variants describe the largest pod deployable rather than inventory '
  'on hand and are not admissible as quantity. Urdais requested permission in writing for '
  'systematic retrieval and for commercial market-data use on 13 September 2026; Runpod refused '
  'both on 14 September 2026. The refusal is about the intended use, so no alternative endpoint, '
  'method, cache or intermediary cures it.',
  'docs/architecture/sources/runpod-permission-denied.md'
from reference.source_interfaces si where si.slug = 'runpod-gpu-types'
on conflict (source_interface_id) do nothing;

-- Tier 3. One call would carry availability, region and configuration together.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 3, false, false, true, true, true, null, 86400,
  'GET /api/v1/instance-types returns regions_with_capacity_available per instance type, which is '
  'a region-level availability state and carries no quantity; a region absent from the list while '
  'the type exists in the catalog is an evidenced sold-out state for that region rather than an '
  'absence of information. specs.gpus is accelerators per instance, a configuration field, and is '
  'not inventory. The Cloud Terms of Service define Services to include the Authorized APIs and '
  'bar monitoring for benchmarking or competitive purposes; whether a published dataset falls '
  'inside that is interpretive and the conservative reading is retained. An express carve-out for '
  'uses permitted in an Order names a contractual route by which this could become permitted.',
  'docs/architecture/sources/lambda-launch-readiness.md'
from reference.source_interfaces si where si.slug = 'lambda-instance-types'
on conflict (source_interface_id) do nothing;

-- Tier 3, and the nearest to clearing, since nothing in its terms squarely bars it.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 3, false, false, true, true, true, null, 86400,
  'The sizes endpoint carries an available boolean per size together with the regions the size is '
  'offered in, which is an availability state with region and configuration attached and no '
  'quantity anywhere. Neither the Terms of Service nor the Acceptable Use Policy addresses API '
  'retrieval, index construction or data compilation directly; the only adjacent clause prohibits '
  'harvesting or scraping content of the Services, whose application to a documented authenticated '
  'API endpoint is not settled by the text. Both axes need written confirmation before production.',
  'docs/architecture/sources/terms-review.md'
from reference.source_interfaces si where si.slug = 'digitalocean-sizes'
on conflict (source_interface_id) do nothing;

-- Tier 4. Permitted, and carries nothing.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 4, false, false, false, true, true, null, null,
  'The bulk price list is a catalog of prices and SKU definitions. It states what each instance '
  'costs and in which regions it is offered, and nowhere states whether any is available to rent. '
  'Regional presence in a price catalog is a statement about the product line, not about supply. '
  'H100 capacity is sold as whole eight-accelerator instances with no capacity signal attached.',
  'docs/research/ucpi-h100-sxm-source-study.md'
from reference.source_interfaces si where si.slug = 'aws-price-list-bulk'
on conflict (source_interface_id) do nothing;

-- Tier 4. Permitted, and carries nothing.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 4, false, false, false, true, true, null, null,
  'The retail prices API returns meter and SKU pricing with armRegionName and effectiveStartDate. '
  'It exposes no availability, inventory or capacity field of any kind. Its H100 products are '
  'whole eight-accelerator SKUs.',
  'docs/research/ucpi-h100-sxm-source-study.md'
from reference.source_interfaces si where si.slug = 'azure-retail-prices'
on conflict (source_interface_id) do nothing;

-- Tier 4, and the important one: the only production-approved compute source
-- Urdais has, contributing nothing to this dataset. The publisher says so
-- itself, which is why the row can be written from evidence rather than from
-- an absence of evidence.
insert into reference.capacity_signal_capabilities
  (source_interface_id, max_measurement_tier, supports_exact_quantity, supports_quantity_range,
   supports_availability_state, supports_region, supports_configuration, quantity_unit,
   freshness_horizon_seconds, assessment, assessment_document_path)
select si.id, 4, false, false, false, true, false, null, null,
  'A licensed listed-price dataset covering sixteen providers. It carries provider, pricing_type, '
  'usd_per_gpu_hr, region where known, and observed_at, and no availability field. The publisher '
  'states in its own documentation that the data are listed prices, not guaranteed availability, '
  'and that listed is not attainable. Sixteen priced providers is therefore zero observed '
  'providers for this dataset. Its UCPI observations carry availability_state unknown at evidence '
  'grade 5 for exactly this reason, and that grading is correct and is not a defect to be fixed.',
  'docs/architecture/sources/price-of-compute.md'
from reference.source_interfaces si where si.slug = 'price-of-compute-prices'
on conflict (source_interface_id) do nothing;
