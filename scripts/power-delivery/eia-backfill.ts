/**
 * Historical EIA-930 backfill.
 *
 *   npm run power-delivery:eia-backfill -- --start 2025-01-01T00 --end 2025-12-31T23 --estimate
 *   npm run power-delivery:eia-backfill -- --start 2025-01-01T00 --end 2025-12-31T23
 *   npm run power-delivery:eia-backfill -- --local-year 2025 --market ercot --estimate
 *
 * `--estimate` reports what the range would cost and writes nothing. Run it first.
 *
 * The range is cut into chunks that each fit one EIA page, and every chunk goes through the same
 * `runPowerIngestion` the scheduled cron uses. Re-running a range is safe and cheap: a chunk whose
 * bytes are already recorded is recognised by its retrieval key and touches no observation.
 *
 * `--market` only selects which market's local year `--local-year` is resolved against. EIA
 * requests always cover all seven balancing authorities and both metrics, because that is the one
 * request shape `buildEia930Parameters` builds; there is no per-market retrieval.
 *
 * This writes to whatever `DATABASE_URL` points at. Against production it is an operator action
 * that needs explicit authorisation, so it prints the target host and refuses to start without
 * `--confirm-production` when the target is not local.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { estimateBackfill, runEiaBackfill, DEFAULT_CHUNK_DAYS } from "@/lib/flexible-capacity/backfill";
import { localYearWindow } from "@/lib/flexible-capacity/period";
import { FLEXIBLE_CAPACITY_MARKETS, type FlexibleCapacityMarket } from "@/lib/flexible-capacity/types";
import { readEiaApiKey, EIA_API_KEY_ENV } from "@/lib/power-delivery/source/eia930";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/** The UTC hour containing an instant, as the EIA API spells it. */
const utcHour = (iso: string): string => iso.slice(0, 13);

function resolveRange(): { start: string; end: string; label: string } {
  const localYear = flag("local-year");
  if (localYear !== null) {
    const marketFlag = (flag("market") ?? "ercot") as FlexibleCapacityMarket;
    if (!FLEXIBLE_CAPACITY_MARKETS.includes(marketFlag)) {
      throw new Error(`--market must be one of ${FLEXIBLE_CAPACITY_MARKETS.join(", ")}`);
    }
    const year = Number(localYear);
    if (!Number.isInteger(year)) throw new Error("--local-year must be a whole year");
    const window = localYearWindow(marketFlag, year);
    // endUtc is exclusive; the EIA API's end hour is inclusive, so step back one hour.
    const lastHour = new Date(Date.parse(window.endUtc) - 3_600_000).toISOString();
    return {
      start: utcHour(window.startUtc), end: utcHour(lastHour),
      label: `${marketFlag} local year ${year} (${window.expectedObservationCount} hours)`,
    };
  }
  const start = flag("start");
  const end = flag("end");
  if (start === null || end === null) {
    throw new Error("usage: --start <YYYY-MM-DDTHH> --end <YYYY-MM-DDTHH> | --local-year <YYYY> [--market <slug>]  [--chunk-days N] [--estimate] [--stop-on-error]");
  }
  return { start, end, label: `${start} to ${end}` };
}

async function main(): Promise<void> {
  const { start, end, label } = resolveRange();
  const chunkDays = Number(flag("chunk-days") ?? DEFAULT_CHUNK_DAYS);
  const estimateOnly = process.argv.includes("--estimate");
  const stopOnError = process.argv.includes("--stop-on-error");

  const estimate = estimateBackfill(start, end, chunkDays);
  if (estimateOnly) {
    console.log(JSON.stringify({ range: label, start, end, chunkDays, ...estimate }, null, 2));
    return;
  }

  if (!readEiaApiKey()) throw new Error(`${EIA_API_KEY_ENV} is not configured`);
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");

  const host = new URL(url).host;
  const isLocal = host.startsWith("127.0.0.1") || host.startsWith("localhost");
  if (!isLocal && !process.argv.includes("--confirm-production")) {
    throw new Error(
      `refusing to backfill a non-local database (${host}) without --confirm-production. `
      + "A historical backfill against production is an authorised operator action.");
  }

  console.error(`backfilling ${label} into ${host}: ${estimate.chunks} chunks, ~${estimate.expectedRows} rows`);
  const sql = await createTokenSqlExecutor(url);
  try {
    const report = await runEiaBackfill(sql, { start, end }, {
      chunkDays, stopOnError,
      onChunk: (outcome, index, total) => {
        const state = outcome.ok ? outcome.outcome : `FAILED ${outcome.errors[0] ?? ""}`;
        console.error(
          `  [${index + 1}/${total}] ${outcome.chunk.start}..${outcome.chunk.end} `
          + `raw=${outcome.rawRecords} new=${outcome.inserted} rev=${outcome.revised} `
          + `same=${outcome.unchanged} na=${outcome.unavailable} ${state}`);
      },
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
