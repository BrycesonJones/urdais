/**
 * The gate a planning write to a shared database has to pass.
 *
 * Three questions, asked in order, each of which has gone wrong somewhere before:
 *
 *   Which database is this?  A connection string is easy to inherit from the wrong shell, and
 *                            UrdaisDev and UrdaisProd differ by twenty characters. The project
 *                            reference is read out of the connection itself and compared with
 *                            the one the operator said they meant.
 *
 *   Is its schema current?   Ingesting into a database missing the migrations that created the
 *                            tables fails loudly, but ingesting into one missing a *later*
 *                            migration succeeds and writes rows that do not mean what the
 *                            repository thinks they mean. Pending migrations stop the run.
 *
 *   Was writing intended?    A dry run is the default. Writing is a separate, explicit decision.
 *
 * Nothing here prints a connection string, a password, or any part of one.
 */

import { compareLedgerToRepository, type LedgerRow, type RepositoryMigration } from "@/lib/migrations/integrity";

export type DatabaseIdentity = {
  /** The Supabase project reference, where the connection is to a Supabase project. */
  projectRef: string | null;
  host: string;
  /** True for the local harness database, which needs no production confirmation. */
  isLocal: boolean;
};

/**
 * Supabase names the pooler user `postgres.<ref>` and the direct host `db.<ref>.supabase.co`.
 * Either identifies the project without the password being touched.
 */
export function identifyDatabase(url: string): DatabaseIdentity {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("the configured database URL is not a URL");
  }
  const host = parsed.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const fromUser = /^postgres\.([a-z0-9]{16,})$/i.exec(decodeURIComponent(parsed.username));
  const fromHost = /^db\.([a-z0-9]{16,})\.supabase\.co$/i.exec(host);
  return { projectRef: fromUser?.[1] ?? fromHost?.[1] ?? null, host, isLocal };
}

export type ProductionGateInput = {
  url: string;
  /** The project the operator says they are targeting. Required for any non-local write. */
  expectedProjectRef: string | null;
  migrationFilenames: readonly string[];
  ledger: readonly LedgerRow[];
  write: boolean;
};

export type ProductionGateResult = {
  ok: boolean;
  identity: DatabaseIdentity;
  pendingMigrations: string[];
  driftedMigrations: string[];
  refusals: string[];
  /** Said out loud so a dry run cannot be mistaken for a write in a log. */
  mode: "dry_run" | "write";
};

export function checkPlanningProductionGate(input: ProductionGateInput): ProductionGateResult {
  const identity = identifyDatabase(input.url);
  const refusals: string[] = [];

  if (!identity.isLocal) {
    if (input.expectedProjectRef === null || input.expectedProjectRef.trim() === "") {
      refusals.push(
        "the target is not the local database and no expected project reference was given; "
        + "pass --expect-project <ref> (or set URDAIS_PRODUCTION_PROJECT_REF) so the run names the database it means to write to",
      );
    } else if (identity.projectRef === null) {
      refusals.push(`the connection does not identify a Supabase project (host ${identity.host}), so it cannot be confirmed as ${input.expectedProjectRef}`);
    } else if (identity.projectRef !== input.expectedProjectRef) {
      refusals.push(`the connection targets project ${identity.projectRef} but the run expects ${input.expectedProjectRef}`);
    }
  }

  const comparison = compareLedgerToRepository({
    migrations: input.migrationFilenames
      .filter((name) => name.endsWith(".sql"))
      .map((filename): RepositoryMigration => ({
        filename,
        version: filename.slice(0, filename.indexOf("_")),
        name: filename.slice(filename.indexOf("_") + 1, -4),
      })),
    ledger: [...input.ledger],
  });
  const pendingMigrations = comparison.pending.map((entry) => entry.filename);
  const driftedMigrations = comparison.drifted.map((entry) => entry.migration.filename);

  if (pendingMigrations.length > 0) {
    refusals.push(
      `${pendingMigrations.length} migration(s) in the repository are not applied to this database: ${pendingMigrations.join(", ")}. `
      + "The planning tables and their constraints come from those migrations; ingesting first would write rows the schema has not agreed to.",
    );
  }
  if (driftedMigrations.length > 0) {
    refusals.push(`${driftedMigrations.length} migration(s) are recorded under a different version or name: ${driftedMigrations.join(", ")}. A human must reconcile the ledger.`);
  }

  return {
    ok: refusals.length === 0,
    identity,
    pendingMigrations,
    driftedMigrations,
    refusals,
    mode: input.write ? "write" : "dry_run",
  };
}
