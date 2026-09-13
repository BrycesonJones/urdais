-- Phase 3: Urdais Supabase foundation.
-- Two internal schemas, neither exposed through PostgREST.
--
--   reference : Urdais-owned, slowly changing, versioned reference data
--               (methodology lineage, instruments, source registry, market
--               entities, canonical regions, region mappings, vocabularies).
--   pipeline  : data-bearing tables written by later phases (retrievals, raw
--               offers, normalized observations, eligibility assessments).
--
-- Security model: Option A (internal schemas) plus RLS on every table with no
-- policies. `anon` and `authenticated` receive no privileges at any level.
-- `service_role` bypasses RLS by platform design and is the only application
-- role that can reach these schemas. The future public API serves published
-- datasets, never these tables.

create schema if not exists reference;
create schema if not exists pipeline;

comment on schema reference is
  'Urdais-owned reference data: methodology and instrument lineage, source registry, market entities, canonical regions, region mappings, vocabularies. Internal; not exposed through the API.';
comment on schema pipeline is
  'Observation pipeline: source retrievals, immutable raw offers, versioned normalized observations, eligibility assessments. Internal; not exposed through the API.';

-- Nothing for the public roles, at schema level and for every future object.
revoke all on schema reference from public;
revoke all on schema pipeline from public;
revoke all on schema reference from anon, authenticated;
revoke all on schema pipeline from anon, authenticated;

grant usage on schema reference to service_role;
grant usage on schema pipeline to service_role;

alter default privileges in schema reference revoke all on tables from anon, authenticated;
alter default privileges in schema pipeline revoke all on tables from anon, authenticated;
alter default privileges in schema reference revoke all on sequences from anon, authenticated;
alter default privileges in schema pipeline revoke all on sequences from anon, authenticated;
alter default privileges in schema reference revoke all on functions from anon, authenticated;
alter default privileges in schema pipeline revoke all on functions from anon, authenticated;

alter default privileges in schema reference grant select, insert, update, delete on tables to service_role;
alter default privileges in schema pipeline grant select, insert, update, delete on tables to service_role;
alter default privileges in schema reference grant usage, select on sequences to service_role;
alter default privileges in schema pipeline grant usage, select on sequences to service_role;

-- Shared helper: reject any UPDATE or DELETE. Attached to append-only tables.
-- It fires for every role, superusers included: raw evidence is never rewritten,
-- and a correction is a new interpretation rather than an edit.
create or replace function pipeline.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'table %.% is append-only: % is not permitted (corrections are new rows, never edits)',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function pipeline.forbid_mutation() is
  'Trigger function that rejects UPDATE and DELETE on append-only evidence tables for every role.';

-- Shared helper: allow an UPDATE only when it sets the supersession columns on a
-- row that has not yet been superseded, and changes nothing else. Attached to
-- interpretation tables (normalized observations, eligibility assessments).
create or replace function pipeline.allow_only_supersession()
returns trigger
language plpgsql
as $$
declare
  old_json jsonb;
  new_json jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'table %.% rows are never deleted: supersede them instead',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  if old.superseded_by_id is not null then
    raise exception 'row % in %.% is already superseded and is immutable',
      old.id, tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  if new.superseded_by_id is null or new.superseded_at is null or new.supersession_reason is null then
    raise exception 'the only permitted update on %.% sets superseded_by_id, superseded_at and supersession_reason together',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  if new.superseded_by_id = old.id then
    raise exception 'a row cannot supersede itself' using errcode = 'restrict_violation';
  end if;

  old_json := to_jsonb(old) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason';
  new_json := to_jsonb(new) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason';
  if old_json <> new_json then
    raise exception 'update on %.% changed columns other than the supersession columns',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function pipeline.allow_only_supersession() is
  'Trigger function for interpretation tables: permits exactly one kind of UPDATE, marking an un-superseded row as superseded; rejects DELETE and every other change.';
