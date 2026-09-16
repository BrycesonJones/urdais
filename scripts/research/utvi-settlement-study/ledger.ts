/**
 * The study's local artifacts. Three files, one of which is the truth.
 *
 *   `settlement-study.jsonl`  append-only, one JSON object per observation, including the
 *                             per-model row vector. The evidence.
 *   `settlement-study.csv`    append-only, one row per observation, aggregate metrics only.
 *                             What a spreadsheet or a stats package reads.
 *   `settlement-study-state.json`  derived each run from the ledger. Progress and misses.
 *
 * The ledger is append-only because a settlement study that rewrites its own history cannot
 * be used to detect a revision, which is the only thing it is for. The CSV is appended in
 * the same operation rather than regenerated, so neither file is ever rewritten in place.
 *
 * Row vectors live only in the JSONL. They are what the row-level revision metrics are
 * computed from, and they are the reason a later re-analysis does not need to re-request
 * anything from OpenRouter.
 *
 * Nothing here connects to a database, and nothing here holds a credential.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  deriveState,
  RERUN_MIN_SPACING_SECONDS,
  type Observation,
  type StudyEntry,
  type StudyState,
} from "./study";

export type ArtifactPaths = {
  directory: string;
  ledger: string;
  csv: string;
  state: string;
  markdown: string;
};

export const DEFAULT_ARTIFACT_DIR = path.join("docs", "research", "utvi");

export function artifactPaths(directory: string = DEFAULT_ARTIFACT_DIR): ArtifactPaths {
  return {
    directory,
    ledger: path.join(directory, "settlement-study.jsonl"),
    csv: path.join(directory, "settlement-study.csv"),
    state: path.join(directory, "settlement-study-state.json"),
    markdown: path.join(directory, "settlement-study.md"),
  };
}

/**
 * The CSV contract. Column order is fixed for the life of the study: a reader that has
 * already loaded some of it should not have to re-detect the schema halfway through.
 */
export const CSV_COLUMNS = [
  "study_run_date_utc",
  "rerun_ordinal",
  "retrieval_timestamp_utc",
  "target_date",
  "day_age",
  "source_as_of",
  "meta_start_date",
  "meta_end_date",
  "response_hash",
  "raw_body_hash",
  "named_row_count",
  "other_present",
  "other_tokens",
  "total_tokens",
  "source_row_count",
  "http_status",
  "validation_status",
  "validation_detail",
  "coverage_state",
  "production_settlement_state",
  "prior_run_date",
  "prior_day_age",
  "seconds_since_prior",
  "cache_contaminated",
  "hash_changed",
  "previous_total_tokens",
  "revision_tokens",
  "revision_pct",
  "revision_ppm",
  "revision_band",
  "rows_changed",
  "rows_added",
  "rows_removed",
  "other_tokens_delta",
  "max_row_abs_revision",
  "max_row_abs_revision_permaslug",
  "max_row_pct_revision",
  "max_row_pct_revision_permaslug",
] as const;

/** Empty for null, so that "no prior observation" never reads as a zero. */
function cell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(entry: StudyEntry): string {
  const { observation: o, revision: r } = entry;
  const values: (string | number | boolean | null)[] = [
    o.studyRunDateUtc,
    o.rerunOrdinal,
    o.retrievalTimestampUtc,
    o.targetDate,
    `D-${o.dayAge}`,
    o.sourceAsOf,
    o.metaStartDate,
    o.metaEndDate,
    o.responseHash,
    o.rawBodyHash,
    o.namedRowCount,
    o.otherPresent,
    o.otherTokens,
    o.totalTokens,
    o.sourceRowCount,
    o.httpStatus,
    o.validationStatus,
    o.validationDetail,
    o.coverageState,
    o.productionSettlementState,
    r.priorRunDate,
    r.priorDayAge === null ? null : `D-${r.priorDayAge}`,
    r.secondsSincePrior,
    r.priorRunDate === null ? null : r.cacheContaminated,
    r.hashChanged,
    r.previousTotalTokens,
    r.revisionTokens,
    r.revisionPct,
    r.revisionPpm,
    r.band,
    r.rowsChanged,
    r.rowsAdded,
    r.rowsRemoved,
    r.otherTokensDelta,
    r.maxRowAbsRevision,
    r.maxRowAbsRevisionPermaslug,
    r.maxRowPctRevision,
    r.maxRowPctRevisionPermaslug,
  ];
  return values.map(cell).join(",");
}

/** Read the ledger. A missing file is an empty study, not an error. */
export function readLedger(paths: ArtifactPaths): StudyEntry[] {
  if (!existsSync(paths.ledger)) return [];
  const entries: StudyEntry[] = [];
  for (const [index, line] of readFileSync(paths.ledger, "utf8").split("\n").entries()) {
    const text = line.trim();
    if (text === "") continue;
    try {
      entries.push(JSON.parse(text) as StudyEntry);
    } catch (error) {
      throw new Error(
        `${paths.ledger}:${index + 1} is not parseable JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return entries;
}

/**
 * The most recent observation of a date before a given retrieval.
 *
 * "Most recent" is by retrieval timestamp rather than by study run date, so an out-of-order
 * or resumed run still compares against what was actually seen last.
 */
export function priorObservationFor(
  entries: readonly StudyEntry[],
  targetDate: string,
  beforeTimestamp: string,
): Observation | null {
  const candidates = entries
    .map((entry) => entry.observation)
    .filter((o) => o.targetDate === targetDate && o.retrievalTimestampUtc < beforeTimestamp)
    .sort((a, b) => a.retrievalTimestampUtc.localeCompare(b.retrievalTimestampUtc));
  return candidates[candidates.length - 1] ?? null;
}

/** Whether this study date already has an observation of this target date. */
export function hasObservation(
  entries: readonly StudyEntry[],
  studyRunDateUtc: string,
  targetDate: string,
): boolean {
  return entries.some(
    (entry) => entry.observation.studyRunDateUtc === studyRunDateUtc && entry.observation.targetDate === targetDate,
  );
}

/** The next rerun ordinal for a study date, so a deliberate re-run keeps its own identity. */
export function nextRerunOrdinal(entries: readonly StudyEntry[], studyRunDateUtc: string): number {
  const ordinals = entries
    .filter((entry) => entry.observation.studyRunDateUtc === studyRunDateUtc)
    .map((entry) => entry.observation.rerunOrdinal);
  return ordinals.length === 0 ? 0 : Math.max(...ordinals) + 1;
}

/**
 * Whether a deliberate re-run is far enough from the last read to mean anything.
 *
 * Inside the source's 60-second cache window the body is byte-identical by construction, so
 * a re-run there would record a stability that was never measured. Refused rather than
 * flagged, because the request itself is the thing worth not making.
 */
export function rerunSpacingRefusal(
  entries: readonly StudyEntry[],
  targetDate: string,
  now: Date,
): string | null {
  const last = priorObservationFor(entries, targetDate, now.toISOString());
  if (last === null) return null;
  const seconds = (now.getTime() - Date.parse(last.retrievalTimestampUtc)) / 1000;
  if (seconds >= RERUN_MIN_SPACING_SECONDS) return null;
  return (
    `${targetDate} was last read ${seconds.toFixed(0)}s ago, inside the source's 60s cache window. ` +
    `A re-read now returns a byte-identical body and would record a stability that was not measured. ` +
    `Wait ${Math.ceil(RERUN_MIN_SPACING_SECONDS - seconds)}s.`
  );
}

/** Append observations to both artifacts. The CSV header is written once, on creation. */
export function appendEntries(paths: ArtifactPaths, entries: readonly StudyEntry[]): void {
  if (entries.length === 0) return;
  mkdirSync(paths.directory, { recursive: true });

  if (!existsSync(paths.csv)) {
    writeFileSync(paths.csv, `${CSV_COLUMNS.join(",")}\n`, "utf8");
  }
  appendFileSync(paths.ledger, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
  appendFileSync(paths.csv, entries.map(csvRow).join("\n") + "\n", "utf8");
}

/** Recompute the state file from the ledger. Derived, so it can always be rebuilt. */
export function writeState(paths: ArtifactPaths, entries: readonly StudyEntry[], now: Date): StudyState {
  mkdirSync(paths.directory, { recursive: true });
  const state = deriveState(entries, now);
  writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}
