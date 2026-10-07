/**
 * Operator backfill for UTVI.
 *
 * Reads the source's retained history and records it. Safe by default in the ways that matter:
 * it targets the local harness database unless a URL is given, it writes to a remote database
 * only once it has identified it as UrdaisProd or UrdaisDev by project reference, production
 * additionally needs an explicit acknowledgement, and `--dry-run` plans the requests and confirms
 * the target without making any request or opening any connection. The rules live in
 * `backfill-cli.ts`.
 *
 * Idempotent by construction rather than by a flag. A second run re-reads the same dates,
 * finds the same content hashes, and confirms them — no duplicate snapshot, no duplicate
 * calculation, no duplicate publication. A date whose rows genuinely changed is revised, which
 * is the same path a late revision takes, so running this twice is a real test of the
 * supersession logic rather than a risk.
 *
 * Usage:
 *   npx tsx scripts/utvi/backfill.ts [--start 2025-01-01] [--end 2026-09-15] [--dry-run]
 *                                    [--database-url <url>] [--i-know-this-is-production]
 *
 * Prefer UTVI_DATABASE_URL to --database-url for a remote target: a flag's value is visible in
 * shell history and the process list. Production is confirmed against
 * SUPABASE_PRODUCTION_PROJECT_REF and development against SUPABASE_PROJECT_REF, both read from
 * the environment or `.env.local`.
 *
 * The API key comes from OPENROUTER_API_KEY and is never printed.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import { backfillUtvi } from "@/lib/utvi/run";
import { lastCompletedUtcDate } from "@/lib/utvi/settlement";
import { readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";
import { SOURCE_HISTORY_FLOOR } from "@/lib/utvi/types";
import { planBackfill } from "@/lib/utvi/windows";

import { parseBackfillArgs, resolveBackfillTarget } from "./backfill-cli";

/** Load `.env.local` for the values this script needs, without printing any of them. */
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

async function main(): Promise<void> {
  loadLocalEnv();

  const parsed = parseBackfillArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(2);
  }
  const args = parsed.args;

  const resolved = resolveBackfillTarget(args, process.env);
  if (!resolved.ok) {
    console.error(`refusing to run: ${resolved.error}`);
    process.exit(2);
  }
  const target = resolved.target;

  const now = new Date();
  const start = args.start ?? SOURCE_HISTORY_FLOOR;
  const end = args.end ?? lastCompletedUtcDate(now);
  const dryRun = args.dryRun;

  const plan = planBackfill(start, end, now);
  if (plan === null) {
    console.error(`nothing to do: ${start}..${end} contains no date the source will serve`);
    process.exit(2);
  }

  console.log(`target        ${target.description}`);
  console.log(`environment   ${target.environment}${target.projectRef === null ? "" : ` (project ${target.projectRef}, confirmed)`}`);
  console.log(`chosen by     ${target.source}`);
  console.log(`requested     ${start} .. ${end}`);
  console.log(`servable      ${plan.startDate} .. ${plan.endDate} (${plan.expectedDates.length} dates)`);
  console.log(`requests      ${plan.windows.length}`);
  for (const window of plan.windows) {
    console.log(`  window      ${window.startDate} .. ${window.endDate} (${window.dayCount} days)`);
  }

  if (dryRun) {
    console.log("\ndry run: no request was made and nothing was written");
    return;
  }

  if (readApiKey() === null) {
    console.error(`${UTVI_API_KEY_ENV} is not configured; nothing was retrieved`);
    process.exit(2);
  }

  // A single client, not a pool: the revision path uses a transaction, and a pool may route
  // consecutive statements to different connections.
  const client = new pg.Client({ connectionString: target.connectionString });
  await client.connect();
  const sql = {
    query: async (text: string, params: readonly unknown[]) => ({
      rows: (await client.query(text, params as unknown[])).rows as Record<string, unknown>[],
    }),
  };
  try {
    const started = Date.now();
    const result = await backfillUtvi(sql, start, end, { now: () => now });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\ncompleted in ${seconds}s`);
    console.log(`  source requests      ${result.requestCount}`);
    console.log(`  dates expected       ${result.datesExpected}`);
    console.log(`  dates covered        ${result.datesCovered}`);
    console.log(`  snapshots created    ${result.snapshotsCreated}`);
    console.log(`  snapshots confirmed  ${result.snapshotsConfirmed}`);
    console.log(`  snapshots revised    ${result.snapshotsRevised}`);
    console.log(`  snapshots settled    ${result.snapshotsSettled}`);
    console.log(`  dates without rows   ${result.datesWithoutRows}`);
    console.log(`  calculations         ${result.calculationsRecorded}`);
    console.log(`  coverage complete    ${result.coverage.complete}`);
    if (result.coverage.sourceReturnedNoRows.length > 0) {
      // Not a gap in Urdais's coverage: the source served these dates and had nothing.
      console.log(`  source empty dates   ${result.coverage.sourceReturnedNoRows.join(", ")}`);
    }
    if (result.coverage.missing.length > 0) {
      console.log(`  MISSING              ${result.coverage.missing.slice(0, 20).join(", ")}`);
    }
    if (result.coverage.duplicated.length > 0) {
      console.log(`  DUPLICATED           ${result.coverage.duplicated.join(", ")}`);
    }

    const published = result.dates.filter((d) => d.publication === "published").length;
    const superseded = result.dates.filter((d) => d.publication === "superseded").length;
    console.log(`  publications         ${published} published, ${superseded} superseded`);

    const outcomes = new Map<string, number>();
    for (const date of result.dates) {
      if (date.publication.startsWith("refused") || date.publication === "failed") {
        outcomes.set(date.publication, (outcomes.get(date.publication) ?? 0) + 1);
      }
    }
    for (const [reason, count] of outcomes) {
      console.log(`  publication          ${reason}: ${count}`);
    }
    const firstFailure = result.dates.find((d) => d.publication === "failed" || d.calculation === "failed");
    if (firstFailure) {
      console.log(`  first failure        ${firstFailure.observationDate}: ${firstFailure.publicationDetail ?? firstFailure.calculationDetail}`);
    }

    if (!result.ok) {
      console.error("\nbackfill did not complete cleanly");
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
