/**
 * Fail-closed checks for the production facility-import workflow.
 *
 * The importer remains the only code that plans or writes facilities. This
 * script only reads its JSON report and makes the operational expectations
 * executable, so a surprising write set cannot pass because somebody missed a
 * line in a long Actions log.
 */

import { readFileSync } from "node:fs";

const EXPECTED_DIGEST = "938c7d2c15b6d04eff50560902800f8bc6b52286b435889976b6d943c6eb4c1e";
const EXPECTED_FACILITIES = 187;
const EXPECTED_RELATIONSHIPS = 20;

type WriteSet = {
  inserted?: unknown;
  updated?: unknown;
  unchanged?: unknown;
  deleted?: unknown;
  restamped?: unknown;
};

type ImportReport = {
  mode?: unknown;
  databaseConfigured?: unknown;
  digest?: unknown;
  counts?: { facilities?: unknown; relationships?: unknown };
  errors?: unknown;
  wrote?: unknown;
  writeSet?: WriteSet | null;
  result?: WriteSet | null;
};

function values(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

function assertCommon(report: ImportReport): void {
  if (report.databaseConfigured !== true) throw new Error("importer did not connect to the production database");
  if (report.digest !== EXPECTED_DIGEST) {
    throw new Error(`dataset digest changed: expected ${EXPECTED_DIGEST}, received ${String(report.digest)}`);
  }
  if (report.counts?.facilities !== EXPECTED_FACILITIES) {
    throw new Error(`dataset facility count changed: expected ${EXPECTED_FACILITIES}, received ${String(report.counts?.facilities)}`);
  }
  if (report.counts?.relationships !== EXPECTED_RELATIONSHIPS) {
    throw new Error(`dataset relationship count changed: expected ${EXPECTED_RELATIONSHIPS}, received ${String(report.counts?.relationships)}`);
  }
  if (values(report.errors, "errors").length !== 0) throw new Error("importer reported hard errors");
}

function counts(writeSet: WriteSet): { inserted: number; updated: number; unchanged: number; deleted: number; restamped: number } {
  return {
    inserted: values(writeSet.inserted, "inserted").length,
    updated: values(writeSet.updated, "updated").length,
    unchanged: values(writeSet.unchanged, "unchanged").length,
    deleted: values(writeSet.deleted, "deleted").length,
    restamped: values(writeSet.restamped, "restamped").length,
  };
}

function main(): void {
  const [mode, file] = process.argv.slice(2);
  if (!mode || !file || !["dry-run", "write", "idempotent"].includes(mode)) {
    throw new Error("usage: assert-import-report.ts <dry-run|write|idempotent> <report.json>");
  }

  const report = JSON.parse(readFileSync(file, "utf8")) as ImportReport;
  assertCommon(report);
  const writeSet = mode === "dry-run" ? report.writeSet : report.result;
  if (!writeSet) throw new Error(`${mode} report has no write set`);
  const actual = counts(writeSet);

  if (actual.updated !== 0 || actual.deleted !== 0 || actual.restamped !== 0) {
    throw new Error(`unsafe write set: ${JSON.stringify(actual)}`);
  }

  if (mode === "idempotent") {
    if (actual.inserted !== 0 || actual.unchanged !== EXPECTED_FACILITIES) {
      throw new Error(`second write was not idempotent: ${JSON.stringify(actual)}`);
    }
  } else {
    const fresh = actual.inserted === EXPECTED_FACILITIES && actual.unchanged === 0;
    const settled = actual.inserted === 0 && actual.unchanged === EXPECTED_FACILITIES;
    if (!fresh && !settled) throw new Error(`production is neither empty nor fully settled: ${JSON.stringify(actual)}`);
  }

  if (mode === "dry-run" && (report.mode !== "dry-run" || report.wrote !== false)) {
    throw new Error("dry-run report does not prove that no write occurred");
  }
  if (mode !== "dry-run" && (report.mode !== "write" || report.wrote !== true)) {
    throw new Error(`${mode} report does not prove a completed write`);
  }

  console.log(JSON.stringify({ mode, digest: report.digest, ...actual }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
