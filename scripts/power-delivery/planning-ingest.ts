/**
 * Planning-forecast ingestion.
 *
 *   npm run power-delivery:planning-ingest -- --source ercot
 *   npm run power-delivery:planning-ingest -- --all
 *   npm run power-delivery:planning-ingest -- --source cec --dry-run
 *
 * `--all` runs every ingestible source in turn. Each one retrieves, parses and writes inside its
 * own transaction, so a publisher who has reorganised a workbook fails alone and leaves every
 * other market untouched. Sources that cannot be collected are reported with their reason rather
 * than skipped silently.
 *
 * There is no cron. These are annual publications, and a scheduler that re-fetched them nightly
 * would spend a year confirming that nothing had changed. Detecting a genuinely new vintage
 * needs a publisher-specific discovery step this phase does not build.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runPlanningIngestion, INGESTIBLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/ingest/run";
import { PLANNING_SOURCE_BLOCKERS } from "@/lib/power-delivery/planning/ingest/registry";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const source = flag("source");
  if (!all && source === null) {
    console.error(`usage: --source <${[...INGESTIBLE_PLANNING_SOURCES, ...PLANNING_SOURCE_BLOCKERS.map((b) => b.source)].join("|")}> | --all  [--dry-run]`);
    process.exit(2);
  }
  const sources = all ? INGESTIBLE_PLANNING_SOURCES : [source!];

  const url = dryRun ? null : resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!dryRun && url === null) throw new Error("no database URL is configured");
  const sql = url === null ? null : await createTokenSqlExecutor(url);
  try {
    const report = await runPlanningIngestion(sql, sources, { dryRun });
    console.log(JSON.stringify({
      ...report,
      blocked: all ? PLANNING_SOURCE_BLOCKERS.map((b) => ({ source: b.source, kind: b.kind, reason: b.reason })) : [],
    }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
