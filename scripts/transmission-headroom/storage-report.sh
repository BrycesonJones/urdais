#!/usr/bin/env bash
# Transmission Headroom storage report.
#
# Run after a representative ingest to see where the bytes went. Not a byte-exact CI assertion --
# it exists so an index explosion is visible before it reaches a backfill.
#
#   ./scripts/db/local.sh reset && ./scripts/db/local.sh migrate
#   npm run transmission-headroom:ingest -- --source nyiso --month 2005-02
#   ./scripts/transmission-headroom/storage-report.sh
set -euo pipefail
DB="${DATABASE_URL:-postgresql://postgres@localhost:54329/urdais_local}"

psql "$DB" -X -q -c "vacuum analyze pipeline.raw_transmission_records,
  pipeline.transmission_flow_observations, pipeline.transmission_limit_observations,
  pipeline.transmission_margins;"

echo "== per table =="
psql "$DB" -X -c "
select c.relname as table, pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       pg_size_pretty(pg_relation_size(c.oid)) as heap,
       pg_size_pretty(pg_indexes_size(c.oid)) as indexes,
       round(100.0*pg_indexes_size(c.oid)/nullif(pg_total_relation_size(c.oid),0)) as index_pct
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'pipeline' and c.relkind = 'r'
   and c.relname in ('raw_transmission_records','transmission_flow_observations',
                     'transmission_limit_observations','transmission_margins')
 order by pg_total_relation_size(c.oid) desc;"

echo "== all-in cost per margin, and what a full NYISO history would need =="
psql "$DB" -X -c "
with m as (select count(*)::numeric n from pipeline.transmission_margins),
     s as (select sum(pg_total_relation_size(c.oid))::numeric b
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'pipeline' and c.relkind = 'r'
              and c.relname in ('raw_transmission_records','transmission_flow_observations',
                                'transmission_limit_observations','transmission_margins'))
select m.n as margins, pg_size_pretty(s.b::bigint) as total,
       round(s.b/nullif(m.n,0)) as bytes_per_margin,
       round(43000000 * (s.b/nullif(m.n,0)) / 1e9) as projected_gb_43m,
       round(1.2 * 43000000 * (s.b/nullif(m.n,0)) / 1e9) as with_20pct_headroom_gb
  from m, s;"

echo "== largest indexes =="
psql "$DB" -X -c "
select i.relname as index, pg_size_pretty(pg_relation_size(i.oid)) as size
  from pg_class i join pg_index x on x.indexrelid = i.oid
  join pg_class t on t.oid = x.indrelid join pg_namespace n on n.oid = i.relnamespace
 where n.nspname = 'pipeline' and t.relname like '%transmission%'
 order by pg_relation_size(i.oid) desc limit 8;"
