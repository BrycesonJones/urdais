# Urdais Grid Buildout Velocity

**Version 1.0.0.** Approved. This document defines what Urdais publishes as Grid Buildout Velocity, the rules that produce each figure, and what those figures do not mean.

Grid Buildout Velocity measures how quickly tracked transmission infrastructure progresses into physical service, and how delivery schedules move over time, using each market's own project records.

It is a count-and-duration product, not a capacity product. It does not measure generation waiting to interconnect, operational transfer margin, or whether forecast demand exceeds approved capacity — those are the Interconnection Queue, Transmission Headroom and Power Delivery Gap.

---

## 1. The four layers

Every figure here is the end of a chain, and the layers are kept apart deliberately.

| Layer | What it is | Who decides it |
| --- | --- | --- |
| **Source fact** | A cell in a publisher's workbook, verbatim | The publisher |
| **Canonical fact** | That cell typed, dated and given provenance, with absence preserved as absence | Ingestion |
| **Methodological classification** | A rule in this document applied to canonical facts | This methodology, at this version |
| **Derived output** | A metric computed from classified facts | This methodology, at this version |

Ingestion never resolves ambiguity. Where a source is genuinely unclear, the canonical record keeps the ambiguity and records it; only this document resolves it, and only at a stated version. A rule that is not written here is not a rule.

---

## 2. Analytical universe

**Markets.** ERCOT and CAISO only.

| Market | Source | Role |
| --- | --- | --- |
| ERCOT | Transmission Project and Information Tracking (TPIT), public cost-stripped workbook | Completion throughput and backlog |
| CAISO | Transmission Development Forum, Approved Projects (Transmission Planning Process) workbook | Schedule slip |

The two markets support different metrics and are **never combined**. ERCOT publishes an actual in-service date and can say how many projects were energised; CAISO publishes none and has eight in-service rows out of 233, but carries fifteen dated revisions of every expected date. There is no Grid Buildout Velocity total, index, or cross-market figure, and none may be derived from what is published.

MISO and SPP are excluded: their trackers are the cleanest in the matrix and their terms forbid commercial publication. PJM has no confirmed machine-readable export. NYISO publishes no portfolio. ISO-NE is deferred.

**Vintage.** Each metric is computed against one snapshot per market — the most recent successfully ingested artifact for that source interface. A metric never mixes vintages.

**Record eligibility.** A canonical project observation enters the universe when it belongs to the selected snapshot, carries a durable project identity, and cites the raw row it came from. Rows failing any of these are excluded and counted, never silently dropped.

**Driver exclusion.** Observations classified `generator_interconnection` or `load_interconnection` are excluded from every published metric. Those classes require explicit publisher evidence — a printed interconnection-request number, or a publisher's own driver field. Wording alone never classifies, so a row that merely mentions solar or storage remains `unknown` and **is included**; excluding it would let a keyword silently shrink the series. The count of `unknown` driver rows is published with every metric as a coverage disclosure.

---

## 3. Units and semantics

**Unit.** Project counts, and durations in days. Nothing else.

No mileage is summed, averaged or published as a quantity. No cost is published; ERCOT withholds per-project cost from the public file by design and CAISO's forum excludes cost entirely. No transfer capability is published, because no market tracker reports it.

**Geography.** A project belongs to the market whose operator tracks it. No sub-market geography is published in 1.0.0, and no project is attributed to two markets.

**Time.** All dates are calendar dates in the publisher's own terms. ERCOT instructs its transmission service providers to report Month/Year, so ERCOT dates are treated at **month precision** and a day component is not asserted. CAISO reports day-precision dates. Periods are calendar years unless a figure names another period.

---

## 4. Missing values, reported zeroes, and ambiguity

Three states are distinguished throughout and never collapsed:

1. **Reported value** — the publisher supplied something, *including a zero*.
2. **Not reported** — the field was empty.
3. **Sentinel** — the publisher wrote a placeholder where a value belongs.

**A reported zero is data.** It is an affirmative statement by the publisher that the quantity is nil, and it is never converted to missing or unknown.

**An empty field is not a zero.** It is never coerced into one. Only genuinely absent values enter missing-value treatment.

**A bare year is a year, not a day.** Publishers sometimes write `2035` into a date column when they know a target only to the year. That is a reported value at **year precision**, and it is stored as such. It is never read as a spreadsheet serial — doing so turns `2035` into 27 July 1905 — and it is never given an invented day. Sixty-nine of CAISO's 233 approval targets are written this way.

**A sentinel is not a value.** ERCOT writes year 9999 into the actual in-service column of a project it lists as complete but has not dated. That makes the **date** unknown. It does not make the **lifecycle** unknown: the project remains in service, because the publisher's own list says so. A defect in one field never rewrites a state asserted by another.

---

## 5. ERCOT works character

Applies to M3.

ERCOT publishes two optional mileage columns, `Trans Circuit Miles New` and `Trans Circuit Miles Rebuilt, Reconductored or Upgraded`. Classification uses **whether each was reported**, then its value. It does not use `value > 0` alone.

| Both reported? | New | Rebuilt | Class |
| --- | --- | --- | --- |
| yes | > 0 | not > 0 | `new` |
| yes | not > 0 | > 0 | `rebuilt_or_reconductored` |
| yes | > 0 | > 0 | `both` |
| yes | 0 | 0 | `none_reported_zero` |
| **no** — either column empty | — | — | `unknown_unclassified` |

`none_reported_zero` means the publisher affirmatively reported no line mileage. These are substation, transformer, breaker and reactive projects, and they are the majority of ERCOT completions. They are a class, not a gap.

`unknown_unclassified` means at least one column was empty, so the row cannot be classified at all. This class is **published whenever it is non-zero**, with its count, and is never suppressed by a sample floor: it is a data-quality disclosure rather than a statistic.

A mileage magnitude decides a label and is never itself published.

> **Superseding note.** The GBV-1 design document specified `neither > 0 → unknown_unclassified`, which put roughly two thirds of ERCOT completions into the unknown bucket. Parsing the workbook showed that service providers overwhelmingly write an explicit `0` rather than leaving the cell empty, so that rule conflated an affirmative zero with silence. **Version 1.0.0 adopts the `is_reported` rule above and supersedes the GBV-1 wording.**

---

## 6. CAISO analytical project identity

Applies to M4 and M5.

CAISO's workbook carries one sheet per participating transmission owner. Sixteen `TP Project ID` values appear on more than one owner sheet — for example `1718-R-11` on PG&E, SCE and VEA/GLW — covering nineteen occurrences beyond the first. These are one project whose work is shared between owners, not several projects.

Ingestion preserves every occurrence and records the ambiguity. This methodology resolves it for counting, as follows.

**Rule.** Within one CAISO snapshot, canonical occurrences sharing an identical `TP Project ID` resolve to **one analytical project**. The analytical project's identity is that `TP Project ID`.

**Bounds.** The rule is confined to what the evidence already established:

- It applies **only to CAISO**, and only within a single snapshot.
- Identity is **exact string equality** of the publisher's own identifier. No normalisation, no case folding, no fuzzy matching, no similarity on names, endpoints or dates.
- It groups **nothing else**. Two projects with similar names and different identifiers stay two projects.
- No canonical row is deleted, merged, rewritten or mutated. Resolution exists only in the analytical layer.

**Provenance.** Every analytical project records each contributing canonical occurrence, its owner and its raw-record lineage, so a reader can see exactly which rows produced one counted project.

**Value selection.** Where contributing occurrences disagree on a date used by a metric, the analytical project takes the value from the occurrence whose owner sorts first by the publisher's own sheet order, and the disagreement is recorded. Disagreements are reported, not averaged: averaging two owners' expectations would invent a date neither published.

**Effect.** CAISO's 233 canonical occurrences resolve to **214 analytical projects**: 16 identifiers carry 19 occurrences beyond their first. A distinct-project count that ignored this rule would overstate the portfolio by those 19.

---

## 7. The metrics

Every metric is computed against one snapshot, carries this methodology version, and fails rather than publishes if it cannot satisfy its output contract.

### M1 — ERCOT projects entering service, by period

**Definition.** Count of distinct ERCOT projects whose lifecycle is `in_service` by authoritative list membership and whose actual in-service date is a usable date falling in the period.

- **Numerator:** eligible projects with `date_quality = reported` on `actual_in_service`, grouped by the calendar year of that date.
- **Denominator:** none. This is a count.
- **Floor:** none. A period with zero completions is publishable and meaningful.
- **Excluded and counted separately:** projects in service carrying a sentinel date. They cannot be placed in any period. They remain in service everywhere else, including M2.
- **Scope:** ERCOT only.

**Published caveat.** ERCOT's Completed sheet is a rolling window, not a cumulative census. The current vintage spans 2025–2026 only, so early periods are not comparable with later ones until forward snapshots accumulate.

### M2 — ERCOT active backlog by lifecycle class

**Definition.** Count of ERCOT projects in each of `under_construction`, `planned` and `proposed` as of the snapshot.

- **Date:** the snapshot's retrieval instant, not any project date.
- **Point-in-time only.** M2 is a stock, never a rate, and is never differenced across vintages to imply a flow.
- **Unknown:** projects whose lifecycle could not be classified are counted as `unknown` and shown.
- **Scope:** ERCOT only.

### M3 — ERCOT completions by service level and works character

**Definition.** A labelled decomposition of M1's population as counts, along two independent axes: `Service Level kV`, and works character per §5.

- **Counts only.** No mileage is summed.
- **Floor:** a kV class with fewer than five completions in the period is suppressed. `unknown_unclassified` is never suppressed.
- **Scope:** ERCOT only.

### M4 — CAISO schedule slip against the approved in-service date

**Definition.** For each analytical CAISO project (§6), the difference in days between the current expected in-service date and the in-service date recorded when the transmission plan was approved.

- **Sign:** positive means later than approved, i.e. slip. Negative means earlier.
- **Population:** analytical projects excluding those whose lifecycle is `cancelled`.
- **Published as a distribution** — median, first and third quartile, minimum, maximum, and the count. **Never a single headline number.**
- **Floor:** 12 analytical projects. Below that, no distribution is published, consistent with the percentile floor used in Transmission Headroom.
- **Excluded and counted:** projects missing either endpoint date, or holding a sentinel at either endpoint.
- **Minimum precision.** M4 includes only projects for which **both** comparison dates meet the precision the metric requires, which is day precision. A record whose endpoint is given only to the year **remains in the analytical universe** and is counted everywhere else; it is excluded from M4 alone and reported as a coverage exclusion.

  Such a record is **not defective**. The publisher supplied a valid value at a coarser precision than this metric can consume. Computing a slip in days from a year would require choosing a day the publisher never gave, fabricating up to 364 days of precision; comparing at year granularity would change M4's unit and its statistical meaning into a different metric. Version 1.0.0 does neither, and publishes the excluded count so the coverage is visible.
- **Scope:** CAISO only.

Quartiles use linear interpolation between order statistics.

### M5 — CAISO on-hold and cancelled counts, with published reasons

**Definition.** Counts of analytical CAISO projects whose lifecycle is `cancelled`, together with the publisher's verbatim reason text where one is given.

- Reasons are reproduced as published. **No reason taxonomy is invented**, and no reason is paraphrased or grouped.
- Projects whose status text CAISO publishes but which this methodology does not map remain unmapped and are counted as such.
- **Scope:** CAISO only.

> **Limitation stated in the metric.** CAISO's `Project Status` is uncontrolled free text — four spellings of "in-flight", two of "in service". Only an unambiguous cancellation is canonicalised. M5 therefore reports cancellations reliably and **cannot report an on-hold count**, because "On Hold" and "On Hold (CAISO)" are not a controlled vocabulary this methodology is willing to treat as one state. The on-hold half of the original M5 intent is **deferred to a later version**.

---

## 8. Validation

**Domain validation, before calculation.** A calculation refuses to start when its inputs are impossible rather than merely absent: a negative mileage, a date outside 1900–2200, a market outside the universe, a snapshot without lineage, an analytical identity collision, a quantity marked unreported that carries a value, or a duplicate-resolution group whose members do not share their identifier. Malformed canonical data is never coerced into valid analytical data.

**Output validation, before publication.** Every figure must be finite — no `NaN`, no infinity — with counts non-negative and integral, shares between 0 and 1, components summing to their total, quartiles ordered, any numerator no greater than its denominator, a registered methodology version present, and provenance sufficient to trace the figure back to canonical rows. A figure that cannot satisfy its contract is **not published**; the run fails.

**Methodology authorisation.** A calculation intended for publication proceeds only when this version is registered `approved` in the methodology registry, with a content digest matching the document the code was written against. Authorisation is a registry check. The presence, absence or contents of this file at runtime grant nothing.

---

## 9. Known limitations

1. **No cross-market figure exists**, and the two markets measure different things. Any comparison between them is the reader's inference, not Urdais's statement.
2. **ERCOT completion history is short.** The Completed sheet is a rolling window covering 2025–2026 in the current vintage, and the public archive stops in 2014. Depth accumulates forward.
3. **ERCOT approval dates are Tier 1–3 only** and populated on under a fifth of completions, so no approval-to-service duration is published at version 1.0.0.
4. **CAISO has no actual in-service date.** M4 measures expectation against expectation, not delivery.
5. **Roughly thirty percent of CAISO approval targets are given only to the year** — 69 of 233 — and cannot enter M4, which needs day precision at both endpoints. Those records are valid and remain in the universe; the published distribution describes the day-precision subset rather than the whole portfolio, and the excluded count is published beside it.
6. **CAISO construction start is expected, not actual.** No construction-to-service duration is published in any market, because none publishes an actual start.
7. **Driver classification under-claims deliberately.** Rows that read as interconnection-driven but carry no publisher evidence stay `unknown` and are included; the count is disclosed.
8. **The `unknown_unclassified` works-character class cannot be reduced** without a publisher statement that an empty mileage cell means zero.
9. **CAISO on-hold is not reported** (§7, M5).
10. **Per-project cost is unavailable in both markets** and no cost figure is published.

---

## 10. Versioning

This document is version **1.0.0**. An approved methodology version is never edited in place. A change to any rule here produces a new version with its own approval and its own digest; published figures record the version that produced them, and figures produced under different versions are not comparable without saying so.

Attribution accompanies every published figure: ERCOT figures credit ERCOT's Transmission Project and Information Tracking report, CAISO figures credit the CAISO Transmission Development Forum approved-projects workbook.
