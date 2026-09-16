/**
 * Tests for the settlement study's arithmetic and its observation builder.
 *
 * Every input here is a fixture. Nothing in this file reaches the network, and that is the
 * point: a test that called OpenRouter would spend the study's own rate limit and would
 * assert against a moving target.
 */

import { describe, expect, it } from "vitest";

import { snapshotsFromResponse } from "@/lib/utvi/normalize";
import type { RetrievalResult, SourceResponse, SourceRow } from "@/lib/utvi/types";

import { buildObservation } from "./observe";
import {
  bandFor,
  computeRevision,
  dayAgeLabel,
  daysBetweenUtc,
  deriveState,
  diffRowVectors,
  evaluateSettlement,
  hashRowsForDate,
  NO_REVISION,
  revisionPct,
  revisionPpm,
  rowVector,
  summarize,
  summarizeByDayAge,
  summarizeByTransition,
  targetDatesFor,
  utcDateOf,
  type Observation,
  type StudyEntry,
} from "./study";

/* ---------- fixtures ---------- */

const row = (date: string, permaslug: string, tokens: string): SourceRow => ({
  date,
  model_permaslug: permaslug,
  total_tokens: tokens,
});

const DAY = "2026-09-15";

const BASE_ROWS: SourceRow[] = [
  row(DAY, "anthropic/claude-opus-5", "5929599506221"),
  row(DAY, "openai/gpt-5", "4100000000000"),
  row(DAY, "google/gemini-3-pro", "2000000000000"),
  row(DAY, "other", "1186819992880"),
];

const response = (rows: SourceRow[], meta: Partial<SourceResponse["meta"]> = {}): SourceResponse => ({
  data: rows,
  meta: {
    as_of: "2026-09-16T01:00:33.578Z",
    start_date: rows.length > 0 ? rows[0]!.date : DAY,
    end_date: rows.length > 0 ? rows[rows.length - 1]!.date : DAY,
    version: "v1",
    ...meta,
  },
});

const retrieval = (overrides: Partial<RetrievalResult> = {}): RetrievalResult => ({
  outcome: "succeeded",
  outcomeDetail: "cache-control: private, max-age=60",
  httpStatus: 200,
  responseHash: "rawbodyhash",
  responseByteLength: 1234,
  requestedStartDate: DAY,
  requestedEndDate: DAY,
  actualStartDate: DAY,
  actualEndDate: DAY,
  sourceAsOf: "2026-09-16T01:00:33.578Z",
  datasetVersion: "v1",
  rowCount: 4,
  retrievedAt: "2026-09-16T01:00:33.600Z",
  requestUrl: "https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=…",
  requestParameters: { start_date: DAY, end_date: DAY, period: "day" },
  response: response(BASE_ROWS),
  ...overrides,
});

/** Build an observation the way the runner does, from a response fixture. */
function observe(args: {
  rows: SourceRow[];
  asOf?: string;
  retrievedAt?: string;
  studyRunDateUtc?: string;
  targetDate?: string;
  dayAge?: number;
}): Observation {
  const body = response(args.rows, { as_of: args.asOf ?? "2026-09-16T01:00:33.578Z", start_date: DAY, end_date: DAY });
  const now = new Date(args.retrievedAt ?? "2026-09-16T01:00:33.600Z");
  const result = retrieval({
    response: body,
    sourceAsOf: body.meta.as_of,
    retrievedAt: now.toISOString(),
    rowCount: args.rows.length,
    // The raw body hash moves with `as_of`, which is exactly what the semantic hash must not.
    responseHash: `raw:${body.meta.as_of}`,
  });
  return buildObservation({
    retrieval: result,
    snapshots: snapshotsFromResponse(body, () => "provisional"),
    snapshotError: null,
    targetDate: args.targetDate ?? DAY,
    dayAge: args.dayAge ?? 1,
    studyRunDateUtc: args.studyRunDateUtc ?? "2026-09-16",
    rerunOrdinal: 0,
    now,
  });
}

const entry = (observation: Observation, prior: Observation | null = null): StudyEntry => ({
  observation,
  revision: computeRevision(observation, prior),
});

/* ---------- day-age targeting ---------- */

describe("target dates", () => {
  it("derives D−1..D−3 from UTC, not from the local clock", () => {
    // 23:30 in New York on 15 September is already 03:30 UTC on 16 September.
    const now = new Date("2026-09-16T03:30:00Z");
    expect(targetDatesFor(now, 3)).toEqual([
      { targetDate: "2026-09-15", dayAge: 1 },
      { targetDate: "2026-09-14", dayAge: 2 },
      { targetDate: "2026-09-13", dayAge: 3 },
    ]);
  });

  it("extends to D−7 on request and refuses anything outside 3..7", () => {
    const now = new Date("2026-09-16T03:30:00Z");
    expect(targetDatesFor(now, 7)).toHaveLength(7);
    expect(targetDatesFor(now, 7).at(-1)).toEqual({ targetDate: "2026-09-09", dayAge: 7 });
    expect(() => targetDatesFor(now, 2)).toThrow(/maxDayAge/);
    expect(() => targetDatesFor(now, 8)).toThrow(/maxDayAge/);
  });

  it("crosses a month boundary correctly", () => {
    expect(targetDatesFor(new Date("2026-10-01T00:00:01Z"), 3).map((t) => t.targetDate)).toEqual([
      "2026-09-30",
      "2026-09-29",
      "2026-09-28",
    ]);
  });

  it("labels and counts day ages", () => {
    expect(dayAgeLabel(2)).toBe("D-2");
    expect(daysBetweenUtc("2026-09-13", "2026-09-16")).toBe(3);
    expect(utcDateOf(new Date("2026-09-16T23:59:59Z"))).toBe("2026-09-16");
  });
});

/* ---------- hashing ---------- */

describe("semantic hash", () => {
  it("is deterministic for the same rows", () => {
    expect(hashRowsForDate(BASE_ROWS)).toBe(hashRowsForDate([...BASE_ROWS]));
    expect(hashRowsForDate(BASE_ROWS)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is independent of row order", () => {
    const shuffled = [BASE_ROWS[2]!, BASE_ROWS[0]!, BASE_ROWS[3]!, BASE_ROWS[1]!];
    expect(hashRowsForDate(shuffled)).toBe(hashRowsForDate(BASE_ROWS));
  });

  it("excludes meta.as_of, which the source advances on every request", () => {
    const early = observe({ rows: BASE_ROWS, asOf: "2026-09-16T01:00:33.578Z" });
    const later = observe({ rows: BASE_ROWS, asOf: "2026-09-16T09:41:02.113Z" });

    expect(later.sourceAsOf).not.toBe(early.sourceAsOf);
    expect(later.rawBodyHash).not.toBe(early.rawBodyHash);
    // The whole point: identical content, moved `as_of`, same semantic hash.
    expect(later.responseHash).toBe(early.responseHash);
    expect(computeRevision(later, early).hashChanged).toBe(false);
  });

  it("changes when any token value changes", () => {
    const moved = BASE_ROWS.map((r, i) => (i === 1 ? row(DAY, r.model_permaslug, "4100000000001") : r));
    expect(hashRowsForDate(moved)).not.toBe(hashRowsForDate(BASE_ROWS));
  });
});

/* ---------- revision arithmetic ---------- */

describe("revision arithmetic", () => {
  it("computes percentage and ppm exactly, in BigInt", () => {
    // +16 ppm on a 17.75 T base: the magnitude Phase 1A measured on the just-closed day.
    const previous = 17_750_400_000_000n;
    const current = previous + 284_006_400n;
    expect(revisionPpm(current, previous)).toBeCloseTo(16.0, 6);
    expect(revisionPct(current, previous)).toBeCloseTo(0.0016, 9);
  });

  it("signs a downward revision", () => {
    expect(revisionPpm(999_000n, 1_000_000n)).toBeCloseTo(-1000, 6);
    expect(revisionPct(999_000n, 1_000_000n)).toBeCloseTo(-0.1, 9);
  });

  it("guards a zero base rather than dividing by it", () => {
    expect(revisionPpm(5n, 0n)).toBeNull();
    expect(revisionPct(5n, 0n)).toBeNull();
    expect(revisionPpm(0n, 0n)).toBeNull();
  });

  it("keeps full precision above Number.MAX_SAFE_INTEGER", () => {
    const previous = 90_071_992_547_409_910_000n; // ~10,000× the safe range
    expect(revisionPpm(previous + 90_071_992_547_409_910n, previous)).toBeCloseTo(1000, 3);
  });

  it("returns all-null fields when there is no prior observation", () => {
    expect(computeRevision(observe({ rows: BASE_ROWS }), null)).toEqual(NO_REVISION);
  });

  it("carries the prior day age so a transition is never mistaken for a same-age repeat", () => {
    const first = observe({ rows: BASE_ROWS, studyRunDateUtc: "2026-09-16", dayAge: 1 });
    const second = observe({
      rows: BASE_ROWS,
      studyRunDateUtc: "2026-09-17",
      dayAge: 2,
      retrievedAt: "2026-09-17T01:00:00.000Z",
      asOf: "2026-09-17T01:00:00.000Z",
    });
    const revision = computeRevision(second, first);
    expect(revision.priorDayAge).toBe(1);
    expect(revision.priorRunDate).toBe("2026-09-16");
    expect(revision.hashChanged).toBe(false);
    expect(revision.cacheContaminated).toBe(false);
  });

  it("flags a comparison taken inside the source's 60-second cache window", () => {
    const first = observe({ rows: BASE_ROWS, retrievedAt: "2026-09-16T01:00:00.000Z" });
    const second = observe({ rows: BASE_ROWS, retrievedAt: "2026-09-16T01:00:30.000Z" });
    const revision = computeRevision(second, first);
    expect(revision.secondsSincePrior).toBe(30);
    expect(revision.cacheContaminated).toBe(true);
  });
});

/* ---------- row-level revision ---------- */

describe("row-level revision", () => {
  const prior = rowVector(BASE_ROWS);

  it("counts a changed row and reports the largest movers", () => {
    const current = { ...prior, "openai/gpt-5": "4200000000000" };
    const diff = diffRowVectors(prior, current);
    expect(diff).toMatchObject({ rowsChanged: 1, rowsAdded: 0, rowsRemoved: 0 });
    expect(diff.maxRowAbsRevision).toBe("100000000000");
    expect(diff.maxRowAbsRevisionPermaslug).toBe("openai/gpt-5");
    expect(diff.maxRowPctRevision).toBeCloseTo(2.4390243902, 6);
  });

  it("counts an added model without treating it as a change from zero", () => {
    const current = { ...prior, "meta-llama/llama-5": "77000000000" };
    const diff = diffRowVectors(prior, current);
    expect(diff).toMatchObject({ rowsAdded: 1, rowsChanged: 0, rowsRemoved: 0 });
    // A model that entered the top fifty has no prior value, so it contributes no percentage.
    expect(diff.maxRowPctRevision).toBeNull();
  });

  it("counts a removed model", () => {
    const current = { ...prior };
    delete current["google/gemini-3-pro"];
    expect(diffRowVectors(prior, current)).toMatchObject({ rowsRemoved: 1, rowsAdded: 0, rowsChanged: 0 });
  });

  it("reports a change in the residual `other` row", () => {
    const moved = BASE_ROWS.map((r) => (r.model_permaslug === "other" ? row(DAY, "other", "1186819999999") : r));
    const revision = computeRevision(observe({ rows: moved, asOf: "2026-09-17T01:00:00Z" }), observe({ rows: BASE_ROWS }));
    expect(revision.hashChanged).toBe(true);
    expect(revision.otherTokensDelta).toBe("7119");
    expect(revision.rowsChanged).toBe(1);
    expect(revision.maxRowAbsRevisionPermaslug).toBe("other");
  });

  it("declines a row diff when either side has no row vector", () => {
    expect(diffRowVectors(null, prior).rowsChanged).toBeNull();
    expect(diffRowVectors(prior, null).rowsChanged).toBeNull();
  });
});

/* ---------- bands ---------- */

describe("materiality bands", () => {
  it("places each magnitude in its band", () => {
    expect(bandFor(false, 0n, 0)).toBe("unchanged");
    expect(bandFor(true, 1n, 5)).toBe("trace");
    expect(bandFor(true, 1n, 10)).toBe("trace");
    expect(bandFor(true, 1n, 10.01)).toBe("small");
    expect(bandFor(true, 1n, 100)).toBe("small");
    expect(bandFor(true, 1n, 100.01)).toBe("noticeable");
    expect(bandFor(true, 1n, 1000)).toBe("noticeable");
    expect(bandFor(true, 1n, 1000.01)).toBe("material");
    expect(bandFor(true, -1n, -5000)).toBe("material");
  });

  it("does not call a hash change with a zero net delta `unchanged`", () => {
    expect(bandFor(true, 0n, 0)).toBe("recomposed");
  });

  it("calls a real revision too small to register in ppm `trace`, not `recomposed`", () => {
    // One token on a 13.2 T base rounds to 0.000000 ppm and is still a revision.
    expect(bandFor(true, 1n, 0)).toBe("trace");
  });

  it("bands a revision from a zero base as material rather than fabricating a ratio", () => {
    expect(bandFor(true, 5n, null)).toBe("material");
  });
});

/* ---------- absence ---------- */

describe("absence is never zero", () => {
  it("records a date the source served with no rows as no_rows, not as a zero total", () => {
    const body = response([], { start_date: "2025-06-15", end_date: "2025-06-15" });
    const observation = buildObservation({
      retrieval: retrieval({ response: body, actualStartDate: "2025-06-15", actualEndDate: "2025-06-15", rowCount: 0 }),
      snapshots: snapshotsFromResponse(body, () => "final"),
      snapshotError: null,
      targetDate: "2025-06-15",
      dayAge: 2,
      studyRunDateUtc: "2026-09-16",
      rerunOrdinal: 0,
      now: new Date("2026-09-16T01:00:00Z"),
    });
    expect(observation.validationStatus).toBe("no_rows");
    expect(observation.totalTokens).toBeNull();
    expect(observation.responseHash).toBeNull();
    expect(observation.coverageState).toBe("covered_no_rows");
  });

  it("records a date outside the resolved window as not_served", () => {
    const body = response(BASE_ROWS);
    const observation = buildObservation({
      retrieval: retrieval({ response: body }),
      snapshots: snapshotsFromResponse(body, () => "final"),
      snapshotError: null,
      targetDate: "2026-09-13",
      dayAge: 3,
      studyRunDateUtc: "2026-09-16",
      rerunOrdinal: 0,
      now: new Date("2026-09-16T01:00:00Z"),
    });
    expect(observation.validationStatus).toBe("not_served");
    expect(observation.totalTokens).toBeNull();
  });

  it("records an HTTP failure without inventing a value", () => {
    const observation = buildObservation({
      retrieval: retrieval({ outcome: "http_error", httpStatus: 429, outcomeDetail: "HTTP 429: rate limited", response: null }),
      snapshots: null,
      snapshotError: null,
      targetDate: DAY,
      dayAge: 1,
      studyRunDateUtc: "2026-09-16",
      rerunOrdinal: 0,
      now: new Date("2026-09-16T01:00:00Z"),
    });
    expect(observation.validationStatus).toBe("http_error");
    expect(observation.httpStatus).toBe(429);
    expect(observation.totalTokens).toBeNull();
    expect(observation.rows).toBeNull();
  });

  it("never compares against a failed prior read", () => {
    const failedRead = buildObservation({
      retrieval: retrieval({ outcome: "transport_error", httpStatus: null, response: null }),
      snapshots: null,
      snapshotError: null,
      targetDate: DAY,
      dayAge: 1,
      studyRunDateUtc: "2026-09-16",
      rerunOrdinal: 0,
      now: new Date("2026-09-16T01:00:00Z"),
    });
    const revision = computeRevision(observe({ rows: BASE_ROWS, dayAge: 2 }), failedRead);
    expect(revision.priorRunDate).toBe("2026-09-16");
    expect(revision.hashChanged).toBeNull();
    expect(revision.revisionPpm).toBeNull();
  });

  it("carries the whole day's total including the residual row", () => {
    const observation = observe({ rows: BASE_ROWS });
    expect(observation.totalTokens).toBe("13216419499101");
    expect(observation.otherTokens).toBe("1186819992880");
    expect(observation.namedRowCount).toBe(3);
    expect(observation.otherPresent).toBe(true);
    expect(observation.sourceRowCount).toBe(4);
  });
});

/* ---------- summaries ---------- */

describe("summary statistics", () => {
  /** Three D−2 observations, the middle one revised upward by 1,000 ppm. */
  function d2Series(): StudyEntry[] {
    const a = observe({ rows: BASE_ROWS, studyRunDateUtc: "2026-09-16", dayAge: 1, retrievedAt: "2026-09-16T01:00:00Z" });
    const b = observe({
      rows: BASE_ROWS,
      studyRunDateUtc: "2026-09-17",
      dayAge: 2,
      retrievedAt: "2026-09-17T01:00:00Z",
      asOf: "2026-09-17T01:00:00Z",
    });
    const bumped = BASE_ROWS.map((r) =>
      r.model_permaslug === "openai/gpt-5" ? row(DAY, "openai/gpt-5", "4113216419499") : r,
    );
    const c = observe({
      rows: bumped,
      studyRunDateUtc: "2026-09-18",
      dayAge: 3,
      retrievedAt: "2026-09-18T01:00:00Z",
      asOf: "2026-09-18T01:00:00Z",
    });
    return [entry(a, null), entry(b, a), entry(c, b)];
  }

  it("never mixes day ages", () => {
    const rows = summarizeByDayAge(d2Series());
    expect(rows.map((r) => r.key)).toEqual(["D-1", "D-2", "D-3"]);
    // D−1 has no comparison at a one-run-per-day cadence: a date is read once at each age.
    expect(rows[0]!.comparisons).toBe(0);
    expect(rows[0]!.revisionFrequency).toBeNull();
    expect(rows[1]!.comparisons).toBe(1);
    expect(rows[1]!.hashChanges).toBe(0);
    expect(rows[2]!.comparisons).toBe(1);
    expect(rows[2]!.hashChanges).toBe(1);
  });

  it("summarizes by transition, where the evidence actually lives", () => {
    const rows = summarizeByTransition(d2Series());
    expect(rows.map((r) => r.key)).toEqual(["D-1 → D-2", "D-2 → D-3"]);
    expect(rows[0]!.hashChanges).toBe(0);
    expect(rows[1]!.hashChanges).toBe(1);
    expect(rows[1]!.maxAbsPpm).toBeCloseTo(1000, 1);
    expect(rows[1]!.bands.noticeable).toBe(1);
  });

  it("drops a cache-contaminated comparison instead of counting it as stable", () => {
    const first = observe({ rows: BASE_ROWS, retrievedAt: "2026-09-16T01:00:00Z" });
    const second = observe({ rows: BASE_ROWS, retrievedAt: "2026-09-16T01:00:20Z" });
    const summary = summarize("D-1", [entry(first, null), entry(second, first)]);
    expect(summary.observations).toBe(2);
    expect(summary.comparisons).toBe(0);
    expect(summary.cacheContaminatedDropped).toBe(1);
    expect(summary.exactStability).toBe(0);
  });

  it("measures mean, median, max and the longest stable streak", () => {
    const observations: Observation[] = [];
    // Four reads of the same date: stable, stable, then a move.
    const timeline = [
      { rows: BASE_ROWS, at: "2026-09-16T01:00:00Z" },
      { rows: BASE_ROWS, at: "2026-09-17T01:00:00Z" },
      { rows: BASE_ROWS, at: "2026-09-18T01:00:00Z" },
      { rows: BASE_ROWS.map((r) => (r.model_permaslug === "other" ? row(DAY, "other", "1186833209299") : r)), at: "2026-09-19T01:00:00Z" },
    ];
    for (const step of timeline) {
      observations.push(observe({ rows: step.rows, retrievedAt: step.at, asOf: step.at, studyRunDateUtc: step.at.slice(0, 10), dayAge: 2 }));
    }
    const entries = observations.map((o, i) => entry(o, i === 0 ? null : observations[i - 1]!));
    const summary = summarize("D-2", entries);
    expect(summary.comparisons).toBe(3);
    expect(summary.hashChanges).toBe(1);
    expect(summary.exactStability).toBe(2);
    expect(summary.longestStableStreak).toBe(2);
    expect(summary.revisionFrequency).toBeCloseTo(1 / 3, 6);
    expect(summary.maxAbsPpm).toBeCloseTo(1, 2);
    expect(summary.medianAbsPpm).toBe(0);
  });
});

/* ---------- study state ---------- */

describe("study state", () => {
  const runOn = (date: string): StudyEntry =>
    entry(observe({ rows: BASE_ROWS, studyRunDateUtc: date, retrievedAt: `${date}T01:00:00Z`, asOf: `${date}T01:00:00Z` }), null);

  it("tracks missed run dates without fabricating observations for them", () => {
    const entries = [runOn("2026-09-16"), runOn("2026-09-17"), runOn("2026-09-20")];
    const state = deriveState(entries, new Date("2026-09-21T02:00:00Z"));
    expect(state.completedRunDates).toEqual(["2026-09-16", "2026-09-17", "2026-09-20"]);
    expect(state.missedRunDates).toEqual(["2026-09-18", "2026-09-19"]);
    expect(state.runsCompleted).toBe(3);
    expect(state.runsRemaining).toBe(11);
    expect(state.observationCount).toBe(3);
  });

  it("does not count today as missed, because the day is not over", () => {
    const state = deriveState([runOn("2026-09-16")], new Date("2026-09-17T02:00:00Z"));
    expect(state.missedRunDates).toEqual([]);
  });

  it("counts runs rather than calendar days, so a gap extends the study", () => {
    const entries = Array.from({ length: 14 }, (_, i) => runOn(`2026-09-${String(16 + i).padStart(2, "0")}`));
    const state = deriveState(entries, new Date("2026-09-30T02:00:00Z"));
    expect(state.runsCompleted).toBe(14);
    expect(state.runsRemaining).toBe(0);
    // A finished study reports the day it finished, not the day someone asked.
    expect(state.projectedEndUtc).toBe("2026-09-29");
  });

  it("does not project a remaining run onto a day already run", () => {
    // Asked on 09-16, which has already been run: the 13 remaining start tomorrow.
    const state = deriveState([runOn("2026-09-16")], new Date("2026-09-16T23:00:00Z"));
    expect(state.runsRemaining).toBe(13);
    expect(state.projectedEndUtc).toBe("2026-09-29");
  });

  it("projects a remaining run onto today when today is still free", () => {
    // Same run count, asked on 09-17, which is still available: the 13 start today.
    const state = deriveState([runOn("2026-09-16")], new Date("2026-09-17T08:00:00Z"));
    expect(state.runsRemaining).toBe(13);
    expect(state.projectedEndUtc).toBe("2026-09-29");
  });

  it("reports an empty study without inventing a start date", () => {
    const state = deriveState([], new Date("2026-09-16T02:00:00Z"));
    expect(state.startedOnUtc).toBeNull();
    expect(state.missedRunDates).toEqual([]);
    expect(state.runsRemaining).toBe(14);
  });
});

/* ---------- the decision rule ---------- */

describe("settlement decision rule", () => {
  /** A state carrying a given run count, so the verdict's provisional flag can be exercised. */
  const state = (runs: number) => ({
    ...deriveState([], new Date("2026-09-16T02:00:00Z")),
    runsCompleted: runs,
    runsRemaining: Math.max(0, 14 - runs),
  });

  /** `count` D−2 observations, `changed` of which revised by `ppmEach`. */
  function d2Observations(count: number, changed: number, tokenBump: bigint): StudyEntry[] {
    const entries: StudyEntry[] = [];
    let previous: Observation | null = null;
    let total = 1_186_819_992_880n;
    for (let i = 0; i < count + 1; i += 1) {
      const moved = i > 0 && i <= changed;
      if (moved) total += tokenBump;
      const rows = BASE_ROWS.map((r) => (r.model_permaslug === "other" ? row(DAY, "other", total.toString()) : r));
      const at = `2026-09-${String(16 + i).padStart(2, "0")}T01:00:00Z`;
      const observation = observe({ rows, retrievedAt: at, asOf: at, studyRunDateUtc: at.slice(0, 10), dayAge: 2 });
      entries.push(entry(observation, previous));
      previous = observation;
    }
    return entries;
  }

  it("reports insufficient evidence before any comparison exists", () => {
    const verdict = evaluateSettlement([], deriveState([], new Date("2026-09-16T02:00:00Z")));
    expect(verdict.outcome).toBe("insufficient_evidence");
    expect(verdict.final).toBe(false);
  });

  it("returns outcome A when no D−2 comparison ever changes", () => {
    const verdict = evaluateSettlement(d2Observations(3, 0, 0n), state(14));
    expect(verdict.outcome).toBe("A");
    expect(verdict.final).toBe(true);
  });

  it("returns outcome B when D−2 revises below the trivial threshold", () => {
    // ~1 ppm of a 13.2 T day total.
    const verdict = evaluateSettlement(d2Observations(3, 1, 13_216_419n), state(14));
    expect(verdict.outcome).toBe("B");
    expect(verdict.evidence!.maxAbsPpm).toBeLessThan(100);
  });

  it("returns outcome C when D−2 revises above the trivial threshold", () => {
    // ~1,000 ppm of a 13.2 T day total.
    const verdict = evaluateSettlement(d2Observations(3, 1, 13_216_419_499n), state(14));
    expect(verdict.outcome).toBe("C");
    expect(verdict.evidence!.maxAbsPpm).toBeGreaterThan(100);
  });

  it("marks a verdict provisional until the full run count is in", () => {
    const verdict = evaluateSettlement(d2Observations(2, 0, 0n), state(3));
    expect(verdict.outcome).toBe("A");
    expect(verdict.final).toBe(false);
  });
});
