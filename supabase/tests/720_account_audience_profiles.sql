begin;

do $$
declare account_a uuid; account_b uuid; n integer; role_name text; ok boolean; stored text;
begin
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'audience-subject', 'audience@example.invalid')
  returning id into account_a;
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'audience-subject-b', 'audience-b@example.invalid')
  returning id into account_b;

  -- Browser roles can neither read nor write the table, for any account: the only
  -- writer is the server, keyed by the account it resolved from the session.
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('set local role %I', role_name);
    ok := false;
    begin
      perform 1 from identity.account_audience_profiles limit 1;
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception '% could SELECT audience profiles', role_name; end if;
    ok := false;
    begin
      execute format(
        'insert into identity.account_audience_profiles (account_id, primary_role) values (%L, %L)',
        account_a, 'other');
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception '% could INSERT an audience profile', role_name; end if;
    reset role;
  end loop;

  -- The server's account-keyed upsert: a replay is idempotent, a later choice for
  -- the same account replaces the earlier one, and other accounts are untouched.
  set local role service_role;
  insert into identity.account_audience_profiles (account_id, primary_role) values (account_b, 'other');
  insert into identity.account_audience_profiles (account_id, primary_role) values (account_b, 'other')
    on conflict (account_id) do update set primary_role = excluded.primary_role;
  insert into identity.account_audience_profiles (account_id, primary_role) values (account_b, 'academic_university')
    on conflict (account_id) do update set primary_role = excluded.primary_role;
  reset role;
  select count(*), max(primary_role) into n, stored from identity.account_audience_profiles where account_id = account_b;
  if n <> 1 or stored <> 'academic_university' then
    raise exception 'audience upsert left % rows with role %', n, stored;
  end if;

  insert into identity.account_audience_profiles (account_id, primary_role)
  values (account_a, 'frontier_ai_lab');

  begin
    insert into identity.account_audience_profiles (account_id, primary_role)
    values (account_a, 'other');
    raise exception 'a second audience profile was accepted for one account';
  exception when unique_violation then null;
  end;

  begin
    update identity.account_audience_profiles set primary_role = 'invented' where account_id = account_a;
    raise exception 'an unknown audience role was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into identity.account_audience_profiles (account_id, primary_role)
    values (gen_random_uuid(), 'other');
    raise exception 'an audience profile was accepted for an unknown account';
  exception when foreign_key_violation then null;
  end;

  select primary_role into stored from identity.account_audience_profiles where account_id = account_a;
  if stored <> 'frontier_ai_lab' then raise exception 'another account''s upsert changed account A (%)', stored; end if;

  delete from identity.accounts where id = account_a;
  select count(*) into n from identity.account_audience_profiles where account_id = account_a;
  if n <> 0 then raise exception 'account deletion left an audience profile behind'; end if;
end;
$$;

rollback;

