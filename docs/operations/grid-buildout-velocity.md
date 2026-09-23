# Grid Buildout Velocity — operations

**Status: internal operational runbook. Not the public methodology, not routed publicly, and not registered in the docs catalog.** The methodology is `docs/methodology/grid-buildout-velocity.md`, version 1.0.0, and nothing here may change it.

---

## What runs

| | |
| --- | --- |
| Job | `GET /api/cron/grid-buildout` |
| Schedule | `15 11 * * *` — daily, 11:15 UTC |
| Duration budget | `maxDuration = 300` seconds; observed runs complete in seconds |
| Auth | `Authorization: Bearer $CRON_SECRET`, the shared cron secret |
| Sequence | advisory lock → open ledger row → ingest ERCOT → ingest CAISO → methodology guard → analytics → validate → close ledger |

The route holds no policy. Every stage is the same reviewed runner the manual path uses, and there is no scheduler-only branch anywhere in the chain.

### Why daily, against sources that publish three times a year

ERCOT republishes TPIT roughly triannually; CAISO posts its Transmission Development Forum workbook twice a year. Daily looks profligate and is not: snapshot identity is the content hash, checked before any work, so a day on which neither publisher moved writes **nothing at all**. The cost of asking is one hash per source. What it buys is a bound on how long a genuinely new vintage sits unnoticed — one day, rather than however long until someone thinks to look.

---

## Sources

| Market | Source | Cadence | Artifact |
| --- | --- | --- | --- |
| ERCOT | Transmission Project and Information Tracking (TPIT), public cost-stripped workbook | ~3×/year | one XLSX, republished in place |
| CAISO | Transmission Development Forum, Approved Projects (TPP) workbook | 2×/year (Jan, Jul) | one XLSX per forum |

Both are unauthenticated public downloads. Neither requires a key.

---

## Freshness

Freshness measures **time since the pipeline last successfully published**. It does *not* measure the age of the source artifact — for a source that publishes three times a year, a hundred-day-old vintage is perfectly current and says nothing about whether anything is broken.

| | |
| --- | --- |
| Scheduled cadence | 24 hours |
| Stale after | **72 hours** — three scheduled runs |
| Defined in | `src/lib/grid-buildout/operations/freshness.ts` |

**Why 72 hours.** One missed or failed run is ordinary — a transient network failure, a publisher serving a bad gateway, a deploy landing mid-window — and should not flip a healthy product to stale. Three consecutive failures is not transient, and by then someone should be looking. The threshold is deliberately *not* tied to source cadence: one ERCOT publication interval would be ~122 days, which would let the pipeline be broken for four months while the product still claimed to be current.

### States

| State | Meaning | Public behaviour |
| --- | --- | --- |
| `current` | Last successful publication within 72 hours | Renders normally |
| `stale` | A valid publication exists but is older than 72 hours | **Keeps the last valid figures** and shows an amber notice saying they may be out of date. Nothing is substituted. |
| `unavailable` | Nothing has ever been published | Shows "no calculation published yet". Never a placeholder figure. |

Stale keeps serving, which follows the convention of the other Power Analytics products. Withdrawing a still-valid publication because the pipeline missed a few runs would lose more than it protects.

---

## Latest attempt versus latest successful publication

These are different questions and the system answers them separately. Conflating them is how an unattended pipeline turns one bad workbook into a broken public product.

- **`pipeline.buildout_job_runs`** records every *attempt*, successful or not.
- **`published = true`** is set only where the attempt left a validated analytics run current.
- The public read model serves the latest **validated analytics run**, which a failed attempt cannot touch.

A failed run therefore leaves the previous publication exactly where it was — authoritative, and ageing under the freshness gate until someone looks.

```sql
-- the latest attempt, whatever happened
select status, failed_phase, error_class, started_at, completed_at
  from pipeline.buildout_job_runs order by started_at desc limit 5;

-- the latest successful publication, which is what the public sees
select completed_at, analytics_run_id
  from pipeline.buildout_job_runs where published
 order by completed_at desc limit 1;

-- operational invariants; expected to be empty
select * from pipeline.buildout_operations_violations();
```

---

## Manual operation

```bash
# ingest only, from the live sources
npm run grid-buildout:ingest -- --all

# ingest from workbooks already on disk, replaying exactly the bytes a previous run saw
npm run grid-buildout:ingest -- --all --file ercot=/path/tpit.xlsx --file caiso=/path/tpp.xlsx

# the full scheduled path, by hand
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://urdais.com/api/cron/grid-buildout
```

A manual invocation writes a ledger row with `trigger = 'manual'`, so a recovery is distinguishable from a scheduled run afterwards.

**Rerunning is always safe.** Ingestion is snapshot-first: an unchanged artifact writes nothing. Analytics resolves by input digest: unchanged evidence returns the run already recorded rather than writing a second copy. Running the job twice in a row is a no-op by design, and is the first thing to try.

---

## Failure classes

Every failure records the **phase it happened in** — taken from where it occurred, never inferred from the message — and a coarse class that survives rewording.

| Class | Phase | Meaning | Response |
| --- | --- | --- | --- |
| `source_unavailable` | ingest | HTTP failure, DNS, timeout | Usually transient. Wait for the next run. |
| `source_shape_changed` | ingest | A sheet, column or the ZIP itself is not what the adapter expects | **Investigate before acting.** A publisher changed the workbook. Do not loosen the parser to make it pass. |
| `methodology_not_approved` | methodology_guard | 1.0.0 is unregistered, unapproved, or its digest does not match | An authorisation event, not a bug. Nothing new publishes until resolved. |
| `domain_violation` | validation | Canonical input is impossible, not merely absent | Investigate the ingest that produced it. |
| `output_contract_failed` | validation | A computed figure failed its contract | Investigate; do not publish. |
| `persistence_conflict` | persistence | A constraint refused a write | Check for a concurrent run. |
| `unexpected` | — | Unclassified | Read `error_detail`. |

Concurrent invocations collapse: the second takes `status = 'skipped_locked'` and does nothing. That is ordinary, not an incident.

---

## Recovery

1. **Read the ledger first.** `failed_phase` and `error_class` say where and what.
2. **Re-run the job.** Idempotence makes this free, and transient failures clear.
3. **If it fails again in `ingest` with `source_shape_changed`**, fetch the workbook and compare it against the adapter's expectations. A publisher change needs a reviewed adapter change, not a quick fix.
4. **If it fails in `methodology_guard`**, check `reference.methodology_versions` for slug `grid-buildout-velocity`. The digest must equal the one pinned in `methodology.ts`. An approved methodology version is never edited in place — supersede it with a new version instead.
5. **The public product keeps serving throughout.** There is no urgency beyond the 72-hour window, and after that the surface says so itself.

---

## What must never be "fixed" by hand

These are the things that look like defects and are not. Every one of them is a deliberate, documented decision, and editing canonical data to make a number look tidier destroys evidence.

- **The six 1930s CAISO dates.** Independently confirmed as the publisher's own stored values — an independent reader returns the same dates. They live only in prior-vintage columns and affect no published metric. Canonical evidence records what the source said.
- **Year-only CAISO dates.** 69 of 233 approval targets are given only to the year. They are *valid canonical data* at a coarser precision, not defects. They stay in the analytical universe, count everywhere else, and are excluded from M4 alone because a slip in days cannot be computed from a year without inventing one.
- **ERCOT reported zeroes.** Works character is classified from **`is_reported`**, never from `value > 0`. A publisher writing `0` has affirmatively said there is no line mileage; a publisher writing nothing has said nothing. 139 completions are the former and 1 is the latter, and collapsing them would misdescribe the majority of the series.
- **CAISO 233 → 214.** An *analytical* rule in methodology 1.0.0, resolving 16 identifiers that appear on several owner sheets. It is **not** canonical deduplication: every one of the 233 occurrences is retained, and `pipeline.buildout_project_resolutions` records which contributed to each counted project.
- **The `9999` sentinel on ERCOT completions.** Makes the *date* unknown, never the lifecycle. Those projects are in service because ERCOT's own Completed sheet says so.

---

## Regression expectations

Useful for confirming a run is sane. They are expectations, not constants in the code — a legitimate new source vintage will move them, and that is **source drift**, not a defect.

| | |
| --- | --- |
| M1 | 227 completions — 2025: 177, 2026: 50; 5 sentinel-dated excluded |
| M2 | 1,720 backlog — 31 / 1,350 / 292 / 47 |
| M3 | population 227; kV 23 / 139 / 65; works 24 / 60 / 3 / 139 / 1 |
| M4 | 140 published of 214; median 38.5 d; excluded 56 / 13 / 5 |
| M5 | 5 cancellations, 209 unmapped |
| CAISO | 233 canonical occurrences → 214 analytical projects, 16 groups |

If a figure moves, establish **why** before touching anything: source drift is normal, schema drift needs intervention, and an implementation regression needs a fix. Do not adjust data to restore an expected number.

---

## Configuration

| Variable | Purpose | New for GBV-5? |
| --- | --- | --- |
| `CRON_SECRET` | Authorises the scheduled endpoint | No — shared with every other cron |
| `DATABASE_URL` | Production database | No |

**No new environment variable or secret is introduced by this product.**
