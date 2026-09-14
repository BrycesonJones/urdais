# Phase 2 ingestion plan

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** No collector is built in Phase 1.

## Goal

Adapters that turn one first-party pricing page into `pipeline.token_price_observations` rows under stable `reference.models` identities, with a `pipeline.source_retrievals` lineage row. No frontend. No blended storage. No history fabrication.

## Order

| Wave | Provider | Why first |
| --- | --- | --- |
| 1 | Anthropic | Clean USD/MTok table, pinned model ids, cache write/read, batch, documented US 1.1x |
| 1 | xAI | Small text-API table, explicit 200k long-context rule, cached input |
| 1 | OpenAI | Same unit; more facets (short/long, cache writes, Fast, batch 50%) |
| 2 | Google Gemini Developer API | USD/1M, but many models and Standard/Batch/Flex/Priority; keep Vertex out |
| 3 | DeepSeek | USD/1M with peak/off-peak and cache-hit/miss; HTML-only, 409 on some fetchers |
| 4 | Alibaba Model Studio International | USD/1M, but region and promotion complexity; restrict to International non-promo list price |

## Adapter shape (per provider)

1. Manual or tightly rate-limited GET of the canonical docs URL (production path still `under_review`).
2. Parse the published table to native quotes. Do not hit inference APIs for prices; none of the six expose a first-party **pricing** API on the pages retrieved.
3. Upsert **stable** `reference.models` rows; write `latest` strings only to `reference.model_aliases`.
4. Insert one observation per `(model, dimension, service_tier, context_tier, cache_ttl, region)` with native + canonical USD/1M.
5. Skip image/audio/video, tool fees, seats, and cache storage/hour.

## Machine-readable follow-ups (not Wave 1)

- OpenAI Models API lists ids, not prices.
- Anthropic Models API lists capabilities, not prices.
- Google Cloud Billing Catalog may price Vertex SKUs; that is a different source interface with different terms.
- xAI console models page is authenticated; public docs remain the Wave 1 source.

## Exit for a provider

A provider is Phase 2 ready when: official URL pinned, native ids known, dimensions mapped, USD/1M normalization works without silent FX, and terms are at least explicitly still `under_review` (not `not_permitted`). Production publication is a later phase.
