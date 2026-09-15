-- UBWI Phase 2E: the schema refuses what the methodology refuses.
--
-- Two rules carry this phase and both belong in constraints rather than in prose, because
-- prose is not enforced at 3 a.m. by a future collector:
--
--   * A Chainlink round is only evidence if its parts agree with each other -- the round id
--     must decompose into the phase and aggregator round it claims, the answer must
--     normalize to the value stored beside it, and the read must have happened inside the
--     documented 3600-second heartbeat of the round it read.
--
--   * An inferred permission is the weakest state that still permits publication, so it is
--     the one that most needs a shape. It must rest on a retained document, must state a
--     basis and a limit, may never be recorded over a refusal or over a grant, and may
--     never make a source production-approved.
--
-- Everything here rolls back.

begin;

do $$
declare
  obs uuid;
  iface uuid;
  supply_iface uuid;
  n integer;
begin
  select id into iface from reference.source_interfaces where slug = 'chainlink-btc-usd-ethereum';
  select id into supply_iface from reference.source_interfaces where slug = 'blockchain-info-supply';
  if iface is null or supply_iface is null then
    raise exception 'the Phase 2E numerator interfaces must be registered';
  end if;

  -- ---------------------------------------------------------------- the price rule
  --
  -- A reference-feed observation carries no venue rows and a venue-median observation
  -- carries at least three. Neither is optional and neither may borrow the other's shape.

  begin
    insert into pipeline.btc_market_observations (
      observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
      supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
      price_usd, market_cap_usd, retrieved_at
    ) values (
      '2026-09-15T03:10:39Z', 967062, array['mempool.space', 'blockchain.info'], 20084546,
      'claimed_issuance', supply_iface, 'chainlink_reference_feed', iface, 3,
      77779.48460264, 20084546 * 77779.48460264, '2026-09-15T03:10:39Z'
    );
    raise exception 'a Chainlink-priced observation carrying venue rows was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into pipeline.btc_market_observations (
      observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
      supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
      price_usd, market_cap_usd, retrieved_at
    ) values (
      '2026-09-15T03:10:39Z', 967062, array['mempool.space', 'blockchain.info'], 20084546,
      'claimed_issuance', supply_iface, 'median_of_venues', iface, 2,
      77779.48460264, 20084546 * 77779.48460264, '2026-09-15T03:10:39Z'
    );
    raise exception 'a two-venue median observation was accepted';
  exception when check_violation then null;
  end;

  -- A well-formed reference-feed observation, which the rest of this block builds on.
  insert into pipeline.btc_market_observations (
    observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
    supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
    price_usd, market_cap_usd, retrieved_at
  ) values (
    '2026-09-15T03:10:39Z', 967062,
    array['mempool.space/api/blocks/tip/height', 'blockchain.info/q/getblockcount'],
    20084546, 'claimed_issuance', supply_iface, 'chainlink_reference_feed', iface, null,
    77779.48460264, 20084546 * 77779.48460264, '2026-09-15T03:10:39Z'
  ) returning id into obs;

  -- ---------------------------------------------------------------- the round's own parts
  --
  -- Proxy round 129127208515966885593 is phase 7, aggregator round 24281:
  -- 7 * 2^64 + 24281 = 129127208515966885593. A frozen phase that disagrees with the round
  -- id is a lineage bug, and a lineage bug in an audit record is worse than no record.

  begin
    insert into pipeline.btc_chainlink_observations (
      observation_id, chain_id, proxy_address, aggregator_address, aggregator_type_and_version,
      feed_description, decimals, proxy_version, round_id, phase_id, aggregator_round_id,
      answer, normalized_usd, started_at, updated_at, answered_in_round, retrieval_timestamp,
      block_number, block_hash, rpc_source, rpc_cross_check_source
    ) values (
      obs, 1, '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
      '0x4a3411ac2948b33c69666b35cc6d055b27ea84f1', 'AccessControlledOCR2Aggregator 1.0.0',
      'BTC / USD', 8, 6, '129127208515966885593', 6, '24281',
      7777948460264, 77779.48460264, '2026-09-15T03:04:34Z', '2026-09-15T03:04:47Z',
      '129127208515966885593', '2026-09-15T03:10:39Z',
      25980084, '0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640',
      'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'
    );
    raise exception 'a round whose frozen phase disagrees with its round id was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into pipeline.btc_chainlink_observations (
      observation_id, chain_id, proxy_address, feed_description, decimals,
      round_id, phase_id, aggregator_round_id, answer, normalized_usd,
      started_at, updated_at, retrieval_timestamp, block_number, block_hash, rpc_source
    ) values (
      obs, 1, '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', 'BTC / USD', 8,
      '129127208515966885593', 7, '24281', 7777948460264, 77000,
      '2026-09-15T03:04:34Z', '2026-09-15T03:04:47Z', '2026-09-15T03:10:39Z',
      25980084, '0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640',
      'https://ethereum-rpc.publicnode.com'
    );
    raise exception 'a normalized value that disagrees with the raw answer was accepted';
  exception when check_violation then null;
  end;

  -- ---------------------------------------------------------------- staleness
  --
  -- The documented heartbeat, and no grace period. 3601 seconds is refused; 3600 is not.

  begin
    insert into pipeline.btc_chainlink_observations (
      observation_id, chain_id, proxy_address, feed_description, decimals,
      round_id, phase_id, aggregator_round_id, answer, normalized_usd,
      started_at, updated_at, retrieval_timestamp, block_number, block_hash, rpc_source
    ) values (
      obs, 1, '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', 'BTC / USD', 8,
      '129127208515966885593', 7, '24281', 7777948460264, 77779.48460264,
      '2026-09-15T03:04:34Z', '2026-09-15T03:04:47Z',
      timestamptz '2026-09-15T03:04:47Z' + interval '3601 seconds',
      25980084, '0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640',
      'https://ethereum-rpc.publicnode.com'
    );
    raise exception 'a round read 3601 seconds after its update was accepted';
  exception when check_violation then null;
  end;

  -- A retrieval before the round it read is a clock inconsistency, not a fresh observation.
  begin
    insert into pipeline.btc_chainlink_observations (
      observation_id, chain_id, proxy_address, feed_description, decimals,
      round_id, phase_id, aggregator_round_id, answer, normalized_usd,
      started_at, updated_at, retrieval_timestamp, block_number, block_hash, rpc_source
    ) values (
      obs, 1, '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', 'BTC / USD', 8,
      '129127208515966885593', 7, '24281', 7777948460264, 77779.48460264,
      '2026-09-15T03:04:34Z', '2026-09-15T03:04:47Z', '2026-09-15T03:00:00Z',
      25980084, '0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640',
      'https://ethereum-rpc.publicnode.com'
    );
    raise exception 'a retrieval predating the round it read was accepted';
  exception when check_violation then null;
  end;

  -- The real round, which must be accepted.
  insert into pipeline.btc_chainlink_observations (
    observation_id, chain_id, proxy_address, aggregator_address, aggregator_type_and_version,
    feed_description, decimals, proxy_version, round_id, phase_id, aggregator_round_id,
    answer, normalized_usd, started_at, updated_at, answered_in_round, retrieval_timestamp,
    block_number, block_hash, rpc_source, rpc_cross_check_source
  ) values (
    obs, 1, '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    '0x4a3411ac2948b33c69666b35cc6d055b27ea84f1', 'AccessControlledOCR2Aggregator 1.0.0',
    'BTC / USD', 8, 6, '129127208515966885593', 7, '24281',
    7777948460264, 77779.48460264, '2026-09-15T03:04:34Z', '2026-09-15T03:04:47Z',
    '129127208515966885593', '2026-09-15T03:10:39Z',
    25980084, '0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640',
    'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'
  );

  select count(*) into n from pipeline.btc_chainlink_observations where observation_id = obs;
  if n <> 1 then raise exception 'the verified production round must be accepted'; end if;

  raise notice 'ubwi 2e: chainlink lineage ok';
end
$$;

-- ---------------------------------------------------------------- inferred permission

do $$
declare n integer;
begin
  -- An inference over an express refusal. Kraken's terms say no; nothing may infer past it.
  begin
    update reference.source_interfaces
       set inferred_permission = jsonb_build_object(
             'decision_id', 'x', 'decided_on', '2026-09-15',
             'basis', jsonb_build_array('a'), 'not_found', jsonb_build_array(),
             'limits', jsonb_build_array('b'))
     where slug = 'kraken-ticker';
    raise exception 'an inference was recorded over an express refusal';
  exception when check_violation then null;
  end;

  -- An inference over an express grant understates evidence that exists.
  begin
    update reference.source_interfaces
       set inferred_permission = jsonb_build_object(
             'decision_id', 'x', 'decided_on', '2026-09-15',
             'basis', jsonb_build_array('a'), 'not_found', jsonb_build_array(),
             'limits', jsonb_build_array('b'))
     where slug = 'dgbas-national-wealth';
    raise exception 'an inference was recorded over an express grant';
  exception when check_violation then null;
  end;

  -- An inference with no stated limit is being used as a grant.
  begin
    update reference.source_interfaces
       set inferred_permission = jsonb_build_object(
             'decision_id', 'x', 'decided_on', '2026-09-15',
             'basis', jsonb_build_array('a'), 'not_found', jsonb_build_array(),
             'limits', jsonb_build_array())
     where slug = 'chainlink-btc-usd-ethereum';
    raise exception 'an inference with no stated limits was accepted';
  exception when check_violation then null;
  end;

  -- An inference with no basis is a decision that has not been taken.
  begin
    update reference.source_interfaces
       set inferred_permission = jsonb_build_object(
             'decision_id', 'x', 'decided_on', '2026-09-15',
             'basis', jsonb_build_array(), 'not_found', jsonb_build_array(),
             'limits', jsonb_build_array('b'))
     where slug = 'chainlink-btc-usd-ethereum';
    raise exception 'an inference with no basis was accepted';
  exception when check_violation then null;
  end;

  -- An inference with nothing retained to rest on.
  begin
    update reference.source_interfaces
       set inferred_permission = jsonb_build_object(
             'decision_id', 'x', 'decided_on', '2026-09-15',
             'basis', jsonb_build_array('a'), 'not_found', jsonb_build_array(),
             'limits', jsonb_build_array('b')),
           terms_artifact_hash = null, terms_artifact_url = null,
           terms_artifact_status = null, terms_retrieved_at = null
     where slug = 'chainlink-btc-usd-ethereum';
    raise exception 'an inference with no retained artifact was accepted';
  exception when check_violation then null;
  end;

  -- An inference is never a route to production approval.
  begin
    update reference.source_interfaces
       set production_access_state = 'production_approved'
     where slug = 'chainlink-btc-usd-ethereum';
    raise exception 'an inferred permission reached production approval';
  exception when check_violation then null;
  end;

  -- And exactly one source in the registry publishes on inference.
  select count(*) into n from reference.source_interfaces where inferred_permission is not null;
  if n <> 1 then raise exception 'exactly one inferred permission is approved; found %', n; end if;

  raise notice 'ubwi 2e: inferred permission ok';
end
$$;

-- ---------------------------------------------------------------- what did not change

do $$
declare n integer;
begin
  -- The BTC supply source is the reason UBWI still does not publish. If a later migration
  -- promotes it quietly, this is where that shows up.
  select count(*) into n from reference.source_interfaces
   where slug = 'blockchain-info-supply'
     and data_use_terms_state = 'under_review'
     and inferred_permission is null;
  if n <> 1 then raise exception 'the BTC supply source must remain under review with no inference over it'; end if;

  -- Phase 2D's venue evidence survives the retirement of the rule it caused.
  select count(*) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker')
     and terms_artifact_hash is not null and terms_artifact_status = 200;
  if n <> 3 then raise exception 'the retired venues must keep their retained terms artifacts (found %)', n; end if;

  -- Methodology history is preserved rather than rewritten. 1.1.0 was superseded by 1.2.0
  -- in Phase 2F; what this file still guards is that its row survives, superseded rather
  -- than deleted or rewritten, which is the property a version history exists to have.
  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and ((version = '1.0.0' and status = 'superseded') or (version = '1.1.0' and status = 'superseded'));
  if n <> 2 then raise exception 'both earlier methodology versions must exist and be superseded'; end if;

  -- Nothing is published by a migration. Phase 2F publishes the first point through the
  -- loader; a bootstrapped database still holds none.
  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists'; end if;

  raise notice 'ubwi 2e: the evidence survived its own supersession';
end
$$;

rollback;
