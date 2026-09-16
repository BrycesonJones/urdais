/**
 * Model Frontier ingestion, for an operator.
 *
 * Three steps against one database connection, each reported separately because their failure
 * modes are different: read the published bundle, resolve identity against the priced
 * catalogue, and record the price selection for every model that has one.
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
import { createHash } from "node:crypto";
import path from "node:path";

import pg from "pg";

import { benchmarkForFile, observationsFromFile } from "@/lib/frontier/source/bundle";
import { readZipEntries } from "@/lib/frontier/source/zip";
import { resolveIdentity, type PricedModel } from "@/lib/frontier/identity";
import { selectPrice, type PriceRow } from "@/lib/frontier/price";
import {
  applyObservations,
  lastBundleHash,
  recordRetrieval,
  resolveLineage,
  upsertLink,
  upsertPriceSelection,
} from "@/lib/frontier/store";
import {
  EPOCH_BUNDLE_URL,
  EPOCH_CITATION,
  EPOCH_LICENSE,
  EPOCH_SOURCE_SLUG,
  FRONTIER_BENCHMARKS,
  type CapabilityObservation,
} from "@/lib/frontier/types";

const COLLECTOR = "scripts/frontier/ingest.ts";

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

  // ---- read the bundle, from disk or from the published path.
  const localFile = flag("file");
  let archive: Buffer;
  if (localFile !== null) {
    archive = readFileSync(localFile);
    console.log(`bundle        ${localFile} (${archive.length} bytes)`);
  } else {
    const response = await fetch(EPOCH_BUNDLE_URL);
    if (!response.ok) {
      console.error(`bundle fetch failed: HTTP ${response.status}`);
      process.exitCode = 1;
      return;
    }
    archive = Buffer.from(await response.arrayBuffer());
    console.log(`bundle        ${EPOCH_BUNDLE_URL} (${archive.length} bytes)`);
  }
  const bundleHash = createHash("sha256").update(archive).digest("hex");
  console.log(`bundle hash   ${bundleHash}`);

  const entries = readZipEntries(archive);
  const readme = entries.find((entry) => entry.name.endsWith("README.md"));
  if (readme === undefined) {
    console.error("the bundle carries no README.md, which is where the licence and citation live");
    process.exitCode = 1;
    return;
  }
  // The grant travels with the data; refuse to ingest a bundle that stopped saying so.
  if (!/Creative Commons Attribution/i.test(readme.data.toString("utf8"))) {
    console.error("the bundle README no longer states the Creative Commons Attribution licence; refusing to ingest");
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const sql = {
    async query(text: string, params: readonly unknown[]) {
      return { rows: (await client.query(text, params as unknown[])).rows as Record<string, unknown>[] };
    },
  };

  try {
    const lineage = await resolveLineage(sql, EPOCH_SOURCE_SLUG);

    const previous = await lastBundleHash(sql);
    if (previous === bundleHash && !present("force")) {
      console.log("");
      console.log("source unchanged: this bundle hashes to the last ingested one. Nothing written.");
      console.log("  (a scheduled check confirming unchanged data is not a data rollover)");
      return;
    }

    // ---- observations
    const observations: CapabilityObservation[] = [];
    let files = 0;
    for (const benchmark of FRONTIER_BENCHMARKS) {
      const entry = entries.find((candidate) => candidate.name.endsWith(benchmark.sourceFile));
      if (entry === undefined) {
        console.error(`the bundle no longer contains ${benchmark.sourceFile}; refusing a partial ingestion`);
        process.exitCode = 1;
        return;
      }
      if (benchmarkForFile(benchmark.sourceFile) === null) {
        console.error(`${benchmark.sourceFile} is not an eligible file`);
        process.exitCode = 1;
        return;
      }
      files += 1;
      observations.push(...observationsFromFile(benchmark.sourceFile, entry.data.toString("utf8")));
    }

    const retrieval = await recordRetrieval(sql, lineage, {
      bundleHash,
      byteLength: archive.length,
      citation: EPOCH_CITATION,
      license: EPOCH_LICENSE,
      retrievedAt: new Date().toISOString(),
      fileCount: files,
      rowCount: observations.length,
    });

    const applied = await applyObservations(
      sql,
      lineage,
      retrieval.capabilityRetrievalId,
      EPOCH_CITATION,
      EPOCH_LICENSE,
      observations,
    );
    console.log("");
    console.log(`observations  ${applied.created} created, ${applied.revised} revised, ${applied.unchanged} unchanged`);

    // ---- identity, against the priced catalogue
    const { rows: catalogueRows } = await sql.query(
      `select p.slug as provider_slug, m.provider_model_id
         from reference.models m join reference.providers p on p.id = m.provider_id`,
      [],
    );
    const catalogue: PricedModel[] = catalogueRows.map((row) => ({
      providerSlug: String(row.provider_slug),
      providerModelId: String(row.provider_model_id),
    }));

    const byState = { evidenced: 0, ambiguous: 0, unmapped: 0, not_applicable: 0 };
    const identifiers = new Map(observations.map((o) => [o.sourceModelIdentifier, o.sourceOrganization]));
    for (const [identifier, organization] of identifiers) {
      const link = resolveIdentity(identifier, organization, catalogue);
      byState[link.state] += 1;
      await upsertLink(sql, lineage, link, COLLECTOR);
    }
    console.log(
      `identity      ${byState.evidenced} evidenced, ${byState.ambiguous} ambiguous, ${byState.unmapped} unmapped (of ${identifiers.size} identifiers)`,
    );

    // ---- price selection, for every model an evidenced link reaches
    const { rows: priceRows } = await sql.query(
      `select p.slug as provider_slug, m.provider_model_id, o.pricing_dimension, o.service_tier,
              o.context_tier, o.region, o.canonical_price_usd_per_1m::float8 as usd,
              o.retrieved_at::date::text as observed_at
         from pipeline.token_price_observations o
         join reference.models m on m.id = o.model_id
         join reference.providers p on p.id = m.provider_id`,
      [],
    );
    const byModel = new Map<string, { slug: string; id: string; rows: PriceRow[] }>();
    for (const row of priceRows) {
      const key = `${String(row.provider_slug)}/${String(row.provider_model_id)}`;
      const entry = byModel.get(key) ?? {
        slug: String(row.provider_slug),
        id: String(row.provider_model_id),
        rows: [],
      };
      entry.rows.push({
        dimension: String(row.pricing_dimension),
        serviceTier: row.service_tier === null ? null : String(row.service_tier),
        contextTier: row.context_tier === null ? null : String(row.context_tier),
        region: row.region === null ? null : String(row.region),
        usdPer1m: Number(row.usd),
        observedAt: String(row.observed_at),
      });
      byModel.set(key, entry);
    }

    let selected = 0;
    const excluded: string[] = [];
    for (const { slug, id, rows } of byModel.values()) {
      const outcome = selectPrice(slug, id, rows);
      if (outcome.kind === "excluded") {
        excluded.push(`${slug}/${id}: ${outcome.reason}`);
        continue;
      }
      await upsertPriceSelection(sql, outcome.selection);
      selected += 1;
    }
    console.log(`price         ${selected} models selected, ${excluded.length} excluded`);
    for (const reason of excluded) console.log(`                ${reason}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
