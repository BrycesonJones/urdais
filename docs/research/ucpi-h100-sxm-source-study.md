# UCPI-H100-SXM Production Data Source Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. No production value, ingestion contract, schema, or collector is created by this document. Prices appear only as evidence of source structure and are never UCPI values.

This study supports the next amendment of [UCPI-H100-SXM](/docs/methodology/ucpi-h100-sxm), which merged in a launch-blocked state. Its conclusion was that the family architecture holds while the public price surface does not carry the fields the methodology requires, and it named one experiment: study provider APIs, catalogs, ordering interfaces and official documentation to find out whether those fields are recoverable elsewhere.

## Headline Result

**Path B: most blockers become resolvable, and the binding constraint moves from discovery to access.**

The fields the price surfaces do not carry are, for most researched sellers, carried by APIs. Region, minimum topology, bundle composition and in several cases live capacity are all exposed in machine-readable form. The question is no longer "does this data exist" but **"can Urdais lawfully and reproducibly collect it"**, because the richest sources are gated by provider API keys or by undocumented rate limiting.

Two findings are worth stating on their own.

**One Lambda endpoint returns price, GPU count, host bundle, and the list of regions with capacity available.** `GET /api/v1/instance-types` addresses four of the eight launch blockers for one seller in a single call. Sources of that shape are what the ingestion contract should be built around.

**One marketplace endpoint exposes, per offer, the field structure the methodology needs.** An unauthenticated page of 64 Vast.ai offers carries `rentable`, `host_id`, `machine_id`, `geolocation` and `num_gpus` on every record, which means availability, participant identity, region and topology are all structurally present at offer level rather than absent.

**That sample is source-structure evidence only, not H100 evidence.** The request was unfiltered, so the 64 rows are a mixed and mostly consumer-grade population: 13 RTX 5090, 11 Tesla V100, and **2 H100 SXM**. No H100-specific rate, gap or distribution can be computed from it, and none is claimed below.

## Method and Evidence Standard

Every finding below rests on a source retrieved on 13 September 2026 and named with its URL. Endpoints marked verified were called and their status codes recorded. No account was created, no authentication was bypassed, and no credentialed request was made. Where a documented endpoint requires a key, the fields are recorded from the provider's own public documentation and the access requirement is recorded as a finding rather than worked around.

Search results were used only to locate provider documentation and are never cited as evidence.

## Verified Endpoint Results

| Endpoint | Auth | Result | What it returns |
|---|---|---|---|
| `prices.azure.com/api/retail/prices` | **None** | **HTTP 200, verified** | Region-specific price per SKU, with procurement mode and effective date |
| `pricing.us-east-1.amazonaws.com/.../region_index.json` | **None** | **HTTP 200, verified** | 106 regions, each with a dated catalog version URL |
| `api.regional-table.region-services.aws.a2z.com` | **None** | **HTTP 200, verified** | Service-by-region availability table |
| `cloud.vast.ai/api/v0/bundles/` | Docs say key; **plain GET succeeded** | **HTTP 200 unauthenticated, verified**, then 403 on repeated filtered calls | **64 per-offer records with the full field set, read directly** |
| `api.digitalocean.com/v2/sizes` | Bearer key | **HTTP 401, verified** | Size catalog, fields known from docs |

## Counting Convention

One convention is used for every count in this document, including the matrices, the blocker table and the summary.

**The denominator is always the 13 researched sellers and venues.** A field is counted as *recoverable* when a named source exposes it, and the source tier is reported separately rather than folded into the count. The tiers are: **unauthenticated** and verified by call; **key-gated**, documented but requiring a provider API key; **documentation**, established from official product or SKU documentation; and **price surface**, present only on a public pricing page. "Unknown" means no source was established for that provider within this study, which is a coverage limitation rather than evidence of absence.

## Provider Source Matrix

Statuses: **YES** recoverable from a named source; **AUTH** recoverable but requires a provider API key; **PARTIAL** some but not all; **NO** not found; **UNKNOWN** not established.

| Provider | Best source | Region | Availability | Min topology | Multi-offer | Bundle | Tenancy | Access | Suitability |
|---|---|---|---|---|---|---|---|---|---|
| **Lambda** | `GET /api/v1/instance-types` | AUTH | **AUTH, capacity list** | AUTH (`specs.gpus`) | AUTH | AUTH | Docs | API key | **Strong, with conditions** |
| **Vast.ai** | `GET /api/v0/bundles/` | **YES (`geolocation`)** | **YES (`rentable`)** | **YES (`num_gpus`)** | **YES, structure per offer** | YES | Docs | Inconsistent, see below | **Richest field structure found** |
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
| **Region** | 2 unauth + 1 verified | 3 key-gated | several | 1 price surface | **7 of 13** | 4 unknown, 2 none/out of scope |
| **Availability / capacity** | 1 verified | 3 key-gated | 0 | 0 | **4 of 13** | Still the hardest field |
| **Minimum GPU count** | 2 unauth + 1 verified | 3 key-gated | 2 via SKU | 1 price surface | **7 of 13** | 4 unknown, 2 none/out of scope |
| Multi-offer structure | 1 verified | 3 key-gated | — | 2 price surface | **6 of 13** | Structure only; no H100 cell sampled |
| vCPU / RAM / storage | 2 | **4** | several | 6 | **Most** | — |
| Interconnect / fabric | 0 | 1 | several | 2 | **Docs-only** | Rarely machine-readable |
| Tenancy / exclusivity | 0 | 0 | most | 0 | **Docs-only** | No machine-readable field found |
| Host / seller identifier | 1 verified (`host_id`) | 0 | 0 | 0 | **1 of 13** | Marketplace only |
| **Operator identity** | 0 | 0 | 0 | 0 | **0 of 13** | **No direct operator evidence found anywhere** |
| Price timestamp | **2** | 0 | 0 | 0 | **2** | Specialist clouds expose none |
| Availability timestamp | **1, partial** | 0 | 0 | 0 | **1, semantics unverified** | No price-effective or availability-change timestamp found for any other seller |
| Tax basis | 0 | 0 | 2 | 1 | **3** | Mostly silent |
| Mandatory fees | 0 | 0 | few | few | **PARTIAL** | — |

Two rows did not move. **Operator identity** was found nowhere: the one identifier discovered is a marketplace host identifier, which is not the same thing, for the reasons in the next section. **Availability timestamps** remain absent for every seller except the one marketplace, which carries `start_date`, `end_date` and `duration` fields whose semantics were not verified.

## Provider Source Stacks

### Lambda — the reference shape

`GET /api/v1/instance-types` is documented as returning "the instance types currently offered on Lambda's public cloud, as well as details about each type. Details include resource specifications, pricing, and regional availability", with no parameters. Its documented fields are `name`, `description`, `gpu_description`, `price_cents_per_hour`, `specs` containing `vcpus`, `memory_gib`, `storage_gib` and **`gpus`**, `architecture`, and **`regions_with_capacity_available`**, an array of regions each with `name` and `description`. Authentication is by API key. No rate limit is documented.

One call therefore yields product identity, price, **minimum topology via `specs.gpus`**, the full host bundle, and **region-level capacity availability**. Expected collector count: **one endpoint**, plus product documentation for tenancy and tax.

### Vast.ai — the richest source found, with an access caveat

**Correction during this study.** An initial filtered request returned HTTP 403 and was first recorded as an authentication requirement. That was a query-syntax error on my part, not authentication. **A plain unauthenticated `GET /api/v0/bundles/` returned HTTP 200 with 64 per-offer records**, which were read directly. The provider's documentation nonetheless states that requests require a Bearer key, and repeated filtered calls afterwards returned HTTP 403, which is consistent with undocumented rate limiting or edge filtering rather than with authentication. **Production use should assume the documented key requirement and treat unauthenticated access as unreliable.** No further requests were made after this was established.

Fields verified present on every record, by reading the response rather than the documentation: `id`, `bundle_id`, `machine_id`, **`host_id`**, **`geolocation`** and `geolocode`, **`num_gpus`**, `gpu_name`, `gpu_total_ram`, `dph_total`, `min_bid`, **`rentable`** and `rented`, `reliability2`, `start_date`, `end_date`, `duration`, `cpu_cores`, `cpu_ram`, `disk_bw`, `bw_nvlink`, `static_ip`, `cluster_id`.

### What this sample does and does not establish

**The request was unfiltered, so the sample is not an H100 sample.** Of the 64 rows, 13 were RTX 5090, 11 Tesla V100, and the rest a spread of consumer and workstation cards. **Exactly 2 rows were H100 SXM**, plus 1 H100 NVL which this child excludes.

**It establishes source structure**, which is what was being tested:

- **Availability is present at offer level.** Every record carries a boolean `rentable` and a separate `rented`. Across the mixed population 9 were rentable and 55 were not. **That ratio describes a mostly consumer-grade population and is not an H100 figure**; it is reported only to show that the field is populated and discriminating rather than always true.
- **The data shape supports multi-offer cells.** The 64 rows came from 41 distinct `host_id` values, and one host published 6 rows. **No H100 comparable cell was sampled**: the two H100 SXM rows share a single `host_id` and a single `machine_id`, differing only in `num_gpus` of 1 and 2 at $1.4689 and $2.9356, which is one machine partitioned linearly rather than competing offers.
- **A stable-looking participant identifier exists.** `host_id` and `machine_id` are present on every record.

Expected collector count: **one endpoint**, paginated, with rate-limit handling. An H100-filtered sample across multiple pages is a Phase 2 prerequisite before any H100 rate is computed.

### `host_id` is a host identifier, not operator identity

The parent defines the capacity source as **the infrastructure operator where reliably determinable, and the seller otherwise**. `host_id` identifies the party that listed the offer on the marketplace and set its price. That makes it a **marketplace host and seller identifier**, and therefore a candidate for the parent's **seller-fallback** capacity-source identity. It is **not** evidence of who owns or operates the underlying hardware, and the parent forbids inferring operator identity from configuration, geography or price similarity.

**Operator attribution therefore remains unresolved**, and this study found no direct operator evidence at any of the thirteen sellers. Two further questions are open: whether `host_id` is stable over time, which was not verified, and whether one host can list under several identifiers, which would break even the seller-fallback use.

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
| **Region** | Unresolved from price pages | Azure `armRegionName` (unauth), AWS 106-region index (unauth), Vast `geolocation` (verified), Lambda `regions_with_capacity_available`, RunPod `DataCenter`, DigitalOcean sizes (all key-gated), CoreWeave price surface | **PARTIALLY RESOLVABLE** | **7 of 13** | Canonical taxonomy and mapping rules |
| **Availability** | Unresolved, 1 of 11 venues | Vast per-offer `rentable` field verified present; Lambda capacity-by-region list; RunPod `AVAILABILITY` expansion | **PARTIALLY RESOLVABLE**; field structure confirmed, **no H100 availability rate measured** | 4 of 13, 3 key-gated | Evidence grade scale and minimum |
| **Minimum topology** | Unclassifiable for 4 of 9 | Vast `num_gpus` (verified), Lambda `specs.gpus`, RunPod `minPodGpuCount`, DigitalOcean sizes (key-gated), Azure and AWS SKU definitions, CoreWeave price surface | **PARTIALLY RESOLVABLE** | **7 of 13** | None; rule already exists |
| **Seller reduction** | Untested, no comparable cell | Vast data shape supports multiple offers per host; RunPod tier prices; Lambda size variants | **DATA STRUCTURE EXISTS; H100 EMPIRICAL TEST STILL REQUIRED** — the two H100 SXM rows sampled share one host and one machine | 3 sellers could yield cells | **Yes**, the rule itself |
| **Bundle envelope** | Unresolved, 40% undisclosed | Lambda `specs`, Azure and AWS SKU definitions, RunPod specs | **PARTIALLY RESOLVABLE** | Most sellers | **Yes**, the envelope |
| **Operator attribution** | 0%, undetermined 100% | No direct operator evidence found; Vast `host_id` is a host and seller identifier, usable only as the parent's seller fallback | **NOT RECOVERABLE**, 0 of 13 | 0 of 13 | **Yes**, whether to require it at all |
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
| `host_id`, `machine_id` | Vast.ai | **Unknown, and it matters most**; present per offer, but a host identifier rather than operator identity |
| `bundle_id`, offer `id` | Vast.ai | **Likely ephemeral** |

`host_id` stability is the single most consequential unknown in this study, because the marketplace's seller-fallback capacity-source identity would depend on it. It does not bear on operator attribution, which no source supports.

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

**Two methodology requirements have no reliable observable counterpart.** `availability_observed_at` has no source at any seller, and only the marketplace carries date fields at all, whose semantics were not verified; availability freshness will therefore rest on collection time and a documented staleness assumption. **`operator_id` has no source at all**: the one identifier found is a host and seller identifier, so capacity-source collapse falls back to seller identity across the whole market, exactly as the parent's fallback anticipates.

## Access and Licensing Constraints

Classification of what providers themselves state, not legal conclusions.

- **Appears operationally usable without agreement**: Azure Retail Prices, AWS bulk price list and regional services table, all published as public pricing interfaces.
- **Reachable unauthenticated but documented as requiring a key**: Vast.ai. The discrepancy between the documented requirement and the observed behaviour must be resolved with the provider before production collection; the safe assumption is that a key is required.
- **Requires an account and API agreement**: Lambda, RunPod, DigitalOcean. Each documents API-key authentication, and each provider's API terms must be reviewed before production collection.
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

**Verified by direct call**: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), HTTP 200 unauthenticated, returning the ND96isr H100 v5 SKU with region, price, meter type and effective date. [AWS EC2 bulk price list region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json), HTTP 200, 106 regions with dated version URLs. [AWS regional services table](https://api.regional-table.region-services.aws.a2z.com/), HTTP 200. [Vast.ai bundles search](https://cloud.vast.ai/api/v0/bundles/), **HTTP 200 unauthenticated on a plain GET returning 64 per-offer records**, read directly for the field list. The request was unfiltered, so the sample is a mixed, mostly consumer-grade population containing only 2 H100 SXM rows, and it is used as source-structure evidence only. HTTP 403 followed on subsequent filtered calls. [DigitalOcean sizes](https://api.digitalocean.com/v2/sizes), HTTP 401, confirming authentication.

**Documentation read**: [Lambda Cloud API](https://docs.lambda.ai/api/cloud), for the instance-types endpoint, its full response schema including `regions_with_capacity_available` and `specs.gpus`, and its API-key authentication. [Vast.ai search offers reference](https://docs.vast.ai/api-reference/search/search-offers), for query operators and response fields including `host_id`, `geolocation` and `num_gpus`. [Vast.ai developer overview](https://vast.ai/developers/api), for the authentication requirement. [RunPod list GPU types](https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types), for the `AVAILABILITY` expansion, availability contexts and `gpuCount` parameter. [RunPod GraphQL specification](https://graphql-spec.runpod.io/), for `gpuTypes` fields including `minPodGpuCount` and per-tier prices. [Azure Retail Prices overview](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), for filter parameters and the unauthenticated design.

**Opened without establishing an H100-bearing endpoint**: Nebius, Crusoe, Hyperstack and CoreWeave documentation portals. Recorded as a coverage limitation of this study.

## Research History

**13 September 2026**: initial source study following the merged UCPI-H100-SXM child specification. Conclusion Path B: most blockers become partially resolvable and the binding constraint moves from discovery to access.

Two findings were corrected before this study was finalized, both in the direction of claiming less.

First, a Vast.ai request initially recorded as an authentication failure was a query-syntax error on my part; a plain unauthenticated call succeeded and its records were read directly.

Second, and more importantly, the resulting 64-row sample was **unfiltered**, so it is a mixed and mostly consumer-grade population containing only 2 H100 SXM rows. It was briefly treated as H100 evidence and yielded an availability rate, a multi-offer count and an operator-identity claim. All three are withdrawn. The sample is **source-structure evidence only**: it shows that `rentable`, `host_id`, `machine_id`, `geolocation` and `num_gpus` are populated per offer, which is what was being tested, and it supports no H100-specific rate or distribution. `host_id` is reclassified as a marketplace host and seller identifier and therefore a candidate for the parent's seller fallback, not as operator identity. Seller reduction is reclassified from resolvable to **data structure exists, H100 empirical test still required**, since the two H100 SXM rows sampled share one host and one machine.

Operator attribution is unresolved with no direct evidence at any of the thirteen sellers, and no availability timestamp exists for any seller.
