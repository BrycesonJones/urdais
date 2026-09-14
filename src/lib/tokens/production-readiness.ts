/**
 * Production readiness for Token Price.
 *
 * A deployment should verify that the production data is ready. It must never
 * manufacture the verification event itself: `manual_verified` means a person
 * read the provider's published page, and a deploy hook that fabricated that
 * would empty the word of meaning.
 *
 * So this module only reads. It answers four questions:
 *
 *   1. is the schema current, or are migrations outstanding
 *   2. does every designated provider have a frozen Token Price benchmark
 *   3. can the read path actually load them
 *   4. is any of them resting on research-only observations
 *
 * Anything unready is reported with the operator action that fixes it, and the
 * caller exits nonzero. Nothing is written, ever.
 */

import { benchmarkProviders, constituentInForce } from "@/lib/tokens/read/benchmark";
import { loadPersistedBenchmarks, persistedBenchmarks, type BenchmarkSqlExecutor } from "@/lib/tokens/read/benchmark-store";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { productionFrozenRows, researchDerivedFrozenRows } from "@/lib/tokens/read/lineage";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";

export type ReadinessFailureCode =
  | "SCHEMA_OUTDATED"
  | "SCHEMA_MISSING"
  | "BENCHMARK_MISSING"
  | "BENCHMARK_NOT_PRODUCTION"
  | "READ_PATH_EMPTY";

export type ReadinessFinding = {
  code: ReadinessFailureCode;
  detail: string;
  /** What an operator should do about it. */
  remedy: string;
};

export type ReadinessReport = {
  ready: boolean;
  appliedMigrations: number;
  pendingMigrations: string[];
  providers: {
    providerSlug: string;
    designatedModelId: string | null;
    frozen: boolean;
    productionVisible: boolean;
    priceUsdPer1m: number | null;
    updatedAt: string | null;
  }[];
  findings: ReadinessFinding[];
  /** Observations worth printing that do not block a deployment. */
  notes: string[];
};

const REQUIRED_TABLES = ["pipeline.token_price_observations", "pipeline.token_price_benchmarks"] as const;
const REQUIRED_COLUMNS: readonly { table: string; column: string }[] = [
  { table: "source_retrievals", column: "acquisition_mode" },
  { table: "source_retrievals", column: "verification_evidence" },
];

/** Migration versions the repository expects, newest last. */
export function expectedMigrationVersions(filenames: readonly string[]): string[] {
  return filenames
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0]!)
    .sort();
}

export type ReadinessInput = {
  sql: BenchmarkSqlExecutor;
  /** Migration filenames from the repository, so the check knows what should be applied. */
  migrationFiles: readonly string[];
  /**
   * The canonical catalog, loaded lazily. The loader reads columns that a
   * migration may not have applied yet, so it is called only after the schema
   * checks pass: an outdated database should produce a finding and a remedy,
   * not a raw SQL error from a loader that assumed the schema.
   */
  loadCatalog: () => Promise<TokenReadCatalog>;
  onDate?: string;
};

/**
 * The frozen row names the two observations it consumed, so the question is
 * answered about that row rather than about the provider. The predicate lives
 * in read/lineage.ts and is the same one the production read path uses, so the
 * two can never disagree about the same row.
 */

async function schemaFindings(sql: BenchmarkSqlExecutor, migrationFiles: readonly string[]): Promise<{
  findings: ReadinessFinding[];
  applied: number;
  pending: string[];
}> {
  const findings: ReadinessFinding[] = [];

  const tables = await sql.query(
    `select table_schema || '.' || table_name as name from information_schema.tables where table_schema in ('reference','pipeline')`,
    [],
  );
  const present = new Set(tables.rows.map((row) => String(row.name)));
  for (const table of REQUIRED_TABLES) {
    if (!present.has(table)) {
      findings.push({
        code: "SCHEMA_MISSING",
        detail: `${table} does not exist`,
        remedy: "apply the outstanding migrations to this database before deploying",
      });
    }
  }

  const columns = await sql.query(
    `select table_name, column_name from information_schema.columns where table_schema = 'pipeline' and table_name = 'source_retrievals'`,
    [],
  );
  const columnSet = new Set(columns.rows.map((row) => `${String(row.table_name)}.${String(row.column_name)}`));
  for (const required of REQUIRED_COLUMNS) {
    if (!columnSet.has(`${required.table}.${required.column}`)) {
      findings.push({
        code: "SCHEMA_MISSING",
        detail: `pipeline.${required.table}.${required.column} is missing`,
        remedy: "apply the outstanding migrations to this database before deploying",
      });
    }
  }

  // The migration ledger is Supabase's. Where it exists, compare it with the repository.
  let applied = 0;
  let pending: string[] = [];
  try {
    const ledger = await sql.query(`select version from supabase_migrations.schema_migrations order by version`, []);
    const appliedVersions = new Set(ledger.rows.map((row) => String(row.version)));
    applied = appliedVersions.size;
    pending = expectedMigrationVersions(migrationFiles).filter((version) => !appliedVersions.has(version));
    if (pending.length > 0) {
      findings.push({
        code: "SCHEMA_OUTDATED",
        detail: `${pending.length} migration(s) not applied: ${pending.join(", ")}`,
        remedy: "apply the outstanding migrations through the existing Supabase migration path, then re-run this check",
      });
    }
  } catch {
    // No ledger, which is the case for a locally replayed database. The object
    // checks above still establish that the schema carries what is required.
  }

  return { findings, applied, pending };
}

/**
 * Reads the database and reports whether Token Price may be served in
 * production. Performs no writes.
 */
export async function checkTokenProductionReadiness(input: ReadinessInput): Promise<ReadinessReport> {
  const onDate = input.onDate ?? new Date().toISOString().slice(0, 10);
  const { findings, applied, pending } = await schemaFindings(input.sql, input.migrationFiles);

  const emptyProviders = () =>
    benchmarkProviders().map((providerSlug) => ({
      providerSlug,
      designatedModelId: constituentInForce(providerSlug, onDate)?.providerModelId ?? null,
      frozen: false,
      productionVisible: false,
      priceUsdPer1m: null,
      updatedAt: null,
    }));

  // An outdated database cannot be interrogated further: the catalog loader
  // reads columns a pending migration may not have added. Report and stop.
  if (findings.some((row) => row.code === "SCHEMA_MISSING")) {
    return { ready: false, appliedMigrations: applied, pendingMigrations: pending, findings, notes: [], providers: emptyProviders() };
  }

  const frozen = await loadPersistedBenchmarks(input.sql);
  const catalog = await input.loadCatalog();
  const notes: string[] = [];

  const providers = benchmarkProviders().map((providerSlug) => {
    const rows = frozen.filter((row) => row.providerSlug === providerSlug);
    // Ask the frozen rows themselves, not the provider. A row frozen from
    // research legs stays research-derived however many production
    // observations the provider has acquired since, and the production read
    // path filters by exactly this predicate.
    const serveable = productionFrozenRows(catalog, rows);
    const researchDerived = researchDerivedFrozenRows(catalog, rows);
    const served = persistedBenchmarks(serveable).find((row) => row.providerSlug === providerSlug);

    if (rows.length === 0) {
      findings.push({
        code: "BENCHMARK_MISSING",
        detail: `${providerSlug} has no frozen Token Price benchmark`,
        remedy: "run the operator verification against this database: npm run tokens:verify-production -- --verified-by <name> --evidence <what you checked>",
      });
    } else if (serveable.length === 0) {
      const offending = researchDerived.map((row) => `${row.id} (calculated ${row.calculatedAt})`).join(", ");
      findings.push({
        code: "BENCHMARK_NOT_PRODUCTION",
        detail: `${providerSlug} has ${rows.length} frozen benchmark row(s), none of whose leg observations are production-publicable: ${offending}`,
        remedy:
          "run the operator verification so the legs are manually verified production observations; a frozen row is never recalculated, so a research-derived row is never promoted",
      });
    } else if (researchDerived.length > 0) {
      // Not a blocker: production filters these out by the same predicate.
      notes.push(
        `${providerSlug} also has ${researchDerived.length} research-derived frozen row(s), which production does not serve: ${researchDerived.map((row) => row.id).join(", ")}`,
      );
    }

    return {
      providerSlug,
      designatedModelId: constituentInForce(providerSlug, onDate)?.providerModelId ?? null,
      frozen: rows.length > 0,
      productionVisible: serveable.length > 0,
      priceUsdPer1m: served?.priceUsdPer1m ?? null,
      updatedAt: served?.updatedAt ?? null,
    };
  });

  if (providers.length > 0 && frozen.length === 0) {
    findings.push({
      code: "READ_PATH_EMPTY",
      detail: "the read path loaded no Token Price benchmark at all",
      remedy: "run the operator verification against this database before deploying",
    });
  }

  return { ready: findings.length === 0, appliedMigrations: applied, pendingMigrations: pending, findings, notes, providers };
}

/** Convenience for tests and scripts that already hold a store rather than a database. */
export function catalogFromStore(store: Parameters<typeof tokenReadCatalogFromStore>[0]): TokenReadCatalog {
  return tokenReadCatalogFromStore(store);
}
