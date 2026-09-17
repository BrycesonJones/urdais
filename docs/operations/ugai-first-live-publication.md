# UGAI — first live publication runbook

**Status: not executed. UGAI has never published an observation and its base date is unset.**

This is the ordered checklist that takes UGAI from built to live. It is deliberately a checklist
rather than a script: several steps are decisions that need a person, and the ones that are
mechanical are already enforced by the database, which will refuse the step rather than let it be
skipped. Nothing below should be run to "finish" the implementation — technical completion is not
economic launch, and publishing a level nobody could reproduce would be worse than publishing
nothing.

The base level is 1,000.00 and the base date is the date of the first live published observation.
There is no earlier start date to choose and no history to reconstruct into: live history begins
where live publication begins.

## Before anything else — the decisions

These are not engineering tasks and none can be resolved by writing code.

1. **Approve the issuer cap `c`.** It is a draft parameter with no effective date. A production
   snapshot cannot name a draft cap, and the trigger enforces that.
2. **Approve the reconstitution calendar.** The methodology proposes quarterly reviews in March,
   June, September and December and states the exact dates are unresolved. Without them there is
   no scheduled as-of date to form a snapshot against.
3. **Approve the FX fixing convention.** The methodology names a 16:00 London closing spot fixing
   as the convention the researched providers use and leaves the source, time and fallback rules
   unresolved. Until one is approved, no rule says which daily rate a calculation takes.
4. **Approve the stale-input tolerance.** The methodology defines a stale observation and says an
   observation publishes as delayed when stale inputs exceed a tolerance by count and by weight,
   and states that the tolerance is unresolved. Without it the public surface cannot call a level
   delayed, and will not invent a threshold.
5. **Approve the investability minima**, or accept that investability evaluation stays
   development-only.

## Then — the licences

6. **A US end-of-day price source.** Both currently eligible issuers list on Nasdaq, whose terms
   grant a personal, non-commercial licence only and refuse storage, derivative works and products
   based on the content. The remedy is a written exchange data agreement; there is no public URL
   that solves it.
7. **A free-float input.** No public source publishes a free-float factor for the US, Taiwan, Hong
   Kong or Korea. The options are a licensed factor, or a methodology amendment authorising a
   derivation from partial holdings data with its error characterised. Substituting full market
   capitalization is not among them, and the schema makes it unrepresentable.

## Then — the data, in order

Each step is checkable and each one blocks the next.

8. **Thematic eligibility effective** for the intended members. Two issuers are eligible today on
   human-verified filing evidence; twenty-seven candidates are unreviewed, and every admission
   needs a named human to confirm its cited passages.
9. **Representative securities resolved**, with their availability constraints recorded.
10. **Current prices present** for every representative security, from a rights-cleared source.
11. **Outstanding share counts present.** Not issued, not authorized, not a weighted average — the
    methodology values `N` as outstanding, and the valuation gate refuses anything else.
12. **Free-float factors established** for every constituent. `float_state` must be `established`;
    `unknown` and `unavailable` supply no factor and the gate refuses them.
13. **FX resolving** into USD for every price currency, under the approved convention from step 3.
14. **Investability evaluated** against approved parameters, with a production purpose.
15. **A production-eligible universe snapshot**, which requires all of the above plus an approved
    cap in force on its as-of date.
16. **Cap feasibility**: `n × c ≥ 1` on both the eligible and the weightable issuer counts. At a
    10% cap that needs at least ten of each. Two eligible issuers is nowhere near it, and the
    methodology's instruction where it fails is to withhold the snapshot and publish the reason —
    never to relax the cap, add ineligible companies, or fall back to equal weights.

## Then — initialization

17. **Set index shares** from the snapshot's base weights at the implementation close:
    `q_i = w_i × MV_s / (P_i,s × X_i,s)`.
18. **Initialize the base divisor**: `D_base = MV_base / 1000`. This is the moment the index
    acquires a divisor, and it requires a production-eligible snapshot.
19. **Calculate**, and confirm the level reproduces as `MV / D` — the trigger checks it.
20. **All nine publication checks pass.** Production snapshot, divisor, constituent inputs,
    unresolved actions, parameters, source rights, attribution, lineage, stale tolerance.
21. **Publish the first level at 1,000.00.** The base date is that day, and it is set by this act
    rather than chosen.

## Only then — the scheduler

22. **Enable the daily job.** It does not exist yet, deliberately: a cron that fails every day is
    an alarm nobody reads within a week, and the conditions above are not close to met. The
    calculation path is callable, and wiring a schedule to it is the last step rather than a
    prerequisite.

## What is already enforced

Steps 15, 16, 18, 19 and 21 cannot be performed out of order or on incomplete inputs — the
database refuses them. That is deliberate: a runbook that relies on the operator remembering is a
runbook that eventually gets it wrong at the worst moment.
