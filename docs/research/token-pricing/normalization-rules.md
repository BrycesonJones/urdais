# Normalization rules

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Implemented by `src/lib/tokens/normalize.ts` and `pipeline.token_price_observations` checks.

## Canonical public unit

`USD / 1M tokens`. `canonical_price_usd_per_1m` is that number.

## Retain the native quote

Always store `source_native_price`, `source_native_currency`, `source_native_denominator_tokens`. Scaling a USD-per-1k price to per-1M is unit conversion of the same currency, not FX.

## FX

If `source_native_currency <> USD`:

- either leave `canonical_price_usd_per_1m` null, or
- fill it only with `fx_source`, `fx_rate`, `fx_as_of`, and `fx_quoted_as`.

Never apply an implicit rate. DeepSeek and the Alibaba **international English** catalog retrieved on 14 September 2026 already quote USD, so no FX is required for those surfaces. A CNY-only mainland page would be stored unconverted until an FX source is chosen.

## Do not combine

| Must remain separate | Why |
| --- | --- |
| Input and output | Different token classes |
| Cache-hit and cache-miss | DeepSeek and others price them apart |
| Cache write and cache read | Anthropic/Alibaba explicit cache |
| 5-minute and 1-hour cache writes | Anthropic TTL multipliers |
| Standard and batch | 50% batch is a different product |
| Fast/Priority/Flex and standard | Premium or deferred capacity |
| Peak and off-peak | DeepSeek time-of-day list prices |
| Long-context and default-context bands | xAI bills **all** tokens at the higher rate above 200k |
| International and regional Alibaba rows | Different published USD list prices |
| Gemini Developer API and Vertex AI | Different commercial surfaces |
| First-party Anthropic API and Bedrock/Foundry | Partner invoice; optional later source |

## Incompatible units

Refuse canonical conversion for storage-per-hour, per-image, per-minute, and per-search prices. Record them only if a later phase defines a different object.
