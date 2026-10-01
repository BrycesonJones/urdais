-- Phase 7D: account deletion retains billing history, detached.
--
-- Before this migration, deleting identity.accounts cascaded away the account's
-- Stripe Customer mapping, its whole subscription history and its entitlement.
-- Only the account-free event ledger survived. That made the cascade the
-- retention policy, by accident.
--
-- After it:
--
--   premium_entitlements   still CASCADE. An authorization object, not a record.
--   billing_customers      SET NULL + detached_at. The Stripe Customer reference
--                          survives for invoices, refunds, disputes, reconciliation.
--   billing_subscriptions  SET NULL + detached_at. Ids, statuses and timestamps
--                          survive; no personal data is stored in either table.
--   billing_events         unchanged; append-only and account-free already.
--
-- A detached row can never be re-attached: `detached_at` set implies
-- `account_id` null, by constraint. So a recreated account with the same email,
-- or a late webhook naming the deleted account, can never inherit the history.
--
-- identity.account_deletions is the durable, resumable deletion workflow record.
-- It holds the account id and auth subject only while a deletion is in flight
-- and nulls both on completion.
--
-- No retention period is chosen here. `detached_at` is what a later, documented
-- retention policy would select on.

-- ------------------------------------------------------------ billing_customers

alter table identity.billing_subscriptions drop constraint billing_subscriptions_customer_fk;

alter table identity.billing_customers drop constraint billing_customers_account_id_fkey;
alter table identity.billing_customers drop constraint billing_customers_pkey;
alter table identity.billing_customers alter column account_id drop not null;
alter table identity.billing_customers add column detached_at timestamptz;

-- The Stripe id is the stable identity of a retained row; the account is not.
alter table identity.billing_customers add constraint billing_customers_pkey primary key (stripe_customer_id);

-- Still one Customer per live account.
create unique index billing_customers_account_unique on identity.billing_customers (account_id)
  where account_id is not null;

alter table identity.billing_customers add constraint billing_customers_account_id_fkey
  foreign key (account_id) references identity.accounts (id) on delete set null;

alter table identity.billing_customers add constraint billing_customers_detached_consistent
  check ((account_id is null) = (detached_at is not null));

alter table identity.billing_subscriptions add constraint billing_subscriptions_customer_fk
  foreign key (stripe_customer_id, livemode)
  references identity.billing_customers (stripe_customer_id, livemode);

comment on column identity.billing_customers.detached_at is
  'Set when the owning account was deleted (Phase 7D). A detached row is retained billing history: it names a Stripe Customer and no Urdais account, and can never be re-attached.';

-- -------------------------------------------------------- billing_subscriptions

alter table identity.billing_subscriptions drop constraint billing_subscriptions_account_id_fkey;
alter table identity.billing_subscriptions alter column account_id drop not null;
alter table identity.billing_subscriptions add column detached_at timestamptz;

alter table identity.billing_subscriptions add constraint billing_subscriptions_account_id_fkey
  foreign key (account_id) references identity.accounts (id) on delete set null;

alter table identity.billing_subscriptions add constraint billing_subscriptions_detached_consistent
  check ((account_id is null) = (detached_at is not null));

comment on column identity.billing_subscriptions.detached_at is
  'Set when the owning account was deleted, or when a late Stripe event arrives for a subscription whose account no longer exists. Retained history; never re-attached.';

-- ------------------------------------------- stamping detachment on SET NULL

-- The FK's SET NULL is an UPDATE on the referencing row, so a BEFORE UPDATE
-- trigger can stamp `detached_at` in the same statement and keep the
-- consistency check satisfied.
create or replace function identity.stamp_billing_detachment()
returns trigger
language plpgsql
as $$
begin
  if old.account_id is not null and new.account_id is null and new.detached_at is null then
    new.detached_at := now();
  end if;
  return new;
end;
$$;

create trigger billing_customers_stamp_detachment
  before update on identity.billing_customers
  for each row execute function identity.stamp_billing_detachment();

create trigger billing_subscriptions_stamp_detachment
  before update on identity.billing_subscriptions
  for each row execute function identity.stamp_billing_detachment();

-- ------------------------------------------------------------ account_deletions

create table identity.account_deletions (
  id                          uuid primary key default gen_random_uuid(),
  -- No FK: the record outlives the account. Nulled at completion.
  account_id                  uuid,
  auth_provider               text not null
                                constraint account_deletions_provider_nonempty check (btrim(auth_provider) <> ''),
  -- The Supabase user id. Nulled at completion.
  auth_subject                text,
  -- The Customer whose subscriptions were terminated. A Stripe id, not personal data.
  stripe_customer_id          text,
  state                       text not null default 'requested'
                                constraint account_deletions_state_allowed
                                check (state in ('requested', 'billing_terminated', 'local_cleanup_complete', 'auth_deleted', 'complete')),
  attempts                    integer not null default 0,
  -- A short machine code only, never a raw provider error, which could carry
  -- personal data.
  last_error                  text
                                constraint account_deletions_last_error_code check (last_error is null or last_error ~ '^[a-z_]{1,64}$'),
  -- Serialises concurrent submissions without holding a database lock across
  -- network calls.
  lease_until                 timestamptz,
  requested_at                timestamptz not null default now(),
  billing_terminated_at       timestamptz,
  local_cleanup_completed_at  timestamptz,
  auth_deleted_at             timestamptz,
  completed_at                timestamptz,
  updated_at                  timestamptz not null default now(),
  constraint account_deletions_identifiers_until_complete check (
    (state = 'complete' and auth_subject is null and account_id is null and completed_at is not null)
    or (state <> 'complete' and auth_subject is not null and btrim(auth_subject) <> '')
  ),
  constraint account_deletions_stage_stamps check (
    (state = 'requested')
    or (state = 'billing_terminated' and billing_terminated_at is not null)
    or (state = 'local_cleanup_complete' and billing_terminated_at is not null and local_cleanup_completed_at is not null)
    or (state = 'auth_deleted' and billing_terminated_at is not null and local_cleanup_completed_at is not null and auth_deleted_at is not null)
    or (state = 'complete' and billing_terminated_at is not null and local_cleanup_completed_at is not null and auth_deleted_at is not null)
  )
);

comment on table identity.account_deletions is
  'Durable, resumable account-deletion workflow (Phase 7D). requested -> billing_terminated -> local_cleanup_complete -> auth_deleted -> complete. Holds the account id and auth subject only while in flight.';

-- One in-flight deletion per identity and per account. A duplicate submission
-- resumes the same record rather than starting a second.
create unique index account_deletions_subject_in_flight on identity.account_deletions (auth_provider, auth_subject)
  where auth_subject is not null;
create unique index account_deletions_account_in_flight on identity.account_deletions (account_id)
  where account_id is not null;

create trigger account_deletions_touch_updated_at
  before update on identity.account_deletions
  for each row execute function identity.touch_updated_at();

-- The workflow advances and never deletes its own record.
grant select, insert, update on identity.account_deletions to service_role;
revoke delete on identity.account_deletions from service_role;

alter table identity.account_deletions enable row level security;

-- ------------------------------------------------------------------ posture

do $$
declare n integer;
begin
  select count(*) into n from pg_tables
   where schemaname = 'identity'
     and tablename in ('billing_customers', 'billing_subscriptions', 'billing_events', 'account_deletions')
     and rowsecurity;
  if n <> 4 then raise exception 'an identity table lacks row level security (found %)', n; end if;

  select count(*) into n from pg_policies where schemaname = 'identity';
  if n <> 0 then raise exception 'identity has % policies; the model is RLS-on with no policies', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'the identity tables grant % privileges to a public role', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'billing_events'
     and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE');
  if n <> 0 then raise exception 'service_role regained update/delete on the event ledger'; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'account_deletions'
     and grantee = 'service_role' and privilege_type = 'DELETE';
  if n <> 0 then raise exception 'service_role can delete deletion records'; end if;

  -- The retention model itself: entitlements cascade, billing detaches.
  select count(*) into n from pg_constraint
   where connamespace = 'identity'::regnamespace and contype = 'f' and confdeltype = 'n'
     and conname in ('billing_customers_account_id_fkey', 'billing_subscriptions_account_id_fkey');
  if n <> 2 then raise exception 'billing rows do not detach on account deletion (found %)', n; end if;

  select count(*) into n from pg_constraint
   where connamespace = 'identity'::regnamespace and contype = 'f' and confdeltype = 'c'
     and conname = 'premium_entitlements_account_id_fkey';
  if n <> 1 then raise exception 'entitlements no longer cascade with their account'; end if;
end $$;
