-- The UGAI calculation engine: index shares, divisor, level, publication gates.
--
-- One sentence is what the fixtures below actually test:
--
--   UGAI must change because constituent market values changed, not because bookkeeping events
--   altered shares, listings, or capital structure.
--
-- Every continuity fixture is a way of getting that wrong. A split that moves the index, an
-- addition that creates a return, a reconstitution that resets to 1000 -- each produces a level
-- that looks perfectly reasonable and is a fabrication. The fixtures are synthetic and roll back;
-- no real issuer gets a price, a share count or an index share anywhere in this file.
begin;

-- --------------------------------------------------- what the real diagnostic recorded

do $$
declare n integer; c record;
begin
  select * into c from pipeline.ugai_calculations where id = 'e0000000-0000-4000-8000-000000000001';
  if c is null then raise exception 'the calculation diagnostic is missing'; end if;
  if c.state <> 'blocked' then raise exception 'the diagnostic is % rather than blocked', c.state; end if;
  if c.index_level is not null or c.market_value_usd is not null or c.divisor is not null then
    raise exception 'the blocked diagnostic carries a level';
  end if;
  if c.is_base_observation then raise exception 'the diagnostic claims to be the base observation'; end if;

  -- Nothing is initialized. These four assertions are the phase's central claim: no base date, no
  -- divisor, no index shares, no published level.
  select count(*) into n from pipeline.ugai_calculations where is_base_observation;
  if n <> 0 then raise exception 'a base observation exists'; end if;
  select count(*) into n from pipeline.ugai_divisors;
  if n <> 0 then raise exception '% divisor(s) exist', n; end if;
  select count(*) into n from pipeline.ugai_index_shares;
  if n <> 0 then raise exception '% index share row(s) exist', n; end if;
  select count(*) into n from pipeline.ugai_calculations
   where state in ('calculated', 'ready_for_review', 'publication_eligible');
  if n <> 0 then raise exception '% calculation(s) reached a non-blocked state', n; end if;

  -- No synthetic history: exactly one calculation row exists, and it is today's blocked attempt.
  select count(*) into n from pipeline.ugai_calculations;
  if n <> 1 then raise exception 'expected exactly 1 calculation row, found % -- history was fabricated', n; end if;

  -- The publication checks distinguish their outcomes rather than collapsing to a boolean.
  select count(*) into n from pipeline.ugai_publication_checks
   where calculation_id = c.id and result = 'parameter_unresolved' and parameter_key is not null;
  if n <> 2 then raise exception 'expected 2 parameter-unresolved checks, found %', n; end if;
  select count(*) into n from pipeline.ugai_publication_checks
   where calculation_id = c.id and result = 'passed';
  if n <> 2 then raise exception 'expected 2 passing checks, found %', n; end if;
  select count(*) into n from pipeline.ugai_publication_checks
   where calculation_id = c.id and btrim(basis) = '';
  if n <> 0 then raise exception '% check(s) give no basis', n; end if;

  raise notice 'calculation diagnostic: blocked, no base date, no divisor, no index shares';
end $$;

-- --------------------------------------------------- initialization and daily movement

do $$
declare
  ok boolean; n integer;
  mv_ugai uuid; snap uuid; iss uuid; sec uuid; lst uuid; ven uuid; prov uuid;
  iface uuid; grt uuid;
  d_base uuid; calc uuid;
  lvl numeric;
begin
  select mvv.id into mv_ugai from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ugai' and mvv.version = '0.2.0-draft';

  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XCAL', 'Calculation Fixture Venue', 'US', 'USD', 'America/New_York') returning id into ven;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('zz-fixture-calc-a', 'Fixture Calc A', 'US') returning id into iss;
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss, 'ordinary_share', 'USD') returning id into sec;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, price_unit, effective_from)
    values (sec, ven, 'ZCA', 'USD', 'major', date '2020-01-01') returning id into lst;

  -- A production-eligible snapshot, so initialization can be exercised at all. It rolls back.
  declare cap_param uuid; mv_parent uuid;
  begin
    select mvv.id into mv_parent from reference.methodology_versions mvv
      join reference.methodologies m on m.id = mvv.methodology_id
     where m.slug = 'ai-equity-universe' and mvv.version = '0.4.0-draft';
    insert into reference.methodology_parameters
      (methodology_version_id, parameter_key, numeric_value, status, effective_from, approved_by, approved_on)
      values (mv_parent, 'issuer_cap', 0.10, 'approved', date '2026-01-01', 'a named approver', date '2026-01-01')
      returning id into cap_param;
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-16', date '2026-09-17', 'scheduled_reconstitution', 'production_eligible',
              mv_parent, cap_param, 0.10, 12, 12, true)
      returning id into snap;
  end;

  -- Base initialization: MV = 5,000,000,000 at a base of 1000 gives D = 5,000,000.
  insert into pipeline.ugai_divisors
    (id, effective_from, divisor, change_reason, methodology_version_id, snapshot_id, state, basis)
    values (gen_random_uuid(), date '2026-09-17', 5000000, 'base_initialization', mv_ugai, snap,
            'production', 'D_base = MV_base / 1000 with MV_base = 5,000,000,000')
    returning id into d_base;

  insert into pipeline.ugai_calculations
    (id, calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
     is_base_observation, snapshot_id, methodology_version_id)
    values (gen_random_uuid(), date '2026-09-17', 'publication_eligible', 5000000000, d_base,
            5000000, 1000, true, snap, mv_ugai)
    returning id into calc;

  select index_level into lvl from pipeline.ugai_calculations where id = calc;
  if lvl <> 1000 then raise exception 'the base level is % rather than 1000', lvl; end if;

  -- A level that does not reproduce from its own market value and divisor is refused. This is
  -- the error nobody would spot by reading the row.
  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
       snapshot_id, methodology_version_id)
      values (date '2026-09-18', 'calculated', 5000000000, d_base, 5000000, 1234, snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a level that does not reproduce from MV / D was accepted'; end if;

  -- A calculation cannot claim a divisor different from the row it cites.
  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
       snapshot_id, methodology_version_id)
      values (date '2026-09-18', 'calculated', 5000000000, d_base, 4000000, 1250, snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a calculation cited a divisor it did not use'; end if;

  -- Price movement moves the index, with the divisor untouched. A 10% rise in aggregate market
  -- value is a 10% rise in the level and nothing else happens.
  insert into pipeline.ugai_calculations
    (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
     snapshot_id, methodology_version_id)
    values (date '2026-09-18', 'calculated', 5500000000, d_base, 5000000, 1100, snap, mv_ugai);
  select index_level into lvl from pipeline.ugai_calculations where calculation_date = date '2026-09-18';
  if lvl <> 1100 then raise exception 'a 10 percent market-value rise produced a level of %', lvl; end if;

  -- The base observation must be one that was actually published. Marking a blocked or merely
  -- calculated row as the base would date the series from a day nothing went live.
  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
       is_base_observation, snapshot_id, methodology_version_id)
      values (date '2026-09-19', 'calculated', 5000000000, d_base, 5000000, 1000, true, snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unpublished calculation was marked the base observation'; end if;

  -- A production divisor requires a production-eligible snapshot.
  declare blocked_snap uuid;
  begin
    select id into blocked_snap from pipeline.universe_snapshots
     where id = 'd0000000-0000-4000-8000-000000000001';
    ok := false;
    begin
      insert into pipeline.ugai_divisors
        (effective_from, divisor, change_reason, methodology_version_id, snapshot_id, state, basis)
        values (date '2026-09-20', 5000000, 'base_initialization', mv_ugai, blocked_snap, 'production', 'x');
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a production divisor rested on a blocked snapshot'; end if;
  end;

  raise notice 'initialization: base 1000, divisor derived, level reproduces';
end $$;

-- --------------------------------------------- divisor continuity across maintenance

do $$
declare
  ok boolean;
  mv_ugai uuid; snap uuid;
  d0 uuid; d1 uuid;
  lvl_before numeric; lvl_after numeric;
begin
  select mvv.id into mv_ugai from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ugai' and mvv.version = '0.2.0-draft';
  select id into snap from pipeline.universe_snapshots
   where state = 'production_eligible' and superseded_by_id is null limit 1;

  insert into pipeline.ugai_divisors
    (id, effective_from, divisor, change_reason, methodology_version_id, snapshot_id, state, basis)
    values (gen_random_uuid(), date '2026-10-01', 200000, 'base_initialization', mv_ugai, snap,
            'development', 'MV 200,000,000 at base 1000')
    returning id into d0;
  lvl_before := 200000000 / 200000.0;

  -- A constituent is added: the basket grows to 250,000,000 at the same prices. The divisor
  -- absorbs it exactly, and the level does not move -- a membership change is not a return.
  insert into pipeline.ugai_divisors
    (id, effective_from, divisor, prior_divisor, change_reason,
     market_value_before, market_value_after, methodology_version_id, snapshot_id, state, basis)
    values (gen_random_uuid(), date '2026-10-02', 200000 * 250000000.0 / 200000000.0, 200000,
            'scheduled_reset', 200000000, 250000000, mv_ugai, snap, 'development',
            'A constituent added at the implementation close; D_after = D_before x MV_after / MV_before')
    returning id into d1;
  select 250000000 / divisor into lvl_after from pipeline.ugai_divisors where id = d1;
  if abs(lvl_after - lvl_before) > 1e-18 then
    raise exception 'an addition moved the level from % to %', lvl_before, lvl_after;
  end if;

  -- A divisor that does not reproduce from D_prior x MV_after / MV_before is refused. This is
  -- the guard against a hand-computed adjustment that silently creates or destroys return.
  ok := false;
  begin
    insert into pipeline.ugai_divisors
      (effective_from, divisor, prior_divisor, change_reason,
       market_value_before, market_value_after, methodology_version_id, snapshot_id, state, basis)
      values (date '2026-10-03', 999999, 200000, 'scheduled_reset', 200000000, 250000000,
              mv_ugai, snap, 'development', 'a hand-computed adjustment');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a divisor that does not reproduce was accepted'; end if;

  -- A maintenance change records both sides of the ratio it applied.
  ok := false;
  begin
    insert into pipeline.ugai_divisors
      (effective_from, divisor, prior_divisor, change_reason, methodology_version_id,
       snapshot_id, state, basis)
      values (date '2026-10-04', 250000, 200000, 'scheduled_reset', mv_ugai, snap, 'development', 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a divisor change recorded no market values'; end if;

  -- Only base initialization has no predecessor.
  ok := false;
  begin
    insert into pipeline.ugai_divisors
      (effective_from, divisor, prior_divisor, change_reason, market_value_before,
       market_value_after, methodology_version_id, snapshot_id, state, basis)
      values (date '2026-10-05', 200000, 190000, 'base_initialization', 1, 1,
              mv_ugai, snap, 'development', 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a base initialization carried a prior divisor'; end if;

  -- Divisors are append-only; a correction supersedes.
  ok := false;
  begin
    update pipeline.ugai_divisors set divisor = 1 where id = d0;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a divisor was edited in place'; end if;

  declare corrected uuid;
  begin
    corrected := gen_random_uuid();
    update pipeline.ugai_divisors
       set superseded_by_id = corrected, superseded_at = now(),
           supersession_reason = 'the corporate-action terms were corrected'
     where id = d1;
    insert into pipeline.ugai_divisors
      (id, effective_from, divisor, prior_divisor, change_reason, market_value_before,
       market_value_after, methodology_version_id, snapshot_id, state, basis, supersession_reason)
      values (corrected, date '2026-10-02', 200000 * 260000000.0 / 200000000.0, 200000,
              'correction', 200000000, 260000000, mv_ugai, snap, 'development',
              'corrected terms', 'supersedes the original adjustment');
    -- The original survives with its original value, which is what makes a historical
    -- recalculation able to use the divisor lineage of the version it belongs to.
    if (select divisor from pipeline.ugai_divisors where id = d1) <> 200000 * 250000000.0 / 200000000.0 then
      raise exception 'the superseded divisor was rewritten';
    end if;
  end;

  raise notice 'divisor continuity: additions absorbed, adjustments re-derived, history kept';
end $$;

-- ------------------------------------------- constituent inputs and the missing-data rule

do $$
declare
  ok boolean;
  mv_ugai uuid; snap uuid; d0 uuid; calc uuid;
  iss uuid; sec uuid; lst uuid;
begin
  select mvv.id into mv_ugai from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ugai' and mvv.version = '0.2.0-draft';
  select id into snap from pipeline.universe_snapshots
   where state = 'production_eligible' and superseded_by_id is null limit 1;
  select id into d0 from pipeline.ugai_divisors where change_reason = 'base_initialization'
     and state = 'development' limit 1;
  select i.id, s.id, l.id into iss, sec, lst
    from reference.issuers i
    join reference.securities s on s.issuer_id = i.id
    join reference.listings l on l.security_id = s.id
   where i.issuer_key = 'zz-fixture-calc-a';

  insert into pipeline.ugai_calculations
    (id, calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
     snapshot_id, methodology_version_id)
    values (gen_random_uuid(), date '2026-10-10', 'calculated', 200000000, d0, 200000, 1000,
            snap, mv_ugai)
    returning id into calc;

  -- A carried close names the day it came from. The methodology permits carrying for a holiday,
  -- a stale session or a suspension, and requires the state to be recorded -- an unflagged carry
  -- is indistinguishable from an observation.
  ok := false;
  begin
    insert into pipeline.ugai_constituent_calculations
      (calculation_id, issuer_id, security_id, listing_id, index_shares, local_price,
       price_currency, price_input_state, fx_rate, contribution_usd)
      values (calc, iss, sec, lst, 1000, 100, 'USD', 'valid_prior_close', 1, 100000);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a carried close did not name the day it was carried from'; end if;

  insert into pipeline.ugai_constituent_calculations
    (calculation_id, issuer_id, security_id, listing_id, index_shares, local_price,
     price_currency, price_input_state, carried_from_date, fx_rate, contribution_usd, as_of_weight)
    values (calc, iss, sec, lst, 1000, 100, 'USD', 'valid_prior_close', date '2026-10-09', 1, 100000, 1);

  -- A missing observation may not carry a price or a contribution. The methodology says "do not
  -- impute; the observation is unavailable until resolved", and this makes imputation
  -- unrepresentable rather than merely prohibited.
  declare iss2 uuid; sec2 uuid; lst2 uuid; ven2 uuid;
  begin
    select id into ven2 from reference.venues where mic = 'XCAL';
    insert into reference.issuers (issuer_key, canonical_name, domicile_country)
      values ('zz-fixture-calc-b', 'Fixture Calc B', 'US') returning id into iss2;
    insert into reference.securities (issuer_id, security_type, denomination_currency)
      values (iss2, 'ordinary_share', 'USD') returning id into sec2;
    insert into reference.listings (security_id, venue_id, ticker, price_currency, price_unit, effective_from)
      values (sec2, ven2, 'ZCB', 'USD', 'major', date '2020-01-01') returning id into lst2;

    ok := false;
    begin
      insert into pipeline.ugai_constituent_calculations
        (calculation_id, issuer_id, security_id, listing_id, index_shares, local_price,
         price_currency, price_input_state, fx_rate, contribution_usd)
        values (calc, iss2, sec2, lst2, 1000, 100, 'USD', 'missing', 1, 100000);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a missing observation was given a price'; end if;

    -- Recorded correctly, it contributes nothing and says so.
    insert into pipeline.ugai_constituent_calculations
      (calculation_id, issuer_id, security_id, listing_id, index_shares, price_input_state)
      values (calc, iss2, sec2, lst2, 1000, 'missing');

    -- One row per security per calculation.
    ok := false;
    begin
      insert into pipeline.ugai_constituent_calculations
        (calculation_id, issuer_id, security_id, listing_id, index_shares, price_input_state)
        values (calc, iss2, sec2, lst2, 1000, 'missing');
    exception when unique_violation then ok := true;
    end;
    if not ok then raise exception 'one security contributed twice to one calculation'; end if;
  end;

  -- Constituent rows are immutable once written.
  ok := false;
  begin
    update pipeline.ugai_constituent_calculations set local_price = 999 where calculation_id = calc;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a constituent calculation was edited in place'; end if;

  raise notice 'constituent inputs: carries flagged, missing observations uncomputable';
end $$;

-- --------------------------------------------------- index shares and publication gates

do $$
declare
  ok boolean;
  mv_ugai uuid; snap uuid; blocked_snap uuid; d_dev uuid;
  iss uuid; sec uuid; lst uuid;
begin
  select mvv.id into mv_ugai from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ugai' and mvv.version = '0.2.0-draft';
  select id into snap from pipeline.universe_snapshots
   where state = 'production_eligible' and superseded_by_id is null limit 1;
  select id into blocked_snap from pipeline.universe_snapshots
   where id = 'd0000000-0000-4000-8000-000000000001';
  select id into d_dev from pipeline.ugai_divisors where state = 'development' limit 1;
  select i.id, s.id, l.id into iss, sec, lst
    from reference.issuers i
    join reference.securities s on s.issuer_id = i.id
    join reference.listings l on l.security_id = s.id
   where i.issuer_key = 'zz-fixture-calc-a';

  -- A reset sets index shares and names the snapshot it came from.
  insert into pipeline.ugai_index_shares
    (issuer_id, security_id, listing_id, index_shares, effective_from, set_by, snapshot_id, basis)
    values (iss, sec, lst, 160000, date '2026-09-17', 'scheduled_reset', snap,
            'q = w x MV / (P x X) = 0.08 x 200,000,000 / 100');

  -- Zero is legitimate: a departing security ends at q = 0.
  insert into pipeline.ugai_index_shares
    (issuer_id, security_id, listing_id, index_shares, effective_from, set_by, snapshot_id, basis)
    values (iss, sec, lst, 0, date '2026-12-17', 'event_snapshot_removal', snap,
            'removed at the parent event snapshot; index shares go to zero');

  -- A reset must name its snapshot. Index shares are fully determined by the parent snapshot and
  -- announced corporate-action terms, and a reset with no snapshot is determined by nothing.
  ok := false;
  begin
    insert into pipeline.ugai_index_shares
      (issuer_id, security_id, listing_id, index_shares, effective_from, set_by, basis)
      values (iss, sec, lst, 1000, date '2026-11-01', 'scheduled_reset', 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a reset set index shares without naming a snapshot'; end if;

  -- Index shares are append-only.
  ok := false;
  begin
    update pipeline.ugai_index_shares set index_shares = 1 where effective_from = date '2026-09-17';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'index shares were edited in place'; end if;

  -- ------------------------------------------------------------ calculated is not publishable

  -- A development divisor cannot carry a publishable level, however correct its arithmetic.
  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
       snapshot_id, methodology_version_id)
      values (date '2026-11-02', 'publication_eligible', 200000000, d_dev, 200000, 1000,
              snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a development divisor produced a publishable level'; end if;

  -- Nor can a blocked snapshot.
  declare d_prod uuid;
  begin
    select id into d_prod from pipeline.ugai_divisors where state = 'production' limit 1;
    ok := false;
    begin
      insert into pipeline.ugai_calculations
        (calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
         snapshot_id, methodology_version_id)
        values (date '2026-11-03', 'publication_eligible', 5000000000, d_prod, 5000000, 1000,
                blocked_snap, mv_ugai);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a blocked snapshot produced a publishable level'; end if;
  end;

  -- A blocked calculation explains itself, and a calculated one carries all three quantities.
  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, snapshot_id, methodology_version_id)
      values (date '2026-11-04', 'blocked', snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a blocked calculation gave no reason'; end if;

  ok := false;
  begin
    insert into pipeline.ugai_calculations
      (calculation_date, state, market_value_usd, snapshot_id, methodology_version_id)
      values (date '2026-11-05', 'calculated', 200000000, snap, mv_ugai);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a calculated row was stored without a divisor and level'; end if;

  -- An unresolved publication check names the parameter it waited for.
  declare calc2 uuid;
  begin
    insert into pipeline.ugai_calculations
      (id, calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
       snapshot_id, methodology_version_id)
      values (gen_random_uuid(), date '2026-11-06', 'calculated', 200000000, d_dev, 200000, 1000,
              snap, mv_ugai)
      returning id into calc2;
    ok := false;
    begin
      insert into pipeline.ugai_publication_checks
        (calculation_id, check_name, result, basis)
        values (calc2, 'methodology_parameters_approved', 'parameter_unresolved', 'no threshold');
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an unresolved publication check named no parameter'; end if;

    -- Publication checks are immutable.
    insert into pipeline.ugai_publication_checks
      (calculation_id, check_name, result, basis)
      values (calc2, 'divisor_valid', 'passed', 'a development divisor, valid for a development run');
    ok := false;
    begin
      update pipeline.ugai_publication_checks set result = 'failed' where calculation_id = calc2;
    exception when restrict_violation then ok := true;
    end;
    if not ok then raise exception 'a publication check was edited in place'; end if;
  end;

  raise notice 'index shares and publication gates: calculated is not publishable';
end $$;

-- -------------------------------------------------- corrections, and fixture isolation

do $$
declare
  ok boolean; n integer;
  mv_ugai uuid; snap uuid; d_dev uuid; original uuid; corrected uuid;
begin
  select mvv.id into mv_ugai from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ugai' and mvv.version = '0.2.0-draft';
  select id into snap from pipeline.universe_snapshots
   where state = 'production_eligible' and superseded_by_id is null limit 1;
  select id into d_dev from pipeline.ugai_divisors where state = 'development' limit 1;

  insert into pipeline.ugai_calculations
    (id, calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
     snapshot_id, methodology_version_id)
    values (gen_random_uuid(), date '2026-12-01', 'calculated', 200000000, d_dev, 200000, 1000,
            snap, mv_ugai)
    returning id into original;

  -- A corrected source observation supersedes rather than rewriting. The original level stays
  -- readable, which is the whole point: "what did UGAI say that day" must remain answerable.
  corrected := gen_random_uuid();
  update pipeline.ugai_calculations
     set superseded_by_id = corrected, superseded_at = now(),
         supersession_reason = 'the exchange published a corrected official close'
   where id = original;
  insert into pipeline.ugai_calculations
    (id, calculation_date, state, market_value_usd, divisor_id, divisor, index_level,
     snapshot_id, methodology_version_id, supersession_reason)
    values (corrected, date '2026-12-01', 'calculated', 202000000, d_dev, 200000, 1010,
            snap, mv_ugai, 'supersedes the original calculation for this date');

  select count(*) into n from pipeline.ugai_calculations
   where id = original and index_level = 1000 and superseded_by_id = corrected;
  if n <> 1 then raise exception 'the original level did not survive its correction'; end if;

  ok := false;
  begin
    update pipeline.ugai_calculations set index_level = 1 where id = corrected;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a calculation was edited in place'; end if;

  -- Fixtures never touched a real issuer.
  select count(*) into n from pipeline.ugai_constituent_calculations cc
    join reference.issuers i on i.id = cc.issuer_id
   where i.issuer_key not like 'zz-fixture-%';
  if n <> 0 then raise exception '% real issuer(s) appear in a fixture calculation', n; end if;
  select count(*) into n from pipeline.ugai_index_shares s
    join reference.issuers i on i.id = s.issuer_id
   where i.issuer_key not like 'zz-fixture-%';
  if n <> 0 then raise exception '% real issuer(s) were given index shares', n; end if;

  raise notice 'corrections supersede; fixtures stayed isolated';
end $$;

rollback;
