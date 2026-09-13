-- One raw offer, interpreted under spec A and again under spec B. Both survive.
-- Re-interpreting under A supersedes the earlier row. Raw never changes.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'api_key'),
       ('bbbbbbbb-0000-4000-8000-000000000012', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-concepts', 'Test concepts page', 'product_reference_documentation', 'https://example.invalid/concepts', false, 'documentation');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, source_claimed_complete, enumeration_assessment)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:offers', '2026-09-13T04:00:00Z', 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), true, 'claimed_complete_observed_incomplete'),
       ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000012', 'test:concepts', '2026-09-13T05:00:00Z', 'GET', 'https://example.invalid/concepts', 200, repeat('c', 64), null, 'complete');
insert into reference.market_entities (id, slug, name) values ('99999999-0000-4000-8000-000000000001', 'host-68137', 'Marketplace host 68137');
insert into reference.entity_roles (entity_id, role) values ('99999999-0000-4000-8000-000000000001', 'seller'), ('99999999-0000-4000-8000-000000000001', 'marketplace_host');
insert into reference.canonical_regions (code, name) values ('FR', 'France');
insert into reference.region_mappings (id, source_interface_id, native_region_value, canonical_region_code, mapping_status, confidence, evidence, effective_from)
values ('88888888-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'France, FR', 'FR', 'mapped', 'high', 'Two-letter country code in the native value.', '2026-09-13T00:00:00Z');
insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at, availability_observed_at,
  native_product_label, native_gpu_model, native_form_factor, native_gpu_memory_mb, native_host_id, native_machine_id,
  native_price, native_currency, native_billing_unit, native_gpu_count, native_machine_fraction, native_geolocation, native_availability_value)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64),
  '{"gpu_name":"H100 SXM","num_gpus":1,"gpu_frac":0.125,"dph_total":1.468888888888889,"rentable":false}',
  '2026-09-13T04:00:00Z', '2026-09-13T04:00:00Z',
  'H100 SXM', 'H100', 'SXM', 81559, '68137', '37070',
  1.468888888888889, 'USD', 'per_hour', 1, 0.125, 'France, FR', 'false');

-- A hypothetical future spec version for the same instrument.
insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path)
values ('22222222-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000101', '0.1.2-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md');

do $$
declare
  ok boolean;
  raw uuid := 'dddddddd-0000-4000-8000-000000000001';
  inst uuid := '22222222-0000-4000-8000-000000000001';
  spec_a uuid := '22222222-0000-4000-8000-000000000101';
  spec_b uuid := '22222222-0000-4000-8000-000000000102';
  mver uuid := '11111111-0000-4000-8000-000000000101';
  host uuid := '99999999-0000-4000-8000-000000000001';
  obs_a1 uuid := 'eeeeeeee-0000-4000-8000-0000000000a1';
  obs_a2 uuid := 'eeeeeeee-0000-4000-8000-0000000000a2';
  obs_b  uuid := 'eeeeeeee-0000-4000-8000-0000000000b1';
  raw_hash_before text;
  raw_payload_before jsonb;
  n integer;
begin
  select record_hash, raw_payload into raw_hash_before, raw_payload_before from pipeline.raw_offers where id = raw;

  -- Interpretation under spec A: the earlier (superseded) reading graded tenancy ambiguous.
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id,
    seller_entity_id, operator_entity_id, marketplace_entity_id, capacity_source_entity_id,
    canonical_region_code, region_mapping_id, observed_at, source_effective_at, availability_observed_at,
    normalized_price, hardware_identity_grade, full_device, gpu_count, minimum_gpu_count, minimum_topology_source_field,
    whole_node_required, machine_gpu_total, machine_fraction, topology_class, procurement_mode, preemptible, service_product,
    tenancy_grade, availability_state, availability_evidence_grade, tax_basis, observation_type, source_quality_grade)
  values (obs_a1, raw, inst, spec_a, mver,
    host, null, null, host,
    'FR', '88888888-0000-4000-8000-000000000001', '2026-09-13T04:00:00Z', null, '2026-09-13T04:00:00Z',
    1.468888888888889, 'A', true, 1, 1, 'min(num_gpus) across machine offers',
    false, 8, 0.125, 'per_accelerator_allocation', 'on_demand', false, 'full_device_rental',
    'ambiguous', 'sold_out', 2, 'unresolved', 'advertised_non_accessible_price', 4);

  -- Operator is NULL and nothing was fabricated; capacity source fell back to the seller.
  if (select operator_entity_id from pipeline.normalized_observations where id = obs_a1) is not null then
    raise exception 'operator was fabricated';
  end if;
  if (select capacity_source_entity_id from pipeline.normalized_observations where id = obs_a1) <> host then
    raise exception 'capacity source did not fall back to seller';
  end if;

  -- Interpretation under spec B coexists: same raw offer, different spec.
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id,
    seller_entity_id, capacity_source_entity_id, canonical_region_code, region_mapping_id, observed_at, availability_observed_at,
    normalized_price, tenancy_grade, availability_state, availability_evidence_grade)
  values (obs_b, raw, inst, spec_b, mver, host, host, 'FR', '88888888-0000-4000-8000-000000000001', '2026-09-13T04:00:00Z', '2026-09-13T04:00:00Z',
    1.468888888888889, 'documented', 'sold_out', 2);

  select count(*) into n from pipeline.normalized_observations where raw_offer_id = raw;
  if n <> 2 then raise exception 'expected two coexisting interpretations, found %', n; end if;

  -- A second current interpretation under spec A is rejected until the first is superseded.
  ok := false;
  begin
    insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
    values (obs_a2, raw, inst, spec_a, mver, '2026-09-13T04:00:00Z');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'second current interpretation under one spec was accepted'; end if;

  -- Editing an interpretation in place is rejected: correction is supersession.
  ok := false;
  begin
    update pipeline.normalized_observations set tenancy_grade = 'documented' where id = obs_a1;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'in-place edit of an interpretation was accepted'; end if;

  -- Supersede then insert the corrected reading under spec A (tenancy corrected to documented,
  -- with the documentation retrieval linked as evidence).
  update pipeline.normalized_observations
     set superseded_by_id = obs_a2, superseded_at = '2026-09-13T06:00:00Z', supersession_reason = 'tenancy re-graded on Concepts documentation'
   where id = obs_a1;
  insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id,
    seller_entity_id, capacity_source_entity_id, canonical_region_code, region_mapping_id, observed_at, availability_observed_at,
    normalized_price, tenancy_grade, availability_state, availability_evidence_grade)
  values (obs_a2, raw, inst, spec_a, mver, host, host, 'FR', '88888888-0000-4000-8000-000000000001', '2026-09-13T04:00:00Z', '2026-09-13T04:00:00Z',
    1.468888888888889, 'documented', 'sold_out', 2);
  insert into pipeline.observation_evidence (normalized_observation_id, evidence_role, evidence_retrieval_id, evidence_excerpt)
  values (obs_a2, 'tenancy', 'cccccccc-0000-4000-8000-000000000002', 'exclusive access to the GPUs you rented');
  -- Force the deferred self-referencing FK check now so a dangling supersession would fail here.
  set constraints all immediate;

  -- Three interpretations exist; one under A is superseded, one under A and one under B are current.
  select count(*) into n from pipeline.normalized_observations where raw_offer_id = raw;
  if n <> 3 then raise exception 'expected three interpretations in history, found %', n; end if;
  select count(*) into n from pipeline.normalized_observations where raw_offer_id = raw and superseded_by_id is null;
  if n <> 2 then raise exception 'expected two current interpretations, found %', n; end if;

  -- The superseded row is frozen; a second supersession is rejected.
  ok := false;
  begin
    update pipeline.normalized_observations set superseded_by_id = obs_b, superseded_at = now(), supersession_reason = 'x' where id = obs_a1;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'already-superseded row was re-superseded'; end if;

  -- Deleting any interpretation is rejected, as is deleting the raw offer beneath them.
  ok := false;
  begin delete from pipeline.normalized_observations where id = obs_b; exception when restrict_violation then ok := true; end;
  if not ok then raise exception 'interpretation was deletable'; end if;
  ok := false;
  begin delete from pipeline.raw_offers where id = raw; exception when restrict_violation then ok := true; end;
  if not ok then raise exception 'raw offer beneath interpretations was deletable'; end if;

  -- Raw is byte-identical to before.
  if (select record_hash from pipeline.raw_offers where id = raw) <> raw_hash_before
     or (select raw_payload from pipeline.raw_offers where id = raw) <> raw_payload_before then
    raise exception 'raw offer changed during reprocessing';
  end if;

  -- Assessments under each spec can also coexist.
  insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
  values (obs_a2, spec_a, mver, now(), true, true, false, 'ineligible'),
         (obs_b,  spec_b, mver, now(), true, true, false, 'ineligible');
  insert into pipeline.eligibility_exclusions (assessment_id, reason_code)
  select id, 'UNAVAILABLE' from pipeline.eligibility_assessments where normalized_observation_id in (obs_a2, obs_b);
  insert into pipeline.eligibility_diagnostics (assessment_id, diagnostic_code)
  select id, 'ENUMERATION_INCOMPLETE' from pipeline.eligibility_assessments where normalized_observation_id in (obs_a2, obs_b);

  raise notice 'reprocessing: ok';
end $$;

rollback;
