# Transmission Headroom: production operations

**Status: internal operations document.** Not the methodology, not routed publicly. It contains no credentials and none belongs here.

Transmission Headroom went live on UrdaisProd (`cyqtaydtfuwaexjkuynq`) on 22 September 2026. Methodology `transmission-headroom` 1.0.0, hash `965a5b70651879ad303316fbde86762faafdb9536d9c2c70b5b3dbd31df43ce6`.

## The one thing to know first

**ERCOT's history is not recoverable.** NP6-86-CD is a rolling seven-day window with no archive — ERCOT's own product page says *Display Duration: 7 days*. An artifact not retrieved within that window is gone permanently. This was watched happening during activation: a listing that held 188 artifacts held 155 six minutes later.

Everything else here can be recovered. NYISO keeps monthly archives back to 2002, so a missed day costs a re-run and nothing more.

That asymmetry is why the cron refreshes ERCOT before NYISO, and why ERCOT's monitor goes stale at 36 hours against a 168-hour window — so an alert fires with roughly five days of recoverable history still left.

## Sources

| | NYISO | ERCOT |
|---|---|---|
| Interface | `nyiso-external-limits-flows` | `ercot-sced-binding-constraints` |
| URL | `https://mis.nyiso.com/public/csv/ExternalLimitsFlows/` | `https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302` |
| Auth | none | none |
| Cadence | continuous into a daily file | hourly artifacts |
| History | monthly zips to 2002; **usable from 2005-02-01** | **rolling 7 days, no archive** |
| Rights | `ambiguous_requires_legal_review`, published under founder-accepted risk | `reusable_with_attribution_or_conditions` |
| Stale after | 24 h | 36 h (retention 168 h) |

## Scheduler

`GET /api/cron/transmission-headroom`, bearer `CRON_SECRET`, `15 10 * * *`.

Chosen to clear the existing slots: Interconnection Queue at 09:30 and the Power Delivery pair at 08:15 and 08:45. The route refreshes ERCOT, then NYISO, then recalculates analytics, and is safe to re-run: a byte-identical artifact writes nothing and an unchanged input digest reuses the run already recorded.

It never walks a historical archive. Backfill is a deliberate manual operation.

## Manual operations

```bash
# always confirm the target first
echo $DATABASE_URL

DATABASE_URL=<prod> npm run transmission-headroom:ingest -- --source ercot
DATABASE_URL=<prod> npm run transmission-headroom:ingest -- --source nyiso
DATABASE_URL=<prod> npm run transmission-headroom:ingest -- --source nyiso --month 2005-02
DATABASE_URL=<prod> npm run transmission-headroom:analytics -- --dry-run
DATABASE_URL=<prod> npm run transmission-headroom:analytics -- --write
```

### Recovering a missed run

ERCOT: re-run the ingest immediately. Anything still inside the seven-day window is retrieved; anything past it is lost and cannot be recovered by any means.

NYISO: re-run the current-day ingest, or ingest the affected month from its archive. Both are no-ops for data already held.

### Re-running a failed month

Safe and idempotent. Snapshot identity is `(source interface, content hash, publisher key)` checked before any work, so a re-run over identical bytes commits nothing in five statements. Each month is its own transaction: a failure loses that month and nothing else.

### Inspecting state

```sql
-- currentness and retention risk
select si.slug, m.stale_after_hours, m.retention_hours,
       max(f.observed_at) as latest
  from reference.transmission_source_monitors m
  join reference.source_interfaces si on si.id = m.source_interface_id
  left join pipeline.transmission_flow_observations f on f.source_interface_id = si.id
 group by 1,2,3;

-- invariants; expected to return no rows
select * from pipeline.transmission_domain_violations();

-- what the public surface would serve
select market_slug, metric_code, status, value, sample_size
  from pipeline.transmission_metric_results where entity_id is null;
```

## NYISO historical backfill — measured, and currently blocked

The backfill is **not complete in production**, and the reason is storage rather than time.

Measured on UrdaisProd during activation:

| | |
|---|---|
| One month (2005-02, 89,661 rows) | **311 s**, ~150 MB |
| Cost per canonical margin, all-in | **~4.2 KB** |
| Full history (~260 months, ~43 M observations) | **~22 hours** and **~180 GB** |

The instance ran out of disk partway through the second historical month, at a total database size of 974 MB. The transaction rolled back cleanly and production stayed healthy, which is the append-only design working, but it is a hard ceiling.

**Index overhead dominates.** `transmission_limit_observations` is 202 MB of which 150 MB is indexes (74%); `transmission_flow_observations` is 120 MB of which 90 MB is indexes (75%). That is the price of the composite unique indexes that make an orphan margin structurally impossible — each observation carries a five-column unique index purely as a foreign-key target.

Three ways forward, and the choice is a product decision rather than an operational one:

1. **Increase production disk.** ~200 GB for full history. Simplest, and the only option that delivers the twenty-year series the methodology describes.
2. **Reduce the index footprint.** The composite unique indexes could be narrowed, or the FK-target guarantee traded for a trigger. This weakens a real invariant to save space and should not be done casually.
3. **Accept shallow history.** Nothing on the public surface breaks: every published metric is a current point-in-time value, and the two history-dependent counts are already labelled as covering *retained* history. The per-entity history charts simply start later.

Until one is chosen, run the scheduler and let history accumulate forward.

### When resuming

```bash
# month by month, each its own transaction; a failure loses at most one month
DATABASE_URL=<prod> npm run transmission-headroom:ingest -- --source nyiso --from 2005-03 --to 2005-12
```

Check `transmission_domain_violations()` after each year; expected zero rows. Do not ingest before 2005-02-01 — earlier files exist but carry an unsigned `9999` in both limit columns, so no limit is published at all and the CLI refuses them.

## Semantics that must not drift

- **`abs(limit) = 9999` exactly** is NYISO's sentinel. Never a threshold: the largest genuine limit in the archive is 9,899 MW.
- **An ERCOT limit above 50,000 MW** is a disabled monitor. Retained as evidence, excluded from every derived margin.
- **Binding comes from `ShadowPrice`**, never from a margin of zero — production holds 47 observations at exactly their limit that are not binding.
- **`CCTStatus` gates nothing.**
- **ERCOT identity is `(ConstraintName, ContingencyName)`.** `ConstraintID` is a per-run handle: in production `NELRIO / BASE CASE` appears under 25 distinct IDs and resolves to one entity.
- **No cross-market figure exists** and there is no column to store one in.
