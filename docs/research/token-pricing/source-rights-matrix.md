# Source-rights matrix

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** This is lighter than the UCPI terms review. It is not legal advice. Production approval still requires both collection and data-use axes to be `permitted`.

Technically collectible ≠ robots-allowed ≠ contractually permitted to automate ≠ permitted to republish as Urdais market data.

All six interfaces are seeded as `research_usable` / `under_review` / `under_review`. None is `production_approved`.

| Provider | Technically accessible | robots.txt on the pricing URL | Automated retrieval | Data reuse for Urdais display | Attribution | Caching / rate limits | Written agreement? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | Yes, docs HTML | Pricing path not disallowed (`platform.openai.com/robots.txt`, 200) | **Unclear.** Docs ToS not isolated (openai.com terms 403). Public docs ≠ a licence to harvest. | **Unclear.** Published list prices are facts; reuse as a competing data product is unreviewed. | Trademark/branding only so far; no "Data: OpenAI" clause found. | No crawl budget on the pricing doc. API rate limits are for inference, not docs. | Undetermined |
| Anthropic | Yes, docs HTML | `Disallow: /api/` only | **Unclear.** Commercial terms page retrieved as a JS bundle; scraping clauses not isolated in this pass. | **Unclear.** | Undetermined | Undetermined | Undetermined |
| Google | Yes, Gemini pricing HTML. Vertex HTML yes. | `ai.google.dev/robots.txt` redirected to login | **Unclear.** Gemini Additional Terms (effective 23 Mar 2026) govern **API** use, not obviously the public pricing page. They prohibit caching Grounded Results to build a database; that clause is about Search grounding, not list prices. | **Unclear.** | Undetermined | Gemini notes rate limits subject to change. Cloud Billing Catalog exists for Vertex SKUs (machine-readable, separate terms). | Undetermined |
| xAI | Yes, docs HTML | `Allow: /` plus Content-Signal `ai-train=no, search=yes, ai-input=yes` | **Unclear** despite permissive robots. Consumer ToS fetch 403 from openai-style CDN; xAI API terms not isolated. `ai-train=no` is a training signal, not a market-data licence. | **Unclear.** | Undetermined | Documented **inference** RPS/TPM by spend tier, not docs crawl limits. | Undetermined |
| DeepSeek | Yes, docs HTML (curl). WebFetch 409. | No usable robots.txt (SPA HTML) | **Unclear.** Open Platform ToS retrieved; no scrape/index clause isolated in this pass. | **Unclear.** | Undetermined | Concurrency limits 2500 (Flash) / 500 (Pro) are API limits. | Undetermined |
| Alibaba/Qwen | Yes, Model Studio HTML | Help HTML allowed; `/api/*` and `*.json` disallowed | **Unclear.** JSON/API harvest looks robots-blocked. HTML help is not. Website terms page was a thin shell (3 KB). | **Unclear.** Regional catalogs must not be mixed. | Undetermined | Promotions and night discounts change often; cache a dated retrieval, never "the" price. | Undetermined |

## Classification used in the registry

Question 1 (`terms_review_state`): may Urdais retrieve this interface automatically? **under_review** for all six.

Question 2 (`data_use_terms_state`): may Urdais publish the retrieved list prices in a market-data product? **under_review** for all six.

Phase 2 adapters may be written against saved research retrievals. Production collection waits on an explicit terms close, as with UCPI.
