# Token Price: production verification runbook

## Why there is no collection cron

There is no `/api/cron/tokens`, there never has been, and one must not be added on the
current rights.

Every Wave-1 token source is registered as `production_access_state: research_usable`,
`terms_review_state: under_review`, `data_use_terms_state: under_review`,
`access_class: documentation`, `is_machine_readable: false`. The methodology states the
position directly (`docs/methodology/token-price.md`, *Publication*):

> Whether a price may be published is answered by how the price was obtained: a person
> reading the provider's own published page, retaining the artifact and recording what they
> checked, is a sufficient basis, and every published Token Price today rests on one.
> Whether Urdais may retrieve that page automatically, on a schedule, is a separate question
> answered by the source's collection rights, and for every token-pricing source that
> question is still open. Publishing a verified fact grants no collection right, and no
> amount of publication moves a source towards automated retrieval.

So production acquisition is a person, deliberately. `scripts/tokens/ingest.ts` refuses
`--mode production` for the same reason, and `scripts/tokens/verify-production.ts` refuses to
run at all without `--verified-by` and `--evidence`.

Automating the reading requires a collection right Urdais does not have. Obtaining one is a
terms-review task, not an engineering task. Until the registry says otherwise, the cadence
below is the pipeline.

## Why the series does not change daily

Token Price is event-driven. From the methodology:

> Urdais records a canonical observation only when a source price changes, so an unchanged
> output rate produces no new row on the day an input rate moves.

One frozen row per provider is therefore what an unchanged price is *supposed* to look like.
A flat series is not evidence of a broken job, and daily history must never be manufactured
to make a chart look busier.

This is also why the September 2026 staleness was hard to see: "nobody changed their price"
and "nobody has looked in two weeks" produce byte-identical data. The watchdog below exists
to separate them.

## The cadence

Re-verify each provider at least every **7 days**. That interval is an operations choice — a
review cadence — not a methodology rule; changing it changes no published value.

For each provider:

1. Open the provider's own published pricing page (the source interface's `canonical_url`).
2. Retain the artifact.
3. Run the verification, naming yourself and what you checked:

```
DATABASE_URL=<UrdaisProd> npx tsx scripts/tokens/verify-production.ts \
  --verified-by "Your Name" \
  --evidence "read <url> on <date>; standard input/output rates for <model>" \
  --expect
```

`--expect` checks the artifact against the recorded expectations rather than substituting for
it. A mismatch is a real signal: either the provider moved a price, or the designated model
changed. Both are decisions for a person.

4. Confirm what landed:

```
DATABASE_URL=<UrdaisProd> npm run tokens:production:check
```

Unchanged prices write no new row, and that is a successful run.

## The watchdog

`/api/cron/token-verification` runs daily at **07:00 UTC** (after news 00:00, UCPI 01:00,
UTVI 02:00, UBWI 06:00, so it reports on a settled day).

It reads only Urdais's own frozen benchmarks. **It contacts no provider, fetches no pricing
page, and writes nothing.** For each Wave-1 provider it reports the last verification
instant, its age in days, how many frozen points exist, and whether the newest is a value or
a recorded withholding.

Responses:

| status | meaning | action |
|---|---|---|
| `200` `ok: true` | every provider verified within the interval | none |
| `200` `ok: false` + `reviewDue` | someone should re-verify the named providers | run the cadence above |
| `200` `ok: false` + `neverVerified` | a provider has no frozen benchmark at all | investigate before verifying |
| `503` `no_database_configured` | `DATABASE_URL` missing in the deployment | fix the environment |
| `500` `check_failed` | the store could not be read | investigate; this is an outage |

A due review answers `200` deliberately: it is a request for a person, not a broken job, and
the cron history should show a working watchdog with something to say. Only a genuine
systemic failure is a non-2xx — in particular, an unreadable database must never be reported
as "nobody has verified anything", which is the one confusion that would recreate the
original incident.

A recorded withholding counts as verified. DeepSeek publishes no standard rate, so its
headline is withheld by design; someone still looked, and the watchdog must not demand a
re-check as though nobody had.

## What this does not do

- It does not retrieve, parse or store any provider's prices.
- It does not change any source's rights, registry column, or publication state.
- It does not backfill, synthesise or duplicate history.
- It cannot tell you a published price is *wrong* — only how long since a person confirmed it.
