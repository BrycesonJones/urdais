-- Tier 1 Route P: the AI-integrated platform route, added by methodology 0.4.0-draft.
--
-- The first production review rejected an issuer whose entire platform exists to deploy and
-- operate AI, because its data and deployment components mapped as non-qualifying software and
-- because E5 excluded its AI platform for being integrated rather than sold separately. The
-- combination penalised an issuer for the very thing that made it central. 0.4.0-draft narrows
-- E5 from integration to incidence and gives Tier 1 a second route.
--
-- Route N and Route P are different tests, not different thresholds of one test, so they need
-- different records. Route N's evidence is the product-line enumeration already in
-- pipeline.tier1_product_lines. Route P's evidence is a judgement about one platform against
-- five conditions, which is the shape Tier 2 and Tier 3 already use, so Route P gets the same
-- shape rather than a reinterpretation of the enumeration columns.

alter table pipeline.eligibility_reviews
  add column tier1_route text
    constraint eligibility_reviews_tier1_route_allowed
    check (tier1_route is null or tier1_route in ('ai_native', 'ai_integrated_platform'));

comment on column pipeline.eligibility_reviews.tier1_route is
  'Which Tier 1 route reached the conclusion: ai_native is the whole-issuer enumeration, ai_integrated_platform is the five-condition platform test added in 0.4.0-draft. Null outside Tier 1.';

alter table pipeline.eligibility_reviews
  -- A route is meaningless off its tier, and a Tier 1 admission that does not say how it got
  -- there is not auditable.
  --
  -- `is not distinct from` rather than `=`, because both tier columns are nullable and a CHECK
  -- only rejects false. With `=`, a Tier 2 review carrying a Tier 1 route evaluates to
  -- false or false or null, which is null, which passes -- the same three-valued trap that let an
  -- empty MIC array through the rights model in 5.1. `is not distinct from` never returns null.
  add constraint eligibility_reviews_tier1_route_only_for_tier1
    check (tier1_route is null
           or final_primary_tier is not distinct from 1
           or candidate_primary_tier is not distinct from 1),
  add constraint eligibility_reviews_tier1_has_route
    check (final_primary_tier is distinct from 1 or tier1_route is not null);

-- The Tier 3 route constraint written in 5.2 has the identical defect and is repaired here rather
-- than edited in place: a review with final_primary_tier 2 and no candidate tier could claim
-- tier3_route 'B', because the comparison against a null candidate tier made the whole expression
-- null. No seeded row exercised it, so nothing recorded is wrong -- but the gate was not closed.
alter table pipeline.eligibility_reviews
  drop constraint eligibility_reviews_route_only_for_tier3,
  add constraint eligibility_reviews_route_only_for_tier3
    check (tier3_route is null
           or final_primary_tier is not distinct from 3
           or candidate_primary_tier is not distinct from 3);

comment on table pipeline.tier1_product_lines is
  'The Tier 1 Route N enumeration: every commercial line named in the issuer''s filing, whether it qualifies, and -- where it does not -- whether the filing presents it as supporting the issuer''s own qualifying products. Route P issuers are assessed in pipeline.tier1_platform_assessments instead; Route P requires no enumeration.';

create table pipeline.tier1_platform_assessments (
  id                       uuid primary key default gen_random_uuid(),
  review_id                uuid not null references pipeline.eligibility_reviews (id) on delete restrict,
  platform_name            text not null
                             constraint tier1_platform_name_nonempty check (btrim(platform_name) <> ''),

  -- P1. Internal use is E4 and never counts, which is why this is a customer-facing question.
  customer_facing_ai       boolean not null,
  customer_facing_basis    text,
  customer_facing_claim_id uuid references pipeline.evidence_claims (id) on delete restrict,

  -- P2. The condition E5 now hands over to: is the AI structural or incidental?
  platform_centrality      boolean not null,
  centrality_basis         text,
  centrality_claim_id      uuid references pipeline.evidence_claims (id) on delete restrict,

  -- P3. At least one operational role, from the methodology's closed list.
  operational_roles        text[] not null default '{}'::text[]
                             constraint tier1_platform_roles_allowed
                             check (operational_roles <@ array[
                               'deploying_ai_systems', 'operating_ai_systems',
                               'training_or_adapting_models', 'inference',
                               'learned_decision_systems', 'data_or_ontology_infrastructure',
                               'orchestration_of_agents_or_models', 'ai_enabled_workflows'
                             ]::text[]),
  operational_basis        text,
  operational_claim_id     uuid references pipeline.evidence_claims (id) on delete restrict,

  -- P4. Deliberately not a revenue column. Separately reported AI revenue is not required where
  -- the capability is structurally integrated and separate accounting for it does not exist, so
  -- what is recorded is which kind of scale evidence was relied on.
  commercial_scale         boolean not null,
  scale_evidence_kind      text
                             constraint tier1_platform_scale_kind_allowed
                             check (scale_evidence_kind is null or scale_evidence_kind in (
                               'material_customer_deployments', 'disclosed_customer_adoption',
                               'platform_wide_integration', 'contractual_availability',
                               'usage_evidence', 'integrated_platform_revenue'
                             )),
  scale_basis              text,
  scale_claim_id           uuid references pipeline.evidence_claims (id) on delete restrict,

  -- P5. The condition that stops Route P becoming "any software company with an AI feature".
  unrelated_business_guard_passed boolean not null,
  guard_basis              text,
  guard_claim_id           uuid references pipeline.evidence_claims (id) on delete restrict,

  satisfied                boolean not null default false,
  created_at               timestamptz not null default now(),

  unique (review_id, platform_name),

  -- All five conditions, or the route is not satisfied. There is no partial credit and no
  -- weighing: the methodology states them conjunctively and so does this.
  constraint tier1_platform_satisfied_needs_all_five
    check (not satisfied
           or (customer_facing_ai
               and platform_centrality
               and cardinality(operational_roles) >= 1
               and commercial_scale
               and unrelated_business_guard_passed)),
  -- And each condition says why. A satisfied route with an unexplained condition is an
  -- assertion, which is the thing the evidence model exists to refuse.
  constraint tier1_platform_satisfied_is_explained
    check (not satisfied
           or (customer_facing_basis is not null and centrality_basis is not null
               and operational_basis is not null and scale_basis is not null
               and guard_basis is not null)),
  -- Scale must name what kind of evidence carried it, so that branding cannot sit in the gap.
  constraint tier1_platform_scale_names_its_evidence
    check (not commercial_scale or scale_evidence_kind is not null)
);

comment on table pipeline.tier1_platform_assessments is
  'The Tier 1 Route P test: the five conditions of the AI-integrated platform route, recorded one row per platform assessed. Route P admits an issuer whose platform is materially organized around deploying, operating or enabling AI, and requires no separately reported AI revenue -- so scale records which kind of evidence established commercial deployment rather than a revenue figure.';
comment on column pipeline.tier1_platform_assessments.platform_centrality is
  'Condition 2, and the hinge of the 0.4.0-draft amendment. E5 no longer excludes an integrated capability; it excludes an incidental one. This column is where that distinction is recorded for a given platform.';
comment on column pipeline.tier1_platform_assessments.unrelated_business_guard_passed is
  'Condition 5. False where the AI capability is one product inside a larger unrelated software business -- in which case Tier 3, not Tier 1, is the route. Route P is never a way around an unresolved parameter on another tier.';

create index tier1_platform_assessments_review_idx on pipeline.tier1_platform_assessments (review_id);

alter table pipeline.tier1_platform_assessments enable row level security;
