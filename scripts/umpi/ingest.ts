/**
 * Operator entry point for UMPI source ingestion.
 *
 * Manual only. Phase 4 adds no scheduler and no cron; a run happens because a person asked for
 * one, with an explicit month range.
 *
 *   npm run umpi:ingest -- --source bok --from 2026-06 --to 2026-08
 *   npm run umpi:ingest -- --source customs --from 2026-06 --to 2026-06 --dry-run
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runUmpiSource, umpiCredentialReport, UMPI_SOURCES, type UmpiSourceKey } from "@/lib/umpi/ingest/run";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function usage(): never {
  console.error(
    [
      "usage: npm run umpi:ingest -- --source <bok|customs> --from YYYY-MM --to YYYY-MM [--dry-run]",
      "",
      "  --dry-run  fetch, parse and validate; write nothing at all",
      "",
      `credentials configured: ${JSON.stringify(umpiCredentialReport())}`,
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const source = flag("source") as UmpiSourceKey | null;
  const from = flag("from");
  const to = flag("to");
  const dryRun = process.argv.includes("--dry-run");
  if (source === null || !(source in UMPI_SOURCES) || from === null || to === null) usage();

  if (dryRun) {
    const outcome = await runUmpiSource(null, source, { fromMonth: from, toMonth: to, dryRun: true });
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status === "failed") process.exitCode = 1;
    return;
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const outcome = await runUmpiSource(sql, source, { fromMonth: from, toMonth: to });
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status === "failed") process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
