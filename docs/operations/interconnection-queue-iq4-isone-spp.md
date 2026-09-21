# Interconnection Queue IQ-4: ISO-NE, SPP, and a complete evidence base

**Status:** internal implementation note, not registered in the docs catalog. No public API, no frontend surface, no derived analytics, no production write.

IQ-4 completes canonical coverage of all seven organized U.S. wholesale markets. The two added here are the two with special cases, and both are about the same thing: a number that looks like a queue total and is not one.

## ISO-NE: two thirds of the published queue is not new generation

740 of ISO-NE's 1,751 rows request Capacity Network Resource or Capacity Network Import capability. ISO-NE defines that as an interconnection *service right*, not a request to build: it settles "whether an initial interconnection analysis is required under FCM qualification for a proposed increase in output from an existing generating capacity resource". Those rows describe plant that already exists, asking for the right to sell its capacity.

The scale of the trap, measured on the live artifact:

| | Summer MW |
| --- | --- |
| New-generation requests | **50,260** |
| Capacity-rights, elective upgrade and transmission-service requests | **171,358** |
| A naive sum of the column | 221,618 — **4.4× too large** |

89 CNR rows report zero net MW to the grid against a large summer figure. Park City Offshore Wind CNR is 0 MW net and 838.2 MW summer.

### How that is prevented

Not by a filter somebody remembers to apply. Three layers:

1. **A request says what kind it is.** `reference.interconnection_request_subtypes` carries `is_new_capability`, false for `capacity_rights`, `elective_transmission_upgrade`, `transmission_service` and `unknown`. An unmapped kind is deliberately not new capability, so a vocabulary gap cannot inflate a total.
2. **The quantity kind follows the request kind.** A capacity-rights row's MW goes under `capacity_service_mw` and `other_mw`, never under `summer_mw`, `winter_mw`, `net_mw_to_grid`, `maximum_facility_output` or `in_service_mw`.
3. **The database refuses the alternative.** `pipeline.check_interconnection_quantity_subtype()` rejects any insert that puts a new-generation quantity on a request that does not propose new capability. Verified against the live data: **0 such rows exist, and attempting one fails.**

The read model follows: `requestSubtypeCounts()` and `quantitiesByCapability()` return quantities split by `is_new_capability`, per named field, never as one number.

### Administrative rows

ISO-NE flags related rows in free text inside the project name — "Kingdom Community Wind Increase (see Q311)" — and publishes **no relationship field**. 28 rows do this, and ISO-NE's own guidance is to disregard them when counting projects.

They are kept as evidence, the referenced position is recorded in `native_status` as `referencesQueuePosition`, and a deferral records the situation. **No canonical relationship is created**, and the relationship table stays deferred: a relationship parsed out of a project title is an inference, and IQ-2's rule holds.

### Queue positions are not unique

ISO-NE's QP column repeats. QP 161 covers five different facilities — Devon 15–18, Middletown 12–15, Middletown 11, a combined cycle and a combustion turbine — with different service types and statuses, and no column makes the position unique. 92 positions carry more than one row, 242 rows in total.

The existing collision guard handles it: raw evidence is kept for all 1,751 rows and canonical identity is created for the 1,509 unambiguous ones. **Zero of the 59 active rows are affected** — every colliding row is commercial (83) or withdrawn (159), historical alternatives under legacy positions. This is a real limitation and IQ-5 must know about it, but it does not touch the live queue.

### Co-location and dual fuel

ISO-NE states that the public queue does not reveal the battery/generator MW split for co-located projects. So `SUN BAT` becomes two named resources with no MW attributed to either, and the project MW stays project-level.

`DFO NG` is **one dual-fuel machine**, not a hybrid: 105 rows burn oil or gas, and 4 burn three fuels. A compound label becomes several resources only when storage is one of the parts.

## SPP: collected, never published

SPP's terms grant copying and distribution with citation **"EXCEPT when such materials will be used in commercial publication"**. Urdais is a commercial publication, so the carve-out reaches everything Urdais would display. That is a stated exclusion, not the open question the founder-accepted-risk policy covers.

Registered `unsuitable_without_permission` with every public purpose `prohibited`. Internal retention and calculation stay permitted, so the canonical layer is complete for future private analytics.

| Purpose | Decision |
| --- | --- |
| `public_interconnection_queue_display` | **blocked_permission_prohibited** |
| `public_interconnection_queue_derived_metric_display` | **blocked_permission_prohibited** |

Derived display is blocked as well, so a metric cannot launder the block. No override exists. The one route the policy leaves open is somebody recording an actual permission — a deliberate act that has not happened — and tests assert both the block and that route's distinctness.

### The active listing is not a backlog

A third of SPP's "active" listing is already operating: 336 of 1,016 rows carry `IA FULLY EXECUTED/COMMERCIAL OPERATION`. Lifecycle is derived from the status field, never from the report's name.

| Stage | Requests |
| --- | --- |
| operational | 336 |
| agreement_executed | 304 |
| study | 258 |
| agreement_pending | 64 |
| suspended | 25 |
| unknown | 29 |

### Six MW fields, none promoted

| Native field | Quantity kind | Total |
| --- | --- | --- |
| Capacity | `maximum_facility_output` | 190,792 MW |
| MAX Winter MW | `winter_mw` | 191,535 MW |
| MAX Summer MW | `summer_mw` | 189,765 MW |
| Nameplate Capacity | `other_mw` | 57,709 MW |
| Requested Maximum Injection Capability | `energy_service_mw` | 49,125 MW |
| Requested Network Resource Deliverability | `capacity_service_mw` | 45,938 MW |

A 4.2× spread between the largest and smallest. All six are kept under their own names.

### The preamble

SPP's CSV opens with `"Last Updated On",9/21/2026,` and puts the header on the next line. That date is the only freshness stamp SPP publishes and becomes the snapshot key (`active-2026-09-21`), so a week with no new release resolves to the snapshot already recorded.

The reader also had to learn that a record is not always a line: SPP writes free-text fields — a cause of delay — containing newlines inside quotes, which a line-oriented reader splits in two.

## Tooling added

**`src/lib/interconnection-queue/html/table.ts`** — a structured HTML table reader. Reads `<table>`/`<tr>`/`<th>`/`<td>` in document order, resolves columns by header text, tracks nesting depth, and honours `colspan` so positions stay aligned. No browser, no OCR, and no script execution: `<script>` and `<style>` content is discarded rather than read as text, which a test asserts. It tolerates restyling and fails loudly when a required column disappears, naming what the page offered instead.

**`src/lib/interconnection-queue/csv/preamble.ts`** — a preamble-aware CSV reader. Finds the header by predicate rather than position, returns the preamble as data, joins quoted fields spanning lines, and preserves each record's source line number.

**Per-artifact request headers** — ISO-NE's queue sits behind an ASP.NET cookie-detection redirect that loops forever unless the client presents the cookie the server is testing for. The requirement is declared on the artifact rather than taught to the shared fetcher.

## Seven-market canonical completeness

| Market | Snapshots | Requests | Observations | Quantities | Resources | Classification | Public display |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PJM | 1 | 9,200 | 9,200 | 26,569 | 9,786 | ambiguous | allowed (founder risk) |
| MISO | 1 | 3,850 | 3,850 | 23,100 | 4,193 | ambiguous | allowed (founder risk) |
| CAISO | 1 | 2,278 | 2,278 | 5,071 | 2,793 | ambiguous | allowed (founder risk) |
| ERCOT | 96 | 3,325 | 23,404 | 23,404 | 23,404 | **reusable with attribution** | allowed |
| NYISO | 1 | 2,160 | 2,160 | 3,827 | 2,160 | ambiguous | allowed (founder risk) |
| ISO-NE | 1 | 1,509 | 1,509 | 3,989 | 1,668 | ambiguous | allowed (founder risk) |
| **SPP** | 1 | 1,016 | 1,016 | 6,096 | 1,016 | **unsuitable** | **blocked** |

Every market has an interface, a snapshot, requests, observations, quantities and resources. Provenance is clean throughout: zero observations without a raw record, zero quantities without an observation, zero raw records without a snapshot, zero domain violations.

**No cross-market total is computed and none should be.** Seven incompatible MW semantics, a capacity-rights class that exists in one market, hybrids that are recoverable in one market and not in five, and one market that cannot be displayed at all.

## Idempotence

| | ISO-NE | SPP |
| --- | --- | --- |
| Exact rerun | 0 of everything | 0 of everything |
| One-row correction | 1 new observation, 1,508 confirmed, 0 new requests | 1 new observation, 1,015 confirmed, 0 new requests |
| New source state | new snapshot, prior raw evidence retained | new snapshot key `active-2026-09-28`, prior evidence retained |

## Cost

| | ISO-NE | SPP |
| --- | --- | --- |
| Retrieval | 2.9 s (3.7 MB) | 0.7 s |
| Parse | 0.5 s | 0.03 s |
| Persist | 0.7 s | 0.4 s |
| SQL statements, first run | 33 | 35 |
| SQL statements, rerun | 15 | 15 |

## Deferrals

ISO-NE 128, SPP 29. Neither duplicates on rerun. ISO-NE's are dominated by administrative-relation rows and unmapped fuel codes; SPP's by unmapped statuses and generation types.

## Frontend assumptions this adds

Reported only; nothing changed.

1. **ISO-NE cannot show one queue MW.** A New England figure must say whether it includes capacity-rights requests, and the honest answer excludes them — which is 50,260 MW rather than 221,618 MW.
2. **SPP cannot appear at all.** Any seven-market view is a six-market view plus a stated omission, and the omission is a rights fact rather than a data gap.
3. **A "request" is not one thing.** Four request kinds now exist and only one proposes new capability.
4. **ISO-NE's queue positions are not unique**, so a count of positions and a count of rows differ, and 242 rows have no canonical identity.

## Recommended IQ-5: methodology only

The evidence base is complete; the arithmetic is not defined. IQ-5 should decide, before anything is exposed:

- **Which MW field means what**, per market, and whether any cross-market total is defensible at all given that PJM alone publishes four columns spanning 17.8× and SPP six spanning 4.2×.
- **What counts as being in the queue** — `not_distinguished` and `new_generation` yes, `capacity_rights` no, and what to do with ERCOT's small-generator sheet, which publishes no study phase.
- **Cohort rules**: PJM, MISO, CAISO, ISO-NE and NYISO carry in-file lifecycle; ERCOT has 93 published vintages but no actual COD; SPP has neither history nor publication rights. A completion rate is defensible for five markets and for none of the other two.
- **Censoring**: a cohort younger than the observed median time to operation must not be published.
- **What SPP's exclusion means for cross-market claims** — a "U.S. queue" total that silently omits SPP is a different claim from one that says so.
