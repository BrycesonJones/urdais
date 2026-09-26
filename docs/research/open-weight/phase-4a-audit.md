# Open-weight vs Proprietary — Phase 4A audit and design

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026 against the live codebase and UrdaisProd. No implementation, no schema, no migration, no collector and no approved methodology is created by this document. Every count is a query result.

The conclusion in one line: **the three panels draw on three different model universes that barely overlap, and the open-weight side is well represented in only one of them.**

## 1. Current demo architecture

| | |
| --- | --- |
| component | `src/components/model-economics/open-weight-analysis.tsx` |
| data | `OPEN_WEIGHT_ANALYSIS` in `src/data/mock/model-economics.ts` |
| derived from | `FRONTIER_POINTS` → `MODEL_ROSTER` → 18 hand-written `MODEL_SPECS` |
| class source | `accessClass` literals on those specs, typed in `src/types/model-economics.ts` |

`OPEN_WEIGHT_ANALYSIS` computes all three panels from one demo graph: volume share from `tokenVolume` over `SHARE_WINDOW_DAYS`, capability gap from `Math.max` of `capabilityScore` per class, price gap from the median `blendedPrice` among models with `capabilityScore >= PRICE_GAP_CAPABILITY_THRESHOLD` (80).

**Dependency state: this component is now the only consumer of the demo graph.** Market Share and Model Frontier were both detached in earlier phases. So `FRONTIER_POINTS` must remain until this section is replaced, and when it is, `src/data/mock/model-economics.ts` becomes dead in its entirety — the roster, the volume series, the frontier points and the analysis. That is a clean removal rather than a partial one, and it is the last demo data on the Model Economics page.

**There is no model access classification anywhere in production.** The `access_class` column that appears in migrations belongs to `reference.source_interfaces` and describes how Urdais reaches a *source* (`public_unauthenticated`, `api_key`, …). It has nothing to do with model weights. Grep finds `accessClass` in exactly one production file: the demo's own type.

## 2. Production substrate

### A. Volume — the panel with the coverage, and the identity problem

Measured over the trailing 30 UTVI days, **2026-08-17 → 2026-09-15**:

| population | share of window volume |
| --- | ---: |
| labs that have rows in `reference.models` | **45.40 %** |
| labs Urdais knows but has **no** model rows for | **42.17 %** |
| lab-unattributed named models (incl. `stealth`) | 6.63 % |
| source `other` residual | 5.80 % |

**81 distinct models** across **23 namespaces** in that window. Volume is concentrated — the top 10 models are 64.5 % of a single day, the top 20 are 79.3 %, the top 30 are 86.4 % — so the classification worklist is tractable rather than open-ended.

The blocking fact: **`utvi_model_observations.model_id` is NULL on every one of the 31,050 rows.** UTVI identifies models by OpenRouter permaslug (408 distinct, all-time) and nothing bridges those to `reference.models`. The Frontier's `capability_model_links` bridges *Epoch* identifiers, not UTVI ones.

And the models carrying the volume are largely ones Urdais has no record of at all. The top of the 30-day window is Tencent Hunyuan, DeepSeek, Z.ai GLM, Xiaomi MiMo and NVIDIA Nemotron; of those only DeepSeek appears in `reference.models`. **23 models in the window belong to labs with no `reference.models` rows whatsoever.**

Two permanent residuals, and they are different:

- **`stealth`, 5.97 % of named volume.** An author the source deliberately does not disclose. No research resolves it; it can never be classified, and calling it either class would be a fabrication.
- **source `other`, 5.80 %.** Volume with no model at all, so no model to classify.

### B. Capability

25 distinct `reference.models` carry an evidenced Epoch link, across 45 links and 69 plotted configurations (GPQA Diamond 44, FrontierMath Tiers 1–3 v2 25). All 25 are `reference.models` rows and could in principle receive an access class.

But the class composition is the problem. All 38 `reference.models` are **first-party API SKUs from seven labs** — OpenAI, Anthropic, Google, xAI, Alibaba, Moonshot, DeepSeek. The open-weight candidates inside that set are few and individually uncertain: `qwen3.8-27b` is plausibly an open release, `qwen3.8-max` plausibly is not, and they share a lab, a prefix and a version number. `kimi-k2.6` and `kimi-k3` need separate answers. None of that may be inferred, which is the point of §3.

**"Most capable model in each class" is not what the data supports**, for two independent reasons:

1. **The unit is a configuration, not a model.** Epoch identifies a run as model + reasoning effort, and Model Frontier plots configurations deliberately. `gpt-6-astra_max` and `gpt-6-astra_low` are different scores for one purchasable product. "Most capable" over configurations means "the best effort setting anyone ran", which is a defensible statistic but is not "the most capable model".
2. **There is no cross-benchmark "most capable".** GPQA Diamond and FrontierMath measure different things on different question sets; a model leading one may trail the other. A single capability-gap number would require a composite the Frontier methodology explicitly declined to build.

### C. Price

34 models carry a valid Model Frontier price selection. Two are excluded for having no standard tier (both DeepSeek) and two have no price observations at all.

**The priced universe is almost entirely proprietary first-party APIs.** Token Price covers seven first-party providers; the high-volume open-weight models — Tencent, Z.ai, Xiaomi, NVIDIA, MiniMax — have **no Token Price rows at all**, because Urdais prices the lab's own API and those models are consumed through third-party serving.

So a price gap computed over the priced universe compares roughly 30 proprietary SKUs against a handful of possibly-open ones. That is the central difficulty of the third panel and §5C treats it as such.

**The demo's `capability ≥ 80` rule cannot survive.** It refers to a 0–100 invented score. Production capability is source-native accuracy on 0–1 scales, and the two benchmarks are not interchangeable: 80 % on GPQA Diamond and 80 % on FrontierMath Tiers 1–3 are wildly different achievements. Carrying the number across would be a category error wearing a familiar label.

## 3. Access classification design

### Taxonomy

Binary is not honest at the storage layer. Epoch's own `accessibility` field — 1,063 models, CC BY — distinguishes four states that matter, and production will meet all of them:

| internal class | meaning |
| --- | --- |
| `open_weights_unrestricted` | downloadable under a permissive licence (Apache-2.0, MIT, similar) |
| `open_weights_restricted` | downloadable under conditions — acceptable-use limits, scale thresholds, named-entity restrictions |
| `open_weights_noncommercial` | downloadable, commercial use prohibited |
| `api_only` | no weights published; served only through an API |
| `hosted_no_api` | reachable only through a product surface, not programmatically |
| `unclassified` | Urdais has not established it. **Never a default** |

**Restricted and non-commercial weights are not equivalent to unrestricted ones.** A model whose licence forbids commercial use is not available to the readers of a commercial market-data product in the way an Apache-2.0 model is, and flattening them into one "Open-weight" bucket would assert an equivalence that the licences deny. The methodology must name which internal classes roll up to the public bucket, and that mapping is a decision requiring approval rather than a default.

### Evidence standard

Primary evidence is the publisher's own statement: the official model card, the official weights repository, the weights licence, or the official release documentation. Recorded per model with a URL, an evidence type, and a verification date.

Epoch's `accessibility` field is **discovery and cross-check only** — a worklist telling Urdais which models to research and a second opinion on the answer. It is a third party's assertion, and a methodology that accepted it as primary would be classifying 1,063 models on someone else's say-so.

Never inferred from a model's name, its lab, its provider, the word "open" in marketing, or the mere existence of a repository. Production already holds the counterexample: `qwen3.8-27b` and `qwen3.8-max` are the same lab and the same version family and are very likely different classes.

### Schema shape

```
reference.model_access_classes (
  model_id        uuid  → reference.models(id)
  access_class    text  → the six states above
  evidence_url    text  not null    -- the model card or licence, never a marketing page
  evidence_type   text  not null    -- publisher_model_card | weights_licence | release_documentation
  licence_name    text              -- where weights exist
  publisher       text  not null
  verified_at     date  not null
  verified_by     text  not null
  corroboration   text              -- e.g. 'Epoch accessibility: Open weights (unrestricted)'
  notes           text
  superseded_by_id uuid → self, deferrable
  superseded_at, supersession_reason
)
```

Supersession rather than update, because classification genuinely changes: a model released API-only can have weights published later, and the old classification was not wrong when it was made. One live row per model, enforced by a partial unique index — the pattern UTVI, Market Share and the Frontier all use.

## 4. The classification worklist

| universe | models | notes |
| --- | ---: | --- |
| Volume — UTVI 30-day window | **81** | 23 belong to labs with no `reference.models` rows |
| Volume — UTVI all-time | 408 | only needed if a longer window is ever published |
| Capability — evidenced Frontier links | **25** | all already `reference.models` |
| Price — valid price selections | **34** | all already `reference.models` |
| **Union, if Volume is in scope** | **~104** | 81 volume + the 23 priced models not in the volume window |

The union is dominated by the volume side, and that is the work: **23 new `reference.models` rows** for Tencent, Z.ai, Xiaomi, NVIDIA, MiniMax, Poolside, Upstage and Meta, plus a **UTVI permaslug → model bridge** that does not yet exist.

Permanently unclassifiable, and to be reported as such rather than researched: `stealth` (author undisclosed by construction) and the source `other` residual (no model at all).

## 5. Metric design

### A. Volume Share

Candidate claim, derived from the Market Share wording rather than invented:

> **Share of observed OpenRouter token volume represented in UTVI, grouped by model access class.**

Denominator: **total observed UTVI volume**, the same figure Market Share divides by, so the two sections reconcile against one another rather than telling different stories about one dataset.

Rows, all present and none renormalised away:

- open-weight (per the approved roll-up of internal classes)
- proprietary
- **unclassified named models** — Urdais has not established a class
- **lab-undisclosed** — `stealth`, permanently unclassifiable
- **source residual** — OpenRouter's `other`

**Shares must not be renormalised to 100 % across the two public classes.** On today's data that would take a genuine ~12 % of volume that is residual or undisclosed, plus whatever remains unclassified, and silently redistribute it into the two bars — inflating both and making the split look more complete than it is. The bar should read as a full decomposition of observed volume, exactly as the Market Share table does.

### B. Capability Gap

The defensible unit is **the highest benchmark score among classified configurations in each class, per benchmark**, with a benchmark selector matching the Frontier's.

The label must change. Candidates: *"highest score by any configuration in each class"*, or *"best observed configuration"*. Not *"most capable model"*, which asserts both a model-level fact and a cross-benchmark one, and the data supports neither.

Whether a configuration-level maximum is even the right statistic is a real question: it rewards whichever lab ran the most effort settings, and the open-weight side of the capability universe is currently thin enough that one model could carry the whole comparison. A count of classified configurations per class must be shown beside the gap, or the number will be read as more robust than it is.

### C. Price Gap — four alternatives

Coverage is the binding constraint. The priced universe is 34 first-party API SKUs, overwhelmingly proprietary.

| | population | statistic | failure mode |
| --- | --- | --- | --- |
| **1. All classified priced models** | every model with a class and a price | median blended price per class | Compares unlike things: a flagship against a small open model. The demo's capability threshold existed to stop exactly this, and removing it without replacement reintroduces the problem. |
| **2. Frontier-eligible only** | models plotted on a chosen benchmark | median blended price per class | Restricts to models with both a score and a price, which is the most defensible population — but shrinks the open-weight side further, possibly to single digits. |
| **3. Benchmark-specific capability band** | models scoring within a named band on one benchmark | median blended price per class | Like-for-like, and the honest successor to `≥ 80`. Needs a band per benchmark, chosen on evidence rather than on the result it produces. Introduces capability-selection bias by construction, which must be disclosed. |
| **4. Matched-capability pairs** | each open-weight model paired with the nearest-scoring proprietary model | median of the pairwise price ratios | The strongest like-for-like claim and the least dependent on population size. Most complex; needs a matching tolerance, and degrades badly when one side is sparse. |

**A single headline "N× cheaper" number is probably not supportable at current coverage**, whichever definition is chosen, because every one of them rests on an open-weight sample that may be under five priced models. The measurement to run before choosing is simply: *how many priced models are actually open-weight?* That cannot be answered until classification exists, which makes it the first thing Phase 4B should measure and a legitimate reason to ship the third panel later than the first two.

## 6. Temporal semantics

Four independent clocks, none of which may be collapsed into one "last updated":

| input | date | cadence |
| --- | --- | --- |
| volume | UTVI trailing window, e.g. 2026-08-17 → 2026-09-15 | daily, automated |
| capability | Epoch evaluation dates, spanning months | on model releases |
| price | Token Price verification date, currently 2026-09-14 | human-verified, 7-day review interval |
| access class | `verified_at` per model | event-driven (see §8) |

Each panel states the date of its own input. The section may state the oldest of them as a floor, but never a single synthetic timestamp implying the four were taken together.

## 7. Rights and acquisition

Model cards and weights repositories are **publicly readable, citable, and their factual content storable** — that a model's licence is Apache-2.0 is a fact, not an expressive work. What is not established is **automated retrieval on a schedule**: a Hugging Face page or a lab's model card is not cleared for scheduled collection merely by being public, and Urdais has been explicit elsewhere that publication grants no collection right.

So classification should be treated as **human-verified reference research**, recorded through the source-registry and evidence patterns already used for permission grants — the same posture Token Price takes, for the same reason. Epoch's `accessibility` field is separately usable under CC BY, which is what makes it safe as a worklist.

Republishing a licence *name* alongside a model is ordinary factual citation. Republishing licence *text* is not proposed and should not be.

## 8. Freshness

Three existing clocks already have owners — UTVI daily, Epoch daily at 03:40 UTC, Token Price verification at 07:00 UTC with a 7-day interval. Access class needs a fourth, and it should be **event-driven rather than periodic**:

> A model entering the relevant universe without a classification produces an **explicit unclassified residual**, visible on the surface and counted by the production check, until someone researches it.

That is better than a periodic re-review because classification is mostly static and the thing that actually changes is *which models matter* — a new model appearing at 8 % of volume is the event worth reacting to, not the calendar. A long-stale `verified_at` on a model whose weights status has not changed is not a defect.

Re-verification should still be triggered on a model's own version change, since that is when a lab's posture can shift.

## 9. UI implications

The three-panel layout survives. Specific wording does not.

| current | problem |
| --- | --- |
| "Most capable model in each class" | It is a configuration, not a model, and there is no cross-benchmark "most capable". |
| "demo capability score" | Must become the named benchmark and its source-native scale. |
| "Models with capability ≥ 80" | Refers to an invented 0–100 score. Meaningless against 0–1 accuracies on two incomparable benchmarks. |
| Two bars summing to 100 % | Hides the residual and unclassified populations, which are material. |
| "proprietary leads" | Fine as a direction, but needs the count of classified configurations beside it. |
| "5.6× proprietary median" | A ratio whose denominator may rest on a handful of models. Needs both counts shown, or should not be a headline. |

Required additions: a benchmark selector on the capability panel, per-panel dates, and an explicit unclassified/residual figure on the volume panel. The section should report its own coverage rather than presenting a clean split it cannot support.

## 10. Implementation architecture

Smallest viable shape, reusing what exists:

```
reference.model_access_classes          new — evidence-backed, superseding
reference.models                        +23 rows for the unpriced high-volume labs
reference.utvi_model_links              new — permaslug → model, the same evidenced
                                        pattern as capability_model_links
read model                              read-time aggregation over UTVI observations,
                                        Frontier points and Token Price selections
```

**No derived tables.** All three panels are aggregations over a few thousand rows, the same reasoning that settled Market Share and the Frontier on read-time derivation, and the same benefit: a reclassification changes the surface on the next request with nothing to invalidate.

Sequence, and it matters: the classification layer and the UTVI bridge are prerequisites for Volume; Capability needs only classification; Price needs classification plus a decision on §5C. **The panels can ship independently**, and shipping Volume and Capability before Price is a reasonable outcome rather than a failure.

Also required: methodology document, production-readiness additions (classification coverage, unclassified volume share, per-panel dates), tests, and a classification workflow — an operator script that lists unclassified models in the relevant universe ordered by the volume they carry, so the work is always done in the order that matters.

## 11. Blockers requiring approval

1. **Does the public "Open-weight" bucket include restricted and non-commercial weights?** If it does, the label overstates what a reader may do with those models. If it does not, the open-weight share falls and the buckets need a third public category. This is a product and methodology decision, not an implementation detail.
2. **Is Volume in scope for V1?** It is the panel with real coverage and also the only one requiring 23 new model rows and a whole new identity bridge. Capability and Price need neither.
3. **Price Gap population** — which of the four §5C definitions, and whether the panel ships at all before the open-weight priced count is known.
4. **Capability Gap unit** — configuration-level maximum per benchmark, and the wording that replaces "most capable model".
5. **Renormalisation** — confirmation that volume shares are *not* rescaled to 100 % across the two public classes, leaving residuals visible.

Nothing is built until 1, 4 and 5 are settled; 2 and 3 determine scope rather than blocking a start.
