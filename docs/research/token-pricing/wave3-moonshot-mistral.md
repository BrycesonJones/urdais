# Wave 3 Token Price research — Moonshot AI and Mistral AI

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026, decision recorded the same day. Moonshot enters the benchmark on the strength of what follows. Mistral's designation is settled and its publication is not: Urdais designates Mistral Large 3 as the Mistral Token Price model, and publication is blocked until a first-party immutable model identity can be verified.

## What was retrieved

Research reads on 14 September 2026 at 22:02 UTC. Both source interfaces are unreviewed on both rights axes, which is where every token-pricing source sits; a research read is what that state permits and nothing here is a production retrieval.

| Provider | URL | HTTP | Bytes | SHA-256 |
|---|---|---|---|---|
| Moonshot | `https://platform.moonshot.ai/docs/pricing` (serves `platform.kimi.ai/docs/pricing/chat`) | 200 | 240,449 | `8ac1ff56855668e820b2030487aa4e81fc251267a06fd535c6bd1f8ff973c532` |
| Mistral | `https://mistral.ai/pricing` | 200 | 485,513 | `7088e1e1c2af8b88562260cdba29813ce88a5daebb694dc67e50209659e4a7a9` |

Both pages render their tables client-side. Moonshot also publishes the same page as first-party markdown at the identical path with a `.md` suffix, which is where the values below were read; Mistral's table was read by rendering its own page in a browser and opening the API tab with the currency set to USD. No aggregator was used for any figure.

## Moonshot AI — published at $9.00

### Published rates, international list, USD per 1M tokens

| Model | Input, cache hit | Input, cache miss | Output | Context window |
|---|---|---|---|---|
| `kimi-k3` | $0.30 | **$3.00** | **$15.00** | 1,048,576 |
| `kimi-k2.7-code` | $0.19 | $0.95 | $4.00 | 262,144 |
| `kimi-k2.7-code-highspeed` | $0.38 | $1.90 | $8.00 | 262,144 |
| `kimi-k2.6` | $0.16 | $0.95 | $4.00 | 262,144 |

### Designation

**`kimi-k3`**, effective 14 September 2026. The platform banner announces K3 as launched, and it carries the largest window in the family at 1,048,576 tokens. The two K2.7 entries are coding builds by name, one a speed variant of the other, so neither represents a general-purpose frontier; K2.6 is the previous general-purpose generation at an older window size. No candidate is a preview, a research model or access-restricted.

### Methodology compatibility: `compatible_with_existing_designation_parameter`

No new methodology version is required. Version 1.2 already carries a declared base region, and Moonshot needs one for the same reason Alibaba did.

- **Service tier**: standard. Batch is published on a separate page and is excluded.
- **Base context tier**: none. One rate covers each model's whole window; there is no surcharge band to exclude.
- **Base region**: **International**. Moonshot publishes two first-party lists at different numbers for the same models. The international list quotes `kimi-k3` at $3.00 and $15.00; the China platform quotes the same model at ¥20.00 and ¥100.00, with a cache hit at ¥2.00. Neither is a global rate, so the scope is named on the designation.
- **Currency**: USD as published on the international surface. No FX conversion is performed or required, because a first-party USD surface exists and is the one Urdais reads.
- **Cache**: input is published twice, on a hit and on a miss. The cache-miss figure is the ordinary input rate, which is what a request pays when nothing is reused. The cache-hit figure is recorded as cached input and never blended into the input leg.
- **Promotional or time-varying rates**: none published.

**Token Price = 0.5 × $3.00 + 0.5 × $15.00 = $9.00 per 1M tokens.**

### Open-weight status

Recorded because it is interesting, and kept out of the calculation because it is a different economic object.

Moonshot has released Kimi weights openly in the past under a modified MIT licence. The pricing page reproduced here makes no open-weight or licence claim for any listed model, and no first-party statement was retrieved in this pass confirming whether the `kimi-k3` served by the API is identical to any open-weight release or is a hosted variant. That question is therefore **unresolved** and is not asserted either way.

What is resolved is that it does not matter for Token Price. The benchmark measures the provider's own published API economics. Self-hosted inference cost is a different measurement with different inputs, and the two are never mixed.

### Rights posture

Unchanged from every other token source, and not inferred from the page being readable.

- Publishing a manually verified reading of the first-party page: permitted, and that is how the value below is produced.
- Automated retrieval: **unresolved**. The interface enters at `research_usable` with terms and data-use both `under_review`, and the database trigger refuses a production retrieval from it. Moonshot stays manual-verification-only. No outreach was sent in this phase.

## Mistral AI — designated Mistral Large 3, publication blocked

### Published rates, API list, USD per 1M tokens

| Model | API pointer | Licence shown | Positioning as published | Input | Output | Token Price if designated |
|---|---|---|---|---|---|---|
| Mistral Large 3 | `mistral-large-latest` | Apache 2.0 | "Open-weight, general-purpose, flagship multimodal and multilingual model" | $0.50 | $1.50 | **$1.00** |
| Mistral Medium 3.5 | `mistral-medium-latest` | Modified MIT | "Our frontier-class multimodal model optimized for agentic and coding use cases" | $1.50 | $7.50 | **$4.50** |
| Mistral Small 4 | `mistral-small-latest` | Apache 2.0 | "Hybrid model unifying instruct, reasoning, and coding in a single efficient model" | $0.15 | $0.60 | $0.375 |
| GLM 5.2 | `zai-glm-5-2` | Open | "Third-party model specializing in long-context agentic workflows and coding" | $1.40 | $4.40 | not a Mistral model |

Mistral also publishes a cached-input rate of $0.14 for GLM 5.2, states that batch processing reduces price by 50%, and states that cached input reduces input cost by up to 90%. All three are excluded dimensions or tiers under the existing rules. An Enterprise API tier is offered at 75% above list pricing and is likewise not the standard rate.

### Designation: Mistral Large 3

Urdais designates **Mistral Large 3**. Two candidates survived the exclusions and they differ by a factor of 4.5, so the reasoning is recorded rather than assumed.

**The case for Mistral Large 3.** Mistral's own words match the criterion almost exactly: the pricing page calls it "general-purpose, flagship" and the models page calls it "a state-of-the-art, open-weight, general-purpose multimodal model". The criterion asks for the model the provider positions as its leading general-purpose capability, and that is the sentence.

**The case against.** Large 3 is version 25.12 and Medium 3.5 is version 26.04, so the designation would sit a generation behind the newest flagship-class release. Medium 3.5 is more than twice the input price and five times the output price, which is usually where a frontier sits. Mistral's own FAQ answers "Which model should I use?" with "For most tasks and coding: Mistral Medium."

**The case against Medium 3.5.** Its own description is "optimized for agentic and coding use cases". The methodology excludes coding specialists and agent-specific models by name, and that sentence is the provider describing a specialization. A newer generation and a higher price do not override the criterion; they are evidence about capability tiers, not about how the provider positions its general-purpose frontier.

**Mistral Large 3 is therefore the designated model, at $0.50 input and $1.50 output, giving an expected Token Price of $1.00 per 1M tokens.** That value is recorded and is not published.

### Publication blocker: no immutable model identity

Publication is blocked, and the blocker is identity rather than price. Mistral's pricing surface publishes only the mutable pointer `mistral-large-latest`, and the methodology refuses to follow a latest-pointer alias as an identity. Freezing a benchmark against a moving alias would claim a lineage the record does not have: the pointer can be retargeted at any time, and every historical point would silently come to mean a different model.

The dated identity behind Mistral Large 3 must be read from that model's own first-party page before anything is seeded. The ids visible in this pass were all pointers, and the only dated ids on the models page belong to deprecated releases. Inventing one from the naming pattern would fabricate exactly the fact that is missing.

**This is not DeepSeek's situation and is not recorded as if it were.** DeepSeek is `collected_not_publishable`: the prices are in hand and the methodology cannot express them, so there is no designation to make. Mistral is `designated_publication_blocked`: the model is chosen, the price is methodology-compatible, the value is known, and one external fact is outstanding. The two carry different reason codes, `NO_STANDARD_SERVICE_TIER` and `NO_IMMUTABLE_MODEL_IDENTITY`, and readiness reports them in different words.

### What this means for the wave

Mistral is **not** in the provider roster, has no parser registered, has no seeded identities, no constituent row and no frozen benchmark, and does not appear on any public surface. The migration asserts its absence so the state cannot drift into publication unnoticed.

What the repository does record is the decision: the designation, the compatible price, the expected value, the mutable alias that must never be used as a canonical identity, and the blocker. That lives in `TOKEN_BENCHMARK_WITHHELD` under the `designated_publication_blocked` state.

Publishing Mistral, once a dated identity is verified from its own first-party page, is a small job: a fixture, a parser, the seeds and one constituent row.

### Rights posture

Same posture as every other token source, and unchanged by this research. Publication of a manually verified reading would be permitted; automated retrieval is unresolved; no registry row exists yet and none should be created until a dated identity is verified. No outreach was sent.

### Open-weight status

Mistral publishes open weights for the models above, Apache 2.0 for Large 3 and Small 4 and a modified MIT licence for Medium 3.5, and states that self-hosting is permitted anywhere while "commercial deployments require a Mistral license with separate terms for derivatives and production use". Whether the API-served model is bit-identical to the open release was not established in this pass. As with Moonshot, none of this enters the Token Price calculation.
