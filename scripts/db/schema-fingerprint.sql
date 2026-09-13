-- Structural fingerprint of the reference and pipeline schemas.
-- Run the identical text against the local database and the hosted project and
-- compare the digests: equal digests mean the hosted schema is exactly what the
-- repository migrations produce. Owners, OIDs and row data are excluded.
with cols as (
  select format('%s.%s.%s|%s|%s|%s', table_schema, table_name, column_name, data_type, is_nullable, coalesce(column_default, '')) as r
  from information_schema.columns where table_schema in ('reference', 'pipeline')
), cons as (
  select format('%s|%s|%s|%s', conrelid::regclass::text, conname, pg_get_constraintdef(c.oid), condeferrable) as r
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('reference', 'pipeline')
), idx as (
  select format('%s.%s|%s|%s', schemaname, tablename, indexname, indexdef) as r
  from pg_indexes where schemaname in ('reference', 'pipeline')
), trg as (
  select format('%s|%s|%s', tgrelid::regclass::text, tgname, pg_get_triggerdef(t.oid)) as r
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('reference', 'pipeline') and not t.tgisinternal
), rls as (
  select format('%s.%s|rls=%s', n.nspname, c.relname, c.relrowsecurity) as r
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('reference', 'pipeline') and c.relkind = 'r'
), fns as (
  select format('%s.%s|%s', n.nspname, p.proname, md5(pg_get_functiondef(p.oid))) as r
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('reference', 'pipeline')
), pol as (
  select format('%s.%s|%s', schemaname, tablename, policyname) as r from pg_policies where schemaname in ('reference', 'pipeline')
), priv as (
  select format('%s.%s|%s|%s', table_schema, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)) as r
  from information_schema.role_table_grants
  where table_schema in ('reference', 'pipeline') and grantee in ('anon', 'authenticated', 'service_role')
  group by table_schema, table_name, grantee
)
select 'columns' as component, count(*) as n, md5(string_agg(r, E'\n' order by r)) as digest from cols
union all select 'constraints', count(*), md5(string_agg(r, E'\n' order by r)) from cons
union all select 'indexes', count(*), md5(string_agg(r, E'\n' order by r)) from idx
union all select 'triggers', count(*), md5(string_agg(r, E'\n' order by r)) from trg
union all select 'rls', count(*), md5(string_agg(r, E'\n' order by r)) from rls
union all select 'functions', count(*), md5(string_agg(r, E'\n' order by r)) from fns
union all select 'policies', count(*), coalesce(md5(string_agg(r, E'\n' order by r)), 'none') from pol
union all select 'privileges', count(*), md5(string_agg(r, E'\n' order by r)) from priv
order by 1;
