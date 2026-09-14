# Provider and model inventory

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Snapshot of first-party pages retrieved 14 September 2026. Not a live catalog and not seeded into `reference.models`.

Frontier **text API** models are in scope. Image/audio/video SKUs are listed only to mark them out of the token object.

## OpenAI (`platform.openai.com/docs/pricing`)

Pinned ids observed on the pricing table (not `*-latest` pointers): `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-cyber`, `gpt-5.3-codex`, `gpt-rosalind-research`, plus realtime/image/Sora/transcription rows out of token-inference scope. Aliases `gpt-daybreak-blue-latest` → `gpt-5.6-sol` and `gpt-daybreak-red-latest` → `gpt-5.6-cyber` are pointers.

Standard short-context USD/1M (input / cached input / cache writes / output): Astra 10 / 1 / 12.50 / 50; Sol 4 / 0.40 / 5 / 20; Terra 2 / 0.20 / 2.50 / 12; Luna 0.20 / 0.02 / 0.25 / 1.20. Long context is a separate higher band. Batch tables are 50% of those rates. Fast mode is a higher band. Regional processing: +10% on models released on/after 5 Mar 2026.

## Anthropic (`docs.anthropic.com` pricing + models)

Current Claude API ids: `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`). Dateless 4.6+ ids are pinned. Legacy still priced: Fable 5, Mythos 5/5.1 (limited), Opus 4.8–4.1, Sonnet 4.6–4, Haiku 3.5 (retired except cloud partners).

Sonnet 5: input $2 / output $10 / 5m write $2.50 / 1h write $4 / cache hit $0.20 per MTok. Fable 5.1 cache hits are 0.025× input ($0.25). Batch is 50%. Fast mode (Opus 5 / 4.8): $10 / $50. US-only inference 1.1× on 4.6+. Long-context surcharge: none on 4.6+ (full 1M at standard rates).

## Google Gemini Developer API

Text/multimodal ids include `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, plus Live/image/Omni/Gemma rows. Pro example: input $2 / $4 and output $12 / $18 at ≤200k vs >200k prompts; context cache $0.20 / $0.40 plus $4.50 per 1M tokens **per hour** storage. Flash 3.8 paid standard (promo through 31 Dec 2026): input $0.75, output $3.75, cache $0.075. Batch and Flex are 50% of standard on these rows; Priority is a premium. Gemma 4 paid tokens: not available. Vertex AI is a second inventory.

## xAI

Text: `grok-4.6`, `grok-4.5`, `grok-4.3`, `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning`, `grok-build-0.1`, `grok-4.20-multi-agent-0309`. Grok 4.6: <$200k prompt $2 / $0.50 cached / $6 output; ≥$200k $4 / $1 / $12; 500k context. Batch API exists but per-model support is on model pages; **batch token rates were not on the models table**. `*-latest` aliases are pointers; dated ids are for consistency.

## DeepSeek

Stable call names: `deepseek-flash` (served as DeepSeek-V4.1-Flash), `deepseek-v4-pro` (DeepSeek-V4-Pro-0813). Legacy `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` route to Flash at Flash rates. USD / 1M:

| | Flash off-peak | Flash peak | Pro off-peak | Pro peak |
| --- | --- | --- | --- | --- |
| Cache hit input | $0.003 | $0.006 | $0.022 | $0.044 |
| Cache miss input | $0.15 | $0.30 | $0.66 | $1.32 |
| Output | $0.60 | $1.20 | $1.98 | $3.96 |

Peak hours: 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. Off-peak is half of peak. No FX. Context 1M at those rates.

## Alibaba / Qwen (Model Studio, International list)

Frontier text examples (USD / 1M, International, non-thinking+thinking where listed): `qwen3.8-max` / `qwen3.8-max-0902` input $2 output $6 (≤1M); `qwen3.7-plus` list $0.4 / $1.6 with limited-time off; `qwen3.8-flash` $0.15 / $0.47. China (Beijing) publishes different USD figures (e.g. qwen3.8-max $1.65 / $4.951). Implicit cache, explicit cache create/read, and 50% batch appear on some rows. `Currently equivalent to <dated-id>` is an alias, not a stable series key. Use the dated id for history.
