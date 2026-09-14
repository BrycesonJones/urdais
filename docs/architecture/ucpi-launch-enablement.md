# UCPI Launch Enablement

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. Records the launch-enablement slice: the PR #44 migrations applied to UrdaisDev with parity verified, the provider approval workflow and checklists, seeded reference data, the credential contract, the production runtime and its HTTP policy, first-authenticated-validation mode, the production job and publication gate, the read path, observability, failure-mode tests, and the activation-migration template. **No provider replied during this task; no permission state changed; no live request was made; no key exists in the repository; no value was published.**

## 0. Synchronization

| Check | Result |
|---|---|
| `main` at PR #44 merge | `dd2964c` |
| `20260913140000_production_ingestion_fields` | Absent from hosted history and objects absent; **applied once**; version aligned |
| `20260913150000_publication_layer` | Same; **applied once**; version aligned |
| Objects | `permission_grants` + 8 publication tables; 8 new columns; 5 key triggers; 6 methodology constraints |
| Version rows | 3 parent + 4 child, intact |
| Classifications | Runpod `not_permitted/not_permitted/blocked`; Lambda `under_review/not_permitted/blocked`; Vast blocked; AWS/Azure collection permitted, index use under review; DigitalOcean under review |
| Counts | 0 approved · 0 grants · 0 observations · 0 runs · 0 publications; instrument `launch_blocked` |
| **Hosted fingerprint** (identical to fresh local bootstrap) | columns 359 `3c8f2147…` · constraints 253 `dc42f57d…` · indexes 79 `fec7d441…` · triggers 20 `93344b68…` · functions 7 `db5bf5ff…` · RLS 30 `9e64e47f…` · policies 0 · privileges 30 `12cdcee3…` |

The two migrations added by this slice (`160000`, `170000`) are applied after merge. Expected hosted fingerprint afterwards, from the local bootstrap: columns 359 `3c8f2147…` · constraints 253 `b7585f28…` · indexes 79 `fec7d441…` · triggers 21 `62117e79…` · functions 8 `492e1817…` · RLS 30 `9e64e47f…` · policies 0 · privileges 30 `12cdcee3…`.

## 1. Provider communications

| Provider | Thread | State on 13 September 2026 |
|---|---|---|
| Runpod | `1a09b4ce294d8be3` (request to help@ cc legal@); `1a09b4e620a69c2a` (auto-ack, ticket #47829) | **No human reply.** Collection: `not_permitted`; index use: `not_permitted`; tenancy: Documented; production: blocked. Gap: written permission on both axes, plus attribution/caching/retention/display terms |
| Lambda | `1a09b5dfdba9b13d` (request to legal@; tenancy addendum `1a09d05f8dbdd35e`) | **No reply.** Collection: `under_review`; index use: `not_permitted`; tenancy: **Ambiguous**; production: blocked. Gap: the carve-out on both axes and a one-line tenancy statement |

Nothing was rounded up. No state changed.

## 2. Approval workflow

Fourteen explicit, reviewable transitions (`src/lib/ucpi/activation.ts`, `ACTIVATION_WORKFLOW`): interface exists → terms review complete → collection permitted → index use permitted → grant recorded → grant in force → grant linked to every production retrieval → product supported → tenancy acceptable → availability Grade ≥ 3 → geography resolvable → `production_approved` → first authenticated validation passed → collector enabled. Steps 3–4 and 12 are migrations on written evidence; the registry CHECK refuses step 12 without 3 and 4; steps 5–7 are enforced by the database on every production and validation retrieval; step 14 is a deployment change after step 13. No single change performs the sequence.

## 3. Activation checklists

`evaluateActivation` reports pass/fail/pending for 19 items per provider. Today:

| Item | Runpod | Lambda |
|---|---|---|
| Collection rights | fail | pending |
| Index-use rights | fail | fail |
| Written permission / agreement | pending | pending |
| Attribution · caching · retention · raw redistribution · aggregate publication · reconstruction | pending | pending |
| Product id | pass (`NVIDIA H100 80GB HBM3`) | pass (`gpu_1x_h100_sxm5`) |
| Canonical quantity | pending (`minPodGpuCount` at first call) | pass (1×) |
| Tenancy | pass (Documented) | **pending (Ambiguous)** |
| Availability Grade ≥ 3 | pass | pass |
| Country mapping | pass (rule; US evidenced) | pass (14 regions) |
| Legal entity seeded | pass | pass |
| Permission grant seeded | pending | pending |
| Credentials available | pending | pending |
| Authenticated validation passed | pending | pending |
| Collector enabled | fail | fail |

Checklist status is visibility only. The controls are the registry, the database gate and the runtime preflight.

## 4. Reference data seeded (`20260913160000`)

Canonical countries US, JP, IN, DE, IL (mapping targets, not series). Market entities `Runpod, Inc.` and `Lambda, Inc.` with seller roles and evidence. Native identifiers: Runpod `NVIDIA H100 80GB HBM3` (and PCIe/NVL so the collector recognizes and excludes them); Lambda `gpu_{1,2,4,8}x_h100_sxm5`; all `provisional`. Region mappings: Lambda's 14 regions at high confidence with the regions-table evidence; Runpod `US-KS-2`, `US-GA-1` at medium confidence with the documentation examples, rising to high when the `countryCodes` filter confirms them. **Not seeded**: prices, availability, grants, tenancy upgrades, operator roles, observations.

## 5. Credential contract (`runtime/config.ts`)

`RUNPOD_API_KEY`, `LAMBDA_API_KEY` read only from the `env` record passed at run time; absent or blank → `MissingCredentialError` naming the variable, never a value. `Credential` is opaque: `toString`/`toJSON` redact; the value leaves only as the `Authorization` header at send time. `UCPI_RUN_MODE` ∈ simulation (default, no network, no credential) | validation | production. `UCPI_RUNPOD_BASE_URL`, `UCPI_LAMBDA_BASE_URL` must be https; the documented hosts are noted in `.env.example` as configuration, not assumptions. `redactSecrets` scrubs bearer tokens and key assignments from anything logged.

## 6. Runtime wrapper (`runtime/collector-runtime.ts`)

`collectSource`: **preflight** (mode; `productionCollectionPermitted`; grant present, for this interface, covering both axes, in force now; credential present; now inside the window) → request under the HTTP policy with the cutoff as the hard deadline → JSON parse → schema validation → adapter parse → normalize → eligibility → one transaction persisting retrieval (purpose production | validation | research, with the grant id), raw offers, observations, assessments → events. Simulation mode skips the network and uses a fixture. Every refusal is a typed `PreflightError` and is tested to occur before any request.

## 7. HTTP policy (`runtime/http.ts`)

Defaults, all configurable: 20 s request timeout; 4 attempts; backoff 2 s × 2ⁱ capped at 60 s with 20 % jitter; retryable 408/425/429/500/502/503/504; **401/403 never retried**; `Retry-After` (seconds or HTTP-date) honoured on 429/503 and capped at 15 min; a retry that would land at or after the deadline raises `HttpDeadlineError` instead; malformed JSON → `MalformedResponseError`; documented-shape mismatch → `SchemaDriftError` with the JSON path. Duplicate responses within a window are persisted and flagged `duplicateOfRetrievalId`; identical idempotency keys are refused. No provider-specific rate limit is asserted, because none is documented.

## 8. First authenticated validation (`runtime/validation-mode.ts`)

Runs `collectSource` with purpose `validation` (same preflight as production) and reports pass/fail/pending on: Runpod — endpoint, H100 product, `minPodGpuCount`, datacenter list, country filter, availability shape, price fields, Secure/Community, non-bid confirmation (pending until compared with the GraphQL field), bundle, eligibility; Lambda — endpoint, `gpu_1x_h100_sxm5`, region presence, availability array, price tiers, specs, **tenancy evidence** (pending until Lambda states it), eligibility. Creates no run and no publication; the database additionally refuses validation retrievals as inputs to a production run (`170000` trigger).

## 9. Production job (`runtime/production-job.ts`)

Two phases the calendar keeps apart. **Collection** (inside the window): each source in isolation; a failure is recorded and the others proceed. **Calculation** (at or after the cutoff): load the date's *production* observations, run the pipeline over configured series regions and priors, write run + seller + capacity-source + regional rows in one transaction (a correction run supersedes the current row in the same transaction), evaluate the gate, publish with status by deadline or leave Unavailable, emit `run_finished` with per-region outcomes. Simulation runs compute and are never published.

## 10. Publication gate (`runtime/publication-gate.ts`)

Application checks layered on the database constraints: not a simulation; methodology and spec versions match the expected and the observation; window/cutoff/deadline are the calendar's; calculated at or after the cutoff; every input retrieval behind a value is production, carries a grant, and completed inside the window; participant count matches composition; N=2 → Minimum and no dispersion; N≥3 → Normal; price positive; change disposition consistent; **the serialized point conforms to the public schema structurally**: only the contract's keys at the top level and in nested objects, and no constituent or lineage field (participants, member prices, seller or operator ids, raw payloads, grant ids, credentials) at any depth, at any N — the check is by field, never by value, so an aggregate that happens to equal a participant's price (two providers quoting the same rate) publishes; status Published before the deadline, Delayed after. Failures are named reasons and emit `publication_blocked`.

## 11. Read path (`read/series.ts`)

`getSeries` / `getLatestPoint` map stored regional observations plus publications to `UcpiSeriesPoint` with participants stripped; `assertSafeToExpose` refuses any point carrying `participants`, `rawPayload`, `responseBody`, `permissionGrantId`, credentials or member prices. `SqlPersistence.seriesQuery` selects only contract columns. Internal, unrouted.

## 12. Observability (`runtime/events.ts`)

Typed events: run started/finished, permission preflight failed, credentials missing, provider request started/succeeded/failed, rate limited, retrieval persisted, source excluded, observation eligible, region unavailable, minimum/normal breadth, publication succeeded/delayed/blocked, correction run, validation check. `ConsoleSink` prints one redacted JSON line; `CollectingSink` backs tests. Events carry ids, counts and codes, never headers, credentials or payloads.

## 13. Failure-mode coverage

Permission blocked · grant missing · grant expired · grant on the wrong interface · grant covering one axis · credentials missing · outside window · 401/403 not retried · 429 with Retry-After · Retry-After beyond policy · 404 not retried · 500 retried · timeouts exhausted · retry past cutoff refused · start after deadline refused · malformed JSON · Runpod and Lambda schema drift · request completing after cutoff (pipeline) · one provider fails at N=2 → Unavailable · both fail → `NO_ELIGIBLE_PARTICIPANT` · blocked source excluded despite a retrieval · duplicate response flagged · identical retrieval refused · validation-mode retrieval never becomes a run · simulation cannot publish · production run cannot use research/validation inputs · deadline exceeded → Delayed · correction run supersedes · gate rejects lineage, version, leaked price, simulation. All with mocked HTTP; the default `fetch` client is never selected in tests.

## 14. Activation migration template

`supabase/templates/provider_activation.sql.template`: asserts the intended prior two-axis state, refuses if an open-ended grant already exists, inserts the grant with reference and verbatim evidence, moves each axis only as far as the reply supports, approves production (registry CHECK refuses without both axes), optionally records a tenancy statement in interface metadata, and re-asserts invariants. Outside `supabase/migrations`, never applied as-is, no placeholder filled.

## 15. Activation state: **A — evidence blocked**

Architecture and runtime are ready. Both candidates remain blocked by external written evidence. **Exact next action**: on a provider reply, run the §9 checklist of the launch-readiness document against it; copy the template to a migration filled only with what the reply states; record the grant; move the axes it clears; approve production only if both clear; set the credential in the deployment's secret store; run `UCPI_RUN_MODE=validation` for that source; on an all-pass report, move to state B/C for that source. For Lambda, the tenancy statement is required in addition to permission, or its observations stay `TENANCY_UNRESOLVED`.
