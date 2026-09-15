/**
 * Migration integrity: the repository is the source of truth, checked mechanically.
 *
 * Two different failures have now cost debugging cycles on this repository, and both
 * were invisible until something downstream behaved oddly. Documentation did not stop
 * either, so this module is the enforcement documentation could not be.
 *
 * **A repository version collision.** Supabase keys a migration by the numeric prefix of
 * its filename, not by the filename. Two files sharing a prefix are one version to the
 * ledger: the first to apply records the version, the second is skipped in silence, and
 * the row counts on both sides still agree. It happened when `#75` and `#76` merged in
 * that order and both reached for `20260915030000`. This is a structural fault in the
 * repository, needs no credentials to detect, and is always an error.
 *
 * **Production-ledger drift.** The Supabase management API (`apply_migration`, and the
 * dashboard's SQL editor) takes a *name* and, given no version, stamps the wall clock.
 * The schema lands correctly, so nothing fails loudly; what breaks is the bookkeeping,
 * and the next deploy reads the repository's version as pending and offers to replay a
 * migration that has already run. It happened to `20260915010000_news_wave2_and_image_rights`
 * (recorded as `20260915042926`), and again to the two news migrations of 15 September
 * 2026, which production carried as `20260915143157_news_memory_source_research_prod` and
 * `20260915143307_news_energy_power_sources_prod` -- that time the *name* had drifted too.
 *
 * The distinction this module insists on: **a repository migration that production has
 * not applied is ordinarily pending, not corruption.** A feature branch adding a migration
 * is the normal case and must stay green. Drift is something else -- a ledger row that
 * looks like a repository migration wearing a different version or name, a `_prod` suffix
 * where a canonical file exists, a production-only row nobody can account for. Those are
 * reported separately and are what a production-readiness gate should refuse on.
 *
 * Nothing here mutates anything. The guard detects drift; a human repairs production,
 * because rekeying a ledger row is a judgement about whether two bodies of SQL are the
 * same thing, and that judgement is not safe to automate.
 */

/** A migration file in the repository, or a row in the production ledger. */
export type MigrationRef = {
  /** The 14-digit numeric version. */
  version: string;
  /** The logical name: the filename after the version, without the `.sql`. */
  name: string;
};

/** A repository migration file. */
export type RepositoryMigration = MigrationRef & {
  /** The filename it came from, for diagnostics that name a real file. */
  filename: string;
};

/** A row of `supabase_migrations.schema_migrations`. */
export type LedgerRow = MigrationRef;

export type FindingSeverity =
  /** The repository itself is wrong. Always an error, everywhere, with no credentials. */
  | "structural"
  /** Production's bookkeeping disagrees with the repository in a way a human must resolve. */
  | "drift"
  /** Worth saying out loud; not a failure. */
  | "informational";

export type FindingCode =
  /** Two migration files share a version prefix; one of them will never run. */
  | "DUPLICATE_VERSION"
  /** A filename the ledger cannot read a version out of. */
  | "MALFORMED_FILENAME"
  /** Two migration files share a logical name under different versions. */
  | "DUPLICATE_NAME"
  /** The ledger carries a repository migration under an ad hoc `_prod` name. */
  | "PROD_SUFFIXED_LEDGER_ROW"
  /** The ledger carries a repository migration's name under a different version. */
  | "LEDGER_VERSION_MISMATCH"
  /** Same version on both sides, different name. */
  | "LEDGER_NAME_MISMATCH"
  /** A ledger row no repository migration accounts for. */
  | "PRODUCTION_ONLY_MIGRATION"
  /** A repository migration production has not applied. Normal on a feature branch. */
  | "MIGRATION_PENDING";

export type Finding = {
  code: FindingCode;
  severity: FindingSeverity;
  detail: string;
  remedy: string;
};

const FILENAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/**
 * The suffixes an ad hoc production application tends to acquire. A name is matched to a
 * repository migration after these are stripped, which is how `news_energy_power_sources_prod`
 * is recognised as `news_energy_power_sources` rather than as an unknown production row.
 */
const AD_HOC_SUFFIXES = ["_prod", "_production", "_manual", "_hotfix"] as const;

/** The logical name with any ad hoc production suffix removed. */
export function canonicalName(name: string): string {
  for (const suffix of AD_HOC_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

/** Parse a migration filename. Returns null where the ledger could not read a version. */
export function parseMigrationFilename(filename: string): RepositoryMigration | null {
  const match = FILENAME.exec(filename);
  if (!match) return null;
  return { version: match[1]!, name: match[2]!, filename };
}

export type RepositoryCheck = {
  /** Every well-formed migration, version ascending. */
  migrations: RepositoryMigration[];
  /** Filenames that could not be parsed. */
  malformed: string[];
  findings: Finding[];
  /** True when nothing structural is wrong. */
  valid: boolean;
};

/**
 * Structural validity of the repository's migration set. No credentials, no network, no
 * database: this is the check that must run on every pull request and on every merge.
 */
export function checkRepositoryMigrations(filenames: readonly string[]): RepositoryCheck {
  const sql = filenames.filter((name) => name.endsWith(".sql"));
  const migrations: RepositoryMigration[] = [];
  const malformed: string[] = [];
  const findings: Finding[] = [];

  for (const filename of [...sql].sort()) {
    const parsed = parseMigrationFilename(filename);
    if (parsed === null) malformed.push(filename);
    else migrations.push(parsed);
  }

  if (malformed.length > 0) {
    findings.push({
      code: "MALFORMED_FILENAME",
      severity: "structural",
      detail: `${malformed.length} migration filename(s) are not <14-digit version>_<lower_snake_case>.sql: ${malformed.join(", ")}`,
      remedy: "rename the file so the ledger can read a version out of it",
    });
  }

  const byVersion = new Map<string, RepositoryMigration[]>();
  for (const migration of migrations) {
    byVersion.set(migration.version, [...(byVersion.get(migration.version) ?? []), migration]);
  }
  for (const [version, group] of [...byVersion].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) continue;
    findings.push({
      code: "DUPLICATE_VERSION",
      severity: "structural",
      detail: `version ${version} is used by ${group.length} files: ${group.map((m) => m.filename).join(", ")}`,
      // This is the failure that is expensive to find and cheap to prevent: nothing
      // errors at deploy time, the ledger count looks plausible, and a table is missing.
      remedy:
        "give each migration its own version; `supabase db push` records one of these and silently never runs the other",
    });
  }

  const byName = new Map<string, RepositoryMigration[]>();
  for (const migration of migrations) {
    byName.set(migration.name, [...(byName.get(migration.name) ?? []), migration]);
  }
  for (const [name, group] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) continue;
    findings.push({
      code: "DUPLICATE_NAME",
      severity: "structural",
      detail: `logical name "${name}" is used by ${group.length} files: ${group.map((m) => m.filename).join(", ")}`,
      remedy:
        "name each migration for what it does; two rows sharing a name make ledger drift unresolvable by name",
    });
  }

  return {
    migrations,
    malformed,
    findings,
    valid: findings.every((f) => f.severity !== "structural"),
  };
}

/** How one repository migration stands against the production ledger. */
export type MigrationStatus =
  /** Same version, same name. Applied, and correctly recorded. */
  | "applied"
  /** Not in the ledger, and nothing in the ledger looks like it. Normal before a deploy. */
  | "pending"
  /** Something in the ledger is this migration under a different version or name. */
  | "drifted";

export type MigrationComparison = {
  migration: RepositoryMigration;
  status: MigrationStatus;
  /** The ledger row that accounts for it, where one does. */
  ledgerRow: LedgerRow | null;
};

export type LedgerComparison = {
  /** One entry per repository migration, version ascending. */
  migrations: MigrationComparison[];
  /** Repository migrations the ledger has correctly recorded. */
  applied: RepositoryMigration[];
  /** Repository migrations the ledger has never seen. Not a fault by itself. */
  pending: RepositoryMigration[];
  /** Repository migrations the ledger carries under a different identity. */
  drifted: MigrationComparison[];
  /** Ledger rows no repository migration accounts for. */
  productionOnly: LedgerRow[];
  findings: Finding[];
  /** True when no drift finding was raised. Pending migrations do not clear this flag. */
  consistent: boolean;
};

/**
 * Compare the canonical repository migration set against a production migration ledger.
 *
 * Deliberately structural. Whether two bodies of SQL are *semantically* the same thing is
 * not decidable here and is not guessed at: the ledger's `statements` column holds what
 * actually ran, and proving equivalence means pulling that body back and diffing it
 * against the repository file by hand. What this can do reliably is notice that the two
 * sides disagree about identity, and say exactly how, so a human knows to go and look.
 */
export function compareLedgerToRepository(input: {
  migrations: readonly RepositoryMigration[];
  ledger: readonly LedgerRow[];
}): LedgerComparison {
  const migrations = [...input.migrations].sort((a, b) => a.version.localeCompare(b.version));
  const ledger = [...input.ledger].sort((a, b) => a.version.localeCompare(b.version));

  const ledgerByVersion = new Map(ledger.map((row) => [row.version, row]));
  const repoByVersion = new Map(migrations.map((m) => [m.version, m]));

  /**
   * Ledger rows indexed by canonical name, so a row carrying a `_prod` suffix or a
   * wall-clock version still finds the repository migration it belongs to.
   */
  const ledgerByCanonicalName = new Map<string, LedgerRow[]>();
  for (const row of ledger) {
    const key = canonicalName(row.name);
    ledgerByCanonicalName.set(key, [...(ledgerByCanonicalName.get(key) ?? []), row]);
  }

  const findings: Finding[] = [];
  const comparisons: MigrationComparison[] = [];
  const accountedFor = new Set<string>();

  for (const migration of migrations) {
    const sameVersion = ledgerByVersion.get(migration.version);
    if (sameVersion) {
      accountedFor.add(sameVersion.version);
      if (sameVersion.name === migration.name) {
        comparisons.push({ migration, status: "applied", ledgerRow: sameVersion });
        continue;
      }
      findings.push({
        code: "LEDGER_NAME_MISMATCH",
        severity: "drift",
        detail: `version ${migration.version} is "${migration.name}" in the repository and "${sameVersion.name}" in production`,
        remedy:
          "prove the applied body matches the repository file, then rekey the ledger row's name to the canonical one",
      });
      comparisons.push({ migration, status: "drifted", ledgerRow: sameVersion });
      continue;
    }

    // No row at this version. Does a row elsewhere carry this migration's name?
    const byName = (ledgerByCanonicalName.get(migration.name) ?? []).filter(
      (row) => !repoByVersion.has(row.version),
    );
    const candidate = byName[0];
    if (candidate) {
      accountedFor.add(candidate.version);
      const suffixed = candidate.name !== canonicalName(candidate.name);
      findings.push(
        suffixed
          ? {
              code: "PROD_SUFFIXED_LEDGER_ROW",
              severity: "drift",
              detail:
                `production carries "${candidate.version}_${candidate.name}" where the repository has ` +
                `"${migration.filename}"; the suffix marks an ad hoc application, and the repository ` +
                `version reads as pending against a database that has already run it`,
              remedy:
                "prove the applied body matches the repository file (the ledger's `statements` column holds what ran), " +
                "then rekey both the version and the name to the canonical ones in one transaction; never delete the row",
            }
          : {
              code: "LEDGER_VERSION_MISMATCH",
              severity: "drift",
              detail:
                `production carries "${migration.name}" at version ${candidate.version}, the repository at ` +
                `${migration.version}; the management API stamps the wall clock when it is given no version`,
              remedy:
                "prove the applied body matches the repository file, then rekey the ledger row to the canonical version; never delete the row",
            },
      );
      comparisons.push({ migration, status: "drifted", ledgerRow: candidate });
      continue;
    }

    comparisons.push({ migration, status: "pending", ledgerRow: null });
  }

  const pending = comparisons.filter((c) => c.status === "pending").map((c) => c.migration);
  if (pending.length > 0) {
    findings.push({
      code: "MIGRATION_PENDING",
      severity: "informational",
      // Emphatically not a failure: a feature branch whose migration has not been
      // deployed is the ordinary state of a pull request, and must stay green.
      detail: `${pending.length} repository migration(s) not yet applied to production: ${pending.map((m) => m.filename).join(", ")}`,
      remedy: "apply them with `supabase db push` when the change deploys",
    });
  }

  const productionOnly = ledger.filter((row) => !accountedFor.has(row.version));
  if (productionOnly.length > 0) {
    findings.push({
      code: "PRODUCTION_ONLY_MIGRATION",
      severity: "drift",
      detail: `${productionOnly.length} ledger row(s) no repository migration accounts for: ${productionOnly
        .map((row) => `${row.version}_${row.name}`)
        .join(", ")}`,
      remedy:
        "find what applied them; either bring the SQL into the repository under its own migration, or rekey the row to the migration it really is",
    });
  }

  return {
    migrations: comparisons,
    applied: comparisons.filter((c) => c.status === "applied").map((c) => c.migration),
    pending,
    drifted: comparisons.filter((c) => c.status === "drifted"),
    productionOnly,
    findings,
    consistent: findings.every((f) => f.severity !== "drift"),
  };
}

/** The SQL the production check reads. Read-only, and the only statement it runs. */
export const LEDGER_QUERY =
  "select version, name from supabase_migrations.schema_migrations order by version";
