# UCPI-H100-SXM Launch-Parameter Closure Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. No production value, schema, collector, or UCPI observation is created by this document. Prices appear only as evidence and are never UCPI values.

This study supports the 0.1.1-draft amendment of [UCPI-H100-SXM](/docs/methodology/ucpi-h100-sxm). It consumes the merged UCPI-H100-SXM Production Data Source Study, held alongside this file, and adds the first H100-specific empirical experiment. Its purpose is to decide, with evidence, which launch parameters can now be closed and which must stay open.

## Headline Results

**The first genuinely H100-specific marketplace sample was obtained**, replacing the mixed unfiltered population that Phase 1 was forced to withdraw. It produced six comparable multi-offer cells, the first ever recovered for this child, and the first measured accessible-capacity counts for H100 SXM.

Four results are decisive enough to state alone.

**Country is the finest canonical region that can be mapped consistently.** A genuine subnational identifier was present on 9 of 116 marketplace offers, 7.8%. A metro taxonomy is therefore not constructible from the best-populated geography source in the market.

**The interface does not return a complete or stable result set.** The marketplace caps responses at 64 records regardless of the requested limit, reports `truncated: false` while doing so, and returns different subsets for different orderings of the same query. Per-offer content was perfectly consistent across nine responses; only set membership varied. **The seller minimum is not well defined under incomplete enumeration**, which is a new argument against the family's provisional default that did not exist before this study.

**The bundle envelope decides whether the marketplace segment is in the index at all.** Applying the specialist-cloud host-resource range observed in Phase 1 to the marketplace admits 2 of the 23 pre-bundle research candidates, 9%. The envelope level is therefore a decision about coverage, not a data-cleaning parameter, and is not set here.

**An availability rule can be stated provider-neutrally.** The usable distinction is not how granular a capacity signal is but whether it is **discriminating**: whether the same field can express "not obtainable" for the specified product. Offer booleans, region capacity lists and ordinal datacenter availability all can. Catalog presence and price-page presence never can.

## Method and Evidence Standard

Every finding rests on a source retrieved on 13 September 2026 and named with its URL. Endpoints recorded as verified were called and their status codes recorded. **No account was created, no authentication was bypassed, no credentialed request was made, and no rate limit was evaded.** Where documentation states that a key is required, the requirement is recorded as a finding rather than worked around.

Thirteen requests were made to the marketplace endpoint in total, and querying stopped once the population questions were answered. Search results were used only to locate provider documentation and are never cited as evidence.

Sources relied on for a decision were re-opened and read during this pass rather than taken from the Phase 1 paraphrase.

## Experiment 1 — H100-Filtered Marketplace Study

The Phase 1 sample was unfiltered and contained only 2 H100 SXM rows. This experiment filtered on the accelerator.

### Queries issued

All against `https://cloud.vast.ai/api/v0/bundles/`, unauthenticated, all returning HTTP 200.

| # | Query | Records |
|---|---|---|
| 1 | unfiltered baseline | 64, of which 2 H100 SXM |
| 2 | `gpu_name eq "H100 SXM"`, `type on-demand`, `limit 500` | 64, all H100 SXM |
| 3 | same with `limit 10` | 10 |
| 4 | same as 2, ordered by `dph_total asc` | 64, **22 records different from query 2** |
| 5 | same as 2 with `rentable eq true` | 16 |
| 6-13 | same as 2 partitioned by `num_gpus` 1 through 8 | 21, 19, 1, 13, 0, 0, 1, 11 |

The baseline reproduced the Phase 1 record exactly: 64 rows, 2 H100 SXM, both on host 68137 and machine 37070 at 1 and 2 GPUs, $1.4689 and $2.9356, both not rentable. That reproduction is the reason the filtered result can be trusted as a like-for-like improvement.

### The population cannot be fully enumerated

`limit` is honoured downward, since 10 returned 10, so a request for 500 returning 64 means 64 is a server-side cap rather than the population. Two identical queries differing only in ordering returned **22 different records out of 64**, while the union of all responses reached **116 distinct offers**. The documented response field `truncated` was `false` on every response, including those that were demonstrably truncated.

The `rentable eq true` query returned 16 records, yet the union proved **23 distinct rentable offers**, seven of which that filtered query omitted. So a filtered query does not return the complete matching set either.

**Content was consistent even though membership was not.** Fifty-three offers appeared in more than one response; **zero** disagreed on `rentable` and **zero** disagreed on `dph_total`. The incompleteness is a property of the interface, not volatility in the underlying data.

The documentation states a `limit` parameter, "Max offers to return", with **no documented default, no documented maximum, and no documented pagination mechanism**.

### What the union contains

116 distinct H100 SXM offers, 18 distinct `host_id` values, 35 distinct `machine_id` values, and 23 rentable offers. Every record carried `gpu_ram` of 81559 MB and `is_bid` false.

### Answers to the Phase 1 questions

1. **Offers observed**: 116 in the union; no single query returned more than 64.
2. **Currently rentable**: 23 in the union, 16 returned by the direct rentable query. A rate is **not** reported, because the denominator is not enumerable through this interface; 23 of 116 is a ratio over a sample of unknown coverage, not a market availability rate.
3. **Distinct host IDs**: 18, and the same 18 in every unfiltered response.
4. **Distinct machine IDs**: 35.
5. **Hosts expose multiple offers**: yes, up to 8 offers from one host.
6. **Offers from one host differ in**: region (host 616514 lists in two US states; host 344227 in two US locations), quantity (1, 2, 3, 4, 7 and 8 GPUs), price, bundle, and availability. They did **not** differ in tenancy or procurement mode; `is_bid` was false throughout.
7. **Are repeated offers competing offers?** Partly. Two distinct patterns were separated, and conflating them is what a naive reading would get wrong. Where several offers share one `machine_id` they are **quantity partitions of a single machine**, priced almost exactly linearly: host 415248 at 1 and 2 GPUs prices $2.0022 and $2.0011 per accelerator-hour, a 0.06% difference. Where offers come from **different machines** they are genuinely distinct capacity, and the spread is large: host 214845 lists three machines in Czechia at $2.6170, $2.7007 and $3.3409, a 27.7% spread, and host 260094 lists three machines in the United States at $4.5471, $5.4078 and $7.3011, a 60.6% spread.
8. **Does a host identifier persist across pages?** Within this session, yes. The 18-host set was identical across every unfiltered response, `host_id` was constant per machine, and the undocumented `hosting_type` attribute was constant per host. **Cross-time stability was not tested and remains unknown.**
9. **Can host identity be a stable seller fallback?** Provisionally. The documentation defines `host_id` as "Host user ID" and states that hosting requires its own account, and confirms one host account may operate several machines. Within-session stability is established. Cross-time stability, and whether one commercial seller can hold several host accounts, are not.
10. **Does the sample create a comparable cell?** **Yes, for the first time.** Six of them.

### The six comparable cells

A cell is one host, one country, the per-accelerator allocation class, on-demand, H100 SXM, restricted to rentable offers on machines whose minimum listed quantity is below the whole machine. Prices are dollars per accelerator-hour.

| Host | Country | Offers | Machines | Prices | Minimum | Median | Within-cell spread |
|---|---|---|---|---|---|---|---|
| 517294 | AU | 5 | 1 | 1.9391-1.9424 | 1.9391 | 1.9402 | 0.17% |
| 214845 | CZ | 3 | 3 | 2.6170, 2.7007, 3.3409 | 2.6170 | 2.7007 | 27.66% |
| 638511 | DE | 2 | 2 | 2.0022, 2.0022 | 2.0022 | 2.0022 | 0.00% |
| 415248 | JP | 3 | 1 | 2.0011-2.0022 | 2.0011 | 2.0022 | 0.06% |
| 260094 | US | 6 | 3 | 4.5471-7.3022 | 4.5471 | 5.4089 | 60.59% |
| 616514 | US | 2 | 2 | 1.9356, 1.9356 | 1.9356 | 1.9356 | 0.00% |

**Median minus minimum across the six cells: maximum 18.95%, mean 3.71%.**

The two large-spread cells are the two with several distinct machines. Single-machine cells differ by less than 0.2%, because a machine's quantity variants are priced linearly.

### Does the reduction rule move the published statistic?

Only one country reached the parent's structural floor of two participants. In the United States, with three participants, the regional median was **$2.9344 under the seller minimum, $2.9344 under the seller median, and $2.9344 under a seller maximum**.

**This is coincidence, not robustness.** With three participants the median is the middle participant, and the middle participant here published a single offer, so no reduction rule could move it. The reduction rule moved the *extreme* participants by up to 19% without touching the result. A different participant count, or a multi-offer participant in the middle, would produce a different answer.

### Catalogue-breadth bias is confirmed, and its driver is identified

The family recorded a concern that a seller with a broader catalogue has more chances to produce a low minimum. This sample confirms the bias and shows what generates it in a marketplace: **machine count, not zone count**. Host 260094, listing three machines, produced a minimum 19% below its own median. Host 616514, listing two machines in two different US states, produced no dispersion at all.

Within-cell price dispersion was **not** explained by bundle quality in a consistent direction. In host 260094's cell the cheapest machine carried the most host memory per accelerator, 111 GB against 28 GB for the more expensive machines, with identical virtual CPU counts and NVLink present throughout. The same inversion appeared in host 214845's cell. A rule selecting the minimum is therefore not systematically selecting an inferior bundle, but neither is price tracking the bundle.

### Enumeration incompleteness is an argument about the reduction rule

Stated exactly: because a retrieved subset is contained in the complete set, **the minimum over the retrieved subset is weakly greater than or equal to the minimum over the complete set**. The enumeration error is therefore **one-sided**, able to move the observed participant price up but never down, with a magnitude depending on how much of the set the collector happened to receive. A median over the same partial set carries no such one-sided error and is less sensitive to which subset arrived.

This does not settle the rule. It adds a consideration the family did not have, and it is recorded so that the ratification study weighs it.

## Experiment 2 — Field Semantics Verified Against Documentation and Arithmetic

Phase 1 listed marketplace fields. This pass established what several of them mean, because three of the child's decisions turn on it.

### `gpu_frac` is a machine fraction, not a device fraction

The documentation describes `gpu_frac` as "Fraction of the total GPU resources being offered". Tested arithmetically: `num_gpus / gpu_frac` was **exactly consistent for all 35 machines**, with zero inconsistencies, yielding implied machine totals of 8, 7, 4, 2 and 1 accelerators. Every one of the 116 offers reported `gpu_ram` of 81559 MB, a full 80 GB device.

**A `gpu_frac` below 1 therefore means the offer takes some whole accelerators out of a larger machine. It does not mean a partitioned accelerator.** Reading it as a fractional device would wrongly exclude most of the venue under the child's full-device rule, and is recorded as a named ingestion trap.

### `dph_total` is a mandatory total with a verifiable composition

`dph_total` equalled `dph_base` plus `storage_total_cost` **exactly, with a maximum absolute deviation of 0.0 across all 116 offers**. Network transfer is priced separately per gigabyte through `inet_down_cost`, `inet_up_cost` and `internet_down_cost_per_tb`.

That maps directly onto the family's price-component rule: the included storage allocation is a usage-proportional mandatory charge already inside the hourly figure, and transfer charges depend on how the buyer uses the product and are excluded. `min_bid` is the interruptible price and is out of scope for an on-demand child. `discount_rate`, `discounted_dph_total` and `credit_discount_max` are promotional fields; the ordinary price is `dph_total`.

### `rentable` is machine-level and discriminating

Documented as "Whether machine is rentable". It is **not** a proxy for "rented": `rented` was false on all 116 records while 93 were not rentable, and the documentation shows the `rented` query parameter concerns offers the *calling user* already rents, which for an anonymous caller is none.

`rentable` does not track verification. Thirty-seven verified machines were not rentable and eight rentable machines were unverified or deverified, so availability and source quality are orthogonal signals that must be recorded separately.

### `geolocation` resolves to country

The documented query filter for `geolocation` is a "two letter country code". In the response, 107 of 116 offers, **92.2%**, carried no genuine subnational component; the nine that did were Virginia, District of Columbia, Iowa and California. The integer `geolocode` was one-to-one with country, eleven distinct values for eleven countries, so it is a country code rather than a finer locator.

### `end_date` is an offer expiry, not an availability timestamp

Phase 1 recorded the date fields with semantics unverified. The host documentation states that once an offer is created "the offer accepts new rentals until the offer end date". `end_date` is therefore a **forward-looking limit on the offer**, not the time availability last changed. **No availability-change timestamp exists at this venue, which was the last candidate for one anywhere.**

### Tenancy is documented at the device level, correcting an earlier reading

**This finding was corrected before the amendment was finalized, and the correction went in the direction of admitting the venue rather than excluding it.**

The first reading rested on the venue's security documentation, which states that "Clients are isolated in unprivileged Docker containers and only have access to their own data" with "Separate namespaces and cgroups, Network isolation, File system isolation, Process isolation". That page says nothing about the accelerator itself, so the venue was initially graded Ambiguous on the ground that device exclusivity had not been stated.

**The venue does state it, on a page that had not been read.** Its official Concepts documentation defines the term directly: an instance is "a running, isolated environment on the host's machine with **exclusive access to the GPUs you rented**", adding that instances "are almost always Docker containers; a small subset are virtual machines".

That is a published statement by the venue, in its own product documentation, that the accelerators an instance rents are exclusively accessed. Under the child's existing grades it is **Documented**: official product documentation establishing a full-device product. It is not graded Explicit, because it is platform documentation covering every offer rather than a per-offer assertion by the individual seller behind an offer.

**No other primary source from the venue contradicts it.** The security documentation is silent on accelerator assignment rather than opposed to it, and the venue's published documentation index contains no concept of a partitioned, time-shared, multi-instance or virtualized fractional accelerator. The `gpu_frac` arithmetic and the uniform full 80 GB `gpu_ram` independently establish allocation in whole accelerators, so the documentary and arithmetic evidence agree.

**The child's tenancy rule is unchanged.** Only the grade assigned to one venue changed, and it changed on a primary source rather than on an inference.

### The venue distinguishes certified datacenter hosts

Datacenter status requires "an active ISO/IEC 27001 certificate", ownership by "a registered business", "a signed Datacenter Hosting Agreement", "verified owner identity", and at least five GPU servers listed, and grants a "Blue datacenter label" and inclusion in "Secure Cloud" searches. The documentation notes that "Users typically are willing to pay more for the security and reliability that comes with equipment that is in a proper facility."

The undocumented `hosting_type` field took one value per host, 6 of 18 hosts at 1, and hosts at 1 were never unverified. It is a **candidate** signal for datacenter status and is not relied on until documented.

**This matters for operator attribution.** The venue evidently knows who its certified datacenter operators are. It does not publish their identity, so the operator remains undetermined for Urdais, but the failure is one of disclosure rather than of the market not having operators.

## Experiment 3 — Region Evidence Across Providers

Re-opened and verified directly rather than taken from Phase 1.

### Azure, verified unauthenticated

`https://prices.azure.com/api/retail/prices` filtered to `armSkuName eq 'Standard_ND96isr_H100_v5' and priceType eq 'Consumption'` returned **HTTP 200 without authentication**, 138 records across **24 distinct `armRegionName` values**, each with `retailPrice`, `unitOfMeasure` of "1 Hour", `currencyCode`, `effectiveStartDate`, and `productName` separating Linux from Windows.

### AWS, verified unauthenticated

`region_index.json` returned **HTTP 200**, **106 regions**, a single catalog version `20260910195514` across all of them, and a top-level **`publicationDate` of 2026-09-10T19:55:14Z**. That is the only whole-catalog effective timestamp found in either phase.

### Lambda, schema verified from the published specification

The documentation site did not render, but `https://cloud.lambda.ai/api/v1/openapi.json` returned **HTTP 200 unauthenticated**, giving the specification itself rather than a paraphrase of it.

`GET /api/v1/instance-types` is described as returning "the instance types currently offered on Lambda's public cloud, as well as details about each type. Details include resource specifications, pricing, and regional availability." Security is `bearerAuth` or `basicAuth`.

`regions_with_capacity_available` is a **required** array of `Region`, described as "A list of the regions in which this instance type is available". Being required and an array, it can be empty, so the field can express absence of capacity. `Region` carries `name`, "The region code", and `description`, "The region description", with the specification's own example pairing `us-west-1` with "California, USA".

`InstanceType` carries `name` with example **`gpu_8x_h100_sxm5gdr`**, `description` "8x H100 (80 GB SXM5)", `gpu_description` "H100 (80 GB SXM5)", `price_cents_per_hour` as an integer, and `specs` with required `vcpus`, `memory_gib`, `storage_gib` and **`gpus`**.

Two consequences. The `gpu_description` string states SXM5 and 80 GB directly, so **the child's strongest hardware-identity grade is satisfiable from a machine-readable field**. And `price_cents_per_hour` is the price of the **instance**, not of one accelerator, so a per-accelerator figure requires division by `specs.gpus`, which is permitted only within a declared topology class.

A live call to `https://cloud.lambda.ai/api/v1/instance-types` returned **HTTP 401** with `global/invalid-api-key` and the message "Make sure to pass an API key in the AUTHORIZATION header when making requests." The key requirement is verified, and no attempt was made to satisfy it. **Lambda's minimum H100 topology is therefore determinable from this endpoint but was not determined here**, because it requires the key.

### RunPod, documentation verified

The catalog endpoint's `AVAILABILITY` expansion returns "Overall GPU availability for the requested `product` contexts", "Per-datacenter GPU availability", and CUDA versions. Availability values are **NONE, LOW, MEDIUM and HIGH**. Contexts are **POD, CLUSTER and SERVERLESS**, and "Availability is product-specific, so this is required whenever availability is requested." The `count` parameter sets "GPU count for availability and lowest-price calculations", defaulting to 1. Authentication is by bearer API key.

**Availability there is conditional on the requested quantity**, which means an availability answer is only meaningful when asked at the child's minimum topology.

### Region mapping evidence

| Provider | Native identifier | Example | Geographic evidence | Canonical target | Confidence |
|---|---|---|---|---|---|
| Azure | `armRegionName` | `japaneast`, `japanwest` | `location` field, "US Central" | JP, JP | High |
| Azure | `armRegionName` | `westeurope` | `location` field | Requires the published datacenter location | Medium |
| AWS | region code | `us-east-1` | Published region table | US | High |
| Lambda | `Region.name` + `description` | `us-west-1` / "California, USA" | The description itself | US | High |
| Vast.ai | `geolocation` + `geolocode` | "Virginia, US", ", US" | Two-letter code, documented as the filter granularity | US | High |
| RunPod | `DataCenter` / `DataCenterRegion` | documented types | Not retrieved, key-gated | Unresolved | Unknown |
| CoreWeave | Price-page table heading | "US", "EU" | Table heading only | US resolves; **EU does not resolve to a country** | Low |

The CoreWeave row is the reason the mapping rule needs an explicit refusal case rather than a best guess.

### Region granularity sensitivity

Computed over the 23 pre-bundle research candidates, which are the only observations carrying both region and availability.

| Taxonomy | Regions reaching two participants | Detail |
|---|---|---|
| Country | **1 of 6** | Only the United States, with 3 participants |
| Macro region | **3 of 3** | US 3, EU 3, APAC 2 |

Moving from country to macro region takes the number of publishable regions from one to three. **That is exactly the move the family forbids**, and the merge it performs is not cosmetic: an EU region would combine Germany at $2.0022 with Czechia at $2.6170, 31% apart, into a single number.

## Experiment 4 — Price Dynamics From Effective Dates

Phase 1 concluded that a single snapshot cannot measure update cadence. That is true of sources with no timestamps, but Azure's `effectiveStartDate` records when the **current** price took effect, so a single retrieval measures the age of prices in force.

Across the 138 H100 SKU meters, effective dates fell on **eleven distinct dates, every one the first of a month**: 2023-12-01, 2024-02-01, 2024-06-01, 2025-01-01, 2025-03-01, 2025-09-01, 2025-10-01, 2025-12-01, 2026-01-01, 2026-02-01 and 2026-03-01.

| Statistic | Age of the currently effective price |
|---|---|
| Minimum | 196 days, 6.4 months |
| Median | 955 days, 31.4 months |
| Maximum | 1017 days, 33.5 months |
| Share at least 180 days old | **100%** |

**Every currently effective Azure H100 price had been in force for at least six months, and prices change only on month boundaries.** Against that, the marketplace's per-offer prices and `rentable` states move continuously.

The two dimensions differ by orders of magnitude, which vindicates the family's separation of price freshness from availability freshness. It does **not** produce a numerical limit for the child's own population: the specialist clouds that make up the child's confirmed candidates publish no effective dates at all, and availability cadence was observed at a single instant.

## Experiment 5 — Bundle Envelope Sensitivity

Phase 1 measured specialist-cloud bundles at 16 to 26 virtual CPUs and 125 to 256 GB of host memory per accelerator, a spread of 1.62 and 2.05 times, with 40% of sellers not disclosing.

The marketplace is far more heterogeneous. Across the 23 pre-bundle research candidates, per accelerator:

| Resource | Minimum | Median | Maximum | Ratio |
|---|---|---|---|---|
| Virtual CPUs | 8.0 | 24.0 | 56.0 | **7.0x** |
| Host memory GB | 13.8 | 55.4 | 251.8 | **18.3x** |
| Local storage GB | 292 | 838 | 2532 | **8.7x** |

Applying the specialist-cloud band as a two-sided envelope:

| Population | Within vCPU band | Within RAM band | Within both |
|---|---|---|---|
| All 116 offers | 78% | 27% | **18%** |
| 23 research candidates | 65% | 22% | **9%** |

**A two-sided envelope drawn from specialist-cloud bundles removes 91% of those candidates**, and host memory is the binding constraint.

A one-sided floor behaves differently, and its level decides coverage:

| Floor, per accelerator | Eligible offers | Hosts | US hosts |
|---|---|---|---|
| none | 23 | 8 | 3 |
| 8 vCPU, 16 GB | 21 | 8 | 3 |
| 16 vCPU, 32 GB | 11 | 5 | 3 |
| 16 vCPU, 64 GB | 8 | 4 | 2 |
| 16 vCPU, 125 GB | 5 | **2** | **1** |

At a 125 GB floor the United States falls to one participant and stops publishing under the parent's structural floor. **Choosing the level would be choosing whether the index publishes**, which is the reason no level is chosen here.

## Availability Evidence Classes Observed

Ordered by strength, from what providers actually expose.

| Grade | Class | Observed at | Discriminating |
|---|---|---|---|
| 1 | Order-acceptance confirmation | **Nowhere without an account** | Would be |
| 2 | Offer-addressable capacity state | Vast `rentable`, verified, 23 of 116 true | **Yes** |
| 3 | Product-and-region capacity assertion | Lambda `regions_with_capacity_available`; RunPod NONE/LOW/MEDIUM/HIGH per datacenter | **Yes** |
| 4 | Catalog or price-API presence | Azure Retail Prices, AWS bulk price list | **No** |
| 5 | Price-surface presence | Nine specialist-cloud price pages | **No** |
| 6 | Absent, or quote-required | Voltage Park | n/a |

The dividing line falls between grades 3 and 4, and it is not granularity. **Grades 1 to 3 can each express "not obtainable" for the specified product; grades 4 and 5 structurally cannot.** A SKU never disappears from a price catalog because capacity ran out.

## Decisions Recommended to the Child

Recorded here with evidence; made in the methodology document.

| Parameter | Prior state | Evidence | Recommendation | Confidence | Launch blocker remains |
|---|---|---|---|---|---|
| Region taxonomy | Unresolved | 92.2% country-only; documented country filter; country derivable at Azure, AWS, Lambda | **Country, ISO 3166-1 alpha-2** | High | **No** |
| Region mapping | Unresolved | Native shapes and geographic evidence per provider | Versioned mapping with an explicit refusal case | High | **No** |
| Availability evidence scale | Unresolved | Six classes observed | Six-grade scale on the discriminating test | High | **No** |
| Availability minimum | Unresolved | Grades 4 and 5 cannot express absence | **Grade 3** | Medium-high | **No** |
| API access and eligibility | Not posed | 3 of the richest sources key-gated | Separate economic, source-observable and P2 populations | High | No, but gates coverage |
| Minimum topology | Unresolved for 4 sellers | `num_gpus` minimum per machine; `specs.gpus`; `minPodGpuCount`; SKU definitions | Observed field only, never the denominator | High | **No** as a rule; yes for unobserved sellers |
| `gpu_frac` trap | Not known | Exact for 35 of 35 machines; uniform 80 GB | Machine fraction, never a device fraction | High | No |
| Seller reduction | Unsettled | 6 cells; median above minimum by up to 18.95%; regional value unmoved at N=3; enumeration incomplete | **Minimum retained, still unratified** | None by construction | **Yes** |
| Bundle envelope | Unresolved | 7x, 18.3x, 8.7x dispersion; 9% survive a two-sided band; floor level decides publication | **Form resolved as a floor; level unresolved** | Medium on form, none on level | **Yes** |
| Tenancy grade | Rule only | Concepts page states an instance has "exclusive access to the GPUs you rented"; no contradicting primary source; no partitioning concept in the venue's documentation | Explicit and Documented only; **marketplace grades Documented** | High | **No** |
| Operator attribution | Unresolved | 0 of 13; venue holds identity but does not publish | Diagnostic, never a gate | High | **No** |
| Marketplace seller ID | Unresolved | Documented as a user account; stable within session; cross-time untested | Provisional key with a named unresolved state | Medium | **Yes** for marketplace participation |
| Price freshness architecture | Unresolved | Azure dates; AWS publication date; silence elsewhere | Source-effective and observed times, absence as null | High | **No** |
| Availability freshness architecture | Unresolved | No change timestamp anywhere; `end_date` is an expiry | Re-observation time, explicitly not a change time | High | **No** |
| Numerical freshness ages | Unresolved | 100% of Azure prices at least 196 days old; availability at one instant | **Unresolved**; ordering constraint only | None | **Yes** |
| Carry | Unresolved | Availability can flip with no price change | No carried Available; bounded price carry, limit unresolved | Medium | **Yes** for the limits |
| Tax basis | Unresolved | One explicit statement; most silent | Evidence by general terms; unresolved flagged, not disqualifying; tax-inclusive ineligible | Medium | **Yes** for the gate share |
| Mandatory fees | Unresolved | `dph_total` composition exact to 0.0; transfer per GB | Included storage in, transfer out, promotional fields never used | High | **No** |
| Publication gates | All unresolved | Four become structurally zero | Four closed by construction, four numeric unresolved | Mixed | **Yes** for the numeric four |
| Percentage change | Partly resolved | Composition sensitivity | Published, annotated or withheld by named condition | High | **No** |
| Composition change | Rule only | Six event types nameable | Enumerated, annotated, mapping change withholds | High | **No** |

## Limitations

**One venue, one instant.** The marketplace is one of thirteen researched sellers and the only one where availability, region and multi-offer structure could all be observed at once without a key. Its hosts are not representative of specialist clouds, its bundles are far more heterogeneous, and its participants are individual host accounts rather than companies.

**The denominator is unknown.** No availability rate is reported because the interface cannot enumerate the population.

**Three of the richest sources were not called.** Lambda, RunPod and DigitalOcean require keys. Their field shapes are recorded from their own published specifications and documentation, and no behaviour of those endpoints is claimed.

**Four providers remain unresearched** from Phase 1: Nebius, Crusoe, Hyperstack and CoreWeave beyond its price page.

**No cross-time observation exists.** Identifier stability, price cadence for specialist clouds, and availability cadence all require repeated observation that this phase did not perform.

**The 23 research candidates are not P2 observations and must never be reported as any.** They satisfy hardware identity, service product, procurement mode, topology class, tenancy and availability. They have not been tested against the bundle envelope, whose level is unresolved; they carry no established tax basis; their freshness cannot be assessed against unresolved ages; and their seller-level reduction depends on a rule that is not ratified and on an offer set that is not enumerable. **P2 remains empty.**

## Potential Parent Issues

**None.** Every decision above was expressible within the family methodology as written. The family's separation of source quality from observation type, its availability state vocabulary, its three freshness dimensions, its capacity-source definition with seller fallback, its prohibition on inferring operator identity, its structural floor, and its requirement that a child declare a bundle envelope all survived contact with the evidence and in several cases determined the answer. **The parent was not modified.**

One observation is offered without requesting an amendment. The family's seller-reduction discussion assumes the offer set within a cell is known. This study showed a venue where it demonstrably is not. The child handles this with a source diagnostic, and if incomplete enumeration proves common across venues the family may wish to address it directly at the next family amendment.

## Sources

All retrieved 13 September 2026.

**Verified by direct call**: [Vast.ai bundles search](https://cloud.vast.ai/api/v0/bundles/), thirteen requests, all HTTP 200, including an H100-filtered query returning 64 records and a rentable-filtered query returning 16. [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), HTTP 200 unauthenticated, 138 H100 SKU records across 24 regions. [AWS EC2 bulk price list region index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json), HTTP 200, 106 regions, publication date 2026-09-10T19:55:14Z. [Lambda Cloud OpenAPI specification](https://cloud.lambda.ai/api/v1/openapi.json), HTTP 200 unauthenticated, read for the instance-types schema. [Lambda instance types](https://cloud.lambda.ai/api/v1/instance-types), **HTTP 401**, confirming the documented key requirement.

**Documentation read**: [Vast.ai search offers reference](https://docs.vast.ai/api-reference/search/search-offers), for field definitions, the country-code filter granularity, and the absence of a documented limit or pagination. [Vast.ai Concepts](https://docs.vast.ai/guides/concepts.md), for the definition of an instance as an isolated environment "with exclusive access to the GPUs you rented", which is the primary support for grading that venue's tenancy Documented. [Vast.ai hosting overview](https://docs.vast.ai/host/hosting-overview), for host accounts and offer end dates. [Vast.ai security FAQ](https://docs.vast.ai/guides/reference/faq/security.md), for container isolation, and as the page whose silence produced the superseded Ambiguous grade. [Vast.ai datacenter status](https://docs.vast.ai/host/datacenter-status.md), for certified datacenter requirements. [RunPod list GPU types](https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types), for the availability expansion, its four values, its contexts and the count parameter.

**Not retrieved**: RunPod `DataCenter` region values, Lambda's live H100 instance list, and DigitalOcean sizes, all key-gated. Nebius, Crusoe and Hyperstack H100-bearing endpoints remain unestablished from Phase 1.

## Research History

**12 September 2026**: the initial child specification and broad price-page study established the P0, P1 and P2 population structure and concluded that the public price surface does not carry the required fields.

**12 September 2026**: independent review corrected the empirical record, separating a marketplace platform aggregate from participant observations and reclassifying topology by minimum purchasable quantity.

**13 September 2026**: the production data source study found that the missing fields largely exist in APIs and moved the binding constraint from discovery to access.

**13 September 2026**: correction to that study. An unfiltered 64-row marketplace sample had been treated as H100 evidence; it contained 2 H100 SXM rows. The availability rate, multi-offer count and operator-identity claim drawn from it were withdrawn, and `host_id` was reclassified as a marketplace host and seller identifier.

**13 September 2026, this study**: the first targeted parameter-closure work. The H100-filtered sample that Phase 1 named as its prerequisite was obtained, producing the first comparable cells and the first measured accessible-capacity counts for this product, and establishing that the venue's interface cannot enumerate its own population.

**13 September 2026, correction before merge.** The marketplace's tenancy was first graded Ambiguous on the ground that its documentation did not state device exclusivity. That was a failure to read the right page: the venue's Concepts documentation states that an instance has "exclusive access to the GPUs you rented". The grade is corrected to **Documented**, which removes marketplace tenancy from the child's launch blockers. The tenancy rule itself was not changed, and the correction creates no P2 observations. In the same pass the research population previously called "23 eligible offers" was relabelled **pre-bundle research candidates**, because calling offers eligible before the bundle envelope and several other P2 requirements have been applied overstated their status; and the enumeration argument was tightened from "biased upward" to the exact statement that a subset minimum is weakly greater than or equal to the complete-set minimum.
