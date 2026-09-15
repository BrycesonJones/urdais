/**
 * UBWI production readiness. Read-only.
 *
 * Fails closed and names which kind of thing is wrong, because the operator response to
 * "the research is not there" is nothing like the response to "the rights are blocked",
 * "the API key has not been issued", or "the gate refused the calculation". A gate
 * refusal in particular is not an outage: it is the gate doing its job.
 *
 * Usage:
 *   npm run ubwi:production:check                 against the resolved database
 *   npm run ubwi:production:check -- --local      allow the local development database
 *   npm run ubwi:production:check -- --no-db      report everything that does not need one
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import { checkUbwiProductionReadiness } from "@/lib/ubwi/production-readiness";

async function main(): Promise<void> {
  const allowLocalDefault = process.argv.includes("--local");
  const skipDatabase = process.argv.includes("--no-db");

  let sql = null;
  if (!skipDatabase) {
    const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
    if (url) {
      sql = await tokenSqlExecutor(url);
    } else {
      console.error("no database url is configured; checking everything that does not need one.");
      console.error("  remedy: set DATABASE_URL (or URDAIS_DATABASE_URL), or pass --local.\n");
    }
  }

  const migrationFiles = readdirSync(path.join(process.cwd(), "supabase", "migrations"));
  const report = await checkUbwiProductionReadiness({
    sql,
    migrationFiles,
    calculatedAt: new Date().toISOString(),
  });

  const c = report.calculation;
  if (c) {
    console.log(`UBWI            ${c.ubwiPercent.toFixed(4)} %  (range ${c.sensitivity.lowPercent.toFixed(4)} - ${c.sensitivity.highPercent.toFixed(4)})`);
    console.log(`observed        ${c.observedShareOfTotal.toFixed(2)} % of Total Global Wealth`);
    console.log(`modeled         ${c.modeledShareOfTotal.toFixed(2)} % of Total Global Wealth`);
    console.log(`coverage        ${(c.coverage.rightsClearedGdpCoverage * 100).toFixed(2)} % of world GDP, rights-cleared`);
    console.log(`constituents    ${c.coverage.rightsClearedEconomyCount} of ${c.coverage.observedEconomyCount} rights-cleared`);
    console.log(`methodology     ${c.methodologyVersion}   residual model ${c.residualModelVersion}`);
  }
  if (report.appliedMigrations > 0) {
    console.log(`migrations      ${report.appliedMigrations} applied, ${report.pendingMigrations.length} pending`);
  }
  console.log("");

  const blocking = report.findings.filter((f) => f.blocking);
  const advisory = report.findings.filter((f) => !f.blocking);

  if (blocking.length > 0) {
    console.log("not ready:");
    for (const f of blocking) {
      console.log(`  [${f.kind} / ${f.code}] ${f.detail}`);
      console.log(`      remedy: ${f.remedy}`);
    }
  }
  if (advisory.length > 0) {
    console.log(`${blocking.length > 0 ? "\n" : ""}advisory:`);
    for (const f of advisory) {
      console.log(`  [${f.kind} / ${f.code}] ${f.detail}`);
      console.log(`      ${f.remedy}`);
    }
  }
  for (const note of report.notes) {
    console.log(`note: ${note}`);
  }

  if (report.ready) {
    console.log("\nready: the gate passed and the database carries what a publication needs.");
  } else {
    console.log("\nno UBWI value is published.");
  }
  process.exit(report.ready ? 0 : 1);
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
});
