# UMPI operations

How the Urdais Memory Price Index stays current without a person watching it, and what to do when
it does not. This describes the machinery only. What UMPI measures, and the rules it measures it
by, are in [the methodology](../methodology/umpi-kr-dram.md) and are not restated or amended here.

## The schedule

One cron, `/api/cron/umpi`, daily at **23:30 UTC**.

Daily, for a monthly product, on purpose. Both agencies publish on calendar days that move — the
Bank of Korea between the 19th and the 22nd, and both around Korean public holidays whose dates
shift every year — so a monthly job pinned to one day would either fire before the figure exists
or sit idle for days after it appeared.

23:30 UTC because the Bank of Korea releases to ECOS at 08:00 KST, which is 23:00 UTC the previous
day. A check half an hour later finds a new reference month on the morning it appears. It also
collides with no other Urdais cron; the rest of the schedule occupies 00:00–10:15 UTC.

One consequence worth knowing: a 23:30 UTC run falls on the previous UTC calendar day from the
Korean morning it observes, and the due-date arithmetic is in UTC. That makes Urdais treat a month
as due a few hours later than Korea would — which can delay a `stale` verdict by a day and can
never produce a false one.

Authentication is the shared `CRON_SECRET` bearer token. Without it the route returns 401 and does
nothing.

## What a normal run does

```
check each source over a narrow recent window
  → ingest only what is new or revised
  → derive only if canonical observations changed
  → evaluate freshness per series
  → record the run and one check per series
```

**Request volume per run: two.** One paginated ECOS read and one Korea Customs form POST, each
covering three reference months — the month that may have just appeared plus two more so a
revision is noticed. The 2020 base year is *not* re-read daily; see
[Series B base](#series-b-and-its-base) below.

For eleven months out of twelve the run finds nothing and records `success_no_change`. That is the
system working, not a failure, and nothing in the alerting treats it as one.

## Freshness is a reference month, not an age

This is the distinction the whole phase turns on.

A check that succeeded an hour ago says nothing about whether the product is current. If the
newest month it found was August and it is late October, a reader is looking at a two-month-old
figure while every timestamp on the page looks healthy. So freshness compares **months**, informed
by operational evidence rather than replaced by it.

| State | Meaning |
| --- | --- |
| `fresh` | the public month satisfies the expected-release rule |
| `awaiting_release` | the next month is not reasonably due from the agency yet |
| `stale` | it is due, the grace window has passed, and Urdais still lacks it |
| `source_unavailable` | the last check could not reach or parse the official source |
| `derivation_failed` | the source holds a month with no current publication |
| `unknown` | required operational evidence is missing; currentness cannot be claimed |

`fresh` and `awaiting_release` are healthy. Everything else is not.

Freshness fails closed. No check on record, or a schedule that has stopped, yields `unknown` —
never an optimistic default. Each series is evaluated on its own: the Bank of Korea missing a
release says nothing about Korea Customs, and the family summary takes the worst of the two rather
than letting one hide behind the other.

## Release and due policy

Stored per series in `reference.umpi_source_monitors`, with the observed release dates each
setting is derived from. These are not tuning knobs: changing one changes when Urdais claims its
own data is late.

| | Series A (BOK PPI) | Series B (Customs export UV) |
| --- | --- | --- |
| Due | day **22** of the following month | day **20** of the following month |
| Grace | **7** days | **10** days |
| Revision lookback | 3 months | 3 months |
| Max check age | 48 h | 48 h |

Series A's day comes from four observed releases: 2025-06 on 22 Jul 2025, 2025-07 on 21 Aug 2025,
2026-05 on 19 Jun 2026, 2026-06 on 22 Jul 2026. The week of grace absorbs a public-holiday slip.

Series B is set later and looser than its observed behaviour (August 2026 was available on
22 September 2026) because Urdais holds fewer release dates for it. The cost of an over-tight rule
is a false claim that Urdais's own data is late, which is worse than noticing a genuinely missed
month a few days later.

So a month is **due** on its release day and **overdue** only after the grace window. Between
those two, the state is `awaiting_release` and the product is healthy.

## Revisions

Both agencies revise. The Bank of Korea publishes preliminary figures; Korea Customs amends as
declarations are corrected. Each run re-reads three recent months, so a revision is picked up
unattended:

- a new vintage is stored and the prior observation superseded, never edited;
- the affected publication is regenerated, and the following month's MoM recomputed against the
  revised base;
- exactly one current row survives per series-month, and the superseded rows stay for audit.

### Series B and its base

Series B's levels are rebased to the 2020 calendar-year aggregate. That base is ingested once and
**not** re-fetched daily: re-reading twelve months of an official source every morning to detect a
revision that may never come is an abuse of it.

A 2020 revision therefore requires a deliberate audit rather than arriving on its own:

```
npm run umpi:ingest -- --source customs --from 2020-01 --to 2020-12
npm run umpi:derive
```

Run it **annually**, or whenever Korea Customs announces a reclassification touching HSK
8542321010. If the base moves, derivation generates a new base lineage, propagates it through
every Series B level, and supersedes the affected publications; the old base and publications are
retained. An exact rerun afterwards must change nothing.

The production check fails on `base_missing` or `base_ambiguous` if Series B ever has other than
exactly one live base, so a half-finished base supersession cannot pass silently.

## The operational record

| Table | What it holds |
| --- | --- |
| `reference.umpi_source_monitors` | the release policy above, with its rationale |
| `pipeline.umpi_operational_runs` | one row per run — the heartbeat |
| `pipeline.umpi_source_checks` | per-series evidence: window read, what changed, freshness, failure |

The heartbeat exists because without it a stopped scheduler is indistinguishable from a quiet
month. Run outcomes are `success_no_change`, `success_changed`, `partial_failure`, `failed`.

Failure detail is sanitized and capped at 500 characters. URLs are replaced and credential-shaped
parameters redacted before anything is written: this column must never become somewhere a response
body or a session cookie is quietly archived.

## Checking health

```
npm run umpi:production:check          # human-readable, exits non-zero when action is needed
npm run umpi:production:check -- --json
npm run umpi:production:check -- --as-of 2026-11-15
```

Suitable for CI, an external uptime monitor, or a future alerting rule. Urdais has no alerting
vendor and Phase 8 did not introduce one; this command is the integration point when it does.

It reports, per series: freshness, expected and published reference month, last check and whether
it reached the source, methodology version, source approval, base validity, and the last failure.

Conditions it detects:

| Code | Condition |
| --- | --- |
| `scheduler_never_ran` / `scheduler_missed` | no run recorded, or none within 48 h |
| `source_unavailable` | last check could not reach or parse the source |
| `publication_did_not_advance` | source has a month with no current publication |
| `reference_month_stale` | a due month is past its grace window |
| `freshness_unknown` | evidence missing; currentness cannot be evaluated |
| `methodology_not_in_force` | the series cites a methodology that is not approved and effective |
| `source_not_production_approved` | the source lost production approval on either rights axis |
| `base_missing` / `base_ambiguous` | Series B has other than one live base |
| `duplicate_current_publication` | two live rows for one series-month |

`awaiting_release` is **not** among them. A check that reported unhealthy whenever the newest month
was a few weeks old would fire every month and be ignored within two.

## Running one by hand

```
npm run umpi:ops                       # the same path the cron takes
npm run umpi:ops -- --as-of 2026-11-15 # evaluate against a different clock
```

Safe at any time. It reads a narrow window, writes only what changed, and takes the same advisory
lock the scheduled run does — so an accidental overlap with the cron is a clean no-op, recorded as
skipped rather than as a check. A skipped run is never mistaken for evidence that a source was
looked at.

Two runs cannot overlap: the lock is `pg_try_advisory_lock` on `umpi:operations`. Without it two
runs would race the same source sessions and could supersede each other's observations.

## Recovery

| Symptom | What to do |
| --- | --- |
| `scheduler_missed` | check the Vercel cron for `/api/cron/umpi` and `CRON_SECRET`, then `npm run umpi:ops` |
| `source_unavailable` | read `failure_detail` on the latest `umpi_source_checks` row; if the transport changed, the adapter needs a fix, not a retry |
| `publication_did_not_advance` | `npm run umpi:derive` — a blocked derivation names its own reason |
| `reference_month_stale` | run `umpi:ops` and read the check; if the agency has published, the fault is in ingestion or derivation, not the calendar |
| `base_missing` / `base_ambiguous` | inspect `pipeline.umpi_index_bases`; two live bases means a supersession did not complete |
| `duplicate_current_publication` | a partial unique index should prevent this; if it appears, the public read is ambiguous and one row must be superseded |

Reruns are always safe. Ingestion is idempotent on the payload digest, derivation resolves by
inputs digest, and an unchanged run writes nothing.

## What needs a person

- **A source transport that changed shape.** A parse failure is not a retry; the agency changed
  something and the adapter must be corrected.
- **A rights change.** If either source stops being production-approved, collection must stop. See
  the two-axis discipline in the methodology; approval of a methodology never grants rights.
- **A 2020 base revision.** Deliberate, per the audit above.
- **A methodology change.** Never made to fix an operational symptom. If operations reveal a defect
  in the methodology, stop and report it rather than amending the document.
