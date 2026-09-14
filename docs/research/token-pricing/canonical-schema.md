# Canonical token-pricing schema

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** This is the Phase 1 design. Migration `20260914010000_token_pricing_foundation.sql` implements it. No quotes are seeded.

## Economic object

One observation is: **the published API price of one token class, for one stable model identity, at one facet set, in a recorded currency and token denominator, with a retrieval time and optional source-effective time.**

Product vocabulary:

`Tokens → Provider → Model → Pricing dimension`

Examples: `Anthropic → Claude Sonnet 5 → Input`, `Anthropic → Claude Sonnet 5 → Output`. A provider-level number is derived and must be labelled as such.

## Reuse vs new objects

| Concept in the brief | Urdais mapping |
| --- | --- |
| `model_providers` | **Reuse** `reference.providers` with new kind `model_api_provider`. |
| pricing/docs source | **Reuse** `reference.source_interfaces` (`product_reference_documentation`). |
| retrieval lineage | **Reuse** `pipeline.source_retrievals` (nullable on observations until collectors exist). |
| `models` | **New** `reference.models`. GPU `native_identifiers` are SKUs, not model ids. |
| aliases / `latest` | **New** `reference.model_aliases`. Not historical identities. |
| `token_price_observations` | **New** `pipeline.token_price_observations`. Not `pipeline.normalized_observations` (GPU-shaped). |
| Urdais instrument / published series | **Not in Phase 1.** Instruments remain `compute_price` only. |

## Identity

`reference.models` unique `(provider_id, provider_model_id)`. Display name, family, version, and lifecycle are metadata. `latest` and `*-latest` ids are aliases.

Anthropic documents that **dateless Claude API ids from the 4.6 generation on are pinned snapshots**; those may be stored as models. OpenAI `gpt-daybreak-blue-latest` may not.

## Observation facets

Columns that keep distinct published rates apart:

- `pricing_dimension`: `input`, `output`, `cached_input`, `cache_write`, `cache_read` (never `blended`)
- `service_tier`: `standard`, `batch`, `fast`, `priority`, `flex`, `peak`, `off_peak`
- `context_tier`: provider-native string, or null if one rate covers the window
- `cache_ttl`: `5m` / `1h` when writes are priced by duration
- `region`: null for the provider default; required when list prices differ by region

## Blended price

Stored nowhere. Application function:

`blended = inputWeight * input + outputWeight * output`

Weights are versioned and must be supplied. There is no product-default 50/50.

## History rule

Insert a new observation when a published price changes or a new stable model/version appears. Do not backfill today's price as yesterday's. `source_effective_at` is null when the page states no effective timestamp.
