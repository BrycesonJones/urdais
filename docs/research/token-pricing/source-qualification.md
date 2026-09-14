# Source qualification

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026. Third-party comparison sites were not used as authority. Prices below are evidence of published structure, not Urdais market values.

The target object is a first-party **API** list price, not a consumer subscription. `anthropic.com/pricing` and `claude.com/pricing` mix Claude Pro/Max seats with API cards; the authoritative API table is `docs.anthropic.com`. `openai.com/api/pricing` returned HTTP 403 to this retrieval; `platform.openai.com/docs/pricing` succeeded.

## Retrieval log

| Source | URL | Result | Notes |
| --- | --- | --- | --- |
| OpenAI pricing | https://platform.openai.com/docs/pricing | 200 (docs fetch) | Unit: prices per 1M tokens. Short vs long context; cached input; cache writes; batch at 50%; Fast mode; 10% regional-processing uplift. |
| OpenAI marketing pricing | https://openai.com/api/pricing | 403 | Not used. |
| Anthropic API pricing | https://docs.anthropic.com/en/docs/about-claude/pricing | 200 | USD / MTok. Cache write 5m/1h, cache hits, batch 50%, Fast mode, US-only 1.1x on 4.6+. |
| Anthropic models | https://docs.anthropic.com/en/docs/about-claude/models | 200 | Native API ids, aliases, Bedrock/Vertex/Foundry ids. Dateless ids from 4.6+ are pinned snapshots. |
| Gemini Developer API | https://ai.google.dev/gemini-api/docs/pricing | 200 | USD / 1M tokens. Standard/Batch/Flex/Priority. Context caching + storage/hour. Last updated 2026-09-11 UTC. |
| Vertex AI generative pricing | https://cloud.google.com/vertex-ai/generative-ai/pricing | 200 | Separate Google Cloud surface; do not silently substitute for the Developer API. |
| xAI models | https://docs.x.ai/docs/models | 200 | USD / 1M tokens. Cached input. Long-context threshold 200k bills **all** tokens at the higher rate. |
| DeepSeek pricing | https://api-docs.deepseek.com/quick_start/pricing | 200 (curl) | USD / 1M tokens. Cache hit vs miss. Peak vs off-peak. WebFetch returned 409; HTML table was retrieved directly. |
| Alibaba Model Studio pricing | https://www.alibabacloud.com/help/en/model-studio/model-pricing | 200 | USD per 1 million tokens. International vs China/HK/US/Japan rows. Dated model ids vs `latest` equivalents. |
| OpenAI robots | https://platform.openai.com/robots.txt | 200 | Docs/pricing not disallowed. Dashboard paths disallowed. |
| Anthropic/Claude robots | https://docs.anthropic.com/robots.txt → platform.claude.com | 200 | `Disallow: /api/` only. |
| xAI robots | https://docs.x.ai/robots.txt | 200 | `Allow: /`. Content-Signal `ai-train=no`. |
| Alibaba robots | https://www.alibabacloud.com/robots.txt | 200 | Disallows `/api/*` and `*.json`. Help HTML is not disallowed. |
| Gemini robots | https://ai.google.dev/robots.txt | login redirect | Unresolved. |
| DeepSeek robots | https://api-docs.deepseek.com/robots.txt | 200 but HTML homepage | No usable robots.txt; treat as unclear. |

Per-provider checklists: [openai](./providers/openai.md), [anthropic](./providers/anthropic.md), [google](./providers/google.md), [xai](./providers/xai.md), [deepseek](./providers/deepseek.md), [alibaba-qwen](./providers/alibaba-qwen.md).

## Existing demo data that must not be ingested

| Demo artifact | Value | Disposition |
| --- | --- | --- |
| `TOKEN_LABS` Anthropic | `$9.00 / 1M tokens` | Undocumented provider-level blend (matches a 50/50 of older Sonnet $3/$15). Demo only. |
| `TOKEN_LABS` other labs | synthetic series | Demo only. |
| `MODEL_ROSTER` most `blendedPrice` | various | Unsourced except xAI. |
| `MODEL_ROSTER` Grok 4.6 / 4.3 | `(input+output)/2` of official standard rates | Derived, weights undocumented as product policy. Do not store as a quote. |
