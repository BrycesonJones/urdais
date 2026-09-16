/**
 * Reading Epoch's published benchmark bundle, and refusing the parts Urdais may not republish.
 *
 * The bundle's own `README.md` carries the CC BY 4.0 grant and the required citation, so the
 * licence travels with the data rather than being remembered by a collector. And the
 * internal/external split — the one thing that decides what may be republished — is a
 * **filename convention**: files ending `_external.csv` are sourced from other projects and
 * retain their original licensing. That makes eligibility mechanical rather than a judgement,
 * which is why `eligibleFile` is the only gate and why it is checked on every row.
 *
 * Nothing here parses a model identifier. The source's `Model version` is carried through
 * verbatim; decomposing it into a SKU and a configuration is the identity layer's job, and it
 * needs the catalogue of priced models to do it without guessing.
 */

import { createHash } from "node:crypto";

import {
  EXTERNAL_FILE_SUFFIX,
  FRONTIER_BENCHMARKS,
  FrontierContractError,
  type CapabilityObservation,
  type FrontierBenchmark,
} from "@/lib/frontier/types";

/** Whether a bundle file may be ingested at all. External files are never eligible. */
export function eligibleFile(fileName: string): boolean {
  return fileName.endsWith(".csv") && !fileName.endsWith(EXTERNAL_FILE_SUFFIX);
}

/** The V1 benchmark a bundle file belongs to, or null when Urdais does not ingest it. */
export function benchmarkForFile(fileName: string): FrontierBenchmark | null {
  if (!eligibleFile(fileName)) return null;
  return FRONTIER_BENCHMARKS.find((benchmark) => benchmark.sourceFile === fileName) ?? null;
}

/**
 * A minimal RFC 4180 reader.
 *
 * Written rather than depended upon because the alternative is a runtime dependency for
 * eighty lines, and because the failure mode this must avoid — a quoted field containing a
 * comma silently splitting a row — is exactly what a naive `split(",")` does.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);

  const header = rows.shift();
  if (header === undefined) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
}

/** The field separator inside a hashed row. A NUL cannot occur in any of the fields. */
const HASH_SEPARATOR = String.fromCharCode(0);

/** SHA-256 over the fields that define a result, so a revised score is detectable. */
export function rowHash(benchmarkSlug: string, identifier: string, score: string, asOf: string): string {
  return createHash("sha256")
    .update([benchmarkSlug, identifier, score, asOf].join(HASH_SEPARATOR))
    .digest("hex");
}

/** The score column Epoch publishes, in preference order. Both are present on V1 files. */
const SCORE_COLUMNS = ["Best score (across scorers)", "mean_score"] as const;
/** When the evaluation ran. Not the model's release date, which is a different fact. */
const AS_OF_COLUMN = "Started at";

/**
 * Normalise one bundle file into observations.
 *
 * Refuses rather than coerces. A score outside the benchmark's declared bounds or a
 * non-numeric one is a contract violation: the source publishes accuracies on a known scale,
 * so a value outside it means the file is not what this code believes it is, and continuing
 * would publish a number nobody checked.
 */
export function observationsFromFile(fileName: string, text: string): CapabilityObservation[] {
  const benchmark = benchmarkForFile(fileName);
  if (benchmark === null) {
    throw new FrontierContractError(`${fileName} is not an eligible V1 benchmark file`);
  }

  const seen = new Set<string>();
  const observations: CapabilityObservation[] = [];

  for (const row of parseCsv(text)) {
    const identifier = (row["Model version"] ?? "").trim();
    if (identifier === "") continue;
    if (seen.has(identifier)) {
      throw new FrontierContractError(`${fileName}: '${identifier}' appears twice`);
    }
    seen.add(identifier);

    const rawScore = SCORE_COLUMNS.map((column) => row[column]).find((value) => (value ?? "").trim() !== "");
    if (rawScore === undefined) continue;
    const score = Number(rawScore);
    if (!Number.isFinite(score)) {
      throw new FrontierContractError(`${fileName}: '${identifier}' has a non-numeric score '${rawScore}'`);
    }
    if (score < benchmark.scoreMin || score > benchmark.scoreMax) {
      throw new FrontierContractError(
        `${fileName}: '${identifier}' scores ${score}, outside the declared range ${benchmark.scoreMin}-${benchmark.scoreMax}`,
      );
    }

    const asOf = (row[AS_OF_COLUMN] ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) continue;

    const organization = (row.Organization ?? "").trim();
    observations.push({
      benchmarkSlug: benchmark.slug,
      sourceBenchmarkName: benchmark.sourceBenchmarkName,
      sourceBenchmarkFile: fileName,
      sourceModelIdentifier: identifier,
      // Decomposition happens in the identity layer, which knows the priced catalogue.
      sourceConfiguration: null,
      sourceOrganization: organization === "" ? null : organization,
      score,
      scoreMin: benchmark.scoreMin,
      scoreMax: benchmark.scoreMax,
      capabilityAsOf: asOf,
      rowContentHash: rowHash(benchmark.slug, identifier, String(score), asOf),
    });
  }

  return observations;
}
