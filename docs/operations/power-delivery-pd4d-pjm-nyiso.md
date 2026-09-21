# Power Delivery PD-4D: PJM and NYISO grid capacity

**Status:** internal implementation note. Not the public Power Delivery methodology, and no frontend surface reads this data.

PD-4C ingested ERCOT, CAISO and ISO-NE. PD-4D adds PJM and NYISO, which between them forced a PDF text reader, two vocabulary additions, and four deferrals that are more interesting than some of the data.

## What is ingested

| Source | Vintage | Capability | Requirement | Constraint | Diagnostic | Evidence only |
| --- | --- | --- | --- | --- | --- | --- |
| PJM RPM planning parameters | `rpm-planning-parameters-2026-2027` | — | 80 | 16 | 32 | 39 |
| PJM Base Residual Auction results | `bra-results-2026-2027` | 17 | — | — | — | 17 |
| NYISO LCR study | `lcr-study-2026-2027` | — | 8 | 2 | — | — |

Run with `npm run power-delivery:capacity-ingest -- --source pjm-parameters`, `pjm-bra`, `nyiso`, or `--all` for all six markets.

PJM is two sources, not one. It publishes what it requires before the auction and what cleared afterwards; they are separate releases with separate dates and separate currentness, and folding them into one vintage would date one by the other.

**No PJM Data Miner.** Every artifact is a file PJM or NYISO publishes openly on its own site, and a database test fails if an interface whose name or URL mentions Data Miner is ever registered.

## Values that check the parsers

Parsed from the artifacts, not written down anywhere in this repository:

| | |
| --- | --- |
| PJM forecast peak load, 2026/27 | 159,329.1 MW |
| PJM installed reserve margin | 19.1% (from the stored fraction 0.191) |
| PJM RTO reliability requirement | 146,104.8 MW UCAP |
| …adjusted for FRR obligations | 134,519.5 MW UCAP |
| PJM cleared capacity, RTO | 134,205.3 MW UCAP |
| MAAC CETO / CETL | 590 / 2,715 MW |
| DOM CETL | 7,374 MW |
| NYCA installed reserve margin | 24.5% |
| NYC locational requirement | 86.4% (CHPE-In) / 82.6% (CHPE-Out) |
| Long Island, G-J | 110.3% / 82.5%, both cases |

The narrative PJM parameters PDF states the same figures as the workbook this adapter reads, and they agree. NYISO's report says its transmission security floors bind in every locality, and the parsed New York City requirement equals the parsed floor in both cases — an internal check the adapter tests assert.

## Reading PDFs, and refusing to

NYISO publishes no machine-readable capacity artifact at all. Its LCR study is a PDF whose two tables — the net CONE curves, and the requirement derivation with its peak loads and derating factors — are **raster images**, carrying no text. Reading those would need optical recognition, which this repository does not do and will not.

The report's prose is a real text layer, and it states every headline result. So `src/lib/power-delivery/pdf/` reads the text layer and the adapter matches the exact sentences that state the results, with whitespace removed from both sides so kerning cannot affect the match. A rewording fails loudly rather than yielding a plausible wrong number.

The reader is dependency-free, for the same reason the XLSX reader is. It implements what the real artifacts use — indirect objects, Flate streams, object streams, cross-reference-free object scanning, form XObjects, one- and two-byte fonts with ToUnicode maps — and nothing else. It refuses encrypted documents rather than returning empty pages. Validated against all 36 pages of three PDFs from two different producers: every page matches an independent extractor character for character, with no unmapped glyphs.

One trap is worth naming because it cost an hour. Word emits a ToUnicode CMap declaring a two-byte codespace on a plain one-byte font. Believing that declaration reads every *pair* of letters as one unmapped glyph and turns an entire document into replacement characters. The font's own type decides the code width; the CMap never does. There is a regression test.

## Two vocabulary gaps the live artifacts exposed

**A requirement stated as a rate.** PD-4B assumed every capacity quantity is an amount of power and allowed only MW and GW. PJM's reserve margin and pool requirement are proportions of forecast peak, and NYISO's locational requirements are published as percentages and *never* as megawatts. The alternative was to multiply each rate by a peak load and store the product — Urdais arithmetic filed as a publisher's statement, baking in whichever forecast happened to be at hand. So `percent` is now an allowed unit for a source-published component or constraint. It is **not** allowed for a derived `deliverable_capacity_results` row: a conclusion Urdais publishes about deliverable capacity is an amount of power. The combination rules refuse to add two values of different units, and now refuse a rate as an addend outright.

**The transfer a locality must be able to make.** PJM publishes both a Capacity Emergency Transfer Objective and a Capacity Emergency Transfer Limit for each area, and the locational test is whether the limit exceeds the objective by fifteen percent. The limit is what the network permits and belongs in the constraint layer. The objective is an obligation about a place, and under PD-4B's vocabulary it collided with the area's reliability requirement on the live-row index, because both were simply "a requirement about this locality". `capacity_transfer_requirement` tells them apart.

## Things kept apart on purpose

- **CETO is a requirement; CETL is a constraint.** Different layers, and no arithmetic anywhere combines an area's capability with its CETL.
- **IRM and FPR are one obligation in two bases**, not two obligations. Same component kind, different `capacity_basis`, which is exactly what that column is for.
- **A reliability requirement and the same requirement net of FRR obligations** are separate rows.
- **PJM spells its own areas four ways** across two workbooks — `ATSI-Cleveland` and `ATSI-CLEVELAND`, `PL` and `PL (incl. UGI)`, `PS NORTH` and `PSNORTH`. They are reconciled to one key, or each area would enter twice and split its history down the middle.
- **PJM areas nest.** MAAC contains EMAAC, which contains PS; every area figure already counts the areas inside it. The nesting itself is defined in Schedule 10.1 of the Reliability Assurance Agreement, which this phase does not ingest, so no parent is recorded and `refuseNestedSubareaTotal` refuses the operation outright rather than guessing a hierarchy.
- **NYISO's two Triggering Resource cases are two scenarios**, not a range. The Champlain Hudson Power Express changes which contingency binds Load Zone J, so NYISO publishes one set of requirements assuming it participates and another assuming it does not. Which applies is settled by the tariff, so neither is the reference case.

## The locational formula gate, and why it stays shut

PD-4A proposed `in-LDA accredited UCAP + CETL` as a candidate locational construct, to be implemented only if the sources support that exact arithmetic. They do not, on two independent grounds:

1. The two terms come from **different publications with different geography**. Cleared capacity is per LDA in the auction results; the transfer limit is per LDA in the planning parameters; and PJM's own transfer-rights sheet reports against "PS Equivalent" and "ATSI Equivalent", which are obligation constructs rather than the areas the limits are stated for.
2. Cleared capacity is what **cleared**, not what exists: a resource inside the area that did not clear, or that belongs to an FRR entity, is absent from it. Adding a transfer limit to it produces neither a physical capability nor a market one.

So `pipeline.deliverable_capacity_results` stays empty for PJM localities, and for everything else. Per the phase brief, that is the successful outcome.

The RTO-level total is shut for a different reason: PJM *does* publish `cleared UCAP + FRR UCAP` as a figure of its own, in a sentence of the narrative auction report and in no table or workbook. Storing PJM's own aggregate would have been preferable to computing one — but it is not machine-readable, so neither happens.

## Idempotence and cost

Keyed four ways, as PD-4C established. Rerunning all three sources over identical artifacts wrote **0 inserts and 0 revisions**, against 211 raw records, 137 components and 18 constraints. The first run's unchanged count is zero too, which matters: a non-zero one would mean two source rows had quietly collapsed onto one canonical identity and happened to agree. One did, at first — the PJM workbook states the RTO peak forecast twice — and it is now read once.

172 SQL statements for the first run, 117 for the rerun, in under 100 ms locally. The row-scaling writes are batched: 211 raw records are 3 statements, 137 components 3, and 18 constraints 1. The rest is reference geography, which scales with the number of distinct areas and is written once.

## What is deferred, and why

Recorded in `CAPACITY_DEFERRALS` with artifact URLs and unblock conditions; the CLI prints them on every run.

- **PJM capacity committed by FRR entities** — stated only in narrative prose. The planning parameters carry the FRR *obligation*, which is what those entities owe rather than what they hold.
- **PJM RTO cleared capacity including price responsive demand** — the workbook and the report state two different quantities under similar names, differing by about 105 MW. Only the workbook figure is stored, under the workbook's own heading.
- **Ten of twenty-seven PJM transfer limits** — printed as bounds like `>2,308.1` because the study stopped once the area passed its test. A bound is kept as evidence and does not become a constraint value.
- **The nesting of PJM areas** — published in a tariff schedule this phase does not ingest.
- **Every value in NYISO's LCR tables** — raster images.
- **NYISO capability and import rights in megawatts** — the Gold Book is a PDF with no machine-readable companion, re-verified here after PD-3C found the same.

## Explicit exclusions

No MISO or SPP. No delivery gap. No frontend. No `deliverable_capacity_results` row of any kind. No ICAP-to-UCAP conversion anywhere: where a source states one basis, that basis is stored, and the conversion factors PJM publishes are kept as diagnostics rather than applied.
