/**
 * The UTVI daily run, for an operator.
 *
 * The same function the cron route calls, invoked from a terminal against a named database.
 * Its purpose is verification rather than operation: it lets a person watch the day that just
 * closed get collected and the day before it get confirmed, and see the publication gate
 * refuse while the methodology is a draft.
 *
 * Safe by default in the same way the backfill is: the local harness unless told otherwise,
 * and a refusal on a non-local target without an explicit acknowledgement.
 *
 * Usage:
 *   npx tsx scripts/utvi/run.ts [--database-url <url>] [--i-know-this-is-production] [--json]
 *
 * The API key comes from OPENROUTER_API_KEY and is never printed.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import { runDailyUtvi, utviRunSummary } from "@/lib/utvi/run";
import { readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";

const present = (name: string): boolean => process.argv.includes(`--${name}`);
function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function loadLocalEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    process.env[key!] = rawValue!.trim().replace(/^["']|["']$/g, "");
  }
}

function localDatabaseUrl(): string {
  const host = process.env.PGHOST?.trim() || "localhost";
  const port = process.env.URDAIS_PG_PORT?.trim() || process.env.PGPORT?.trim() || "54329";
  const user = process.env.PGUSER?.trim() || "postgres";
  const name = process.env.URDAIS_DB_NAME?.trim() || "urdais_local";
  return `postgresql://${user}@${host}:${port}/${name}`;
}

/** Hostname and database only: a connection string may carry a password. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

function looksLikeProduction(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return true;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const databaseUrl = flag("database-url") ?? process.env.UTVI_DATABASE_URL ?? localDatabaseUrl();

  if (looksLikeProduction(databaseUrl) && !present("i-know-this-is-production")) {
    console.error(
      `refusing to write to ${describeTarget(databaseUrl)}: pass --i-know-this-is-production to acknowledge a non-local target`,
    );
    process.exit(2);
  }
  if (readApiKey() === null) {
    console.error(`${UTVI_API_KEY_ENV} is not configured; nothing was retrieved`);
    process.exit(2);
  }

  // A single client, not a pool: the revision path uses a transaction, and a pool may route
  // consecutive statements to different connections.
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const sql = {
    query: async (text: string, params: readonly unknown[]) => ({
      rows: (await client.query(text, params as unknown[])).rows as Record<string, unknown>[],
    }),
  };
  try {
    const result = await runDailyUtvi(sql);

    if (present("json")) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`target            ${describeTarget(databaseUrl)}`);
    console.log(`collection date   ${result.collectionDate}  (the day that just closed)`);
    console.log(`settlement date   ${result.settlementDate}  (re-read to confirm it stopped moving)`);
    console.log(`methodology       ${result.methodologyVersion} (${result.methodologyStatus})`);
    console.log("");
    for (const retrieval of result.retrievals) {
      console.log(
        `retrieval         ${retrieval.requestedStart}..${retrieval.requestedEnd} -> ` +
          `${retrieval.actualStart ?? "-"}..${retrieval.actualEnd ?? "-"}  ${retrieval.outcome}  rows=${retrieval.rowCount ?? "-"}`,
      );
    }
    console.log("");
    for (const date of result.dates) {
      const parts = [
        date.observationDate,
        `snapshot=${date.snapshot}`,
        `calculation=${date.calculation}`,
        `publication=${date.publication}`,
      ];
      if (date.totalTokens) parts.push(`tokens=${Number(date.totalTokens).toLocaleString("en-US")}`);
      if (date.settlementState) parts.push(date.settlementState);
      console.log(`  ${parts.join("  ")}`);
      if (date.publicationDetail) console.log(`      ${date.publicationDetail}`);
      if (date.calculationDetail) console.log(`      ${date.calculationDetail}`);
    }
    console.log(`\nsummary  ${JSON.stringify(utviRunSummary(result))}`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
