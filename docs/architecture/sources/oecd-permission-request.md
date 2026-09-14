# OECD Permission Request — Draft, Not Sent

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026 for UBWI Phase 2A. **Draft only. Nothing has been sent.** It supports the classification recorded in [the Phase 2A source study](../../research/ubwi-phase2a-denominator-source-study.md), where the OECD SDMX service is `not_reviewed` on both axes and `production_review_pending`.

## Outreach record

| Field | Value |
|---|---|
| Status | **Drafted, not sent** |
| Date drafted | 14 September 2026 |
| Channel | To be decided — see below |
| Recipient | Not yet identified |
| Provider reference ID | None |
| Response | None; nothing sent |

## Why this is the one outreach target worth drafting

Phase 2A assessed five candidate denominator sources. Four of them need a **retrieval**, not a request: the Federal Reserve, Destatis and Eurostat all plausibly publish terms that Urdais has simply failed to read, and asking an organisation for permission it may already have granted in writing is a slow way to get an answer the web would give faster.

The OECD is different, for one reason: **its terms page cannot be reached from this environment at all**, and that has now been true across two research phases.

`https://www.oecd.org/en/about/terms-conditions.html` returned **HTTP 403** to `curl` with a full browser user-agent and accept headers on 14 September 2026, and **HTTP 403** through WebFetch on the same day. Phase 1 recorded the same status on 13–14 September 2026. Cached copies from this session's retrieval attempts are Cloudflare interstitials — `<title>Just a moment...</title>` — rather than terms. Meanwhile `sdmx.oecd.org/public/rest/` answers HTTP 200 to every structure, availability and data query put to it, unauthenticated.

So the OECD presents the exact asymmetry Urdais's two-axis review was built to surface: **the data is trivially collectible and the permission is unreadable.** Urdais does not infer permission from a dataset being public, so the interface sits at `not_reviewed` on both axes and cannot be production-approved, even though nothing suggests the OECD objects to what Urdais would do.

## What a grant would unlock

The OECD SDMX service is the harmonised route to **nine of the twelve economies** in the Phase 2A candidate denominator — Japan, France, the United Kingdom, Korea, Canada, Mexico, Russia, Sweden and Czechia — through two dataflows, in one query language, with one retrieval path. Reading them from nine national compilers instead means nine interfaces, nine formats, nine languages and nine separate terms reviews.

It is worth being precise about what a grant would **not** do, because the request should not overstate its own importance. The OECD publishes a total non-financial asset stock for the total economy for only ten reference areas, and land for seventeen. Those nine economies are about 19 % of world GDP. **The OECD is a convenience layer over a coverage problem it does not solve**, and the request should say so rather than imply that OECD data would make UBWI publishable.

## Channel

Undetermined, and this is the first thing to settle before sending.

The obvious route — the terms and conditions page — is the page that cannot be loaded. The OECD publishes a general enquiries route and a statistics-specific contact, and the OECD Data Explorer carries its own feedback mechanism. **None of these has been verified as reachable from this environment**, and no contact address has been retrieved. Identifying a live, correct recipient is a prerequisite, not a detail: the Runpod and Lambda requests both turned on reaching the right owner, and one of them was nearly sent with a mismatched sender block.

**Recommended before sending:** confirm the current terms page from an environment that is not Cloudflare-gated. If the licence turns out to be an open grant that already covers this use, the request is unnecessary and should not be sent at all. That is the likeliest outcome and it is the reason this draft exists rather than a sent message.

## What is being asked for

Two things, which Urdais's review treats separately and so does the draft.

1. **Retrieval.** May Urdais periodically retrieve national accounts balance-sheet data through the public SDMX REST service?
2. **Use in a published index.** May Urdais use that data as one input to a derived aggregate published as a commercial market-data product?

And, before either, a third question that may make both moot: **what terms actually apply?**

---

## Draft message

**Subject:** Terms applying to OECD statistical data retrieved through the public SDMX service

Hello,

I am writing from Urdais, which publishes economic indices with openly documented methodologies. I would like to establish what terms apply to OECD statistical data before we use any of it, and to describe precisely what we would be doing so that you can judge it accurately.

**First, a practical problem.** We have not been able to read your terms and conditions. Requests to `https://www.oecd.org/en/about/terms-conditions.html` return HTTP 403 from our environment, both through a scripted request with ordinary browser headers and through a fetch service, and the responses we do receive are bot-protection interstitials rather than the page itself. We have seen this consistently over several days. It is entirely possible that the licence you publish already permits what we want to do, and that our only problem is that we cannot see it. If that is the case, a link we can reach — or the licence text in a reply — would resolve this completely and you can ignore the rest of this message.

**What we would do.** We would call the public SDMX REST service at `sdmx.oecd.org` on a periodic schedule, no more than a handful of read-only requests per day. Specifically we would read two dataflows: `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE9B` for balance sheets of non-financial assets, and `OECD.SDD.NAD,DSD_NASEC20@DF_T720R_A` for financial balance sheets. We would read total-economy aggregates — total non-financial assets and net financial worth vis-à-vis the rest of the world — for the reference areas that report them. We would retain each response as a dated observation so that any figure we publish can be traced to the retrieval that produced it.

**What we would do with it.** We are building a measure of total global wealth, defined as consolidated world net worth on the national-accounts identity: non-financial assets plus net claims on the rest of the world, summed across economies, excluding human capital. We would combine OECD data with national-compiler data for economies the OECD does not cover, convert to United States dollars, and publish the aggregate and a small number of indices derived from it as a commercial market-data product. OECD figures would be one input among several to an aggregate. We would not republish your data as a feed, and we would not offer a substitute for the OECD Data Explorer.

Our methodology is published openly, so any number we publish can be checked against the rules that produced it, and we carry source attribution on every published surface as a matter of course.

**What we are asking.**

1. What terms govern data retrieved through the public SDMX REST service, and where can we read them?
2. If those terms do not already cover it: may Urdais retrieve this data automatically on a schedule for the purpose described?
3. If those terms do not already cover it: may Urdais use the data as an input to derived aggregate indices published as a commercial product?

**Practical questions, whatever the answers to those.**

- What attribution form do you require, and where must it appear?
- May individual country values be displayed, or should only derived aggregates be published?
- Are there restrictions on caching or retaining API responses?
- Is there a rate or scheduling convention you would prefer we follow?
- Is there a better contact for this than the address I have used, and would you like me to redirect it?

I would rather ask before retrieving anything for production than explain afterwards. If the answer to any of this is no, that is a useful answer and we will act on it.

With thanks,

Bryceson Jones
Urdais — https://urdais.com

---

## What this does not change

Sending a request is not permission, and this request has not been sent. The OECD SDMX interface remains `not_reviewed` on both axes, `production_review_pending`, with `written_agreement_required` undetermined. The registry is deliberately not modified by this draft.

Be alert to two ways a reply could be misread. A reply confirming that the API is public and free to use answers the retrieval question and **not** the index-construction question, and the two have diverged for every commercial source Urdais has reviewed. And a pointer to a licence page is only an answer if Urdais can actually load it.
