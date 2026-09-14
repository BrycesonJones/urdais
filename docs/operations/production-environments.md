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

A deployed Urdais instance needs exactly one secret:

- `DATABASE_URL` — the UrdaisProd Postgres connection string.

Two facts about that string matter in practice:

- **Use the pooler, not the direct host.** `db.<ref>.supabase.co` resolves to IPv6 only, and most build and hosting environments are IPv4. The session pooler at `aws-0-us-east-1.pooler.supabase.com:5432` with user `postgres.<ref>` is reachable over IPv4.
- **Supabase presents a private certificate authority.** Its chain is issued by `Supabase Root 2021 CA`, which is not in the public trust store, so a default `sslmode=verify-full` fails with `self-signed certificate in certificate chain`. Download the project's CA from the Supabase dashboard under Settings → Database, give the runtime the file, and append `sslmode=verify-full&sslrootcert=<path>`. The current operator connection pins the root whose SHA-256 fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

`NODE_ENV=production` (or `VERCEL_ENV=production`) is what puts the read path into production mode. In that mode the research-preview filter is unavailable and the read path serves only frozen benchmarks whose two leg observations are both production. There is no flag that relaxes this.

## Pages that read the database must not be prerendered

`/markets`, `/markets/model-economics` and `/markets/[symbol]` read live benchmark state. The first two declare `export const dynamic = "force-dynamic"`.

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
