# H100 Source Terms Review

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026 for Phase 4A of the H100 production sequence. It records what each candidate source's own terms say about two separate questions, and classifies each source in the registry vocabulary. It makes no legal conclusion and is not legal advice; it quotes the decisive language and records what remains unsettled.

## Why this document exists

Phase 4A began as an implementation task: build the first collector against the marketplace offer interface, because Phase 2 established it as the richest H100 source. Re-opening that provider's Terms of Use before writing any code found language that prohibits precisely what Urdais intends to do. The review then widened to every candidate source.

The finding is structural rather than incidental, and it changes the architecture: **source licensing is a market-data input, not an operational afterthought.**

> Technically collectible ≠ permitted to automate ≠ permitted to use in an index.

Urdais needs all three. A published, documented, unauthenticated API settles only the first.

## The two questions

Every source is assessed against two questions that can diverge, and do:

1. **Collection.** May Urdais retrieve this source automatically through its documented interface?
2. **Data use.** May Urdais use the retrieved pricing and availability data to construct, calculate, publish or maintain an index or benchmark?

A source passes only if both are yes. The Phase 3 registry carried one axis, `terms_review_state`, which could not express a source that permits retrieval and is silent on index construction. Migration `20260913070000` narrows that column to question 1 and adds `data_use_terms_state` for question 2, plus `written_agreement_required` and a `terms_evidence` column holding the verbatim clauses with their URLs and retrieval dates. Production approval now requires both axes to read `permitted`, and a prohibition on either forces `production_blocked`.

## Results

All documents were retrieved and read on 13 September 2026. Verbatim clauses are stored in the registry; the decisive ones are quoted below.

| Source | Collection | Data use | Production state | Written agreement needed |
|---|---|---|---|---|
| Vast.ai offer search | **not permitted** | **not permitted** | blocked | Yes, for both |
| Runpod GPU types | **not permitted** | **not permitted** | blocked | Yes, for both |
| Lambda instance types | under review | **not permitted** | blocked | Yes, for data use |
| DigitalOcean sizes | under review | under review | review pending | Undetermined |
| Azure Retail Prices | **permitted** | under review | review pending | Undetermined |
| AWS Price List Bulk | **permitted** | under review | review pending | Undetermined |

### Vast.ai — prohibited on both axes

Terms of Use, Version Date 1 September 2026. Three separate clauses bear on this, and they are unusually explicit.

On collection: *"Using any robot, spider, crawler, scraper, script, browser automation, web scraping, web harvesting, web data extraction, data-mining tool or any other automated method to access, query, copy, download, monitor, collect, cache, store or extract data from the Website or Services, except as expressly authorized in a separate written agreement with Company."*

Also on collection: *"Engaging in any bulk, systematic, or automated retrieval, collection, copying, downloading, harvesting, caching, storage or other extraction of data or other content from the Website to create, develop, populate, maintain, or compile, directly or indirectly, a collection, compilation, database, dataset, index, benchmark, or directory without written permission from Company."*

On data use, addressing Authorized Data, which the same document describes as including *"individual prices, availability counts and other factual information"*: *"you may not use Authorized Data (or any value derived therefrom) alone or together with other data, as an input to or for the construction, calculation, publication, maintenance, or administration of any index, benchmark, pricing index, price-comparison database, or other product or service that measures, compares, tracks, summarizes or reflects pricing, availability, capacity or market conditions"*.

The current API reference also states that *"All endpoints require `Authorization: Bearer $VAST_API_KEY`"*, which is a change from the unauthenticated behaviour observed during Phase 2 research.

**No further live retrieval.** The research already gathered in Phases 1 and 2 stands as research and is not withdrawn, and the interface's field shape may inform synthetic test fixtures. Nothing from this venue may enter a published UCPI value without a separate written agreement.

### Runpod — prohibited on both axes

Terms of Service, Last Updated 24 March 2026.

On collection: *"access or use the Site or the Service through automated or non-human means, whether through a bot, script or otherwise"*, and *"Except as may be the result of standard search engine or Internet browser usage, use, launch, develop, or distribute any automated system, including without limitation, any spider, robot, cheat utility, scraper, or offline reader that accesses the Site"*.

On data use: *"Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us."* And separately: *"Use the Service as part of any effort to compete with us."*

This is the source with the strongest availability shape found anywhere: a four-level per-datacenter signal conditional on requested GPU count, which is exactly what the child's Grade 3 minimum contemplates. It is nonetheless unavailable without written permission.

### Lambda — collection arguable, data use prohibited

Terms of service, Last updated August 2025.

The Acceptable Use Policy's prohibited list includes *"web crawling which is not restricted to a rate so as not to impair or otherwise disrupt the servers being crawled"*. The prohibition attaches to **unrestricted** crawling, so rate-limited retrieval is not forbidden by that clause, and the Cloud Terms require only that *"Customer shall use the Authorized APIs in accordance with the Documentation"*. The collection axis is therefore arguable rather than settled, and is recorded as under review.

The data-use axis is not arguable. The Cloud Terms of Service prohibit the customer from: *"access any portion of the Services for the purpose of building a similar or competitive product or service, or **monitor the Services for any benchmarking or competitive purpose**"*.

UCPI is a benchmark, and a collector polling Lambda's instance-types endpoint daily is monitoring the Services for a benchmarking purpose. API access additionally requires being a customer bound by those terms; a live unauthenticated call returned HTTP 401. This is the source Phase 1 called the reference shape, and its own terms exclude the use Urdais intends.

### DigitalOcean — unsettled on both axes

Terms of Service Agreement, Last Updated 22 August 2026, and Acceptable Use Policy, Last Updated 20 March 2026.

Neither document addresses API retrieval, data compilation, indexes or benchmarks. The only adjacent language is in the Acceptable Use Policy: *"Monitoring or crawling of a System that impairs or disrupts the System being monitored or crawled, or other harvesting or scraping of any content of the Services."* Whether the trailing clause reaches a documented, authenticated, scoped API endpoint is not settled by the text.

The API itself is well documented, with OAuth bearer tokens and per-endpoint read scopes. Silence is not permission for either axis, so both remain under review.

### Azure Retail Prices — collection permitted, data use unsettled

Microsoft's own API documentation settles the collection axis affirmatively: *"This API gives you an unauthenticated experience to get retail rates for all Azure services."* The page opens by explaining that *"Azure customers have been looking for a programmatic way to retrieve retail prices for all Azure services."* The Microsoft Terms of Use prohibit obtaining information *"through any means not intentionally made available through the Services"*, and this API is intentionally made available; its web-scraping prohibition is scoped to *"the AI services"*, not to the pricing API.

The data-use axis is not settled. The documented purpose is *"create your own tools for internal analysis and price comparison across SKUs and regions"*. Publishing an external price index is neither described nor prohibited. Recorded as under review.

### AWS Price List Bulk API — collection permitted, data use unsettled

AWS documentation expressly recommends the behaviour: *"We recommend that you use the AWS Price List Bulk API to find and download price list files programmatically"*, for users who need to *"Consume large amounts of product and pricing information for AWS services."* That settles the collection axis for these endpoints.

The data-use axis is closer than any other source and still not settled. AWS Service Terms, Last Updated 11 September 2026, clause 1.8: *"You may perform benchmarks or comparative tests or evaluations (each, a 'Benchmark') of the Services. If you perform or disclose... any Benchmark of any of the Services, you (i) will include in any disclosure, and will disclose to us, all information necessary to replicate such Benchmark."* A published methodology plausibly satisfies the replication condition. But that clause concerns benchmarking the Services, which is not obviously the same as constructing a price index from published rates, and the separate AWS Site Terms restrict *"any use of data mining, robots, or similar data gathering and extraction tools"* against the AWS Site, a different surface from the documented bulk price list endpoints. Recorded as under review.

## Sources not reviewed, and why

Phase 1 examined thirteen sellers and venues. The remainder are not collector candidates, so reviewing their terms would not change any decision now.

**No H100-bearing interface was ever established** for Nebius, Crusoe, Hyperstack or Together; Phase 1 opened their documentation portals without finding one. Hyperstack's terms were read opportunistically and address none of the two questions. **CoreWeave** publishes only a price surface with whole-node products. **Voltage Park** publishes no price through any interface. **Modal** is serverless and out of scope for this child. A source with no machine-readable interface cannot be a collector candidate whatever its terms say.

## The bind

The two sources with a settled collection permission are the two that cannot serve this child.

Phase 2 established that Azure and AWS sell H100 capacity as **whole eight-accelerator instances** and expose **no capacity signal at all**, placing them at availability Grade 4, below the child's Grade 3 minimum. Dividing a node price by eight is arithmetic, not comparability, and the family prohibits crossing a topology class. Their data is excellent and describes a different product.

The sources that match the per-accelerator child, carry discriminating availability, and expose seller-level structure are exactly the three whose terms prohibit the use: the marketplace on both axes, Runpod on both axes, Lambda on data use.

**Phase 4 for UCPI-H100-SXM is therefore operationally blocked by source licensing.** This is not a methodology failure. The methodology already anticipated it: *"A source cannot enter production unless Urdais has a permitted and reproducible collection path"*, and the child lists that prerequisite among its launch blockers. The review has now established which sources fail it and why.

## What this does not mean

It does not mean the methodology should change. Weakening the availability minimum to admit Grade 4 catalog sources would convert UCPI into the advertised-price object the family explicitly rejected, and would do so to evade a licensing constraint rather than because the evidence changed.

It does not mean Phases 1 to 3 were wasted. The schema, the eligibility vocabulary and the lineage model are unaffected; what is missing is permission to fill them for this particular child.

It does not mean the collected research is tainted. Phases 1 and 2 were bounded research reads, not automated production collection, and their conclusions stand as research.

## Recommended paths

Three, in the order they could be pursued. Each is a decision for the owner, not for an implementation phase.

**Seek written permission.** The three sources that fit the child all condition the permission Urdais needs on a written agreement, and all three name that route explicitly. A benchmark administrator approaching a venue for index-construction rights is an ordinary commercial conversation, and the IOSCO-informed governance already documented in the family methodology is the kind of thing such a request rests on. This is the only path that unblocks the per-accelerator child as specified.

**Research the whole-node sibling.** Phase 2 already recommended it as future work, on product grounds. The terms review strengthens that recommendation independently: Azure and AWS have the settled collection permission, publish region-resolved prices with effective dates, and sell exactly the whole eight-accelerator product such a sibling would measure. Its data-use axis would still need confirmation, and its availability problem is unchanged, so it is not a shortcut to publication. It is the one place where permitted collection and available product currently overlap.

**Confirm the unsettled axes.** DigitalOcean, Azure and AWS all sit at under review on data use rather than at a prohibition. A short written confirmation from each would convert three sources from unsettled to decided, in whichever direction the answer falls. That is cheap and worth doing regardless of which path is chosen.

## What was built in this phase

The registry amendment, six reviewed providers, six reviewed interfaces with verbatim evidence, and one database test. **No collector code exists.** No Python package, no HTTP client, no scheduler. Scaffolding begun before the terms were read was deleted rather than left dormant, because an unusable collector in the tree invites someone to run it.

No live retrieval was made against any provider during this phase. `UrdaisDev` holds no provider observations. `pipeline.source_retrievals` and `pipeline.raw_offers` remain empty, and a test asserts it.
