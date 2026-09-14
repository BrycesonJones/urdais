-- Reference data for the two candidate sources: legal entities, seller roles,
-- product identifiers and evidenced region mappings exist; nothing dynamic,
-- nothing permissive, nothing approved.
begin;

do $$
declare
  n integer;
  runpod_iface uuid;
  lambda_iface uuid;
begin
  select id into runpod_iface from reference.source_interfaces where slug = 'runpod-gpu-types';
  select id into lambda_iface from reference.source_interfaces where slug = 'lambda-instance-types';

  -- Legal entities with legal names, seller roles only.
  select count(*) into n from reference.market_entities where slug in ('runpod', 'lambda') and legal_name is not null;
  if n <> 2 then raise exception 'expected two seller legal entities, found %', n; end if;
  select count(*) into n from reference.entity_roles r join reference.market_entities e on e.id = r.entity_id where r.role = 'seller' and e.slug in ('runpod', 'lambda');
  if n <> 2 then raise exception 'expected two seller roles for the direct candidates, found %', n; end if;
  select count(*) into n from reference.entity_roles where role not in ('seller', 'marketplace');
  if n <> 0 then raise exception 'an operator role was seeded'; end if;
  select count(*) into n from reference.market_entities where controlling_entity_id is not null;
  if n <> 0 then raise exception 'common control was seeded without evidence'; end if;

  -- Product identifiers map to the right seller.
  if not exists (select 1 from reference.native_identifiers ni join reference.market_entities e on e.id = ni.market_entity_id
                  where ni.source_interface_id = runpod_iface and ni.identifier_type = 'sku' and ni.native_value = 'NVIDIA H100 80GB HBM3' and e.slug = 'runpod') then
    raise exception 'Runpod H100 SXM sku not mapped to the Runpod entity';
  end if;
  if not exists (select 1 from reference.native_identifiers ni join reference.market_entities e on e.id = ni.market_entity_id
                  where ni.source_interface_id = lambda_iface and ni.identifier_type = 'instance_type' and ni.native_value = 'gpu_1x_h100_sxm5' and e.slug = 'lambda') then
    raise exception 'Lambda 1x instance type not mapped to the Lambda entity';
  end if;
  select count(*) into n from reference.native_identifiers where stability_status = 'stable';
  if n <> 0 then raise exception 'an identifier was marked stable without a cross-time study'; end if;

  -- Region mappings: 14 Lambda regions at high confidence, 2 Runpod datacenters at medium, all evidenced, all to real countries.
  select count(*) into n from reference.region_mappings where source_interface_id = lambda_iface and mapping_status = 'mapped' and confidence = 'high';
  if n <> 14 then raise exception 'expected 14 Lambda region mappings, found %', n; end if;
  select count(*) into n from reference.region_mappings where source_interface_id = lambda_iface and canonical_region_code = 'US';
  if n <> 9 then raise exception 'expected 9 Lambda US regions, found %', n; end if;
  select count(*) into n from reference.region_mappings where source_interface_id = runpod_iface and mapping_status = 'mapped' and confidence = 'medium' and canonical_region_code = 'US';
  if n <> 2 then raise exception 'expected 2 medium-confidence Runpod US mappings, found %', n; end if;
  select count(*) into n from reference.region_mappings where evidence is null or evidence = '';
  if n <> 0 then raise exception 'a mapping lacks evidence'; end if;
  -- No identifier was mapped from a continent prefix.
  select count(*) into n from reference.region_mappings where native_region_value like 'EU-%';
  if n <> 0 then raise exception 'an EU-prefixed identifier was mapped without country evidence'; end if;
  select count(*) into n from reference.canonical_regions;
  if n <> 5 then raise exception 'expected 5 canonical countries, found %', n; end if;

  -- Nothing permissive or dynamic for the direct interfaces.
  select count(*) into n from reference.permission_grants g where g.source_interface_id in (runpod_iface, lambda_iface);
  if n <> 0 then raise exception 'a permission grant exists for a direct interface'; end if;
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved' and id in (runpod_iface, lambda_iface);
  if n <> 0 then raise exception 'a direct interface is production-approved'; end if;
  select count(*) into n from pipeline.observation_evidence;
  if n <> 0 then raise exception 'tenancy or other evidence rows exist without an observation'; end if;

  raise notice 'provider reference data: ok';
end $$;

rollback;
