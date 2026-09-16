# Urdais Open-weight vs Proprietary Methodology

**Version 1.0.0, approved 16 September 2026. Status: approved for production, effective from 16 September 2026.** Prepared from the Phase 4A codebase and production-substrate audit, and approved after the implementation was built and verified against published publisher artifacts.

Open-weight vs Proprietary has no ingestion of its own. It is a classification laid over data three other Urdais products already collect: observed token volume from UTVI, benchmark capability from Epoch AI, and list price from Urdais Token Price. The only thing this product persists is the classification itself, because a licence finding is evidence rather than a derived statistic.

## 1. The claim

> **Whether each model's publisher released downloadable weights, measured across observed OpenRouter token volume, Epoch AI benchmark scores, and published list prices.**

That is the whole of it.

## 2. The semantic boundary

Three over-readings are refused explicitly, because a reader would otherwise make all three for free.

> Open-weight means the publisher offers the weights for download. **It does not mean open source**, and several of the licences counted as open-weight here restrict commercial use.

> Volume is share of **observed OpenRouter token volume**, not of the industry.

> Prices are **published list prices per token, not total inference cost**: a model that emits more reasoning tokens to answer the same question costs more than its per-token price suggests.

Urdais does **not** claim, on any surface, in any label, tooltip, heading or export:

- that open-weight models are better or worse than proprietary ones
- that an open-weight share of observed volume is an open-weight share of the AI industry
- that any model in either class is lawful for a given reader to use
- total inference cost, cost per task, or the cheapest model to accomplish an outcome

The third deserves a sentence of its own. A licence name is a citable fact and is published; whether a particular licence permits a particular use is legal advice about a specific reader, and Urdais does not give it. The fourth is inherited from Model Frontier, where the same list-price arithmetic is bounded the same way and for the same reason.

## 3. The classified unit

A classification attaches to **one exact canonical model version**, never to a lab, a brand, a family or a name.

Production already holds the counterexample. One publisher ships models under a single brand and a single version number where some are downloadable and some are not, and a schema keyed on anything coarser would make that distinction unrepresentable. A second counterexample appeared during this phase: the same model name carried a restrictive community licence in its April preview and a permissive licence at its July full release. Classifying "that model" would have been wrong in one of the two directions whichever answer was chosen.

## 4. The taxonomy

Six internal classes are recorded, because the licences are that different:

- **open_weights_unrestricted** — weights published under a licence with no field-of-use restriction.
- **open_weights_restricted** — weights published under a licence that restricts some commercial use, by revenue threshold, user count, attribution obligation or acceptable-use clause.
- **open_weights_noncommercial** — weights published for non-commercial use only.
- **api_only_closed_weights** — offered as hosted access; the publisher lists no downloadable weights.
- **unknown** — Urdais has not established how this model's weights are distributed.
- **not_applicable** — the source does not disclose which model served this volume.

Three public classes are shown:

- **Open-weight** — the three open classes above.
- **Proprietary** — api_only_closed_weights.
- **Unclassified** — unknown and not_applicable, plus volume that never reached a classification at all.

**The fold is stated rather than hidden.** Restricted and non-commercial weights roll up to Open-weight because the question the product asks is whether the publisher released the weights, and that is what changes the economics: a downloadable model can be self-hosted, fine-tuned and served by anyone with the hardware, whatever the licence says about who owes a notice email. Folding them into Proprietary would make the headline number wrong about the thing it names. Folding them in silently would be worse, so the internal class survives in the data and the licence name travels with the model.

## 5. Evidence rules

A classification requires a **positive finding about a publisher artifact**. The hierarchy, strongest first: the weight licence itself, the publisher's own weight repository, the publisher's model card, release documentation, an official repository, and an official pricing or access page.

**Failing to find weights is not evidence that none exist.** The schema enforces this rather than trusting discipline: an open class requires a locatable artifact URL and one of the stronger evidence types, and the evidence type `no_evidence_found` may only ever support `unknown`.

**Proprietary is a positive finding too.** It means the publisher enumerates how the model is obtained and every channel is hosted — not that a search came back empty. Where a publisher's own page lists five hosted platforms and offers no download, that enumeration is the evidence.

Where corroboration is weaker than a direct publisher statement, the classification row records that in its own column rather than presenting the finding as stronger than it is. One model in the initial set is recorded as `unknown` for exactly this reason: secondary sources describe it as hosted-only, no first-party statement was located, and suggestive is not positive.

## 6. Classification changes, and the old answer was not wrong

A model released hosted-only may have its weights published a year later. So a classification is **superseded, never updated in place**, and carries the date from which it is true — which is what lets a historical statement stay defensible after the world moves. The read layer joins only live rows.

## 7. Identity

Volume arrives from UTVI as the source's permaslug, verbatim. Connecting it to a canonical model is an **evidenced link or it does not happen**. There is no fuzzy matching, no alias guessing, and no fallback that assigns volume to a model on resemblance.

Two link rules are used, and each link records which one applied:

- **Where the publisher versions by date** — DeepSeek names its own checkpoints `0423`, `0731`, `0813` — the date is part of the identity and a mismatch is a real mismatch.
- **Where the publisher's identifier is dateless and the name is unique**, the source's date suffix is a listing date and the link is by name.

Unlinked volume keeps its tokens and loses its class: it is reported as Unclassified, never assigned to either side.

## 8. Volume share

Share of observed token volume over a trailing 30-day window, anchored to the newest published UTVI date rather than to today, so a day when collection has not yet run shifts nothing.

**The denominator is total observed tokens, the same one Market Share 1.1.0 uses.** Dividing by classified-only volume would make the two known classes sum to 100% while a large share of traffic sat outside the calculation, which turns "of what we could classify" into "of the market" in the reader's head. Two Urdais products disagreeing about the size of the market would be worse than either answer.

**Unclassified is a published number, not a rounding error,** and its three causes are reported separately because they are different work:

- **source-aggregated** — the source's own aggregate tail row, which names no model and can never be resolved by Urdais.
- **unlinked** — a permaslug with no evidenced canonical model. Identity work Urdais has not done.
- **undetermined** — a linked model whose access class is `unknown` or `not_applicable`. Evidence work, or a permanent property of the identifier.

The largest single unresolved identifier in the initial set is an anonymised stealth endpoint. Its publisher later stated publicly which model had been behind it, but the permaslug names a routing alias rather than a published model, and Urdais cannot establish which model served the volume recorded under it on any given date. Its volume is kept and reported as Unclassified rather than assigned to a class on a press statement.

## 9. Capability gap

For each benchmark, the highest-scoring configuration in each public class, and the difference between them.

The unit is the same one Model Frontier plots: a canonical priced model SKU under one source-declared configuration. Ties resolve on the canonical model identifier, so the reported model does not depend on row order. Only models carrying a live classification participate; a model with no classification has nothing to contribute to "the most capable open-weight model," and the production check reports how many observations that excludes.

Where one class has no measured model on a benchmark, the gap is **not reported**. There is no comparison to make, and a gap against an absent side would be an artefact of coverage.

## 10. Price gap

Median blended list price per 1M tokens in each class, **among models at or above a capability threshold on the selected benchmark**.

**The threshold is derived, never chosen.** It is the lower of the two classes' best scores on that benchmark. This makes the comparison symmetric, guarantees both sides are non-empty, and removes the one degree of freedom that could be tuned to produce a flattering ratio. Comparing every open model against every proprietary model instead would measure the composition of each class's tail rather than the price of comparable capability. The demo surface this replaced used a fixed capability score as the threshold, which is exactly the free parameter that makes a price ratio unfalsifiable.

Two further rules:

- **One model contributes one price.** A model measured at three reasoning efforts is one product at one price, and letting it contribute three identical values would weight the median by how thoroughly the capability source happened to evaluate it.
- **The median averages the two middle values** when the count is even. Either convention is defensible; this one is stated so the number is reproducible from the published rows.

The price is the same 50/50 input-output blend Model Frontier plots, computed by the same function, so a price quoted in one section cannot disagree with the same model's price in the other.

## 11. What is derived at read time

Everything except the classification. Volume shares, capability bests and price medians are aggregations of rows the platform already holds, recomputed on each request from live publications, live snapshots and live classifications.

This is how revision is handled — structurally, rather than by procedure. A revised UTVI date, a superseded capability observation or a superseded classification changes what this section returns on its next read, with nothing to invalidate and nothing that can go stale.

## 12. Refusal states

The section publishes nothing rather than something wrong. An unconfigured deployment, an unreachable database, a methodology version still in draft, or a trailing window with no observations all produce an explicit statement that no comparison is published.

A benchmark where one class has no classified model is reported as a benchmark whose comparison cannot be made. That is a real and reportable state, not a broken section.
