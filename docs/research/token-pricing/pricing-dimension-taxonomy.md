# Pricing-dimension taxonomy

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Closed source dimensions are encoded in `src/lib/tokens/dimensions.ts` and the observation-table check constraint.

## Source dimensions (stored)

| Dimension | Meaning | Typical source labels |
| --- | --- | --- |
| `input` | Uncached prompt / cache-miss tokens | Input, Base input, Cache miss |
| `output` | Completion tokens, including thinking when billed at the output rate | Output, Output (including thinking tokens) |
| `cached_input` | Discounted reuse of input when the source publishes a single cached-input rate | Cached input, Context caching price, Implicit cache |
| `cache_write` | Tokens written into an explicit prompt cache | Cache writes, 5m/1h cache writes, Explicit cache creation |
| `cache_read` | Tokens read from an explicit prompt cache | Cache hits and refreshes, Explicit cache read |

## Facets (not dimensions)

| Facet | Separates | Examples |
| --- | --- | --- |
| `service_tier` | How the call is served | OpenAI/Anthropic/Gemini batch; OpenAI/Anthropic Fast; Gemini Flex/Priority; DeepSeek peak/off-peak |
| `context_tier` | Context-length price band | xAI/Gemini `prompt_lt_200k` vs `prompt_gte_200k`; OpenAI short vs long context; Alibaba 32k/128k/256k/1M bands |
| `cache_ttl` | Write duration | Anthropic 5m vs 1h cache writes |
| `region` | List-price geography | Anthropic US-only 1.1x; OpenAI regional processing +10%; Alibaba International vs Beijing vs US |

## Derived (not stored)

`blended` — weighted function of **standard** input and output for the same model, region, service tier, and context tier. Cache, batch, and long-context rates are not blend inputs.

## Out of unit / out of scope for this object

These appear on first-party pages and must not be forced into USD/1M inference tokens:

- Gemini context-cache **storage** (USD / 1M tokens / hour)
- Image, video, audio per-second or per-image SKUs
- Tool calls priced per search or per 1k calls
- Consumer seats (Claude Pro/Max)
- Fine-tuning training hours
- Web-search and managed-agent session-hour fees

Reasoning/thinking tokens are a **separate dimension only when the source publishes a different rate**. Gemini and current Anthropic/OpenAI tables bill thinking at the output rate; DeepSeek thinking is a mode, not a price.
