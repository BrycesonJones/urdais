-- Paid access, phase 5: the billing layer's invariants.
--
-- Every case here is a way of writing billing state that would grant, keep or
-- move access it cannot justify: two Customers for one account, one Customer
-- shared by two accounts, a test subscription attached to a live customer, a
-- status this build has never heard of, a rewritten audit ledger, a duplicate
-- event. The schema has to refuse those, because a webhook handler runs
-- unattended against whatever this table permits.
begin;

do $$
declare
  account_a uuid; account_b uuid; n integer;
begin
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'billing-subject-a', 'billing.a@example.invalid')
  returning id into account_a;

  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'billing-subject-b', 'billing.b@example.invalid')
  returning id into account_b;

  -- ---------------------------------------------------------------- customers
  insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
  values (account_a, 'cus_test_a', false);

  -- One Stripe Customer per account. A second would mean two payment methods and
  -- two invoice histories for one reader, and a subscription they cannot find.
  begin
    insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
    values (account_a, 'cus_test_a_second', false);
    raise exception 'a second Stripe customer was created for one account';
  exception when unique_violation then null;
  end;

  -- And one account per Customer. Sharing a Customer would let one reader's
  -- subscription entitle another.
  begin
    insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
    values (account_b, 'cus_test_a', false);
    raise exception 'one Stripe customer was shared by two accounts';
  exception when unique_violation then null;
  end;

  insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
  values (account_b, 'cus_test_b', false);

  -- An account must exist. A Customer for a deleted account is unreconcilable.
  begin
    insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
    values ('00000000-0000-0000-0000-000000000000', 'cus_test_orphan', false);
    raise exception 'a Stripe customer was created for a nonexistent account';
  exception when foreign_key_violation then null;
  end;

  -- ------------------------------------------------------------ subscriptions
  insert into identity.billing_subscriptions
    (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode, current_period_end)
  values ('sub_test_a', account_a, 'cus_test_a', 'active', 'price_test', false, now() + interval '7 days');

  -- The same Stripe id twice is one subscription, not two. This is what makes a
  -- replayed webhook upsert harmless.
  begin
    insert into identity.billing_subscriptions
      (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
    values ('sub_test_a', account_b, 'cus_test_b', 'active', 'price_test', false);
    raise exception 'one Stripe subscription id created two rows';
  exception when unique_violation then null;
  end;

  -- A status this build does not know must fail loudly rather than be stored and
  -- later compared against by something that guesses.
  begin
    insert into identity.billing_subscriptions
      (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
    values ('sub_test_bogus', account_a, 'cus_test_a', 'gruntled', 'price_test', false);
    raise exception 'an unknown subscription status was accepted';
  exception when check_violation then null;
  end;

  -- THE mode invariant. A test subscription must not attach to a live customer:
  -- the foreign key carries `livemode`, so the environments cannot be crossed.
  begin
    insert into identity.billing_subscriptions
      (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
    values ('sub_test_crossmode', account_a, 'cus_test_a', 'active', 'price_test', true);
    raise exception 'a live subscription attached to a test customer';
  exception when foreign_key_violation then null;
  end;

  -- A subscription must name a customer that exists.
  begin
    insert into identity.billing_subscriptions
      (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
    values ('sub_test_nocust', account_a, 'cus_test_missing', 'active', 'price_test', false);
    raise exception 'a subscription referenced a customer that does not exist';
  exception when foreign_key_violation then null;
  end;

  -- Ending cannot precede cancelling.
  begin
    insert into identity.billing_subscriptions
      (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode, canceled_at, ended_at)
    values ('sub_test_backwards', account_a, 'cus_test_a', 'canceled', 'price_test', false,
            now(), now() - interval '1 day');
    raise exception 'a subscription ended before it was cancelled';
  exception when check_violation then null;
  end;

  -- Every status Stripe documents must be storable. A constraint that rejected a
  -- real Stripe status would make the webhook fail permanently on retry.
  insert into identity.billing_subscriptions
    (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode)
  select 'sub_test_' || s, account_b, 'cus_test_b', s, 'price_test', false
    from unnest(array['incomplete','incomplete_expired','trialing','past_due','canceled','unpaid','paused']) as s;

  -- ------------------------------------------------------------------- events
  insert into identity.billing_events (stripe_event_id, event_type, livemode, stripe_created_at, stripe_subscription_id)
  values ('evt_test_1', 'customer.subscription.updated', false, now(), 'sub_test_a');

  -- The idempotency mechanism itself: claiming the same event twice loses.
  begin
    insert into identity.billing_events (stripe_event_id, event_type, livemode, stripe_created_at)
    values ('evt_test_1', 'customer.subscription.updated', false, now());
    raise exception 'the same Stripe event was recorded twice';
  exception when unique_violation then null;
  end;

  -- An audit ledger that can be edited records nothing.
  begin
    update identity.billing_events set event_type = 'rewritten' where stripe_event_id = 'evt_test_1';
    raise exception 'a billing event was updated';
  exception when raise_exception then null;
  end;

  begin
    delete from identity.billing_events where stripe_event_id = 'evt_test_1';
    raise exception 'a billing event was deleted';
  exception when raise_exception then null;
  end;

  -- An event about a subscription Urdais chose not to store is still recordable,
  -- or the handler cannot mark it processed and Stripe retries it forever.
  insert into identity.billing_events (stripe_event_id, event_type, livemode, stripe_created_at, stripe_subscription_id)
  values ('evt_test_2', 'customer.subscription.deleted', false, now(), 'sub_not_stored_anywhere');

  -- ------------------------------------------------------- entitlement linkage
  -- The Phase 1 shape still holds: a Stripe-sourced entitlement must name the
  -- billing object it came from, or a manual comp mislabelled `stripe` becomes
  -- indistinguishable from a real subscription.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at)
    values (account_a, 'active', 'stripe', now());
    raise exception 'a stripe entitlement was created with no external reference';
  exception when check_violation then null;
  end;

  insert into identity.premium_entitlements (account_id, status, source, external_reference, granted_at)
  values (account_a, 'active', 'stripe', 'sub_test_a', now());

  -- Still one entitlement per account, which is what keeps "one subscription
  -- unlocks everything" from becoming a per-product model by accident.
  begin
    insert into identity.premium_entitlements (account_id, status, source, external_reference, granted_at)
    values (account_a, 'active', 'stripe', 'sub_test_other', now());
    raise exception 'an account gained a second entitlement';
  exception when unique_violation then null;
  end;

  -- Deleting the account no longer takes billing history with it (Phase 7D):
  -- the rows survive DETACHED -- no account, `detached_at` set -- so no future
  -- account can collide with or inherit them. See 710_account_deletion.sql.
  delete from identity.accounts where id = account_b;

  select count(*) into n from identity.billing_customers where account_id = account_b;
  if n <> 0 then raise exception 'a Stripe customer is still attached to a deleted account'; end if;

  select count(*) into n from identity.billing_customers
   where stripe_customer_id = 'cus_test_b' and account_id is null and detached_at is not null;
  if n <> 1 then raise exception 'the deleted account''s Stripe customer was not retained detached'; end if;

  select count(*) into n from identity.billing_subscriptions where account_id = account_b;
  if n <> 0 then raise exception 'subscriptions are still attached to a deleted account'; end if;

  -- ---------------------------------------------------------------- posture
  select count(*) into n from pg_tables
   where schemaname = 'identity'
     and tablename in ('billing_customers', 'billing_subscriptions', 'billing_events')
     and rowsecurity;
  if n <> 3 then raise exception 'a billing table lacks row level security (found %)', n; end if;

  select count(*) into n from pg_policies where schemaname = 'identity';
  if n <> 0 then raise exception 'identity gained % policies', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'a billing table is reachable by a public role (% grants)', n; end if;

  -- The ledger is not writable by the role that serves requests beyond appending.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and table_name = 'billing_events'
     and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE');
  if n <> 0 then raise exception 'service_role can update or delete billing events'; end if;
end $$;

rollback;
