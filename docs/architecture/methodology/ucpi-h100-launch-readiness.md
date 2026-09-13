# UCPI-H100-SXM Launch Readiness

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. Records the launch-readiness closeout that followed the market-breadth amendment: the hosted-database synchronization, the definitive blocker matrix, the two-provider investigations, and the methodology parameters resolved in UCPI-H100-SXM 0.1.3-draft. No collector was built, no production data was collected, no outreach was sent, and no permission classification changed.

The question this document answers: **if both pending permission replies arrived today and were acceptable, what would still stand between Urdais and the first UCPI-H100-SXM publication?**

## 0. Synchronization result

| Check | Result |
|---|---|
| `main` at the PR #41 merge | `894486a`; parent 0.1.1-draft, child 0.1.2-draft |
| `20260913110000_market_breadth_versions` on UrdaisDev | Not present in history; version rows confirmed absent before applying; **applied exactly once**; Supabase recorded it under its apply timestamp and the version string was aligned to `20260913110000` |
| Version rows and hashes | `ucpi 0.1.1-draft` = `98ceca9f…`, `UCPI-H100-SXM 0.1.2-draft` = `54239de2…`, both matching the merged documents; earlier rows retained |
| Schema parity | Fingerprint identical on all eight components between a fresh local bootstrap and UrdaisDev: 263 columns, 172 constraints, 61 indexes, 9 triggers, 4 functions, 21 RLS tables, 0 policies, 21 privilege rows |
| Guards | 0 production-approved sources; 0 sources permitted on both axes; 0 publication-layer tables; instrument `launch_blocked`; every observation table empty |
| Classifications | Unchanged: Runpod `not_permitted`/`not_permitted`; Lambda `under_review`/`not_permitted`; Vast `not_permitted`/`not_permitted`; AWS and Azure collection `permitted`, index use `under_review`; DigitalOcean `under_review`/`under_review` |
| SQL tests | 11/11 pass |

## 1. Definitive blocker matrix

Every blocker known after the merged parent, child, source registry, Phase 4 evidence, buildability reassessment and market-breadth amendment, classified and given a resolution state as of this closeout.

| # | Blocker | Class | State after this closeout |
|---|---|---|---|
| 1 | Runpod collection permission | `EXTERNAL_PERMISSION` | **Externally blocked**, clarification pending |
| 2 | Runpod index-use permission | `EXTERNAL_PERMISSION` | **Externally blocked** |
| 3 | Lambda collection permission | `EXTERNAL_PERMISSION` | **Externally blocked**, request pending |
| 4 | Lambda index-use permission | `EXTERNAL_PERMISSION` | **Externally blocked** |
| 5 | Runpod H100 SXM product match | `SOURCE_PRODUCT` | **Resolved**: id `NVIDIA H100 80GB HBM3`, display H100 SXM, 80 GB, Grade A |
| 6 | Runpod per-accelerator minimum quantity | `SOURCE_PRODUCT` | **Partially resolved**: single-GPU pricing and `count=1` availability by design; `minPodGpuCount` value read at first authenticated call |
| 7 | Lambda 1× H100 SXM product | `SOURCE_PRODUCT` | **Resolved**: `gpu_1x_h100_sxm5`, "1x H100 (80 GB SXM5)", $4.29 at 1× today; regional presence is a collection-time fact |
| 8 | Runpod datacenter to country | `SOURCE_MAPPING` | **Partially resolved**: mapping rule fixed via the API's own `countryCodes` filter and `countryCode` field; US evidenced for two datacenters; full list at first authenticated call |
| 9 | Lambda region to country | `GEOGRAPHY` | **Resolved**: all 14 regions mapped from Lambda's own table (US ×9, JP ×2, IN, DE, IL) |
| 10 | Runpod tenancy | `TENANCY` | **Resolved: Documented**, on the statement that a running Pod's GPU "is exclusively reserved for you" |
| 11 | Lambda tenancy | `TENANCY` | **Externally blocked: Ambiguous.** Only GH200 is stated single-tenant; H100 documentation is silent. A narrow in-thread clarification was sent 13 September 2026 (message `1a09d05f8dbdd35e`); awaiting a one-line answer |
| 12 | Runpod Grade ≥ 3 availability | `AVAILABILITY` | **Resolved by design**: `NONE/LOW/MEDIUM/HIGH` per datacenter at `count=1`, per cloud tier; live values at first call |
| 13 | Lambda Grade ≥ 3 availability | `AVAILABILITY` | **Resolved by design**: `regions_with_capacity_available`, required and possibly empty; live values at first call |
| 14 | Freshness ages | `FRESHNESS` | **Resolved**: both evidence ages equal the calculation cycle |
| 15 | Price carry limit | `FRESHNESS` | **Resolved**: no carry at launch |
| 16 | Bundle envelope level | `BUNDLE` | **Resolved**: host-memory floor 80 GB per accelerator; both candidates within |
| 17 | Mandatory charges, both providers | `BUNDLE` | **Resolved**: GPU rate is the price at both; Runpod buyer-sized storage outside; Lambda root volume inside; no egress fees; credit prerequisite recorded as constraint |
| 18 | Tax basis, Runpod | `BUNDLE` | **Resolved**: exclusive per Terms of Service |
| 19 | Seller-reduction rule | `SELLER_REDUCTION` | **Resolved**: canonical-quantity selection, then the minimum |
| 20 | Three numerical gates | `OTHER` | **Resolved**: carried share zero by construction; grade, Limited and tax shares published as diagnostics, with reasoning |
| 21 | Marketplace seller-identifier stability | `OTHER` | Not a blocker for a two-cloud launch; binds only for marketplace participation |
| 22 | Country overlap between the two candidates | `GEOGRAPHY` | **Partially resolved**: the United States is the only defensible overlap; confirmed only by live availability on a date |
| 23 | Individual-price disclosure at N=2 | `DATA_RIGHTS_DISPLAY` | **Partially resolved**: methodology withholds dispersion; agreement terms must be settled per the checklist in section 9 |
| 24 | Calculation cutoff and publication timing | `OTHER` | **Resolved in UCPI 0.1.2-draft**: UTC calendar date, half-open window `[D 00:00Z, D+1 00:00Z)`, cutoff exclusive, observation time controls, last complete reconfirmation before cutoff, publication by `D+2 00:00Z` else Delayed; child 0.1.4-draft inherits |
| 25 | Schema representation of three launch fields | `IMPLEMENTATION` | **Resolvable now**: gaps and smallest amendments proposed in section 10; not applied in this PR |
| 26 | Collector implementation | `IMPLEMENTATION` | Blocked by policy until both axes are permitted for at least two independent sources |
| 27 | Publication layer (seller-level, participant, series tables) | `IMPLEMENTATION` | Phase 6, after collection exists |
| 28 | Live validation | `IMPLEMENTATION` | After permission and collection |

Items 1 to 4 and 11 are the only ones that require a counterparty. Item 24 requires the administrator. Everything else is either resolved or is a first-collection verification.

## 2. Runpod

Detail in [runpod-launch-readiness.md](../sources/runpod-launch-readiness.md). Summary: the product exists and is Grade A; price is per single GPU with per-GPU host resources (20 vCPU, 125 GB), $3.49 Secure and $2.69 Community on 13 September; Secure and Community are one seller with two variants, both in one cell; tenancy is Documented on an unqualified statement about Pods; availability is Grade 3 by design with a country filter built into the API; storage is buyer-sized and separately billed, so outside the price; tax is exclusive per Terms; the bundle is within the envelope. Only the `minPodGpuCount` value, the full datacenter list and live availability need an authenticated call.

## 3. Lambda

Detail in [lambda-launch-readiness.md](../sources/lambda-launch-readiness.md). Summary: the 1× product exists on both the OpenAPI examples and today's price surface at $4.29 per GPU-hour (2× $4.19, 4× $4.09, 8× $3.99), Grade A; all fourteen regions map to countries; availability is Grade 3 by design; the root volume is included and tax is exclusive; the bundle (225 GiB) is within the envelope; on-demand is non-preemptible on the product's definition, with no explicit non-reclaim statement found. **Tenancy is Ambiguous**: Lambda states single-tenancy for GH200 and nothing for H100. Without a statement, Lambda observations are `TENANCY_UNRESOLVED` and never reach P2, which would leave Runpod alone at N=1 and the region Unavailable.

## 4. Geographic overlap

| Country | Runpod eligible? | Lambda eligible? | Both? | Evidence quality | Remaining blocker |
|---|---|---|---|---|---|
| **US** | Plausible: `US-KS-2` and `US-GA-1` documented as US; H100 SXM availability per datacenter unobserved | Plausible: nine US regions; 1× H100 SXM regional presence unobserved | **Plausible** | Medium: identities and mappings first-party; no live availability on either side | Live Grade-3 availability at 1× in the same country on the same date; Lambda tenancy; permissions |
| JP | Unknown: datacenter list key-gated | Two regions | Unknown | Low | Runpod presence unknown |
| IN | Unknown | One region | Unknown | Low | Same |
| DE | Unknown | One region | Unknown | Low | Same; Runpod's `EU-RO-1` is a continent, not a country, on public evidence |
| IL | Unknown | One region | Unknown | Low | Same |
| Others | Key-gated | None | No | — | — |

**The United States is the only defensible first publication region**, and it is plausible rather than established. A single-country launch at Minimum breadth is what the evidence supports. No broader coverage is claimed.

## 5. Freshness parameters, resolved

Both `price_max_age` and `availability_max_age` equal the calculation cycle; nothing is carried across calculation dates at launch; `reference_data_max_age` is version validity; weekends are ordinary calculation dates. The ordering constraint from 0.1.1 holds with equality. This was resolvable without the cadence study because the rule contains no estimated number: it is the conservative branch the child already took for availability, extended to price. The cadence study becomes the condition for ever relaxing it. For the two candidate interfaces the rule costs nothing extra, because each returns price and availability in a single response, so a fresh-price-stale-availability combination cannot arise.

## 6. Carry behaviour, resolved

| Case | Outcome |
|---|---|
| Price and availability both re-observed on the calculation date | Eligible; Reconfirmed or Newly observed |
| Source unreachable at every attempt before cutoff | Source unavailable; participant leaves that date's coverage; count and breadth change disclosed |
| Fresh price, availability not re-observed | `AVAILABILITY_STALE` |
| Fresh availability, price not re-observed | `PRICE_STALE` |
| Both stale | Ineligible |

Every carry field the family requires (original observation time, latest verification time, age, carried flag, reason) is already in the ingestion contract and the schema; at launch the carried flag is never set. At N=2 a single source failure produces Unavailable for that date; the collector's mitigation is retry within the window, not carry.

## 7. Bundle envelope and price components, resolved

Host memory per accelerator ≥ 80 GB, equal to device memory; no vCPU or storage floor. Both candidates are within (125 GB, 225 GiB). The floor excludes roughly half of the 23 marketplace research candidates (median 55.4 GB) and binds on no specialist cloud; it reduces coverage rather than creating it. The normalized price at both candidates is the quoted GPU-hour rate: Runpod's storage is buyer-sized and separately billed, therefore usage-dependent and outside, with its undocumented minimum recorded and bounded below 0.1%; Lambda's root volume is included. Neither charges egress. Runpod's one-hour credit prerequisite is a commercial constraint, not a charge.

## 8. Seller-level reduction, ratified

Canonical-quantity selection, then the family's minimum within it. Evidence: Lambda's tiers show a monotone 7.5% quantity discount inside the per-accelerator class, under which the bare minimum would report the eight-accelerator price for a one-accelerator unit and the median a price nobody pays. Applied to the candidates: Lambda $4.29 (1×); Runpod the lower of Secure and Community at 1× where both are available, $2.69 today. The parent's third alternative is worded "fixed or canonical-zone selection"; the child applies the fixed selection to quantity and asks the family to confirm the wording.

## 9. Data rights and display at N=2: the agreement checklist

At N=2 the midpoint plus one participant's known price yields the other. Both candidates' prices are public list prices, so reconstruction reveals nothing that is not already on their price pages; but an agreement may still restrict display, and the methodology already withholds dispersion at Minimum breadth. When either provider replies, the agreement must be checked against this list before the source is classified `permitted` on either axis:

1. **Collection**: retrieval through the documented API, at a stated daily cadence, with retries within a window, authenticated as a customer.
2. **Retention**: raw responses and derived observations retained indefinitely for lineage; the parent's reproducibility claim depends on this and it is the point of least flexibility.
3. **Index use**: use as an input to a published aggregate compute price index, explicitly, since both providers' terms name index or benchmark construction.
4. **Aggregate publication**: the regional level, the participant count, the market-breadth qualifier, the contributing-source count and the composition diagnostics may be published without restriction.
5. **Individual prices**: whether the provider's own price may be displayed. Default under the methodology at N=2: **not displayed**, dispersion withheld. The agreement need only permit the aggregate; if it permits individual display, the child may publish dispersion at N=2 by amendment.
6. **Reconstruction**: the provider acknowledges that at two participants the aggregate implies each participant's price given the other, that both prices are public list prices, and that this is not a disclosure of confidential information.
7. **Attribution**: whether the provider is to be named as a constituent, described generically, or not identified; the parent permits either as long as the participant count is published.
8. **Caching and storage**: no restriction on storing responses; if there is one, the source cannot support a reproducible benchmark and fails the parent's licensing rule.
9. **Redistribution**: raw values are not redistributed; aggregates are; confirm this matches the provider's reading.
10. **Tenancy statement** (Lambda specifically): a sentence establishing that on-demand H100 instances hold their GPUs exclusively.
11. **Minimum quantity confirmation** (Runpod specifically): that one H100 SXM may be allocated, or the `minPodGpuCount` value.
12. **Terms version and signatory**: record which terms version the permission is granted against and who has authority.

The publication design already supports publishing the level, count, breadth and source count without raw prices: participant-level prices stay in the pipeline schema, which is never exposed through the API, and only the aggregate observation is published.

## 10. Collector input contract and schema gaps

The normalized fields a future collector for either candidate must produce, mapped to the existing schema. "✓" means the current model represents the concept without change.

| Field | Representation | Status |
|---|---|---|
| Source interface id | `source_retrievals.source_interface_id` | ✓ |
| Source observation id | `raw_offers.source_native_offer_id`, `source_native_product_id` (GPU-type id + datacenter id + cloud tier; instance-type name + region code) | ✓ |
| Retrieval timestamps | `source_retrievals.requested_at`, `completed_at`; `raw_offers.observed_at` | ✓ |
| Source timestamp | `raw_offers.source_effective_at`, null for both candidates, never defaulted | ✓ |
| Seller legal identity | `normalized_observations.seller_entity_id` → `reference.market_entities` | **Gap**: `market_entities` has `slug`, `name`, `notes` and no legal-identity field, while the parent's Seller entity requires legal identity and the market-breadth rule turns on it. **Smallest amendment**: add `legal_name text` and `legal_identifier text` (registry number or jurisdiction) to `reference.market_entities` |
| Operator identity and attribution | `operator_entity_id`, `operator_attribution_basis`, `capacity_source_entity_id` | ✓ (null, undetermined) |
| Marketplace identity | `marketplace_entity_id` | ✓ (null) |
| GPU model, memory, form factor | `native_gpu_model`, `native_gpu_memory_mb`, `native_form_factor`; `hardware_identity_grade`, `full_device`, `instrument_id` | ✓ |
| Accelerator count, allocation class, minimum | `gpu_count`, `topology_class`, `minimum_gpu_count`, `minimum_topology_source_field` | ✓ |
| Tenancy class | `tenancy_grade` + `observation_evidence` role `tenancy` | ✓ |
| Procurement mode, preemptibility | `procurement_mode`, `preemptible`, `price_formation` | ✓ |
| Price, currency, denominator | `native_price`, `native_currency`, `native_billing_unit`; `normalized_price`, `normalized_unit`, `price_conversion` | ✓ |
| Mandatory usage-proportional and fixed fees | `mandatory_fee_interpretation`, `usage_dependent_charges`, `minimum_commitment` | ✓ (jsonb) |
| Normalized accelerator-hour price | `normalized_price` | ✓ |
| Country and mapping | `canonical_region_code`, `region_mapping_id`; `region_mappings.evidence_retrieval_id` for the country-filtered retrieval | ✓ |
| Source location identifier | `native_region`, `native_geolocation` | ✓ |
| Availability state, grade, quantity | `availability_state`, `availability_evidence_grade`, `availability_quantity` | ✓ |
| Service characteristics (Secure vs Community; reliability tier) | Nothing typed; only `raw_payload` or `bundle_extra` | **Gap**: the seller-reduction rule needs the variant label and the child publishes tier composition. **Smallest amendment**: `native_service_tier text` on `pipeline.raw_offers` and `service_tier jsonb` on `pipeline.normalized_observations` |
| Raw payload lineage | `raw_payload`, `record_hash`, `retrieval_id`, `response_hash` | ✓ |
| Version references | `instrument_spec_version_id`, `methodology_version_id` | ✓ |
| Permission reference | Nothing on the retrieval; terms state lives on `source_interfaces` and changes over time | **Gap**: a retrieval should record the agreement and terms version it was made under. **Smallest amendment**: `permission_reference text` on `pipeline.source_retrievals` |
| Calculation date | `eligibility_assessments.calculation_date` | ✓ |
| Freshness and carry | `input_status`; `PRICE_CARRIED` diagnostic with age (unused at launch) | ✓ |
| Enumeration | `enumeration_assessment` = `complete` for both catalogs | ✓ |
| Seller-level reduction record and eligible offer set | No table yet | Phase 6 publication layer, by design |

Three small amendments, none applied here: they belong with the first collector, when a market entity and a retrieval actually exist to carry them.

## 11. Amendment classification

**A. Existing parameters filled** (child 0.1.3-draft): freshness ages, carry limit, bundle envelope level, seller-reduction rule, the storage and prepayment fee rules, the three numerical gates. **B. New concepts**: none introduced. The gate-to-diagnostic conversions reuse the impossible-gate reasoning the child applied to operator attribution and the participant-count reasoning the family adopted at 0.1.1. **C. Source-specific details**: product ids, tier structure, datacenter mapping route, tenancy grades, availability mapping, fee treatment and tax basis for each provider live in the two source documents, not in the methodology. Two parent confirmations are requested, neither a rule change: the wording of the canonical-selection alternative, and the calculation cutoff.

## 12. Final launch-readiness matrix

| Requirement | Runpod | Lambda | Methodology | Status |
|---|---|---|---|---|
| Permission, collection | pending | pending | required | **BLOCKED** |
| Permission, index use | pending | pending | required | **BLOCKED** |
| H100 SXM product match | Grade A, `NVIDIA H100 80GB HBM3` | Grade A, `gpu_1x_h100_sxm5` | required | RESOLVED |
| Per-accelerator allocation | by design; `minPodGpuCount` at first call | 1× offered today | required | RESOLVED, one first-call verification |
| Tenancy | Documented | **Ambiguous** | Explicit or Documented | **BLOCKED on a Lambda statement** |
| Grade ≥ 3 availability | by design, per tier | by design | required | RESOLVED, live values at first call |
| Country mapping | rule fixed; US evidenced | all 14 regions | required | RESOLVED, Runpod list at first call |
| Country overlap | US plausible | US plausible | N=2 needed | PLAUSIBLE, confirmed only live |
| Freshness parameters | n/a | n/a | calculation cycle, no carry | RESOLVED |
| Carry rule | n/a | n/a | zero carry at launch | RESOLVED |
| Bundle rule | 125 GB, within | 225 GiB, within | 80 GB floor | RESOLVED |
| Mandatory charges | GPU rate; storage outside | GPU rate; root volume inside | rule stated | RESOLVED |
| Tax basis | exclusive, Terms | exclusive, price surface | evidence by general terms | RESOLVED |
| Seller reduction | canonical 1×, min of tiers | canonical 1× | ratified | RESOLVED |
| Numerical gates | n/a | n/a | none open | RESOLVED |
| Calculation cutoff | n/a | n/a | UTC half-open day, cutoff next midnight exclusive, deadline the midnight after | RESOLVED, UCPI 0.1.2-draft |
| Schema gaps | — | — | three columns proposed | OPEN, with first collector |
| Collector, publication layer, live validation | — | — | — | AFTER PERMISSION |

## 13. The answer

**If Runpod and Lambda both sent acceptable permission replies today, the blockers that would still prevent the first publication are:**

1. **A tenancy statement from Lambda for H100 on-demand instances**, now asked for directly in the permission thread (message `1a09d05f8dbdd35e`, 13 September 2026). Without it, Lambda's observations are `TENANCY_UNRESOLVED`, the region has one participant, and the value is Unavailable. If the answer arrives with the permission reply, this item disappears.
2. **Collector implementation and live validation**, including the first-call verifications: Runpod's `minPodGpuCount`, its datacenter-to-country list, and live Grade-3 availability at 1× in at least one common country on the same date, together with the Phase 6 publication layer and the three proposed schema columns.

The calculation cutoff, previously item 2 here, was resolved at family level in UCPI 0.1.2-draft on 13 September 2026 and no longer stands between permission and implementation. The Lambda tenancy statement is the only remaining non-permission evidence blocker, and it is a sentence, not a negotiation.
