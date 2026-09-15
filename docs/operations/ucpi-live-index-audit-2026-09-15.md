# UCPI live-index audit, 15 September 2026

**Status: internal operations document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It establishes no methodology, publishes no value, and grants no source right. It records what the production compute dataset contained on 15 September 2026, measured against the methodology as written, and the decision that followed.

**Decision at the time of the audit: NO-GO.** Neither `UCPI-H100-SXM` nor `UCPI-H100-SXM-LISTED` could publish a production value, for four independent blockers.

**Superseded in part, the same day.** The methodology blocker was the binding one and it was a decision, not a data problem: UCPI-LISTED-GPU and its five children were approved at 1.0.0 with effect from 15 September 2026, and the seller-refusal question below was resolved. The listed track is now live-capable and its remaining requirement is production ingestion. `UCPI-H100-SXM`, the accessible-offer child, remains launch-blocked exactly as recorded here.

## What was measured

Both Supabase projects were queried directly: UrdaisProd (`cyqtaydtfuwaexjkuynq`) and UrdaisDev (`scwwjoyouohfrwylalha`).

| Pipeline table | UrdaisProd | UrdaisDev |
|---|---|---|
| `raw_offers` | **0** | 51 |
| `normalized_observations` | **0** | 67 |
| `eligibility_assessments` | **0** | 67 |
| `seller_observations` | **0** | 0 |
| `capacity_source_observations` | **0** | 0 |
| `regional_observations` | **0** | 0 |
| `regional_publications` | **0** | 0 |
| `calculation_runs` | **0** | 0 |
| `source_retrievals` | 49 (news and token only) | 5 |

**Production holds no compute observation of any kind.** Every normalized compute observation in Urdais lives in UrdaisDev, which is the research and preview environment. Development data does not become production data by being copied, so the production compute dataset is empty rather than thin.

## The accumulated dataset is a single retrieval, not a series

The five UrdaisDev retrievals were all made by hand through `scripts/ucpi/listed-print.ts` against `priceofcompute.com` on **14 September 2026**, between 01:10 and 02:04 UTC. Every one of the 67 normalized observations carries that same `observed_at`.

- UTC dates represented: **1**
- Oldest usable observation: 2026-09-14T01:10:03Z
- Newest usable observation: 2026-09-14T02:04:37Z

There is no accumulation because **there is no compute ingestion schedule**. `vercel.json` declares two cron jobs, `/api/cron/news` and `/api/cron/ubwi`. There is no UCPI cron route and no UCPI scheduler. The phrase "what the ingestion system has accumulated" has an empty referent for compute: nothing has been accumulating.

## Coverage, `UCPI-H100-SXM` (the accessible-offer child)

**Zero observations.** The instrument exists in the registry with `lifecycle_status = 'launch_blocked'`, asserted by a migration-time guard in `20260913150000_publication_layer.sql`. Its P2 population is empty by construction, which is what the child specification means by launch blocked. No source admitted to production carries the availability, tenancy, region and minimum-topology evidence this child requires at Grade 3 or stronger.

## Coverage, `UCPI-H100-SXM-LISTED` (the listed sibling)

The only compute instrument with eligible observations. Assessed at sibling version 0.1.1-draft, the one under which the candidate was recorded. 16 observations, 11 candidate sellers, region scope *listed, provider-wide* (this sibling publishes no country series, so a region breakdown does not apply and `canonical_region_code` is null throughout).

| Seller | Contracting entity | Obs | P2 | Price (USD/accel-hr) |
|---|---|---|---|---|
| Voltage Park | Voltage Park, Inc. | 1 | **1** | 1.99 |
| Runpod | Runpod, Inc. | 2 | **1** | 3.49 (on-demand) |
| Hyperstack | NexGen Cloud Limited | 1 | **1** | 3.99 |
| Lambda | Lambda, Inc. | 1 | **1** | 4.19 |
| Nebius | (unevidenced) | 1 | 0 | 4.50 |
| Azure | (unevidenced) | 2 | 0 | 2.27–12.29 |
| CoreWeave | (unevidenced) | 2 | 0 | 2.46–6.16 |
| DataCrunch | DataCrunch Oy | 2 | 0 | 1.63–3.25 |
| Denvr | (unevidenced) | 1 | 0 | 3.87 |
| Massed Compute | (unevidenced) | 1 | 0 | 2.89 |
| Vast.ai | (unevidenced) | 2 | 0 | 1.00–1.93 |

Exclusions by reason, across all 32 H100 SXM assessments: `MINIMUM_TOPOLOGY_UNKNOWN` 12, `SELLER_LEGAL_IDENTITY_UNRESOLVED` 11, `WRONG_PROCUREMENT_MODE` 10, `PREEMPTIBLE` 8, `WHOLE_NODE_REQUIRED` 8, `WRONG_SERVICE_PRODUCT` 4. No row was silently discarded; every exclusion carries a reason code.

Four eligible sellers, one technical source, one calculation date. The median of 3.49 and 3.99 is **3.74**, which reproduces the candidate of 14 September 2026 exactly. Breadth would be Normal at N=4.

**That number is a labelled candidate and remains one.** It is reported here as the audit's arithmetic, not as a value.

## Against the methodology as written

| Requirement | Source | Current state | Verdict |
|---|---|---|---|
| Approved family methodology version | UCPI 0.1.2-draft; LISTED-GPU 0.1.0-draft | All four UCPI methodology versions are `status = 'draft'`, `effective_from` null | **Fail** |
| Approved child/sibling specification version | LISTED-GPU, Publication | All eleven UCPI spec versions are `draft` | **Fail** |
| Observations in the production environment | Family calendar; production lineage | Production holds zero compute observations | **Fail** |
| Retrieval inside the calculation window, zero carry | UCPI family calendar; sibling Freshness | Newest retrieval is 2026-09-14T02:04Z; for a 2026-09-15 calculation date nothing falls in the window, and carry is zero at launch | **Fail** |
| ≥ 2 independent eligible sellers | Family structural rule | 4, at listed scope | Pass |
| Per-seller topology evidence | LISTED-GPU, Topology | Recorded for the four admitted sellers | Pass |
| Permitted collection and data use | Family, Source rights | Price of Compute grant in force | Pass, with the Runpod question below |

Breadth is the one requirement the dataset satisfies. It is also the only one anybody was ever in doubt about, which is worth saying plainly: the sample was never the binding constraint.

### The Runpod question, resolved

Runpod refused both permission axes in writing on 14 September 2026, and is closed as a *direct* source. Its listed price nonetheless reaches Urdais through the Price of Compute licensed feed, where it was one of the eligible constituents and pivotal to the median.

**The repository already answered this, and the answer is exclusion.** The denial migration records the refusal as a decision about the intended use rather than the retrieval mechanism, in terms that name the route: *"no alternative endpoint, method, cache or intermediary cures it."* Price of Compute's terms govern Urdais's use of the Price of Compute dataset; they cannot grant what Runpod withheld about Runpod's own price. Admitting the row because it arrived by a different road would make the aggregator a way around an answer Urdais asked for and received.

The rule is now written into UCPI-LISTED-GPU 1.0.0 as the seller-refusal rule, with the exclusion reason `SELLER_USE_REFUSED`, and it applies by every route. The cost is recorded rather than absorbed: under the snapshot the first candidate used, excluding Runpod moves the four-seller median of 3.74 to a three-seller 3.99; under the broader production snapshot it moves a five-seller 3.49 to a four-seller 3.62. The child still publishes either way, because breadth survives the exclusion.

## Blocker classification

| Blocker | Class |
|---|---|
| No approved methodology or specification version | **Methodology / governance** |
| Production holds no compute observation | **Publication infrastructure and ingestion** |
| No UCPI ingestion schedule exists | **Ingestion coverage** |
| Runpod's row in a licensed feed after a direct refusal | **Methodology ambiguity (rights)** |
| `UCPI-H100-SXM` P2 empty | **Source availability** (availability, tenancy, region evidence) |

## Smallest next action

The smallest step that changes the answer is **not** more data. Four eligible sellers already clear breadth. It is:

1. **Approve a methodology version.** A reviewed decision moving UCPI and UCPI-LISTED-GPU from draft to approved, with effective dates, recorded as a migration. Until this exists, no amount of collection produces a publishable value.
2. **Answer the Runpod question** in the methodology, since it moves the first value.
3. Only then: a UCPI cron route and a production retrieval, so that observations land in UrdaisProd inside a calculation window.

Steps 1 and 2 are editorial and reviewable today. Step 3 is a few hours of work that is worthless before them.

## What this audit changed

Nothing about any value. It found and fixed three defects in the machinery that would have mattered the moment step 1 happened; they are described in the pull request that carries this document.
