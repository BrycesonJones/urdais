/**
 * Operator entry point for UEPI historical ingestion.
 *
 * Dry run is the default and writing is opt-in, because the expensive mistake in this phase is not
 * a failed fetch -- it is a backfill that lands in the wrong database. So a writing run must name
 * the host it expects to write to, and the script refuses if the resolved connection disagrees.
 * Naming an environment variable is not naming a target: `DATABASE_URL` points wherever it points.
 *
 *   npx tsx scripts/uepi/backfill.ts --market caiso --from 2026-09-01 --to 2026-09-23
 *   npx tsx scripts/uepi/backfill.ts --market caiso --from 2026-09-01 --to 2026-09-23 \
 *       --write --target localhost
 *
 * Flags: --market --from --to [--write] [--target <host substring>] [--limit n] [--pause ms] [--json]
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { backfill, type DayOutcome } from "@/lib/uepi/backfill";
import { IMPLEMENTED_SERIES_IDS, unavailableReason } from "@/lib/uepi/source/registry";
import { isUepiSeriesId, type UepiSeriesId } from "@/lib/uepi/types";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function resolveSeriesId(raw: string | null): UepiSeriesId {
  if (raw === null) throw new Error(`--market is required; implemented markets are ${IMPLEMENTED_SERIES_IDS.join(", ")}`);
  const candidate = raw.startsWith("uepi-") ? raw : `uepi-${raw.toLowerCase()}`;
  if (!isUepiSeriesId(candidate)) throw new Error(`'${raw}' is not a UEPI market`);
  const unavailable = unavailableReason(candidate);
  if (unavailable !== null) {
    throw new Error(
      `${candidate} has no adapter: ${unavailable.reason}. ${unavailable.detail}\n`
      + `It is unblocked by:\n  - ${unavailable.unblockedBy.join("\n  - ")}`);
  }
  return candidate;
}

/** The host a connection string actually points at, with the credential left out of the answer. */
function describeTarget(url: string): { host: string; database: string } {
  const parsed = new URL(url);
  return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, "") };
}

async function main(): Promise<void> {
  const seriesId = resolveSeriesId(flag("market"));
  const from = flag("from");
  const to = flag("to");
  if (from === null || to === null) throw new Error("--from and --to are required (YYYY-MM-DD)");

  const write = process.argv.includes("--write");
  const limit = flag("limit") === null ? undefined : Number(flag("limit"));
  const pauseMs = flag("pause") === null ? undefined : Number(flag("pause"));
  const asJson = process.argv.includes("--json");

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | undefined;
  if (write) {
    const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
    if (!url) throw new Error("--write needs a database URL, and none is configured");
    const target = describeTarget(url);
    const expected = flag("target");
    if (expected === null) {
      throw new Error(
        `--write requires --target naming the host you intend to write to. This connection resolves `
        + `to host '${target.host}', database '${target.database}'.`);
    }
    if (!target.host.includes(expected)) {
      throw new Error(
        `refusing to write: --target '${expected}' does not match the resolved host '${target.host}' `
        + `(database '${target.database}')`);
    }
    process.stderr.write(`writing to host '${target.host}', database '${target.database}'\n`);
    sql = await createTokenSqlExecutor(url);
  }

  try {
    const result = await backfill({
      seriesId, from, to, dryRun: !write, limit, pauseMs, sql,
      onDay: asJson ? undefined : (day: DayOutcome) => {
        const value = day.valueUsdPerMwh === null ? "" : ` ${day.valueUsdPerMwh} $/MWh`;
        const hours = day.observationCount === null ? "" : ` (${day.observationCount}/${day.expectedObservationCount}h)`;
        const why = day.detail === null ? ""
          : day.reason === null ? ` -- ${day.detail}` : ` -- ${day.reason}: ${day.detail}`;
        process.stdout.write(`${day.operatingDate} ${day.status}${value}${hours}${why}\n`);
      },
    });
    if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `\n${result.seriesId} ${result.from}..${result.to} ${result.dryRun ? "(dry run)" : "(written)"}: `
        + `${result.released} released, ${result.withheld} withheld, ${result.failed} failed, `
        + `${result.skipped} skipped\n`);
    }
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
