-- Universe snapshots and capped weights.
--
-- The valuation fixtures below are synthetic and live entirely inside this transaction, which
-- rolls back. That is deliberate and not merely tidy: proving the arithmetic requires complete
-- inputs, and writing a complete input for NVIDIA, Palantir or TSMC would put a fabricated price
-- or float factor against a real issuer in a database whose whole point is that it does not do
-- that. Fixture issuers are prefixed `zz-fixture-` and a final assertion checks that none of them
-- ever reaches a real snapshot.
begin;

-- --------------------------------------------------------- what the real diagnostic recorded

do $$
declare n integer; s record;
begin
  select * into s from pipeline.universe_snapshots where id = 'd0000000-0000-4000-8000-000000000001';
  if s is null then raise exception 'the development diagnostic snapshot is missing'; end if;
  if s.state <> 'blocked' then raise exception 'the diagnostic snapshot is % rather than blocked', s.state; end if;
  if s.weightable_issuer_count <> 0 then raise exception 'the diagnostic weighted % issuer(s)', s.weightable_issuer_count; end if;
  if s.cap_feasible then raise exception 'the diagnostic claims cap feasibility at 2 issuers'; end if;

  -- No production snapshot exists anywhere, and none can while the cap is a draft.
  select count(*) into n from pipeline.universe_snapshots where state = 'production_eligible';
  if n <> 0 then raise exception '% production snapshot(s) exist', n; end if;
  select count(*) into n from reference.methodology_parameters
   where parameter_key = 'issuer_cap' and status = 'approved';
  if n <> 0 then raise exception 'the issuer cap was approved without a recorded decision'; end if;

  -- The eligible issuers are still in the snapshot, with their reasons. The methodology requires
  -- the coverage gap to be published rather than the issuer declared ineligible, so their
  -- disappearance would be the specific failure this asserts against.
  select count(*) into n from pipeline.snapshot_constituents
   where snapshot_id = s.id and membership_state = 'eligible_unavailable'
     and unavailable_reason is not null;
  if n <> 2 then raise exception 'expected 2 eligible-but-unavailable constituents, found %', n; end if;

  select count(*) into n from pipeline.snapshot_constituents
   where snapshot_id = s.id and membership_state = 'weighted';
  if n <> 0 then raise exception '% constituent(s) were weighted on incomplete inputs', n; end if;

  -- Every missing factor is named, so a reviewer can see which of P, N, f and X was absent.
  select count(*) into n from pipeline.snapshot_constituent_inputs
   where constituent_id in (select id from pipeline.snapshot_constituents where snapshot_id = s.id)
     and (input_state <> 'incomplete' or cardinality(missing_inputs) = 0);
  if n <> 0 then raise exception '% valuation input(s) claim completeness they do not have', n; end if;

  raise notice 'snapshot diagnostic: blocked, 2 eligible unavailable, 0 weighted';
end $$;

-- ------------------------------------------------------- valuation and weighting fixtures

do $$
declare
  ok boolean; n integer;
  mv uuid; cap_param uuid; iface uuid; grant_id uuid; ven uuid;
  snap uuid; con uuid; iss uuid; sec uuid; lst uuid;
  px uuid; sh uuid; fl uuid; fx uuid;
  mcap numeric;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ai-equity-universe' and mvv.version = '0.4.0-draft';
  select id into cap_param from reference.methodology_parameters
   where parameter_key = 'issuer_cap' and methodology_version_id = mv;
  insert into reference.venues (mic, name, country_code, default_currency, timezone)
    values ('XFIX', 'Fixture Venue', 'US', 'USD', 'America/New_York') returning id into ven;

  -- The fixtures need their own source and grant. The real TWSE grant is venue-scoped to XTAI
  -- and correctly refuses a fixture venue, which is the rights gate from Phase 5.3 working
  -- rather than an obstacle to route around.
  declare prov uuid;
  begin
    insert into reference.providers (slug, name, provider_kind)
      values ('zz-fixture-venue', 'Fixture Venue Operator', 'other') returning id into prov;
    insert into reference.source_interfaces
      (provider_id, slug, name, source_class, canonical_url, access_class, terms_review_state)
      values (prov, 'zz-fixture-prices', 'Fixture prices', 'equity_eod_price_interface',
              'https://example.invalid/fixture', 'public_unauthenticated', 'permitted')
      returning id into iface;
    insert into reference.permission_grants
      (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
       covers_internal_use, covers_index_calculation, covers_storage, covered_venues,
       effective_from, evidence)
      values (iface, 'provider_terms', 'fixture terms', true, true, true, true, true,
              array['XFIX']::text[], timestamptz '2020-01-01T00:00:00Z', 'fixture')
      returning id into grant_id;
  end;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('zz-fixture-alpha', 'Fixture Alpha', 'US') returning id into iss;
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss, 'ordinary_share', 'USD') returning id into sec;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, price_unit, effective_from)
    values (sec, ven, 'ZZA', 'USD', 'major', date '2020-01-01') returning id into lst;

  insert into pipeline.universe_snapshots
    (as_of_date, snapshot_kind, state, methodology_version_id, cap_parameter_id, cap_value)
    values (date '2026-09-17', 'development', 'development', mv, cap_param, 0.10)
    returning id into snap;
  insert into pipeline.snapshot_constituents
    (snapshot_id, issuer_id, membership_state, representative_security_id, representative_listing_id)
    values (snap, iss, 'excluded', sec, lst) returning id into con;

  -- Complete inputs: P = 100 USD, N = 1,000,000 outstanding, f = 0.8, X = 1.
  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
     source_interface_id, permission_grant_id, retrieved_at, attribution, idempotency_key)
    values (lst, date '2026-09-17', 'traded', 100, 'USD', 'major', iface, grant_id, now(),
            null, 'zz:px')
    returning id into px;
  insert into pipeline.share_observations
    (security_id, share_count_type, share_count, effective_date, source_interface_id,
     permission_grant_id, attribution, idempotency_key)
    values (sec, 'outstanding', 1000000, date '2026-09-17', iface, grant_id, null, 'zz:sh')
    returning id into sh;
  insert into pipeline.float_observations
    (security_id, effective_date, float_state, free_float_factor, determination_method, basis, idempotency_key)
    values (sec, date '2026-09-17', 'established', 0.8, 'published_by_venue', 'fixture', 'zz:fl')
    returning id into fl;
  -- The USD identity rate for this date already exists from the Phase 5.5 seed; reuse it rather
  -- than inserting a second, which the one-live-rate-per-currency-per-day index would refuse.
  select id into fx from pipeline.fx_observations
   where base_currency = 'USD' and quote_currency = 'USD' and fixing_date = date '2026-09-17'
     and superseded_by_id is null;
  if fx is null then raise exception 'the USD identity rate is missing from the seed'; end if;

  -- 100 × 1,000,000 × 0.8 × 1 = 80,000,000.
  insert into pipeline.snapshot_constituent_inputs
    (constituent_id, security_id, listing_id, economic_date, input_state,
     price_observation_id, local_price, price_currency,
     share_observation_id, share_count, share_count_type,
     float_observation_id, accessible_float_factor, fx_observation_id, fx_rate, class_market_cap_usd)
    values (con, sec, lst, date '2026-09-17', 'complete', px, 100, 'USD', sh, 1000000, 'outstanding',
            fl, 0.8, fx, 1, 80000000);
  select class_market_cap_usd into mcap from pipeline.snapshot_constituent_inputs where constituent_id = con;
  if mcap <> 80000000 then raise exception 'the fixture market cap is % rather than 80000000', mcap; end if;

  -- A product that does not reproduce from its factors is refused.
  ok := false;
  begin
    insert into pipeline.snapshot_constituent_inputs
      (constituent_id, security_id, listing_id, economic_date, input_state,
       local_price, price_currency, share_count, accessible_float_factor, fx_rate, class_market_cap_usd)
      values (con, sec, lst, date '2026-09-16', 'complete', 100, 'USD', 1000000, 0.8, 1, 99999999);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a market capitalization that does not reproduce was accepted'; end if;

  -- The split guard: a price dated differently from the valuation is refused, which is what stops
  -- a post-split price being multiplied by a pre-split share count.
  ok := false;
  begin
    insert into pipeline.snapshot_constituent_inputs
      (constituent_id, security_id, listing_id, economic_date, input_state, missing_inputs,
       price_observation_id, local_price, price_currency)
      values (con, sec, lst, date '2026-09-16', 'incomplete', array['x']::text[], px, 100, 'USD');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price from another date was used in a valuation'; end if;

  -- N must be outstanding. An issued count is the wrong type and is not normalised into the
  -- right one -- which is exactly TSMC's position.
  declare sh_issued uuid;
  begin
    insert into pipeline.share_observations
      (security_id, share_count_type, share_count, effective_date, source_interface_id,
       permission_grant_id, attribution, idempotency_key)
      values (sec, 'issued', 1200000, date '2026-09-17', iface, grant_id, null, 'zz:sh2')
      returning id into sh_issued;
    ok := false;
    begin
      insert into pipeline.snapshot_constituent_inputs
        (constituent_id, security_id, listing_id, economic_date, input_state, missing_inputs,
         share_observation_id, share_count, share_count_type)
        values (con, sec, lst, date '2026-09-17', 'incomplete', array['x']::text[], sh_issued, 1200000, 'issued');
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an issued share count was accepted where the methodology values outstanding'; end if;
  end;

  -- f may only come from an established float determination.
  declare fl_unknown uuid;
  begin
    insert into pipeline.float_observations
      (security_id, effective_date, float_state, basis, idempotency_key)
      values (sec, date '2026-09-16', 'unavailable', 'no source', 'zz:fl2') returning id into fl_unknown;
    ok := false;
    begin
      insert into pipeline.snapshot_constituent_inputs
        (constituent_id, security_id, listing_id, economic_date, input_state, missing_inputs,
         float_observation_id, accessible_float_factor)
        values (con, sec, lst, date '2026-09-16', 'incomplete', array['x']::text[], fl_unknown, 0.9);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an unavailable float determination supplied a factor'; end if;
  end;

  -- FX must be USD per unit of the price currency.
  declare fx_wrong uuid;
  begin
    -- A published rate names its source, which the fixture grant supplies. Dated a day earlier
    -- than the seeded USD/JPY cross so the one-live-rate-per-day index is not disturbed.
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       source_interface_id, permission_grant_id, idempotency_key)
      values ('USD', 'JPY', 0.0064, date '2026-09-16', now(), 'direct', iface, grant_id, 'zz:fx2')
      returning id into fx_wrong;
    ok := false;
    begin
      insert into pipeline.snapshot_constituent_inputs
        (constituent_id, security_id, listing_id, economic_date, input_state, missing_inputs,
         price_currency, fx_observation_id, fx_rate)
        values (con, sec, lst, date '2026-09-16', 'incomplete', array['x']::text[], 'USD', fx_wrong, 0.0064);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an FX observation for the wrong currency was used'; end if;
  end;

  raise notice 'valuation fixtures: P x N x f x X reproduces, wrong inputs refused';
end $$;

-- ------------------------------------------------------- snapshot gates and immutability

do $$
declare
  ok boolean; n integer;
  mv uuid; cap_param uuid; snap uuid; iss uuid; successor uuid;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ai-equity-universe' and mvv.version = '0.4.0-draft';
  select id into cap_param from reference.methodology_parameters
   where parameter_key = 'issuer_cap' and methodology_version_id = mv;
  select id into iss from reference.issuers where issuer_key = 'nvidia';

  -- A production snapshot cannot rest on a draft cap.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-17', date '2026-09-20', 'scheduled_reconstitution', 'production_eligible',
              mv, cap_param, 0.10, 20, 20, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production snapshot used a draft issuer cap'; end if;

  -- Nor name no cap at all.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-17', date '2026-09-20', 'scheduled_reconstitution', 'production_eligible',
              mv, 20, 20, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production snapshot named no issuer cap'; end if;

  -- Nor misreport the cap it used.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, snapshot_kind, state, methodology_version_id, cap_parameter_id, cap_value)
      values (date '2026-09-17', 'development', 'development', mv, cap_param, 0.25);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a snapshot recorded a cap its parameter does not carry'; end if;

  -- A development snapshot can never be production-eligible, whatever else is true of it.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-17', date '2026-09-20', 'development', 'production_eligible',
              mv, cap_param, 0.10, 20, 20, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a development snapshot was marked production-eligible'; end if;

  -- A blocked snapshot says why.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, snapshot_kind, state, methodology_version_id)
      values (date '2026-08-01', 'development', 'blocked', mv);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a blocked snapshot gave no reason'; end if;

  -- One issuer appears once. A dual listing cannot become two memberships.
  insert into pipeline.universe_snapshots
    (id, as_of_date, snapshot_kind, state, methodology_version_id, cap_parameter_id, cap_value)
    values (gen_random_uuid(), date '2026-08-02', 'development', 'development', mv, cap_param, 0.10)
    returning id into snap;
  -- An eligible-unavailable constituent must state its reason. This is the row that publishes
  -- the coverage gap, and without a reason it publishes nothing.
  ok := false;
  begin
    insert into pipeline.snapshot_constituents (snapshot_id, issuer_id, membership_state)
      values (snap, iss, 'eligible_unavailable');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an eligible-unavailable constituent gave no reason'; end if;

  insert into pipeline.snapshot_constituents
    (snapshot_id, issuer_id, membership_state, unavailable_reason)
    values (snap, iss, 'eligible_unavailable', 'no rights-cleared price source');
  ok := false;
  begin
    insert into pipeline.snapshot_constituents
      (snapshot_id, issuer_id, membership_state, unavailable_reason)
      values (snap, iss, 'eligible_unavailable', 'the same issuer through its other listing');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'one issuer held two memberships in a snapshot'; end if;

  -- A weighted constituent carries both weights and its lineage, or it is not weighted.
  ok := false;
  begin
    insert into pipeline.snapshot_constituents
      (snapshot_id, issuer_id, membership_state, accessible_market_cap_usd)
      values (snap, (select id from reference.issuers where issuer_key = 'tsmc'), 'weighted', 1000);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a weighted constituent was stored without its weights'; end if;

  -- Constituent rows are immutable. A correction supersedes the snapshot.
  ok := false;
  begin
    update pipeline.snapshot_constituents set membership_state = 'weighted' where snapshot_id = snap;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a snapshot constituent was edited in place'; end if;

  ok := false;
  begin
    delete from pipeline.snapshot_constituents where snapshot_id = snap;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a snapshot constituent was deleted'; end if;

  -- Supersession preserves the original, which stays queryable with its own date.
  successor := gen_random_uuid();
  update pipeline.universe_snapshots
     set superseded_by_id = successor, superseded_at = now(),
         supersession_reason = 'a corrected input arrived after formation'
   where id = snap;
  insert into pipeline.universe_snapshots
    (id, as_of_date, snapshot_kind, state, methodology_version_id, cap_parameter_id, cap_value)
    values (successor, date '2026-08-02', 'development', 'development', mv, cap_param, 0.10);
  select count(*) into n from pipeline.universe_snapshots
   where id = snap and superseded_by_id = successor and as_of_date = date '2026-08-02';
  if n <> 1 then raise exception 'the superseded snapshot did not survive'; end if;

  ok := false;
  begin
    update pipeline.universe_snapshots set state = 'production_eligible' where id = successor;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a snapshot was promoted in place'; end if;

  raise notice 'snapshot gates: production requires an approved cap, rows are immutable';
end $$;

-- ------------------------------------------------- cap feasibility at the database boundary

do $$
declare
  ok boolean;
  mv uuid; approved_cap uuid;
begin
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ai-equity-universe' and mvv.version = '0.4.0-draft';

  -- Approve a cap inside this transaction so the feasibility gate can be exercised at all. It
  -- rolls back; nothing outside this test sees an approved cap.
  insert into reference.methodology_parameters
    (methodology_version_id, parameter_key, numeric_value, status, effective_from, approved_by, approved_on)
    values (mv, 'issuer_cap', 0.10, 'approved', date '2026-01-01', 'a named approver', date '2026-01-01')
    returning id into approved_cap;

  -- n x c < 1 is refused even with an approved cap in force: three issuers at 10% cannot carry a
  -- full allocation, and the methodology says withhold rather than relax.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-17', date '2026-09-20', 'scheduled_reconstitution', 'production_eligible',
              mv, approved_cap, 0.10, 3, 3, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an infeasible capped allocation was published'; end if;

  -- The eligible count binds too, not only the weightable one. Twelve weightable issuers pass on
  -- their own; four eligible ones do not, and the publication gate is stated on the eligible count.
  ok := false;
  begin
    insert into pipeline.universe_snapshots
      (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
       cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
      values (date '2026-09-17', date '2026-09-20', 'scheduled_reconstitution', 'production_eligible',
              mv, approved_cap, 0.10, 4, 12, true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'the eligible-count feasibility gate did not bind'; end if;

  -- At the boundary and above, with an approved cap in force, a production snapshot is allowed.
  insert into pipeline.universe_snapshots
    (as_of_date, effective_date, snapshot_kind, state, methodology_version_id,
     cap_parameter_id, cap_value, eligible_issuer_count, weightable_issuer_count, cap_feasible)
    values (date '2026-09-17', date '2026-09-20', 'scheduled_reconstitution', 'production_eligible',
            mv, approved_cap, 0.10, 12, 12, true);

  raise notice 'cap feasibility: n x c >= 1 enforced on both counts';
end $$;

-- ---------------------------------------------------- fixtures cannot reach real snapshots

do $$
declare n integer;
begin
  select count(*) into n from pipeline.snapshot_constituents c
    join reference.issuers i on i.id = c.issuer_id
    join pipeline.universe_snapshots s on s.id = c.snapshot_id
   where i.issuer_key like 'zz-fixture-%' and s.id = 'd0000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception '% fixture issuer(s) contaminated the real diagnostic snapshot', n; end if;

  -- And no synthetic observation was written against a real issuer by any migration. Every
  -- price, float and FX row in this transaction that touches a real issuer came from a source.
  select count(*) into n from pipeline.float_observations f
    join reference.securities s on s.id = f.security_id
    join reference.issuers i on i.id = s.issuer_id
   where i.issuer_key in ('nvidia', 'palantir-technologies', 'tsmc')
     and f.float_state = 'established';
  if n <> 0 then raise exception '% fabricated float factor(s) exist for a real issuer', n; end if;

  raise notice 'fixtures stayed isolated: no synthetic input reached a real issuer';
end $$;

rollback;
