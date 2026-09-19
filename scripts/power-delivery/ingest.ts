/** Operator/backfill entry point for the same EIA-930 pipeline used by the scheduled route. */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runPowerIngestion, scheduledPowerWindow } from "@/lib/power-delivery/run";
import { readEiaApiKey, EIA_API_KEY_ENV } from "@/lib/power-delivery/source/eia930";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const defaults = scheduledPowerWindow();
  const start = flag("start") ?? defaults.start;
  const end = flag("end") ?? defaults.end;
  const backfill = process.argv.includes("--backfill");
  if (!readEiaApiKey()) throw new Error(`${EIA_API_KEY_ENV} is not configured`);
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const result = await runPowerIngestion(sql, { start, end, trigger: backfill ? "backfill" : "operator" });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
