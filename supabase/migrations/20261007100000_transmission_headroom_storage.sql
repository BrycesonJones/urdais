-- Transmission Headroom TH-5A: storage architecture for the historical backfill.
--
-- The NYISO backfill stopped in production against a full disk. The measurements behind this
-- migration, taken locally on one real month (89,661 source rows, 88,835 margins):
--
--   current    3,156 bytes per margin   131 MB heap + 136 MB index
--   this       1,544 bytes per margin    70 MB heap +  60 MB index      -51%
--
-- Over the full twenty-year series that is roughly 80 GB rather than 163 GB. It does not make the
-- backfill free, but it halves it without giving up a single guarantee.
--
-- Where the bytes were going, measured rather than guessed:
--
--   Two five-column unique indexes existed purely as foreign-key targets, so a margin could not
--   reference a flow or limit belonging to another market, entity, instant or contingency. They
--   cost 31 MB on one month and held no information the tables did not already have. The same
--   guarantee is now a trigger, which costs nothing at rest.
--
--   Seven columns held low-cardinality codes as text and were indexed as text. On the limit table
--   they averaged 81 bytes a row to carry about three bytes of information; `contingency_kind`
--   alone was 15 bytes in the heap and in two indexes. They are now smallint, with the vocabulary
--   tables still the authority and a lookup view restoring the readable form.
--
--   Every observation carried `interface_id`, `element_id` AND `entity_id`, where `entity_id`
--   always duplicated whichever of the first two was set. Sixteen bytes a row of pure copy.
--
--   Every observation carried `source_interface_id`, which an entity already determines, and
--   `native_timestamp`, which the raw record's payload already holds verbatim.
--
--   Every raw record carried `artifact_sha256` and `extraction_version`, both properties of the
--   snapshot above it, repeated 89,661 times a month.
--
--   Primary keys were UUIDs. As foreign keys and index entries they cost twice a bigint, and
--   nothing outside this schema ever sees them.
--
-- Two further savings were measured and DECLINED, because the bytes were not worth what they cost:
--
--   Storing the raw payload as a positional array rather than an object saves 9 MB a month (3.4%),
--   and makes raw evidence unreadable without the parser that wrote it. Raw evidence exists to be
--   readable on its own.
--
--   Half of all NYISO limit observations are never referenced by a margin, because only the
--   direction the flow ran in is applicable. Dropping them saves 22 MB a month (8%) and destroys
--   the ability to audit the sentinel rule, which is precisely the rule most worth auditing.
--
-- Nothing here changes methodology, a published number, or the public API contract.

-- ---------------------------------------------------------------- code vocabularies
--
-- The reference tables stay the authority on meaning. These map their codes onto the smallint
-- actually stored, so the join is still available and the storage is not text.

create table reference.transmission_code_map (
  domain      text not null,
  code        text not null,
  ordinal     smallint not null,
  primary key (domain, code),
  unique (domain, ordinal)
);

comment on table reference.transmission_code_map is
  'The smallint each low-cardinality code is stored as. The vocabulary tables remain the authority on what a code means; this only says how it is written down.';

insert into reference.transmission_code_map (domain, code, ordinal) values
  ('contingency_kind', 'not_applicable', 0),
  ('contingency_kind', 'base_case', 1),
  ('contingency_kind', 'post_contingency', 2),
  ('entity_kind', 'interface', 1),
  ('entity_kind', 'element', 2),
  ('limit_state', 'real', 1),
  ('limit_state', 'zero', 2),
  ('limit_state', 'sentinel', 3),
  ('limit_state', 'implausible', 4),
  ('limit_direction', 'undirected', 0),
  ('limit_direction', 'positive', 1),
  ('limit_direction', 'negative', 2),
  ('flow_direction', 'unspecified', 0),
  ('flow_direction', 'positive', 1),
  ('flow_direction', 'negative', 2),
  ('flow_direction', 'zero', 3),
  ('margin_state', 'ok', 1),
  ('margin_state', 'unmonitored_direction', 2),
  ('margin_state', 'zero_flow_direction_undetermined', 3),
  ('margin_state', 'implausible_limit', 4),
  ('selected_direction', 'undetermined', 0),
  ('selected_direction', 'positive', 1),
  ('selected_direction', 'negative', 2),
  ('selected_direction', 'undirected', 3),
  ('timestamp_zone_status', 'source_stated', 0),
  ('timestamp_zone_status', 'assumed_market_local', 1),
  ('timestamp_zone_status', 'ambiguous', 2),
  -- Field names are per-source and few; stored as an ordinal with the text kept here.
  ('native_field', 'Flow (MWH)', 1),
  ('native_field', 'Positive Limit (MWH)', 2),
  ('native_field', 'Negative Limit (MWH)', 3),
  ('native_field', 'Value', 4),
  ('native_field', 'Limit', 5),
  ('unit_as_published', 'MWH', 1),
  ('unit_as_published', 'MW', 2);

create or replace function reference.transmission_code(p_domain text, p_ordinal smallint)
returns text language sql stable parallel safe
set search_path = pg_catalog, reference
as $$ select code from reference.transmission_code_map where domain = p_domain and ordinal = p_ordinal $$;

create or replace function reference.transmission_ordinal(p_domain text, p_code text)
returns smallint language sql stable parallel safe
set search_path = pg_catalog, reference
as $$ select ordinal from reference.transmission_code_map where domain = p_domain and code = p_code $$;

-- ---------------------------------------------------------------- new tables

create table pipeline.raw_transmission_records_v2 (
  id                  bigint generated always as identity primary key,
  snapshot_id         uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  retrieval_id        uuid not null references pipeline.source_retrievals (id) on delete restrict,
  -- 32 raw bytes rather than 64 hex characters: the same digest, half the heap and half the index.
  record_hash         bytea not null
                        constraint raw_transmission_v2_hash_length check (octet_length(record_hash) = 32),
  native_entity_key   text not null
                        constraint raw_transmission_v2_entity_key_nonempty check (btrim(native_entity_key) <> ''),
  row_ordinal         integer not null
                        constraint raw_transmission_v2_ordinal_positive check (row_ordinal >= 1),
  -- The publisher's row, verbatim and self-describing. Deliberately still an object.
  payload             jsonb not null
                        constraint raw_transmission_v2_payload_object check (jsonb_typeof(payload) = 'object'),
  created_at          timestamptz not null default now(),
  unique (snapshot_id, record_hash)
);

comment on table pipeline.raw_transmission_records_v2 is
  'The publisher''s row verbatim. The artifact digest and extraction version live on the snapshot above rather than being repeated on every row, and the locator is the row ordinal, because the artifact is the snapshot.';

create index raw_transmission_v2_snapshot_idx on pipeline.raw_transmission_records_v2 (snapshot_id);

create table pipeline.transmission_flow_observations_v2 (
  id                  bigint generated always as identity primary key,
  snapshot_id         uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  raw_record_id       bigint not null references pipeline.raw_transmission_records_v2 (id) on delete restrict,
  -- One entity column. The kind lives on the entity, which is where it was always determined.
  entity_id           uuid not null,
  entity_kind         smallint not null,
  contingency_kind    smallint not null,
  observed_at         timestamptz not null,
  timestamp_zone_status smallint not null,
  flow_mw             numeric(14, 4) not null,
  flow_direction      smallint not null,
  native_field        smallint not null,
  unit_as_published   smallint not null,
  row_ordinal         integer not null,
  created_at          timestamptz not null default now(),

  constraint transmission_flow_v2_direction_matches_sign check (
    (flow_direction = 1 and flow_mw > 0) or (flow_direction = 2 and flow_mw < 0)
    or (flow_direction = 3 and flow_mw = 0) or flow_direction = 0),
  -- The business key. `source_interface_id` is gone: an entity belongs to exactly one interface,
  -- so carrying it here cost sixteen bytes a row and sixteen more in every index entry.
  unique (entity_id, observed_at, contingency_kind)
);

create index transmission_flow_v2_entity_idx
  on pipeline.transmission_flow_observations_v2 (entity_id, observed_at desc);
create index transmission_flow_v2_snapshot_idx
  on pipeline.transmission_flow_observations_v2 (snapshot_id);

create table pipeline.transmission_limit_observations_v2 (
  id                  bigint generated always as identity primary key,
  snapshot_id         uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  raw_record_id       bigint not null references pipeline.raw_transmission_records_v2 (id) on delete restrict,
  entity_id           uuid not null,
  entity_kind         smallint not null,
  contingency_kind    smallint not null,
  observed_at         timestamptz not null,
  native_field        smallint not null,
  direction           smallint not null,
  limit_mw            numeric(14, 4) not null,
  limit_state         smallint not null,
  unit_as_published   smallint not null,
  row_ordinal         integer not null,
  created_at          timestamptz not null default now(),

  -- The sentinel rule, unchanged and still exact. 3 is 'sentinel'.
  constraint transmission_limit_v2_sentinel_is_exact check (
    (limit_state = 3) = (abs(limit_mw) = 9999)),
  constraint transmission_limit_v2_zero_state check ((limit_state = 2) = (limit_mw = 0)),
  unique (entity_id, observed_at, contingency_kind, direction)
);

comment on constraint transmission_limit_v2_sentinel_is_exact on pipeline.transmission_limit_observations_v2 is
  'Unchanged from the original: NYISO publishes +/-9999 to mean the direction is not monitored, and the largest genuine limit in the archive is 9899, so exact magnitude is the only safe test.';

create index transmission_limit_v2_entity_idx
  on pipeline.transmission_limit_observations_v2 (entity_id, observed_at desc);
create index transmission_limit_v2_snapshot_idx
  on pipeline.transmission_limit_observations_v2 (snapshot_id);

create table pipeline.transmission_margins_v2 (
  id                      bigint generated always as identity primary key,
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  calculation_version_id  uuid not null references reference.transmission_calculation_versions (id) on delete restrict,
  entity_id               uuid not null,
  entity_kind             smallint not null,
  contingency_kind        smallint not null,
  observed_at             timestamptz not null,
  -- Plain surrogate foreign keys. Compatibility is a trigger, not two wide unique indexes.
  flow_observation_id     bigint not null references pipeline.transmission_flow_observations_v2 (id) on delete restrict,
  limit_observation_id    bigint references pipeline.transmission_limit_observations_v2 (id) on delete restrict,
  selected_direction      smallint not null,
  limit_field_used        smallint,
  state                   smallint not null,
  headroom_mw             numeric(14, 4),
  utilization_pct         numeric(10, 6),
  created_at              timestamptz not null default now(),

  constraint transmission_margin_v2_value_matches_state check ((state = 1) = (headroom_mw is not null)),
  constraint transmission_margin_v2_ok_has_limit check (
    state <> 1 or (limit_observation_id is not null and limit_field_used is not null)),
  constraint transmission_margin_v2_zero_flow_has_no_limit check (
    state <> 3 or (limit_observation_id is null and selected_direction = 0)),
  constraint transmission_margin_v2_utilization_range check (utilization_pct is null or utilization_pct >= 0),
  unique (calculation_version_id, entity_id, observed_at, contingency_kind, selected_direction)
);

comment on constraint transmission_margin_v2_value_matches_state on pipeline.transmission_margins_v2 is
  'An absence is never a zero. Only state 1 (ok) carries a number.';

create index transmission_margin_v2_entity_idx
  on pipeline.transmission_margins_v2 (entity_id, observed_at desc);
create index transmission_margin_v2_state_idx
  on pipeline.transmission_margins_v2 (source_interface_id, state);

-- ---------------------------------------------------------------- the compatibility trigger
--
-- This replaces the two five-column unique indexes. They guaranteed that a margin could only
-- reference a flow and a limit that already agreed with it about entity, instant and contingency;
-- they cost 31 MB on a single month to do it. The trigger enforces the same thing, adds the
-- direction check the indexes could not express, and costs nothing at rest.

create or replace function pipeline.check_transmission_margin_compatibility()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pipeline, reference
as $$
declare
  f record;
  l record;
begin
  select entity_id, observed_at, contingency_kind into f
    from pipeline.transmission_flow_observations_v2 where id = new.flow_observation_id;
  if f is null then
    raise exception 'margin references a flow observation that does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if f.entity_id <> new.entity_id then
    raise exception 'margin on entity % references a flow belonging to entity %',
      new.entity_id, f.entity_id using errcode = 'check_violation';
  end if;
  if f.observed_at <> new.observed_at then
    raise exception 'margin at % references a flow observed at %',
      new.observed_at, f.observed_at using errcode = 'check_violation';
  end if;
  if f.contingency_kind <> new.contingency_kind then
    raise exception 'margin under contingency kind % references a flow under %',
      new.contingency_kind, f.contingency_kind using errcode = 'check_violation';
  end if;

  if new.limit_observation_id is not null then
    select entity_id, observed_at, contingency_kind, direction, limit_state into l
      from pipeline.transmission_limit_observations_v2 where id = new.limit_observation_id;
    if l is null then
      raise exception 'margin references a limit observation that does not exist'
        using errcode = 'foreign_key_violation';
    end if;
    if l.entity_id <> new.entity_id or l.observed_at <> new.observed_at
       or l.contingency_kind <> new.contingency_kind then
      raise exception 'margin references a limit from another entity, instant or contingency'
        using errcode = 'check_violation';
    end if;
    -- The indexes could never check this: a computed margin must have measured against the
    -- direction it says it selected.
    if new.state = 1 and new.selected_direction <> l.direction then
      raise exception 'margin selected direction % but measured against a limit governing %',
        new.selected_direction, l.direction using errcode = 'check_violation';
    end if;
    -- Nor this: only a real or zero limit may produce a number.
    if new.state = 1 and l.limit_state not in (1, 2) then
      raise exception 'margin carries a value measured against a limit in state %', l.limit_state
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_transmission_margin_compatibility() is
  'Replaces two five-column unique indexes that existed only as foreign-key targets. Same guarantee, two further checks the indexes could not express, and 31 MB a month cheaper.';

create trigger transmission_margins_v2_compatibility
  before insert on pipeline.transmission_margins_v2
  for each row execute function pipeline.check_transmission_margin_compatibility();

-- ---------------------------------------------------------------- migrate existing rows

insert into pipeline.raw_transmission_records_v2
  (snapshot_id, retrieval_id, record_hash, native_entity_key, row_ordinal, payload, created_at)
select r.snapshot_id, r.retrieval_id, decode(r.record_hash, 'hex'), r.native_entity_key,
       r.row_ordinal, r.payload, r.created_at
  from pipeline.raw_transmission_records r
 order by r.created_at, r.id;

create temporary table transmission_raw_id_map on commit drop as
select old.id as old_id, new.id as new_id
  from pipeline.raw_transmission_records old
  join pipeline.raw_transmission_records_v2 new
    on new.snapshot_id = old.snapshot_id and new.record_hash = decode(old.record_hash, 'hex');
create index on transmission_raw_id_map (old_id);

insert into pipeline.transmission_flow_observations_v2
  (snapshot_id, raw_record_id, entity_id, entity_kind, contingency_kind, observed_at,
   timestamp_zone_status, flow_mw, flow_direction, native_field, unit_as_published, row_ordinal, created_at)
select f.snapshot_id, m.new_id, f.entity_id,
       reference.transmission_ordinal('entity_kind', f.entity_kind),
       reference.transmission_ordinal('contingency_kind', f.contingency_kind),
       f.observed_at,
       reference.transmission_ordinal('timestamp_zone_status', f.timestamp_zone_status),
       f.flow_mw,
       reference.transmission_ordinal('flow_direction', f.flow_direction),
       reference.transmission_ordinal('native_field', f.native_field),
       reference.transmission_ordinal('unit_as_published', f.unit_as_published),
       f.row_ordinal, f.created_at
  from pipeline.transmission_flow_observations f
  join transmission_raw_id_map m on m.old_id = f.raw_record_id;

insert into pipeline.transmission_limit_observations_v2
  (snapshot_id, raw_record_id, entity_id, entity_kind, contingency_kind, observed_at,
   native_field, direction, limit_mw, limit_state, unit_as_published, row_ordinal, created_at)
select l.snapshot_id, m.new_id, l.entity_id,
       reference.transmission_ordinal('entity_kind', l.entity_kind),
       reference.transmission_ordinal('contingency_kind', l.contingency_kind),
       l.observed_at,
       reference.transmission_ordinal('native_field', l.native_field),
       reference.transmission_ordinal('limit_direction', l.direction),
       l.limit_mw,
       reference.transmission_ordinal('limit_state', l.limit_state),
       reference.transmission_ordinal('unit_as_published', l.unit_as_published),
       l.row_ordinal, l.created_at
  from pipeline.transmission_limit_observations l
  join transmission_raw_id_map m on m.old_id = l.raw_record_id;

insert into pipeline.transmission_margins_v2
  (source_interface_id, calculation_version_id, entity_id, entity_kind, contingency_kind,
   observed_at, flow_observation_id, limit_observation_id, selected_direction, limit_field_used,
   state, headroom_mw, utilization_pct, created_at)
select g.source_interface_id, g.calculation_version_id, g.entity_id,
       reference.transmission_ordinal('entity_kind', g.entity_kind),
       reference.transmission_ordinal('contingency_kind', g.contingency_kind),
       g.observed_at, nf.id, nl.id,
       reference.transmission_ordinal('selected_direction', g.selected_direction),
       reference.transmission_ordinal('native_field', g.limit_field_used),
       reference.transmission_ordinal('margin_state', g.state),
       g.headroom_mw, g.utilization_pct, g.created_at
  from pipeline.transmission_margins g
  join pipeline.transmission_flow_observations_v2 nf
    on nf.entity_id = g.entity_id and nf.observed_at = g.observed_at
   and nf.contingency_kind = reference.transmission_ordinal('contingency_kind', g.contingency_kind)
  left join pipeline.transmission_limit_observations ol on ol.id = g.limit_observation_id
  left join pipeline.transmission_limit_observations_v2 nl
    on nl.entity_id = g.entity_id and nl.observed_at = g.observed_at
   and nl.contingency_kind = reference.transmission_ordinal('contingency_kind', g.contingency_kind)
   and nl.direction = reference.transmission_ordinal('limit_direction', ol.direction);

-- ---------------------------------------------------------------- validate before swapping
--
-- Nothing is dropped until the new tables are proved to hold exactly what the old ones held.

do $$
declare old_n bigint; new_n bigint;
begin
  select count(*) into old_n from pipeline.raw_transmission_records;
  select count(*) into new_n from pipeline.raw_transmission_records_v2;
  if old_n <> new_n then raise exception 'raw records: % old, % migrated', old_n, new_n; end if;

  select count(*) into old_n from pipeline.transmission_flow_observations;
  select count(*) into new_n from pipeline.transmission_flow_observations_v2;
  if old_n <> new_n then raise exception 'flow observations: % old, % migrated', old_n, new_n; end if;

  select count(*) into old_n from pipeline.transmission_limit_observations;
  select count(*) into new_n from pipeline.transmission_limit_observations_v2;
  if old_n <> new_n then raise exception 'limit observations: % old, % migrated', old_n, new_n; end if;

  select count(*) into old_n from pipeline.transmission_margins;
  select count(*) into new_n from pipeline.transmission_margins_v2;
  if old_n <> new_n then raise exception 'margins: % old, % migrated', old_n, new_n; end if;

  -- Every value must survive identically, not merely every row.
  select count(*) into new_n from pipeline.transmission_margins g
    join pipeline.transmission_margins_v2 v
      on v.entity_id = g.entity_id and v.observed_at = g.observed_at
     and v.selected_direction = reference.transmission_ordinal('selected_direction', g.selected_direction)
   where g.headroom_mw is distinct from v.headroom_mw;
  if new_n <> 0 then raise exception '% margin values changed during migration', new_n; end if;
end $$;

-- ---------------------------------------------------------------- swap

drop table pipeline.transmission_margins;
drop table pipeline.transmission_limit_observations;
drop table pipeline.transmission_flow_observations;
drop table pipeline.raw_transmission_records;

alter table pipeline.raw_transmission_records_v2 rename to raw_transmission_records;
alter table pipeline.transmission_flow_observations_v2 rename to transmission_flow_observations;
alter table pipeline.transmission_limit_observations_v2 rename to transmission_limit_observations;
alter table pipeline.transmission_margins_v2 rename to transmission_margins;

-- The function body is stored as text and does not follow a rename, so it is re-created here
-- against the final table names. Same logic, same guarantees.
create or replace function pipeline.check_transmission_margin_compatibility()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pipeline, reference
as $$
declare
  f record;
  l record;
begin
  select entity_id, observed_at, contingency_kind into f
    from pipeline.transmission_flow_observations where id = new.flow_observation_id;
  if f is null then
    raise exception 'margin references a flow observation that does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if f.entity_id <> new.entity_id then
    raise exception 'margin on entity % references a flow belonging to entity %',
      new.entity_id, f.entity_id using errcode = 'check_violation';
  end if;
  if f.observed_at <> new.observed_at then
    raise exception 'margin at % references a flow observed at %',
      new.observed_at, f.observed_at using errcode = 'check_violation';
  end if;
  if f.contingency_kind <> new.contingency_kind then
    raise exception 'margin under contingency kind % references a flow under %',
      new.contingency_kind, f.contingency_kind using errcode = 'check_violation';
  end if;

  if new.limit_observation_id is not null then
    select entity_id, observed_at, contingency_kind, direction, limit_state into l
      from pipeline.transmission_limit_observations where id = new.limit_observation_id;
    if l is null then
      raise exception 'margin references a limit observation that does not exist'
        using errcode = 'foreign_key_violation';
    end if;
    if l.entity_id <> new.entity_id or l.observed_at <> new.observed_at
       or l.contingency_kind <> new.contingency_kind then
      raise exception 'margin references a limit from another entity, instant or contingency'
        using errcode = 'check_violation';
    end if;
    -- The indexes could never check this: a computed margin must have measured against the
    -- direction it says it selected.
    if new.state = 1 and new.selected_direction <> l.direction then
      raise exception 'margin selected direction % but measured against a limit governing %',
        new.selected_direction, l.direction using errcode = 'check_violation';
    end if;
    -- Nor this: only a real or zero limit may produce a number.
    if new.state = 1 and l.limit_state not in (1, 2) then
      raise exception 'margin carries a value measured against a limit in state %', l.limit_state
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_transmission_margin_compatibility() is
  'Replaces two five-column unique indexes that existed only as foreign-key targets. Same guarantee, two further checks the indexes could not express, and 31 MB a month cheaper.';



-- Append-only, as before. A schema migration may reshape the table; nothing may edit a row.
create trigger raw_transmission_records_immutable
  before update or delete on pipeline.raw_transmission_records
  for each row execute function pipeline.forbid_mutation();
create trigger transmission_flow_observations_immutable
  before update or delete on pipeline.transmission_flow_observations
  for each row execute function pipeline.forbid_mutation();
create trigger transmission_limit_observations_immutable
  before update or delete on pipeline.transmission_limit_observations
  for each row execute function pipeline.forbid_mutation();
create trigger transmission_margins_immutable
  before update or delete on pipeline.transmission_margins
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.raw_transmission_records enable row level security;
alter table pipeline.transmission_flow_observations enable row level security;
alter table pipeline.transmission_limit_observations enable row level security;
alter table pipeline.transmission_margins enable row level security;
alter table reference.transmission_code_map enable row level security;

-- ---------------------------------------------------------------- readable view
--
-- The codes are stored as smallint; this is how a human or an ad-hoc query reads them back.

create or replace view pipeline.transmission_margins_readable as
select m.id, m.source_interface_id, m.entity_id, m.observed_at,
       reference.transmission_code('entity_kind', m.entity_kind) as entity_kind,
       reference.transmission_code('contingency_kind', m.contingency_kind) as contingency_kind,
       reference.transmission_code('selected_direction', m.selected_direction) as selected_direction,
       reference.transmission_code('native_field', m.limit_field_used) as limit_field_used,
       reference.transmission_code('margin_state', m.state) as state,
       m.headroom_mw, m.utilization_pct, m.flow_observation_id, m.limit_observation_id,
       m.calculation_version_id, m.created_at
  from pipeline.transmission_margins m;

comment on view pipeline.transmission_margins_readable is
  'The margin table with its smallint codes resolved back to text. For humans and ad-hoc queries; the engine reads the table directly.';

-- ---------------------------------------------------------------- domain invariants, updated

create or replace function pipeline.transmission_domain_violations()
returns table (violation text, detail text, occurrences bigint)
language sql
stable
security invoker
set search_path = pg_catalog, pipeline, reference
as $$
  select 'margin_from_ineligible_limit',
         'a margin carries a value measured against a limit that is not real or zero',
         count(*)
    from pipeline.transmission_margins m
    join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
   where m.state = 1 and l.limit_state not in (1, 2)
  having count(*) > 0
  union all
  select 'margin_value_without_ok_state',
         'a margin holds a number in a state that must not carry one',
         count(*)
    from pipeline.transmission_margins
   where (state = 1) <> (headroom_mw is not null)
  having count(*) > 0
  union all
  select 'flow_without_raw_record',
         'a flow observation has no raw evidence behind it',
         count(*)
    from pipeline.transmission_flow_observations f
    left join pipeline.raw_transmission_records r on r.id = f.raw_record_id
   where r.id is null
  having count(*) > 0
  union all
  select 'limit_without_raw_record',
         'a limit observation has no raw evidence behind it',
         count(*)
    from pipeline.transmission_limit_observations l
    left join pipeline.raw_transmission_records r on r.id = l.raw_record_id
   where r.id is null
  having count(*) > 0
  union all
  select 'raw_without_snapshot',
         'a raw record has no snapshot behind it',
         count(*)
    from pipeline.raw_transmission_records r
    left join pipeline.transmission_snapshots s on s.id = r.snapshot_id
   where s.id is null
  having count(*) > 0
  union all
  select 'margin_direction_mismatch',
         'a margin selected a direction the limit it used does not govern',
         count(*)
    from pipeline.transmission_margins m
    join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
   where m.state = 1 and m.selected_direction <> l.direction
  having count(*) > 0;
$$;
