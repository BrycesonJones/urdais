-- UAVI: volatility instruments, strips, constituent volatility, and the aggregation form.
--
-- One sentence is what most of the fixtures below actually test:
--
--   UAVI = 100 x SUM(v_i x sigma_i), and never 100 x sqrt(SUM(v_i x sigma^2_i)).
--
-- The second form is what version 0.1.0-draft specified, it is what the one institutional analogue
-- publishes, and it is what an implementation drifts back toward. It produces a number that is
-- larger, plausible, and wrong, on a set nobody would look at twice. So it is not defended by a
-- comment: the fixture below builds a constituent set on which the two forms differ, records the
-- root-mean-square answer, and asserts that the database refuses it.
--
-- Every fixture is synthetic and rolls back. No real issuer receives a quote, a contract, a rate
-- or a variance anywhere in this file.
begin;

-- ===================================================== what the real diagnostic recorded

do $$
declare n integer; c record;
begin
  select * into c from pipeline.uavi_calculations where id = 'e1000000-0000-4000-8000-000000000001';
  if c is null then raise exception 'the UAVI diagnostic is missing'; end if;
  if c.state <> 'blocked' then raise exception 'the diagnostic is % rather than blocked', c.state; end if;
  if c.index_level is not null or c.covered_parent_weight is not null
     or c.covered_issuer_count is not null then
    raise exception 'the blocked diagnostic carries a level or a coverage figure';
  end if;
  -- Blocked, not unavailable. The arithmetic never began, so no gate was reached and asserting a
  -- gate failure would claim a measurement nobody made.
  if c.unavailable_reason is not null then
    raise exception 'the diagnostic claims the gate refused it (%) when the calculation never ran', c.unavailable_reason;
  end if;

  -- The snapshot instant resolved through the named zone. 17 September 2026 is daylight time in
  -- New York, so 15:45 local is 19:45Z; the same local time in January is 20:45Z, and neither is
  -- hard-coded anywhere.
  if c.snapshot_timestamp <> timestamptz '2026-09-17 19:45:00+00' then
    raise exception 'the snapshot instant resolved to % rather than 19:45Z', c.snapshot_timestamp;
  end if;

  -- Nothing is initialized, and nothing was fabricated to look as though it were.
  select count(*) into n from reference.options_venues;
  if n <> 0 then raise exception '% options venue(s) are registered', n; end if;
  select count(*) into n from reference.option_contracts;
  if n <> 0 then raise exception '% option contract(s) exist', n; end if;
  select count(*) into n from pipeline.option_quote_observations;
  if n <> 0 then raise exception '% option quote(s) exist', n; end if;
  select count(*) into n from pipeline.risk_free_rate_observations;
  if n <> 0 then raise exception '% risk-free rate(s) exist', n; end if;
  select count(*) into n from pipeline.uavi_constituent_variances;
  if n <> 0 then raise exception '% constituent variance(s) exist', n; end if;
  select count(*) into n from pipeline.uavi_calculations;
  if n <> 1 then raise exception 'expected exactly 1 calculation row, found % -- history was fabricated', n; end if;

  -- The publication checks keep their outcomes apart rather than collapsing to a boolean.
  select count(*) into n from pipeline.uavi_publication_checks
   where calculation_id = c.id and result = 'parameter_unresolved' and parameter_key is not null;
  if n <> 1 then raise exception 'expected 1 parameter-unresolved check, found %', n; end if;
  select count(*) into n from pipeline.uavi_publication_checks
   where calculation_id = c.id and result = 'failed';
  if n <> 5 then raise exception 'expected 5 failing checks, found %', n; end if;
  select count(*) into n from pipeline.uavi_publication_checks
   where calculation_id = c.id and btrim(basis) = '';
  if n <> 0 then raise exception '% check(s) give no basis', n; end if;

  -- The issuer-count gate is assessable without any option data and fails on arithmetic alone;
  -- the coverage gate is not assessable at all. Keeping them apart is the point.
  if (select result from pipeline.uavi_publication_checks
       where calculation_id = c.id and check_name = 'covered_issuer_count_gate') <> 'failed' then
    raise exception 'the issuer-count gate should fail on two eligible issuers against a minimum of eight';
  end if;
  if (select result from pipeline.uavi_publication_checks
       where calculation_id = c.id and check_name = 'covered_parent_weight_gate') <> 'unavailable' then
    raise exception 'the coverage gate should be unassessable, not failed';
  end if;

  raise notice 'uavi diagnostic: blocked, no level, no option data, no fabricated history';
end $$;

-- ===================================================== the frozen parameter set

do $$
declare n integer; v numeric; t text;
begin
  select p.numeric_value into v from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where p.parameter_key = 'min_covered_parent_weight' and p.status = 'approved';
  if v is distinct from 0.80 then raise exception 'the coverage gate is % rather than 0.80', v; end if;

  select p.numeric_value into v from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where p.parameter_key = 'min_covered_issuer_count' and p.status = 'approved';
  if v is distinct from 8 then raise exception 'the issuer-count gate is % rather than 8', v; end if;

  -- The aggregation form is a parameter, so "which form does UAVI publish" is a query.
  select p.text_value into t from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where p.parameter_key = 'aggregation_form' and p.status = 'approved';
  if t <> 'weighted_arithmetic_mean_of_constituent_volatility' then
    raise exception 'the aggregation form parameter reads %', t;
  end if;

  -- There is no concentration gate, and that is recorded rather than merely absent.
  select p.text_value into t from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where p.parameter_key = 'concentration_publication_gate' and p.status = 'approved';
  if t <> 'none' then raise exception 'a concentration gate was introduced: %', t; end if;

  -- The genuinely unresolved ones stay draft and therefore carry no effective date.
  select count(*) into n from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where p.parameter_key in ('usd_rate_curve_family', 'quote_freshness_tolerance',
                             'publication_deadline', 'correction_window')
     and p.status = 'draft' and p.effective_from is null;
  if n <> 4 then raise exception 'expected 4 unresolved UAVI parameters, found %', n; end if;

  -- UAVI's own methodology version is a draft and must carry no production effective date.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where mv.status = 'draft' and mv.effective_from is null and mv.version = '0.2.0-draft';
  if n <> 1 then raise exception 'UAVI 0.2.0-draft is not a draft without an effective date'; end if;

  -- 0.1.0-draft is deliberately unregistered: it was never approved, never published under, and
  -- its formula is not what this code computes.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
   where mv.version = '0.1.0-draft';
  if n <> 0 then raise exception 'the superseded RMS draft was registered as a version'; end if;

  raise notice 'uavi parameters: gates frozen at 0.80 / 8, no concentration gate, 4 unresolved';
end $$;

-- ===================================================== volatility instrument mapping

do $$
declare
  ok boolean; n integer;
  mv uuid; ven_us uuid; ven_xx uuid;
  iss_a uuid; iss_b uuid;
  sec_ord uuid; sec_adr uuid; sec_other uuid; sec_foreign uuid;
  lst_ord uuid; lst_adr uuid; lst_other uuid; lst_foreign uuid;
  vi_rep uuid; vi_adr uuid;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id and m.slug = 'uavi'
   where mvv.version = '0.2.0-draft';

  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XUSF', 'US Fixture Venue', 'US', 'USD', 'America/New_York') returning id into ven_us;
  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XTWF', 'Taiwan Fixture Venue', 'TW', 'TWD', 'Asia/Taipei') returning id into ven_xx;

  insert into reference.issuers (issuer_key, canonical_name) values ('zz-uavi-a', 'Fixture UAVI A')
    returning id into iss_a;
  insert into reference.issuers (issuer_key, canonical_name) values ('zz-uavi-b', 'Fixture UAVI B')
    returning id into iss_b;

  -- Issuer A: a home ordinary line abroad, and a sponsored US receipt over it.
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss_a, 'ordinary_share', 'TWD') returning id into sec_foreign;
  insert into reference.securities
    (issuer_id, security_type, denomination_currency, is_depositary_receipt,
     receipt_ratio_numerator, receipt_ratio_denominator)
    values (iss_a, 'depositary_receipt', 'USD', true, 5, 1) returning id into sec_adr;
  -- Issuer A also has a US ordinary line, used to prove the representative wins over the receipt.
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss_a, 'ordinary_share', 'USD') returning id into sec_ord;
  -- Issuer B: an unrelated US ordinary line.
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss_b, 'ordinary_share', 'USD') returning id into sec_other;

  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec_foreign, ven_xx, 'ZZA', 'TWD', date '2020-01-01') returning id into lst_foreign;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec_adr, ven_us, 'ZZAY', 'USD', date '2020-01-01') returning id into lst_adr;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec_ord, ven_us, 'ZZAO', 'USD', date '2020-01-01') returning id into lst_ord;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec_other, ven_us, 'ZZB', 'USD', date '2020-01-01') returning id into lst_other;

  -- ---- an unrelated security is refused outright. This is the check that stops one company's
  -- volatility being published under another company's weight.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_other, lst_other, sec_other, 'representative', 1, 'verified',
              'an unrelated issuer''s line', mv, date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a different issuer''s security was accepted as a volatility instrument'; end if;

  -- ---- a non-US listing is refused: the measurement basis is US-listed options.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_foreign, lst_foreign, sec_foreign, 'representative', 1, 'verified',
              'the home ordinary line', mv, date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a non-US listing was accepted as a volatility instrument'; end if;

  -- ---- a receipt cannot enter through the representative route.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_adr, lst_adr, sec_adr, 'representative', 1, 'verified',
              'a receipt calling itself the representative', mv, date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a depositary receipt was accepted through the representative route'; end if;

  -- ---- an unsponsored receipt is refused.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, is_sponsored, receipt_ratio_numerator, receipt_ratio_denominator,
       mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_adr, lst_adr, sec_foreign, 'adr', 2, false, 5, 1, 'verified',
              'an unsponsored programme', mv, date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unsponsored depositary programme was accepted'; end if;

  -- ---- a receipt whose recorded ratio disagrees with the security master is refused. Two places
  -- for one number is two chances to disagree.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, is_sponsored, receipt_ratio_numerator, receipt_ratio_denominator,
       mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_adr, lst_adr, sec_foreign, 'adr', 2, true, 3, 1, 'verified',
              'a ratio nobody reconciled', mv, date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a receipt ratio contradicting the security master was accepted'; end if;

  -- ---- the legitimate pair: a representative mapping at rank 1 and a receipt mapping at rank 2
  -- for the same issuer. Both may exist; the waterfall is what decides between them, and the
  -- ordering is data rather than a rule somebody has to remember.
  insert into pipeline.uavi_volatility_instruments
    (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
     mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
    values (iss_a, sec_ord, lst_ord, sec_ord, 'representative', 1, 'verified',
            'the US ordinary line', mv, date '2026-01-01') returning id into vi_rep;
  insert into pipeline.uavi_volatility_instruments
    (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
     mapping_type, preference_rank, is_sponsored, receipt_ratio_numerator, receipt_ratio_denominator,
     mapping_state, basis, methodology_version_id, effective_from)
    values (iss_a, sec_adr, lst_adr, sec_ord, 'adr', 2, true, 5, 1, 'verified',
            'a sponsored US receipt, ranked below the representative', mv, date '2026-01-01')
    returning id into vi_adr;

  -- The representative is strictly preferred, and preference is by rank rather than by any
  -- measure of the option market. If liquidity could reverse it, a constituent's measured
  -- volatility would move because its option markets moved relative to each other.
  if (select volatility_security_id from pipeline.uavi_volatility_instruments
       where issuer_id = iss_a and superseded_by_id is null and effective_to is null
       order by preference_rank limit 1) <> sec_ord then
    raise exception 'the waterfall did not prefer the representative security';
  end if;

  -- ---- two mappings of the same route for one issuer is refused.
  ok := false;
  begin
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
      values (iss_a, sec_ord, lst_ord, sec_ord, 'representative', 1, 'verified',
              'a second representative', mv, date '2026-02-01');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two current representative mappings for one issuer were accepted'; end if;

  raise notice 'uavi mapping: same-issuer enforced, US-listed enforced, representative ranked first';
end $$;

-- ===================================================== constituent variance arithmetic

do $$
declare
  ok boolean;
  mv uuid; iss uuid; sec uuid; lst uuid; ven uuid; vi uuid; cv uuid;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id and m.slug = 'uavi'
   where mvv.version = '0.2.0-draft';
  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XUSV', 'US Variance Fixture', 'US', 'USD', 'America/New_York') returning id into ven;
  insert into reference.issuers (issuer_key, canonical_name) values ('zz-uavi-v', 'Fixture UAVI V')
    returning id into iss;
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss, 'ordinary_share', 'USD') returning id into sec;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec, ven, 'ZZV', 'USD', date '2020-01-01') returning id into lst;
  insert into pipeline.uavi_volatility_instruments
    (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
     mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
    values (iss, sec, lst, sec, 'representative', 1, 'verified', 'fixture', mv, date '2026-01-01')
    returning id into vi;

  -- ---- sigma must be the square root of the variance. A percent stored where a decimal belongs
  -- -- 42.60 for 0.426 -- passes every range check on the table and is wrong by four orders of
  -- magnitude at the headline once it is squared.
  ok := false;
  begin
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
       status, sigma_30, variance_30, near_expiration, next_expiration,
       near_variance, next_variance, near_minutes, next_minutes,
       snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', iss, vi, sec, 'representative', 'valid',
              0.20, 0.09, date '2026-10-02', date '2026-11-06', 0.04, 0.04, 20000, 60000,
              now(), mv);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a variance that is not the square of its sigma was accepted'; end if;

  -- ---- the 30-day figure must reproduce from its two terms by the variance-space interpolation.
  -- A direct interpolation of the two VOLATILITIES lands close enough to look right and never
  -- reproduces, which is why the methodology forbids it and why this is checked rather than
  -- trusted.
  ok := false;
  begin
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
       status, sigma_30, variance_30, near_expiration, next_expiration,
       near_variance, next_variance, near_minutes, next_minutes,
       snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', iss, vi, sec, 'representative', 'valid',
              0.20, 0.04, date '2026-10-02', date '2026-11-06', 0.01, 0.09, 20000, 60000,
              now(), mv);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a 30-day variance that does not reproduce from its terms was accepted'; end if;

  -- ---- the two terms must bracket the 30-day horizon. Outside the bracket the same formula is
  -- an extrapolation.
  ok := false;
  begin
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
       status, sigma_30, variance_30, near_expiration, next_expiration,
       near_variance, next_variance, near_minutes, next_minutes,
       snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', iss, vi, sec, 'representative', 'valid',
              0.20, 0.04, date '2026-10-02', date '2026-11-06', 0.04, 0.04, 44000, 60000,
              now(), mv);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'two terms that do not bracket 30 days were accepted'; end if;

  -- ---- an uncovered row must say why.
  ok := false;
  begin
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, status, snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', iss, 'uncovered', now(), mv);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an uncovered constituent without a reason was accepted'; end if;

  -- ---- the legitimate row, and then the duplicate that must not join it.
  insert into pipeline.uavi_constituent_variances
    (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
     status, sigma_30, variance_30, near_expiration, next_expiration,
     near_variance, next_variance, near_minutes, next_minutes,
     snapshot_timestamp, methodology_version_id)
    values (date '2026-09-18', iss, vi, sec, 'representative', 'valid',
            0.20, 0.04, date '2026-10-02', date '2026-11-06', 0.04, 0.04, 20000, 60000,
            now(), mv) returning id into cv;

  ok := false;
  begin
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, status, uncovered_reason, snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', iss, 'uncovered', 'option_data_missing', now(), mv);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a duplicate constituent variance for one issuer and session was accepted'; end if;

  raise notice 'uavi constituent variance: sigma^2 checked, variance-space interpolation checked, no duplicates';
end $$;

-- ===================================================== THE aggregation form

do $$
declare
  ok boolean;
  mv uuid; ven uuid; calc uuid;
  iss uuid[]; sec uuid; lst uuid; vi uuid; cv uuid;
  i integer;
  sig numeric[] := array[0.20, 0.60];
  arithmetic_level numeric; rms_level numeric;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id and m.slug = 'uavi'
   where mvv.version = '0.2.0-draft';
  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XUSA', 'US Aggregation Fixture', 'US', 'USD', 'America/New_York') returning id into ven;

  -- Two equally weighted constituents at 20% and 60% volatility. The two aggregation forms give
  -- materially different answers here, which is the entire point of the fixture:
  --
  --   arithmetic  100 x (0.5 x 0.20 + 0.5 x 0.60)            = 40.000000
  --   RMS         100 x sqrt(0.5 x 0.04 + 0.5 x 0.36)        = 44.721360
  --
  -- A regression to the second is a four-point error on a volatility index, which is a large move
  -- and looks like nothing at all.
  arithmetic_level := 100 * (0.5 * sig[1] + 0.5 * sig[2]);
  rms_level := 100 * sqrt(0.5 * sig[1] * sig[1] + 0.5 * sig[2] * sig[2]);
  if abs(arithmetic_level - 40) > 1e-9 then raise exception 'fixture arithmetic drifted'; end if;
  if abs(rms_level - 44.721359549995794) > 1e-9 then raise exception 'fixture RMS drifted'; end if;

  iss := array[]::uuid[];
  for i in 1..2 loop
    insert into reference.issuers (issuer_key, canonical_name)
      values ('zz-uavi-agg-' || i, 'Fixture Agg ' || i) returning id into sec;  -- reuse sec as scratch
    iss := array_append(iss, sec);
  end loop;

  -- ---- the root-mean-square level is REFUSED.
  ok := false;
  begin
    insert into pipeline.uavi_calculations
      (calculation_date, state, index_level, covered_parent_weight, covered_issuer_count,
       uncovered_issuer_count, max_renormalized_weight, effective_issuer_count,
       snapshot_timestamp, methodology_version_id)
      values (date '2026-09-18', 'calculated', rms_level, 1.0, 2, 0, 0.5, 2.0, now(), mv)
      returning id into calc;
    for i in 1..2 loop
      insert into reference.securities (issuer_id, security_type, denomination_currency)
        values (iss[i], 'ordinary_share', 'USD') returning id into sec;
      insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
        values (sec, ven, 'ZAG' || i, 'USD', date '2020-01-01') returning id into lst;
      insert into pipeline.uavi_volatility_instruments
        (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
         mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
        values (iss[i], sec, lst, sec, 'representative', 1, 'verified', 'fixture', mv, date '2026-01-01')
        returning id into vi;
      insert into pipeline.uavi_constituent_variances
        (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
         status, sigma_30, variance_30, near_expiration, next_expiration,
         near_variance, next_variance, near_minutes, next_minutes,
         snapshot_timestamp, methodology_version_id)
        values (date '2026-09-18', iss[i], vi, sec, 'representative', 'valid',
                sig[i], sig[i] * sig[i], date '2026-10-02', date '2026-11-06',
                sig[i] * sig[i], sig[i] * sig[i], 20000, 60000, now(), mv)
        returning id into cv;
      insert into pipeline.uavi_constituent_calculations
        (calculation_id, issuer_id, constituent_variance_id, volatility_security_id, mapping_type,
         parent_weight, renormalized_weight, sigma_30, weight_contribution, is_covered)
        values (calc, iss[i], cv, sec, 'representative', 0.5, 0.5, sig[i], 0.5 * sig[i], true);
    end loop;
    set constraints pipeline.uavi_calculations_level_check immediate;
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'the root-mean-square level % was ACCEPTED; UAVI has regressed to the 0.1.0-draft aggregation form', rms_level;
  end if;

  raise notice 'uavi aggregation: the RMS level 44.72 was refused where the arithmetic mean is 40.00';
end $$;

-- ---- and the arithmetic level is accepted, in its own transaction so the refusal above does not
-- contaminate it.
do $$
declare
  mv uuid; ven uuid; calc uuid; iss uuid; sec uuid; lst uuid; vi uuid; cv uuid;
  i integer; ok boolean;
  sig numeric[] := array[0.20, 0.60];
  ids uuid[] := array[]::uuid[];
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id and m.slug = 'uavi'
   where mvv.version = '0.2.0-draft';
  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XUSB', 'US Aggregation Fixture B', 'US', 'USD', 'America/New_York') returning id into ven;

  insert into pipeline.uavi_calculations
    (calculation_date, state, index_level, covered_parent_weight, covered_issuer_count,
     uncovered_issuer_count, max_renormalized_weight, effective_issuer_count,
     snapshot_timestamp, methodology_version_id)
    values (date '2026-09-19', 'calculated', 40.0, 1.0, 2, 0, 0.5, 2.0, now(), mv)
    returning id into calc;

  for i in 1..2 loop
    insert into reference.issuers (issuer_key, canonical_name)
      values ('zz-uavi-ok-' || i, 'Fixture Ok ' || i) returning id into iss;
    insert into reference.securities (issuer_id, security_type, denomination_currency)
      values (iss, 'ordinary_share', 'USD') returning id into sec;
    insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
      values (sec, ven, 'ZOK' || i, 'USD', date '2020-01-01') returning id into lst;
    insert into pipeline.uavi_volatility_instruments
      (issuer_id, volatility_security_id, volatility_listing_id, representative_security_id,
       mapping_type, preference_rank, mapping_state, basis, methodology_version_id, effective_from)
      values (iss, sec, lst, sec, 'representative', 1, 'verified', 'fixture', mv, date '2026-01-01')
      returning id into vi;
    insert into pipeline.uavi_constituent_variances
      (session_date, issuer_id, volatility_instrument_id, volatility_security_id, mapping_type,
       status, sigma_30, variance_30, near_expiration, next_expiration,
       near_variance, next_variance, near_minutes, next_minutes,
       snapshot_timestamp, methodology_version_id)
      values (date '2026-09-19', iss, vi, sec, 'representative', 'valid',
              sig[i], sig[i] * sig[i], date '2026-10-02', date '2026-11-06',
              sig[i] * sig[i], sig[i] * sig[i], 20000, 60000, now(), mv)
      returning id into cv;
    insert into pipeline.uavi_constituent_calculations
      (calculation_id, issuer_id, constituent_variance_id, volatility_security_id, mapping_type,
       parent_weight, renormalized_weight, sigma_30, weight_contribution, is_covered)
      values (calc, iss, cv, sec, 'representative', 0.5, 0.5, sig[i], 0.5 * sig[i], true);
  end loop;
  set constraints pipeline.uavi_calculations_level_check immediate;

  raise notice 'uavi aggregation: the arithmetic level 40.00 was accepted';

  -- ---- and a publication-eligible calculation on this set is refused by the issuer-count gate:
  -- two covered issuers against a frozen minimum of eight.
  ok := false;
  begin
    insert into pipeline.uavi_calculations
      (calculation_date, state, index_level, covered_parent_weight, covered_issuer_count,
       uncovered_issuer_count, max_renormalized_weight, effective_issuer_count,
       snapshot_timestamp, snapshot_id, methodology_version_id)
      values (date '2026-09-20', 'publication_eligible', 40.0, 1.0, 2, 0, 0.5, 2.0, now(),
              'd0000000-0000-4000-8000-000000000001', mv)
      returning id into calc;
    insert into pipeline.uavi_constituent_calculations
      (calculation_id, issuer_id, constituent_variance_id, volatility_security_id, mapping_type,
       parent_weight, renormalized_weight, sigma_30, weight_contribution, is_covered)
      select calc, cvv.issuer_id, cvv.id, cvv.volatility_security_id, 'representative',
             0.5, 0.5, cvv.sigma_30, 0.5 * cvv.sigma_30, true
        from pipeline.uavi_constituent_variances cvv where cvv.session_date = date '2026-09-19';
    set constraints pipeline.uavi_calculations_level_check immediate;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a headline published on two covered issuers against a gate of eight'; end if;

  raise notice 'uavi gates: two covered issuers cannot publish against the frozen minimum of eight';
end $$;

-- ===================================================== option contracts, quotes and rates

do $$
declare
  ok boolean;
  ven uuid; ovenue uuid; iss uuid; sec uuid; lst uuid;
  iface uuid; grt uuid; ctr uuid;
  snap timestamptz := timestamptz '2026-09-18 19:45:00+00';
begin
  select id into iface from reference.source_interfaces where slug = 'tw-twse-openapi-daily';
  select id into grt from reference.permission_grants where source_interface_id = iface limit 1;

  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XOPT', 'US Options Fixture', 'US', 'USD', 'America/New_York') returning id into ven;
  insert into reference.options_venues
    (venue_id, standard_series, weekly_series_listed, expiration_time_local, expiration_timezone,
     exercise_style, settlement_style, admission_state, admission_evidence_url, admission_basis,
     effective_from)
    values (ven, array['standard_monthly'], true, time '16:00:00', 'America/New_York',
            'american', 'physical', 'registered', 'https://example.invalid/spec',
            'fixture venue', date '2020-01-01')
    returning id into ovenue;

  insert into reference.issuers (issuer_key, canonical_name) values ('zz-uavi-opt', 'Fixture Opt')
    returning id into iss;
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss, 'ordinary_share', 'USD') returning id into sec;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (sec, ven, 'ZOP', 'USD', date '2020-01-01') returning id into lst;

  -- ---- an expiration instant that lands on the wrong date in the venue's own zone is refused.
  -- This is the daylight-saving guard: a timestamp built as "date + 16:00 at a hard-coded UTC-5"
  -- is an hour off for half the year and can cross midnight.
  ok := false;
  begin
    insert into reference.option_contracts
      (underlying_security_id, options_venue_id, contract_symbol, option_right, strike,
       strike_currency, expiration_date, expiration_timestamp, exercise_style, settlement_style,
       contract_multiplier, series_state, expiration_series, effective_from)
      values (sec, ovenue, 'ZOP261016C100', 'call', 100, 'USD', date '2026-10-16',
              timestamptz '2026-10-17 04:00:00+00', 'american', 'physical', 100,
              'standard', 'standard_monthly', date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an expiration instant falling on the wrong local date was accepted'; end if;

  -- ---- a contract contradicting its venue's exercise style is a reference-data conflict.
  ok := false;
  begin
    insert into reference.option_contracts
      (underlying_security_id, options_venue_id, contract_symbol, option_right, strike,
       strike_currency, expiration_date, expiration_timestamp, exercise_style, settlement_style,
       contract_multiplier, series_state, expiration_series, effective_from)
      values (sec, ovenue, 'ZOP261016C101', 'call', 101, 'USD', date '2026-10-16',
              (date '2026-10-16' + time '16:00') at time zone 'America/New_York',
              'european', 'physical', 100, 'standard', 'standard_monthly', date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a contract contradicting its venue exercise style was accepted'; end if;

  -- ---- the legitimate contract.
  insert into reference.option_contracts
    (underlying_security_id, options_venue_id, contract_symbol, option_right, strike,
     strike_currency, expiration_date, expiration_timestamp, exercise_style, settlement_style,
     contract_multiplier, series_state, expiration_series, effective_from)
    values (sec, ovenue, 'ZOP261016C100', 'call', 100, 'USD', date '2026-10-16',
            (date '2026-10-16' + time '16:00') at time zone 'America/New_York',
            'american', 'physical', 100, 'standard', 'standard_monthly', date '2026-01-01')
    returning id into ctr;

  -- ---- a quote timestamped after the official instant is look-ahead within the session.
  ok := false;
  begin
    insert into pipeline.option_quote_observations
      (contract_id, session_date, quote_timestamp, snapshot_timestamp, is_snapshot_packet,
       bid, ask, source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (ctr, date '2026-09-18', snap + interval '1 second', snap, false,
              1.00, 1.10, iface, grt, 'fixture', 'uavi:test:lookahead');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a quote timestamped after the snapshot instant was accepted'; end if;

  -- ---- a snapshot packet must be stamped AT the instant; one stamped earlier is a mislabelled
  -- tape reconstruction, and the freshness question only arises for reconstructions.
  ok := false;
  begin
    insert into pipeline.option_quote_observations
      (contract_id, session_date, quote_timestamp, snapshot_timestamp, is_snapshot_packet,
       bid, ask, source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (ctr, date '2026-09-18', snap - interval '5 minutes', snap, true,
              1.00, 1.10, iface, grt, 'fixture', 'uavi:test:mislabelled');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a snapshot packet stamped before the instant was accepted'; end if;

  -- ---- a valid quote, including a LOCKED market where ask = bid. A locked market satisfies
  -- ask >= bid exactly and is an unusually tight quote rather than a malformed one; only a
  -- crossed market fails the predicate, and there is no separate locked-market screen.
  insert into pipeline.option_quote_observations
    (contract_id, session_date, quote_timestamp, snapshot_timestamp, is_snapshot_packet,
     bid, ask, source_interface_id, permission_grant_id, attribution, idempotency_key)
    values (ctr, date '2026-09-18', snap - interval '3 seconds', snap, false,
            1.05, 1.05, iface, grt, 'fixture', 'uavi:test:locked');

  -- ---- one quote per contract per session.
  ok := false;
  begin
    insert into pipeline.option_quote_observations
      (contract_id, session_date, quote_timestamp, snapshot_timestamp, is_snapshot_packet,
       bid, ask, source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (ctr, date '2026-09-18', snap, snap, true,
              1.00, 1.10, iface, grt, 'fixture', 'uavi:test:duplicate');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a duplicate quote for one contract and session was accepted'; end if;

  -- ---- a production rate is refused while the curve family is unresolved. The unresolved
  -- parameter reaches into the data rather than sitting in a document nobody queries.
  ok := false;
  begin
    insert into pipeline.risk_free_rate_observations
      (currency, observation_date, maturity_date, observation_timestamp, continuous_rate,
       curve_family, source_basis, interpolation_method, observation_purpose, idempotency_key)
      values ('USD', date '2026-09-18', date '2026-10-16', snap, 0.0412,
              'fixture curve', 'act/365 annually compounded', 'linear on yield',
              'production', 'uavi:test:rate:prod');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production rate was accepted while the curve family is unresolved'; end if;

  -- ---- a non-USD production rate has no consumer in V1 and is refused.
  ok := false;
  begin
    insert into pipeline.risk_free_rate_observations
      (currency, observation_date, maturity_date, observation_timestamp, continuous_rate,
       curve_family, source_basis, interpolation_method, observation_purpose, idempotency_key)
      values ('EUR', date '2026-09-18', date '2026-10-16', snap, 0.0212,
              'fixture curve', 'act/360', 'linear', 'production', 'uavi:test:rate:eur');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a non-USD production rate was accepted'; end if;

  -- ---- a research rate is fine, and a negative one is stored as observed rather than floored.
  insert into pipeline.risk_free_rate_observations
    (currency, observation_date, maturity_date, observation_timestamp, continuous_rate,
     curve_family, source_basis, interpolation_method, observation_purpose, idempotency_key)
    values ('USD', date '2026-09-18', date '2026-10-16', snap, -0.0025,
            'fixture curve', 'act/365', 'linear', 'research', 'uavi:test:rate:neg');

  raise notice 'uavi option data: look-ahead refused, locked quote admitted, production rate blocked';
end $$;

rollback;
