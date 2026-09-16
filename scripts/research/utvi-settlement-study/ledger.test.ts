/**
 * Tests for the study's artifacts: append-only behaviour, idempotency, and the refusal to
 * re-read inside the source's cache window.
 *
 * Each test gets its own temporary directory. Nothing here writes into `docs/`, and nothing
 * here reaches the network or a database.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendEntries,
  artifactPaths,
  CSV_COLUMNS,
  csvRow,
  hasObservation,
  nextRerunOrdinal,
  priorObservationFor,
  readLedger,
  rerunSpacingRefusal,
  writeState,
  type ArtifactPaths,
} from "./ledger";
import { renderReport } from "./render";
import { computeRevision, deriveState, type Observation, type StudyEntry } from "./study";

let paths: ArtifactPaths;
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "utvi-settlement-"));
  paths = artifactPaths(directory);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    studyRunDateUtc: "2026-09-16",
    rerunOrdinal: 0,
    retrievalTimestampUtc: "2026-09-16T01:00:00.000Z",
    targetDate: "2026-09-15",
    dayAge: 1,
    sourceAsOf: "2026-09-16T01:00:00.000Z",
    metaStartDate: "2026-09-13",
    metaEndDate: "2026-09-15",
    responseHash: "a".repeat(64),
    rawBodyHash: "b".repeat(64),
    namedRowCount: 50,
    otherPresent: true,
    otherTokens: "1186819992880",
    totalTokens: "17750400225262",
    sourceRowCount: 51,
    httpStatus: 200,
    validationStatus: "ok",
    validationDetail: null,
    coverageState: "covered_observed",
    productionSettlementState: "provisional",
    rows: { "anthropic/claude-opus-5": "5929599506221", other: "1186819992880" },
    ...overrides,
  };
}

const entry = (o: Observation, prior: Observation | null = null): StudyEntry => ({
  observation: o,
  revision: computeRevision(o, prior),
});

describe("the ledger", () => {
  it("reads an absent ledger as an empty study rather than failing", () => {
    expect(readLedger(paths)).toEqual([]);
  });

  it("round-trips an observation through JSON Lines", () => {
    const original = entry(observation());
    appendEntries(paths, [original]);
    expect(readLedger(paths)).toEqual([original]);
  });

  it("appends rather than overwriting", () => {
    appendEntries(paths, [entry(observation({ targetDate: "2026-09-15" }))]);
    appendEntries(paths, [entry(observation({ targetDate: "2026-09-14", dayAge: 2 }))]);
    const entries = readLedger(paths);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.observation.targetDate)).toEqual(["2026-09-15", "2026-09-14"]);
  });

  it("writes the CSV header exactly once", () => {
    appendEntries(paths, [entry(observation())]);
    appendEntries(paths, [entry(observation({ targetDate: "2026-09-14", dayAge: 2 }))]);
    const lines = readFileSync(paths.csv, "utf8").trim().split("\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(lines.filter((line) => line.startsWith("study_run_date_utc"))).toHaveLength(1);
  });

  it("emits one CSV cell per declared column, with empty cells for nulls", () => {
    const cells = csvRow(entry(observation())).split(",");
    expect(cells).toHaveLength(CSV_COLUMNS.length);
    // No prior observation, so every revision cell is empty — never a zero.
    expect(cells[CSV_COLUMNS.indexOf("revision_ppm")]).toBe("");
    expect(cells[CSV_COLUMNS.indexOf("hash_changed")]).toBe("");
    expect(cells[CSV_COLUMNS.indexOf("total_tokens")]).toBe("17750400225262");
    expect(cells[CSV_COLUMNS.indexOf("day_age")]).toBe("D-1");
  });

  it("quotes a validation detail containing a comma", () => {
    const row = csvRow(
      entry(observation({ validationStatus: "http_error", validationDetail: "HTTP 429: slow down, please" })),
    );
    expect(row).toContain('"HTTP 429: slow down, please"');
    // The quoted field must not split the row into an extra column.
    expect(row.split('"')).toHaveLength(3);
  });

  it("rejects a corrupt ledger line loudly rather than silently skipping it", () => {
    appendEntries(paths, [entry(observation())]);
    const corrupted = `${readFileSync(paths.ledger, "utf8")}{not json\n`;
    writeFileSync(paths.ledger, corrupted, "utf8");
    expect(() => readLedger(paths)).toThrow(/not parseable JSON/);
  });

  it("refuses a line written by the other settlement-study harness, and names it", () => {
    // Valid JSON, wrong study. Its flat records land at this same default path, so parsing
    // alone would admit one and every field of the resulting entry would be undefined.
    appendEntries(paths, [entry(observation())]);
    const foreign = JSON.stringify({
      observedAt: "2026-09-16T02:49:15.156Z",
      observationDate: "2026-09-15",
      ageDays: 0,
      contentHash: "a".repeat(64),
      totalTokens: "17750424011492",
      outcome: "succeeded",
    });
    writeFileSync(paths.ledger, `${readFileSync(paths.ledger, "utf8")}${foreign}\n`, "utf8");
    expect(() => readLedger(paths)).toThrow(/other settlement-study script/);
  });

  it("refuses any line missing the fields every observation carries", () => {
    writeFileSync(paths.ledger, `${JSON.stringify({ observation: { targetDate: "2026-09-15" } })}\n`, "utf8");
    expect(() => readLedger(paths)).toThrow(/not a settlement-study observation/);
  });
});

describe("idempotency", () => {
  it("recognizes a target date already observed on this study day", () => {
    const entries = [entry(observation())];
    expect(hasObservation(entries, "2026-09-16", "2026-09-15")).toBe(true);
    expect(hasObservation(entries, "2026-09-16", "2026-09-14")).toBe(false);
    expect(hasObservation(entries, "2026-09-17", "2026-09-15")).toBe(false);
  });

  it("gives a deliberate re-run its own identity instead of colliding", () => {
    const entries = [entry(observation()), entry(observation({ targetDate: "2026-09-14", dayAge: 2 }))];
    expect(nextRerunOrdinal(entries, "2026-09-16")).toBe(1);
    expect(nextRerunOrdinal(entries, "2026-09-17")).toBe(0);
  });

  it("refuses a re-read inside the source's cache window, where stability is an artifact", () => {
    const entries = [entry(observation({ retrievalTimestampUtc: "2026-09-16T01:00:00.000Z" }))];
    const tooSoon = rerunSpacingRefusal(entries, "2026-09-15", new Date("2026-09-16T01:00:30Z"));
    expect(tooSoon).toMatch(/cache window/);
    expect(tooSoon).toMatch(/Wait 60s/);
  });

  it("allows a re-read once the cache window has passed", () => {
    const entries = [entry(observation({ retrievalTimestampUtc: "2026-09-16T01:00:00.000Z" }))];
    expect(rerunSpacingRefusal(entries, "2026-09-15", new Date("2026-09-16T01:02:00Z"))).toBeNull();
    expect(rerunSpacingRefusal(entries, "2026-09-14", new Date("2026-09-16T01:00:05Z"))).toBeNull();
  });
});

describe("prior observation lookup", () => {
  it("returns the most recent earlier read of the same date", () => {
    const first = observation({ retrievalTimestampUtc: "2026-09-16T01:00:00.000Z", responseHash: "1".repeat(64) });
    const second = observation({
      studyRunDateUtc: "2026-09-17",
      dayAge: 2,
      retrievalTimestampUtc: "2026-09-17T01:00:00.000Z",
      responseHash: "2".repeat(64),
    });
    const entries = [entry(first), entry(second, first)];
    const prior = priorObservationFor(entries, "2026-09-15", "2026-09-18T01:00:00.000Z");
    expect(prior?.responseHash).toBe("2".repeat(64));
  });

  it("ignores observations of other dates and later reads", () => {
    const entries = [entry(observation()), entry(observation({ targetDate: "2026-09-14", dayAge: 2 }))];
    expect(priorObservationFor(entries, "2026-09-13", "2026-09-18T00:00:00.000Z")).toBeNull();
    expect(priorObservationFor(entries, "2026-09-15", "2026-09-16T00:59:00.000Z")).toBeNull();
  });
});

describe("derived artifacts", () => {
  it("writes a state file that can be rebuilt from the ledger alone", () => {
    appendEntries(paths, [entry(observation())]);
    const state = writeState(paths, readLedger(paths), new Date("2026-09-17T02:00:00Z"));
    expect(existsSync(paths.state)).toBe(true);
    expect(JSON.parse(readFileSync(paths.state, "utf8"))).toEqual(state);
    expect(state.runsCompleted).toBe(1);
    expect(state.runsRemaining).toBe(13);
  });

  it("renders a report that names the structural absence of D−1 comparisons", () => {
    const entries = [entry(observation())];
    const report = renderReport(entries, deriveState(entries, new Date("2026-09-17T02:00:00Z")), new Date("2026-09-17T02:00:00Z"));
    expect(report).toContain("Runs completed | **1 of 14**");
    expect(report).toContain("structural rather than a finding");
    expect(report).toContain("Insufficient evidence");
    // The repo invariant for docs/research/: exactly one title, marked unrouted.
    expect(report).toContain("not registered in the docs catalog");
    expect(report.match(/^# /gm)).toHaveLength(1);
    // The row vector is evidence, not summary material.
    expect(report).not.toContain("anthropic/claude-opus-5");
  });

  it("renders an empty study without crashing", () => {
    const now = new Date("2026-09-16T02:00:00Z");
    expect(renderReport([], deriveState([], now), now)).toContain("_No observations yet._");
  });
});
