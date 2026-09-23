/**
 * Is UMPI operationally healthy?
 *
 * Exits 0 when nothing needs a person and non-zero when something does, so it can back a CI step,
 * an external uptime monitor, or a future alerting rule without any of them parsing prose.
 *
 *   npm run umpi:production:check
 *   npm run umpi:production:check -- --json
 *   npm run umpi:production:check -- --as-of 2026-11-15
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { checkUmpiProduction } from "@/lib/umpi/ops/production-check";

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
  let report;
  try {
    report = await checkUmpiProduction(sql, asOf);
  } finally {
    await sql.end();
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.healthy ? 0 : 1);
  }

  console.log(`UMPI operations   ${report.checkedAt}`);
  console.log(`family freshness  ${report.familyFreshness}`);
  console.log(`scheduler         ${report.schedulerLastRunAt ?? "never run"}`
    + (report.schedulerLastOutcome === null ? "" : `  (${report.schedulerLastOutcome})`));
  console.log("");

  for (const series of report.series) {
    console.log(`${series.seriesCode}`);
    console.log(`  freshness       ${series.freshness}`);
    console.log(`  expected month  ${series.expectedReferenceMonth}`);
    console.log(`  published month ${series.publishedMonth ?? "none"}`);
    console.log(`  observed month  ${series.observedMonth ?? "none"}`);
    console.log(`  last checked    ${series.lastCheckedAt ?? "never"}`
      + (series.lastCheckReachable === null ? "" : series.lastCheckReachable ? "  (reachable)" : "  (unreachable)"));
    console.log(`  methodology     ${series.methodologyVersion ?? "none"}`
      + (series.sourceProductionApproved ? "   source production-approved" : "   SOURCE NOT PRODUCTION-APPROVED"));
    if (series.baseValid !== null) console.log(`  base            ${series.baseValid ? "valid" : "INVALID"}`);
    if (series.lastFailure !== null) {
      console.log(`  last failure    ${series.lastFailure.stage}/${series.lastFailure.class} at ${series.lastFailure.at}`);
      console.log(`                  ${series.lastFailure.detail}`);
    }
    console.log("");
  }

  const blocking = report.findings.filter((finding) => finding.blocking);
  const advisory = report.findings.filter((finding) => !finding.blocking);
  if (blocking.length > 0) {
    console.log("action required:");
    for (const finding of blocking) {
      console.log(`  [${finding.code}] ${finding.detail}`);
      console.log(`      remedy: ${finding.remedy}`);
    }
  }
  if (advisory.length > 0) {
    console.log(`${blocking.length > 0 ? "\n" : ""}advisory:`);
    for (const finding of advisory) {
      console.log(`  [${finding.code}] ${finding.detail}`);
      console.log(`      ${finding.remedy}`);
    }
  }

  console.log(report.healthy
    ? "\nhealthy: both series are current or legitimately awaiting release."
    : "\nunhealthy: see above.");
  process.exit(report.healthy ? 0 : 1);
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
});
