-- Implementation readiness: the three fields the launch-readiness pass found
-- missing, and a database-level production gate.
--
-- Gap A, legal identity. The family identifies a seller by legal identity, and
-- the market-breadth rule turns on it: two brands of one legal entity are one
-- seller. A market entity row is the legal entity; brands, tiers and native
-- identifiers map onto it through reference.native_identifiers. Common control
-- between two distinct legal entities is a single nullable pointer to the
-- controlling entity, recorded only on evidence, never inferred from prices.
-- It is deliberately not an ownership graph.
--
-- Gap B, service tier. The child treats service dimensions as recorded
-- metadata rather than requirements, and the seller-reduction rule needs the
-- variant label. The source-native label and fields are kept exactly on the
-- raw offer; the normalized observation carries one jsonb object with the
-- documented keys below.
--
-- Gap C, permission reference. A production retrieval must be traceable to
-- the permission basis that authorized it. reference.permission_grants records
-- each basis (provider terms, written permission, agreement, order) with what
-- it covers and when; a retrieval points at one. A retrieval declared for
-- production must carry a grant, the grant must belong to the same interface
-- and be in force at request time, and the interface must be
-- production-approved, which the registry already conditions on both terms
-- axes being permitted. Nothing here approves any source.

-- Gap A ----------------------------------------------------------------------

alter table reference.market_entities
  add column legal_name            text,
  add column legal_identifier      text,
  add column controlling_entity_id uuid references reference.market_entities (id) on delete restrict,
  add constraint market_entities_not_self_controlled
    check (controlling_entity_id is null or controlling_entity_id <> id),
  add constraint market_entities_identifier_requires_legal_name
    check (legal_identifier is null or legal_name is not null);

comment on column reference.market_entities.name is
  'Display or brand name as the market knows the party. Not an identity.';
comment on column reference.market_entities.legal_name is
  'The legal entity name. Two brands under one legal name are one seller and one row; brands map onto the row through native_identifiers.';
comment on column reference.market_entities.legal_identifier is
  'A registry number or equivalent identifier for the legal entity, where known. Requires legal_name.';
comment on column reference.market_entities.controlling_entity_id is
  'Where two distinct legal entities are under common control on evidence, the controlling entity. Drives capacity-source collapse for independence at the floor. Never inferred from price similarity; the evidence belongs in notes or entity_roles.evidence.';

create index market_entities_controlling_idx
  on reference.market_entities (controlling_entity_id) where controlling_entity_id is not null;

-- Gap B ----------------------------------------------------------------------

alter table pipeline.raw_offers
  add column native_service_tier   text,
  add column native_service_fields jsonb;

comment on column pipeline.raw_offers.native_service_tier is
  'The source''s own tier label for this offer, exactly as expressed (for example a cloud tier name). NULL where the source has one tier.';
comment on column pipeline.raw_offers.native_service_fields is
  'Every service-level field the source exposes for this offer, verbatim: reliability class, uptime, support, compliance, provisioning. Retained unmodified.';

alter table pipeline.normalized_observations
  add column service_tier jsonb
    constraint normalized_observations_service_tier_object
    check (service_tier is null or jsonb_typeof(service_tier) = 'object');

comment on column pipeline.normalized_observations.service_tier is
  'Normalized service characteristics under the family''s service-tier dimensions. Expected keys, each nullable: tier_label (text), operator_class (first_party_datacenter | community_host | undetermined), interruption_policy (none | reclaimable), uptime_commitment (text), provisioning_model (text), support_commitment (text), intra_node_interconnect (text), inter_node_fabric (text), storage_included_gb (number), compliance (text[]). The child records these as metadata, not requirements; tier_label is the variant used by seller-level reduction.';

-- Gap C ----------------------------------------------------------------------

create table reference.permission_grants (
  id                     uuid primary key default gen_random_uuid(),
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  grant_kind             text not null
                           constraint permission_grants_kind_allowed
                           check (grant_kind in ('provider_terms', 'written_permission', 'agreement', 'order')),
  -- What identifies the basis: a terms version and URL, a message or thread identifier, an agreement number.
  reference              text not null,
  covers_collection      boolean not null,
  covers_index_use       boolean not null,
  granted_on             date,
  effective_from         timestamptz not null,
  effective_to           timestamptz,
  evidence               text not null,
  evidence_retrieval_id  uuid references pipeline.source_retrievals (id) on delete restrict,
  created_at             timestamptz not null default now(),
  constraint permission_grants_interval_ordered
    check (effective_to is null or effective_to > effective_from)
);

comment on table reference.permission_grants is
  'A permission basis under which retrievals from a source interface may occur: the provider''s own terms, a written permission, an agreement, or an order. Identifies the document; never stores it. Recording a grant does not approve a source; production approval remains the registry''s two-axis decision.';

create index permission_grants_interface_idx
  on reference.permission_grants (source_interface_id, effective_from desc);

alter table pipeline.source_retrievals
  add column permission_grant_id uuid references reference.permission_grants (id) on delete restrict,
  add column retrieval_purpose   text not null default 'research'
    constraint source_retrievals_purpose_allowed check (retrieval_purpose in ('research', 'production')),
  -- A production retrieval without a permission basis cannot be recorded.
  add constraint source_retrievals_production_requires_grant
    check (retrieval_purpose <> 'production' or permission_grant_id is not null);

comment on column pipeline.source_retrievals.permission_grant_id is
  'The permission basis this retrieval was made under. Required for production retrievals; optional for research ones.';
comment on column pipeline.source_retrievals.retrieval_purpose is
  'research: a study or fixture retrieval that never enters a published value. production: a retrieval that may. Production requires a permission grant and a production-approved interface, enforced by trigger.';

create or replace function pipeline.check_retrieval_permission()
returns trigger
language plpgsql
as $$
declare
  g record;
  iface record;
begin
  if new.permission_grant_id is not null then
    select source_interface_id, effective_from, effective_to into g
      from reference.permission_grants where id = new.permission_grant_id;
    if g.source_interface_id <> new.source_interface_id then
      raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
    if new.requested_at < g.effective_from or (g.effective_to is not null and new.requested_at >= g.effective_to) then
      raise exception 'permission grant % was not in force at %', new.permission_grant_id, new.requested_at
        using errcode = 'check_violation';
    end if;
  end if;

  if new.retrieval_purpose = 'production' then
    select production_access_state, terms_review_state, data_use_terms_state into iface
      from reference.source_interfaces where id = new.source_interface_id;
    if iface.production_access_state <> 'production_approved' then
      raise exception 'production retrieval from a source interface that is % (terms %, data use %)',
        iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_retrieval_permission() is
  'Trigger: a retrieval''s permission grant must belong to its interface and be in force at request time; a production retrieval requires a production-approved interface. The database refuses production collection the registry has not cleared.';

create trigger source_retrievals_permission_check
  before insert on pipeline.source_retrievals
  for each row execute function pipeline.check_retrieval_permission();

alter table reference.permission_grants enable row level security;

-- Nothing external changed.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
  select count(*) into n from reference.permission_grants;
  if n <> 0 then raise exception 'a permission grant was recorded without evidence'; end if;
end
$$;
