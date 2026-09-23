/**
 * Merge the reviewed Equinix precision-recovery artifact into a complete v3
 * geocoding result, then project only its 73 target records into the canonical
 * facility dataset. This script is deterministic and never connects to a
 * database; production persistence remains map:import and its gated workflow.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument, type ContractFacility } from "@/lib/facilities/contract";
import { isMapEligible } from "@/lib/facilities/domain";
import {
  EQUINIX_RECOVERY_DIGEST,
  mergeEquinixRecovery,
  projectEquinixRecovery,
  type EquinixRecoveryArtifact,
} from "@/lib/facilities/equinix-recovery";
import {
  materializeEquinixQueue,
  validateEquinixTranche,
  type EquinixGeocodeResult,
  type EquinixReviewDecisions,
} from "@/lib/facilities/equinix-tranche";
import { buildImportPlan } from "@/lib/facilities/import/plan";

const ROOT = process.cwd();
const PATHS = {
  source: "data/map/equinix-manual-tranche.v1.json",
  v2: "data/map/geocoding/equinix-results.v2.json",
  recovery: "data/map/geocoding/equinix-precision-recovery.v1.json",
  decisions: "data/map/geocoding/equinix-review-decisions.v1.json",
  v3: "data/map/geocoding/equinix-results.v3.json",
  canonical: "data/map/facilities.v1.json",
} as const;

const readText = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");
const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T;
const writeJson = (path: string, value: unknown): void =>
  writeFileSync(resolve(ROOT, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function precisionDistribution(results: readonly EquinixGeocodeResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => ({
    ...counts,
    [result.coordinatePrecision]: (counts[result.coordinatePrecision] ?? 0) + 1,
  }), { building: 0, street: 0, campus: 0, city: 0 });
}

function main(): void {
  const actualRecoveryDigest = sha256(readText(PATHS.recovery));
  if (actualRecoveryDigest !== EQUINIX_RECOVERY_DIGEST) {
    throw new Error(`recovery digest ${actualRecoveryDigest} does not match approved ${EQUINIX_RECOVERY_DIGEST}`);
  }

  const sourceValidation = validateEquinixTranche(readJson(PATHS.source));
  if (sourceValidation.issues.length > 0) throw new Error(`Equinix source is invalid: ${sourceValidation.issues.join("; ")}`);
  const queue = materializeEquinixQueue(sourceValidation.tranche);
  if (queue.length !== 187) throw new Error(`Equinix source materialized ${queue.length} records, expected 187`);

  const v2 = readJson<{ results: EquinixGeocodeResult[] }>(PATHS.v2).results;
  const recovery = readJson<EquinixRecoveryArtifact>(PATHS.recovery);
  const decisions = readJson<EquinixReviewDecisions>(PATHS.decisions);
  const merged = mergeEquinixRecovery(v2, recovery, decisions);
  if (merged.issues.length > 0) throw new Error(`v3 QA failed: ${merged.issues.join("; ")}`);

  const recoveryKeys = new Set(recovery.records.map((record) => record.researchKey));
  const resultKeys = new Set(merged.results.map((result) => result.researchKey));
  const evidenceCovered = merged.results.filter((result) =>
    Boolean(result.sourceUrl) || (result.coordinateEvidenceUrls?.length ?? 0) > 0 || (result.researchEvidenceUrls?.length ?? 0) > 0,
  ).length;
  const mapEligible = merged.results.filter((result) => isMapEligible({
    latitude: result.latitude,
    longitude: result.longitude,
    coordinatePrecision: result.coordinatePrecision,
  })).length;

  if (recoveryKeys.size !== 73 || resultKeys.size !== 187 || evidenceCovered !== 187) {
    throw new Error(`v3 cardinality/evidence failure: recovery=${recoveryKeys.size}, results=${resultKeys.size}, evidence=${evidenceCovered}`);
  }

  const v3 = {
    resultVersion: "urdais.map.equinix-geocode-results/3",
    generatedAt: "2026-09-23",
    provider: "Nominatim plus documented precision recovery and human review",
    basis: "v2 plus the immutable 73-record precision-recovery artifact and ten explicit reviewer decisions; shared-point precision rules applied after merge.",
    sourceResult: PATHS.v2,
    recoveryArtifact: PATHS.recovery,
    recoveryArtifactDigest: actualRecoveryDigest,
    reviewerDecisions: PATHS.decisions,
    qa: {
      records: merged.results.length,
      uniqueResearchKeys: resultKeys.size,
      automaticUpgrades: merged.automaticUpgrades.length,
      humanReviewed: merged.humanReviewed.length,
      retainedCity: merged.retainedCity.length,
      unresolved: merged.results.filter((result) => result.outcome !== "geocoded_ready").length,
      nullCoordinates: merged.results.filter((result) => result.latitude === null || result.longitude === null).length,
      evidenceCovered,
      precision: precisionDistribution(merged.results),
      mapEligible,
      sharedPointDemotions: merged.sharedPointDemotions,
    },
    results: merged.results,
  };
  writeJson(PATHS.v3, v3);

  const rawCanonical = readJson<Record<string, unknown> & { facilities: ContractFacility[] }>(PATHS.canonical);
  const parsedBefore = parseFacilityImportDocument(rawCanonical);
  if (!parsedBefore.document) throw new Error(`canonical input is invalid: ${JSON.stringify(parsedBefore.issues)}`);
  if (parsedBefore.document.facilities.length !== 503) throw new Error(`canonical input has ${parsedBefore.document.facilities.length} facilities, expected 503`);

  const beforeByKey = new Map(parsedBefore.document.facilities.map((facility) => [facility.researchKey, stable(facility)]));
  const projection = projectEquinixRecovery(parsedBefore.document.facilities, queue, merged.results);
  // Keep the byte-level representation of all 437 untouched records. The
  // contract parser materializes optional nulls, so serializing its complete
  // output would create thousands of unrelated mechanical changes.
  const projectedByKey = new Map(projection.facilities.map((facility) => [facility.researchKey, facility]));
  const updatedKeys = new Set(projection.updated);
  const outputFacilities = rawCanonical.facilities.map((facility) => {
    if (!updatedKeys.has(facility.researchKey)) return facility;
    const projected = projectedByKey.get(facility.researchKey)!;
    const existingEvidenceUrls = new Set(facility.evidence.map((evidence) => evidence.url));
    const existingAliases = new Set((facility.aliases ?? []).map((alias) => `${alias.kind ?? "alias"}\0${alias.alias}`));
    return {
      ...facility,
      aliases: [
        ...(facility.aliases ?? []),
        ...(projected.aliases ?? []).filter((alias) => !existingAliases.has(`${alias.kind ?? "alias"}\0${alias.alias}`)),
      ],
      location: {
        ...facility.location,
        latitude: projected.location.latitude,
        longitude: projected.location.longitude,
        coordinatePrecision: projected.location.coordinatePrecision,
        coordinateMethod: projected.location.coordinateMethod,
        coordinateNotes: projected.location.coordinateNotes,
      },
      evidence: [
        ...facility.evidence,
        ...projected.evidence.filter((evidence) => !existingEvidenceUrls.has(evidence.url)),
      ],
      quality: {
        ...facility.quality,
        confidence: projected.quality.confidence,
        lastVerifiedDate: projected.quality.lastVerifiedDate,
        reviewNotes: projected.quality.reviewNotes,
      },
    };
  });
  const output = { ...rawCanonical, generatedAt: "2026-09-23", facilities: outputFacilities };
  const parsedAfter = parseFacilityImportDocument(output);
  if (!parsedAfter.document) throw new Error(`canonical output is invalid: ${JSON.stringify(parsedAfter.issues)}`);
  if (projection.inserted !== 0 || projection.deleted !== 0 || projection.restamped !== 0 || projection.facilities.length !== 503) {
    throw new Error(`projection changed canonical cardinality or operation type: ${JSON.stringify(projection)}`);
  }

  const changedOutsideTarget = projection.facilities
    .filter((facility) => !recoveryKeys.has(facility.researchKey) && beforeByKey.get(facility.researchKey) !== stable(facility))
    .map((facility) => facility.researchKey);
  if (changedOutsideTarget.length > 0) throw new Error(`projection changed non-target keys: ${changedOutsideTarget.join(", ")}`);

  const plan = buildImportPlan(parsedAfter.document);
  if (plan.errors.length > 0) throw new Error(`projected dataset has import errors: ${JSON.stringify(plan.errors)}`);
  writeJson(PATHS.canonical, output);

  const canonicalEquinix = projection.facilities.filter((facility) => facility.operatorName === "Equinix");
  const canonicalMapEligible = canonicalEquinix.filter((facility) => isMapEligible({
    latitude: facility.location.latitude ?? null,
    longitude: facility.location.longitude ?? null,
    coordinatePrecision: facility.location.coordinatePrecision ?? null,
  })).length;

  console.log(JSON.stringify({
    recoveryDigest: actualRecoveryDigest,
    v3Digest: sha256(`${JSON.stringify(v3, null, 2)}\n`),
    v3: v3.qa,
    projection: {
      inserted: projection.inserted,
      updated: projection.updated.length,
      updatedKeys: projection.updated,
      unchanged: projection.unchanged,
      deleted: projection.deleted,
      restamped: projection.restamped,
      suppressed: projection.suppressed,
      changedOutsideTarget,
    },
    canonical: {
      facilities: plan.counts.facilities,
      mapEligible: plan.counts.mapEligible,
      Equinix: canonicalEquinix.length,
      EquinixMapEligible: canonicalMapEligible,
      digest: plan.digest,
      hardErrors: plan.errors.length,
    },
  }, null, 2));
}

main();
