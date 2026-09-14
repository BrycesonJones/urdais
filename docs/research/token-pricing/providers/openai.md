# OpenAI

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026.

1. Official pricing URL: https://platform.openai.com/docs/pricing (https://openai.com/api/pricing returned 403).
2. Official docs: https://platform.openai.com/docs/guides/batch (Batch API, 50% vs synchronous).
3. Models currently priced (text, abbreviated): `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-cyber`, `gpt-5.3-codex`, plus ChatGPT `chat-latest` (alias-like).
4–6. Input, output, cached input, and cache writes are separate columns. Short vs long context are separate bands. Example standard short-context Sol: input $4, cached input $0.40, cache writes $5, output $20 per 1M.
7. Batch: documented 50% discount vs synchronous APIs; pricing tables repeat the grid at half.
8. Context-length tiers: Short context vs Long context columns. Exact token cutoff was not in the fetched markdown table headers — unresolved, do not invent.
9. Currency: USD. 10. Denominator: 1M tokens.
11. Region: "Regional processing (data residency) endpoints are charged a 10% uplift for models released on or after March 5, 2026". Bedrock billed through AWS; commercial-region Bedrock said to match OpenAI direct for equivalent services — treat as a different invoice unless verified.
12. Effective dates: Sol promotional pricing "at least through November 21, 2026"; Rosalind billing begins 5 Oct 2026; Fast mode renamed from Priority on 30 Jul 2026 (`service_tier: "priority"` or `"fast"`).
13. Old pricing: deprecations page exists; past token rates are not kept as a time series on the pricing page.
14. Machine-readable pricing API: **no**. Models API is ids/metadata.
15. Automated retrieval: robots allow `/docs/pricing`; contractual permission **unclear** (terms URL 403).
16. Attribution: none isolated beyond ordinary trademark use.

Complications: model-family versioning (`gpt-5.6-*`, `gpt-6-astra`); reasoning models share the same input/output grid rather than a separate reasoning SKU on this page; Fast vs Standard vs Batch must not be collapsed.
