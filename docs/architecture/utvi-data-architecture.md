# UTVI Data Architecture and Implementation Plan

**Status: internal architecture artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026 alongside [UTVI 0.1.0-draft](../methodology/utvi.md) and the [Phase 1 source study](../research/utvi/source-study.md).

**No migration is created by this phase, and none should be.** The methodology is a draft, no source is production-approved, four field semantics are undocumented, and the development rules prohibit introducing tables before the slice that needs them. This document says what the tables should be when that slice arrives, and — more usefully — which existing Urdais patterns UTVI reuses and which it must not.

## Current Architecture: what UTVI is today

UTVI is **entirely demo data**. There is no backend, no type, no schema and no source adapter.

| Concern | Where | What it is |
|---|---|---|
| Section component | [`src/components/model-economics/utvi-section.tsx`](../../src/components/model-economics/utvi-section.tsx) | Renders headline, chart and period performance from the `UTVI` constant. No props, no data fetch, no production/preview split |
| Demo data | [`src/data/mock/model-economics.ts:129-156`](../../src/data/mock/model-economics.ts#L129) | `UTVI` is a `MarketInstrumentDetail` built by `aggregateVolume()` over 18 `MODEL_SPECS`, 420 days of seeded synthetic series, headline = trailing 1-month return |
| Page | [`src/components/model-economics/model-economics-page.tsx`](../../src/components/model-economics/model-economics-page.tsx) | Stacks `TokenPriceSection` (real, production-wired) with `UtviSection`, `MarketShareChart`, `ModelFrontierChart`, `OpenWeightAnalysis` (all demo). Page header carries a **"Demo data"** badge |
| Search registration | [`src/data/market-catalog.ts:84`](../../src/data/market-catalog.ts#L84) | `"utvi"` is a keyword on the Model Economics page entry. No instrument row |
| Types | [`src/types/model-economics.ts`](../../src/types/model-economics.ts) | `ModelRecord`, `ShareRow`, `FrontierPoint`, `AccessClass` — demo shapes, documented as such. **No token-volume observation type exists** |

The demo data is honest about itself — *"All of it is deterministic demo data anchored at MOCK_AS_OF, and none of it is a real observation"* — and the volume series feeds four sections at once (UTVI, Market Share, Frontier point size, Open-weight volume share). That coupling is a fair model of the real dependency and is the reason §18 of the phase brief is right that these must become aggregations over one observation table.

Two properties to preserve when the real thing arrives, because they are the demo's good decisions rather than its limitations: **every number is computed from records rather than typed into the UI**, and the **volume graph has one root**.

## What UTVI Reuses Unchanged

The lineage, rights and calculation patterns in `reference` and `pipeline` fit UTVI without modification. Reusing them is what keeps a third index family from becoming a third platform.

| Existing object | Use for UTVI |
|---|---|
| `reference.methodologies`, `reference.methodology_versions` | The UTVI document and its versions. The draft-has-no-effective-date constraint is precisely the rule that must hold: nothing may publish under 0.1.0-draft |
| `reference.providers` | Labs already exist as `model_api_provider`. **One value must be added**: `inference_marketplace`, for the serving platform. OpenRouter is not a lab and must never aggregate as one |
| `reference.source_interfaces` | The datasets endpoint, with both terms axes, `production_access_state`, `written_agreement_required` and `terms_evidence`. The existing constraints already encode what blocks UTVI today |
| `reference.models`, `reference.model_aliases` | Canonical model identity keyed `(provider, provider_model_id)`, with floating pointers kept out of the identity table. **Already exactly right** for §6 |
| `pipeline.source_retrievals` | Every dataset call, with request URL, parameters, response hash, byte length and timestamps. The idempotency-key and duplicate-retrieval machinery applies unchanged |
| `pipeline.calculation_runs` | One UTVI calculation, with `run_kind` separating `production` from `simulation` — what keeps a pre-approval candidate from becoming an accident |
| `pipeline.forbid_mutation()`, `pipeline.allow_only_supersession()` | Append-only raw evidence; corrections by supersession (§17) |
| [`permission-gate.ts`](../../src/lib/ucpi/permission-gate.ts) | `productionCollectionPermitted` unchanged. A volume source passes the same two-axis gate as a price source |
| [`identity.ts`](../../src/lib/tokens/identity.ts) | `modelIdentityKey`, `classifyIdentityKind`, `assertStableModelIdentity`, `assertIdentitySurvivesRename`. The latest-pointer rejection is the rule §6 needs and it is already written and tested |
| `hasProductionCoverage` pattern ([`database-persistence.ts:231`](../../src/lib/ucpi/runtime/database-persistence.ts#L231), [`daily-run.ts:282`](../../src/lib/ucpi/runtime/daily-run.ts#L282)) | The pre-coverage precondition. **The single most important reuse in this document**: `Σ ∅ = 0` is a plausible, silent, false answer, and this guard is what refuses to compute it |
| `src/app/api/cron/*` + `CRON_SECRET` | The daily job shape, authentication and schedule already in production for UCPI, UBWI and news |

## What UTVI Must Not Force-Fit

**`pipeline.normalized_observations` and the UCPI publication layer are wrong for UTVI.** They are built around a compute offer: a seller, a region, a quantity, a price per accelerator-hour, an availability grade, a capacity-source collapse, a market-breadth qualifier. UTVI has no seller, no region series, no participant count and no breadth. Pushing a daily token count through those columns would leave most of them null and the rest lying.

**`pipeline.token_price_observations` is equally wrong**, for a closely related reason: it is shaped by a pricing dimension, a service tier, a context tier, a cache TTL and an FX pair. A token *count* has none of those. That the two tables would share a `model_id` is not a reason to share a table — a price and a quantity are different economic objects and the schema should say so.

**`decideBreadth` and the market-breadth vocabulary do not apply.** They express a rule about how many independent sellers a median needs to be a market price. A sum of consumption has no participant-count threshold, and borrowing the vocabulary would import a publication gate that means nothing here.

**No `blended` or derived-value table.** Breakdowns are aggregations computed in application code from the observation table (§14), never a second stored series that can drift from its source.

## Proposed Schema

To be created **by the slice that needs it**, not before. Names follow existing conventions; a new `pipeline` prefix keeps the family legible.

### `pipeline.token_volume_retrievals`

Wraps `pipeline.source_retrievals` semantics for a dataset window. Whether this is a distinct table or a set of columns on the shared retrieval table is a Phase 1B decision best taken with a real response in hand.

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `source_interface_id` | uuid fk | → `reference.source_interfaces` |
| `retrieval_purpose` | text | `research` \| `production`. Production requires a permission grant and an approved interface, enforced as in `20260913140000` |
| `idempotency_key` | text unique | Source slug + resolved window + purpose |
| `requested_at`, `completed_at` | timestamptz | Urdais's own clock; controlling for freshness |
| `request_url` | text | |
| `request_parameters` | jsonb | **Must record the exact parameter set.** A constraint should reject `category` and `language_type`, which read an estimated dataset (§4.1) |
| `response_status` | int | |
| `response_hash`, `response_byte_length` | text, int | Reproducibility |
| `source_window_start`, `source_window_end` | date | Resolved window echoed by the source, not the requested one |
| `source_as_of` | timestamptz | **The source's freshness timestamp. Required — the attribution string interpolates it (§18)** |
| `dataset_version` | text | The source's own contract version |
| `record_count` | int | Rows returned |
| `residual_row_present` | boolean | Whether the aggregate residual row was present; it is omitted when the tail is empty |
| `collector_identity` | text | |
| `permission_grant_id` | uuid fk null | Required for production |

### `pipeline.token_volume_observations_raw`

Append-only, exactly as returned. One row per `(retrieval, source date, source model id)`.

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `retrieval_id` | uuid fk | |
| `source_model_id` | text | **Verbatim**, variant suffix included. Never rewritten |
| `source_provider_namespace` | text | The namespace segment, stored as read. **Not a lab identity** until mapped on evidence |
| `observation_date` | date | The source's UTC date |
| `total_tokens` | **numeric** | Parsed from the source's decimal string. Never a float, never a JS number on the write path |
| `input_tokens`, `output_tokens` | numeric null | Null under the candidate source, which does not separate legs. Present so a future source that does needs no migration |
| `is_residual_aggregate` | boolean | True for the unattributed tail row (§13) |
| `created_at` | timestamptz | |

Unique on `(retrieval_id, observation_date, source_model_id)`.

### `pipeline.token_volume_observations`

Normalised, one row per raw row, carrying resolved identity and quality flags.

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `raw_observation_id` | uuid fk | Lineage to the exact bytes |
| `model_id` | uuid fk null | → `reference.models`, after variant folding. **Null for the residual row**, which has no model |
| `lab_provider_id` | uuid fk null | → `reference.providers`. Null where the namespace has no evidenced lab mapping |
| `serving_platform_provider_id` | uuid fk | → `reference.providers`, `inference_marketplace`. **Never equal to the lab in meaning** (§6) |
| `observation_date` | date | |
| `token_category` | text | `inference_input_output` under 0.1.0-draft. A closed set, extended only by a methodology version |
| `token_count` | numeric | |
| `provenance` | text | `observed` \| `provider_reported` \| `platform_observed`. Ranks 4–5 are not representable **by design** (§4.1) |
| `is_residual_aggregate` | boolean | |
| `quality_flags` | text[] | e.g. `VARIANT_FOLDED`, `LAB_UNMAPPED`, `RESIDUAL_UNATTRIBUTED` |
| `source_attribution` | text | Rendered citation, as required |
| `superseded_by` | uuid null | Corrections by supersession, never edits |

### `pipeline.token_volume_coverage`

The table that makes missing distinguishable from zero. **Written even when a retrieval fails** — that is its whole purpose.

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `coverage_date` | date | |
| `source_interface_id` | uuid fk | |
| `retrieval_id` | uuid fk null | **Null when no retrieval succeeded** |
| `coverage_state` | text | `covered_observed` \| `covered_zero` \| `not_covered` \| `retrieval_failed` \| `pre_coverage` (§7) |
| `universe_descriptor` | text | The declared observed universe for this date and version |
| `models_observed` | int null | |
| `failure_detail` | text null | |

Unique on `(coverage_date, source_interface_id)`.

### `pipeline.token_volume_calculations`

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `calculation_run_id` | uuid fk | → `pipeline.calculation_runs`, carrying `run_kind` |
| `methodology_version_id` | uuid fk | Resolved at run time. **Only an approved version for a production run** |
| `calculation_date` | date | |
| `coverage_state` | text | Must be `covered_observed` to produce a value |
| `total_observed_tokens` | numeric null | |
| `attributed_tokens` | numeric null | Total minus the residual — the denominator for shares (§13) |
| `residual_tokens` | numeric null | **Published, never hidden** |
| `constituent_count` | int null | Attributed models |
| `contributing_source_count` | int null | |
| `exclusions` | jsonb | Reason-coded |
| `settlement_state` | text | `provisional` \| `final` (§11) |
| `superseded_by` | uuid null | |

### `pipeline.token_volume_publications`

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `calculation_id` | uuid fk | |
| `publication_date` | date | |
| `tokens_per_day` | numeric | |
| `change_percent_1d` … `_1y` | numeric **null** | **Null, never zero**, where unavailable (§15) |
| `methodology_version` | text | |
| `universe_descriptor` | text | Published with the value (§20) |
| `coverage_metadata` | jsonb | |
| `source_attribution` | text[] | Rendered, interpolated per retrieval |
| `settlement_state` | text | |

### Two constraints worth writing as constraints

Both encode a rule the prose states, and a rule the database enforces cannot be forgotten by a future collector.

1. **No zero value without coverage.** `total_observed_tokens` may be non-null only when `coverage_state = 'covered_observed'`. This makes the `Σ ∅ = 0` failure unrepresentable rather than merely discouraged.
2. **No estimate in the observation table.** `provenance` admits only ranks 1–3. An estimate cannot be inserted and later mistaken for an observation.

## How the UI Would Change

Deliberately little, because the demo's shape is close to right.

| Change | Why |
|---|---|
| `UtviSection` takes an instrument **prop** instead of importing the mock | The pattern `TokenPriceSection` already uses — one component, production or preview by prop |
| Display name → **"Observed Token Volume Index"**; symbol stays `UTVI` | §3.1 and §20. The name is what gets quoted |
| Universe descriptor rendered beside the value | §20 requires it with every value, not behind a link |
| Headline change label reads its actual period | Currently hardcoded `1M` |
| Period performance returns `null`, not `0` | §15. Check `movementClass`/`formatPercent` handle null as absent rather than as flat |
| Page "Demo data" badge drops **only** when every section is real | UTVI going live does not make Market Share, Frontier or Open-weight real; the badge is page-level and must not lie about its neighbours |
| Context disclosure beside the value | Order of magnitude of the whole market, from the CC BY cross-check source, labelled as a third-party figure |

## Implementation Plan

### Phase 1 — this phase. Complete.

Source study, methodology draft, terms note, data model, plan. Documentation only; no code, schema or migration.

### Phase 1A — unblock. **Prerequisite for everything after it.**

Small, and nothing may proceed without it.

1. Create an OpenRouter account; obtain an API key; hold it as `OPENROUTER_API_KEY`, in `.env.example` with no value and in `.env.local` / Vercel with one.
2. One authenticated retrieval, archived with headers, as a research artifact.
3. **Answer the four open questions** — cached input, embeddings, BYOK/private, revision behaviour — by measurement, or by asking OpenRouter, whose data page invites collaborations.
4. **Measure revision behaviour**: read a fixed date daily for ~14 days, record deltas, and set the settlement lag from the result.
5. Reconcile: does `Σ(individual rows) + residual` match the platform total, and what is the residual's share?

**Exit criterion: a real response on disk, the four questions answered, a settlement lag with evidence behind it.** If any answer contradicts the draft, the draft changes before code is written — which is the entire reason this order is what it is.

### Phase 1B — methodology approval

Fold 1A's findings into the draft; set the settlement lag; promote to 1.0.0 with an effective date; record the methodology and its version in the registry; record the source interface with both axes, its terms evidence and its attribution template, and promote it to `production_approved` on the recorded retrieval.

### Phase 1C — ingestion

Adapter, schema validation, normalisation, coverage recording. First migration lands here — **not before**. Research-mode retrieval into a research purpose first; the collector refuses production without the gate, as `assertProductionCollectionPermitted` already requires.

### Phase 1D — backfill and calculation

Backfill 2025-01-01 → present in one pass, every point with its own lineage. Aggregation with the coverage precondition **written before the sum, not after**. Percentage change for all six periods, `null` where unavailable.

### Phase 1E — production surface

Daily cron at the UCPI pattern; read model and API contract; wire `UtviSection` to production with a preview path; publication gate fail-closed; attribution rendered from the data.

### Phase 2 — Market Share

**Two aggregations over the observations Phase 1 already wrote**, with the attributed denominator and the published residual. If it needs new ingestion, Phase 1 was built wrong.

## Risks

| Risk | Severity | Mitigation | Residual |
|---|---|---|---|
| **Coverage misread as the market** | **High** | *Observed* in the name; universe published with every value; context disclosure beside it | **Cannot be eliminated.** A headline number will be screenshotted without its caption |
| **Source concentration: one source, one company** | **High** | No mirrors, no substitutes. Rights and interface could change with notice or without | Accepted and disclosed. There is no second daily source to diversify into |
| **Coverage-expansion growth read as market growth** | High | Version break, no restatement, change withheld across it, coverage descriptor in the data | Low once the rule holds |
| **Licensing** | **Low** | CC BY 4.0, commercial and derivative works express; attribution carried on the data | Lowest of any Urdais source. Revisit if Urdais ever redistributes the dataset rather than an index over it |
| **Double counting** | Low now, High later | Deduplicate traffic paths not models; precedence to the serving platform; exclude where undeterminable | Zero at one source. Real the moment a second is admitted |
| **Tokenizer non-comparability** | Medium | Unit defined as provider-reported tokens; disclosed; no synthetic normalisation | Structural. A composition shift between labs moves the total for a non-market reason |
| **Silent revision** | Medium | Append-only retrievals; settlement lag; provisional/final state published | Unquantified until 1A measures it |
| **`Σ ∅ = 0`** | **High if unguarded** | Coverage precondition before aggregation, plus a database constraint | Low. The pattern exists and is tested |
| **Attribution not rendered** | Medium | Interpolated per retrieval; fail-closed if unrenderable | Low |

## What Would Make This Not Worth Building

Recorded because a research phase should be able to conclude *no*, and because these are the findings that should stop it rather than be worked around:

- **1A finds the series is not reproducible** — the same date returns materially different totals indefinitely, with no settlement.
- **BYOK or private-traffic treatment changes over time**, so the series moves for platform-composition reasons that cannot be distinguished from market movement.
- **The residual dominates**, so attribution is too thin for the breakdowns the page depends on.
- **The rights position changes.**

If any of these holds, the honest product may be narrower: the covered-platform series as an explicitly platform-scoped statistic, or a source-cited disclosure table with no index at all. Either beats a daily number that cannot bear its own headline.
