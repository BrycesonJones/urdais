# Token Price Production Operations

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 14 September 2026, after the manual verification path landed and the first deployment question appeared: what happens on the next deploy.

## The distinction this protects

A deployment should **verify that the production data is ready**. It must never **manufacture the verification event itself**.

`manual_verified` means a person read a provider's published pricing page, retained the artifact and signed a statement about what they checked. A deploy hook that ran that path automatically would be an automated retrieval wearing a human's name, and the word would stop meaning anything. So nothing in the deployment path writes an observation.

Two commands, two responsibilities.

## Verifying, which an operator does

```
npm run tokens:verify-production -- --verified-by "<name>" --evidence "<what you checked>"
```

Reads each Wave-1 provider's retained first-party artifact, parses it through the ordinary provider parser and canonical normalization, checks the legs the methodology's designated model requires, writes the canonical observations and freezes the benchmarks.

It refuses to run without `--verified-by` and `--evidence`, because an unattributed verification is not one. It refuses to guess its target: either `DATABASE_URL` (or `URDAIS_DATABASE_URL`) is set, or `--local` is passed for the development database, and passing both is an error rather than a silent preference. It prints the resolved target with the password masked before it writes anything.

It is idempotent. Re-running it against the same artifacts inserts nothing and says so.

Run it once against the deployed database. Run it again only when a provider's published prices change, or when a designation changes, which is an explicit operator action and never a consequence of shipping code.

## Checking, which a deployment does

```
npm run tokens:production:check
```

Read-only. It verifies that the required schema exists, that the migration ledger matches the repository, that every designated provider has a frozen Token Price benchmark, that each one rests on production observations rather than research-only ones, and that the read path can load them. It exits nonzero and names the operator action for anything it finds.

A test asserts that every statement it issues is a `select`, so it cannot drift into writing.

## Deployment

There is **no deployment hook in this repository** today. CI validates and replays the database from zero; it does not deploy, and no Vercel or other platform configuration is committed. Migrations reach the hosted database through the existing Supabase path, not through an applier in this repo, and this phase deliberately did not invent a second mechanism.

What was added is the smallest thing that closes the gap:

- a `token-production-readiness` job on pushes to `main` that runs the check against `URDAIS_PRODUCTION_DATABASE_URL` when that secret is configured, and skips with an explanatory message when it is not
- the check itself, runnable from any deployment pipeline that can reach the database

**Remaining prerequisite:** set the `URDAIS_PRODUCTION_DATABASE_URL` secret on the repository, and run the operator verification once against the deployed database. Until the first is set, the readiness job explains that it is unenforced rather than passing silently on nothing. Until the second is done, the deployed site has no production Token Price rows and the readiness check fails, which is the intended signal.

## Local development

`npm run dev` requires none of this. A developer may run the research-preview seed, or run the verification with `--local` to create development production rows deliberately. Nothing auto-creates production data when the dev server starts.
