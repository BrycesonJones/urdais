# UTVI Settlement Study — Results

**Generated file. Do not edit by hand** — regenerate with `npm run utvi:settlement-study:report`, which reads the
append-only ledger and touches no network. Method and operation: [settlement-study-runbook.md](settlement-study-runbook.md).

**Status: internal research artifact. Not routed publicly, not registered in the docs catalog.** Read-only. No
production table was written, no migration created, no methodology status changed, no UI touched.
Generated 2026-09-16T02:39:27.431Z.

## The question

Production currently treats the just-closed UTC day as provisional and every older day as final, on the strength of
one afternoon in [Phase 1A](source-characterization.md#12-revision-behaviour--measured): `D−1` accrued ~16 ppm/day while
`D−2` and `D−3` moved by exactly zero over 6.2 minutes. Six minutes shows a day is not *actively* accruing. It says
nothing about a batch correction days later, which is what this study is looking for.

## Progress

| | |
|---|---|
| Runs completed | **1 of 14** |
| Observations recorded | 3 |
| Study started (UTC) | 2026-09-16 |
| Last run (UTC) | 2026-09-16 |
| Runs remaining | 13 |
| Earliest possible completion | 2026-09-28 |
| Missed run dates | None. |

## Settlement verdict

> ### Insufficient evidence
>
> No D−2 observation yet has a prior observation of the same date to compare against. The first comparison becomes available on the study's second run.
>
> **Provisional: 13 of 14 runs still outstanding.**

The rule was fixed before the data was collected. **A**: no `D−2` comparison changes → retain `D−1` provisional /
`D−2` final. **B**: some change, largest below 100 ppm → `D−2` operationally final with
late-revision supersession. **C**: largest above 100 ppm → move finalization to `D−3` or later.

## By day age

Never mixed: each row is one age, and the age is the one at which the change was *detected*.

**`D-1` shows no comparisons, and that is structural rather than a finding.** One run per day means a date is read once at `D-1`, once at `D-2` and once at `D-3`; it is never read twice at the same age, so there is no `D-1` → `D-1` pair to compare. Read the transition table below instead.

| Group | Obs | Comparisons | Hash changes | Revision freq. | Exact-stable | Longest stable streak | Mean \|ppm\| | Median \|ppm\| | Max \|ppm\| | Min % | Max % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `D-1` | 1 | 0 | 0 | — | 0 | 0 | — | — | — | — | — |
| `D-2` | 1 | 0 | 0 | — | 0 | 0 | — | — | — | — | — |
| `D-3` | 1 | 0 | 0 | — | 0 | 0 | — | — | — | — | — |

## By age transition

Where a one-run-per-day study's evidence actually lives.

`D−1 → D−2` carries the tail of the just-closed day's accrual and is **expected** to move — `D−1` is read on the
UTC day it closed, while it may still be accruing. `D−2 → D−3` is the pure test: a day production already calls
final, re-read a day later. **A revision there is the result that would change production behaviour.**

_No comparisons yet._

## Magnitude bands

| Group | unchanged | recomposed | trace (≤10 ppm) | small (≤100) | noticeable (≤1,000) | material (>1,000) |
|---|---:|---:|---:|---:|---:|---:|
| `D-1` | 0 | 0 | 0 | 0 | 0 | 0 |
| `D-2` | 0 | 0 | 0 | 0 | 0 | 0 |
| `D-3` | 0 | 0 | 0 | 0 | 0 | 0 |

`recomposed` is not one of the brief's bands. It is a content-hash change whose net token delta is exactly zero —
rows moved against each other and the total did not. It is reported separately because calling it `trace` would
label a real content change as a sub-10-ppm move, and calling it `unchanged` would hide it.

## Every observation

| Run (UTC) | Target | Age | Total tokens | Content hash | `meta.as_of` | Δ tokens | Δ ppm | Band | Rows ±/Δ |
|---|---|---|---:|---|---|---:|---:|---|---|
| 2026-09-16 | 2026-09-13 | `D-3` | 16,730,791,173,422 | `7f845ccd7272` | 2026-09-16T02:37:51.756Z | — | — | — | — |
| 2026-09-16 | 2026-09-14 | `D-2` | 18,120,484,812,487 | `7530957ff237` | 2026-09-16T02:37:51.756Z | — | — | — | — |
| 2026-09-16 | 2026-09-15 | `D-1` | 17,750,424,011,492 | `3a556475521c` | 2026-09-16T02:37:51.756Z | — | — | — | — |

## What the hash covers

The revision detector is the semantic content hash, which is `hashDateRows` from the production normalizer — the
same function the pipeline uses, so a revision the study sees is by construction a revision the pipeline would see.

**Included:** every returned row's `model_permaslug` and `total_tokens` for that date, canonically ordered.

**Excluded:** `meta.as_of` (Phase 1A measured it advancing on every request whether or not the content moved, so it
detects nothing), `meta.start_date`, `meta.end_date`, `meta.version`, the row order the source chose, the retrieval
timestamp and every response header.

The raw whole-body hash is recorded alongside it in the CSV. It covers the entire multi-date response, so it is
shared by every target date of a run and cannot serve as a per-date detector — and it moves whenever `as_of` does.
The two hashes diverging while the semantic one holds is the evidence that `as_of` detects nothing.

## Honest limits

- A comparison whose two reads fall inside the source's 60-second cache window is **dropped**, not counted: the body
  is byte-identical by construction there, and counting it would manufacture the stability the study is testing for.
  Dropped counts are carried per group.
- A date the source serves with no rows is recorded as `no_rows` and never as a zero. Two such dates are known to
  exist in the source's history.
- The study measures whether a value **changed between two reads**. A revision that lands and is reverted between
  reads is invisible to it, and always would be at a daily cadence.
