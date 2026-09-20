/**
 * Guarded planning ingestion against a shared database.
 *
 *   npm run power-delivery:planning-production -- --expect-project <ref>            dry run
 *   npm run power-delivery:planning-production -- --expect-project <ref> --write    writes
 *
 * A dry run is the default, and every run states which database it reached, whether the schema
 * is current, and what it would do. The gate refuses a connection that is not the project the
 * operator named, and refuses any database whose migration ledger is behind the repository --
 * ingesting into a schema the repository has moved past writes rows that do not mean what the
 * code thinks they mean.
 *
 * No connection string, password, or fragment of either is printed by this command.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { LEDGER_QUERY, type LedgerRow } from "@/lib/migrations/integrity";
import { checkPlanningProductionGate } from "@/lib/power-delivery/planning/production-guard";
import { runPlanningIngestion, INGESTIBLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/ingest/run";
import { runPlanningSourceChecks, CHECKABLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/freshness/run";
import { planningMarketStatuses } from "@/lib/power-delivery/planning/market-status";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const expected = flag("expect-project") ?? process.env.URDAIS_PRODUCTION_PROJECT_REF ?? null;
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) {
    console.error("not ready: no database url is configured.");
    console.error("  remedy: set DATABASE_URL for the environment this run should reach.");
    process.exit(1);
  }

  const sql = await createTokenSqlExecutor(url);
  try {
    const ledgerRows = await sql.query(LEDGER_QUERY, []);
    const ledger: LedgerRow[] = ledgerRows.rows.map((row) => ({
      version: String(row.version), name: String(row.name ?? ""),
    }));
    const gate = checkPlanningProductionGate({
      url,
      expectedProjectRef: expected,
      migrationFilenames: readdirSync(path.join(process.cwd(), "supabase", "migrations")),
      ledger,
      write,
    });

    console.log(`target      project ${gate.identity.projectRef ?? "(not a Supabase project)"} at ${gate.identity.host}${gate.identity.isLocal ? " (local)" : ""}`);
    console.log(`mode        ${gate.mode}`);
    console.log(`migrations  ${ledger.length} applied; ${gate.pendingMigrations.length} pending, ${gate.driftedMigrations.length} drifted`);
    if (!gate.ok) {
      console.error("\nrefused:");
      for (const refusal of gate.refusals) console.error(`  - ${refusal}`);
      console.error("\n  remedy: apply the pending migrations to this database, then re-run.");
      process.exit(1);
    }

    // Look at the sources first: an ingestion that does not know what the publishers are
    // offering cannot say afterwards whether what it wrote is current.
    const checks = await runPlanningSourceChecks(write ? sql : null, CHECKABLE_PLANNING_SOURCES);
    const ingestion = await runPlanningIngestion(write ? sql : null, INGESTIBLE_PLANNING_SOURCES, { dryRun: !write });
    const statuses = write ? await planningMarketStatuses(sql) : [];

    console.log(JSON.stringify({
      mode: gate.mode,
      projectRef: gate.identity.projectRef,
      checks,
      ingestion,
      markets: statuses.map((status) => ({
        market: status.marketSlug,
        vintage: status.vintage?.nativeVintageKey ?? null,
        publishedAt: status.vintage?.publishedAt ?? null,
        rights: status.vintage?.rightsClassification ?? null,
        publication: status.publication === null ? null : { allowed: status.publication.allowed, reason: status.publication.reasonCode },
        currentness: status.freshness.status,
        publishableAsCurrent: status.publishableAsCurrent,
      })),
    }, null, 2));

    if (!write) console.log("\nDry run only. Nothing was written. Re-run with --write to ingest.");
    if (!ingestion.ok) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
