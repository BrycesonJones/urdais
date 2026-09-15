/**
 * The migration-integrity guard, tested against fixtures rather than a database.
 *
 * Every case here is drawn from something that actually happened to this repository or
 * to UrdaisProd, plus the one case that must *not* fail: a feature branch whose migration
 * has not been deployed yet. A guard that reddened on ordinary pending work would be
 * disabled, and then the real drift would go unnoticed again.
 *
 * No test opens a connection. The ledger is a list of `{version, name}` rows, which is
 * exactly what `LEDGER_QUERY` returns, so the comparison logic is exercised without
 * coupling the suite to production.
 */

import { describe, expect, it } from "vitest";

import {
  canonicalName,
  checkRepositoryMigrations,
  compareLedgerToRepository,
  parseMigrationFilename,
  type LedgerRow,
  type RepositoryMigration,
} from "@/lib/migrations/integrity";

function repo(...filenames: string[]): RepositoryMigration[] {
  return checkRepositoryMigrations(filenames).migrations;
}

function ledger(...pairs: string[]): LedgerRow[] {
  return pairs.map((pair) => {
    const version = pair.slice(0, 14);
    return { version, name: pair.slice(15) };
  });
}

describe("checkRepositoryMigrations", () => {
  it("fails when two migrations share a version prefix", () => {
    // The exact shape of the #75 / #76 collision: both files exist, both look fine,
    // and `supabase db push` would record one version and silently skip the other.
    const result = checkRepositoryMigrations([
      "20260915020000_a.sql",
      "20260915030000_a_thing.sql",
      "20260915030000_b_thing.sql",
    ]);
    expect(result.valid).toBe(false);
    const duplicate = result.findings.find((f) => f.code === "DUPLICATE_VERSION");
    expect(duplicate?.severity).toBe("structural");
    expect(duplicate?.detail).toContain("20260915030000");
    expect(duplicate?.detail).toContain("20260915030000_a_thing.sql");
    expect(duplicate?.detail).toContain("20260915030000_b_thing.sql");
  });

  it("passes a normal migration set with unique versions", () => {
    const result = checkRepositoryMigrations([
      "20260913060000_schemas_and_privileges.sql",
      "20260915020000_news_memory_source_research.sql",
      "20260915030000_news_energy_power_sources.sql",
      "20260915150000_ubwi_daily_publication_cadence.sql",
    ]);
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.migrations).toHaveLength(4);
  });

  it("rejects a filename the ledger cannot read a version out of", () => {
    const result = checkRepositoryMigrations(["add_a_table.sql", "20260915150000_fine.sql"]);
    expect(result.valid).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("MALFORMED_FILENAME");
    expect(result.malformed).toEqual(["add_a_table.sql"]);
  });

  it("rejects two migrations sharing a logical name", () => {
    // Drift is resolved by name when the version has been rewritten, so two files
    // sharing a name would make that resolution ambiguous.
    const result = checkRepositoryMigrations([
      "20260915020000_news_sources.sql",
      "20260915030000_news_sources.sql",
    ]);
    expect(result.valid).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("DUPLICATE_NAME");
  });

  it("ignores files that are not migrations", () => {
    const result = checkRepositoryMigrations(["README.md", "20260915150000_fine.sql", ".gitkeep"]);
    expect(result.valid).toBe(true);
    expect(result.migrations.map((m) => m.filename)).toEqual(["20260915150000_fine.sql"]);
  });

  it("returns migrations in version order regardless of input order", () => {
    const result = checkRepositoryMigrations([
      "20260915150000_c.sql",
      "20260913060000_a.sql",
      "20260915020000_b.sql",
    ]);
    expect(result.migrations.map((m) => m.version)).toEqual([
      "20260913060000",
      "20260915020000",
      "20260915150000",
    ]);
  });
});

describe("parseMigrationFilename", () => {
  it("splits a well-formed filename into version and logical name", () => {
    expect(parseMigrationFilename("20260915150000_ubwi_daily_publication_cadence.sql")).toEqual({
      version: "20260915150000",
      name: "ubwi_daily_publication_cadence",
      filename: "20260915150000_ubwi_daily_publication_cadence.sql",
    });
  });

  it("returns null for anything else", () => {
    expect(parseMigrationFilename("2026_short.sql")).toBeNull();
    expect(parseMigrationFilename("20260915150000_Mixed_Case.sql")).toBeNull();
    expect(parseMigrationFilename("20260915150000_fine.txt")).toBeNull();
  });
});

describe("canonicalName", () => {
  it("strips the suffixes an ad hoc production application acquires", () => {
    expect(canonicalName("news_energy_power_sources_prod")).toBe("news_energy_power_sources");
    expect(canonicalName("a_manual")).toBe("a");
    expect(canonicalName("a_hotfix")).toBe("a");
  });

  it("leaves a canonical name alone", () => {
    expect(canonicalName("news_energy_power_sources")).toBe("news_energy_power_sources");
    // Not a suffix in the middle of a name.
    expect(canonicalName("prod_readiness")).toBe("prod_readiness");
  });
});

describe("compareLedgerToRepository", () => {
  it("reports a canonical applied migration as applied", () => {
    const result = compareLedgerToRepository({
      migrations: repo("20260915020000_news_memory_source_research.sql"),
      ledger: ledger("20260915020000_news_memory_source_research"),
    });
    expect(result.consistent).toBe(true);
    expect(result.applied.map((m) => m.version)).toEqual(["20260915020000"]);
    expect(result.pending).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("flags a `_prod`-suffixed ledger row as drift, not as pending", () => {
    // Exactly the UrdaisProd state of 15 September 2026: the repository file at
    // 20260915030000, production carrying it at a wall-clock version with a `_prod`
    // name, and the canonical version therefore reading as pending against a database
    // that had already run it.
    const result = compareLedgerToRepository({
      migrations: repo("20260915030000_news_energy_power_sources.sql"),
      ledger: ledger("20260915143307_news_energy_power_sources_prod"),
    });
    expect(result.consistent).toBe(false);
    expect(result.pending).toEqual([]);
    expect(result.productionOnly).toEqual([]);
    expect(result.drifted).toHaveLength(1);
    expect(result.drifted[0]!.ledgerRow).toEqual({
      version: "20260915143307",
      name: "news_energy_power_sources_prod",
    });
    const finding = result.findings.find((f) => f.code === "PROD_SUFFIXED_LEDGER_ROW");
    expect(finding?.severity).toBe("drift");
    expect(finding?.detail).toContain("20260915143307");
    expect(finding?.detail).toContain("20260915030000_news_energy_power_sources.sql");
    expect(finding?.remedy).toContain("rekey");
  });

  it("flags a re-versioned ledger row whose name never drifted", () => {
    // The PR #73 shape: `news_wave2_and_image_rights` recorded at the minute it was
    // applied. The name matched; only the version was wrong.
    const result = compareLedgerToRepository({
      migrations: repo("20260915010000_news_wave2_and_image_rights.sql"),
      ledger: ledger("20260915042926_news_wave2_and_image_rights"),
    });
    expect(result.consistent).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("LEDGER_VERSION_MISMATCH");
    expect(result.pending).toEqual([]);
  });

  it("flags a name mismatch at a matching version", () => {
    const result = compareLedgerToRepository({
      migrations: repo("20260915030000_news_energy_power_sources.sql"),
      ledger: ledger("20260915030000_something_else_entirely"),
    });
    expect(result.consistent).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("LEDGER_NAME_MISMATCH");
  });

  it("surfaces a production-only ledger row", () => {
    const result = compareLedgerToRepository({
      migrations: repo("20260915020000_news_memory_source_research.sql"),
      ledger: ledger(
        "20260915020000_news_memory_source_research",
        "20260915999999_someone_used_the_sql_editor",
      ),
    });
    expect(result.consistent).toBe(false);
    const finding = result.findings.find((f) => f.code === "PRODUCTION_ONLY_MIGRATION");
    expect(finding?.severity).toBe("drift");
    expect(finding?.detail).toContain("20260915999999_someone_used_the_sql_editor");
    expect(result.productionOnly).toHaveLength(1);
  });

  it("represents a legitimately pending migration as pending, and stays consistent", () => {
    // The case the guard must never fail: a feature branch adds a migration and opens a
    // pull request before anything is deployed.
    const result = compareLedgerToRepository({
      migrations: repo(
        "20260915020000_news_memory_source_research.sql",
        "20260916000000_a_brand_new_feature.sql",
      ),
      ledger: ledger("20260915020000_news_memory_source_research"),
    });
    expect(result.consistent).toBe(true);
    expect(result.pending.map((m) => m.filename)).toEqual(["20260916000000_a_brand_new_feature.sql"]);
    expect(result.drifted).toEqual([]);
    const finding = result.findings.find((f) => f.code === "MIGRATION_PENDING");
    expect(finding?.severity).toBe("informational");
    expect(finding?.detail).toContain("20260916000000_a_brand_new_feature.sql");
  });

  it("does not mistake a pending migration for drift when an unrelated row is suffixed", () => {
    const result = compareLedgerToRepository({
      migrations: repo("20260916000000_a_brand_new_feature.sql"),
      ledger: ledger("20260915143307_news_energy_power_sources_prod"),
    });
    // The new migration is pending; the orphan row is production-only. Neither is the
    // other, and the diagnostics must not conflate them.
    expect(result.pending.map((m) => m.filename)).toEqual(["20260916000000_a_brand_new_feature.sql"]);
    expect(result.productionOnly.map((r) => r.version)).toEqual(["20260915143307"]);
    expect(result.consistent).toBe(false);
  });

  it("reproduces the full UrdaisProd drift of 15 September 2026", () => {
    const result = compareLedgerToRepository({
      migrations: repo(
        "20260915010000_news_wave2_and_image_rights.sql",
        "20260915020000_news_memory_source_research.sql",
        "20260915030000_news_energy_power_sources.sql",
        "20260915150000_ubwi_daily_publication_cadence.sql",
      ),
      ledger: ledger(
        "20260915010000_news_wave2_and_image_rights",
        "20260915143157_news_memory_source_research_prod",
        "20260915143307_news_energy_power_sources_prod",
      ),
    });
    expect(result.consistent).toBe(false);
    expect(result.applied.map((m) => m.version)).toEqual(["20260915010000"]);
    expect(result.drifted.map((c) => c.migration.version)).toEqual([
      "20260915020000",
      "20260915030000",
    ]);
    // The cadence migration was genuinely not deployed. It is pending, not drift.
    expect(result.pending.map((m) => m.version)).toEqual(["20260915150000"]);
    expect(result.productionOnly).toEqual([]);
    expect(result.findings.filter((f) => f.code === "PROD_SUFFIXED_LEDGER_ROW")).toHaveLength(2);
  });

  it("is consistent once the drift is repaired", () => {
    // The state this phase left UrdaisProd in.
    const result = compareLedgerToRepository({
      migrations: repo(
        "20260915010000_news_wave2_and_image_rights.sql",
        "20260915020000_news_memory_source_research.sql",
        "20260915030000_news_energy_power_sources.sql",
        "20260915150000_ubwi_daily_publication_cadence.sql",
      ),
      ledger: ledger(
        "20260915010000_news_wave2_and_image_rights",
        "20260915020000_news_memory_source_research",
        "20260915030000_news_energy_power_sources",
        "20260915150000_ubwi_daily_publication_cadence",
      ),
    });
    expect(result.consistent).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.applied).toHaveLength(4);
  });
});
