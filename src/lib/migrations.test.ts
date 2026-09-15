/**
 * The repository's own migration files, checked as a set.
 *
 * Supabase identifies a migration by the numeric prefix of its filename, not by
 * the filename. Two files sharing a prefix are one version to the ledger: the
 * first to apply records the version, and the second is skipped in silence.
 * Nothing errors, the ledger count looks plausible, and a table or seed simply
 * is not there. `expectedMigrationVersions` maps filenames to versions the same
 * way, so the readiness check would also report the schema as current.
 *
 * That is not hypothetical. It happened on this repository when two sessions
 * added a migration on the same day and both reached for the same timestamp,
 * and it cost a debugging cycle to notice the migration had never run. The set
 * of prefixes is cheap to check and the failure is expensive to find.
 *
 * The rule itself lives in `@/lib/migrations/integrity`, which `npm run
 * migrations:check` and the production readiness path also call. This file is
 * the rule applied to the real `supabase/migrations` directory, so the suite
 * reddens on `main` the moment two migrations converge on one version.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkRepositoryMigrations } from "@/lib/migrations/integrity";
import { expectedMigrationVersions } from "@/lib/tokens/production-readiness";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("migration filenames", () => {
  it("finds migrations to check", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("passes the repository integrity check with no structural finding", () => {
    const result = checkRepositoryMigrations(migrationFiles());
    // A collision means one of these files will never run, and nothing says so.
    // A malformed name means the ledger cannot read a version out of it at all.
    expect(
      result.findings.filter((f) => f.severity === "structural").map((f) => `${f.code}: ${f.detail}`),
      "run `npm run migrations:check` for the full diagnosis",
    ).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("produces one expected version per migration file", () => {
    // The readiness check compares this list against the ledger. If two files
    // collapse to one version, a database missing a migration still looks current.
    const files = migrationFiles();
    expect(new Set(expectedMigrationVersions(files)).size).toBe(files.length);
  });

  it("parses every migration into the version the ledger will record", () => {
    const result = checkRepositoryMigrations(migrationFiles());
    expect(result.malformed, "migration filenames must be <14-digit timestamp>_<lower_snake_case>.sql").toEqual([]);
    expect(result.migrations.map((m) => m.version)).toEqual(expectedMigrationVersions(migrationFiles()));
  });
});
