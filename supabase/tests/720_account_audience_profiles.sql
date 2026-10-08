begin;

do $$
declare account_a uuid; n integer;
begin
  insert into identity.accounts (auth_provider, auth_subject, email)
  values ('supabase', 'audience-subject', 'audience@example.invalid')
  returning id into account_a;

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

  delete from identity.accounts where id = account_a;
  select count(*) into n from identity.account_audience_profiles where account_id = account_a;
  if n <> 0 then raise exception 'account deletion left an audience profile behind'; end if;
end;
$$;

rollback;

