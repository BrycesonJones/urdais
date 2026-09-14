-- Manual verified acquisition: a person may record a production retrieval of a
-- first-party published page with evidence, and that grants nothing about
-- automated collection, which stays refused exactly as before.
begin;

do $$
declare
  ok boolean;
  iface uuid;
  approved uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'anthropic-api-pricing-docs';
  if iface is null then raise exception 'anthropic pricing interface missing'; end if;

  -- The interface is not production-approved and nothing here changes that.
  if not exists (select 1 from reference.source_interfaces where id = iface and production_access_state = 'research_usable') then
    raise exception 'the anthropic interface is not in the research_usable state this test assumes';
  end if;

  -- An automated production retrieval is still refused.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, acquisition_mode)
    values (iface, 'auto:prod', now(), 'GET', 'https://example.invalid/pricing', 200, repeat('a', 64), 'unknown', 'production', 'automated');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an automated production retrieval was accepted from an unapproved interface'; end if;

  -- So is one that declares no acquisition mode at all.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
    values (iface, 'auto:prod:2', now(), 'GET', 'https://example.invalid/pricing', 200, repeat('b', 64), 'unknown', 'production');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production retrieval with no acquisition mode was accepted'; end if;

  -- A manual verification without evidence is not a verification.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url, response_status, response_hash, response_body, enumeration_assessment, retrieval_purpose, acquisition_mode)
    values (iface, 'manual:noevidence', now(), now(), 'manual_read', 'https://example.invalid/pricing', 200, repeat('c', 64), '{"body":"<html/>"}'::jsonb, 'unknown', 'production', 'manual_verified');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a manual verification without evidence was accepted'; end if;

  -- Nor is one that was fetched rather than read.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url, response_status, response_hash, response_body, enumeration_assessment, retrieval_purpose, acquisition_mode, verification_evidence)
    values (iface, 'manual:fetched', now(), now(), 'GET', 'https://example.invalid/pricing', 200, repeat('d', 64), '{"body":"<html/>"}'::jsonb, 'unknown', 'production', 'manual_verified', 'read the page');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a fetched retrieval was accepted as a manual verification'; end if;

  -- A complete manual verification is accepted, with no permission grant.
  insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url, response_status, response_hash, response_body, enumeration_assessment, retrieval_purpose, acquisition_mode, verification_evidence)
  values (iface, 'manual:ok', now(), now(), 'manual_read', 'https://docs.anthropic.com/pricing', 200, repeat('e', 64), '{"body":"<html/>"}'::jsonb, 'unknown', 'production', 'manual_verified', 'Read the published pricing table and confirmed the standard input and output rates.');

  -- The registry is untouched by that.
  if not exists (select 1 from reference.source_interfaces where id = iface and production_access_state = 'research_usable' and terms_review_state = 'under_review' and data_use_terms_state = 'under_review') then
    raise exception 'recording a manual verification changed the source registry';
  end if;
  select count(*) into ok from reference.source_interfaces where production_access_state = 'production_approved';
  if (select count(*) from reference.source_interfaces where production_access_state = 'production_approved') <> 1 then
    raise exception 'the set of production-approved interfaces changed';
  end if;

  -- And an automated production retrieval from the very same interface is still refused.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose, acquisition_mode)
    values (iface, 'auto:after-manual', now(), 'GET', 'https://example.invalid/pricing', 200, repeat('f', 64), 'unknown', 'production', 'automated');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a manual verification made automated collection permissible'; end if;

  -- UCPI is unaffected: its production retrievals still need an approved interface and a grant.
  select id into approved from reference.source_interfaces where slug = 'price-of-compute-prices';
  if approved is null then raise exception 'the licensed compute source is missing'; end if;
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
    values (approved, 'ucpi:nogrant', now(), 'GET', 'https://priceofcompute.com/api/v1/prices/h100-sxm', 200, repeat('1', 64), 'complete', 'production');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a UCPI production retrieval was accepted without a permission grant'; end if;

  raise notice 'manual verified acquisition: ok';
end $$;

rollback;
