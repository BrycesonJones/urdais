-- Supabase platform roles for a plain PostgreSQL instance.
--
-- The hosted project and `supabase start` provide these roles. The local and CI
-- harness runs migrations against a vanilla PostgreSQL server, so it creates the
-- same roles first. This file is NOT a migration and is never applied to the
-- hosted project.
--
-- Idempotent: safe to run more than once.

set client_min_messages = warning;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login;
  end if;
end
$$;

grant anon to authenticator;
grant authenticated to authenticator;
grant service_role to authenticator;

-- Supabase keeps extensions in a dedicated schema that sits on the search_path.
create schema if not exists extensions;

-- Supabase records applied migrations here; the harness mirrors that so the
-- hosted and local migration histories can be compared directly.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
