# Runpod Permission Request — Draft

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. This is a **draft for review and has not been sent.** It supports the classification recorded in the H100 Source Terms Review, where Runpod is `not_permitted` on both permission axes pending written permission.

## Why a request rather than a clarification

The Terms of Service resolve the question rather than leaving it open. They define the Site as *"the Runpod.io website and its subdomains"*, which reaches `api.runpod.io`, and they prohibit *"Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory **without written permission from us**"*. They further provide that the Site *"may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us"*.

Both clauses name their own remedy. The ask is therefore for permission and approval, not for an interpretation. Asking Runpod to interpret its own terms would invite an answer that binds nobody; asking for written permission produces something the registry can record.

## Channel

The Terms direct questions about use of the Service to Runpod, Inc., 329 Bryant St #4D, San Francisco, CA 94107. The published email address is obfuscated in the page source and was not captured, so the address should be taken from the live page or the site's Contact Sales channel before sending. A commercial or partnerships contact is the right first recipient, since the request concerns approved commercial use rather than support.

## Draft message

**Subject:** Request for written permission — automated catalog retrieval and derived index use

Hello,

I am writing from Urdais, a market-data company building published price indices for accelerated compute. I would like to request written permission under two clauses of your Terms of Service before we do anything, and to give you a complete picture of what we would be doing.

**What we would do.** We would call your documented REST API endpoint `GET /v2/catalog/gpus` on `api.runpod.io`, authenticated with a Runpod API key, on a periodic schedule. We would retrieve GPU catalog information: GPU types, pricing, and the per-datacenter availability returned with `include=AVAILABILITY`. We would not create pods, provision storage, or place any load on compute resources. We anticipate a small number of read-only calls per day, and we would work to whatever rate or usage plan you prefer.

**What we would do with it.** We would store each response as a dated observation, normalize it alongside comparable observations from other infrastructure providers, and compute aggregate market indicators from the combined set. We would publish current and historical index values as a commercial market-data product. Individual Runpod prices would be inputs to an aggregate, not a republished price feed, and our methodology is published openly so that any figure can be traced to the rules that produced it.

**The two permissions we are asking for.** Your Terms address these separately and so do we.

1. **Automated retrieval.** Your Terms provide that a user may not *"Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us"*, and define the Site to include Runpod.io subdomains. May Urdais have written permission to retrieve GPU catalog, pricing and availability data from the documented API on a periodic basis for this purpose?

2. **Use in a derived commercial index.** Your Terms also provide that the Site *"may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us"*. May Urdais have your approval to use the retrieved data as an input to derived aggregate indices published as a commercial market-data product?

**Practical questions, whatever the answer to the above.**

- Is attribution to Runpod required, and if so in what form and placement?
- Are there restrictions on redistributing raw values, as distinct from publishing aggregates derived from them?
- Are there limits on caching or storing responses?
- Are there limits on how long we may retain historical observations? Our methodology requires retaining raw observations so that a published figure remains reproducible years later.
- What rate limits or usage plan should we work to, and is there a plan you would prefer us to be on?
- Does any of this require a separate written agreement rather than an email confirmation, and if so who should we speak to?

**A note on what we are not.** We are not a compute reseller or broker, and we do not compete with Runpod. Urdais measures this market; it does not sell into it. We would be glad to share our published methodology, to agree how Runpod is described, or to structure this under whatever terms you prefer.

We will not begin any automated retrieval unless and until you tell us it is permitted. If the answer is no, that is a complete answer and we will record Runpod as unavailable to us and stop there.

Thank you for your time.

[Name]
[Role], Urdais
[Contact]

## Notes for whoever sends this

**Do not begin collection on a verbal or implied yes.** The registry requires `terms_review_state` and `data_use_terms_state` both at `permitted` before a source can reach `production_approved`, and the evidence column expects a document with a date. An email granting permission is sufficient; an encouraging conversation is not.

**Record whatever comes back, including a refusal.** A clear no is a useful result and should be recorded with the same care as a yes, because it closes the question and removes Runpod from future outreach.

**If permission is granted only in part**, record it as it stands. The two axes exist precisely so that a permission covering retrieval but not index use can be stored accurately rather than rounded up.

**Terms change.** The classification records a Version Date of 24 March 2026. If permission is granted, the registry should also note which version of the Terms it was granted against.
