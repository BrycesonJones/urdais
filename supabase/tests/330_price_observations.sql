-- UGAI end-of-day closes: the gates, and the state Phase 5.3 actually seeded.
--
-- A price mistake is silent in a way an eligibility mistake is not. A hundredfold unit error, a
-- close attached to the wrong line of a dual listing, an adjusted series standing in for an
-- official one, or a fabricated holiday price all look exactly like correct rows. So nearly
-- every assertion below is about something the database refuses.
begin;

-- --------------------------------------------------------- what the source review recorded

do $$
declare n integer;
begin
  -- Taiwan: official venue source, cleared on both axes, attribution as a condition.
  select count(*) into n from reference.source_interfaces
   where slug = 'tw-twse-openapi-daily' and source_class = 'equity_eod_price_interface'
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
     and production_access_state = 'production_approved';
  if n <> 1 then raise exception 'the TWSE daily interface is not cleared on both axes'; end if;

  select count(*) into n
    from reference.permission_grants g join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'tw-twse-openapi-daily'
     and g.covers_collection and g.covers_storage and g.covers_index_calculation
     and g.covers_index_level_publication and g.covers_historical_reconstruction
     and g.attribution_required and g.attribution_text is not null
     and g.covered_venues = array['XTAI']::text[];
  if n <> 1 then raise exception 'the TWSE grant does not carry the rights the licence gives'; end if;

  -- Nasdaq: refused on both axes, blocked, and granting nothing. This is the venue both
  -- currently eligible issuers list on, so the refusal is load-bearing rather than incidental.
  select count(*) into n from reference.source_interfaces
   where slug = 'nasdaq-com-historical-quotes'
     and terms_review_state = 'not_permitted' and data_use_terms_state = 'not_permitted'
     and production_access_state = 'production_blocked' and written_agreement_required;
  if n <> 1 then raise exception 'Nasdaq is not recorded as refused and blocked'; end if;

  select count(*) into n
    from reference.permission_grants g join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug = 'nasdaq-com-historical-quotes'
     and (g.covers_collection or g.covers_storage or g.covers_index_calculation
          or g.covers_index_level_publication or g.covers_raw_redistribution);
  if n <> 0 then raise exception 'the Nasdaq refusal grants a right'; end if;

  -- Both refusals and both grants cite the clause they rest on.
  select count(*) into n
    from reference.permission_grants g join reference.source_interfaces s on s.id = g.source_interface_id
   where s.source_class = 'equity_eod_price_interface'
     and (g.decisive_clause is null or g.reviewed_by is null or g.reviewed_on is null);
  if n <> 0 then raise exception '% equity price grant(s) cite no clause', n; end if;

  -- The venue's own state matches its rights. A venue cannot look available while it is refused.
  select count(*) into n from reference.venues
   where mic = 'XTAI' and price_source_state = 'implemented' and rights_state = 'permitted';
  if n <> 1 then raise exception 'XTAI is not recorded as implemented'; end if;
  select count(*) into n from reference.venues
   where mic in ('XNAS', 'XNGS') and price_source_state = 'unavailable' and rights_state = 'not_permitted';
  if n <> 2 then raise exception 'the Nasdaq venues are not recorded as unavailable'; end if;

  raise notice 'equity price sources: Taiwan permitted, Nasdaq refused';
end $$;

-- ------------------------------------------------------------------ the security master

do $$
declare n integer;
begin
  -- Seeded only where a primary document said so, and every identifier cites its evidence.
  select count(*) into n from reference.listings;
  if n <> 3 then raise exception 'expected 3 seeded listings, found %', n; end if;

  select count(*) into n from reference.security_identifiers where evidence_url is null;
  if n <> 0 then raise exception '% identifier(s) cite no evidence', n; end if;

  -- No ISIN, CUSIP, SEDOL or FIGI was invented. Those come from authorities Urdais has not
  -- licensed, and a plausible identifier nobody verified is worse than an absent one.
  select count(*) into n from reference.security_identifiers
   where identifier_type in ('isin', 'cusip', 'sedol', 'figi', 'composite_figi', 'share_class_figi');
  if n <> 0 then raise exception '% unlicensed identifier(s) were seeded', n; end if;

  -- Every seeded listing states a currency and a unit, because a price without them is unreadable.
  select count(*) into n from reference.listings where price_currency is null or price_unit is null;
  if n <> 0 then raise exception '% listing(s) lack a denomination', n; end if;

  raise notice 'security master: 3 listings, all evidenced';
end $$;

-- ------------------------------------------------------------------------- the gates

do $$
declare
  ok boolean;
  n integer;
  lst_tw uuid; lst_us uuid; ven_gb uuid; sec_gb uuid; lst_gb uuid;
  iface_tw uuid; grant_tw uuid; iface_na uuid; grant_na uuid;
  iss uuid; obs_a uuid; obs_b uuid;
  attribution text;
begin
  select l.id into lst_tw from reference.listings l
    join reference.venues v on v.id = l.venue_id where v.mic = 'XTAI' and l.ticker = '2330';
  select l.id into lst_us from reference.listings l where l.ticker = 'NVDA';
  select id into iface_tw from reference.source_interfaces where slug = 'tw-twse-openapi-daily';
  select id, attribution_text into grant_tw, attribution
    from reference.permission_grants where source_interface_id = iface_tw;
  select id into iface_na from reference.source_interfaces where slug = 'nasdaq-com-historical-quotes';
  select id into grant_na from reference.permission_grants where source_interface_id = iface_na;

  -- A well-formed observation is accepted.
  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
     source_interface_id, permission_grant_id, retrieved_at, attribution,
     observation_purpose, idempotency_key)
    values (lst_tw, date '2026-09-16', 'traded', 2380.00, 'TWD', 'major',
            iface_tw, grant_tw, now(), attribution, 'research', 'k:baseline')
    returning id into obs_a;

  -- ------------------------------------------------------------- price semantics

  -- The raw close round-trips exactly. numeric, not float: 2380.00 must come back as it went in.
  select count(*) into n from pipeline.price_observations
   where id = obs_a and close_price = 2380.00 and price_currency = 'TWD' and price_unit = 'major';
  if n <> 1 then raise exception 'the raw close did not round-trip'; end if;

  -- Currency must equal the listing's. A GBX price read as GBP is still a plausible number, so
  -- this is an equality test and never a range.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-15', 'traded', 2380.00, 'USD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:wrongccy');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price in the wrong currency was accepted'; end if;

  -- Unit must equal the listing's. This is the hundredfold-error guard.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-15', 'traded', 238000, 'TWD', 'minor',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:wrongunit');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price in the wrong unit was accepted'; end if;

  -- Zero, negative and NaN are not prices.
  foreach n in array array[0, -1] loop
    ok := false;
    begin
      insert into pipeline.price_observations
        (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
         source_interface_id, permission_grant_id, retrieved_at, attribution,
         observation_purpose, idempotency_key)
        values (lst_tw, date '2026-09-15', 'traded', n, 'TWD', 'major',
                iface_tw, grant_tw, now(), attribution, 'research', 'k:bad' || n);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'a close of % was accepted', n; end if;
  end loop;

  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-15', 'traded', 'NaN'::numeric, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:nan');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a NaN close was accepted'; end if;

  -- ------------------------------------------------------------------- sessions

  -- A holiday gets a row with no price. Not a carried-forward close, not an interpolation.
  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, source_interface_id, permission_grant_id,
     retrieved_at, attribution, observation_purpose, idempotency_key)
    values (lst_tw, date '2026-01-01', 'exchange_holiday', iface_tw, grant_tw, now(),
            attribution, 'research', 'k:holiday');

  -- And a price on a non-session is unrepresentable, which is stronger than discouraged.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-01-02', 'exchange_holiday', 2380.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:fakeholiday');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price was recorded for a market holiday'; end if;

  -- An unreachable source is also a row, and also priceless. Distinguishing it from a holiday is
  -- what lets a later missing-data policy treat them differently.
  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, source_interface_id, permission_grant_id,
     retrieved_at, attribution, observation_purpose, idempotency_key)
    values (lst_tw, date '2026-09-14', 'source_unavailable', iface_tw, grant_tw, now(),
            attribution, 'research', 'k:down');

  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-13', 'source_unavailable', 2380.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:fakedown');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price was recorded for an unavailable source'; end if;

  -- ---------------------------------------------------------------------- identity

  -- The grant is venue-scoped, so a Taiwanese grant cannot admit a Nasdaq line. This is what
  -- stops a permitted source being used as cover for a venue it does not cover.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_us, date '2026-09-16', 'traded', 180.00, 'USD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:wrongvenue');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a Taiwan grant admitted a Nasdaq price'; end if;

  -- A date before the listing was effective is a wrong row, not a late arrival.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2020-01-02', 'traded', 300.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:tooearly');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price predating the listing was accepted'; end if;

  -- A delisted line has no official close.
  insert into reference.venues (id, mic, name, country_code, default_currency, timezone)
    values (gen_random_uuid(), 'XTS9', 'Test Venue', 'GB', 'GBP', 'Europe/London')
    returning id into ven_gb;
  select id into iss from reference.issuers where issuer_key = 'nvidia';
  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (iss, 'ordinary_share', 'GBP') returning id into sec_gb;
  -- A minor-unit line, which no seeded row exercises: pence, not pounds.
  insert into reference.listings
    (security_id, venue_id, ticker, price_currency, price_unit, listing_status, effective_from, effective_to)
    values (sec_gb, ven_gb, 'TEST', 'GBP', 'minor', 'delisted', date '2020-01-01', date '2026-06-30')
    returning id into lst_gb;

  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_gb, date '2026-03-02', 'traded', 10000, 'GBP', 'minor',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:delisted');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a delisted listing produced an official close'; end if;

  -- And a date after the listing ended.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, source_interface_id, permission_grant_id,
       retrieved_at, attribution, observation_purpose, idempotency_key)
      values (lst_gb, date '2026-09-01', 'no_official_close', iface_tw, grant_tw, now(),
              attribution, 'research', 'k:toolate');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a price after the listing ended was accepted'; end if;

  -- ------------------------------------------------------------------------ rights

  -- A blocked source cannot produce an observation at any purpose, because its grant covers
  -- nothing. This is the Nasdaq position expressed as behaviour rather than as a state column.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at,
       observation_purpose, idempotency_key)
      values (lst_us, date '2026-09-16', 'traded', 180.00, 'USD', 'major',
              iface_na, grant_na, now(), 'research', 'k:nasdaq');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a refused source produced a price observation'; end if;

  -- A grant cannot be borrowed from another interface.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-15', 'traded', 2380.00, 'TWD', 'major',
              iface_na, grant_tw, now(), attribution, 'research', 'k:borrowed');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a grant was used with a different interface'; end if;

  -- Attribution is a condition of the Taiwan licence, so an unattributed row was never
  -- lawfully collected and the database says so.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-15', 'traded', 2380.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), 'research', 'k:nocredit');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an observation was stored without the attribution its licence requires'; end if;

  -- Production requires an approved interface. Research does not, and relabelling a research
  -- row as production is exactly the bypass this refuses.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_us, date '2026-09-16', 'traded', 180.00, 'USD', 'major',
              iface_na, grant_na, now(), 'x', 'production', 'k:prodblocked');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a blocked interface served a production observation'; end if;

  -- ------------------------------------------------- idempotency and corrections

  -- The same observed fact cannot be stored twice under a different guise.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-16', 'traded', 2380.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:baseline');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'the same idempotency key was stored twice'; end if;

  -- Nor can a second live observation exist for the same listing, date and purpose.
  ok := false;
  begin
    insert into pipeline.price_observations
      (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
       source_interface_id, permission_grant_id, retrieved_at, attribution,
       observation_purpose, idempotency_key)
      values (lst_tw, date '2026-09-16', 'traded', 2390.00, 'TWD', 'major',
              iface_tw, grant_tw, now(), attribution, 'research', 'k:second');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two live observations exist for one listing and date'; end if;

  raise notice 'price observations: semantics, identity and rights ok';
end $$;

-- Corrections, in their own block.
do $$
declare
  ok boolean; n integer;
  lst uuid; iface uuid; grt uuid; attribution text; original uuid; corrected uuid;
begin
  select l.id into lst from reference.listings l
    join reference.venues v on v.id = l.venue_id where v.mic = 'XTAI' and l.ticker = '2330';
  select id into iface from reference.source_interfaces where slug = 'tw-twse-openapi-daily';
  select id, attribution_text into grt, attribution
    from reference.permission_grants where source_interface_id = iface;

  insert into pipeline.price_observations
    (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
     source_interface_id, permission_grant_id, retrieved_at, attribution,
     observation_purpose, idempotency_key)
    values (lst, date '2026-09-11', 'traded', 2380.00, 'TWD', 'major',
            iface, grt, now(), attribution, 'research', 'c:original')
    returning id into original;

  -- One live observation per listing, date and purpose, so the original must leave the partial
  -- index before the correction can enter it. The forward reference works because
  -- superseded_by_id is deferrable initially deferred; doing it the other way round is rejected,
  -- which is the index doing its job rather than an inconvenience to route around.
  corrected := gen_random_uuid();
  update pipeline.price_observations
     set superseded_by_id = corrected, superseded_at = now(),
         supersession_reason = 'corrected official close'
   where id = original;

  insert into pipeline.price_observations
    (id, listing_id, trading_date, session_status, close_price, price_currency, price_unit,
     source_interface_id, permission_grant_id, retrieved_at, attribution,
     observation_purpose, observation_kind, idempotency_key, supersession_reason)
    values (corrected, lst, date '2026-09-11', 'traded', 2381.00, 'TWD', 'major',
            iface, grt, now(), attribution, 'research', 'correction', 'c:corrected',
            'the venue republished the official close');

  -- The original value survives, unedited.
  select count(*) into n from pipeline.price_observations
   where id = original and close_price = 2380.00 and superseded_by_id = corrected;
  if n <> 1 then raise exception 'the original close did not survive its correction'; end if;

  -- And the lineage is walkable forward.
  select count(*) into n from pipeline.price_observations o
    join pipeline.price_observations s on s.id = o.superseded_by_id
   where o.id = original and s.close_price = 2381.00 and s.observation_kind = 'correction';
  if n <> 1 then raise exception 'the supersession lineage is not walkable'; end if;

  -- In-place edits and deletes are both refused.
  ok := false;
  begin
    update pipeline.price_observations set close_price = 9999 where id = corrected;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a close was edited in place'; end if;

  ok := false;
  begin
    delete from pipeline.price_observations where id = corrected;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a close was deleted'; end if;

  raise notice 'price observations: gates ok';
end $$;

-- ------------------------------------------------------------- nothing was published

do $$
declare n integer;
begin
  -- Phase 5.3 ingests prices and publishes no index. These are the rows that would exist if it
  -- had quietly started one.
  select count(*) into n from pipeline.price_observations where observation_purpose = 'production';
  if n <> 0 then raise exception '% production price observation(s) exist', n; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug in ('ugai', 'ai-equity-universe') and mv.status <> 'draft';
  if n <> 0 then raise exception 'a UGAI methodology version left draft'; end if;

  raise notice 'no UGAI publication: ok';
end $$;

rollback;
