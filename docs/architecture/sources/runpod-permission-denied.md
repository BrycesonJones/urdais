# Runpod Permission Denied — 14 September 2026

**Status: internal source-rights artifact. Not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026. This document preserves Runpod's written refusal of the permission request Urdais sent on 13 September 2026. It is evidence, not analysis: the decision text below is reproduced exactly as received and is not summarized anywhere that the summary could be mistaken for the decision.

## Outcome

| Field | Value |
|---|---|
| Provider | Runpod, Inc. |
| Source interface | `runpod-gpu-types` (`GET /v2/catalog/gpus` on `https://api.runpod.io`) |
| Permission status | **Denied** |
| Requested | 13 September 2026, 15:05 UTC |
| Decided | 14 September 2026, 13:27 UTC |
| Decided by | Avtar, Runpod Support Team, on referral to "the relevant teams internally" |
| Channel | Email, `help@runpod.io` to `bryceson.jones17@gmail.com`, `legal@runpod.io` copied |
| Thread | `1a09b4ce294d8be3` |
| Decision message | `1a0a01a2456e600d` |
| Provider reference | `MM1GD7-PVV4K` (Zendesk) |
| Automated or systematic retrieval | **Not permitted** for Urdais's intended use |
| Use in a commercial market-data product | **Not permitted** |
| Production ingestion | **Prohibited** |

## The decision, verbatim

The operative paragraph of the message received 14 September 2026 at 13:27 UTC:

> After reviewing your request, we're unable to grant the permissions you've requested. We aren't approving the systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, nor the use of that data as an input to a commercial market-data product.

The full message, with its courtesies, read:

> Hi Bryceson,
>
> Thank you for your patience, and our apologies for the delay in coming back to you.
>
> After reviewing your request, we're unable to grant the permissions you've requested. We aren't approving the systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, nor the use of that data as an input to a commercial market-data product.
>
> We understand that it isn't the answer you were hoping for, and we're grateful that you approached it the way you did setting the request out against the specific clauses and holding off on any retrieval until you had a response. That made it straightforward to consider.
>
> Thank you for your interest in Runpod, and we wish you well with the project.
>
> Thanks & Regards,
> Avtar
> Runpod Support Team

An interim acknowledgement arrived earlier the same day, 14 September 2026 at 11:26 UTC (message `1a09faafb3fa5faf`), confirming the request had been shared with internal teams for review. It decided nothing.

## What was refused

The request asked two separate questions, against the two clauses that reserve them. Both were refused, and the refusal tracks the request closely enough that neither can be read narrowly.

1. **Systematic retrieval.** Written permission to retrieve GPU catalog, pricing and availability data from the documented API on a periodic basis, for the purpose of compiling a database. Refused.
2. **Derived commercial use.** Approval to use the retrieved data as an input to derived aggregate indices published as a commercial market-data product. Refused.

The refusal is addressed to the *use*, not to the mechanism. It does not object to a rate, an endpoint, an authentication method or a call volume, and it offers no alternative arrangement. Nothing in it is conditional.

## What this forecloses

Because the decision is about the intended use, none of the following is a route around it, and none may be attempted:

- changing the retrieval method, or the schedule, or the volume;
- reading a different Runpod endpoint, host, or surface, including the public pricing page or the GraphQL interface;
- using cached, archived or previously retrieved copies;
- obtaining the same Runpod values through a third party, including an aggregator that carries them;
- re-asking a narrower version of the same question without an actual material change in intended use.

Reopening requires a materially different intended use and a fresh written approval from Runpod.

## Standing question for the compute indices

Urdais does not retrieve from Runpod and never has. It does, however, receive Runpod's prices indirectly: the licensed Price of Compute feed carries a `runpod` seller row, and that row was an eligible constituent of the UCPI-H100-SXM-LISTED candidate calculated on 14 September 2026, along with the listed candidates for H200, B200, A100 SXM4 and RTX 5090.

Excluding that row is not a mechanical consequence of this denial, because Urdais's relationship is with Price of Compute, whose own terms grant both axes, and Price of Compute collected the data independently. It is also not obviously permitted, because the fourth bullet above says plainly that routing through a third party is not a cure, and the denial names the use rather than the source.

**This document does not decide it.** Deciding it changes which sellers are eligible under a methodology version, which is a methodology decision and not a records update. The effect is recorded here so the decision is taken deliberately rather than by default:

| UCPI-H100-SXM-LISTED, 14 September 2026 | N | Candidate |
|---|---|---|
| 0.1.1-draft as calculated, with `runpod` at 3.49 | 4 | 3.74 |
| Same set with `runpod` removed | 3 | 3.99 |

Nothing has been published from either set. The draft methodology versions forbid publication, and the calculation run for 14 September 2026 cannot be recorded before the 15 September cutoff.

## Related records

- `docs/architecture/sources/runpod-permission-request.md` — the request, and why that channel
- `docs/architecture/sources/terms-review.md` — the two-axis classification
- `docs/architecture/sources/runpod-launch-readiness.md` — source evidence gathered before the refusal, retained as provenance
- `supabase/migrations/20260914050000_runpod_permission_denied.sql` — the registry record
