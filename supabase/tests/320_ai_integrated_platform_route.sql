-- Tier 1 Route P, the AI-integrated platform route added by methodology 0.4.0-draft.
--
-- The amendment exists because the first production review rejected an issuer for having its AI
-- structurally integrated. The risk in fixing that is the opposite error: a route so wide that any
-- software company with an AI feature walks through it. Conditions 2 and 5 are what stand between
-- those two failures, so most of this file is about making sure they actually bite.
--
-- The seeded assertions come first, before this file creates any fixture of its own, because a
-- fixture that looked like seeded state would make them report on themselves.
begin;

-- ------------------------------------------------- what the amendment actually recorded

do $$
declare
  n integer;
  cyc_a uuid; cyc_b uuid;
  rev_old uuid; rev_new uuid;
begin
  select id into cyc_a from reference.ai_universe_review_cycles where label = 'dev-2026-09';
  select id into cyc_b from reference.ai_universe_review_cycles where label = 'dev-2026-09b';
  if cyc_b is null then raise exception 'the 0.4.0-draft re-review cycle is missing'; end if;

  -- The amendment did not resolve anything it was not supposed to resolve.
  select count(*) into n from reference.methodology_parameters
   where parameter_key in ('tau_b', 'issuer_cap') and status = 'approved';
  if n <> 0 then raise exception 'the Tier 1 amendment approved an unrelated parameter'; end if;

  select count(*) into n from pipeline.eligibility_reviews
   where review_cycle_id = cyc_b and publication_state <> 'internal';
  if n <> 0 then raise exception '% determination(s) left internal state', n; end if;

  -- ---------------------------------------------------------------- NVIDIA

  select id into rev_old from pipeline.eligibility_reviews
   where review_cycle_id = cyc_a
     and issuer_id = (select id from reference.issuers where issuer_key = 'nvidia');
  select id into rev_new from pipeline.eligibility_reviews
   where review_cycle_id = cyc_b
     and issuer_id = (select id from reference.issuers where issuer_key = 'nvidia');

  -- The prior determination is preserved, not mutated: still pending, and now pointing forward.
  select count(*) into n from pipeline.eligibility_reviews
   where id = rev_old and status = 'pending' and superseded_by_id = rev_new
     and superseded_at is not null and supersession_reason is not null;
  if n <> 1 then raise exception 'the prior NVIDIA determination was not preserved and superseded'; end if;

  select count(*) into n from pipeline.eligibility_reviews
   where id = rev_new and status = 'eligible' and final_primary_tier = 2
     and value_chain_layers @> array['compute_and_infrastructure']::text[]
     and superseded_by_id is null;
  if n <> 1 then raise exception 'NVIDIA is not eligible at Tier 2 in the 0.4.0-draft cycle'; end if;

  -- The governance gate, and the reason it moved: a named human, who is not the reviewer.
  select count(*) into n from pipeline.eligibility_reviews
   where id = rev_new and independent_check_state = 'passed'
     and independent_reviewer = 'Bryceson Jones' and independent_reviewer <> reviewer;
  if n <> 1 then raise exception 'the NVIDIA determination records no independent named check'; end if;

  select count(*) into n from pipeline.evidence_claims c
    join reference.issuers i on i.id = c.issuer_id
   where i.issuer_key = 'nvidia'
     and (c.evidence_class <> 'establishing' or c.human_verification <> 'verified'
          or c.verified_by is null or c.verified_at is null);
  if n <> 0 then raise exception '% NVIDIA claim(s) are still unverified', n; end if;

  -- The evidence basis did not change. Eligibility rests on the filing, not on the approval:
  -- the tier, the route and the cited claims are identical across the supersession.
  select count(*) into n from pipeline.tier2_assessments a
   where a.review_id = rev_new
     and a.prong_a_evidence_id = 'a1400000-0000-4000-8000-000000000001'
     and a.prong_b_evidence_id = 'a1400000-0000-4000-8000-000000000002'
     and a.prong_b_route = 'principal_driver_in_filing' and a.prong_b_satisfied;
  if n <> 1 then raise exception 'the NVIDIA evidence basis changed across the supersession'; end if;

  -- ---------------------------------------------------------------- Palantir

  select id into rev_new from pipeline.eligibility_reviews
   where review_cycle_id = cyc_b
     and issuer_id = (select id from reference.issuers where issuer_key = 'palantir-technologies');

  -- Route P is satisfied on all five conditions.
  select count(*) into n from pipeline.tier1_platform_assessments
   where review_id = rev_new and satisfied
     and customer_facing_ai and platform_centrality and commercial_scale
     and unrelated_business_guard_passed and cardinality(operational_roles) >= 1;
  if n <> 1 then raise exception 'the Palantir Route P assessment is not satisfied on all five conditions'; end if;

  -- E5 no longer applies to it. This is the methodology change visible in the data rather than
  -- in a comment: the same issuer, the same filing, E5 applied in cycle A and not in cycle B.
  select count(*) into n from pipeline.review_exclusions
   where review_id = rev_new and exclusion_code = 'E5' and applied;
  if n <> 0 then raise exception 'E5 still excludes the integrated AI platform under 0.4.0-draft'; end if;

  select count(*) into n from pipeline.review_exclusions x
    join pipeline.eligibility_reviews r on r.id = x.review_id
   where r.review_cycle_id = cyc_a
     and r.issuer_id = (select id from reference.issuers where issuer_key = 'palantir-technologies')
     and x.exclusion_code = 'E5' and x.applied;
  if n <> 1 then raise exception 'the prior cycle no longer records the E5 finding it actually made'; end if;

  -- And it is still not eligible, because the governance gate is independent of the methodology
  -- gate and only one of the two moved. If this assertion ever fails because Palantir became
  -- eligible, the claims below must have been verified by a named human first.
  select count(*) into n from pipeline.eligibility_reviews
   where id = rev_new and status = 'eligible';
  if n <> 0 then
    select count(*) into n from pipeline.evidence_claims c
      join reference.issuers i on i.id = c.issuer_id
     where i.issuer_key = 'palantir-technologies' and c.evidence_class = 'establishing'
       and c.human_verification = 'verified';
    if n = 0 then raise exception 'Palantir was admitted on unverified machine extraction'; end if;
  else
    select count(*) into n from pipeline.eligibility_reviews
     where id = rev_new and status = 'pending' and tier1_route = 'ai_integrated_platform'
       and candidate_primary_tier = 1 and gating_reason is not null;
    if n <> 1 then raise exception 'the Palantir determination is neither eligible nor a gated Tier 1 Route P pending'; end if;
  end if;

  -- ---------------------------------------------------------------- Salesforce

  select id into rev_new from pipeline.eligibility_reviews
   where review_cycle_id = cyc_b
     and issuer_id = (select id from reference.issuers where issuer_key = 'salesforce');

  -- The guard did its work: Route P considered, condition 5 failed, route not satisfied.
  select count(*) into n from pipeline.tier1_platform_assessments
   where review_id = rev_new and not satisfied and not unrelated_business_guard_passed;
  if n <> 1 then raise exception 'the Salesforce Route P assessment does not record a failed unrelated-business guard'; end if;

  select count(*) into n from pipeline.eligibility_reviews
   where id = rev_new and status = 'insufficient_evidence' and final_primary_tier is null
     and tier1_route is null and tier3_route = 'B';
  if n <> 1 then raise exception 'the Tier 1 amendment changed the Salesforce outcome'; end if;

  -- ------------------------------------------------- the universe the amendment produced

  select count(*) into n from pipeline.eligibility_reviews
   where review_cycle_id = cyc_b and status = 'eligible' and superseded_by_id is null;
  if n <> 1 then raise exception 'expected exactly one eligible issuer after the amendment, found %', n; end if;

  -- Every eligible determination names how it qualified, and no non-Tier-1 row claims a Tier 1 route.
  select count(*) into n from pipeline.eligibility_reviews
   where final_primary_tier = 1 and tier1_route is null;
  if n <> 0 then raise exception '% Tier 1 determination(s) do not say which route', n; end if;

  raise notice 'AI-integrated platform amendment: NVIDIA admitted, Palantir gated on verification';
end $$;

-- ------------------------------------------------------ the route's own conditions

do $$
declare
  ok boolean;
  n integer;
  mv uuid; cyc uuid; iss uuid; rev uuid;
begin
  select id into mv from reference.methodology_versions
   where document_path = 'docs/methodology/ai-equity-universe.md' and version = '0.4.0-draft';
  if mv is null then raise exception 'methodology 0.4.0-draft is not registered'; end if;

  insert into reference.ai_universe_review_cycles
    (label, methodology_version_id, cycle_kind, status, evidence_cutoff)
    values ('t-routep', mv, 'development', 'evidence_collection', timestamptz '2026-06-01T00:00:00Z')
    returning id into cyc;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-platform-co', 'Test Platform Co', 'US') returning id into iss;
  insert into pipeline.eligibility_reviews
    (review_cycle_id, issuer_id, methodology_version_id, status, candidate_primary_tier,
     tier1_route, evidence_cutoff, review_date, reviewer)
    values (cyc, iss, mv, 'pending', 1, 'ai_integrated_platform',
            timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer')
    returning id into rev;

  -- An AI-integrated platform that meets all five conditions qualifies. This is the case the
  -- amendment exists to admit, and it must actually be representable.
  insert into pipeline.tier1_platform_assessments
    (review_id, platform_name, customer_facing_ai, customer_facing_basis,
     platform_centrality, centrality_basis, operational_roles, operational_basis,
     commercial_scale, scale_evidence_kind, scale_basis,
     unrelated_business_guard_passed, guard_basis, satisfied)
    values (rev, 'an integrated platform', true, 'sold to customers',
            true, 'the platform architecture is organized around operating models',
            array['deploying_ai_systems','data_or_ontology_infrastructure']::text[],
            'deployment and ontology components serve the AI platform',
            true, 'disclosed_customer_adoption', 'disclosed customer count and recognized revenue',
            true, 'no unrelated business in the filing', true);

  -- An incidental AI feature fails on condition 2. This is the E5 case the amendment kept.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, customer_facing_basis,
       platform_centrality, centrality_basis, operational_roles, operational_basis,
       commercial_scale, scale_evidence_kind, scale_basis,
       unrelated_business_guard_passed, guard_basis, satisfied)
      values (rev, 'a chatbot on an unrelated SaaS product', true, 'customer facing',
              false, 'an assistant attached to a product that exists for another purpose',
              array['ai_enabled_workflows']::text[], 'a workflow role',
              true, 'usage_evidence', 'some usage',
              true, 'no unrelated business', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an incidental AI feature satisfied Route P'; end if;

  -- Internal AI use fails on condition 1. E4 is untouched by the amendment.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, customer_facing_basis,
       platform_centrality, centrality_basis, operational_roles, operational_basis,
       commercial_scale, scale_evidence_kind, scale_basis,
       unrelated_business_guard_passed, guard_basis, satisfied)
      values (rev, 'an internal productivity tool', false, 'used only within the issuer',
              true, 'central to internal operations',
              array['ai_enabled_workflows']::text[], 'internal workflows',
              true, 'usage_evidence', 'internal usage',
              true, 'no unrelated business', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'internal AI use satisfied Route P'; end if;

  -- Branding alone fails: a satisfied route must explain every condition, so an assessment with
  -- nothing but a name behind it cannot be recorded as satisfied. E6 is untouched.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, platform_centrality,
       operational_roles, commercial_scale, scale_evidence_kind,
       unrelated_business_guard_passed, satisfied)
      values (rev, 'an issuer that calls itself an AI company', true, true,
              array['inference']::text[], true, 'usage_evidence', true, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'Route P was satisfied with no basis recorded for any condition'; end if;

  -- A diversified issuer whose AI is one line among others fails on condition 5 and belongs in
  -- Tier 3. This is the guard that stops Route P swallowing Tier 3.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, customer_facing_basis,
       platform_centrality, centrality_basis, operational_roles, operational_basis,
       commercial_scale, scale_evidence_kind, scale_basis,
       unrelated_business_guard_passed, guard_basis, satisfied)
      values (rev, 'one AI line inside a large unrelated business', true, 'customer facing',
              true, 'central to that line',
              array['inference']::text[], 'inference role',
              true, 'integrated_platform_revenue', 'material revenue',
              false, 'AI is peripheral to the issuer''s commercial identity', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an issuer failing the unrelated-business guard satisfied Route P'; end if;

  -- Commercial scale must name what kind of evidence carried it, so branding cannot fill the gap.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, platform_centrality,
       operational_roles, commercial_scale, unrelated_business_guard_passed, satisfied)
      values (rev, 'scale asserted without a kind', true, true,
              array['inference']::text[], true, true, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'commercial scale was asserted without naming its evidence kind'; end if;

  -- The operational-role list is closed; an invented role is rejected.
  ok := false;
  begin
    insert into pipeline.tier1_platform_assessments
      (review_id, platform_name, customer_facing_ai, platform_centrality,
       operational_roles, commercial_scale, unrelated_business_guard_passed, satisfied)
      values (rev, 'an invented role', true, true,
              array['makes_things_better_with_ai']::text[], false, true, false);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an operational role outside the methodology list was accepted'; end if;

  -- ------------------------------------------------------- the route column itself

  -- A Tier 1 admission must say which route reached it.
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-routeless-co', 'Test Routeless Co', 'US') returning id into iss;
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc, iss, mv, 'eligible', 1, array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Tier 1 admission was accepted without naming its route'; end if;

  -- And a Tier 1 route is meaningless on a Tier 2 determination.
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('t-hardware-co', 'Test Hardware Co', 'US') returning id into iss;
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier1_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc, iss, mv, 'eligible', 2, 'ai_integrated_platform',
              array['compute_and_infrastructure']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Tier 2 determination claimed a Tier 1 route'; end if;

  -- The repaired Tier 3 constraint: a route is meaningless off its tier in both directions.
  -- Before the repair this passed, because comparing a null candidate tier made the check null.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc, iss, mv, 'eligible', 2, 'A', array['compute_and_infrastructure']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Tier 2 determination claimed a Tier 3 route'; end if;

  -- Route P is not a way around the Route B gate: an issuer routed to Tier 3 still meets it.
  ok := false;
  begin
    insert into pipeline.eligibility_reviews
      (review_cycle_id, issuer_id, methodology_version_id, status, final_primary_tier,
       tier3_route, value_chain_layers, evidence_cutoff, review_date, reviewer)
      values (cyc, iss, mv, 'eligible', 3, 'B', array['application']::text[],
              timestamptz '2026-06-01T00:00:00Z', date '2026-06-05', 'a reviewer');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'the Tier 1 amendment opened the unresolved Route B gate'; end if;

  raise notice 'Route P conditions: integration admitted, incidental AI refused';
end $$;

rollback;
