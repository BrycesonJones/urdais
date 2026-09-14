# Wave 2 Token Price fit assessment — Google, DeepSeek, Alibaba/Qwen

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. No methodology is changed here, no observation is written, and no constituent is designated. This document exists because two of the three Wave 2 providers cannot be expressed under the current Urdais Token Price methodology without amending it, and the third rests on a designation judgment that materially moves the published number.

## What was retrieved

Research reads of the three first-party pricing surfaces on 14 September 2026 at 17:05 UTC. All three source interfaces are `research_usable` with both review axes `under_review`, which is the same rights posture Wave 1 published under; a research read is what that state permits, and nothing here is a production retrieval.

| Provider | URL | HTTP | Bytes | SHA-256 of response |
|---|---|---|---|---|
| DeepSeek | `https://api-docs.deepseek.com/quick_start/pricing/` | 200 | 23,359 | `755aa9b488d1185cba016ca4de3b3b6b8f593f5e13e5f9f961305289a5c8d242` |
| Google | `https://ai.google.dev/gemini-api/docs/pricing` | 200 | 241,803 | `edcf4dea36eab8666aae1d3a5326e65d47a44db8b769d9ebe6013d1f01e451a5` |
| Alibaba | `https://www.alibabacloud.com/help/en/model-studio/model-pricing` | 200 | 437,525 | `3c837f3653c3e792a6bae5d6f53d0961c6cb4494d48f9bbd544c8a39503b7a0d` |

The responses are held outside the repository. The hashes make each one verifiable on re-retrieval; retained artifacts in the Wave 1 fixture form are not created until a provider is cleared to proceed.

## DeepSeek — blocked, hard incompatibility

**The provider publishes no standard rate.** Every DeepSeek price is split into peak and off-peak, and the page defines the split in hours:

> Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday (all other hours are off-peak).

Published rates per 1M tokens for `deepseek-v4-pro` (model version DeepSeek-V4-Pro-0813):

| Dimension | Off-peak | Peak |
|---|---|---|
| Input, cache miss | $0.66 | $1.32 |
| Output | $1.98 | $3.96 |
| Input, cache hit | $0.022 | $0.044 |

`isEligibleLeg` requires `serviceTier === "standard"`. DeepSeek has no such tier, so no leg is eligible and the benchmark is withheld with `INPUT_LEG_UNAVAILABLE`. The canonical vocabulary already carries `peak` and `off_peak` as distinct service tiers, so the data can be ingested faithfully; it simply cannot be selected.

This is not a case where one rate is obviously the list price and the other a discount. Peak covers 35 of the 168 hours in a week, about 21%. Off-peak is the majority condition. Choosing peak overstates the ordinary cost of the workload by a factor of two; choosing off-peak understates the cost of running it during business hours in Asia and Europe; averaging them requires a time-weighting rule that the methodology does not contain and that would have to be defended.

**Proposed amendment, for decision.** Three options, none implemented:

1. **Designate peak as the standard rate.** Simplest, consistent with treating time-limited reductions as discounts. It publishes a number that applies about a fifth of the time, and quietly makes Urdais's DeepSeek figure the most expensive reading available.
2. **Add an explicit time-weighted tier rule to the methodology.** Weight peak and off-peak by their published share of the week, giving an input leg of `0.208 × 1.32 + 0.792 × 0.66 = $0.797` and an output leg of `$2.39`, for a Token Price of about $1.60. Defensible and genuinely representative, but it is a new rule that would then need to apply to every provider with time-varying rates, and it makes the benchmark depend on a schedule that the provider can change.
3. **Leave DeepSeek out of the benchmark and carry the observations only.** Ingest both tiers as canonical data, publish nothing. Honest, and it keeps the standardized workload meaning one thing across providers.

Option 3 is what the current methodology already does by itself, without any amendment. Option 2 is the most informative and the most work.

## Alibaba / Qwen — blocked, region incompatibility

Published rates for `qwen3.8-max`, deployment scope **International**, non-thinking and thinking modes, band `0<Token≤1M`:

| Dimension | Price per 1M tokens |
|---|---|
| Input | $2.00 |
| Output | $6.00 |

That yields a Token Price of **$4.00** under the current 0.5/0.5 workload, and the single `0<Token≤1M` band means no context-tier surcharge applies, so `baseContextTier` would be null as it is for Anthropic.

**The obstacle is the region axis.** Every row on the Alibaba catalog carries a deployment scope, and the same model is priced differently by region: Phase 1 recorded China (Beijing) at $1.65 input and $4.951 output against the International $2.00 and $6.00. `isEligibleLeg` requires `region === null`, meaning the provider's default, unscoped rate. Alibaba publishes no such rate. Recording the International figure with `region = null` asserts a global default the source does not state, and collapses exactly the distinction Phase 1 warned against. Recording it as `region = "international"` is faithful and makes the leg ineligible.

**Proposed amendment, for decision.** Extend the constituent designation with a declared base region, the way it already declares a base context tier: a provider whose catalog is region-scoped gets a named region on its constituent, and `isEligibleLeg` matches that instead of requiring null. This is a small, symmetric change to a mechanism the methodology already has, and it leaves Wave 1 untouched because those constituents would declare a null base region. It is still a methodology change, so it is not implemented here.

Secondary caveats, all handled by existing exclusions once the region question is settled: the Singapore free quota is promotional and is not a list rate; batch is 50% and is a separate service tier; context caching is a separate pricing dimension; `qwen3.8-max` and the dated `qwen3.8-max-0902` carry identical International rates, and the dated id is the stable identity with the undated one as an alias.

## Google / Gemini — not blocked by methodology, blocked on designation

Google fits the mechanism. The Developer API price list is global with no region axis, the Pro rows use a prompts-≤200k and prompts->200k split that the existing `baseContextTier` handles, output prices include thinking tokens at the output rate, and free, batch and caching rates are all excluded by rules already in force.

What is not obvious is which model is the constituent. The criterion established in Wave 1 is the provider's current, broadly available flagship frontier model. Google currently offers no model that satisfies all three words at once.

| Candidate | Input | Output | Token Price | Objection |
|---|---|---|---|---|
| `gemini-3.1-pro-preview` | $2.00 | $12.00 | **$7.00** | Preview. Google ships no generally available 3.x Pro |
| `gemini-2.5-pro` | $1.25 | $10.00 | **$5.625** | Generally available flagship Pro, but two generations behind |
| `gemini-3.8-flash` | $0.75 | $3.75 | **$2.25** | Newest and generally available, but Flash class, and the rate is promotional through 31 December 2026, rising to $1.50 and $7.50 on 1 January 2027 for a Token Price of $4.50 |

All figures are the paid-tier standard rate at prompts ≤200k.

The preview model is the one Google positions as its current Pro, describing it as "Our 3rd generation Pro model", and it is broadly available in the sense that mattered for excluding Claude Mythos: anyone on the paid tier can call it, and it is not restricted to vetted organisations. Against that, a preview's price and availability can change without the notice a GA model gets, and the constituent is meant to be stable.

The Flash option should be rejected regardless of the above: designating a model whose published rate doubles on a known future date would put a scheduled step change into the benchmark for reasons that have nothing to do with the market.

**Recommendation.** Designate `gemini-3.1-pro-preview`, effective 14 September 2026, with a rationale recording that Google publishes no generally available 3.x Pro and that the designation should be revisited when one ships. This needs no methodology change, only a constituent entry. It is a judgment about selection, which is the kind of decision that was corrected by hand in Wave 1, so it is put here rather than taken silently.

## Summary

| Provider | Model | Token Price | State |
|---|---|---|---|
| Google | `gemini-3.1-pro-preview` | $7.00 | Ready to implement once the designation is confirmed |
| DeepSeek | `deepseek-v4-pro` | not computable | Blocked: no standard service tier |
| Alibaba | `qwen3.8-max` | $4.00 | Blocked: no region-neutral list price |

Wave 1 is untouched. Anthropic $30.00, OpenAI $30.00 and xAI $4.00 keep their frozen values and lineage, and nothing in this document reads or writes production data.
