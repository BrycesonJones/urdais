-- UBWI Production V1, part 1: the foundation the index family needs.
--
-- Three existing vocabularies have to admit UBWI's shapes, and the source registry has
-- to learn that a rights state is a property of a retained artifact rather than of a
-- live fetch. Nothing here seeds a constituent, approves a source, or publishes a value.
--
-- The design invariant this migration encodes, and the reason it exists at all:
--
--   A rights state derives from retained, reviewed, hashed terms evidence -- never from
--   whether the terms URL happens to answer on a given run.
--
-- The OECD's terms host returns HTTP 403 intermittently to the same URL that grants
-- access. A collector that re-derives rights from a live retrieval demotes a permitted
-- source at random, and silently, because a 403 looks like an answer. So a failed
-- re-check may write `terms_last_rechecked_at` and nothing else, and that is enforced
-- by a trigger rather than left to a convention in application code.

-- ---------------------------------------------------------------- vocabularies

-- UBWI is an index, not a compute price.
alter table reference.instruments
  drop constraint instruments_category_allowed,
  add constraint instruments_category_allowed
    check (category in ('compute_price', 'index'));

-- Statistical compilers, spot venues and chain data interfaces are providers too.
-- The existing kinds are carried forward unchanged; this only adds.
alter table reference.providers
  drop constraint providers_kind_allowed,
  add constraint providers_kind_allowed
    check (provider_kind in (
      'cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider',
      'statistical_compiler', 'spot_venue', 'chain_data', 'other'
    ));

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface',
    'catalog_price_interface',
    'availability_interface',
    'product_reference_documentation',
    'hardware_reference_documentation',
    'provider_terms_documentation',
    'price_surface',
    'news_feed',
    -- UBWI additions.
    'statistical_dataset',
    'exchange_rate_series',
    'chain_data_interface',
    'spot_price_interface'
  ));

-- ---------------------------------------------------------------- terms artifacts

alter table reference.source_interfaces
  add column terms_artifact_url         text,
  add column terms_artifact_hash        text
    constraint source_interfaces_terms_hash_format
      check (terms_artifact_hash is null or terms_artifact_hash ~ '^[0-9a-f]{64}$'),
  add column terms_artifact_bytes       bigint
    constraint source_interfaces_terms_bytes_nonnegative
      check (terms_artifact_bytes is null or terms_artifact_bytes >= 0),
  add column terms_artifact_status      integer
    constraint source_interfaces_terms_status_range
      check (terms_artifact_status is null or terms_artifact_status between 100 and 599),
  add column terms_retrieved_at         timestamptz,
  add column terms_last_rechecked_at    timestamptz,
  add column terms_review_flag          boolean not null default false,
  add column automated_retrieval_available boolean;

comment on column reference.source_interfaces.terms_artifact_hash is
  'SHA-256 of the retained terms document the rights state is anchored to. The rights state is derived from this artifact, not from the network.';
comment on column reference.source_interfaces.terms_last_rechecked_at is
  'When a re-confirmation was last attempted. A failed attempt may set this column and nothing else: "not re-confirmed today" and "no longer permitted" are different facts.';
comment on column reference.source_interfaces.terms_review_flag is
  'Raised when a retained artifact ages past the recheck horizon or a retrieved document differs from it. A flag for a human, never an automatic demotion.';
comment on column reference.source_interfaces.automated_retrieval_available is
  'Whether a usable automated collection path exists today. False is an operational fact and never by itself a rights conclusion.';

-- A permitted state must be able to show the document it rests on.
--
-- Scoped to the source classes this migration introduces. The interfaces reviewed in
-- earlier phases were classified before the artifact columns existed, and back-filling
-- their retained documents is a deliberate slice of its own rather than something this
-- migration should do implicitly. Every class UBWI reads is covered from the start.
alter table reference.source_interfaces
  add constraint source_interfaces_permitted_needs_artifact check (
    source_class not in ('statistical_dataset', 'exchange_rate_series',
                         'chain_data_interface', 'spot_price_interface')
    or not (terms_review_state = 'permitted' and data_use_terms_state = 'permitted')
    or (terms_artifact_hash is not null
        and terms_artifact_url is not null
        and terms_retrieved_at is not null
        and terms_artifact_status = 200)
  );

-- A re-check may never move a rights state. Only the review path may, and only when a
-- successfully retrieved document differs from the retained one -- which raises a flag
-- that a person then acts on. This trigger is the enforcement, not the convention.
create or replace function reference.guard_terms_recheck()
returns trigger
language plpgsql
as $$
begin
  -- Scoped to the classes that carry a retained artifact. Interfaces reviewed in earlier
  -- phases have their own review path and are untouched by this guard; extending it to
  -- them is a deliberate slice of its own, once their artifacts are back-filled.
  if new.source_class not in ('statistical_dataset', 'exchange_rate_series',
                              'chain_data_interface', 'spot_price_interface') then
    return new;
  end if;

  -- The artifact itself is being replaced: that is a review action, and it must carry a
  -- successful retrieval. Everything is allowed to move together.
  if new.terms_artifact_hash is distinct from old.terms_artifact_hash then
    if new.terms_artifact_status is distinct from 200 or new.terms_retrieved_at is null then
      raise exception 'a terms artifact may only be replaced by a successfully retrieved document (status 200 with a retrieval time)'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- The artifact is unchanged. A recheck may record that it happened and may raise a
  -- review flag. It may not touch either rights axis or the production access state.
  if new.terms_review_state is distinct from old.terms_review_state
     or new.data_use_terms_state is distinct from old.data_use_terms_state
     or new.production_access_state is distinct from old.production_access_state then
    raise exception 'a rights state may not change while the retained terms artifact is unchanged; a failed or unchanged recheck means "not re-confirmed today", never "no longer permitted"'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function reference.guard_terms_recheck() is
  'Refuses any rights-state change that is not accompanied by a newly retrieved terms artifact. A transient 403, 404 or network failure therefore cannot revoke an established grant.';

create trigger source_interfaces_terms_recheck_guard
  before update on reference.source_interfaces
  for each row execute function reference.guard_terms_recheck();

-- ---------------------------------------------------------------- retrieval failures

alter table pipeline.source_retrievals
  add column failure_kind text
    constraint source_retrievals_failure_kind_allowed
      check (failure_kind is null or failure_kind in (
        'dns', 'transport', 'tls', 'http_status', 'content_shape', 'content_empty'
      )),
  add column resolver_used text;

comment on column pipeline.source_retrievals.failure_kind is
  'Why a retrieval failed. Only content_shape and content_empty may inform a judgement about a source: dns and transport are facts about the environment. Two national compilers were recorded as blocked across two research phases because of one machine''s DNS resolver.';
comment on column pipeline.source_retrievals.resolver_used is
  'The DNS resolver the retrieval actually used, so a resolution failure can be reproduced or dismissed.';

-- ---------------------------------------------------------------- residual model

create table reference.wealth_estimation_rules (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                     constraint wealth_estimation_rules_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version          text not null
                     constraint wealth_estimation_rules_version_format check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+)?$'),
  description      text not null,
  -- The basis the rule projects the unobserved world on.
  ratio_basis      text not null
                     constraint wealth_estimation_rules_basis_allowed
                     check (ratio_basis in ('observed_set_wealth_to_gdp')),
  calibration_factor  numeric not null
                        constraint wealth_estimation_rules_calibration_positive check (calibration_factor > 0),
  calibration_source  text not null,
  effective_from   date,
  created_at       timestamptz not null default now(),
  unique (slug, version)
);

comment on table reference.wealth_estimation_rules is
  'The residual imputation rule as versioned reference data rather than application code, so a value computed under one rule stays explicable after the rule changes. History is never restated.';

-- The measured feasible frontier, stored beside the rule so that a gate threshold and
-- the frontier it must sit below are visible in the same place.
create table reference.wealth_feasible_frontiers (
  id                   uuid primary key default gen_random_uuid(),
  measured_on          date not null,
  near_term_coverage   numeric not null
                         constraint wealth_frontier_near_term_range check (near_term_coverage > 0 and near_term_coverage <= 1),
  counterfactual_coverage numeric
                         constraint wealth_frontier_counterfactual_range check (counterfactual_coverage is null or (counterfactual_coverage > 0 and counterfactual_coverage <= 1)),
  source_document      text not null,
  note                 text,
  created_at           timestamptz not null default now(),
  unique (measured_on, source_document)
);

comment on table reference.wealth_feasible_frontiers is
  'What rights-cleared observed GDP coverage the global statistical system can actually support, measured rather than assumed. A publication threshold above this figure is a permanent refusal disguised as a standard, which is what the Phase 2A and 2B proposals turned out to be.';

-- The publication gate's thresholds, as configuration checked against the frontier.
create table reference.ubwi_publication_gates (
  id                             uuid primary key default gen_random_uuid(),
  version                        text not null unique
                                   constraint ubwi_gates_version_format check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+)?$'),
  frontier_id                    uuid not null references reference.wealth_feasible_frontiers (id) on delete restrict,
  max_imputed_share              numeric not null
                                   constraint ubwi_gates_imputed_range check (max_imputed_share > 0 and max_imputed_share < 1),
  min_rights_cleared_coverage    numeric not null
                                   constraint ubwi_gates_coverage_range check (min_rights_cleared_coverage > 0 and min_rights_cleared_coverage <= 1),
  max_vintage_age_years          integer not null
                                   constraint ubwi_gates_age_positive check (max_vintage_age_years > 0),
  max_vintage_dispersion_years   integer not null
                                   constraint ubwi_gates_dispersion_positive check (max_vintage_dispersion_years > 0),
  major_economy_disclosure_share numeric not null
                                   constraint ubwi_gates_disclosure_range check (major_economy_disclosure_share > 0 and major_economy_disclosure_share < 1),
  effective_from                 date,
  created_at                     timestamptz not null default now()
);

comment on table reference.ubwi_publication_gates is
  'The publication thresholds as configuration, not literals. A coverage floor above the referenced frontier is refused: it would make the database decline every denominator forever while appearing to encode a quality rule.';

-- The threshold is checked against the frontier it names.
create or replace function reference.check_gate_against_frontier()
returns trigger
language plpgsql
as $$
declare
  frontier numeric;
begin
  select near_term_coverage into frontier
    from reference.wealth_feasible_frontiers where id = new.frontier_id;
  if new.min_rights_cleared_coverage > frontier then
    raise exception 'coverage floor % exceeds the measured feasible frontier %: a bound above the frontier is a permanent refusal, not a standard',
      new.min_rights_cleared_coverage, frontier
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ubwi_publication_gates_frontier_check
  before insert or update on reference.ubwi_publication_gates
  for each row execute function reference.check_gate_against_frontier();

alter table reference.wealth_estimation_rules    enable row level security;
alter table reference.wealth_feasible_frontiers  enable row level security;
alter table reference.ubwi_publication_gates     enable row level security;

-- Nothing was granted, approved or published by this migration. The invariant that
-- matters here is about the classes this migration introduces: none of them may be
-- production-approved, because approval is an operational review decision and no
-- migration performs one.
do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved'
     and source_class in ('statistical_dataset', 'exchange_rate_series',
                          'chain_data_interface', 'spot_price_interface');
  if n <> 0 then
    raise exception 'a UBWI source interface is production-approved, which this migration must never do (found %)', n;
  end if;
end
$$;
