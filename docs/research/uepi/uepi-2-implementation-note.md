# UEPI-2 — source adapters, fixtures, normalization and backfill

**Internal. Not routed, not registered in the docs catalog.** The methodology authority is the frozen
[UEPI V1 specification](./uepi-v1-specification.md) at 1.0.0, digest
`14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a`. Nothing here restates it, and
nothing in this phase changed it.

**UEPI-2 does not make UEPI public.** No read model, no API, no surface, no cron, and the demo family
on `/markets/uepi` is untouched. **No UEPI observation has been written to production.**

## What was built

Four evidence-backed source adapters, each pinned to real files the market operator served on named
operating days; normalization into the UEPI-1 contracts; and a bounded, resumable backfill with a
read-only verifier.

| Market | Adapter | Fixtures | Construct | Retrieval | Public state |
| --- | --- | --- | --- | --- | --- |
| CAISO | `source/adapters/caiso.ts` | 2026-09-23, 2026-03-08, 2025-11-02 | system energy component (`MCE`) | OASIS `PRC_LMP`, anonymous | publishable later; ambiguous rights |
| MISO | `source/adapters/miso.ts` | 2026-09-23, 2026-03-08, 2025-11-02 | system energy component (`LMP − MCC − MLC`) | daily ex-post CSV, anonymous | internal only |
| NYISO | `source/adapters/nyiso.ts` | 2026-09-23, 2026-03-08, 2025-11-02 | system energy component (reference-bus λ) | MIS P-2A daily CSV and monthly ZIP | publishable later; ambiguous rights |
| SPP | `source/adapters/spp.ts` | 2026-09-23, 2026-04-12, 2026-03-08, 2025-11-02 | system energy component (`MEC`) | By_Day CSV, anonymous | internal only |
| ERCOT | **none** | — | — | **credential required** | blocked |
| PJM | **none** | — | — | **credential required** | blocked |
| ISO-NE | **none** | — | — | **no observed payload** | blocked |

## The three markets with no adapter

**ERCOT and PJM are credential-blocked.** Probed on 25 September 2026 without a key, ERCOT's public
API answered HTTP 302 into an authentication redirect and PJM's Data Miner answered HTTP 401. Their
benchmarks are settled and their schemas documented; what is missing is a subscription key, and the
fixture rule exists precisely so that an adapter is not written against a schema nobody has fetched.
PJM carries a second, independent block: its terms prohibit publishing derived data without
membership, so a key would make it readable and still not publishable.

**ISO-NE is evidence-blocked**, which is the stronger refusal. No authenticated payload has ever been
observed, so its field names come from a derived schema and its hour convention is unknown. The
registry refuses it by name with `AUTHENTICATED_SOURCE_EVIDENCE_REQUIRED`, and a test asserts no
adapter file for it exists.

## What the real files taught us

Every item below was measured on a committed artifact, and several were not in the research.

- **CAISO labels the repeated fall-back hour `OPR_HR 25`**, filed between hours 2 and 3. The
  hour-ending index is therefore neither unique nor monotonic on that day; `INTERVALSTARTTIME_GMT`
  is both. On spring-forward CAISO omits the missing label entirely (1, 2, 4 … 24).
  This closes two of the specification's open DST items for CAISO.
- **MISO writes values below one without a leading zero** (`.6`, `-.37`) — 41 of 144 carrier cells on
  23 September 2026. Handled by a narrow, documented canonicalisation in the MISO adapter; the
  canonical decimal parser stays strict and the raw cell keeps MISO's spelling.
- **SPP's two header shapes both exist in the retrievable archive**, and the cutover date is still
  unresolved. The adapter branches on the header it actually reads and refuses any header it does
  not recognise; a test asserts the adapter source contains no date literal at all.
- **NYISO's fall-back duplicate is real and the two prices differ** (WEST: 50.72 then 48.63). Row
  order is the only discriminator, so instants are assigned positionally and then checked back
  against the printed label.
- **The research's SPP figures reproduce exactly** from the 12 April 2026 file: North Hub daily mean
  −0.1083, South Hub −8.6282, MEC mean +2.7785, ten negative MEC hours with a minimum of −15.26.
- **NYISO's reference-bus identity holds on each physical `01:00` row separately** (cross-zone spread
  $0.01 for both occurrences), which is specification §K.2 item 14, now measured.

## Fixtures

`src/lib/uepi/source/fixtures/`, 304 KB in total, catalogued in `manifest.ts` with two digests each:
the artifact as the operator served it, and the bytes committed here. CAISO and NYISO files are
committed complete. MISO and SPP originals are 1.2 MB and 4 MB, so those are row subsets produced by
`scripts/uepi/reduce-fixture.ts` — whole lines, unedited, including rows kept deliberately so the
fixture can prove what the parser rejects. `load.ts` refuses to hand a test any fixture whose bytes
no longer hash to the manifest value.

## Normalization and calculation

`normalize.ts` turns adapter output into `NormalizedHourlyPrice`, validating every instant against
the market's own operating day, rejecting duplicates, and measuring the specification's uniformity
cross-check against a second carrier (CAISO and MISO to 0.0001, SPP to 0.001, NYISO to 0.02, because
its components are published rounded). The daily value comes from the UEPI-1 calculator; no market
has its own averaging. Specification version and digest are stamped on every calculation and
enforced again by the database.

Nothing is sanitised: negative and zero prices pass through unchanged, and the only price guard is
the plausibility bound against a parse error, which marks an hour suspect and stops the day rather
than clipping anything.

## Backfill

```
npm run uepi:backfill -- --market caiso --from 2026-09-01 --to 2026-09-23            # dry run
npm run uepi:backfill -- --market caiso --from 2026-09-01 --to 2026-09-23 \
    --write --target localhost                                                        # writes
npm run uepi:verify                                                                   # read-only
```

Dry run is the default; `--write` is opt-in and additionally requires `--target` to match the host
the connection actually resolves to, because naming an environment variable is not naming a
database. One market per invocation, one day at a time, a pause between requests, `--limit` to bound
a run, failures isolated per day, and a day already released is skipped without being re-fetched.

## Rights

Unchanged from UEPI-1 and not re-derived here. Every retrieval is recorded with purpose `research`,
which is a schema consequence rather than a judgement: the platform refuses a `production` retrieval
from a source interface that is not production-approved, and an ambiguous source cannot reach that
state without a legal answer. Publication remains a separate decision taken at read time, and a test
proves MISO and SPP release internally and refuse publicly on the same data.

## Verified against the database

A local backfill of 2026-09-21..23 across all four markets wrote 11 released days (CAISO's third day
hit OASIS's documented HTTP 429 and was isolated to that date). `npm run uepi:verify` recomputes each
stored day from its stored hours: 11 of 11 agree exactly. Re-running the same range skipped all three
days and wrote nothing; re-storing an identical day changed nothing; re-storing one revised hour
superseded exactly that observation and the daily value, keeping both rows.

Thirteen months of history is retrievable for all four markets (probed at 2025-08-25), and CAISO
answered as far back as 2023-06-15.

## Still open

- ERCOT and PJM credentials; ISO-NE credential **and** two authenticated payloads.
- SPP's `BAA` cutover date, and whether legacy-shaped files exist earlier than the current path.
- CAISO `MGHG`, MISO BPM-005 and PJM pnode-1 weighting remain methodology questions; none blocks
  parsing under 1.0.0, and none was answered here.
- Publication lag clock times, and per-feed revision behaviour beyond the trailing re-read.
- The retrieval purpose stays `research` until a source interface is production-approved.

## What UEPI-3 inherits

A readable, auditable internal dataset and four adapters that fail loudly on schema drift. UEPI-3
owns the read model, the API, the public surface, the demo retirement and the `power-*` → `uepi-*`
instrument rename.
