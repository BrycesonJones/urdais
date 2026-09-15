-- UBWI daily publication cadence, in the database.
--
-- The application checks the observation date before it writes, and that is enough for a
-- retry, a redeployment or an operator rerun. It is not enough for two runs that overlap:
-- both would read an empty day and both would then insert. The index this file exercises
-- is the only thing standing between that race and two UBWI points for one day.
--
-- A constraint nobody has seen reject anything is a constraint nobody knows works, so this
-- tests the refusal, not the happy path.

begin;

do $$
declare
  n          integer;
  indexdef   text;
  failed     boolean;
begin
  -- ------------------------------------------------- the index exists, and is the right shape
  select count(*) into n
    from pg_indexes
   where schemaname = 'pipeline'
     and tablename = 'ubwi_publications'
     and indexname = 'ubwi_publications_daily_idx';
  if n <> 1 then
    raise exception 'the daily cadence index is missing';
  end if;

  select pg_get_indexdef(i.indexrelid) into indexdef
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where c.relname = 'ubwi_publications_daily_idx';

  if position('UNIQUE' in upper(indexdef)) = 0 then
    raise exception 'the daily cadence index must be unique, or it enforces nothing: %', indexdef;
  end if;
  -- Partial on the current set, for the same reason ubwi_publications_current_idx is: a
  -- superseded point must not hold its day against the point that replaces it.
  if position('superseded_by_id IS NULL' in indexdef) = 0 then
    raise exception 'the daily cadence index must be scoped to non-superseded rows: %', indexdef;
  end if;
  -- The UTC calendar date of published_at, which is the canonical UBWI chronology. A bare
  -- published_at::date would depend on the session TimeZone and could not be indexed.
  if position('utc' in lower(indexdef)) = 0 then
    raise exception 'the daily cadence index must key on the UTC date of published_at: %', indexdef;
  end if;

  -- ------------------------------------------------- it actually refuses a second day
  --
  -- Exercised directly on the index rather than through the whole publication chain: the
  -- publication trigger requires a gate-passed calculation, and what is under test here is
  -- the uniqueness of the day, not the gate. A temporary table carrying the same index
  -- shape proves the expression behaves as claimed across a full day boundary.
  create temporary table daily_cadence_probe (
    id            integer primary key,
    published_at  timestamptz not null,
    superseded_by_id uuid
  ) on commit drop;

  create unique index daily_cadence_probe_idx
    on daily_cadence_probe (((published_at at time zone 'utc')::date))
    where superseded_by_id is null;

  insert into daily_cadence_probe (id, published_at) values (1, '2026-09-15T04:33:47.738Z');

  -- A second point later the same UTC day: refused.
  failed := false;
  begin
    insert into daily_cadence_probe (id, published_at) values (2, '2026-09-15T23:59:59Z');
  exception when unique_violation then
    failed := true;
  end;
  if not failed then
    raise exception 'a second publication on the same UTC day must be refused';
  end if;

  -- The next UTC day, one second later in real time: allowed. The cadence is a day, not a
  -- rolling twenty-four hours.
  insert into daily_cadence_probe (id, published_at) values (3, '2026-09-16T00:00:00Z');

  -- A local-time reading would call 23:30 UTC on the 15th "the 16th" in Tokyo. The index
  -- reads UTC, so this collides with the 15th and is refused.
  failed := false;
  begin
    insert into daily_cadence_probe (id, published_at) values (4, '2026-09-15T23:30:00Z');
  exception when unique_violation then
    failed := true;
  end;
  if not failed then
    raise exception 'the daily key must be the UTC date, not a local-time one';
  end if;

  -- A superseded point does not hold its day.
  update daily_cadence_probe set superseded_by_id = gen_random_uuid() where id = 1;
  insert into daily_cadence_probe (id, published_at) values (5, '2026-09-15T12:00:00Z');

  select count(*) into n from daily_cadence_probe where superseded_by_id is null;
  if n <> 2 then
    raise exception 'expected exactly two current probe rows, found %', n;
  end if;

  -- ------------------------------------------------- production holds at most one per day
  select count(*) into n
    from (
      select (published_at at time zone 'utc')::date
        from pipeline.ubwi_publications
       where superseded_by_id is null
       group by 1
      having count(*) > 1
    ) duplicates;
  if n <> 0 then
    raise exception 'UBWI holds more than one current publication on % UTC day(s)', n;
  end if;
end
$$;

rollback;
