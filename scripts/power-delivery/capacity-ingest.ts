/**
 * Grid capacity ingestion.
 *
 *   npm run power-delivery:capacity-ingest -- --source ercot
 *   npm run power-delivery:capacity-ingest -- --source caiso
 *   npm run power-delivery:capacity-ingest -- --source iso-ne
 *   npm run power-delivery:capacity-ingest -- --all
 *   npm run power-delivery:capacity-ingest -- --source ercot --dry-run
 *
 * `--all` runs every ingestible source in turn. Each one retrieves, parses and writes inside its
 * own transaction, so a publisher who has reorganised a workbook fails alone and leaves every
 * other market untouched.
 *
 * Every run reports what it did not store as well as what it did: a metric deferred because its
 * source publishes it only as a PDF, or because summing it would be an Urdais decision, is named
 * with its reason. An absence that is explained is not the same thing as an absence.
 *
 * There is no cron. These are annual publications, and a scheduler that re-fetched them nightly
 * would spend a year confirming nothing had changed; detecting a genuinely new release needs the
 * publisher-specific discovery step that the planning source monitors provide.
 */

import { CAPACITY_DEFERRALS } from "@/lib/power-delivery/capacity/ingest/registry";
import { runCapacityIngestion, INGESTIBLE_CAPACITY_SOURCES } from "@/lib/power-delivery/capacity/ingest/run";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const source = flag("source");
  if (!all && source === null) {
    console.error(`usage: --source <${INGESTIBLE_CAPACITY_SOURCES.join("|")}> | --all  [--dry-run]`);
    process.exit(2);
  }
  const sources = all ? INGESTIBLE_CAPACITY_SOURCES : [source!];

  const url = dryRun ? null : resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!dryRun && url === null) throw new Error("no database URL is configured");
  const sql = url === null ? null : await createTokenSqlExecutor(url);
  try {
    const report = await runCapacityIngestion(sql, sources, { dryRun });
    const deferred = CAPACITY_DEFERRALS.filter((entry) => sources.includes(entry.source));
    console.log(JSON.stringify({
      ...report,
      deferred: deferred.map((entry) => ({
        source: entry.source, metric: entry.metric, quantityKind: entry.quantityKind,
        kind: entry.kind, reason: entry.reason, unblockedBy: entry.unblockedBy,
      })),
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
