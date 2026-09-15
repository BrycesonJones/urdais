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
  every scheduled route as `Authorization: Bearer <secret>`, and both
  `/api/cron/news` and `/api/cron/ubwi` refuse every request that does not match
  it. When the variable is unset the routes refuse **all** requests, so a
  deployment without it has no ingestion or publication trigger rather than a
  public one. Set it in the Vercel project's environment variables; it belongs in
  no file in this repository.

One optional variable, and deliberately only one:

- `UBWI_ETH_RPC_URLS` — a comma-separated list of Ethereum JSON-RPC endpoints for
  the UBWI numerator. Unset, the documented public keyless defaults apply, so
  **UBWI publication requires no third secret**. See “The numerator is retrieved
  live” below.

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

## Scheduled UBWI publication

`vercel.json` declares a second cron job: `GET /api/cron/ubwi` on `0 6 * * *`.
UBWI publishes **at most one point per UTC day**, and the daily identity is the
UTC calendar date of `published_at`.

**Why 06:00 UTC.** The news job holds `0 0 * * *`, and midnight is the one hour
where jitter decides which UTC date a run belongs to — which matters here,
because the date *is* the uniqueness key. That risk is not theoretical on this
plan: Hobby fires a job at some point within the named hour rather than on the
minute, so a midnight job can land on either side of the boundary. 06:00 UTC is
six hours clear of both boundaries, is a fixed UTC hour unaffected by any
daylight-saving transition anywhere, and sits close to the 04:33 UTC hour at
which the first production point was frozen, which keeps the accumulating series
roughly evenly spaced. The value is stated once, in
`UBWI_DAILY_CRON_SCHEDULE` (`src/lib/ubwi/run.ts`), and a test requires
`vercel.json` to agree with it.

The route calls `runDailyUbwiPublication`, the same function
`npm run ubwi:load` calls. There is no second implementation of the calculation
or of the publication rules, and the route accepts no input: not a date, not a
value, not a force flag.

Every existing fail-closed rule still holds, and one is added for the cadence:

- a **stale price round, wrong feed or wrong network**, a **block-height
  disagreement**, a **denominator gate failure** and a **rights or provenance
  failure** all end the same way — the calculation is recorded so the refusal is
  auditable, and no publication row is created.
- **a price round older than the feed's 3,600-second heartbeat at the
  observation instant** is refused before anything is written at all. This is a
  different measurement from the one frozen on the observation (`retrieval −
  updatedAt`, which stays true forever) and it is what stops a daily job from
  republishing yesterday's price under today's date.
- a failed day produces **no point**. Nothing is interpolated into the gap and
  nothing is back-filled into it later. If 18 September fails and 19 September
  passes, the chart simply has no 18 September observation.

Idempotency is enforced twice. The run checks the observation date before it
writes, which covers a scheduler retry, a redeployment and an operator running
the command by hand. The partial unique index
`ubwi_publications_daily_idx` covers the case the check cannot see — two runs
that overlap, both reading an empty day before either inserts — by refusing the
loser, which then reports the winner's point instead of publishing a second.

To publish by hand:

```bash
DATABASE_URL=<UrdaisProd> npm run ubwi:load
DATABASE_URL=<UrdaisProd> npm run ubwi:load -- --dry-run   # retrieve and print, write nothing
```

`--dry-run` performs the full live retrieval and prints the round, its age, the
chain tip and the derived supply without writing anything. It is the safe way to
see the current numerator without touching the published series.

### The numerator is retrieved live

Each run obtains a fresh BTC/USD observation at execution time. Nothing
scheduled reads a committed constant.

- **Price.** `latestRoundData()` on the Chainlink BTC/USD proxy
  `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c` on Ethereum mainnet, plus
  `description()`, `decimals()`, `version()`, `phaseId()` and `aggregator()` for
  identity and lineage. Every `eth_call` is pinned to one explicit block, so the
  observation is re-runnable and cannot straddle a round boundary. Every function
  selector is derived from Keccak-256 at build time and pinned to published
  known answers in `src/lib/ubwi/retrieve/keccak.test.ts`; none is written by hand.
- **Cross-check.** A second, independent RPC endpoint is asked about the **same
  block** and must return the same round. Where it cannot serve that block — a
  lagging or pruning node — the check falls back once to that endpoint's own head
  and still requires the identical round, and the weaker mode is reported rather
  than silently chosen. A disagreement publishes nothing.
- **Height.** `mempool.space/api/blocks/tip/height` and
  `blockchain.info/q/getblockcount`, read live, must agree **exactly**. No
  averaging and no tolerance. The supply is then derived from that height by the
  protocol subsidy schedule; no supply figure is taken from any provider.
- **Freshness.** The documented 3,600-second heartbeat is enforced, unchanged, by
  the same validator the gate uses. There is no grace period.

`REFERENCE_BTC_OBSERVATION` in `src/lib/ubwi/numerator.ts` is what the old
`PRODUCTION_BTC_OBSERVATION` became: a frozen fixture and the deterministic input
behind the read surface's disclosure block. It is not a production source, the
scheduled job has no path to it, and its round is long past its heartbeat, so a
run that somehow reached it would refuse as stale rather than republish the first
point.

A run now ends in one of five states, distinguishable from the cron response
without reading a log: `published`; `already_published` (the day already has its
point); `observation_stale` or `retrieval_failed` (fail-closed, nothing written,
`retrievalProblem` naming which of unreachable endpoint, malformed response,
cross-check disagreement, height disagreement, bad round, non-positive price,
failed derivation or an observation that failed its own checks); or HTTP 500 with
`reason: "run_failed"`, which is the only one that is an outage.

#### `UBWI_ETH_RPC_URLS` — optional

A comma-separated list of Ethereum JSON-RPC endpoints. The first is the primary
read and the second the independent cross-check; fewer than two is refused,
because the observation shape promises a cross-check and one endpoint cannot
provide it.

**It is optional and there is no secret.** Unset, the job uses
`https://ethereum-rpc.publicnode.com` and `https://eth.drpc.org`, both public and
keyless, so a deployment needs no new credential to publish UBWI. The endpoint
URL is frozen onto every published observation as provenance, which is only
honest while no endpoint carries a key — so if this variable is ever set, set it
to keyless endpoints.

Endpoints tried and rejected, recorded so they are not rediscovered:
`cloudflare-eth.com` answers an internal error, `rpc.ankr.com/eth` now requires an
API key, and `eth.llamarpc.com` returns intermittent 525s.

### Activating the schedule

1. Deploy a build containing this `vercel.json`. Vercel registers crons at
   deploy time, so the job does not exist until a deployment carries it.
2. Set `CRON_SECRET` and `DATABASE_URL` in the Vercel project. Without
   `CRON_SECRET` the route answers 401 to everything including Vercel; without
   `DATABASE_URL` it answers 503 and publishes nothing.
3. Confirm the plan accepts two daily crons. Hobby caps both the cadence and the
   *number* of cron jobs; if the deployment is rejected, the fix is the plan, not
   the schedule.
4. Verify with an authenticated call against the deployment:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/cron/ubwi`.
   An unauthenticated call must answer `401`.

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

> **Two migration files may not share a version prefix.** `supabase db push`
> keys on the version, so where two filenames carry the same one, only one of
> them can ever be recorded and the other silently never runs.
>
> That happened on 15 September 2026: `#75` and `#76` merged in that order and
> both named their migration `20260915030000`, producing
> `20260915030000_news_energy_power_sources.sql` and
> `20260915030000_ubwi_daily_publication_cadence.sql`. The repository's own
> uniqueness guard in `src/lib/migrations.test.ts` went red on `main` at the
> moment the second merged. The UBWI file was renamed to `20260915150000`, which
> was safe because neither database had applied it — UrdaisProd's ledger held no
> `20260915020000` or `20260915030000` at all, and UrdaisDev's held nothing at or
> after `20260915010000`.
>
> Both consequences were resolved on 15 September 2026 and are recorded here
> because the *shape* recurs, not because either is outstanding. UrdaisProd had
> carried the two news migrations under wall-clock versions `20260915143157` and
> `20260915143307` and under `_prod` names, so the repository's `20260915020000`
> and `20260915030000` read as pending against a database that had already run
> them. The applied bodies in `statements` were pulled back and proved to be the
> repository files exactly, apart from SQL comments, which the management API
> strips, and apart from each file's trailing `do $$ … $$;` assertion block,
> which the API had not recorded and which performs no DDL and no DML — the
> production schema was separately checked against every invariant those blocks
> assert. Both rows were then rekeyed in one guarded transaction. **Unlike the
> `20260915042926` repair above, both the version *and* the name had drifted, so
> both columns were set**; preserving the name there was a fact about that case,
> not a rule. `statements` and `created_by` were untouched, no SQL was re-run and
> no schema object changed. `20260915150000_ubwi_daily_publication_cadence` was
> then the only pending migration and was applied with `supabase db push`;
> `pipeline.ubwi_publications_daily_idx` now exists in UrdaisProd.

### Checking migration integrity

Run the version comparison after any merge that adds a migration, not only after
a deploy — and do not run it by hand, because the comparison is what kept being
skipped:

```bash
npm run migrations:check                              # static; no credentials
npm run migrations:check -- --base-ref origin/main    # also against the merge target
DATABASE_URL=<UrdaisProd> npm run migrations:check -- --production
```

The rule lives in `src/lib/migrations/integrity.ts` and nothing else implements
it. The check **detects drift and repairs nothing**: whether two bodies of SQL
are the same thing is a judgement about `statements`, and that judgement is not
safe to automate.

Three separate claims, which is the distinction that makes the guard usable:

- **Repository structural validity.** No two migration files share a version
  prefix, every filename is one the ledger can read a version out of, and no two
  share a logical name. Always an error, needs no credentials, and runs on every
  pull request and every push in the `validate` job. On a pull request CI also
  checks the union of the branch's migrations and the merge target's, which
  catches the case a branch cannot see on its own: two open pull requests each
  adding a migration, each green, and the second to merge landing a duplicate.
- **Pending.** A repository migration production has not applied. This is the
  ordinary state of a pull request that adds a migration and it **passes**. A
  guard that reddened here would be switched off, and the real drift would go
  unnoticed again.
- **Drift.** Production carrying a repository migration under a different
  version, under an ad hoc `_prod` name, or a ledger row no repository migration
  accounts for. This fails the `production migration ledger` job, which runs on
  pushes to `main` where `URDAIS_PRODUCTION_DATABASE_URL` is configured and skips
  where it is not. Its remedy is always the same: prove equivalence from
  `statements`, then rekey in one transaction. **Rekey; never delete.**

Ad hoc `_prod` migration versions are prohibited for the reason the name makes
visible — the repository migration files are the source of truth, and a ledger
row that does not carry a repository file's version and name is a row nothing in
the repository can reason about. The approved deployment path is `supabase db
push`, which reads the version from the filename. Where the management API is
the only way in, the version it stamps must be corrected afterwards, in the same
session, not discovered weeks later by a deploy offering to replay it.

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

`urdais.com` is registered at Porkbun and its DNS is served by Porkbun's nameservers. **The domain now resolves to the Vercel deployment**: on 15 September 2026 `https://urdais.com/` and `https://urdais.com/api/tokens/prices` both answered `200` from the application, served by Vercel, and `/api/cron/news` and `/api/cron/ubwi` both answered `401` unauthenticated, which is the fail-closed behaviour the routes are supposed to have. The records below are what had to be replaced to get there.

Pointing it at a deployment means replacing, in the Porkbun DNS panel:

- the apex `A` records `207.207.210.23`, `207.207.210.36`, `207.207.210.50`, and
- the `www` `CNAME` to `uixie.porkbun.com`,

with the records the chosen host issues. Do not call the domain step complete until `https://urdais.com/api/tokens/prices` answers `200` from the application rather than `302` to the parking page.

## Applying a news-source migration to production

Merging a news phase does not put its sources in production. The repository and
the production database are separate things, and a green PR says nothing about
the second. This has bitten twice: a rail rendered `Live` with nothing behind it
because the migration had not been applied.

There is also a trap in the migrations themselves. Every news source migration
ends with an assertion block written for a database replayed from zero, and the
last line of it is:

```sql
select count(*) into n from pipeline.news_articles;
if n <> 0 then raise exception 'news articles were seeded'; end if;
```

**That assertion fails against a populated production database**, because
production holds articles from earlier ingestion runs. It is correct for the
replay CI runs and wrong for production, so the file cannot be applied verbatim
with `psql -f`. Apply the migration in two parts: everything above the final
`do $$ ... $$` guard, then check the guard's other assertions by hand. The guard
is a statement about a fresh database, not a production precondition.

### The sequence, after a news PR merges

1. **Apply the migration to UrdaisProd.** Everything above the final assertion
   block. Record it in `supabase_migrations.schema_migrations` with the file's
   version and name, or the next replay will try to apply it again.
2. **Verify the source rows exist:**
   ```sql
   select category, count(*) from reference.news_sources where is_enabled group by category;
   ```
   Expect `compute=8`, `energy-power=4`, `crypto=3` as of News V1.
3. **Verify nothing already stored was disturbed:**
   ```sql
   select category, count(*) from pipeline.news_articles group by category;
   ```
   The counts for categories that migrated earlier must not move.
4. **Run ingestion from current `main`:**
   ```bash
   DATABASE_URL=<UrdaisProd> npm run news:ingest -- --mode production --live --write
   ```
5. **Check the attempt count.** `sourcesAttempted` must equal the number of
   enabled sources — 15 at News V1. A lower number means the registry rows did
   not land, not that a feed was quiet.
6. **Verify the new category's articles arrived**, by source:
   ```sql
   select p.name, count(*) from pipeline.news_articles a
     join reference.source_interfaces si on si.id = a.source_interface_id
     join reference.providers p on p.id = si.provider_id
    where a.category = '<category>' group by p.name;
   ```
7. **Run ingestion again.** `articlesInserted` must be `0`. A non-zero second
   run means identity is not deterministic for one of the new sources, which is
   a defect rather than a surprise.
8. **Load the homepage** and confirm the rail shows real stories rather than its
   empty state.

A rail that renders `Live` with an empty state after step 8 has one of two
causes, and they are distinguishable: the deployment has no `DATABASE_URL`, or
the migration did not reach production. The read path logs which.

## What this document does not authorize

Nothing here grants a source right. The Wave-1 token pricing interfaces remain `research_usable` with terms and data-use both `under_review`, and the only `production_approved` interface in either database is the licensed compute source. A production `GET` scraper does not become permitted because a deployment exists.
