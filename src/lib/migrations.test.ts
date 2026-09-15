/**
 * Migration filenames, checked as a set.
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
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { expectedMigrationVersions } from "@/lib/tokens/production-readiness";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const FILENAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("migration filenames", () => {
  it("finds migrations to check", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("gives every migration a unique version prefix", () => {
    const byVersion = new Map<string, string[]>();
    for (const name of migrationFiles()) {
      const version = name.slice(0, 14);
      byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
    }
    const collisions = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${names.join(", ")}`);
    // A collision means one of these files will never run, and nothing says so.
    expect(collisions, "two migrations share a version prefix; the ledger records one and silently skips the other").toEqual([]);
  });

  it("produces one expected version per migration file", () => {
    // The readiness check compares this list against the ledger. If two files
    // collapse to one version, a database missing a migration still looks current.
    const files = migrationFiles();
    expect(new Set(expectedMigrationVersions(files)).size).toBe(files.length);
  });

  it("names every migration so the ledger can read its version", () => {
    const malformed = migrationFiles().filter((name) => !FILENAME.test(name));
    expect(malformed, "migration filenames must be <14-digit timestamp>_<lower_snake_case>.sql").toEqual([]);
  });
});
