-- Manual verified acquisition: publishing a verified fact is not a claim of
-- automated collection permission.
--
-- Two questions have been conflated by a single gate:
--
--   1. May Urdais publish a price a person read from the provider's own
--      published page and retained with provenance?
--   2. May Urdais retrieve that page automatically, on a schedule, without
--      the provider's agreement?
--
-- The second requires the source's collection rights to be settled. The first
-- does not: a published price is a fact of the market, and a person reading it
-- from the first-party surface and retaining the artifact is a legitimate
-- acquisition path. Leaving factual market data invisible because an automation
-- question is open is a different error from publishing without permission.
--
-- This migration records that distinction explicitly rather than overloading
-- the existing state. A retrieval declares how it was acquired:
--
--   automated        a machine fetched it; the source's production gate applies
--                    exactly as before
--   manual_verified  a person read the first-party page, retained the artifact
--                    and recorded what they verified
--
-- A manual_verified retrieval may carry a production purpose without the
-- interface being production_approved. It changes no registry column, grants
-- no collection right, and does not make an automated retrieval from the same
-- interface permissible: the branch below still refuses that. Anything that
-- does not opt in explicitly behaves exactly as it did.

alter table pipeline.source_retrievals
  add column acquisition_mode text
    constraint source_retrievals_acquisition_mode_allowed
    check (acquisition_mode is null or acquisition_mode in ('automated', 'manual_verified')),
  add column verification_evidence text;

comment on column pipeline.source_retrievals.acquisition_mode is
  'How the artifact was acquired. manual_verified means a person read the first-party surface and retained it; it is not permission to retrieve automatically. Null is treated as automated.';
comment on column pipeline.source_retrievals.verification_evidence is
  'What the verifier checked and where, in their own words. Required for a manual_verified retrieval.';

-- A manual verification must actually be one: a manual read, with evidence and
-- a retained artifact that is hashed. Without those it is not a verification.
alter table pipeline.source_retrievals
  add constraint source_retrievals_manual_verification_shape check (
    acquisition_mode is distinct from 'manual_verified'
    or (
      request_method = 'manual_read'
      and verification_evidence is not null and btrim(verification_evidence) <> ''
      and response_body is not null
      and response_hash is not null
      and completed_at is not null
    )
  );

-- A production retrieval has always required a recorded permission basis. A
-- manual verification has one: the retained first-party artifact and the
-- verifier's statement, both recorded on the row itself. It carries no
-- permission grant because no party granted anything; the basis is that a
-- person read a published price. Every other production retrieval still needs
-- its grant, exactly as before.
alter table pipeline.source_retrievals
  drop constraint source_retrievals_production_requires_grant,
  add constraint source_retrievals_production_requires_grant
    check (
      retrieval_purpose = 'research'
      or permission_grant_id is not null
      -- `is not distinct from` rather than `=`: a null acquisition_mode would make
      -- the comparison null, and a CHECK that evaluates to null passes. That would
      -- have let every ordinary production retrieval through without a grant.
      or acquisition_mode is not distinct from 'manual_verified'
    );

comment on column pipeline.source_retrievals.permission_grant_id is
  'The permission basis this retrieval was made under. Required for an automated production retrieval; a manually verified one records its basis as a retained artifact and a verifier statement instead.';

create or replace function pipeline.check_retrieval_permission()
returns trigger
language plpgsql
as $$
declare
  g record;
  iface record;
begin
  if new.permission_grant_id is not null then
    select source_interface_id, effective_from, effective_to, covers_collection, covers_index_use into g
      from reference.permission_grants where id = new.permission_grant_id;
    if g.source_interface_id <> new.source_interface_id then
      raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
    if new.requested_at < g.effective_from or (g.effective_to is not null and new.requested_at >= g.effective_to) then
      raise exception 'permission grant % was not in force at %', new.permission_grant_id, new.requested_at
        using errcode = 'check_violation';
    end if;
    if new.retrieval_purpose <> 'research' and not (g.covers_collection and g.covers_index_use) then
      raise exception 'permission grant % does not cover both collection and index use', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.retrieval_purpose in ('production', 'validation') then
    -- A manually verified reading of a first-party published page is a fact a
    -- person checked, not an automated collection. The interface's production
    -- state is untouched and is not consulted; an automated retrieval from the
    -- same interface still falls to the branch below and is still refused.
    if new.acquisition_mode is distinct from 'manual_verified' then
      select production_access_state, terms_review_state, data_use_terms_state into iface
        from reference.source_interfaces where id = new.source_interface_id;
      if iface.production_access_state <> 'production_approved' then
        raise exception '% retrieval from a source interface that is % (terms %, data use %)',
          new.retrieval_purpose, iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_retrieval_permission() is
  'Refuses a production or validation retrieval from an interface that is not production_approved, unless the retrieval declares manual_verified acquisition, which is a person reading a first-party published page and is never automated collection permission.';

do $$
declare n integer;
begin
  -- Nothing is granted by this migration.
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 1 then raise exception 'the set of production-approved interfaces changed; expected only the licensed compute source, found %', n; end if;
  select count(*) into n from pipeline.source_retrievals where acquisition_mode is not null;
  if n <> 0 then raise exception 'a retrieval was seeded with an acquisition mode'; end if;
end
$$;
