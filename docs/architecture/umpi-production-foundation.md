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

## What Phase 4 must not do

Recorded here because the foundation cannot enforce all of it:

- publish under the `0.1.0-draft` methodology — it carries no effective date, and publication under a draft is prohibited;
- read `402Y016`, or any currency basis, until a version decides one;
- blend the two series, average them, or use one to fill a gap in the other;
- write a base value that was not computed from ingested observations;
- promote any demo point from `src/data/mock/market-detail.ts`.
