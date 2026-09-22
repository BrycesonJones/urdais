# Transmission Headroom: storage migration runbook

**Status: internal operations document.** For applying `20261007100000_transmission_headroom_storage.sql` to production. Measurements and reasoning are in [th5a-storage-analysis.md](../research/transmission-headroom/th5a-storage-analysis.md).

## What it does

Halves the storage cost of a transmission observation without changing a published number, the public API contract, or any invariant. Measured: **3,156 → 1,719 bytes per margin (−46%)**, and ingest persist time **22.1 s → 13.3 s (−40%)** on the same month.

It reshapes four tables — `raw_transmission_records`, `transmission_flow_observations`, `transmission_limit_observations`, `transmission_margins` — by creating new ones, copying every row, validating counts and values, then swapping names.

## Before you run it

Production currently holds roughly 190 snapshots, 118,000 margins and 495 MB of transmission tables. The migration **doubles that peak** while both copies exist, so there must be at least that much free disk before starting. **Production ran out of disk during the TH-5 backfill**, so confirm headroom first:

```sql
select pg_size_pretty(pg_database_size(current_database()));
select pg_size_pretty(sum(pg_total_relation_size(c.oid)))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'pipeline' and c.relname like '%transmission%';
```

If free space is less than the current transmission footprint plus a margin, **increase the disk first**. The migration is one transaction; there is no partial state to clean up, but a failure wastes the run.

## Risk

| | |
|---|---|
| Lock | `ACCESS EXCLUSIVE` on the four tables during the swap, at the end |
| Duration | dominated by the copy; ~30 s per 100k margins locally, so minutes at current production size |
| Rewrite size | equal to the existing transmission footprint (a full copy) |
| Temp space | negligible: the copies are ordered inserts, not sorts |
| Reversibility | none after the swap — the old tables are dropped inside the same transaction |

The scheduler must not run during the migration. Either apply it well clear of 10:15 UTC or pause the cron.

## Steps

1. **Confirm the target.** `echo $DATABASE_URL` — this is a schema rewrite; running it against the wrong database is not recoverable.
2. **Check free disk** as above.
3. **Preflight the ledger:** `DATABASE_URL=<prod> npm run migrations:check -- --production`. Expect this migration pending and nothing drifted.
4. **Apply:** `supabase db push --db-url <prod>`.
5. The migration validates itself before swapping — it compares row counts for all four tables and asserts no margin value changed. If any check fails the whole transaction rolls back and nothing is lost.
6. **Verify afterwards:**

```sql
select count(*) from pipeline.transmission_domain_violations();        -- 0
select count(*) from pipeline.transmission_margins;                    -- unchanged
select * from pipeline.transmission_margins_readable limit 5;          -- codes resolve
```

7. **Re-run the storage report** to confirm the saving landed:
   `DATABASE_URL=<prod> ./scripts/transmission-headroom/storage-report.sh`
8. **Smoke the public surface:** `GET /api/transmission-headroom` should be byte-comparable to before — the contract is unchanged.

## What changed, for anyone reading the tables directly

Codes that were text are now `smallint`. `reference.transmission_code_map` holds the mapping, `reference.transmission_code(domain, ordinal)` resolves one, and `pipeline.transmission_margins_readable` is the margin table with every code resolved back to text. Ad-hoc queries should use the view.

Primary keys on raw records and observations are `bigint`. Entity IDs are still UUIDs, deliberately: they appear in the public API and are not ours to renumber.

The two five-column unique indexes that made an orphan margin impossible are gone. `pipeline.check_transmission_margin_compatibility()` enforces the same thing on insert and adds two checks the indexes could not express. A rejection now arrives as `check_violation` rather than `foreign_key_violation`.

## Resuming the backfill

Do not resume until the disk question is settled. At the optimized rate a full NYISO history from 2005-02 needs about **89 GB including headroom**, down from 163 GB but still far above the current instance.

When there is room:

```bash
DATABASE_URL=<prod> npm run transmission-headroom:ingest -- --source nyiso --from 2005-03 --to 2005-12
```

Month by month, each its own transaction, `transmission_domain_violations()` after each year. A failed month is safely rerunnable.

Before committing to the full span, read the closing section of the storage analysis: the public product is entirely current-value, and a retention or resolution policy would cost a fraction of 89 GB without changing anything a reader sees. That is a methodology decision, not an operational one.
