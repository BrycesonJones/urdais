/**
 * Interconnection queue analytics.
 *
 *   npm run interconnection-queue:analytics -- --dry-run
 *   npm run interconnection-queue:analytics -- --write
 *
 * One calculation over the canonical evidence base, under the approved methodology. A rerun over
 * unchanged inputs resolves to the run already recorded and writes nothing.
 *
 * The run refuses to start if the methodology document has changed since the version was
 * approved: an approved version and its document are one thing.
 */

import { runQueueAnalytics } from "@/lib/interconnection-queue/analytics/run";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const write = process.argv.includes("--write");
  if (!dryRun && !write) {
    console.error("usage: --dry-run | --write  [--as-of YYYY-MM-DD]");
    process.exit(2);
  }
  const asOf = flag("as-of");
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  const startedAt = Date.now();
  try {
    const outcome = await runQueueAnalytics(sql, {
      dryRun, ...(asOf === null ? {} : { asOf }),
    });
    if (outcome.status === "dry_run") {
      const byStatus: Record<string, number> = {};
      for (const result of outcome.run.results) {
        byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
      }
      console.log(JSON.stringify({
        status: outcome.status, methodologyVersion: outcome.run.methodologyVersion,
        inputDigest: outcome.run.inputDigest, snapshots: outcome.run.snapshotIds.length,
        requests: outcome.run.requestCount, results: outcome.run.results.length,
        byStatus, calculateMs: outcome.calculateMs, runtimeMs: Date.now() - startedAt,
      }, null, 2));
    } else {
      console.log(JSON.stringify({ ...outcome, runtimeMs: Date.now() - startedAt }, null, 2));
    }
    if (outcome.status === "failed") process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
