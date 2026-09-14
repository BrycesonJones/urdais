# Price of Compute — Source Qualification

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026 from one retrieval of the publisher's API (`GET /api/v1/prices/h100-sxm`, `/api/v1/providers`, `/api/v1/openapi.json`, completed 2026-09-14T00:44:35Z) and its `/api`, `/methodology` and `/providers` pages. Raw responses and headers are preserved under `docs/research/price-of-compute/`.

## What the source is

A licensed, keyless market-data API redistributing **listed** GPU rental prices per provider, with per-provider daily medians and a cross-provider median per pricing type. Sixteen providers tracked; for `H100-SXM` on `2026-09-13` the payload carried 16 provider rows, 11 of them `on_demand`. The publisher's own framing: *"listed prices, not guaranteed availability"*; *"Listed ≠ attainable."* This is the family's price statistic (1), the advertised price, and it is therefore admissible to **UCPI-H100-SXM-LISTED** and not to UCPI-H100-SXM.

## Rights, verbatim

| Axis | Evidence (API page, retrieved 2026-09-14T00:44Z) | Classification |
|---|---|---|
| Collection | "Every price on this site, including full history, as JSON. Free up to 1,000 requests/day — no key below the limit, attribution required." · "1,000 requests/day free (7,000/week)." · "Don't hammer the endpoints; cache responses 1h+." | **permitted**, documented API with a stated limit |
| Data use | "Attribution. Free use requires a visible link: 'Data: Price of Compute'. That link is how a free API stays free." · footer "data free with attribution · 'Data: Price of Compute — priceofcompute.com'" · OpenAPI: "Attribution required: 'Data: Price of Compute — priceofcompute.com'." | **permitted** as a general free-use grant conditioned on visible attribution. The terms do not name indices or benchmarks; Urdais records that it is relying on the general grant, not on a narrower product-specific clause. Badges are offered "for READMEs, blogs, and dashboards." |
| Disclaimer | "Data provided as-is; listed prices, not guaranteed availability." | Recorded; the object is listed, not accessible |
| Rate limit | `x-ratelimit-limit: 1000`, `x-ratelimit-remaining: 999`, reset daily; `cache-control: public, max-age=3600` on price endpoints | Urdais cadence: one request per calculation day for the H100 SXM SKU |
| Attribution | `Data: Price of Compute — priceofcompute.com`, also carried in-band in every response | Required on every observation, record and public surface |

Permission basis recorded as `reference.permission_grants` kind `provider_terms`, covering both axes, effective 2026-09-14. The interface is `production_approved`. Runpod, Lambda and Vast direct interfaces are unchanged; the sellers behind them may appear here because this source's terms govern our use of its dataset.

## Source-quality assessment (grade 6)

The family admits a licensed specialist dataset only where its methodology is "disclosed, assessed, and recorded". Assessed from `/methodology`:

- Collection: "record GPU rental price observations from 16 providers... every hour. Wherever a provider offers an official API, we use it; otherwise we scrape public pricing pages respectfully, honoring robots.txt." Each observation stores "the provider, the canonical GPU SKU, region where known, the price, the pricing type, a timestamp, and a fragment of the raw source payload."
- Pricing types: "Spot, on-demand, community, and serverless are different products... Every number on this site belongs to exactly one type; the default everywhere is on-demand." Consistent with the family's prohibition on blending modes.
- SKU canonicalization: "SXM and PCIe variants are separate SKUs." Provider names such as `h100-sxm5` map to `H100-SXM`. Consistent with the family's identity framework; admitted as Grade C identity.
- Normalization: "Per-GPU, per-hour. Multi-GPU instance prices are divided by GPU count." **This is the one point of conflict**: the family forbids dividing a node price into a per-accelerator observation across topology classes. Urdais therefore does not accept the vendor's per-GPU figure as a per-accelerator observation unless Urdais's own evidence establishes that the seller sells in the per-accelerator class.
- Aggregation: per-provider median first, then cross-provider median; "We never interpolate, backfill, or estimate."
- Geography: region "where known" only; on the first payload four rows in sixteen, all on rows excluded for other reasons. **No statement that the dataset is US-region** was found on the methodology page; on the providers page only Azure names a region ("US East list price"). The claim that the dataset is "effectively US-region" is not evidenced by the publisher and is not relied on.

Verdict: methodology disclosed and assessable; grade 6; the vendor's own medians are not used by Urdais, only its provider-level rows.

## Field audit against the H100 child (P0–P2)

| Urdais requirement | Price of Compute evidence | Status |
|---|---|---|
| GPU model | canonical `sku: "H100-SXM"` | Documented (vendor mapping) |
| Form factor | SKU suffix `-SXM`; vendor separates SXM/PCIe/NVL | Documented |
| Memory | not in payload; H100 SXM is an 80 GB part per NVIDIA | Derivable |
| Per-GPU price | `usd_per_gpu_hr` | Explicit |
| Currency | field name `usd_` | Documented |
| Pricing mode | `pricing_type` ∈ spot, on_demand, community | Explicit |
| Preemptibility | follows pricing type | Derivable |
| Canonical quantity / minimum topology | absent; vendor divides node prices by count | **Missing** (Incompatible for node-only sellers) |
| Seller identity | `provider` slug → Urdais entity | Derivable |
| Geography | `region` null for 12/16 rows; `eastus` (Azure, two rows), `CZ` and `US` (Vast) on four | **Missing** for most |
| Availability | none; "not guaranteed availability" | **Incompatible** with the child (Grade 5 vs Grade ≥ 3) |
| Tenancy | none | Missing |
| SLA / service tier | pricing type only | Missing |
| Timestamp / freshness | `observed_at` per row, `updated_at`, `day` | Explicit (source-effective); Urdais retrieval time controls |
| Permission lineage | terms above; attribution in-band | Documented |

**Decision.** The existing child cannot admit these observations: the economic object differs (listed vs accessible), and availability, topology, tenancy and geography would have to be invented. Path B applies: the LISTED sibling admits listed on-demand prices with the per-accelerator class established from Urdais's own seller evidence, marketplace aggregates and node-only sellers excluded, and a single region-unspecified series.

## Provider-level candidates on the first payload (on-demand rows)

| Provider (upstream slug) | USD/GPU-hr | Urdais seller | Per-accelerator class evidence (Urdais) | Sibling outcome |
|---|---|---|---|---|
| voltagepark | 1.99 | Voltage Park, Inc. | Phase 1: on-demand 1–1016 GPUs | eligible |
| vast (region CZ) | 2.625 | marketplace platform figure | n/a | excluded: WRONG_SERVICE_PRODUCT (aggregate, not a seller) |
| massedcompute | 2.89 | Massed Compute (reseller) | none | excluded: MINIMUM_TOPOLOGY_UNKNOWN |
| datacrunch (Verda) | 3.25 | Verda | none | excluded: MINIMUM_TOPOLOGY_UNKNOWN |
| runpod | 3.49 | Runpod, Inc. | Phase 1/2: single-GPU pods; `minPodGpuCount` field | eligible |
| denvr | 3.87 | Denvr | none | excluded: MINIMUM_TOPOLOGY_UNKNOWN |
| hyperstack | 3.99 | NexGen Cloud Limited | Phase 1: per-accelerator listing, per-GPU host resources | eligible |
| lambda | 4.09 | Lambda, Inc. | `gpu_1x_h100_sxm5` | eligible |
| nebius | 4.50 | Nebius (no single contracting entity established) | Phase 1: per-GPU-hour on-demand listing | excluded: SELLER_LEGAL_IDENTITY_UNRESOLVED |
| coreweave | 6.155 | CoreWeave | Phase 1: whole node, count 8 | excluded: WHOLE_NODE_REQUIRED |
| azure (eastus) | 11.061 | Microsoft Azure | ND H100 v5, 8 GPUs | excluded: WHOLE_NODE_REQUIRED |

Spot rows (datacrunch, azure, coreweave, vast) and the Runpod community row are excluded as procurement-mode mismatches.

Four independent legal sellers survive on the evidence payload. Nebius is excluded because seller identity is legal identity and no single contracting entity stands behind its provider-wide listed price: its Services Agreement (`https://docs.nebius.com/legal/agreement`, effective 26 June 2026, retrieved 2026-09-14) assigns the contracting entity by customer jurisdiction: "for Customers who registered on the Platform after November 13th, 2025, the contracting entity under this Agreement is Nebius Inc." (United States); "for Customers who registered on the Platform on or after March 11, 2026, the contracting entity under this Agreement is Nebius Israel Ltd" (Israel); otherwise "the contracting entity under this Agreement is Nebius B.V." Its Terms of Use (dated 31 March 2025) name Nebius B.V. alone. The exclusion stands until the listed price can be tied to one contracting entity. The vendor's own on-demand median across its 11 rows was 3.87; Urdais does not use it.

## Production retrieval and candidate, 14 September 2026

One production-purpose retrieval was made through the runtime at 2026-09-14T01:10:02Z (completed 01:10:03Z, status 200, 2,349 bytes, 16 rows, response hash `bc504a22…`), under the provider-terms grant, inside the window for calculation date 2026-09-14. The payload had moved since the evidence retrieval: vendor `day` was `2026-09-14`, `updated_at` 01:02:49Z, Lambda 4.19 (was 4.09), Azure 12.29, Vast on-demand 1.933 (region `DE`), and the vendor's own on-demand median 3.93 across 10 providers. It is preserved as `docs/research/price-of-compute/production_retrieval_2026-09-14T0110Z.json`, with the runtime's assessment report beside it.

Under the LISTED sibling at 0.1.1-draft: 4 eligible (Voltage Park 1.99, Runpod 3.49, Hyperstack 3.99, Lambda 4.19); 12 excluded with named codes, Nebius 4.50 among them as `SELLER_LEGAL_IDENTITY_UNRESOLVED`. The observations were first interpreted under 0.1.0-draft, whose text allowed an unevidenced legal identity with disclosure; review of that candidate (5 participants, 3.99) found the identity rule too weak, the specification was amended to 0.1.1-draft, and the same raw offers were re-interpreted under it. Both interpretations remain current in lineage under their own versions; only 0.1.1-draft carries the candidate. Candidate value **3.74** (even-N median: the midpoint of 3.49 and 3.99), Normal breadth, participant count 4, contributing technical sources 1, largest-source participant share 1.0, one-day change withheld (no prior). Attribution: *Data: Price of Compute — priceofcompute.com*. The vendor's headline 3.93 is not Urdais's number and is not used.

This is a **candidate**, not a run and not a publication. The family calendar closes the 2026-09-14 window at 2026-09-15T00:00Z, and the database refuses a calculation run dated before its cutoff; the run is recorded by `scripts/ucpi/first-print.ts calculate` after that time, as a simulation run while the family methodology and the sibling specification are drafts. No `regional_publications` row can exist until both carry approved versions.

## Direct-source merge

Runpod and Lambda already exist as market entities and now carry a `seller_id` native identifier on this interface. When their direct interfaces are permitted, their observations will map to the same entity ids; the capacity-source collapse keeps one participant per seller, the source-concentration diagnostics show two interfaces for that participant, and lineage records which interface produced each observation. Precedence between a direct and an aggregator observation for the same seller and date is decided by the family's source hierarchy when the case arises; it is not implemented here.
