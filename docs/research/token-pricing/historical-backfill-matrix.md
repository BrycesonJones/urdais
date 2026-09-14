# Historical-data and backfill matrix

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Phase 1 does not import history. Today's price is not yesterday's price.

Preferred going-forward rule: **record a new observation when a published provider price changes or a new stable model/version appears.**

| Provider | Historical pricing directly available | Recoverable from official docs/releases | No reliable official history | Notes |
| --- | --- | --- | --- | --- |
| OpenAI | No public historical pricing API found | **Partial.** Deprecations page lists model retirement, not past token rates. Pricing page overwrites. Batch "50%" is current policy. GPT-5.6 Sol promotional window named through 21 Nov 2026. | Current board is not a time series | Wayback/official changelogs could be a later research project; not Phase 2 ingestion. |
| Anthropic | No historical pricing API | **Partial.** Docs still list retired models with **current** (last published) rates. Sonnet 5 intro pricing through 31 Aug 2026 is documented as now permanent at $2/$10; the cancelled 1 Sep 2026 increase is an official effective-date event. | No dated archive of every past board | Official announcements can backfill specific change events, not a dense daily series. |
| Google | No Developer API price history endpoint found | **Partial.** Several Flash rows publish a promotional rate **through 31 Dec 2026** and a post-2027 rate. Page "Last updated 2026-09-11 UTC". | Vertex vs Developer history are separate | Scheduled future prices are not history; they are forward-looking list prices and need `source_effective_at`. |
| xAI | No | **Weak.** Models page is current-only. | **Primary** | Start history at first Urdais retrieval. |
| DeepSeek | No price API | **Partial.** `/updates` changelog records dated API price adjustments (e.g. peak/off-peak from 16 Aug 2026 UTC; V4.1-Flash reductions 10 Sep 2026). | Dense history absent | Event backfill from the changelog is possible later; do not reconstruct missing days. |
| Alibaba/Qwen | No | **Partial.** Dated model ids (`qwen3.7-max-2026-05-20`) keep **current** list prices for those ids. `Currently equivalent to` aliases are pointers. Limited-time % off is promotional, not a historical series. | No official past International board | Snapshot each dated id's current list price going forward. |

## Backfill policy for Phase 2

Do not bulk-import. Optionally, as a later research slice, record discrete official change events (Anthropic Sonnet 5 intro-price decision; DeepSeek changelog rows; Google dated promotional windows) as observations with `source_effective_at` taken from the announcement, never inferred.
