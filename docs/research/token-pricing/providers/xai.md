# xAI

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026.

1. Official pricing: https://docs.x.ai/docs/models (same table at https://docs.x.ai/developers/models).
2. Official docs: https://docs.x.ai/docs/introduction; rate limits at consumption-and-rate-limits.
3. Current Grok text models: `grok-4.6`, `grok-4.5`, `grok-4.3`, `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning`, `grok-build-0.1`, `grok-4.20-multi-agent-0309`.
4–6. Input, cached input, output per 1M tokens. Grok 4.6 <$200k: $2 / $0.50 / $6; ≥200k: $4 / $1 / $12.
7. Batch: "Not every model accepts Batch API requests. See Details on each model page." **Batch token rates were not on this table** — unresolved, do not assume 50%.
8. Context tiers: two rows per model at a 200k prompt threshold. "requests whose prompt reaches the listed token threshold are billed at the higher rate for **all tokens** in the request."
9. Currency: USD. 10. Denominator: per million tokens.
11. Region: none on the text table.
12. Effective date: not published on the table. Knowledge cutoff for Grok 4.6 stated as 1 Feb 2026 (not a price date).
13. Old pricing: not on the page.
14. Machine-readable pricing API: **no** on this retrieval. Inference is `https://api.x.ai/v1`.
15. Automation: robots `Allow: /` and Content-Signal `ai-train=no`; contractual reuse **unclear** (legal URL 403 via some clients).
16. Attribution: none isolated.

Imagine/voice SKUs are not USD/1M text tokens. `latest` aliases are not stable identities; dated ids (`grok-4.20-0309-reasoning`) are.
