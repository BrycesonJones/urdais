-- The Palantir governance gate, closed.
--
-- The 0.4.0-draft re-review found Tier 1 Route P satisfied on all five conditions and still could
-- not admit the issuer, because every passage supporting those conditions was a model-assisted
-- extraction that no named human had confirmed. The methodology does not let machine output
-- establish anything until it does. That was the only thing standing between the evidence and
-- the determination, and this migration records the step that closes it.
--
-- Two separate things happened and they are recorded as two separate things:
--
--   mechanical    The FY2025 10-K was re-fetched from EDGAR at 2026-09-17T16:08:15Z. It hashed to
--                 a4fef9542c4d1a99a9265df88948e5a115223940db01a0bd01f1d8b6c00acd46, identical to
--                 the hash recorded when the document was first cited, and all six passages below
--                 appear verbatim in those bytes. This establishes that the quotations are real
--                 and unaltered. It is not a human verification and does not substitute for one.
--
--   governance    Bryceson Jones, as founder, reviewed and approved all six quoted passages on
--                 17 September 2026. This is what the methodology requires before machine-
--                 extracted evidence may establish an admission.
--
-- A scoping correction is worth recording, because it nearly went the other way. The pull request
-- described "three unverified passages" as the remaining gate. That was wrong: the Route P
-- assessment cites five claims, one per condition, and the three originally described covered only
-- two of the five conditions. The remaining three -- the platform enumeration behind condition 5,
-- the Apollo description behind condition 3, and the AIP description behind condition 1 -- were
-- put to the founder explicitly and approved before this migration was written. Had they not been,
-- this migration would have promoted two conditions and left the determination pending.
--
-- Claims 0014 and 0015, the Foundry description and the "seamlessly bundled" sentence, are NOT
-- promoted. They supported the superseded cycle-A finding, no Route P condition cites them, and
-- they were not put to the founder. They stay corroborating, which is what they are.

-- --------------------------------------------------------------- the verification record

update pipeline.evidence_claims
   set evidence_class     = 'establishing',
       human_verification = 'verified',
       verified_by        = 'Bryceson Jones',
       verified_at        = timestamptz '2026-09-17T16:15:11Z'
 where id in (
   -- Condition 5, the unrelated-business guard: the complete platform enumeration.
   'a1400000-0000-4000-8000-000000000011',
   -- Condition 3, operational role: Apollo deploying and operating the platforms.
   'a1400000-0000-4000-8000-000000000012',
   -- Condition 1, customer-facing AI capability: what AIP provides to customers.
   'a1400000-0000-4000-8000-000000000013',
   -- Condition 2, platform centrality: value derived "via the combination of our existing
   -- software platforms with generative AI models".
   'a1400000-0000-4000-8000-000000000016',
   -- Condition 4, commercial scale: 954 customers at 31 December 2025.
   'a1400000-0000-4000-8000-000000000017',
   -- Supporting condition 4: $4.5 billion of recognized platform revenue.
   'a1400000-0000-4000-8000-000000000018'
 );

-- ------------------------------------------------------------------ the determination
--
-- Superseded rather than updated, because pipeline.eligibility_reviews permits exactly one kind
-- of change and this is not it. The pending row keeps its status and its reasoning; what replaces
-- it is a new determination on the same evidence in the same cycle.
--
-- Order matters here in a way it did not for the cross-cycle supersessions in the previous
-- migration. The partial unique index allows one live determination per issuer per cycle, and
-- both rows are in dev-2026-09b, so the old row must leave the index before the new one enters
-- it. The forward reference is possible because superseded_by_id is declared deferrable
-- initially deferred, so the foreign key is not checked until commit.

update pipeline.eligibility_reviews
   set superseded_by_id = 'a1600000-0000-4000-8000-000000000012',
       superseded_at = timestamptz '2026-09-17T16:15:11Z',
       supersession_reason = 'Superseded after the founder verified the six cited FY2025 10-K passages. Neither the methodology, the evidence, nor the Route P assessment changed: the governance gate closed, which is the single thing that held this determination at pending.'
 where id = 'a1600000-0000-4000-8000-000000000002';

insert into pipeline.eligibility_reviews
  (id, review_cycle_id, issuer_id, methodology_version_id, status,
   candidate_primary_tier, final_primary_tier, tier1_route, value_chain_layers,
   qualifying_role, materiality_basis, gating_reason,
   evidence_cutoff, review_date, reviewer, independent_reviewer, independent_check_state,
   publication_state)
select 'a1600000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000011', i.id,
       'a1000000-0000-4000-8000-000000000003', 'eligible',
       1, 1, 'ai_integrated_platform', array['platform', 'application']::text[],
       'Operates an integrated software platform whose purpose is to deploy, operate and govern AI and ML systems for customers, supplying that capability commercially rather than using it internally.',
       'Tier 1 Route P, satisfied on all five conditions from the FY2025 Form 10-K, each citing a human-verified establishing passage. Materiality follows from the route rather than from a revenue share: Route P requires no separately reported AI revenue where the capability is structurally integrated and separate accounting for it does not exist, which is the case here -- the filing discloses no platform-level revenue split. Commercial scale rests on disclosed adoption of 954 customers at 31 December 2025, against 711 a year earlier, together with $4.5 billion of recognized revenue from the integrated platform. Neither figure is forward-looking, so E8 does not reach them, and neither relies on the issuer''s self-description, so E6 does not either.',
       null,
       timestamptz '2026-09-17T00:00:00Z', date '2026-09-17', 'Urdais research',
       'Bryceson Jones', 'passed', 'internal'
  from reference.issuers i
 where i.issuer_key = 'palantir-technologies';

-- ---------------------------------------------------------- the Route P assessment, restated
--
-- The same five claims carry the same five conditions. Nothing about the assessment changed
-- except that each citation is now establishing evidence rather than corroborating, so the
-- reasoning below is deliberately the reasoning already recorded -- if promotion had quietly
-- altered a basis, the evidence would not be doing the work the record says it is.

insert into pipeline.tier1_platform_assessments
  (review_id, platform_name,
   customer_facing_ai, customer_facing_basis, customer_facing_claim_id,
   platform_centrality, centrality_basis, centrality_claim_id,
   operational_roles, operational_basis, operational_claim_id,
   commercial_scale, scale_evidence_kind, scale_basis, scale_claim_id,
   unrelated_business_guard_passed, guard_basis, guard_claim_id,
   satisfied)
values
  ('a1600000-0000-4000-8000-000000000012',
   'Palantir integrated platform (Gotham, Foundry, Apollo, AIP)',
   true,
   'AIP is sold to customers as a generative AI platform providing LLM connectivity, a toolchain for building AI-powered agents and automations, AI-enabled end user applications and an evaluations framework for governing AI workflows in production. This is capability supplied to customers, not internal use, so E4 does not reach it. Verified against the filing by Bryceson Jones on 17 September 2026.',
   'a1400000-0000-4000-8000-000000000013',
   true,
   'The filing states AIP is designed to let customers derive value "via the combination of our existing software platforms with generative AI models", and separately that AIP is bundled across Foundry, Gotham and Apollo. Under 0.3.0-draft that bundling was read as E5 evidence of a feature; under 0.4.0-draft it is the issuer''s own account of structural integration -- the AI is not attached to an unrelated product, it is the purpose the rest of the platform serves. Verified against the filing by Bryceson Jones on 17 September 2026.',
   'a1400000-0000-4000-8000-000000000016',
   array['deploying_ai_systems','operating_ai_systems','orchestration_of_agents_or_models',
         'data_or_ontology_infrastructure','ai_enabled_workflows']::text[],
   'Each named component performs a listed operational role on the filing''s own descriptions: Apollo deploys and operates ("manages the underlying infrastructure that hosts our other platforms"), Foundry supplies the data and ontology infrastructure ("systemic mapping development through Palantir Ontology"), AIP orchestrates agents and automations and governs AI workflows in production. These are the components that make a model operable, which is precisely what Route P was added to recognise. Verified against the filing by Bryceson Jones on 17 September 2026.',
   'a1400000-0000-4000-8000-000000000012',
   true, 'disclosed_customer_adoption',
   '954 customers as of 31 December 2025, disclosed in the filing, against 711 a year earlier, with $4.5 billion of recognized revenue from the integrated platform. Route P does not ask for AI-specific revenue where the capability is structurally integrated and separate accounting for it does not exist, and Palantir discloses no platform-level revenue split. Disclosed adoption plus recognized revenue of the integrated platform establishes commercial deployment without relying on branding (E6) or any forward-looking measure (E8). Verified against the filing by Bryceson Jones on 17 September 2026.',
   'a1400000-0000-4000-8000-000000000017',
   true,
   'The filing enumerates four platforms and no unrelated business. Revenue is disclosed by customer segment (government and commercial), not by separable business lines, and gross margin of 82% is characteristic of software rather than the labour-based services that the Tier 1 services test exists to catch. The AI capability is therefore material to the platform business being assessed rather than one product inside a larger unrelated software business. Verified against the filing by Bryceson Jones on 17 September 2026.',
   'a1400000-0000-4000-8000-000000000011',
   true);

-- ------------------------------------------------------------------ exclusions, restated

insert into pipeline.review_exclusions (review_id, exclusion_code, applied, basis, evidence_claim_id)
values
  ('a1600000-0000-4000-8000-000000000012', 'E5', false,
   'Evaluated and not applicable. E5 as amended reaches AI that is incidental to its host product, and bundling is expressly not a ground for exclusion on its own. The filing''s account of AIP -- that customers derive value from it in combination with the existing platforms -- is evidence of structural integration, which Route P assesses on its own conditions rather than excluding.',
   'a1400000-0000-4000-8000-000000000016'),
  ('a1600000-0000-4000-8000-000000000012', 'E7', false,
   'Evaluated and not applicable to a Route P assessment. Route P asks whether the platform is organized around operating AI, and the filing establishes that Foundry''s ontology and Apollo''s deployment machinery serve the AI platform rather than standing apart from it.',
   'a1400000-0000-4000-8000-000000000012'),
  ('a1600000-0000-4000-8000-000000000012', 'E4', false,
   'Evaluated and not applicable. The AI capability assessed is sold to customers, not used internally.',
   'a1400000-0000-4000-8000-000000000013'),
  ('a1600000-0000-4000-8000-000000000012', 'E6', true,
   'Applied as a bar rather than a finding. The issuer''s name, its self-description and third-party classification were excluded from the assessment; Route P was reached on the filing''s descriptions of what the platforms do and on disclosed customer and revenue figures.',
   null),
  ('a1600000-0000-4000-8000-000000000012', 'E8', true,
   'Applied to the evidence. No forward-looking measure was relied on: the 954-customer count and the $4.5 billion of recognized revenue are both historical disclosures for a completed period.',
   'a1400000-0000-4000-8000-000000000017'),
  ('a1600000-0000-4000-8000-000000000012', 'E9', false,
   'Evaluated and not applicable. The issuer reports substantial positive consolidated external revenue.',
   null);
