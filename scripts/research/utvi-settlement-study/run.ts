/**
 * UTVI 14-day settlement study: one daily read, recorded locally.
 *
 * Research only. This script opens no database connection, writes no Urdais table, calls no
 * production route, changes no methodology status and touches no UI. It reads one OpenRouter
 * endpoint and writes three files under `docs/research/utvi/`.
 *
 * It imports the production source client and normalizer on purpose. Reimplementing either
 * would mean the study measured a *different* notion of "changed" from the one the pipeline
 * uses, which would make the result unusable for the decision it is meant to inform. Neither
 * module initializes a database — the DB-touching half of the UTVI library lives in
 * `store.ts` and `run.ts`, and nothing here reaches them.
 *
 * Usage:
 *   npm run utvi:settlement-study              one live read, recorded
 *   npm run utvi:settlement-study -- --dry-run one live read, nothing written
 *   npm run utvi:settlement-study:report       regenerate the summary, no network
 *
 * Options:
 *   --max-day-age <3..7>   oldest day age to record (default 3: D−1, D−2, D−3)
 *   --artifact-dir <dir>   where the artifacts live (default docs/research/utvi)
 *   --allow-rerun          record a second observation for a study date that already has one
 *   --dry-run              read and report, write nothing
 *   --report-only          regenerate the summary and state from the ledger; no request
 *
 * The API key is read from OPENROUTER_API_KEY, or from `.env.local` if the environment does
 * not carry it. It is never printed, never written to an artifact, and no request header is
 * logged.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { snapshotsFromResponse } from "@/lib/utvi/normalize";
import { settlementStateFor } from "@/lib/utvi/settlement";
import { fetchDailyRankings, readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";
import type { DailySnapshot } from "@/lib/utvi/types";

import { buildObservation } from "./observe";
import {
  appendEntries,
  artifactPaths,
  DEFAULT_ARTIFACT_DIR,
  hasObservation,
  nextRerunOrdinal,
  priorObservationFor,
  readLedger,
  rerunSpacingRefusal,
  writeState,
  type ArtifactPaths,
} from "./ledger";
import { renderReport } from "./render";
import {
  computeRevision,
  dayAgeLabel,
  evaluateSettlement,
  MAX_SUPPORTED_DAY_AGE,
  targetDatesFor,
  TARGET_RUN_COUNT,
  utcDateOf,
  type StudyEntry,
} from "./study";

const present = (name: string): boolean => process.argv.includes(`--${name}`);

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

/**
 * Load `.env.local` for the one value this script needs, without printing any of them.
 * An already-set environment variable always wins, so a shell or a launchd plist can
 * override the file.
 */
function loadLocalEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    process.env[key!] = rawValue!.trim().replace(/^["']|["']$/g, "");
  }
}

/** Regenerate the derived artifacts from the ledger. No network, no key required. */
function regenerate(paths: ArtifactPaths, now: Date): void {
  const entries = readLedger(paths);
  const state = writeState(paths, entries, now);
  writeFileSync(paths.markdown, renderReport(entries, state, now), "utf8");

  const verdict = evaluateSettlement(entries, state);
  console.log(`ledger:    ${paths.ledger} (${entries.length} observation${entries.length === 1 ? "" : "s"})`);
  console.log(`csv:       ${paths.csv}`);
  console.log(`state:     ${paths.state}`);
  console.log(`summary:   ${paths.markdown}`);
  console.log(`progress:  run ${state.runsCompleted} of ${TARGET_RUN_COUNT}, ${state.runsRemaining} remaining`);
  if (state.missedRunDates.length > 0) {
    console.log(`missed:    ${state.missedRunDates.join(", ")}`);
  }
  console.log(`verdict:   ${verdict.headline}${verdict.final ? "" : " (provisional)"}`);
}

async function main(): Promise<void> {
  loadLocalEnv();

  const paths = artifactPaths(flag("artifact-dir") ?? DEFAULT_ARTIFACT_DIR);
  const now = new Date();

  if (present("report-only")) {
    regenerate(paths, now);
    return;
  }

  const maxDayAgeRaw = flag("max-day-age");
  const maxDayAge = maxDayAgeRaw === null ? 3 : Number.parseInt(maxDayAgeRaw, 10);
  if (!Number.isInteger(maxDayAge) || maxDayAge < 3 || maxDayAge > MAX_SUPPORTED_DAY_AGE) {
    console.error(`--max-day-age must be an integer from 3 to ${MAX_SUPPORTED_DAY_AGE}`);
    process.exit(2);
  }

  if (readApiKey() === null) {
    console.error(
      `${UTVI_API_KEY_ENV} is not set, in the environment or in .env.local. ` +
        `The study cannot read the source and will not record a run that did not happen.`,
    );
    process.exit(2);
  }

  const dryRun = present("dry-run");
  const allowRerun = present("allow-rerun");
  const studyRunDateUtc = utcDateOf(now);
  const targets = targetDatesFor(now, maxDayAge);
  const existing = readLedger(paths);

  console.log(`UTC now:       ${now.toISOString()}`);
  console.log(`study run:     ${studyRunDateUtc}${dryRun ? "  (dry run — nothing will be written)" : ""}`);
  console.log(`targets:       ${targets.map((t) => `${dayAgeLabel(t.dayAge)}=${t.targetDate}`).join("  ")}`);

  const alreadyRecorded = targets.filter((t) => hasObservation(existing, studyRunDateUtc, t.targetDate));
  if (alreadyRecorded.length > 0 && !allowRerun && !dryRun) {
    console.log(
      `\nAlready recorded on ${studyRunDateUtc}: ${alreadyRecorded.map((t) => t.targetDate).join(", ")}.\n` +
        `Nothing written; the study takes one observation per target date per UTC day.\n` +
        `Pass --allow-rerun to record a deliberate second read with its own identity.`,
    );
    regenerate(paths, now);
    return;
  }
  if (allowRerun && !dryRun) {
    const refusals = targets
      .map((t) => rerunSpacingRefusal(existing, t.targetDate, now))
      .filter((refusal): refusal is string => refusal !== null);
    if (refusals.length > 0) {
      console.error(`\nRe-run refused:\n  ${refusals.join("\n  ")}`);
      process.exit(2);
    }
  }

  // One request for the whole window: the smallest number of reads that covers every target,
  // and one retrieval per target date as the protocol requires.
  const startDate = targets[targets.length - 1]!.targetDate;
  const endDate = targets[0]!.targetDate;
  const retrieval = await fetchDailyRankings({ startDate, endDate });

  console.log(
    `\nretrieval:     ${retrieval.outcome}  HTTP ${retrieval.httpStatus ?? "—"}  ` +
      `window ${retrieval.actualStartDate ?? "—"}..${retrieval.actualEndDate ?? "—"}  rows ${retrieval.rowCount ?? "—"}`,
  );
  if (retrieval.outcomeDetail !== null) console.log(`               ${retrieval.outcomeDetail}`);

  let snapshots: DailySnapshot[] | null = null;
  let snapshotError: string | null = null;
  if (retrieval.outcome === "succeeded" && retrieval.response !== null) {
    try {
      snapshots = snapshotsFromResponse(retrieval.response, (date) => settlementStateFor(date, now));
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : String(error);
    }
  }

  const rerunOrdinal = allowRerun ? nextRerunOrdinal(existing, studyRunDateUtc) : 0;
  const entries: StudyEntry[] = targets.map(({ targetDate, dayAge }) => {
    const observation = buildObservation({
      retrieval,
      snapshots,
      snapshotError,
      targetDate,
      dayAge,
      studyRunDateUtc,
      rerunOrdinal,
      now,
    });
    const prior = priorObservationFor(existing, targetDate, observation.retrievalTimestampUtc);
    return { observation, revision: computeRevision(observation, prior) };
  });

  console.log("");
  for (const { observation: o, revision: r } of entries) {
    const total = o.totalTokens === null ? "—" : o.totalTokens;
    const delta =
      r.priorRunDate === null
        ? "no prior observation"
        : `vs ${r.priorRunDate} (${dayAgeLabel(r.priorDayAge!)}): ${r.hashChanged ? "HASH CHANGED" : "hash identical"}` +
          (r.revisionPpm === null ? "" : `  Δ${r.revisionTokens} (${r.revisionPpm.toFixed(4)} ppm, ${r.band})`);
    console.log(`  ${dayAgeLabel(o.dayAge)} ${o.targetDate}  ${o.validationStatus}  total=${total}`);
    console.log(`        hash=${o.responseHash?.slice(0, 16) ?? "—"}  as_of=${o.sourceAsOf ?? "—"}`);
    console.log(`        ${delta}`);
  }

  if (dryRun) {
    console.log(`\nDry run: nothing written.`);
    return;
  }

  appendEntries(paths, entries);
  console.log(`\nwrote ${entries.length} observation${entries.length === 1 ? "" : "s"}`);
  regenerate(paths, now);
}

void main().catch((error) => {
  // Never the key: it is not in the URL, and the client never puts it in a message.
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
