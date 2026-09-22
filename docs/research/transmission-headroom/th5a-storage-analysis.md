# Transmission Headroom TH-5A: storage analysis

**Status: internal research document.** Not a methodology, not routed publicly, not registered in the docs catalog. Prepared 22 September 2026 against `main` at `42ca837`. Every figure was measured on one real NYISO month (2005-02: 89,661 source rows → 88,825 flow observations, 177,650 limit observations, 88,835 margins), not estimated.

## The problem

The production NYISO backfill stopped against a full disk at a database size of 974 MB. The transaction rolled back cleanly, but the ceiling is real.

## Baseline, measured

| Table | Total | Heap | Index | Index share |
|---|---:|---:|---:|---:|
| `transmission_limit_observations` | 107 MB | 43 MB | 63 MB | 59% |
| `raw_transmission_records` | 65 MB | 47 MB | 18 MB | 28% |
| `transmission_flow_observations` | 54 MB | 22 MB | 32 MB | 59% |
| `transmission_margins` | 42 MB | 19 MB | 23 MB | 55% |
| **Total** | **267 MB** | **131 MB** | **136 MB** | **51%** |

**3,156 bytes per margin, all in.** Over ~43 M observations that is ~136 GB, or ~163 GB with 20% headroom.

### The five largest indexes

| Index | Size | Why it exists |
|---|---:|---|
| `limit (source_interface_id, entity_id, observed_at, contingency_kind, direction)` | 25 MB | business uniqueness |
| `limit (id, entity_id, observed_at, source_interface_id, contingency_kind)` | **21 MB** | **foreign-key target only** |
| `raw (snapshot_id, record_hash)` | 13 MB | rerun deduplication |
| `margins (calculation_version_id, entity_id, observed_at, contingency_kind, selected_direction)` | 13 MB | result uniqueness |
| `flow (id, entity_id, observed_at, source_interface_id, contingency_kind)` | **11 MB** | **foreign-key target only** |

The two FK-target indexes cost **31 MB on one month** and carry no information the tables do not already hold. They exist so a margin cannot reference a flow or limit belonging to another market, entity, instant or contingency.

### Where the heap went

Measured with `pg_column_size` on the limit table (242 bytes/row):

- **96 bytes of UUIDs**: `id`, `source_interface_id`, `snapshot_id`, `raw_record_id`, `interface_id`, `entity_id`
- **81 bytes of low-cardinality text**: `contingency_kind` (15), `native_field` (21), `native_timestamp` (17), `entity_kind` (10), `direction` (9), `limit_state` (5), `unit_as_published` (4)

Those seven text columns carry **six distinct values between them** across the whole month. `contingency_kind` has exactly one value and costs 15 bytes in the heap plus 15 in each of two indexes.

Raw records (524 bytes/row) carry `artifact_sha256` (65) and `extraction_version` (32) on every row, both properties of the snapshot above them — 97 bytes × 89,661 = **8.7 MB a month of pure repetition**.

`entity_id` always duplicates whichever of `interface_id`/`element_id` is set: **16 bytes a row of copy**.

## Candidates evaluated

| | Change | Result |
|---|---|---|
| **A** | Keep wide composite FK-target indexes | baseline |
| **B** | Surrogate `bigint` keys + trigger-enforced compatibility | **chosen** |
| **C** | Surrogate keys + a denormalised compatibility hash | rejected: a hash adds a column to every row to replace a check that costs nothing at rest, and a short hash trades a structural guarantee for collision probability |
| **D** | A `transmission_observation_scope` table for `(source, entity, instant, direction, contingency)` | rejected: the scope table needs its own row and unique index per observation-instant, so it moves the bytes rather than removing them — and adds a join to every read |
| **E** | Partitioning by market or month | not a storage answer: it helps maintenance and retention and leaves total bytes essentially unchanged. Worth revisiting for backfill manageability, not for this problem |

## Chosen design

1. **`bigint` surrogate primary keys** on raw records and observations. Nothing outside the schema sees them; entity IDs stay UUIDs because they are publicly exposed.
2. **Trigger-enforced margin compatibility** replacing the two FK-target unique indexes. The trigger also checks two things the indexes never could: that a computed margin measured against the direction it says it selected, and that it measured against a real or zero limit.
3. **Seven low-cardinality text columns → `smallint`**, with `reference.transmission_code_map` holding the mapping and a `transmission_margins_readable` view resolving them back.
4. **`record_hash` as `bytea`** — 32 raw bytes rather than 64 hex characters, halving both the column and its 13 MB index.
5. **Dropped columns**: `interface_id`/`element_id` (duplicated `entity_id`), `source_interface_id` on observations (an entity determines it), `native_timestamp` (in the raw payload), `artifact_sha256`/`extraction_version`/`locator` on raw records (properties of the snapshot).

## Measured and declined

| Lever | Saving | Why not |
|---|---:|---|
| Raw payload as a positional array instead of an object | 9 MB/month (3.4%) | makes raw evidence unreadable without the parser that wrote it, which defeats its purpose |
| Drop the 50% of limit observations no margin references | 22 MB/month (8%) | they are genuine published evidence, and they are exactly what makes the sentinel rule auditable |
| `payload` with `STORAGE MAIN` for inline compression | **0 MB, measured** | rows are far below TOAST's compression threshold; no effect |
| `entity_id` as `bigint` | ~6% | entity IDs are exposed in the public API payload; changing them is a contract change this phase forbids |

## Result

| | Baseline | Optimized | Change |
|---|---:|---:|---:|
| Total | 267 MB | **146 MB** | **−46%** |
| Heap | 131 MB | 72 MB | −45% |
| Index | 136 MB | 74 MB | −46% |
| Bytes per margin | 3,156 | **1,719** | −46% |
| Ingest persist time | 22.1 s | **13.3 s** | **−40%** |

Migrating the existing rows in place (rather than re-ingesting) yields 136 MB / 1,609 bytes — 49% — because a bulk copy packs pages more tightly than incremental inserts. **1,719 is the number to plan a backfill against.**

The stated target was 50%. The honest result is **46% end-to-end without weakening any invariant**, and the remaining 6% is available only by changing publicly-exposed entity identifiers, which is out of scope here.

## Full-history projection

| | Bytes/margin | 43 M observations | +20% headroom |
|---|---:|---:|---:|
| Baseline | 3,156 | 136 GB | **163 GB** |
| Optimized | 1,719 | 74 GB | **89 GB** |

## Decision

**`hybrid_optimize_and_increase_disk`.**

The optimization is semantically free and halves the bill, so it should ship regardless. But 89 GB is still far beyond the current instance, so a disk increase is unavoidable if the full twenty-year series is wanted.

Worth stating plainly, because it is the larger lever and belongs to a later methodology decision rather than to this phase: **the public product does not need twenty years of five-minute data.** Every published metric is a current point-in-time value; history feeds only the per-entity charts and two counts already labelled as covering *retained* history. A retention or resolution policy — two years at full resolution, or the full span hourly — would cost a small fraction of 89 GB and change nothing a reader sees. That is a methodology revision, not a storage fix.
