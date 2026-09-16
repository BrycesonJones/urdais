/**
 * Turning one retrieval into one observation per target date.
 *
 * Separated from the CLI so that it can be tested against fixtures without the entry point
 * running, and so that every failure mode is a value rather than a thrown exception.
 *
 * The rule the whole file exists to enforce: **absence is never zero.** A date the source did
 * not serve, a date it served empty, a contract violation and a transport failure are four
 * different facts, they get four different statuses, and none of them gets a token total.
 * A settlement study that recorded a failed read as an unchanged value would conclude the
 * source was stable precisely when it was not.
 */

import { settlementStateFor } from "@/lib/utvi/settlement";
import type { DailySnapshot, RetrievalResult, SourceRow } from "@/lib/utvi/types";

import { rowVector, type Observation, type ValidationStatus } from "./study";

/** The rows the response carried for one date, in the order the source returned them. */
export function rowsForDate(rows: readonly SourceRow[], date: string): SourceRow[] {
  return rows.filter((row) => row.date === date);
}

export type ObservationInput = {
  retrieval: RetrievalResult;
  /** Null when the response could not be grouped into snapshots at all. */
  snapshots: DailySnapshot[] | null;
  snapshotError: string | null;
  targetDate: string;
  dayAge: number;
  studyRunDateUtc: string;
  rerunOrdinal: number;
  now: Date;
};

export function buildObservation(input: ObservationInput): Observation {
  const { retrieval, snapshots, snapshotError, targetDate, dayAge, studyRunDateUtc, rerunOrdinal, now } = input;

  const base = {
    studyRunDateUtc,
    rerunOrdinal,
    retrievalTimestampUtc: retrieval.retrievedAt,
    targetDate,
    dayAge,
    sourceAsOf: retrieval.sourceAsOf,
    metaStartDate: retrieval.actualStartDate,
    metaEndDate: retrieval.actualEndDate,
    rawBodyHash: retrieval.responseHash,
    httpStatus: retrieval.httpStatus,
    // What production's rule would call this date right now. Context for the study, never
    // an input to it: the study is testing whether that rule is right.
    productionSettlementState: settlementStateFor(targetDate, now),
  } as const;

  const failed = (validationStatus: ValidationStatus, detail: string | null): Observation => ({
    ...base,
    responseHash: null,
    namedRowCount: null,
    otherPresent: null,
    otherTokens: null,
    totalTokens: null,
    sourceRowCount: null,
    validationStatus,
    validationDetail: detail,
    coverageState: null,
    rows: null,
  });

  if (retrieval.outcome === "http_error") return failed("http_error", retrieval.outcomeDetail);
  if (retrieval.outcome === "transport_error") return failed("transport_error", retrieval.outcomeDetail);
  if (retrieval.outcome === "malformed") return failed("contract_violation", retrieval.outcomeDetail);
  if (snapshots === null || retrieval.response === null) return failed("contract_violation", snapshotError);

  const snapshot = snapshots.find((candidate) => candidate.observationDate === targetDate);
  if (snapshot === undefined) {
    // The endpoint clamps a requested window and says so only in `meta`. A target outside the
    // resolved window was never looked at, which is not the same as having no data.
    return failed(
      "not_served",
      `the source resolved its window to ${retrieval.actualStartDate}..${retrieval.actualEndDate}, which does not include this date`,
    );
  }

  if (snapshot.coverageState !== "covered_observed") {
    return {
      ...failed("no_rows", "the source served this date and returned no rows"),
      sourceRowCount: 0,
      namedRowCount: 0,
      otherPresent: false,
      coverageState: snapshot.coverageState,
    };
  }

  const rows = rowsForDate(retrieval.response.data, targetDate);
  return {
    ...base,
    responseHash: snapshot.dateContentHash,
    namedRowCount: snapshot.namedRowCount,
    otherPresent: snapshot.residualRowPresent,
    otherTokens: snapshot.residualRowPresent ? (snapshot.residualTokens?.toString() ?? null) : null,
    totalTokens: snapshot.totalTokens?.toString() ?? null,
    sourceRowCount: rows.length,
    validationStatus: "ok",
    validationDetail: null,
    coverageState: snapshot.coverageState,
    rows: rowVector(rows),
  };
}
