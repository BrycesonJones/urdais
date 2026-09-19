-- Available Compute Capacity: the measurement hierarchy, enforced by the database.
--
-- One sentence is what these fixtures test:
--
--   A source that said "available" must not be storable as the number 1, and a
--   source that said nothing must not be storable as the number 0.
--
-- Both mistakes produce a row that looks entirely ordinary and a total that
-- looks entirely plausible. Application code can be reviewed into getting this
-- right and then regress silently, so the rule lives in a check constraint
-- where a wrong row cannot be written at all. Every fixture below tries to
-- write one and expects to be refused.
--
-- Synthetic throughout, and rolled back; no real provider gets a capacity row.
begin;

-- --------------------------------------------------- the audit as recorded

do $$
declare n integer; c record;
begin
  -- The finding this phase rests on: every interface with a capacity signal is
  -- barred, and every permitted interface has none.
  select count(*) into n
    from reference.capacity_signal_capabilities cap
    join reference.source_interfaces si on si.id = cap.source_interface_id
   where cap.max_measurement_tier <= 3
     and si.terms_review_state = 'permitted'
     and si.production_access_state = 'production_approved';
  if n <> 0 then
    raise exception '% interface(s) are both capable and permitted; the empty-coverage surface is now wrong', n;
  end if;

  -- Urdais's only approved compute source contributes nothing, by its own publisher's statement.
  select cap.* into c
    from reference.capacity_signal_capabilities cap
    join reference.source_interfaces si on si.id = cap.source_interface_id
   where si.slug = 'price-of-compute-prices';
  if c is null then raise exception 'the approved price source has no assessed capability'; end if;
  if c.max_measurement_tier <> 4 then
    raise exception 'the listed-price source is assessed at tier %, not 4', c.max_measurement_tier;
  end if;
  if c.supports_availability_state then
    raise exception 'a listed-price feed is recorded as exposing availability';
  end if;

  -- No observation exists, and none is seeded. An empty dataset is the honest state.
  select count(*) into n from pipeline.capacity_observations;
  if n <> 0 then raise exception '% capacity observation(s) exist; none should be seeded', n; end if;

  -- The methodology is a draft and therefore carries no effective date.
  select mv.* into c
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'available-compute-capacity';
  if c is null then raise exception 'the capacity methodology version is missing'; end if;
  if c.status <> 'draft' then raise exception 'the capacity methodology is % rather than draft', c.status; end if;
  if c.effective_from is not null then raise exception 'a draft methodology carries an effective date'; end if;
end $$;

-- --------------------------------------------------- fixtures for the observation constraints

create temporary table capacity_fixture_ids (kind text primary key, id uuid) on commit drop;

do $$
declare
  v_provider uuid; v_interface uuid; v_retrieval uuid; v_raw uuid; v_method uuid; v_entity uuid;
begin
  insert into reference.providers (slug, name, provider_kind)
    values ('capacity-fixture-provider', 'Capacity Fixture Provider', 'cloud_provider')
    returning id into v_provider;

  insert into reference.source_interfaces
    (provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
    values (v_provider, 'capacity-fixture-interface', 'Capacity Fixture Interface',
            'availability_interface', 'https://example.invalid/availability', true, 'api_key')
    returning id into v_interface;

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, response_status,
     request_method, request_url, response_hash, enumeration_assessment, retrieval_purpose)
    values (v_interface, 'capacity-fixture:1', now(), now(), 200,
            'GET', 'https://example.invalid/availability', repeat('c', 64), 'complete', 'research')
    returning id into v_retrieval;

  insert into pipeline.raw_offers
    (retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
    values (v_retrieval, 0, repeat('a', 64), '{"available": true}'::jsonb, now())
    returning id into v_raw;

  select mv.id into v_method
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'available-compute-capacity';

  insert into reference.market_entities (slug, name)
    values ('capacity-fixture-seller', 'Capacity Fixture Seller')
    returning id into v_entity;

  insert into capacity_fixture_ids values
    ('raw', v_raw), ('method', v_method), ('entity', v_entity), ('interface', v_interface);
end $$;

-- --------------------------------------------------- the rules

do $$
declare
  v_raw uuid; v_method uuid; v_entity uuid; ok boolean;
begin
  select id into v_raw    from capacity_fixture_ids where kind = 'raw';
  select id into v_method from capacity_fixture_ids where kind = 'method';
  select id into v_entity from capacity_fixture_ids where kind = 'entity';

  -- An availability state must not carry a quantity. This is the "available
  -- means one GPU" mistake, and it is the one that would inflate a total with
  -- Urdais's own source coverage.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, availability_state, available_quantity, quantity_unit,
       availability_evidence_grade, observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity,
              'availability_state', 'available', 1, 'accelerator', 3, now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an availability state was stored carrying a quantity of 1'; end if;

  -- An unknown must not carry a quantity. This is the "a failed retrieval means
  -- zero available" mistake.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, available_quantity, quantity_unit, availability_evidence_grade,
       observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity, 'unknown', 0, 'accelerator', 3, now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unknown observation was stored as zero available'; end if;

  -- An exact quantity must state its unit, or accelerators and nodes get added together.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, available_quantity, availability_evidence_grade, observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity, 'exact_quantity', 128, 2, now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an exact quantity was stored with no unit'; end if;

  -- A quantity needs evidence behind it.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, available_quantity, quantity_unit, observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity, 'exact_quantity', 128, 'accelerator', now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a quantity was stored with no availability evidence grade'; end if;

  -- An inverted range is refused rather than silently reordered.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, quantity_min, quantity_max, quantity_unit, availability_evidence_grade,
       observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity, 'quantity_range', 100, 50, 'accelerator', 2, now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an inverted quantity range was stored'; end if;

  -- 'unknown' is not an availability state a Tier 3 row may carry.
  ok := false;
  begin
    insert into pipeline.capacity_observations
      (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
       measurement_type, availability_state, availability_evidence_grade, observed_at, retrieved_at)
      values (v_raw, v_method, v_entity, v_entity, 'availability_state', 'unknown', 3, now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unknown state was stored as a Tier 3 availability observation'; end if;
end $$;

-- --------------------------------------------------- what must be storable

do $$
declare
  v_raw uuid; v_method uuid; v_entity uuid; n integer;
begin
  select id into v_raw    from capacity_fixture_ids where kind = 'raw';
  select id into v_method from capacity_fixture_ids where kind = 'method';
  select id into v_entity from capacity_fixture_ids where kind = 'entity';

  -- An observed zero. The source was asked and reported none, which is a real
  -- measurement and must be distinguishable from not having asked.
  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, available_quantity, quantity_unit, availability_evidence_grade,
     source_native_value, source_native_field, observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'exact_quantity', 0, 'accelerator', 2,
            '0', 'availableGpuCount', now(), now());

  -- An availability with no number.
  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, availability_state, availability_evidence_grade,
     source_native_value, source_native_field, observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'availability_state', 'available', 3,
            'true', 'regions_with_capacity_available', now(), now());

  -- No signal at all.
  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, availability_state, observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'unknown', 'unknown', now(), now());

  -- A range.
  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, quantity_min, quantity_max, quantity_unit, availability_evidence_grade,
     observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'quantity_range', 50, 100, 'accelerator', 2, now(), now());

  select count(*) into n from pipeline.capacity_observations;
  if n <> 4 then raise exception 'expected 4 storable observations, found %', n; end if;

  -- The zero and the unknown are distinguishable, which is the whole point.
  select count(*) into n from pipeline.capacity_observations
   where measurement_type = 'exact_quantity' and available_quantity = 0;
  if n <> 1 then raise exception 'the observed zero is not retrievable as a zero'; end if;

  select count(*) into n from pipeline.capacity_observations
   where measurement_type = 'unknown' and available_quantity is null;
  if n <> 1 then raise exception 'the unknown observation is not retrievable as an unknown'; end if;
end $$;

-- --------------------------------------------------- history, not overwriting

do $$
declare
  v_raw uuid; v_method uuid; v_entity uuid; v_first uuid; v_second uuid; n integer;
begin
  select id into v_raw    from capacity_fixture_ids where kind = 'raw';
  select id into v_method from capacity_fixture_ids where kind = 'method';
  select id into v_entity from capacity_fixture_ids where kind = 'entity';

  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, available_quantity, quantity_unit, availability_evidence_grade,
     observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'exact_quantity', 120, 'accelerator', 2,
            now() - interval '6 hours', now() - interval '6 hours')
    returning id into v_first;

  insert into pipeline.capacity_observations
    (raw_offer_id, methodology_version_id, seller_entity_id, capacity_source_entity_id,
     measurement_type, available_quantity, quantity_unit, availability_evidence_grade,
     observed_at, retrieved_at)
    values (v_raw, v_method, v_entity, v_entity, 'exact_quantity', 96, 'accelerator', 2, now(), now())
    returning id into v_second;

  -- A later run adds a row; it does not replace the earlier one. The series is the product.
  select count(*) into n from pipeline.capacity_observations
   where measurement_type = 'exact_quantity' and available_quantity in (120, 96);
  if n <> 2 then raise exception 'a second observation replaced the first instead of joining it'; end if;

  -- A correction supersedes, and supersession is all-or-nothing.
  update pipeline.capacity_observations
     set superseded_by_id = v_second, superseded_at = now(), supersession_reason = 'corrected'
   where id = v_first;

  begin
    update pipeline.capacity_observations set superseded_by_id = v_second, superseded_at = null
     where id = v_first;
    raise exception 'a half-superseded row was accepted';
  exception when check_violation then null;
  end;

  -- The superseded row survives the correction.
  select count(*) into n from pipeline.capacity_observations where id = v_first;
  if n <> 1 then raise exception 'superseding a row deleted it'; end if;
end $$;

rollback;
