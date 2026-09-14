-- Launch enablement: a validation retrieval purpose, and a guard that a
-- production value can only be built from production retrievals.
--
-- First authenticated validation performs live, credentialed retrievals to
-- confirm the documented interface before any production run. Those retrievals
-- are evidence and must be persisted, but they must never become a published
-- value. They therefore get their own purpose, `validation`, which requires the
-- same permission basis and production approval as `production`, and a trigger
-- refuses to let any non-production retrieval feed a production or correction
-- run's seller-level observation. Simulation runs may use research data and
-- can never be published (already enforced).

alter table pipeline.source_retrievals
  drop constraint source_retrievals_purpose_allowed,
  add constraint source_retrievals_purpose_allowed
    check (retrieval_purpose in ('research', 'validation', 'production')),
  drop constraint source_retrievals_production_requires_grant,
  add constraint source_retrievals_production_requires_grant
    check (retrieval_purpose = 'research' or permission_grant_id is not null);

comment on column pipeline.source_retrievals.retrieval_purpose is
  'research: a study or fixture retrieval that never enters a published value. validation: a live credentialed retrieval made to confirm the interface; evidence only, never an input to a production value. production: a retrieval that may enter a published value. validation and production require a permission grant and a production-approved interface, enforced by trigger.';

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
    select production_access_state, terms_review_state, data_use_terms_state into iface
      from reference.source_interfaces where id = new.source_interface_id;
    if iface.production_access_state <> 'production_approved' then
      raise exception '% retrieval from a source interface that is % (terms %, data use %)',
        new.retrieval_purpose, iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- A production or correction run may only reduce production retrievals.
create or replace function pipeline.check_candidate_production_lineage()
returns trigger
language plpgsql
as $$
declare
  kind text;
  purpose text;
begin
  select r.run_kind into kind
    from pipeline.seller_observations s join pipeline.calculation_runs r on r.id = s.run_id
   where s.id = new.seller_observation_id;
  select sr.retrieval_purpose into purpose
    from pipeline.normalized_observations o
    join pipeline.raw_offers ro on ro.id = o.raw_offer_id
    join pipeline.source_retrievals sr on sr.id = ro.retrieval_id
   where o.id = new.normalized_observation_id;
  if kind in ('production', 'correction') and purpose <> 'production' then
    raise exception 'a % run cannot use a % retrieval as a seller-level candidate', kind, purpose
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.check_candidate_production_lineage() is
  'Trigger: a production or correction run''s seller-level candidates must descend from production retrievals. Validation and research retrievals are evidence, never inputs to a published value.';

create trigger seller_observation_candidates_lineage_check
  before insert on pipeline.seller_observation_candidates
  for each row execute function pipeline.check_candidate_production_lineage();

do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
  select count(*) into n from pipeline.source_retrievals where retrieval_purpose <> 'research';
  if n <> 0 then raise exception 'a non-research retrieval exists at bootstrap'; end if;
end
$$;
