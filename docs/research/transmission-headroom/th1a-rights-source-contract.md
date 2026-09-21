# Transmission Headroom TH-1A: rights and source-contract closure

**Status: internal research document.** Not a methodology, not routed publicly, not registered in the docs catalog. It approves no metric, creates no source right, and no production table or surface reads it. Prepared 21 September 2026 against `main` at `42106f6`.

TH-1 recommended NYISO and ERCOT as the first implementation tranche. This phase re-fetched both sources from scratch rather than trusting TH-1's notes, and that decision paid for itself: **one TH-1 conclusion was wrong and is corrected here**, and three new traps were found.

## Corrections to TH-1

| TH-1 said | TH-1A found |
|---|---|
| ERCOT `ConstraintID` is a stable source-native identifier | **False.** It is a per-interval handle. 28 IDs map to multiple names; 71 names map to multiple IDs. Identity must be `(ConstraintName, ContingencyName)`. |
| ERCOT `CCTStatus` is `NONCOMP` on all rows | **Sampling artifact.** Across 9 artifacts it is `NONCOMP` 753 / `COMP` 463. |
| NYISO usable history begins "between 2006 and 2010" | **2005-02-01**, exactly. |
| NYISO cadence is "a clean 288 × 5 minutes" from 2010 | **False.** It is an irregular event series: off-grid stamps and skipped slots occur daily. |

---

## 1. NYISO source contract

| Property | Value |
|---|---|
| Interface | NYISO Market Information System — External Limits and Flows |
| Current URL | `https://mis.nyiso.com/public/csv/ExternalLimitsFlows/YYYYMMDDExternalLimitsFlows.csv` |
| Archive URL | `https://mis.nyiso.com/public/csv/ExternalLimitsFlows/YYYYMM01ExternalLimitsFlows_csv.zip` (whole month) |
| Scheme | **HTTPS works** and should be preferred; TH-1 used HTTP |
| Auth | none — no account, cookie, token or JavaScript |
| Format | CSV, `text/csv`, UTF-8, header row |
| Directory listing | **403** — filenames must be constructed, not discovered |
| Retrieval provenance | `Last-Modified` header present (e.g. `Mon, 21 Sep 2026 04:35:04 GMT`) |
| Columns | `Timestamp`, `Interface Name`, `Point ID`, `Flow (MWH)`, `Positive Limit (MWH)`, `Negative Limit (MWH)` |
| Header stability | Byte-identical in every month sampled from 2002-01 to 2026-09 |
| Unit | Header says **MWH**; the values are instantaneous MW. Record the publisher's label, publish as MW. |
| Timestamp | Local clock, `MM/DD/YYYY HH:MM` (with `:SS` before 2005-02). No timezone, no UTC offset. |
| Identity | `Point ID` (numeric) |
| Native key | `(Point ID, Timestamp)` — verified unique: 0 duplicates in 5,491 rows |

**Verified 2026-09-20 (full day):** 301,766 bytes, 5,491 rows, 19 interfaces, 289 timestamps, every interface present at every timestamp.

### Cadence is an event series, not a grid

The 289 timestamps in a day are **not** 288 five-minute slots:

```
off-grid stamps:  04:39, 04:41, 17:37
skipped slots:    04:45, 17:50
observed gaps:    5 min ×281, and one each of 1, 1, 2, 3, 4, 9, 10 min
```

**Contract consequence:** model an observation *instant*, not an interval. Do not synthesise a 5-minute grid, do not forward-fill, and do not assume 288 rows per interface per day. Deduplicate on `(Point ID, Timestamp)`.

---

## 2. NYISO sentinel rule

### The deterministic rule

```
A limit is a SENTINEL if and only if  abs(value) == 9999   (exactly)
```

Nothing weaker is safe. Across every month sampled, the only raw strings in the 9000–10000 band are:

| Raw string | Count | Meaning |
|---|---:|---|
| `9999` | 61,438 | sentinel |
| `-9999` | 17,412 | sentinel |
| `-9899` | 4,074 | **a real limit**, on `SCH - HQ_IMPORT_EXPORT` only |

**The maximum genuine limit observed is 9,899 MW — 100 MW below the sentinel.** A threshold rule such as `abs(limit) >= 9000` would discard 4,074 real observations. Use exact equality.

### The three representations, and what each means

| Representation | Meaning | Handling |
|---|---|---|
| `abs(limit) == 9999` | direction not monitored | **no headroom in that direction**; state `unmonitored_direction` |
| `limit == 0` | a real limit of zero — no flow permitted that way | real; headroom is genuinely 0 |
| real non-zero | enforced limit | compute |
| blank / non-numeric | **never observed** in any sampled month | treat as a parse failure, not as zero |

Flow is never blank: `flow_blank = 0` in every month sampled.

### Era map, with exact boundaries

| Era | Span | Positive limit | Negative limit | Timestamp |
|---|---|---|---|---|
| **1 — unusable** | 2002-01-01 … **2005-01-31** | `9999` on every row | `9999` on every row (unsigned!) | irregular, with seconds |
| **2 — real, unsigned-free** | **2005-02-01** … 2007-10 | real / zero | real / zero, no sentinel | clean `HH:MM` |
| **3 — signed sentinel appears** | **2007-11** onward | real / zero | real / zero / `-9999` | clean |
| **4 — positive sentinel returns** | by 2020 (exact onset unresolved) … current | real / zero / `9999` | real / zero / `-9999` | clean |

Era 1 is the trap: the negative column holds **positive** `9999`, so a rule keyed on `-9999` alone would read era-1 negative limits as a real 9,999 MW limit. The exact-magnitude rule handles all four eras.

Boundary verified day by day: every file in December 2004 and January 2005 is entirely sentinel; 2005-02-01 onward is entirely real.

---

## 3. NYISO history boundary and backfill start

**Recommended TH-2 backfill start: `2005-02-01`.**

That single date is where three things change together — real limits appear, the unsigned-`9999` convention ends, and timestamps become clean `HH:MM`. Before it, no limit is published at all, so no headroom exists to compute and the files should not be ingested merely because they return HTTP 200.

- Monthly archives: **260** (2005-02 through 2026-09)
- Archive size: ~600–715 KB each, ~31 daily CSVs per archive
- Expected volume: ~19 interfaces × ~289 observations/day × ~7,900 days ≈ **43 million observations**, of which roughly 82% yield a computable margin

---

## 4. NYISO entity subtype — unresolved, and deliberately so

The file mixes two kinds of entity: internal transfer interfaces (`TOTAL EAST`, `CENTRAL EAST - VC`) and scheduled external ties (`SCH - PJM_NEPTUNE`, `SCH - HQ - NY`).

**The source publishes no structured subtype field.** Three candidate discriminators were tested and all fail:

1. **Name prefix `SCH - `** — a name heuristic, and names are provably unstable (§5).
2. **Point ID range** — fails. External ties `SCH - PJ - NY` (23316), `SCH - OH - NY` (23317), `SCH - NE - NY` (23318) and `SCH - HQ - NY` (23324) sit inside the low internal-series range.
3. **A separate NYISO interface catalogue** — the MIS directory listing returns **403** and the MIS root is a frameset for LBMP results. None found.

**Recommendation: record `Interface Name` and `Point ID` raw and implement no subtype classifier.** This is logged as unresolved rather than silently guessed.

It matters more than it looks — see §6.

---

## 5. NYISO identity: names change, Point IDs do not

Across the sampled months, **8 of 25 Point IDs were renamed**, some twice:

| Point ID | Name history |
|---|---|
| 23316 | `PJM-NYPP` → `PJM-NYISO` → `SCH - PJ - NY` |
| 23317 | `OH-NYPP` → `IMO-NYISO` → `SCH - OH - NY` |
| 23318 | `NEPEX-NYPP` → `ISONE-NYISO` → `SCH - NE - NY` |
| 23324 | `HQ - NYPP` → `HQ - NYISO` → `SCH - HQ - NY` |
| 23315 | `UPNY-CONED` → `UPNY CONED` |
| 23320 | `DUNWOODIE SOUTH` → `SPR/DUN-SOUTH` |
| 325154 | `NPX_CSC` → `SCH - NPX_CSC` |

And the inverse trap, which is worse:

> **`CENTRAL-EAST` (23313) ends 2005-01 and `CENTRAL EAST - VC` (23330) begins 2005-02.** These are *different Point IDs*. A name-similarity matcher would merge them into one continuous series across an identity change. A Point ID matcher correctly treats them as two entities.

Nine Point IDs (23321–23325, 23331–23334 — Astoria, In City 345/138, East River, Staten Island) appear only in 2003-01 and then retire.

**Rule: identity is `Point ID`. `Interface Name` is a display attribute that may change under a stable ID, and must never be used to match.**

---

## 6. NYISO direction formula

Select the limit by direction **first**, then measure. Never take an absolute value before selection.

```
SENTINEL = 9999

if flow > 0:
    if abs(positive_limit) == SENTINEL:  state = unmonitored_direction, headroom = null
    else:                                headroom = positive_limit - flow
elif flow < 0:
    if abs(negative_limit) == SENTINEL:  state = unmonitored_direction, headroom = null
    else:                                headroom = abs(negative_limit) - abs(flow)
else:  # flow == 0
    state = zero_flow_direction_undetermined, headroom = null
```

Raw signed `flow`, `positive_limit` and `negative_limit` are all retained unchanged; the absolute value is used only *inside* the negative branch, after the direction is already known.

**Tested against the full 2026-09-20 day (5,491 rows):**

| Outcome | Rows | Share |
|---|---:|---:|
| `ok` (headroom computed) | 4,481 | 81.6% |
| `unmonitored_direction` | 578 | 10.5% |
| `zero_flow_direction_undetermined` | 432 | 7.9% |
| negative headroom (over limit) | 0 | — |
| exactly zero headroom | 1,218 | — |

`unmonitored_direction` resolves to exactly two interfaces: `WEST CENTRAL` (flowing positive against a `9999` positive limit) and `SCH - HQ_IMPORT_EXPORT` (flowing negative against a `-9999` negative limit).

---

## 7. NYISO zero, dead and unavailable — four distinct states

The 1,218 zero-headroom rows are **not** noise, and they are **not** congestion either:

| Interface | Zero-headroom rows |
|---|---:|
| SCH - PJM_NEPTUNE | 289 (all day) |
| SCH - PJM_VFT | 263 |
| SCH - PJM_HTP | 260 |
| SCH - HQ - NY | 252 |
| SCH - HQ_CHPE | 131 |
| SCH - NPX_CSC | 23 |

Every one is an HVDC or controllable merchant tie sitting at exactly its rating (Neptune 660.0 against a 660 limit, all 289 observations). **On a scheduled controllable tie, flow == limit is routine full scheduling, not congestion.** On a free-flowing AC interface such as TOTAL EAST, the same arithmetic would mean the interface is constrained.

This is why §4's unresolved subtype matters: **a headline such as "N interfaces at their limit" would be materially misleading** while the two kinds cannot be separated from source-native fields. TH-2 must not publish such a count.

The four states to keep distinct:

| State | Definition | Published as |
|---|---|---|
| `ok`, headroom 0 | flow equals the applicable real limit | `0.0` — a real measurement |
| `unmonitored_direction` | applicable limit is a ±9999 sentinel | **null with a state**, never `0` |
| `zero_flow_direction_undetermined` | `flow == 0`, so no direction applies | **null with a state**, never a one-sided number |
| real zero limit | limit is genuinely `0` (e.g. `SCH - HQ_CEDARS` negative limit) | a real constraint of zero |

**A "dead tie" is not an observation-level state.** `SCH - HQ_CEDARS` (limits 49 / 0, flow 0.0 for all 289 observations) *looks* inactive, but the source publishes no in-service flag, and inactivity is a property of a run of observations rather than of one row. Record each row honestly as `zero_flow_direction_undetermined`; any "inactive" characterisation is a separate derived judgement and is out of scope for TH-2.

---

## 8. NYISO rights

**Terms reviewed first-hand:** `https://www.nyiso.com/legal-notice`. The MIS host carries no separate terms — `https://mis.nyiso.com/public/` is a frameset titled "LBMP Results Index", the CSV files contain no disclaimer row, and the HTTP response carries no licence header.

Relevant wording:

> "Copyright © 2026 New York Independent System Operator. All Rights Reserved."
>
> "Access to this Web site does not confer any license or ownership interest in either the form or content of the Web site."
>
> "Downloading, republishing, retransmitting, reproducing, or other use of **any image or video** on this website as a stand-alone file is strictly prohibited."
>
> "The NYISO's trademarks (including its logo) are owned by the NYISO and may only be used with the NYISO's prior written permission."

The reproduction prohibition is scoped explicitly to images and video. There is **no affirmative grant** covering data and **no explicit prohibition** on data. No attribution text is specified.

**Classification: `ambiguous_requires_legal_review`.**

This falls under the existing Urdais founder-accepted-risk policy for public derived display — the same posture, reached independently, as the NYISO Interconnection Queue interface. The classification is **not** relabelled as cleared: it remains ambiguous, and publication proceeds under recorded accepted risk.

---

## 9. ERCOT source contract

| Property | Value |
|---|---|
| Report | `NP6-86-CD` — SCED Shadow Prices and Binding Transmission Constraints |
| `reportTypeId` | `12302` |
| Listing | `https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302` |
| Download | `https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId=<id>` |
| Auth | none |
| Format | CSV inside ZIP, one CSV per ZIP; XML twin published alongside |
| Artifact name | `cdr.00012302.0000000000000000.<YYYYMMDD>.<HHMMSSmmm>.SCEDBTCNP686_csv.zip` |
| Cadence | hourly artifact, "when needed"; each carries several 5-minute SCED intervals |
| Display duration | **7 days** (ERCOT's own product page) |
| Columns | `SCEDTimeStamp`, `RepeatedHourFlag`, `ConstraintID`, `ConstraintName`, `ContingencyName`, `ShadowPrice`, `MaxShadowPrice`, `Limit`, `Value`, `ViolatedMW`, `FromStation`, `ToStation`, `FromStationkV`, `ToStationkV`, `CCTStatus` |

**Verified across 9 artifacts spanning 2026-09-14 → 2026-09-21:** 1,216 rows, 85 distinct SCED timestamps, header identical in all nine.

`doclookupId` is **stable within the window**: re-fetching the same id returned a byte-identical 5,810-byte ZIP.

`RepeatedHourFlag` was `N` on all 1,216 rows — the DST-repeat case was not observed and its handling is unverified.

---

## 10. ERCOT identity — `ConstraintID` is not an identifier

```
ConstraintIDs mapping to more than one ConstraintName:  28
ConstraintNames mapping to more than one ConstraintID:  71
```

`ConstraintID` 1 appears as `138_ALV_NAL_1`, `1710__B`, `361T361_1`, `NELRIO`, `BANDER_AT3` and a dozen more. `NELRIO` appears under IDs 2, 3, 4, 12, 13, 15, 17, 25, 26 and 27. It is a per-SCED-run handle, not an entity key.

**Identity must be the composite `(ConstraintName, ContingencyName)`**, because the same monitored element under a different contingency is a different constraint with a different limit. `ConstraintID` is retained as raw native metadata only.

This directly corrects TH-1, which recorded `ConstraintID` as stable.

---

## 11. ERCOT population — what makes a row appear

`ContingencyName` splits **142 `BASE CASE` / 1,074 named** across the sample. `ShadowPrice > 0` on 443 of 1,216 rows, and margin ≤ 0 on 444.

Rows appear for constraints SCED was **actively managing** in that interval — binding *and* monitored-but-not-yet-binding, since 773 rows carry `ShadowPrice = 0` and positive margin. It is therefore broader than "binding only" but far narrower than the network: 30 constraints in one interval against thousands of ERCOT elements.

**The population is "constraints ERCOT's real-time dispatch was tracking", not "ERCOT's transmission network".** Product copy must say so.

### The ERCOT sentinel, which is softer than NYISO's

Seven rows carry a `Limit` above 10,000 MW: `85999.1` (×5) and `84999.1` (×2), all on the `EASTEX` base-case constraint with `ShadowPrice = 0`. A limit of 86 GW is not a thermal rating — it is a constraint left monitored with its limit effectively disabled. Taking it at face value yields **83,449 MW of "headroom"**.

Unlike NYISO's exact `9999`, ERCOT's disabled limits are **not a single magic value**, so no exact-equality rule exists. TH-2 must apply a plausibility bound (no ERCOT thermal limit approaches 10 GW; the largest genuine `Limit` in the sample is 3,263 MW on the `Value` side and the real limits cluster far below) and must record such rows as `limit_implausible` rather than silently dropping or publishing them. **This is a weaker rule than NYISO's and must be documented as such.**

---

## 12. ERCOT `CCTStatus`

**Resolved.** `CCTStatus` is the **Constraint Competitiveness Test** result: `COMP` = competitive constraint, `NONCOMP` = non-competitive. The CCT evaluates whether enough competition exists to resolve a constraint, and governs **market-power mitigation** — it is tested before each SCED execution and determines whether offer mitigation applies.

Observed: `NONCOMP` 753, `COMP` 463.

It is **orthogonal to headroom**, which the data confirms — it occurs in all four combinations of contingency kind and binding state:

| | BASE CASE | named |
|---|---:|---:|
| `NONCOMP` | 91 | 662 |
| `COMP` | 51 | 412 |

**It does not change limit semantics and must not gate eligibility.** Preserve as native metadata.

---

## 13. ERCOT direction

Across 1,216 rows: **0 negative `Limit` values and 0 negative `Value` values.** `Limit` ranged 29.40 … 85,999.10; `Value` ranged 24.00 … 3,263.40.

ERCOT publishes the monitored element's flow already oriented into the direction the constraint protects, so:

```
headroom_mw = Limit - Value
```

is valid directly for every eligible row, with **no direction selection and no absolute value**. The element's physical orientation is not published, so no directional label can be attached — and none should be invented.

`ViolatedMW` equals `-(Limit - Value)` to within 0.1 MW rounding and is redundant; keep it raw as a cross-check.

---

## 14. ERCOT contingency model

Model as a first-class enum, never collapsed:

| Kind | Source value | Meaning |
|---|---|---|
| `base_case` | `ContingencyName == 'BASE CASE'` | margin with the system intact |
| `post_contingency` | any other value, e.g. `XBAL89`, `SBLURDH8` | margin under that specific outage |

The named contingency string must be retained verbatim, because `(ConstraintName, ContingencyName)` is the identity (§10) and the same element under two contingencies carries two different limits.

### Binding state

`ShadowPrice > 0` agrees with margin ≤ 0 on **1,215 of 1,216** rows. The single exception is instructive: `2270__B` under `SBLURDH8` had `Limit = 33.3`, `Value = 33.3`, margin exactly `0.00`, and `ShadowPrice = 0.0`.

**Therefore: do not derive binding from margin, or margin from binding.** Record `ShadowPrice` as the source-backed binding indicator and the margin as the measurement, and let them disagree at the boundary.

---

## 15. ERCOT archive decision

**Forward-only. TH-1's recommendation is confirmed.**

- The listing holds 368 artifacts (184 CSV + 184 XML) spanning exactly 8 dates, 2026-09-14 → 2026-09-21.
- ERCOT's own product page states **Display Duration: 7 days**, Retention Policy: N/A.
- No archive endpoint exists: `data-product-archive?id=NP6-86-CD` → 404; `getReportTypeList` → 404; the alternate listing query returns the same 368 artifacts.
- `doclookupId` is stable within the window (byte-identical re-fetch) but artifacts disappear after ~7 days.
- **No interval appears in more than one artifact** — 85 distinct SCED timestamps, 0 overlaps. Artifacts partition cleanly.
- No corrections or reissues were observed. `RepeatedHourFlag` was `N` throughout.

TH-2 should capture continuously from its first run. The listing should be swept at least daily; a gap longer than ~7 days is permanently unrecoverable.

---

## 16. ERCOT rights

**Terms reviewed first-hand:** `https://www.ercot.com/help/terms`, linked from `https://www.ercot.com/about/legal` ("Use of this site constitutes agreement to our Terms of Use", "© 1996-2026 Electric Reliability Council of Texas, Inc. All rights reserved.").

The decisive wording is an **affirmative grant**:

> "The publicly available contents of this website may be used, reproduced, and redistributed, provided that the contents are not modified and that you maintain all copyright and other notices contained in the contents."
>
> "**Raw data provided in public portions of this website may be used, reproduced, and redistributed in compilations, charts, and analyses without maintaining such notices.**"

With the limits:

> "ERCOT MAKES NO REPRESENTATIONS WITH RESPECT TO SAID INFORMATION AND DISCLAIMS ALL EXPRESS AND IMPLIED WARRANTIES."
>
> "ERCOT does not guarantee the accuracy of any such compilations, charts, or analyses."
>
> The ERCOT logo and trademarks "may not be used without the prior written permission of ERCOT."
>
> ERCOT "reserves the right to change the terms of use contained within this Agreement at any time without notice."

**Classification: `reusable_with_attribution_or_conditions`.**

Conditions: verbatim content must be unmodified with notices retained; raw data in compilations, charts and analyses is explicitly free of the notice requirement; no logo or trademark use; terms may change without notice, so the determination should be re-verified periodically.

This is a genuinely stronger position than NYISO's, and it was reached by reading the terms for this source rather than inheriting the Interconnection Queue's ERCOT determination.

---

## 17. Derived vs raw publication

The two sources differ, and the difference is real rather than cosmetic.

| Purpose | NYISO | ERCOT |
|---|---|---|
| **Raw retention (internal)** | permitted under accepted risk | permitted |
| **Internal calculation** | permitted under accepted risk | permitted |
| **Public raw display** | ambiguous — accepted risk | **permitted**, unmodified, notices retained |
| **Public derived headroom** | ambiguous — accepted risk | **permitted** — an "analysis", notices not required |
| **Public derived utilization** | ambiguous — accepted risk | **permitted** — an "analysis" |

ERCOT's terms are *more* permissive for derived analytics than for verbatim republication, which is the opposite of the usual shape and worth stating explicitly: a derived headroom chart is squarely inside ERCOT's granted "compilations, charts, and analyses".

## 18. Publication gate matrix

Using the existing Urdais rights vocabulary.

### NYISO — `ExternalLimitsFlows`

| Purpose code | Classification | Disposition |
|---|---|---|
| `transmission_headroom_retention` | `ambiguous_requires_legal_review` | permitted (accepted risk) |
| `transmission_headroom_calculation` | `ambiguous_requires_legal_review` | permitted (accepted risk) |
| `public_transmission_headroom_display` | `ambiguous_requires_legal_review` | permitted (accepted risk) |
| `public_transmission_headroom_derived_metric_display` | `ambiguous_requires_legal_review` | permitted (accepted risk) |
| `public_transmission_utilization_display` | `ambiguous_requires_legal_review` | permitted (accepted risk) |

### ERCOT — NP6-86-CD

| Purpose code | Classification | Disposition |
|---|---|---|
| `transmission_headroom_retention` | `reusable_with_attribution_or_conditions` | permitted |
| `transmission_headroom_calculation` | `reusable_with_attribution_or_conditions` | permitted |
| `public_transmission_headroom_display` | `reusable_with_attribution_or_conditions` | permitted, unmodified + notices |
| `public_transmission_headroom_derived_metric_display` | `reusable_with_attribution_or_conditions` | permitted |
| `public_transmission_utilization_display` | `reusable_with_attribution_or_conditions` | permitted |

## 19. Attribution

Neither source specifies required wording. ERCOT's terms waive the notice requirement for raw data used in analyses; NYISO specifies nothing. Urdais should therefore attribute by its own convention, matching the Interconnection Queue pattern:

- **NYISO** — `Source: New York Independent System Operator, Inc., External Limits and Flows.`
- **ERCOT** — `Source: Electric Reliability Council of Texas, Inc., SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).`

Every public surface should additionally carry: source interface name, the observation timestamp, the retrieval timestamp, and the methodology version. **No logo or trademark from either publisher.**

---

## 20. Metric names and product copy

Names must carry the population limitation, not hide it.

| Market | Metric | Why this name |
|---|---|---|
| NYISO | `interface_headroom_mw` | it is a margin on published interfaces |
| NYISO | `interface_utilization_pct` | direction-matched |
| ERCOT | `constraint_margin_mw` | it is a margin on tracked constraints |
| ERCOT | `constraint_utilization_pct` | same population caveat |

**Rejected: `network_headroom` for either market.** Neither source observes a network.

### Product copy

> **NYISO — Interface headroom.** Remaining operating margin on the nineteen transmission interfaces NYISO publishes, in the direction power is actually flowing. It covers those published interfaces only, not every line in New York, and a direction NYISO does not monitor is reported as unavailable rather than as zero.

> **ERCOT — Constraint margin.** Remaining margin on the transmission constraints ERCOT's real-time dispatch was actively tracking, under the specific contingency each one protects against. ERCOT publishes these only while a constraint is being managed, so this describes where the grid was tight — not how much room the network has overall.

---

## 21. TH-2 hard invariants

1. A margin may only be formed from a flow and a limit sharing market, source interface, entity, observation instant and direction.
2. A sentinel limit never produces a margin. NYISO: `abs(limit) == 9999` exactly. ERCOT: a limit failing the plausibility bound is `limit_implausible`.
3. An unavailable or undetermined direction is `null` with a state, never `0`.
4. Negative margin is preserved with its sign and never clamped.
5. Direction is selected before any absolute value is taken.
6. ERCOT `contingency_kind` (`base_case` / `post_contingency`) is retained and never collapsed.
7. NYISO identity is `Point ID`; `Interface Name` never participates in matching.
8. ERCOT identity is `(ConstraintName, ContingencyName)`; `ConstraintID` is raw metadata only.
9. Raw source values are never overwritten by derived values.
10. No cross-market aggregation of any kind.
11. ATC never enters an operational headroom series.
12. `limit_field_used` is recorded on every derived margin.
13. Binding state comes from the source (`ShadowPrice`), never derived from the margin.
14. No count of "interfaces at their limit" until the NYISO subtype question (§4) is resolved.

---

## 22. Candidate TH-2 schema contract

Research only; no migration is proposed here.

**`transmission_interface`** — `id`, `market`, `native_id` (NYISO Point ID), `native_name`, `first_seen_at`, `last_seen_at`, `subtype` **nullable and unpopulated pending §4**.

**`transmission_element`** — `id`, `market`, `native_constraint_name`, `native_contingency_name`, `contingency_kind`, `from_station`, `to_station`, `from_station_kv`, `to_station_kv`, `first_seen_at`, `last_seen_at`.

**`transmission_limit_observation`** — `id`, `entity_ref`, `direction` (`positive`/`negative`/`undirected`), `observed_at`, `limit_mw_signed`, `limit_field_used`, `limit_state` (`real`/`sentinel`/`implausible`/`zero`), `unit_as_published`, `source_artifact_id`, `source_row_ordinal`.

**`transmission_flow_observation`** — `id`, `entity_ref`, `observed_at`, `flow_mw_signed`, `unit_as_published`, `source_artifact_id`, `source_row_ordinal`.

**`transmission_margin`** (derived) — `id`, `entity_ref`, `direction`, `observed_at`, `headroom_mw` nullable signed, `utilization_pct` nullable, `state` (`ok`/`unmonitored_direction`/`zero_flow_direction_undetermined`/`limit_implausible`), `limit_field_used`, `binding_from_source` nullable, `methodology_version_id`, `publication_state`, `rights_reason`.

Every table carries the source artifact and the source row, so any published number traces to a retrieved file and a line within it.

---

## 23. Backfill horizons

**NYISO** — backfill from **2005-02-01**; 260 monthly archives; irregular event cadence averaging ~289 observations per interface per day; ~43 million observations, ~82% yielding a margin. Do not ingest before 2005-02-01 even though files exist back to 2002-01.

**ERCOT** — **forward-only from the TH-2 first run.** No backfill is possible: the listing is a 7-day rolling window with no archive. Sweep at least daily; a gap beyond ~7 days is permanently lost.

## 24. Readiness

| Source | State | Reason |
|---|---|---|
| **NYISO `ExternalLimitsFlows`** | **`ready_with_founder_risk`** | Source contract fully closed: sentinel rule exact, era boundaries dated, identity proven stable, direction formula tested on a full day. Rights are `ambiguous_requires_legal_review` and publication proceeds under the existing founder-accepted-risk policy. |
| **ERCOT NP6-86-CD** | **`ready`** | Source contract closed, with `ConstraintID` corrected and `CCTStatus` resolved. Rights carry an affirmative grant covering exactly the derived use intended. |

Both may proceed to TH-2.

## 25. Unresolved

1. **NYISO subtype** (§4) — no structured discriminator exists. Blocks any "interfaces at their limit" count, nothing else.
2. **NYISO `-9899`** on `SCH - HQ_IMPORT_EXPORT` — treated as a real limit on the exact-`9999` rule, but 4,074 identical values on a single interface may be another disabled-limit convention. Flag if it recurs.
3. **NYISO era-4 onset** — the positive `9999` sentinel reappears by 2020; the exact month is unbisected. Harmless under the exact rule.
4. **NYISO timezone** — timestamps carry no offset. DST handling and the repeated autumn hour are unverified.
5. **ERCOT implausible-limit bound** — no exact sentinel exists; the threshold is a judgement and must be stated in the methodology rather than buried in a parser.
6. **ERCOT `RepeatedHourFlag`** — `N` on all 1,216 rows; the DST-repeat case is unobserved.
7. **ERCOT terms volatility** — ERCOT may change its terms without notice, so the determination needs periodic re-verification.
8. **Neither source publishes a rating type** (normal / emergency / ambient-adjusted). `limit_field_used` records the column, not the rating class.
