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
| Runpod catalog GPU types | **not permitted** | **not permitted** | blocked | Yes, for both |
| Lambda instance types | under review | **not permitted** | blocked | Yes, for data use |

Lambda's position was re-examined in a dedicated investigation on 13 September 2026. The four classification values are unchanged; what changed is the evidence behind them. See the Lambda section below.
| DigitalOcean sizes | under review | under review | review pending | Undetermined |
| Azure Retail Prices | **permitted** | under review | review pending | Undetermined |
| AWS Price List Bulk | **permitted** | under review | review pending | Undetermined |

### Vast.ai — prohibited on both axes, by a licence that excludes Urdais by name

Terms of Use, Version Date 1 September 2026. Re-read in full on 13 September 2026. The position is unchanged and the reasoning is stronger than first recorded.

**The prohibitions sit underneath a positive licence grant, which the first pass missed.** *"Certain pricing, availability, capacity, configuration, historical, aggregated or other market data may be made available by Company only after acceptance of this Agreement (collectively, **"Authorized Data"**)."* That is precisely the data the child needs, and because the restriction attaches to the data rather than to a surface, it does not turn on whether the API host falls inside the Website definition.

The grant is then exhaustive: Company *"grants you a limited, non-exclusive, non-transferable, non-sublicensable right to use Authorized Data **solely (a) to evaluate, configure and purchase Company Services for your own use and (b) to inform the pricing of your own products or services offered to third parties**"*, and *"**you may not use Authorized Data for any other commercial data product or market-information purpose**"*.

Urdais is a commercial market-information product and is within neither permitted use. This is not a generic clause that happens to catch Urdais; it is a licence whose enumerated purposes exclude Urdais and whose exclusion names the category Urdais occupies.

**Vast has also reserved this product category for itself:** *"Company reserves all rights it may have in the compilation and delivery of Authorized Data and in any proprietary feed, export, chart, **index** or other data product created by Company."* Any request therefore asks permission to build something the provider has expressly reserved, which is a commercial conflict rather than a misunderstanding.

Three further clauses bear on this, and they are unusually explicit.

On collection: *"Using any robot, spider, crawler, scraper, script, browser automation, web scraping, web harvesting, web data extraction, data-mining tool or any other automated method to access, query, copy, download, monitor, collect, cache, store or extract data from the Website or Services, except as expressly authorized in a separate written agreement with Company."*

Also on collection: *"Engaging in any bulk, systematic, or automated retrieval, collection, copying, downloading, harvesting, caching, storage or other extraction of data or other content from the Website to create, develop, populate, maintain, or compile, directly or indirectly, a collection, compilation, database, dataset, index, benchmark, or directory without written permission from Company."*

On data use, addressing Authorized Data, which the same document describes as including *"individual prices, availability counts and other factual information"*: *"you may not use Authorized Data (or any value derived therefrom) alone or together with other data, as an input to or for the construction, calculation, publication, maintenance, or administration of any index, benchmark, pricing index, price-comparison database, or other product or service that measures, compares, tracks, summarizes or reflects pricing, availability, capacity or market conditions"*.

The current API reference also states that *"All endpoints require `Authorization: Bearer $VAST_API_KEY`"*, which is a change from the unauthenticated behaviour observed during Phase 2 research.

**The remedy is named**, in both the collection clause (*"except as expressly authorized in a separate written agreement with Company"*) and the index clause (*"unless Company expressly agrees otherwise in a separate written agreement"*). A request is therefore possible, and a draft is held alongside this document. No separate API terms, acceptable-use policy or data licence exists; four candidate paths returned HTTP 404.

**Permission alone would not make this source usable, which is a separate matter from whether it is allowed.** Phase 2 measured that the interface cannot enumerate its own population: a hard cap of 64 records regardless of the requested limit, `truncated: false` reported while truncating, 22 of 64 records differing between two orderings of the same query, and a rentable-filtered query returning 16 when the union proved 23 existed. The seller-reduction rule selects a minimum within a cell, and a minimum over a subset is weakly greater than the minimum over the complete set, so the error is one-sided. The participant counts driving the regional gates would rest on a universe Urdais cannot reproducibly define. **If Vast ever agrees, the enumeration question must be answered before any collector work begins.**

**No further retrieval.** The Phase 1 and Phase 2 research artifacts remain part of Urdais's research history, and this review makes no determination about prior activity. The interface's field shape may inform synthetic test fixtures. Nothing from this venue may enter a published UCPI value, and no further retrieval may occur, without a separate written agreement satisfying the current terms.

### Runpod — prohibited on both axes absent written permission

**This classification was revised on 13 September 2026.** Phase 4A recorded both axes as under review, reasoning that the Terms restrict automated access while the API documentation provides it, and that the two were in tension. That reasoning rested on a question Phase 4A had not answered: whether the Terms reach the API host at all. They do, and once that is established the apparent conflict largely dissolves rather than deepening.

**The scope definition is decisive.** The Terms of Service, Last Updated 24 March 2026, define themselves as governing *"your access to and use of the Runpod.io website and its subdomains (the "Site") as well as the services, content, and other resources available on or enabled via our Site ... (collectively, the Site and related services, including Marketplace Offerings, the "Service")"*. `api.runpod.io` is a subdomain of runpod.io. The Site prohibitions therefore reach the documented API endpoint.

With that settled, three clauses bear directly on what Urdais would do, two of which Phase 4A had not recorded.

On compilation: *"Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us."* This describes the activity precisely. Urdais's entire purpose is systematic retrieval to compile a price database.

On commercial use: *"The Site may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us."* Urdais is a commercial market-data product.

On purpose: *"You may not access or use the Site for any purpose other than that for which we make the Site available."* And separately, *"Use the Service as part of any effort to compete with us."*

**The API documentation is not in conflict with those clauses; it addresses a different activity.** The v2 overview states *"The Runpod REST API v2 provides programmatic access to all Runpod compute resources. Integrate GPU infrastructure into your applications, workflows, and automation systems"*, and describes the grant as access to *"your Runpod resources"* for creating and managing Pods, querying endpoints, provisioning storage and retrieving billing data *"without using the console"*. That is programmatic management of one's own account. It is not a licence to retrieve catalog data systematically and compile it into a third-party database, and it does not purport to be.

So the general automated-means clause is not the clause this classification rests on. Read alone it would bar using the very API Runpod provides, which cannot be the intent. The clause that governs is the specific one about systematic retrieval for compilation, and it is not ambiguous: it prohibits the activity **without written permission from us**.

Both axes are therefore recorded as **not permitted**, with `written_agreement_required` **true**, which the schema requires be accompanied by `production_blocked`. The superseded Phase 4A assessment is retained in the registry evidence so the revision itself stays auditable.

**No other governing document exists.** Separate API terms, developer terms, an acceptable-use policy and cloud terms were each checked and returned HTTP 404 on 13 September 2026, and the documentation index lists no licensing or attribution page. The Terms of Service govern.

**This makes Runpod more actionable, not less.** The obstacle is a stated prohibition with a stated remedy rather than an unresolved ambiguity, so the commercial approach is a permission request rather than a clarification question. Runpod still heads the outreach order: its clause is a generic anti-compilation term rather than one aimed at indices, its Terms contemplate written permission as the ordinary cure, and its availability data remains the strongest found anywhere. Note that REST API v1 is deprecated and retires on 15 November 2026; the endpoint recorded in the registry is the v2 path, `GET /v2/catalog/gpus` on `https://api.runpod.io`.

### Lambda — one purpose-based clause, with its own carve-out

Terms of service, Last updated August 2025. Six documents are published together; the **Cloud Terms of Service** govern the Services and the Authorized APIs.

**Scope is settled.** The Cloud Terms define *"Services"* as *"the software services and platform provided by Lambda, including (i) the web and other user interfaces, applications, and software provided to Users, **(ii) the Authorized APIs** and (iii) any modifications..."*. The restrictions therefore reach `cloud.lambda.ai/api/v1/instance-types` directly.

**Only one clause reaches Urdais, and it restricts purpose rather than activity.** The Cloud Terms provide that the customer will not *"(iv) access any portion of the Services for the purpose of building a similar or competitive product or service, or **monitor the Services for any benchmarking or competitive purpose**"*.

**A negative finding matters as much as that clause.** There is no anti-scraping provision, no prohibition on systematic retrieval, and no prohibition on compiling a collection, compilation, database or directory anywhere in Lambda's documents. The Acceptable Use Policy bars only *"web crawling which is not restricted to a rate so as not to impair or otherwise disrupt the servers being crawled"*, and the Website Terms of Use contain no automated-access language at all. Clause (ii) contemplates use *"in accordance with the Documentation"*. **Nothing independently prohibits the act of retrieval.** This distinguishes Lambda sharply from the marketplace and from Runpod, where an anti-compilation clause is the basis of the block.

The consequence is that both axes turn on one question, not two: whether Urdais's purpose is caught by clause (iv).

**Is a published price index "benchmarking" here? Genuinely arguable.** For coverage: Urdais would poll the Services on a schedule, which is monitoring; the clause says *"any"* benchmarking purpose; and Urdais's own methodology describes its output as a benchmark and is framed on the IOSCO Principles for Financial Benchmarks. Against coverage: in cloud agreements "benchmarking" conventionally means performance evaluation and the publication of comparative performance results, the clause sits among load tests, penetration tests, reverse engineering and competitive product development, and Urdais measures published prices rather than the performance or capability of Lambda's compute.

The reading leans toward coverage, mostly because it would be awkward for Urdais to argue it is not benchmarking while publishing an IOSCO-framed benchmark methodology. But it is not settled, and this review does not settle it. The conservative reading is retained: **data use stays prohibited, collection stays under review** because the act is otherwise permitted and only its purpose is in doubt.

**The clause carries its own remedy, which is why this matters less than it appears.** The prohibited-use list opens *"**Except for uses that are expressly permitted (for example, in the Documentation or in an Order)**"*, and an *"Order"* is defined as *"an order for the Services that has been accepted by Customer (if online) or otherwise mutually agreed to by the Parties"*. Lambda has written down how a prohibited use becomes permitted. That is a more concrete route than a generic reference to written permission, and it makes the interpretive question secondary: the carve-out is worth asking for whether or not the clause applies.

API access requires being a customer bound by these terms; a live unauthenticated call returned HTTP 401. The Cloud Terms designate a notice route: *"Lambda, Inc., Attn: Legal Department, 2510 Zanker Rd. San Jose, CA 95131, with a copy to legal@lambdal.com."*

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

The sources that match the per-accelerator child, carry discriminating availability and expose seller-level structure are the three whose terms stand in the way. All three are now settled prohibitions rather than open questions: the marketplace on both axes, Runpod on both axes, and Lambda on the data-use axis. Each names written permission or a written agreement as its own remedy, so each is a commercial conversation rather than a legal ambiguity.

**No source is currently production-approved for UCPI-H100-SXM, so Phase 4 remains operationally blocked.** The per-accelerator sources available are either expressly blocked for the required use or remain unresolved pending written clarification. This is not a methodology failure. The methodology already anticipated it: *"A source cannot enter production unless Urdais has a permitted and reproducible collection path"*, and the child lists that prerequisite among its launch blockers. The review has now established which sources fail it and why.

## What this does not mean

It does not mean the methodology should change. Weakening the availability minimum to admit Grade 4 catalog sources would convert UCPI into the advertised-price object the family explicitly rejected, and would do so to evade a licensing constraint rather than because the evidence changed.

It does not mean Phases 1 to 3 were wasted. The schema, the eligibility vocabulary and the lineage model are unaffected; what is missing is permission to fill them for this particular child.

It does not require discarding the existing research. The Phase 1 and Phase 2 artifacts remain part of Urdais's research history and their findings still inform the methodology. **This review does not make a determination about prior research activity**; it establishes what the current published terms say and what they mean for future collection and production use.

## Recommended paths

Three, in the order they could be pursued. Each is a decision for the owner, not for an implementation phase.

**Seek written clarification or permission, in this order.** A benchmark administrator approaching a venue for index-construction rights is an ordinary commercial conversation, and the IOSCO-informed governance already documented in the family methodology is the kind of thing such a request rests on. This is the only path that unblocks the per-accelerator child as specified. The order below reflects both how resolvable each case looks and how useful the source would be.

1. **Runpod, first. Request sent 13 September 2026, awaiting a response.** Its availability structure is the strongest found for this child, its official API documentation affirmatively supports programmatic automation for account holders, and its blocking clause is a generic anti-compilation term rather than one aimed at indices. The Terms name written permission as the ordinary remedy and contemplate commercial use that is *"specifically endorsed or approved by us"*, so this is a permission request rather than a bespoke data licence. The request, the route chosen and the evidence of sending are recorded in the Runpod Permission Request document held alongside this one. **Sending a request is not permission**: Runpod remains prohibited on both axes until written evidence says otherwise.
2. **Lambda, second. Request sent 13 September 2026, awaiting a response.** Excellent source shape, and a single endpoint that answers four of the child's requirements. The benchmark prohibition is on point, but the clause carries an express carve-out for uses permitted *"in the Documentation or in an Order"*, so there is a named contractual route rather than an open-ended ask. Lambda is also the only blocked source with **no** anti-scraping or anti-compilation clause, so only its purpose restriction stands in the way. The request, the route chosen and the evidence of sending are recorded in the Lambda Permission Request document held alongside this one. **Sending a request is not permission**: Lambda remains prohibited on data use until written evidence says otherwise.
3. **Vast.ai, third. Request drafted 13 September 2026, not yet sent.** Its terms exclude Urdais most directly of the three: a licence whose two enumerated purposes do not include market-data products, an express exclusion of *"any other commercial data product or market-information purpose"*, and a clause naming indices and benchmarks. Vast has also reserved index and data-product rights in the same data to itself, so the request asks for something the provider wants to keep. Expect a refusal and treat it as a result. Separately, the enumeration limitation Phase 2 measured means **permission alone would not make this source usable**, so a positive answer would need the enumeration question resolved before any collector work.

**Research the whole-node sibling.** Phase 2 already recommended it as future work, on product grounds. The terms review strengthens that recommendation independently: Azure and AWS have the settled collection permission, publish region-resolved prices with effective dates, and sell exactly the whole eight-accelerator product such a sibling would measure. Its data-use axis would still need confirmation, and its availability problem is unchanged, so it is not a shortcut to publication. It is the one place where permitted collection and available product currently overlap.

**Confirm the unsettled axes.** DigitalOcean, Azure and AWS all sit at under review on data use rather than at a prohibition. A short written confirmation from each would convert three sources from unsettled to decided, in whichever direction the answer falls. That is cheap and worth doing regardless of which path is chosen.

## What was built in this phase

The registry amendment, six reviewed providers, six reviewed interfaces with verbatim evidence, and one database test. **No collector code exists.** No Python package, no HTTP client, no scheduler. Scaffolding begun before the terms were read was deleted rather than left dormant, because an unusable collector in the tree invites someone to run it.

No live retrieval was made against any provider during this phase. `UrdaisDev` holds no provider observations. `pipeline.source_retrievals` and `pipeline.raw_offers` remain empty, and a test asserts it.
