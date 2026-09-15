-- UBWI Phase 2E: the Chainlink price leg, Taiwan, and a rights state that is honest about
-- being an inference.
--
-- Three things happen here and they are worth separating, because only one of them is a
-- change to what the gate permits.
--
--   1. The numerator's price rule moves from the three-venue exchange median to the
--      Ethereum mainnet Chainlink BTC/USD Data Feed, and the schema gains somewhere to
--      freeze a round's full onchain lineage. Methodology 1.0.0 is superseded by 1.1.0;
--      its row, its hash and every retained venue terms artifact stay exactly where they
--      are. A retired methodology is history, not a mistake to be tidied away.
--
--   2. Taiwan joins the denominator's candidate sources. DGBAS publishes a 2008-SNA
--      total-economy net worth for 2024 under the Open Government Data License, Taiwan
--      1.0, and the CBC publishes the matching end-period exchange rate under the same
--      licence. Both declarations are retained and hashed.
--
--   3. `inferred_permission` is added to the source registry. This is the only widening of
--      anything, and it is deliberately narrow: an inference may support a numerator, may
--      never make a source production-approved, may never be recorded over an express
--      refusal, and may never be recorded over an express grant either -- understating
--      evidence that exists is its own kind of wrong.
--
-- What this migration still does NOT do. It does not mark the instrument `live`, and it
-- seeds no vintage, no calculation and no publication. UBWI remains `launch_blocked`: the
-- BTC supply source's own terms do not grant the derived-index publication Urdais performs,
-- that source is a numerator source, and the gate refuses. Phase 2E moved that problem off
-- the price leg; it did not solve it, and the invariants at the foot of this file assert
-- that nothing here quietly did.
--
-- Every hash below was computed with `shasum -a 256` over bytes retained in this session,
-- and every quoted clause was cut out of the retained document. `npm run ubwi:verify-terms`
-- re-derives both from the artifact store.

-- ------------------------------------------------- 1. inferred permission, as a column
--
-- The state the two-axis model could not express. Chainlink's feed is published through a
-- documented public interface and no prohibition was found -- but no grant was found
-- either, and Chainlink's terms page could not be read at all. `permitted` would assert a
-- permission nobody gave; `under_review` would assert an open review that an explicit
-- decision has closed.

alter table reference.source_interfaces
  add column inferred_permission jsonb;

comment on column reference.source_interfaces.inferred_permission is
  'An explicit product decision to proceed on inferred permission rather than on a grant. Carries the decision id, the date, the evidentiary basis, what was searched for and not found, and what the inference does not cover. Its presence never makes a source production-approved and never substitutes for a grant.';

alter table reference.source_interfaces
  -- A decision with no basis and no stated limits is a decision that has not been taken.
  add constraint source_interfaces_inferred_shape check (
    inferred_permission is null
    or (inferred_permission ? 'decision_id'
        and inferred_permission ? 'decided_on'
        and jsonb_typeof(inferred_permission -> 'basis') = 'array'
        and jsonb_array_length(inferred_permission -> 'basis') > 0
        and jsonb_typeof(inferred_permission -> 'not_found') = 'array'
        and jsonb_typeof(inferred_permission -> 'limits') = 'array'
        and jsonb_array_length(inferred_permission -> 'limits') > 0)
  ),
  -- An inference may never be recorded over a refusal. An express "no" is not something a
  -- product decision may infer its way past.
  add constraint source_interfaces_inference_never_over_a_refusal check (
    inferred_permission is null
    or (terms_review_state <> 'not_permitted' and data_use_terms_state <> 'not_permitted')
  ),
  -- Nor over a grant: where both axes are permitted the source is cleared outright, and
  -- recording an inference over it understates evidence that exists.
  add constraint source_interfaces_inference_never_over_a_grant check (
    inferred_permission is null
    or not (terms_review_state = 'permitted' and data_use_terms_state = 'permitted')
  ),
  -- An inference must rest on a retained document. "We inferred it from nothing" is the
  -- failure the whole terms-artifact mechanism exists to refuse.
  add constraint source_interfaces_inference_needs_artifact check (
    inferred_permission is null
    or (terms_artifact_hash is not null and terms_artifact_url is not null
        and terms_artifact_status = 200 and terms_retrieved_at is not null)
  ),
  -- And it is never a route to production approval, which still requires both axes.
  add constraint source_interfaces_inference_is_not_approval check (
    inferred_permission is null or production_access_state <> 'production_approved'
  );

-- ------------------------------------------------- 2. the Chainlink source interface

alter table reference.providers
  drop constraint providers_kind_allowed;

alter table reference.providers
  add constraint providers_kind_allowed check (provider_kind in (
    'cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider',
    'statistical_compiler', 'spot_venue', 'chain_data', 'other',
    -- UBWI Phase 2E: a decentralised oracle network is none of the above. It is not a
    -- spot venue, it does not custody anything, and it is not a statistical compiler.
    'oracle_network'
  ));

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('b1b1b1b1-0000-4000-8000-000000000017', 'chainlink', 'Chainlink', 'oracle_network', 'https://chain.link');

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  terms_review_state, data_use_terms_state, automated_retrieval_available,
  terms_artifact_url, terms_artifact_hash, terms_artifact_bytes, terms_artifact_status,
  terms_retrieved_at, inferred_permission, notes
) values (
  'b2b2b2b2-0000-4000-8000-000000000017', 'b1b1b1b1-0000-4000-8000-000000000017',
  'chainlink-btc-usd-ethereum', 'Chainlink BTC/USD Data Feed, Ethereum mainnet',
  'chain_data_interface',
  'https://etherscan.io/address/0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c#readContract',
  true, 'public_unauthenticated',
  -- Reading a public contract through a public RPC endpoint is not an act the provider's
  -- terms gate: the data is published onchain by design and any node serves it.
  'permitted',
  -- The axis that decides publication, and the one no document answered.
  'under_review',
  true,
  -- The artifact is Chainlink's documentation of the interface. It is not a licence and is
  -- not cited as one; it is what the inference rests on, and its last two sentences are
  -- the source of the staleness rule Urdais applies.
  'https://docs.chain.link/data-feeds',
  'cd1500be9c7fbc512ba304e30626bf7c7c4f41b92c8c0e6eabc81d8d3ad585e6',
  361460, 200, '2026-09-15T03:13:35Z',
  jsonb_build_object(
    'decision_id', 'ubwi-chainlink-inferred-2026-09-15',
    'decided_on', '2026-09-15',
    'decided_in', 'UBWI Phase 2E; docs/methodology/ubwi.md v1.1.0',
    'basis', jsonb_build_array(
      'The feed is exposed through Chainlink''s documented public interface: docs.chain.link/data-feeds documents the AggregatorV3Interface read path, and Chainlink''s own feed metadata document publishes this proxy address, its 3600 s heartbeat and its 0.5 % deviation threshold.',
      'The data is published onchain by the oracle network and readable by any Ethereum node; Urdais reads it through public RPC endpoints requiring no key, no account and no click-through agreement.',
      'Urdais is not reselling or redistributing the raw Chainlink feed. It reads one reference price at one instant.',
      'That single observed reference price is an input to Urdais''s own derived wealth index, alongside a Bitcoin supply figure and a wealth denominator Chainlink has no part in.'
    ),
    'not_found', jsonb_build_array(
      'No Chainlink terms document could be read at all: https://chain.link/terms, which docs.chain.link''s own footer names as governing, returns HTTP 200 with a client-rendered shell carrying 3,441 characters of navigation text and no terms prose.',
      'No explicit prohibition of the Coinbase or Kraken kind -- on caching, on automated recording, or on creating an external financial index from the data -- was found in any Chainlink document Urdais was able to retrieve.',
      'No explicit affirmative grant of a derived-index right was found either. The absence runs in both directions and both directions are recorded.'
    ),
    'limits', jsonb_build_array(
      'This is an inference, not a licence. Chainlink has granted Urdais nothing, has not been contacted, and no outreach was sent.',
      'It extends to reading one reference price as an index input. It does not extend to redistributing the feed, to mirroring it, or to presenting Urdais''s output as a Chainlink product.',
      'The terms of the upstream data providers whose data the oracle network aggregates are undisclosed to Urdais and are not covered by this inference.',
      'One successful retrieval of Chainlink''s terms text settles this either way and supersedes the inference.'
    )
  ),
  'Proxy 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c on Ethereum mainnet. Verified live through two independent public RPC endpoints on 15 September 2026, which returned byte-identical rounds: chain id 1, description() ''BTC / USD'', decimals() 8, version() 6, phaseId() 7, aggregator() 0x4a3411ac2948b33c69666b35cc6d055b27ea84f1 reporting typeAndVersion ''AccessControlledOCR2Aggregator 1.0.0''. Chainlink''s own feed metadata document gives heartbeat 3600 s, deviation threshold 0.5 % and product name BTC/USD-RefPrice-DF-Ethereum-001 -- a standard push-based Data Feed reference price, not Data Streams and not Smart Value Recapture. Chainlink is not a spot exchange: its documentation states the feed aggregates many data sources and names none of them, so Urdais cannot reconstruct the underlying source basket.'
);

-- ------------------------------------------------- 3. the numerator's price leg in schema
--
-- `median_price_usd` becomes `price_usd`. The column is renamed rather than duplicated
-- because no row exists to migrate -- UBWI has never published -- and carrying a column
-- named for a retired rule would mislabel every future observation.

alter table pipeline.btc_market_observations
  rename column median_price_usd to price_usd;

alter table pipeline.btc_market_observations
  rename constraint btc_observations_price_positive to btc_observations_price_usd_positive;

alter table pipeline.btc_market_observations
  drop constraint btc_observations_price_rule_allowed,
  drop constraint btc_observations_venue_minimum;

alter table pipeline.btc_market_observations
  add column price_source_interface_id uuid references reference.source_interfaces (id) on delete restrict,
  alter column venue_count drop not null,
  add constraint btc_observations_price_rule_allowed
    check (price_rule in ('median_of_venues', 'chainlink_reference_feed')),
  -- The venue minimum still binds under the rule it belongs to, and is meaningless under
  -- the other. A reference-feed observation carrying venue rows is a lineage bug.
  add constraint btc_observations_venue_count_matches_rule
    check ((price_rule = 'median_of_venues' and venue_count >= 3)
           or (price_rule = 'chainlink_reference_feed' and venue_count is null));

comment on column pipeline.btc_market_observations.price_usd is
  'The BTC/USD reference price the market capitalization was computed at, whatever rule produced it. Under methodology 1.1.0 this is the Chainlink BTC/USD Data Feed reference price on Ethereum mainnet; under the retired 1.0.0 rule it was the median of at least three venue tickers.';
comment on column pipeline.btc_market_observations.price_source_interface_id is
  'The interface the price was read through, so the numerator''s price leg is held to the same rights standard as its supply leg and as every denominator constituent.';

-- The round, frozen whole.
--
-- A published point that cannot be re-read from the chain later is not reproducible, and a
-- round id alone stops identifying a round once the aggregator behind the proxy has been
-- replaced. Hence the deliberate split this table encodes: the **proxy** is the methodology
-- pin, and the **aggregator** is observation lineage. An ordinary aggregator upgrade behind
-- the approved proxy is not a methodology change; a change of proxy, pair, network or
-- product type is, and fails closed.
create table pipeline.btc_chainlink_observations (
  observation_id               uuid primary key
                                 references pipeline.btc_market_observations (id) on delete restrict,
  chain_id                     bigint not null
                                 constraint btc_chainlink_chain_positive check (chain_id > 0),
  proxy_address                text not null
                                 constraint btc_chainlink_proxy_format check (proxy_address ~ '^0x[0-9a-fA-F]{40}$'),
  aggregator_address           text
                                 constraint btc_chainlink_aggregator_format
                                 check (aggregator_address is null or aggregator_address ~ '^0x[0-9a-fA-F]{40}$'),
  aggregator_type_and_version  text,
  feed_description             text not null
                                 constraint btc_chainlink_description_present check (btrim(feed_description) <> ''),
  decimals                     smallint not null
                                 constraint btc_chainlink_decimals_range check (decimals between 0 and 36),
  proxy_version                bigint,
  -- uint80 and uint64 do not fit a bigint, and a round id that has been through a float is
  -- a round id that no longer identifies a round. Stored as exact decimal text.
  round_id                     text not null
                                 constraint btc_chainlink_round_format check (round_id ~ '^[0-9]+$'),
  phase_id                     integer not null
                                 constraint btc_chainlink_phase_positive check (phase_id > 0),
  aggregator_round_id          text not null
                                 constraint btc_chainlink_agg_round_format check (aggregator_round_id ~ '^[0-9]+$'),
  answer                       numeric not null
                                 constraint btc_chainlink_answer_positive check (answer > 0),
  normalized_usd               numeric not null
                                 constraint btc_chainlink_normalized_positive check (normalized_usd > 0),
  started_at                   timestamptz not null,
  updated_at                   timestamptz not null,
  -- Frozen because it is part of the round. Never read as a validity condition: Chainlink's
  -- API reference marks it deprecated, and the old `answeredInRound >= roundId` idiom is a
  -- test on a field that no longer carries that meaning.
  answered_in_round            text
                                 constraint btc_chainlink_answered_format
                                 check (answered_in_round is null or answered_in_round ~ '^[0-9]+$'),
  retrieval_timestamp          timestamptz not null,
  block_number                 bigint not null
                                 constraint btc_chainlink_block_positive check (block_number > 0),
  block_hash                   text not null
                                 constraint btc_chainlink_block_hash_format check (block_hash ~ '^0x[0-9a-f]{64}$'),
  -- The endpoint's identity, never a secret. No endpoint Urdais reads carries one.
  rpc_source                   text not null
                                 constraint btc_chainlink_rpc_present check (btrim(rpc_source) <> ''),
  rpc_cross_check_source       text,
  created_at                   timestamptz not null default now(),

  -- The round id's decomposition: phase in the high 64 bits, aggregator round in the low
  -- 64. Checking it is what makes the frozen phase and aggregator round evidence rather
  -- than annotation.
  constraint btc_chainlink_round_decomposes
    check (round_id::numeric = phase_id::numeric * 18446744073709551616::numeric
                               + aggregator_round_id::numeric),
  -- answer / 10^decimals is the normalized value. Arithmetic the database verifies.
  constraint btc_chainlink_normalization_agrees
    check (abs(answer / power(10::numeric, decimals) - normalized_usd) <= normalized_usd * 1e-12),
  -- The staleness rule, as a constraint: the documented 3600-second heartbeat, with no
  -- grace period, and a retrieval that predates the round it read is a clock inconsistency
  -- rather than a fresh observation.
  constraint btc_chainlink_within_heartbeat
    check (retrieval_timestamp >= updated_at
           and retrieval_timestamp <= updated_at + interval '3600 seconds'),
  constraint btc_chainlink_round_ordered check (updated_at >= started_at)
);

comment on table pipeline.btc_chainlink_observations is
  'The Chainlink round behind a numerator observation, frozen whole: proxy (the methodology pin), aggregator and phase (observation lineage), the raw answer and its normalization, the round timestamps, and the block the read was pinned to. This is what makes a published numerator auditable onchain years later, including after the aggregator behind the proxy has been replaced.';

-- A Chainlink observation belongs to a Chainlink-priced market observation and to no other.
create or replace function pipeline.check_chainlink_observation_rule()
returns trigger
language plpgsql
as $$
declare
  rule text;
  iface_slug text;
begin
  select o.price_rule, s.slug into rule, iface_slug
    from pipeline.btc_market_observations o
    left join reference.source_interfaces s on s.id = o.price_source_interface_id
   where o.id = new.observation_id;
  if rule is distinct from 'chainlink_reference_feed' then
    raise exception 'observation % is priced by % and may not carry a Chainlink round', new.observation_id, rule
      using errcode = 'check_violation';
  end if;
  if iface_slug is distinct from 'chainlink-btc-usd-ethereum' then
    raise exception 'observation % must name the Chainlink interface as its price source (found %)', new.observation_id, coalesce(iface_slug, 'none')
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

comment on function pipeline.check_chainlink_observation_rule() is
  'A frozen Chainlink round must belong to an observation that says it was priced by the Chainlink feed, through the registered Chainlink interface.';

create constraint trigger btc_chainlink_rule_check
  after insert or update on pipeline.btc_chainlink_observations
  deferrable initially deferred
  for each row execute function pipeline.check_chainlink_observation_rule();

-- Row level security, on the same terms as every other pipeline table: enabled, with no
-- policy, so only the service role reaches it.
alter table pipeline.btc_chainlink_observations enable row level security;

-- ------------------------------------------------- 4. methodology 1.1.0
--
-- 1.0.0 is superseded, not rewritten. Its content hash still pins docs/methodology/ubwi.md
-- at the commit that version was recorded from, which is no longer the file's current hash,
-- and that is the point: a version that re-pointed at a later edit would destroy exactly
-- the history it exists to keep.

update reference.methodology_versions
   set status = 'superseded', effective_to = '2026-09-15'
 where id = 'b0b0b0b0-0000-4000-8000-000000000002';

update reference.instrument_spec_versions
   set status = 'superseded', effective_to = '2026-09-15'
 where id = 'b0b0b0b0-0000-4000-8000-000000000004';

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-000000000008', 'b0b0b0b0-0000-4000-8000-000000000001',
   '1.1.0', 'approved', 'docs/methodology/ubwi.md',
   -- sha256 of docs/methodology/ubwi.md at this commit.
   'adceaefd0de3ec17239f7fd8a55c64c5106d081fc2aaf2fa9da7dc0f7e1b78e6', '2026-09-15');

-- The spec hash is the document's, salted with the spec identity, so that the cross-spec
-- uniqueness check stays meaningful: sha256('UBWI-1.1.0:' || <document sha256>).
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-000000000009', 'b0b0b0b0-0000-4000-8000-000000000003',
   'b0b0b0b0-0000-4000-8000-000000000008', '1.1.0', 'approved', 'docs/methodology/ubwi.md',
   'bb0563998d86f8501c0196ccfe516ed268e290d52804f6984c9f974bc7cf96e9', '2026-09-15');

-- ------------------------------------------------- 5. Taiwan
--
-- DGBAS compiles National Wealth Statistics on a 2008 SNA basis and publishes a year-end
-- total-economy net worth. For 2024, released 29 April 2026: NT$2,589,685 x 10^8, being net
-- non-financial assets 2,080,329 plus net financial assets 509,356 -- and DGBAS's own Table
-- 1 note 1 states that net financial assets equal net *foreign* financial assets, because
-- domestic claims and obligations offset within the national economy. That is exactly the
-- denominator's concept.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('b1b1b1b1-0000-4000-8000-000000000018', 'dgbas-taiwan',
   'Directorate-General of Budget, Accounting and Statistics, Executive Yuan (Taiwan)',
   'statistical_compiler', 'https://www.dgbas.gov.tw'),
  ('b1b1b1b1-0000-4000-8000-000000000019', 'cbc-taiwan',
   'Central Bank of the Republic of China (Taiwan)',
   'statistical_compiler', 'https://www.cbc.gov.tw');

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  terms_review_state, data_use_terms_state, automated_retrieval_available,
  terms_artifact_url, terms_artifact_hash, terms_artifact_bytes, terms_artifact_status,
  terms_retrieved_at, notes
) values (
  'b2b2b2b2-0000-4000-8000-000000000018', 'b1b1b1b1-0000-4000-8000-000000000018',
  'dgbas-national-wealth', 'DGBAS National Wealth Statistics', 'statistical_dataset',
  'https://eng.stat.gov.tw/cp.aspx?n=2415', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.stat.gov.tw/cp.aspx?n=3164',
  '1ca109054477863b4718e05249f2b341f1376fc9cde6ef523fd8aa123922c0da',
  74986, 200, '2026-09-15T03:02:00Z',
  'Open Government Data License, Taiwan 1.0. DGBAS''s own declaration releases everything its sites publish ' ||
  'free of charge, non-exclusively and sublicensably, unlimited in time and territory, covering reproduction, ' ||
  'adaptation, editing, public transmission and the development of derivative products and services, states that ' ||
  'the grant is not afterwards withdrawn, and states that no separate written permission is required. Attribution ' ||
  'is the one condition and it is a real one: the licence provides that a user who fails to attribute is treated ' ||
  'as never having been granted the rights. data.gov.tw''s own English text states the licence is compatible with ' ||
  'CC BY 4.0. Reference years 2020-2024, updated 29 April 2026; Table 4 publishes in units of 100 million NT$ and ' ||
  'is the series Urdais reads, Table 1 the same totals rounded to two decimals of NT$ trillions. Land is included ' ||
  'in full but valued at announced current land value (公告現值) rather than market price, which DGBAS states in ' ||
  'Table 1 note 3; that is an asset-valuation caveat on the component, not a rights question, and it makes ' ||
  'Taiwan''s contribution conservative -- DGBAS''s own market-price alternative raises net worth by 0.39 %.'
), (
  'b2b2b2b2-0000-4000-8000-000000000019', 'b1b1b1b1-0000-4000-8000-000000000019',
  'cbc-exchange-rates', 'CBC NT$/US$ interbank spot closing rates', 'exchange_rate_series',
  'https://www.cbc.gov.tw/en/cp-4237-165072-15ec2-2.html', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.cbc.gov.tw/en/cp-958-40419-F8209-2.html',
  '443105f3af2316087daa9a37092d21737881bb48e7db1b1d199e4bf3b6703f20',
  23719, 200, '2026-09-15T03:02:00Z',
  'The CBC declares the same Open Government Data License, Taiwan 1.0, in English on its own site: ' ||
  '"all of data and materials on the Central Bank of the Republic of China (Taiwan)(herein known as CBC) website, ' ||
  'which are deemed as protected under copyrights and published publicly, are provided under Open Government ' ||
  'Data License, version 1.0 (OGDL-Taiwan-1.0), Link: https://data.gov.tw/license, in a free of charge, ' ||
  'non-exclusive, and sublicensable method for the public. Taiwan''s stock is converted at the 31 December 2024 ' ||
  'interbank spot market closing rate of 32.781, matched to the component''s own reference date. The ECB publishes ' ||
  'no New Taiwan dollar reference rate, which is why a second FX source exists at all; DGBAS''s national-accounts ' ||
  'workbook publishes a 32.11 rate for 2024 but labels it "Average of daily figures", a period average and the ' ||
  'wrong basis for a year-end stock.'
);

-- ------------------------------------------------- invariants
--
-- The migration must have moved exactly what it says it moved, and must not have moved UBWI
-- any closer to being published than the gate independently allows.

do $$
declare n integer;
begin
  -- The inference exists, is anchored to a retained artifact, and is not a grant.
  select count(*) into n from reference.source_interfaces
   where slug = 'chainlink-btc-usd-ethereum'
     and inferred_permission is not null
     and terms_artifact_hash is not null
     and terms_artifact_status = 200
     and data_use_terms_state <> 'permitted';
  if n <> 1 then raise exception 'the Chainlink interface must carry an inference anchored to a retained artifact, and must not read permitted on the data-use axis (found %)', n; end if;

  -- Exactly one source in the whole registry publishes on inference. A second would be a
  -- policy change and must not arrive as a side effect.
  select count(*) into n from reference.source_interfaces where inferred_permission is not null;
  if n <> 1 then raise exception 'exactly one inferred permission is approved; found %', n; end if;

  -- No inference made anything production-approved.
  select count(*) into n from reference.source_interfaces
   where inferred_permission is not null and production_access_state = 'production_approved';
  if n <> 0 then raise exception 'an inferred permission reached production approval (found %)', n; end if;

  -- Phase 2D's venue evidence survives the retirement. Retiring a rule does not retract the
  -- findings that caused it, and deleting them would make the amendment unreadable later.
  select count(*) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker', 'blockchain-info-supply')
     and terms_artifact_hash is not null and terms_artifact_status = 200;
  if n <> 4 then raise exception 'the four Phase 2D numerator terms artifacts must survive (found %)', n; end if;

  -- Still not one of them is cleared for the use a published numerator makes.
  select count(*) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker', 'blockchain-info-supply')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  if n <> 0 then raise exception 'a retired venue or the supply source reads cleared on both axes (found %)', n; end if;

  -- The BTC supply source in particular. This is the condition that keeps UBWI blocked, and
  -- an accidental promotion of it is exactly what this migration must not do.
  select count(*) into n from reference.source_interfaces
   where slug = 'blockchain-info-supply'
     and data_use_terms_state = 'under_review'
     and inferred_permission is null;
  if n <> 1 then raise exception 'the BTC supply source must remain under review with no inference recorded over it'; end if;

  -- Taiwan's two interfaces are cleared on both axes against retained artifacts, and the
  -- registry's own constraint already requires the artifact for that.
  select count(*) into n from reference.source_interfaces
   where slug in ('dgbas-national-wealth', 'cbc-exchange-rates')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted'
     and terms_artifact_hash is not null and terms_artifact_status = 200;
  if n <> 2 then raise exception 'both Taiwan interfaces must be cleared against a retained artifact (found %)', n; end if;

  -- Distinct documents. Two sources citing one hash would mean one of them was never read.
  select count(distinct terms_artifact_hash) into n from reference.source_interfaces
   where slug in ('dgbas-national-wealth', 'cbc-exchange-rates', 'chainlink-btc-usd-ethereum');
  if n <> 3 then raise exception 'the three Phase 2E artifacts must be three distinct documents (found %)', n; end if;

  -- Methodology history: 1.0.0 superseded and still pinned to its own hash, 1.1.0 approved.
  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and version = '1.0.0' and status = 'superseded'
     and content_hash = '612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8';
  if n <> 1 then raise exception 'methodology 1.0.0 must remain, superseded and pinned to its own document hash'; end if;

  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and version = '1.1.0' and status = 'approved';
  if n <> 1 then raise exception 'methodology 1.1.0 must be approved'; end if;

  -- Nothing published, and the instrument is still blocked.
  select count(*) into n from reference.instruments where symbol = 'UBWI' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UBWI must remain launch_blocked'; end if;

  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists'; end if;

  select count(*) into n from pipeline.btc_chainlink_observations;
  if n <> 0 then raise exception 'a Chainlink observation was seeded; observations are collected, never migrated'; end if;
end
$$;
