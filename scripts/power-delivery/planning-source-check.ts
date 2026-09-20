/**
 * Ask each planning publisher what it is currently offering, and write down the answer.
 *
 *   npm run power-delivery:planning-check -- --all
 *   npm run power-delivery:planning-check -- --source ercot
 *   npm run power-delivery:planning-check -- --all --dry-run      (no database write)
 *
 * This is what makes "current" a claim rather than an assumption. Every check is persisted,
 * including the failures: a check that could not read the source is the evidence that stops
 * Urdais from going on calling an older vintage current.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runPlanningSourceChecks, CHECKABLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/freshness/run";
import { loadPlanningFreshness } from "@/lib/power-delivery/planning/freshness/store";
import { PLANNING_SOURCE_BLOCKERS } from "@/lib/power-delivery/planning/ingest/registry";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const source = flag("source");
  if (!all && source === null) {
    console.error(`usage: --source <${CHECKABLE_PLANNING_SOURCES.join("|")}> | --all  [--dry-run]`);
    process.exit(2);
  }
  const sources = all ? CHECKABLE_PLANNING_SOURCES : [source!];

  const url = dryRun ? null : resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!dryRun && url === null) throw new Error("no database URL is configured");
  const sql = url === null ? null : await createTokenSqlExecutor(url);
  try {
    const checks = await runPlanningSourceChecks(sql, sources);
    const freshness = sql === null ? [] : await loadPlanningFreshness(sql);
    console.log(JSON.stringify({
      checks,
      freshness: freshness.map((entry) => ({
        market: entry.marketSlug,
        status: entry.status,
        served: entry.servedVintageKey,
        latestKnown: entry.latestKnownVintageKey,
        lastSuccessfulCheckAt: entry.lastSuccessfulCheckAt,
        checkExpiresAt: entry.checkExpiresAt,
        detail: entry.detail,
      })),
      notChecked: all ? PLANNING_SOURCE_BLOCKERS.map((b) => ({ source: b.source, kind: b.kind })) : [],
    }, null, 2));
    if (checks.some((check) => check.status === "check_failed")) process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
