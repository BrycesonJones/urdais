-- UBWI Phase 2F: the supply leg stops being a dataset.
--
-- Methodology 1.1.0 left exactly one gate finding standing:
-- NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED, on the BTC supply source. Blockchain.com's retained
-- terms grant retrieval of the Explorer API and scope it "solely for informational
-- purposes", which does not grant the commercial derived-index publication Urdais performs.
--
-- This migration does not clear those terms and does not waive them. It records the
-- schema for a numerator that no longer needs them: under methodology 1.2.0 the BTC supply
-- is the protocol-scheduled cumulative block subsidy through the reference height, computed
-- from the height by arithmetic nobody licenses.
--
-- The distinction this file is built around, and the reason it is worth the columns:
--
--   * a RETRIEVED supply names an interface, and that interface's terms govern what may be
--     published from it;
--   * a DERIVED supply names no interface at all, because no third party supplied it. Its
--     rights basis is `derived_from_protocol`, which is deliberately neither `cleared` nor
--     `inferred_permitted`: both of those assert something about a provider's permission,
--     and here there is no provider to assert anything about.
--
-- What replaces the rights requirement is stricter than it was. A retrieved supply was
-- checked for permission; a derived supply is checked for correctness -- recomputed from
-- its own recorded height, with the height itself cross-verified across two independent
-- observations that must agree exactly. Both are enforced here as constraints, not only in
-- application code.
--
-- No gate threshold is touched. `reference.ubwi_publication_gates` is not modified by this
-- migration at all, and the invariants at the foot assert that the 40 % ceiling and the
-- 52 % floor are exactly what Phase 2C measured them into.
--
-- This migration seeds no observation, no calculation and no publication. Those are
-- collected and written by `npm run ubwi:load`, never migrated.

-- ------------------------------------------------- 1. the supply leg, derived not retrieved

alter table pipeline.btc_market_observations
  drop constraint btc_observations_supply_construction_allowed;

alter table pipeline.btc_market_observations
  add constraint btc_observations_supply_construction_allowed
    check (supply_construction in ('claimed_issuance', 'protocol_scheduled')),
  -- Null under protocol derivation. A supply interface recorded there would assert a
  -- dependency that does not exist, which is the precise thing 1.2.0 removes.
  alter column supply_source_interface_id drop not null,
  add column supply_derivation           text,
  add column supply_derivation_version   text,
  add column supply_rights_basis         text,
  add column halving_era                 integer,
  add column block_subsidy_sats          bigint,
  add column scheduled_supply_sats       bigint;

comment on column pipeline.btc_market_observations.supply_source_interface_id is
  'The interface a supply figure was retrieved through. Null under protocol_scheduled, where the quantity is derived from the block height and no third party supplies it.';
comment on column pipeline.btc_market_observations.supply_derivation is
  'The identity of the arithmetic that produced a derived supply, e.g. bitcoin-protocol-subsidy-schedule. Not a source interface: there is no provider, no terms document and no licence.';
comment on column pipeline.btc_market_observations.scheduled_supply_sats is
  'Cumulative scheduled block subsidy through the reference height, inclusive, in integer satoshis. Satoshis rather than BTC because this is the quantity the protocol defines; supply_btc is the conversion, not the source of truth.';
comment on column pipeline.btc_market_observations.halving_era is
  'floor(block_height / 210000). Genesis is era 0.';

alter table pipeline.btc_market_observations
  -- Exactly one of the two constructions, fully populated, and never a mixture of both.
  add constraint btc_observations_supply_lineage_matches_construction check (
    (supply_construction = 'claimed_issuance'
       and supply_source_interface_id is not null
       and supply_derivation is null
       and scheduled_supply_sats is null
       and supply_rights_basis is null)
    or
    (supply_construction = 'protocol_scheduled'
       and supply_source_interface_id is null
       and supply_derivation is not null
       and supply_derivation_version is not null
       and supply_rights_basis = 'derived_from_protocol'
       and halving_era is not null
       and block_subsidy_sats is not null
       and scheduled_supply_sats is not null)
  ),
  -- The protocol's own bounds. A supply outside these is not a bad observation; it is a
  -- broken derivation, and the database refuses to hold one either way.
  add constraint btc_observations_scheduled_supply_bounds check (
    scheduled_supply_sats is null
    or (scheduled_supply_sats >= 0 and scheduled_supply_sats <= 2100000000000000)
  ),
  add constraint btc_observations_block_subsidy_bounds check (
    block_subsidy_sats is null
    or (block_subsidy_sats >= 0 and block_subsidy_sats <= 5000000000)
  ),
  add constraint btc_observations_halving_era_agrees check (
    halving_era is null or halving_era = floor(block_height / 210000)
  ),
  -- The satoshi count and the BTC figure are the same quantity. Exact: the conversion is
  -- exact for every reachable supply, so any difference at all is a defect.
  add constraint btc_observations_supply_btc_agrees_with_sats check (
    scheduled_supply_sats is null
    or supply_btc = scheduled_supply_sats::numeric / 100000000
  );

-- The cumulative subsidy through a height, as the database's own independent statement of
-- the schedule. This is not a convenience: it is what lets the constraint below recompute a
-- stored supply without trusting the application that wrote it.
--
-- Closed over halving eras rather than looped over blocks, and in integer arithmetic
-- throughout. Era 33 onward pays nothing, because 5e9 lies between 2^32 and 2^33, so the
-- integer halving series reaches 1 satoshi at era 32 and 0 at era 33.
create or replace function pipeline.btc_scheduled_supply_sats(height bigint)
returns bigint
language plpgsql
immutable
as $$
declare
  era        integer;
  e          integer;
  total      bigint := 0;
  subsidy    bigint;
begin
  if height is null or height < 0 then
    raise exception 'block height must be a non-negative integer, got %', height;
  end if;
  era := floor(height / 210000);

  for e in 0 .. least(era, 33) - 1 loop
    total := total + 210000::bigint * (5000000000::bigint >> e);
  end loop;

  if era < 33 then
    subsidy := 5000000000::bigint >> era;
    total := total + (height - era::bigint * 210000 + 1) * subsidy;
  end if;

  return total;
end;
$$;

comment on function pipeline.btc_scheduled_supply_sats(bigint) is
  'Cumulative protocol-scheduled block subsidy through the given height, INCLUSIVE of it, in integer satoshis. Genesis is height 0 and returns 5000000000. Excludes transaction fees; applies no lost-coin or spendability adjustment.';

-- The recomputation, as a constraint. A stored supply that does not reproduce from its own
-- stated height cannot be inserted, whatever wrote it and whatever else is true of it.
alter table pipeline.btc_market_observations
  add constraint btc_observations_supply_reproduces_from_height check (
    scheduled_supply_sats is null
    or scheduled_supply_sats = pipeline.btc_scheduled_supply_sats(block_height)
  );

-- ------------------------------------------------- 2. the height, and its evidence
--
-- `height_confirmed_by` already required at least two source identities. From 1.2.0 the
-- height is the SOLE input to the supply quantity, so the identities alone are no longer
-- enough evidence: what each source actually returned, and when, has to be auditable.

create table pipeline.btc_height_observations (
  observation_id  uuid not null references pipeline.btc_market_observations (id) on delete restrict,
  -- The endpoint, not the company. Two endpoints of one provider would not be independent.
  source          text not null
                    constraint btc_height_source_present check (length(trim(source)) > 0),
  -- Exactly what came back, before parsing. This is what catches a lineage record whose
  -- stored evidence was edited without the value being re-derived.
  raw_value       text not null
                    constraint btc_height_raw_is_digits check (raw_value ~ '^[0-9]+$'),
  block_height    bigint not null
                    constraint btc_height_non_negative check (block_height >= 0),
  retrieved_at    timestamptz not null,
  -- Why Urdais may read this endpoint for an integer. Provenance, never a data licence:
  -- a block height is a consensus fact and no one licenses it.
  provenance      text not null
                    constraint btc_height_provenance_present check (length(trim(provenance)) > 0),
  primary key (observation_id, source),
  constraint btc_height_raw_matches_parsed check (raw_value::bigint = block_height)
);

comment on table pipeline.btc_height_observations is
  'Per-source evidence for the reference block height. Under methodology 1.2.0 the height is the only input to the BTC supply, so each independent reading is frozen whole: endpoint, raw returned bytes, parsed integer, retrieval time and provenance.';

alter table pipeline.btc_height_observations enable row level security;

-- Append-only, on the same trigger the rest of the pipeline uses.
create trigger btc_height_observations_append_only
  before update or delete on pipeline.btc_height_observations
  for each row execute function pipeline.forbid_mutation();

-- Exact agreement, enforced in the database and not only in the calculator.
--
-- Deferred to the end of the transaction because the rows arrive after their parent. The
-- rule is: a protocol_scheduled observation must carry at least two height readings, they
-- must all equal each other, and they must equal the height the supply was derived from.
-- Heights are never averaged and the higher reading is never taken silently.
create or replace function pipeline.check_btc_height_cross_verification()
returns trigger
language plpgsql
as $$
declare
  o           record;
  n_sources   integer;
  n_distinct  integer;
  observed    bigint;
begin
  for o in
    select id, block_height
      from pipeline.btc_market_observations
     where supply_construction = 'protocol_scheduled'
  loop
    select count(*), count(distinct block_height), min(block_height)
      into n_sources, n_distinct, observed
      from pipeline.btc_height_observations
     where observation_id = o.id;

    if n_sources < 2 then
      raise exception
        'observation % has % independent height reading(s); at least 2 are required', o.id, n_sources;
    end if;
    if n_distinct <> 1 then
      raise exception
        'observation % has disagreeing height readings; heights must agree exactly and are never averaged', o.id;
    end if;
    if observed <> o.block_height then
      raise exception
        'observation % derives supply from height % but its evidence says %', o.id, o.block_height, observed;
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger btc_height_cross_verified
  after insert or update on pipeline.btc_height_observations
  deferrable initially deferred
  for each row execute function pipeline.check_btc_height_cross_verification();

create constraint trigger btc_observations_height_cross_verified
  after insert or update on pipeline.btc_market_observations
  deferrable initially deferred
  for each row execute function pipeline.check_btc_height_cross_verification();

-- ------------------------------------------------- 3. methodology 1.2.0

update reference.methodology_versions
   set status = 'superseded', effective_to = '2026-09-15'
 where id = 'b0b0b0b0-0000-4000-8000-000000000008';

update reference.instrument_spec_versions
   set status = 'superseded', effective_to = '2026-09-15'
 where id = 'b0b0b0b0-0000-4000-8000-000000000009';

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-00000000000a', 'b0b0b0b0-0000-4000-8000-000000000001',
   '1.2.0', 'approved', 'docs/methodology/ubwi.md',
   -- sha256 of docs/methodology/ubwi.md at this commit.
   'f5747062704002405d16fcb14cd16694a61d9b82626091d11cb428b0e962756a', '2026-09-15');

-- sha256('UBWI-1.2.0:' || <document sha256>), salted with the spec identity so the
-- cross-spec uniqueness check stays meaningful.
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-00000000000b', 'b0b0b0b0-0000-4000-8000-000000000003',
   'b0b0b0b0-0000-4000-8000-00000000000a', '1.2.0', 'approved', 'docs/methodology/ubwi.md',
   'e93019c8ed357cd24b304b6c7ea3c5b26191c4fe5d7181efb5d3f408bcacbe1a', '2026-09-15');

-- ------------------------------------------------- 4. the instrument may now publish
--
-- UBWI has been `launch_blocked` since Phase 1, and through 2D and 2E the block was real:
-- a numerator source Urdais was not permitted to publish from. That source is gone from the
-- calculation path, the gate passes on its own unchanged thresholds, and the lifecycle
-- status is moved to reflect that rather than to enable it. Nothing here publishes a point;
-- the gate is still evaluated at publication time and can still refuse.

update reference.instruments
   set lifecycle_status = 'live'
 where symbol = 'UBWI';

-- ------------------------------------------------- 5. invariants
--
-- What must be true after this migration, asserted rather than assumed.

do $$
declare
  n numeric;
begin
  -- The schedule function, checked at the boundaries that decide it. These are protocol
  -- facts, not values copied from any explorer or supply dataset.
  if pipeline.btc_scheduled_supply_sats(0) <> 5000000000 then
    raise exception 'genesis must be one block of subsidy: the height convention is INCLUSIVE';
  end if;
  if pipeline.btc_scheduled_supply_sats(209999) <> 1050000000000000 then
    raise exception 'era 0 must close at 10,500,000 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(210000) <> 1050002500000000 then
    raise exception 'the subsidy must halve exactly at height 210,000';
  end if;
  if pipeline.btc_scheduled_supply_sats(839999) <> 1968750000000000 then
    raise exception 'four complete eras must close at 19,687,500 BTC';
  end if;
  -- Terminal supply: strictly below the nominal cap, because integer truncation of the
  -- halving series discards a remainder at every step.
  if pipeline.btc_scheduled_supply_sats(6929999) <> 2099999997690000 then
    raise exception 'terminal scheduled supply must be 20,999,999.9769 BTC';
  end if;
  if pipeline.btc_scheduled_supply_sats(6930000) <> pipeline.btc_scheduled_supply_sats(6929999) then
    raise exception 'supply must stop growing from the first zero-subsidy era';
  end if;
  if pipeline.btc_scheduled_supply_sats(50000000) > 2100000000000000 then
    raise exception 'scheduled supply must never exceed the 21,000,000 BTC cap';
  end if;

  -- Methodology history is preserved, not tidied away.
  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and version = '1.0.0' and status = 'superseded'
     and content_hash = '612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8';
  if n <> 1 then raise exception 'methodology 1.0.0 must remain, superseded and pinned to its own document hash'; end if;

  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and version = '1.1.0' and status = 'superseded'
     and content_hash = 'adceaefd0de3ec17239f7fd8a55c64c5106d081fc2aaf2fa9da7dc0f7e1b78e6';
  if n <> 1 then raise exception 'methodology 1.1.0 must remain, superseded and pinned to its own document hash'; end if;

  select count(*) into n from reference.methodology_versions
   where methodology_id = 'b0b0b0b0-0000-4000-8000-000000000001'
     and version = '1.2.0' and status = 'approved';
  if n <> 1 then raise exception 'methodology 1.2.0 must be approved'; end if;

  -- The retired supply interface is retained as evidence, and is NOT quietly cleared.
  -- The dependency was removed; the terms were not.
  select count(*) into n from reference.source_interfaces
   where slug = 'blockchain-info-supply';
  if n <> 1 then raise exception 'the retired supply interface must be retained as evidence, not deleted'; end if;

  -- No threshold moved. This is the assertion that the gate was not weakened to pass.
  select count(*) into n from reference.ubwi_publication_gates
   where version = '1.0.0'
     and max_imputed_share = 0.40
     and min_rights_cleared_coverage = 0.52;
  if n <> 1 then raise exception 'the publication gate thresholds must be unchanged by this migration'; end if;

  -- Nothing is published by a migration. History begins at a collected observation.
  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication was seeded; publications are written by the loader, never migrated'; end if;

  select count(*) into n from pipeline.btc_market_observations;
  if n <> 0 then raise exception 'a BTC observation was seeded; observations are collected, never migrated'; end if;
end;
$$;
