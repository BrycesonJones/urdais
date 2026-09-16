# UTVI Phase 1 Source Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 15–16 September 2026. No production value, ingestion contract, schema, collector or migration is created by this document. Every figure below is evidence about sources; none is a published Urdais value.

This study supports [UTVI 0.1.0-draft](../../methodology/utvi.md) and the [data-model proposal](../../architecture/utvi-data-architecture.md). Its question was narrow and prior to any implementation: **is there a source that can carry a daily token-volume series into production, on terms Urdais may accept?**

## Headline Result

**Yes, on terms that are the cleanest Urdais has yet obtained — and the measure it can support is roughly one per cent of the thing a reader will assume it measures.**

Four findings, in the order that matters.

**One. One source is licensed for exactly this use, explicitly and commercially.** OpenRouter's Datasets API returns daily per-model token totals under an unambiguous grant in OpenRouter's own words: *"Data returned by these endpoints is licensed under CC BY 4.0: reuse and republish it, including commercially, with attribution to OpenRouter."* CC BY 4.0 permits adapted material, which is what a derived index is. No other candidate source carries a comparable grant, and most carry none at all. This is a stronger position than the Price of Compute terms grant that unblocked UCPI, because it is a named public licence rather than a bilateral permission.

**Two. The rights are settled; the access is not.** The endpoint requires an OpenRouter API key. Urdais does not have one, the repository holds no `OPENROUTER_API_KEY`, and an unauthenticated call returns `401`. **No row of this dataset has ever been retrieved by Urdais.** Everything below about field semantics comes from OpenRouter's published OpenAPI document and documentation, not from an observed response. The licence question is answered; the data-quality question is entirely unmeasured.

**Three. The observable universe is one marketplace, and it is about 1 % of world token throughput.** OpenRouter's platform traffic is on the order of 3–4 trillion tokens per day. Google alone disclosed over 3.2 quadrillion tokens per month at I/O 2026 — about 105 trillion per day — and China's National Data Administration put the national figure at 140 trillion per day in March 2026, with ByteDance's Doubao alone exceeding 180 trillion per day by June. A headline reading `17.45T tokens/day` under the words *Token Volume Index* will be read as the market's token volume. It cannot be that, by roughly two orders of magnitude, and the gap is not closable by adding sources: the large volumes are inside first-party platforms that publish no daily series at all.

**Four. Nothing else can carry a daily series.** Every other candidate is one of three things. Episodic company disclosures with excellent provenance but no cadence (Epoch AI's dataset holds **12 token observations across 4 companies**, last dated 2025-10-29 — ten months stale). Shares without levels (Vercel AI Gateway, Poe). Or inferred estimates with no licence (tokensperday.com). None is a series; several are useful as cross-checks, and one class is admissible only as context, never as a constituent.

**The implementation verdict is therefore *blocked*, but on the shortest possible blocker**: a free API key and four measurements. See [Recommended Source Path](#recommended-source-path).

## Method and Evidence Standard

Every retrieval was made on 15–16 September 2026 and is recorded with its timestamp. Endpoints marked **verified** were called directly and their responses read; the response bodies or decisive extracts are retained under [`artifacts/`](artifacts/). Search results were used only to locate documentation and are **never** cited as evidence for a figure.

Where a figure was computed here rather than published by a source it is labelled **own computation** and its inputs are given. Where a semantic is documented by the source it is quoted verbatim. Where a semantic is **not** documented, this study says so rather than inferring it — the four undocumented semantics in [Open Questions](#open-questions-for-the-source) are the main reason Phase 1 does not end in a go.

One discipline is stated up front because it constrained the work. OpenRouter's public rankings page renders the same numbers as the API. Reading that page with a script would be scraping a website; OpenRouter's Terms of Service prohibit it in terms (below). **No page was read as a data source.** The documented API is the permitted route, and its unavailability without a key is recorded as a blocker rather than worked around. This is the same rule that closed Runpod.

## Part 1 — What the Candidate Universe Actually Contains

Twelve candidates were assessed across the source classes named in the phase brief. The classification vocabulary is the UCPI registry's, because a second index family must not grow a second rights system.

| # | Source | Class | What it publishes | Cadence | Machine-readable | Terms | Classification |
|---|---|---|---|---|---|---|---|
| 1 | **OpenRouter Datasets API** | Model router | Daily per-model token totals, top 50 + `other` | **Daily, UTC** | **Yes, documented JSON API** | **CC BY 4.0, commercial, verbatim grant** | **`production_approved` (terms) / access unexercised** |
| 2 | **Epoch AI, Data on AI Companies** | Research dataset | Company token disclosures, with source + confidence | Episodic (file daily, rows sparse) | Yes, CSV | CC BY, citation required | `production_approved`, unusable as a series |
| 3 | China National Data Administration | Official statistic | National daily token consumption | Episodic, at forums | No | Unknown | `unknown` |
| 4 | Google (I/O, earnings) | Provider disclosure | Monthly tokens, all AI surfaces | Episodic | No | `unknown` | `unknown` |
| 5 | OpenAI (statements) | Provider disclosure | Tokens/minute, API | Episodic | No | `unknown` | `unknown` |
| 6 | ByteDance / Volcano Engine | Provider disclosure | Doubao daily tokens | Episodic, at launches | No | `unknown` | `unknown` |
| 7 | Z.ai (Zhipu) IPO prospectus | Regulatory filing | Average daily token volume | One-off, historical | Yes (PDF) | Filing | Context only |
| 8 | **Vercel AI Gateway index** | Inference gateway | Token-volume **shares** by lab | "recurring cadence", unspecified | No | None stated | `unknown`, no levels |
| 9 | Poe usage reports | Consumer aggregator | **Message** shares by model | ~Semi-annual | No | None stated | Not tokens |
| 10 | Hugging Face Inference Providers | Open serving platform | Router/model metadata, throughput | n/a | Yes (metadata) | — | **No usage data published** |
| 11 | Bittensor / Chutes (SN64) | Onchain inference | Subnet tokens/day, ~100–120 B | Continuous | Partial | `unknown` | `unknown`, **overlaps #1** |
| 12 | tokensperday.com | Estimate aggregator | Global tokens/day, ~360 T | Daily | Partial (site + repo) | **None stated** | `unknown`, estimates |

Six candidates were also checked and produce nothing: Together AI, Fireworks, Groq, Portkey, Helicone and LiteLLM publish no public aggregate token-volume dataset. AWS Bedrock, Azure and Google Cloud publish no customer-usage aggregates. LMArena publishes votes, not tokens. MacroMicro republishes OpenRouter's series and is therefore a secondary mirror, excluded by the discipline in the phase brief rather than by any judgement about its quality.

### 1.1 The one viable series source: OpenRouter Datasets API

**Verified.** `GET https://openrouter.ai/api/v1/datasets/rankings-daily`. Three dataset endpoints exist — `rankings-daily`, `app-rankings`, `session-cost` — enumerated from OpenRouter's published OpenAPI document, retained at [`artifacts/20260916T0012Z_openrouter_openapi_datasets.json`](artifacts/20260916T0012Z_openrouter_openapi_datasets.json). Only `rankings-daily` is a token-volume series.

OpenRouter's own description of the endpoint, quoted in full because every clause below turns on it:

> Returns the top 50 public models per day by total token usage on OpenRouter, plus a single aggregated `other` row per day that sums every model outside that top 50. Token totals are `prompt_tokens + completion_tokens`, matching the public rankings chart on openrouter.ai/rankings.
>
> Each row is a distinct `(date, model_permaslug)` pair. The `other` row uses the reserved permaslug `other` and is always returned last within its date, so callers can compute `top-50 traffic / total daily traffic` without a second request.
>
> Optional filters slice the dataset. `period` (`day`/`week`/`month`) sets the time grain. `modality` and `context_bucket` narrow the exact dataset by output/input modality (or tool-calling activity) and request context length. `category` and `language_type` instead read a sampled, upsampled dataset whose `total_tokens` are weekly-grain estimates — they cannot be combined with each other or with the exact filters, and reject `period=day` with a 400.
>
> Authenticate with any valid OpenRouter API key (same key used for inference). Rate-limited to 30 requests/minute per key and 500 requests/day per account.
>
> When republishing or quoting this dataset, OpenRouter must be cited as: "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}."
>
> Token counts come from each upstream provider's own tokenizer (Anthropic counts are as reported by Anthropic, OpenAI counts are as reported by OpenAI, etc.), so a token in one row is not directly comparable to a token in another row from a different provider.
>
> Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): reuse and republish with attribution to OpenRouter.

**The response contract**, from the OpenAPI schemas:

| Field | Type | OpenRouter's description |
|---|---|---|
| `data[].date` | string | "UTC calendar date the row is aggregated over (YYYY-MM-DD)." |
| `data[].model_permaslug` | string | "Model variant permaslug (e.g. `openai/gpt-4o-2024-05-13`, `openai/gpt-4o-2024-05-13:free`). Non-default variants include a `:variant` suffix and are ranked as their own entry. The reserved value `other` denotes the aggregated row covering every model outside the daily top 50 for that date — always sorted last within its date." |
| `data[].total_tokens` | **string** | "Sum of `prompt_tokens + completion_tokens` for the day, returned as a decimal string so 64-bit values are not truncated." |
| `meta.as_of` | string | "ISO-8601 timestamp of when the response was generated. **Reflects data-freshness because the underlying materialized view continuously ingests upstream events.**" |
| `meta.start_date` / `meta.end_date` | string | Resolved window, UTC inclusive. |
| `meta.version` | enum `v1` | "Field names and grain are stable for the life of `v1`." |

**Parameters.** `start_date`, `end_date`, `period`, `modality`, `context_bucket`, `category`, `language_type`. Three constraints matter:

- **History floor 2025-01-01.** "The dataset begins at 2025-01-01; earlier values are clamped forward to that floor and the resolved value is echoed in `meta.start_date`." An `end_date` before that floor is rejected with a `400`. This gives **~20 months of real, source-retained daily history** — enough for every period in the UI, including 1-year change, from the first production print.
- **`end_date` defaults to "the most recent completed UTC day"**, which is the correct grain for a daily job and matches the UCPI calendar pattern.
- **`category` and `language_type` read a different, estimated dataset.** They are "sampled, upsampled", weekly-grain, and reject `period=day`. **These two parameters must never appear in a UTVI production request.** Using them would silently substitute an estimate for an observation, which is precisely the mixing the phase brief prohibits.

**Response shape caveat.** "Up to 51 rows per day […] plus one aggregated `other` row summing every model outside that top 50 **(omitted when the long tail is empty)**." A collector must not assume 51 rows, and must not treat a missing `other` row as a retrieval failure.

**Rights.** Two separate questions, assessed the way [the H100 terms review](../../architecture/sources/terms-review.md) requires. Detail and the reconciliation with OpenRouter's anti-scraping clause are in [the terms note](../../architecture/sources/openrouter-datasets.md); the summary is that **both axes read permitted**: collection through the documented, authenticated, rate-limited API, and data use under CC BY 4.0 including commercially and including adapted material.

**Attribution is a data requirement, not a footnote.** The required citation interpolates a value from the payload — `"Source: OpenRouter (openrouter.ai/rankings), as of {as_of}."` — so `meta.as_of` must be persisted per retrieval and carried to every public representation of a UTVI value. This is the same obligation UCPI already carries per observation after migration `20260915170000`, and the same mechanism serves it.

### 1.2 Epoch AI: the best provenance in the field, and not a series

**Verified.** `GET https://epoch.ai/data/ai_companies_usage_reports.csv` → `200`, `text/csv`, 22,668 bytes, 126 lines, retained at [`artifacts/20260916T0012Z_epoch_ai_companies_usage_reports.csv`](artifacts/20260916T0012Z_epoch_ai_companies_usage_reports.csv). Licence: Creative Commons Attribution — "free to use, distribute, and reproduce provided the source and authors are credited" — with a required citation: *Josh You, John Croxton, Venkat Somala, Yafah Edelman, "Data on AI Companies". Published online at epoch.ai.*

The file is a model of provenance. Columns include `Daily tokens`, `Date`, `Report date`, `Source 1`, `Source 2`, `Source type`, `Product`, `Confidence` and `Notes`, and the notes quote the underlying disclosure. One row cites Z.ai's IPO prospectus at page 173 and reproduces the sentence.

**Own computation** over the retrieved file settles its usability:

| Property | Value |
|---|---|
| Rows total | 49 |
| Rows with a `Daily tokens` value | **12** |
| Companies with a token row | **4** — Google (5), Z.ai (3), OpenAI (3), DeepSeek (1) |
| Distinct dates | 11 |
| Date range of token rows | 2023-12-31 → **2025-10-29** |
| `Source type` | `Company disclosure`, all 12 |
| `Confidence` | `Confident` (8), `Likely` (4) |

Three disqualifying properties, none of them a criticism of the dataset:

1. **It is episodic, not periodic.** Twelve observations over 22 months. Eleven distinct dates. There is no daily series here and none is claimed.
2. **The token rows are ten months stale.** Latest is 2025-10-29, against today's 2026-09-15. Google's 3.2-quadrillion-per-month figure from I/O 2026 has not been added. The *file* updates daily; the *token observations* do not.
3. **`Product` scopes are mutually incomparable.** The twelve rows span `Google (all AI products)`, `Gemini API`, `Full company`, `All products`, `API`, `GPT-5-Codex`, and `Chat and API for V3 and R1`. Google's all-surfaces figure includes Search AI Overviews and YouTube; OpenAI's `API` row excludes ChatGPT. **Adding these is adding different economic objects**, and doing so would reproduce the error the [UBWI study](../ubwi-phase1-source-study.md) identified in asset-class aggregation: an addition that is not imprecise but incoherent.

**Verdict: `production_approved`, admitted as a cross-check and context source, never as a UTVI constituent.** Its right use is to answer "what order of magnitude is the whole market?" beside a UTVI value, which is exactly the disclosure the coverage problem requires.

### 1.3 The disclosure layer: authoritative, unstructured, uncollectable

Four bodies publish token-volume figures with real authority and no cadence Urdais can schedule against.

- **China's National Data Administration.** Liu Liehong put national daily token consumption at **140 trillion** at the China Development Forum on 24 March 2026, up from 100 trillion at end-2025 and about 1,000× early 2024's 100 billion. The Administration has elevated token throughput to an official gauge of the intelligence economy alongside GDP and electricity consumption, and formalised 词元 (*cíyuán*) as the Chinese term. This is the single most significant coverage fact in this study: the largest national market publishes an official aggregate, on a podium, a few times a year, and no part of it is visible to a router.
- **Google.** Over **3.2 quadrillion tokens per month** disclosed at I/O 2026 — ~105 T/day (own computation, 3.2e15 ÷ 30.4) — up from 480 trillion/month in 2025 and 9.7 trillion in 2024.
- **OpenAI.** ~6 billion tokens/minute (Oct 2025) rising to ~15 billion (Apr 2026) — ~21.6 T/day (own computation, 1.5e10 × 1440).
- **ByteDance / Volcano Engine.** Doubao exceeded **180 trillion tokens/day** by June 2026, from 120 trillion in March.

All four are `unknown` on rights and all four are episodic. They are evidence about the size of the unobserved market, which is how this study uses them, and nothing more.

### 1.4 The shares layer: real observation, wrong shape

**Vercel AI Gateway** publishes a production index over seven months of traffic from 200 K+ teams: by token volume in April 2026, 38 % Google, 26 % Anthropic, 13 % OpenAI, 10 % xAI. This is a genuine platform observation and a useful independent read on lab share. It is unusable for UTVI for three reasons: it publishes **shares, not levels**, so no tokens/day can be recovered; cadence is "a recurring cadence as the patterns shift", which is not a cadence; and no licence, terms or attribution requirement is stated, which under the phase brief's ambiguity rule means not approved.

**Poe** publishes model shares of **messages**, not tokens, semi-annually. A message is not a token and no defensible conversion exists.

### 1.5 The estimate layer, and why it stays out

**tokensperday.com**, operated by Brodhead Unlimited, publishes a daily global figure (~360.4 T/day at 16 July 2026) built in three layers: a disclosed floor from company announcements (300.1 T/day), six-channel triangulation for non-disclosers using hardware, energy, revenue, users and telemetry, and a compute sanity check. Its source discipline is visibly careful — every figure links to a primary source with an archived snapshot, and the code is open.

It is excluded from UTVI on two independent grounds, either sufficient. It states **no licence**, and ambiguous terms are not approved. And its published figure is predominantly **inferred estimate**, which sits at rank 5 of the phase brief's source hierarchy and may not be mixed into an observed series. Its floor layer is also a **re-aggregation of the same disclosures Epoch AI records primarily**, so taking it would be taking a secondary aggregator where a primary exists.

It remains valuable to this study as a **map of the disclosure landscape** — which is how it was used, and that use asserts nothing about its numbers.

### 1.6 Onchain inference, and the double-count it demonstrates

Bittensor's Chutes subnet (SN64) processes roughly **100–120 billion tokens/day**, and it has integrated a routing layer with OpenRouter. That integration is the most useful thing about it for Phase 1, because it makes the double-counting problem concrete rather than hypothetical: **if Urdais one day ingested both OpenRouter's series and a Chutes series, some traffic would be counted twice — not because two platforms serve the same model, but because one request passed through both.** That is the distinction the deduplication rule has to be built on, and §16 of the methodology draft is written from it.

## Part 2 — What a Token Is, According to the Source

The phase brief asks for a canonical treatment of eleven token categories. The honest answer is that the only viable source exposes **one number** and Urdais must define its semantics around what that number is documented to contain, not around a taxonomy the source cannot serve.

`total_tokens` is `prompt_tokens + completion_tokens`, per day, per model variant, **as reported by the serving provider's own tokenizer**.

| Category | In the source's number? | Evidence | V1 treatment |
|---|---|---|---|
| Input (prompt) tokens | **Yes** | `prompt_tokens`, documented | **Included**, not separable |
| Output (completion) tokens | **Yes** | `completion_tokens`, documented | **Included**, not separable |
| Reasoning / thinking tokens | **Yes** | The OpenRouter/a16z study: "reasoning tokens represent internal reasoning steps in models with native reasoning capabilities and are **included within completion tokens**" | **Included**, and stated |
| Multimodal image / audio tokens | **Yes, as the provider reports them** | A `modality` filter exists over `text`, `image`, `image_output`, `audio`; the unfiltered total spans all | **Included**, no image↔text equivalence asserted |
| Cached input tokens | **Undocumented** | Neither endpoint nor schema mentions cache treatment | **Open question 1.** Presumed inside `prompt_tokens`; not asserted |
| Batch inference | Not separable | No field | Included if present; cannot be isolated |
| Speculative decoding | Not exposed | No field | Whatever the provider bills as completion tokens |
| Internal hidden tokens | Not exposed | No field | Out of reach; not claimed |
| Embeddings | **Undocumented** | The dataset matches the rankings chart over chat-completion models | **Open question 2.** Presumed out of scope |
| Fine-tuning / training tokens | **No** | Inference-traffic dataset by construction | **Excluded**, per the brief |
| BYOK traffic | **Undocumented for this endpoint** | The study dataset "excludes BYOK activity to isolate standardized, platform-mediated usage"; `app-rankings` documents that "hidden and private apps are excluded"; **`rankings-daily` documents neither** | **Open question 3.** Not asserted |

**The unit is not physically uniform, and this is the single most important semantic fact.** OpenRouter states it plainly: token counts come from each upstream provider's own tokenizer, so "a token in one row is not directly comparable to a token in another row from a different provider." A sum across rows is therefore a **sum of provider-reported token counts**, not a count of a uniform physical quantity. This is a real limitation and it is also not disqualifying — it is the same class of limitation as adding barrels of crude of different grades, and the market-data answer is the same: define the unit as what it is, disclose it, and never imply more precision than the unit carries. UTVI's unit is *provider-reported tokens per day*.

### Variant granularity and what it does to identity

`model_permaslug` carries an optional `:variant` suffix and "non-default variants include a `:variant` suffix and are **ranked as their own entry**." So `openai/gpt-4o-2024-05-13` and `openai/gpt-4o-2024-05-13:free` are two rows for one model.

Two consequences, in opposite directions:

- For **UTVI the total**, this is harmless: summing all rows sums all traffic once, regardless of how it is split across variants.
- For **model-level and lab-level attribution**, variants must be folded into one canonical model, or the same model will appear twice in a share table and rank below its true position. The full permaslug is the stable source identity and is never rewritten; the fold happens in normalisation, on the way to a canonical Urdais model id.

### Top-50 truncation cuts attribution, not the total

This is the most consequential structural property of the source and it deserves stating precisely, because it lands differently on the two products the page wants.

- **The daily total is complete.** Top-50 rows plus the `other` row sum to all public platform traffic for that date. Nothing is truncated out of UTVI.
- **Attribution is truncated at 50.** The `other` row is a single opaque bucket with no model or lab attached. Market Share (§18 of the brief) can therefore be computed only over attributed tokens, with `other` as an explicit **unattributed residual** that must be published beside the shares rather than silently dropped from the denominator or silently folded into it.

Both behaviours are correct and neither is a defect; they just have to be written into the methodology rather than discovered later by a reader.

## Part 3 — Coverage, and the Number Nobody Should Misread

Coverage is where this product is either defensible or dishonest, so the arithmetic is set out in full.

**Own computation.** OpenRouter's platform traffic was reported at ~25 trillion tokens/week in May 2026, having grown 5× in six months, which is **~3.6 T/day** (2.5e13 ÷ 7). Against the disclosure floor:

| Reference | Tokens/day | UTVI's share if the level were ~3.6 T/day |
|---|---|---|
| ByteDance Doubao alone (Jun 2026) | ~180 T | ~2.0 % |
| China, official national figure (Mar 2026) | ~140 T | ~2.6 % |
| Google, all AI surfaces (May 2026) | ~105 T | ~3.4 % |
| OpenAI API (Apr 2026) | ~21.6 T | ~16.7 % |
| tokensperday.com global estimate (Jul 2026) | ~360 T | **~1.0 %** |

**UTVI observes on the order of one per cent of world token throughput.** The number in the UI today — `17.45T tokens/day` — is demo data and happens to sit ~5× above the platform's real magnitude, which is worth knowing before anyone compares the first production print to the mock and concludes something moved.

The gap is **structural, not a coverage backlog**. The three largest known volumes — Doubao, Google's surfaces, China's national total — are first-party consumption inside platforms that publish no daily series to anyone. No amount of source acquisition brings them into a daily index. A source-expansion roadmap that implies otherwise would be selling a closing gap that cannot close.

### Known sampling bias in the observed 1 %

From the OpenRouter/a16z study, in the authors' own framing. They decline to claim global representativeness — "while certain usage patterns outside the platform are not captured, OpenRouter's global scale and diversity make it a representative lens on large-scale LLM usage dynamics" — and name the biases:

- **Developer and API skew.** OpenRouter's traffic is developers and applications calling models programmatically. Consumer chat assistants, which are most of the world's token volume, are almost entirely absent.
- **Open-weight and self-hosting bias, with a known sign.** "Small models are precisely the ones most commonly self-hosted, which means a meaningful portion of their real usage is invisible to any centralized API provider." Small and open-weight models are **under**-represented.
- **Composition effects from routing.** Traffic is "shaped by model availability, pricing, and user preferences" on the platform. A model's OpenRouter share can move because routing defaults or prices changed, with no change in the market.
- **Geography by billing location.** "Over 50 % of usage originating outside the United States", but geography rests on billing location, and "some users employ third-party billing or shared organizational accounts".
- **Category tags are mid-2025 onward.** Consistent tagging began May 2025 — another reason the `category` filter has no place in a production path.

**None of this is disqualifying for a measure that says what it measures.** All of it is disqualifying for a measure called *the* token volume index.

### Missing data versus zero, and the pre-coverage rule

The semantics already settled for UCPI in commit `99a5ad8` transfer intact and were designed for exactly this failure mode: *a day nobody looked at is not a day the market was found wanting.* Four states must stay distinct, and the fourth is the trap:

1. **Covered, volume observed.** A retrieval succeeded and returned rows. A UTVI point exists.
2. **Covered, zero observed.** A retrieval succeeded and the model genuinely had no traffic. Zero is a true statement — and note the source expresses this by **omitting the row**, not by returning `0`, so absence-of-row inside a successful retrieval means zero *for that model* while the date itself is covered.
3. **Retrieval failed.** No coverage for that date yet. No point, no zero; retry.
4. **Pre-coverage.** A date before Urdais began collecting. **No point at all** — not zero, not "unavailable". Summing an empty row set yields `0`, and persisting that would publish the claim "the world consumed no tokens that day."

The precondition pattern is already built: `hasProductionCoverage(calculationDate)` in [`database-persistence.ts:231`](../../../src/lib/ucpi/runtime/database-persistence.ts#L231), consulted by [`daily-run.ts:282`](../../../src/lib/ucpi/runtime/daily-run.ts#L282), which reports `no_coverage` and writes nothing. UTVI needs the same guard asked of **retrievals rather than observations** — a retrieval that returned nothing is still coverage — and it needs it before any aggregation, because `Σ ∅ = 0` is a silent, plausible, wrong answer rather than an error.

Backfill changes the shape of this but not the rule: with history from 2025-01-01 retrievable in one pass, the pre-coverage region is *before 2025-01-01*, and the floor is a property of the source rather than of when Urdais started.

### Revisions: the source's own freshness warning

`meta.as_of` "reflects data-freshness because the underlying **materialized view continuously ingests upstream events**." Read plainly: **a date's total can change after Urdais first reads it.** A value read at 01:00 UTC for yesterday may not be the value the same query returns a week later.

Urdais has no measurement of how large or how long-lived that drift is, and cannot get one without a key. It is **Open question 4**, and it is the one that most directly determines whether a first print is publishable. It also interacts with backfill in a way that must be decided rather than stumbled into: a 20-month backfill retrieved today returns *settled* values, while a daily job going forward records *first prints*. Publishing both without a rule would splice two different statistics into one series at the join. The methodology draft resolves this with a single settlement rule applied identically to both.

## Part 4 — Ranked Shortlist

Suitability is scored against the one question that matters: can this source put a defensible number on a chart every day?

| Rank | Source | Suitability | Permission | Production-ready | Completeness | Bias | Alone, or component? |
|---|---|---|---|---|---|---|---|
| **1** | **OpenRouter Datasets API** | **High** — the only daily series | **CC BY 4.0, commercial, explicit** | **Terms yes; access unexercised** | Total complete; attribution top-50 | Developer/API skew; open-weight under-counted; ~1 % of world | **Can stand alone as the whole observed universe** |
| 2 | Epoch AI, AI Companies | Low as a series | CC BY, citation | Yes | 12 rows, 4 companies, 10 months stale | Disclosure selection; incomparable product scopes | **Cross-check / context only** |
| 3 | China NDA official figure | Context | `unknown` | No | National aggregate only | Official, unauditable | Context only |
| 4 | Google / OpenAI / ByteDance disclosures | Context | `unknown` | No | Episodic | Self-reported, favourable timing | Context only |
| 5 | Vercel AI Gateway index | Low | **None stated** | No | Shares only | Vercel-customer skew | Share cross-check, if terms clear |
| 6 | Bittensor / Chutes | Low | `unknown` | No | Subnet only | **Overlaps rank 1** | Component at best, dedup first |
| 7 | Poe reports | Not applicable | None stated | No | Messages, not tokens | Consumer skew | Neither |
| 8 | tokensperday.com | **Excluded** | **None stated** | No | Global, mostly **estimated** | Estimation-method dependent | **Neither** — estimates + secondary |

## Recommended Source Path

**Primary: OpenRouter Datasets API, `rankings-daily`, `period=day`, unfiltered.** The only source that can carry a daily series, on the clearest terms in the field. It defines the observed universe in V1, and the universe is honestly describable in one sentence: *public, non-hidden model traffic on the OpenRouter marketplace.*

**Secondary: none, and deliberately none.** No second source improves the series. Epoch AI enters as a **context disclosure** published beside the value — the order of magnitude of the whole market — not as a constituent. Adding a second *platform* is a methodology-version break (§11), so it is a decision to be taken once, on evidence, rather than an incremental improvement.

**Fallback policy.** A failed retrieval is **not** a zero and **not** a carried-forward point. On failure: retry within the day; if the date closes with no successful retrieval, the date has no coverage and no point. On a later successful retrieval of a past date within the source's window, the point is created then — the source's 20-month window makes a gap recoverable rather than permanent, which is a materially better failure mode than UCPI's zero-carry world.

**What remains blocked.**

1. **No OpenRouter API key.** The hard blocker, and a cheap one: any valid key works, the same key used for inference. Until one exists no row can be retrieved and no field semantic verified.
2. **Four undocumented semantics** ([Open Questions](#open-questions-for-the-source)) which need either a measurement or an answer from OpenRouter.
3. **Revision magnitude unmeasured**, and it sets the settlement lag, which the publication rule depends on.

### Open Questions for the Source

Measurable with a key; otherwise worth one email to OpenRouter, whose `/data` page invites data collaborations.

1. **Cached input tokens** — are cache-read prompt tokens inside `prompt_tokens`?
2. **Embeddings** — in scope, or chat-completions only?
3. **BYOK and private requests** — the study dataset excludes BYOK and `app-rankings` excludes hidden/private apps; does `rankings-daily` do either? A change in BYOK share would otherwise move the series for a non-market reason.
4. **Revision behaviour** — how long does a date's `total_tokens` keep moving, and by how much? Measurable directly: read the same date daily for two weeks and record the deltas.

Two further questions are Urdais's own and need no answer from anyone: whether `Σ(top 50) + other` reconciles with the platform total the rankings page shows, and whether row counts behave as documented at the 2025-01-01 floor.

## Recommendation on the Index Question

The brief's §3 asks whether UTVI is truly an index. The recommendation is **Option A for the statistic, with the naming discipline of Option C**, and the reasoning is set out in [the methodology draft](../../methodology/utvi.md#why-a-level-and-not-a-base-100-index). In short: the observed level *is* the product, base-100 normalisation would hide the one directly observed quantity behind a synthetic unit without fixing the coverage problem it appears to address, and Urdais already publishes UCPI as a level in natural units under the name *Index*. What must change is not *Index* but *Token Volume* unqualified — the word **Observed** belongs in the name, because the name is what gets quoted.

## Implementation Readiness

> **Blocked pending source access.**

Terms are settled and are the best Urdais has obtained. The blocker is narrow, named, and cheap: **an OpenRouter API key, then four measurements.** No schema, collector or migration should be written before the first successful authenticated retrieval, because four field semantics and the revision behaviour are still unknown, and each of them changes the data model that would be written to hold them.

## Sources

Retrieved 15–16 September 2026.

- [OpenRouter, Daily token totals for top 50 models](https://openrouter.ai/docs/api/api-reference/datasets/daily-token-totals-for-top-50-models) · [OpenAPI document](https://openrouter.ai/openapi.json) · [Datasets SDK reference](https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README.md) · [Data](https://openrouter.ai/data) · [Terms of Service](https://openrouter.ai/terms) · [robots.txt](https://openrouter.ai/robots.txt)
- [State of AI: An Empirical 100 Trillion Token Study with OpenRouter](https://arxiv.org/html/2601.10088v1)
- [Epoch AI, Data on AI Companies](https://epoch.ai/data/ai-companies) · [documentation](https://epoch.ai/data/ai-companies-documentation) · [usage reports CSV](https://epoch.ai/data/ai_companies_usage_reports.csv)
- [CGTN, China's daily token consumption hits 140 trillion](https://news.cgtn.com/news/2026-04-02/China-s-daily-token-consumption-hits-140-trillion-1M1hOcsCyvC/p.html) · [China Daily](https://global.chinadaily.com.cn/a/202603/24/WS69c21887a310d6866eb3f91f.html)
- [Google I/O 2026 keynote](https://blog.google/innovation-and-ai/sundar-pichai-io-2026/)
- [TechNode, Doubao surpasses 120 trillion daily tokens](https://technode.com/2026/04/07/doubao-surpasses-120-trillion-daily-tokens-as-usage-doubles-in-three-months/)
- [Vercel, AI Gateway production index](https://vercel.com/blog/ai-gateway-production-index)
- [Poe, AI model usage trends report](https://poe.com/blog/report-summer-2025-ai-model-usage-trends)
- [Hugging Face, Inference Providers](https://huggingface.co/docs/inference-providers/index)
- [tokensperday.com](https://tokensperday.com/)
