# Power Delivery PD-3C: planning-forecast ingestion

**Status:** internal implementation note. Not the public Power Delivery methodology, and no frontend surface reads this data yet.

PD-3B built the planning domain and the rights policy. PD-3C fills it with real first-party forecasts and, in doing so, corrected four things the schema had assumed. Four of the seven markets are ingested; three are not, and each has a recorded reason rather than an absence.

## What is ingested

| Market | Source | Vintage | Scenarios | Grains |
| --- | --- | --- | --- | --- |
| ERCOT | 2025 Long-Term Demand and Energy Forecast, April 2025 Adjusted | `ltlf-2025-04-adjusted` | 36 | seasonal, monthly, annual |
| PJM | 2026 Load Forecast Report data workbook | `load-forecast-2026` | 1 | monthly |
| CAISO | CEC California Energy Demand 2025 | `ced-2025` | 3 | annual |
| ISO-NE | CELT 2026 Forecast Data | `celt-2026` | 2 | seasonal |

Run with `npm run power-delivery:planning-ingest -- --source ercot`, or `--all`. `npm run power-delivery:planning-verify` prints what is held and what the publication policy says about it.

There is no cron. These are annual publications; a nightly job would spend a year confirming nothing had changed, and detecting a genuinely new vintage needs a publisher-specific discovery step PD-3C does not build.

## Architecture

One framework, six adapters' worth of contract, no six unrelated pipelines. An adapter declares its artifacts and implements `parse`, which is a pure function of retrieved bytes — that is what makes fixture tests meaningful and keeps the network out of the parser. Everything else is shared: retrieval, hashing, rights snapshots, vintage and scenario identity, locator provenance, idempotence and supersession.

Spreadsheets are read by a dependency-free XLSX reader (`planning/xlsx/`): a ZIP central-directory walk plus `node:zlib`, then sheet XML. It is strict on purpose — a renamed sheet or a moved column raises rather than returning fewer rows.

## Idempotence

Four independent keys, not one assumption:

- a retrieval is keyed by `source | artifact label | SHA-256 of the bytes`
- a raw record by a hash of its value *and* its locator
- a vintage by the publisher's release key
- a canonical point by scenario, geography, period, measure and unit

A byte-identical rerun writes nothing. A corrected artifact is a new retrieval, adds new raw evidence, and supersedes only the points whose values actually changed; nothing is rewritten or deleted.

## Provenance

Every canonical point traces to a raw record, and every raw record names the sheet and cell (or PDF page, CSV row, HTML selector) it came from, plus the archive and member path — for the CEC, a ZIP; for every workbook, the XLSX package and the part inside it. The database refuses a raw record whose extraction method does not carry its matching locator.

## What each adapter preserves, and what it refuses to assume

**ERCOT.** Net coincident and non-coincident seasonal peaks for the eight weather zones and for ERCOT as a whole; monthly peaks; and the annual summer peak re-run against each historical weather year 2008–2023 plus the 90th-percentile case, each as its own scenario. The Adjusted and TSP Provided forecasts carry different large-load treatments and are never merged. Two things are deliberately absent: the hourly XLSB workbooks, because XLSB is binary BIFF12 and the reader does not decode it, so there is no ERCOT hourly profile rather than one synthesised from peaks; and the energy column of the monthly workbook, whose header reads "Annual Energy" on rows that are one month each — the twelve values sum to the annual total, so the label is a naming artifact, but that is an inference and Urdais does not publish a number whose own header contradicts its grain.

**PJM.** The pjm.com data workbook, never Data Miner, which carries a derived-data ban and is a different interface under different terms. Monthly peak and monthly energy for every zone, the aggregate sub-regions, and `PJM_RTO`; only the RTO sheet produces a balancing-authority point, so no zone can masquerade as the market. Tables B-11 and B-12, which carry the headline unrestricted seasonal peaks, are **not** read: their year headers are merged across a leading column that holds a value with no label, so a column-to-year mapping cannot be established without assuming which year that column belongs to. Restricted-versus-unrestricted is recorded as unspecified because the data workbook does not state it.

**CAISO via the CEC.** Only `TAC = CAISO`; California statewide demand and the individual utility planning areas are different footprints and are not substituted. `MANAGED_NET_LOAD` is the canonical value and every component the CEC publishes — data centres, behind-the-meter PV and storage, AAEE, AAFS — is retained in the raw record, so the decomposition stays queryable without a second canonical point competing for the same period. Planning, Local Reliability and Local Reliability with Known Loads are three scenarios, and the Known Loads adder is recorded in the scenario assumptions.

**ISO-NE.** The 0.5 and 0.1 exceedance columns of the CELT forecast distribution — 50/50 and 90/10, the two cases the region plans against. They are located by matching the probability printed in the header row, not by column position, and the adapter fails if either is missing or named twice. The gross-versus-reconstituted split is not asserted: sheet 1.6 states no basis, and the basis lives on other sheets, so `load_basis` is recorded as unspecified rather than assumed.

## Not ingested, and why

**NYISO — format.** The 2026 Gold Book is a PDF and NYISO publishes no machine-readable companion for the load tables; the Gold Book resources page returns 404 and the document library renders client-side. Recovering Baseline, Higher Demand and Lower Demand peaks would mean reconstructing table structure from PDF text positioning, which is not deterministic extraction, and PD-3C does not hand-transcribe numbers into a parser. Unblocked by a NYISO-published workbook or CSV.

**SPP — format, and rights regardless.** The 2026 Summer Resource Adequacy Report is a 43-page PDF with no workbook counterpart; the LRE submissions behind it are not public. The same objection applies. SPP would remain internal-only in any case: its determination prohibits public display without express written authorization, which Urdais does not hold.

**MISO — out of scope and blocked twice.** Excluded from this phase by instruction, and blocked on both rights and methodology as PD-3B recorded.

## Schema changes this phase needed

1. **Monthly grain** (`target_month`). ERCOT, PJM and the CEC all publish monthly; without it the choices were to aggregate (inventing an annual peak nobody stated) or to discard.
2. **`period_energy`** peak type, so a monthly energy figure need not claim to be annual.
3. **Archive provenance** on raw records, because a cell reference without the archive member it sits in does not identify a cell.
4. **`production_approved_under_accepted_risk`.** The registry gates production on a terms review that concluded `permitted` — which the four ambiguous sources will never satisfy, since that is what ambiguous means. The new state says Urdais authorised collection under its founder-accepted-risk policy and nothing more. It does not touch `terms_review_state`, it cannot be applied to a source whose terms were reviewed and refused, and it changes no rights classification. ERCOT, whose terms carry an affirmative grant, is approved outright.

## Rights

Unchanged from PD-3B and re-verified against the ingested data: ERCOT publishes with attribution; PJM, CAISO and ISO-NE publish under founder-accepted risk with their `ambiguous_requires_legal_review` classification and unresolved issue intact; SPP and MISO are blocked. Every retrieval freezes the determination in force for all four use purposes at collection time.
