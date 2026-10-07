/**
 * Argument parsing and target resolution for the UTVI backfill, kept free of side effects so
 * that every refusal can be tested.
 *
 * The failure this exists to prevent: an operator passed `--i-know-this-is-production`, the
 * production URL never reached the script, and it quietly fell back to the local harness. The
 * rules that follow from that:
 *
 *   - An argument the parser does not fully understand is an error, never ignored. A flag that
 *     was misspelt or written `--name=value` used to read as absent and select localhost.
 *   - `--i-know-this-is-production` is a claim about the target, and it is checked: the target
 *     must be identified as SUPABASE_PRODUCTION_PROJECT_REF, or nothing runs.
 *   - A remote target must be identified as either the production or the development project.
 *     Remote is not the same thing as production, and unknown is not the same thing as safe.
 *
 * No message produced here contains a connection string, a password, or an argument value that
 * could be one.
 */

import {
  describeDatabaseTarget,
  identifyDatabaseTarget,
  PROJECT_REF_PATTERN,
} from "@/lib/db/project-identity";

export const PRODUCTION_ACKNOWLEDGEMENT = "i-know-this-is-production";

const VALUE_FLAGS = ["start", "end", "database-url"] as const;
const BOOLEAN_FLAGS = ["dry-run", PRODUCTION_ACKNOWLEDGEMENT] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
type BooleanFlag = (typeof BOOLEAN_FLAGS)[number];

const USAGE =
  "usage: npx tsx scripts/utvi/backfill.ts [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--dry-run] "
  + "[--database-url <url>] [--i-know-this-is-production]";

export type BackfillArgs = {
  start: string | null;
  end: string | null;
  dryRun: boolean;
  databaseUrl: string | null;
  acknowledgesProduction: boolean;
};

export type ParseResult = { ok: true; args: BackfillArgs } | { ok: false; error: string };

/** An argument is echoed back only when it cannot be carrying a credential. */
function quote(token: string): string {
  return /:\/\/|@/.test(token) ? "(a value that looks like a connection string, not shown)" : `'${token}'`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseBackfillArgs(argv: readonly string[]): ParseResult {
  const values = new Map<ValueFlag, string>();
  const booleans = new Set<BooleanFlag>();
  const seen = new Set<string>();
  const fail = (error: string): ParseResult => ({ ok: false, error: `${error}\n${USAGE}` });

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--") || token === "--") {
      return fail(`unexpected argument ${quote(token)}: every argument is a named --flag`);
    }
    const equals = token.indexOf("=");
    if (equals !== -1) {
      const name = token.slice(0, equals);
      return fail(`${quote(name)} was written as --name=value, which is not supported; write it as two arguments: ${name} <value>`);
    }
    const name = token.slice(2);
    if (seen.has(name)) return fail(`--${name} was given more than once`);
    seen.add(name);

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      booleans.add(name as BooleanFlag);
      continue;
    }
    if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return fail(`--${name} needs a value`);
      if (value.trim() === "") return fail(`--${name} was given an empty value`);
      values.set(name as ValueFlag, value);
      index += 1;
      continue;
    }
    return fail(`unknown flag ${quote(token)}; known flags are ${[...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((f) => `--${f}`).join(", ")}`);
  }

  for (const name of ["start", "end"] as const) {
    const value = values.get(name);
    if (value !== undefined && !isCalendarDate(value)) {
      return fail(`--${name} must be a calendar date written YYYY-MM-DD, got ${quote(value)}`);
    }
  }

  return {
    ok: true,
    args: {
      start: values.get("start") ?? null,
      end: values.get("end") ?? null,
      dryRun: booleans.has("dry-run"),
      databaseUrl: values.get("database-url") ?? null,
      acknowledgesProduction: booleans.has(PRODUCTION_ACKNOWLEDGEMENT),
    },
  };
}

export type BackfillEnv = Readonly<Record<string, string | undefined>> & {
  UTVI_DATABASE_URL?: string;
  SUPABASE_PRODUCTION_PROJECT_REF?: string;
  /** The development project, UrdaisDev. */
  SUPABASE_PROJECT_REF?: string;
  PGHOST?: string;
  PGPORT?: string;
  PGUSER?: string;
  URDAIS_PG_PORT?: string;
  URDAIS_DB_NAME?: string;
};

export type TargetSource = "--database-url" | "UTVI_DATABASE_URL" | "local default";
export type TargetEnvironment = "production" | "development" | "local";

export type ResolvedTarget = {
  /** Never logged. Held only to open the connection. */
  connectionString: string;
  source: TargetSource;
  environment: TargetEnvironment;
  projectRef: string | null;
  /** `host:port/database`; safe to print. */
  description: string;
};

export type ResolveResult = { ok: true; target: ResolvedTarget } | { ok: false; error: string };

/** The local harness database. Never a hosted project. */
export function localDatabaseUrl(env: BackfillEnv): string {
  const host = env.PGHOST?.trim() || "localhost";
  const port = env.URDAIS_PG_PORT?.trim() || env.PGPORT?.trim() || "54329";
  const user = env.PGUSER?.trim() || "postgres";
  const name = env.URDAIS_DB_NAME?.trim() || "urdais_local";
  return `postgresql://${user}@${host}:${port}/${name}`;
}

function configuredRef(env: BackfillEnv, key: "SUPABASE_PRODUCTION_PROJECT_REF" | "SUPABASE_PROJECT_REF"): { ref: string | null; error?: string } {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === "") return { ref: null };
  const ref = raw.toLowerCase();
  if (!PROJECT_REF_PATTERN.test(ref)) {
    return { ref: null, error: `${key} is set but is not a Supabase project reference (twenty lowercase letters and digits)` };
  }
  return { ref };
}

export function resolveBackfillTarget(args: BackfillArgs, env: BackfillEnv): ResolveResult {
  const fail = (error: string): ResolveResult => ({ ok: false, error });

  let connectionString: string;
  let source: TargetSource;
  if (args.databaseUrl !== null) {
    connectionString = args.databaseUrl;
    source = "--database-url";
  } else if (env.UTVI_DATABASE_URL !== undefined) {
    if (env.UTVI_DATABASE_URL.trim() === "") {
      return fail("UTVI_DATABASE_URL is set but empty; unset it to use the local harness, or give it the intended connection");
    }
    connectionString = env.UTVI_DATABASE_URL.trim();
    source = "UTVI_DATABASE_URL";
  } else {
    connectionString = localDatabaseUrl(env);
    source = "local default";
  }

  const identified = identifyDatabaseTarget(connectionString);
  if (!identified.ok) {
    return fail(`the database target from ${source} is unusable: ${identified.reason}. Nothing was written, and the run did not fall back to another target.`);
  }
  const target = identified.target;
  const description = describeDatabaseTarget(target);

  const production = configuredRef(env, "SUPABASE_PRODUCTION_PROJECT_REF");
  if (production.error) return fail(production.error);
  const development = configuredRef(env, "SUPABASE_PROJECT_REF");
  if (development.error) return fail(development.error);
  if (production.ref !== null && production.ref === development.ref) {
    return fail("SUPABASE_PRODUCTION_PROJECT_REF and SUPABASE_PROJECT_REF name the same project, so production cannot be told apart from development");
  }

  if (target.kind === "local") {
    if (args.acknowledgesProduction) {
      const why = source === "local default"
        ? "no database was given: neither --database-url nor UTVI_DATABASE_URL is set, so the target fell through to the local harness"
        : `${source} points at the local harness`;
      return fail(`--${PRODUCTION_ACKNOWLEDGEMENT} was passed but ${why} (${description}). Set UTVI_DATABASE_URL to the production connection and run again.`);
    }
    return { ok: true, target: { connectionString, source, environment: "local", projectRef: null, description } };
  }

  if (target.kind === "unidentified") {
    return fail(`the target ${description} from ${source} is not local and does not identify a Supabase project, so it cannot be confirmed as development or production. Refusing to write to it.`);
  }

  const ref = target.projectRef;
  if (production.ref === null) {
    return fail(`the target is Supabase project ${ref}, but SUPABASE_PRODUCTION_PROJECT_REF is not set, so it cannot be confirmed whether this is production. Set it (it is in .env.local) and run again.`);
  }

  if (ref === production.ref) {
    if (!args.acknowledgesProduction) {
      return fail(`the target ${description} is the production project ${ref}; pass --${PRODUCTION_ACKNOWLEDGEMENT} to write to it`);
    }
    return { ok: true, target: { connectionString, source, environment: "production", projectRef: ref, description } };
  }

  if (ref === development.ref) {
    if (args.acknowledgesProduction) {
      return fail(`--${PRODUCTION_ACKNOWLEDGEMENT} was passed but the target is the development project ${ref}, not production ${production.ref}. Check UTVI_DATABASE_URL.`);
    }
    return { ok: true, target: { connectionString, source, environment: "development", projectRef: ref, description } };
  }

  return fail(
    `the target is Supabase project ${ref}, which is neither the production project (SUPABASE_PRODUCTION_PROJECT_REF) `
    + `nor the development project (SUPABASE_PROJECT_REF${development.ref === null ? ", which is not set" : ""}). Refusing to write to it.`,
  );
}
