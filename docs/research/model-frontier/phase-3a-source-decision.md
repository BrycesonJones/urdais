# Model Frontier — Phase 3A source decision memo

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026, reconciling the [Phase 3A audit](./phase-3a-audit.md) against external research. No implementation, no ingestion, no schema, no migration and no approved methodology is created by this document.

**Decision: Epoch AI approved for V1. LiveBench conditionally approved, blocked on one written confirmation.** Option C — benchmark-specific frontiers — is retained and is what makes that pairing coherent rather than a compromise.

## 1. Where the two analyses agree

Completely, on the two largest questions:

- **Option C over a composite.** Named, dated, per-benchmark frontiers. No Urdais-invented weights.
- **Artificial Analysis is excluded.** Both analyses reached §2.5 independently: Model Frontier is a Competitive Product under AA's own definition, and §2.4(c)/(d) separately forbid embedding the Data in a customer-facing dashboard or combining it with third-party data into a product. A Commercial Order Form does not by itself waive §2.5. Also agreed: OpenRouter's CC BY 4.0 wrapper does **not** sublicense AA rows.

The disagreement is narrower than it first appears, and one fact resolves most of it.

## 2. The comparison was not like-for-like

**The external source matrix does not contain Epoch AI.** It evaluates LiveBench, Arena, HELM, Artificial Analysis, OpenRouter, SWE-bench, GPQA, MMLU-Pro, Open LLM Leaderboard, provider self-reports, Scale SEAL and LiveCodeBench — twelve sources, and not the one this audit recommended. Its conclusion that LiveBench is "the strongest V1 source" is therefore a ranking of the field minus the candidate under review, and cannot settle the question on its own.

That is not a criticism of the work, which is careful and whose LiveBench findings are confirmed below. It just means the comparison still had to be made.

## 3. The two licence positions, verified first-hand

### LiveBench — both flagged facts confirmed

- **[DATASHEET.md](https://github.com/LiveBench/LiveBench/blob/main/docs/DATASHEET.md)**: the benchmark is *"distributed under the Apache License 2.0"*, *"There are no copyrights on the data"*, *"There are no fees or restrictions."* As permissive as language gets.
- **[LICENSE](https://github.com/LiveBench/LiveBench/blob/main/LICENSE)**: two concatenated licences — Apache 2.0 (FastChat) and MIT (Copyright © 2024 LiveCodeBench). Which is why GitHub labels the repository **Other**.

The ambiguity is real but it is not the one it looks like. That `LICENSE` file contains **no LiveBench-authored grant at all**: both licences are *inbound*, covering third-party code LiveBench incorporated. It neither grants nor withholds anything about LiveBench's own output. So the repository licence does not contradict the datasheet — it simply does not speak to the question.

The datasheet does speak, but to a different artifact. A datasheet documents **the dataset**; "there are no copyrights on the data" is a statement about the questions and answers. A leaderboard score table is not the dataset — it is LiveBench's *measurement output*, produced by running models against that dataset. Reading the dataset grant across to the scores is a reasonable inference, and it is the reading the external research takes. **It is still an inference**, which is why that research lists maintainer confirmation as an open gap and marks commercial reuse *"pending maintainer confirm."*

The brief's own instruction settles how to treat that: **do not rely on public availability as permission.** An inference from a datasheet about a different artifact is closer to availability than to permission.

### Epoch AI — an explicit grant over the scores themselves

The [use-this-data](https://epoch.ai/benchmarks/use-this-data) page exists to answer this exact question. The data is *"free to use, distribute, and reproduce provided the source and authors are credited"* under **CC BY 4.0**, with a specified citation string. CC BY expressly permits commercial use and redistribution.

The structural point matters more than the wording: for its **internally administered** benchmarks Epoch *is the author of the measurements*. It ran them, under documented settings, using Inspect — so it holds the rights it is licensing. There is no gap between the licensed artifact and the artifact Urdais wants. No inference is required and no maintainer email is needed.

### Which Epoch rows are provably safe

Epoch separates its data into *"internal benchmarks that are evaluated by Epoch AI themselves"* and *"external benchmarks where results are obtained from external sources"*, and states that externally sourced data *"retains its original licensing"* (Aider Polyglot: Apache 2.0).

**Safe to republish commercially: Epoch-administered results only** — GPQA Diamond, MATH Level 5, Mock AIME 2024–25, FrontierMath, SWE-bench Verified. Restrict V1 to these. One licensor, one licence, one citation. Externally sourced rows are excluded from V1 rather than licence-tracked per row; that is a smaller surface to get right, and Option C does not need breadth to work.

A consequence worth stating: Urdais would republish **Epoch's SWE-bench Verified numbers under Epoch's settings**, never the mixed-agent swebench.com table, which measures systems rather than models.

## 4. Head-to-head on the ten criteria

| criterion | Epoch AI | LiveBench |
| --- | --- | --- |
| **explicit commercial republication of numeric scores** | **CC BY 4.0, stated, over its own measurements** | Inferred from a dataset datasheet; *pending maintainer confirm* |
| proprietary + open-weight coverage | both, incl. non-US open-weight | both, on one dated table |
| dated / history-preserving | dated results with source citations | dated CSV filenames retained in git |
| machine-readable official path | CSV bundle **+ `pip install epochai`** (Airtable API) | dated GitHub CSVs + `download_leaderboard.py`; **no score API**; site must not be scraped |
| update cadence | continuous as models release | ~1/6 questions replaced per update; full refresh ~6 months |
| benchmark breadth | 5 internal + many external (V1: the 5) | 7 categories in one harness |
| model/version identity | settings documented separately from identity | suffixes encode thinking budget and effort — honest, but fewer rows join |
| join to Urdais SKUs | explicit bridge required | explicit bridge required |
| operational stability | dedicated data page, client library, stable licence | JS-only site, no API, messy `LICENSE`, rotating question set |
| attribution | CC BY 4.0 + specified citation — **same family as OpenRouter's, already implemented for UTVI** | Apache notices + cite paper and table date |

Two rows decide it.

**Licence**, for the reason in §3.

**Cadence**, for a reason easy to misread as a strength. LiveBench rotates roughly a sixth of its questions per update and refreshes fully about every six months — excellent contamination resistance, and exactly what makes it a poor *longitudinal* axis. **Scores from two releases are two different tests.** A frontier built on it can be a defensible snapshot but cannot become a history without splicing populations, which the external research also warns against. Epoch's internal benchmarks are fixed sets, so results stay comparable as models are added, and the Frontier can become historical once Token Price has price history.

LiveBench's identity suffixes — `claude-opus-4-5-20251101-thinking-64k-high-effort`, `gpt-5.5-high` vs `gpt-5.5-xhigh` — are genuinely better practice than a bare alias, because they make a mismatch *visible* rather than silent. They also mean many rows describe an inference-time configuration that has no priced SKU, so the joinable subset is smaller than the table.

## 5. Decision

> **Epoch AI approved for V1**, restricted to Epoch-administered benchmarks, under CC BY 4.0 with the specified citation.

> **LiveBench conditionally approved**, blocked on one thing: written confirmation from the maintainers (`livebench@livebench.ai`) that **published numeric leaderboard scores** may be displayed in a commercial product under the datasheet's Apache 2.0 grant. On confirmation it becomes an additional named frontier — not a replacement.

This is not a compromise. **Option C is per-benchmark by construction**, so the source is a property of each frontier view rather than of the product. Starting with the licence-clean source and adding another when its licence is confirmed is the architecture working as designed.

Arena's Hugging Face `leaderboard-dataset` (CC BY 4.0) remains available later as a **preference** frontier, labelled as preference and never as capability — and only via Hugging Face, never by scraping the site, whose terms forbid it.

**First implementation gate, before any building:** count the actual joins. Epoch coverage of the 34 priceable Urdais SKUs is plausible but unmeasured, and if the evidenced join is thin the decision should be revisited rather than padded.

## 6. Price-leg selection rule

Selection is **by name, never by price.** Price is read only after the row is chosen, so no step can prefer a cheaper row — which is the structural guarantee that frontier position cannot be improved by selection.

Applied in fixed order:

1. **`service_tier = 'standard'`.** Named, not cheapest: `batch` is materially cheaper and `fast` dearer, so a cheapest-wins rule would systematically select batch — a different product with different latency guarantees — and flatter every model whose provider offers it. A provider publishing **no** standard tier yields no eligible price and the model is **excluded**, which is exactly how Token Price already treats DeepSeek's peak/off-peak catalogue.
2. **`context_tier` = the provider's declared base tier**, named per provider, not inferred and not the cheaper one: `short_context` (OpenAI), `prompt_lte_200k` (Google), `prompt_lt_200k` (xAI), or `null` where the provider publishes one price. This extends Token Price 1.2's existing `baseContextTier` from its 6 designated constituents to every plotted model.
3. **`region` = the provider's declared base region**, named per provider: `null` where one price is quoted globally, `international` for Alibaba and Moonshot. Anthropic publishes rows under both `null` and `us`, so its base region must be named explicitly — this is Token Price 1.2's `baseRegion`, and the reason that field exists.
4. **Both legs from the same selection.** Never a standard input against a batch output.
5. **Exactly one row must remain per leg.** Zero → excluded as unpriced. More than one → excluded and reported as an **ambiguity defect**, never resolved by `min`, `max` or recency.

### Measured against production

| resolution | models |
| --- | --- |
| resolved by service tier alone (1 input, 1 output) | **19** |
| resolved after naming base context tier — OpenAI ×4, xAI ×7, Google ×2 | **13** |
| resolved after naming base region — Anthropic ×3 | **3** |
| **eligible total** | **34 of 38** |
| excluded, no standard tier — `deepseek-flash`, `deepseek-v4-pro` | 2 |
| excluded, no price observations at all — `gpt-5.3-codex`, `gpt-rosalind-research` | 2 |

Every one of the 34 resolves to exactly one input and one output row. No model needs a tie-break, so no tie-break rule is written — and if a future catalogue creates one, the model is excluded and reported rather than silently resolved.

Blended price stays **Token Price methodology 1.2**: `0.5·input + 0.5·output`, USD per 1M tokens, adopted by reference.

## 7. Identity bridge

Three hops, each exact, each individually capable of excluding a model.

```
capability observation (source_model_identifier, verbatim as published)
   │  exact string equality against an evidenced link row — no normalisation, no fuzzy match
   ▼
reference.capability_model_links  →  reference.models.id        (the canonical Urdais model)
   │  the named price selection for that model
   ▼
reference.model_price_selection (service_tier, context_tier, region)
   │  exactly one input row and one output row
   ▼
pipeline.token_price_observations  →  blended = 0.5·input + 0.5·output
```

**`reference.capability_model_links`** — `(source_slug, source_model_identifier)` unique; `model_id` nullable; `link_state` ∈ `evidenced | ambiguous | unmapped | not_applicable`; a non-null `evidence` string on every row; plus who asserted it and when.

Only `evidenced` rows join. The other three states **keep the observation and refuse the join**, which is precisely the asymmetry `src/lib/utvi/identity.ts` already established for labs, and for the same reason: a wrong link silently moves a point on a public chart, which is worse than a missing point.

- `ambiguous` — the source identifier plausibly matches more than one Urdais SKU, or encodes a configuration (thinking budget, reasoning effort) that no priced SKU represents.
- `unmapped` — Urdais has not done the work. Resolvable.
- `not_applicable` — the source scored something that is not a purchasable model (a scaffold, an agent harness, a research-only system).

**No normalisation is permitted on the join key.** Not case-folding, not stripping date suffixes, not dropping `-preview` or `-high`, not alias tables that guess. Production already holds the traps: `gemini-3.1-pro-preview` and `qwen3.6-max-preview` are priced separately from any GA sibling, and `grok-4.20-0309-reasoning` and `-non-reasoning` are two priced rows whose capability scores must differ. Each link is a hand-asserted claim carrying its evidence.

**`reference.model_price_selection`** — one row per `model_id` naming the three selection fields and a rationale. A model with no row has no eligible price and does not plot.

### Reported exclusions

The frontier reports four counts beside the chart, never silently: unmapped identity · ambiguous identity · no eligible price · scored but unpriced. A frontier that quietly dropped models would misstate which model is actually on it.

## 8. Open questions — status after the blocker-resolution pass

Resolved in the [blocker-resolution memo](./phase-3a-blocker-resolution.md):

- **Epoch join coverage** — measured. GPQA Diamond reaches 24 priced SKUs, FrontierMath Tiers 1-3 v2 reaches 23, each of 34. SWE-bench Verified (4) and MATH Level 5 (1) are too thin and are dropped.
- **Anthropic base region** — `null`, on Anthropic's own published pricing table, its statement that the first-party API is global by default, the measured 1.1× `inference_geo: "us"` multiplier, Token Price's existing `baseRegion: null` designation, and the fact that Haiku has no `us` row at all.
- **V1 benchmark set** — GPQA Diamond and FrontierMath Tiers 1-3 v2. Two, not five.
- **Temporal disclosure wording** — drafted, stating both dates, that the chart does not reconcile them, and that no historical frontier is claimed.
- **Reasoning-effort configuration** — the blocker measurement uncovered. Resolved by approving configuration-level observations under a strict semantic boundary; see that memo's §8.

Still open, neither of them blocking V1:

- **LiveBench maintainer confirmation** — whether the datasheet's Apache 2.0 grant covers commercial display of published numeric scores. LiveBench is a *future additional frontier* under Option C, not a V1 dependency, so this gates an addition rather than a launch.
- **Open-weight classification** — planned, not built. Primary evidence remains the publisher's model card or weights licence; Epoch's CC BY `accessibility` field is a cross-check and worklist. Shared with Phase 4 and built once.

**No unresolved methodology blocker remains for Phase 3B.**
