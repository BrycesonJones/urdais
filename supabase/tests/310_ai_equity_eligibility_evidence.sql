-- AI Equity Universe candidate discovery and point-in-time thematic eligibility.
--
-- The gates tested here are the ones that, if they silently failed, would let the system publish
-- something Urdais has not decided: a Route B admission under an uncalibrated tau_B, a
-- determination published out of a development cycle, an unverified machine extraction promoted
-- to establishing evidence, or a review whose evidence cutoff quietly disagrees with its cycle's.
--
-- The tau_B gate gets the most attention because it is the one with a tempting default. The
-- founder decision of 17 September 2026 was that the 10% Route B floor is a research candidate
-- and not a convention, and the test below is what makes that decision survive a future
-- contributor who does not know it was ever made.
begin;

-- The two blocks below read only what the migrations seeded, so they run before this file
-- creates any fixture of its own. A fixture that looked like seeded state would make these
-- assertions report on themselves.

-- ---------------------------------------------------------------- the seeded cycle itself
--
-- These assert what the first review cycle actually recorded. They are written as facts about
-- the seed rather than about the schema, because the seed is the part a future contributor is
-- most likely to "fix" by filling in the blanks.

do $$
declare
  n integer;
  cyc uuid;
begin
  select id into cyc from reference.ai_universe_review_cycles where label = 'dev-2026-09';
  if cyc is null then raise exception 'the first review cycle is missing'; end if;

  select count(*) into n from pipeline.issuer_candidates where review_cycle_id = cyc;
  if n < 20 then raise exception 'the first cycle discovered only % candidates', n; end if;

  -- Every candidate arrived through a recorded discovery channel; none appeared from nowhere.
  select count(*) into n
    from pipeline.issuer_candidates c
   where c.review_cycle_id = cyc
     and not exists (select 1 from pipeline.candidate_discoveries d where d.candidate_id = c.id);
  if n <> 0 then raise exception '% candidate(s) have no recorded discovery', n; end if;

  -- Research documents seeded discovery and nothing else: every seeded discovery is of the
  -- research_seed channel, which is the channel that confers no eligibility significance.
  select count(*) into n
    from pipeline.candidate_discoveries d
    join pipeline.issuer_candidates c on c.id = d.candidate_id
   where c.review_cycle_id = cyc and d.discovery_channel <> 'research_seed';
  if n <> 0 then raise exception '% seeded discovery row(s) claim a channel other than research_seed', n; end if;

  -- No issuer is eligible, and none is published. Both follow from the evidence, and either
  -- changing is a decision someone has to make deliberately.
  select count(*) into n from pipeline.eligibility_reviews
   where review_cycle_id = cyc and status = 'eligible';
  if n <> 0 then raise exception '% issuer(s) were admitted in the development cycle', n; end if;

  select count(*) into n from pipeline.eligibility_reviews
   where review_cycle_id = cyc and publication_state <> 'internal';
  if n <> 0 then raise exception '% determination(s) left internal state', n; end if;

  -- Every claim in the seed is model-assisted and unverified, and therefore corroborating.
  -- If a later change promotes one to establishing, it must also name the human who verified it.
  select count(*) into n from pipeline.evidence_claims
   where evidence_class = 'establishing' and extraction_method <> 'human'
     and human_verification <> 'verified';
  if n <> 0 then raise exception '% unverified machine claim(s) are marked establishing', n; end if;

  -- tau_B remains unresolved: no approved row, so no Route B admission is possible anywhere.
  select count(*) into n from reference.methodology_parameters
   where parameter_key = 'tau_b' and status = 'approved';
  if n <> 0 then raise exception 'tau_B has been approved without a recorded decision to do so'; end if;

  -- Every evidence document in the seed carries a hash, so every quoted passage is checkable
  -- against bytes rather than against memory.
  select count(*) into n from pipeline.evidence_documents where content_hash is null;
  if n <> 0 then raise exception '% evidence document(s) have no content hash', n; end if;

  raise notice 'ai equity seed: % candidates, no admissions', (
    select count(*) from pipeline.issuer_candidates where review_cycle_id = cyc);
end $$;

-- --------------------------------------------------------------- the filing source registry
--
-- The rights half. HKEXnews is the case that matters: its terms forbid automated retrieval, and
-- the registry must carry that as a fact rather than as an absence.

do $$
declare
  n integer;
begin
  -- No filing source is approved for production. Collection being permitted is not the same
  -- question as data use being permitted, and EDGAR answers only the first.
  select count(*) into n from reference.source_interfaces
   where source_class = 'regulatory_filing_repository' and production_access_state = 'production_approved';
  if n <> 0 then raise exception '% filing source(s) are production-approved', n; end if;

  -- HKEXnews is recorded as refused on both axes and blocked, with a grant that covers nothing.
  select count(*) into n from reference.source_interfaces
   where slug = 'hkexnews-filings' and terms_review_state = 'not_permitted'
     and data_use_terms_state = 'not_permitted' and production_access_state = 'production_blocked'
     and is_machine_readable = false;
  if n <> 1 then raise exception 'HKEXnews is not recorded as refused and blocked'; end if;

  select count(*) into n
    from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'hkexnews-filings'
     and (g.covers_collection or g.covers_index_use or g.covers_internal_use
          or g.covers_index_calculation or g.covers_storage or g.covers_raw_redistribution);
  if n <> 0 then raise exception 'the HKEXnews refusal grants a right'; end if;

  -- The refusal names the clause it rests on, so a future reader can check it rather than
  -- trust it.
  select count(*) into n
    from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'hkexnews-filings' and g.decisive_clause is not null and g.reviewed_by is not null;
  if n <> 1 then raise exception 'the HKEXnews refusal cites no clause'; end if;

  -- EDGAR permits collection and does not address data use. Redistribution is not claimed.
  select count(*) into n from reference.source_interfaces
   where slug = 'sec-edgar-filings' and terms_review_state = 'permitted'
     and data_use_terms_state = 'under_review';
  if n <> 1 then raise exception 'the EDGAR two-axis review is not recorded as permitted/under review'; end if;

  select count(*) into n
    from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'sec-edgar-filings' and g.covers_raw_redistribution;
  if n <> 0 then raise exception 'the EDGAR grant claims a redistribution right'; end if;

  -- Every document Urdais retrieved automatically came from a source whose terms permit it.
  select count(*) into n
    from pipeline.evidence_documents d
    join reference.source_interfaces s on s.id = d.source_interface_id
   where d.capture_method = 'automated_retrieval' and s.terms_review_state <> 'permitted';
  if n <> 0 then raise exception '% document(s) were retrieved from a source that does not permit it', n; end if;

  raise notice 'filing sources: rights ok';
end $$;

do $$
declare
  ok boolean;
  n integer;
  mv uuid;
  cyc_dev uuid; cyc_prod_open uuid; cyc_prod_approved uuid;
  iss_a uuid; iss_b uuid; iss_c uuid;
  doc uuid; claim uuid; rev uuid; rev2 uuid;
  iface uuid; grant_id uuid; prov uuid;
  param uuid;
begin
  -- ------------------------------------------------------------------ fixtures

  select id into mv from reference.methodology_versions
   where document_path = 'docs/methodology/ai-equity-universe.md' limit 1;
  if mv is null then raise exception 'the AI equity universe methodology version is not registered'; end if;

  insert into reference.ai_universe_review_cycles
    (label, methodology_version_id, cycle_kind, status, evidence_cutoff)
    values ('t-dev', mv, 'development', 'evidence_collection', timestamptz '2026-06-01T00:00:00Z')
    returning id into cyc_dev;
  insert into reference.ai_universe_review_cycles
    (label, methodology_version_id, cycle_kind, status, evidence_cutoff)
    values ('t-prod-open', mv, 'production', 'review', timestamptz '2026-06-01T00:00:00Z')
    returning id into cyc_prod_open;
  insert into reference.ai_universe_review_cycles
    (label, methodology_version_id, cycle_kind, status, evidence_cutoff,
     opened_at, closed_at, scheduled_effective_date)
    values ('t-prod-done', mv, 'production', 'approved', timestamptz '2026-06-01T00:00:00Z',
            timestamptz '2026-05-01T00:00:00Z', timestamptz '2026-06-02T00:00:00Z', date '2026-07-01')
    returning id into cyc_prod_approved;

  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-alpha', 'Test Alpha Inc.', 'US') returning id into iss_a;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-beta', 'Test Beta Inc.', 'US') returning id into iss_b;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-gamma', 'Test Gamma Inc.', 'US') returning id into iss_c;

  insert into reference.providers (slug, name, provider_kind)
    values ('t-filer', 'Test Filing Authority', 'other') returning id into prov;
  insert into reference.source_interfaces
    (provider_id, slug, name, source_class, canonical_url, access_class, terms_review_state)
    values (prov, 't-filings', 'Test filings', 'regulatory_filing_repository',
            'https://example.invalid/filings', 'public_unauthenticated', 'permitted')
    returning id into iface;
  insert into reference.permission_grants
    (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
     effective_from, evidence)
    values (iface, 'provider_terms', 'test terms v1', true, false,
            timestamptz '2026-01-01T00:00:00Z', 'test fixture')
    returning id into grant_id;

  insert into pipeline.evidence_documents
    (source_interface_id, permission_grant_id, canonical_url, document_type,
     retrieved_at, capture_method)
    values (iface, grant_id, 'https://example.invalid/filings/alpha-10k', 'form_10k',
            timestamptz '2026-05-01T00:00:00Z', 'automated_retrieval')
    returning id into doc;

  -- ------------------------------ evidence documents name their basis or their reader

  ok := false;
  begin
    insert into pipeline.evidence_documents
      (source_interface_id, canonical_url, document_type, retrieved_at, capture_method)
      values (iface, 'https://example.invalid/x', 'form_10k',
              timestamptz '2026-05-01T00:00:00Z', 'automated_retrieval');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an automated retrieval was recorded with no permission grant'; end if;

  ok := false;
  begin
    insert into pipeline.evidence_documents
      (canonical_url, document_type, retrieved_at, capture_method)
      values ('https://example.invalid/y', 'exchange_filing',
              timestamptz '2026-05-01T00:00:00Z', 'manual_capture');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a manual capture was recorded without naming who read it'; end if;

  -- Manual capture with a named reader and no grant is the HKEXnews path, and must work.
  insert into pipeline.evidence_documents
    (canonical_url, document_type, retrieved_at, capture_method, captured_by)
    values ('https://example.invalid/hk', 'exchange_filing',
            timestamptz '2026-05-01T00:00:00Z', 'manual_capture', 'a named human');

  -- ------------------------- machine extraction is not establishing until a human says so

  ok := false;
  begin
    insert into pipeline.evidence_claims
      (evidence_document_id, issuer_id, evidence_class, claim_type, quoted_passage,
       extraction_method, human_verification)
      values (doc, iss_a, 'establishing', 'qualifying_activity', 'a passage',
              'model_assisted', 'unverified');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unverified machine extraction was accepted as establishing evidence'; end if;

  -- The same claim, verified by a named human, is admissible.
  insert into pipeline.evidence_claims
    (evidence_document_id, issuer_id, evidence_class, claim_type, quoted_passage,
     extraction_method, human_verification, verified_by, verified_at)
    values (doc, iss_a, 'establishing', 'qualifying_activity', 'a passage',
            'model_assisted', 'verified', 'a named human', timestamptz '2026-05-02T00:00:00Z')
    returning id into claim;

  -- An establishing claim must carry substance rather than an assertion.
  ok := false;
  begin
    insert into pipeline.evidence_claims
      (evidence_document_id, issuer_id, evidence_class, claim_type, extraction_method)
      values (doc, iss_a, 'establishing', 'qualifying_activity', 'human');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an establishing claim was accepted with neither a passage nor a figure'; end if;

  -- --------------------------------------------------------- the tau_B gate

  -- No approved tau_B exists, so a Route B admission is refused. This is the whole point.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc_dev, iss_a, mv, 'eligible', 3, 'B', array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Tier 3 Route B issuer was admitted with no approved tau_B in force'; end if;

  -- The gate is narrow: Tier 1, Tier 2 and Route A are untouched by it.
  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
     value_chain_layers, evidence_cutoff, review_date, reviewer)
    values (cyc_dev, iss_b, mv, 'eligible', 2, array['compute_and_infrastructure']::text[],
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');

  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
     tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
    values (cyc_dev, iss_c, mv, 'eligible', 3, 'A', array['platform']::text[],
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');

  -- A draft tau_B does not open the gate: a draft carries no effective date and the trigger
  -- looks for an approved parameter in force.
  insert into reference.methodology_parameters
    (methodology_version_id, parameter_key, numeric_value, status)
    values (mv, 'tau_b', 0.10, 'draft');

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc_prod_open, iss_a, mv, 'eligible', 3, 'B', array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a draft tau_B opened the Route B gate'; end if;

  -- An approved tau_B, in force at the review date, does open it. Approving is an attributed,
  -- dated act, which the parameter table enforces on its own.
  ok := false;
  begin
    insert into reference.methodology_parameters
      (methodology_version_id, parameter_key, numeric_value, status, effective_from)
      values (mv, 'tau_b', 0.10, 'approved', date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an approved parameter was recorded with no approver'; end if;

  insert into reference.methodology_parameters
    (methodology_version_id, parameter_key, numeric_value, status, effective_from,
     approved_by, approved_on)
    values (mv, 'tau_b', 0.10, 'approved', date '2026-01-01', 'a named approver', date '2026-01-01')
    returning id into param;

  -- In force since January, so a June review passes.
  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
     tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
    values (cyc_prod_open, iss_a, mv, 'eligible', 3, 'B', array['application']::text[],
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');

  -- ...and the gate is point-in-time, not merely present-tense: a review dated before the
  -- parameter took effect is still refused.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_b, mv, 'eligible', 3, 'B', array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2025-12-31', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'Route B was admitted at a date before tau_B took effect'; end if;

  -- ------------------------------------------------- publication is a property of the cycle

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       value_chain_layers, evidence_cutoff, review_date, reviewer, publication_state)
      values (cyc_dev, iss_a, mv, 'eligible', 1, array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer', 'published');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a development cycle published a determination'; end if;

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       value_chain_layers, evidence_cutoff, review_date, reviewer, publication_state)
      values (cyc_prod_open, iss_b, mv, 'eligible', 1, array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer', 'published');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unapproved production cycle published a determination'; end if;

  -- A development cycle cannot be approved into one that could publish, either.
  ok := false;
  begin
    update reference.ai_universe_review_cycles
       set status = 'approved', closed_at = now(), scheduled_effective_date = date '2026-07-01'
     where id = cyc_dev;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a development cycle was approved'; end if;

  -- Only an eligible determination can be published at all.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status,
       evidence_cutoff, review_date, reviewer, publication_state)
      values (cyc_prod_approved, iss_c, mv, 'pending',
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer', 'published');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a pending determination was published'; end if;

  -- ------------------------------------------------ point-in-time integrity of the cutoff

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status,
       evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_a, mv, 'pending',
              timestamptz '2026-09-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a review carried an evidence cutoff its cycle does not have'; end if;

  -- -------------------------------------------- eligible and non-eligible are shaped apart

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status,
       value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_a, mv, 'eligible', array['platform']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an eligible determination carried no final tier'; end if;

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_a, mv, 'pending', 2,
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a pending determination carried a final tier'; end if;

  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_a, mv, 'eligible', 1,
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an eligible determination carried no value-chain layer'; end if;

  -- An independent check is only independent if someone else performed it.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status,
       evidence_cutoff, review_date, reviewer, independent_reviewer, independent_check_state)
      values (cyc_prod_approved, iss_a, mv, 'pending',
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05',
              'a reviewer', 'a reviewer', 'passed');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a reviewer signed off on their own review as the independent check'; end if;

  -- ---------------------------------------------- the ranked scale hierarchy for Route A

  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, candidate_primary_tier,
     tier3_route, evidence_cutoff, review_date, reviewer)
    values (cyc_prod_approved, iss_a, mv, 'pending', 3, 'A',
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer')
    returning id into rev;

  ok := false;
  begin
    insert into pipeline.tier3_assessments
      (review_id, route, offering, generally_available, separately_contracted,
       scale_evidence_rank, satisfied, basis)
      values (rev, 'A', 'a cloud offering', true, true, 3, true, 'gross billings');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'Route A was satisfied on rank 3 evidence'; end if;

  ok := false;
  begin
    insert into pipeline.tier3_assessments
      (review_id, route, offering, generally_available, separately_contracted,
       scale_evidence_rank, satisfied, basis)
      values (rev, 'A', 'another offering', false, true, 1, true, 'not generally available');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'Route A was satisfied for an offering that is not generally available'; end if;

  insert into pipeline.tier3_assessments
    (review_id, route, offering, generally_available, separately_contracted,
     scale_evidence_rank, scale_value, scale_currency, satisfied, basis)
    values (rev, 'A', 'a disclosed offering', true, true, 1, 1000000000, 'USD', true,
            'segment revenue disclosed in the filing');

  -- Route B needs both sides of the ratio to have produced it.
  ok := false;
  begin
    insert into pipeline.tier3_assessments
      (review_id, route, offering, r_i_lower, satisfied, basis)
      values (rev, 'B', 'a bundled feature', 0.4, true, 'a ratio with no inputs');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Route B ratio was satisfied without its two inputs'; end if;

  -- ------------------------------------------------- Tier 1 ancillary support is bounded

  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, candidate_primary_tier,
     evidence_cutoff, review_date, reviewer)
    values (cyc_prod_approved, iss_b, mv, 'pending', 1,
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer')
    returning id into rev2;

  ok := false;
  begin
    insert into pipeline.tier1_product_lines
      (review_id, line_name, qualifies, ancillary_support, basis)
      values (rev2, 'a qualifying line', true, true, 'ancillary to itself');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a qualifying line was also marked ancillary support'; end if;

  ok := false;
  begin
    insert into pipeline.tier1_product_lines
      (review_id, line_name, qualifies, ancillary_support, separately_disclosed, basis)
      values (rev2, 'a disclosed line', false, true, true, 'disclosed yet presumed ancillary');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a separately disclosed line was presumed ancillary'; end if;

  insert into pipeline.tier1_product_lines
    (review_id, line_name, qualifies, ancillary_support, separately_disclosed, basis)
    values (rev2, 'a support line', false, true, false,
            'the filing presents it as hosting the other platforms');

  -- ---------------------------------------------------------------- append-only behaviour

  ok := false;
  begin
    update pipeline.evidence_documents set notes = 'edited' where id = doc;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'an evidence document was edited after the fact'; end if;

  ok := false;
  begin
    delete from pipeline.evidence_claims where id = claim;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'an evidence claim was deleted'; end if;

  ok := false;
  begin
    update pipeline.eligibility_reviews set status = 'eligible' where id = rev;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a determination was edited in place instead of superseded'; end if;

  -- Supersession itself is permitted, and is the only permitted update.
  update pipeline.eligibility_reviews
     set superseded_by_id = rev2, superseded_at = now(),
         supersession_reason = 'superseded by a later review in the test'
   where id = rev;

  -- Two live determinations for one issuer in one cycle is the thing supersession prevents.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status,
       evidence_cutoff, review_date, reviewer)
      values (cyc_prod_approved, iss_b, mv, 'pending',
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-06', 'a reviewer');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'an issuer held two live determinations in one cycle'; end if;

  -- ------------------------------------------------------- parameters are dated and signed

  ok := false;
  begin
    insert into reference.methodology_parameters
      (methodology_version_id, parameter_key, numeric_value, status, effective_from)
      values (mv, 'issuer_cap', 0.1, 'draft', date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a draft parameter carried a production effective date'; end if;

  raise notice 'ai equity eligibility: gates ok';
end $$;

rollback;
