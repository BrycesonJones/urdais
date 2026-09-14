# Phase 2 ingestion plan

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Wave 1 (Anthropic, xAI, OpenAI) is implemented in `src/lib/tokens/` and exercised with `npm run tokens:ingest -- --provider <name> --mode research`. Production collection remains refused.

## Goal

Adapters that turn one first-party pricing page into `pipeline.token_price_observations` rows under stable `reference.models` identities, with a `pipeline.source_retrievals` lineage row. No frontend. No blended storage. No history fabrication.

## Wave 1 implementation notes

Flow: retained retrieval artifact → provider HTML parser → `createSourceQuote` (Phase 1 normalizer) → identity resolution against seeded models → change detection → append-only insert.

The unique index on `pipeline.token_price_observations` is per **retrieval**. That would allow a second daily GET of an unchanged board to insert duplicate prices. Application code must not: `detectObservationChanges` skips insert when native and canonical USD/1M prices match the latest row for the same model/facet key. A new observation is a changed price, a new model, or a new facet — not a synthetic daily copy. Removed models are diagnostics only; old rows are never mutated.

Rights are unchanged from Phase 1: `research_usable` / `under_review` / `under_review`. `--mode production` uses the UCPI permission gate and fails closed. There is no flag that writes a source as production-approved.

Parser ids: `tokens.anthropic.pricing.html.v1`, `tokens.xai.pricing.html.v1`, `tokens.openai.pricing.html.v1`. They are stored on the retrieval (`collector_identity` and `request_parameters.parserId`).

OpenAI `short_context` / `long_context` are column labels. The token cutoff is still unpublished and is not guessed. xAI batch is mentioned without a rate and produces no batch observation. OpenAI regional 10% uplift is documented without per-model eligibility on the table; no region rows are written.

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
