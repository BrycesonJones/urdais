# Power Delivery PD-4E: MISO and SPP grid capacity

**Status:** internal implementation note. Not the public Power Delivery methodology, and **no value from either market may reach a public surface.**

PD-4E completes the seven-market ingestion. It also produces the thinnest coverage of the five phases, for reasons that are the point rather than a shortfall: one operator's auction results are not publicly retrievable, and the other publishes almost every number as a picture.

## What is ingested

| Source | Vintage | Capability | Requirement | Constraint | Diagnostic | Evidence only |
| --- | --- | --- | --- | --- | --- | --- |
| MISO LOLE study | `lole-study-2026-2027` | 88 | 48 | — | 88 | 80 |
| MISO CIL/CEL results | `cil-cel-2026-2027` | — | — | 80 | — | 81 |
| SPP summer RA report | `summer-resource-adequacy-2026` | — | 1 | — | 2 | 5 |

Run with `npm run power-delivery:capacity-ingest -- --source miso-lole`, `miso-limits`, `spp`, or `--all` for all nine sources across seven markets.

MISO is two sources for the same reason PJM is: it publishes what it requires and what its network permits as separate releases on separate dates.

## Internal only, and what that means here

Both operators' terms were reviewed and refused in PD-3B. Nothing found since changes that, so both markets are registered exactly as their planning counterparts were:

- `production_blocked`, `terms_review_state = not_permitted`, `data_use_terms_state = not_permitted`
- `unsuitable_without_permission` for every purpose
- public raw and derived display **prohibited** — a determination, not an absence of one
- **no permission grant exists for any of the three interfaces**, and none may be created without written permission

That last point is the strongest part of the registration. The founder-accepted-risk policy exists for *ambiguity*; a determination that terms were reviewed and refused is not ambiguity, and the database refuses to promote such a source into the accepted-risk state. With no grant in existence there is nothing a later change could cite to authorise production collection by accident. Collection happens under the `research` purpose, which carries no grant and publishes nothing.

## A document that says not to

SPP's 2026 Summer Season Deliverability Study is the richest artifact either market publishes: total deliverable capacity of 97,163 MW against 105,714 MW studied, broken down by fuel type. It is also stamped **"SPP Internal Only" on every one of its nineteen pages.**

It is not ingested. A document its publisher marks as not for distribution is not retained, even internally, and even though the file answers a public address. A confidentiality mark on the document itself is a clearer statement than any site terms, and the rights policy has no override for a source whose terms were reviewed and refused. The SPP adapter refuses any artifact bearing that mark rather than relying on anyone remembering this, and the refusal is tested against the real study.

This is a departure from the phase brief, which named the deliverability study as a priority source. The brief was written before the marking was known.

## What each market actually yields

**MISO** turns out to be the better-documented of the two. The Loss of Load Expectation study is fully text-extractable and gives, for each of four seasons: system peak demand, unforced capacity and its ten resource-class components, firm external support, the reserve margin requirement in both megawatts and percent, and — for each of ten Local Resource Zones — installed capacity, unforced capacity, the Local Reliability Requirement and peak demand. The limits deck gives the import and export limit for every zone and season, beside the transfer ability the study measured.

**SPP** yields one requirement. Its accredited capacity planning reserve margin of 7.06% is stated in prose; everything else — the five-year outlook, the reserve margin distributions, the fuel-type projections — is a raster image. There is no readable capacity total and no readable aggregate requirement.

## Two names that must not be confused

**SPP's tariff term.** SPP uses **Deliverable Capacity** for accredited megawatts a transmission study found deliverable to the East Balancing Authority Area. That is not the Urdais quantity of the same name, which is a market's maximum load-serving capability. The term is carried through verbatim as evidence so the collision is visible in the data, and a regression test keeps it out of `deliverable_capacity_results`.

**MISO's ability and its limit.** Zonal Import Ability is what the transfer study measured; the Capacity Import Limit is what MISO applies. The deck prints both side by side precisely because they differ. Only the limit becomes a constraint.

## Things kept apart, and a double count avoided

- **PRMR and LRR are requirements**, never capability. So is SPP's reserve margin.
- **CIL and CEL are constraints**, in their own layer, with their own kinds and directions. A database test refuses a capacity import limit filed as a component under any name.
- **Installed and unforced capacity keep their own bases.** No ICAP-to-UCAP conversion happens anywhere; MISO's own conversion factors are stored as diagnostics rather than applied.
- **Demand response is already subtracted.** SPP defines Net Peak Demand as forecast peak less controllable and dispatchable demand response, so adding demand response back on the capacity side would count it twice. The definition is recorded on every SPP record.
- **SPP has no localities.** Its own deliverability study states that specific delivery points and zones within SPP are not studied, so none are manufactured to mirror other markets.
- **MISO's seasons carry no dates.** The month ranges are defined in MISO's tariff, not in either artifact; a period this pipeline did not read is one it does not assert.

## The arithmetic that was easy and was not done

MISO states the relationship plainly: a zone's Local Clearing Requirement is its Local Reliability Requirement reduced by that zone's seasonal Capacity Import Limit. After this phase both inputs are held, for all ten zones and all four seasons. The subtraction is one line.

It is not performed. The two inputs come from different releases with different dates, and PD-4A left MISO's locational arithmetic unapproved pending confirmation of whether imports are already embedded in the local figures. An easy calculation is not an approved one, and `deliverable_capacity_results` stays empty.

## What the deck says twice

MISO's limits deck states each zone's transfer ability in a summary table and again on the zone's own slide. Both are read independently and compared — and for Local Resource Zone 1 in the fall they disagree: the summary says 7,245 MW and the slide says 7,244 MW.

The check exists to catch a *misreading*, not to police MISO's rounding. A column read out of place yields a number from another zone entirely and diverges wildly; a publisher rounding one of its own tables differently diverges by a megawatt. So a divergence above one percent fails the source, and a smaller one is recorded as what it is — the deck disagreeing with itself — with the detailed slide carried forward. The check earned its place: it also caught a real parser fault, where the voltage legend at the foot of each slide was being read as the final season's limit.

## Idempotence and cost

Rerunning all three sources over identical artifacts wrote **0 inserts and 0 revisions**, against 473 raw records, 227 components and 80 constraints. The first pass's unchanged count is zero too, which is the check that matters: a non-zero one would mean two source rows had collapsed onto one canonical identity and happened to agree.

124 SQL statements for the first run and 91 for the rerun, in under half a second locally. The row-scaling writes are batched — 473 raw records are three statements — and the rest is reference geography, written once.

## Reading tables out of PDFs

Both MISO artifacts are PDFs, and the reader built in PD-4D handled both new producers without change: all 154 pages across the three new documents extract character-for-character identically to an independent extractor, with no unmapped glyphs.

What PD-4E adds is `src/lib/power-delivery/pdf/tables.ts`, for pulling a labelled row of numbers out of a text layer. It fails closed on everything: a missing label, a row that yields a different number of values than expected, a hole in a row. Accounting parentheses are negative — a cold weather derate of `(11,320)` read as positive would turn the largest single derate in the study into a resource — and a minus sign the typesetter set apart from its digits is rejoined to them, because treating the sign as its own cell shifts every later column.

## What is deferred, and why

- **MISO committed Seasonal Accredited Capacity, final PRMR and zonal Local Clearing Requirements** — the auction's figures. MISO's posting of the 2026 results answers with HTTP 403 Access Denied, while the equivalent 2025 posting at the same host serves normally. So MISO holds no accredited capacity, and what the study does state is stored under its own bases rather than relabelled.
- **MISO's implied Local Clearing Requirement** — methodology, above.
- **SPP accredited capacity totals and the aggregate requirement** — raster images.
- **SPP Deliverable Capacity by resource and fuel type** — the internal-only study.

## Explicit exclusions

No delivery gap. No frontend. No `deliverable_capacity_results` row of any kind. No PJM Data Miner, no EIA-860 fallback, no queue megawatts, no quarterly interpolation, and no methodology approved.
