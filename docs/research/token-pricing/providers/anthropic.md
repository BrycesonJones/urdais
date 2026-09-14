# Anthropic

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026.

1. Official API pricing: https://docs.anthropic.com/en/docs/about-claude/pricing (docs say "for the most current pricing, visit claude.com/pricing"; the docs table is the complete API grid).
2. Official docs: https://docs.anthropic.com/en/docs/about-claude/models and Model IDs/versioning.
3. Current API ids: `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. Legacy rows remain on the pricing table.
4–6. Base input, 5m cache writes (1.25×), 1h cache writes (2×), cache hits (0.1×, or 0.025× on Fable/Mythos 5.1), output. Sonnet 5: $2 / $2.50 / $4 / $0.20 / $10 per MTok.
7. Batch: 50% on input and output (Sonnet 5 batch $1 / $5). Fast mode not available with Batch.
8. Long-context: Claude 4.6+ and Mythos Preview bill the full 1M window at standard per-token rates (no long-context surcharge).
9. Currency: USD. 10. Denominator: MTok = 1M tokens.
11. Region: `inference_geo: "us"` is 1.1× on 4.6+; default global is standard. Partner Bedrock/Google regional endpoints are +10% vs global on 4.5+ — different source.
12. Effective dates: Sonnet 5 $2/$10 intro pricing through 31 Aug 2026 is now the standard price; the scheduled 1 Sep 2026 increase to $3/$15 **will not occur**.
13. Old pricing: retired models remain listed at last published rates; not a full archive.
14. Models API: capabilities, not prices.
15. Automation: robots do not block docs; commercial terms not isolated from the JS bundle — **unclear**.
16. Attribution: none isolated.

Aliases vs dated ids: pre-4.6 aliases point at dated snapshots; from 4.6, dateless ids **are** the pinned snapshot. Do not treat `claude-sonnet-5` as a floating `latest` unless Anthropic changes that guarantee.

Consumer `claude.com/pricing` seats are out of scope.
