import type { ContractAlias, ContractEvidence, ContractFacility } from "@/lib/facilities/contract";
import {
  applyEquinixReviewDecisions,
  canonicalEquinixFacility,
  type EquinixGeocodeResult,
  type EquinixQueueItem,
  type EquinixReviewDecisions,
} from "@/lib/facilities/equinix-tranche";
import { demoteSharedBuildingPrecision } from "@/lib/map/precision/demoteSharedBuildingPrecision";

export const EQUINIX_RECOVERY_DIGEST = "2dfd4c473ed40ed3633e876fe8699973fae1066c55f96515b1b8c508731df904";
export const EQUINIX_RECOVERY_DATE = "2026-09-23";
export const EQUINIX_RECOVERY_AT = `${EQUINIX_RECOVERY_DATE}T00:00:00.000Z`;

export type RecoveryDisposition = "upgrade" | "retain_city" | "needs_human_review";
export type RecoveryPrecision = "building" | "street" | "campus" | "city";

export type EquinixRecoveryRecord = {
  researchKey: string;
  facilityCode: string;
  originalLatitude: number;
  originalLongitude: number;
  originalPrecision: "city";
  proposedLatitude: number;
  proposedLongitude: number;
  proposedPrecision: RecoveryPrecision;
  evidenceUrls: string[];
  evidenceTier: string;
  researchSummary: string;
  confidence: "high" | "medium" | "low";
  disposition: RecoveryDisposition;
};

export type EquinixRecoveryArtifact = {
  artifactVersion: "1.0.0";
  generatedAt: string;
  input: { path: string; commit: string; filter: string; recordCount: number };
  records: EquinixRecoveryRecord[];
};

export type RecoveryMerge = {
  results: EquinixGeocodeResult[];
  issues: string[];
  automaticUpgrades: string[];
  humanReviewed: string[];
  retainedCity: string[];
  sharedPointDemotions: string[];
};

const precisionClass = (precision: RecoveryPrecision): EquinixGeocodeResult["precisionClass"] =>
  precision === "building" ? "exact_or_rooftop" : "interpolated_or_street";

const isCoordinate = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

/** Merge the immutable recovery artifact and the explicit reviewer decisions into v2. */
export function mergeEquinixRecovery(
  v2: readonly EquinixGeocodeResult[],
  recovery: EquinixRecoveryArtifact,
  decisions: EquinixReviewDecisions,
): RecoveryMerge {
  const issues: string[] = [];
  const byKey = new Map(v2.map((result) => [result.researchKey, result]));
  const recoveryKeys = new Set<string>();
  const automaticUpgrades: string[] = [];
  const retainedCity: string[] = [];
  const reviewRequired = new Set<string>();

  if (v2.length !== 187) issues.push(`v2 has ${v2.length} records, expected 187`);
  if (recovery.artifactVersion !== "1.0.0") issues.push(`unexpected recovery artifactVersion ${String(recovery.artifactVersion)}`);
  if (recovery.input?.recordCount !== 73 || recovery.records?.length !== 73) {
    issues.push(`recovery has ${recovery.records?.length ?? 0} records and declares ${recovery.input?.recordCount ?? 0}; expected 73`);
  }

  const next = new Map(byKey);
  for (const row of recovery.records ?? []) {
    if (recoveryKeys.has(row.researchKey)) issues.push(`${row.researchKey} appears more than once in recovery`);
    recoveryKeys.add(row.researchKey);
    const original = byKey.get(row.researchKey);
    if (!original) {
      issues.push(`${row.researchKey} is absent from v2`);
      continue;
    }
    if (row.facilityCode !== original.facilityCode) issues.push(`${row.researchKey} changes facilityCode`);
    if (original.coordinatePrecision !== "city" || row.originalPrecision !== "city") issues.push(`${row.researchKey} was not a city-precision input`);
    if (row.originalLatitude !== original.latitude || row.originalLongitude !== original.longitude) issues.push(`${row.researchKey} original coordinate does not match v2`);
    if (!isCoordinate(row.proposedLatitude, row.proposedLongitude)) issues.push(`${row.researchKey} has an invalid proposed coordinate`);
    if (row.evidenceUrls.length === 0) issues.push(`${row.researchKey} has no recovery evidence`);

    const common = {
      ...original,
      researchEvidenceUrls: [...row.evidenceUrls],
      evidenceTier: row.evidenceTier,
      recoveryConfidence: row.confidence,
      recoveryDisposition: row.disposition,
    } satisfies EquinixGeocodeResult;

    if (row.disposition === "upgrade") {
      automaticUpgrades.push(row.researchKey);
      next.set(row.researchKey, {
        ...common,
        provider: "precision_recovery",
        latitude: row.proposedLatitude,
        longitude: row.proposedLongitude,
        coordinatePrecision: row.proposedPrecision,
        coordinateEvidenceUrls: [...row.evidenceUrls],
        precisionClass: precisionClass(row.proposedPrecision),
        outcome: "geocoded_ready",
        outcomeReason: row.researchSummary,
      });
    } else if (row.disposition === "retain_city") {
      retainedCity.push(row.researchKey);
      if (row.proposedPrecision !== "city" || row.proposedLatitude !== row.originalLatitude || row.proposedLongitude !== row.originalLongitude) {
        issues.push(`${row.researchKey} retain_city decision changes its city fallback`);
      }
      next.set(row.researchKey, {
        ...common,
        provider: "precision_recovery",
        coordinatePrecision: "city",
        precisionClass: "interpolated_or_street",
        outcome: "geocoded_ready",
        outcomeReason: row.researchSummary,
      });
    } else {
      reviewRequired.add(row.researchKey);
      next.set(row.researchKey, common);
    }
  }

  const decisionKeys = new Set(decisions.decisions.map((decision) => decision.researchKey));
  for (const key of reviewRequired) if (!decisionKeys.has(key)) issues.push(`${key} requires a reviewer decision`);
  for (const key of decisionKeys) if (!reviewRequired.has(key)) issues.push(`${key} has a decision but is not marked needs_human_review`);
  if (reviewRequired.size !== 10 || decisionKeys.size !== 10) issues.push(`expected 10 human-reviewed decisions; recovery=${reviewRequired.size}, decisions=${decisionKeys.size}`);

  const applied = applyEquinixReviewDecisions([...next.values()], decisions);
  issues.push(...applied.issues);
  const demoted = demoteSharedBuildingPrecision(applied.results);
  const results = demoted.results.sort((a, b) => a.researchKey.localeCompare(b.researchKey));
  if (results.length !== 187 || new Set(results.map((result) => result.researchKey)).size !== 187) issues.push("v3 does not contain 187 unique research keys");
  for (const result of results) {
    if (result.outcome !== "geocoded_ready") issues.push(`${result.researchKey} is unresolved after merge`);
    if (result.latitude === null || result.longitude === null || !isCoordinate(result.latitude, result.longitude)) issues.push(`${result.researchKey} has no valid coordinate after merge`);
    if (!result.sourceUrl && (result.coordinateEvidenceUrls?.length ?? 0) === 0) issues.push(`${result.researchKey} has no evidence after merge`);
  }

  return {
    results,
    issues,
    automaticUpgrades: automaticUpgrades.sort(),
    humanReviewed: [...applied.applied].sort(),
    retainedCity: retainedCity.sort(),
    sharedPointDemotions: demoted.demoted,
  };
}

const precisionRank: Record<string, number> = { city: 0, campus: 1, street: 2, building: 3 };
const confidenceRank: Record<string, number> = { low: 0, medium: 1, high: 2 };

function publisherFor(url: string): string {
  if (url.includes("peeringdb.com")) return "PeeringDB";
  if (url.includes("openstreetmap.org")) return "OpenStreetMap";
  if (url.includes("nyserda.ny.gov")) return "NYSERDA";
  if (url.includes("equinix.com")) return "Equinix";
  return new URL(url).hostname;
}

function evidenceFor(result: EquinixGeocodeResult): ContractEvidence[] {
  // The first-party facility page establishes identity/address.  It does not
  // publish the latitude/longitude selected by this recovery pass, so it must
  // not be turned into a coordinate claim.  It is already retained as the
  // facility's location evidence by canonicalEquinixFacility.
  return [...new Set(result.coordinateEvidenceUrls ?? [])]
    .filter((url) => !url.includes("equinix.com") && !url.includes("equinix.com.br"))
    .map((url) => ({
    publisher: publisherFor(url),
    title: `${result.facilityCode} coordinate evidence`,
    url,
    documentType: url.includes("equinix.com") ? "company_facility_page" as const
      : url.includes("nyserda.ny.gov") ? "government_record" as const
      : "facility_directory" as const,
    publishedOn: null,
    verificationState: result.provider === "manual_review" ? "human_verified" as const : "unverified" as const,
    verifiedAt: result.provider === "manual_review" ? result.reviewedAt ?? EQUINIX_RECOVERY_AT : null,
    verificationNotes: result.provider === "manual_review"
      ? `${result.reviewer ?? "Reviewer"} selected this coordinate during the Equinix precision-recovery review.`
      : "Used during the Equinix precision-recovery evidence pass.",
    claims: [{ field: "coordinates" as const, statement: `${result.latitude}, ${result.longitude} at ${result.coordinatePrecision} precision.` }],
    }));
}

function mergeAliases(existing: readonly ContractAlias[] | null | undefined, proposed: readonly ContractAlias[] | null | undefined): ContractAlias[] {
  const byKey = new Map<string, ContractAlias>();
  for (const alias of [...(existing ?? []), ...(proposed ?? [])]) byKey.set(`${alias.alias}|${alias.kind ?? "alias"}|${alias.authority ?? ""}`, alias);
  return [...byKey.values()];
}

function mergeEvidence(existing: readonly ContractEvidence[], proposed: readonly ContractEvidence[]): ContractEvidence[] {
  const byUrl = new Map(existing.map((evidence) => [evidence.url, evidence]));
  for (const evidence of proposed) if (!byUrl.has(evidence.url)) byUrl.set(evidence.url, evidence);
  return [...byUrl.values()];
}

function mergeNotes(existing: readonly string[] | null | undefined, proposed: readonly string[] | null | undefined): string[] {
  return [...new Set([...(existing ?? []), ...(proposed ?? [])])];
}

function stillApplicableNotes(notes: readonly string[] | null | undefined): string[] {
  return (notes ?? []).filter((note) =>
    !note.startsWith("Geocoder precision classification:") &&
    note !== "City precision: stored as a canonical record and deliberately not map-eligible.",
  );
}

function canonicalRecoveryFacility(item: EquinixQueueItem, result: EquinixGeocodeResult): ContractFacility {
  const facility = canonicalEquinixFacility(item, result);
  const provenance = result.provider === "manual_review"
    ? `Coordinate provenance: human-reviewed by ${result.reviewer ?? "reviewer"} on ${(result.reviewedAt ?? EQUINIX_RECOVERY_AT).slice(0, 10)}.`
    : result.provider === "precision_recovery"
      ? "Coordinate provenance: Equinix precision-recovery evidence pass."
      : "Coordinate provenance: original Equinix geocoding pass.";
  return {
    ...facility,
    evidence: mergeEvidence(facility.evidence, evidenceFor(result)),
    quality: {
      ...facility.quality,
      confidence: result.recoveryConfidence ?? facility.quality.confidence,
      lastVerifiedDate: EQUINIX_RECOVERY_DATE,
      reviewNotes: mergeNotes(facility.quality.reviewNotes, [provenance, result.outcomeReason]),
    },
  };
}

export type SuppressedRecoveryUpdate = { researchKey: string; reason: string };
export type RecoveryProjection = {
  facilities: ContractFacility[];
  inserted: 0;
  updated: string[];
  unchanged: number;
  deleted: 0;
  restamped: 0;
  suppressed: SuppressedRecoveryUpdate[];
};

/** Update the 503-row canonical dataset without adding, deleting, or weakening a row. */
export function projectEquinixRecovery(
  existing: readonly ContractFacility[],
  queue: readonly EquinixQueueItem[],
  results: readonly EquinixGeocodeResult[],
): RecoveryProjection {
  const byKey = new Map(existing.map((facility) => [facility.researchKey, facility]));
  const queueByKey = new Map(queue.map((item) => [item.researchKey, item]));
  const updated: string[] = [];
  const suppressed: SuppressedRecoveryUpdate[] = [];

  for (const result of results) {
    // v3 carries all 187 Equinix results so it remains a complete, standalone
    // geocoding artifact.  Canonical projection is deliberately narrower: only
    // the 73 records covered by the recovery artifact may change in this pass.
    if (result.recoveryDisposition === undefined) continue;
    const current = byKey.get(result.researchKey);
    const item = queueByKey.get(result.researchKey);
    if (!current || !item) throw new Error(`${result.researchKey} is missing from the existing canonical Equinix projection`);
    const proposed = canonicalRecoveryFacility(item, result);
    const currentPrecision = current.location.coordinatePrecision ?? "city";
    const proposedPrecision = proposed.location.coordinatePrecision ?? "city";
    const currentRank = precisionRank[currentPrecision] ?? -1;
    const proposedRank = precisionRank[proposedPrecision] ?? -1;
    const sameCoordinate = current.location.latitude === proposed.location.latitude && current.location.longitude === proposed.location.longitude;
    if (proposedRank < currentRank) {
      suppressed.push({ researchKey: result.researchKey, reason: `existing ${currentPrecision} precision is stronger than proposed ${proposedPrecision}` });
      continue;
    }
    if (proposedRank === currentRank && sameCoordinate) continue;

    const trancheGenerated = (current.aliases ?? []).some((alias) => alias.authority === "Urdais manual-verification parent market");
    const existingEvidence = new Set(current.evidence.map((evidence) => evidence.url));
    const independentCoordinateEvidence = (result.coordinateEvidenceUrls ?? []).some((url) => !existingEvidence.has(url) && !url.includes("equinix.com"));
    if (!trancheGenerated && result.provider === "manual_review" && !independentCoordinateEvidence) {
      suppressed.push({
        researchKey: result.researchKey,
        reason: "existing per-facility coordinate evidence is stronger; the reviewed decision adds no independent coordinate source",
      });
      continue;
    }
    if (proposedRank === currentRank && !sameCoordinate && !independentCoordinateEvidence && result.provider !== "manual_review") {
      suppressed.push({ researchKey: result.researchKey, reason: "equal precision with different coordinates and no stronger independent coordinate evidence" });
      continue;
    }

    const confidence = (confidenceRank[proposed.quality.confidence] ?? 0) >= (confidenceRank[current.quality.confidence] ?? 0)
      ? proposed.quality.confidence : current.quality.confidence;
    byKey.set(result.researchKey, {
      ...current,
      ownerName: current.ownerName ?? proposed.ownerName,
      operatorName: current.operatorName ?? proposed.operatorName,
      aliases: mergeAliases(current.aliases, proposed.aliases),
      location: {
        ...current.location,
        latitude: proposed.location.latitude,
        longitude: proposed.location.longitude,
        coordinatePrecision: proposed.location.coordinatePrecision,
        coordinateMethod: proposed.location.coordinateMethod,
        coordinateNotes: proposed.location.coordinateNotes,
      },
      evidence: mergeEvidence(current.evidence, proposed.evidence),
      quality: {
        ...current.quality,
        confidence,
        lastVerifiedDate: proposed.quality.lastVerifiedDate,
        // Remove the v2 state-derived city/geocoder notes when the coordinate
        // they described has been replaced. Preserve every substantive note.
        reviewNotes: mergeNotes(stillApplicableNotes(current.quality.reviewNotes), proposed.quality.reviewNotes),
      },
    });
    updated.push(result.researchKey);
  }

  return {
    facilities: [...byKey.values()].sort((a, b) => a.researchKey.localeCompare(b.researchKey)),
    inserted: 0,
    updated: updated.sort(),
    unchanged: existing.length - updated.length,
    deleted: 0,
    restamped: 0,
    suppressed: suppressed.sort((a, b) => a.researchKey.localeCompare(b.researchKey)),
  };
}
