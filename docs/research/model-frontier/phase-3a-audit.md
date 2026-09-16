# Model Frontier — Phase 3A: capability-source research and architecture audit

**Status: research. No implementation, no production data, no methodology approved.** Prepared 16 September 2026 against the live codebase and the UrdaisProd database. Every count in §2 is a query result, not an estimate.

The conclusion in one line: **the price axis is nearly ready and the capability axis has no legal source yet in the form the product needs** — and the most obvious candidate is the one Urdais may not use.

## 1. The existing Frontier

`src/components/model-economics/model-frontier-chart.tsx`, a client component drawing its own SVG scatter — no chart library, and `useContainerSize` for responsiveness.

| | current |
| --- | --- |
| x axis | `blendedPrice`, **log₁₀**, ticks 0.25–20, unit `$/1M tokens` (`TOKEN_UNIT`) |
| y axis | `capabilityScore`, linear 0–100, 5-point ticks |
| point size | `tokenVolume`, area-proportional, trailing 30 days |
| open-weight | filled disc `#8ca4ff` |
| proprietary | outlined ring — the classes differ by shape, not only colour |
| frontier | dashed path through non-dominated points, sorted by price |
| labels | `modelName` beside frontier points, suppressed below 560 px |

Data comes entirely from `FRONTIER_POINTS` in `src/data/mock/model-economics.ts`. Both axes are demo: `blendedPrice` and `capabilityScore` are hand-written constants on 18 hardcoded `MODEL_SPECS`, and the footnote already says so — *"the capability score is a 0–100 demo measure, not a benchmark."*

The Pareto logic already exists and is **correct in form**:

```ts
!MODEL_ROSTER.some((other) =>
  other.id !== model.id &&
  other.blendedPrice <= model.blendedPrice &&
  other.capabilityScore >= model.capabilityScore &&
  (other.blendedPrice < model.blendedPrice || other.capabilityScore > model.capabilityScore))
```

**Shared fixtures — do not remove.** `OPEN_WEIGHT_ANALYSIS` is computed *from* `FRONTIER_POINTS` (via `ofClass`), so Phase 4 breaks if the Frontier phase deletes it. Also shared: `MODEL_ROSTER`, `MODEL_SPECS`, `MODEL_WINDOW_VOLUME`, `SHARE_WINDOW_DAYS`, `PRICE_GAP_CAPABILITY_THRESHOLD`. The Market Share phase already established the pattern: detach one section's tables, leave the shared graph standing.

**There is no capability or benchmark abstraction anywhere in production.** Not a table, not a type, not a loader. This phase starts from zero on that axis.

## 2. Price substrate

Measured against UrdaisProd.

- **`reference.models`: 38 models, 7 providers** — alibaba 7, anthropic 4, deepseek 2, google 7, moonshot 4, openai 7, xai 7. Keyed `(provider_id, provider_model_id)`. `reference.model_aliases`: 6 rows.
- **`pipeline.token_price_observations`: 251 rows.** Dimensions: input 79, output 79, cached_input 47, cache_write 39, cache_read 7.
- **36 of 38 models carry both an input and an output leg** (OpenAI 5 of 7).
- `canonical_price_usd_per_1m` with `fx_source` / `fx_rate` / `fx_as_of` — **currency normalisation is already solved**.

Two findings that shape everything downstream:

**There is no price history.** Every one of the 251 observations was retrieved on **2026-09-14**; `count(distinct retrieved_at::date) = 1`. And there is **no Token Price cron** — `vercel.json` registers `news`, `ucpi`, `utvi`, `ubwi` and nothing for tokens. The snapshot cannot advance on its own. A historical Model Frontier is therefore impossible today, and will stay impossible until Token Price has scheduled ingestion.

**A model does not have "a price".** Observations carry `region`, `service_tier`, `context_tier` and `cache_ttl`, and a single model can have up to **six** input rows across 2 context tiers and 3 service tiers:

| model | input rows | context tiers | service tiers | input range |
| --- | --- | --- | --- | --- |
| `gpt-6-astra` | 6 | 2 | 3 | $5 – $40 |
| `gpt-5.6-sol` | 6 | 2 | 3 | $2 – $16 |
| `gpt-5.6-luna` | 6 | 2 | 3 | $0.10 – $0.80 |
| `claude-opus-5` | 6 | — | 3 | $2.50 – $11 |

An 8× spread inside one model. Selecting the wrong row moves a point an order of magnitude along a log axis.

**Recommendation: consume Token Price through a thin normalised read layer, not a second pipeline.** The layer's only job is per-model leg selection, and it must reuse the discipline Token Price already has (`baseContextTier`, `baseRegion`, standard service tier) — which today is defined **only for the six designated benchmark constituents** in `pipeline.token_price_benchmarks`. Extending a named, reviewable selection rule from 6 designated models to all 38 plotted ones is real methodology work and is the price axis's actual open question.

## 3. The price axis

**There is already an approved Urdais convention, and it is exactly the candidate default.** Token Price methodology **1.2** fixes a standardized workload of 500,000 input + 500,000 output tokens with weights **0.5 / 0.5**:

```ts
TOKEN_PRICE_WORKLOAD = { inputTokens: 500_000, outputTokens: 500_000, inputWeight: 0.5, outputWeight: 0.5 }
```

So `blended = 0.5·input + 0.5·output`, in **USD per 1M tokens**, is not an arbitrary weighting to be chosen here — it is the house standard, effective-dated, with versions that never rewrite earlier values. Model Frontier should adopt it by reference rather than restate it.

**Tradeoffs worth stating in the methodology.** A 1:1 blend is a declared synthetic workload, not an observed mix: real traffic is usually input-heavy, so 1:1 overweights output and systematically flatters models with cheap input and dear output. It also ignores cached-input pricing, which is material for some providers and which Urdais already collects. The defence is that 1:1 is *declared, stable and identical across models*, which is what a comparison axis needs — a traffic-weighted blend would move for reasons that have nothing to do with the models. Do not silently change it for the Frontier; a different weighting is a Token Price methodology version.

## 4. Capability-source matrix

### Artificial Analysis — **excluded from production**

The obvious candidate, and unusable for this product. From the Data Platform Terms v1.1 (19 August 2026):

- **§2.4(c)** — customer shall not *"Embed or otherwise make raw Data available through any customer-facing product, API, dashboard, or service."*
- **§2.4(d)** — nor *"Combine Data with data from third-party sources to create a product, dataset, or service that is made available to any third party."* Model Frontier is precisely capability combined with Urdais price.
- **§2.5** — *"Customer shall not use the Data to develop, operate, or improve any product or service made available to third parties whose primary purpose is benchmarking, ranking, comparison, competitive intelligence, or model/provider selection guidance"*, and **§2.5(c)** *"Create any database, index, or data product that incorporates Data and is substantially similar to any product or service offered by Company."*
- All tiers may make only *"brief citations of individual Data points"* that *"do not reproduce Data in a structured, tabular, or machine-readable format."* A 38-point scatter is structured reproduction.

Three independent blockers, and the third is categorical: Urdais Model Economics is substantially the product AA sells. **No tier fixes this**; Commercial adds "approved raw measurement exports" under an Order Form, which is a negotiation, not a licence we hold. Excluded, per the rule that a source refusing commercial reuse is excluded rather than worked around.

### Epoch AI — **recommended**

| | |
| --- | --- |
| licence | **CC BY 4.0** — *"free to use, distribute, and reproduce provided the source and authors are credited"* |
| metric | per-model scores on named benchmarks, not a composite |
| internally administered | GPQA Diamond, MATH Level 5, Mock AIME 2024–25, FrontierMath, SWE-bench Verified |
| externally sourced | additional leaderboards, **retaining original licences** (Aider Polyglot, Terminal-Bench: Apache 2.0) |
| coverage | leading lab releases **and** downloadable-weight models, incl. non-US |
| access | CSV bundle + `pip install epochai` (Airtable API, preserves relationships) |
| history | results carry dates and source citations |
| attribution | a specified citation string, hyperlinked |

CC BY 4.0 is **the same licence family as OpenRouter's**, which UTVI already publishes under — so Urdais has an established pattern for the attribution, the frozen citation and the read-surface contract that refuses to serve a value whose citation cannot be rendered.

One real constraint: the hub mixes internally-run and externally-sourced rows with **different licences**. Production must either restrict to Epoch's internally administered benchmarks or carry a per-row licence and honour it. Recommend the former for v1 — five benchmarks is plenty for a frontier, and one licence is one thing to get right.

### Benchmark datasets themselves (GPQA MIT, MMLU-Pro MIT/Apache-2.0, SWE-bench MIT)

**A licence on the dataset licenses the questions, not somebody else's scores.** These permit Urdais to *run* the evaluations and own the results outright — maximum defensibility, full historical control, and real recurring compute cost plus harness-parity risk. Worth keeping as the long-run option; not a v1.

### Unresolved — routed to research

- **LMArena / Chatbot Arena.** The leaderboard space is Apache 2.0 while the service terms restrict commercial exploitation; the two are in tension and the current terms page is a client-rendered app that could not be read. Also methodologically distinct — an Elo of human preference is not capability, and it is the most gameable of the candidates.
- **HELM (Stanford CRFM).** Code is Apache 2.0; the licence on published per-model results needs confirming.
- **Open LLM Leaderboard.** Open-weight models only and retired during 2025 — insufficient for a frontier that must include proprietary models. Not recommended regardless of licence.
- **Provider-published benchmark tables.** Self-reported, methodologically incomparable across labs, each under its own terms. Suitable as corroboration, never as an axis.

## 5. Methodology options

**Option A — one external composite.** Simple, broad, one number. Dead as things stand: the only mature composite is AA's Intelligence Index, which §4 excludes. Revivable only if a CC-BY source publishes a composite. It also makes the methodology hostage to one vendor's undisclosed weighting — Urdais would be republishing a number it cannot reconstruct or defend.

**Option B — an Urdais composite** over benchmark families (reasoning, coding, knowledge, long-context) built from Epoch rows. Gives one axis and one frontier. The cost is governance: weights across families, normalisation across differently-scaled benchmarks, a rule for models missing a family, and a versioned effective-dated document — every one of which is a judgement someone must approve and defend. **Do not pick weights casually**; under house convention this is a full methodology with approval, exactly as UTVI and UCPI are.

**Option C — benchmark-specific frontier views.** No synthetic score. The section offers a selector — *GPQA Diamond · SWE-bench Verified · FrontierMath* — and draws the Pareto frontier for the chosen benchmark against the same price axis.

### Recommendation: **C for v1, B only if a single axis is later wanted**

Every plotted point is a real published number with its own citation and its own methodology; nothing is invented, no weight has to be defended, and the frontier for each benchmark is exactly as legitimate as the benchmark. It is also the honest shape of the underlying fact — capability is not one-dimensional, and a model that leads on SWE-bench Verified and trails on GPQA is telling the reader something a composite would average away. It needs no new governance beyond naming the eligible benchmarks, and the Labs/Models selector shipped in Market Share is the precedent for the interaction.

B remains open afterwards, and is much safer to build *after* per-benchmark observations are already persisted and reconciled.

## 6. Model identity

**Urdais now has three disjoint model identity spaces, and no bridge between any of them:**

1. Token Price — `(provider_slug, provider_model_id)`, **38 models**, e.g. `anthropic / claude-opus-5`
2. UTVI — OpenRouter `model_permaslug`, **408 distinct**, e.g. `openai/gpt-5.6-luna-20260709`
3. Capability source — the benchmark publisher's own model naming

Model Frontier needs 1 × 3 joined; `model_id` on UTVI observations is NULL everywhere, so 2 is bridged to neither. This is the single largest implementation risk in the phase.

Dangerous mismatches that must never be auto-resolved: dated versus undated aliases (`gpt-5.6-luna` vs `…-20260709`); preview versus stable (`gemini-3.1-pro-preview`, `qwen3.6-max-preview` — both in production today); **reasoning variants** (`grok-4.20-0309-reasoning` and `-non-reasoning` are separate priced rows and would have different scores); instruct versus base; hosted derivative versus original; quantised variants.

The rule is the one `src/lib/utvi/identity.ts` already establishes: an explicit evidence-backed mapping table, and **anything absent stays unmatched rather than guessed** — a wrong match here silently moves a point on a public chart, which is worse than a missing point.

## 7. Pareto rule

For an eligible set *M* where every model has a price *p* and a capability *c* on the selected benchmark, model *m* is on the frontier when:

> **no** *n* ∈ *M*, *n* ≠ *m*, satisfies `c(n) ≥ c(m)` **and** `p(n) ≤ p(m)` with at least one strict.

Determinism requires each of these decided explicitly:

- **eligibility** — a model enters only with *both* a price and a capability for the selected benchmark and date; a model missing either is **excluded from the computation, not defaulted**, and the count of exclusions is reported.
- **exact ties** — two models with identical `(c, p)` dominate each other under the non-strict clause and would both be dropped. Neither dominates: both are on the frontier, and the rule above gives that correctly because the strictness clause fails.
- **equal capability, different price** — cheaper is on the frontier, dearer is not.
- **equal price, different capability** — more capable is on the frontier.
- **ordering** — ties broken on canonical model id so the drawn path and the reported list are stable across runs.
- **provisional data** — a provisional capability or price either excludes the model or marks the point; it must not silently decide a frontier.
- **revisions** — the frontier is derived at read time from active rows, as Market Share is, so a revised score re-derives rather than persisting a stale frontier.

## 8. Temporal policy

Capability moves on model releases (weeks–months); price moves on provider pricing changes (irregular). Today the asymmetry is extreme in the other direction: **price has exactly one observation date, 2026-09-14, and no cron to advance it.**

Recommended: an **explicit as-of pair, disclosed rather than blended.** The frontier is stamped with the price observation date, each point carries its capability result's own date, and the surface states both — *"prices as of 2026-09-14; capability results dated individually, oldest 2026-xx-xx."* A single "as of" over values from materially different dates would be a claim nobody measured.

Do not build a historical frontier series until Token Price has scheduled ingestion and real price history. Until then Model Frontier is a **current-state view**, and the methodology should say so in the same breath as the value.

## 9. Open-weight classification

**It does not exist in production.** `accessClass` appears only in the demo fixture; `reference.models` has no such column and no migration mentions one. Grep confirms zero production references.

It must not be inferred from the name — `gpt-oss` is open-weight and `gpt-5.6-luna` is not, on the same prefix; DeepSeek and Qwen ship both open and API-only models. The authoritative source is the **model's published licence or the lab's own release statement**, recorded per model with evidence, in the same shape as `reference.permission_grants`. Build it here as reusable reference data: **Phase 4 (Open-weight vs Proprietary) depends on exactly this and should not re-derive it.**

## 10. Architecture recommendation

Reuse the UTVI lineage pattern, which is already proven twice:

```
reference.source_interfaces        + permission_grants   (the capability source and its CC BY grant)
pipeline.capability_retrievals     → raw response, hash, as_of
pipeline.capability_observations   → (model_id, benchmark, score, result_date, source_attribution,
                                      licence, identity_state)   ← unmatched stays unmatched
reference.model_access_class       → open-weight / proprietary, with evidence
read model                         → frontier derived at read time, per benchmark
```

**Persist observations; derive the frontier at read time.** The frontier is a cheap computation over a few dozen rows — the same reasoning that settled Market Share on Option A — and deriving it means a revised score cannot leave a stale frontier behind. A composite score (Option B) would be the only thing worth persisting, and only if B is ever approved.

**Migrations required:** yes — source interface, permission grant, retrievals, observations, and the access-class reference table. None of it exists today.

## 11. Research gaps — brief for Grok Deep Research

Narrow, answerable questions only. Not "what are the best AI benchmarks."

1. **Epoch AI licensing precision.** Confirm the CC BY 4.0 grant covers *per-model benchmark scores* republished in a commercial product's chart. Enumerate exactly which benchmarks in the hub are Epoch-administered (CC BY) versus externally sourced, and name each external source's licence. Is there any clause restricting use by a commercial data product?
2. **Epoch AI coverage and cadence.** For each Epoch-administered benchmark: how many models, which labs, how soon after a model release is it scored, is every historical result retained with its date, and are results ever revised or withdrawn?
3. **Epoch model identity.** What identifier does Epoch use per model? Does it distinguish dated snapshots, preview versus stable, and reasoning versus non-reasoning variants? Can those be mapped deterministically to provider API model ids?
4. **LMArena.** Resolve the tension between the Apache 2.0 leaderboard artifacts and the service terms restricting commercial exploitation. Is there a licence under which per-model Elo may be republished commercially?
5. **HELM.** What licence governs the *published per-model results* (as distinct from the Apache 2.0 code), and is commercial republication permitted?
6. **Open-weight classification source.** Is there a maintained, licence-clear dataset mapping model → weights-available and → licence family, or must Urdais build it from primary model cards?

## 12. Decision required before implementation

1. Approve **Epoch AI** as the capability source, subject to the §11 licensing confirmations.
2. Approve **Option C** (benchmark-specific frontiers) or direct otherwise.
3. Approve the per-model **price leg selection rule** extending Token Price's designation discipline from 6 models to all plotted ones.
4. Accept that Model Frontier is a **current-state view** until Token Price has scheduled ingestion.

Nothing is built until these are settled.
