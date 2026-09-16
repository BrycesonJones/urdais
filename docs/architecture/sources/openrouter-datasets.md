# OpenRouter Datasets API — Terms Review

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 16 September 2026 for [UTVI Phase 1](../../research/utvi/source-study.md). It records what OpenRouter's own documents say about two separate questions and classifies the source in the registry vocabulary. It makes no legal conclusion and is not legal advice; it quotes the decisive language with its URL and retrieval date, and records what remains unsettled.

All documents retrieved **16 September 2026**.

## Result

| Axis | State | Basis |
|---|---|---|
| **Collection** — may Urdais retrieve this automatically through its documented interface? | **permitted** | A documented, versioned, key-authenticated JSON API with published rate limits, which the vendor invites callers to use |
| **Data use** — may Urdais use the data to construct, calculate, publish and maintain an index? | **permitted** | **CC BY 4.0**, granted in OpenRouter's own words, explicitly including commercial reuse |
| `written_agreement_required` | **No** | A public licence grant; no bilateral agreement is contemplated |
| Proposed `production_access_state` | **`production_review_pending`** | Both axes read permitted. Production approval additionally requires one successful authenticated retrieval with its evidence recorded, and Urdais has none |

**This is the strongest rights position Urdais has obtained for any source**, stronger than the [Price of Compute](price-of-compute.md) grant that unblocked UCPI, because it is a named public licence with a published text rather than a permission that must be evidenced by correspondence.

## The decisive grant

From OpenRouter's Datasets SDK reference, `https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README.md` (identical text at the Python and Go paths), retrieved 16 September 2026:

> "Public OpenRouter usage datasets. Data returned by these endpoints is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): **reuse and republish it, including commercially, with attribution to OpenRouter.**"

Repeated on the endpoint itself, `https://openrouter.ai/docs/api/api-reference/datasets/daily-token-totals-for-top-50-models`:

> "Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): reuse and republish with attribution to OpenRouter."

Three properties of CC BY 4.0 are what the data-use axis needs, and all three are express in the licence text rather than inferred:

1. **Commercial use is permitted** — and OpenRouter says so in terms rather than leaving it to the licence.
2. **Adapted material is permitted.** §2(a)(1)(B) grants the right "to reproduce and Share Adapted Material". A derived index is adapted material. This is the clause that makes UTVI lawful, and its absence is what has blocked every other Urdais source.
3. **The only condition is attribution**, §3(a), which is discharged by the citation OpenRouter specifies.

## Attribution is a data requirement

> "When republishing or quoting this dataset, OpenRouter must be cited as: **\"Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.\"**"

`{as_of}` interpolates `meta.as_of` from the response payload. The obligation therefore **cannot be met by a static credit line**: the timestamp must be persisted per retrieval and carried through to every public representation of a UTVI value. The mechanism already exists — UCPI carries required attribution per observation after migration `20260915170000` — and UTVI should reuse it rather than grow a second one.

## Reconciling the anti-scraping clause

OpenRouter's Terms of Service, `https://openrouter.ai/terms`, §7 *Prohibited Conduct*, items 5 and 6:

> "develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins, add-ons or any other automated technology) **to scrape or copy any information on the Site or the Services**"

> "bypass any technical measures implemented by OpenRouter that are designed to prevent scraping"

Read against the licence grant, these are not in conflict; they separate two routes to the same numbers and permit exactly one of them. The Datasets endpoints are a documented, authenticated API with published rate limits whose output OpenRouter licenses for republication. Calling them is using an interface as offered. Reading the HTML of `openrouter.ai/rankings` with a script is scraping the Site, and the grant on the *endpoint data* does not reach it.

**Three binding operational constraints follow**, and they belong in code rather than in a note:

1. **Only the documented `/api/v1/datasets/*` endpoints.** No HTML page on `openrouter.ai` is ever a data source — not the rankings page, not the apps marketplace, not a chart payload embedded in a page.
2. **Respect the published limits: 30 requests/minute per key, 500 requests/day per account.** A daily UTVI run needs one request; a 20-month backfill needs a handful. There is no tension here, and a collector that could exceed the limit should refuse rather than discover it.
3. **No secondary mirror.** MacroMicro and others republish OpenRouter's token series. Reading a mirror to avoid needing a key would be routing around the authentication OpenRouter chose, and it is prohibited by the same discipline that closed Runpod. If the key is missing, the answer is that the source is unavailable.

`robots.txt` (retained at [`../../research/utvi/artifacts/20260916T0009Z_openrouter_robots.txt`](../../research/utvi/artifacts/20260916T0009Z_openrouter_robots.txt)) is `Allow: /` with `Disallow: /seo/`, so it neither adds a restriction on the API path nor licenses anything the Terms withhold.

## Two clauses assessed and not triggered

§7 item 4 prohibits users who:

> "access the Site or Service for purposes of **reselling API access to Models or otherwise developing a competing service**"

Publishing a token-volume statistic is neither. Urdais does not resell model access, does not route inference, and does not offer anything a customer would buy instead of OpenRouter. The assessment is recorded because it should be revisited if Urdais ever serves the *dataset itself* rather than an index derived from it — redistributing a substantial part of the dataset verbatim is permitted by CC BY 4.0 but is closer to the conduct this clause is aimed at, and it is a different product decision.

§6.5 *License to Categorize Inputs* concerns OpenRouter's rights in its **users'** prompts, granting OpenRouter the right to use anonymised inputs "solely for tracking and sharing user metrics on the Site, such as for example, on our Rankings Page". It does not govern Urdais's use of the published aggregates, and it is noted only to record that it was read and is not the operative clause. It does, usefully, confirm that the rankings aggregates are the intended public output of that licence.

## What blocks production approval

Not rights. **Access.**

The endpoint requires an OpenRouter API key — "any valid OpenRouter API key (same key used for inference)". Urdais has none; the repository defines no `OPENROUTER_API_KEY`; an unauthenticated call returns `401 No cookie auth credentials found` (retained at [`../../research/utvi/artifacts/20260916T0011Z_openrouter_rankings_daily_unauthenticated.txt`](../../research/utvi/artifacts/20260916T0011Z_openrouter_rankings_daily_unauthenticated.txt)).

So **no row of this dataset has ever been retrieved by Urdais**, and the gate should stay shut on that ground alone. The registry's own rule already says so: production approval requires recorded evidence, and a source whose interface has never returned a document has none.

Promotion to `production_approved` requires, in order:

1. An OpenRouter account and API key, held as `OPENROUTER_API_KEY`.
2. One successful authenticated retrieval, with response hash, byte length and `meta` block recorded as a `pipeline.source_retrievals` row.
3. The four undocumented semantics in the [source study](../../research/utvi/source-study.md#open-questions-for-the-source) either measured or answered by OpenRouter.
4. The verbatim licence and citation clauses stored in the registry's `terms_evidence` column with their URLs and this retrieval date, as every other reviewed source's are.

Only then do both axes plus production approval align, and only then does [`productionCollectionPermitted`](../../../src/lib/ucpi/permission-gate.ts) return true for this slug.

## Registry rows this source will need

Recorded here so the eventual migration is a transcription rather than a fresh decision. **No migration is created by this phase.**

| Object | Value |
|---|---|
| `reference.providers` | `openrouter` — requires a new `provider_kind`, `inference_marketplace`. Not `model_api_provider`: OpenRouter is not a lab and must never be aggregated as one |
| `reference.source_interfaces.slug` | `openrouter-datasets-rankings-daily` |
| `canonical_url` | `https://openrouter.ai/api/v1/datasets/rankings-daily` |
| `terms_review_state` | `permitted` |
| `data_use_terms_state` | `permitted` |
| `production_access_state` | `production_review_pending` → `production_approved` after the four steps above |
| `written_agreement_required` | `false` |
| `terms_evidence` | The CC BY 4.0 grant, the citation template, and Terms §7 items 4–6, each with URL and retrieval date 2026-09-16 |
| Required attribution | `Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.` — template, interpolated per retrieval |

## Sources

- <https://openrouter.ai/docs/api/api-reference/datasets/daily-token-totals-for-top-50-models> — endpoint documentation, licence, citation template
- <https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README.md> — the "including commercially" grant
- <https://openrouter.ai/openapi.json> — response contract
- <https://openrouter.ai/terms> — Terms of Service §6.5, §7
- <https://openrouter.ai/data> — data collaborations, "We don't sell prompt data"
- <https://openrouter.ai/robots.txt>
- <https://creativecommons.org/licenses/by/4.0/> — licence text, §2(a)(1)(B), §3(a)
