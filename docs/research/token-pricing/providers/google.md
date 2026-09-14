# Google

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026.

1. Official Developer API pricing: https://ai.google.dev/gemini-api/docs/pricing (last updated 2026-09-11 UTC).
2. Official docs: Gemini API docs; Vertex counterpart https://cloud.google.com/vertex-ai/generative-ai/pricing — **do not mix**.
3. Variants retrieved include Gemini 3.8/3.7/3.6/3.5 Flash, 3.5/3.1 Flash-Lite, 3.1 Pro Preview, Live/image/Omni, Gemma 4 (paid tokens not available).
4–6. Input; output **including thinking tokens at the output rate**; context caching token price; plus a **storage** price per 1M tokens per hour (out of the USD/1M inference object).
7. Batch: typically 50% of Standard on paid Flash/Pro rows. Flex matches Batch on several Flash rows. Priority is a premium (e.g. 1.8× on 3.8 Flash promo rates).
8. Context-length tiers: Pro-class rows use prompts ≤200k vs >200k. Many Flash rows are a single band.
9. Currency: USD. 10. Denominator: per 1M tokens in USD.
11. Platform differences: Free vs Paid vs Enterprise; Google AI Studio usage called free in available regions; Gemini Enterprise Agent Platform may differ; Vertex is another price list. Paid vs unpaid also changes **training-on-data** terms, not the list price.
12. Effective dates: several Flash promos through 31 Dec 2026, then a higher rate on 1 Jan 2027 — store as `source_effective_at`, not as history.
13. Old pricing: page overwrites; promotional windows are the main official time structure.
14. Machine-readable: Developer API pricing is HTML. Vertex may be reachable via Cloud Billing Catalog (separate interface/terms).
15. Automation: robots.txt for `ai.google.dev` redirected to login — **unclear**. Gemini Additional Terms govern API use.
16. Attribution: API terms mention attribution for **generated** content in some cases, not for republishing the price table.

Gemma paid API token prices were listed as not available. Image/audio minute equivalents are out of scope.
