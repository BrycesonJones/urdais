# Alibaba / Qwen

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026.

1. Official model pricing: https://www.alibabacloud.com/help/en/model-studio/model-pricing (also billed conceptually via https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio). Model catalog: https://www.alibabacloud.com/help/en/model-studio/models
2. Official docs: Alibaba Cloud Model Studio / DashScope. International compatible-mode endpoint documented on qwen.ai as `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; Beijing `dashscope.aliyuncs.com`; US Virginia `dashscope-us.aliyuncs.com`.
3. Frontier Qwen ids (examples): `qwen3.8-max`, `qwen3.8-max-0902`, `qwen3.7-plus` (`currently equivalent to qwen3.7-plus-2026-05-26`), `qwen3.8-flash`, plus many dated predecessors.
4–6. International `qwen3.8-max`: input $2, output $6 per 1M tokens (0<Token≤1M). The qwen3.8-max model-info page also lists International implicit cache $0.25, explicit cache creation $2.50, explicit cache read $0.17. China (Beijing) list for the same model: input $1.65, output $4.951, implicit cache $0.206, etc.
7. Batch: many rows labelled "50% batch inference discount"; treat batch as `service_tier=batch`, not a silent 50% of International if the page already shows a post-discount number — parse the row as published.
8. Context bands vary by model (32k, 128k, 256k, 1M). Do not map them onto OpenAI/xAI 200k without keeping the native band.
9. Currency: the **English international catalog quotes USD**. A CNY-only mainland page was not used as authority in this pass.
10. Denominator: per 1 million tokens.
11. Region dependence: **yes**. International, China (Beijing), Hong Kong, US, Japan rows differ. Night/day limited-time discounts appear on some Global/HK plus rows. Phase 2 should ingest International list price first, one region per observation.
12. Effective dates: page "Last Updated: Sep 14, 2026" on the models overview. Promotions are time-limited; dated model ids are the stable product keys.
13. Old pricing: dated ids remain listed; `latest` / "currently equivalent" pointers are not a history.
14. Machine-readable: HTML. robots.txt disallows `*.json` and `/api/*`.
15. Automation: HTML help not disallowed; JSON APIs look disallowed; website terms shell was too thin to classify — **unclear**.
16. Attribution: none isolated.

Do not collapse International $2/$6 with Beijing $1.65/$4.951. Do not treat promotional "20% off" as the canonical list price without storing that it is promotional (`PROMOTIONAL_PRICE` exists in UCPI vocabulary; token observations should simply not ingest the discounted number as the list rate, or store it with a promo facet in a later amendment — Phase 1 stores the published **list** figure and notes limited-time off as a complication).
