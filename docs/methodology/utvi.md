# Urdais Observed Token Volume Index (UTVI) Methodology

**Version 1.0.0, approved 16 September 2026. Status: approved for production, effective from 1 January 2025.** Prepared 16 September 2026 from the Phase 1 source study and the Phase 1A characterization of the live authenticated source, and approved after the backend was built and verified end to end.

**This is the first version under which UTVI may publish a value.** A methodology version carries an effective date only when it is approved, and a database trigger refuses any publication whose methodology version is not approved — so the promotion of this document from draft to approved is the activation switch, and nothing else is.

Prepared under the [Urdais methodology framework](/docs/methodology). This draft rests on the Urdais's internal Phase 1 source study and the Phase 1A source characterization, which measured the live authenticated endpoint, and it is accompanied by an internal data-architecture proposal. Facts below marked *measured* were observed against real responses; facts marked *documented* come from the source's own documents. Its purpose is to state what UTVI would measure, precisely enough that the decision to build it can be taken on evidence — and precisely enough that the decision *not* to build it remains available.

## 1. Objective

UTVI measures **observed AI model token consumption over time, across the platforms and models Urdais can defensibly observe.**

The word *observed* is load-bearing and appears in the name for that reason. Every clause of this document exists to keep the measure inside what was actually seen.

UTVI is **not**, and must never be described as:

- total global AI token consumption
- total industry or market token volume
- comprehensive AI usage

Under this version the observed universe is **one marketplace**. Its measured level is **17.75 trillion tokens per day** (2026-09-15), which against the disclosure floor in the source study is roughly **5 % of world token throughput**. A measure of 5 % of a market is a legitimate market-data product — many are — but only if it says so in the same breath as its value.

## 2. Economic interpretation

UTVI answers one question:

> How many tokens per day did models process across the platforms Urdais observes, and how is that changing?

It is a **demand-side consumption quantity**, the volume counterpart to [Urdais Token Price](/docs/methodology/token-price)'s unit cost. Price says what a token costs; UTVI says how many were consumed where Urdais can see. Together they describe a market in the way that price and volume describe any other.

What UTVI is **not** an estimator of, and must not be presented as a proxy for:

- **World token consumption.** It is a sample of known, non-random, ~5 % coverage, with a known direction of bias. A sample like that does not scale up.
- **Any lab's total usage.** A lab's traffic on one marketplace is not its traffic. A lab that sells mostly through its own API can appear small in UTVI while being enormous in the market.
- **Inference compute demand.** Tokens are not FLOPs, and the ratio moves with model architecture, reasoning behaviour and context length.

**Movement in UTVI is interpretable; the level is a floor.** This asymmetry is the honest statement of what the product is worth. Day-to-day change on a fixed universe reflects real change in observed consumption. The level answers "at least this much was consumed on these platforms", and nothing more.

## 3. Observation universe

Under this version, the observed universe is:

> **UTVI measures token volume exposed by OpenRouter's `rankings-daily` dataset for the traffic included by that dataset. Urdais makes no claim about inclusion of BYOK or hidden/private application traffic unless OpenRouter explicitly documents it.**

That second sentence is the load-bearing one, and it is deliberately a refusal rather than a description. The dataset documents that it covers "the top 50 public models per day"; it does not document how bring-your-own-key traffic or traffic from applications their owners have hidden is treated. Urdais asked and has no answer. **So the universe is defined by deference to the source rather than by an Urdais assertion about it**, and it stays that way until OpenRouter documents otherwise.

The alternative was to write down a plausible guess. The reason not to is specific rather than fastidious: the universe descriptor is frozen onto every published value, and a descriptor that turns out to be wrong cannot be corrected without superseding every point that carries it. A narrower claim costs nothing and cannot become false.

**Included, on the source's own documentation**: traffic the `rankings-daily` dataset reports; the models it names, both proprietary and open-weight; all modalities it serves; and its aggregate tail row.

**Excluded, by construction rather than by inference**: first-party API traffic direct to a lab; consumer assistants such as ChatGPT, the Gemini app and Doubao; self-hosted and on-premise inference; other routers, gateways and clouds; and training and fine-tuning of any kind. None of these reaches the dataset at all.

**Undetermined, and published as undetermined**: BYOK traffic, and traffic from hidden or private applications. Urdais does not know whether the dataset includes them and does not imply either answer. If a shift in one of them ever moved the series, Urdais could not detect or explain it — that limitation is real, it is stated here, and it is the price of a source that reports a total without documenting its edges.

**The serving platform is not a market participant and is never aggregated as a lab.** OpenRouter is the *observer*; the labs whose models it serves are the subjects. This separation is structural, mirrors the UCPI rule that a technical source is never a participant, and is why §6 keeps lab identity and platform identity in different columns.

### 3.1 Why a level, and not a base-100 index

The product is named an Index and publishes a level in tokens per day. That combination is deliberate and is the recommendation of the Phase 1 study. A base-100 normalisation was considered and rejected on three grounds.

**The observed level is the product.** `tokens/day` is a directly observed, source-reported quantity with clean provenance. Base-100 replaces it with a synthetic unit whose only content is change — discarding the one number that is defensible on its own and that a reader can check against a disclosure.

**Normalisation does not fix what it appears to fix.** The argument for base-100 is that the level invites a false comparison with world consumption. But re-basing hides the coverage problem rather than solving it: a reader told "UTVI = 143.2" has *less* ability to notice that the figure is a single-digit percentage of the market than a reader told "17.75 T tokens/day", who can compare it to a disclosure. The coverage problem is solved by disclosure and by the word *Observed*, not by changing units.

**House convention already settles it.** UCPI publishes a median in dollars per accelerator-hour under the name *Index*. An Urdais index is a composite statistic computed under a published methodology, not necessarily a re-based series, and UTVI as a level is consistent with the family rather than an exception to it.

UTVI is therefore, in the terms of the phase brief's §3, **Option A** — an index defined as a direct aggregate level series — with Option C's naming discipline applied, because the defect in *Token Volume Index* was never the word *Index* but the unqualified words *Token Volume*.

**A base-100 variant is deferred, not refused.** If a second platform is ever admitted, chain-linking a re-based series across the join is the standard instrument for exactly that problem (§9), and it becomes buildable at the moment two universes are observed over the same dates. Until then it would be machinery with nothing to do.

## 4. Eligible sources

A source is eligible only when **all** of the following hold. This is the UCPI gate, unchanged, and it is not relaxed for a volume measure.

1. **Collection permitted** — Urdais may retrieve it automatically through its documented interface.
2. **Data use permitted** — Urdais may use the data to construct, calculate, publish and maintain an index.
3. **Production approved** in the registry, which additionally requires recorded evidence from a successful retrieval.
4. **Direct** — the publisher's own interface. Mirrors, caches, alternative endpoints and secondary aggregators are never admitted, and are specifically never admitted to work around a restriction on the primary.
5. **Machine-readable, with a stable documented contract.**
6. **Daily or finer grain, at point-in-time date identity.** A source publishing only rolling or trailing aggregates is not a source of daily values (§11).

Under 1.0.0 exactly one source is production-approved: **OpenRouter's `rankings-daily` Datasets endpoint**, whose two rights axes both read permitted under a Creative Commons Attribution 4.0 grant that covers commercial reuse and adapted material. No second source is admitted, and admitting one would be a methodology-version break under §9.

### 4.1 Source hierarchy

Where sources compete, precedence runs:

1. Directly observed token counts from the platform that served the traffic
2. Provider-reported token counts for their own traffic
3. Platform-observed volume reported by an intermediary
4. Audited third-party estimates
5. Inferred estimates

**Ranks 1–3 are admissible to UTVI. Ranks 4 and 5 are not.** An estimate may be published *beside* a UTVI value as context, labelled as an estimate with its method and publisher, and may never enter the sum. This is what keeps the series one kind of statement.

**Observed and estimated values are never mixed into one series.** Not silently, and not with a footnote.

## 5. Eligible token categories

UTVI counts **inference input and output tokens**, as reported by the serving provider's own tokenizer.

**Included.** Input and prompt tokens, and output and completion tokens, both documented and **neither separable** from the other. Reasoning and thinking tokens, documented twice as a breakdown reported beneath completion tokens. Cached input tokens, documented as a breakdown beneath prompt tokens and therefore inside the total, again not separable. **Embeddings**, which measurement found in the observed top 50 across four models at about 0.19 % of attributed volume over ninety days. Multimodal and image-generation tokens as reported, with image-generation models measured inside the unattributed residual and image-output volume at roughly 0.02 % of a day; no equivalence between an image token and a text token is asserted or computed. Batch inference where present, not separable.

**Excluded.** Training and fine-tuning tokens, which are a different economic object: the production of a model rather than the consumption of one.

**Out of reach and not claimed.** Any internal hidden tokens a provider does not report.

**Input and output legs can never be published under this source.** The source returns one combined figure and no leg fields at all. This is a permanent property of the measure, not a gap awaiting a later release: a version that wanted legs would need a different source.

**Non-text tokens are inside the total and cannot be removed.** They are measured at roughly 0.2–0.4 %, and the reason they are irreducible is structural: excluding a named embedding row would still leave image-generation tokens inside the opaque residual (§13). A text-only filter yields a *different, non-total* statistic rather than a cleaned version of this one. The inclusion is therefore disclosed, and no purity is claimed that the residual makes impossible.

**Reasoning tokens are a live interpretive hazard**, not a footnote. A lab shipping a more verbose reasoning mode raises UTVI with no change in user demand, and this version cannot separate the two.

### 5.1 The unit, stated honestly

> **UTVI's unit is provider-reported tokens per day. It is not a count of a uniform physical quantity.**

Each provider counts with its own tokenizer, so the same text yields different counts at different labs. The source says so directly: "a token in one row is not directly comparable to a token in another row from a different provider."

A sum across providers is therefore a sum of differently-defined units. This is disclosed, not corrected. No cross-provider tokenizer normalisation is attempted, because doing so would require re-tokenising traffic Urdais cannot see and would replace an observation with a model. The analogy is a barrel of crude: grades differ, the aggregate is still the standard measure, and the answer is to define the unit precisely rather than to invent a synthetic one.

**Input and output legs are not separately published** under this version, because the source does not separate them. If a source ever does, splitting them is a new version, not a reinterpretation of this one.

## 6. Model and lab normalisation

Three identities are kept in three places, and conflating any two of them is the failure this section prevents.

- **Source model id** — the platform's own identifier, stored verbatim and never rewritten, for example `anthropic/claude-3.5-sonnet-20241022:free`.
- **Canonical Urdais model** — the model as an economic object, folding variants: Claude 3.5 Sonnet (20241022).
- **Lab** — the organisation that made the model: Anthropic.
- **Serving platform** — the platform that observed the traffic: OpenRouter.

A lab and a serving platform are **different entities in different roles**, and a lab is never inferred from a platform's routing namespace without evidence. The example the phase brief gives is exactly right: lab Anthropic, serving platform OpenRouter, model Claude X — three fields, not one string.

**Stable identity is the source's own identifier.** Display names change; marketing renames a model; a lab re-brands. None of that may rewrite history, and the rule is the one Urdais already applies to model identity: the key is `(namespace, native id)`, and an identity survives a rename by construction.

**Aliases and floating pointers are not identities.** A `:latest`-style pointer names whatever it currently points at, so it cannot back a historical series. Pointers are recorded as aliases against their target, never as models.

**Variants fold for attribution and not for the total.** `model:free` and `model` are one canonical model with two source ids. Folding them is required for model- and lab-level attribution, and is irrelevant to the daily total, which sums all traffic once either way. **Measured**: over 90 days there were 29 dates on which one base model appeared as two rows, so this is an observed condition rather than a precaution.

**The source's namespace is a grouping key, never a lab identity.** **Measured**: one lab appeared under two namespaces; one namespace was a model *family* belonging to a different lab; one namespace was the serving platform itself; and one namespace was an undisclosed author carrying ~3 % of attributed volume. Lab identity is therefore resolved through an evidenced alias mapping, and a namespace with no evidenced lab is recorded as unattributed rather than guessed at.

**Open-weight models are canonical by checkpoint, not by host.** One checkpoint served by five hosts is one model; five hosts' traffic is five different flows of real consumption and all five are counted. The thing that must never be counted twice is one flow, not one model (§10).

## 7. Coverage requirements

> **A date has valid UTVI coverage only when at least one production-approved source successfully retrieved the observed universe for that date.**

Coverage is a property of **retrievals, not of observations**. A retrieval that succeeded and returned nothing is coverage, and a true zero. Only the absence of any successful production retrieval is an absence of coverage. This is the distinction Urdais established for its compute price index, and it transfers unchanged.

Five states, kept distinct, and never collapsed to a number:

- `covered_observed` — a retrieval succeeded and returned rows. The value is published.
- `covered_zero` — a retrieval succeeded and a model genuinely had no traffic. Zero is published **for that model**, and the date is still covered.
- `not_covered` — the model or platform is not in the universe under this version. Nothing is published, and the exclusion is recorded.
- `retrieval_failed` — attempted and failed. **No point.** Not zero, and not carried forward.
- `pre_coverage` — before collection began for this universe. **No point at all.**

**Missing data is never zero.** The trap is arithmetical rather than conceptual: summing an empty set of rows yields `0`, which is a plausible-looking number and a false claim about the world. The aggregation step must therefore refuse to run on a date without coverage rather than produce its sum — the precondition pattern Urdais already implements for its compute price index.

**A pre-coverage date has no point**, not an `Unavailable` one. A public series begins at its first real production observation and asserts nothing about the days before.

## 8. Aggregation

For calculation date `t`, over the eligible observed universe `i`:

$$
UTVI_t = \sum_{i} Tokens_{i,t}
$$

where `Tokens` are provider-reported input + output tokens for one `(date, source model id)` row from one production-approved source, after deduplication (§10).

Four rules complete it:

- **No weighting.** UTVI is a quantity, not an average. Nothing is weighted by price, capability, share or source quality.
- **No rounding before the sum.** Source values are exact integers and are summed as exact integers, in a numeric type that cannot lose precision. Display rounding is a presentation concern and never re-enters the data.
- **Truncated attribution does not truncate the total.** Where a source reports its leading models individually plus one aggregate residual, **both** enter the sum. The total is complete; only attribution is truncated (§13).
- **A day is a UTC calendar day**, and date identity is the source's own UTC date. No local-time or exchange-day convention.

## 9. Coverage changes and the expanding-universe problem

The largest methodological risk in a volume index is that **the aggregate rises because Urdais started looking somewhere new.** Growth from coverage and growth from consumption are different facts and must not share a series.

Three cases, treated differently, because they are not the same event.

**Case 1 — a new model appears on an observed platform.** This is **real observed growth** and enters the series with no adjustment. The universe is defined as *the platform's traffic*, not as an Urdais-chosen model list, so a new model arriving is the market moving inside a fixed universe. Nothing to correct.

**Case 2 — a new platform is admitted.** This is a **methodology-version break**, never an incremental improvement:

1. The new version declares the new universe and its effective date.
2. **History is never restated.** Values before the effective date keep the universe and version that produced them.
3. **Percentage change is withheld across the break** — never computed between two different economic objects, and never shown as zero. This is exactly the rule [Token Price](/docs/methodology/token-price) applies at a designation change, reused rather than reinvented.
4. The published coverage descriptor changes on that date, so the break is visible in the data and not only in a changelog.

**Case 3 — a platform is lost** (rights withdrawn, interface closed). Symmetric: a version break forward, no back-revision, change withheld across it.

**Chain-linking is the right future instrument and is not V1.** A chain-link needs an overlap window where both universes are observed for the same dates. The candidate source retains ~20 months of history, so a second source with comparable retention would make a genuine overlap computable — at which point chain-linking is preferable to a hard break, because it preserves a continuous growth series. Recording it here so the V1 break rule is understood as a floor and not as a ceiling.

**Coverage-adjusted growth was considered and rejected for V1.** Adjusting a level for coverage requires an estimate of the unobserved part, which is rank 5 of the source hierarchy and inadmissible under §4.1. Urdais would be publishing a model wearing an observation's clothes.

## 10. Deduplication and source precedence

Under this version there is one source and no overlap. The rule is stated now because the shape of the risk determines the data model, and getting it wrong later is expensive.

**Deduplicate traffic paths, not models.**

- One model served by two platforms is **two different flows of real consumption**. Both count. Summing them is correct.
- One *request* visible to two sources is **one flow**. It counts once.

The second case is not hypothetical: an onchain inference subnet reported ~100–120 billion tokens/day and has integrated a routing layer with the candidate source, so its traffic may already be inside the candidate's totals. Ingesting both without a rule would double-count precisely that overlap.

Precedence where a flow is visible twice:

1. **The platform that served the traffic**, reporting its own volume, wins.
2. An intermediary's report of traffic it passed through to another platform is superseded by that platform's own report.
3. Where precedence cannot be established on evidence, **the flow is excluded and the exclusion is published**, rather than guessed at in either direction.

Every observation retains its own source regardless of which one represented the flow, so a precedence decision is auditable after the fact.

## 11. Cadence, revisions and settlement

**Collect daily. Publish daily. UTC date identity.**

One scheduled job per UTC day, reading the most recent completed UTC day — the pattern Urdais's daily compute-price job already implements, where a run shortly after midnight UTC collects for the day that just closed.

**Rolling aggregates are not daily values.** A source exposing only trailing 7-day or 30-day windows does not report point-in-time daily consumption, and such a figure may never be presented as a daily total or differenced into one.

**Revisions are expected, because the source says so.** The candidate's freshness field "reflects data-freshness because the underlying materialized view continuously ingests upstream events" — a date's total can change after Urdais first reads it.

The settlement rule, applied identically to backfilled and to current dates:

1. Every retrieval of a date is recorded **append-only**. Nothing is overwritten.
2. The published value for a date is the value from its **most recent retrieval**.
3. A date is **provisional** until the settlement lag has elapsed, then **final**; a final date is not re-read, and a change after finality is a correction by supersession, never an edit.
4. The published value carries its state, so a reader can tell provisional from final.
5. **The settlement lag is one further calculation day.** `D` is published as **provisional** on the run after it closes, and **final** on the next run, once the source has reported it unchanged a second time.

   **Measured**: the just-closed day continues to accrue at roughly 16 parts per million per day, monotonically, without ever changing rank order; days closed twenty-five hours or more showed exactly zero movement over the observed interval.

   **`final` is a settlement state, not a claim of immutability.** The evidence for older days being frozen spans minutes, not weeks, and a batch correction days later would not have shown up in it. A final date therefore remains supersedable, and the database enforces that rather than trusting this document: a late revision is a fact about the source, not a permission Urdais grants itself. A fourteen-day study runs alongside production to refine this parameter; it does not gate publication, because the revision and supersession machinery already handles whatever it finds.

One consequence worth stating, because it is the kind of thing that silently splices two statistics into one series: a backfill retrieved today returns *settled* values while a forward daily job records *first prints*. Publishing the latest retrieval of every date is what makes both halves the same statistic.

## 12. Missing data

- **No coverage for a date → no point.** Not zero, not interpolated, not carried forward.
- **Retrieval failure → no point**, and a retry. A gap is recoverable while the date remains inside the source's retained window, which is a materially better failure mode than a permanent hole.
- **A model with no traffic → zero for that model**, on a covered date. The source expresses this by omitting the row, so an absent row inside a successful retrieval is a zero and not a failure.
- **Never a placeholder.** A date with no calculation is reported as having none.

**The source's own history contains empty dates, and they stay empty.** `2025-06-15` and `2025-07-15` return zero rows from the source while their neighbours return the usual fifty-one; both were re-requested individually and both returned a well-formed response with no data. **Neither has a UTVI point and neither ever will.** A zero there would claim the platform processed no tokens that day, and would sit mid-series at a fraction of a per cent of its neighbours — a false point that looks like a collapse. The two dates are absent from the published series, absent from every percentage change that would otherwise span them, and reported as source gaps rather than as retrieval failures.

Unlike a price series, **UTVI has no last-known-good carry**. A price persists between observations because a list price is a standing offer; a *quantity consumed on a day* does not persist, and carrying yesterday's volume forward would assert consumption that was never observed.

## 13. Truncated attribution

Where a source reports its top *N* models individually plus one aggregate residual for the rest:

- **The daily total is complete** — individual rows plus the residual — and UTVI loses nothing.
- **Attribution is truncated at *N*.** The residual carries no model and no lab.

**Measured**: the residual ran 4.59 %–7.98 % of the daily total over 90 days, mean 6.13 %. Attribution therefore covers about 94 % of volume.

**There are two residuals, not one**, and they are different holes:

1. The **volume residual** — the aggregate tail row, with no model and no lab.
2. The **lab residual** — models that *are* named but whose lab is undisclosed or unevidenced. **Measured**: one anonymous namespace carried ~3 % of attributed volume over 90 days.

Consequently, for any attributed breakdown (§14):

- **both residuals are published beside the shares**, each as its own figure;
- neither is silently dropped from the denominator nor silently folded into a named lab;
- a share is stated as a **share of attributed tokens**, and never as a share of the total unless both residuals are zero;
- a lab table whose shares sum to 100 % while an unattributed model sits inside a named lab is wrong, and this rule exists to prevent exactly that.

## 14. Derived breakdowns

Lab and model breakdowns are **two aggregations over the same normalised observations**, never a second ingestion path. For a trailing window `W`:

$$
Share_{lab} = \frac{\sum_{i \in lab} Tokens_{i}}{\sum_{i \in attributed} Tokens_{i}} \quad (i \in W)
$$

Four requirements: the denominator is **attributed** tokens with the residual published separately (§13); the window is declared with the value; every date in the window must have coverage, or the window is short and says so; and a lab total is the sum over its canonical models after variant folding (§6).

**No breakdown is published under this version.** The requirement here is only that the data model can serve them from the same observations, so that a later slice is an aggregation and not an ingestion project.

## 15. Percentage change

For period `k`:

$$
\Delta_{t,k} = \left(\frac{UTVI_t}{UTVI_{t-k}} - 1\right)\times 100
$$

Published for 1 day, 1 week, 1 month, 3 months, 6 months and 1 year.

- **Percentage, never absolute point change.** A difference of token counts is not a meaningful published statistic.
- **`null` where unavailable, never zero.** Zero is a claim that nothing changed.
- `null` where: history does not reach `t-k`; `t-k` has no coverage; or a methodology-version break falls between them (§9).
- Both endpoints must be **actual observed points**. A change is never computed against an interpolated, carried-forward or estimated value.
- The period is **calendar-anchored** on UTC dates, not a count of available points.

## 16. Historical backfill

**Permitted**, where the source retains real timestamped historical observations reachable through its documented interface, and each backfilled date is recorded with its own retrieval lineage.

**Not permitted**, in any circumstances: synthetic interpolation; guessed or modelled history; demo values reclassified as real; fabricated daily points; a smooth curve fitted through sparse disclosures.

Where no production-quality history exists, **the series begins at the first real production observation.** A short series is an honest one.

The candidate source retains daily history from **2025-01-01** and rejects earlier dates. **Measured**: a maximum request range of 366 days applies, so the ~20-month backfill is **two requests**, and the contract is identical at every date tested across those 20 months. That is enough for every period in §15 — including 1-year change — from the first print. Backfilled points are marked as such and settle under §11 like any other.

## 17. Revisions and corrections

- **Source revisions** within the settlement lag update the published value for that date, under §11.
- **After finality**, a change is a **correction by supersession**: the superseding calculation is recorded, the superseded one retained, and the correction published. Nothing is edited in place, and raw evidence is append-only.
- **A methodology change never revises a past value.** A version applies from its own effective date; values keep the version that produced them.

## 18. Attribution

Every source's required attribution is **carried on the data**, not attached at the edge: on the retrieval, on every observation derived from it, on the calculation run, and on every public representation of a value.

Where a source's citation interpolates a field from its own payload — the candidate's does, requiring an as-of timestamp from the response — that field is **persisted per retrieval**, because a static credit line cannot discharge the obligation.

A value whose attribution cannot be rendered is **not published**. This is the same fail-closed rule UCPI applies.

## 19. Publication requirements

Fail-closed, and each condition independently necessary:

1. An **approved** version of this methodology, with an effective date. 1.0.0 is approved and effective from **1 January 2025**, which is where the source's retained history begins and therefore where the series begins. A calculation dated before that is still refused.

   The approval date and the effective date differ on purpose. A value is computed under the version in force on its own calculation date; UTVI has never had any other version, and no date in the series was ever computed under anything else, so 1.0.0 governs the whole of it. That is a statement of fact rather than a backdating convenience — there is no earlier version whose values would be restated.
2. At least one **production-approved** source, both rights axes permitted.
3. **Valid coverage** for the date (§7).
4. Every constituent observation itself production-publicable. Research observations are never promoted.
5. Required attribution renderable (§18).

Where any condition fails, **no value is published and no substitute is shown**. A candidate value computed before approval is a labelled candidate, never a published one, and is never reclassified into the series.

Every one of these is checked by the database rather than by the application alone. `pipeline.check_utvi_publication()` refuses a publication whose methodology version is not approved, whose calculation date precedes the effective date, whose run is a simulation, or whose value, residuals, settlement state or content hash disagree with the calculation it claims to come from.

## 20. Public wording

Required:

- observed token volume · observed model consumption · covered universe · observed providers and models
- tokens per day, as reported by the serving provider
- the covered universe, named, beside the value

Prohibited:

- global token volume · total AI usage · total market consumption · the market's token volume
- any phrasing implying comprehensiveness, or that the level is an estimate of a larger whole

**The covered universe is published with every value**, not buried in a methodology link. A reader who sees only the headline should still be able to tell what was and was not observed.

## 21. Versioning

This document is versioned and effective-dated on the family pattern. A value is computed under the version in force on its own calculation date; a later version cannot alter an earlier value.

**A new version is required to change** the observed universe or the eligible source set; eligible token categories; the aggregation formula or deduplication rules; coverage requirements; the settlement lag; or the backfill policy.

**A new version is not required to** add a model that a source begins reporting inside an already-declared universe (§9, case 1), or to correct a value under §17.

## Version history

**1.0.0, approved 16 September 2026, effective from 1 January 2025**: approved for production. This is the first version under which a UTVI value may be published, and the first value is published under it.

The substantive change from 0.1.1-draft is the observation universe, which is narrowed to a statement of deference: UTVI measures what the source's dataset exposes, and Urdais makes no claim about BYOK or hidden and private application traffic unless OpenRouter documents it. The draft had described the universe as *public, non-hidden* traffic, which was an assertion the source's documentation does not support. Because the universe descriptor is frozen onto every published value, a claim that later proved wrong could not be corrected without superseding every point carrying it; the narrower statement cannot become false.

Also fixed: the settlement lag at one calculation day, with `final` stated explicitly as a settlement state rather than a claim of immutability, so that a late revision still supersedes; and the source's two empty historical dates, `2025-06-15` and `2025-07-15`, recorded as permanently absent from the series rather than as failures. The economic object, the unit, the aggregation, the coverage states, the deduplication rule, the token categories and the attribution requirement are unchanged from 0.1.1-draft.

**0.1.1-draft, 16 September 2026**: revised against the first authenticated measurements of the live source. Corrects the coverage figure from ~1 % to ~5 % on a measured level of 17.75 T tokens/day. Resolves cached-input treatment as included and not separable; records embeddings as **included**, against 0.1.0-draft's presumption that they were out of scope; states that input and output legs can never be published from this source; and states the ~0.2–0.4 % non-text inclusion as irreducible. Adds measured evidence that variant folding is required and that the source's namespace is not a lab identity. Sets a provisional settlement lag of one calculation day, with a confirmation protocol required before approval. Splits the attribution hole into a **volume residual** and a **lab residual**, both published. Records the 366-day request limit. The objective, the universe, the aggregation formula, the coverage states and the publication gate are unchanged. No production effective date.

**0.1.0-draft, 16 September 2026**: initial draft. Defines UTVI as an observed token-volume level series in provider-reported tokens per day; states the universe, the token categories, the unit's non-uniformity, the identity separation of lab and serving platform, the coverage states and the pre-coverage rule, the aggregation, the version-break treatment of an expanding universe, the traffic-path deduplication rule, the settlement-based revision policy, the truncated-attribution rule, percentage change with `null` rather than zero, and the fail-closed publication gate. **No source is production-approved and the settlement lag is unset**, so no value may be computed or published. No production effective date.
