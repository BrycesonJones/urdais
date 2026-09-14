/**
 * Production readiness check for Token Price. Read-only.
 *
 * A deployment verifies that the production data is ready; it never
 * manufactures the human verification that produced it. This script therefore
 * writes nothing, and exits nonzero when the database is not ready, naming the
 * operator action that fixes it.
 *
 * Usage:
 *   npm run tokens:production:check              against the resolved database
 *   npm run tokens:production:check -- --local   allow the local development database
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { loadTokenReadCatalogFromSql } from "@/lib/tokens/read/sql";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import { checkTokenProductionReadiness } from "@/lib/tokens/production-readiness";

async function main(): Promise<void> {
  const allowLocalDefault = process.argv.includes("--local");
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
  if (!url) {
    console.error("not ready: no database url is configured.");
    console.error("  remedy: set DATABASE_URL (or URDAIS_DATABASE_URL) for this environment, or pass --local for the development database.");
    process.exit(1);
  }

  const migrationFiles = readdirSync(path.join(process.cwd(), "supabase", "migrations"));
  const sql = await tokenSqlExecutor(url);
  // The catalog loader reads columns a pending migration may not have added, so
  // it is deferred: the readiness check calls it only once the schema checks pass.
  const report = await checkTokenProductionReadiness({
    sql,
    migrationFiles,
    loadCatalog: () => loadTokenReadCatalogFromSql(sql),
  });

  console.log(`migrations applied: ${report.appliedMigrations}${report.pendingMigrations.length > 0 ? `; pending: ${report.pendingMigrations.join(", ")}` : ""}`);
  for (const provider of report.providers) {
    const value = provider.priceUsdPer1m === null ? "no frozen benchmark" : `$${provider.priceUsdPer1m.toFixed(2)} per 1M tokens, updated ${provider.updatedAt}`;
    const state = provider.productionVisible ? "production" : provider.frozen ? "research only" : "missing";
    console.log(`  ${provider.providerSlug.padEnd(10)} ${String(provider.designatedModelId).padEnd(18)} ${state.padEnd(13)} ${value}`);
  }

  if (report.ready) {
    console.log("ready: every designated provider has a production-visible frozen Token Price benchmark.");
    return;
  }

  console.error("\nnot ready:");
  for (const finding of report.findings) {
    console.error(`  [${finding.code}] ${finding.detail}`);
    console.error(`      remedy: ${finding.remedy}`);
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
