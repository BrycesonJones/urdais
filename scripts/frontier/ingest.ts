/**
 * Model Frontier ingestion, for an operator.
 *
 * A thin driver over `runFrontierCapability`, which the scheduled route also calls. The
 * ingestion itself lives there so that the path exercised by hand and the path that runs
 * unattended cannot drift apart -- the one nobody watches is the one that matters.
 *
 * Safe by default in the same way the UTVI scripts are: the local harness unless told
 * otherwise, and a refusal on a non-local target without an explicit acknowledgement.
 *
 * Idempotent by content. A bundle whose bytes hash to the last ingested value writes nothing
 * and says so — which is what makes a scheduled daily check cheap, and what keeps "checked,
 * unchanged" distinguishable from "new data" in the freshness gate.
 *
 * Usage:
 *   npx tsx scripts/frontier/ingest.ts [--database-url <url>] [--i-know-this-is-production]
 *                                      [--file <bundle.zip>] [--force]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import { runFrontierCapability } from "@/lib/frontier/run";

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

function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  const given = flag("database-url") ?? process.env.DATABASE_URL ?? null;
  const databaseUrl = given ?? localDatabaseUrl();
  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  if (!isLocal && !present("i-know-this-is-production")) {
    console.error(`refusing a non-local target (${describeTarget(databaseUrl)}) without --i-know-this-is-production`);
    process.exitCode = 1;
    return;
  }
  console.log(`target        ${describeTarget(databaseUrl)}`);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const sql = {
    async query(text: string, params: readonly unknown[]) {
      return { rows: (await client.query(text, params as unknown[])).rows as Record<string, unknown>[] };
    },
  };

  try {
    const localFile = flag("file");
    const result = await runFrontierCapability(sql, {
      trigger: "operator",
      force: present("force"),
      // A local copy is for reproducing a past bundle, never for production collection.
      fetchBundle: localFile === null ? undefined : async () => readFileSync(localFile),
    });

    console.log(`bundle hash   ${result.bundleHash ?? "(not fetched)"}`);
    console.log("");
    if (!result.ok) {
      console.error(`failed: ${result.failure}`);
      process.exitCode = 1;
      return;
    }
    if (!result.sourceChanged) {
      console.log("source unchanged: this bundle hashes to the last ingested one. Nothing written.");
      console.log("  (a scheduled check confirming unchanged data is not a data rollover)");
      return;
    }
    const o = result.observations!;
    console.log(`observations  ${o.created} created, ${o.revised} revised, ${o.unchanged} unchanged`);
    const id = result.identity!;
    console.log(`identity      ${id.evidenced} evidenced, ${id.ambiguous} ambiguous, ${id.unmapped} unmapped`);
    const price = result.priceSelections!;
    console.log(`price         ${price.selected} models selected, ${price.excluded} excluded`);
    for (const reason of price.reasons) console.log(`                ${reason}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
