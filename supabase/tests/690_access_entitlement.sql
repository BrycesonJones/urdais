-- Paid access, phase 1: the entitlement model's invariants.
--
-- Every case here is a way of writing an entitlement that would grant access it
-- cannot justify: a subscriber with no grant date, a second entitlement for the
-- same account, a revocation that precedes its grant, a manual comp wearing a
-- billing label. The schema has to be what refuses those, because the code that
-- writes them does not exist yet and will be written by a later phase against
-- whatever this table permits.
begin;

do $$
declare
  account_a uuid; account_b uuid; n integer;
begin
  -- ------------------------------------------------------------------ accounts
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'subject-a', 'reader.a@example.invalid')
  returning id into account_a;

  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'subject-b', null)
  returning id into account_b;

  -- One person is one account per issuer. A repeated subject is the same person
  -- signing in again, not a new account.
  begin
    insert into identity.accounts (auth_provider, auth_subject) values ('supabase', 'subject-a');
    raise exception 'a duplicate (provider, subject) created a second account';
  exception when unique_violation then null;
  end;

  -- The same subject string from a different issuer is a different person.
  insert into identity.accounts (auth_provider, auth_subject) values ('workos', 'subject-a');

  -- Provider names are normalised, so one issuer cannot become two.
  begin
    insert into identity.accounts (auth_provider, auth_subject) values ('Supabase', 'subject-c');
    raise exception 'a mixed-case provider was accepted';
  exception when check_violation then null;
  end;

  -- An address stored in mixed case would not be found by a support lookup.
  begin
    insert into identity.accounts (auth_provider, auth_subject, email)
    values ('supabase', 'subject-d', 'Reader.D@Example.invalid');
    raise exception 'a mixed-case email was accepted';
  exception when check_violation then null;
  end;

  -- Two providers may legitimately assert one address: this must not fail.
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('workos', 'subject-e', 'reader.a@example.invalid');

  -- ------------------------------------------------------------------ entitlement
  insert into identity.premium_entitlements (account_id, status, source, granted_at)
  values (account_a, 'active', 'manual', now() - interval '1 day');

  -- One entitlement per account. This is the constraint that keeps "one
  -- subscription unlocks everything" from silently becoming a per-product model.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at)
    values (account_a, 'active', 'manual', now());
    raise exception 'an account was given a second premium entitlement';
  exception when unique_violation then null;
  end;

  -- An entitlement cannot belong to an account that does not exist.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at)
    values (gen_random_uuid(), 'active', 'manual', now());
    raise exception 'an entitlement was created for an unknown account';
  exception when foreign_key_violation then null;
  end;

  -- An active entitlement that was never granted has no defensible start date,
  -- and nothing downstream could reconcile or bill it.
  begin
    insert into identity.premium_entitlements (account_id, status, source)
    values (account_b, 'active', 'manual');
    raise exception 'an active entitlement was accepted with no grant timestamp';
  exception when check_violation then null;
  end;

  -- Active and revoked at once is a contradiction, and the direction it fails in
  -- matters: it would read as a subscriber.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at, revoked_at)
    values (account_b, 'active', 'manual', now() - interval '1 day', now());
    raise exception 'an entitlement was active and revoked at the same time';
  exception when check_violation then null;
  end;

  -- Revoked before granted.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at, revoked_at)
    values (account_b, 'inactive', 'manual', now(), now() - interval '1 day');
    raise exception 'a revocation preceding its grant was accepted';
  exception when check_violation then null;
  end;

  -- A billing origin must name the billing object, or a manual comp is
  -- indistinguishable from a paid subscription at reconciliation time.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at)
    values (account_b, 'active', 'stripe', now());
    raise exception 'a stripe-sourced entitlement was accepted with no external reference';
  exception when check_violation then null;
  end;

  -- An unknown status must not be storable: the application treats an
  -- unrecognised status as "no entitlement", and a row it cannot interpret
  -- should never have been written in the first place.
  begin
    insert into identity.premium_entitlements (account_id, status, source, granted_at)
    values (account_b, 'trialing', 'manual', now());
    raise exception 'an unknown entitlement status was accepted';
  exception when check_violation then null;
  end;

  -- The legitimate lapsed case: previously granted, now inactive.
  insert into identity.premium_entitlements (account_id, status, source, granted_at, revoked_at)
  values (account_b, 'inactive', 'manual', now() - interval '30 days', now() - interval '1 day');

  select count(*) into n from identity.premium_entitlements where status = 'active';
  if n <> 1 then raise exception 'expected exactly one active entitlement, found %', n; end if;

  -- Revoking the account removes the entitlement with it; an orphan entitlement
  -- keyed to a deleted person is unauditable.
  delete from identity.accounts where id = account_b;
  select count(*) into n from identity.premium_entitlements where account_id = account_b;
  if n <> 0 then raise exception 'deleting an account left its entitlement behind'; end if;

  -- ------------------------------------------------------------------ housekeeping
  -- `now()` is fixed for the whole transaction, so "updated_at moved forward"
  -- is not observable here. What is observable, and is the property that
  -- matters, is that the trigger owns the column: a writer cannot backdate it.
  update identity.premium_entitlements
     set status = 'inactive', revoked_at = now(), updated_at = timestamptz '2000-01-01T00:00:00Z'
   where account_id = account_a;
  select count(*) into n from identity.premium_entitlements
   where account_id = account_a and updated_at = now();
  if n <> 1 then raise exception 'the entitlement updated_at trigger did not overwrite a backdated value'; end if;

  update identity.accounts set email = 'renamed@example.invalid', updated_at = timestamptz '2000-01-01T00:00:00Z'
   where id = account_a;
  select count(*) into n from identity.accounts where id = account_a and updated_at = now();
  if n <> 1 then raise exception 'the accounts updated_at trigger did not overwrite a backdated value'; end if;
end;
$$;

rollback;
