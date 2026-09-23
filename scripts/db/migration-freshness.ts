/**
 * How long has production been behind the repository?
 *
 * A separate guard from `migrations:check`, deliberately. That one asks whether production and the
 * repository agree about every migration production has applied, and treats one it has not applied
 * as pending — which passes, because a pull request that adds a migration legitimately has one
 * pending and a guard that failed on that would be switched off within a week.
 *
 * This one asks the question the 23 September 2026 incident posed and that one could not answer:
 * production sat eight migrations behind `main` while a deployed read model queried tables the
 * database did not have. The ledger check ran throughout, printed `116 applied, 7 pending`, named
 * every missing migration, and passed. The condition was visible and unenforced.
 *
 * So this measures the age of the oldest pending migration and fails once it exceeds the
 * deployment window. It reads two queries' worth of state and repairs nothing.
 *
 *   npm run migrations:freshness
 *   npm run migrations:freshness -- --json
 *   npm run migrations:freshness -- --warn-after 12 --fail-after 36
 *
 * Age is measured from when a migration landed on `main`, which is not the version in its
 * filename: the repository pre-allocates future version prefixes, so `20261017100000` was merged
 * on 23 September 2026 and a filename-derived age would have been negative. It therefore needs
 * real git history — a shallow checkout yields no date, which is reported as unverified rather
 * than assumed fine.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

import {
  LEDGER_QUERY,
  checkRepositoryMigrations,
  compareLedgerToRepository,
  type LedgerRow,
} from "@/lib/migrations/integrity";
import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  evaluateMigrationFreshness,
  type PendingMigration,
} from "@/lib/migrations/freshness";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

const MIGRATIONS_DIR = path.join("supabase", "migrations");

function flagValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1] ?? null;
}

function numberFlag(flag: string, fallback: number): number {
  const raw = flagValue(flag);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} ${JSON.stringify(raw)} is not a number of hours`);
  return value;
}

/**
 * When a migration file first appeared in the history reachable from HEAD.
 *
 * `--diff-filter=A` on the file's own log gives the commit that added it; on a squash-merged
 * repository that is the commit on `main`, which is exactly "when it landed". Returns null rather
 * than throwing when git cannot answer, so a shallow checkout degrades to "unverified" instead of
 * to a failure about the wrong thing.
 */
function landedAt(filename: string): Date | null {
  try {
    const out = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--format=%cI", "--max-count=1", "--", path.join(MIGRATIONS_DIR, filename)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out === "") return null;
    const parsed = new Date(out);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/** GitHub renders these in the Checks tab and on the run summary; elsewhere they are just lines. */
function annotate(level: "warning" | "error", message: string): void {
  const onGitHub = process.env.GITHUB_ACTIONS === "true";
  const oneLine = message.replace(/\n/g, " ");
  console.log(onGitHub ? `::${level} title=Production migration freshness::${oneLine}` : `${level}: ${oneLine}`);
}

async function main(): Promise<void> {
  const thresholds = {
    warnAfterHours: numberFlag("--warn-after", DEFAULT_FRESHNESS_THRESHOLDS.warnAfterHours),
    failAfterHours: numberFlag("--fail-after", DEFAULT_FRESHNESS_THRESHOLDS.failAfterHours),
  };
  if (thresholds.failAfterHours < thresholds.warnAfterHours) {
    throw new Error("--fail-after must not be earlier than --warn-after");
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: false });
  if (!url) {
    // Without a production database there is nothing to be behind. Said plainly and passed, on the
    // same reasoning the ledger check uses: a repository with no production configured is not a
    // repository with a stale one.
    console.log("no production database is configured; migration freshness cannot be evaluated.");
    console.log("set URDAIS_PRODUCTION_DATABASE_URL to enforce it.");
    return;
  }

  const repository = checkRepositoryMigrations(readdirSync(path.join(process.cwd(), MIGRATIONS_DIR)));
  const sql = await createTokenSqlExecutor(url);
  let ledger: LedgerRow[];
  try {
    const { rows } = await sql.query(LEDGER_QUERY, []);
    ledger = rows.map((row) => ({ version: String(row.version), name: String(row.name ?? "") }));
  } finally {
    await sql.end();
  }

  const comparison = compareLedgerToRepository({ migrations: repository.migrations, ledger });
  const pending: PendingMigration[] = comparison.pending.map((migration) => ({
    filename: migration.filename,
    landedAt: landedAt(migration.filename),
  }));

  const report = evaluateMigrationFreshness({ pending, asOf: new Date(), thresholds });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ...report,
      oldest: report.oldest === null ? null : { ...report.oldest, landedAt: report.oldest.landedAt?.toISOString() ?? null },
      undated: report.undated.map((m) => m.filename),
      thresholds,
    }, null, 2));
    process.exit(report.healthy ? 0 : 1);
  }

  console.log(`repository      ${repository.migrations.length} migration(s)`);
  console.log(`production      ${ledger.length} ledger row(s); ${comparison.applied.length} applied, `
    + `${comparison.pending.length} pending, ${comparison.drifted.length} drifted`);
  console.log(`window          warn after ${thresholds.warnAfterHours}h, fail after ${thresholds.failAfterHours}h`);
  console.log("");
  console.log(`freshness       ${report.verdict}`);
  console.log(`                ${report.summary}`);

  if (report.pendingCount > 0) {
    console.log("");
    console.log("pending:");
    for (const migration of pending) {
      const age = migration.landedAt === null
        ? "age unknown"
        : `${Math.floor((Date.now() - migration.landedAt.getTime()) / 3_600_000)}h`;
      console.log(`  ${migration.filename}  (${age})`);
    }
  }
  if (report.remedy !== null) {
    console.log("");
    console.log(`remedy: ${report.remedy}`);
  }

  if (report.verdict === "overdue") annotate("error", `${report.summary}. Remedy: ${report.remedy}`);
  else if (report.verdict === "warning") annotate("warning", `${report.summary}. Remedy: ${report.remedy}`);

  console.log("");
  console.log(report.healthy ? "migration freshness: ok" : "migration freshness: OVERDUE");
  process.exit(report.healthy ? 0 : 1);
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
});
