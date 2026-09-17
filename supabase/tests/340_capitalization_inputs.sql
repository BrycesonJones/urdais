-- Shares, ownership, free float, accessibility and corporate actions.
--
-- The invariant this file exists to defend, above all others:
--
--   UNKNOWN FREE FLOAT STAYS UNKNOWN. IT NEVER BECOMES 1.0.
--
-- Treating an absent float factor as full float inflates precisely the issuers Urdais knows least
-- about, and produces an index that looks complete. Several assertions below attack that from
-- different directions, because a single constraint is easy to route around once someone is in a
-- hurry to make a calculation run.
begin;

-- ------------------------------------------------------------ what the seed recorded

do $$
declare n integer;
begin
  -- NVIDIA: established, and the two dates differ. A count effective 21 August was published on
  -- 26 August, and a calculation for 22 August must not treat it as knowable then.
  select count(*) into n from pipeline.share_observations o
    join reference.securities s on s.id = o.security_id
    join reference.issuers i on i.id = s.issuer_id
   where i.issuer_key = 'nvidia' and o.share_count_type = 'outstanding'
     and o.share_count = 24100000000 and o.effective_date = date '2026-08-21'
     and o.as_reported_date = date '2026-08-26';
  if n <> 1 then raise exception 'the NVIDIA share count is not recorded as an effective-dated outstanding count'; end if;

  -- TSMC: established as 'issued', which is what Taiwan publishes. Not relabelled 'outstanding'.
  select count(*) into n from pipeline.share_observations o
    join reference.securities s on s.id = o.security_id
    join reference.issuers i on i.id = s.issuer_id
   where i.issuer_key = 'tsmc' and o.share_count_type = 'issued' and o.share_count = 25932370067;
  if n <> 1 then raise exception 'the TSMC issued share count is not recorded as issued'; end if;

  -- Palantir: deliberately absent. A multi-class issuer whose cover-page concept does not exist
  -- and whose us-gaap figure has lost its class dimension gets no share observation at all.
  select count(*) into n from pipeline.share_observations o
    join reference.securities s on s.id = o.security_id
    join reference.issuers i on i.id = s.issuer_id
   where i.issuer_key = 'palantir-technologies';
  if n <> 0 then raise exception 'an ambiguous multi-class share count was recorded for Palantir'; end if;

  -- Not one float factor exists anywhere, and every float row says why.
  select count(*) into n from pipeline.float_observations where free_float_factor is not null;
  if n <> 0 then raise exception '% float factor(s) were established without a public source', n; end if;
  select count(*) into n from pipeline.float_observations
   where float_state <> 'unavailable' or btrim(coalesce(basis, '')) = '';
  if n <> 0 then raise exception '% float row(s) are not an explained unavailability', n; end if;

  -- Accessibility is recorded and is not a factor. The unknown row carries no figures at all.
  select count(*) into n from pipeline.accessibility_observations
   where accessibility_state = 'unknown'
     and (foreign_ownership_limit_percent is not null
          or foreign_ownership_current_percent is not null
          or foreign_headroom_percent is not null);
  if n <> 0 then raise exception 'an unknown accessibility row carries figures'; end if;

  -- And the US position is 'no_limit_evidenced', which is a finding, not the same as unknown.
  select count(*) into n from pipeline.accessibility_observations
   where accessibility_state = 'no_limit_evidenced';
  if n <> 2 then raise exception 'expected 2 no-limit-evidenced rows, found %', n; end if;

  -- The dividend is recorded with its currency and its structured terms.
  select count(*) into n from pipeline.corporate_actions
   where action_type = 'cash_dividend' and cash_amount = 7.000001 and cash_currency = 'TWD'
     and terms ->> 'per_share_amount' = '7.000001';
  if n <> 1 then raise exception 'the TSMC dividend is not recorded with denominated structured terms'; end if;

  -- Every sourced capitalization row names a grant that covers it.
  select count(*) into n from pipeline.share_observations o
    join reference.permission_grants g on g.id = o.permission_grant_id
   where not g.covers_collection or not g.covers_storage;
  if n <> 0 then raise exception '% share row(s) rest on a grant that does not cover them', n; end if;

  raise notice 'capitalization seed: 2 share counts, 0 float factors, 1 action';
end $$;

-- -------------------------------------------------------- the float invariant, attacked

do $$
declare
  ok boolean; n integer;
  sec_id uuid; iface uuid; grt uuid; attribution text;
begin
  select s.id into sec_id from reference.securities s
    join reference.issuers i on i.id = s.issuer_id where i.issuer_key = 'tsmc';
  select id into iface from reference.source_interfaces where slug = 'tw-twse-openapi-company';
  select id, attribution_text into grt, attribution
    from reference.permission_grants where source_interface_id = iface;

  -- An unknown float cannot carry a factor. This is the assertion that stops a well-meaning
  -- backfill from writing 1.0 beside 'unknown' and calling it a default.
  foreach ok in array array[true] loop end loop;
  ok := false;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, free_float_factor, basis, idempotency_key)
      values (sec_id, date '2026-08-01', 'unknown', 1.0, 'a default', 'f:unknown-with-one');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unknown float carried a factor of 1.0'; end if;

  -- Nor can 'unavailable' or 'under_review'.
  ok := false;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, free_float_factor, basis, idempotency_key)
      values (sec_id, date '2026-08-02', 'unavailable', 1.0, 'x', 'f:unavailable-with-one');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unavailable float carried a factor'; end if;

  -- And an 'established' float cannot omit one, so the state can never be used as a shortcut to
  -- assert a float without providing it.
  ok := false;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, basis, determination_method, idempotency_key)
      values (sec_id, date '2026-08-03', 'established', 'x', 'published_by_venue', 'f:established-no-factor');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an established float omitted its factor'; end if;

  -- Factors outside [0,1] are rejected, including NaN, which compares greater than every numeric.
  foreach n in array array[-1, 2] loop
    ok := false;
    begin
      insert into pipeline.float_observations
        (security_id, effective_date, float_state, free_float_factor, basis, determination_method, idempotency_key)
        values (sec_id, date '2026-08-04', 'established', n, 'x', 'published_by_venue', 'f:bad' || n);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a float factor of % was accepted', n; end if;
  end loop;

  ok := false;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, free_float_factor, basis, determination_method, idempotency_key)
      values (sec_id, date '2026-08-05', 'established', 'NaN'::numeric, 'x', 'published_by_venue', 'f:nan');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a NaN float factor was accepted'; end if;

  -- A factor derived from a disclosed-holder list is an estimate, and needs the methodology to
  -- have authorised one. This is what stops insider holdings being summed into a float.
  ok := false;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, free_float_factor, basis, determination_method, idempotency_key)
      values (sec_id, date '2026-08-06', 'established', 0.85, 'summed the published director holdings',
              'derived_from_holdings', 'f:derived');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a float factor was derived from holdings with no methodology authority'; end if;

  -- With a methodology citation it becomes representable -- the gate is authority, not arithmetic.
  insert into pipeline.float_observations
    (security_id, effective_date, float_state, free_float_factor, basis, determination_method,
     methodology_reference, idempotency_key)
    values (sec_id, date '2026-08-07', 'established', 0.85, 'a permitted derivation',
            'derived_from_holdings', 'hypothetical future methodology section', 'f:derived-ok');

  -- 0 is a legitimate factor and must not be confused with absence. A wholly closely-held listing
  -- has a float of zero, and that is a determination rather than a missing value.
  insert into pipeline.float_observations
    (security_id, effective_date, float_state, free_float_factor, basis, determination_method, idempotency_key)
    values (sec_id, date '2026-08-08', 'established', 0, 'wholly held by a parent',
            'published_by_venue', 'f:zero');
  select count(*) into n from pipeline.float_observations
   where idempotency_key = 'f:zero' and free_float_factor = 0 and float_state = 'established';
  if n <> 1 then raise exception 'a float factor of zero was not storable as a determination'; end if;

  raise notice 'float invariant: unknown stays unknown';
end $$;

-- ---------------------------------------------------- shares, ownership, accessibility

do $$
declare
  ok boolean; n integer;
  sec_id uuid; iss uuid; iface uuid; grt uuid; attribution text; first_obs uuid; second_obs uuid;
begin
  select s.id, i.id into sec_id, iss from reference.securities s
    join reference.issuers i on i.id = s.issuer_id where i.issuer_key = 'tsmc';
  select id into iface from reference.source_interfaces where slug = 'tw-twse-openapi-company';
  select id, attribution_text into grt, attribution
    from reference.permission_grants where source_interface_id = iface;

  -- A zero or negative count is not a share count, and neither is NaN.
  foreach n in array array[0, -5] loop
    ok := false;
    begin
      insert into pipeline.share_observations
        (security_id, share_count_type, share_count, effective_date, source_interface_id,
         permission_grant_id, attribution, idempotency_key)
        values (sec_id, 'issued', n, date '2026-07-01', iface, grt, attribution, 's:bad' || n);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a share count of % was accepted', n; end if;
  end loop;

  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'issued', 'NaN'::numeric, date '2026-07-02', iface, grt, attribution, 's:nan');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a NaN share count was accepted'; end if;

  -- An unrecognised count type is refused. There is no 'unspecified' and no default: a number
  -- whose type is unknown is not a capitalization input.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'shares', 1000, date '2026-07-03', iface, grt, attribution, 's:ambiguous');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an ambiguous share count type was accepted'; end if;

  -- A report date before the effective date is incoherent.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, as_reported_date,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'issued', 1000, date '2026-07-10', date '2026-07-01', iface, grt, attribution, 's:backwards');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a count was reported before it was effective'; end if;

  -- Attribution is a condition of this licence, so a row without it was never lawfully collected.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, idempotency_key)
      values (sec_id, 'issued', 1000, date '2026-07-04', iface, grt, 's:nocredit');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a share count was stored without its required attribution'; end if;

  -- A grant cannot be borrowed from a different interface.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'issued', 1000, date '2026-07-05',
              (select id from reference.source_interfaces where slug = 'sec-xbrl-company-concepts'),
              grt, attribution, 's:borrowed');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a grant was used with a different interface'; end if;

  -- Identity: a count must belong to a real security. There is no ticker path into this table.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (gen_random_uuid(), 'issued', 1000, date '2026-07-06', iface, grt, attribution, 's:nosec');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'a share count was stored against no security'; end if;

  -- Idempotency and restatement. The same fact twice is refused; a restatement supersedes.
  insert into pipeline.share_observations
    (security_id, share_count_type, share_count, effective_date, source_interface_id,
     permission_grant_id, attribution, idempotency_key)
    values (sec_id, 'outstanding', 1000, date '2026-07-20', iface, grt, attribution, 's:first')
    returning id into first_obs;

  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'outstanding', 1000, date '2026-07-20', iface, grt, attribution, 's:first');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'the same share observation was stored twice'; end if;

  -- Two live counts for the same security, type and effective date is what supersession prevents.
  ok := false;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec_id, 'outstanding', 1100, date '2026-07-20', iface, grt, attribution, 's:second');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two live share counts exist for one security and date'; end if;

  -- The restatement path: supersede first, then insert, and the original value survives.
  second_obs := gen_random_uuid();
  update pipeline.share_observations
     set superseded_by_id = second_obs, superseded_at = now(),
         supersession_reason = 'restated by a later filing'
   where id = first_obs;
  insert into pipeline.share_observations
    (id, security_id, share_count_type, share_count, effective_date, source_interface_id,
     permission_grant_id, attribution, idempotency_key)
    values (second_obs, sec_id, 'outstanding', 1100, date '2026-07-20', iface, grt, attribution, 's:restated');

  select count(*) into n from pipeline.share_observations
   where id = first_obs and share_count = 1000 and superseded_by_id = second_obs;
  if n <> 1 then raise exception 'the original share count did not survive its restatement'; end if;

  ok := false;
  begin
    update pipeline.share_observations set share_count = 9999 where id = second_obs;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a share count was edited in place'; end if;

  -- Ownership: a stake is a positive percentage at most 100, and carries some quantity.
  ok := false;
  begin
    insert into pipeline.ownership_observations
      (issuer_id, holder_name, holder_kind, percent_held, effective_date,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (iss, 'a holder', 'major_shareholder', 101, date '2026-07-01', iface, grt, attribution, 'o:over');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an ownership stake above 100 percent was accepted'; end if;

  ok := false;
  begin
    insert into pipeline.ownership_observations
      (issuer_id, holder_name, holder_kind, effective_date,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (iss, 'a holder', 'major_shareholder', date '2026-07-01', iface, grt, attribution, 'o:empty');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an ownership row was stored with neither a count nor a percentage'; end if;

  -- A real insider holding, recorded as an input and not as a float.
  insert into pipeline.ownership_observations
    (issuer_id, security_id, holder_name, holder_kind, shares_held, effective_date,
     source_interface_id, permission_grant_id, attribution, idempotency_key, notes)
    values (iss, sec_id, 'a named director', 'insider_director', 3835997, date '2026-08-31',
            iface, grt, attribution, 'o:director',
            'A float input. Director holdings are not the non-float population: strategic corporate holders, cross-holdings and government stakes appear in no published Taiwanese list.');

  -- Accessibility: headroom cannot exceed the limit it is headroom against, and a stated limit
  -- says where it comes from.
  ok := false;
  begin
    insert into pipeline.accessibility_observations
      (security_id, effective_date, accessibility_state, foreign_ownership_limit_percent,
       limit_basis, foreign_headroom_percent, basis, idempotency_key)
      values (sec_id, date '2026-07-01', 'established', 30, 'statutory', 40, 'x', 'a:headroom');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'headroom exceeded its own limit'; end if;

  ok := false;
  begin
    insert into pipeline.accessibility_observations
      (security_id, effective_date, accessibility_state, foreign_ownership_limit_percent,
       basis, idempotency_key)
      values (sec_id, date '2026-07-02', 'established', 30, 'x', 'a:nobasis');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a foreign ownership limit was stated with no basis'; end if;

  raise notice 'shares, ownership, accessibility: gates ok';
end $$;

-- ------------------------------------------------- corporate actions, and the price boundary

do $$
declare
  ok boolean; n integer;
  iss uuid; sec_id uuid; lst uuid; iface uuid; grt uuid; attribution text;
  px_before numeric; px_after numeric;
  act uuid; corrected uuid;
begin
  select i.id, s.id into iss, sec_id from reference.issuers i
    join reference.securities s on s.issuer_id = i.id where i.issuer_key = 'tsmc';
  select l.id into lst from reference.listings l where l.ticker = '2330';
  select id into iface from reference.source_interfaces where slug = 'tw-twse-openapi-corporate-actions';
  select id, attribution_text into grt, attribution
    from reference.permission_grants where source_interface_id = iface;

  -- A price observation, so the boundary can be tested against a real row.
  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
     source_interface_id, permission_grant_id, retrieved_at, attribution,
     observation_purpose, idempotency_key)
    select lst, date '2026-09-16', 'traded', 2380.00, 'TWD', 'major',
           si.id, pg.id, now(), pg.attribution_text, 'research', 'ca:px'
      from reference.source_interfaces si
      join reference.permission_grants pg on pg.source_interface_id = si.id
     where si.slug = 'tw-twse-openapi-daily';
  select close_price into px_before from pipeline.price_observations where idempotency_key = 'ca:px';

  -- A split. Recorded, and it must not touch the price history: raw official closes are source
  -- observations, and a later calculation applies the ratio at read time.
  insert into pipeline.corporate_actions
    (issuer_id, security_id, action_type, action_state, announcement_date, ex_date,
     ratio_numerator, ratio_denominator, source_interface_id, permission_grant_id,
     attribution, idempotency_key)
    values (iss, sec_id, 'stock_split', 'effective', date '2026-09-01', date '2026-09-16',
            3, 2, iface, grt, attribution, 'ca:split')
    returning id into act;

  select close_price into px_after from pipeline.price_observations where idempotency_key = 'ca:px';
  if px_before <> px_after then
    raise exception 'recording a split changed a raw price observation from % to %', px_before, px_after;
  end if;
  -- And the price row is not even editable, so no amount of calculation convenience can adjust it.
  ok := false;
  begin
    update pipeline.price_observations set close_price = px_before / 1.5 where idempotency_key = 'ca:px';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a split was applied to a raw price observation'; end if;

  -- The ratio survives as the pair the issuer stated, so 3-for-2 is recoverable exactly.
  select count(*) into n from pipeline.corporate_actions
   where id = act and ratio_numerator = 3 and ratio_denominator = 2;
  if n <> 1 then raise exception 'the split ratio was not preserved as a pair'; end if;

  -- A ratio is a pair or nothing.
  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, action_type, ex_date, ratio_numerator, source_interface_id, permission_grant_id,
       attribution, idempotency_key)
      values (iss, 'stock_split', date '2026-05-01', 2, iface, grt, attribution, 'ca:halfratio');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a split ratio was stored with no denominator'; end if;

  -- Cash needs a currency; a negative dividend is not a dividend.
  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, action_type, ex_date, cash_amount, source_interface_id, permission_grant_id,
       attribution, idempotency_key)
      values (iss, 'cash_dividend', date '2026-05-02', 1.5, iface, grt, attribution, 'ca:nocurrency');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a cash amount was stored with no currency'; end if;

  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, action_type, ex_date, cash_amount, cash_currency, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (iss, 'cash_dividend', date '2026-05-03', -1, 'TWD', iface, grt, attribution, 'ca:negative');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a negative dividend was accepted'; end if;

  -- Date coherence.
  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, action_type, ex_date, record_date, payment_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (iss, 'cash_dividend', date '2026-05-10', date '2026-05-12', date '2026-05-11',
              iface, grt, attribution, 'ca:paybeforerecord');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a dividend was paid before its record date'; end if;

  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, action_type, announcement_date, ex_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (iss, 'cash_dividend', date '2026-05-20', date '2026-05-10', iface, grt, attribution, 'ca:exbeforeann');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an action went ex before it was announced'; end if;

  -- Idempotency: the same source event twice is refused.
  ok := false;
  begin
    insert into pipeline.corporate_actions
      (issuer_id, security_id, action_type, ex_date, ratio_numerator, ratio_denominator,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (iss, sec_id, 'stock_split', date '2026-09-16', 3, 2, iface, grt, attribution, 'ca:split');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'the same corporate action was stored twice'; end if;

  -- A corrected notice supersedes; the original terms stay readable.
  corrected := gen_random_uuid();
  update pipeline.corporate_actions
     set superseded_by_id = corrected, superseded_at = now(),
         supersession_reason = 'the issuer amended the ratio'
   where id = act;
  insert into pipeline.corporate_actions
    (id, issuer_id, security_id, action_type, action_state, announcement_date, ex_date,
     ratio_numerator, ratio_denominator, source_interface_id, permission_grant_id,
     attribution, idempotency_key, supersession_reason)
    values (corrected, iss, sec_id, 'stock_split', 'amended', date '2026-09-01', date '2026-09-16',
            4, 2, iface, grt, attribution, 'ca:split:amended', 'supersedes the announced ratio');

  select count(*) into n from pipeline.corporate_actions
   where id = act and ratio_numerator = 3 and superseded_by_id = corrected and action_state = 'effective';
  if n <> 1 then raise exception 'the original action terms did not survive the amendment'; end if;

  -- A cancelled action is representable and leaves the live set.
  insert into pipeline.corporate_actions
    (issuer_id, action_type, action_state, ex_date, cash_amount, cash_currency,
     source_interface_id, permission_grant_id, attribution, idempotency_key, notes)
    values (iss, 'special_dividend', 'cancelled', date '2026-04-01', 5, 'TWD',
            iface, grt, attribution, 'ca:cancelled', 'the issuer withdrew the notice');
  select count(*) into n from pipeline.corporate_actions
   where idempotency_key = 'ca:cancelled' and action_state = 'cancelled';
  if n <> 1 then raise exception 'a cancelled action is not representable'; end if;

  -- In-place edits and deletes are refused throughout.
  ok := false;
  begin
    update pipeline.corporate_actions set cash_amount = 1 where idempotency_key = 'ca:cancelled';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a corporate action was edited in place'; end if;

  ok := false;
  begin
    delete from pipeline.corporate_actions where idempotency_key = 'ca:cancelled';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a corporate action was deleted'; end if;

  raise notice 'corporate actions: recorded, never applied to raw prices';
end $$;

-- ------------------------------------------------------------------ nothing was calculated

do $$
declare n integer;
begin
  -- Phase 5.4 records inputs. These are the rows that would exist if it had started weighting.
  select count(*) into n from pipeline.share_observations where observation_purpose = 'production';
  if n <> 0 then raise exception '% production share observation(s) exist', n; end if;
  select count(*) into n from pipeline.price_observations where observation_purpose = 'production';
  if n <> 0 then raise exception '% production price observation(s) exist', n; end if;

  -- No accessible-float factor is computed anywhere: the three inputs stay three inputs, which is
  -- what lets a later calculation explain why accessible float sits below free float.
  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline'
     and column_name in ('accessible_float_factor', 'free_float_market_cap', 'index_weight');
  if n <> 0 then raise exception 'a derived capitalization column exists in phase 5.4'; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug in ('ugai', 'ai-equity-universe') and mv.status <> 'draft';
  if n <> 0 then raise exception 'a UGAI methodology version left draft'; end if;

  raise notice 'no weights, no snapshots, no index level: ok';
end $$;

rollback;
