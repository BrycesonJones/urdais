# Urdais production environments and activation runbook

**Status: internal operations document. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. It creates no methodology, no published value, and no source right. It contains no credentials, and no credential belongs in this file or anywhere else in this repository.

## Environment mapping

Urdais uses two Supabase projects in the `Bryceson's Apps` organization. They are not interchangeable, and development data never becomes production data by being copied.

| Environment | Supabase project | Reference | Holds |
|---|---|---|---|
| Development, preview, research | UrdaisDev | `scwwjoyouohfrwylalha` | Schema, research-preview observations, experiments |
| Public production | UrdaisProd | `cyqtaydtfuwaexjkuynq` | Schema plus manually verified production observations only |

Both live in `us-east-1`. UrdaisProd was created on 14 September 2026 and its migration history was applied from zero; it was never a copy of UrdaisDev.

The local development database is separate again: Postgres on port 54329, created and destroyed by `scripts/db/local.sh`. It is the only database any command reaches without an explicit connection string.

## What a runtime needs

A deployed Urdais instance needs two secrets:

- `DATABASE_URL` — the UrdaisProd Postgres connection string.
- `CRON_SECRET` — a random string of at least 16 characters. Vercel sends it to
  the scheduled news ingestion route as `Authorization: Bearer <secret>`, and
  `/api/cron/news` refuses every request that does not match it. When the
  variable is unset the route refuses **all** requests, so a deployment without
  it has no ingestion trigger rather than a public one. Set it in the Vercel
  project's environment variables; it belongs in no file in this repository.

Two facts about that string matter in practice:

- **Use the pooler, not the direct host.** `db.<ref>.supabase.co` resolves to IPv6 only, and most build and hosting environments are IPv4. The session pooler at `aws-0-us-east-1.pooler.supabase.com:5432` with user `postgres.<ref>` is reachable over IPv4.
- **Supabase presents a private certificate authority.** Its chain is issued by `Supabase Root 2021 CA`, which is not in the public trust store, so a default `sslmode=verify-full` fails with `self-signed certificate in certificate chain`. Download the project's CA from the Supabase dashboard under Settings → Database, give the runtime the file, and append `sslmode=verify-full&sslrootcert=<path>`. The current operator connection pins the root whose SHA-256 fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

`NODE_ENV=production` (or `VERCEL_ENV=production`) is what puts the read path into production mode. In that mode the research-preview filter is unavailable and the read path serves only frozen benchmarks whose two leg observations are both production. There is no flag that relaxes this.

## Scheduled news ingestion

`vercel.json` declares one cron job: `GET /api/cron/news` on `0 0 * * *`, the
shared Urdais news cadence (`src/lib/news/schedule.ts`). It ingests every
enabled, production-approved news source — Compute today, every category that
is migrated later — and is safe to run repeatedly, so a duplicate or retried
invocation writes nothing.

Two things have to be true before it does anything useful, and the failure modes
are quiet rather than loud:

- **Without `DATABASE_URL`** the route answers 503 and ingests nothing, and the
  homepage Compute rail renders "Compute news is unavailable right now." That is
  the correct fail-closed behaviour, not a defect.
- **Without `CRON_SECRET`** the route answers 401 to everything, including
  Vercel. The cron job runs, gets refused, and nothing is ingested.

> **The cadence is capped by the plan, not chosen freely.** Vercel's Hobby plan
> runs cron jobs once per day and rejects a faster expression at deploy time —
> `0 */4 * * *` was tried on 15 September 2026 and failed the deployment. Once
> the project is on a Pro team the cadence can be raised in `vercel.json`,
> `NEWS_REFRESH_CRON` and `NEWS_REFRESH_INTERVAL_HOURS` together; a test
> requires the three to agree and a second test asserts the current value is one
> the plan accepts.
>
> On Hobby the job also fires at some point within the named hour rather than on
> the minute, which the pipeline does not care about.

To ingest by hand, or to backfill after a scheduling gap:

```bash
DATABASE_URL=<UrdaisProd> npm run news:ingest -- --mode production --live --write
```

That command calls the same function the route does. Add `--source <slug>` to
run one feed while diagnosing it.

## Pages that read the database must not be prerendered

`/markets`, `/markets/model-economics` and `/markets/[symbol]` read live benchmark state. The first two declare `export const dynamic = "force-dynamic"`. The homepage declares it too, for the production Compute news rail.

This is not a preference. Without it Next prerenders them at build time, where no production database is configured, and then serves that build-time snapshot to every visitor. The page renders the "no benchmark" placeholder forever, and no amount of correct data in the database changes it, because the page is never asked again. A healthy database and a permanently blank public surface is precisely the failure this prevents. Any future page that reads benchmark state needs the same declaration.

## Runbook

### 1. Apply the migration history to a new production database

```
supabase link --project-ref <ref>
supabase db push
```

Then confirm the ledger matches the repository exactly:

```
ls supabase/migrations/*.sql | sed 's|.*/||; s/_.*//' | paste -sd, -
```

compared against `select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations`.

> **Apply a migration under the version its filename carries, or the ledger
> invents one.** `supabase db push` reads the version from the filename. The
> Supabase management API (`apply_migration`, and the dashboard's SQL editor
> when it records a migration) takes a *name* and, given no version, stamps the
> wall clock instead. The schema lands correctly either way, so nothing fails
> loudly; what breaks is the bookkeeping, and the next deploy reads the
> repository's version as pending and offers to replay a migration that has
> already run.
>
> That happened once, on 15 September 2026, to
> `20260915010000_news_wave2_and_image_rights`, which the ledger had recorded as
> `20260915042926` — the minute it was applied. Both sides still counted forty
> migrations, so only a version-by-version comparison showed it. The applied
> body was proven identical to the repository file apart from SQL comments, which
> the management API strips, and the row was rekeyed to the canonical version in
> a single transaction. No migration SQL was re-run and no schema object changed.
>
> Two habits avoid the repeat: apply through `supabase db push` wherever it can
> reach the database, and run the version comparison above after *any* path that
> writes the ledger — the row counts agreeing is not the check.
>
> The ledger's `statements` column holds the SQL that actually ran and `created_by`
> holds who ran it. Rekeying a row preserves both, which is why it is a safe
> repair and why deleting a ledger row is not.

### 2. Verify Wave-1 token prices into production

This is an operator verification event. It is not seeding, and it is not automated collection.

```
DATABASE_URL=<UrdaisProd> npm run tokens:verify-production \
  -- --verified-by "<who checked>" --evidence "<what was actually reviewed>"
```

Both flags are required and must be true. The command refuses to run without them, because an unattributed verification is not one. Add `--expect` to have the parsed artifact checked against the expected leg prices; a mismatch stops the run rather than writing the expected number.

It writes no registry column and grants no collection right. Automated production retrieval from those interfaces stays refused by the database trigger, and running this does not change that.

Re-running it against unchanged artifacts writes nothing at all. The retrieval is identified by the artifact it records, not by the moment the command ran.

### 3. Check readiness before and after deploying

```
DATABASE_URL=<UrdaisProd> npm run tokens:production:check
DATABASE_URL=<UrdaisProd> npm run tokens:production:check -- --url https://<origin>
```

The first form is read-only and proves the database is ready: schema current, every designated provider carrying a frozen benchmark, and each of those benchmarks resting on production rather than research-only leg observations.

The second form additionally reads what the running site serves: the benchmarks from `/api/tokens/prices`, the price on Model Economics, and the Tokens family on the market page. A deployment is not finished until this passes. The database being ready is a different claim from the page rendering.

### 4. Custom domain

`urdais.com` is registered at Porkbun and its DNS is served by Porkbun's nameservers. It currently resolves to Porkbun's parking addresses and redirects to a link-shortener landing page, which is why the public domain serves no Urdais application.

Pointing it at a deployment means replacing, in the Porkbun DNS panel:

- the apex `A` records `207.207.210.23`, `207.207.210.36`, `207.207.210.50`, and
- the `www` `CNAME` to `uixie.porkbun.com`,

with the records the chosen host issues. Do not call the domain step complete until `https://urdais.com/api/tokens/prices` answers `200` from the application rather than `302` to the parking page.

## What this document does not authorize

Nothing here grants a source right. The Wave-1 token pricing interfaces remain `research_usable` with terms and data-use both `under_review`, and the only `production_approved` interface in either database is the licensed compute source. A production `GET` scraper does not become permitted because a deployment exists.
