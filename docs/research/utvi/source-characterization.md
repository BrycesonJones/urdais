# UTVI Phase 1A: Authenticated Source Characterization

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026. Read-only. No production data was written, no migration created, no schema created, no database touched, no UI changed, no methodology approved. Every number below was computed in memory from live responses retained under [`artifacts/`](artifacts/).

This is the measurement pass that [Phase 1](source-study.md) said had to happen before any storage design. It ran 19 probe requests plus 7 follow-ups against `GET https://openrouter.ai/api/v1/datasets/rankings-daily` with a real key, between `2026-09-16T00:59:43Z` and `2026-09-16T01:07:05Z`.

Every claim is tagged: **[LIVE]** measured from a response, **[DOCS]** stated by OpenRouter, **[INFERRED]** reasoned from either, **[UNKNOWN]** not established.

## Headline: eight things changed

Phase 1 was right about the licence and wrong or incomplete about six factual matters. That is the value of the pass.

1. **The level is 17.75 T tokens/day, not 3–4 T.** [LIVE] Phase 1 took ~3.6 T/day from secondary reporting of a May 2026 figure. The measured total for 2026-09-15 is **17,750,400,225,262**. Coverage is therefore nearer **5 %** of world throughput than 1 %. The demo UI's `17.45T` is, by coincidence, almost exactly the real magnitude.
2. **There are no `prompt_tokens` or `completion_tokens` fields.** [LIVE] The row is three fields: `date`, `model_permaslug`, `total_tokens`. The documented formula cannot be verified from the data and the legs can never be published.
3. **A 366-day maximum window exists and is undocumented.** [LIVE] A 20-month backfill needs **two requests**, not one.
4. **The current UTC day is unavailable, and `end_date` is silently clamped.** [LIVE] `meta.end_date` is the authoritative resolved value.
5. **Revision is real, monotone, tiny — and confined to the just-closed day.** [LIVE] D−1 accrued **+55 ppb in 6.2 minutes**; D−2 and D−3 moved **exactly zero** over the same interval.
6. **Variant collisions are real, not theoretical.** [LIVE] 29 same-date cases over 90 days where a base model appears both bare and `:free`.
7. **Embeddings are in the dataset.** [LIVE] Four embedding models, 0.19 % of 90-day attributed tokens. Phase 1 presumed them out of scope.
8. **`openrouter` and `stealth` are model namespaces.** [LIVE] The serving platform appears as a model author, and one anonymous namespace carries 2.96 % of 90-day attributed volume.

## 1. Authentication

| Item | Result |
|---|---|
| Environment variable | **`OPENROUTER_API_KEY`**, present in `.env.local`, absent from `.env.example` |
| Authenticated request | **Success** [LIVE] |
| HTTP status | `200` |
| Rate-limit headers | **None exposed.** No `x-ratelimit-*`, no `ratelimit-*`, no `retry-after` [LIVE] |
| Response headers of note | `content-type: application/json`; `cache-control: private, max-age=60, stale-while-revalidate=300` |
| Documented limits | 30 requests/minute per key, 500/day per account [DOCS] |

The key is never printed by the characterization script, and no request header is logged.

**The `max-age=60` cache is an operational trap.** Two reads inside 60 seconds return the identical body with an identical `meta.as_of`. The script's own in-run revision check fell into exactly this and measured a false zero before the longer-interval probes corrected it. **Any revision measurement must space reads more than 60 seconds apart.**

## 2. Live response contract

**Top-level:** exactly `data` and `meta`. [LIVE]

**`meta`** — exactly four keys, no more: [LIVE]

| Field | Example | Note |
|---|---|---|
| `as_of` | `2026-09-16T01:00:33.578Z` | Generation time. Moves every request; interpolates into the required citation |
| `start_date` | `2026-09-15` | **Resolved**, after clamping |
| `end_date` | `2026-09-15` | **Resolved**, after clamping. Authoritative |
| `version` | `v1` | Stable for the life of `v1` [DOCS] |

There is **no pagination of any kind**: no cursor, page, `next`, `has_more`, `limit` or `offset` key in `meta` at any window size tested up to 90 days / 4,590 rows / 470 KB. [LIVE]

**`data[]`** — exactly three fields on every row, at every date tested from 2025-01-01 to 2026-09-15: [LIVE]

| Field | Type | Values observed |
|---|---|---|
| `date` | string | `YYYY-MM-DD`, UTC |
| `model_permaslug` | string | `namespace/slug[:variant]`, or the reserved `other` |
| `total_tokens` | **string** | Decimal integer string |

**Fields that do not exist**, each checked explicitly against live rows: `prompt_tokens`, `completion_tokens`, `rank`, `model_name`, `name`. [LIVE]

## 3. Token accounting

### The formula cannot be verified, and the legs cannot be published

`total_tokens = prompt_tokens + completion_tokens` is **[DOCS] only**. Neither addend is returned, so §4 of the phase brief cannot be discharged against data. **This is permanent, not a gap to close**: UTVI can never publish an input/output split from this source, and a future methodology version that wanted one would need a different source.

### Integrity: clean

Over 4,590 rows across 90 dates plus every historical probe: [LIVE]

| Check | Result |
|---|---|
| Non-integer `total_tokens` | **0** |
| Negative | **0** |
| Zero | **0** |
| Null | **0** |
| Largest single row | `5,929,599,506,221` |
| Largest day total | `19,184,120,113,922` |
| Above `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991) | **0** |

Values are three orders of magnitude inside IEEE-754 safe range, so a JavaScript number would not lose precision today. **The write path should still parse to `BigInt` and store `numeric`**, because the margin is a fact about 2026 volumes and not a property of the contract — and because the estimated datasets below return genuine fractions.

### Cached input tokens: included

**[DOCS], confirmed.** OpenRouter's usage-accounting documentation reports `prompt_tokens_details.cached_tokens` — *"the number of tokens that were read from the cache"* — as a **breakdown beneath** `prompt_tokens`, alongside `cache_write_tokens`. A detail nested under a parent count is a subset of it.

**So cache-read tokens are inside `prompt_tokens` and therefore inside `total_tokens`.** [INFERRED, strongly] The one step not closed: that documentation describes the **per-request** response, and no document states the rankings dataset derives `prompt_tokens` identically. The inference is sound and should be stated as an inference in the methodology rather than as a measured fact.

Phase 1 recorded this as unknown. It is now answered.

### Reasoning tokens: included

**[DOCS], confirmed twice.** `completion_tokens_details.reasoning_tokens` is a breakdown beneath `completion_tokens` in the usage-accounting documentation, and the OpenRouter/a16z study states reasoning tokens *"are included within completion tokens"*. Two independent statements agreeing.

**UTVI includes reasoning tokens and cannot separate them.** A lab shipping a more verbose reasoning mode raises UTVI with no change in user demand. This is a real interpretive hazard and belongs in the methodology, not a footnote.

### The unit is non-uniform, in OpenRouter's own words

> "Token counts come from each upstream provider's own tokenizer (Anthropic counts are as reported by Anthropic, OpenAI counts are as reported by OpenAI, etc.), so a token in one row is not directly comparable to a token in another row from a different provider." [DOCS]

Corroborated: *"Prompt and completion token counts using the model's native tokenizer."* Phase 1's framing stands — the unit is **provider-reported tokens per day**.

## 4. Top-50 plus `other`

**For 2026-09-15:** [LIVE]

| Quantity | Value |
|---|---|
| Rows returned | 51 |
| Named model rows | 50 |
| `other` rows | 1 |
| Named (attributed) tokens | `16,563,580,227,405` |
| `other` (residual) tokens | `1,186,819,992,880` |
| **Day total** | **`17,750,400,220,285`** |
| Residual share | **6.69 %** |
| Ordering descending by tokens | Yes |
| `other` last within its date | Yes |

**Over 90 days:** exactly 51 rows on all 90 dates; no date missing the residual; residual share **min 4.59 %, max 7.98 %, mean 6.13 %**. [LIVE]

### There is no API-returned daily total

**Stated plainly because the phase brief asks.** The endpoint returns no total field at any grain. So:

> **`Σ(50 named rows) + other` = the complete observed OpenRouter public-model traffic for that day** rests on [DOCS] — *"a single aggregated `other` row per day that sums every model outside that top 50"* — and cannot be independently verified against a figure the API supplies.

What **can** be verified, and was: the same date returns **byte-identical totals and model sets across four different window shapes** (single-day, 3-day, 30-day default, 90-day). [LIVE] That is internal consistency, not proof of totality.

**The residual row can be absent.** `modality=audio` returned **45 rows with no `other` row** — the documented "omitted when the long tail is empty" behaviour, observed. [LIVE] A collector must tolerate its absence and must not treat 51 as invariant.

## 5. Model identity

### Shape

`namespace/slug[:variant]`. Over 90 days: [LIVE]

- **No permaslug lacks a namespace.** 0 of 4,590.
- **No latest-pointer-shaped slug.** 0 matches for `(^|[._:/-])latest$`. Urdais's `looksLikeLatestPointer` guard finds nothing to reject — good, and it stays as a guard.
- **One variant suffix only: `:free`.** 538 rows over 90 days.
- Slugs carry dated versions: `deepseek/deepseek-v4.1-flash-20260910`, `z-ai/glm-5.3-20260816`, and undated legacy forms: `meta-llama/llama-3.1-8b-instruct`, `qwen/qwen3-235b-a22b-07-25`.

### Variant folding is mandatory, with evidence

**29 same-date collisions over 90 days** where one base appears as two rows: [LIVE]

```
2026-06-18  openai/gpt-oss-120b  ['openai/gpt-oss-120b', 'openai/gpt-oss-120b:free']
2026-06-19  openai/gpt-oss-120b  ['openai/gpt-oss-120b', 'openai/gpt-oss-120b:free']
…
```

Phase 1 called this a rule that "can happen". It does happen, on 29 of 90 days for one model. **Unfolded, `gpt-oss-120b` is split across two rows and ranks below its true position.** The daily total is unaffected.

### Compatibility with Urdais identity: yes, with an alias layer

The 20 models below are the top 20 by volume on 2026-09-15, as the brief asks. [LIVE]

| `model_permaslug` | Namespace | Canonical lab | Representable as `(provider, native_id)`? |
|---|---|---|---|
| `tencent/hy4-preview-20260827` | tencent | Tencent | Yes — **new provider row needed** |
| `deepseek/deepseek-v4.1-flash-20260910` | deepseek | DeepSeek | Yes — slug matches `deepseek` |
| `z-ai/glm-5.3-flash-20260826` | z-ai | Z.ai (Zhipu) | Yes — **new provider row** |
| `deepseek/deepseek-v4-flash-20260731` | deepseek | DeepSeek | Yes |
| `openai/gpt-5.6-luna-20260709` | openai | OpenAI | Yes — slug matches `openai` |
| `xiaomi/mimo-v2.5-20260422` | xiaomi | Xiaomi | Yes — **new provider row** |
| `tencent/hy3-20260706` | tencent | Tencent | Yes — new |
| `deepseek/deepseek-v4-flash-20260423` | deepseek | DeepSeek | Yes |
| `nvidia/nemotron-3-ultra-550b-a55b-20260604` | nvidia | NVIDIA | Yes — `nvidia` exists |
| `z-ai/glm-5.3-20260816` | z-ai | Z.ai | Yes — new |
| `google/gemini-3.1-flash-*` | google | Google | Yes — matches `google` |
| `anthropic/claude-*` | anthropic | Anthropic | Yes — matches `anthropic` |
| `minimax/minimax-m2.3-*` | minimax | MiniMax | Yes — **new provider row** |
| `openai/gpt-oss-120b` + `:free` | openai | OpenAI | Yes — **after variant fold** |
| `moonshotai/kimi-k3-20260715` | moonshotai | Moonshot AI | Yes — **alias `moonshotai` → `moonshot`** |
| `qwen/qwen3.5-397b-a17b-20260216` | qwen | Alibaba | Yes — **alias `qwen` → `alibaba`**; namespace is a *family*, not a lab |
| `x-ai/grok-4.6-20260810` | x-ai | xAI | Yes — **alias `x-ai` → `xai`** |
| `upstage/solar-*` | upstage | Upstage | Yes — new |
| `inclusionai/ling-3.0-flash-*` | inclusionai | InclusionAI (Ant Group) | **Ambiguous** — legal identity unevidenced |
| `stealth/ox-alpha` | stealth | **Undisclosed** | **No lab can be assigned** |

**Conclusion: Urdais's existing identity model needs no schema change.** `reference.models` keyed `(provider_id, provider_model_id)` holds the full permaslug as the native id; `reference.model_aliases` holds the namespace aliases and the `:free` variants. The key is stable, survives renames, and rejects pointers — all three properties hold against real data.

## 6. Lab normalization quality

28 distinct namespaces over 90 days, ranked by attributed tokens. [LIVE]

| Namespace | 90-day share | Models | Mapping quality |
|---|---|---|---|
| `deepseek` | 20.84 % | 7 | **Direct** — matches existing slug |
| `tencent` | 12.79 % | 4 | Direct, new provider |
| `openai` | 11.27 % | 21 | **Direct** — matches |
| `xiaomi` | 9.77 % | 2 | Direct, new |
| `z-ai` | 8.87 % | 7 | Direct, new (Z.ai / Zhipu) |
| `anthropic` | 7.70 % | 10 | **Direct** — matches |
| `google` | 7.44 % | 15 | **Direct** — matches |
| `nvidia` | 4.76 % | 4 | **Direct** — matches |
| `minimax` | 4.58 % | 4 | Direct, new |
| **`stealth`** | **2.96 %** | 1 | **Unattributable** — `stealth/ox-alpha` |
| `moonshotai` | 1.84 % | 4 | **Alias** → `moonshot` |
| `poolside` | 1.54 % | 5 | Direct, new |
| `stepfun` | 1.40 % | 1 | Direct, new |
| `qwen` | 0.71 % | 15 | **Alias** → `alibaba`; a family name |
| `inclusionai` | 0.67 % | 5 | Ambiguous legal identity |
| **`openrouter`** | **0.63 %** | 1 | **Serving platform as author** — `openrouter/owl-alpha` |
| `upstage` | 0.53 % | 1 | Direct, new |
| `x-ai` | 0.47 % | 3 | **Alias** → `xai` |
| **`meta`** | 0.46 % | 5 | **Alias pair** — Muse Spark family |
| `mistralai` | 0.23 % | 1 | **Alias** → `mistral` |
| `cohere` | 0.18 % | 1 | Direct, new |
| `dots-studio` | 0.09 % | 1 | Ambiguous |
| `nex-agi` | 0.09 % | 3 | Ambiguous |
| `thinkingmachines` | 0.08 % | 1 | Direct, new |
| `perplexity` | 0.05 % | 1 | Direct, new |
| `baai` | 0.01 % | 1 | Direct, new |
| `bytedance-seed` | 0.00 % | 1 | Direct, new |
| **`meta-llama`** | 0.00 % | 1 | **Same lab as `meta`** — `llama-3.1-8b-instruct` |

**Four findings that decide the design:**

**One. The namespace is a reliable grouping key and not a lab identity.** `qwen` is a model family belonging to Alibaba. `meta` and `meta-llama` are **two namespaces for one lab** — direct, measured proof that the mapping needs an evidenced alias table and cannot be `split('/')[0]`.

**Two. `openrouter/owl-alpha` makes the serving platform appear as a model author.** [LIVE] Phase 1 wrote the lab/platform separation as a structural principle. It is now a concrete row carrying 0.63 % of volume that would, under naive attribution, credit OpenRouter as a frontier lab in Urdais's own market-share table.

**Three. `stealth/ox-alpha` carries 2.96 % of 90-day attributed tokens with no disclosed lab.** [LIVE] An anonymous pre-release model. On the days it appears it is enormous. A lab breakdown must therefore publish an **unattributed-lab bucket** in addition to the top-50 residual — two different holes, and the methodology currently names only one.

**Four. Only 6 of 28 namespaces match an existing Urdais provider slug** (`openai`, `anthropic`, `google`, `deepseek`, `nvidia`, `minimax` — the last needs a row). Five need aliases (`x-ai`, `qwen`, `moonshotai`, `mistralai`, `meta-llama`). Roughly 17 need new provider rows. **None of this is a schema change; all of it is reference data.**

## 7. Modalities and non-text traffic

`modality` **filters models by capability surface, not requests by content** — the decisive semantic, and it means the slices **overlap and cannot be summed**. For 2026-09-15 against an unfiltered total of `17,750,400,220,285`: [LIVE]

| `modality` | Rows | Total tokens | % of unfiltered | Named models overlapping unfiltered top 50 |
|---|---|---|---|---|
| `text` | 51 | `17,667,038,535,657` | **99.53 %** | 50 of 50 |
| `tool_calling` | 51 | `17,656,805,996,825` | 99.47 % | 50 of 50 |
| `image` | 51 | `10,144,227,343,161` | 57.15 % | 34 of 50 |
| `audio` | **45** | `2,598,721,786,094` | 14.64 % | 10 of 50 |
| `image_output` | 51 | `3,665,167,003` | **0.02 %** | **0 of 50** |

`image` returning 57 % is not 57 % image traffic — it is the total traffic of *image-capable* models, nearly all of it text.

**What is actually in the unfiltered total:**

| Class | Evidence | Share of 90-day attributed |
|---|---|---|
| **Embeddings — present** | `openai/text-embedding-3-large`, `openai/text-embedding-3-small`, `qwen/qwen3-embedding-8b`, `perplexity/pplx-embed-v1-0.6B` | **0.19 %** |
| Vision/VL models | `deepseek/deepseek-v4-flash-vision-exp-20260821`, `inclusionai/ling-3.0-flash-vl-20260910:free` | 0.16 % |
| Image generation | `black-forest-labs/flux.2-*` — in the universe, **never in the unfiltered top 50**, so inside `other` | ~0.02 % of a day |
| Rerank | No model matched `rerank` in 90 days | 0 % |
| Audio/TTS-named | No model matched | 0 % |
| Zero-token rows | **None anywhere.** Smallest observed row: 108,347 tokens | — |

**Phase 1 was wrong to presume embeddings out of scope.** [LIVE] Named embedding models reach the top 50. The dataset is **not** chat-completions only.

**The consequence is unavoidable and must be disclosed rather than fixed.** Non-comparable units — embedding tokens, image-generation tokens — are inside the total at roughly **0.2–0.4 %**, and they **cannot be removed**, because excluding a named embedding row would not remove the image-generation tokens hiding inside the opaque `other` row. A `modality=text` series is a *different, non-total* statistic, not a cleaned version of this one. **Recommendation: keep the unfiltered total, disclose the ~0.2–0.4 % non-text inclusion, and do not pretend to a purity the residual makes impossible.**

## 8. BYOK, private, ZDR

The most honest section in this document.

| Traffic class | Status | Evidence |
|---|---|---|
| Public models | **Included** | *"the top 50 **public** models per day"* [DOCS] |
| Non-public / unlisted models | **Presumed excluded** | The word "public" qualifies *models* [INFERRED] |
| **Per-request token metadata** | **Stored for every request** | *"OpenRouter does store metadata (e.g. number of prompt and completion tokens, latency, etc) for each request. This is used to power our reporting and model ranking"* [DOCS] |
| **ZDR traffic** | **Presumed included** | ZDR governs prompt/completion **content** retention. Token counts are metadata, and metadata is stored for every request and powers ranking [INFERRED] |
| Hidden apps | Excluded from **app** rankings | *"excluded from the public rankings, the app marketplace, and public app pages"* — app-level [DOCS] |
| Hidden apps' tokens in **model** rankings | **[UNKNOWN]** | The exclusion language is about apps; `rankings-daily` says "public models". No document connects them |
| **BYOK traffic** | **[UNKNOWN]** | Not mentioned in either dataset document. The OpenRouter/a16z study says *its* dataset *"excludes BYOK activity"*, but that is the study's dataset, not this endpoint |

**Two of the four unknowns Phase 1 raised are now answered (cached input, embeddings); BYOK remains open and ZDR is resolved only by inference.**

Why BYOK matters enough to keep on the blocker list: BYOK is a **billing** arrangement, and its share of platform traffic can shift for commercial reasons — a pricing change, an enterprise migration. If BYOK is excluded, such a shift moves UTVI with no change in consumption. That is a non-market movement Urdais could neither detect nor explain. It is one email to OpenRouter, whose `/data` page invites data collaborations.

## 9. Historical depth and contract stability

Four dates spanning 20 months, plus boundary probes: [LIVE]

| Probe | Request | Status | Result |
|---|---|---|---|
| Floor | `2025-01-01` | `200` | 51 rows, three fields, clean. Sample: `anthropic/claude-3.5-sonnet:beta` |
| Below floor | `2024-06-01` | **`400`** | *"Data is only available from 2025-01-01 onward; end_date must be on or after that."* |
| Clamp | `2024-01-01` → `2025-01-02` | `200` | `meta.start_date` = **`2025-01-01`**; both dates returned |
| Mid-history | `2025-12-15` | `200` | 51 rows. Sample: `x-ai/grok-code-fast-1` |
| Mid-2026 | `2026-05-11` | `200` | 51 rows. Sample: `tencent/hy3-preview-20260421` |
| Recent | `2026-09-15` | `200` | 51 rows |

**No historical contract break.** Identical three fields, identical 50+1 structure, identical integer discipline at every date from the 2025-01-01 floor to now. [LIVE] The only visible change over 20 months is which models exist — which is the market, not the contract.

`start_date` below the floor **clamps forward silently**; `end_date` below the floor is **rejected**. Asymmetric, documented, and confirmed.

## 10. Window semantics and limits

| Property | Finding |
|---|---|
| **Maximum range** | **366 days. Undocumented.** `2025-01-01`→`2026-09-15` (623 days) → `400`: *"Date range cannot exceed 366 days (requested 623)."* [LIVE] |
| Pagination | **None.** No cursor/page/next/limit/offset key at any size tested [LIVE] |
| Largest response tested | 90 days = 4,590 rows = 470 KB. A 366-day request extrapolates to ~18,700 rows / ~1.9 MB [LIVE] |
| Date inclusivity (`period=day`) | **Both ends inclusive** [LIVE] |
| Ordering | `date` ascending, then `total_tokens` descending, `other` pinned last [LIVE] |
| Rows per date | Exactly 51 on all 90 days; 45 with no residual under `modality=audio` [LIVE] |
| Inverted range | `400`: *"start_date must be on or before end_date."* [LIVE] |
| Default window | 30 days ending the last completed UTC day. Measured: `2026-08-17` → `2026-09-15` [LIVE] |
| Timezone | UTC throughout [LIVE/DOCS] |

**Backfill consequence:** 2025-01-01 → today is **623 days**, so the backfill is **two requests** (e.g. 2025-01-01→2025-12-31 and 2026-01-01→D−1), not one. Phase 1's "one pass" is corrected.

### `period=week` and `period=month` return partial trailing buckets

[LIVE] `period=week` over `2026-08-17`→`2026-09-15` returned 5 buckets, the last labelled `2026-09-14` — a bucket containing **only 09-14 and 09-15**. `period=month` over `2026-06-01`→`2026-09-15` returned a final bucket labelled `2026-09-01` holding 15 days.

**A trailing weekly or monthly bucket is incomplete and is not labelled as such.** Differencing these would fabricate a collapse at the series end. UTVI uses `period=day` only; the recommendation is to reject the other grains in the collector rather than leave the trap available.

## 11. The current UTC day is unavailable, and the clamp is silent

[LIVE] Three probes, one mechanism:

| Request | Result |
|---|---|
| `start_date=2026-09-16&end_date=2026-09-16` (today) | **`400`** *"start_date must be on or before end_date."* |
| `start_date=2026-09-18&end_date=2026-09-18` (future) | **`400`**, same message |
| `start_date=2026-09-14&end_date=2026-09-16` | **`200`**, `meta.end_date` = **`2026-09-15`**, dates returned `[2026-09-14, 2026-09-15]` |

The third probe explains the first two: **`end_date` is clamped down to the last completed UTC day, then validated against the un-clamped `start_date`.** Ask for today alone and the clamp makes `end < start`, producing a message about ordering that has nothing to do with what was wrong.

**Two operational rules follow.** The endpoint **cannot** serve a partial current day, so the completed-day recommendation is enforced by the source rather than chosen by Urdais. And **`meta.end_date` must always be read**, never assumed: a request for a range ending today succeeds while quietly returning something narrower.

## 12. Revision behaviour — measured

Three reads of 2026-09-15, spaced past the 60-second cache: [LIVE]

| Read | `meta.as_of` | Day total | Δ from previous | ppb | Rows moved |
|---|---|---|---|---|---|
| T1 | `01:00:04.234Z` | `17,750,400,127,183` | — | — | — |
| T2 | `01:00:33.578Z` | `17,750,400,220,285` | **+93,102** | +5.2 | 1 |
| T3 | `01:05:16.286Z` | `17,750,401,157,945` | **+937,660** | +52.8 | 5 (incl. `other`) |

Movements are **monotone increasing**, spread across named rows and the residual, and never change rank order. Drift ≈ **3,300 tokens/second**, i.e. roughly **16 parts per million per day** on a 17.75 T base — economically negligible, arithmetically real.

### Settlement is a function of day age, and that is the useful result

A 5-day window read 6.2 minutes apart: [LIVE]

| Date | Age at second read | Δ | ppb |
|---|---|---|---|
| 2026-09-13 | 2.05 days after close | **0** | 0.00 |
| 2026-09-14 | 1.05 days after close | **0** | 0.00 |
| 2026-09-15 | **0.05 days after close** | **+980,325** | +55.2 |

**The just-closed day accrues; days closed 25 hours or more appear frozen.** Corroborated independently: 2026-09-13 and 2026-09-14 returned **byte-identical** totals across four different window shapes, while 2026-09-15 differed in every one.

**Limitation, stated rather than glossed:** frozen-ness was observed over a 6.2-minute interval, which demonstrates that D−2 is not *actively* accruing. It is not proof that a completed day never revises later — a batch correction days afterwards would not show up in this test. The proper measurement is a protocol, not a probe, and §14 specifies it.

**Also corrected:** an earlier note in this session said the drift was observed "25 hours after the day closed". Wrong — 2026-09-15 closed at `2026-09-16T00:00Z` and was read at `01:00Z`, **1 hour** after close. The 25-hour figure is the age at which days appear *frozen*, which is the opposite conclusion.

## 13. Coverage magnitude, and the correction to Phase 1

| Date | Observed total tokens/day | [LIVE] |
|---|---|---|
| 2026-09-11 | `17,751,297,946,007` | |
| 2026-09-12 | `17,051,827,575,447` | |
| 2026-09-13 | `16,730,791,173,422` | |
| 2026-09-14 | `18,120,484,812,487` | |
| **2026-09-15** | **`17,750,400,225,262`** | Reference value |
| 90-day range | `5,693,223,633,861` … `19,184,120,113,922` | 2026-06-18 → 2026-09-15 |

**Phase 1's ~3.6 T/day was wrong by a factor of ~5.** It derived from secondary reporting of a May 2026 weekly figure; the measured level is **17.75 T/day**, and the platform roughly **2.4×'d in 90 days** (7.31 T on 2026-06-18 → 17.75 T on 2026-09-15).

Against the disclosure floor already documented in Phase 1 — no new market-size analysis, as the brief directs — coverage is therefore nearer **5 %** of world throughput than the 1 % Phase 1 stated. **The conclusion that drew is unchanged and the wording must be:** ~5 % is still a small minority of the market, the unobserved majority is still first-party traffic nobody publishes daily, and *Observed* still belongs in the name. Only the number moves.

Also worth recording: the demo UI shows `17.45T tokens/day`, within 2 % of the real 2026-09-15 figure. Nobody should read the first production print as a change from the mock.

## 13a. Two dates in the source's history are empty

**Found in Phase 1B and verified directly.** A backfill of the full 2025-01-01 → 2026-09-15 range covered 621 of 623 dates. The two it did not are not a retrieval failure:

| Date | Rows returned |
|---|---|
| 2025-06-14 | 51 |
| **2025-06-15** | **0** |
| 2025-06-16 | 51 |
| **2025-07-15** | **0** |

Both were re-requested individually against the live endpoint and both returned `200` with an empty `data` array and a correctly resolved `meta` window. The source served the date and had nothing for it.

**These dates get no UTVI point.** Not a zero — a zero would claim the platform processed no tokens that day, which is false and would sit in the middle of a series at a fifth of a per cent of its neighbours. The pipeline records them as `covered_no_rows`, writes no snapshot, and reports them separately from a genuine gap so that a run does not cry failure every day over two permanent holes.

They are worth knowing about for two reasons beyond the arithmetic. They show the source's own dataset has holes, which bears on how much weight a single date's value can carry. And they are the first real vindication of the coverage semantics: an implementation that treated absence as zero would have published two false points and nobody would have noticed until somebody looked at a chart.

## 14. A revision-measurement protocol

What the brief asks for, since a single run cannot settle it. Read-only; no storage required.

1. **Fix a target date `D`.** At `D+1 00:30Z`, read `D` and record `meta.as_of`, the day total, the 50-row vector and the residual.
2. **Re-read `D` at `+2 min, +10 min, +1 h, +6 h, +24 h, +48 h, +7 d`**, every interval greater than the 60-second cache window.
3. **Record per read:** `as_of`, day total, per-row deltas, rank-order change, residual change, response hash.
4. **Repeat over ≥14 consecutive `D` values**, so a weekday/weekend effect and any batch correction are visible.
5. **Derive:** time to first zero-delta read; maximum cumulative drift in ppm; whether any day moves after its first zero-delta; whether rank order ever changes.
6. **Set the settlement lag** to the age at which ≥95 % of days have reached zero delta, plus a margin.

Working hypothesis from this pass, to be confirmed or refuted: **settlement within ~24 hours of close; total drift under 100 ppm; rank order never changes.** If it holds, publishing D−1 provisionally and finalising at D−2 is sound, and the drift is below any sane materiality threshold for a correction.

## 15. Market Share readiness

One completed day, in memory, nothing written. [LIVE]

**Model aggregation: works.** Top 10 by tokens, 2026-09-15, after variant folding:

| # | Canonical model | Tokens | % attributed | % total |
|---|---|---|---|---|
| 1 | `tencent/hy4-preview-20260827` | 1,818,993,365,232 | 10.98 % | 10.25 % |
| 2 | `deepseek/deepseek-v4.1-flash-20260910` | 1,799,484,808,057 | 10.86 % | 10.14 % |
| 3 | `z-ai/glm-5.3-flash-20260826` | 1,585,634,881,777 | 9.57 % | 8.93 % |
| 4 | `deepseek/deepseek-v4-flash-20260731` | 1,506,862,103,085 | 9.10 % | 8.49 % |
| 5 | `openai/gpt-5.6-luna-20260709` | 1,261,229,812,236 | 7.61 % | 7.11 % |
| 6 | `xiaomi/mimo-v2.5-20260422` | 1,157,793,655,223 | 6.99 % | 6.52 % |
| 7 | `tencent/hy3-20260706` | 782,378,301,855 | 4.72 % | 4.41 % |
| 8 | `deepseek/deepseek-v4-flash-20260423` | 668,011,906,315 | 4.03 % | 3.76 % |
| 9 | `nvidia/nemotron-3-ultra-550b-a55b-20260604` | 442,497,528,444 | 2.67 % | 2.49 % |
| 10 | `z-ai/glm-5.3-20260816` | 421,935,269,991 | 2.55 % | 2.38 % |

**Namespace aggregation: works.** Top 8, same day: `deepseek` 26.62 %, `tencent` 15.71 %, `z-ai` 13.53 %, `openai` 12.14 %, `xiaomi` 6.99 %, `google` 5.96 %, `anthropic` 3.90 %, `nvidia` 3.43 % (shares of attributed).

**Unattributed tail: 6.69 % on the day; 4.59–7.98 % over 90 days, mean 6.13 %.**

**Verdict: the source supports Phase 2, with two residuals to publish, not one.**

1. The **top-50 residual** — 6.1 % mean — with no model and no lab.
2. The **unattributed-lab residual** — `stealth` at 2.96 % of 90-day volume, plus ambiguous namespaces — which has a model but no evidenced lab.

Phase 1's methodology names only the first. **It needs a second bucket.** A lab table whose shares sum to 100 % while `stealth/ox-alpha` sits inside one of the named labs would be wrong.

## 16. Open-weight classification

**The endpoint exposes nothing.** Three fields, none of them a licence, a weights flag or a capability descriptor. [LIVE]

Model names hint — `openai/gpt-oss-120b`, `qwen/…`, `z-ai/glm-…` are open-weight; `openai/gpt-5.6-luna-…`, `anthropic/claude-…` are not — and **naming is not evidence**. The brief is explicit and correct that classifications must not be invented from names.

**Conclusion: open-weight classification must come from Urdais's own reference layer**, as an evidenced attribute on `reference.models` with its source, exactly as the demo's `AccessClass` anticipates. The Open-weight section of Model Economics therefore depends on reference data Urdais must curate, not on anything OpenRouter supplies.

## 17. Attribution and licence, reconfirmed verbatim

Re-retrieved 2026-09-16. Unchanged from Phase 1.

**Licence** — OpenRouter's Datasets SDK reference:

> "Public OpenRouter usage datasets. Data returned by these endpoints is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): **reuse and republish it, including commercially, with attribution to OpenRouter.**"

**Required citation** — the endpoint document, exact form, not to be paraphrased:

> `Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.`

| Item | Value |
|---|---|
| Licence name | Creative Commons Attribution 4.0 International |
| Licence URL | `https://creativecommons.org/licenses/by/4.0/` |
| Source URL for citation | `https://openrouter.ai/rankings` |
| `{as_of}` | `meta.as_of`, ISO-8601, **changes every request** |

**`as_of` semantics, measured:** it is the **response generation time**, not a data-version stamp — it moved on every one of 26 requests, including reads that returned identical bytes. [LIVE] Two consequences. A stored citation is only ever true of the retrieval that produced it, so **`as_of` must be persisted per retrieval**. And `as_of` is **not** usable as a revision detector: the body hash is, `as_of` is not.

### Derivative use: publishing UTVI is clearly inside the grant

| Activity | Assessment |
|---|---|
| **Publishing a derived UTVI series** (daily aggregate, percentage changes, shares) | **Permitted.** CC BY 4.0 §2(a)(1)(B) grants the right "to reproduce and Share Adapted Material"; an aggregate index over the rows is adapted material; the sole condition is the attribution above |
| **Re-serving raw OpenRouter rows** as a Urdais API | **Permitted by the licence, and not what Urdais is doing.** It sits closer to Terms §7(4) — "reselling API access to Models or otherwise developing a competing service" — and re-serving a substantial verbatim portion is a different product decision that should be taken deliberately, not inherited |

The distinction the brief draws is the right one and Urdais is on the safe side of it: **a derived market-data product, not a clone of the Data API.** No prohibition on competing *free APIs* appears in the Terms; the clause is about reselling model access and building a competing routing service, neither of which describes an index.

Operational constraints from Phase 1 stand unchanged: documented `/api/v1/datasets/*` endpoints only; 30/min and 500/day respected; **no HTML page and no secondary mirror is ever a data source.**

## 18. Schema implications

The characterization changes the Phase 1 proposal in six places. Recommendation only — **nothing is implemented.**

| Field | Needed? | Why the live contract says so |
|---|---|---|
| Retrieval id | **Yes** | Append-only lineage, unchanged |
| `source_window_start` / `_end` | **Yes** | Must store **resolved** `meta.start_date`/`end_date`, not requested — the clamp is silent |
| `source_as_of` | **Yes** | Required by the citation; per retrieval, since it changes every request |
| `response_hash` | **Yes, load-bearing** | **The only revision detector.** `as_of` moves without the data moving |
| `dataset_version` | **Yes** | `meta.version` = `v1`; a change is a contract event |
| `source_model_id` (permaslug, verbatim) | **Yes** | Includes `:variant`; the stable key |
| `prompt_tokens` / `completion_tokens` | **Drop from V1** | **Not returned and never will be from this source.** Phase 1 proposed them as nullable placeholders; a column that can only ever be null is a claim the source might fill it |
| `total_tokens` as `numeric` | **Yes** | Decimal strings; parse to `BigInt`. Estimated datasets return genuine fractions, so `numeric` not `bigint` |
| `rank` | **No** | Not returned. Rank is derivable from ordering and is not a source fact |
| `is_residual_aggregate` | **Yes** | The `other` row, which **can be absent** |
| Canonical model id | **Yes** | After variant folding — 29 measured collisions require it |
| Canonical lab id, **nullable** | **Yes** | `stealth/ox-alpha` has no lab. Nullable is not a convenience; it is the only correct type |
| Serving-platform id | **Yes** | And `openrouter/owl-alpha` proves platform and lab must not share a column |
| Attribution + licence | **Yes** | Rendered citation per observation |
| Revision / supersession | **Yes** | Measured: D−1 moves |
| `settlement_state` | **Yes** | `provisional` / `final`, driven by day age |
| Coverage status | **Yes** | Unchanged; `Σ ∅ = 0` still the hazard |
| **`lab_attribution_state`** | **New** | `evidenced` / `undisclosed` / `ambiguous`. Required by `stealth` and `inclusionai` |
| **`non_text_inclusion_note`** | **New, as methodology text not a column** | The ~0.2–0.4 % embedding and image-generation inclusion is a property of the series, recorded once per methodology version |

**Fields required specifically by the four Phase 1 unknowns:**

- **Cached tokens** — no field needed. Resolved by documentation: inside `prompt_tokens`, hence inside `total_tokens`, not separable. A methodology sentence, not a column.
- **Source revisions** — `response_hash`, `source_as_of`, `settlement_state`, `superseded_by`. All four load-bearing.
- **BYOK/private exclusions** — **no column can fix an unknown.** What is needed is the answer, plus a `universe_descriptor` on the publication that changes if the answer changes.
- **Historical contract differences** — **none found.** `dataset_version` covers a future break; no historical special-casing is required.

## 19. Retrieval identity and supersession

Design only.

**Idempotency key:** `openrouter-datasets-rankings-daily | resolved_start | resolved_end | period=day | purpose`. Using **resolved** dates means a request for "…through today" and one for "…through D−1" collapse to the same key, which is correct — they returned the same data.

**Repeated pulls for the same day:**

1. Every retrieval inserts a **new** row. Nothing is mutated — the existing `pipeline.forbid_mutation()` discipline, unchanged.
2. Raw observations attach to their retrieval, so `(retrieval, date, permaslug)` stays unique and a re-read creates a parallel set rather than an update.
3. **Compare `response_hash`.** Identical hash → confirmation; record the retrieval, create no new normalized observations. Different hash → the day revised.
4. On revision, the prior normalized observations are **superseded, not edited** — `superseded_by` set, old rows retained — via `pipeline.allow_only_supersession()`.
5. A `final` date is not re-read. A change discovered on a `final` date is a **correction**, published as one.

This maps onto existing conventions with no new machinery: the same `source_retrievals` + append-only + supersession triad UCPI uses, with `response_hash` doing the work `as_of` cannot.

## 20. Publication semantics

**Eligibility.** A date `D` becomes eligible when all hold: `D` is a completed UTC day that the endpoint will serve (enforced by the source); a production retrieval succeeded; `meta.end_date >= D`; the day returned ≥1 named row; and coverage is `covered_observed`.

The brief's candidate rule is right with one addition: **the residual row's presence must not be required** — `modality=audio` proved it can be legitimately absent, and a collector that demands it would fail on a true empty tail.

**Recommended lag.** Publish `D−1` as **provisional** on the daily run, and **finalise at `D−2`** on the following run, when the measurements say it has stopped moving. This publishes a value promptly, tells the reader it is provisional, and finalises on evidence rather than on hope.

**Revisions after publication.** Re-publish and supersede **while provisional** — drift is ~16 ppm/day and the revised value is strictly better. After `final`, only a **correction**, and only above a materiality threshold; on present evidence drift never approaches it, so a correction should be a genuine event rather than daily noise.

**Public history shows revised values, not first prints.** Three reasons. It is the only rule that makes a two-request backfill of settled history consistent with forward first prints. The revised value is nearer the truth. And a first-print series would embed a permanent ~50 ppb bias at the newest point only, which is the worst place to put an artifact. First prints are retained as lineage and are auditable; they are not what the chart shows.

## 21. Verdict

> **Ready for UTVI Phase 1B implementation**, with one carve-out: the observation universe cannot be stated finally until OpenRouter answers whether `rankings-daily` includes BYOK and hidden-app traffic.

Everything a schema needs is now measured: the exact contract, the integrity guarantees, the total's construction, the identity shape and its two attribution holes, the history depth and its 366-day request limit, the settlement behaviour by day age, and the licence. Six Phase 1 assumptions were corrected by measurement — which is what the pass was for.

The BYOK question does not block building. It blocks **finalising the universe descriptor**, and it should be asked in parallel with 1B rather than ahead of it, because no answer to it changes a column: it changes one sentence of methodology and one published descriptor. The settlement lag likewise wants the §14 protocol before 1.0.0 is approved, and that protocol can run while the schema is written.

## Evidence

Under [`artifacts/`](artifacts/), all retrieved 2026-09-16:

| File | Contents |
|---|---|
| `20260916T0107Z_phase1a_characterization_report.json` | Full 19-probe report |
| `…_revision_T1/T2/T3_2026-09-15.json` | Three reads of one completed day |
| `…_settlement_baseline_3day.json`, `…_settlement_by_day_age.json` | The frozen-by-age measurement |
| `…_modality_slices.json` | Five modality slices with model lists |
| `…_window_90day_summary.json` | 90 daily totals, residual shares, 28 namespaces, 29 variant collisions |
| `…_rejected_requests.json` | Six verbatim `400` bodies |

Script: [`scripts/research/utvi-characterize-openrouter.ts`](../../../scripts/research/utvi-characterize-openrouter.ts). Read-only, no application imports, no database, key never logged.
