# Urdais Token Price Methodology

**Version 1.0, 14 September 2026.** Status: proposed. No production value has been published under this document; Wave-1 sources are not yet cleared for production collection, so every value computed under it today is a labelled research preview.

## Why this exists

A provider publishes many prices for one model: input, output, cached input, cache writes by duration, batch and priority tiers, context-tier surcharges, and sometimes regional variants. Urdais collects all of them, because each is an economically distinct quote and collapsing them would destroy information.

A person asking "what does Anthropic cost?" is not asking for that table. They are asking what it costs to do a normal piece of work. This document defines the one number Urdais publishes in answer, and exactly how it is derived from the canonical prices underneath.

## Economic object

The Urdais Token Price is **the cost of processing a standardized one-million-token workload with a provider's designated benchmark model, at that provider's ordinary standard published rates**.

The standardized workload is fixed:

- 500,000 input tokens
- 500,000 output tokens

It is a derived Urdais benchmark, not a provider quote. No provider publishes this number. It is stated as such wherever it appears, and it is never presented as a price a provider charges for a single named product.

The workload is deliberately balanced. It is not a claim about how any particular customer uses a model; it is a fixed basket, held constant across providers and over time, so that movement in the benchmark reflects movement in published prices rather than a change in what is being measured.

## Calculation

For a provider on a calculation date, with both eligible legs in United States dollars per one million tokens:

> Token Price = 0.5 × input price + 0.5 × output price

which is the arithmetic mean of the two legs. Weights are fixed at one half each by this version of the methodology and are not configurable per provider. No rounding is applied before the calculation; the published value carries the precision of its inputs, and display rounding is a presentation concern.

The unit is **USD per 1M tokens**. The product shows the value as a dollar amount followed by *per 1M tokens*, never as *per 1M input tokens* or *per 1M output tokens*, because the benchmark is neither.

## Benchmark model

Each provider has exactly one designated benchmark model, chosen by Urdais and named in this methodology. It is never selected dynamically. Urdais does not use a latest-pointer alias, the newest model, the cheapest model, the most expensive model, or whatever an ordering happens to return first.

The model is a current general-purpose flagship. Coding-specific, agent-specific, image-specific, research-only and other narrow specialist models are not eligible while a general-purpose flagship exists.

Version 1.0 designates:

- **Anthropic**: Claude Sonnet 5 (`claude-sonnet-5`). The current general-purpose flagship of the Claude family in the qualified roster. Opus 5 and Fable 5.1 sit above it and Haiku 4.5 below; Sonnet is the general-purpose tier a normal workload runs on.
- **xAI**: Grok 4.6 (`grok-4.6`). The highest current general-purpose Grok in the qualified roster. Grok Build 0.1 is coding-specific, the Grok 4.20 multi-agent build is agent-specific, and the 4.20 reasoning and non-reasoning entries are mode-specific variants of an earlier version; none is eligible while a general-purpose flagship exists.
- **OpenAI**: GPT-5.6 Sol (`gpt-5.6-sol`). The current general-purpose flagship in the qualified roster. GPT-5.3 Codex is coding-specific and GPT-Rosalind Research is research-only, so neither is eligible; GPT-6 Astra, Terra, Luna and Cyber sit at other points of the range.

Each designation is effective-dated. A designation records the date from which it applies, and a provider may have several designations over time.

## Eligible legs

Both legs must be the provider's ordinary standard published rate for the benchmark model:

- Pricing dimension: input and output only.
- Service tier: standard. Batch, fast, priority, flex, peak and off-peak are different products and are excluded.
- Context tier: the provider's base, non-surcharge tier. Where a provider prices a longer context above its base rate, the surcharged tier is excluded. Where a provider has no context tiers, the leg carries none.
- Region: the provider's default, undifferentiated rate. Regional variants, including United States specific rates published above a default, are excluded.
- Cache: excluded entirely. Cached input, cache reads and cache writes at any time-to-live are separate products and never enter the benchmark.

The base context tier for each provider is named in the constituent record rather than inferred, so that a provider adding a cheaper or more expensive tier cannot silently move the benchmark.

## Missing data

If either leg is unavailable under the rules above, the benchmark is **withheld** for that provider. Urdais does not substitute cached input for input, use a batch or priority rate, copy one leg into the other, average whatever legs happen to exist, or publish a partially calculable value.

A withheld benchmark does not erase what came before it. Where a previously valid benchmark exists, the last known good value continues to be shown with its own original timestamp, under the existing last-known-good rule, and no new observation is created.

## History and updates

A benchmark observation exists for a date only where both eligible legs were observed on that date. Urdais does not interpolate, backfill, carry a value forward as a new point, or synthesize history. A series with one observation has one point.

A new benchmark observation is recorded when an eligible leg's price changes. A retrieval that returns the same prices as the last one does not create a new observation; it confirms the existing one.

Percentage change compares a benchmark value with the previous benchmark value **in the same constituent lineage**, that is, computed from the same designated model under the same methodology version. Where no such prior value exists, percentage change is withheld. It is never shown as zero to fill the space.

## Constituent changes

Changing a provider's benchmark model is a methodology change and is versioned explicitly. It never rewrites history.

When a designation changes, values dated before the new designation's effective date remain those computed from the previous model, and values from the effective date onward use the new one. Urdais does not recompute past observations with a newly designated model. The change is recorded in the version history of this document, and the constituent record carries the effective date that produced each value.

Because a constituent change breaks the comparability of a percentage change across the boundary, percentage change is withheld across it rather than computed between two different economic objects.

## Publication

Publication requires an approved version of this methodology and source rights permitting production collection and index use for the provider. Wave-1 providers are not cleared, so the benchmark is visible only in the development research preview, labelled as such. Production remains fail-closed: where the requirements are not met, no value is published and no substitute is shown.

## Version history

**1.0, 14 September 2026**: initial methodology. Fixes the standardized 500,000 input and 500,000 output token workload, the equal weights, the eligible legs and exclusions, the designated benchmark models for Anthropic, xAI and OpenAI, the effective-dated constituent rule, the withholding rules and the publication requirements. No production effective date.
