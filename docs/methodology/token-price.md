# Urdais Token Price Methodology

**Version 1.1, 14 September 2026.** Status: proposed. No production value has been published under this document; Wave-1 sources are not yet cleared for production collection, so every value computed under it today is a labelled research preview.

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

**Weights are a property of a methodology version, and a methodology version is effective-dated.** A value is computed with the weights in force on its own calculation date. Changing the weights in a later version therefore cannot alter an earlier value; it can only produce different values from its own effective date onward.

### Calculation events and leg state

A provider's two legs are published independently and change independently. Urdais records a canonical observation only when a source price changes, so an unchanged output rate produces no new row on the day an input rate moves. The benchmark therefore does not require both legs to be observed on the same date.

A **calculation event** is an eligible leg observation. At each event Urdais computes the benchmark from the newest eligible input observation and the newest eligible output observation known as of that event. Both legs keep their own source timestamps, and no observation is fabricated for the leg that did not change.

If an input rate moves from two dollars to three while the output rate stays at ten, the benchmark moves from six dollars to six dollars fifty at the moment the input observation is recorded, using the output observation that is still current.

The unit is **USD per 1M tokens**. The product shows the value as a dollar amount followed by *per 1M tokens*, never as *per 1M input tokens* or *per 1M output tokens*, because the benchmark is neither.

## Benchmark model

Urdais measures the frontier. The designated model for a provider is **the provider's current, broadly available flagship frontier model: the one the provider positions as its leading general-purpose capability**. It is not the provider's cheapest model, not the tier a typical workload happens to run on, and not whichever model is most used.

Selection is explicit and never dynamic. Urdais does not follow a latest-pointer alias, take the newest identifier automatically, or accept whatever an ordering returns first.

Two classes are ineligible however capable they are:

- **Narrow specialists.** Coding-specific, agent-specific, image-specific, research-only and similarly scoped models do not represent a provider's general-purpose frontier.
- **Access-restricted models.** A model available only to vetted organisations or under a trusted-access programme is not broadly available, so it does not represent what the provider sells to the market.

Version 1.1 designates:

- **Anthropic**: Claude Fable 5.1 (`claude-fable-5-1`). Anthropic's own product page, retrieved 14 September 2026, states "Claude Fable 5.1 is our most capable generally available model" and describes it as available to Pro, Max, Team and Enterprise users and to developers through the Claude Platform and major cloud providers. Claude Mythos 5.1 is more permissive in restricted domains but is limited to vetted organisations through trusted-access programmes, so it is not broadly available and is not eligible. Opus 5, Sonnet 5 and Haiku 4.5 sit below Fable 5.1 in capability.
- **OpenAI**: GPT-6 Astra (`gpt-6-astra`). The highest generation general-purpose model in the qualified roster and the most expensive of its general-purpose models, which is the frontier signal the reviewed pricing artifact carries. GPT-5.3 Codex is coding-specific and GPT-Rosalind Research is research-only, so neither is eligible; GPT-5.6 Cyber is domain-scoped and carries no long-context rate. Evidence limitation: the reviewed first-party artifact is a pricing table with no positioning statement, so this designation rests on generation and price tier within the qualified roster. If first-party positioning evidence contradicts it, the designation changes with a new effective date and earlier values are not recomputed.
- **xAI**: Grok 4.6 (`grok-4.6`). The highest current general-purpose Grok in the qualified roster. Grok Build 0.1 is coding-specific, the Grok 4.20 multi-agent build is agent-specific, and the 4.20 reasoning and non-reasoning entries are mode-specific variants of an earlier version.

Each designation is effective-dated. A designation records the date from which it applies, a provider may have several over time, and the designation in force on a calculation's own date is the one that produced its value.

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

A benchmark point exists only at a real calculation event, that is, at an eligible leg observation with both legs known. Urdais does not interpolate, backfill, carry a value forward as a new point, or synthesize history. A series with one calculation event has one point.

A point carries the timestamp of the calculation that produced it: **the later of the two eligible leg observations used**, which is the moment at which the state of both legs first supported that value. It is never rounded to midnight or to a date boundary.

A retrieval that returns the same prices as the last one produces no new point; it confirms the existing one. Where consecutive events would produce the same value from the same designated model under the same methodology version, only the first is kept.

Percentage change compares a benchmark value with the previous benchmark value **in the same constituent lineage**, that is, computed from the same designated model under the same methodology version. Where no such prior value exists, percentage change is withheld. It is never shown as zero to fill the space.

## Constituent changes

Changing a provider's benchmark model is a methodology change and is versioned explicitly. It never rewrites history.

When a designation changes, values dated before the new designation's effective date remain those computed from the previous model, and values from the effective date onward use the new one. Urdais does not recompute past observations with a newly designated model. A provider's published history is assembled designation by designation: each segment is computed from the model and methodology version in force during that segment, and the segments are concatenated in time order.

If a newly effective designation does not yet have both eligible legs, the provider's last successfully calculated benchmark continues to be shown with its own original timestamp, and the fact that the current designation cannot yet be calculated is reported separately. A withheld current calculation never erases a previously valid value and never manufactures a new point.

Because a constituent change breaks the comparability of a percentage change across the boundary, percentage change is withheld across it rather than computed between two different economic objects.

## Publication

Publication requires an approved version of this methodology and source rights permitting production collection and index use for the provider. Wave-1 providers are not cleared, so the benchmark is visible only in the development research preview, labelled as such. Production remains fail-closed: where the requirements are not met, no value is published and no substitute is shown.

## Version history

**1.1, 14 September 2026**: corrects the constituent-selection criterion from a representative general-purpose model to the provider's current, broadly available flagship frontier model, and excludes access-restricted models explicitly. Redesignates Anthropic to Claude Fable 5.1 and OpenAI to GPT-6 Astra on that criterion; xAI stays Grok 4.6. Defines calculation events and leg state so a change in one leg recalculates against the current state of the other, fixes the point timestamp as the later of the two leg observations used, makes methodology weights effective-dated so a later version cannot alter an earlier value, states that history is assembled per designation segment, and adds the last-known-good rule across a designation transition.

**1.0, 14 September 2026**: initial methodology. Fixes the standardized 500,000 input and 500,000 output token workload, the equal weights, the eligible legs and exclusions, the designated benchmark models for Anthropic, xAI and OpenAI, the effective-dated constituent rule, the withholding rules and the publication requirements. No production effective date.
