/**
 * Interconnection queue ingestion.
 *
 *   npm run interconnection-queue:ingest -- --source pjm
 *   npm run interconnection-queue:ingest -- --source miso
 *   npm run interconnection-queue:ingest -- --source caiso
 *   npm run interconnection-queue:ingest -- --all
 *   npm run interconnection-queue:ingest -- --source caiso --dry-run
 *
 * Each source retrieves, parses and writes inside its own transaction, so a publisher who has
 * reorganised a feed fails alone and leaves every other market untouched.
 *
 * Warnings are loud on purpose. A duplicate canonical identity or a malformed queue id is a
 * corruption risk and fails the run; an unmapped status or technology is a vocabulary gap, which
 * is recorded as a deferral and reported rather than dropped.
 */

import { runQueueIngestion, INGESTIBLE_QUEUE_SOURCES } from "@/lib/interconnection-queue/ingest/run";
import { sourceCurrentness } from "@/lib/interconnection-queue/monitor";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const source = flag("source");
  // Archive sources only: take the most recent N artifacts instead of the whole archive.
  const limitFlag = flag("limit");
  const limit = limitFlag === null ? undefined : Number(limitFlag);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    console.error("--limit must be a positive integer");
    process.exit(2);
  }
  if (!all && source === null) {
    console.error(`usage: --source <${INGESTIBLE_QUEUE_SOURCES.join("|")}> | --all  [--dry-run] [--limit N]`);
    process.exit(2);
  }
  const sources = all ? INGESTIBLE_QUEUE_SOURCES : [source!];

  const url = dryRun ? null : resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!dryRun && url === null) throw new Error("no database URL is configured");
  const sql = url === null ? null : await createTokenSqlExecutor(url);
  const startedAt = Date.now();
  try {
    const report = await runQueueIngestion(sql, sources, {
      dryRun, ...(limit === undefined ? {} : { limit }),
    });
    const currentness = sql === null ? [] : await sourceCurrentness(sql);
    console.log(JSON.stringify({
      ...report,
      runtimeMs: Date.now() - startedAt,
      currentness,
      note: "Queue MW is a request to connect. It is never accredited, deliverable or installed capacity.",
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
