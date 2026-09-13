# Vast.ai Agreement Request — Draft

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. This is a **draft for review and has not been sent.** It supports the classification recorded in the H100 Source Terms Review, where Vast is `not_permitted` on both permission axes and `production_blocked`.

## Read this before deciding whether to send it

Two things make this request different from the Runpod and Lambda ones, and both argue for going in with lower expectations.

**The clause is aimed at exactly this.** Runpod's blocking clause is a generic anti-compilation term that happens to catch Urdais. Lambda's is a purpose restriction whose ordinary meaning is arguably about performance testing. Vast's is neither. It defines the data category, grants a licence limited to two enumerated purposes, expressly excludes *"any other commercial data product or market-information purpose"*, and separately names *"index, benchmark, pricing index, price-comparison database"*. That is deliberate drafting, not boilerplate.

**Vast has reserved this for itself.** The same section states that Company *"reserves all rights it may have in the compilation and delivery of Authorized Data and in any proprietary feed, export, chart, index or other data product created by Company"*. Urdais would be asking permission to build a category of product the provider has expressly reserved. That is a commercial conflict rather than a misunderstanding, and it should be named in the request rather than discovered in the reply.

**There is still a reason to ask.** The Terms name the remedy, *"unless Company expressly agrees otherwise in a separate written agreement"*, so a route exists. A clear refusal is also a useful outcome: it closes the question, removes Vast from further outreach, and tells us something real about how this market prices its data rights.

**And a reason to weigh the answer carefully even if it is yes.** Phase 2 measured that this interface cannot enumerate its own population. Permission would not fix that. See the section below.

## The separate problem: permission would not make this source usable

This is a methodology and data-quality constraint, not a permission axis, and it is kept apart from the classification deliberately.

Phase 2 measured the interface directly. It caps responses at 64 records regardless of the requested limit; it reports `truncated: false` while doing so; two identical queries differing only in ordering returned **22 different records out of 64**; and a query filtered to return only rentable offers returned 16 while the union of all responses proved 23 existed. Per-offer content was perfectly consistent across nine responses, so this is incompleteness in the interface rather than volatility in the data.

The consequence for the child is concrete. The seller-reduction rule selects a minimum within a cell, and a minimum over a subset is weakly greater than the minimum over the complete set, so the error is one-sided and its size depends on which records the collector happened to receive. The participant counts that drive the regional gates would rest on a universe Urdais cannot reproducibly define.

**So even a granted agreement would leave an open methodology question.** If Vast responds positively, the next step is not to build a collector; it is to ask whether an enumerable interface exists, and to treat the answer as a precondition rather than a detail. The draft below asks that question directly.

## Channel

The Agreement designates one route: *"In order to resolve a complaint regarding the Company Services or to receive further information regarding use of the Company Services, please contact Company as set forth below. Vast.ai Inc. Email: contact@vast.ai"*.

Vast publishes no separate legal, partnerships or data-licensing address, and no API terms, acceptable-use policy or data licence exists as a separate document. **Recommended: `contact@vast.ai`**, with the request explicitly asking to be routed to whoever can execute a data agreement, since a general contact address is unlikely to be the right owner.

## Draft message

**Subject:** Request for a written data agreement — market-data use of marketplace pricing

Hello,

I am writing from Urdais, which builds published price indices for accelerated compute. Your Terms of Use prohibit the use I have in mind unless Company agrees otherwise in a separate written agreement, so I am writing to ask for that agreement rather than to argue about the clause. I would be grateful if you could route this to whoever handles data licensing or business development.

**What we would want to do.** Retrieve H100 marketplace offer data through your documented search interface, authenticated with an API key, on a periodic schedule: prices, GPU counts, availability, geography, host bundle and the host and machine identifiers needed to tell offers apart. We would store each response as a dated observation, normalize it alongside observations from other infrastructure providers, compute aggregate market indicators, and publish current and historical index values as a commercial market-data product. We would not rent compute, run performance benchmarks against your hardware, resell your services, or operate a competing marketplace.

**The clauses I am asking about.** Your Terms define Authorized Data to include *"pricing, availability, capacity, configuration, historical, aggregated or other market data"*, grant a licence to use it *"solely (a) to evaluate, configure and purchase Company Services for your own use and (b) to inform the pricing of your own products or services offered to third parties"*, and state that *"you may not use Authorized Data for any other commercial data product or market-information purpose"*. A further clause provides that Authorized Data may not be used as an input to *"any index, benchmark, pricing index, price-comparison database"*, *"unless Company expressly agrees otherwise in a separate written agreement"*.

I want to be direct rather than look for room in the language. Urdais is a commercial market-information product. It is not within either permitted use, and the index clause describes what we would build. We have not collected anything under these terms and will not unless you agree in writing.

I also note that you reserve your own rights in *"any proprietary feed, export, chart, index or other data product created by Company"*. If Vast intends to publish its own price data products, a third-party index may not be something you want to license at all. If that is the position, please just say so and we will record it and stop.

**What we are asking for.**

1. **Collection.** Would Vast grant written permission for Urdais to retrieve marketplace offer and pricing data through the documented API on a periodic basis, and to retain those observations historically?

2. **Index use.** Would Vast grant the separate written agreement contemplated by the index clause, permitting the retrieved data to be used as an input to derived aggregate price indices published as a commercial market-data product?

**If either is possible, the terms would matter to us.**

- Is attribution to Vast required, and in what form?
- May individual Vast prices be displayed, or only aggregates derived from them?
- May raw values be redistributed, as distinct from publishing aggregates?
- May historical raw observations be retained indefinitely? Our methodology requires retaining raw observations so a published figure stays reproducible years later, and this is the point on which we have least flexibility.
- Are there caching or storage limitations?
- Which host or machine identifying fields, if any, may be retained? We need to distinguish one seller's offers from another's, but we do not need to identify sellers publicly.
- What rate limits or usage plan should we work to, and is a paid or commercial data plan required?
- Who has authority to execute an agreement of this kind?

**One technical question, which matters regardless of the commercial answer.** In earlier research we found that the offer search interface returns at most 64 records per request regardless of the requested limit, reports no truncation while doing so, and returns different subsets when only the ordering changes. For a price index we need to be able to define a reproducible population rather than a sample. Is there an interface, plan or parameter that enumerates the full set of offers matching a filter? If there is not, that may matter more to us than the licence does, and it would be useful to know early.

**What we are not.** Urdais is not a compute reseller, broker or marketplace, and does not compete with Vast. We measure this market rather than selling into it. Our methodology is published openly, so any figure we publish can be traced to the rules that produced it, and we would be glad to share it or to agree how Vast is described.

If the answer is no, that is a complete answer and we will record it and stop.

Thank you for your time.

[Sender name]
Urdais
https://urdais.com
[Reply address, matching the sending account]

## Notes for whoever sends this

**Resolve the sender block against the actual sending account.** The Runpod request was signed with an address that did not match the account it was sent from. That is recorded in the Runpod document and should not recur.

**Expect a refusal, and treat it as a result.** Of the three per-accelerator sources this is the one whose terms most directly and deliberately exclude Urdais, and the one where the provider has reserved the same product category. A clear no closes the question.

**Do not read a positive reply as covering both axes unless it says so.** The registry requires both at `permitted`, and the two clauses here are separate: one governs retrieval, the other governs index use. A permission to call the API is not a permission to publish an index from it.

**A yes is not sufficient on its own.** The enumeration constraint is independent of permission. If Vast agrees, the enumeration question in the message needs an answer before any collector work begins.

**Terms change.** The classification rests on Version Date 1 September 2026. Record which version any agreement is granted against.
