/**
 * UEPI operational state, read-only.
 *
 * Reports the freshness of every series and whether the configuration a scheduled run needs is
 * present. It writes nothing, ingests nothing and triggers nothing: it is what an operator runs
 * to answer "is UEPI advancing, and could it?" without touching production.
 *
 * Credentials are reported as present or absent **by name only**. No value, prefix, length or
 * hash of a secret is printed, because an operations report is the kind of output that ends up
 * pasted into a ticket.
 *
 *   npm run uepi:ops
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { loadUepiFreshness } from "@/lib/uepi/ops/store";
import { IMPLEMENTED_SERIES_IDS } from "@/lib/uepi/source/registry";
import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";

/** Every variable a scheduled run needs, and which markets stop working without it. */
const REQUIRED_CONFIGURATION: readonly { name: string; neededFor: string }[] = [
  { name: "CRON_SECRET", neededFor: "the scheduled endpoint; absent means every invocation is refused" },
  { name: "ERCOT_API_USERNAME", neededFor: "ERCOT" },
  { name: "ERCOT_API_PASSWORD", neededFor: "ERCOT" },
  { name: "ERCOT_API_SUBSCRIPTION_KEY", neededFor: "ERCOT" },
  { name: "ISONE_USERNAME", neededFor: "ISO-NE" },
  { name: "ISONE_PASSWORD", neededFor: "ISO-NE" },
];

const STATUS_LABEL: Record<string, string> = {
  current: "CURRENT",
  warn: "WARN",
  fail: "FAIL",
  never_released: "NEVER RELEASED",
  not_ingested: "not ingested",
};

async function main(): Promise<void> {
  process.stdout.write("configuration (presence only; no value is read or printed)\n");
  const missing: string[] = [];
  for (const variable of REQUIRED_CONFIGURATION) {
    const present = (process.env[variable.name] ?? "").trim().length > 0;
    if (!present) missing.push(variable.name);
    process.stdout.write(`  ${present ? "present" : "ABSENT "}  ${variable.name.padEnd(28)} ${variable.neededFor}\n`);
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: false });
  if (!url) {
    process.stdout.write("\nno database configured; freshness cannot be evaluated\n");
    process.exitCode = 1;
    return;
  }
  const target = new URL(url);
  process.stdout.write(`\nreading host '${target.hostname}', database '${target.pathname.slice(1)}'\n\n`);

  const sql = await createTokenSqlExecutor(url);
  try {
    const report = await loadUepiFreshness(sql, new Date());
    process.stdout.write(
      `freshness at ${report.evaluatedAt}  (current <= ${report.thresholds.currentWithinDays}d, ` +
        `warn <= ${report.thresholds.warnWithinDays}d, fail beyond)\n`,
    );
    for (const series of report.series) {
      const ingested = IMPLEMENTED_SERIES_IDS.includes(series.seriesId) ? "ingested" : "no adapter";
      const posture = UEPI_BENCHMARKS[series.seriesId].publicationPosture;
      process.stdout.write(
        `  ${series.seriesId.padEnd(12)} ${(STATUS_LABEL[series.status] ?? series.status).padEnd(15)} ` +
          `head ${(series.latestOperatingDate ?? "-").padEnd(11)} expected ${series.expectedOperatingDate}  ` +
          `lag ${String(series.lagDays ?? "-").padStart(3)}d  ${ingested}, ${posture}\n`,
      );
    }
    process.stdout.write(`\nworst status: ${STATUS_LABEL[report.worstStatus] ?? report.worstStatus}\n`);

    const { rows } = await sql.query(
      `select trigger_kind, outcome, started_at, days_released
         from pipeline.uepi_ingestion_runs order by started_at desc limit 5`,
      [],
    );
    process.stdout.write(`\nlast ${rows.length} run(s) in the ledger\n`);
    if (rows.length === 0) process.stdout.write("  (none: no scheduled run has been recorded yet)\n");
    for (const row of rows) {
      process.stdout.write(
        `  ${new Date(String(row.started_at)).toISOString()}  ${String(row.trigger_kind).padEnd(9)} ` +
          `${String(row.outcome).padEnd(9)} released ${row.days_released}\n`,
      );
    }
  } finally {
    await sql.end();
  }

  if (missing.length > 0) {
    process.stdout.write(`\nmissing configuration: ${missing.join(", ")}\n`);
    process.exitCode = 1;
  }
}

void main();
