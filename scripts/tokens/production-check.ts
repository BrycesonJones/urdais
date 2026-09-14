/**
 * Production readiness check for Token Price. Read-only.
 *
 * A deployment verifies that the production data is ready; it never
 * manufactures the human verification that produced it. This script therefore
 * writes nothing, and exits nonzero when the database is not ready, naming the
 * operator action that fixes it.
 *
 * Usage:
 *   npm run tokens:production:check                     against the resolved database
 *   npm run tokens:production:check -- --local          allow the local development database
 *   npm run tokens:production:check -- --url <origin>   also check what the running site serves
 *
 * The --url form is the one that would have caught a blank public surface: it
 * asks the API for the benchmarks and then asks each page whether those values
 * appear in the HTML it served.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { loadTokenReadCatalogFromSql } from "@/lib/tokens/read/sql";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import { checkTokenProductionReadiness } from "@/lib/tokens/production-readiness";
import { checkTokenSurfaces, formattedPrice } from "@/lib/tokens/surface-check";

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

  for (const note of report.notes) console.log(`  note: ${note}`);

  const originIndex = process.argv.indexOf("--url");
  const origin = originIndex >= 0 ? process.argv[originIndex + 1] : undefined;

  if (report.ready) {
    console.log("ready: every designated provider has a production-visible frozen Token Price benchmark.");
    if (!origin) return;

    // The database being ready is not the same as the public surface showing it.
    const surfaces = await checkTokenSurfaces(origin, (url) => fetch(url));
    console.log(`\nsurfaces at ${surfaces.origin}`);
    for (const benchmark of surfaces.benchmarks) console.log(`  api: ${benchmark.providerName} ${formattedPrice(benchmark.priceUsdPer1m)} per 1M tokens`);
    for (const page of surfaces.pages) {
      // Say what was asserted: the market page opens on Compute and switches
      // families in the browser, so the price is not in its first response.
      const asserted = page.expects === "value" ? "renders the price" : "offers the Tokens family";
      const missing = page.missing.length > 0 ? ` (missing ${page.missing.join(", ")})` : "";
      console.log(`  ${page.ok ? "ok   " : "BLANK"} ${page.path} ${asserted}${missing}`);
    }
    if (surfaces.ok) {
      console.log("ready: the public surfaces render the production benchmarks.");
      return;
    }
    console.error("\nnot ready:");
    for (const finding of surfaces.findings) {
      console.error(`  [${finding.code}] ${finding.detail}`);
      console.error(`      remedy: ${finding.remedy}`);
    }
    process.exit(1);
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
