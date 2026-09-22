/**
 * Transmission headroom analytics.
 *
 *   npm run transmission-headroom:analytics -- --dry-run
 *   npm run transmission-headroom:analytics -- --write
 *
 * Refuses to run if the approved methodology document has changed since it was approved.
 */

import { runTransmissionAnalytics } from "@/lib/transmission-headroom/analytics/run";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const write = process.argv.includes("--write");
  if (dryRun === write) {
    console.error("usage: --dry-run | --write");
    process.exit(2);
  }
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const outcome = await runTransmissionAnalytics(sql, { dryRun });
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status === "failed") process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
