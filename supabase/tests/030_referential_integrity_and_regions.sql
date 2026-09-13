-- Referential integrity across the chain, and region mapping that may refuse.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'cloud_provider');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-prices', 'Test prices', 'price_surface', 'https://example.invalid/pricing', 'documentation');
insert into reference.canonical_regions (code, name) values ('US', 'United States'), ('DE', 'Germany');

do $$
declare
  ok boolean;
  spec uuid := '22222222-0000-4000-8000-000000000101';
  mver uuid := '11111111-0000-4000-8000-000000000101';
  inst uuid := '22222222-0000-4000-8000-000000000001';
begin
  -- A raw offer needs a real retrieval.
  ok := false;
  begin
    insert into pipeline.raw_offers (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
    values ('cccccccc-0000-4000-8000-00000000dead', 0, repeat('b', 64), '{}', now());
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'raw offer without retrieval was accepted'; end if;

  -- A normalized observation needs a real raw offer.
  ok := false;
  begin
    insert into pipeline.normalized_observations (raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
    values ('dddddddd-0000-4000-8000-00000000dead', inst, spec, mver, now());
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'normalized observation without raw offer was accepted'; end if;

  -- An assessment needs a real normalized observation.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values ('eeeeeeee-0000-4000-8000-00000000dead', spec, mver, now(), false, false, false, 'ineligible');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'assessment without normalized observation was accepted'; end if;

  -- "EU" can never be a canonical region.
  ok := false;
  begin
    insert into reference.canonical_regions (code, name) values ('EU', 'European Union');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EU was accepted as a canonical region'; end if;

  -- Neither can a user-assigned code or a malformed one.
  ok := false;
  begin insert into reference.canonical_regions (code, name) values ('XX', 'x'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'XX was accepted as a canonical region'; end if;
  ok := false;
  begin insert into reference.canonical_regions (code, name) values ('us', 'x'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'lowercase code was accepted as a canonical region'; end if;

  -- A mapping to a country that has not been adopted fails the FK.
  ok := false;
  begin
    insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from)
    values ('bbbbbbbb-0000-4000-8000-000000000011', 'somewhere', 'FR', 'mapped', 'high', 'x', now());
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'mapping to an unadopted canonical region was accepted'; end if;

  -- The EU price table stays unresolved: no canonical code, no confidence.
  insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, evidence, effective_from)
  values ('bbbbbbbb-0000-4000-8000-000000000011', 'EU', null, 'unresolved', 'Table heading names a supra-national grouping; no country is assignable.', '2026-09-13T00:00:00Z');

  -- A "mapped" row without a country, or an "unresolved" row with one, is impossible.
  ok := false;
  begin
    insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from)
    values ('bbbbbbbb-0000-4000-8000-000000000011', 'US', null, 'mapped', 'high', 'x', now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'mapped row without a canonical code was accepted'; end if;
  ok := false;
  begin
    insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, evidence, effective_from)
    values ('bbbbbbbb-0000-4000-8000-000000000011', 'EU2', 'DE', 'unresolved', 'x', now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'unresolved row with a representative country was accepted'; end if;

  -- A proper mapping, then a second current mapping for the same value is rejected.
  insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from)
  values ('bbbbbbbb-0000-4000-8000-000000000011', 'US', 'US', 'mapped', 'high', 'Table heading is the country.', '2026-09-13T00:00:00Z');
  ok := false;
  begin
    insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, version, effective_from)
    values ('bbbbbbbb-0000-4000-8000-000000000011', 'US', 'DE', 'mapped', 'low', 'x', 2, '2026-09-14T00:00:00Z');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two current mappings for one native value were accepted'; end if;

  -- Versioning: close the old interval, then a new version is fine.
  update reference.region_mappings set effective_to = '2026-09-14T00:00:00Z'
   where source_interface_id = 'bbbbbbbb-0000-4000-8000-000000000011' and native_region_value = 'US' and version = 1;
  insert into reference.region_mappings (source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, version, effective_from)
  values ('bbbbbbbb-0000-4000-8000-000000000011', 'US', 'US', 'mapped', 'high', 'Re-verified.', 2, '2026-09-14T00:00:00Z');
  if (select count(*) from reference.region_mappings where native_region_value = 'US') <> 2 then
    raise exception 'versioned mapping history was not retained';
  end if;

  -- An adopted region referenced by a mapping cannot be deleted.
  ok := false;
  begin delete from reference.canonical_regions where code = 'US'; exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'canonical region with mappings was deletable'; end if;

  -- A stability claim on a native identifier needs evidence; the default is unresolved.
  insert into reference.native_identifiers (source_interface_id, identifier_type, native_value)
  values ('bbbbbbbb-0000-4000-8000-000000000011', 'host_id', '68137');
  if (select stability_status from reference.native_identifiers where native_value = '68137') <> 'unresolved' then
    raise exception 'native identifier did not default to unresolved';
  end if;
  ok := false;
  begin
    update reference.native_identifiers set stability_status = 'stable' where native_value = '68137';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'stability was raised to stable without evidence'; end if;

  raise notice 'integrity and regions: ok';
end $$;

rollback;
