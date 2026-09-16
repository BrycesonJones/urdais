-- UTVI schema invariants, in the database.
--
-- Application code can be careful. It can also be rewritten by someone who does not know
-- why a rule existed, and a constraint nobody has seen reject anything is a constraint
-- nobody knows works. So this file tests the refusals, not the happy path — and the one
-- refusal that matters most is the sum of an empty set.
--
-- Each block rolls back. Nothing here leaves a row behind.

begin;

do $$
declare
  iface_id        uuid;
  platform_id     uuid;
  lab_id          uuid;
  grant_id        uuid;
  utvi_instrument uuid;
  spec_id         uuid;
  method_ver_id   uuid;
  retrieval_a     uuid;
  retrieval_b     uuid;
  utvi_ret_a      uuid;
  utvi_ret_b      uuid;
  snap_a          uuid;
  snap_b          uuid;
  calc_a          uuid;
  hash_a          text := repeat('a', 64);
  hash_b          text := repeat('b', 64);
  failed          boolean;
begin
  select id into iface_id from reference.source_interfaces where slug = 'openrouter-datasets-rankings-daily';
  select id into platform_id from reference.providers where slug = 'openrouter';
  select id into lab_id from reference.providers where slug = 'deepseek';
  select id into grant_id from reference.permission_grants where source_interface_id = iface_id limit 1;
  select id into utvi_instrument from reference.instruments where symbol = 'UTVI';
  select id into spec_id from reference.instrument_spec_versions
    where reference.instrument_spec_versions.instrument_id = utvi_instrument limit 1;
  select methodology_version_id into method_ver_id from reference.instrument_spec_versions where id = spec_id;

  if iface_id is null or platform_id is null or grant_id is null or utvi_instrument is null then
    raise exception 'UTVI reference data is missing; the migration did not seed it';
  end if;

  -- ----------------------------------------------------------- the interface is approved
  -- Both terms axes permitted plus production approval is what lets a production retrieval
  -- be recorded at all. If this regresses, ingestion silently becomes research-only.
  if (select production_access_state from reference.source_interfaces where id = iface_id) <> 'production_approved'
     or (select terms_review_state from reference.source_interfaces where id = iface_id) <> 'permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = iface_id) <> 'permitted' then
    raise exception 'the OpenRouter dataset interface is no longer approved on both axes';
  end if;

  -- ----------------------------------------------------------- the methodology is approved
  -- UTVI 1.0.0 is approved and effective from the first date of the series, which is what lets
  -- a value publish at all. The gate still has to refuse everything else, which is what the
  -- rest of this file is for: a gate that only ever said no was easy to keep honest, and one
  -- that says yes to the right thing is the one worth testing.
  if (select status from reference.methodology_versions where id = method_ver_id) <> 'approved' then
    raise exception 'the UTVI methodology version is not approved; no value can publish';
  end if;
  if (select effective_from from reference.methodology_versions where id = method_ver_id) is null then
    raise exception 'the approved UTVI methodology version carries no effective date';
  end if;
  if (select count(*) from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = 'utvi' and mv.status = 'draft') <> 0 then
    raise exception 'a UTVI methodology draft is still active alongside the approved version';
  end if;

  -- a base retrieval to hang snapshots from
  insert into pipeline.source_retrievals (
    source_interface_id, idempotency_key, requested_at, completed_at, request_method,
    request_url, request_parameters, response_status, response_hash, enumeration_assessment,
    retrieval_purpose, permission_grant_id
  ) values (
    iface_id, 'utvi-test-a', now(), now(), 'GET',
    'https://openrouter.ai/api/v1/datasets/rankings-daily',
    '{"start_date":"2026-09-15","end_date":"2026-09-15","period":"day"}'::jsonb,
    200, hash_a, 'complete', 'production', grant_id
  ) returning id into retrieval_a;

  insert into pipeline.utvi_retrievals (
    source_retrieval_id, source_interface_id, requested_start_date, requested_end_date,
    actual_start_date, actual_end_date, source_as_of, dataset_version, retrieved_at,
    row_count, outcome
  ) values (
    retrieval_a, iface_id, date '2026-09-15', date '2026-09-15',
    date '2026-09-15', date '2026-09-15', now(), 'v1', now(), 51, 'succeeded'
  ) returning id into utvi_ret_a;

  -- ----------------------------------------------------------- estimated datasets refused
  -- category and language_type read a sampled dataset whose totals arrive as fractions.
  declare
    bad_retrieval uuid;
  begin
    insert into pipeline.source_retrievals (
      source_interface_id, idempotency_key, requested_at, completed_at, request_method,
      request_url, request_parameters, response_status, response_hash, enumeration_assessment,
      retrieval_purpose, permission_grant_id
    ) values (
      iface_id, 'utvi-test-estimated', now(), now(), 'GET',
      'https://openrouter.ai/api/v1/datasets/rankings-daily',
      '{"start_date":"2026-09-01","end_date":"2026-09-15","category":"programming"}'::jsonb,
      200, repeat('c', 64), 'complete', 'production', grant_id
    ) returning id into bad_retrieval;

    failed := false;
    begin
      insert into pipeline.utvi_retrievals (
        source_retrieval_id, source_interface_id, requested_start_date, requested_end_date,
        actual_start_date, actual_end_date, source_as_of, dataset_version, retrieved_at,
        row_count, outcome
      ) values (
        bad_retrieval, iface_id, date '2026-09-01', date '2026-09-15',
        date '2026-09-01', date '2026-09-15', now(), 'v1', now(), 51, 'succeeded'
      );
    exception when check_violation then failed := true;
    end;
    if not failed then
      raise exception 'a retrieval carrying category= was accepted; an estimate can enter the observation tables';
    end if;
  end;

  -- ----------------------------------------------------------- non-daily grain refused
  declare
    weekly_retrieval uuid;
  begin
    insert into pipeline.source_retrievals (
      source_interface_id, idempotency_key, requested_at, completed_at, request_method,
      request_url, request_parameters, response_status, response_hash, enumeration_assessment,
      retrieval_purpose, permission_grant_id
    ) values (
      iface_id, 'utvi-test-weekly', now(), now(), 'GET',
      'https://openrouter.ai/api/v1/datasets/rankings-daily',
      '{"start_date":"2026-09-01","end_date":"2026-09-15","period":"week"}'::jsonb,
      200, repeat('d', 64), 'complete', 'production', grant_id
    ) returning id into weekly_retrieval;

    failed := false;
    begin
      insert into pipeline.utvi_retrievals (
        source_retrieval_id, source_interface_id, requested_start_date, requested_end_date,
        actual_start_date, actual_end_date, source_as_of, dataset_version, retrieved_at,
        row_count, outcome
      ) values (
        weekly_retrieval, iface_id, date '2026-09-01', date '2026-09-15',
        date '2026-09-01', date '2026-09-15', now(), 'v1', now(), 51, 'succeeded'
      );
    exception when check_violation then failed := true;
    end;
    if not failed then
      raise exception 'a weekly-grain retrieval was accepted; its trailing bucket is incomplete';
    end if;
  end;

  -- ----------------------------------------------------------- dates before the floor
  failed := false;
  begin
    insert into pipeline.utvi_daily_snapshots (
      utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
      total_tokens, attributed_tokens, residual_tokens, named_row_count,
      residual_row_present, date_content_hash, observed_at
    ) values (
      utvi_ret_a, iface_id, date '2024-12-31', 'covered_observed',
      100, 90, 10, 50, true, hash_a, now()
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a snapshot before the 2025-01-01 source floor was accepted';
  end if;

  -- ----------------------------------------------------------- the empty-sum refusal
  -- The single most important constraint here. A date with no rows must not be able to
  -- record a total at all, so `sum of nothing = 0` cannot be written down as a measurement.
  failed := false;
  begin
    insert into pipeline.utvi_daily_snapshots (
      utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
      total_tokens, attributed_tokens, residual_tokens, named_row_count,
      residual_row_present, date_content_hash, observed_at
    ) values (
      utvi_ret_a, iface_id, date '2026-09-15', 'covered_no_rows',
      0, 0, 0, 0, false, hash_a, now()
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a zero total was accepted on a date with no rows; missing data can be published as zero';
  end if;

  -- An observed date with zero named rows is equally refused: 51 rows or none, never a
  -- residual standing alone as if it were the market.
  failed := false;
  begin
    insert into pipeline.utvi_daily_snapshots (
      utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
      total_tokens, attributed_tokens, residual_tokens, named_row_count,
      residual_row_present, date_content_hash, observed_at
    ) values (
      utvi_ret_a, iface_id, date '2026-09-15', 'covered_observed',
      10, 0, 10, 0, true, hash_a, now()
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'an observed snapshot with no named rows was accepted';
  end if;

  -- ----------------------------------------------------------- the total must decompose
  failed := false;
  begin
    insert into pipeline.utvi_daily_snapshots (
      utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
      total_tokens, attributed_tokens, residual_tokens, named_row_count,
      residual_row_present, date_content_hash, observed_at
    ) values (
      utvi_ret_a, iface_id, date '2026-09-15', 'covered_observed',
      100, 80, 10, 50, true, hash_a, now()
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a snapshot whose total does not equal attributed + residual was accepted';
  end if;

  -- ----------------------------------------------------------- a valid snapshot
  insert into pipeline.utvi_daily_snapshots (
    utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
    total_tokens, attributed_tokens, residual_tokens, named_row_count,
    residual_row_present, date_content_hash, observed_at
  ) values (
    utvi_ret_a, iface_id, date '2026-09-15', 'covered_observed',
    1000, 900, 100, 50, true, hash_a, now()
  ) returning id into snap_a;

  -- ----------------------------------------------------------- one live snapshot per date
  insert into pipeline.source_retrievals (
    source_interface_id, idempotency_key, requested_at, completed_at, request_method,
    request_url, request_parameters, response_status, response_hash, enumeration_assessment,
    retrieval_purpose, permission_grant_id
  ) values (
    iface_id, 'utvi-test-b', now(), now(), 'GET',
    'https://openrouter.ai/api/v1/datasets/rankings-daily',
    '{"start_date":"2026-09-15","end_date":"2026-09-15","period":"day"}'::jsonb,
    200, hash_b, 'complete', 'production', grant_id
  ) returning id into retrieval_b;

  insert into pipeline.utvi_retrievals (
    source_retrieval_id, source_interface_id, requested_start_date, requested_end_date,
    actual_start_date, actual_end_date, source_as_of, dataset_version, retrieved_at,
    row_count, outcome
  ) values (
    retrieval_b, iface_id, date '2026-09-15', date '2026-09-15',
    date '2026-09-15', date '2026-09-15', now(), 'v1', now(), 51, 'succeeded'
  ) returning id into utvi_ret_b;

  failed := false;
  begin
    insert into pipeline.utvi_daily_snapshots (
      utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
      total_tokens, attributed_tokens, residual_tokens, named_row_count,
      residual_row_present, date_content_hash, observed_at
    ) values (
      utvi_ret_b, iface_id, date '2026-09-15', 'covered_observed',
      1001, 901, 100, 50, true, hash_b, now()
    );
  exception when unique_violation then failed := true;
  end;
  if not failed then
    raise exception 'two live snapshots for one date were accepted; "the current value" is ambiguous';
  end if;

  -- ----------------------------------------------------------- residual identity rules
  failed := false;
  begin
    insert into pipeline.utvi_model_observations (
      daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
      source_total_tokens, is_residual, lab_provider_id, serving_platform_id,
      lab_attribution_state, source_attribution
    ) values (
      snap_a, date '2026-09-15', 'other', null, 100, true, lab_id, platform_id,
      'evidenced', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'the aggregate tail row was given a lab; unattributable volume became attributed';
  end if;

  -- An unmapped lab must not carry a lab id, and an evidenced one must.
  failed := false;
  begin
    insert into pipeline.utvi_model_observations (
      daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
      source_total_tokens, is_residual, lab_provider_id, serving_platform_id,
      lab_attribution_state, source_attribution
    ) values (
      snap_a, date '2026-09-15', 'stealth/ox-alpha', 'stealth', 500, false, lab_id, platform_id,
      'undisclosed', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'an undisclosed-lab row was given a lab id';
  end if;

  failed := false;
  begin
    insert into pipeline.utvi_model_observations (
      daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
      source_total_tokens, is_residual, lab_provider_id, serving_platform_id,
      lab_attribution_state, source_attribution
    ) values (
      snap_a, date '2026-09-15', 'deepseek/deepseek-v4', 'deepseek', 500, false, null, platform_id,
      'evidenced', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'an evidenced attribution was accepted with no lab';
  end if;

  -- An observation's date must match its snapshot's.
  failed := false;
  begin
    insert into pipeline.utvi_model_observations (
      daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
      source_total_tokens, is_residual, serving_platform_id, lab_attribution_state,
      source_attribution
    ) values (
      snap_a, date '2026-09-14', 'deepseek/deepseek-v4', 'deepseek', 500, false, platform_id,
      'unmapped', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'an observation was accepted under a snapshot for a different date';
  end if;

  -- Valid observations: one named with an evidenced lab, one unmapped, and the tail.
  insert into pipeline.utvi_model_observations (
    daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
    source_total_tokens, is_residual, lab_provider_id, serving_platform_id,
    lab_attribution_state, source_attribution
  ) values
    (snap_a, date '2026-09-15', 'deepseek/deepseek-v4-flash', 'deepseek', 400, false, lab_id,
     platform_id, 'evidenced', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'),
    (snap_a, date '2026-09-15', 'stealth/ox-alpha', 'stealth', 500, false, null,
     platform_id, 'undisclosed', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'),
    (snap_a, date '2026-09-15', 'other', null, 100, true, null,
     platform_id, 'not_applicable', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.');

  -- The same permaslug twice in one snapshot is a parse defect, not a market fact.
  failed := false;
  begin
    insert into pipeline.utvi_model_observations (
      daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
      source_total_tokens, is_residual, serving_platform_id, lab_attribution_state,
      source_attribution
    ) values (
      snap_a, date '2026-09-15', 'deepseek/deepseek-v4-flash', 'deepseek', 1, false,
      platform_id, 'unmapped', 'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.'
    );
  exception when unique_violation then failed := true;
  end;
  if not failed then
    raise exception 'one permaslug appeared twice in a single snapshot';
  end if;

  -- ----------------------------------------------------------- calculation agrees with snapshot
  failed := false;
  begin
    insert into pipeline.utvi_calculations (
      instrument_id, instrument_spec_version_id, methodology_version_id, daily_snapshot_id,
      calculation_date, calculated_at, total_observed_tokens, model_residual_tokens,
      lab_residual_tokens, attributed_tokens, eligible_row_count, coverage_state,
      settlement_state, source_content_hash
    ) values (
      utvi_instrument, spec_id, method_ver_id, snap_a,
      date '2026-09-15', now(), 999, 100, 0, 899, 51, 'covered_observed',
      'provisional', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a calculation disagreeing with its snapshot total was accepted';
  end if;

  -- The lab residual is inside the attributed volume, never added to it.
  failed := false;
  begin
    insert into pipeline.utvi_calculations (
      instrument_id, instrument_spec_version_id, methodology_version_id, daily_snapshot_id,
      calculation_date, calculated_at, total_observed_tokens, model_residual_tokens,
      lab_residual_tokens, attributed_tokens, eligible_row_count, coverage_state,
      settlement_state, source_content_hash
    ) values (
      utvi_instrument, spec_id, method_ver_id, snap_a,
      date '2026-09-15', now(), 1000, 100, 950, 900, 51, 'covered_observed',
      'provisional', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a lab residual exceeding the attributed volume was accepted';
  end if;

  -- A valid calculation.
  insert into pipeline.utvi_calculations (
    instrument_id, instrument_spec_version_id, methodology_version_id, daily_snapshot_id,
    calculation_date, calculated_at, total_observed_tokens, model_residual_tokens,
    lab_residual_tokens, attributed_tokens, eligible_row_count, coverage_state,
    settlement_state, source_content_hash
  ) values (
    utvi_instrument, spec_id, method_ver_id, snap_a,
    date '2026-09-15', now(), 1000, 100, 500, 900, 51, 'covered_observed',
    'provisional', hash_a
  ) returning id into calc_a;

  -- ----------------------------------------------------------- the publication gate
  -- Four refusals and one acceptance. Each refusal exists because the alternative is a
  -- published number that means something other than it appears to.

  -- A value that disagrees with its calculation.
  failed := false;
  begin
    insert into pipeline.utvi_publications (
      calculation_id, calculation_date, published_at, value_tokens_per_day,
      published_model_residual, published_lab_residual, settlement_state,
      methodology_version, universe_descriptor, source_attribution, source_content_hash
    ) values (
      calc_a, date '2026-09-15', now(), 999, 100, 500, 'provisional',
      '1.0.0', 'the covered universe',
      'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a published value disagreeing with its calculation was accepted';
  end if;

  -- A methodology version string that disagrees with the calculation's own.
  failed := false;
  begin
    insert into pipeline.utvi_publications (
      calculation_id, calculation_date, published_at, value_tokens_per_day,
      published_model_residual, published_lab_residual, settlement_state,
      methodology_version, universe_descriptor, source_attribution, source_content_hash
    ) values (
      calc_a, date '2026-09-15', now(), 1000, 100, 500, 'provisional',
      '9.9.9', 'the covered universe',
      'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a published value naming the wrong methodology version was accepted';
  end if;

  -- A publication date that disagrees with the calculation's date.
  failed := false;
  begin
    insert into pipeline.utvi_publications (
      calculation_id, calculation_date, published_at, value_tokens_per_day,
      published_model_residual, published_lab_residual, settlement_state,
      methodology_version, universe_descriptor, source_attribution, source_content_hash
    ) values (
      calc_a, date '2026-09-14', now(), 1000, 100, 500, 'provisional',
      '1.0.0', 'the covered universe',
      'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a published value dated differently from its calculation was accepted';
  end if;

  -- An empty universe descriptor. Coverage is part of what is published, so a value cannot
  -- be published without saying what it observed.
  failed := false;
  begin
    insert into pipeline.utvi_publications (
      calculation_id, calculation_date, published_at, value_tokens_per_day,
      published_model_residual, published_lab_residual, settlement_state,
      methodology_version, universe_descriptor, source_attribution, source_content_hash
    ) values (
      calc_a, date '2026-09-15', now(), 1000, 100, 500, 'provisional',
      '1.0.0', '   ',
      'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a value was published with no universe descriptor';
  end if;

  -- And the acceptance: a calculation that agrees with itself publishes.
  insert into pipeline.utvi_publications (
    calculation_id, calculation_date, published_at, value_tokens_per_day,
    published_model_residual, published_lab_residual, settlement_state,
    methodology_version, universe_descriptor, source_attribution, source_content_hash
  ) values (
    calc_a, date '2026-09-15', now(), 1000, 100, 500, 'provisional',
    '1.0.0', 'Token volume exposed by OpenRouter''s rankings-daily dataset for the traffic included by that dataset.',
    'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
  );

  -- One live publication per date.
  failed := false;
  begin
    insert into pipeline.utvi_publications (
      calculation_id, calculation_date, published_at, value_tokens_per_day,
      published_model_residual, published_lab_residual, settlement_state,
      methodology_version, universe_descriptor, source_attribution, source_content_hash
    ) values (
      calc_a, date '2026-09-15', now(), 1000, 100, 500, 'provisional',
      '1.0.0', 'the covered universe',
      'Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T00:00:00Z.', hash_a
    );
  exception when unique_violation then failed := true;
  end;
  if not failed then
    raise exception 'two live publications for one date were accepted';
  end if;

  -- ----------------------------------------------------------- append-only and supersession
  failed := false;
  begin
    update pipeline.utvi_daily_snapshots set total_tokens = 2000 where id = snap_a;
  exception when restrict_violation then failed := true;
  end;
  if not failed then
    raise exception 'a snapshot total was edited in place';
  end if;

  failed := false;
  begin
    update pipeline.utvi_calculations set total_observed_tokens = 2000 where id = calc_a;
  exception when restrict_violation then failed := true;
  end;
  if not failed then
    raise exception 'a calculation was edited in place';
  end if;

  failed := false;
  begin
    delete from pipeline.utvi_model_observations where daily_snapshot_id = snap_a;
  exception when restrict_violation then failed := true;
  end;
  if not failed then
    raise exception 'observations were deleted rather than superseded';
  end if;

  -- Settling provisional to final is permitted, and it is the only field that may move.
  update pipeline.utvi_daily_snapshots set settlement_state = 'final' where id = snap_a;
  if (select settlement_state from pipeline.utvi_daily_snapshots where id = snap_a) <> 'final' then
    raise exception 'settling a provisional snapshot to final was rejected';
  end if;

  -- A final snapshot may still be superseded: a late revision is a fact about the source,
  -- not a permission Urdais grants itself.
  insert into pipeline.utvi_daily_snapshots (
    utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
    total_tokens, attributed_tokens, residual_tokens, named_row_count,
    residual_row_present, date_content_hash, observed_at, settlement_state
  ) values (
    utvi_ret_b, iface_id, date '2026-09-16', 'covered_observed',
    2000, 1800, 200, 50, true, hash_b, now(), 'provisional'
  ) returning id into snap_b;

  update pipeline.utvi_daily_snapshots
     set superseded_by_id = snap_b, superseded_at = now(), supersession_reason = 'source revised'
   where id = snap_a;
  if (select superseded_by_id from pipeline.utvi_daily_snapshots where id = snap_a) is null then
    raise exception 'superseding a final snapshot was rejected; a late revision cannot be recorded';
  end if;

  -- A superseded snapshot may not back a new calculation.
  failed := false;
  begin
    insert into pipeline.utvi_calculations (
      instrument_id, instrument_spec_version_id, methodology_version_id, daily_snapshot_id,
      calculation_date, calculated_at, total_observed_tokens, model_residual_tokens,
      lab_residual_tokens, attributed_tokens, eligible_row_count, coverage_state,
      settlement_state, source_content_hash
    ) values (
      utvi_instrument, spec_id, method_ver_id, snap_a,
      date '2026-09-15', now(), 1000, 100, 0, 900, 51, 'covered_observed',
      'final', hash_a
    );
  exception when check_violation then failed := true;
  end;
  if not failed then
    raise exception 'a superseded snapshot backed a new calculation';
  end if;

  raise notice 'UTVI schema invariants hold';
end;
$$;

rollback;
