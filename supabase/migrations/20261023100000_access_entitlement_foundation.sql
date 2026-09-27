-- Paid access, phase 1: the durable entitlement model.
--
-- A third internal schema, `identity`, and two tables in it: an Urdais account,
-- and the single premium entitlement an account may hold. Nothing else. This is
-- the whole persistent surface of paid access.
--
-- ## Why a new schema
--
-- `reference` is Urdais-owned reference data and `pipeline` is observation data;
-- an account is neither, and it is the one kind of row in this database that
-- describes a person rather than a market. Keeping it in its own schema means a
-- future least-privilege role for the read path can be granted `reference` and
-- `pipeline` without ever being able to see who subscribes, which is not
-- possible if accounts live beside the indices.
--
-- ## Why the identity columns look like this
--
-- Urdais has no authentication system. There is no Supabase Auth client in the
-- application, no session, no middleware, and no reference to `auth.users`
-- anywhere in the preceding 107 migrations. So this migration deliberately does
-- *not* foreign-key to `auth.users` and does not assume Supabase Auth will be
-- the answer: an account names its issuer (`auth_provider`) and that issuer's
-- own identifier for the person (`auth_subject`), unique together. Supabase Auth
-- becomes `('supabase', '<uuid>')`; anything else fits the same two columns. The
-- alternative — keying on `auth.users(id)` now — would decide the provider
-- question inside an append-only migration, before anyone has made that
-- decision.
--
-- No row will exist in either table until an authentication phase lands. That is
-- expected, and the schema is correct in the meantime: an empty `accounts` is
-- exactly "nobody has signed in", and an empty `premium_entitlements` is exactly
-- "nobody subscribes" — which is the true state of the product today.
--
-- ## One entitlement
--
-- `premium_entitlements` is keyed by the account, not by (account, product).
-- That is the model, not an optimisation: Urdais sells one subscription that
-- unlocks every premium product. A second tier, a per-product purchase or a
-- seat would each require a new primary key here, so none of them can be
-- introduced by accident — they require a migration that says what it is doing.
--
-- ## Security
--
-- The existing model, unchanged: internal schema, no PostREST exposure, RLS on
-- every table with no policies, nothing granted to `anon` or `authenticated` at
-- any level. `service_role` is the only role that reaches these tables, so a
-- browser holding the anon key can neither read an entitlement nor forge one.
-- No existing policy or grant is modified by this migration.

create schema if not exists identity;

comment on schema identity is
  'Urdais accounts and the single premium entitlement each may hold. Describes people, not markets, and is kept out of reference/pipeline so a read-path role can be granted those without ever seeing subscriber data. Internal; not exposed through the API.';

-- Nothing for the public roles, at schema level and for every future object.
-- Set before the tables are created so the default privileges apply to them.
revoke all on schema identity from public;
revoke all on schema identity from anon, authenticated;

grant usage on schema identity to service_role;

alter default privileges in schema identity revoke all on tables from anon, authenticated;
alter default privileges in schema identity revoke all on sequences from anon, authenticated;
alter default privileges in schema identity revoke all on functions from anon, authenticated;

alter default privileges in schema identity grant select, insert, update, delete on tables to service_role;
alter default privileges in schema identity grant usage on sequences to service_role;
alter default privileges in schema identity grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table identity.accounts (
  id            uuid primary key default gen_random_uuid(),

  -- Which system authenticated this person. Free-form lowercase rather than a
  -- checked enumeration because the provider has not been chosen; the value is
  -- normalised so `('supabase', x)` and `('Supabase', x)` cannot become two
  -- accounts for one person.
  auth_provider text not null
                  constraint accounts_auth_provider_normalized
                  check (auth_provider = lower(btrim(auth_provider)) and auth_provider <> ''),

  -- That provider's own stable identifier for the person. Opaque here: never
  -- parsed, never assumed to be a uuid.
  auth_subject  text not null
                  constraint accounts_auth_subject_nonempty check (btrim(auth_subject) <> ''),

  -- A convenience for support and operator lookup, not an identity. Deliberately
  -- not unique: two providers can legitimately assert the same address, and a
  -- unique index here would turn that into a failed sign-in.
  email         text
                  constraint accounts_email_normalized
                  check (email is null or (email = lower(btrim(email)) and email like '%_@_%.__%')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint accounts_provider_subject_unique unique (auth_provider, auth_subject)
);

comment on table identity.accounts is
  'One Urdais account. Provider-agnostic by design: (auth_provider, auth_subject) names the issuer and its own subject id, so no authentication choice is baked in. Empty until an authentication phase lands.';

create index accounts_email_idx on identity.accounts (email) where email is not null;

-- ---------------------------------------------------------------------------
-- The premium entitlement
-- ---------------------------------------------------------------------------

create table identity.premium_entitlements (
  -- The account, and the primary key. One row per account is one entitlement
  -- per account; "does this person subscribe" can never become a multi-row
  -- question decided by an ordering.
  account_id         uuid primary key
                       references identity.accounts (id) on delete cascade,

  -- Only `active` grants access. More states will exist once billing does — a
  -- Stripe subscription can be past due, or cancelled at period end, and each is
  -- operationally distinct even when both deny — so the application maps status
  -- to a decision in one place rather than comparing against a literal.
  status             text not null
                       constraint premium_entitlements_status_allowed
                       check (status in ('active', 'inactive')),

  -- How the entitlement came to exist, so an operator can always answer why
  -- this person has access. `stripe` is reserved for the billing phase and is
  -- unused today; it is listed now so the first provisioned row needs no
  -- migration.
  source             text not null
                       constraint premium_entitlements_source_allowed
                       check (source in ('manual', 'stripe')),

  -- The provisioning system's own identifier, e.g. a Stripe subscription id.
  -- Opaque; the application never parses it.
  external_reference text
                       constraint premium_entitlements_external_reference_nonempty
                       check (external_reference is null or btrim(external_reference) <> ''),

  granted_at         timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- An active entitlement was granted at a knowable moment, and has not been
  -- revoked. Both halves are ways an "active" row can be nonsense.
  constraint premium_entitlements_active_has_grant
    check (status <> 'active' or granted_at is not null),
  constraint premium_entitlements_active_not_revoked
    check (status <> 'active' or revoked_at is null),
  constraint premium_entitlements_revocation_ordered
    check (revoked_at is null or granted_at is null or revoked_at >= granted_at),

  -- An entitlement that claims a billing origin must name the billing object it
  -- came from. Without this, a manual grant mislabelled `stripe` is
  -- indistinguishable from a real subscription and unreconcilable later.
  constraint premium_entitlements_stripe_has_reference
    check (source <> 'stripe' or external_reference is not null)
);

comment on table identity.premium_entitlements is
  'The single Urdais premium entitlement, one row per account. Keyed by account rather than by (account, product): one subscription unlocks every premium product, and a tier or per-product purchase would require a deliberate migration to introduce.';

comment on column identity.premium_entitlements.status is
  'Only ''active'' grants access. Never compared against directly by the application; see src/lib/access/entitlement.ts.';

-- Finding the live subscribers, which is the one aggregate query operations will
-- want and the read path never runs.
create index premium_entitlements_active_idx on identity.premium_entitlements (granted_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Housekeeping and security
-- ---------------------------------------------------------------------------

create or replace function identity.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger accounts_touch_updated_at
  before update on identity.accounts
  for each row execute function identity.touch_updated_at();

create trigger premium_entitlements_touch_updated_at
  before update on identity.premium_entitlements
  for each row execute function identity.touch_updated_at();

-- Default privileges cover objects created after they are set, which is the case
-- above. These are stated explicitly as well because a silent privilege miss
-- here fails as an unreadable entitlement — which reads as "not a subscriber",
-- the one failure mode that must never be reachable by accident.
grant select, insert, update, delete on identity.accounts to service_role;
grant select, insert, update, delete on identity.premium_entitlements to service_role;

alter table identity.accounts             enable row level security;
alter table identity.premium_entitlements enable row level security;

do $$
declare n integer;
begin
  -- RLS on, and no policy on either table: `service_role` bypasses RLS by
  -- platform design and is the only role with privileges here.
  select count(*) into n from pg_tables
   where schemaname = 'identity' and tablename in ('accounts', 'premium_entitlements') and rowsecurity;
  if n <> 2 then raise exception 'identity tables do not both have row level security enabled (found %)', n; end if;

  select count(*) into n from pg_policies where schemaname = 'identity';
  if n <> 0 then raise exception 'identity schema has % policies; the model is RLS-on with no policies', n; end if;

  -- The public roles must reach nothing, at schema level or table level.
  if has_schema_privilege('anon', 'identity', 'usage')
     or has_schema_privilege('authenticated', 'identity', 'usage') then
    raise exception 'anon or authenticated has usage on the identity schema';
  end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'the identity tables grant % privileges to a public role', n; end if;

  -- One entitlement per account, enforced by the primary key rather than by
  -- application discipline.
  select count(*) into n from information_schema.table_constraints
   where table_schema = 'identity' and table_name = 'premium_entitlements' and constraint_type = 'PRIMARY KEY';
  if n <> 1 then raise exception 'premium_entitlements has no single primary key'; end if;

  select count(*) into n from information_schema.key_column_usage
   where table_schema = 'identity' and table_name = 'premium_entitlements'
     and constraint_name = 'premium_entitlements_pkey';
  if n <> 1 then raise exception 'the premium entitlement key is not the account alone (% columns)', n; end if;

  -- No product column anywhere in the entitlement: the entitlement is not
  -- per-product, and a column that looked like one would invite a second model.
  select count(*) into n from information_schema.columns
   where table_schema = 'identity' and table_name = 'premium_entitlements'
     and column_name in ('product', 'product_id', 'tier', 'plan');
  if n <> 0 then raise exception 'the premium entitlement carries a product or tier column'; end if;

  -- This migration must not have touched the data platform.
  if to_regclass('reference.methodology_versions') is null or to_regclass('pipeline.normalized_observations') is null then
    raise exception 'a data platform table vanished; this migration should not have touched it';
  end if;
end $$;
