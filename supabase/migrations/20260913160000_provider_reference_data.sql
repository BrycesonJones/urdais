-- Launch enablement: stable, non-sensitive reference data needed before a
-- first collection, for the two candidate sources.
--
-- Seeded: the seller legal entities, their seller roles, the product
-- identifiers each interface uses for the H100 SXM instrument, the canonical
-- countries those sources can resolve to, and the region-to-country mappings
-- with their first-party evidence. Everything here is stable and public.
--
-- Not seeded, deliberately: any price, any availability, any permission grant
-- (none exists in writing), any tenancy upgrade (Lambda remains Ambiguous), any
-- operator attribution, any observation. No source is approved. Seeding a
-- market entity does not make it a constituent; a constituent is a capacity
-- source that survives eligibility on a calculation date, and none can until
-- both terms axes are permitted.

-- Canonical countries the two sources can map to. Adoption here means only
-- that a mapping may target them; a published series needs participants.
insert into reference.canonical_regions (code, name) values
  ('US', 'United States'),
  ('JP', 'Japan'),
  ('IN', 'India'),
  ('DE', 'Germany'),
  ('IL', 'Israel')
on conflict (code) do nothing;

-- Seller legal entities. The row is the legal entity; brands and tiers map onto it.
insert into reference.market_entities (id, slug, name, legal_name, notes) values
  ('66666666-0000-4000-8000-000000000001', 'runpod', 'Runpod', 'Runpod, Inc.',
   'Seller for both Secure Cloud and Community Cloud pods; the buyer contracts with Runpod in both cases. Legal name as it appears in the Terms of Service. Infrastructure operator undetermined for both tiers; Community hosts are undisclosed third parties.'),
  ('66666666-0000-4000-8000-000000000002', 'lambda', 'Lambda', 'Lambda, Inc.',
   'Vertically integrated seller. Legal name from the Cloud Terms of Service notice clause ("Lambda, Inc., Attn: Legal Department, 2510 Zanker Rd, San Jose, CA"). Infrastructure operator undetermined.');

insert into reference.entity_roles (entity_id, role, evidence) values
  ('66666666-0000-4000-8000-000000000001', 'seller', 'Runpod bills the customer for pods on both cloud tiers (Runpod pricing and billing documentation, 13 September 2026).'),
  ('66666666-0000-4000-8000-000000000002', 'seller', 'Lambda bills the customer for on-demand instances (Lambda billing documentation, 13 September 2026).');

-- Product identifiers as each interface expresses them, mapped to the seller.
insert into reference.native_identifiers (source_interface_id, identifier_type, native_value, market_entity_id, stability_status, stability_evidence, notes) values
  ((select id from reference.source_interfaces where slug = 'runpod-gpu-types'), 'sku', 'NVIDIA H100 80GB HBM3', '66666666-0000-4000-8000-000000000001',
   'provisional', 'docs.runpod.io/references/gpu-types lists the id with display name H100 SXM and 80 GB on 13 September 2026; cross-time stability not yet observed.',
   'The H100 SXM GPU type id. Display name H100 SXM. Grade A identity.'),
  ((select id from reference.source_interfaces where slug = 'runpod-gpu-types'), 'sku', 'NVIDIA H100 PCIe', '66666666-0000-4000-8000-000000000001',
   'provisional', 'Same reference page, 13 September 2026.', 'A different instrument; recorded so the collector recognizes and excludes it.'),
  ((select id from reference.source_interfaces where slug = 'runpod-gpu-types'), 'sku', 'NVIDIA H100 NVL', '66666666-0000-4000-8000-000000000001',
   'provisional', 'Same reference page, 13 September 2026.', 'A different instrument (94 GB); recorded so the collector recognizes and excludes it.'),
  ((select id from reference.source_interfaces where slug = 'lambda-instance-types'), 'instance_type', 'gpu_1x_h100_sxm5', '66666666-0000-4000-8000-000000000002',
   'provisional', 'OpenAPI specification example and lambda.ai/pricing 1x row, 13 September 2026; live catalog not yet read.',
   '"1x H100 (80 GB SXM5)". The canonical-quantity offer for this seller.'),
  ((select id from reference.source_interfaces where slug = 'lambda-instance-types'), 'instance_type', 'gpu_2x_h100_sxm5', '66666666-0000-4000-8000-000000000002',
   'provisional', 'lambda.ai/pricing 2x row, 13 September 2026.', 'Quantity variant within the per-accelerator class.'),
  ((select id from reference.source_interfaces where slug = 'lambda-instance-types'), 'instance_type', 'gpu_4x_h100_sxm5', '66666666-0000-4000-8000-000000000002',
   'provisional', 'lambda.ai/pricing 4x row, 13 September 2026.', 'Quantity variant within the per-accelerator class.'),
  ((select id from reference.source_interfaces where slug = 'lambda-instance-types'), 'instance_type', 'gpu_8x_h100_sxm5', '66666666-0000-4000-8000-000000000002',
   'provisional', 'OpenAPI specification example and lambda.ai/pricing 8x row, 13 September 2026.', 'Quantity variant within the per-accelerator class; never divided into a whole-node observation.');

-- Region mappings with first-party evidence. Lambda publishes a regions table
-- naming a country for every code. Runpod exposes no country on its datacenter
-- object; the two identifiers below are the only ones documented publicly with
-- a country, and their confidence is medium until the countryCodes filter
-- confirms them at first authenticated collection. No identifier is mapped
-- from its spelling.
insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from)
select (select id from reference.source_interfaces where slug = 'lambda-instance-types'), v.code, v.country, 'mapped', 'high',
       format('Lambda on-demand documentation regions table, 13 September 2026: %s = %s', v.code, v.location), '2026-09-13T00:00:00Z'
from (values
  ('asia-northeast-1', 'JP', 'Tokyo, Japan'),
  ('asia-northeast-2', 'JP', 'Osaka, Japan'),
  ('asia-south-1',     'IN', 'India'),
  ('europe-central-1', 'DE', 'Germany'),
  ('me-west-1',        'IL', 'Israel'),
  ('us-east-1',        'US', 'Virginia, USA'),
  ('us-east-2',        'US', 'Washington DC, USA'),
  ('us-midwest-1',     'US', 'Illinois, USA'),
  ('us-south-1',       'US', 'Texas, USA'),
  ('us-south-2',       'US', 'North Texas, USA'),
  ('us-south-3',       'US', 'Central Texas, USA'),
  ('us-west-1',        'US', 'California, USA'),
  ('us-west-2',        'US', 'Arizona, USA'),
  ('us-west-3',        'US', 'Utah, USA')
) as v(code, country, location);

insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from) values
  ((select id from reference.source_interfaces where slug = 'runpod-gpu-types'), 'US-KS-2', 'US', 'mapped', 'medium',
   'Runpod API reference example response names it "US Kansas 2" (list-gpu-types and list-data-centers, 13 September 2026). Confidence rises to high when the countryCodes=US filter returns it at first authenticated collection.', '2026-09-13T00:00:00Z'),
  ((select id from reference.source_interfaces where slug = 'runpod-gpu-types'), 'US-GA-1', 'US', 'mapped', 'medium',
   'runpodctl datacenter reference example lists it as United States (13 September 2026). Confidence rises to high when the countryCodes=US filter returns it.', '2026-09-13T00:00:00Z');

-- Guards: reference data only, nothing external or observed.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
  select count(*) into n from reference.permission_grants;
  if n <> 0 then raise exception 'a permission grant was seeded without written evidence'; end if;
  select count(*) into n from reference.entity_roles where role = 'operator';
  if n <> 0 then raise exception 'an operator role was seeded; operators are never inferred'; end if;
  select count(*) into n from reference.region_mappings where mapping_status = 'mapped' and (evidence is null or evidence = '');
  if n <> 0 then raise exception 'a region mapping lacks evidence'; end if;
  select count(*) into n from pipeline.raw_offers;
  if n <> 0 then raise exception 'an observation exists'; end if;
  select count(*) into n from reference.market_entities where legal_name is null;
  if n <> 0 then raise exception 'a market entity was seeded without a legal name'; end if;
end
$$;
