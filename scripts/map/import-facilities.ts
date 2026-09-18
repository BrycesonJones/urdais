/**
 * The facility importer.
 *
 *   npm run map:import                                        (dry run, the projected dataset)
 *   npm run map:import -- --file data/map/other.json          (dry run, another file)
 *   DATABASE_URL=... npm run map:import -- --write            (persist, one transaction)
 *
 * **A dry run is the default and the only thing that happens without --write.**
 * That is not caution for its own sake: this importer writes the rows behind a
 * public map, and a dot is a claim that a named company operates a named
 * facility at a named place. The cost of reviewing a plan is a few seconds; the
 * cost of a bad write is a wrong claim on a public surface, so the safe
 * direction is the one that needs no flag.
 *
 * A dry run with a database configured is better than one without: it reads the
 * research keys already stored so a relationship may point at a facility from
 * an earlier batch. It never writes.
 *
 * Output is one JSON object: the counts, the errors, the review candidates and
 * the batch digest. No secret is printed; the database URL is never echoed.
 * Exit code 1 means the plan has errors and nothing would be or was written.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FACILITY_IMPORT_CONTRACT_VERSION,
  SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS,
  parseFacilityImportDocument,
} from "@/lib/facilities/contract";
import { buildImportPlan } from "@/lib/facilities/import/plan";
import { applyImportPlan, loadExistingResearchKeys } from "@/lib/facilities/import/persist";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

const DEFAULT_DATASET = "data/map/facilities.v1.json";
const REJECTED_REGISTER = "data/map/rejected-candidates.v1.json";
const RIGHTS_REGISTER = "data/map/source-rights-register.v1.json";

/** A register is advisory: a missing file weakens the review, it does not stop the import. */
function readRegister<T>(path: string, pick: (raw: Record<string, unknown>) => T[]): T[] {
  try {
    return pick(JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return fallback;
  return value;
}

async function main(): Promise<void> {
  const file = resolve(process.cwd(), option("file", DEFAULT_DATASET));
  const write = flag("write");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(JSON.stringify({ file, stage: "read", error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { document, issues } = parseFacilityImportDocument(raw);
  if (!document) {
    console.error(
      JSON.stringify(
        {
          file,
          stage: "contract",
          supportedContractVersions: SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS,
          issues,
          wrote: false,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (write && databaseUrl === "") {
    console.error(JSON.stringify({ file, stage: "write", error: "--write needs DATABASE_URL", wrote: false }, null, 2));
    process.exitCode = 1;
    return;
  }

  const sql = databaseUrl === "" ? null : await createTokenSqlExecutor(databaseUrl);
  try {
    const existingResearchKeys = sql ? await loadExistingResearchKeys(sql) : [];
    const rejectedCandidates = readRegister(REJECTED_REGISTER, (raw) => (raw.candidates ?? []) as { candidate: string; reason: string }[]);
    const rightsRegister = readRegister(RIGHTS_REGISTER, (raw) => (raw.sources ?? []) as { domain: string; state: string; note: string }[]);
    const plan = buildImportPlan(document, { existingResearchKeys, rejectedCandidates, rightsRegister });

    const report = {
      file,
      dataset: plan.datasetName,
      researchDocument: plan.researchDocument,
      generatedAt: plan.generatedAt,
      // Both, because they differ whenever an older dataset is read by a newer
      // build, and a report that showed only one would hide which.
      contractVersion: { declared: document.contractVersion, current: FACILITY_IMPORT_CONTRACT_VERSION },
      mode: write ? "write" : "dry-run",
      databaseConfigured: sql !== null,
      digest: plan.digest,
      registers: { rejectedCandidates: rejectedCandidates.length, rightsSources: rightsRegister.length },
      counts: plan.counts,
      errors: plan.errors,
      reviewCandidates: plan.reviewCandidates,
    };

    if (plan.errors.length > 0) {
      // No partial write, and no write of "the good ones": a batch is a batch.
      console.error(JSON.stringify({ ...report, wrote: false }, null, 2));
      process.exitCode = 1;
      return;
    }

    if (!write) {
      console.log(JSON.stringify({ ...report, wrote: false }, null, 2));
      return;
    }

    const result = await applyImportPlan(sql!, plan);
    console.log(JSON.stringify({ ...report, wrote: true, result }, null, 2));
  } finally {
    await sql?.end();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ stage: "run", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), wrote: false }, null, 2));
  process.exitCode = 1;
});
