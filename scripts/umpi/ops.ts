/**
 * Operator entry point for a UMPI operational run.
 *
 * The same code path the scheduler takes, runnable by hand. Safe to run at any time: it reads a
 * narrow recent window, writes only what changed, and takes the same advisory lock the scheduled
 * run does, so an accidental overlap with the cron is a clean no-op rather than a race.
 *
 *   npm run umpi:ops
 *   npm run umpi:ops -- --as-of 2026-11-15    # evaluate against a different clock
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runUmpiOperations } from "@/lib/umpi/ops/run";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main(): Promise<void> {
  const asOfRaw = flag("as-of");
  const asOf = asOfRaw === null ? new Date() : new Date(asOfRaw);
  if (Number.isNaN(asOf.getTime())) throw new Error(`--as-of ${JSON.stringify(asOfRaw)} is not a date`);

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const result = await runUmpiOperations(sql, { asOf, trigger: "manual" });
    console.log(JSON.stringify(result, null, 2));
    // A run that found nothing new is a success. Only a failure, or a series that cannot be
    // vouched for, is worth a non-zero exit.
    if (result.outcome === "failed" || result.outcome === "partial_failure") process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
