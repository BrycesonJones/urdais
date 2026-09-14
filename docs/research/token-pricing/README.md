# Token pricing Phase 1

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. Phase 1 is research and schema design. Wave-1 ingestion for Anthropic, xAI, and OpenAI lives in `src/lib/tokens/` and does not change the Tokens UI.

Urdais token pricing is the **current published first-party API token price for a specific model**, expressed in **USD per 1 million tokens**. Provider-level demo series such as Anthropic `$9.00 / 1M tokens` are not source quotes and are not preserved as canonical data.

## Deliverables

| # | Document |
| --- | --- |
| 1 | [Source qualification](./source-qualification.md) and per-provider files under [providers/](./providers/) |
| 2 | [Canonical schema](./canonical-schema.md) |
| 3 | [Provider/model inventory](./provider-model-inventory.md) |
| 4 | [Pricing-dimension taxonomy](./pricing-dimension-taxonomy.md) |
| 5 | [Normalization rules](./normalization-rules.md) |
| 6 | [Source-rights matrix](./source-rights-matrix.md) |
| 7 | [Historical-data / backfill matrix](./historical-backfill-matrix.md) |
| 8 | [Phase 2 ingestion plan](./phase-2-ingestion-plan.md) |

Code that encodes the contract lives in `src/lib/tokens/`. The database objects are in `supabase/migrations/20260914010000_token_pricing_foundation.sql`.

## What Phase 1 inspected and did not change

The current Tokens surface is demo-only. `src/data/mock/token-providers.ts` publishes one generic `$ / 1M tokens` series per lab (Anthropic latest value `9.0`) and says the values are not actual provider prices. Model Economics `MODEL_ROSTER` stores a single `blendedPrice` per representative model; the xAI rows are an explicit 50/50 average of official input and output, which this phase treats as derived, not ingestible.

Existing `reference.providers` and `reference.source_interfaces` are reused. `reference.instruments` and `pipeline.normalized_observations` are not: they are UCPI compute-price objects.

## Recommended Phase 2 starter set

1. Anthropic Claude API pricing docs
2. xAI models docs
3. OpenAI API pricing docs

Then Gemini Developer API, DeepSeek, then Alibaba Model Studio **international** list prices only.
