# Lambda Permission Request — Sent 13 September 2026

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026. **Sent 13 September 2026; awaiting a response.** It supports the classification recorded in the H100 Source Terms Review, where Lambda is `under_review` on collection, `not_permitted` on data use, and `production_blocked`.

## Outreach record

| Field | Value |
|---|---|
| Status | **Sent, awaiting response** |
| Date sent | 13 September 2026, 15:24 UTC |
| Channel | Email |
| To | `legal@lambdal.com` |
| Copied | None |
| Recipient team | Not individually identified. The Cloud Terms of Service designate this address for notices, alongside *"Lambda, Inc., Attn: Legal Department, 2510 Zanker Rd. San Jose, CA 95131"*. The message offers to be redirected if a commercial team is the better owner. |
| Subject | Request for written permission under the Cloud Terms — market-data use of published instance pricing |
| Sender | Bryceson Jones, Urdais, https://urdais.com |
| Sending account | `bryceson.jones17@gmail.com` |
| Signature address | `bryceson.jones17@gmail.com` — **matches the sending account** |
| Provider reference ID | None issued |
| Message identifier | Gmail message and thread `1a09b5dfdba9b13d` |
| Response as at this writing | None received |

**Sender block resolved correctly.** The Runpod request was signed with an address that did not match the account it was sent from. That was checked before sending here, and the signature carries the actual sending account.

**Why this route.** Lambda publishes no partnerships or data-licensing address. Support at `lambda.ai/support` is the wrong route for a contractual question, and the sales route at `lambda.ai/talk-to-an-engineer` would reach people who cannot vary the agreement. The Cloud Terms name a notice address, and that is what a request to permit something the agreement otherwise restricts should use.

**One addition to the reviewed draft.** The sent message opens by saying why this address was chosen and offering to be redirected to a commercial owner. Nothing in the legal or commercial substance was changed.

**What this does not change.** Sending a request is not permission. Lambda remains `under_review` on collection, `not_permitted` on data use, `production_blocked`, with `written_agreement_required` true. The registry was deliberately not modified by this outreach. Be alert that a reply confirming the API is available to customers answers the wrong question: API availability is not the carve-out, because clause (iv) restricts the purpose rather than the access.

---

## Original draft, as prepared and reviewed

## What is being asked for, and why it is asked this way

Lambda's Cloud Terms of Service restrict the customer from monitoring the Services for any benchmarking purpose. Unusually among the sources reviewed, that restriction **carries its own express carve-out**: the list of prohibited uses opens *"Except for uses that are expressly permitted (for example, in the Documentation or in an Order)"*, and an Order is a defined instrument, *"an order for the Services that has been accepted by Customer (if online) or otherwise mutually agreed to by the Parties"*.

So Lambda has already written down how a prohibited use becomes a permitted one. The request asks for that, specifically, rather than asking Lambda to interpret its own terms.

There is a second reason to ask rather than interpret. Whether a published price index is "benchmarking" in the sense this clause means is genuinely arguable, and the request should not pretend otherwise in either direction. Asking Lambda to confirm the position, and to grant the carve-out if the clause does apply, gets a usable answer whichever way Lambda reads it.

## Channel

The Cloud Terms designate a notice route: *"Notices to Lambda shall be addressed to: Lambda, Inc., Attn: Legal Department, 2510 Zanker Rd. San Jose, CA 95131, with a copy to legal@lambdal.com."* That address is published in the agreement itself and is the right recipient for a request to vary what the agreement permits.

Lambda's contact page offers a sales route at `lambda.ai/talk-to-an-engineer` and technical support at `lambda.ai/support`, and publishes no partnerships or data-licensing address. Support is the wrong route for a contractual question. Sales is a reasonable parallel route if a commercial conversation is wanted alongside the legal one, since an Order is a commercial instrument.

**Recommended: `legal@lambdal.com`, the address the Cloud Terms designate.** A parallel note through the sales route is optional and would be about the Order rather than the interpretation.

## Draft message, as sent

The message below was sent on 13 September 2026 with the sender block resolved as recorded above.

**Subject:** Request for written permission under the Cloud Terms — market-data use of published instance pricing

Hello,

I am writing from Urdais, which builds published price indices for accelerated compute. I would like to ask for written permission under your Cloud Terms of Service before we do anything, and to describe precisely what we would be doing so that you can judge it accurately.

**What we would do.** We would call your documented endpoint `GET /api/v1/instance-types` on `cloud.lambda.ai`, authenticated with an API key as a Lambda customer, on a periodic schedule. We would read instance-type information: names and descriptions, price per hour, GPU count, host specifications, and the list of regions with capacity available. We would not create instances, run workloads, or place load on any compute resource. We anticipate a small number of read-only calls per day and would work to whatever rate or plan you prefer.

**What we would do with it.** We would store each response as a dated observation, normalize it alongside comparable observations from other infrastructure providers, and compute aggregate market indicators from the combined set. We would publish current and historical index values as a commercial market-data product. Lambda's prices would be one input among several to an aggregate, not a republished feed of your API. Our methodology is published openly, so any figure we publish can be traced back to the rules that produced it.

**The clause we are asking about.** Your Cloud Terms provide that, *"Except for uses that are expressly permitted (for example, in the Documentation or in an Order), Customer will not: ... (iv) access any portion of the Services for the purpose of building a similar or competitive product or service, or monitor the Services for any benchmarking or competitive purpose"*, and define Services to include the Authorized APIs.

We want to be straightforward about this rather than argue our way around it. We do not know whether you read "benchmarking" in that clause as covering a published price index. Our reading is that the clause is most naturally aimed at performance evaluation of your compute and at competitive product development, neither of which describes us: we do not measure the performance of Lambda instances, and we do not sell compute. But we recognise the language is broad, that we would be polling the Services on a schedule, and that what we publish is described in our own methodology as a benchmark. So we are not going to assume the clause does not apply.

**What we are asking for.** Two things, which your terms treat separately and so do we.

1. **Retrieval.** May Urdais periodically retrieve and retain instance-type, pricing and regional-availability information through the documented API, as a customer, for the market-data purpose described above?

2. **Use in a published index.** May Urdais use that information as an input to derived aggregate price indices published as a commercial market-data product? If clause (iv) does apply to this use, we are asking for the express permission the clause itself contemplates, whether through an Order or another instrument you prefer.

**Practical questions, whatever the answer to those.**

- Is attribution to Lambda required, and if so in what form?
- May individual Lambda prices be displayed, or should only aggregates derived from them be published?
- Are there restrictions on redistributing raw values as distinct from publishing aggregates?
- Are there limits on caching or storing API responses?
- Are there limits on how long we may retain historical observations? Our methodology requires retaining raw observations so a published figure stays reproducible years later, which is the part of this we have least flexibility on.
- What rate limits or plan should we work to, and is a paid or commercial API plan required?
- Does this require an Order or separate agreement rather than an email confirmation, and who has authority to grant it?

**What we are not.** We are not a cloud provider, a reseller or a broker, and we are not building a product that competes with Lambda. Urdais measures this market rather than selling into it. We would be glad to share our published methodology, to agree how Lambda is described, or to structure this however you prefer.

We will not begin any automated retrieval unless and until you tell us it is permitted. If the answer is no, that is a complete answer and we will record Lambda as unavailable to us and stop there.

Thank you for your time.

[Sender name]
Urdais
https://urdais.com
[Reply address]

## Notes for whoever sends this

**Resolve the sender block before sending.** The signature must carry the address the message is actually sent from. A mismatch between the signature and the sending account was introduced in the Runpod request and is recorded in that document; do not repeat it here.

**Do not begin collection on anything less than the grant.** The registry requires both axes at `permitted` before a source reaches `production_approved`. For Lambda specifically, be alert that a helpful sales reply saying the API is available to customers answers the wrong question: API availability is not the carve-out, and clause (iv) restricts the purpose rather than the access.

**An Order is a commercial instrument.** If Lambda's answer is that the use needs an Order, that is a positive answer, not a refusal. It means a commercial conversation, and it may carry a price.

**Record whatever comes back, including a refusal.** A clear no closes the question and removes Lambda from further outreach, which is worth as much as a yes.

**Terms change.** The classification rests on the version Last updated August 2025. If permission is granted, record which version it was granted against.
