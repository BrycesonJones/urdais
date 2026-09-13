# Lambda Launch-Readiness Evidence

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026 from Lambda's public documentation, its public OpenAPI specification and its public price surface, read on that date. No authenticated request was made and no account was created. Nothing here changes Lambda's permission classification, which remains `under_review` on collection, `not_permitted` on index use and `production_blocked`, with a permission request pending.

## Product

The decisive question was whether Lambda currently exposes an eligible **1× H100 SXM** product. It does, on both surfaces read.

| Question | Finding | Evidence |
|---|---|---|
| Instance type | **`gpu_1x_h100_sxm5`**, described as **"1x H100 (80 GB SXM5)"** | OpenAPI specification at `cloud.lambda.ai/api/v1/openapi.json`, 13 Sept 2026, instance-type examples; the 8× type `gpu_8x_h100_sxm5` also appears |
| Price surface | **1× $4.29, 2× $4.19, 4× $4.09, 8× $3.99 per GPU per hour**, on-demand, "plus applicable sales tax/VAT/GST" | `lambda.ai/pricing`, 13 Sept 2026. This resolves the 0.1.1 gap: the size selector the 12 September snapshot could not read is now read |
| Hardware identity grade | **Grade A**: SXM5 and 80 GB stated in the instance description | OpenAPI examples; price surface "VRAM/GPU 80 GB" |
| GPU count and denominator | `specs.gpus` = 1 for the 1× type; price is stated per GPU per hour and the API returns `price_cents_per_hour` per instance; the per-accelerator figure is a unit conversion within the class | OpenAPI schema |
| Per-accelerator allocation | The seller sells singly, so the class is per-accelerator and the canonical quantity under the 0.1.3 rule is **1**; the 2×, 4× and 8× types are quantity variants in the same cell | Child cell definition |
| Bundle for 1× | 26 vCPU, 225 GiB host RAM, 2.75 TiB SSD | On-demand docs and price surface |
| Procurement mode | On-demand, billed "in one-minute increments" for as long as the instance runs; reserved capacity is a separate product with separate pricing | Billing docs; price surface |
| Preemptibility | Lambda exposes **no spot or interruptible on-demand product** and no bid mechanism; on-demand billing runs until the customer terminates. **No explicit statement that Lambda never reclaims a running on-demand instance was found**; the classification as non-preemptible rests on the product's definition and the absence of any interruption product, and that is recorded as the basis | Billing docs; price surface; on-demand overview |
| Service product | "Linux-based, GPU-backed virtual machine instance" | On-demand overview |

**A caution the child requires.** The 1× type is in the OpenAPI examples and on today's price surface; whether it is **offered in a given region on a given date** is answered only by `regions_with_capacity_available` on the live endpoint, which returned HTTP 401 unauthenticated on 13 September. "Not every instance type will be available in every region" (on-demand overview). The product exists; its regional presence is a collection-time fact.

## Geography

Lambda publishes a first-party regions table with a physical location for every code. All fourteen map to a country at high confidence from Lambda's own description, satisfying the child's mapping contract without inference from the code's spelling.

| Region code | Lambda's stated location | Country |
|---|---|---|
| `asia-northeast-1` | Tokyo, Japan | JP |
| `asia-northeast-2` | Osaka, Japan | JP |
| `asia-south-1` | India | IN |
| `europe-central-1` | Germany | DE |
| `me-west-1` | Israel | IL |
| `us-east-1` | Virginia, USA | US |
| `us-east-2` | Washington DC, USA | US |
| `us-midwest-1` | Illinois, USA | US |
| `us-south-1` | Texas, USA | US |
| `us-south-2` | North Texas, USA | US |
| `us-south-3` | Central Texas, USA | US |
| `us-west-1` | California, USA | US |
| `us-west-2` | Arizona, USA | US |
| `us-west-3` | Utah, USA | US |

Source: `docs.lambda.ai/public-cloud/on-demand/`, 13 September 2026. The OpenAPI `Region` object pairs `name` with `description`, so each live response carries its own mapping evidence as well.

## Tenancy

**Classification: Ambiguous. This is the one substantive non-permission blocker found for Lambda.**

The child admits only Explicit and Documented grades to P2, and grades Documented "where official product documentation establishes a full-device product without using the word", adding that "silence is not converted into certainty". The evidence:

- The instance description "1x H100 (80 GB SXM5)" and the 80 GB VRAM/GPU specification establish that the product is **one full device**, not a partition.
- The only tenancy statement in Lambda's documentation is product-specific and about a different accelerator: *"Lambda GH200s are single-tenant instances. However, networking and file storage are multi-tenant."* (on-demand troubleshooting page, 13 September 2026). Lambda evidently states tenancy where it chooses to, and has not stated it for H100.
- The access-and-security, guest-agent, instance-management and on-demand overview pages contain no statement about exclusivity, passthrough, hypervisor or shared GPUs. The Cloud Terms recorded in the terms review contain none either.

Under the child's rule this is **Ambiguous**: neither clearly exclusive nor clearly shared, a full device established but exclusivity not. Lambda observations would carry `TENANCY_UNRESOLVED` and would not reach P2. The 0.1.1 marketplace case was closed by finding a statement that had been missed; here the documentation has been searched and the statement is not there.

**Resolution path.** A one-sentence statement from Lambda that on-demand H100 instances hold their GPUs exclusively, comparable to its GH200 statement, would grade Documented. That request belongs in the pending permission conversation and is on the checklist in the launch-readiness matrix. An alternative evidentiary route, hardware documentation establishing that exposing a full 80 GB device to one virtual machine is necessarily single-tenant, was not pursued here and is not assumed.

## Availability

**Grade 3, satisfied by design; live values unobserved.** `regions_with_capacity_available` is a **required** array on every instance type and can be empty, so the field can express absence; a region present in the list maps to **Available** for that country, a region absent while the type exists in the catalog maps to **Sold out**, both at Grade 3 and both at the instance's own quantity, which for the 1× type is the child's minimum topology. The endpoint is key-gated (HTTP 401 unauthenticated, 13 September 2026), so no live value was read.

## Price components and bundle

| Item | Finding | Treatment |
|---|---|---|
| GPU rate | $4.29 per GPU-hour at 1×, 13 Sept 2026 | The observation under the canonical-quantity rule; the 8× $3.99 is not selected |
| Billing granularity | One-minute increments, from launch after health checks, while running | Unit conversion |
| Root volume | 2.75 TiB SSD included with the 1× instance | **Inside** the price as an included allocation |
| Filesystems | Optional, "billed per GiB used per month in one-hour increments", continue to bill while unmounted | Outside |
| Data transfer | "you are not charged for ingress or egress" | None |
| Platform or setup fee | None found | None |
| Tax basis | Price surface: "plus applicable sales tax/VAT/GST"; billing docs: charges include sales tax based on billing location, i.e. added at billing | **Exclusive**, established by general terms |
| Host bundle | 225 GiB per accelerator at 1× | ≥ 80 GB floor: **within the envelope** |

## What only an authenticated call or Lambda itself can settle

1. Whether `gpu_1x_h100_sxm5` currently lists any region in `regions_with_capacity_available`, and which.
2. A tenancy statement for H100 on-demand instances (Lambda, not the API).
3. Confirmation that on-demand instances are not reclaimed (Lambda), which would move the preemptibility basis from product definition to statement.
4. The live `price_cents_per_hour` for the 1× type, to confirm the price-surface reading.

## Permission, unchanged

`terms_review_state = under_review`, `data_use_terms_state = not_permitted`, `production_access_state = production_blocked`, `written_agreement_required = true`. A request under the Cloud Terms' express carve-out is pending. Nothing here is a basis for collection.
