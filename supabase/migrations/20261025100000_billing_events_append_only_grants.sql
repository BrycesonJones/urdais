-- Paid access, phase 5 correction: make the event ledger append-only in privilege,
-- not only by trigger.
--
-- ## What was wrong
--
-- `20261024100000` granted `service_role` only `select, insert` on
-- `identity.billing_events`, intending an append-only ledger. That grant added
-- nothing. Phase 1 set **default privileges** on the `identity` schema:
--
--   alter default privileges in schema identity
--     grant select, insert, update, delete on tables to service_role;
--
-- so every table created in the schema arrives already updatable, and a narrower
-- explicit grant does not take the rest away. The ledger was therefore writable by
-- the only role that reaches it.
--
-- The append-only trigger did still refuse `update` and `delete` at runtime, so
-- nothing could actually rewrite a row. But a privilege that exists is a privilege
-- the next thing written against this table can use, and an audit ledger that can
-- be rewritten records nothing. "Append-only" should be true of the grant as well.
--
-- Caught by `supabase/tests/700_stripe_billing.sql`, which asserted the absence and
-- failed in CI on the first run.
--
-- ## Why this is a separate migration
--
-- `20261024100000` was already applied to UrdaisDev by the time the test ran.
-- Editing it in place would have left Dev's schema differing from the file's
-- contents with the ledger showing the version as applied -- silent content drift,
-- which is undetectable by a version comparison and is the failure mode this
-- repository has been bitten by before. An append-only correction converges every
-- environment through the normal path instead, and hand-applied DDL is avoided
-- entirely.

revoke update, delete on identity.billing_events from service_role;

do $$
declare n integer;
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'billing_events'
     and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE');
  if n <> 0 then raise exception 'service_role retains % update/delete grants on the event ledger', n; end if;

  -- The grants the application genuinely needs must survive. Revoking too much here
  -- would stop the webhook recording anything, which reads as "not a subscriber".
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'billing_events'
     and grantee = 'service_role' and privilege_type in ('SELECT', 'INSERT');
  if n <> 2 then raise exception 'the event ledger is no longer readable and appendable by service_role (found %)', n; end if;

  -- And the other two billing tables must keep full access; they are mutable by design.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'billing_subscriptions'
     and grantee = 'service_role' and privilege_type = 'UPDATE';
  if n <> 1 then raise exception 'billing_subscriptions lost its update grant'; end if;
end $$;
