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

## What an unchanged review writes

This is the part that was wrong until 22 September 2026, and the correction is worth stating
before the cadence, because it changes what a successful run looks like.

A verification writes **an attestation**, always: one row in
`pipeline.token_price_verifications` per provider, naming the person, the instant, what they
checked, and the frozen value or recorded withholding they checked it against. That row is the
only thing a run is guaranteed to write.

It writes a **price observation** only if a price changed, a **benchmark point** only if a
calculation changed, and a **retrieval** only if the artifact changed. A review that finds
every page unchanged therefore writes seven attestations and nothing else, and that is a
complete, successful run.

Verification freshness reads the attestations. It used to read the newest frozen benchmark's
`calculated_at`, which is a calculation instant and moves only when a price moves. An
unchanged review left no trace in any of the three tables above, so the watchdog reported a
completed review as though nobody had looked. Nothing about the recording rules was loosened
to fix it: the event that actually happened is now recorded, in a table of its own.

Two consequences worth knowing:

- **An attestation alone is never health.** A provider with no frozen value or recorded
  withholding behind it is reported as `never_verified` however many verifications exist for
  it. A verification of nothing is evidence of nothing.
- **Replaying a run is safe and re-reading later is meaningful.** An attestation is keyed by
  provider, instant, verifier and statement, so replaying the same one inserts nothing, while
  a genuinely later review inserts a new event even though no price moved.

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

Unchanged prices write no new price row, and that is a successful run. The run's own output
says so in two lines: one for the price data it did or did not write, and one for the
attestation, which it writes either way.

### When the designated model itself has moved

A mismatch under `--expect`, or a review that finds the provider promoting a different
flagship, is **not** something to resolve by editing an expectation. It is a constituent
change, and the methodology versions those explicitly:

1. Add the model identity to `src/lib/tokens/catalog.ts` and a migration; seed no price.
2. Add a new effective-dated entry to `TOKEN_BENCHMARK_CONSTITUENTS` with its rationale, and
   a new methodology version in `TOKEN_PRICE_METHODOLOGY_VERSIONS` effective the same day.
3. Record the reviewed rows in the retained artifact, and say in its provenance which artifact
   it supersedes and which fields the attestation did not cover.
4. Update `docs/methodology/token-price.md` and its version history.
5. Then run the verification. The predecessor's observations, frozen value and lineage are
   never edited: the successor is new lineage beginning at its own effective date.

xAI's move from Grok 4.6 to Grok 4.7 on 22 September 2026 is the worked example, and it is
also the case that proves the rule is about designation rather than price: both models are
published at $2 / $6, so the benchmark value does not move across the boundary at all.

## Recorded withholdings

A provider that was collected and deliberately not published carries a **withholding row** in
`pipeline.token_price_benchmarks`: `calculation_status = 'withheld'`, a structured
`withheld_reason`, no price, no legs, and no designated model where none was designated. The
explanation is not copied into the row -- it lives in `docs/methodology/token-price.md` under
the methodology version the row carries.

DeepSeek's reason is `NO_STANDARD_SERVICE_TIER`: every collected leg is a peak or off-peak
rate and none is the ordinary standard rate the methodology requires.

The rule is narrow, and it is **evaluated + withheld != absent**. A withholding is recorded
only where the register says `collected_not_publishable` *and* observations actually exist. A
provider registered as `designated_publication_blocked` with nothing collected (Mistral) gets
no row, because writing one would assert a review that never happened.

`verify-production.ts` writes these alongside the values on every run, idempotently. A unique
index on (provider, reason, methodology version) means a re-run inserts nothing rather than
stacking duplicate decisions.

### One-time repair for DeepSeek

DeepSeek was collected on 14 September 2026 and its withholding was reported only in the
run's output, which vanished with the process -- production has 12 observations and no
decision row. The repair is the ordinary verification, re-run:

```
DATABASE_URL=<UrdaisProd> npx tsx scripts/tokens/verify-production.ts \
  --verified-by "Your Name" \
  --evidence "re-recording the DeepSeek withholding from the retained 14 September artifact"
```

It writes no numeric DeepSeek price, does not touch the 12 observations, and does not alter
any other provider's frozen value. Confirm with:

```sql
select p.slug, b.calculation_status, b.withheld_reason, b.price_usd_per_1m, b.methodology_version
  from pipeline.token_price_benchmarks b
  join reference.providers p on p.id = b.provider_id
 where p.slug = 'deepseek' and b.superseded_by_id is null;
```

Expected: exactly one row, `withheld` / `NO_STANDARD_SERVICE_TIER` / null price / `1.2`. The
watchdog then reports DeepSeek as `current` rather than `never_verified`.

## The watchdog

`/api/cron/token-verification` runs daily at **07:00 UTC** (after news 00:00, UCPI 01:00,
UTVI 02:00, UBWI 06:00, so it reports on a settled day).

It reads only Urdais's own records: the attestations in `pipeline.token_price_verifications`
and the frozen rows in `pipeline.token_price_benchmarks`, and it needs both. **It contacts no
provider, fetches no pricing page, and writes no price data.** For each Wave-1 provider it
reports the last verification instant and who made it, its age in days, how many frozen points
and how many attestations exist, and whether the newest frozen row is a value or a recorded
withholding.

Responses:

| status | meaning | action |
|---|---|---|
| `200` `ok: true` | every provider verified within the interval | none |
| `200` `ok: false` + `reviewDue` | someone should re-verify the named providers | run the cadence above |
| `200` `ok: false` + `neverVerified` | no verification stands: either nothing is frozen for the provider, or something is frozen that nobody is on record as having checked | investigate before verifying; the payload's `frozenPoints` and `verificationEvents` say which |
| `503` `no_database_configured` | `DATABASE_URL` missing in the deployment | fix the environment |
| `500` `check_failed` | the store could not be read | investigate; this is an outage |

A due review answers `200` deliberately: it is a request for a person, not a broken job, and
the cron history should show a working watchdog with something to say. Only a genuine
systemic failure is a non-2xx — in particular, an unreadable database must never be reported
as "nobody has verified anything", which is the one confusion that would recreate the
original incident.

A recorded withholding counts as verified, provided somebody attested to it. DeepSeek
publishes no standard rate, so its headline is withheld by design; someone still looked, and
the watchdog must not demand a re-check as though nobody had. The withholding row alone is not
enough: it is a decision on the record, not evidence that anyone has looked at it lately.

## What this does not do

- It does not retrieve, parse or store any provider's prices.
- It does not change any source's rights, registry column, or publication state.
- It does not backfill, synthesise or duplicate history.
- It does not treat a verification event as proof that the value behind it is sound.
- It cannot tell you a published price is *wrong* — only how long since a person confirmed it.
