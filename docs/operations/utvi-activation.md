# UTVI Activation Checklist

**Status: internal operations document. Not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026, at the end of Phase 1B.

The UTVI backend is built, migrated locally, and verified end to end against the live source and a real database. **Nothing is activated in production.** This document is the list of deliberate steps that would activate it, in the order they have to happen, and the reason each one is a separate decision rather than part of the build.

## What is true today

| | State |
|---|---|
| Schema | Five `pipeline.utvi_*` tables, migration `20260916000000`. Applied to the **local harness only** |
| Production writes | **None.** No UrdaisProd or UrdaisDev connection was opened by any part of this phase |
| Production backfill | **None.** 621 dates were backfilled into the local harness twice, to prove idempotency |
| Cron schedule | **Not registered.** The route exists at `/api/cron/utvi`; `vercel.json` is unchanged |
| `OPENROUTER_API_KEY` in Vercel | **Not set.** It exists in `.env.local` only |
| Published values | **None, structurally.** The methodology is `0.1.1-draft`, and a database trigger refuses any publication under a version that is not `approved` |
| UI | Unchanged. `UtviSection` still renders demo data |

The last row is the important one. Publication is not disabled by a feature flag that someone could flip by accident; it is refused by `pipeline.check_utvi_publication()`, which reads `reference.methodology_versions.status` and raises. Approving the methodology is therefore the activation switch, and it is a governance decision rather than a deployment one.

## Activation order

The order matters. Each step is safe on its own and several are unsafe out of order.

### 1. Approve the methodology — a governance decision, not an engineering one

UTVI 0.1.1-draft carries two open items that should close before approval:

- **The settlement lag is provisional.** It is set to one calculation day on the strength of one afternoon's measurements. The fourteen-day protocol in [the characterization](../research/utvi/source-characterization.md#14-a-revision-measurement-protocol) confirms or corrects it, needs no storage, and can run against the local harness at any time.
- **BYOK and hidden-app inclusion is undocumented.** It does not change a column, but it changes the universe descriptor that is frozen onto every published value — which is exactly the thing that cannot be corrected retroactively without superseding every point. Worth one email to OpenRouter first.

Approval is then a migration: set the version's `status` to `approved` and give it an `effective_from`. The draft-has-no-effective-date constraint means those two must move together.

**Until this step, every other step is safe**, because nothing can publish.

### 2. Set `OPENROUTER_API_KEY` in Vercel

Server-side only, never `NEXT_PUBLIC_`. The cron route refuses with `no_source_credential` and a 503 until it is set, so an unset key is a visible failure rather than a silent one.

Any valid OpenRouter key works — the same one used for inference. The published limits are 30 requests/minute per key and 500/day per account; a daily UTVI run uses two.

### 3. Apply the migration to UrdaisProd

`20260916000000_utvi_observed_token_volume.sql`. It creates five tables, extends three vocabularies, relaxes one column to nullable, and seeds reference data. It writes no observation, no calculation and no publication.

One vocabulary change is worth reading before applying: `reference.instruments.output_currency` becomes nullable, because a token count is not money and writing `USD` on one would be a false statement about the published value. Existing rows are untouched.

### 4. Backfill production history

```
npx tsx scripts/utvi/backfill.ts --database-url "$PROD_URL" --i-know-this-is-production
```

The acknowledgement flag is required for any non-local target and there is no way to pass it by accident. Expect, from the local runs: **two source requests**, 623 dates planned, **621 covered**, two dates the source itself serves empty, and — before step 1 — 621 publication refusals.

Run it **twice**. The second run should report 621 confirmed and zero created, which is what idempotency looks like from the outside.

### 5. Register the cron schedule

Add to `vercel.json`:

```json
{ "path": "/api/cron/utvi", "schedule": "0 2 * * *" }
```

**02:00 UTC, and the hour is chosen rather than free.** The source will not serve a partial day, so the run must be after the UTC day closes. Two hours after gives the source's materialized view time to settle most of the just-closed day's accrual before the first read, which reduces the size of the revision the next day's run has to record. It also stays clear of the UCPI run at 01:00 and the UBWI run at 06:00, so no two index jobs contend for the same serverless database budget.

**Plan capacity.** Three cron entries exist today, so the account is not on a plan capped at two. A fourth is within Pro's allowance. Confirm before adding rather than discovering it at deploy time.

### 6. Wire the UI

Out of scope for Phase 1B and deliberately last. `UtviSection` takes an instrument prop, the page-level "Demo data" badge stays until every section on the page is real, and the covered universe is rendered beside the value rather than behind a link.

## Operational notes

**The daily run makes two requests**, not one: the day that just closed, and the day before it. The second is the settlement confirmation, and dropping it to save a request would mean calling a date final because the calendar said so rather than because the source did.

**Outcomes are readable from the cron response.** Per date: `snapshot` is `created`, `confirmed`, `revised`, `settled` or `no_rows`; `calculation` is `recorded`, `skipped_no_coverage`, `skipped_unchanged` or `failed`; `publication` is `published`, `superseded`, `not_attempted` or a named refusal. Only a 500 with `reason: "run_failed"` is an outage.

**`refused_methodology_not_approved` is not an error.** Before step 1 it is the expected outcome on every date.

**Two dates in the source's history are permanently empty**: 2025-06-15 and 2025-07-15 return zero rows while their neighbours return the usual fifty-one. They have no UTVI point and never will. That is reported separately from a real gap, because a run that cried failure every day over two known holes would train an operator to ignore the check.

**A failed retrieval is recoverable.** The source retains twenty months, so a date missed today can be collected tomorrow — a materially better failure mode than a series that carries permanent holes.

## Rollback

Nothing published, nothing to retract: before step 1 the only production effect is reference data and observation rows that no public surface reads. If activation needs reversing after step 1, the route is supersession rather than deletion — publications are marked superseded and retained, because a value that was published and then withdrawn is a fact about the record.
