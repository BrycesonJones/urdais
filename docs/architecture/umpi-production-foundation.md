# UMPI Production Foundation

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 22 September 2026 for UMPI Phase 3. It explains the implementation: what was built, what was reused, and what Phase 4 is expected to add. It defines no economic rule — those live in [the methodology](/docs/methodology/umpi-kr-dram) and are not restated here.

**Phase 3 ingests nothing.** No observation, no base, no publication and no run row exists after these migrations. Two source interfaces are registered, their rights are recorded, the two series are declared, and every structure that will later hold a value is created empty. The database asserts this at the end of the migration and again in `supabase/tests/600_umpi_foundation.sql`.

## What was reused

The point of this phase was to add as little architecture as possible.

| Reused | For what |
|---|---|
| `reference.providers`, `reference.source_interfaces` | Source registration. The Bank of Korea row already existed — UBWI reads its national balance sheet — so UMPI adds an interface to the existing provider rather than a second provider |
| `reference.source_rights_classifications`, `source_use_purposes`, `source_use_permissions` | The reviewed-rights model built for planning forecasts. UMPI adds two purposes to the shared vocabulary and records its determinations as ordinary rows |
| `reference.methodologies`, `reference.methodology_versions` | The draft is registered with no effective date, exactly as the interconnection-queue analytics draft is |
| `pipeline.source_retrievals` | Every UMPI retrieval will be one of these. No UMPI retrieval table exists |
| `pipeline.allow_only_supersession()` | The existing append-only trigger, applied to all three UMPI evidence tables |

## What was added, and why each one

| Table | Why an existing table could not carry it |
|---|---|
| `reference.umpi_series` | Nothing described a monthly official index. `reference.instruments` is compute-hardware identity bound to UCPI spec versions |
| `reference.umpi_source_series` | The source-side identity, effective-dated. Its reason to exist is below |
| `pipeline.umpi_ingestion_runs` | `pipeline.calculation_runs` binds to `reference.instruments` and checks a **daily UTC window** in SQL. Monthly statistical data cannot satisfy that constraint, and loosening a shared constraint to fit would weaken it for UCPI |
| `pipeline.umpi_observations` | Vintaged source evidence for both shapes |
| `pipeline.umpi_index_bases` | The Series B base is derived and every published point depends on it, so it needs its own lineage |
| `pipeline.umpi_publications` | Per-product publication tables are the established convention (`utvi_publications`, `ubwi_publications`, `regional_publications`) |

## The identity problem this schema exists to prevent

Phase 2C verified, live, that item code `30911201AA` is the DRAM item in **both** BOK tables:

- `404Y016` — 생산자물가지수(품목별), the producer price index. **Series A reads this one.**
- `402Y016` — 수출물가지수(품목별), the export price index, which additionally carries a currency-basis dimension with three values.

They return **different numbers for the same month**. An adapter keyed on the item code alone publishes the wrong statistic and looks correct while doing it.

So a BOK identity is the triple `(stat_code, item_code, cycle)` plus any group dimensions, and that is enforced three times over: a check constraint (`umpi_source_series_bok_identity_complete`), a second constraint refusing `402Y016` outright (`umpi_source_series_no_export_price_index`), and `bokSeriesIdentity()` in `src/lib/umpi/identity.ts`, which throws for any deferred table. A display name is never an identifier; `identityKey()` is built from codes only.

## Raw and derived are separate, permanently

`pipeline.umpi_observations` stores what the source published and nothing else.

- **BOK shape** — the agency's `index_level` and its `index_base_label`. Urdais applies no rebasing, smoothing, seasonal adjustment or currency conversion. The published level **is** the BOK level.
- **Customs shape** — `export_value_usd` (`expDlr`, declared FOB) and `export_weight_kg` (`expWgt`), kept side by side. The unit value is derived later and **never replaces them**: reproducibility requires the official inputs, not the ratio computed from them.

A check constraint per shape stops one contaminating the other: a BOK row carrying trade fields, or a customs row carrying an index level, is refused.

Import figures are never used in the ratio. Korean imports are reported CIF while exports are FOB declared, so a mixed ratio would measure freight and insurance as well as price.

## Vintage and revision flow

Official statistics are revised, so evidence is append-only.

1. A retrieval writes one row per reference month with `vintage_ordinal` starting at 1.
2. Re-reading an unchanged month produces the **same `provenance_hash`**, and `unique (source_series_id, reference_month, provenance_hash)` refuses the write. Re-reading is a no-op, not a second vintage.
3. A **changed** official value produces a new vintage, and the previous row is marked `superseded_by_id`. The previous row keeps its value exactly as retrieved.
4. `pipeline.allow_only_supersession()` permits exactly one update — marking an un-superseded row superseded — and refuses every delete.
5. `pipeline.umpi_current_observations` resolves "latest" once: the highest un-superseded, non-rejected vintage per month. The publication layer reads the view, never the table, so "latest" has one definition.

The provenance hash deliberately **excludes the retrieval time**. Including it would make every re-read look like a revision, and a revision would stop meaning anything.

## Rebase flow

The Series B base is the frozen 2020 calendar-year aggregate:

```
base_uv = Σ expDlr over the twelve months of 2020 / Σ expWgt over the same twelve months
index_t = 100 × uv_t / base_uv
```

`computeIndexBase()` sums value and weight **before** dividing, which is the arithmetic that matches what a unit value is; an average of twelve monthly ratios would weight a small month equally with a large one. It refuses an incomplete window and a duplicated month, because eleven months is a different base and every published value would inherit the difference invisibly.

**No base value is populated by Phase 3.** `pipeline.umpi_index_bases` is created empty and the migration asserts it stays empty. The production base must be computed from ingested official observations, never from a constant in a migration — a hard-coded aggregate would be unverifiable and would silently outlive any correction to the underlying months.

## Publication flow

`pipeline.umpi_publications` holds one point per series, reference month and source vintage. A trigger (`check_umpi_publication_coherence`) enforces what a row is allowed to claim:

- the cited observation belongs to the **same series and the same month**;
- a series whose level is Urdais-derived **must** name the base it was rebased to, and one that republishes the agency level **must not**;
- a unit-value series **must** carry its mix warning on every point, and a price index **must not** carry one.

A withheld MoM stores `mom_withheld_reason` and no number; a check constraint makes a change and a reason mutually exclusive, so a filler zero has nowhere to live.

`publication_state` starts at `internal_only` on a point and `not_initialized` on a series. **Phase 3 makes nothing live.**

## Idempotence

Proven rather than asserted, in `supabase/tests/600_umpi_foundation.sql` and `src/lib/umpi/provenance.test.ts`:

- identical payload, same month → the insert is refused by the provenance uniqueness constraint;
- changed official value → exactly one new vintage, prior vintage intact and frozen;
- `umpi_ingestion_runs.idempotency_key` is unique, so a retried run is the same run;
- a run marked `no_change` cannot have written anything, and a `dry_run` cannot write at all — both are check constraints;
- `payloadDigest()` ignores key order in a source payload and respects row order.

## Security

- RLS is enabled on all six tables; no policies, so `anon` and `authenticated` reach nothing.
- `update`, `delete`, `truncate` are revoked from `service_role` on the three evidence tables; runs lose `delete` and `truncate`. Supersession happens through the trigger-guarded update path only.
- Neither schema is API-exposed, which `supabase/tests/070_security.sql` checks in config.
- No credential is stored in any row. Source metadata carries **environment variable names** (`UMPI_ECOS_API_KEY`, `UMPI_DATA_GO_KR_SERVICE_KEY`) and never values; a test greps the migration for anything that looks like a key.

## Phase 4 adapter contract

`src/lib/umpi/adapters/types.ts`. An adapter retrieves and parses. **It decides no methodology**: it does not rebase, compute a change, choose a vintage, or decide publishability.

```ts
fetch({ identity, fromMonth, toMonth, apiKey }) → { rows, payloadDigest, sourceClaimedComplete? }
```

Two adapters are expected:

| Adapter | Reads | Returns |
|---|---|---|
| BOK ECOS | `StatisticSearch` over `(404Y016, 30911201AA, M)` for a month range | `bok_index_level` rows in the agency's own base |
| Korea Customs | `getNitemtradeList` for HSK `8542321010` and a month range | `kcs_trade_month` rows carrying `expDlr` and `expWgt` unchanged |

Parsing is separated from fetching (`UmpiPayloadParser`) so a parser can be tested against a frozen payload with no network and no key. The API key is **passed in**, resolved by the caller from the environment, so an adapter stays a pure function of its inputs.

## Phase 4: the source adapters

Implemented in `src/lib/umpi/ingest/`. Both adapters retrieve and parse; neither decides
methodology. Manual execution only — there is no scheduler and no cron.

```
npm run umpi:ingest -- --source bok     --from 2026-06 --to 2026-08
npm run umpi:ingest -- --source customs --from 2026-06 --to 2026-06 --dry-run
```

### Bank of Korea — `bok.ts`

`GET https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/{start}/{end}/404Y016/M/{YYYYMM}/{YYYYMM}/30911201AA`

A path-positional API. The key is a path segment, so redaction is path-aware (`redactEcosUrl`).

The identity is asserted twice. Before the request, `assertBokIdentity` refuses anything but
`bok:404Y016/30911201AA/M`. After it, every returned row's `STAT_CODE` and `ITEM_CODE1` are
compared to the request, and a mismatch throws `UmpiIdentityMismatchError` rather than being
parsed — because `30911201AA` is also the DRAM item in the export price table `402Y016`, and a
response from there would otherwise look entirely reasonable.

ECOS reports its own failures in a `RESULT` envelope under HTTP 200, including "no data". That
is raised as a provider error and is never read as an empty month. If `list_total_count` exceeds
one page the adapter refuses rather than truncating, so a successful parse means the range is
complete — which is what the retrieval's `enumeration_assessment` records.

### Korea Customs — `customs.ts`

`GET https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList?serviceKey=…&strtYymm=…&endYymm=…&hsSgn=8542321010`

**No country parameter is sent, and a country-bearing response is refused.** See below.

Two envelopes are handled: the portal gateway's `OpenAPI_ServiceResponse/cmmMsgHeader/errMsg`
(observed verbatim from an unauthenticated request) and the service's own
`response/header/resultCode`. A `00` header with an empty `<items>` is real "no data" and is
distinguished from both. XML is read with the existing entity-resolving-free reader in
`src/lib/interconnection-queue/xml/document.ts`; a second XML parser was not added. That reader
would be better placed under a shared `src/lib/xml/`, which is a tidy-up for its own change
rather than something to fold into this one.

Field names are stated in `CUSTOMS_FIELDS` rather than guessed. A missing field raises a parse
error naming what was expected and what arrived, so an agency change produces one precise
failure in one place instead of a silent zero.

## The Customs aggregation decision

This is the part of UMPI most easily got wrong, so it is written down rather than left in code.

Series B measures **Korea's total** monthly exports of HSK 8542321010. The portal publishes two
operations and only one answers that:

| Dataset | Operation | Official description | Aggregation |
|---|---|---|---|
| **15101609** | `Itemtrade/getItemtradeList` | 관세청_품목별 수출입실적 — "HS Code(2/4/6/10단위)기준으로 집계한 품목별 수출입무역통계" | **By HS code. No country dimension.** |
| 15100475 | `nitemtrade/getNitemtradeList` | 관세청_품목별 **국가별** 수출입실적 — "국가 및 HS Code별 기준으로 집계한 국가별 품목별 수출입무역통계" | By country **and** HS code; `cntyCd` required |

**UMPI reads 15101609.** One row per commodity per month, so a national total requires no
summing and no reconciliation, and there is nothing to double-count.

Reading the country-dimension operation would offer only bad options: request one `cntyCd` and
publish a single trading partner as though it were Korea, or request many and sum rows with no
documented aggregate code to check against and no way to know whether a total row is already
among them. Both produce a number that looks like Korean exports and is not.

Three guards enforce this, because a comment would not:

1. `assertAggregateDataset` refuses dataset 15100475 before a request is built.
2. The parser throws if any row carries a country field (`cntyCd`, `cntyNm`, …) — that means the
   request reached the wrong operation, and the correct response is to fail, not to aggregate.
3. The parser throws if two rows share a reference month, which is an undeclared breakdown
   arriving without a recognised country field.

A six-digit or otherwise different `hsCd` is rejected per row; a `year` that is not a single
month (a yearly or range total) is rejected the same way.

**Phase 3 bound Series B to 15100475 by mistake.** Migration
`20261009100000_umpi_customs_aggregate_source.sql` corrects it in place, guarded by a check that
aborts if any observation already exists for the series. The methodology names the commodity and
the fields but never a dataset, so nothing in it changes.

## Three kinds of identity

These are the same question asked at three levels, and conflating any two produces a bug. They
are stated here because the first Phase 4 implementation got the first one wrong.

| Level | Identity | On an exact retry |
|---|---|---|
| **Logical run** | source + month range + **payload digest** | **reused** — the same work, re-executed |
| **HTTP retrieval** | source + month range + **the instant it was fetched** | **a new row** — each attempt is its own audit fact |
| **Observation** | source series + reference month + **provenance hash** | **nothing written** — the evidence is unchanged |

So an exact retry is **one run row, two retrieval rows, zero new observations**. The three
answers differ because the three questions do: *was this work done*, *did we call the agency*,
and *did the agency say anything new*.

`umpi_ingestion_runs.idempotency_key` is unique, and stays unique. The write path inserts with
`on conflict (idempotency_key) do nothing` and reads the existing row back, rather than adding
randomness to slip past the constraint — a retry must resolve to the same run, which is what
the constraint is for.

A **reused run that already completed keeps its counts.** Overwriting them with a replay's
zeroes would make the run row contradict the observations that carry its id. A reused run whose
prior state is `failed` is a genuine retry and *is* updated. The caller sees both facts as
`runReused` and `runCountsPreserved`.

The retrieval key carries the fetch instant rather than a random value: an attempt happens at a
time, so the time **is** its identity. Persisting the same fetch result twice therefore still
dedupes, which is what separates a second attempt from a replay of one.

## Persistence flow

`run.ts` → `store.ts`, one path for everything:

1. `resolveUmpiLineage` resolves series, source series, interface and methodology version **by
   code**, and refuses a series with anything other than exactly one active source identity.
2. The retrieval is recorded in the shared `pipeline.source_retrievals` — one row per HTTP
   attempt — with its redacted URL, payload digest, record count and Urdais's own
   `enumeration_assessment`.
3. The run is opened, or resolved to the existing one for this exact work.
4. Per admitted row, inside one transaction: an existing observation with the same source
   series, month and provenance hash means **nothing is written**; otherwise the next vintage is
   appended and the previous current vintage is superseded. Every inserted observation records
   **`source_retrieval_id`** — the exact call that produced it — and a `retrieved_at` carried
   from the fetch, never a database `now()`. Those differ, and the difference is exactly the
   question "when was this true at the source".
5. The run closes with honest counts and `idempotence_state` of `no_change` or `changed`. A
   throw rolls the transaction back and closes the run as `failed` — never as a partial success.

## Testing the write path

Two layers, because they catch different things:

* `store.test.ts` runs against an in-memory fake — fast, and proves the decision logic.
* `store.integration.test.ts` runs **the same store against a real migrated database**, gated on
  `UMPI_INTEGRATION_DATABASE_URL` so CI and an ordinary `npm test` skip it. It proves what a
  fake cannot: that a statement's placeholders and parameters agree, that the unique constraint
  behaves as the code assumes, and that `source_retrieval_id` is really populated.

The integration test **requires a freshly migrated database and cannot clean up after itself**:
UMPI observations are append-only by trigger, so a delete is refused for every role. Disabling
that trigger to tidy up would undermine the guarantee being tested, so the test asserts the
database is empty at the start and the operator resets afterwards:

```
npm run db:reset && npm run db:migrate
UMPI_INTEGRATION_DATABASE_URL="$(scripts/db/local.sh url)" npx vitest run src/lib/umpi/ingest/store.integration.test.ts
npm run db:reset && npm run db:migrate   # leave it clean for the SQL suite
```

### Dry run

`--dry-run` fetches, parses and validates, and **writes nothing at all**: no observation, no run
row, no retrieval row. A retrieval record would be defensible as an audit fact, but a rehearsal
that writes to the database is one people stop trusting.

## Error handling

Typed, so an operator and a later monitor can tell the cases apart: `configuration`,
`transport`, `provider`, `parse`, `validation`, `identity`, `persistence`. Only `transport`
carries a retryable flag. Retries are restrained — three attempts, 500 ms then 1 s backoff, and
**no retry at all** for a 4xx, because a rejected key will not become accepted by asking a
government API again.

## Credentials

`UMPI_ECOS_API_KEY` and `UMPI_DATA_GO_KR_SERVICE_KEY`, resolved by the caller and passed into an
adapter, which keeps adapters pure and testable without a key. Neither is committed and neither
appears in any stored URL: `redactUrl` handles the query-parameter form, `redactEcosUrl` the
path-segment form, and both run before anything is logged or persisted.
`src/lib/umpi/ingest/server-boundary.test.ts` asserts that no client tree mentions either name
or imports the ingestion modules.

## Live verification status

**Not performed.** Neither credential is configured in this environment, so no live retrieval
has run against either agency and both source interfaces remain `research_usable`. Promotion to
`production_approved` requires a successful narrow retrieval and an exact rerun proving zero new
observations; until then the registry says what is true.

The one residual unknown a live run resolves: the exact response field names of
`getItemtradeList`. They are expected to match the documented `expDlr` / `expWgt` / `hsCd` /
`year` family, and if they differ the parser fails loudly naming the fields it received, which
is a one-line fix in `CUSTOMS_FIELDS` rather than a silent wrong number.

## What Phase 4 must not do

Recorded here because the foundation cannot enforce all of it:

- publish under the `0.1.0-draft` methodology — it carries no effective date, and publication under a draft is prohibited;
- read `402Y016`, or any currency basis, until a version decides one;
- blend the two series, average them, or use one to fill a gap in the other;
- write a base value that was not computed from ingested observations;
- promote any demo point from `src/data/mock/market-detail.ts`.
