-- The second review cycle: the same filings, re-read under methodology 0.4.0-draft, plus the
-- founder verification that the first cycle was waiting on.
--
-- A new cycle rather than an edit, because the first cycle's determinations were correct under
-- 0.3.0-draft and saying otherwise would falsify the record. dev-2026-09 keeps what 0.3.0 decided;
-- dev-2026-09b records what 0.4.0 decides on the same evidence at the same cutoff. The old rows
-- are superseded, not mutated, so the lineage is walkable in both directions.
--
-- Two independent gates decide an admission, and this migration moves each of them exactly once:
--
--   the methodology gate    0.4.0-draft's Route P replaces the Tier 1 test that rejected an
--                           integrated AI platform for being integrated
--   the governance gate     a named human verifying that a model-assisted extraction matches
--                           the filing it claims to quote
--
-- NVIDIA clears both and is admitted. Palantir clears the first and not the second: the founder
-- verified NVIDIA's passages in this amendment and did not verify Palantir's, so Palantir's
-- evidence is still unverified machine output and still cannot establish anything. That is not a
-- second methodology objection -- it is the same gate NVIDIA just cleared, and one signature
-- closes it.

-- ------------------------------------------------------------ methodology 0.4.0-draft

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash)
values
  ('a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
   '0.4.0-draft', 'draft', 'docs/methodology/ai-equity-universe.md',
   '39cc27076dafea79ff8643f9eb331d19a40a30e25d43d098db80eccba68c599c')
on conflict (methodology_id, version) do nothing;

-- 0.3.0-draft stays a draft. It was never approved, carries no effective date and publishes
-- nothing, so there is nothing to retire: 'superseded' is the mechanism for an approved version
-- that a successor replaces in production, and using it here would both overstate what 0.3.0 was
-- and trip the standing assertion that no methodology outside the live products is non-draft.
-- Two drafts of one document is the accurate record. Which one governed a determination is read
-- from the determination's own methodology_version_id, not from a status column.

-- The unresolved parameters follow the version forward unchanged. Both remain drafts with no
-- effective date: 0.4.0-draft resolves neither, and Route P is expressly not a way around them.
insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, status, rationale)
values
  ('a1000000-0000-4000-8000-000000000003', 'tau_b', 0.10, 'draft',
   'Tier 3 Route B materiality floor. STILL UNRESOLVED under 0.4.0-draft. Carried forward unchanged: the 0.4.0 amendment widened Tier 1 and did not touch Route B. 10% remains the uncalibrated research candidate and no Route B admission is possible while this row is draft.'),
  ('a1000000-0000-4000-8000-000000000003', 'issuer_cap', 0.10, 'draft',
   'Single-issuer weight cap c. STILL UNRESOLVED under 0.4.0-draft. Carried forward unchanged.');

-- ---------------------------------------------------- the founder verification (governance)

-- Both NVIDIA passages were re-fetched from EDGAR on 17 September 2026 at 14:50:49Z. The document
-- hashed to 73d81f5a111abcf72426c840871e76f5f5edc9631f436d495a86b6f87306d58b, identical to the
-- hash recorded when the claims were first written, and both quoted passages appear verbatim in
-- those bytes. Bryceson Jones, as founder, reviewed and verified that correspondence.
--
-- What this verification is, and is not. It establishes that the quotations are what NVIDIA's
-- FY2026 Form 10-K actually says. It is not the reason NVIDIA is eligible: the eligibility basis
-- is the filing evidence itself, which was unchanged before and after. The verification satisfies
-- the methodology's requirement that machine-extracted evidence be confirmed by a named human
-- before it may establish anything. Had the passages not matched, this row would have recorded a
-- rejection instead.
update pipeline.evidence_claims
   set evidence_class     = 'establishing',
       human_verification = 'verified',
       verified_by        = 'Bryceson Jones',
       verified_at        = timestamptz '2026-09-17T14:50:49Z'
 where id in ('a1400000-0000-4000-8000-000000000001',
              'a1400000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------- the second review cycle

insert into reference.ai_universe_review_cycles
  (id, label, methodology_version_id, cycle_kind, status, evidence_cutoff,
   opened_at, notes)
values
  ('a1000000-0000-4000-8000-000000000011', 'dev-2026-09b',
   'a1000000-0000-4000-8000-000000000003', 'development', 'review',
   timestamptz '2026-09-17T00:00:00Z', timestamptz '2026-09-17T14:00:00Z',
   'Re-review under methodology 0.4.0-draft. Same evidence cutoff as dev-2026-09 deliberately: the amendment changed the rules, not what was knowable, and holding the cutoff fixed is what makes the two cycles comparable. A development cycle, so nothing here can publish.');

insert into pipeline.issuer_candidates (review_cycle_id, issuer_id, review_state, notes)
select 'a1000000-0000-4000-8000-000000000011', c.issuer_id,
       case when i.issuer_key in ('nvidia','palantir-technologies','salesforce','baidu')
            then 'reviewed' else 'queued' end,
       'Carried into the 0.4.0-draft cycle from dev-2026-09.'
  from pipeline.issuer_candidates c
  join reference.issuers i on i.id = c.issuer_id
 where c.review_cycle_id = 'a1000000-0000-4000-8000-000000000010';

-- 'prior_reviewed_universe' is the accurate channel here and it matters that it is not
-- 'research_seed': these candidates are present because Urdais reviewed them under its own
-- methodology, not because a research document named them.
insert into pipeline.candidate_discoveries
  (candidate_id, discovery_channel, discovery_reason, discovery_source, discovered_by)
select c.id, 'prior_reviewed_universe',
       'Carried forward from review cycle dev-2026-09 on the methodology amendment to 0.4.0-draft. Nothing about the prior cycle''s determination is inherited; each re-review starts from the filing.',
       'review cycle dev-2026-09', 'Urdais research'
  from pipeline.issuer_candidates c
 where c.review_cycle_id = 'a1000000-0000-4000-8000-000000000011';

-- ------------------------------------------------- new Palantir evidence for Route P

-- Route P asks questions the first cycle had no reason to ask, so it needs evidence the first
-- cycle did not extract. All three passages are from the 10-K already preserved, verified present
-- in the bytes hashed a4fef954...; no new document was retrieved. They are model-assisted and
-- unverified like every other claim in this seed, which is exactly why Palantir is not admitted.
insert into pipeline.evidence_claims
  (id, evidence_document_id, issuer_id, evidence_class, claim_type, quoted_passage,
   numeric_value, value_unit, value_currency, fiscal_period, extraction_method, human_verification)
select v.id, 'a1300000-0000-4000-8000-000000000002', i.id, 'corroborating', v.ctype, v.passage,
       v.num, v.unit, v.cur, 'FY2025', 'model_assisted', 'unverified'
  from (values
    -- Condition 2, and the sentence that reverses the first cycle's E5 finding: the issuer's own
    -- account of AIP is that its value comes from combination with the existing platforms.
    ('a1400000-0000-4000-8000-000000000016'::uuid, 'qualifying_activity',
     'In 2023, we began deploying our newest offering, AIP, which is designed for customers across the commercial and government sectors, enabling them to derive value from recent breakthroughs in AI via the combination of our existing software platforms with generative AI models, including LLMs.',
     null::numeric, null::text, null::char(3)),
    -- Condition 4, disclosed customer adoption.
    ('a1400000-0000-4000-8000-000000000017'::uuid, 'general_availability',
     'During the period ended December 31, 2025, we had 954 customers, including companies in various commercial sectors and government agencies around the world.',
     954, 'customers', null),
    -- Condition 4, recognized revenue of the integrated platform. Not AI-specific revenue, and
    -- Route P does not ask for AI-specific revenue where the capability is structurally integrated.
    ('a1400000-0000-4000-8000-000000000018'::uuid, 'consolidated_revenue',
     'For the year ended December 31, 2025, we generated $4.5 billion in revenue, reflecting a 56% growth rate from the year ended December 31, 2024, when we generated $2.9 billion in revenue.',
     4500000000, 'revenue', 'USD')
  ) as v(id, ctype, passage, num, unit, cur)
  join reference.issuers i on i.issuer_key = 'palantir-technologies';

-- ---------------------------------------------------------------- the determinations

insert into pipeline.eligibility_reviews
  (id, review_cycle_id, issuer_id, methodology_version_id, status,
   candidate_primary_tier, final_primary_tier, tier1_route, tier3_route, value_chain_layers,
   qualifying_role, materiality_basis, gating_reason,
   evidence_cutoff, review_date, reviewer, independent_reviewer, independent_check_state,
   publication_state)
select v.id, 'a1000000-0000-4000-8000-000000000011', i.id,
       'a1000000-0000-4000-8000-000000000003', v.status,
       v.cand_tier, v.final_tier, v.t1route, v.t3route, v.layers,
       v.qrole, v.mbasis, v.gating,
       timestamptz '2026-09-17T00:00:00Z', date '2026-09-17', 'Urdais research',
       v.indep, v.indep_state, 'internal'
  from (values
    -- NVIDIA: unchanged evidence, unchanged tier, unchanged reasoning. The only thing that moved
    -- is that a named human confirmed the quotations match the filing.
    ('a1600000-0000-4000-8000-000000000001'::uuid, 'nvidia', 'eligible',
     2::smallint, 2::smallint, null::text, null::text,
     array['compute_and_infrastructure']::text[],
     'Designs and sells the accelerators that AI compute systems are built from.',
     'The FY2026 10-K attributes the year''s growth to data center compute and networking platforms for accelerated computing and AI solutions: the principal_driver_in_filing route, on a historical statement in the filing rather than guidance.',
     null::text,
     'Bryceson Jones'::text, 'passed'::text),

    -- Palantir: the methodology objection is gone and the governance gate is not.
    ('a1600000-0000-4000-8000-000000000002'::uuid, 'palantir-technologies', 'pending',
     1::smallint, null::smallint, 'ai_integrated_platform', null,
     null,
     null, null,
     'Tier 1 Route P is satisfied on all five conditions from the FY2025 10-K, and the 0.3.0-draft grounds for the earlier contested finding no longer apply: E5 as amended reaches incidental AI and not integrated AI, and the filing''s statement that AIP derives value "via the combination of our existing software platforms with generative AI models" is now evidence of structural integration rather than of a bundled feature. The determination is nevertheless not eligible, for one reason only: the three Route P passages are model-assisted extractions that no named human has verified, so they are corroborating and cannot establish an admission. This is the governance gate NVIDIA cleared in this same amendment, not a further methodology objection. One verification closes it.',
     null, 'not_performed'),

    -- Salesforce: re-examined under Route P and it fails condition 5, which is the guard working.
    ('a1600000-0000-4000-8000-000000000003'::uuid, 'salesforce', 'insufficient_evidence',
     3::smallint, null::smallint, null, 'B',
     null,
     null, null,
     'Re-examined under 0.4.0-draft and unchanged. Route P was considered and fails condition 5: Agentforce is an AI capability inside a large customer-relationship-management business, and AI does not define Salesforce''s platform identity, so the methodology directs the assessment to Tier 3 rather than Tier 1. At Tier 3 the position is as before -- the only AI-specific quantity disclosed is an ARR run-rate that E8 bars from establishing, and Route B admission additionally requires an approved tau_B that does not exist. The Tier 1 amendment was not a general loosening, and this is what that looks like from the other side.',
     null, 'not_performed'),

    -- Baidu: untouched by the amendment; the blocker was never the rules.
    ('a1600000-0000-4000-8000-000000000004'::uuid, 'baidu', 'pending',
     3::smallint, null::smallint, null, 'A',
     null,
     null, null,
     'Carried forward unchanged. The 0.4.0-draft amendment does not reach this determination: the blocker is an extraction gap, not a rule. The FY2025 20-F evidences the offering, and the Route A rank 1 or 2 scale indicator sits in a revenue table that text extraction did not preserve.',
     null, 'not_performed')
  ) as v(id, issuer_key, status, cand_tier, final_tier, t1route, t3route, layers,
         qrole, mbasis, gating, indep, indep_state)
  join reference.issuers i on i.issuer_key = v.issuer_key;

-- --------------------------------------------------- structured assessments, cycle B

-- NVIDIA's Tier 2 assessment, restated against the verified claims.
insert into pipeline.tier2_assessments
  (review_id, prong_a_category, prong_a_product, prong_a_evidence_id,
   prong_b_route, prong_b_satisfied, prong_b_basis, prong_b_evidence_id)
values
  ('a1600000-0000-4000-8000-000000000001', 'ai_accelerator',
   'Data center GPU compute platforms', 'a1400000-0000-4000-8000-000000000001',
   'principal_driver_in_filing', true,
   'The FY2026 10-K states that the year''s growth was driven by data center compute and networking platforms for accelerated computing and AI solutions. A statement about realised performance in the filing itself, so E8 does not reach it. Both supporting claims are human-verified as of 17 September 2026.',
   'a1400000-0000-4000-8000-000000000002');

-- Palantir under Route P, condition by condition.
insert into pipeline.tier1_platform_assessments
  (review_id, platform_name,
   customer_facing_ai, customer_facing_basis, customer_facing_claim_id,
   platform_centrality, centrality_basis, centrality_claim_id,
   operational_roles, operational_basis, operational_claim_id,
   commercial_scale, scale_evidence_kind, scale_basis, scale_claim_id,
   unrelated_business_guard_passed, guard_basis, guard_claim_id,
   satisfied)
values
  ('a1600000-0000-4000-8000-000000000002',
   'Palantir integrated platform (Gotham, Foundry, Apollo, AIP)',
   true,
   'AIP is sold to customers as a generative AI platform providing LLM connectivity, a toolchain for building AI-powered agents and automations, AI-enabled end user applications and an evaluations framework for governing AI workflows in production. This is capability supplied to customers, not internal use, so E4 does not reach it.',
   'a1400000-0000-4000-8000-000000000013',
   true,
   'The filing states AIP is designed to let customers derive value "via the combination of our existing software platforms with generative AI models", and separately that AIP is bundled across Foundry, Gotham and Apollo. Under 0.3.0-draft that bundling was read as E5 evidence of a feature; under 0.4.0-draft it is the issuer''s own account of structural integration -- the AI is not attached to an unrelated product, it is the purpose the rest of the platform serves.',
   'a1400000-0000-4000-8000-000000000016',
   array['deploying_ai_systems','operating_ai_systems','orchestration_of_agents_or_models',
         'data_or_ontology_infrastructure','ai_enabled_workflows']::text[],
   'Each named component performs a listed operational role on the filing''s own descriptions: Apollo deploys and operates ("manages the underlying infrastructure that hosts our other platforms"), Foundry supplies the data and ontology infrastructure ("systemic mapping development through Palantir Ontology"), AIP orchestrates agents and automations and governs AI workflows in production. These are the components that make a model operable, which is precisely what Route P was added to recognise.',
   'a1400000-0000-4000-8000-000000000012',
   true, 'disclosed_customer_adoption',
   '954 customers as of 31 December 2025, disclosed in the filing, against 711 a year earlier, with $4.5 billion of recognized revenue from the integrated platform. Route P does not ask for AI-specific revenue where the capability is structurally integrated and separate accounting for it does not exist, and Palantir discloses no platform-level revenue split. Disclosed adoption plus recognized revenue of the integrated platform establishes commercial deployment without relying on branding (E6) or any forward-looking measure (E8).',
   'a1400000-0000-4000-8000-000000000017',
   true,
   'The filing enumerates four platforms and no unrelated business. Revenue is disclosed by customer segment (government and commercial), not by separable business lines, and gross margin of 82% is characteristic of software rather than the labour-based services that the Tier 1 services test exists to catch. The AI capability is therefore material to the platform business being assessed rather than one product inside a larger unrelated software business.',
   'a1400000-0000-4000-8000-000000000011',
   true);

-- Salesforce under Route P: recorded because a considered-and-rejected route is a finding. The
-- guard column is the one that fails, and the table refuses to call the route satisfied.
insert into pipeline.tier1_platform_assessments
  (review_id, platform_name,
   customer_facing_ai, customer_facing_basis, customer_facing_claim_id,
   platform_centrality, centrality_basis,
   operational_roles, operational_basis,
   commercial_scale, scale_evidence_kind, scale_basis,
   unrelated_business_guard_passed, guard_basis,
   satisfied)
values
  ('a1600000-0000-4000-8000-000000000003', 'Agentforce',
   true,
   'Agentforce is sold to customers as an AI agent capability, so condition 1 is met on its face.',
   'a1400000-0000-4000-8000-000000000021',
   false,
   'Not established. Agentforce is an AI layer offered across an existing customer-relationship-management suite. Nothing in the disclosure reviewed establishes that the platform architecture is organized around deploying or operating AI, as distinct from adding AI capability to products that exist for another purpose.',
   array['ai_enabled_workflows']::text[],
   'Agentforce performs an AI-enabled operational workflow role. Condition 3 is not the binding constraint here.',
   false, null,
   'Not established. The only AI-specific quantity disclosed is an ARR run-rate, which E8 bars from establishing. Route P''s relaxation of the revenue requirement does not extend to accepting a forward-looking measure.',
   false,
   'Condition 5 fails, and it is the decisive one. Salesforce''s commercial identity is customer-relationship management; the AI capability is one line within a large business built for another purpose. The methodology directs such an issuer to Tier 3, and Route P is expressly not available as a way around Tier 3''s unresolved tau_B.',
   false);

-- The Tier 3 assessments carry forward for the two issuers still on that path.
insert into pipeline.tier3_assessments
  (review_id, route, offering, generally_available, separately_contracted,
   scale_metric, scale_evidence_rank, scale_value, scale_currency, scale_period,
   satisfied, basis, evidence_claim_id)
values
  ('a1600000-0000-4000-8000-000000000003', 'B', 'Agentforce', true, true,
   'annual recurring revenue', 4, 800000000, 'USD', 'Q4 FY2026', false,
   'Unchanged under 0.4.0-draft. ARR is recorded at evidence rank 4, where it may corroborate and can never satisfy, and tau_B remains unresolved.',
   'a1400000-0000-4000-8000-000000000021'),
  ('a1600000-0000-4000-8000-000000000004', 'A', 'Baidu AI Cloud', true, true,
   null, null, null, null, 'FY2025', false,
   'Unchanged under 0.4.0-draft. The rank 1 or 2 scale indicator Route A requires is disclosed in a revenue table that text extraction did not preserve.',
   'a1400000-0000-4000-8000-000000000031');

-- ------------------------------------------------------------- exclusions, cycle B

insert into pipeline.review_exclusions (review_id, exclusion_code, applied, basis, evidence_claim_id)
values
  -- Palantir: the two exclusions that decided the first cycle, re-evaluated under 0.4.0-draft.
  ('a1600000-0000-4000-8000-000000000002', 'E5', false,
   'Evaluated and no longer applicable. E5 as amended reaches AI that is incidental to its host product, and bundling is expressly not a ground for exclusion on its own. The filing''s account of AIP -- that customers derive value from it in combination with the existing platforms -- is evidence of structural integration, which Route P assesses on its own conditions rather than excluding. This is the finding that changed between cycles, and the rule changed, not the evidence.',
   'a1400000-0000-4000-8000-000000000016'),
  ('a1600000-0000-4000-8000-000000000002', 'E7', false,
   'Evaluated and not applicable to the Route P assessment. The first cycle applied E7 to Gotham and Foundry individually under a route that required each line to qualify on its own. Route P assesses whether the platform is organized around operating AI, and the filing establishes that Foundry''s ontology and Apollo''s deployment machinery serve the AI platform rather than standing apart from it.',
   'a1400000-0000-4000-8000-000000000012'),
  ('a1600000-0000-4000-8000-000000000002', 'E4', false,
   'Evaluated and not applicable. The AI capability assessed is sold to customers, not used internally.',
   'a1400000-0000-4000-8000-000000000013'),
  ('a1600000-0000-4000-8000-000000000002', 'E6', true,
   'Applied as a bar rather than a finding, as in the first cycle. The issuer''s name, its self-description and third-party classification were excluded from the assessment; Route P was reached on the filing''s descriptions of what the platforms do and on disclosed customer and revenue figures.',
   null),
  ('a1600000-0000-4000-8000-000000000002', 'E8', true,
   'Applied to the evidence. No forward-looking measure was relied on for condition 4: the 954-customer count and the $4.5 billion of recognized revenue are both historical disclosures for a completed period.',
   'a1400000-0000-4000-8000-000000000017'),
  -- Salesforce: E8 still decides it.
  ('a1600000-0000-4000-8000-000000000003', 'E8', true,
   'Unchanged. Agentforce ARR is a run-rate of the same family as bookings and pipeline; it may corroborate and cannot establish, which removes the only AI-specific quantity in the disclosure from both the Route P scale condition and the Route B computation.',
   'a1400000-0000-4000-8000-000000000021'),
  ('a1600000-0000-4000-8000-000000000003', 'E5', false,
   'Evaluated under the amended definition and not the reason for the outcome. Whether Agentforce is incidental to the CRM suite is arguable, but the determination does not rest on E5: it rests on Route P condition 5 and on E8.',
   null),
  -- NVIDIA: the exclusions re-evaluated for the admitted determination.
  ('a1600000-0000-4000-8000-000000000001', 'E1', false,
   'Evaluated and not applicable. The assessment rests on what the product is and what the filing says drove revenue, not on who buys it.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E2', false,
   'Evaluated and not applicable. The accelerator is embodied in the AI computing system rather than being equipment used to manufacture one.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E3', false,
   'Evaluated and not applicable. Nothing in the assessment relies on supplying power, cooling, buildings or colocation.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E5', false,
   'Evaluated under the amended definition and not applicable. The qualifying products are sold as products, not embedded within a host product.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E6', false,
   'Evaluated and not applicable. The determination cites the product description and the driver-of-growth statement in the filing, not branding or index membership.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E8', false,
   'Evaluated and not applicable. The Prong B passage states what drove growth in the fiscal year just reported.',
   null),
  ('a1600000-0000-4000-8000-000000000001', 'E9', false,
   'Evaluated and not applicable. The issuer reports substantial positive consolidated external revenue.',
   null);

-- -------------------------------------------------------------------- supersession

-- The first cycle's determinations are superseded, not deleted and not edited. Each old row keeps
-- its status, its reasoning and its evidence cutoff, and now points at what replaced it.
update pipeline.eligibility_reviews
   set superseded_by_id = 'a1600000-0000-4000-8000-000000000001',
       superseded_at = timestamptz '2026-09-17T14:50:49Z',
       supersession_reason = 'Superseded by the dev-2026-09b determination. The evidence and the tier are unchanged; a named human verified the two cited FY2026 10-K passages against the filing, which satisfied the governance gate that held the determination at pending.'
 where id = 'a1500000-0000-4000-8000-000000000001';

update pipeline.eligibility_reviews
   set superseded_by_id = 'a1600000-0000-4000-8000-000000000002',
       superseded_at = timestamptz '2026-09-17T14:50:49Z',
       supersession_reason = 'Superseded by the dev-2026-09b determination under methodology 0.4.0-draft. The contested finding rested on E5 excluding an integrated AI platform and on Tier 1 requiring each line to qualify on its own; 0.4.0-draft narrowed E5 to incidental AI and added Route P. The evidence did not change and the rules did.'
 where id = 'a1500000-0000-4000-8000-000000000002';

update pipeline.eligibility_reviews
   set superseded_by_id = 'a1600000-0000-4000-8000-000000000003',
       superseded_at = timestamptz '2026-09-17T14:50:49Z',
       supersession_reason = 'Superseded by the dev-2026-09b determination under methodology 0.4.0-draft. The outcome is unchanged; the re-review additionally considered and rejected Tier 1 Route P on condition 5.'
 where id = 'a1500000-0000-4000-8000-000000000003';

update pipeline.eligibility_reviews
   set superseded_by_id = 'a1600000-0000-4000-8000-000000000004',
       superseded_at = timestamptz '2026-09-17T14:50:49Z',
       supersession_reason = 'Superseded by the dev-2026-09b determination under methodology 0.4.0-draft. Unchanged: the blocker is an extraction gap rather than a rule the amendment touched.'
 where id = 'a1500000-0000-4000-8000-000000000004';

update pipeline.issuer_candidates
   set review_state = 'reviewed', last_reconsidered_at = timestamptz '2026-09-17T14:50:49Z'
 where review_cycle_id = 'a1000000-0000-4000-8000-000000000010'
   and review_state = 'in_review';
