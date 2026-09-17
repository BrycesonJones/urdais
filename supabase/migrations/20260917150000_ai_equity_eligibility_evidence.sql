-- AI Equity Universe: candidate discovery and point-in-time thematic eligibility.
--
-- This is the layer that answers, for one issuer at one review, "why is it eligible, pending,
-- contested, insufficient or rejected" -- from preserved primary evidence rather than from a
-- researcher's recollection. It needs no price, no float, no liquidity and no representative
-- security: thematic eligibility is a separate gate from investability and from launch
-- availability, and `ai-equity-universe.md` keeps them separate on purpose.
--
-- Reuse decision, since the obvious candidates do not fit:
--
--   pipeline.eligibility_assessments is keyed on a normalized compute *offer* observation and
--   an instrument spec version, and carries UCPI's p0/p1/p2 gate predicates. Its subject is an
--   offer, not a company; its lifecycle is a daily calculation, not a quarterly review. Reusing
--   it would mean a table whose foreign keys are meaningless for half its rows.
--
--   reference.exclusion_reasons is keyed to those same P0/P1/P2 stages with offer-level
--   categories (availability, freshness, price integrity). The methodology's E1-E9 are a
--   different vocabulary about a different subject.
--
-- What is reused: the supersession pattern and its shared trigger, methodology-version linkage,
-- the source registry and its permission gate, and the evidence convention of citing a document
-- by URL and hash with the decisive passage quoted rather than storing the document.
--
-- Four things the methodology forces, each of which would be painful to retrofit:
--
--   1. Discovery and admission are different acts with different evidence standards. Discovery
--      may use a thematic index, a news article or a product search; admission may not. A
--      single table conflating them would make it impossible to prove that no determination
--      rests on discovery evidence, which is the claim the whole review process makes.
--
--   2. Evidence is a reusable object. One 10-K supports a Tier 1 product enumeration, a
--      materiality figure and an exclusion evaluation. Copying the citation into each would
--      make the same document three different rows with three different hashes over time.
--
--   3. An unresolved parameter blocks an admission route without blocking the phase. Tier 3
--      Route B needs `tau_B`, which is unresolved; Tier 1, Tier 2 and Route A do not. The gate
--      is therefore on the route, checked at the review, and not a constant anywhere.
--
--   4. A review is point-in-time and immutable. A later filing produces a new review, not an
--      edit, because reconstructing a historical universe means knowing what was decided then
--      and on what evidence -- not what we would decide now.

-- ------------------------------------------------------------------- methodology parameters

-- Versioned, approvable parameter values. The methodology marks several parameters unresolved
-- on purpose, and this is where an approval would be recorded. It exists so that "is tau_B
-- approved?" is a query rather than a constant, and so that nothing can quietly default.
create table reference.methodology_parameters (
  id                     uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,

  -- Snake-case key, e.g. tau_b, issuer_cap_c, tier1_safe_harbour_share.
  parameter_key          text not null
                           constraint methodology_parameters_key_format
                           check (parameter_key ~ '^[a-z][a-z0-9_]*$'),
  numeric_value          numeric,
  text_value             text,

  status                 text not null default 'draft'
                           constraint methodology_parameters_status_allowed
                           check (status in ('draft', 'approved', 'superseded', 'withdrawn')),
  -- A draft carries no effective date, exactly as a draft methodology version does not.
  effective_from         date,
  approved_by            text,
  approved_on            date,
  rationale              text,
  created_at             timestamptz not null default now(),

  unique (methodology_version_id, parameter_key, status, effective_from),
  constraint methodology_parameters_has_a_value
    check (numeric_value is not null or text_value is not null),
  constraint methodology_parameters_draft_has_no_effective_date
    check (status <> 'draft' or effective_from is null),
  constraint methodology_parameters_approved_is_attributed
    check (status <> 'approved'
           or (effective_from is not null and approved_by is not null and approved_on is not null))
);

comment on table reference.methodology_parameters is
  'Versioned methodology parameter values and their approval state. Exists so an unresolved parameter is a queryable fact rather than a constant in code: nothing defaults, and an approval names who made it and when.';
comment on column reference.methodology_parameters.status is
  'draft parameters are proposals and carry no effective date. Only an approved row may gate a production determination.';

create index methodology_parameters_lookup_idx
  on reference.methodology_parameters (parameter_key, status);

alter table reference.methodology_parameters enable row level security;

-- ------------------------------------------------------------------------- review cycles

create table reference.ai_universe_review_cycles (
  id                       uuid primary key default gen_random_uuid(),
  -- Human label for the cycle, e.g. 2026Q3-dev.
  label                    text not null unique
                             constraint review_cycles_label_format
                             check (label ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  methodology_version_id   uuid not null references reference.methodology_versions (id) on delete restrict,

  -- development cycles exercise the machinery and never produce membership. Only a production
  -- cycle may ever back a published universe, and only when approved.
  cycle_kind               text not null default 'development'
                             constraint review_cycles_kind_allowed
                             check (cycle_kind in ('development', 'production')),
  status                   text not null default 'draft'
                             constraint review_cycles_status_allowed
                             check (status in ('draft', 'evidence_collection', 'review', 'approved', 'abandoned')),

  -- Evidence published after this instant is not admissible for this cycle. This is what makes
  -- a historical review reproducible: it fixes what was knowable.
  evidence_cutoff          timestamptz not null,
  scheduled_effective_date date,
  opened_at                timestamptz not null default now(),
  closed_at                timestamptz,
  notes                    text,
  created_at               timestamptz not null default now(),

  constraint review_cycles_closed_after_opened
    check (closed_at is null or closed_at >= opened_at),
  -- An approved cycle is closed and has an effective date; an abandoned one is closed.
  constraint review_cycles_approved_is_complete
    check (status <> 'approved' or (closed_at is not null and scheduled_effective_date is not null)),
  constraint review_cycles_abandoned_is_closed
    check (status <> 'abandoned' or closed_at is not null),
  -- A development cycle may never be approved: approval is what makes a cycle capable of
  -- backing membership, and a development cycle must never be capable of that.
  constraint review_cycles_development_never_approved
    check (cycle_kind <> 'development' or status <> 'approved')
);

comment on table reference.ai_universe_review_cycles is
  'A quarterly reconstitution review of the AI Equity Universe. evidence_cutoff fixes what was knowable, which is what makes a historical review reproducible. A development cycle exercises the machinery and can never be approved, so it can never back membership.';

alter table reference.ai_universe_review_cycles enable row level security;

-- --------------------------------------------------------------------- issuer candidates

-- One candidate row per issuer per cycle. Discovery facts live in candidate_discoveries, so an
-- issuer found through four channels is one candidate with four discoveries, not four
-- candidates. That distinction is what keeps a candidate count meaningful.
create table pipeline.issuer_candidates (
  id                 uuid primary key default gen_random_uuid(),
  review_cycle_id    uuid not null references reference.ai_universe_review_cycles (id) on delete restrict,
  issuer_id          uuid not null references reference.issuers (id) on delete restrict,

  review_state       text not null default 'queued'
                       constraint issuer_candidates_state_allowed
                       check (review_state in ('queued', 'in_review', 'reviewed', 'deferred', 'withdrawn')),
  first_discovered_at  timestamptz not null default now(),
  last_reconsidered_at timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),

  unique (review_cycle_id, issuer_id)
);

comment on table pipeline.issuer_candidates is
  'The review queue: one row per issuer per cycle. Being a candidate means "this issuer deserves review", never "this issuer is AI".';

create index issuer_candidates_cycle_idx on pipeline.issuer_candidates (review_cycle_id, review_state);

alter table pipeline.issuer_candidates enable row level security;

create table pipeline.candidate_discoveries (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references pipeline.issuer_candidates (id) on delete restrict,

  -- The five deterministic channels. Recording the channel is what makes a future
  -- reconstitution able to re-run discovery rather than inherit a hand-maintained list.
  discovery_channel  text not null
                       constraint candidate_discoveries_channel_allowed
                       check (discovery_channel in (
                         'prior_reviewed_universe',
                         'research_seed',
                         'public_listing_or_product',
                         'corporate_event',
                         'evidence_triggered'
                       )),
  discovery_reason   text not null
                       constraint candidate_discoveries_reason_nonempty check (btrim(discovery_reason) <> ''),
  -- Where the discovery came from. Deliberately free-form and deliberately not an evidence
  -- claim: discovery sources are not admissible for admission.
  discovery_source   text,
  discovered_at      timestamptz not null default now(),
  discovered_by      text,
  created_at         timestamptz not null default now(),

  unique (candidate_id, discovery_channel, discovery_reason)
);

comment on table pipeline.candidate_discoveries is
  'Why an issuer entered the review queue, one row per channel. A thematic index, a news article or a product search may appear here and may never appear as admission evidence.';

create index candidate_discoveries_candidate_idx on pipeline.candidate_discoveries (candidate_id);

alter table pipeline.candidate_discoveries enable row level security;

-- ------------------------------------------------------------------- evidence documents

-- A source document, recorded once. Claims reference it, so one filing supporting three
-- determinations is one document and three claims.
create table pipeline.evidence_documents (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid references reference.source_interfaces (id) on delete restrict,
  -- The permission basis for retrieving it. Required for automated capture; a manually read
  -- public document carries the interface's terms review instead.
  permission_grant_id   uuid references reference.permission_grants (id) on delete restrict,
  source_retrieval_id   uuid references pipeline.source_retrievals (id) on delete restrict,

  canonical_url         text not null
                          constraint evidence_documents_url_nonempty check (btrim(canonical_url) <> ''),
  document_type         text not null
                          constraint evidence_documents_type_allowed
                          check (document_type in (
                            'annual_report', 'form_10k', 'form_20f', 'form_10q', 'form_8k', 'form_6k',
                            'results_release', 'exchange_filing', 'regulatory_filing',
                            'investor_presentation', 'earnings_call_transcript',
                            'product_documentation', 'press_release', 'other'
                          )),
  -- The issuer's own label, e.g. "FY2025 20-F".
  document_label        text,
  fiscal_period         text,
  period_end            date,
  published_at          date,

  retrieved_at          timestamptz not null,
  content_hash          text
                          constraint evidence_documents_hash_format
                          check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  byte_length           integer
                          constraint evidence_documents_bytes_positive
                          check (byte_length is null or byte_length > 0),

  -- How the document reached Urdais. Manual capture is a first-class path, because several
  -- filing systems in the launch geography forbid automated access.
  capture_method        text not null
                          constraint evidence_documents_capture_allowed
                          check (capture_method in ('automated_retrieval', 'manual_capture')),
  captured_by           text,
  notes                 text,
  created_at            timestamptz not null default now(),

  -- Automated capture must name the permission basis it was made under. Manual reading of a
  -- public page is not a retrieval and does not, but it still names who did it.
  constraint evidence_documents_automated_needs_grant
    check (capture_method <> 'automated_retrieval' or permission_grant_id is not null),
  constraint evidence_documents_manual_names_capturer
    check (capture_method <> 'manual_capture' or captured_by is not null)
);

comment on table pipeline.evidence_documents is
  'A source document cited once and referenced by many claims. Automated capture must name a permission grant; manual capture must name who read it. Neither stores the document -- the URL, the hash and the quoted passage are the record.';
comment on column pipeline.evidence_documents.capture_method is
  'automated_retrieval requires a permission grant. manual_capture exists because HKEXnews and comparable systems prohibit automated access, and reading a page by hand is the honest alternative to scraping around the restriction.';

create index evidence_documents_type_idx on pipeline.evidence_documents (document_type, period_end);

create trigger evidence_documents_no_mutation
  before update or delete on pipeline.evidence_documents
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.evidence_documents enable row level security;

-- ---------------------------------------------------------------------- evidence claims

create table pipeline.evidence_claims (
  id                     uuid primary key default gen_random_uuid(),
  evidence_document_id   uuid not null references pipeline.evidence_documents (id) on delete restrict,
  issuer_id              uuid not null references reference.issuers (id) on delete restrict,

  -- What the methodology's evidence hierarchy permits this to do. The whole point of the
  -- discovery/admission split lives in this column.
  evidence_class         text not null
                           constraint evidence_claims_class_allowed
                           check (evidence_class in ('establishing', 'corroborating', 'discovery_only')),
  claim_type             text not null
                           constraint evidence_claims_type_allowed
                           check (claim_type in (
                             'product_line_enumeration', 'qualifying_activity', 'segment_revenue',
                             'consolidated_revenue', 'qualifying_revenue', 'recurring_revenue',
                             'capacity_allocation', 'general_availability', 'separate_commercialisation',
                             'principal_driver_statement', 'exclusion_basis', 'other'
                           )),

  -- The sentence the determination rests on, quoted. A paraphrase is not evidence.
  quoted_passage         text
                           constraint evidence_claims_passage_nonempty
                           check (quoted_passage is null or btrim(quoted_passage) <> ''),
  -- Structured fact where the claim is a figure rather than a sentence.
  numeric_value          numeric,
  value_unit             text,
  value_currency         char(3)
                           constraint evidence_claims_currency_format
                           check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  fiscal_period          text,

  -- Machine assistance is recorded, never hidden. An extraction is not establishing evidence
  -- until a human has verified it against the quoted passage.
  extraction_method      text not null default 'human'
                           constraint evidence_claims_extraction_allowed
                           check (extraction_method in ('human', 'parser', 'model_assisted')),
  extractor_version      text,
  extraction_confidence  numeric
                           constraint evidence_claims_confidence_range
                           check (extraction_confidence is null
                                  or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  human_verification     text not null default 'unverified'
                           constraint evidence_claims_verification_allowed
                           check (human_verification in ('unverified', 'verified', 'rejected')),
  verified_by            text,
  verified_at            timestamptz,

  created_at             timestamptz not null default now(),

  -- An establishing claim must quote something or state a figure; it cannot be an assertion.
  constraint evidence_claims_establishing_has_substance
    check (evidence_class <> 'establishing'
           or quoted_passage is not null or numeric_value is not null),
  -- Machine output is not establishing evidence until verified by a named human. This is the
  -- rule that stops an opaque classifier from emitting a determination.
  constraint evidence_claims_machine_establishing_needs_verification
    check (evidence_class <> 'establishing'
           or extraction_method = 'human'
           or (human_verification = 'verified' and verified_by is not null)),
  constraint evidence_claims_verified_is_attributed
    check (human_verification <> 'verified' or (verified_by is not null and verified_at is not null))
);

comment on table pipeline.evidence_claims is
  'One fact drawn from one document about one issuer. evidence_class carries the methodology''s hierarchy: only establishing claims may support an admission, and a machine-extracted claim is not establishing until a named human has verified it.';

create index evidence_claims_issuer_idx on pipeline.evidence_claims (issuer_id, claim_type);
create index evidence_claims_document_idx on pipeline.evidence_claims (evidence_document_id);

create trigger evidence_claims_no_mutation
  before delete on pipeline.evidence_claims
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.evidence_claims enable row level security;

-- ------------------------------------------------------------------- eligibility reviews

create table pipeline.eligibility_reviews (
  id                        uuid primary key default gen_random_uuid(),
  review_cycle_id           uuid not null references reference.ai_universe_review_cycles (id) on delete restrict,
  issuer_id                 uuid not null references reference.issuers (id) on delete restrict,
  methodology_version_id    uuid not null references reference.methodology_versions (id) on delete restrict,

  -- The five canonical statuses. Mutually exclusive by construction: one column, one value.
  status                    text not null
                              constraint eligibility_reviews_status_allowed
                              check (status in (
                                'eligible', 'pending', 'contested', 'insufficient_evidence', 'rejected'
                              )),

  -- The tier a reviewer was testing, retained even when the test failed, because "we assessed
  -- it as a Tier 2 candidate and it failed Prong B" is a more useful record than a bare reject.
  candidate_primary_tier    smallint
                              constraint eligibility_reviews_candidate_tier_allowed
                              check (candidate_primary_tier is null or candidate_primary_tier in (1, 2, 3)),
  final_primary_tier        smallint
                              constraint eligibility_reviews_final_tier_allowed
                              check (final_primary_tier is null or final_primary_tier in (1, 2, 3)),
  -- Route matters only for Tier 3, and it is what the tau_B gate keys on.
  tier3_route               text
                              constraint eligibility_reviews_route_allowed
                              check (tier3_route is null or tier3_route in ('A', 'B')),
  value_chain_layers        text[]
                              constraint eligibility_reviews_layers_allowed
                              check (value_chain_layers is null
                                     or value_chain_layers <@ array[
                                          'compute_and_infrastructure', 'platform', 'application', 'autonomy'
                                        ]::text[]),

  qualifying_role           text,
  materiality_basis         text,
  -- Why a determination is not eligible, where that is a gate rather than a failure: e.g. an
  -- unresolved parameter. Distinct from a rejection reason.
  gating_reason             text,

  evidence_cutoff           timestamptz not null,
  review_date               date not null,
  reviewer                  text not null
                              constraint eligibility_reviews_reviewer_nonempty check (btrim(reviewer) <> ''),
  independent_reviewer      text,
  independent_check_state   text not null default 'not_performed'
                              constraint eligibility_reviews_check_state_allowed
                              check (independent_check_state in ('not_performed', 'pending', 'passed', 'failed')),

  effective_from            date,
  publication_state         text not null default 'internal'
                              constraint eligibility_reviews_publication_allowed
                              check (publication_state in ('internal', 'published', 'withdrawn')),

  superseded_by_id          uuid references pipeline.eligibility_reviews (id) on delete restrict
                              deferrable initially deferred,
  superseded_at             timestamptz,
  supersession_reason       text,
  created_at                timestamptz not null default now(),

  -- An eligible issuer has exactly one primary tier. Everything else has none: a candidate tier
  -- is recorded separately, so a non-eligible row can never contribute to a tier subtotal.
  constraint eligibility_reviews_eligible_has_final_tier
    check (status <> 'eligible' or final_primary_tier is not null),
  constraint eligibility_reviews_non_eligible_has_no_final_tier
    check (status = 'eligible' or final_primary_tier is null),
  -- A Tier 3 determination states its route; the other tiers have none.
  constraint eligibility_reviews_tier3_has_route
    check (final_primary_tier is distinct from 3 or tier3_route is not null),
  constraint eligibility_reviews_route_only_for_tier3
    check (tier3_route is null or final_primary_tier = 3 or candidate_primary_tier = 3),
  -- An eligible issuer carries at least one value-chain layer: the attribution is part of the
  -- determination, not an afterthought.
  constraint eligibility_reviews_eligible_has_layer
    check (status <> 'eligible'
           or (value_chain_layers is not null and cardinality(value_chain_layers) >= 1)),
  -- A passed or failed independent check names who performed it.
  constraint eligibility_reviews_check_is_attributed
    check (independent_check_state not in ('passed', 'failed') or independent_reviewer is not null),
  -- The independent check is a different person from the reviewer, or it is not independent.
  constraint eligibility_reviews_check_is_independent
    check (independent_reviewer is null or independent_reviewer <> reviewer),
  -- Only an eligible determination is ever published.
  constraint eligibility_reviews_only_eligible_published
    check (publication_state <> 'published' or status = 'eligible')
);

comment on table pipeline.eligibility_reviews is
  'One point-in-time thematic determination for one issuer in one cycle. Immutable except for supersession: a later filing produces a new review, because reconstructing a historical universe means knowing what was decided then and on what evidence.';
comment on column pipeline.eligibility_reviews.candidate_primary_tier is
  'The tier the reviewer was testing. Retained on a failed determination so the record says which test failed, and never counted toward a tier subtotal.';
comment on column pipeline.eligibility_reviews.gating_reason is
  'Why an otherwise-supported determination is not eligible because of a gate rather than the evidence, such as an unresolved methodology parameter. Distinct from a rejection.';
comment on column pipeline.eligibility_reviews.independent_check_state is
  'Honest by construction: not_performed is the default and is a truthful statement. A passed check names a reviewer who is not the primary reviewer.';

-- One live determination per issuer per cycle. A superseded row stays, which is the point.
create unique index eligibility_reviews_one_live_per_issuer_cycle
  on pipeline.eligibility_reviews (review_cycle_id, issuer_id)
  where superseded_by_id is null;

create index eligibility_reviews_status_idx on pipeline.eligibility_reviews (review_cycle_id, status);

create trigger eligibility_reviews_supersession_only
  before update or delete on pipeline.eligibility_reviews
  for each row execute function pipeline.allow_only_supersession();

alter table pipeline.eligibility_reviews enable row level security;

-- The gates that need to read other rows.
create or replace function pipeline.check_eligibility_review()
returns trigger
language plpgsql
as $$
declare
  cyc record;
  approved_tau_b integer;
begin
  select cycle_kind, status, evidence_cutoff into cyc
    from reference.ai_universe_review_cycles where id = new.review_cycle_id;

  -- A development cycle may hold determinations; it may never publish them.
  if new.publication_state = 'published' and cyc.cycle_kind <> 'production' then
    raise exception 'a % cycle cannot publish an eligibility determination', cyc.cycle_kind
      using errcode = 'check_violation';
  end if;
  if new.publication_state = 'published' and cyc.status <> 'approved' then
    raise exception 'membership cannot be published from a cycle that is %', cyc.status
      using errcode = 'check_violation';
  end if;

  -- The review inherits its cycle's evidence cutoff; a mismatch would make the determination
  -- irreproducible, because the set of admissible evidence would be unknown.
  if new.evidence_cutoff <> cyc.evidence_cutoff then
    raise exception 'review evidence cutoff % does not match its cycle cutoff %',
      new.evidence_cutoff, cyc.evidence_cutoff using errcode = 'check_violation';
  end if;

  -- tau_B gate, scoped narrowly: it blocks a Route B admission and nothing else. Tier 1,
  -- Tier 2, Route A and every rejection are unaffected.
  if new.status = 'eligible' and new.final_primary_tier = 3 and new.tier3_route = 'B' then
    select count(*) into approved_tau_b
      from reference.methodology_parameters
     where parameter_key = 'tau_b'
       and status = 'approved'
       and effective_from is not null
       and effective_from <= new.review_date;
    if approved_tau_b = 0 then
      raise exception 'Tier 3 Route B admission requires an approved tau_b parameter in force at the review date; none exists'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function pipeline.check_eligibility_review() is
  'Trigger: a development or unapproved cycle cannot publish; a review''s evidence cutoff must match its cycle''s; and a Tier 3 Route B admission requires an approved tau_b parameter in force. The gate is deliberately narrow -- it blocks Route B alone.';

create trigger eligibility_reviews_gates
  before insert on pipeline.eligibility_reviews
  for each row execute function pipeline.check_eligibility_review();

-- ------------------------------------------------------- tier-specific structured evidence

create table pipeline.tier1_product_lines (
  id                  uuid primary key default gen_random_uuid(),
  review_id           uuid not null references pipeline.eligibility_reviews (id) on delete restrict,
  line_name           text not null
                        constraint tier1_lines_name_nonempty check (btrim(line_name) <> ''),
  qualifies           boolean not null,
  -- Condition 3: a non-qualifying line not separately disclosed is presumed ancillary only
  -- where the filing presents it as supporting the issuer's own qualifying products.
  ancillary_support   boolean not null default false,
  separately_disclosed boolean not null default false,
  -- Condition 4: where services are material, they must implement the issuer's own products.
  is_service_line     boolean not null default false,
  services_test_basis text,
  basis               text not null
                        constraint tier1_lines_basis_nonempty check (btrim(basis) <> ''),
  evidence_claim_id   uuid references pipeline.evidence_claims (id) on delete restrict,
  created_at          timestamptz not null default now(),

  unique (review_id, line_name),
  -- Ancillary support is a claim about a non-qualifying, non-disclosed line. Asserting it for a
  -- qualifying line is meaningless; asserting it for a disclosed one contradicts condition 2.
  constraint tier1_lines_ancillary_only_where_relevant
    check (not ancillary_support or (not qualifies and not separately_disclosed))
);

comment on table pipeline.tier1_product_lines is
  'The Tier 1 enumeration: every commercial line named in the issuer''s filing, whether it qualifies, and -- where it does not -- whether the filing presents it as supporting the issuer''s own qualifying products.';

create index tier1_product_lines_review_idx on pipeline.tier1_product_lines (review_id);

alter table pipeline.tier1_product_lines enable row level security;

create table pipeline.tier2_assessments (
  id                   uuid primary key default gen_random_uuid(),
  review_id            uuid not null references pipeline.eligibility_reviews (id) on delete restrict,

  -- Prong A: what is embodied in an AI compute system, or whose manufacture is performed.
  prong_a_category     text not null
                         constraint tier2_prong_a_allowed
                         check (prong_a_category in (
                           'ai_accelerator', 'ai_asic', 'high_bandwidth_memory',
                           'ai_cluster_interconnect', 'accelerated_compute_system',
                           'qualifying_fabrication', 'advanced_packaging'
                         )),
  prong_a_product      text not null
                         constraint tier2_prong_a_product_nonempty check (btrim(prong_a_product) <> ''),
  prong_a_evidence_id  uuid references pipeline.evidence_claims (id) on delete restrict,

  -- Prong B: which of the four materiality routes was used.
  prong_b_route        text
                         constraint tier2_prong_b_allowed
                         check (prong_b_route is null or prong_b_route in (
                           'product_family_revenue', 'segment_materiality_with_attribution',
                           'capacity_allocation', 'principal_driver_in_filing'
                         )),
  prong_b_satisfied    boolean not null default false,
  prong_b_basis        text,
  prong_b_evidence_id  uuid references pipeline.evidence_claims (id) on delete restrict,

  created_at           timestamptz not null default now(),

  unique (review_id, prong_a_category, prong_a_product),
  -- A satisfied Prong B names its route and its basis. Both prongs are required for Tier 2;
  -- a row with Prong A alone records an assessment that did not complete.
  constraint tier2_prong_b_satisfied_is_evidenced
    check (not prong_b_satisfied or (prong_b_route is not null and prong_b_basis is not null))
);

comment on table pipeline.tier2_assessments is
  'The Tier 2 test: Prong A embodiment and Prong B materiality, recorded separately because both are required and because a row with Prong A alone is a real and useful state -- an issuer that supplies the right product and has not evidenced that it matters to them.';

create index tier2_assessments_review_idx on pipeline.tier2_assessments (review_id);

alter table pipeline.tier2_assessments enable row level security;

create table pipeline.tier3_assessments (
  id                     uuid primary key default gen_random_uuid(),
  review_id              uuid not null references pipeline.eligibility_reviews (id) on delete restrict,
  route                  text not null
                           constraint tier3_route_allowed check (route in ('A', 'B')),

  offering               text not null
                           constraint tier3_offering_nonempty check (btrim(offering) <> ''),
  -- Route A conditions.
  generally_available    boolean,
  separately_contracted  boolean,
  scale_metric           text,
  -- The ranked scale-evidence hierarchy. Rank 1 and 2 may establish; 3 and 4 corroborate only.
  scale_evidence_rank    smallint
                           constraint tier3_scale_rank_allowed
                           check (scale_evidence_rank is null or scale_evidence_rank between 1 and 4),
  scale_value            numeric,
  scale_currency         char(3)
                           constraint tier3_scale_currency_format
                           check (scale_currency is null or scale_currency ~ '^[A-Z]{3}$'),
  scale_period           text,

  -- Route B figures. r_i_lower is recorded where disclosure supports it; it is compared against
  -- tau_B only when an approved parameter exists, which the review trigger enforces.
  qualifying_revenue     numeric,
  consolidated_revenue   numeric,
  r_i_lower              numeric
                           constraint tier3_ratio_range
                           check (r_i_lower is null or (r_i_lower >= 0 and r_i_lower <= 1)),

  satisfied              boolean not null default false,
  basis                  text,
  evidence_claim_id      uuid references pipeline.evidence_claims (id) on delete restrict,
  created_at             timestamptz not null default now(),

  -- Route A is satisfied only on rank 1 or 2 evidence, generally available and separately
  -- contracted. This is the rule that stops gross billing from admitting an issuer.
  constraint tier3_route_a_requires_establishing_rank
    check (route <> 'A' or not satisfied
           or (generally_available and separately_contracted
               and scale_evidence_rank is not null and scale_evidence_rank <= 2)),
  -- Route B needs both sides of the ratio to have produced it.
  constraint tier3_route_b_ratio_is_derived
    check (route <> 'B' or not satisfied
           or (qualifying_revenue is not null and consolidated_revenue is not null
               and r_i_lower is not null))
);

comment on table pipeline.tier3_assessments is
  'The Tier 3 test. Route A records the offering, its availability and the ranked scale indicator; rank 3 and 4 indicators may corroborate but can never satisfy it. Route B records the ratio and its two inputs, and its admission is gated on an approved tau_B by the review trigger.';

create index tier3_assessments_review_idx on pipeline.tier3_assessments (review_id);

alter table pipeline.tier3_assessments enable row level security;

-- ------------------------------------------------------------------- exclusion evaluations

create table pipeline.review_exclusions (
  id                 uuid primary key default gen_random_uuid(),
  review_id          uuid not null references pipeline.eligibility_reviews (id) on delete restrict,

  -- E1-E9 as published. A dedicated check rather than reference.exclusion_reasons, whose codes
  -- are keyed to UCPI's P0/P1/P2 offer stages and describe a different subject entirely.
  exclusion_code     text not null
                       constraint review_exclusions_code_allowed
                       check (exclusion_code in ('E1','E2','E3','E4','E5','E6','E7','E8','E9')),
  -- Evaluated and not applicable is a finding worth keeping: it shows the rule was considered.
  applied            boolean not null,
  basis              text not null
                       constraint review_exclusions_basis_nonempty check (btrim(basis) <> ''),
  evidence_claim_id  uuid references pipeline.evidence_claims (id) on delete restrict,
  created_at         timestamptz not null default now(),

  unique (review_id, exclusion_code)
);

comment on table pipeline.review_exclusions is
  'Which exclusions were evaluated for a review and which applied. An evaluated-but-not-applied row is kept deliberately: it is the difference between a rule considered and a rule forgotten.';

create index review_exclusions_review_idx on pipeline.review_exclusions (review_id);

alter table pipeline.review_exclusions enable row level security;
