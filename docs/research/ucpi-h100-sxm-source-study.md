# UCPI-H100-SXM Production Data Source Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. No production value, ingestion contract, schema, or collector is created by this document. Prices appear only as evidence of source structure and are never UCPI values.

This study supports the next amendment of [UCPI-H100-SXM](/docs/methodology/ucpi-h100-sxm), which merged in a launch-blocked state. Its conclusion was that the family architecture holds while the public price surface does not carry the fields the methodology requires, and it named one experiment: study provider APIs, catalogs, ordering interfaces and official documentation to find out whether those fields are recoverable elsewhere.

## Headline Result

**Path B: most blockers become resolvable, one changes character, and the constraint moves from discovery to access.**

The fields the price surfaces do not carry are, for most researched sellers, carried by APIs. Region, minimum topology, bundle composition and in several cases live capacity are all exposed in machine-readable form. The binding constraint is no longer "does this data exist" but **"can Urdais lawfully and reproducibly collect it"**, because the richest sources require provider API keys.

One finding is worth stating on its own. **A single Lambda endpoint returns price, GPU count, host bundle, and the list of regions with capacity available, in one unauthenticated-schema call requiring only an API key.** That single source addresses four of the eight launch blockers for one seller. Sources of that shape are what the ingestion contract should be built around.

## Method and Evidence Standard

Every finding below rests on a source retrieved on 13 September 2026 and named with its URL. Endpoints marked verified were called and their status codes recorded. No account was created, no authentication was bypassed, and no credentialed request was made. Where a documented endpoint requires a key, the fields are recorded from the provider's own public documentation and the access requirement is recorded as a finding rather than worked around.

Search results were used only to locate provider documentation and are never cited as evidence.

## Verified Endpoint Results

| Endpoint | Auth | Result | What it returns |
|---|---|---|---|
| `prices.azure.com/api/retail/prices` | **None** | **HTTP 200, verified** | Region-specific price per SKU, with procurement mode and effective date |
| `pricing.us-east-1.amazonaws.com/.../region_index.json` | **None** | **HTTP 200, verified** | 106 regions, each with a dated catalog version URL |
| `api.regional-table.region-services.aws.a2z.com` | **None** | **HTTP 200, verified** | Service-by-region availability table |
| `cloud.vast.ai/api/v0/bundles/` | Bearer key | **HTTP 403 unauthenticated, verified** | Per-offer listings, fields known from docs |
| `api.digitalocean.com/v2/sizes` | Bearer key | **HTTP 401, verified** | Size catalog, fields known from docs |

## Provider Source Matrix

Statuses: **YES** recoverable from a named source; **AUTH** recoverable but requires a provider API key; **PARTIAL** some but not all; **NO** not found; **UNKNOWN** not established.

| Provider | Best source | Region | Availability | Min topology | Multi-offer | Bundle | Tenancy | Access | Suitability |
|---|---|---|---|---|---|---|---|---|---|
| **Lambda** | `GET /api/v1/instance-types` | AUTH | **AUTH, capacity list** | AUTH (`specs.gpus`) | AUTH | AUTH | Docs | API key | **Strong, with conditions** |
| **Vast.ai** | `GET /api/v0/bundles/` | AUTH (`geolocation`) | **AUTH (`rentable`)** | AUTH (`num_gpus`) | **AUTH, per-offer** | AUTH | Docs | API key | **Strong, with conditions** |
| **RunPod** | GPU types + `AVAILABILITY` expansion | AUTH (`DataCenter`) | **AUTH** | AUTH (`minPodGpuCount`) | AUTH (tiers) | AUTH | Docs | API key | **Strong, with conditions** |
| **Azure** | Retail Prices API | **YES** | NO | Docs (SKU) | YES (price types) | Docs | Docs | **None** | **Strong, whole-node sibling only** |
| **AWS** | Bulk price list + regional table | **YES** | PARTIAL | Docs (SKU) | YES | YES | Docs | **None** | **Strong, whole-node sibling only** |
| **DigitalOcean** | `/v2/sizes` | AUTH | UNKNOWN | AUTH | UNKNOWN | AUTH | Docs | API key | Candidate with conditions |
| **Nebius** | Console/API catalog | UNKNOWN | UNKNOWN | UNKNOWN | PARTIAL (preempt/on-demand) | Price page | UNKNOWN | Not established | Requires follow-up |
| **Crusoe** | Cloud API | UNKNOWN | UNKNOWN | UNKNOWN | PARTIAL | NO | UNKNOWN | Not established | Requires follow-up |
| **Hyperstack** | Flavors API | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Price page | UNKNOWN | Not established | Requires follow-up |
| **CoreWeave** | Docs | Price page (US/EU) | NO | **Price page (8)** | NO | Price page | Docs | Not established | Whole-node sibling |
| **Together** | Docs | NO | NO | UNKNOWN | YES (mode tiers) | NO | Docs | Not established | Requires follow-up |
| **Voltage Park** | None | NO | NO | Page (1 or 8) | NO | NO | NO | Sales only | **Unsuitable** |
| **Modal** | Docs | NO | NO | n/a | NO | n/a | Docs | n/a | Out of scope, serverless |

Four providers are marked **Requires follow-up**: their documentation portals were opened but a specific H100-bearing catalog or pricing endpoint was not established within this study. That is a coverage limitation of this study, not evidence that no API exists.

## Field-Level Coverage

For each field the merged methodology needs, where it can be obtained across the thirteen researched sellers and venues.

| Required field | Unauth API | Auth API | Official docs | Price page | Recoverable | Principal gap |
|---|---|---|---|---|---|---|
| Native price | 2 | 4 | 2 | 9 | **Nearly all** | Quote-only sellers |
| Currency and billing unit | 2 | 4 | 3 | 9 | **Nearly all** | — |
| **Region** | **2** | **4** | several | 2 | **6 confirmed** | 4 follow-up sellers |
| **Availability / capacity** | 0 | **3** | 0 | 1 | **3 confirmed** | **The hardest field** |
| **Minimum GPU count** | 2 (SKU) | **4** | several | 2 | **6 confirmed** | 4 follow-up sellers |
| Multi-offer structure | 2 | **4** | — | 3 | **6 confirmed** | — |
| vCPU / RAM / storage | 2 | **4** | several | 6 | **Most** | — |
| Interconnect / fabric | 0 | 1 | several | 2 | **Docs-only** | Rarely machine-readable |
| Tenancy / exclusivity | 0 | 0 | most | 0 | **Docs-only** | No machine-readable field found |
| Operator identity | 0 | **1** (`host_id`) | 0 | 0 | **1** | **Effectively unrecoverable** |
| Price timestamp | **2** | 0 | 0 | 0 | **2** | Specialist clouds expose none |
| Availability timestamp | 0 | 0 | 0 | 0 | **0** | **None found anywhere** |
| Tax basis | 0 | 0 | 2 | 1 | **3** | Mostly silent |
| Mandatory fees | 0 | 0 | few | few | **PARTIAL** | — |

The two rows that did not move are **availability timestamps**, found nowhere, and **operator identity**, found only in one marketplace's per-offer host identifier.

## Provider Source Stacks

### Lambda — the reference shape

`GET /api/v1/instance-types` is documented as returning "the instance types currently offered on Lambda's public cloud, as well as details about each type. Details include resource specifications, pricing, and regional availability", with no parameters. Its documented fields are `name`, `description`, `gpu_description`, `price_cents_per_hour`, `specs` containing `vcpus`, `memory_gib`, `storage_gib` and **`gpus`**, `architecture`, and **`regions_with_capacity_available`**, an array of regions each with `name` and `description`. Authentication is by API key. No rate limit is documented.

One call therefore yields product identity, price, **minimum topology via `specs.gpus`**, the full host bundle, and **region-level capacity availability**. Expected collector count: **one endpoint**, plus product documentation for tenancy and tax.

### Vast.ai — the marketplace shape

`GET /api/v0/bundles/` accepts a JSON query such as `{"gpu_name":{"eq":"H100_SXM"}}` with operators `eq`, `neq`, `gt`, `lt`. Documented response fields include `id`, `bundle_id`, **`host_id`**, **`geolocation`**, **`num_gpus`**, `dph_total`, and GPU specifications. An unauthenticated call returned **HTTP 403, verified**, so a Bearer key is required.

This is the **only source found in the entire study that exposes an operator-level identifier**. If `host_id` is stable, the marketplace's individual offers can be attributed to distinct capacity sources, which is precisely what the merged child said was needed before marketplace listings could participate. **Whether `host_id` is stable over time was not established and is a Phase 2 prerequisite.** Expected collector count: **one endpoint**, paginated.

### RunPod

The documented catalog endpoint lists GPU types with an `AVAILABILITY` include-expansion, availability contexts of `POD`, `CLUSTER` and `SERVERLESS`, and a `gpuCount` parameter used for availability and lowest-price calculation. The public GraphQL specification exposes a `gpuTypes` query with `lowestPrice`, `maxGpuCount`, `maxGpuCountCommunityCloud`, `maxGpuCountSecureCloud`, **`minPodGpuCount`**, `nodeGroupGpuSizes`, and per-tier prices including `securePrice`, `communityPrice`, `clusterPrice`, `secureSpotPrice` and `communitySpotPrice`, alongside `DataCenter` and `DataCenterRegion` types. Authentication is by API key.

`minPodGpuCount` is a direct minimum-topology field, and the tier prices are a **genuine multi-offer structure within one seller**, which is what the seller-reduction experiment needs.

### Azure — verified unauthenticated

The Retail Prices API returned **HTTP 200 without authentication**. For the H100 SKU family it returns, per record: `armSkuName` such as `Standard_ND96isr_H100_v5`, **`armRegionName`**, `retailPrice`, `unitOfMeasure` of `1 Hour`, `meterName`, `productName` distinguishing Linux from Windows, `currencyCode`, **`effectiveStartDate`**, and `type` distinguishing `Consumption` from spot and low-priority meters.

This is the **best-structured price source found**: region-resolved, procurement-mode-resolved, and carrying a price effective date, with no authentication. Its limitation for this child is topology, since the SKU is a whole eight-accelerator node, so it belongs to a whole-node sibling rather than to the per-accelerator child.

### AWS — verified unauthenticated

The bulk price list `region_index.json` returned **HTTP 200** listing **106 regions**, each pointing at a **dated version URL** such as `/offers/v1.0/aws/AmazonEC2/20260910195514/us-east-1/index.json`. That dated path is a **catalog version identifier**, which is the closest thing to a reference-data effective date found in the study. The regional services table also returned HTTP 200. Like Azure, AWS H100 capacity is sold as whole eight-accelerator instances.

## Launch-Blocker Resolution Matrix

| Blocker | Prior state | New source evidence | Classification | Coverage | Phase 2 decision needed |
|---|---|---|---|---|---|
| **Region** | Unresolved from price pages | Azure `armRegionName` (unauth), AWS 106-region index (unauth), Lambda `regions_with_capacity_available`, Vast `geolocation`, RunPod `DataCenter` | **PARTIALLY RESOLVABLE** | 6 of 13 confirmed | Canonical taxonomy and mapping rules |
| **Availability** | Unresolved, 1 of 11 venues | Lambda capacity-by-region list, Vast `rentable` per offer, RunPod `AVAILABILITY` expansion | **REQUIRES OPERATIONAL ACCESS** | 3 confirmed, all API-key | Evidence grade scale and minimum |
| **Minimum topology** | Unclassifiable for 4 of 9 | Lambda `specs.gpus`, RunPod `minPodGpuCount`, Vast `num_gpus`, hyperscaler SKUs | **PARTIALLY RESOLVABLE** | 6 of 13 confirmed | None; rule already exists |
| **Seller reduction** | Untested, no comparable cell | RunPod tier prices, Lambda size variants, Vast multiple host offers per region | **PARTIALLY RESOLVABLE** | 3 sellers can yield real cells | **Yes**, the rule itself |
| **Bundle envelope** | Unresolved, 40% undisclosed | Lambda `specs`, Azure and AWS SKU definitions, RunPod specs | **PARTIALLY RESOLVABLE** | Most sellers | **Yes**, the envelope |
| **Operator attribution** | 0%, undetermined 100% | Vast `host_id` only | **NOT RECOVERABLE FROM DISCOVERED SOURCES** | 1 of 13 | **Yes**, whether to require it |
| **Freshness** | Unresolved | Azure `effectiveStartDate`, AWS dated catalog version; **no availability timestamp anywhere** | **PARTIALLY RESOLVABLE** | 2 for price, 0 for availability | **Yes**, all limits |
| **Tax basis** | Mostly silent | One explicit exclusive-of-tax statement; provider terms not systematically audited | **METHODOLOGY DECISION STILL REQUIRED** | 3 of 13 | **Yes**, disqualification rule |

## Source Joins

No single source produces a complete candidate observation for most providers. The joins that will be required:

- **Lambda**: single endpoint, no join. The reference case.
- **Vast.ai**: offers endpoint alone carries price, region, GPU count, availability and host identity; a join to host reference data may be needed if host identity must be resolved beyond `host_id`.
- **RunPod**: GPU-type catalog joined to the availability expansion, on GPU type identifier and `gpuCount`.
- **Azure**: Retail Prices joined to VM SKU specifications for bundle and topology, on `armSkuName`; joined to a region reference for canonical mapping, on `armRegionName`.
- **AWS**: region index joined to per-region offer file joined to instance-type specifications, on region code and instance type.

Candidate join keys observed: `instance_type` / `name`, `armSkuName`, `armRegionName`, `host_id`, `bundle_id`, GPU type identifier, and region code.

## Identifier Stability

| Identifier | Provider | Classification |
|---|---|---|
| `armSkuName`, `armRegionName` | Azure | **Stable documented** |
| Instance type and region code | AWS | **Stable documented** |
| Instance type `name` | Lambda | **Likely stable** |
| GPU type identifier | RunPod | **Likely stable** |
| `host_id` | Vast.ai | **Unknown, and it matters most** |
| `bundle_id`, offer `id` | Vast.ai | **Likely ephemeral** |

`host_id` stability is the single most consequential unknown in this study, because operator attribution for the only source that exposes it depends on it.

## Source Dynamics

Characterized, not scheduled. Phase 2 owns freshness policy.

- **Static-ish**: hardware identity, SKU definitions, region reference data, bundle definitions.
- **Slow-changing**: published prices on specialist clouds and hyperscaler retail price meters, which carry effective dates measured in months.
- **Fast-changing**: marketplace per-offer prices and `rentable` state.
- **Event-driven**: none found. No provider exposes an availability event stream.

## Failure Modes

Recorded for future collector design, not implemented: authentication failure and key rotation; rate limiting, undocumented for most providers; endpoint unavailability; schema change, a real risk for GraphQL catalogs; SKU or instance type disappearing between polls; null or absent price for quote-only products; region present with zero capacity; marketplace offer withdrawn between observation and use; and pagination truncation on large offer sets.

## Candidate Required Raw Fields

Conceptual only. No schema, types, or migrations. The purpose is to expose whether any methodology requirement has no observable counterpart.

`source_id`, `provider_id`, `seller_id`, `operator_id` (nullable, observed for one venue), `marketplace_id` (nullable), `provider_offer_id`, `provider_sku`, `observed_at`, `source_effective_at` (nullable, observed for two providers), `native_price`, `native_currency`, `billing_unit`, `gpu_model`, `gpu_form_factor`, `gpu_memory`, `gpu_count`, `minimum_gpu_count`, `region_native`, `availability_state_raw`, `capacity_raw` (nullable), `procurement_mode_raw`, `preemptibility`, `tenancy_raw`, `vcpu`, `ram`, `storage`, `network`, `tax_basis`, `mandatory_fee_components`, `raw_source_reference`.

**Two methodology requirements have no reliable observable counterpart.** `availability_observed_at` has no source anywhere in the study, so availability freshness cannot be measured directly and must be inferred from collection time. `operator_id` is observable for one venue only, so capacity-source collapse will fall back to seller identity for essentially the whole market.

## Access and Licensing Constraints

Classification of what providers themselves state, not legal conclusions.

- **Appears operationally usable without agreement**: Azure Retail Prices, AWS bulk price list and regional services table. Both are published as public pricing interfaces.
- **Requires an account and API agreement**: Lambda, Vast.ai, RunPod, DigitalOcean. Each documents API-key authentication, and each provider's API terms must be reviewed before production collection.
- **Unclear**: Nebius, Crusoe, Hyperstack, CoreWeave, Together, pending the follow-up study.
- **Unsuitable**: Voltage Park, which publishes no price through any interface.

**The operational prerequisite for Phase 2 is provider API access.** Three of the richest sources require keys, and without them availability remains unmeasurable for the specialist-cloud segment that forms the child's selected population.

## Potential Parent Issues

**None.** Nothing in the source evidence contradicts the UCPI family methodology. The family's separation of source quality from observation type, its capacity-source definition with seller fallback, and its requirement that availability be evidenced rather than assumed all survive contact with real interfaces. The parent was not modified.

## Recommended Phase 2 Decisions

Labelled as **Phase 2 methodology decisions**; none is made here.

1. **Region taxonomy**, now constructible from Azure region codes, AWS region codes, Lambda region names and Vast geolocation.
2. **Availability evidence grades**, which should be drawn from what providers actually expose: a region-level capacity list, a per-offer boolean, a contextual availability expansion, and absence.
3. **Whether an API key is a precondition of eligibility**, which is the real question behind the availability blocker.
4. **Seller-reduction rule**, now testable on RunPod tiers, Lambda size variants and Vast per-host offers.
5. **Bundle envelope**, now constructible from machine-readable specs for most sellers.
6. **Whether operator attribution can be required at all**, given one source in thirteen.
7. **Availability freshness in the absence of any source timestamp**, which must rest on collection time and a documented staleness assumption.
8. **Whether to add a whole-node sibling series**, which Azure and AWS would support well and which the per-accelerator child cannot absorb.

## Open Questions

Whether Vast `host_id` is stable over time. Whether the four follow-up providers expose H100-bearing catalog endpoints. Whether any provider documents rate limits. Whether provider API terms permit retention and redistribution of collected observations. Whether historical price reconstruction is possible from the AWS dated catalog versions, which is the only archival structure found.

## Sources and Evidence

All retrieved 13 September 2026. Primary provider documentation and endpoints only.

**Verified by direct call**: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), HTTP 200 unauthenticated, returning the ND96isr H100 v5 SKU with region, price, meter type and effective date. [AWS EC2 bulk price list region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json), HTTP 200, 106 regions with dated version URLs. [AWS regional services table](https://api.regional-table.region-services.aws.a2z.com/), HTTP 200. [Vast.ai bundles search](https://cloud.vast.ai/api/v0/bundles/), HTTP 403 unauthenticated, confirming the documented key requirement. [DigitalOcean sizes](https://api.digitalocean.com/v2/sizes), HTTP 401, confirming authentication.

**Documentation read**: [Lambda Cloud API](https://docs.lambda.ai/api/cloud), for the instance-types endpoint, its full response schema including `regions_with_capacity_available` and `specs.gpus`, and its API-key authentication. [Vast.ai search offers reference](https://docs.vast.ai/api-reference/search/search-offers), for query operators and response fields including `host_id`, `geolocation` and `num_gpus`. [Vast.ai developer overview](https://vast.ai/developers/api), for the authentication requirement. [RunPod list GPU types](https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types), for the `AVAILABILITY` expansion, availability contexts and `gpuCount` parameter. [RunPod GraphQL specification](https://graphql-spec.runpod.io/), for `gpuTypes` fields including `minPodGpuCount` and per-tier prices. [Azure Retail Prices overview](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), for filter parameters and the unauthenticated design.

**Opened without establishing an H100-bearing endpoint**: Nebius, Crusoe, Hyperstack and CoreWeave documentation portals. Recorded as a coverage limitation of this study.

## Research History

**13 September 2026**: initial source study following the merged UCPI-H100-SXM child specification. Conclusion Path B: most blockers become partially resolvable, availability moves from unrecoverable to operationally gated, operator attribution remains unrecoverable, and no availability timestamp exists anywhere in the researched market.
