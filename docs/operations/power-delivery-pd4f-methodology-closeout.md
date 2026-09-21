# Power Delivery PD-4F: deliverable capacity methodology closeout

**Status:** internal implementation note. The approved methodology itself is [docs/methodology/deliverable-capacity.md](/docs/methodology/deliverable-capacity.md).

PD-4B through PD-4E built ingestion for seven markets. PD-4F decides what Urdais can honestly call deliverable capacity, approves version **1.0.0**, and marks four of the seven markets component-only rather than producing seven nominal numbers.

## The decision, in one table

| Market | V1 status | Results | Publication | Question A |
| --- | --- | --- | --- | --- |
| ERCOT | `approved_result` | 20 | `publication_candidate`, attribution | **Yes** |
| PJM | `approved_result` | 1 | `publication_candidate`, founder-risk | No — scope mismatch |
| MISO | `internal_result_only` | 4 | `internal_only`, rights-blocked | Yes, internally |
| CAISO | `component_only` | 0 | — | — |
| NYISO | `component_only` | 0 | — | — |
| ISO-NE | `component_only` | 0 | — | — |
| SPP | `component_only` | 0 | — | — |

Twenty-five results, from three markets, of which two may be published and one may be differenced against demand.

## How the decision was made

Not from the phase notes. All nine sources were ingested into a clean local database and the matrix was built from what the canonical tables actually contain:

```
market | component_kind                | basis      |  n | market-level
-------+------------------------------+------------+----+-------------
ercot  | accredited_resource_capacity | accredited | 20 |           20
iso-ne | tie_benefit                  | icap       | 95 |           95
miso   | accredited_resource_capacity | ucap       | 44 |            4
miso   | installed_capacity           | icap       | 40 |            0
pjm    | procured_capacity            | ucap       | 17 |            1
```

CAISO, NYISO and SPP appear nowhere in that table: they hold zero capability rows of any kind. ISO-NE's ninety-five are all tie benefits — credits for interconnections, not the region's accredited resource capability.

## Question A and Question B

Locked as separate questions. **A** is `capability − forecast peak demand`, a planning capacity margin. **B** is `capability − required capacity`, a resource adequacy surplus. They can point opposite ways, and PD-5's delivery gap is A only.

Whether A is even askable was checked per market against canonical data, and the answer differs:

- **ERCOT** — capability and Firm Peak Load come from the same table, season and peak-hour scenario. Perfectly aligned.
- **MISO** — capability, system peak demand and the reserve margin requirement all come from the same seasonal table. Aligned for both A and B.
- **PJM** — capability lives in the auction results vintage and scenario; peak demand lives in the planning parameters vintage and a different scenario. **Not aligned**, and worse than a bookkeeping problem: PJM's capability excludes FRR-committed supply while its forecast peak includes FRR load. Differencing them would report roughly 25,000 MW of gap, much of it a scope artifact.

## CAISO: the question this phase existed to answer

Whether summing resource-level NQC is a defensible market capability. It was examined from canonical evidence, not from assumption, and it **survives every mechanical objection**:

- Energy-only resources carry zero in all 1,902 of their resource-months — CAISO has already zeroed them.
- Interim and partial deliverability values are already reduced by CAISO, not by Urdais.
- 19,368 rows, 19,368 distinct resource-months: no duplicates.
- No negative values, and no import or intertie resources, so the aggregate would be internal generation only with nothing double counted.
- The filter is exactly stateable: sum the monthly column of the `2026 NQC List` sheet.

It fails on something else entirely. **A result must be reconstructible from its frozen input rows and its methodology version alone**, and `deliverable_capacity_result_inputs` can freeze only components and constraints. CAISO has neither — its evidence is 19,368 raw records, and the schema has no resource-level component grain. A CAISO result could be computed but not frozen, and an unfreezable published number is one nobody can audit.

Two hazards are recorded for whoever revisits this. The workbook's `2026 Other` sheet is **not disjoint** from the main list — 22 of its 31 resources appear in both — so the sheets must never be summed together. And CAISO publishes no area total against which any aggregate could be checked.

This is the most likely candidate for 1.1.0, and it needs a schema decision rather than a methodology one.

## Three gates, kept separate

A number reaches a public surface only if all three open, and they are checked independently because they answer different questions.

| Gate | Question | Where enforced |
| --- | --- | --- |
| Methodology | Is this market approved under an `approved` version, and is the result `validated`? | `resultRuleFor`, plus a database trigger that refuses publication under a non-approved version |
| Rights | Do the source's determinations permit showing a derived value? | `mayPublishSourceValue`, read from the registry at calculation time |
| Currentness | Do the inputs come from the vintage in force? | The component query selects only the newest live vintage of the rule's own source |

Failing any gate leaves the result retained and unpublished, never absent and never approximated. The gates genuinely disagree in practice: MISO passes methodology and currentness and fails rights; PJM passes all three and is still not eligible for a delivery gap.

## What the engine does

`npm run power-delivery:capacity-results` calculates every approved market and reports, for each of the other four, why it produces none. A market absent from the output would be a market nobody decided about, so all seven always appear.

Version 1.0.0 approves **no arithmetic**. Each result is an identity on one canonical component, and each freezes exactly that component as its input. That is a deliberately narrow claim: the freezing discipline has to hold before the formulas get interesting, and it is cheapest to establish when there is only one input to freeze.

Reruns over unchanged evidence write nothing — 0 inserted, 0 revised, 25 unchanged. Values are compared as stored text, never as float8, because ERCOT's figures need sixteen significant digits.

## What was deliberately not built

- **No locational result anywhere.** PJM's `in-LDA UCAP + CETL` stays unapproved on the PD-4D evidence; MISO's `local capability + CIL` stays unapproved even though both inputs are now held and the subtraction is one line.
- **No cross-market total**, and no total across nested localities. Both are refused by functions that exist to say so.
- **No conversion between bases.** Protocol MW, UCAP, ICAP and accredited capacity stay as their publishers stated them.
- **No frontend, no delivery gap.**

## Implications for PD-5

PD-5 is **not** a seven-market delivery gap product. On this evidence it is a coverage-aware product with results where the data supports them:

- **One market can publish a delivery gap today**: ERCOT, where capability and demand share a table, a season and a peak-hour scenario.
- **One more could internally**: MISO, whose LOLE study states capability, peak demand and requirement together — but nothing MISO may be published.
- **PJM has a publishable capability and no publishable gap** until either FRR committed capacity or RPM-scope demand becomes canonical.
- **Four markets have no capability at all**, so no gap of any kind.

A PD-5 that assumed seven gaps would have to invent six of them. The honest shape is one published gap, one internal, and five explained absences — plus, if the gap is worth more coverage, a phase that unblocks capability first: ISO-NE's qualified capacity report, PJM's FRR figure, and the CAISO schema decision are the three highest-value targets, in that order.
