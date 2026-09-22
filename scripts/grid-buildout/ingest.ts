/**
 * Grid Buildout Velocity canonical ingestion.
 *
 *   npm run grid-buildout:ingest -- --source ercot
 *   npm run grid-buildout:ingest -- --source caiso
 *   npm run grid-buildout:ingest -- --all
 *   npm run grid-buildout:ingest -- --all --file ercot=/path/tpit.xlsx --file caiso=/path/tpp.xlsx
 *
 * `--file` reads a workbook already on disk instead of fetching, so an ingest can be replayed
 * against exactly the bytes a previous run saw. The snapshot key and content hash are unchanged by
 * that route, so a file replay of an already-held artifact is the same no-op a network rerun is.
 *
 * There is no cron. Both publishers republish two or three times a year, and detecting a genuinely
 * new vintage is a content-hash comparison rather than a schedule.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { BUILDOUT_ADAPTERS, runBuildoutIngest } from "@/lib/grid-buildout/ingest/run";
import { GBV_SOURCE_KEYS, type GbvSourceKey } from "@/lib/grid-buildout/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function fileOverrides(): Map<GbvSourceKey, string> {
  const out = new Map<GbvSourceKey, string>();
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== "--file") continue;
    const value = process.argv[index + 1] ?? "";
    const split = value.indexOf("=");
    if (split === -1) throw new Error("--file expects source=path");
    const key = value.slice(0, split) as GbvSourceKey;
    if (!GBV_SOURCE_KEYS.includes(key)) throw new Error(`unknown source ${key}`);
    out.set(key, value.slice(split + 1));
  }
  return out;
}

async function localArtifact(source: GbvSourceKey, path: string): Promise<RetrievedArtifact> {
  const body = await readFile(path);
  return {
    label: source,
    url: BUILDOUT_ADAPTERS[source].artifactUrl(),
    retrievedAt: new Date().toISOString(),
    status: 200,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteLength: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
    body,
  };
}

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const one = flag("source");
  const files = fileOverrides();
  const sources: GbvSourceKey[] = all
    ? [...GBV_SOURCE_KEYS]
    : one === null ? [] : [one as GbvSourceKey];
  if (sources.length === 0) {
    throw new Error("choose --source ercot|caiso or --all");
  }
  for (const source of sources) {
    if (!GBV_SOURCE_KEYS.includes(source)) throw new Error(`unknown source ${source}`);
  }

  const databaseUrl = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (databaseUrl === null) throw new Error("no database is configured");
  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    for (const source of sources) {
      const path = files.get(source);
      const artifact = path === undefined ? undefined : await localArtifact(source, path);
      if (path !== undefined) {
        process.stdout.write(`${source}: reading ${basename(path)}\n`);
      }
      const outcome = await runBuildoutIngest(sql, source, artifact === undefined ? {} : { artifact });
      if (outcome.status === "failed") {
        process.stdout.write(`${source}: FAILED ${outcome.error}\n`);
        process.exitCode = 1;
        continue;
      }
      process.stdout.write(
        `${source}: snapshot ${outcome.snapshot} ${outcome.snapshotId}\n`
        + `  raw ${outcome.rawRecordsInserted}, projects +${outcome.projectsInserted} `
        + `(reused ${outcome.projectsReused}), observations ${outcome.projectObservations}, `
        + `lifecycle ${outcome.lifecycleObservations}, milestones ${outcome.milestones}, `
        + `quantities ${outcome.quantities}, relationships ${outcome.relationships} `
        + `(resolved ${outcome.relationshipsResolved}), deferrals ${outcome.deferrals}\n`
        + `  lifecycle ${JSON.stringify(outcome.lifecycleCounts)}\n`
        + `  milestones ${JSON.stringify(outcome.milestoneCounts)}\n`,
      );
    }

    const violations = await sql.query(
      `select violation, detail, occurrences from pipeline.buildout_domain_violations()`, []);
    if (violations.rows.length === 0) {
      process.stdout.write("domain violations: 0\n");
    } else {
      for (const row of violations.rows) {
        process.stdout.write(`VIOLATION ${String(row.violation)} x${String(row.occurrences)}: ${String(row.detail)}\n`);
      }
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
