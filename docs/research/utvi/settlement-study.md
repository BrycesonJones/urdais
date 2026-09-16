# UTVI Settlement Study

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Started 16 September 2026, alongside production activation rather than ahead of it.

## The question

Methodology 1.0.0 fixes the settlement lag at **one calculation day**: `D` publishes as provisional on the run after it closes and becomes final on the next run. That parameter rests on one afternoon's measurements, recorded in [the characterization](source-characterization.md#12-revision-behaviour--measured):

- the just-closed day accrued monotonically at roughly **16 parts per million per day**, never changing rank order;
- days closed twenty-five hours or more moved by **exactly zero** over a 6.2-minute interval.

The second of those is the weak one. Six minutes shows a day is not *actively* accruing; it says nothing about a batch correction a week later. This study answers the question the characterization could not.

## Why it does not gate publication

Because the backend already handles whatever it finds. A revision to a settled date supersedes its snapshot, recalculates, and supersedes its publication, with the superseded rows retained — and the database permits that on a `final` date deliberately, because a late revision is a fact about the source rather than a permission Urdais grants itself.

So the cost of the lag being wrong is a correction that the system is built to make, not a wrong number that would stand. Holding the launch for fourteen days would buy confidence in a parameter whose failure mode is already handled, at the price of two weeks of a product that works.

## Method

`scripts/research/utvi-settlement-study.ts`, run once a day. Each run appends three JSON lines to `settlement-study.jsonl` — one each for D−1, D−2 and D−3 — recording:

| Field | Why |
|---|---|
| `observedAt` | Urdais's own clock |
| `observationDate`, `ageDays` | Which date, and how long since it closed |
| `contentHash` | **The revision detector.** SHA-256 over the date's rows, ordered by permaslug |
| `totalTokens`, `namedRowCount`, `residualTokens` | The arithmetic, so a drift can be measured and not just detected |
| `sourceAsOf` | Recorded but **not** used to detect revision: it changes on every request whether the data moved or not |
| `outcome` | So a failed read is distinguishable from an unchanged one |

The script reads the same public dataset the product reads, writes only to this file, and touches no Urdais database. It reports drift against the newest prior observation of the same date, in parts per million, and calls out the pathological case explicitly: a changed total under an unchanged hash would mean the hash is not detecting what it is supposed to.

## What would change the methodology

- **A settled date moves at all** → the lag is too short. Lengthen it in a new version with an effective date; published values stay as published and the revision supersedes them.
- **Drift on D−1 exceeds the parts-per-million range already seen** → the provisional label is carrying more weight than assumed, and the surface should say more.
- **Rank order changes on a settled date** → attribution, not just the level, is still moving, which matters for Phase 2 Market Share more than for UTVI.
- **Nothing moves for fourteen days** → the lag stands, and a version note records that it was confirmed rather than assumed.

No interim result changes production behaviour. A change to the lag is a methodology revision, made once, with an effective date.

## Log

| Run | Observations | Note |
|---|---|---|
| 2026-09-16 | 3 | First. D−1 `17,750,424,011,492` still accruing; D−2 `18,120,484,812,487` and D−3 `16,730,791,173,422` unchanged from the values measured hours earlier during Phase 1A. |

Fourteen daily runs, then read the file.
