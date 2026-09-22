/**
 * Transmission headroom ingestion.
 *
 *   npm run transmission-headroom:ingest -- --source nyiso                    # today
 *   npm run transmission-headroom:ingest -- --source nyiso --month 2026-09    # one archive
 *   npm run transmission-headroom:ingest -- --source nyiso --from 2005-02 --to 2005-03
 *   npm run transmission-headroom:ingest -- --source ercot                    # whole listing
 *   npm run transmission-headroom:ingest -- --source ercot --limit 5
 *   npm run transmission-headroom:ingest -- --all --dry-run
 *
 * NYISO backfills from monthly archives and refuses anything before 2005-02-01, where the source
 * publishes no usable limit. ERCOT is forward-only: its listing is a rolling seven-day window with
 * no archive, so whatever is exposed now is the whole of what can ever be retrieved.
 */

import {
  INGESTIBLE_TRANSMISSION_SOURCES, runTransmissionIngestion,
} from "@/lib/transmission-headroom/ingest/run";
import { NYISO_USABLE_HISTORY_START } from "@/lib/transmission-headroom/ingest/adapters/nyiso";
import { sourceCoverage, transmissionCurrentness, domainViolations } from "@/lib/transmission-headroom/read";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function monthStart(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (match === null) throw new Error(`--${value} must look like YYYY-MM`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const source = flag("source");
  const month = flag("month");
  const from = flag("from");
  const to = flag("to");
  const limitFlag = flag("limit");
  const limit = limitFlag === null ? undefined : Number(limitFlag);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    console.error("--limit must be a positive integer");
    process.exit(2);
  }
  if (!all && source === null) {
    console.error(`usage: --source <${INGESTIBLE_TRANSMISSION_SOURCES.join("|")}> | --all `
      + `[--month YYYY-MM] [--from YYYY-MM --to YYYY-MM] [--limit N] [--dry-run]`);
    process.exit(2);
  }

  let window: { start: Date; end: Date } | undefined;
  if (month !== null) window = { start: monthStart(month), end: monthStart(month) };
  else if (from !== null) window = { start: monthStart(from), end: monthStart(to ?? from) };

  if (window !== undefined && window.start < new Date(`${NYISO_USABLE_HISTORY_START}T00:00:00Z`)) {
    console.error(`NYISO publishes no usable limit before ${NYISO_USABLE_HISTORY_START}; `
      + `earlier files exist but carry a sentinel in both limit columns.`);
    process.exit(2);
  }

  const sources = all ? INGESTIBLE_TRANSMISSION_SOURCES : [source!];
  const url = dryRun ? null : resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!dryRun && url === null) throw new Error("no database URL is configured");
  const sql = url === null ? null : await createTokenSqlExecutor(url);

  try {
    const report = await runTransmissionIngestion(sql, sources, {
      dryRun, ...(window === undefined ? {} : { window }),
      ...(limit === undefined ? {} : { limit }),
    });
    const extras = sql === null ? {} : {
      coverage: await sourceCoverage(sql),
      currentness: await transmissionCurrentness(sql),
      domainViolations: await domainViolations(sql),
    };
    console.log(JSON.stringify({ ...report, ...extras }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
