# Runpod Launch-Readiness Evidence

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026 from Runpod's public documentation, public API references and public price surface, read on that date. No authenticated request was made, no account was created, and nothing here changes Runpod's permission classification, which remains `not_permitted` on both axes and `production_blocked`. **Superseded as a launch path on 14 September 2026: Runpod refused both permissions, so none of the evidence below can be acted on.** It is retained as provenance for how the source was assessed, not as a route to production. See `runpod-permission-denied.md`.

This document answers, for Runpod, the launch-readiness questions the child methodology leaves to source evidence: product match, geography, tenancy, availability, price components, and what only an authenticated call can settle.

## Product

| Question | Finding | Evidence |
|---|---|---|
| Catalog identity | GPU type id **`NVIDIA H100 80GB HBM3`**, display name **H100 SXM**, memory **80 GB** | `docs.runpod.io/references/gpu-types`, read 13 Sept 2026; the same page lists `NVIDIA H100 NVL` (94 GB) and `NVIDIA H100 PCIe` (80 GB) as distinct ids |
| Hardware identity grade | **Grade A**: the seller states SXM in the display name; 80 GB device memory stated | Same |
| Price representation | Catalog `price.secure` and `price.community`, documented as "Per-hour USD pricing for single GPU"; price surface shows **$3.49/hr Secure Cloud, $2.69/hr Community Cloud** for H100 SXM with 20 vCPU and 125 GB host RAM | `api-reference-v2/catalog/list-gpu-types`; `runpod.io/pricing`, both 13 Sept 2026 |
| Per-accelerator allocation | The price is stated for a single GPU with per-GPU host resources; the availability query takes `count` with **default 1**; `maxCount.secure`/`maxCount.community` bound the pod size; the GraphQL type carries **`minPodGpuCount`** | Catalog reference; `graphql-spec.runpod.io` |
| Value of `minPodGpuCount` for this GPU type | **Not read**: the endpoint is key-gated. The field exists and is the child's required source field; its value is established at the first authenticated call | Child rule: minimum topology from a source field, never the denominator |
| Procurement mode | The catalog price fields are the non-bid prices. The GraphQL type separates `securePrice`/`communityPrice` from `secureSpotPrice`/`communitySpotPrice`, and `LowestPrice` separates `uninterruptablePrice` from `minimumBidPrice`; the pod type enum includes `INTERRUPTABLE` | GraphQL spec. A collector must read the uninterruptable price, never a bid price |
| Preemptibility | On-demand pods are the uninterruptable product; spot pods are the interruptable one | Same |
| Service product | Pods are persistent GPU containers with an exclusively assigned GPU; Serverless is a separate product context (`product=SERVERLESS`) and is excluded | Catalog `product` parameter |

**Secure Cloud and Community Cloud are one seller and two variants.** Runpod documents Secure Cloud as "T3/T4 data centers" with "High redundancy" and Community Cloud as "Peer-to-peer providers" with "Variable" reliability, and states that "Runpod is no longer accepting new hosts for Community Cloud. Existing Community Cloud resources remain available." The buyer contracts with Runpod in both cases, so Runpod is the seller for both; the Community host is an undetermined operator and the child's seller fallback applies. The child treats reliability and data-center tier as recorded metadata, not requirements, so both variants sit in one cell and the 0.1.3 seller-reduction rule takes the lower of the two at the canonical quantity where both are available. The 30% price gap between the two variants for identical hardware is recorded as evidence that a service dimension the child currently treats as metadata does move price within one seller; whether to promote it to a requirement is a future child decision, not a launch blocker.

## Geography

The canonical region is the country. Runpod's datacenter object carries `id`, `name`, and a **continental** `region` enum (`NORTH_AMERICA`, `EUROPE`, …), and **no country field**. Two first-party routes establish the country:

- The GPU-types endpoint accepts **`countryCodes`**, documented as "Comma-separated ISO 3166-1 alpha-2 country codes, uppercase, to constrain availability to". A response filtered to one country lists exactly the datacenters Runpod itself places in that country.
- The GraphQL `LowestPrice` type carries a **`countryCode`** field.

The mapping rule for this source is therefore: **a datacenter identifier maps to the country under which Runpod returns it when filtered by `countryCodes`, or which Runpod states in `countryCode`; the two-letter prefix of the identifier is never used.** This satisfies the child's mapping contract (native identifier, provider, geographic evidence, canonical target, confidence, effective interval) with the filtered retrieval as the evidence record, and it is deterministic. It requires an authenticated call.

What public documentation establishes today:

| Identifier | Name | Country | Evidence | Confidence | Production-usable |
|---|---|---|---|---|---|
| `US-KS-2` | "US Kansas 2" | US | API reference example response; the name names a US state | High | Yes, once confirmed by the country filter |
| `US-GA-1` | (United States) | US | `runpodctl datacenter` reference example | High | Yes, once confirmed |
| `EU-RO-1` | (Europe) | **not established** | CLI example gives only the continent | — | No: the identifier's spelling is not evidence |
| all others | — | — | Key-gated | — | Established at first authenticated call |

Runpod therefore has **at least one evidenced country, the United States**, before any authenticated access, and the full mapping is a first-collection task with a first-party evidence route.

## Tenancy

**Classification: Documented.**

Runpod's official documentation states, of Pods generally: *"When you deploy a Pod, it's assigned to a GPU on a specific physical machine. This creates a link between your Pod and that particular piece of hardware. As long as your Pod is running, that GPU is exclusively reserved for you. When you stop your Pod, you release that specific GPU, allowing other users to rent it."* (`docs.runpod.io/references/faq`, page titled "Zero GPU Pods on restart", read 13 September 2026.)

This is a statement in product documentation, not marketing, that a running Pod holds one specific physical GPU exclusively. It is not a per-offer seller statement, so the grade is Documented rather than Explicit, exactly as the marketplace's Concepts page was graded at 0.1.1. It covers Pods on both clouds, since the statement is made of Pods without qualification. Nothing in Runpod's documentation describes a partitioned, time-shared or virtualized-fraction H100 pod product, and the 80 GB device memory in the catalog is the full device.

## Availability

**Grade 3, satisfied.** The catalog endpoint with `include=AVAILABILITY&product=POD&count=1&cloud=SECURE|COMMUNITY` returns, per GPU type, an overall `availability` and a `dataCenters[]` array each with `id`, `name` and `availability` in **`NONE`, `LOW`, `MEDIUM`, `HIGH`**. The signal is discriminating: `NONE` expresses absence. It is product-specific (`product` is required with the expansion), quantity-conditional (`count`, default 1, which is the child's minimum topology), and tier-conditional (`cloud`, upstream default `SECURE`), so **the collector must query once per cloud tier** and record `count=1` as the quantity at which availability was established.

Under the child's raw-to-canonical mapping for an ordinal scale: `HIGH` and `MEDIUM` map to **Available**, `LOW` to **Limited**, `NONE` to **Sold out**, all at Grade 3, per datacenter and therefore per country after mapping. The `cudaVersions[].available` boolean is retained as metadata.

## Price components and bundle

| Item | Finding | Treatment |
|---|---|---|
| GPU rate | $3.49 Secure / $2.69 Community per GPU-hour for H100 SXM, 13 Sept 2026 | The observation, per variant |
| Billing granularity | "Pods are billed by the second for compute and storage" (pricing docs); "Pods are billed by the minute" (overview) | Inconsistent in Runpod's own docs; either is a unit conversion within the product. Recorded |
| Container disk | $0.10/GB/month while running, billed per second, separately from the GPU rate; size set by the buyer; minimum not documented | **Outside the price** under the 0.1.3 rule for buyer-sized separately billed storage; the undocumented minimum is recorded in the fee interpretation. Materiality bound: 20 GB is about $0.0027/hr, under 0.1% of the GPU rate |
| Volume disk, network volume | Optional, separately billed | Outside |
| Data transfer | "no fees for data ingress or egress" | None |
| Platform fee | None found | None |
| Credit prerequisite | "You must have at least one hour's worth of credits for your selected configuration to deploy an on-demand instance" | Commercial constraint, recorded as minimum spend; not a charge |
| Tax basis | Terms of Service: *"Fees do not include any Sales Tax that may be due in connection with the Service provided under this Agreement."* | **Exclusive**, established by general terms |
| Host bundle | 20 vCPU, 125 GB host RAM per H100 SXM GPU (price surface) | 125 GB ≥ 80 GB floor: **within the envelope** |

## What only an authenticated call can settle

1. The value of `minPodGpuCount` for `NVIDIA H100 80GB HBM3` (expected 1 from the single-GPU price presentation; not assumed).
2. The full datacenter list and each identifier's country via `countryCodes`.
3. Current availability per datacenter and per cloud tier at `count=1`.
4. Whether the catalog `price` fields equal the GraphQL `uninterruptablePrice` for this type, confirming the non-bid reading.
5. The undocumented minimum container-disk size, if any.

None of these is a methodology question. Each is a first-collection verification recorded against the retrieval that establishes it.

## Permission, unchanged

`terms_review_state = not_permitted`, `data_use_terms_state = not_permitted`, `production_access_state = production_blocked`, `written_agreement_required = true`. A clarification request is pending. Nothing in this document is a basis for collection, and the collector described in the launch-readiness matrix is not built until both axes are `permitted`.
