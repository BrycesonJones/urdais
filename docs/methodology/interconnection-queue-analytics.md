# Urdais Interconnection Queue Analytics — 0.1.0-draft

**Status: proposed methodology, version 0.1.0-draft.** Prepared 21 September 2026 against the canonical evidence base built by IQ-2 through IQ-4. No production value, public metric or chart is established by this document. Nothing here is approved for publication, and the version is deliberately a draft because several metric gates remain open.

This document follows the principles of the [Urdais methodology framework](/docs/methodology). It defines which interconnection queue analytics are defensible, for which markets, from which fields — and, at least as importantly, which are not.

## What the evidence actually supports

Every decision below was made against the seven ingested datasets, not against a desired chart. The single most important measurement is this one:

| Quantity kind | Markets publishing it | Publishable markets |
| --- | --- | --- |
| `summer_mw` / `winter_mw` | ISO-NE, MISO, NYISO, SPP | 3 |
| `maximum_facility_output` | ERCOT, PJM, SPP | 2 |
| `energy_service_mw` | MISO, PJM, SPP | 2 |
| `capacity_service_mw` | MISO, PJM, SPP | 2 |
| `net_mw_to_grid` | CAISO, ISO-NE | 2 |
| `in_service_mw` | PJM | 1 |
| `component_mw` | CAISO | 1 |

**No quantity kind exists in all seven markets.** The best-covered pair reaches four markets, and one of those four cannot be published at all. That single fact decides the shape of this methodology.

## 1. The active lifecycle

A request is **active** when its latest observation is in one of:

`requested` · `study` · `agreement_pending` · `agreement_executed` · `under_construction`

A request is **terminal** when its latest observation is `operational` or `withdrawn`.

Two stages are deliberately neither.

**`suspended` is active.** PJM publishes 140 suspended requests and suspension is routinely lifted; a suspended project has not left the queue. It is included in stock and flagged, never silently.

**`unknown` is excluded from every published metric**, and is not counted as active. IQ-2 made `unknown` non-terminal so that a vocabulary gap could not silently *shrink* a queue; that was correct for storage. For publication the opposite risk applies — counting a request whose state nobody knows would silently *inflate* a queue — so `unknown` is reported as an explicit coverage figure beside any stock metric rather than folded into it. MISO's 74 `Done`-with-no-outcome requests and ERCOT's small-generator sheet are the live cases.

`agreement_executed` and `under_construction` are **active, not complete**. PJM and MISO both publish projects that hold an executed agreement for years, and construction is not operation.

## 2. Request subtype eligibility

| Subtype | New-generation stock | Notes |
| --- | --- | --- |
| `new_generation` | **eligible** | |
| `not_distinguished` | **eligible** | Six markets publish one undifferentiated queue |
| `capacity_rights` | **excluded** | ISO-NE CNR/CNI |
| `elective_transmission_upgrade` | excluded | Separate metric if ever wanted |
| `transmission_service` | excluded | |
| `unknown` | excluded | |

**Hard rule: capacity-rights activity is never new-generation queue capacity.** ISO-NE's 662 capacity-rights requests carry 171,358 MW of summer capability against 50,260 MW on requests that actually propose new plant. Including them overstates the New England queue by 4.4×. The database already refuses to put a new-generation quantity on such a request; this methodology adds that no metric may reintroduce them by reading `other_mw`.

## 3. Project counts

The unit is the **canonical stable request** — one row of `pipeline.interconnection_requests` — never a raw row, a source row or a queue position.

ISO-NE's queue position is not unique: 92 positions carry more than one row and no column makes them unique. Those 242 rows are retained as evidence and **excluded from project counts**, reported as excluded evidence rather than as projects. MISO contributes one such collision and NYISO two.

A project with several resources is **one project**. CAISO has 500 such, PJM 578, MISO 336, ISO-NE 157.

## 4. MW: no seven-market total

**There is no defensible seven-market `active_queue_mw`, and none may be published.** The reasons are not stylistic:

- PJM publishes four MW columns aggregating to 1,628 GW, 883 GW, 638 GW and 91 GW. Choosing one is a methodology decision, not a reading.
- SPP publishes six spanning 4.2×, and cannot be published at all.
- CAISO's component MW are non-additive: 937 observations have components summing above the project figure.
- ERCOT's single column is a **net-change basis for repowering**, carries negative values, and is therefore *not* semantically the same quantity as PJM's `MaximumFacilityOutput` even though both normalize to `maximum_facility_output`. A shared quantity kind groups; it does not certify equivalence.
- ISO-NE requires the capacity-rights exclusion before any MW is meaningful.
- NYISO's load MW is a withdrawal from the grid and belongs to a different metric family entirely.

What replaces it: **market-specific MW, each naming its field**, and **project counts** as the cross-market comparable.

### Market MW decisions

| Market | Field for a market-specific active MW | Status |
| --- | --- | --- |
| PJM | `MWEnergy` (`energy_service_mw`) | **deferred** — see below |
| MISO | `summerNetMW` (`summer_mw`) | approved, market-specific |
| CAISO | `Net MWs to Grid` (`net_mw_to_grid`) | approved, market-specific |
| ERCOT | `Capacity (MW)` (net-change basis) | **deferred** — semantics differ from every other market |
| NYISO | `SP (MW)` (`summer_mw`) | approved, market-specific |
| ISO-NE | `Summer MW`, new-capability requests only | approved, market-specific |
| SPP | `MAX Summer MW` | internal only |

PJM is deferred deliberately. `MWEnergy` and `MWCapacity` are two different service rights and `MaximumFacilityOutput` is neither; nothing in the source says which one a reader means by "the queue". Choosing the largest because it is largest is exactly the error this methodology exists to prevent. IQ-6 must not resolve this by picking one — it needs a stated reason, and 0.1.0-draft does not have one.

ERCOT is deferred because a net change is not a level. A repowering that reduces output by 53.3 MW is a real published value and summing it with additions produces a number that is neither the queue nor the change in it.

## 5. Generation and load never mix

Two separate metric families, permanently.

**Generation and storage queue**: request classes `generation`, `storage`, `mixed`.
**Load interconnection queue**: request class `load`.

A load MW is a withdrawal from the grid. It may never enter a generation total, in any market, now or when other markets begin publishing load queues. NYISO is currently the only market that publishes one.

## 6. AI and data-centre load

`explicit_ai_data_center_load_requests` and `explicit_ai_data_center_load_mw`, **NYISO only**, market-specific.

Derived **only** from the publisher's own end-use code. NYISO assigns `DAT-AI` to 12 requests and `DAT`/`DAT-CM` to 28 more. No inference is permitted from project names, company names, location, size or any model. If a market does not publish an end-use classification, its AI data-centre load is **not zero — it is unknown**, and must be presented that way.

## 7. Queue age

`observation_date − requested_on`, on active new-capability generation/storage requests with a published request date.

Published as **median, p75 and p90**. The distribution is skewed — CAISO's p90 is 15.5 years against a 6.5-year median — so a mean would be misleading and is not published.

| Market | n | Median | p75 | p90 |
| --- | --- | --- | --- | --- |
| PJM | 2,641 | 5.07 | 5.97 | 6.99 |
| MISO | 1,336 | 4.02 | 5.09 | 7.40 |
| SPP | 536 | 2.97 | 6.41 | 8.81 |
| CAISO | 261 | 6.47 | 9.40 | 15.48 |
| NYISO | 184 | 2.14 | 7.28 | 8.62 |
| ISO-NE | 28 | 5.64 | 7.06 | 8.25 |
| **ERCOT** | **0** | — | — | — |

**ERCOT is excluded: it publishes no request date at all** — 0 of 3,325 requests. This is not a coverage gap to be filled; the GIS report does not contain the field.

ISO-NE's 28 active requests fall below the percentile sample floor in §12; its median is publishable, its p90 is not.

## 8. Entries: two bases, never mixed

**Source-reported application date** — the request date the publisher states. Available for PJM, MISO, CAISO, NYISO, ISO-NE and SPP.

**Snapshot first-seen** — the first published vintage in which Urdais observed the request. Available for ERCOT alone, which is the only market with a published archive.

These are different measurements and must be labelled as such. Source-reported takes precedence wherever it exists. ERCOT uses first-seen, with two constraints: the series begins **2019-01**, and the 366 requests already present in the December 2018 report are **left-censored** and excluded from entry counts. 2,959 of 3,325 ERCOT requests have a usable first-seen entry.

Source-reported history is not observed history. Today's PJM feed saying a project withdrew in 2019 is PJM's statement, not evidence that Urdais watched it happen.

## 9. Exits

Three distinct things, never conflated:

**Source-reported withdrawal** — the publisher says withdrawn. PJM 4,921, MISO 2,152, ISO-NE 1,170, NYISO 1,749, CAISO 1,764.

**Source-reported operation** — the publisher says in service. PJM 1,259, ISO-NE 280, SPP 336, CAISO 252, NYISO 153, MISO 92.

**Observed disappearance** — a request stops appearing in a later vintage. **This is not an exit.** It is not a withdrawal, not a cancellation and not an operation. ERCOT is the only market where disappearance is observable, and ERCOT publishes neither withdrawals nor operations, so ERCOT contributes no exit metric of any kind.

### Withdrawal metrics

| Metric | Eligible markets |
| --- | --- |
| Withdrawal count | PJM, MISO, CAISO, ISO-NE, NYISO |
| Withdrawal flow by date | PJM (4,729 dated), MISO (2,130), CAISO (1,725), ISO-NE (1,095) |
| Withdrawn MW | market-specific field only |

**NYISO publishes 1,749 withdrawals and zero withdrawal dates.** A count is defensible; a time series is not, and no date may be invented.

## 10. Operational evidence

Operational status requires the publisher to say so. Reaffirmed from IQ-2 and IQ-3:

- A **proposed or projected COD is never operation.** It is evidence a project is late.
- **MISO's `doneDate` is never operation.** Of 269 requests carrying one, 201 have a `postGIAStatus` that is not in service — 104 under construction, 62 not started, 32 withdrawn.
- **NYISO status 13 "In Service for Test" is never commercial operation**, nor is 15 "Partial In-Service". Only 14 "In Service Commercial" is.
- **ERCOT's energization and synchronization approvals are milestones, not operation.** ERCOT publishes no actual COD, so **no ERCOT completion metric exists.**

## 11. Completion: cohorts only

A completion rate is **never** `operational ÷ currently active`. That ratio moves when withdrawals clear the denominator and says nothing about outcomes.

**Definition.** Of eligible requests whose application date falls in cohort period *C*, the share whose latest observation is `operational`.

**Denominator** — requests entering in *C* that are: new-capability subtype; request class `generation`, `storage` or `mixed`; with a published application date; with canonical identity. Excluded and reported: load requests, capacity-rights requests, transmission requests, `unknown`-stage requests, and unresolved identity collisions.

### The maturity rule

A cohort is **mature**, and publishable, only when **both** hold:

1. the observation window is at least that market's own observed **p90 time to operation**, and
2. the cohort's **unresolved share is at most 15%**.

Both conditions are necessary, and each binds in a different place:

| Market | p90 | Mature cohorts | Cut by |
| --- | --- | --- | --- |
| PJM | 6.45 y | **2010–2016** | unresolved share (2017 = 15.2%) |
| CAISO | 10.43 y | **2010–2015** | observation window (2016 = 10.2 y) |

The rule's necessity is visible in the data it rejects. PJM's 2021 cohort has 1,328 entrants and **0% operational** with 79.7% unresolved; published as a completion rate it would read as total failure. CAISO's 2022 cohort has 0% unresolved and would pass condition (2) — on a sample of four.

**Mature-cohort results** (diagnostic, not for publication at 0.1.0-draft):

| Market | Cohorts | Entered | Operational | Withdrawn |
| --- | --- | --- | --- | --- |
| PJM | 2010–2016 | 1,987 | 512 (25.8%) | 1,420 (71.5%) |
| CAISO | 2010–2015 | 788 | 101 (12.8%) | 658 (83.5%) |

An immature cohort is never published as final. It may be shown as *in progress* with its unresolved share stated, or not at all.

### Project completion and MW completion are different metrics

**Project completion rate** = operational requests ÷ eligible cohort requests. Defensible for PJM and CAISO publicly; SPP internally.

**MW completion rate** = operational eligible MW ÷ eligible cohort MW. It additionally requires a defensible cohort quantity field, which PJM does not currently have (§4). **MW completion is deferred for every market**, and must not be derived by substituting a field for convenience.

MISO, ISO-NE and NYISO publish operational *status* but no operational *date* and, for MISO and ISO-NE, no reliable entry-to-exit pairing. They support an operational **count**, not a completion **rate**.

## 12. Time to operation

`actual_in_service_on − requested_on`, requiring **both explicit dates**. Published as median and, where the sample floor allows, p75 and p90.

| Market | n | Median | p75 | p90 |
| --- | --- | --- | --- | --- |
| PJM | 1,242 | 2.79 y | 4.72 y | 6.45 y |
| CAISO | 236 | 6.18 y | 8.26 y | 10.43 y |
| SPP | 279 | 4.22 y | 5.98 y | 8.22 y — **internal only** |

No substitution is permitted: not a proposed COD, not a study completion, not an agreement execution date.

**Time to withdrawal** — `withdrawn_on − requested_on` — is a separate metric on the same rules, and is not mixed into time to operation.

## 13. Technology mix

**Count-based, multi-label.** A project is counted once and tagged with every technology its resources name. CAISO's explicit components identify composition; PJM, MISO, ISO-NE and SPP publish compound labels with no recoverable split.

A hybrid is **never two projects**. Shares are therefore stated as "share of projects including technology X", which sums above 100% and is labelled as doing so, rather than as a pie chart that implies exclusivity.

**MW-based technology mix is deferred.** It requires attributing project MW to components, which only CAISO publishes and which CAISO's own figures prove non-additive.

## 14. Comparability tiers

Every metric carries a tier.

**Tier A — same semantic metric across all publishable markets.** Active request count; entries by count; withdrawal count; technology mix by count; queue age (six markets, ERCOT structurally excluded).

**Tier B — comparable across a documented subset.** Project completion rate (PJM, CAISO); time to operation (PJM, CAISO); withdrawal flow by date (PJM, MISO, CAISO, ISO-NE).

**Tier C — market-specific only, never compared.** Every MW figure. AI data-centre load (NYISO). ERCOT entries by first-seen.

A Tier C metric may be displayed beside another market's only with its field named and its basis stated.

## 15. Minimum samples

| Statistic | Floor |
| --- | --- |
| Median | 30 |
| p75 | 50 |
| p90 | 100 |
| Completion rate | 100 cohort entrants |
| Technology share | 30 projects in the market |

Below the floor the value is **not published and not rounded away** — the metric reports `insufficient_sample` with the actual n. ISO-NE's 28 active requests fall below the median floor for queue age; its percentiles are unavailable.

## 16. Aggregation cadence

**Annual** for entries, exits and cohorts. **Point-in-time** for stock, stamped with the observation date.

Monthly is defensible only for ERCOT, the one market with monthly vintages, and only for stock. Nothing is interpolated: a market with one observed snapshot has one point, not a line. Monthly snapshots are never expanded into daily history.

## 17. Revisions and vintages

Analytics use the **current canonical revision** of a historical source period, and retain provenance to the evidence it replaced.

ERCOT republished six corrections. Where a correction exists for a report period, its content is canonical for that period; the original snapshot and all its raw records are retained and remain queryable. A restated MW or status produces a new observation with a higher ordinal, and the superseded observation keeps its own values and its own frozen evidence.

A metric recomputed after a correction may legitimately change. It must not change silently: every published figure carries the snapshot set it was computed from.

## 18. Provenance

Every derived value must be reproducible to canonical requests, their observations, the quantities and resources on those observations, the raw records behind them, and the source snapshots those came from. A metric that cannot name its snapshot set is not publishable.

## 19. Rights

Publication eligibility comes from the existing rights machinery — `mayPublishSourceValue` — and not from any parallel logic here.

| Market | Classification | Raw display | Derived display |
| --- | --- | --- | --- |
| ERCOT | reusable with attribution | allowed | allowed |
| PJM, MISO, CAISO, NYISO, ISO-NE | ambiguous | allowed under founder-accepted risk | same |
| **SPP** | **unsuitable without permission** | **blocked** | **blocked** |

**SPP is blocked from every public metric, raw and derived.** A derived metric does not launder the block. SPP may be computed internally, and any cross-market statement that silently omits SPP is a different claim from one that says so — so a published multi-market figure must name SPP as excluded and why.

## 20. Proposed public V1

The smallest credible set, all Tier A or clearly labelled Tier C:

1. **Active request count**, per market (six markets; SPP excluded and named).
2. **Active request count by technology**, multi-label.
3. **Median queue age**, per market, ERCOT excluded with its reason stated.
4. **Annual entries by count** — application-date basis for five markets, first-seen for ERCOT from 2019, each labelled.
5. **Annual withdrawal count** for the five markets that publish withdrawals.
6. **Mature-cohort project completion rate** for PJM and CAISO only, with cohort years and unresolved share shown.
7. **Median time to operation** for PJM and CAISO only.
8. **NYISO explicit AI data-centre load**, requests and MW, market-specific.

Everything else waits.

## 21. Rejected, with reasons

| Rejected | Why |
| --- | --- |
| A seven-market queue MW headline | No quantity kind exists in all seven; the best reaches four, one of which is blocked |
| A seven-market completion rate | Only PJM and CAISO publish both an application date and an actual COD |
| Treating disappearance as withdrawal | ERCOT publishes neither withdrawals nor operations; absence is only absence |
| Summing CAISO components | 937 observations have components summing above the published project figure |
| ISO-NE CNR as new generation | 171,358 MW of capacity rights against 50,260 MW of new plant — 4.4× |
| Publishing SPP | Terms exclude commercial publication; no permission sought or held |
| Proposed COD as operation | Evidence a project is late, not that it runs |
| MISO `doneDate` as operation | 201 of 269 are not in service |
| NYISO "In Service for Test" as operation | A plant on test is energised, not operating |
| MW completion rate | No market has both a mature cohort and an unambiguous cohort quantity field |
| Mean queue age | Distribution is skewed; CAISO p90 is 15.5 years against a 6.5-year median |

## 22. Open gates before 1.0.0

This version is a draft because these are unresolved:

1. **PJM's MW field.** Three candidates, no stated reason to prefer one.
2. **ERCOT's net-change quantity.** It needs its own quantity kind, distinct from `maximum_facility_output`, because it is a change rather than a level.
3. **MW completion rate** for any market.
4. **ISO-NE's sample size.** 28 active new-capability requests is below the median floor.
5. **Whether `unknown`-stage requests get a published coverage figure** or only an internal one.
6. **Whether ERCOT's first-seen entries may sit on the same chart** as application-date entries, given they measure different things.

## Version history

**0.1.0-draft, 21 September 2026.** First specification, written against the complete seven-market canonical evidence base. Approves nothing for publication.
