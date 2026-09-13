-- P2 implies P1 implies P0; exclusions agree with the stage they name;
-- diagnostics never imply ineligibility; vocabulary is closed.
begin;

insert into reference.providers (id, slug, name, provider_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'test-provider', 'Test Provider', 'marketplace');
insert into reference.source_interfaces (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class)
values ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 'test-offers', 'Test offers', 'offer_interface', 'https://example.invalid/offers', true, 'api_key');
insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000011', 'test:1', now(), 'GET', 'https://example.invalid/offers', 200, repeat('a', 64), 'unknown');
insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, record_hash, raw_payload, observed_at)
values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 0, repeat('b', 64), '{}', now());
insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, observed_at)
values ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000101', '11111111-0000-4000-8000-000000000101', now());

do $$
declare
  ok boolean;
  obs uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  spec uuid := '22222222-0000-4000-8000-000000000101';
  mver uuid := '11111111-0000-4000-8000-000000000101';
  a_p1 uuid := 'ffffffff-0000-4000-8000-000000000001';
  a_p2 uuid := 'ffffffff-0000-4000-8000-000000000002';
begin
  -- Impossible combinations are rejected at the constraint.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec, mver, now(), false, true, false, 'ineligible');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'p1 without p0 was accepted'; end if;

  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec, mver, now(), true, false, true, 'valid');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'p2 without p1 was accepted'; end if;

  -- A P2-eligible row cannot be an ineligible input, and vice versa.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec, mver, now(), true, true, true, 'ineligible');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'p2=true with input_status=ineligible was accepted'; end if;
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (obs, spec, mver, now(), true, false, false, 'valid');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'p2=false with input_status=valid was accepted'; end if;

  -- A P1-only assessment (failed P2) with a P2 exclusion: consistent.
  insert into pipeline.eligibility_assessments (id, normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
  values (a_p1, obs, spec, mver, now(), true, true, false, 'ineligible');
  insert into pipeline.eligibility_exclusions (assessment_id, reason_code) values (a_p1, 'REGION_UNRESOLVED');

  -- A P1 exclusion on an assessment that passed P1: rejected by trigger.
  ok := false;
  begin
    insert into pipeline.eligibility_exclusions (assessment_id, reason_code) values (a_p1, 'TENANCY_UNRESOLVED');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'P1 exclusion on a P1-passing assessment was accepted'; end if;

  -- An unknown exclusion code is rejected: the vocabulary is closed.
  ok := false;
  begin
    insert into pipeline.eligibility_exclusions (assessment_id, reason_code) values (a_p1, 'MADE_UP_REASON');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'unknown exclusion code was accepted'; end if;

  raise notice 'stage invariants (constraints): ok';
end $$;

-- Supersession: the only permitted update. The self-referencing FK is deferred, so
-- the canonical sequence within one transaction is: mark the old row superseded by
-- the new id, then insert the new row.
do $$
declare
  ok boolean;
  obs uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  spec uuid := '22222222-0000-4000-8000-000000000101';
  mver uuid := '11111111-0000-4000-8000-000000000101';
  a_old uuid := 'ffffffff-0000-4000-8000-000000000001';
  a_new uuid := 'ffffffff-0000-4000-8000-000000000003';
  n integer;
begin
  -- A second current assessment cannot be inserted while the old one stands.
  ok := false;
  begin
    insert into pipeline.eligibility_assessments (id, normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
    values (a_new, obs, spec, mver, now(), true, true, true, 'valid');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'second current assessment was accepted'; end if;

  -- A partial supersession (missing the reason) is rejected.
  ok := false;
  begin
    update pipeline.eligibility_assessments set superseded_by_id = a_new, superseded_at = now() where id = a_old;
  exception when restrict_violation or check_violation then ok := true;
  end;
  if not ok then raise exception 'partial supersession was accepted'; end if;

  -- The supported sequence works.
  update pipeline.eligibility_assessments
     set superseded_by_id = a_new, superseded_at = now(), supersession_reason = 'test re-evaluation'
   where id = a_old;
  insert into pipeline.eligibility_assessments (id, normalized_observation_id, instrument_spec_version_id, methodology_version_id, assessed_at, p0, p1, p2, input_status)
  values (a_new, obs, spec, mver, now(), true, true, true, 'valid');
  -- Force the deferred FK check now rather than at ROLLBACK, so a dangling reference would fail here.
  set constraints all immediate;

  -- A diagnostic on the eligible assessment is fine and changes nothing about eligibility.
  insert into pipeline.eligibility_diagnostics (assessment_id, diagnostic_code, detail)
  values (a_new, 'OPERATOR_UNDETERMINED', '{"basis":"no operator evidence"}'),
         (a_new, 'TAX_BASIS_UNRESOLVED', null);
  if (select p2 from pipeline.eligibility_assessments where id = a_new) is not true then
    raise exception 'diagnostics altered eligibility';
  end if;

  -- An exclusion on a fully eligible assessment is impossible at every stage.
  ok := false;
  begin insert into pipeline.eligibility_exclusions (assessment_id, reason_code) values (a_new, 'PRICE_STALE'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'P2 exclusion on a P2-passing assessment was accepted'; end if;

  -- An unknown diagnostic code is rejected.
  ok := false;
  begin insert into pipeline.eligibility_diagnostics (assessment_id, diagnostic_code) values (a_new, 'MADE_UP'); exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'unknown diagnostic code was accepted'; end if;

  -- The old assessment is now immutable, and neither can be deleted.
  ok := false;
  begin update pipeline.eligibility_assessments set input_status = 'stale' where id = a_old; exception when restrict_violation then ok := true; end;
  if not ok then raise exception 'superseded assessment was editable'; end if;
  ok := false;
  begin delete from pipeline.eligibility_assessments where id = a_new; exception when restrict_violation then ok := true; end;
  if not ok then raise exception 'assessment was deletable'; end if;

  -- Exclusions and diagnostics are append-only.
  ok := false;
  begin delete from pipeline.eligibility_diagnostics where assessment_id = a_new; exception when restrict_violation then ok := true; end;
  if not ok then raise exception 'diagnostic was deletable'; end if;

  -- Vocabulary counts match the methodology.
  select count(*) into n from reference.exclusion_reasons; if n <> 26 then raise exception 'expected 26 exclusion reasons, found %', n; end if;
  select count(*) into n from reference.diagnostic_codes; if n <> 7 then raise exception 'expected 7 diagnostic codes, found %', n; end if;
  select count(*) into n from reference.exclusion_reasons where stage = 'P0'; if n <> 3 then raise exception 'expected 3 P0 reasons, found %', n; end if;
  select count(*) into n from reference.exclusion_reasons where stage = 'P1'; if n <> 7 then raise exception 'expected 7 P1 reasons, found %', n; end if;
  select count(*) into n from reference.exclusion_reasons where stage = 'P2'; if n <> 16 then raise exception 'expected 16 P2 reasons, found %', n; end if;

  raise notice 'stage invariants: ok';
end $$;

rollback;
