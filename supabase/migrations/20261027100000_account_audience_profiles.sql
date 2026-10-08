-- Phase 8: optional audience classification, attached to an Urdais account.
-- Product analytics only: not identity, authorization, entitlement, or billing.

create table identity.account_audience_profiles (
  account_id   uuid primary key references identity.accounts (id) on delete cascade,
  primary_role text not null
                 constraint account_audience_primary_role_allowed check (primary_role in (
                   'independent_researcher_analyst',
                   'quantitative_researcher_trader',
                   'frontier_ai_lab',
                   'ai_systems_software_company',
                   'academic_university',
                   'investor_asset_manager',
                   'data_center_compute_infrastructure_operator',
                   'energy_power_market_professional',
                   'semiconductor_hardware_company',
                   'consultant_advisory_firm',
                   'other'
                 )),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table identity.account_audience_profiles is
  'Optional product-analytics classification for an Urdais account. Not identity, entitlement or Stripe metadata; deleted with the account.';

create trigger account_audience_profiles_touch_updated_at
  before update on identity.account_audience_profiles
  for each row execute function identity.touch_updated_at();

grant select, insert, update, delete on identity.account_audience_profiles to service_role;
alter table identity.account_audience_profiles enable row level security;

do $$
declare n integer;
begin
  if not exists (
    select 1 from pg_tables
     where schemaname = 'identity' and tablename = 'account_audience_profiles' and rowsecurity
  ) then raise exception 'account_audience_profiles must have RLS enabled'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'identity' and tablename = 'account_audience_profiles';
  if n <> 0 then raise exception 'account_audience_profiles must have no browser policies'; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'account_audience_profiles'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'account_audience_profiles grants % privileges to a public role', n; end if;
end $$;

