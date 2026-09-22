/**
 * Operator entry point for the UMPI derivation.
 *
 * Reads current observations, builds the Series B base where the base year is complete, derives
 * monthly levels and month-over-month changes, and writes internal publication records. It adds
 * no scheduler: a derivation happens because a person asked for one.
 *
 *   npm run umpi:derive
 *   npm run umpi:derive -- --series UMPI-KR-DRAM-PPI
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { deriveAll, deriveSeries } from "@/lib/umpi/derive/run";
import { UMPI_SERIES_CODES, type UmpiSeriesCode } from "@/lib/umpi/types";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main(): Promise<void> {
  const series = flag("series") as UmpiSeriesCode | null;
  if (series !== null && !UMPI_SERIES_CODES.includes(series)) {
    console.error(`usage: npm run umpi:derive -- [--series ${UMPI_SERIES_CODES.join("|")}]`);
    process.exit(2);
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const outcomes = series === null ? await deriveAll(sql) : [await deriveSeries(sql, series)];
    console.log(JSON.stringify(outcomes, null, 2));
    if (outcomes.some((outcome) => outcome.status === "failed")) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
