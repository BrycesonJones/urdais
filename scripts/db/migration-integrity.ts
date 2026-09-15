/**
 * Migration integrity check. Read-only, and it repairs nothing.
 *
 * Two checks, deliberately separable, because one needs no credentials and the other
 * needs production:
 *
 *   static      no two migration files share a version prefix, every filename is
 *               readable by the ledger, no two share a logical name. Runs anywhere,
 *               including on every pull request.
 *   production  the production migration ledger agrees with the repository about the
 *               identity of every migration it has applied. Runs where a production
 *               DATABASE_URL is configured.
 *
 * A repository migration production has not applied is **pending**, not drift, and does
 * not fail anything. That is the ordinary state of a pull request that adds a migration,
 * and a guard that failed on it would be turned off within a week.
 *
 * Usage:
 *   npm run migrations:check                          static check only
 *   npm run migrations:check -- --base-ref origin/main also check against the merge target
 *   npm run migrations:check -- --production          additionally compare the production ledger
 *   npm run migrations:check -- --production --require-database
 *                                                     fail rather than skip when no url is set
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

import {
  LEDGER_QUERY,
  checkRepositoryMigrations,
  compareLedgerToRepository,
  type Finding,
  type LedgerRow,
  type RepositoryMigration,
} from "@/lib/migrations/integrity";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

const MIGRATIONS_DIR = path.join("supabase", "migrations");

function flagValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1] ?? null;
}

function report(findings: readonly Finding[]): void {
  for (const finding of findings) {
    const label = finding.severity === "informational" ? "note" : finding.severity;
    console.log(`  [${label} / ${finding.code}] ${finding.detail}`);
    console.log(`      remedy: ${finding.remedy}`);
  }
}

/**
 * Migration filenames on the merge target.
 *
 * The collision this catches is the one a branch cannot see on its own: two open pull
 * requests each add a migration, each is green, and the second to merge lands a duplicate
 * version. Checking the union of this branch's files and the target's closes that window
 * before the merge rather than after it. Where the ref is not fetched -- a shallow clone,
 * a local run with no remote -- the check says so and is skipped rather than guessed.
 */
function baseRefMigrations(ref: string): string[] | null {
  try {
    const output = execFileSync("git", ["ls-tree", "--name-only", `${ref}:${MIGRATIONS_DIR}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".sql"));
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const checkProduction = process.argv.includes("--production");
  const requireDatabase = process.argv.includes("--require-database");
  const allowLocalDefault = process.argv.includes("--local");
  const baseRef = flagValue("--base-ref");

  let failed = false;

  // ------------------------------------------------------------------ static
  const filenames = readdirSync(path.join(process.cwd(), MIGRATIONS_DIR));
  const repository = checkRepositoryMigrations(filenames);
  console.log(`repository      ${repository.migrations.length} migration(s)`);
  if (repository.findings.length > 0) report(repository.findings);
  if (!repository.valid) failed = true;

  // -------------------------------------------------------- against the base
  if (baseRef !== null) {
    const baseFilenames = baseRefMigrations(baseRef);
    if (baseFilenames === null) {
      console.log(`base ${baseRef}   not available in this checkout; the merge-target check was skipped`);
    } else {
      const union = [...new Set([...baseFilenames, ...filenames])];
      const merged = checkRepositoryMigrations(union);
      const added = filenames.filter((name) => !baseFilenames.includes(name) && name.endsWith(".sql"));
      console.log(
        `base ${baseRef}   ${baseFilenames.length} migration(s); this branch adds ${added.length}` +
          (added.length > 0 ? `: ${added.join(", ")}` : ""),
      );
      const newFindings = merged.findings.filter(
        (finding) => !repository.findings.some((existing) => existing.detail === finding.detail),
      );
      if (newFindings.length > 0) {
        console.log("  merging this branch would break the repository check:");
        report(newFindings);
      }
      if (!merged.valid) failed = true;
    }
  }

  // -------------------------------------------------------------- production
  if (checkProduction) {
    const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
    if (!url) {
      const message = "no database url is configured; the production ledger check was skipped.";
      if (requireDatabase) {
        console.error(`\n${message}`);
        console.error("  remedy: set DATABASE_URL (or URDAIS_DATABASE_URL) for this environment.");
        process.exit(1);
      }
      console.log(`\n${message}`);
      console.log("  set DATABASE_URL (or URDAIS_DATABASE_URL) to enforce it.");
    } else {
      const sql = await createTokenSqlExecutor(url);
      try {
        const { rows } = await sql.query(LEDGER_QUERY, []);
        const ledger: LedgerRow[] = rows.map((row) => ({
          version: String(row.version),
          name: String(row.name ?? ""),
        }));
        const migrations: RepositoryMigration[] = repository.migrations;
        const comparison = compareLedgerToRepository({ migrations, ledger });
        console.log(
          `\nproduction      ${ledger.length} ledger row(s); ${comparison.applied.length} applied, ` +
            `${comparison.pending.length} pending, ${comparison.drifted.length} drifted, ` +
            `${comparison.productionOnly.length} production-only`,
        );
        if (comparison.findings.length > 0) report(comparison.findings);
        if (!comparison.consistent) failed = true;
      } finally {
        await sql.end();
      }
    }
  }

  if (failed) {
    console.log("\nmigration integrity: FAILED");
    process.exit(1);
  }
  console.log("\nmigration integrity: ok");
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
});
