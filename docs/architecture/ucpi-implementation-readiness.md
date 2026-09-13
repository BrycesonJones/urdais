# UCPI Implementation Readiness

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. Records the implementation-readiness slice: the merged PR #43 migration applied to UrdaisDev, the three schema gaps closed, the publication layer, the collector abstraction with Runpod and Lambda adapter skeletons, the executable eligibility and calculation engine, the production-permission gate, and the fixture-based end-to-end simulation. **No live provider request was made, no key was added, no production observation exists, no UCPI value was published, and no permission classification changed.**

## 0. Synchronization

| Check | Result |
|---|---|
| `main` at PR #43 merge | `43e3c5e`; parent 0.1.2-draft, child 0.1.4-draft |
| `20260913130000_calculation_calendar_versions` | Absent from hosted history and both version rows absent; **applied exactly once**; version string aligned |
| Version rows | `ucpi 0.1.2-draft` = `1aec0c9a…`, `UCPI-H100-SXM 0.1.4-draft` = `0a468166…` (parent `0.1.2-draft`), both matching merged documents; all earlier rows intact |
| Parity | Fingerprint identical on all eight components before this slice's migrations (263 columns, 172 constraints, 61 indexes, 9 triggers, 4 functions, 21 RLS tables, 0 policies, 21 privilege rows) |
| Guards | 0 production-approved; 0 permitted on both axes; instrument `launch_blocked`; 0 observations; six classifications unchanged; SQL tests 11/11 |

The two migrations added by this slice are not yet applied to UrdaisDev; that is the post-merge step.

## 1. The pipeline, as code

```
Provider API -> Retrieval -> Raw Offer -> Normalized Observation -> Eligibility (P0/P1/P2)
             -> Seller Reduction -> Capacity-Source Collapse -> Regional Calculation -> Series Point
```

| Stage | Module | Persists to |
|---|---|---|
| Request, parse, normalize | `src/lib/ucpi/collector.ts` (`ProviderAdapter`), `adapters/runpod.ts`, `adapters/lambda.ts` | `source_retrievals`, `raw_offers`, `normalized_observations` |
| Eligibility with named reasons | `eligibility.ts` | `eligibility_assessments`, `_exclusions`, `_diagnostics` |
| Seller reduction (canonical quantity, then minimum) | `aggregation.ts` `reduceSellers` | `seller_observations`, `seller_observation_candidates` |
| Capacity-source collapse (operator, common control, seller) | `aggregation.ts` `collapseCapacitySources` | `capacity_source_observations`, `capacity_source_members` |
| Regional median, breadth, dispersion, shares, change | `aggregation.ts` `calculateRegion` | `regional_observations`, `regional_observation_participants` |
| Calendar and publication timing | `calculation-window.ts` | `calculation_runs`, `regional_publications` |
| Permission gate | `permission-gate.ts`, `collector.ts` `authorizeProductionRequest` | `permission_grants`, `source_retrievals.retrieval_purpose`, trigger |
| Series response shape | `api-contract.ts` `UcpiSeriesPoint` | not routed |

An adapter never decides eligibility, never aggregates and never publishes. Everything after normalization is provider-neutral. The domain types in `domain.ts` mirror the schema column for column so persistence is a mapping.

## 2. Schema changes

**Gap A, legal identity** (`reference.market_entities`): `legal_name text`, `legal_identifier text` (requires `legal_name`), `controlling_entity_id uuid` self-reference (not self). A market entity row *is* the legal entity; brands, tiers and native identifiers map onto it through `native_identifiers`. Common control between two distinct legal entities is the single pointer, recorded only on evidence, never inferred from prices, and it drives collapse (`attribution_status = 'common_control'`). Deliberately not an ownership graph.

**Gap B, service tier**: `raw_offers.native_service_tier text` and `native_service_fields jsonb` keep the source's own label and fields verbatim; `normalized_observations.service_tier jsonb` (must be an object) carries the family's dimensions with documented keys: `tier_label`, `operator_class`, `interruption_policy`, `uptime_commitment`, `provisioning_model`, `support_commitment`, `intra_node_interconnect`, `inter_node_fabric`, `storage_included_gb`, `compliance`. `tier_label` is the variant the seller-reduction rule uses; the rest are metadata, as the child requires.

**Gap C, permission reference**: `reference.permission_grants` (source interface, `grant_kind` ∈ provider_terms | written_permission | agreement | order, `reference`, `covers_collection`, `covers_index_use`, effective interval, `evidence`, optional evidence retrieval). `source_retrievals.permission_grant_id` and `retrieval_purpose` ∈ research | production. **Database gate**: a production retrieval must carry a grant (CHECK), the grant must belong to the same interface and be in force at request time (trigger), and the interface must be `production_approved` (trigger), which the registry already conditions on both axes. Recording a grant approves nothing.

**Publication layer** (`pipeline.*`): `calculation_runs` (window/cutoff/deadline checked as the UTC day; `run_kind` production | simulation | correction), `seller_observations` + `seller_observation_candidates`, `capacity_source_observations` + `capacity_source_members`, `regional_observations` (outcome value | unavailable; constraints enforce N≤1 → no price + named condition, N=2 → Minimum + dispersion withheld, N≥3 → Normal; one current row per instrument/country/date; supersession only), `regional_observation_participants`, `regional_publications` (status checked against the deadline; simulations never publishable). Append-only everywhere; `service_role` cannot update or delete evidence rows.

**Contract mapping**: every field of the collector contract (§10 of the launch-readiness document) now has a typed home; no further launch-blocking gap was found. Two items are future enhancements, not blockers: a typed `native_identifiers` link from raw offers to entity ids at normalization (today the adapter resolves the seller through the context), and per-participant availability composition on the regional row (today the shares are stored as four numeric diagnostics).

## 3. Adapters

**Runpod** (`runpod-gpu-types`): `buildRequest` produces `GET {base}/v2/catalog/gpus?include=AVAILABILITY&product=POD&count=1&cloud=…&countryCodes=…` with `Authorization` named as a required header and no value; the REST host is configured, not assumed. `parse` emits one raw offer per GPU type per datacenter for the requested cloud, keeping the payload. A companion record from the GraphQL `gpuTypes` query supplies `minPodGpuCount` and the per-cloud bundle the catalog omits. `normalize`: `NVIDIA H100 80GB HBM3` / "H100 SXM" → Grade A; tenancy Documented on the quoted statement; `HIGH`/`MEDIUM` → Available, `LOW` → Limited, `NONE` → Sold out, Grade 3 at `count=1`; country from the request's `countryCodes` filter or a recorded mapping, never the identifier prefix; Secure and Community are one seller with `tier_label` variants; tax exclusive; storage outside the price.

**Lambda** (`lambda-instance-types`): `GET {base}/api/v1/instance-types`. `parse` emits one raw offer per instance type per known region, expressing absence from `regions_with_capacity_available` as Sold out. `normalize`: "1x H100 (80 GB SXM5)" → Grade A; per-accelerator price = instance price ÷ `specs.gpus`; minimum topology from the smallest H100 SXM5 type's `specs.gpus`; country from the 14-region mapping; root volume included; tax exclusive. **Tenancy is Ambiguous unless the normalization context carries a statement from Lambda**, so the pipeline visibly excludes a valid-looking Lambda observation with `TENANCY_UNRESOLVED` today.

## 4. Permission gate

`productionCollectionPermitted(state)` is true only when `terms_review_state = permitted`, `data_use_terms_state = permitted` and `production_access_state = production_approved`. `describeCapability` reports adapter existence, technical support and production permission as three separate booleans; for Runpod and Lambda today the first two are true and the third is false. `authorizeProductionRequest` returns a request only after the gate passes. The database enforces the same rule independently. Tests prove all of it against the registry snapshot.

## 5. Fixture-based end-to-end outcomes

| Scenario | Setup | Outcome |
|---|---|---|
| 0 | Registry as recorded today | Every observation `COLLECTION_NOT_PERMITTED`; no region computed |
| A | Runpod eligible (hypothetically permitted), Lambda tenancy unresolved | Lambda excluded `TENANCY_UNRESOLVED`; N=1; **Unavailable**, `SINGLE_PARTICIPANT` |
| B | Runpod eligible + synthetic Lambda tenancy Documented | Runpod 1× min of Secure/Community; Lambda 1× over 2×/4×/8×; N=2; **Published, Minimum**, midpoint; dispersion withheld; series point carries no participant price or provider name |
| C | Lambda availability re-observed yesterday | `AVAILABILITY_STALE`; N=1; Unavailable |
| D | Both fresh, Runpod permission-blocked | Runpod `COLLECTION_NOT_PERMITTED`; N=1; Unavailable |
| E | Three synthetic independent sellers | **Normal** breadth; median is the middle seller; moving the extreme does not move it |
| F | Two interfaces exposing one legal seller | One seller observation over both interfaces; one participant; Unavailable |
| G | Retrieval completed at the cutoff instant | Belongs to the next date; excluded before eligibility |
| H | One source unreachable all day | Its participant absent; N=1; Unavailable |

## 6. What remains after acceptable permission and tenancy replies

1. Record each permission as a `permission_grants` row with its evidence; move each interface to `permitted`/`permitted`/`production_approved` in the registry by migration, with the written evidence.
2. Seed the two market entities (legal identity) and the region mappings for the datacenters actually returned, with the country-filtered retrieval as evidence.
3. A runtime that performs the request: credentials from the environment, retry inside the window, persistence of retrieval, raw offers and normalized observations. The adapters and gate are ready for it.
4. First authenticated validation: Runpod `minPodGpuCount` and bundle values, its datacenter list per country, live availability at 1×; Lambda live `regions_with_capacity_available` for the 1× type and its price; confirmation that the catalog `price` fields are the non-bid prices.
5. A calculation job at the cutoff writing `calculation_runs` and the publication rows, and a publication step. Not scheduled here.
6. Lambda tenancy evidence recorded as `observation_evidence` role `tenancy`, if the reply supplies it.

None of these is architecture. Each is data, credentials, or a job.
