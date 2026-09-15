-- UBWI Phase 2F: protocol-scheduled supply, in the database.
--
-- The application derives the supply; the database refuses to hold one that does not
-- reproduce. This file exercises the refusals rather than the happy path, because a
-- constraint nobody has seen reject anything is a constraint nobody knows works.
--
-- Every expected value here comes from the Bitcoin issuance schedule by arithmetic stated
-- in the test. None comes from a block explorer or a supply dataset: methodology 1.2.0
-- exists to remove that dependency, and a test that took its expectations from the retired
-- source would quietly reintroduce it.

begin;

do $$
declare
  n            integer;
  obs_id       uuid;
  price_iface  uuid;
  supply_iface uuid;
  failed       boolean;
begin
  -- ------------------------------------------------- the schedule function
  --
  -- The inclusive-height convention, asserted at the boundary that decides it. Genesis is
  -- one block of subsidy, not zero: an off-by-one here is a 3.125 BTC error today.
  if pipeline.btc_scheduled_supply_sats(0) <> 5000000000 then
    raise exception 'height 0 must be one block of subsidy (inclusive convention)';
  end if;
  if pipeline.btc_scheduled_supply_sats(1) <> 10000000000 then
    raise exception 'height 1 must be two blocks of subsidy';
  end if;

  -- Halving boundaries: the subsidy halves ON the boundary block, never one block early
  -- or late. Checked as a difference so the test states the per-block subsidy directly.
  if pipeline.btc_scheduled_supply_sats(209999) - pipeline.btc_scheduled_supply_sats(209998) <> 5000000000 then
    raise exception 'the last block of era 0 must still pay 50 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(210000) - pipeline.btc_scheduled_supply_sats(209999) <> 2500000000 then
    raise exception 'the first block of era 1 must pay 25 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(420000) - pipeline.btc_scheduled_supply_sats(419999) <> 1250000000 then
    raise exception 'the first block of era 2 must pay 12.5 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(840000) - pipeline.btc_scheduled_supply_sats(839999) <> 312500000 then
    raise exception 'the first block of era 4 must pay 3.125 BTC';
  end if;

  -- Era closures, as round numbers of BTC: 210,000 blocks times the era's subsidy.
  if pipeline.btc_scheduled_supply_sats(209999) <> 210000::bigint * 5000000000 then
    raise exception 'era 0 must close at 10,500,000 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(839999) <> 1968750000000000 then
    raise exception 'four complete eras must close at 19,687,500 BTC';
  end if;

  -- The final non-zero era pays one satoshi a block; era 33 pays nothing, because
  -- 2^32 < 5e9 < 2^33 so the integer halving series reaches 1 at era 32 and 0 at era 33.
  if pipeline.btc_scheduled_supply_sats(6929999) - pipeline.btc_scheduled_supply_sats(6929998) <> 1 then
    raise exception 'the last subsidised block must pay exactly one satoshi';
  end if;
  if pipeline.btc_scheduled_supply_sats(6930000) <> pipeline.btc_scheduled_supply_sats(6929999) then
    raise exception 'supply must stop growing at the first zero-subsidy era';
  end if;

  -- Monotonicity and the cap.
  if pipeline.btc_scheduled_supply_sats(967073) < pipeline.btc_scheduled_supply_sats(967072) then
    raise exception 'supply must be monotonically non-decreasing in height';
  end if;
  if pipeline.btc_scheduled_supply_sats(99000000) > 2100000000000000 then
    raise exception 'scheduled supply must never exceed the 21,000,000 BTC cap';
  end if;
  -- Strictly below the nominal cap: integer truncation discards a remainder every halving.
  if pipeline.btc_scheduled_supply_sats(6929999) <> 2099999997690000 then
    raise exception 'terminal supply must be 20,999,999.9769 BTC, short of the nominal cap';
  end if;

  -- A negative height is not a height.
  failed := false;
  begin
    perform pipeline.btc_scheduled_supply_sats(-1);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'a negative block height must be refused'; end if;

  -- ------------------------------------------------- the derived/retrieved split

  select id into price_iface from reference.source_interfaces where slug = 'chainlink-btc-usd-ethereum';
  select id into supply_iface from reference.source_interfaces where slug = 'blockchain-info-supply';
  if price_iface is null or supply_iface is null then
    raise exception 'both numerator interfaces must remain registered';
  end if;

  -- A protocol_scheduled observation naming a supply interface asserts a dependency that
  -- does not exist. Refused.
  failed := false;
  begin
    insert into pipeline.btc_market_observations
      (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
       supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
       price_usd, market_cap_usd, retrieved_at,
       supply_derivation, supply_derivation_version, supply_rights_basis,
       halving_era, block_subsidy_sats, scheduled_supply_sats)
    values (now(), 967073, array['a','b'], 20084606.25, 'protocol_scheduled',
            supply_iface, 'chainlink_reference_feed', price_iface, null,
            77779.48460264, 20084606.25 * 77779.48460264, now(),
            'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
            4, 312500000, 2008460625000000);
  exception when others then failed := true;
  end;
  if not failed then
    raise exception 'a derived supply must not name a supply source interface';
  end if;

  -- A supply that does not reproduce from its own recorded height. Refused, and this is
  -- the constraint that makes the stored quantity checkable rather than merely asserted.
  failed := false;
  begin
    insert into pipeline.btc_market_observations
      (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
       price_rule, price_source_interface_id, venue_count, price_usd, market_cap_usd,
       retrieved_at, supply_derivation, supply_derivation_version, supply_rights_basis,
       halving_era, block_subsidy_sats, scheduled_supply_sats)
    values (now(), 967073, array['a','b'], 20084607.25, 'protocol_scheduled',
            'chainlink_reference_feed', price_iface, null,
            77779.48460264, 20084607.25 * 77779.48460264, now(),
            'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
            4, 312500000, 2008460725000000);
  exception when others then failed := true;
  end;
  if not failed then
    raise exception 'a supply that does not reproduce from its height must be refused';
  end if;

  -- A supply above the protocol cap. Refused.
  failed := false;
  begin
    insert into pipeline.btc_market_observations
      (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
       price_rule, price_source_interface_id, venue_count, price_usd, market_cap_usd,
       retrieved_at, supply_derivation, supply_derivation_version, supply_rights_basis,
       halving_era, block_subsidy_sats, scheduled_supply_sats)
    values (now(), 967073, array['a','b'], 21000001, 'protocol_scheduled',
            'chainlink_reference_feed', price_iface, null, 1, 21000001, now(),
            'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
            4, 312500000, 2100000100000000);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'a supply above the 21,000,000 BTC cap must be refused'; end if;

  -- The honest insert, which must succeed.
  insert into pipeline.btc_market_observations
    (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
     price_rule, price_source_interface_id, venue_count, price_usd, market_cap_usd,
     retrieved_at, supply_derivation, supply_derivation_version, supply_rights_basis,
     halving_era, block_subsidy_sats, scheduled_supply_sats)
  values (now(), 967073, array['mempool.space','blockchain.info'], 20084606.25,
          'protocol_scheduled', 'chainlink_reference_feed', price_iface, null,
          77779.48460264, 20084606.25 * 77779.48460264, now(),
          'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
          4, 312500000, 2008460625000000)
  returning id into obs_id;

  -- ------------------------------------------------- height cross-verification

  -- Raw bytes and parsed integer must be the same number.
  failed := false;
  begin
    insert into pipeline.btc_height_observations
      (observation_id, source, raw_value, block_height, retrieved_at, provenance)
    values (obs_id, 'bad.example/height', '967074', 967073, now(), 'p');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'a raw value that does not parse to the stored height must be refused'; end if;

  insert into pipeline.btc_height_observations
    (observation_id, source, raw_value, block_height, retrieved_at, provenance)
  values (obs_id, 'mempool.space/api/blocks/tip/height', '967073', 967073, now(), 'consensus integer'),
         (obs_id, 'blockchain.info/q/getblockcount', '967073', 967073, now(), 'consensus integer');

  select count(*) into n from pipeline.btc_height_observations where observation_id = obs_id;
  if n <> 2 then raise exception 'both height readings must be retained'; end if;

  -- Append-only: the evidence behind a published point may never be edited.
  failed := false;
  begin
    update pipeline.btc_height_observations set block_height = 967074 where observation_id = obs_id;
  exception when others then failed := true;
  end;
  if not failed then raise exception 'height evidence must be append-only'; end if;

  failed := false;
  begin
    delete from pipeline.btc_height_observations where observation_id = obs_id;
  exception when others then failed := true;
  end;
  if not failed then raise exception 'height evidence must not be deletable'; end if;

  raise notice 'ubwi 2f: schedule, derivation and height evidence ok';
end
$$;

rollback;

-- ------------------------------------------------- disagreement fails closed
--
-- Run in its own transaction: the cross-verification trigger is deferred to commit, so the
-- refusal can only be observed by actually trying to commit disagreeing readings.
begin;

do $$
declare
  obs_id      uuid;
  price_iface uuid;
begin
  select id into price_iface from reference.source_interfaces where slug = 'chainlink-btc-usd-ethereum';

  insert into pipeline.btc_market_observations
    (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
     price_rule, price_source_interface_id, venue_count, price_usd, market_cap_usd,
     retrieved_at, supply_derivation, supply_derivation_version, supply_rights_basis,
     halving_era, block_subsidy_sats, scheduled_supply_sats)
  values (now(), 967073, array['mempool.space','blockchain.info'], 20084606.25,
          'protocol_scheduled', 'chainlink_reference_feed', price_iface, null,
          77779.48460264, 20084606.25 * 77779.48460264, now(),
          'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
          4, 312500000, 2008460625000000)
  returning id into obs_id;

  -- Two sources, disagreeing by one block. Heights are never averaged and the higher
  -- reading is never taken silently: this must fail closed at commit.
  insert into pipeline.btc_height_observations
    (observation_id, source, raw_value, block_height, retrieved_at, provenance)
  values (obs_id, 'mempool.space/api/blocks/tip/height', '967073', 967073, now(), 'p'),
         (obs_id, 'blockchain.info/q/getblockcount', '967074', 967074, now(), 'p');
end
$$;

do $$
declare
  failed boolean := false;
begin
  begin
    -- Force the deferred constraint triggers to run now, inside the transaction.
    set constraints all immediate;
  exception when others then failed := true;
  end;
  if not failed then
    raise exception 'disagreeing height observations must fail closed';
  end if;
  raise notice 'ubwi 2f: height disagreement fails closed';
end
$$;

rollback;

-- ------------------------------------------------- one source is not a cross-check
begin;

do $$
declare
  obs_id      uuid;
  price_iface uuid;
begin
  select id into price_iface from reference.source_interfaces where slug = 'chainlink-btc-usd-ethereum';

  insert into pipeline.btc_market_observations
    (observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
     price_rule, price_source_interface_id, venue_count, price_usd, market_cap_usd,
     retrieved_at, supply_derivation, supply_derivation_version, supply_rights_basis,
     halving_era, block_subsidy_sats, scheduled_supply_sats)
  values (now(), 967073, array['mempool.space','blockchain.info'], 20084606.25,
          'protocol_scheduled', 'chainlink_reference_feed', price_iface, null,
          77779.48460264, 20084606.25 * 77779.48460264, now(),
          'bitcoin-protocol-subsidy-schedule', '1.0.0', 'derived_from_protocol',
          4, 312500000, 2008460625000000)
  returning id into obs_id;

  insert into pipeline.btc_height_observations
    (observation_id, source, raw_value, block_height, retrieved_at, provenance)
  values (obs_id, 'mempool.space/api/blocks/tip/height', '967073', 967073, now(), 'p');
end
$$;

do $$
declare
  failed boolean := false;
begin
  begin
    set constraints all immediate;
  exception when others then failed := true;
  end;
  if not failed then
    raise exception 'a single height reading must not satisfy the cross-check';
  end if;
  raise notice 'ubwi 2f: a single height source fails the cross-check';
end
$$;

rollback;
