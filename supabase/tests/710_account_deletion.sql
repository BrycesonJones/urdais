-- Phase 7D: what deleting an account removes, what it retains, and what can
-- never be re-attached.
--
-- The retention model is: the account and its entitlement go; Stripe Customer
-- and subscription history stay, detached; the event ledger is untouched. The
-- deletion workflow record is durable, unique per identity in flight, and holds
-- identifiers only until it completes.
begin;

do $$
declare
  doomed uuid; survivor uuid; reborn uuid; deletion uuid; n integer;
begin
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'deletion-subject-1', 'doomed@example.invalid') returning id into doomed;
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'deletion-subject-2', 'survivor@example.invalid') returning id into survivor;

  insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values (doomed, 'cus_doomed', false);
  insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values (survivor, 'cus_survivor', false);
  insert into identity.billing_subscriptions (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
  values ('sub_doomed_old', doomed, 'cus_doomed', 'canceled', 'price_x', false),
         ('sub_doomed_new', doomed, 'cus_doomed', 'canceled', 'price_x', false),
         ('sub_survivor', survivor, 'cus_survivor', 'active', 'price_x', false);
  insert into identity.premium_entitlements (account_id, status, source, external_reference, granted_at)
  values (survivor, 'active', 'stripe', 'sub_survivor', now());
  insert into identity.premium_entitlements (account_id, status, source, external_reference, granted_at, revoked_at)
  values (doomed, 'inactive', 'stripe', 'sub_doomed_new', now() - interval '1 day', now());
  insert into identity.billing_events (stripe_event_id, event_type, livemode, stripe_created_at, stripe_subscription_id)
  values ('evt_doomed', 'customer.subscription.deleted', false, now(), 'sub_doomed_new');

  -- ------------------------------------------------------------ the deletion
  delete from identity.accounts where id = doomed;

  -- The entitlement goes with the account.
  select count(*) into n from identity.premium_entitlements where account_id = doomed;
  if n <> 0 then raise exception 'an entitlement survived its account'; end if;

  -- Billing history stays, detached and stamped.
  select count(*) into n from identity.billing_customers
   where stripe_customer_id = 'cus_doomed' and account_id is null and detached_at is not null;
  if n <> 1 then raise exception 'the Stripe customer reference was not retained detached'; end if;

  select count(*) into n from identity.billing_subscriptions
   where stripe_customer_id = 'cus_doomed' and account_id is null and detached_at is not null;
  if n <> 2 then raise exception 'subscription history was not retained detached (found %)', n; end if;

  -- The ledger is untouched.
  select count(*) into n from identity.billing_events where stripe_event_id = 'evt_doomed';
  if n <> 1 then raise exception 'the event ledger lost an event'; end if;

  -- Nobody else was touched.
  select count(*) into n from identity.billing_subscriptions where account_id = survivor and detached_at is null;
  if n <> 1 then raise exception 'another account''s subscription was affected'; end if;
  select count(*) into n from identity.premium_entitlements where account_id = survivor and status = 'active';
  if n <> 1 then raise exception 'another account''s entitlement was affected'; end if;

  -- ----------------------------------------------------- never re-attached
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'deletion-subject-1-new', 'doomed@example.invalid') returning id into reborn;

  begin
    update identity.billing_customers set account_id = reborn where stripe_customer_id = 'cus_doomed';
    raise exception 'a detached Stripe customer was re-attached to a new account';
  exception when check_violation then null;
  end;

  begin
    update identity.billing_subscriptions set account_id = reborn where stripe_subscription_id = 'sub_doomed_new';
    raise exception 'a detached subscription was re-attached to a new account';
  exception when check_violation then null;
  end;

  -- A detached row must say so; an attached one must not.
  begin
    insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values (null, 'cus_unstamped', false);
    raise exception 'a customer with no account and no detached_at was accepted';
  exception when check_violation then null;
  end;

  -- A late webhook can record a subscription detached, against the retained customer.
  insert into identity.billing_subscriptions (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode, detached_at)
  values ('sub_doomed_late', null, 'cus_doomed', 'canceled', 'price_x', false, now());

  -- The new account gets a Customer of its own; the old one is not its.
  insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values (reborn, 'cus_reborn', false);
  begin
    insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values (reborn, 'cus_reborn_second', false);
    raise exception 'a live account gained a second Stripe customer';
  exception when unique_violation then null;
  end;

  -- ----------------------------------------------------- the workflow record
  insert into identity.account_deletions (account_id, auth_provider, auth_subject)
  values (survivor, 'supabase', 'deletion-subject-2') returning id into deletion;

  begin
    insert into identity.account_deletions (account_id, auth_provider, auth_subject)
    values (survivor, 'supabase', 'deletion-subject-2');
    raise exception 'a second in-flight deletion was created for one identity';
  exception when unique_violation then null;
  end;

  -- A stage cannot be claimed without its timestamp.
  begin
    update identity.account_deletions set state = 'local_cleanup_complete' where id = deletion;
    raise exception 'a deletion skipped billing termination';
  exception when check_violation then null;
  end;

  -- Completion must drop the identifiers.
  begin
    update identity.account_deletions
       set state = 'complete', billing_terminated_at = now(), local_cleanup_completed_at = now(),
           auth_deleted_at = now(), completed_at = now()
     where id = deletion;
    raise exception 'a completed deletion kept the auth subject';
  exception when check_violation then null;
  end;

  update identity.account_deletions
     set state = 'complete', billing_terminated_at = now(), local_cleanup_completed_at = now(),
         auth_deleted_at = now(), completed_at = now(), auth_subject = null, account_id = null
   where id = deletion;

  -- Errors are codes, never raw provider messages.
  begin
    insert into identity.account_deletions (auth_provider, auth_subject, last_error)
    values ('supabase', 'deletion-subject-3', 'User reader@example.invalid not found');
    raise exception 'a free-text error was stored on a deletion record';
  exception when check_violation then null;
  end;

  -- ---------------------------------------------------------------- posture
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'account_deletions' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'the deletion record is reachable by a public role'; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'account_deletions' and grantee = 'service_role' and privilege_type = 'DELETE';
  if n <> 0 then raise exception 'service_role can delete deletion records'; end if;

  select count(*) into n from pg_tables where schemaname = 'identity' and tablename = 'account_deletions' and rowsecurity;
  if n <> 1 then raise exception 'account_deletions lacks row level security'; end if;
end $$;

rollback;
